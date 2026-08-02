from __future__ import annotations


def deterministic_thread_title(value: str) -> str:
    title = " ".join(value.split())
    return title if len(title) <= 80 else f"{title[:79].rstrip()}…"
