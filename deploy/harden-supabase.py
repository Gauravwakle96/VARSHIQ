"""Restrict only VARSHIQ tables and create its private photo bucket.

Run after Alembic with the dedicated Supabase project's server credentials loaded.
This does not change other applications' tables, public schemas or auth providers.
"""
import sys
from pathlib import Path

import httpx
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import models  # noqa: E402, F401
from app.config import get_settings  # noqa: E402
from app.database import Base, engine  # noqa: E402


def main():
    settings = get_settings()
    if engine.dialect.name != "postgresql" or settings.photo_storage != "supabase":
        raise SystemExit("Load the dedicated Supabase database and storage configuration first")
    quote = engine.dialect.identifier_preparer.quote
    with engine.begin() as connection:
        roles = set(connection.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).scalars())
        if roles != {"anon", "authenticated"}:
            raise SystemExit("Expected Supabase access roles were not found; no table changes applied")
        for name in sorted(Base.metadata.tables):
            table = f"public.{quote(name)}"
            connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            connection.execute(text(f"REVOKE ALL ON TABLE {table} FROM anon, authenticated"))
    headers = {"apikey": settings.supabase_service_role_key,
               "Authorization": f"Bearer {settings.supabase_service_role_key}"}
    base = settings.supabase_url.rstrip("/") + "/storage/v1/bucket"
    bucket = settings.supabase_storage_bucket
    try:
        with httpx.Client(headers=headers, timeout=30) as client:
            current = client.get(f"{base}/{bucket}")
            config = {"public": False, "file_size_limit": 4_000_000, "allowed_mime_types": ["image/jpeg"]}
            if current.is_success:
                result = client.put(f"{base}/{bucket}", json=config)
            elif current.status_code in (400, 404):
                # Supabase Storage returns 400/404 for a missing bucket.
                result = client.post(base, json={"id": bucket, "name": bucket, **config})
            else:
                raise SystemExit(f"Could not inspect the private bucket (HTTP {current.status_code})")
            if not result.is_success:
                raise SystemExit(f"Private bucket configuration failed (HTTP {result.status_code})")
            verified = client.get(f"{base}/{bucket}")
            if not verified.is_success or verified.json().get("public") is not False:
                raise SystemExit("Private bucket verification failed")
    except httpx.HTTPError as exc:
        raise SystemExit("Storage configuration could not be completed; check the connection and credentials") from exc
    print(f"Restricted {len(Base.metadata.tables)} VARSHIQ tables and verified the private photo bucket.")


if __name__ == "__main__":
    main()
