from zoneinfo import ZoneInfo

from bot.rows import (APPROVED, CHANNEL_TELEGRAM, CHANNEL_YOUTUBE, PENDING, extract_drive_ids, normalize_status,
                      parse_datetime, rows_from_values)
from bot.formatting import to_html, split_for_telegram

TZ = ZoneInfo("Asia/Bangkok")
HEADER = ["Дата публикации", "Время (Пхукет)", "Время (МСК)", "Канал", "Формат", "Рубрика", "Стадия", "Ниша",
          "Первая строка", "Текст", "ТЗ на визуал / файл", "CTA", "Режим видео", "Статус", "Комментарий Яны",
          "Риск", "Основание", "Ссылка на публикацию", "Гипотеза", "Код"]


def row(**kw):
    base = {h: "" for h in HEADER}
    base.update(kw)
    return [base[h] for h in HEADER]


def test_rows_parse_and_channels():
    values = [HEADER,
              row(**{"Дата публикации": "14.10.2026", "Время (Пхукет)": "16:00", "Канал": "Telegram", "Текст": "Привет",
                     "Статус": "На согласовании", "Код": "TG-W42-01"}),
              row(**{"Дата публикации": "пн 12.10.2026", "Время (Пхукет)": "09:00 / 05:00 МСК", "Канал": "YouTube RU",
                     "Текст": "Ролик", "Статус": "ок"}),
              row(**{"Канал": "Instagram RU", "Текст": "не наш", "Статус": "на согласовании"}),
              [""] * len(HEADER)]
    rows = rows_from_values(values)
    assert len(rows) == 3
    tg, yt, ig = rows
    assert tg.key == "TG-W42-01" and tg.channel == CHANNEL_TELEGRAM and tg.status == PENDING
    assert tg.scheduled_at(TZ).strftime("%d.%m %H:%M") == "14.10 16:00"
    assert yt.key == "row3" and yt.channel == CHANNEL_YOUTUBE and yt.status == APPROVED
    assert yt.scheduled_at(TZ).hour == 9
    assert ig.channel == "other"


def test_status_variants():
    assert normalize_status("ОК") == APPROVED
    assert normalize_status("Ok") == APPROVED
    assert normalize_status("на согласовании ") == PENDING
    assert normalize_status("Опубликовано") == "опубликовано"
    assert normalize_status("") == "черновик"


def test_parse_datetime_bad():
    assert parse_datetime("", "16:00", TZ) is None
    assert parse_datetime("скоро", "16:00", TZ) is None
    assert parse_datetime("2026-10-14", "", TZ).hour == 12


def test_drive_ids():
    text = ("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing "
            "https://drive.google.com/open?id=1ZzYyXxWwVvUuTtSsRrQqPpOoNnMmLlKk и ещё текст")
    assert extract_drive_ids(text) == ["1AbCdEfGhIjKlMnOpQrStUvWxYz012345", "1ZzYyXxWwVvUuTtSsRrQqPpOoNnMmLlKk"]


def test_html_and_split():
    assert to_html("a < b **жирно** и __курсив__") == "a &lt; b <b>жирно</b> и <i>курсив</i>"
    cap, sep = split_for_telegram("x" * 100, has_media=True)
    assert cap and sep is None
    cap, sep = split_for_telegram("x" * 2000, has_media=True)
    assert cap is None and sep
    cap, sep = split_for_telegram("x" * 10, has_media=False)
    assert cap is None and sep
