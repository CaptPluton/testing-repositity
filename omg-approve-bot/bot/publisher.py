"""Публикация в Telegram-канал и пакет для YouTube."""
from __future__ import annotations

import logging
import os
import shutil

from aiogram import Bot
from aiogram.types import FSInputFile, InputMediaDocument, InputMediaPhoto, InputMediaVideo

from .db import DB
from .drive import Drive
from .formatting import split_for_telegram, to_html
from .rows import Row, extract_drive_ids

log = logging.getLogger(__name__)


async def collect_media(row: Row, db: DB, drive: Drive) -> tuple[list[tuple[str, object]], list[str]]:
    """Возвращает ([(kind, file)], [пути для удаления]). Приоритет: файлы, присланные Яной в ответ на карточку."""
    attached = await db.media_for(row.key)
    if attached:
        return [(m["kind"], m["file_id"]) for m in attached], []
    items: list[tuple[str, object]] = []
    tmp_paths: list[str] = []
    for file_id in extract_drive_ids(row.media)[:10]:
        f = await drive.download(file_id)
        if f:
            items.append((f.kind, FSInputFile(f.path, filename=f.name)))
            tmp_paths.append(os.path.dirname(f.path))
    return items, tmp_paths


def _cleanup(paths: list[str]) -> None:
    for p in paths:
        shutil.rmtree(p, ignore_errors=True)


def _post_link(chat_id: int | str, username: str | None, message_id: int) -> str:
    if username:
        return f"https://t.me/{username}/{message_id}"
    internal = str(chat_id)
    if internal.startswith("-100"):
        internal = internal[4:]
    return f"https://t.me/c/{internal}/{message_id}"


async def publish_telegram(bot: Bot, channel_id: int | str, row: Row, db: DB, drive: Drive) -> str:
    """Публикует пост. Возвращает ссылку на публикацию."""
    media, tmp = await collect_media(row, db, drive)
    text_html = to_html(row.text)
    caption, separate = split_for_telegram(text_html, bool(media))
    chat = await bot.get_chat(channel_id)
    username = getattr(chat, "username", None)
    try:
        first_msg_id: int | None = None
        if media:
            if len(media) == 1:
                kind, file = media[0]
                if kind == "photo":
                    msg = await bot.send_photo(channel_id, file, caption=caption)
                elif kind == "video":
                    msg = await bot.send_video(channel_id, file, caption=caption)
                else:
                    msg = await bot.send_document(channel_id, file, caption=caption)
                first_msg_id = msg.message_id
            else:
                group = []
                for i, (kind, file) in enumerate(media):
                    cap = caption if i == 0 else None
                    if kind == "photo":
                        group.append(InputMediaPhoto(media=file, caption=cap))
                    elif kind == "video":
                        group.append(InputMediaVideo(media=file, caption=cap))
                    else:
                        group.append(InputMediaDocument(media=file, caption=cap))
                msgs = await bot.send_media_group(channel_id, group)
                first_msg_id = msgs[0].message_id
        if separate:
            msg = await bot.send_message(channel_id, separate, disable_web_page_preview=False)
            if first_msg_id is None:
                first_msg_id = msg.message_id
        assert first_msg_id is not None
        return _post_link(chat.id, username, first_msg_id)
    finally:
        _cleanup(tmp)
