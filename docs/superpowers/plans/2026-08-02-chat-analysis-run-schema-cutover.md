# Chat & Analysis Run Schema Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Tenant`/`Project`/`Investigation Thread`/`Investigation` Postgres schema with `Organization`-scoped `Chat Session`/`Message`/`Analysis Run`/`Activity Feed`/`Analysis Workspace` tables, via a destructive drop-and-recreate migration — no data migration, per ADR-0030.

**Architecture:** `libs/adapters/postgres/src/zentra_adapter_postgres` defines every table declaratively as SQLAlchemy Core `Table` objects on one shared `MetaData` (`schema.py` + four sibling `schema_*.py` modules), and Alembic migrations call `.create(bind=bind)` / `metadata.create_all(bind=bind)` against that same metadata rather than hand-written DDL per migration. This plan edits the declarative table definitions first, then writes one Alembic migration that drops the retired tables and creates the renamed/new ones from the already-updated metadata — mirroring the exact pattern `0001_phase0_foundation.py` and `0014_workspace_groups_projects.py` already use.

**Tech Stack:** Python 3.13, SQLAlchemy Core (not ORM), Alembic, pytest, Postgres with per-table row-level security.

## Global Constraints

- `tenant_id` / `tenants` are **not** renamed to `organization_id` / `organizations` in this plan. That rename was explicitly scoped out — see the "Tenant → Organization, partially reconciled" note in `CONTEXT-MAP.md`. Every table keeps its existing `tenant_id` column and `{table}_tenant_isolation` RLS policy naming convention.
- No data migration, no dual-write, no compatibility view. Old tables are dropped outright (ADR-0030).
- Module file names (`schema_threads.py`, `schema_chat.py`, `schema_investigation_board.py`, `schema_workspace.py`) are **not** renamed in this plan — only the `Table(...)` names, column names, and constraint/index names inside them change. File renames are cosmetic and belong in the separate mechanical Python-symbol rename pass, not this schema/persistence plan.
- Every renamed table keeps the same RLS pattern as its predecessor: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a `{table}_tenant_isolation` policy scoped on `tenant_id = current_setting('app.tenant_id')`.
- `scenario_key` on `analysis_runs` is unchanged (name and meaning) — per ADR-0027 it is Intake's normalized-question identifier, not Investigation-branded vocabulary.
- Constraint and index names follow the existing `{table}_{purpose}` convention exactly (e.g. `fk_analysis_runs_parent_tenant`, `ix_chat_sessions_group_activity`).

---

## File Structure

- Modify `libs/adapters/postgres/src/zentra_adapter_postgres/schema_workspace.py` — remove the `projects` table.
- Modify `libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py` — `investigation_threads` → `chat_sessions` (drops `project_id`, gains a direct `group_id` FK to `workspace_groups`); `thread_messages` → `messages`.
- Modify `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py` — `investigations` → `analysis_runs`; rename the FK column on `agent_executions`, `human_approvals`, `audit_outbox`; update `__all__`.
- Modify `libs/adapters/postgres/src/zentra_adapter_postgres/schema_chat.py` — `thread_events` → `activity_events`; rename FK columns on `visualization_briefs`, `visualization_artifacts`, `visualization_actions`.
- Modify `libs/adapters/postgres/src/zentra_adapter_postgres/schema_investigation_board.py` — `investigation_boards` → `analysis_workspaces` (PK `board_id` → `workspace_id`); rename FK columns on `board_facts`, `board_hypotheses`, `board_gaps`, `board_conflicts`, `work_items`.
- Modify `libs/adapters/postgres/tests/test_schema.py` — update the expected table-name set.
- Create `libs/adapters/postgres/migrations/versions/0023_chat_analysis_run_cutover.py` — the destructive-reset migration.
- Create `libs/adapters/postgres/tests/test_chat_analysis_run_migration.py` — integration test for the cutover.

---

### Task 1: Drop `Project` from the schema

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema_workspace.py:70-135`
- Test: `libs/adapters/postgres/tests/test_schema.py`

**Interfaces:**
- Consumes: `workspace_groups` (unchanged, already defined above the removed block).
- Produces: nothing new — this task only removes `projects` from `metadata`. Later tasks (2) depend on `projects` no longer existing so `chat_sessions` can take a direct `group_id` FK instead.

- [ ] **Step 1: Update the expected table set in the schema test to no longer include `projects`**

In `libs/adapters/postgres/tests/test_schema.py`, remove `"projects",` from the set literal (currently line 32).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: FAIL — `projects` is still in `metadata.tables` because the table definition hasn't been removed yet.

- [ ] **Step 3: Remove the `projects` table definition**

In `libs/adapters/postgres/src/zentra_adapter_postgres/schema_workspace.py`, delete lines 70–135 (the entire `projects = Table(...)` block) and the trailing `Index("ix_projects_group_activity", ...)` call. The file should end after the `workspace_groups` `Index(...)` call (currently line 67).

- [ ] **Step 4: Remove `projects` from `schema.py`'s re-export**

In `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py`, delete the line `from .schema_workspace import projects as projects` (line 59) and remove `"projects",` from the `__all__` list (line 577).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/adapters/postgres/src/zentra_adapter_postgres/schema_workspace.py \
        libs/adapters/postgres/src/zentra_adapter_postgres/schema.py \
        libs/adapters/postgres/tests/test_schema.py
git commit -m "feat(postgres): remove Project from the schema"
```

---

