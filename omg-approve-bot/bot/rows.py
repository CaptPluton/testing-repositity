"""Чтение строк листа «Согласование» в удобные объекты. Чистая логика без сети, покрыта тестами."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

# Статусы, которые понимает бот. Значения в таблице сравниваются без регистра и пробелов.
PENDING = "на согласовании"
APPROVED = "ок"
EDITS = "правки"
PUBLISHED = "опубликовано"
CANCELLED = "отменено"
DRAFT = "черновик"

CHANNEL_TELEGRAM = "telegram"
CHANNEL_YOUTUBE = "youtube"
CHANNEL_OTHER = "other"

# Заголовки колонок: ключ в коде -> подстрока, по которой ищем колонку (без регистра).
HEADERS = {
    "date": "дата публикации",
    "time_local": "время (пхукет)",
    "time_msk": "время (мск)",
    "channel": "канал",
    "format": "формат",
    "rubric": "рубрика",
    "stage": "стадия",
    "niche": "ниша",
    "first_line": "первая строка",
    "text": "текст",
    "media": "тз на визуал",
    "cta": "cta",
    "video_mode": "режим видео",
    "status": "статус",
    "comment": "комментарий яны",
    "risk": "риск",
    "basis": "основание",
    "link": "ссылка на публикацию",
    "hypothesis": "гипотеза",
    "code": "код",
}


@dataclass
class Row:
    idx: int  # номер строки в листе, 1-based (строка 1 это заголовки)
    key: str  # код поста или row<idx>
    channel: str  # telegram | youtube | other
    channel_raw: str
    date_raw: str
    time_raw: str
    format: str
    rubric: str
    first_line: str
    text: str
    media: str
    cta: str
    status: str
    comment: str
    risk: str
    link: str
    raw: dict = field(default_factory=dict)

    @property
    def text_hash(self) -> str:
        payload = "\n".join([self.text, self.media, self.date_raw, self.time_raw, self.channel_raw])
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]

    def scheduled_at(self, tz: ZoneInfo) -> datetime | None:
        return parse_datetime(self.date_raw, self.time_raw, tz)


def normalize(value: str | None) -> str:
    return (value or "").strip().lower().replace("ё", "е")


def map_headers(header_row: list[str]) -> dict[str, int]:
    """Возвращает {ключ: индекс колонки}. Ищет подстроку заголовка без регистра."""
    result: dict[str, int] = {}
    normalized = [normalize(h) for h in header_row]
    for key, needle in HEADERS.items():
        for i, h in enumerate(normalized):
            if needle in h:
                result[key] = i
                break
    return result


def detect_channel(value: str) -> str:
    v = normalize(value)
    if "telegram" in v or v.startswith("tg") or "тг" in v or "телеграм" in v:
        return CHANNEL_TELEGRAM
    if "youtube" in v or "ютуб" in v or v.startswith("yt"):
        return CHANNEL_YOUTUBE
    return CHANNEL_OTHER


def normalize_status(value: str) -> str:
    v = normalize(value)
    if not v:
        return DRAFT
    for known in (PENDING, APPROVED, EDITS, PUBLISHED, CANCELLED, DRAFT):
        if v == known:
            return known
    if v in ("ok", "окей", "одобрено", "утверждено", "да"):
        return APPROVED
    if "соглас" in v:
        return PENDING
    if "опублик" in v:
        return PUBLISHED
    if "отмен" in v:
        return CANCELLED
    if "правк" in v:
        return EDITS
    return v


_DATE_FORMATS = ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y")


def parse_datetime(date_raw: str, time_raw: str, tz: ZoneInfo) -> datetime | None:
    d = (date_raw or "").strip()
    t = (time_raw or "").strip()
    if not d:
        return None
    # В ячейке времени может быть «16:00 Пхукет / 12:00 МСК»: берём первое время.
    m = re.search(r"(\d{1,2})[:.](\d{2})", t)
    hour, minute = (int(m.group(1)), int(m.group(2))) if m else (12, 0)
    # В ячейке даты может быть «пн 12.10.2026»: берём первую дату.
    dm = re.search(r"\d{1,4}[./-]\d{1,2}[./-]\d{1,4}", d)
    if not dm:
        return None
    for fmt in _DATE_FORMATS:
        try:
            day = datetime.strptime(dm.group(0), fmt)
            return day.replace(hour=hour, minute=minute, tzinfo=tz)
        except ValueError:
            continue
    return None


def rows_from_values(values: list[list[str]]) -> list[Row]:
    if not values:
        return []
    headers = map_headers(values[0])
    if "status" not in headers or "channel" not in headers:
        raise ValueError("В листе нет колонок «Статус» или «Канал»: проверьте заголовки")

    def get(line: list[str], key: str) -> str:
        i = headers.get(key)
        if i is None or i >= len(line):
            return ""
        return (line[i] or "").strip()

    rows: list[Row] = []
    for n, line in enumerate(values[1:], start=2):
        if not any((c or "").strip() for c in line):
            continue
        code = get(line, "code") or f"row{n}"
        rows.append(
            Row(
                idx=n,
                key=code,
                channel=detect_channel(get(line, "channel")),
                channel_raw=get(line, "channel"),
                date_raw=get(line, "date"),
                time_raw=get(line, "time_local"),
                format=get(line, "format"),
                rubric=get(line, "rubric"),
                first_line=get(line, "first_line"),
                text=get(line, "text"),
                media=get(line, "media"),
                cta=get(line, "cta"),
                status=normalize_status(get(line, "status")),
                comment=get(line, "comment"),
                risk=get(line, "risk"),
                link=get(line, "link"),
                raw={k: get(line, k) for k in HEADERS},
            )
        )
    return rows


_DRIVE_ID_PATTERNS = (
    re.compile(r"drive\.google\.com/file/d/([A-Za-z0-9_-]{20,})"),
    re.compile(r"drive\.google\.com/open\?id=([A-Za-z0-9_-]{20,})"),
    re.compile(r"drive\.google\.com/uc\?(?:export=\w+&)?id=([A-Za-z0-9_-]{20,})"),
    re.compile(r"docs\.google\.com/[a-z]+/d/([A-Za-z0-9_-]{20,})"),
)


def extract_drive_ids(text: str) -> list[str]:
    ids: list[str] = []
    for pattern in _DRIVE_ID_PATTERNS:
        for m in pattern.finditer(text or ""):
            if m.group(1) not in ids:
                ids.append(m.group(1))
    return ids
