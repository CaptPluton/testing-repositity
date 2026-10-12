from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .service import Service

log = logging.getLogger(__name__)
router = Router()


class Form(StatesGroup):
    edit_comment = State()
    yt_link = State()


def owner_only(service: Service):
    async def _check(event: Message | CallbackQuery) -> bool:
        user = event.from_user
        return bool(user and user.id == service.cfg.owner_id)
    return _check


def setup(service: Service) -> Router:
    router.message.filter(owner_only(service))
    router.callback_query.filter(owner_only(service))

    @router.message(CommandStart())
    async def start(m: Message):
        await m.answer(
            "Бот согласования OMG.\n\n"
            "Я читаю лист «Согласование», присылаю карточки постов для Telegram и YouTube, "
            "по кнопке «Ок» публикую в канал в назначенное время, для YouTube присылаю пакет и напоминание.\n\n"
            "Команды: /pending ожидающие, /today что выходит сегодня, /check связь с таблицей, /help."
        )

    @router.message(Command("help"))
    async def help_(m: Message):
        await m.answer(
            "Как это работает:\n"
            "1. Агент кладёт черновик в таблицу со статусом «на согласовании».\n"
            "2. Я присылаю карточку. Кнопки: Ок (публикую по времени из таблицы), Сейчас, Правки, Отменить.\n"
            "3. Медиа беру по ссылкам на Диск из колонки «ТЗ на визуал / файл». Хотите своё: ответьте на карточку фото или видео.\n"
            "4. YouTube: за N минут до времени присылаю пакет (заголовок, описание, теги, файлы). Загружаете сами, жмёте «Опубликовано» и присылаете ссылку.\n"
            "5. Статус «ок», поставленный прямо в таблице, тоже считается одобрением.\n"
            "Instagram и Threads через меня не идут: их публикуете вы сами."
        )

    @router.message(Command("pending"))
    async def pending(m: Message):
        await m.answer(await service.pending_summary(), disable_web_page_preview=True)

    @router.message(Command("today"))
    async def today(m: Message):
        rows = await service.refresh()
        now = service.now()
        todays = []
        for r in rows:
            when = r.scheduled_at(service.cfg.tz)
            if when and when.date() == now.date():
                todays.append(f"• {when:%H:%M} · {r.channel_raw} · {r.status} · {r.first_line[:60]}")
        await m.answer("Сегодня:\n" + "\n".join(todays) if todays else "На сегодня в таблице ничего нет.")

    @router.message(Command("check"))
    async def check(m: Message):
        try:
            title = await service.sheet.ping()
            rows = await service.refresh()
            await m.answer(f"Таблица: {title}. Строк для Telegram и YouTube: {len(rows)}.")
        except Exception as exc:  # noqa: BLE001
            await m.answer(f"Не могу прочитать таблицу: {exc}")

    @router.callback_query(F.data.startswith("ok:"))
    async def cb_ok(c: CallbackQuery):
        key = c.data.split(":", 1)[1]
        await service.refresh()
        await c.answer()
        await c.message.answer(await service.approve(key))

    @router.callback_query(F.data.startswith("now:"))
    async def cb_now(c: CallbackQuery):
        key = c.data.split(":", 1)[1]
        await service.refresh()
        await c.answer("Делаю")
        await c.message.answer(await service.publish_now(key), disable_web_page_preview=True)

    @router.callback_query(F.data.startswith("cancel:"))
    async def cb_cancel(c: CallbackQuery):
        key = c.data.split(":", 1)[1]
        await service.refresh()
        await c.answer()
        await c.message.answer(await service.cancel(key))

    @router.callback_query(F.data.startswith("edit:"))
    async def cb_edit(c: CallbackQuery, state: FSMContext):
        key = c.data.split(":", 1)[1]
        await state.set_state(Form.edit_comment)
        await state.update_data(key=key)
        await c.answer()
        await c.message.answer(f"Напишите правки для {key} одним сообщением. Отмена: /cancel")

    @router.callback_query(F.data.startswith("ytdone:"))
    async def cb_ytdone(c: CallbackQuery, state: FSMContext):
        key = c.data.split(":", 1)[1]
        await state.set_state(Form.yt_link)
        await state.update_data(key=key)
        await c.answer()
        await c.message.answer(f"Пришлите ссылку на опубликованный ролик {key}. Отмена: /cancel")

    @router.message(Command("cancel"))
    async def cancel_state(m: Message, state: FSMContext):
        await state.clear()
        await m.answer("Отменил ввод.")

    @router.message(Form.edit_comment, F.text)
    async def got_edit(m: Message, state: FSMContext):
        data = await state.get_data()
        await state.clear()
        await service.refresh()
        await m.answer(await service.request_edits(data["key"], m.text.strip()))

    @router.message(Form.yt_link, F.text)
    async def got_link(m: Message, state: FSMContext):
        data = await state.get_data()
        link = m.text.strip()
        if "youtu" not in link:
            await m.answer("Это не похоже на ссылку YouTube. Пришлите ссылку вида https://youtu.be/... или /cancel")
            return
        await state.clear()
        await service.refresh()
        await m.answer(await service.youtube_done(data["key"], link))

    @router.message(F.reply_to_message, F.photo)
    async def reply_photo(m: Message):
        await m.answer(await service.attach_media(m.reply_to_message.message_id, m.photo[-1].file_id, "photo"))

    @router.message(F.reply_to_message, F.video)
    async def reply_video(m: Message):
        await m.answer(await service.attach_media(m.reply_to_message.message_id, m.video.file_id, "video"))

    @router.message(F.reply_to_message, F.document)
    async def reply_document(m: Message):
        await m.answer(await service.attach_media(m.reply_to_message.message_id, m.document.file_id, "document"))

    @router.message(F.text)
    async def fallback(m: Message):
        await m.answer("Не понял. Команды: /pending, /today, /check, /help. Медиа прикрепляются ответом на карточку.")

    return router
