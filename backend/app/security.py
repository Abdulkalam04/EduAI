"""Shared request limits and upload validation."""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from pathlib import PurePosixPath

from fastapi import HTTPException, Request, UploadFile

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW_SECONDS = 60

_EXPENSIVE_PREFIXES = (
    "/api/chat",
    "/api/solve",
    "/api/docs",
    "/api/practice",
    "/api/diagram",
    "/api/ppt",
    "/api/code",
    "/api/viva",
    "/api/models",
)
_requests: dict[str, deque[float]] = defaultdict(deque)


def enforce_rate_limit(request: Request) -> None:
    if request.method == "OPTIONS" or not any(
        request.url.path.startswith(path) for path in _EXPENSIVE_PREFIXES
    ):
        return
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = _requests[client_ip]
    while recent and recent[0] <= now - RATE_LIMIT_WINDOW_SECONDS:
        recent.popleft()
    if len(recent) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Too many AI requests. Please wait a minute and try again.",
        )
    recent.append(now)


def safe_filename(filename: str | None) -> str:
    name = (filename or "upload").replace("\\", "/")
    name = PurePosixPath(name).name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    return (name or "upload")[:180]


def validate_upload_type(filename: str | None, content_type: str | None) -> str:
    name = safe_filename(filename)
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    expected = {
        "pdf": {"application/pdf", "application/x-pdf", "application/octet-stream"},
        "jpg": {"image/jpeg", "image/jpg", "application/octet-stream"},
        "jpeg": {"image/jpeg", "image/jpg", "application/octet-stream"},
        "png": {"image/png", "application/octet-stream"},
    }
    media_type = (content_type or "").split(";", 1)[0].lower()
    if extension not in expected or (media_type and media_type not in expected[extension]):
        raise HTTPException(status_code=415, detail="Upload a PDF, JPG, or PNG file.")
    return extension


def validate_upload_bytes(extension: str, content: bytes) -> None:
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploads must be 20 MB or smaller.")
    signatures = {
        "pdf": content.startswith(b"%PDF-"),
        "jpg": content.startswith(b"\xff\xd8\xff"),
        "jpeg": content.startswith(b"\xff\xd8\xff"),
        "png": content.startswith(b"\x89PNG\r\n\x1a\n"),
    }
    if not signatures[extension]:
        raise HTTPException(
            status_code=415,
            detail="The file contents do not match the selected file type.",
        )


async def read_validated_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = safe_filename(file.filename)
    extension = validate_upload_type(filename, file.content_type)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    validate_upload_bytes(extension, content)
    return filename, content
