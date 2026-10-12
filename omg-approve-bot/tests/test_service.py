"""Прогон логики сервиса на фейках: без Telegram, без Google."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from bot.db import DB
from bot.rows import rows_from_values
from bot.service import Service
from tests.test_rows import HEADER, row

TZ = ZoneInfo("Asia/Bangkok")
COL = {"status": "Статус", "comment": "Комментарий Яны", "link": "Ссылка на публикацию"}


class FakeBot:
    def __init__(self):
        self.sent = []
        self._id = 100

    async def send_message(self, chat_id, text, **kw):
        self._id += 1
        self.sent.append(("message", chat_id, text))
        return SimpleNamespace(message_id=self._id)

    async def send_photo(self, chat_id, file, caption=None, **kw):
        self._id += 1
        self.sent.append(("photo", chat_id, caption))
        return SimpleNamespace(message_id=self._id)

    async def get_chat(self, chat_id):
        return SimpleNamespace(id=-1001234567890, username="obgolts_media_group")


class FakeSheet:
    def __init__(self, values):
        self.values = values

    async def fetch_rows(self):
        return rows_from_values(self.values)

    async def update(self, row_idx, **updates):
        for key, value in updates.items():
            self.values[row_idx - 1][HEADER.index(COL[key])] = value

    async def ping(self):
        return "fake"


class FakeDrive:
    async def download(self, file_id):
        return None


def cell(sheet, name):
    return sheet.values[1][HEADER.index(name)]


def run_flow(tmp_path, values, flow, now=None):
    cfg = SimpleNamespace(tz=TZ, owner_id=1, channel_id="@obgolts_media_group", poll_interval=1,
                          digest_hour=9, yt_reminder_min_before=30, db_path=str(tmp_path / "t.db"))

    async def runner():
        bot = FakeBot()
        db = DB(cfg.db_path)
        await db.open()
        svc = Service(cfg, bot, db, FakeSheet(values), FakeDrive())
        if now:
            svc.now = lambda: now
        try:
            await flow(svc, bot)
        finally:
            await db.close()

    asyncio.run(runner())


def test_card_then_approve_then_publish(tmp_path):
    when = datetime(2026, 10, 14, 16, 0, tzinfo=TZ)
    values = [HEADER, row(**{"Дата публикации": "14.10.2026", "Время (Пхукет)": "16:00", "Канал": "Telegram",
                             "Текст": "Привет **мир**", "Статус": "на согласовании", "Код": "TG-1"})]

    async def flow(svc, bot):
        await svc.tick()
        assert bot.sent and "TG-1" in bot.sent[0][2]
        n = len(bot.sent)
        await svc.tick()
        assert len(bot.sent) == n, "повторный проход не должен слать карточку второй раз"
        assert "Опубликую 14.10 16:00" in await svc.approve("TG-1")
        assert cell(svc.sheet, "Статус") == "ок"
        await svc.tick()
        assert all(s[1] != "@obgolts_media_group" for s in bot.sent), "ещё рано публиковать"
        svc.now = lambda: when + timedelta(minutes=1)
        await svc.tick()
        published = [s for s in bot.sent if s[1] == "@obgolts_media_group"]
        assert published and "<b>мир</b>" in published[0][2]
        assert cell(svc.sheet, "Статус") == "опубликовано"
        assert cell(svc.sheet, "Ссылка на публикацию").startswith("https://t.me/obgolts_media_group/")
        await svc.tick()
        assert len([s for s in bot.sent if s[1] == "@obgolts_media_group"]) == 1

    run_flow(tmp_path, values, flow, now=when - timedelta(hours=5))


def test_youtube_package_and_done(tmp_path):
    when = datetime(2026, 10, 14, 9, 0, tzinfo=TZ)
    values = [HEADER, row(**{"Дата публикации": "14.10.2026", "Время (Пхукет)": "09:00", "Канал": "YouTube",
                             "Текст": "Заголовок: Тест", "Статус": "ок", "Код": "YT-1",
                             "ТЗ на визуал / файл": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"})]

    async def flow(svc, bot):
        await svc.tick()
        pkg = [s for s in bot.sent if "Пакет для YouTube" in s[2]]
        assert len(pkg) == 1 and "1AbCdEfGhIjKlMnOpQrStUvWxYz012345" in pkg[0][2]
        await svc.tick()
        assert len([s for s in bot.sent if "Пакет для YouTube" in s[2]]) == 1
        assert "Записал" in await svc.youtube_done("YT-1", "https://youtu.be/abc")
        assert cell(svc.sheet, "Статус") == "опубликовано"

    run_flow(tmp_path, values, flow, now=when - timedelta(minutes=20))


def test_edits_and_cancel(tmp_path):
    values = [HEADER, row(**{"Канал": "tg", "Текст": "x", "Статус": "на согласовании", "Код": "TG-2"})]

    async def flow(svc, bot):
        await svc.tick()
        await svc.request_edits("TG-2", "сделать короче")
        assert cell(svc.sheet, "Комментарий Яны") == "сделать короче"
        svc.sheet.values[1][HEADER.index("Статус")] = "на согласовании"
        n = len(bot.sent)
        await svc.tick()
        assert len(bot.sent) == n + 1 and "после правок" in bot.sent[-1][2]
        assert "Отменено" in await svc.cancel("TG-2")

    run_flow(tmp_path, values, flow)
