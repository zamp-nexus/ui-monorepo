from __future__ import annotations

from typing import Any, get_args

from pydantic import Field, model_validator
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
    #: Hex-encoded AES key (16, 24 or 32 bytes) sealing Connector source
    #: credentials. Absent means the Connector is simply not available — see
    #: `AppDependencies.from_settings`. It is never defaulted: a generated key
    #: would work until restart, then leave every stored credential unopenable.
    connector_credential_key: str | None = Field(default=None, repr=False)
    frontend_origin: str = "http://localhost:4200"

    @model_validator(mode="before")
    @classmethod
    def _blank_is_unset(cls, values: Any) -> Any:
        """`CLERK_AUDIENCE=` in a .env file parses as "", and "" is not None.

        That switched audience verification on and made PyJWT reject every token
        for missing a claim Clerk was never asked to mint. The bug is not
        specific to that key — every optional setting here can be written blank
        in an env file, and each consumer would have to remember `or None`
        independently. Normalising once, where the value enters, is what makes
        the class of bug unrepeatable rather than the one instance of it fixed.

        Only fields that already accept None are touched: blanking a required
        field is a configuration error and should still fail loudly.
        """
        if not isinstance(values, dict):
            return values
        nullable = {
            name
            for name, field in cls.model_fields.items()
            if type(None) in get_args(field.annotation)
        }
        return {
            key: None
            if key in nullable and isinstance(value, str) and not value.strip()
            else value
            for key, value in values.items()
        }

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
