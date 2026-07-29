# Deliver ClickHouse audit entries through a transactional Postgres outbox

Investigation state and immutable audit entries live in different databases and cannot commit atomically. ZentraOS writes a redacted delivery event beside each Postgres state transition, then retries append-only ClickHouse delivery with a stable event ID and deduplicates replay reads; this favors recoverable at-least-once delivery over direct dual writes that can silently lose or invent audit history.
