from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import psycopg

FIRST_RETRY_SECONDS = 1.0
MAX_RETRY_SECONDS = 30.0


async def listen(dsn: str, channel: str) -> AsyncIterator[str]:
    """Yields NOTIFY payloads on `channel` as they arrive, forever.

    A dedicated connection, outside SQLAlchemy's pool entirely: `LISTEN`
    is a session-scoped subscription, and a pooled connection would drop it
    the moment it's handed back. Reconnects on any failure with the same
    exponential backoff shape the frontend's own SSE reader uses (1s -> 30s
    doubling) — a caller sees this as a stream that pauses, never one that
    raises, because a missed notification is not fatal (callers fall back to
    polling); a raised exception silently ending the background listener
    would be.
    """
    retry_seconds = FIRST_RETRY_SECONDS
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(
                dsn, autocommit=True
            ) as connection:
                await connection.execute(f"LISTEN {channel}")
                retry_seconds = FIRST_RETRY_SECONDS
                async for note in connection.notifies():
                    yield note.payload
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - reconnect on anything, see docstring
            pass
        await asyncio.sleep(retry_seconds)
        retry_seconds = min(retry_seconds * 2, MAX_RETRY_SECONDS)
