"""Private photo bytes; permissions are enforced by the property API before access."""
import re
from pathlib import Path

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response

from app.config import get_settings

settings = get_settings()


def _object_url(filename):
    if not re.fullmatch(r"[0-9a-f]{40}\.jpg", filename):
        raise HTTPException(404, "Photo unavailable")
    return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_storage_bucket}/{filename}"


def _headers():
    return {"apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}"}


async def save_photo(filename: str, payload: bytes, local_root: Path):
    if settings.photo_storage == "local":
        directory = local_root / "uploads"
        directory.mkdir(exist_ok=True)
        (directory / filename).write_bytes(payload)
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            result = await client.post(_object_url(filename), content=payload,
                                       headers={**_headers(), "Content-Type": "image/jpeg", "x-upsert": "false"})
            result.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Private photo storage is unavailable; your photo was not recorded. Retry later.") from exc


async def read_photo(filename: str, local_root: Path):
    headers = {"Cache-Control": "private, no-store"}
    if settings.photo_storage == "local":
        _object_url(filename)  # Validate the stored object name before joining a path.
        path = local_root / "uploads" / filename
        if not path.is_file():
            raise HTTPException(404, "Photo unavailable")
        return FileResponse(path, media_type="image/jpeg", headers=headers)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", _object_url(filename), headers=_headers()) as result:
                if result.status_code == 404:
                    raise HTTPException(404, "Photo unavailable")
                result.raise_for_status()
                content = bytearray()
                async for chunk in result.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 4_000_000:
                        raise HTTPException(502, "Stored photo exceeds the supported download size")
        return Response(bytes(content), media_type="image/jpeg", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Private photo storage is unavailable; retry later.") from exc
