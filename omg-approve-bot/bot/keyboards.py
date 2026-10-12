from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def card_keyboard(key: str, approved: bool, is_youtube: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if not approved:
        rows.append([
            InlineKeyboardButton(text="✅ Ок, по расписанию", callback_data=f"ok:{key}"),
        ])
    if is_youtube:
        rows.append([InlineKeyboardButton(text="📦 Прислать пакет сейчас", callback_data=f"now:{key}")])
    else:
        rows.append([InlineKeyboardButton(text="🚀 Опубликовать сейчас", callback_data=f"now:{key}")])
    rows.append([
        InlineKeyboardButton(text="✏️ Правки", callback_data=f"edit:{key}"),
        InlineKeyboardButton(text="❌ Отменить", callback_data=f"cancel:{key}"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def youtube_done_keyboard(key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Опубликовано, пришлю ссылку", callback_data=f"ytdone:{key}"),
    ]])
