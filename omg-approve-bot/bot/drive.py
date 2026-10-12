"""Скачивание файлов с Google Диска по ссылкам из колонки «ТЗ на визуал / файл»."""
from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile
from dataclasses import dataclass

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

log = logging.getLogger(__name__)

MAX_FILE_MB = 50  # лимит Telegram Bot API на загрузку файла с сервера


@dataclass
class DriveFile:
    path: str
    name: str
    mime: str

    @property
    def kind(self) -> str:
        if self.mime.startswith("image/"):
            return "photo"
        if self.mime.startswith("video/"):
            return "video"
        return "document"


class Drive:
    def __init__(self, creds: Credentials):
        self._service = build("drive", "v3", credentials=creds, cache_discovery=False)

    def _download_sync(self, file_id: str) -> DriveFile | None:
        meta = self._service.files().get(fileId=file_id, fields="name,mimeType,size").execute()
        size = int(meta.get("size") or 0)
        if size > MAX_FILE_MB * 1024 * 1024:
            log.warning("Файл %s больше %s МБ, Telegram его не примет", meta.get("name"), MAX_FILE_MB)
            return None
        mime = meta.get("mimeType", "application/octet-stream")
        if mime.startswith("application/vnd.google-apps"):
            log.warning("Файл %s это Google-документ, а не медиа: пропускаю", meta.get("name"))
            return None
        request = self._service.files().get_media(fileId=file_id)
        tmpdir = tempfile.mkdtemp(prefix="omg-media-")
        path = os.path.join(tmpdir, meta.get("name") or file_id)
        with io.FileIO(path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        return DriveFile(path=path, name=meta.get("name") or file_id, mime=mime)

    async def download(self, file_id: str) -> DriveFile | None:
        try:
            return await asyncio.to_thread(self._download_sync, file_id)
        except Exception as exc:  # noqa: BLE001
            log.exception("Не удалось скачать файл %s: %s", file_id, exc)
            return None
