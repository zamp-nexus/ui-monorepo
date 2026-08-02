from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from zentra_adapter_telemetry import TelemetrySettings, configure_telemetry

from .connector_routes import router as connector_router
from .connector_rows_routes import router as connector_rows_router
from .dependencies import AppDependencies
from .internal_cube_routes import router as internal_cube_router
from .routes import router
from .settings import Settings
from .thread_routes import router as thread_router
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
        if hasattr(resolved_dependencies, "start"):
            await resolved_dependencies.start()
        elif hasattr(resolved_dependencies, "audit_delivery"):
            resolved_dependencies.audit_delivery.start()
        yield
        if hasattr(resolved_dependencies, "stop"):
            await resolved_dependencies.stop()
        elif hasattr(resolved_dependencies, "audit_delivery"):
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
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Traceparent",
            "Tracestate",
            # The Work Feed documents `Last-Event-ID` as a resume cursor, and it
            # is not a CORS-safelisted request header. Without it here the
            # preflight for `/threads/{id}/events` fails and a browser can never
            # reach the stream at all.
            "Last-Event-ID",
        ],
    )
    api.include_router(router)
    api.include_router(connector_router)
    api.include_router(connector_rows_router)
    api.include_router(workspace_router)
    api.include_router(internal_cube_router)
    api.include_router(thread_router)
    configure_telemetry(
        api,
        TelemetrySettings(
            otlp_endpoint=resolved_settings.otel_exporter_otlp_endpoint,
            otlp_headers=resolved_settings.otel_exporter_otlp_headers,
        ),
    )
    return api


app = create_app()
