"""Состояние бота в SQLite: карточки, прикреплённые медиа, что уже опубликовано. Новая база = чистая память."""
from __future__ import annotations

import os
from datetime import datetime, timezone

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    key TEXT PRIMARY KEY,
    row_idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    card_msg_id INTEGER,
    scheduled_at TEXT,
    published_at TEXT,
    reminded_at TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    file_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
"""


class DB:
    def __init__(self, path: str):
        self.path = path
        self._conn: aiosqlite.Connection | None = None

    async def open(self) -> None:
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._conn = await aiosqlite.connect(self.path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.executescript(SCHEMA)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()

    @property
    def conn(self) -> aiosqlite.Connection:
        assert self._conn is not None, "DB не открыта"
        return self._conn

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    async def get_card(self, key: str) -> aiosqlite.Row | None:
        async with self.conn.execute("SELECT * FROM cards WHERE key = ?", (key,)) as cur:
            return await cur.fetchone()

    async def card_by_msg(self, msg_id: int) -> aiosqlite.Row | None:
        async with self.conn.execute("SELECT * FROM cards WHERE card_msg_id = ?", (msg_id,)) as cur:
            return await cur.fetchone()

    async def upsert_card(self, key: str, row_idx: int, channel: str, status: str, text_hash: str,
                          card_msg_id: int | None = None, scheduled_at: str | None = None) -> None:
        await self.conn.execute(
            """
            INSERT INTO cards (key, row_idx, channel, status, text_hash, card_msg_id, scheduled_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                row_idx = excluded.row_idx,
                channel = excluded.channel,
                status = excluded.status,
                text_hash = excluded.text_hash,
                card_msg_id = COALESCE(excluded.card_msg_id, cards.card_msg_id),
                scheduled_at = COALESCE(excluded.scheduled_at, cards.scheduled_at),
                updated_at = excluded.updated_at
            """,
            (key, row_idx, channel, status, text_hash, card_msg_id, scheduled_at, self._now()),
        )
        await self.conn.commit()

    async def set_status(self, key: str, status: str) -> None:
        await self.conn.execute("UPDATE cards SET status = ?, updated_at = ? WHERE key = ?", (status, self._now(), key))
        await self.conn.commit()

    async def mark_published(self, key: str) -> None:
        await self.conn.execute("UPDATE cards SET published_at = ?, status = 'опубликовано', updated_at = ? WHERE key = ?",
                                (self._now(), self._now(), key))
        await self.conn.commit()

    async def mark_reminded(self, key: str) -> None:
        await self.conn.execute("UPDATE cards SET reminded_at = ?, updated_at = ? WHERE key = ?", (self._now(), self._now(), key))
        await self.conn.commit()

    async def add_media(self, key: str, file_id: str, kind: str) -> None:
        await self.conn.execute("INSERT INTO media (key, file_id, kind, created_at) VALUES (?, ?, ?, ?)",
                                (key, file_id, kind, self._now()))
        await self.conn.commit()

    async def media_for(self, key: str) -> list[aiosqlite.Row]:
        async with self.conn.execute("SELECT * FROM media WHERE key = ? ORDER BY id", (key,)) as cur:
            return list(await cur.fetchall())

    async def clear_media(self, key: str) -> None:
        await self.conn.execute("DELETE FROM media WHERE key = ?", (key,))
        await self.conn.commit()

    async def kv_get(self, k: str) -> str | None:
        async with self.conn.execute("SELECT v FROM kv WHERE k = ?", (k,)) as cur:
            r = await cur.fetchone()
            return r["v"] if r else None

    async def kv_set(self, k: str, v: str) -> None:
        await self.conn.execute("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", (k, v))
        await self.conn.commit()
