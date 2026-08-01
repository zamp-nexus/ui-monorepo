from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from zentra_adapter_telemetry import TelemetrySettings, configure_telemetry

from .dependencies import AppDependencies
from .routes import router
from .settings import Settings
from .workspace_routes import router as workspace_router


def create_app(
    settings: Settings | None = None,
    dependencies: AppDependencies | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings()
    resolved_dependencies = dependencies or AppDependencies.from_settings(
        resolved_settings
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = resolved_settings
        app.state.dependencies = resolved_dependencies
        if hasattr(resolved_dependencies, "audit_delivery"):
            resolved_dependencies.audit_delivery.start()
        yield
        if hasattr(resolved_dependencies, "audit_delivery"):
            await resolved_dependencies.audit_delivery.stop()
        if dependencies is None:
            await resolved_dependencies.close()

    api = FastAPI(
        title="ZentraOS API",
        version="0.1.0",
        lifespan=lifespan,
    )
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[resolved_settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Traceparent", "Tracestate"],
    )
    api.include_router(router)
    api.include_router(workspace_router)
    configure_telemetry(
        api,
        TelemetrySettings(
            otlp_endpoint=resolved_settings.otel_exporter_otlp_endpoint,
            otlp_headers=resolved_settings.otel_exporter_otlp_headers,
        ),
    )
    return api


app = create_app()
