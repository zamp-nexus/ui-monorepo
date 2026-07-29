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
    anthropic_api_key: str | None = Field(default=None, repr=False)
    openai_api_key: str | None = Field(default=None, repr=False)
    gemini_api_key: str | None = Field(default=None, repr=False)
    nvidia_api_key: str | None = Field(default=None, repr=False)
    groq_api_key: str | None = Field(default=None, repr=False)
    cerebras_api_key: str | None = Field(default=None, repr=False)
    openrouter_api_key: str | None = Field(default=None, repr=False)
    e2b_api_key: str | None = Field(default=None, repr=False)
    frontend_origin: str = "http://localhost:4200"

    def provider_api_keys(self) -> dict[str, str | None]:
        """Keyed by the env var each provider config names."""
        return {
            "ANTHROPIC_API_KEY": self.anthropic_api_key,
            "OPENAI_API_KEY": self.openai_api_key,
            "GEMINI_API_KEY": self.gemini_api_key,
            "NVIDIA_API_KEY": self.nvidia_api_key,
            "GROQ_API_KEY": self.groq_api_key,
            "CEREBRAS_API_KEY": self.cerebras_api_key,
            "OPENROUTER_API_KEY": self.openrouter_api_key,
        }
