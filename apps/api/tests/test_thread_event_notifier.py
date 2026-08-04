from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest

from zentra_api.thread_event_notifier import ThreadEventNotifier


def _listener(events: asyncio.Queue[str]):
    async def listen() -> AsyncIterator[str]:
        while True:
            yield await events.get()

    return listen


@pytest.mark.asyncio
async def test_wait_for_returns_promptly_when_a_matching_payload_arrives() -> None:
    events: asyncio.Queue[str] = asyncio.Queue()
    notifier = ThreadEventNotifier(_listener(events))
    notifier.start()
    try:
        waiter = asyncio.ensure_future(notifier.wait_for("thread-1", timeout=5))
        await asyncio.sleep(0.01)
        await events.put("thread-1")
        await asyncio.wait_for(waiter, timeout=1)
    finally:
        notifier.stop()


@pytest.mark.asyncio
async def test_wait_for_falls_through_after_the_timeout_when_nothing_arrives() -> None:
    events: asyncio.Queue[str] = asyncio.Queue()
    notifier = ThreadEventNotifier(_listener(events))
    notifier.start()
    try:
        loop = asyncio.get_event_loop()
        started = loop.time()
        await notifier.wait_for("thread-1", timeout=0.05)
        assert loop.time() - started >= 0.05
    finally:
        notifier.stop()


@pytest.mark.asyncio
async def test_a_payload_for_a_different_thread_does_not_wake_this_waiter() -> None:
    events: asyncio.Queue[str] = asyncio.Queue()
    notifier = ThreadEventNotifier(_listener(events))
    notifier.start()
    try:
        loop = asyncio.get_event_loop()
        started = loop.time()
        waiter = asyncio.ensure_future(notifier.wait_for("thread-1", timeout=0.1))
        await asyncio.sleep(0.01)
        await events.put("thread-2")
        await waiter
        assert loop.time() - started >= 0.1
    finally:
        notifier.stop()


@pytest.mark.asyncio
async def test_multiple_waiters_on_the_same_thread_are_all_woken() -> None:
    events: asyncio.Queue[str] = asyncio.Queue()
    notifier = ThreadEventNotifier(_listener(events))
    notifier.start()
    try:
        waiters = [
            asyncio.ensure_future(notifier.wait_for("thread-1", timeout=5))
            for _ in range(3)
        ]
        await asyncio.sleep(0.01)
        await events.put("thread-1")
        await asyncio.wait_for(asyncio.gather(*waiters), timeout=1)
    finally:
        notifier.stop()


@pytest.mark.asyncio
async def test_the_waiter_entry_is_cleared_once_nobody_is_watching() -> None:
    """Otherwise every distinct thread ever polled leaks an Event forever."""
    events: asyncio.Queue[str] = asyncio.Queue()
    notifier = ThreadEventNotifier(_listener(events))
    notifier.start()
    try:
        await notifier.wait_for("thread-1", timeout=0.02)
        assert "thread-1" not in notifier._waiters  # noqa: SLF001
        assert "thread-1" not in notifier._refcounts  # noqa: SLF001
    finally:
        notifier.stop()
