"""Atomic limits shared by serverless instances through the existing database."""
import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.config import get_settings
from app.database import SessionLocal
from app.models import RequestRateLimit


def consume(ip: str, category: str, limit: int, instant=None):
    instant = instant or datetime.now(UTC)
    key = hashlib.sha256(f"{get_settings().server_secret}:{ip}:{category}".encode()).hexdigest()
    with SessionLocal() as db:
        table = RequestRateLimit.__table__
        insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
        expired = table.c.expires_at <= instant
        statement = insert(table).values(key=key, count=1, expires_at=instant + timedelta(seconds=60))
        statement = statement.on_conflict_do_update(index_elements=[table.c.key], set_={
            "count": case((expired, 1), else_=table.c.count + 1),
            "expires_at": case((expired, instant + timedelta(seconds=60)), else_=table.c.expires_at),
        }).returning(table.c.count)
        count = db.execute(statement).scalar_one()
        # Expired keys contain only salted digests, and can be removed safely.
        db.execute(delete(table).where(table.c.expires_at < instant - timedelta(hours=1)))
        db.commit()
        return count <= limit
