from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str = (
        "postgresql+psycopg://zentra_app:zentra_app@localhost:5432/zentra_control"
    )
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_username: str = "zentra_audit_app"
    clickhouse_password: str = "zentra_audit_app"
    clickhouse_database: str = "zentra_audit"
    clickhouse_secure: bool = False
    cube_url: str = "http://localhost:4000"
    cube_api_secret: str | None = None
    clerk_issuer: str | None = None
    clerk_audience: str | None = None
    otel_exporter_otlp_endpoint: str | None = None
    otel_exporter_otlp_headers: str | None = None
    e2b_api_key: str | None = Field(default=None, repr=False)
    frontend_origin: str = "http://localhost:4200"
