"""Тексты карточек и постов. Без длинных тире: правило OMG."""
from __future__ import annotations

import html
import re
from datetime import datetime

from .rows import Row, CHANNEL_TELEGRAM, CHANNEL_YOUTUBE

TG_TEXT_LIMIT = 4096
TG_CAPTION_LIMIT = 1024


def to_html(text: str) -> str:
    """Экранирует текст и превращает **жирный** в <b>, __курсив__ в <i>. Ссылки остаются как есть."""
    safe = html.escape(text or "", quote=False)
    safe = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe, flags=re.S)
    safe = re.sub(r"__(.+?)__", r"<i>\1</i>", safe, flags=re.S)
    return safe


def channel_label(row: Row) -> str:
    if row.channel == CHANNEL_TELEGRAM:
        return "Telegram"
    if row.channel == CHANNEL_YOUTUBE:
        return "YouTube"
    return row.channel_raw or "другой канал"


def when_label(when: datetime | None, tz_name: str) -> str:
    if not when:
        return "время не распознано (опубликовать можно только кнопкой «Сейчас»)"
    return f"{when:%d.%m.%Y %H:%M} ({tz_name})"


def card_text(row: Row, when: datetime | None, tz_name: str, media_count: int) -> str:
    preview = row.text if len(row.text) <= 900 else row.text[:900] + "…"
    lines = [
        f"<b>{html.escape(channel_label(row))}</b> · {html.escape(row.format or 'пост')} · {html.escape(row.rubric or 'без рубрики')}",
        f"Код: <code>{html.escape(row.key)}</code> · строка {row.idx}",
        f"Когда: {html.escape(when_label(when, tz_name))}",
    ]
    if row.risk:
        lines.append(f"Риск: {html.escape(row.risk)}")
    lines.append(f"Медиа: {media_count} файл(ов)" if media_count else "Медиа: нет (ответьте на карточку фото или видео, чтобы прикрепить)")
    lines.append("")
    lines.append(to_html(preview))
    if row.cta:
        lines.append("")
        lines.append(f"CTA: {html.escape(row.cta)}")
    return "\n".join(lines)


def youtube_package(row: Row, when: datetime | None, tz_name: str, media_links: list[str]) -> str:
    lines = [
        "<b>Пакет для YouTube</b> · загрузите в YouTube Studio",
        f"Код: <code>{html.escape(row.key)}</code> · строка {row.idx}",
        f"Время публикации: {html.escape(when_label(when, tz_name))}",
        "",
        to_html(row.text),
    ]
    if media_links:
        lines.append("")
        lines.append("Файлы:")
        lines.extend(html.escape(link) for link in media_links)
    lines.append("")
    lines.append("Когда опубликуете, нажмите «Опубликовано» и пришлите ссылку на ролик: бот запишет её в таблицу.")
    return "\n".join(lines)


def split_for_telegram(text_html: str, has_media: bool) -> tuple[str | None, str | None]:
    """Возвращает (подпись к медиа, отдельный текст). Если текст влезает в подпись, второй элемент None."""
    if not has_media:
        return None, text_html
    if len(text_html) <= TG_CAPTION_LIMIT:
        return text_html, None
    return None, text_html
