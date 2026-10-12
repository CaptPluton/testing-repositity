from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from .config import load_config
from .db import DB
from .drive import Drive
from .handlers import setup
from .service import Service
from .sheet import Sheet

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("omg-approve-bot")


async def scheduler_loop(service: Service) -> None:
    while True:
        try:
            await service.tick()
            await service.maybe_digest()
        except Exception as exc:  # noqa: BLE001
            log.exception("Ошибка планировщика: %s", exc)
            try:
                await service.bot.send_message(service.cfg.owner_id, f"Ошибка планировщика: {exc}")
            except Exception:  # noqa: BLE001
                pass
        await asyncio.sleep(service.cfg.poll_interval)


async def main() -> None:
    cfg = load_config()
    bot = Bot(cfg.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    db = DB(cfg.db_path)
    await db.open()
    sheet = Sheet(cfg)
    drive = Drive(sheet.credentials)
    service = Service(cfg, bot, db, sheet, drive)
    dp = Dispatcher()
    dp.include_router(setup(service))
    task = asyncio.create_task(scheduler_loop(service))
    log.info("Бот запущен. Таблица %s, лист %s, канал %s", cfg.sheet_id, cfg.sheet_tab, cfg.channel_id)
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        task.cancel()
        await db.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
