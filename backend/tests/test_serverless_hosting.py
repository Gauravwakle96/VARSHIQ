"""Serverless boundaries with isolated databases and synthetic storage responses."""
import asyncio
from datetime import UTC, datetime, timedelta
from io import BytesIO

import httpx
import pytest
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from test_api import fixture_property, signup
from test_providers import install_transport

from app.config import Settings
from app.database import engine_options
from app.models import PropertyPhoto, RequestRateLimit
from app.services import photo_storage, shared_limits


def configure_storage(monkeypatch):
    monkeypatch.setattr(photo_storage.settings, "photo_storage", "supabase")
    monkeypatch.setattr(photo_storage.settings, "supabase_url", "https://test-project.supabase.co")
    monkeypatch.setattr(photo_storage.settings, "supabase_service_role_key", "AUTOMATED_TEST_NOT_A_REAL_KEY")


def photo():
    content = BytesIO()
    Image.new("RGB", (20, 20), "blue").save(content, "JPEG")
    return content.getvalue()


def test_serverless_requires_durable_storage_and_a_known_https_origin():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production", runtime_mode="serverless",
                 database_url="postgresql+psycopg://test:test@localhost/test", server_secret="x" * 48,
                 allowed_origins="https://test.example.com", photo_storage="local")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production", server_secret="x" * 48,
                 database_url="postgresql+psycopg://test:test@localhost/test", allowed_origins="")
    for url in ["http://test.example", "https://user:pass@test.example", "https://test.example/path", "https://test.example?secret=1"]:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, photo_storage="supabase", supabase_url=url, supabase_service_role_key="test-only")


def test_transaction_pooler_does_not_keep_connections_or_prepared_statements():
    options = engine_options("postgresql+psycopg://test:test@localhost/test", "serverless")
    assert options["poolclass"] is NullPool
    assert options["connect_args"]["prepare_threshold"] is None
    assert engine_options("sqlite://", "persistent")["connect_args"]["check_same_thread"] is False


def test_private_supabase_photos_remain_owner_authorised(client, monkeypatch, db_session):
    configure_storage(monkeypatch)
    stored = {}
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.host == "test-project.supabase.co"
        assert request.headers["apikey"] == "AUTOMATED_TEST_NOT_A_REAL_KEY"
        assert "/object/public/" not in request.url.path
        if request.method == "POST":
            assert request.headers["x-upsert"] == "false"
            stored[request.url.path] = request.content
            return httpx.Response(200, json={"Key": "private-test-object"})
        return httpx.Response(200, content=stored[request.url.path], headers={"content-type": "image/jpeg"})

    install_transport(monkeypatch, handler)
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    path = f"/api/v1/buildings/{prop['id']}/photos"
    uploaded = client.post(path, headers={"X-CSRF-Token": csrf}, files={"file": ("test.jpg", photo(), "image/jpeg")})
    assert uploaded.status_code == 200
    assert "AUTOMATED_TEST_NOT_A_REAL_KEY" not in uploaded.text
    photo_id = uploaded.json()["data"]["id"]
    downloaded = client.get(f"{path}/{photo_id}")
    assert downloaded.status_code == 200 and downloaded.content.startswith(b"\xff\xd8")
    assert "no-store" in downloaded.headers["cache-control"]
    count = len(calls)
    signup(client, "second-test-owner@example.com")
    assert client.get(f"{path}/{photo_id}").status_code == 404
    assert len(calls) == count
    assert len(list(db_session.scalars(select(PropertyPhoto)))) == 1


def test_storage_failure_cannot_create_a_successful_photo_record(client, monkeypatch, db_session):
    configure_storage(monkeypatch)
    install_transport(monkeypatch, lambda request: httpx.Response(503, text="private provider error"))
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    result = client.post(f"/api/v1/buildings/{prop['id']}/photos", headers={"X-CSRF-Token": csrf},
                         files={"file": ("test.jpg", photo(), "image/jpeg")})
    assert result.status_code == 503
    assert "private provider error" not in result.text
    assert list(db_session.scalars(select(PropertyPhoto))) == []


def test_private_photo_paths_and_download_sizes_are_bounded(monkeypatch, tmp_path):
    configure_storage(monkeypatch)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as failure:
        asyncio.run(photo_storage.read_photo("../../private", tmp_path))
    assert failure.value.status_code == 404
    install_transport(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 4_000_001))
    with pytest.raises(HTTPException) as failure:
        asyncio.run(photo_storage.read_photo("a" * 40 + ".jpg", tmp_path))
    assert failure.value.status_code == 502


def test_shared_limits_survive_new_sessions_and_expire(db_session, monkeypatch):
    factory = sessionmaker(bind=db_session.bind)
    monkeypatch.setattr(shared_limits, "SessionLocal", factory)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert shared_limits.consume("192.0.2.1", "auth", 2, now)
    assert shared_limits.consume("192.0.2.1", "auth", 2, now)
    assert not shared_limits.consume("192.0.2.1", "auth", 2, now)
    assert shared_limits.consume("192.0.2.2", "auth", 2, now)
    assert shared_limits.consume("192.0.2.1", "api", 2, now)
    assert shared_limits.consume("192.0.2.1", "auth", 2, now + timedelta(seconds=61))
    keys = list(db_session.scalars(select(RequestRateLimit.key)))
    assert len(keys) == 3 and all(len(key) == 64 and "192.0.2" not in key for key in keys)