### Task 2: Rename `Investigation Thread`/`Thread Message` to `Chat Session`/`Message`, Group-owned directly

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py` (full rewrite)
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py:57-58,574,587`
- Test: `libs/adapters/postgres/tests/test_schema.py`

**Interfaces:**
- Consumes: `workspace_groups` (Task 1's neighbor, unchanged), `tenants`.
- Produces: `chat_sessions` table (PK `chat_session_id`, FK `group_id` → `workspace_groups.group_id`), `messages` table (PK `message_id`, FK `chat_session_id` → `chat_sessions.chat_session_id`). Task 3 depends on `chat_sessions.chat_session_id` and `messages.message_id` existing under these exact names for `analysis_runs`' FK.

- [ ] **Step 1: Update the expected table set**

In `libs/adapters/postgres/tests/test_schema.py`, replace `"investigation_threads",` and `"thread_messages",` with `"chat_sessions",` and `"messages",`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: FAIL — the old names are still what `metadata.tables` reports.

- [ ] **Step 3: Rewrite `schema_threads.py`**

Replace the entire contents of `libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py` with:

```python
from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

chat_sessions = Table(
    "chat_sessions",
    metadata,
    Column(
        "chat_session_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("group_id", UUID(as_uuid=True), nullable=False),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=False,
    ),
    Column("visibility", String(16), nullable=False, server_default="shared"),
    Column("initiating_message_id", UUID(as_uuid=True), nullable=False),
    Column("title", Text, nullable=False),
    Column("status", String(16), nullable=False, server_default="draft"),
    Column("next_event_sequence", Integer, nullable=False, server_default="1"),
    Column("archived_from_status", String(16)),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "latest_activity_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("archived_at", TIMESTAMP(timezone=True)),
    ForeignKeyConstraint(
        ("group_id", "tenant_id"),
        ("workspace_groups.group_id", "workspace_groups.tenant_id"),
        name="fk_chat_sessions_group_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "chat_session_id", "tenant_id", name="uq_chat_sessions_tenant_identity"
    ),
    CheckConstraint(
        "status IN ('draft', 'active', 'archived')",
        name="ck_chat_sessions_status",
    ),
    CheckConstraint(
        "archived_from_status IS NULL OR archived_from_status IN ('draft', 'active')",
        name="ck_chat_sessions_archived_from",
    ),
    CheckConstraint(
        "char_length(title) BETWEEN 1 AND 80",
        name="ck_chat_sessions_title_length",
    ),
    CheckConstraint(
        "next_event_sequence >= 1",
        name="ck_chat_sessions_event_sequence",
    ),
    CheckConstraint(
        "visibility IN ('shared', 'private')",
        name="ck_chat_sessions_visibility",
    ),
)
Index(
    "ix_chat_sessions_group_activity",
    chat_sessions.c.tenant_id,
    chat_sessions.c.group_id,
    chat_sessions.c.latest_activity_at.desc(),
    chat_sessions.c.chat_session_id.desc(),
)


messages = Table(
    "messages",
    metadata,
    Column(
        "message_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("author_id", UUID(as_uuid=True)),
    Column("kind", String(32), nullable=False),
    Column("content", Text, nullable=False),
    # Set only on an 'assistant_reply' message that answered an analytical
    # question. NULL for every user/system/router message and for a
    # Conversational Agent's non-analytical reply — the Analysis Run FK is
    # added below, after `analysis_runs` exists (Task 3), the same
    # deferred-constraint pattern `chat_sessions.initiating_message_id`
    # already uses against this table.
    Column("analysis_run_id", UUID(as_uuid=True)),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_messages_chat_session_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "message_id",
        "chat_session_id",
        "tenant_id",
        name="uq_messages_chat_session_tenant_identity",
    ),
    CheckConstraint(
        "kind IN ('user_question', 'user_clarification', "
        "'router_clarification', 'safe_system', 'assistant_reply')",
        name="ck_messages_kind",
    ),
    CheckConstraint(
        "analysis_run_id IS NULL OR kind = 'assistant_reply'",
        name="ck_messages_analysis_run_requires_assistant_reply",
    ),
    CheckConstraint(
        "char_length(content) BETWEEN 1 AND 4000",
        name="ck_messages_content_length",
    ),
)
Index(
    "ix_messages_chat_session_created",
    messages.c.tenant_id,
    messages.c.chat_session_id,
    messages.c.created_at,
    messages.c.message_id,
)

chat_sessions.append_constraint(
    ForeignKeyConstraint(
        ("initiating_message_id", "chat_session_id", "tenant_id"),
        (
            "messages.message_id",
            "messages.chat_session_id",
            "messages.tenant_id",
        ),
        name="fk_chat_sessions_initiating_message",
        deferrable=True,
        initially="DEFERRED",
        use_alter=True,
    )
)
```

Note the structural changes from the original `investigation_threads`/`thread_messages`, per ADR-0033: `project_id` (FK to the now-deleted `projects` table) is replaced by `group_id` (FK directly to `workspace_groups`) — Groups own Chat Sessions directly, per ADR-0028. `chat_sessions` gains `created_by` and `visibility` for creator-only private mode. `messages.kind` gains `'assistant_reply'` — covering both the Conversational Agent's plain replies and analytical answers, distinguished by whether `analysis_run_id` is set — and a `CheckConstraint` enforcing that only an `'assistant_reply'` message may carry one.

- [ ] **Step 4: Update the re-exports in `schema.py`**

In `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py`, replace:

```python
from .schema_threads import investigation_threads as investigation_threads
from .schema_threads import thread_messages as thread_messages
```

with:

```python
from .schema_threads import chat_sessions as chat_sessions
from .schema_threads import messages as messages
```

And in `__all__`, replace `"investigations",` — no, leave that (Task 3 handles it) — replace only the thread-related entries: remove `"thread_events",` — no, leave that too (Task 4). For this task, only change the two lines that read `"investigation_threads",`-equivalent... there is no literal `"investigation_threads"` string in `__all__` today (the table is imported but not separately listed — confirm by checking: `__all__` currently lists `"investigations"`, `"thread_events"`, but not `investigation_threads` or `thread_messages` by name). Add `"chat_sessions",` and `"messages",` to `__all__` in alphabetical position (after `"catalog_versions",` and before `"data_sources",` for `chat_sessions`; after `"metadata",` and before `"prepared_tables",` for `messages`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py \
        libs/adapters/postgres/src/zentra_adapter_postgres/schema.py \
        libs/adapters/postgres/tests/test_schema.py
git commit -m "feat(postgres): rename Investigation Thread/Thread Message to Chat Session/Message, owned directly by Group"
```

---

### Task 3: Rename `Investigation` to `Analysis Run`

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py:193-372` (the `investigations` table, `agent_executions`, `human_approvals`, `audit_outbox`)
- Test: `libs/adapters/postgres/tests/test_schema.py`

**Interfaces:**
- Consumes: `chat_sessions.chat_session_id` and `messages.message_id` (Task 2).
- Produces: `analysis_runs` table (PK `analysis_run_id`, FK `chat_session_id`, `chat_sequence`, `parent_analysis_run_id`, `retry_of_analysis_run_id`). Task 4 and Task 5 depend on `analysis_runs.analysis_run_id` existing under this name.

- [ ] **Step 1: Update the expected table set**

In `libs/adapters/postgres/tests/test_schema.py`, replace `"investigations",` with `"analysis_runs",`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: FAIL

- [ ] **Step 3: Rename the `investigations` table to `analysis_runs`**

In `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py`, replace the `investigations = Table(...)` block (lines 193–287) and its trailing `Index(...)` (lines 288–292) with:

```python
analysis_runs = Table(
    "analysis_runs",
    metadata,
    Column(
        "analysis_run_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("question", Text, nullable=False),
    Column("status", String(32), nullable=False, server_default="pending"),
    Column("state", JSON, nullable=False, server_default=text("'{}'::jsonb")),
    Column("scenario_key", String(64)),
    Column("chat_session_id", UUID(as_uuid=True)),
    Column("chat_sequence", Integer),
    Column("initiating_message_id", UUID(as_uuid=True)),
    Column("parent_analysis_run_id", UUID(as_uuid=True)),
    Column("retry_of_analysis_run_id", UUID(as_uuid=True)),
    Column("version", Integer, nullable=False, server_default="1"),
    Column("evaluation_attempts", Integer, nullable=False, server_default="0"),
    Column("cost_so_far_usd", Numeric(12, 4), nullable=False, server_default="0"),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("finished_at", TIMESTAMP(timezone=True)),
    CheckConstraint(
        "status IN ('pending', 'running', 'evaluating', 'awaiting_approval', "
        "'completed', 'rejected', 'failed', 'cancelled')",
        name="ck_analysis_runs_status",
    ),
    CheckConstraint("cost_so_far_usd >= 0", name="ck_analysis_runs_cost"),
    CheckConstraint("version >= 1", name="ck_analysis_runs_version"),
    CheckConstraint(
        "evaluation_attempts >= 0 AND evaluation_attempts <= 3",
        name="ck_analysis_runs_evaluation_attempts",
    ),
    CheckConstraint(
        "(chat_session_id IS NULL AND chat_sequence IS NULL AND "
        "initiating_message_id IS NULL) OR "
        "(chat_session_id IS NOT NULL AND chat_sequence >= 1 AND "
        "initiating_message_id IS NOT NULL)",
        name="ck_analysis_runs_chat_session_link",
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_analysis_runs_chat_session_tenant",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("initiating_message_id", "chat_session_id", "tenant_id"),
        (
            "messages.message_id",
            "messages.chat_session_id",
            "messages.tenant_id",
        ),
        name="fk_analysis_runs_initiating_message",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("parent_analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_analysis_runs_parent_tenant",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("retry_of_analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_analysis_runs_retry_tenant",
        ondelete="RESTRICT",
    ),
    UniqueConstraint(
        "chat_session_id", "chat_sequence", name="uq_analysis_runs_chat_sequence"
    ),
    UniqueConstraint(
        "analysis_run_id",
        "tenant_id",
        name="uq_analysis_runs_tenant_identity",
    ),
)
Index(
    "ix_analysis_runs_tenant_created",
    analysis_runs.c.tenant_id,
    analysis_runs.c.created_at,
)

# `messages.analysis_run_id` is declared in schema_threads.py, before this
# table exists — added here with the same deferred, use_alter pattern
# `chat_sessions.initiating_message_id` already uses against `messages`,
# for the same reason: a circular reference between the two tables.
messages.append_constraint(
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_messages_analysis_run_tenant",
        ondelete="RESTRICT",
        deferrable=True,
        initially="DEFERRED",
        use_alter=True,
    )
)
```

Add `from .schema_threads import messages` to the top of this block if not already imported at module scope by the time this executes — it already is, via Task 2 Step 4's re-export line, which runs before this point in the file.

- [ ] **Step 4: Rename the FK column on `agent_executions`**

Still in `schema.py`, in the `agent_executions = Table(...)` block, rename the `investigation_id` column and its `ForeignKey` target:

```python
    Column(
        "analysis_run_id",
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE"),
        nullable=False,
    ),
```

And rename the trailing index from `ix_agent_executions_tenant_investigation_step` to `ix_agent_executions_tenant_analysis_run_step`, referencing `agent_executions.c.analysis_run_id` instead of `agent_executions.c.investigation_id`.

- [ ] **Step 5: Rename the FK column on `human_approvals`**

In the `human_approvals = Table(...)` block, rename `investigation_id` to `analysis_run_id` with `ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE")`, and update the two `Index(...)` calls below it (`ix_human_approvals_tenant_status` is unaffected; `uq_human_approvals_one_pending` references `human_approvals.c.investigation_id` — change to `human_approvals.c.analysis_run_id`).

- [ ] **Step 6: Rename the FK column on `audit_outbox`**

In the `audit_outbox = Table(...)` block, rename `investigation_id` to `analysis_run_id` with `ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE")`. Update both trailing indexes (`ix_audit_outbox_investigation_created` → `ix_audit_outbox_analysis_run_created`, referencing `audit_outbox.c.analysis_run_id`; `ix_audit_outbox_tenant_pending` is unaffected).

- [ ] **Step 7: Update `__all__` and re-export**

Replace `"investigations",` with `"analysis_runs",` in `__all__` (alphabetical position: after `"agent_registry",` and before `"audit_outbox",`).

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add libs/adapters/postgres/src/zentra_adapter_postgres/schema.py \
        libs/adapters/postgres/tests/test_schema.py
git commit -m "feat(postgres): rename Investigation to Analysis Run"
```

---

### Task 4: Rename `Work Feed` to `Activity Feed`, update Visualization tables' foreign keys

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema_chat.py` (full rewrite)
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py:544-556`
- Test: `libs/adapters/postgres/tests/test_schema.py`, `libs/adapters/postgres/tests/test_chat_visualization_schema.py`

**Interfaces:**
- Consumes: `chat_sessions.chat_session_id` (Task 2), `analysis_runs.analysis_run_id` (Task 3).
- Produces: `activity_events` table (renamed from `thread_events`, FK `chat_session_id`). `visualization_briefs`, `visualization_artifacts`, `visualization_actions` keep their names (not in the renamed-terms table) but their FK columns are renamed to match Tasks 2–3.

- [ ] **Step 1: Update the expected table set**

In `libs/adapters/postgres/tests/test_schema.py`, replace `"thread_events",` with `"activity_events",`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: FAIL

- [ ] **Step 3: Rewrite `schema_chat.py`**

Replace the entire contents of `libs/adapters/postgres/src/zentra_adapter_postgres/schema_chat.py` with:

```python
from sqlalchemy import (
    JSON,
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

activity_events = Table(
    "activity_events",
    metadata,
    Column("event_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column("sequence", Integer, nullable=False),
    Column("kind", String(64), nullable=False),
    Column("payload", JSON, nullable=False),
    Column("occurred_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_activity_events_chat_session_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "chat_session_id", "sequence", name="uq_activity_events_sequence"
    ),
    CheckConstraint("sequence >= 1", name="ck_activity_events_sequence"),
)
Index(
    "ix_activity_events_tenant_chat_session_sequence",
    activity_events.c.tenant_id,
    activity_events.c.chat_session_id,
    activity_events.c.sequence,
)


visualization_briefs = Table(
    "visualization_briefs",
    metadata,
    Column("brief_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("schema_version", String(16), nullable=False),
    Column("content", JSON),
    Column("content_hash", String(64), nullable=False),
    Column("renderer_configuration", String(200), nullable=False),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_briefs_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "tenant_id",
        "analysis_run_id",
        "schema_version",
        "content_hash",
        "renderer_configuration",
        name="uq_visualization_briefs_identity",
    ),
    UniqueConstraint(
        "brief_id", "tenant_id", name="uq_visualization_briefs_tenant_identity"
    ),
)


visualization_artifacts = Table(
    "visualization_artifacts",
    metadata,
    Column("visualization_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column(
        "brief_id",
        UUID(as_uuid=True),
        nullable=False,
    ),
    Column("status", String(24), nullable=False, server_default="pending"),
    Column("renderer_kind", String(32), nullable=False, server_default="thesys_c1"),
    Column("model", Text),
    Column("api_version", String(32)),
    Column("c1_response", Text),
    Column("input_tokens", Integer, nullable=False, server_default="0"),
    Column("output_tokens", Integer, nullable=False, server_default="0"),
    Column("cost_usd", Numeric(12, 6), nullable=False, server_default="0"),
    Column("latency_ms", Integer, nullable=False, server_default="0"),
    Column("failure_category", String(64)),
    Column("retry_of_visualization_id", UUID(as_uuid=True)),
    Column("retry_ordinal", Integer, nullable=False, server_default="0"),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    Column("updated_at", TIMESTAMP(timezone=True), nullable=False),
    Column("erased_at", TIMESTAMP(timezone=True)),
    Column("erasure_category", String(32)),
    ForeignKeyConstraint(
        ("brief_id", "tenant_id"),
        ("visualization_briefs.brief_id", "visualization_briefs.tenant_id"),
        name="fk_visualization_artifacts_brief_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_artifacts_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("retry_of_visualization_id", "tenant_id"),
        (
            "visualization_artifacts.visualization_id",
            "visualization_artifacts.tenant_id",
        ),
        name="fk_visualization_artifacts_retry_tenant",
        ondelete="RESTRICT",
    ),
    UniqueConstraint(
        "brief_id", "retry_ordinal", name="uq_visualization_artifacts_retry_ordinal"
    ),
    UniqueConstraint(
        "visualization_id",
        "tenant_id",
        name="uq_visualization_artifacts_tenant_identity",
    ),
    CheckConstraint(
        "status IN ('pending', 'generating', 'ready', 'failed', 'tombstoned')",
        name="ck_visualization_artifacts_status",
    ),
    CheckConstraint(
        "input_tokens >= 0 AND output_tokens >= 0 AND cost_usd >= 0 "
        "AND latency_ms >= 0 AND retry_ordinal >= 0",
        name="ck_visualization_artifacts_usage",
    ),
)


visualization_actions = Table(
    "visualization_actions",
    metadata,
    Column("action_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("visualization_id", UUID(as_uuid=True), nullable=False),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("kind", String(32), nullable=False),
    Column("label", String(80), nullable=False),
    Column("citation_id", UUID(as_uuid=True)),
    Column("follow_up_message", Text),
    Column("expires_at", TIMESTAMP(timezone=True), nullable=False),
    Column("single_use", Integer, nullable=False, server_default="0"),
    Column("consumed_at", TIMESTAMP(timezone=True)),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("visualization_id", "tenant_id"),
        (
            "visualization_artifacts.visualization_id",
            "visualization_artifacts.tenant_id",
        ),
        name="fk_visualization_actions_artifact_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_visualization_actions_chat_session_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_actions_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "kind IN ('continue_conversation', 'open_citation')",
        name="ck_visualization_actions_kind",
    ),
    CheckConstraint(
        "(kind = 'open_citation' AND citation_id IS NOT NULL "
        "AND follow_up_message IS NULL) OR "
        "(kind = 'continue_conversation' AND citation_id IS NULL "
        "AND follow_up_message IS NOT NULL)",
        name="ck_visualization_actions_mapping",
    ),
    CheckConstraint("single_use IN (0, 1)", name="ck_visualization_actions_single_use"),
)
```

- [ ] **Step 4: Update the re-exports in `schema.py`**

Replace:

```python
from .schema_chat import (  # noqa: E402
    thread_events as thread_events,
)
```

with:

```python
from .schema_chat import (  # noqa: E402
    activity_events as activity_events,
)
```

Leave the three `visualization_*` re-exports and the `__all__` entries for them unchanged (same names). Replace `"thread_events",` with `"activity_events",` in `__all__`.

- [ ] **Step 5: Update `test_chat_visualization_schema.py`**

Read the file first — it references `investigation_id`/`thread_id` column names on the visualization tables and/or `thread_events`. Update every such reference to `analysis_run_id`/`chat_session_id`/`activity_events` to match Step 3's renames, following the same assertions the existing test already makes (do not change what it verifies, only the column/table names it verifies them under).

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm nx test postgres -- -k "test_phase_zero_tables_are_present_and_registry_is_schema_only or test_chat_visualization_schema"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add libs/adapters/postgres/src/zentra_adapter_postgres/schema_chat.py \
        libs/adapters/postgres/src/zentra_adapter_postgres/schema.py \
        libs/adapters/postgres/tests/test_schema.py \
        libs/adapters/postgres/tests/test_chat_visualization_schema.py
git commit -m "feat(postgres): rename Work Feed to Activity Feed, update Visualization foreign keys"
```

---

### Task 5: Rename `Investigation Board` to `Analysis Workspace`

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema_investigation_board.py` (full rewrite)
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema.py:38-44`
- Test: `libs/adapters/postgres/tests/test_schema.py`

**Interfaces:**
- Consumes: `analysis_runs.analysis_run_id` (Task 3).
- Produces: `analysis_workspaces` table (PK `workspace_id`, FK `analysis_run_id`). `board_facts`, `board_hypotheses`, `board_gaps`, `board_conflicts`, `work_items`, `analytical_scopes` keep their table names (not in the renamed-terms table — see `libs/domain/investigation/CONTEXT.md`) but their FK column to the parent table is renamed.

- [ ] **Step 1: Update the expected table set**

In `libs/adapters/postgres/tests/test_schema.py`, replace `"investigation_boards",` with `"analysis_workspaces",`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: FAIL

- [ ] **Step 3: Rewrite `schema_investigation_board.py`**

Replace the entire contents of `libs/adapters/postgres/src/zentra_adapter_postgres/schema_investigation_board.py` with:

```python
"""Analysis Workspace and Work Item: the Analysis Run's durable working
memory and work queue (ADR-0026), plus the Analytical Scope an Intake Agent
resolves a question against (ADR-0027).

`role`'s CHECK is generated from the current `CANONICAL_ROLES`, the same
pattern `agent_registry.role` uses (`schema.py`) — correct for this table's
initial shape. A future role addition needs its own migration widening this
CHECK explicitly (mirroring `0005_canonical_insight_role.py`), not a rewrite
of this one.

One Analytical Scope per Tenant is the Phase 1 shape: a Tenant either
narrows its catalog or does not. Per-chat-session or per-cube-family scopes
are a Phase 5+ concern and would need a different key, not a change to this
one.
"""

from sqlalchemy import (
    JSON,
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from zentra_domain_agent_execution import CANONICAL_ROLES

from ._metadata import metadata


def _role_check() -> str:
    values = ", ".join(f"'{role.value}'" for role in sorted(CANONICAL_ROLES))
    return f"role IN ({values})"


analysis_workspaces = Table(
    "analysis_workspaces",
    metadata,
    Column(
        "workspace_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("narrative", Text),
    Column("confidence_score", Numeric(5, 4)),
    Column("confidence_threshold", Numeric(5, 4)),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_analysis_workspaces_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "analysis_run_id", "tenant_id", name="uq_analysis_workspaces_one_per_run"
    ),
    UniqueConstraint(
        "workspace_id", "tenant_id", name="uq_analysis_workspaces_tenant_identity"
    ),
)


board_facts = Table(
    "board_facts",
    metadata,
    Column(
        "fact_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("workspace_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("metric", Text, nullable=False),
    Column("value", Text, nullable=False),
    Column("period", Text),
    Column("producing_work_item_id", UUID(as_uuid=True), nullable=False),
    Column(
        "evidence_refs", JSON, nullable=False, server_default=text("'[]'::jsonb")
    ),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("workspace_id", "tenant_id"),
        ("analysis_workspaces.workspace_id", "analysis_workspaces.tenant_id"),
        name="fk_board_facts_workspace_tenant",
        ondelete="CASCADE",
    ),
)


board_hypotheses = Table(
    "board_hypotheses",
    metadata,
    Column(
        "hypothesis_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("workspace_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("statement", Text, nullable=False),
    Column("status", Text, nullable=False, server_default="open"),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("workspace_id", "tenant_id"),
        ("analysis_workspaces.workspace_id", "analysis_workspaces.tenant_id"),
        name="fk_board_hypotheses_workspace_tenant",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "status IN ('open', 'supported', 'rejected')",
        name="ck_board_hypotheses_status",
    ),
)


board_gaps = Table(
    "board_gaps",
    metadata,
    Column(
        "gap_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("workspace_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("description", Text, nullable=False),
    Column("priority", Text, nullable=False),
    Column("resolved", Boolean, nullable=False, server_default=text("false")),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("workspace_id", "tenant_id"),
        ("analysis_workspaces.workspace_id", "analysis_workspaces.tenant_id"),
        name="fk_board_gaps_workspace_tenant",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "priority IN ('low', 'medium', 'high')", name="ck_board_gaps_priority"
    ),
)


board_conflicts = Table(
    "board_conflicts",
    metadata,
    Column(
        "conflict_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("workspace_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("description", Text, nullable=False),
    Column("status", Text, nullable=False, server_default="open"),
    Column("resolution", Text),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("workspace_id", "tenant_id"),
        ("analysis_workspaces.workspace_id", "analysis_workspaces.tenant_id"),
        name="fk_board_conflicts_workspace_tenant",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "status IN ('open', 'resolved', 'documented')",
        name="ck_board_conflicts_status",
    ),
)


work_items = Table(
    "work_items",
    metadata,
    Column(
        "work_item_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("role", Text, nullable=False),
    Column("objective", Text, nullable=False),
    Column("status", Text, nullable=False, server_default="pending"),
    Column("parent_work_item_id", UUID(as_uuid=True)),
    Column("depends_on", JSON, nullable=False, server_default=text("'[]'::jsonb")),
    Column(
        "artifact_refs", JSON, nullable=False, server_default=text("'[]'::jsonb")
    ),
    Column("rejection_reason", Text),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_work_items_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("parent_work_item_id", "tenant_id"),
        ("work_items.work_item_id", "work_items.tenant_id"),
        name="fk_work_items_parent_tenant",
    ),
    UniqueConstraint("work_item_id", "tenant_id", name="uq_work_items_tenant_identity"),
    CheckConstraint(_role_check(), name="ck_work_items_role"),
    CheckConstraint(
        "status IN ('pending', 'running', 'waiting', 'blocked', 'completed', "
        "'rejected')",
        name="ck_work_items_status",
    ),
)


analytical_scopes = Table(
    "analytical_scopes",
    metadata,
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("cubes", JSON, nullable=False, server_default=text("'[]'::jsonb")),
    Column(
        "member_overrides", JSON, nullable=False, server_default=text("'[]'::jsonb")
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
)
```

Note `board_facts`, `board_hypotheses`, `board_gaps`, `board_conflicts`, `work_items`, and `analytical_scopes` keep their existing table names — none of them are in the renamed-terms list (`libs/domain/investigation/CONTEXT.md`'s `Work Item`, `Knowledge Gap`, `Conflict`, `Analytical Scope` terms are unchanged). Only their `board_id`/`investigation_id` foreign key columns are renamed to `workspace_id`/`analysis_run_id` to match the tables they now point at.

- [ ] **Step 4: Update the re-exports in `schema.py`**

Replace the six `from .schema_investigation_board import ...` lines (currently `analytical_scopes`, `board_conflicts`, `board_facts`, `board_gaps`, `board_hypotheses`, `investigation_boards`, `work_items`) so the `investigation_boards` line becomes:

```python
from .schema_investigation_board import analysis_workspaces as analysis_workspaces
```

(keep the other five re-export lines unchanged — their symbol names don't change). Replace `"investigation_boards",` with `"analysis_workspaces",` in `__all__`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test postgres -- -k test_phase_zero_tables_are_present_and_registry_is_schema_only`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/adapters/postgres/src/zentra_adapter_postgres/schema_investigation_board.py \
        libs/adapters/postgres/src/zentra_adapter_postgres/schema.py \
        libs/adapters/postgres/tests/test_schema.py
git commit -m "feat(postgres): rename Investigation Board to Analysis Workspace"
```

---

### Task 6: Write the destructive-reset migration

**Files:**
- Create: `libs/adapters/postgres/migrations/versions/0023_chat_analysis_run_cutover.py`
- Test: `libs/adapters/postgres/tests/test_chat_analysis_run_migration.py`

**Interfaces:**
- Consumes: the fully updated `metadata` from Tasks 1–5 (`zentra_adapter_postgres.schema`).
- Produces: nothing further downstream in this plan — this is the terminal task. The Application & API layer plan (next plan in the sequence) depends on these tables existing in a real database.

The current Alembic head was verified directly (`revision`/`down_revision` fields across every file in `libs/adapters/postgres/migrations/versions/`, not guessed): it is **`0022_merge_heads`** — nothing else has a `down_revision` pointing past it, and it's the highest-numbered file. Migration filenames in this repo are a separate numbering scheme from ADR numbers (e.g. `0021_intake_role.py` implements ADR-0027; migration numbers do not track ADR numbers 1:1) — do not assume the two line up.

- [ ] **Step 1: Write the failing migration integration test**

Create `libs/adapters/postgres/tests/test_chat_analysis_run_migration.py`:

```python
from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
pytestmark = pytest.mark.skipif(
    not OWNER_URL,
    reason="local Postgres integration URL is not configured",
)

OLD_TABLES = (
    "projects",
    "investigation_threads",
    "thread_messages",
    "investigations",
    "thread_events",
    "investigation_boards",
)
NEW_TABLES = (
    "chat_sessions",
    "messages",
    "analysis_runs",
    "activity_events",
    "analysis_workspaces",
)


def _config() -> Config:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    return config


def test_chat_analysis_run_cutover_drops_old_tables_and_creates_new_ones() -> None:
    assert OWNER_URL is not None
    os.environ["DATABASE_OWNER_URL"] = OWNER_URL
    config = _config()
    engine = create_engine(OWNER_URL)
    try:
        command.upgrade(config, "head")
        table_names = set(inspect(engine).get_table_names())

        assert not (set(OLD_TABLES) & table_names), (
            f"old tables still present: {set(OLD_TABLES) & table_names}"
        )
        assert set(NEW_TABLES) <= table_names

        with engine.begin() as connection:
            rls = connection.execute(
                text(
                    "SELECT relname, relrowsecurity, relforcerowsecurity "
                    "FROM pg_class WHERE relname = ANY(:names)"
                ),
                {"names": list(NEW_TABLES)},
            ).all()
            policies = connection.execute(
                text(
                    "SELECT tablename, policyname FROM pg_policies "
                    "WHERE tablename = ANY(:names)"
                ),
                {"names": list(NEW_TABLES)},
            ).all()

        assert len(rls) == len(NEW_TABLES)
        assert all(row.relrowsecurity and row.relforcerowsecurity for row in rls)
        assert {(row.tablename, row.policyname) for row in policies} == {
            (name, f"{name}_tenant_isolation") for name in NEW_TABLES
        }
    finally:
        engine.dispose()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test postgres -- -k test_chat_analysis_run_cutover_drops_old_tables_and_creates_new_ones`
Expected: FAIL — the migration doesn't exist yet, so `command.upgrade(config, "head")` stops before this revision and the old tables are still present.

- [ ] **Step 3: Write the migration**

Create `libs/adapters/postgres/migrations/versions/0023_chat_analysis_run_cutover.py`:

```python
"""Destructive reset: Project, Investigation Thread, Investigation, Work
Feed, and Investigation Board become Chat Session, Message, Analysis Run,
Activity Feed, and Analysis Workspace. No data migration — see ADR-0030."""

from alembic import op

from zentra_adapter_postgres.schema import metadata

revision = "0023_chat_analysis_run_cutover"
down_revision = "0022_merge_heads"
branch_labels = None
depends_on = None

OLD_TABLES = (
    # Children first: Postgres enforces FK order even under CASCADE when
    # dropping one statement per table rather than DROP ... CASCADE.
    "board_conflicts",
    "board_gaps",
    "board_hypotheses",
    "board_facts",
    "investigation_boards",
    "visualization_actions",
    "visualization_artifacts",
    "visualization_briefs",
    "thread_events",
    "work_items",
    "audit_outbox",
    "human_approvals",
    "agent_executions",
    "investigations",
    "thread_messages",
    "investigation_threads",
    "projects",
)

NEW_TENANT_SCOPED_TABLES = (
    "chat_sessions",
    "messages",
    "analysis_runs",
    "activity_events",
    "analysis_workspaces",
)


def _install_tenant_policy(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f"""
        CREATE POLICY {table_name}_tenant_isolation ON "{table_name}"
        USING (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        """
    )
    op.execute(
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table_name}" TO zentra_runtime'
    )


def upgrade() -> None:
    bind = op.get_bind()
    for table in OLD_TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')

    # `metadata.create_all` skips any table that already exists (e.g.
    # `agent_executions`, `human_approvals`, `audit_outbox`, `work_items`,
    # which were dropped above and are recreated here under their existing
    # names with renamed columns), and is a no-op for tables unrelated to
    # this cutover — the same pattern `0001_phase0_foundation.py` uses.
    metadata.create_all(bind=bind)

    for table in (
        "agent_executions",
        "human_approvals",
        "audit_outbox",
        "work_items",
        *NEW_TENANT_SCOPED_TABLES,
    ):
        _install_tenant_policy(table)


def downgrade() -> None:
    raise NotImplementedError(
        "This is a destructive, one-time cutover with no data to preserve "
        "on either side (ADR-0030) — there is nothing meaningful to "
        "downgrade to. Restore from a pre-upgrade backup instead."
    )
```

Note: `agent_executions`, `human_approvals`, `audit_outbox`, and `work_items` are dropped and recreated (not merely altered) because their FK column rename (`investigation_id` → `analysis_run_id`) is part of the table definition Tasks 3 and 5 already changed in `metadata` — recreating them from that already-correct metadata is simpler and less error-prone than hand-writing four `ALTER TABLE ... RENAME COLUMN` statements that must exactly match what `create_all` would have produced anyway. This matches ADR-0030: nothing in these tables needs to survive the cutover.

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `pnpm nx test postgres -- -k test_chat_analysis_run_cutover_drops_old_tables_and_creates_new_ones`
Expected: PASS

- [ ] **Step 5: Run the full Postgres adapter test suite to check for fallout**

Run: `pnpm nx test postgres`
Expected: every test that referenced the old table/column names now fails loudly with a clear `KeyError`/`AttributeError`/SQL error pointing at the renamed symbol — not a silent pass. Fix each failure by applying the same rename this task made (old name → new name) at the failure site; do not change assertions' intent, only the names they reference. This is expected and is the "mechanical rename" work the earlier scope decision deferred — it surfaces here because the schema change makes every stale reference fail fast.

- [ ] **Step 6: Commit**

```bash
git add libs/adapters/postgres/migrations/versions/0023_chat_analysis_run_cutover.py \
        libs/adapters/postgres/tests/test_chat_analysis_run_migration.py
git commit -m "feat(postgres): destructive-reset migration for the Chat & Analysis Run cutover (ADR-0030)"
```

---

## Self-Review

**Spec coverage:**
- ADR-0028 (Chat Session/Analysis Run rename, no Project layer, Group owns Chat Session directly) — Tasks 1, 2, 3.
- ADR-0029 (Activity Feed rename) — Task 4. The inline-approval-card UI consequence of ADR-0029 belongs to the Frontend plan, not this one — `human_approvals` here only carries the renamed FK, not UI behavior.
- ADR-0030 (destructive reset, no migration path) — Task 6.
- Analysis Workspace / Analysis Run Status renames from `libs/domain/investigation/CONTEXT.md` — Task 5 (workspace tables); `Analysis Run Status` is a domain-layer enum (`InvestigationStatus` in `model.py`), not a schema table, so it is out of this plan's scope (the `status` column and its `CheckConstraint` values are unchanged strings, carried through Task 3 verbatim).
- Tenant/Organization scoping decision (no rename) — enforced by the Global Constraints section and Task 6's use of `tenant_id`/`{table}_tenant_isolation` throughout.
- ADR-0033 (creator-only private Chat Sessions; `assistant_reply` as a real message kind) — Task 2's `chat_sessions.created_by`/`visibility` columns and `messages.kind`/`analysis_run_id` addition; Task 3's deferred FK closing the circular reference.

**Placeholder scan:** No TBD/TODO/"add appropriate"/"similar to Task N" language. `down_revision` in Task 6 is a verified value (`"0022_merge_heads"`), not a placeholder.

**Type consistency:** `analysis_run_id`, `chat_session_id`, `chat_sequence`, `parent_analysis_run_id`, `retry_of_analysis_run_id`, `workspace_id` are spelled identically everywhere they appear across Tasks 2, 3, 4, and 5 — cross-checked against each `ForeignKeyConstraint` target.

---

## What this plan does not cover

- The Python domain-layer rename (`Investigation` → `AnalysisRun` classes in `model.py`, `InvestigationThread`/`ThreadMessage` in `thread.py`, and the other ten files in `zentra_domain_investigation`) — deferred to a mechanical rename pass per your earlier decision, guided by this schema change making every stale reference fail its tests.
- Application/API layer: Intake's `NOT_ANALYTICAL` outcome, the Conversational Agent, removing `_append_follow_up`'s block, the new `/v1/groups/.../chats` routes (ADR-0028, ADR-0032) — next plan in the sequence.
- Telemetry/Langfuse (ADR-0031) and Frontend (ADR-0029's Activity Inspector, composer commands) — plans 3 and 4.
- The `libs/domain/investigation` package rename to match its new domain (tracked as follow-up, noted in `libs/domain/investigation/CONTEXT.md`).
- **Enforcing** `chat_sessions.visibility = 'private'` (creator-only access) is not implemented here — this plan only adds the column. Every existing RLS policy in this codebase is tenant-scoped only (`tenant_id = current_setting('app.tenant_id')`); there is no precedent for a user-scoped policy layered on top. Enforcement (either a second RLS policy checking `created_by` against a session-local `app.user_id` setting, or an application-layer query filter) is Application-layer-plan work, and picking between those two mechanisms is itself a decision that plan should make explicitly, not inherit silently from this one.
