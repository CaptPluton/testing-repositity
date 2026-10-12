"""Google Sheets через gspread. Все вызовы синхронные, оборачиваются в asyncio.to_thread."""
from __future__ import annotations

import asyncio
import logging

import gspread
from google.oauth2.service_account import Credentials

from .config import Config
from .rows import Row, HEADERS, map_headers, rows_from_values

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]


class Sheet:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._creds = self._make_creds(cfg)
        self._client = gspread.authorize(self._creds)
        self._headers: dict[str, int] | None = None

    @staticmethod
    def _make_creds(cfg: Config) -> Credentials:
        if cfg.service_account_info:
            return Credentials.from_service_account_info(cfg.service_account_info, scopes=SCOPES)
        return Credentials.from_service_account_file(cfg.service_account_file, scopes=SCOPES)

    @property
    def credentials(self) -> Credentials:
        return self._creds

    def _ws(self) -> gspread.Worksheet:
        return self._client.open_by_key(self.cfg.sheet_id).worksheet(self.cfg.sheet_tab)

    def _fetch_sync(self) -> list[Row]:
        values = self._ws().get_all_values()
        if values:
            self._headers = map_headers(values[0])
        return rows_from_values(values)

    async def fetch_rows(self) -> list[Row]:
        return await asyncio.to_thread(self._fetch_sync)

    def _update_sync(self, row_idx: int, updates: dict[str, str]) -> None:
        ws = self._ws()
        if self._headers is None:
            self._headers = map_headers(ws.row_values(1))
        cells = []
        for key, value in updates.items():
            col = self._headers.get(key)
            if col is None:
                log.warning("Колонка %s (%s) не найдена, пропускаю", key, HEADERS.get(key))
                continue
            cells.append(gspread.Cell(row=row_idx, col=col + 1, value=value))
        if cells:
            ws.update_cells(cells, value_input_option="USER_ENTERED")

    async def update(self, row_idx: int, **updates: str) -> None:
        await asyncio.to_thread(self._update_sync, row_idx, updates)

    def _ping_sync(self) -> str:
        sh = self._client.open_by_key(self.cfg.sheet_id)
        return f"{sh.title} / {self.cfg.sheet_tab}"

    async def ping(self) -> str:
        return await asyncio.to_thread(self._ping_sync)
