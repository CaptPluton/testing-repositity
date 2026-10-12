"""Общая логика: карточки, одобрение, публикация, напоминания. Используется и хендлерами, и планировщиком."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from aiogram import Bot

from .config import Config
from .db import DB
from .drive import Drive
from .formatting import card_text, youtube_package
from .keyboards import card_keyboard, youtube_done_keyboard
from .publisher import publish_telegram
from .rows import (APPROVED, CANCELLED, CHANNEL_TELEGRAM, CHANNEL_YOUTUBE, EDITS, PENDING, PUBLISHED, Row,
                   extract_drive_ids)
from .sheet import Sheet

log = logging.getLogger(__name__)


class Service:
    def __init__(self, cfg: Config, bot: Bot, db: DB, sheet: Sheet, drive: Drive):
        self.cfg = cfg
        self.bot = bot
        self.db = db
        self.sheet = sheet
        self.drive = drive
        self._rows_cache: dict[str, Row] = {}

    @property
    def tz_name(self) -> str:
        return str(self.cfg.tz)

    def now(self) -> datetime:
        return datetime.now(self.cfg.tz)

    async def refresh(self) -> list[Row]:
        rows = [r for r in await self.sheet.fetch_rows() if r.channel in (CHANNEL_TELEGRAM, CHANNEL_YOUTUBE)]
        self._rows_cache = {r.key: r for r in rows}
        return rows

    def row(self, key: str) -> Row | None:
        return self._rows_cache.get(key)

    async def send_card(self, row: Row, reason: str = "") -> None:
        when = row.scheduled_at(self.cfg.tz)
        media_count = len(await self.db.media_for(row.key)) or len(extract_drive_ids(row.media))
        text = card_text(row, when, self.tz_name, media_count)
        if reason:
            text = f"<i>{reason}</i>\n\n" + text
        msg = await self.bot.send_message(
            self.cfg.owner_id, text,
            reply_markup=card_keyboard(row.key, approved=row.status == APPROVED, is_youtube=row.channel == CHANNEL_YOUTUBE),
            disable_web_page_preview=True,
        )
        await self.db.upsert_card(row.key, row.idx, row.channel, row.status, row.text_hash,
                                  card_msg_id=msg.message_id,
                                  scheduled_at=when.isoformat() if when else None)

    async def approve(self, key: str) -> str:
        row = self.row(key)
        if not row:
            return "Строка уже не найдена в таблице."
        when = row.scheduled_at(self.cfg.tz)
        await self.sheet.update(row.idx, status="ок")
        await self.db.upsert_card(key, row.idx, row.channel, APPROVED, row.text_hash,
                                  scheduled_at=when.isoformat() if when else None)
        row.status = APPROVED
        if row.channel == CHANNEL_YOUTUBE:
            if when:
                remind_at = when - timedelta(minutes=self.cfg.yt_reminder_min_before)
                return f"Ок. Пакет для YouTube пришлю {remind_at:%d.%m %H:%M} ({self.tz_name})."
            return "Ок. Время не распознано: нажмите «Прислать пакет сейчас», когда будете готовы."
        if when:
            if when <= self.now():
                return "Ок. Время уже прошло, публикую в ближайшую минуту."
            return f"Ок. Опубликую {when:%d.%m %H:%M} ({self.tz_name})."
        return "Ок. Время не распознано: опубликовать можно только кнопкой «Сейчас»."

    async def cancel(self, key: str) -> str:
        row = self.row(key)
        if row:
            await self.sheet.update(row.idx, status="отменено")
            row.status = CANCELLED
        await self.db.set_status(key, CANCELLED)
        return "Отменено. В таблице статус «отменено»."

    async def request_edits(self, key: str, comment: str) -> str:
        row = self.row(key)
        if not row:
            return "Строка уже не найдена в таблице."
        await self.sheet.update(row.idx, status="правки", comment=comment)
        row.status = EDITS
        await self.db.set_status(key, EDITS)
        return "Записал правки в таблицу. Когда агент перепишет и вернёт «на согласовании», пришлю новую карточку."

    async def publish_now(self, key: str) -> str:
        row = self.row(key)
        if not row:
            return "Строка уже не найдена в таблице."
        if row.channel == CHANNEL_YOUTUBE:
            await self.send_youtube_package(row)
            return "Пакет отправлен."
        return await self._publish_telegram(row)

    async def _publish_telegram(self, row: Row) -> str:
        try:
            link = await publish_telegram(self.bot, self.cfg.channel_id, row, self.db, self.drive)
        except Exception as exc:  # noqa: BLE001
            log.exception("Публикация %s не удалась", row.key)
            await self.bot.send_message(self.cfg.owner_id, f"Не смог опубликовать {row.key}: {exc}")
            return f"Ошибка публикации: {exc}"
        await self.sheet.update(row.idx, status="опубликовано", link=link)
        await self.db.mark_published(row.key)
        row.status = PUBLISHED
        await self.db.clear_media(row.key)
        return f"Опубликовано: {link}"

    async def send_youtube_package(self, row: Row) -> None:
        when = row.scheduled_at(self.cfg.tz)
        links = [f"https://drive.google.com/file/d/{fid}/view" for fid in extract_drive_ids(row.media)]
        await self.bot.send_message(self.cfg.owner_id, youtube_package(row, when, self.tz_name, links),
                                    reply_markup=youtube_done_keyboard(row.key), disable_web_page_preview=True)
        for m in await self.db.media_for(row.key):
            if m["kind"] == "video":
                await self.bot.send_video(self.cfg.owner_id, m["file_id"])
            elif m["kind"] == "photo":
                await self.bot.send_photo(self.cfg.owner_id, m["file_id"])
            else:
                await self.bot.send_document(self.cfg.owner_id, m["file_id"])
        await self.db.mark_reminded(row.key)

    async def youtube_done(self, key: str, link: str) -> str:
        row = self.row(key)
        if not row:
            return "Строка уже не найдена в таблице."
        await self.sheet.update(row.idx, status="опубликовано", link=link)
        await self.db.mark_published(key)
        row.status = PUBLISHED
        return "Записал ссылку и статус «опубликовано»."

    async def attach_media(self, msg_id: int, file_id: str, kind: str) -> str:
        card = await self.db.card_by_msg(msg_id)
        if not card:
            return "Это не ответ на карточку поста. Ответьте на сообщение-карточку, чтобы прикрепить файл."
        await self.db.add_media(card["key"], file_id, kind)
        n = len(await self.db.media_for(card["key"]))
        return f"Прикрепил к {card['key']}: файлов {n}. Они заменят ссылки из таблицы."

    async def pending_summary(self) -> str:
        rows = await self.refresh()
        pend = [r for r in rows if r.status == PENDING]
        appr = [r for r in rows if r.status == APPROVED]
        if not pend and not appr:
            return "Ожидающих карточек нет."
        lines = []
        if pend:
            lines.append(f"<b>На согласовании: {len(pend)}</b>")
            for r in pend:
                when = r.scheduled_at(self.cfg.tz)
                lines.append(f"• {r.key} · {r.channel_raw} · {when:%d.%m %H:%M} · {r.first_line[:60]}" if when
                             else f"• {r.key} · {r.channel_raw} · без времени · {r.first_line[:60]}")
        if appr:
            lines.append("")
            lines.append(f"<b>Одобрено, ждут времени: {len(appr)}</b>")
            for r in appr:
                when = r.scheduled_at(self.cfg.tz)
                lines.append(f"• {r.key} · {r.channel_raw} · {when:%d.%m %H:%M}" if when else f"• {r.key} · {r.channel_raw} · без времени")
        return "\n".join(lines)

    async def tick(self) -> None:
        """Один проход планировщика: новые карточки, изменившиеся тексты, публикации по времени, YouTube-пакеты."""
        rows = await self.refresh()
        now = self.now()
        for row in rows:
            card = await self.db.get_card(row.key)
            if row.status == PENDING:
                if card is None:
                    await self.send_card(row)
                elif card["text_hash"] != row.text_hash:
                    await self.send_card(row, reason="Текст или время изменились, новая версия:")
                elif card["status"] != PENDING:
                    # Вернули на согласование после правок
                    await self.send_card(row, reason="Вернулось на согласование после правок:")
                continue
            if row.status == APPROVED:
                when = row.scheduled_at(self.cfg.tz)
                if card is None:
                    # Яна поставила «ок» прямо в таблице: принимаем как одобрение
                    await self.db.upsert_card(row.key, row.idx, row.channel, APPROVED, row.text_hash,
                                              scheduled_at=when.isoformat() if when else None)
                    card = await self.db.get_card(row.key)
                if card["published_at"]:
                    continue
                if not when:
                    continue
                if row.channel == CHANNEL_TELEGRAM and when <= now:
                    result = await self._publish_telegram(row)
                    await self.bot.send_message(self.cfg.owner_id, f"{row.key}: {result}")
                elif row.channel == CHANNEL_YOUTUBE and not card["reminded_at"] \
                        and when - timedelta(minutes=self.cfg.yt_reminder_min_before) <= now:
                    await self.send_youtube_package(row)
                continue
            if card is not None and card["status"] != row.status:
                await self.db.set_status(row.key, row.status)

    async def maybe_digest(self) -> None:
        now = self.now()
        today = now.strftime("%Y-%m-%d")
        if now.hour < self.cfg.digest_hour:
            return
        if await self.db.kv_get("digest_date") == today:
            return
        await self.db.kv_set("digest_date", today)
        text = await self.pending_summary()
        await self.bot.send_message(self.cfg.owner_id, f"Утренний дайджест {now:%d.%m}\n\n{text}", disable_web_page_preview=True)
