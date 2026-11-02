from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT.parent / ".env"), str(ROOT / ".env")), extra="ignore"
    )
    app_env: str = "development"
    database_url: str = "sqlite:///./data/varshiq.db"
    server_secret: str = ""
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"
    pilot_locality: str = "Chhatrapati Sambhajinagar"
    pilot_latitude: float = 19.8762
    pilot_longitude: float = 75.3433
    pilot_timezone: str = "Asia/Kolkata"
    open_meteo_enabled: bool = True
    open_meteo_commercial: bool = False
    open_meteo_api_key: str = ""
    forecast_cache_minutes: int = Field(30, ge=1, le=1440)
    refresh_interval_seconds: int = Field(1800, ge=60)
    rain_event_dry_gap_hours: int = Field(6, ge=1, le=168)
    osm_enabled: bool = True
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    geocoding_enabled: bool = True
    geocoding_provider: str = "photon"
    geocoding_base_url: str = ""
    geocoding_user_agent: str = "VARSHIQ/0.1 (https://github.com/Gauravwakle96/VARSHIQ)"
    geocoding_nominatim_policy_accepted: bool = False
    microsoft_enabled: bool = False
    microsoft_index_url: str = "https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv"
    microsoft_tile_max_bytes: int = 52_428_800
    imd_enabled: bool = False
    imd_api_key: str = ""
    imd_request_headers: str = "{}"
    imd_approved_data_dir: str = ""
    imd_data_terms_accepted: bool = False
    gobs_enabled: bool = False
    groundwater_approved_file: str = ""
    soil_approved_file: str = ""
    ai_gateway_api_key: str = ""
    ai_gateway_model: str = ""
    upload_max_bytes: int = 5_242_880
    error_monitoring_dsn: str = ""
    runtime_mode: Literal["persistent", "serverless"] = "persistent"
    photo_storage: Literal["local", "supabase"] = "local"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "varshiq-private-photos"

    @model_validator(mode="after")
    def production_requirements(self):
        ZoneInfo(self.pilot_timezone)
        if self.app_env == "production":
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Production requires PostgreSQL/PostGIS")
            if len(self.server_secret) < 32:
                raise ValueError("Production SERVER_SECRET must have at least 32 characters")
            if any(not origin.startswith("https://") for origin in self.origins):
                raise ValueError("Production allowed origins must use HTTPS")
            if not self.origins:
                raise ValueError("Production requires an explicit HTTPS website origin")
            if self.runtime_mode == "serverless" and self.photo_storage != "supabase":
                raise ValueError("Serverless production requires durable private photo storage")
        if self.photo_storage == "supabase":
            url = urlsplit(self.supabase_url)
            if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
                raise ValueError("Supabase storage requires a valid HTTPS project URL")
            if url.path not in ("", "/") or not self.supabase_service_role_key:
                raise ValueError("Supabase storage requires a project URL and server-side service key")
            if not self.supabase_storage_bucket or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in self.supabase_storage_bucket):
                raise ValueError("Invalid Supabase storage bucket name")
        return self

    @property
    def origins(self):
        return [value.strip() for value in self.allowed_origins.split(",") if value.strip()]


@lru_cache
def get_settings():
    return Settings()
