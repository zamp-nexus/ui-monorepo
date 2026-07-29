# Use Postgres for transactions and ClickHouse for the audit ledger from Phase 0

Transactional state belongs in Postgres with row-level security, while immutable high-volume Audit Entries belong in ClickHouse ordered for replay. Available managed ClickHouse credits make adopting the final audit store now cheaper than building and migrating a temporary Postgres ledger; this supersedes only the ClickHouse portion of the earlier infrastructure deferral.
