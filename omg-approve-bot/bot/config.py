from __future__ import annotations

import json
import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and not value:
        raise RuntimeError(f"Не задана переменная окружения {name}")
    return value or ""


@dataclass(frozen=True)
class Config:
    bot_token: str
    owner_id: int
    channel_id: int | str
    sheet_id: str
    sheet_tab: str
    service_account_info: dict | None
    service_account_file: str | None
    tz: ZoneInfo
    poll_interval: int
    digest_hour: int
    yt_reminder_min_before: int
    db_path: str


def load_config() -> Config:
    raw_sa = _env("GOOGLE_SERVICE_ACCOUNT_JSON")
    sa_file = _env("GOOGLE_SERVICE_ACCOUNT_FILE") or None
    sa_info = json.loads(raw_sa) if raw_sa else None
    if not sa_info and not sa_file:
        raise RuntimeError("Нужен GOOGLE_SERVICE_ACCOUNT_JSON или GOOGLE_SERVICE_ACCOUNT_FILE")
    channel_raw = _env("TG_CHANNEL_ID", required=True)
    channel: int | str = int(channel_raw) if channel_raw.lstrip("-").isdigit() else channel_raw
    return Config(
        bot_token=_env("BOT_TOKEN", required=True),
        owner_id=int(_env("OWNER_TG_ID", required=True)),
        channel_id=channel,
        sheet_id=_env("SHEET_ID", required=True),
        sheet_tab=_env("SHEET_TAB", "Согласование"),
        service_account_info=sa_info,
        service_account_file=sa_file,
        tz=ZoneInfo(_env("TZ", "Asia/Bangkok")),
        poll_interval=int(_env("POLL_INTERVAL_SEC", "120")),
        digest_hour=int(_env("DIGEST_HOUR", "9")),
        yt_reminder_min_before=int(_env("YT_REMINDER_MIN_BEFORE", "30")),
        db_path=_env("DB_PATH", "data/bot.db"),
    )
