from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import suppress

CHANNEL = "zentra_thread_events"


class ThreadEventNotifier:
    """Wakes an SSE reader the instant a Thread's Work Feed gets a new row.

    `stream_chat_events` polls `threads.events(after=cursor)` on a fixed
    interval as its correctness floor -- this only shortens the *wait*
    between polls when there's something to report, by racing that interval
    against a real signal: `PostgresWorkFeedRepository.append` fires
    `pg_notify("zentra_thread_events", thread_id)` in the same transaction
    as every row it writes, and Postgres only delivers a `NOTIFY` once that
    transaction commits -- so a wake-up here always corresponds to a row a
    poll would actually find.

    A missed or delayed notification (a reconnecting listener, a dropped
    connection) is never a correctness problem, only a latency one: `wait_for`
    always has a timeout, so a waiter degrades to the plain poll cadence
    rather than hanging.
    """

    def __init__(self, listen: Callable[[], AsyncIterator[str]]) -> None:
        self._listen = listen
        self._waiters: dict[str, asyncio.Event] = {}
        # How many `wait_for` calls are currently registered against each
        # thread_id -- without this, a thread visited once keeps its Event
        # in memory for the rest of the process's life. Cleared to zero
        # entries the moment nobody is actively watching that thread.
        self._refcounts: dict[str, int] = {}
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(
                self._run(), name="thread-event-notifier"
            )

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def wait_for(self, thread_id: str, *, timeout: float) -> None:
        event = self._waiters.get(thread_id)
        if event is None:
            event = asyncio.Event()
            self._waiters[thread_id] = event
        self._refcounts[thread_id] = self._refcounts.get(thread_id, 0) + 1
        try:
            with suppress(TimeoutError):
                await asyncio.wait_for(event.wait(), timeout)
        finally:
            self._refcounts[thread_id] -= 1
            if self._refcounts[thread_id] <= 0:
                del self._refcounts[thread_id]
                # Only this waiter's own Event -- a fresher one the
                # background task installed after a wake must survive for
                # whichever waiter is still using it.
                if self._waiters.get(thread_id) is event:
                    del self._waiters[thread_id]

    async def _run(self) -> None:
        with suppress(asyncio.CancelledError):
            async for thread_id in self._listen():
                event = self._waiters.get(thread_id)
                if event is None:
                    continue
                event.set()
                # Replaced, not cleared: a waiter that already woke and is
                # about to re-register (the poll loop's next iteration) must
                # find a fresh, unset Event, not the one it just consumed.
                self._waiters[thread_id] = asyncio.Event()
