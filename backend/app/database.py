from datetime import UTC
from pathlib import Path

from sqlalchemy import DateTime, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.config import get_settings

settings = get_settings()
if settings.database_url.startswith("sqlite"):
    Path("data").mkdir(exist_ok=True)
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """Persist UTC even on SQLite, whose datetime type drops timezone offsets."""
    impl = DateTime
    cache_ok = True

    def __init__(self, timezone=True):
        super().__init__(timezone=timezone)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Persisted timestamps require an explicit timezone")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def get_db():
    with SessionLocal() as db:
        yield db
