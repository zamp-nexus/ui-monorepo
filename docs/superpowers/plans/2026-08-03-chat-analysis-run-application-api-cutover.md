# Chat & Analysis Run Application/API Layer Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the application and API layers the behavior ADR-0028 through ADR-0033 promised on top of Plan 1's schema cutover: a third Intake outcome routed to a new Conversational Agent, a composer that is never blocked by an in-flight Analysis Run, a Chat Session dataset default, a REST surface that says `groups`/`chats` instead of `projects`/`threads`, and enforcement (not just a column) for private Chat Sessions.

**Architecture:** All changes live in `libs/application/investigation` (mainly `thread_service.py`, `thread_dto.py`, `thread_ports.py`, `intake_service.py`), a new agent adapter in `libs/adapters/langgraph`, one Postgres migration widening the `agent_registry`/`work_items` role `CHECK` and adding `chat_sessions.default_data_connection_id`, and `apps/api` route/schema renames. No domain-layer class renames (`Investigation`, `InvestigationThread`, `ThreadService` itself) — Plan 1 deferred those and this plan does not pick them back up.

**Tech Stack:** Python 3.13, SQLAlchemy Core + Alembic, FastAPI + Pydantic, the existing `AgentPort`/`ModelPort` LangGraph adapter pattern (no LangChain).

## Global Constraints

- No back-compat: per ADR-0030's precedent, old routes (`/v1/projects/{id}/threads`, `/v1/threads/{id}...`) are renamed in place, not duplicated alongside new ones. Nothing reads `investigations`/`chat_sessions` under two different API shapes at once.
- Domain-layer names (`Investigation`, `InvestigationThread`, `ThreadMessage`, `ThreadService`, `WorkFeedEventKind`, ...) are unchanged. Every task in this plan works with those names as they exist today; do not rename them as a side effect.
- Every new Postgres column/constraint follows the existing idempotency convention (`inspect(op.get_bind()).get_columns(...)` / `get_constraints(...)` guard) — Plan 1 hit real bugs from migrations that assumed they were the first to run on a fresh database, and every migration since `0001_phase0_foundation.py`'s blanket `metadata.create_all()` is a "maybe already exists" migration.
- `RoutingDisposition.AMBIGUOUS` stays untouched — it is read-compatibility only (a comment in `thread_dto.py` says nothing produces it anymore); do not repurpose it for `NOT_ANALYTICAL`.
- Verify every task against a real Postgres instance (`docker compose up -d --wait control-postgres`, `nx run postgres:migrate`, `TEST_DATABASE_OWNER_URL`/`TEST_DATABASE_RUNTIME_URL` exported) before considering it done — schema-level assertions alone missed real bugs in Plan 1.

---

### Task 1: `chat_sessions.default_data_connection_id`

**Files:**
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py`
- Create: `libs/adapters/postgres/migrations/versions/0025_chat_session_dataset_default.py`
- Modify: `libs/adapters/postgres/src/zentra_adapter_postgres/thread.py`
- Test: `libs/adapters/postgres/tests/test_thread_schema.py`, `libs/adapters/postgres/tests/test_thread_migration.py`

**Interfaces:**
- Produces: `chat_sessions.default_data_connection_id` (nullable UUID, FK to `data_sources.data_source_id` — check the actual table name in `schema.py` before writing the FK; it may be `data_connections`). Task 4's ThreadService change reads this column via `ThreadRepository.get_thread`'s existing row-to-domain mapping — no new repository method needed, since `InvestigationThread` doesn't carry this field yet.

Since the domain `InvestigationThread` dataclass has no field for this today and this plan does not touch the domain layer, this column is written and read directly by `thread.py`'s row-mapping SQL until a later plan adds the domain field — for now, `ThreadRepository` gets one new narrow method:

```python
# libs/adapters/postgres/src/zentra_adapter_postgres/thread.py — new method on the repository class
async def default_data_connection_id(self, thread_id: UUID) -> UUID | None:
    async with self._database.connect() as connection:
        await set_tenant_context(connection, self._tenant_id)
        result = await connection.execute(
            select(chat_sessions.c.default_data_connection_id).where(
                chat_sessions.c.chat_session_id == thread_id
            )
        )
        row = result.one_or_none()
        return row.default_data_connection_id if row else None

async def set_default_data_connection_id(
    self, thread_id: UUID, data_connection_id: UUID | None
) -> None:
    async with self._database.connect() as connection:
        await set_tenant_context(connection, self._tenant_id)
        await connection.execute(
            chat_sessions.update()
            .where(chat_sessions.c.chat_session_id == thread_id)
            .values(default_data_connection_id=data_connection_id)
        )
        await connection.commit()
```

Match the exact connection/transaction pattern already used by the other methods in that class (read the file first — `for_update`, commit placement, and error handling conventions must match, not be reinvented).

- [ ] **Step 1: Confirm the FK target table name**

```bash
grep -n "^data_sources = Table\|^data_connections = Table" libs/adapters/postgres/src/zentra_adapter_postgres/schema*.py
```

Use whichever name that returns as the FK target below.

- [ ] **Step 2: Add the column to `schema_threads.py`**

In the `chat_sessions` Table definition, immediately after the `visibility` column:

```python
    # Nullable: a Chat Session has no default until a User sets one via the
    # `#dataset` composer command (ADR-0032) or the create-chat request. A
    # message with no explicit override falls back to this, then to
    # `active_data_connection_id`'s existing single-connection inference.
    Column(
        "default_data_connection_id",
        UUID(as_uuid=True),
        ForeignKey("data_sources.data_source_id", ondelete="SET NULL"),
    ),
```

- [ ] **Step 3: Write the migration**

```python
"""Add chat_sessions.default_data_connection_id (ADR-0032's #dataset command).

Guarded rather than unconditional: on a from-scratch database,
`0001_phase0_foundation`'s blanket `metadata.create_all()` already creates
`chat_sessions` with every column the schema module currently defines,
`default_data_connection_id` included.
"""

from alembic import op
from sqlalchemy import Column, ForeignKey, inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "0025_chat_session_dataset_default"
down_revision = "0024_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {
        column["name"]
        for column in inspect(op.get_bind()).get_columns("chat_sessions")
    }
    if "default_data_connection_id" not in existing:
        op.add_column(
            "chat_sessions",
            Column(
                "default_data_connection_id",
                UUID(as_uuid=True),
                ForeignKey("data_sources.data_source_id", ondelete="SET NULL"),
            ),
        )


def downgrade() -> None:
    op.drop_column("chat_sessions", "default_data_connection_id")
```

Set `down_revision` to whatever `alembic heads` reports as the actual current head at implementation time — Plan 1's merge with the concurrent Sequence Phase 4 PR means `0024_merge_heads` may not be it by the time this task runs; check with `uv run alembic heads` inside `libs/adapters/postgres` first.

- [ ] **Step 4: Run the migration against a real database and verify the column**

```bash
docker compose up -d --wait control-postgres
cd libs/adapters/postgres && DATABASE_OWNER_URL="postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control" uv run alembic upgrade head
```

Expected: no errors, migration reaches the new head.

- [ ] **Step 5: Add the two repository methods to `thread.py`**, matching existing method style exactly (read the file's other methods first).

- [ ] **Step 6: Update `test_thread_schema.py`** to assert the column exists with the right nullability/FK.

- [ ] **Step 7: Add an integration test to `test_thread_integration.py`** (or a new `test_thread_dataset_default_integration.py` if `test_thread_integration.py` is already large) that creates a Chat Session, sets a default via the new repository method, reads it back, and confirms a different Tenant's connection cannot see it (existing RLS already covers this — the test is confirming, not adding, isolation).

- [ ] **Step 8: Run tests and commit**

```bash
pnpm nx test postgres --skip-nx-cache
git add libs/adapters/postgres
git commit -m "feat(postgres): add chat_sessions.default_data_connection_id"
```

---

### Task 2: `NOT_ANALYTICAL` routing disposition

**Files:**
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_dto.py`
- Modify: `libs/application/investigation/src/zentra_application_investigation/intake_service.py`
- Modify: `libs/adapters/langgraph/src/zentra_adapter_langgraph/schemas.py`
- Modify: `libs/adapters/langgraph/src/zentra_adapter_langgraph/prompts.py`
- Test: `libs/application/investigation/tests/test_intake_service.py` (create if it does not exist — check first), `libs/adapters/langgraph/tests/test_intake_agent.py` (check the actual existing test file name first: `find libs/adapters/langgraph/tests -iname "*intake*"`)

**Interfaces:**
- Produces: `RoutingDisposition.NOT_ANALYTICAL = "not_analytical"`, consumed by Task 3's `ThreadService` change and Task 3's Conversational Agent wiring.

- [ ] **Step 1: Add the enum value**

In `thread_dto.py`:

```python
class RoutingDisposition(StrEnum):
    RESOLVED = "resolved"
    # Read-compatibility only (ADR-0023)...
    AMBIGUOUS = "ambiguous"
    UNSUPPORTED = "unsupported"
    # A message that is not a business question at all -- a greeting, thanks,
    # or "what can you do" -- rather than one Intake could not resolve.
    # Routed to the Conversational Agent instead of a router-clarification
    # message (ADR-0033's `assistant_reply` kind).
    NOT_ANALYTICAL = "not_analytical"
```

- [ ] **Step 2: Widen `INTAKE_SCHEMA`** in `libs/adapters/langgraph/src/zentra_adapter_langgraph/schemas.py`:

```python
INTAKE_SCHEMA = _obj(
    {
        "disposition": {
            "type": "string",
            "enum": ["resolved", "ambiguous", "unsupported", "not_analytical"],
        },
        "normalized_question": _nullable({"type": "string"}),
        "clarification": _nullable({"type": "string"}),
        "reasoning": {"type": "string"},
    }
)
```

- [ ] **Step 3: Extend `INTAKE_ROUTE`** in `prompts.py` — add a fourth disposition and adjust the "Decide one of three" framing:

```python
INTAKE_ROUTE = """You are Intake for an analytics product. You decide whether a
user's message can become an Investigation.

You are given this Tenant's catalog: every measure and dimension their
connected sources expose. Resolve a question if it can plausibly be answered
using this catalog, including a request to list, search, or describe the
catalog itself (tables, columns, schema) -- that is always resolvable, since
the Cube Analyst can read it directly. Never invent a member that does not
appear in the catalog.

Decide one of four dispositions:
- "resolved": the message is answerable -- a business question within the
  catalog, or a request about the catalog's own shape (what tables/data/
  schema exist). Rewrite it as one precise, self-contained question in
  `normalized_question` (fill in any period or comparison the user implied).
- "ambiguous": the message could reasonably mean more than one question. Ask
  which one in `clarification`.
- "unsupported": the message is a business question missing information
  (like a time period) needed to query it, and only then. Ask for what is
  missing in `clarification`.
- "not_analytical": the message is not a business question at all -- a
  greeting, thanks, small talk, or a question about what this product can do.
  Leave `clarification` null; a separate conversational reply handles it.

Always give a one-sentence `reasoning` for your decision. Leave
`normalized_question` null unless resolved, and `clarification` null unless
ambiguous or unsupported."""
```

- [ ] **Step 4: Update `IntakeService.resolve()`** in `intake_service.py` to map the new disposition through:

```python
        clarification = fields.get("clarification")
        if disposition == "not_analytical":
            return RoutingResult(
                disposition=RoutingDisposition.NOT_ANALYTICAL,
                scenario_key=None,
                canonical_question=None,
                clarification=None,
                suggestions=(),
            )
        return RoutingResult(
            disposition=(
                RoutingDisposition.AMBIGUOUS
                if disposition == "ambiguous"
                else RoutingDisposition.UNSUPPORTED
            ),
            scenario_key=None,
            canonical_question=None,
            clarification=str(clarification) if clarification else (
                _DEFAULT_CLARIFICATION
            ),
            suggestions=(),
        )
```

- [ ] **Step 5: Update `IntakeAgent.invoke()`**'s `resolved` computation in `libs/adapters/langgraph/src/zentra_adapter_langgraph/agents/intake.py` — no change needed to the `resolved` boolean itself (`not_analytical` is correctly not-resolved), but check the `outcome.issues` message still reads sensibly for the new disposition; if not, make it disposition-aware:

```python
        return validate_agent_output(
            self,
            AgentOutput(
                fields={...},
                outcome=ValidationOutcome(
                    passed=resolved,
                    checks=("The question resolves inside the Analytical Scope.",),
                    issues=(
                        ()
                        if resolved
                        else (
                            "The message is not a business question."
                            if decision.get("disposition") == "not_analytical"
                            else "The question needs clarification."
                        )
                    ),
                ),
                usage=response.usage,
                fallbacks=response.fallbacks,
            ),
        )
```

- [ ] **Step 6: Write/extend unit tests** covering: `IntakeService.resolve()` maps a `"not_analytical"` agent output to `RoutingDisposition.NOT_ANALYTICAL` with `clarification=None`; `INTAKE_SCHEMA` accepts `"not_analytical"` as a valid enum value (a JSON-schema validation test, if the existing test file has one for the schema — check `libs/adapters/langgraph/tests` for a schema-validation pattern first and match it).

- [ ] **Step 7: Run tests and commit**

```bash
pnpm nx run-many -t test --projects=investigation-application,langgraph --skip-nx-cache
git add libs/application/investigation libs/adapters/langgraph
git commit -m "feat(intake): add the not_analytical routing disposition"
```

---

### Task 3: Conversational Agent

**Files:**
- Create: `libs/adapters/langgraph/src/zentra_adapter_langgraph/agents/conversational.py`
- Modify: `libs/adapters/langgraph/src/zentra_adapter_langgraph/agents/__init__.py`
- Modify: `libs/adapters/langgraph/src/zentra_adapter_langgraph/prompts.py`
- Modify: `libs/adapters/langgraph/src/zentra_adapter_langgraph/schemas.py`
- Modify: `libs/domain/agent-execution/src/zentra_domain_agent_execution/contracts.py` (add `AgentRole.CONVERSATIONAL`)
- Create: `libs/adapters/postgres/migrations/versions/0026_conversational_role.py`
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_ports.py`
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_service.py`
- Modify: `libs/domain/investigation/src/zentra_domain_investigation/thread.py` (add `ThreadMessageKind.ASSISTANT_REPLY`)
- Modify: `apps/api/src/zentra_api/dependencies.py`, `apps/api/src/zentra_api/registry.py`
- Test: `libs/application/investigation/tests/test_thread_service.py`, `libs/adapters/langgraph/tests/` (new conversational-agent test file)

**Interfaces:**
- Consumes: `RoutingDisposition.NOT_ANALYTICAL` from Task 2.
- Produces: a `ConversationalPort` Protocol (`async def reply(self, message: str, *, tenant_id: UUID) -> str`) that `ThreadService` depends on, exactly parallel to `IntakePort`. `ThreadDetail`'s messages gain the ability to carry `kind=ThreadMessageKind.ASSISTANT_REPLY` with `author_id=None`, mirroring how `ROUTER_CLARIFICATION` messages already work.

- [ ] **Step 1: Add `ThreadMessageKind.ASSISTANT_REPLY`** in `libs/domain/investigation/src/zentra_domain_investigation/thread.py`:

```python
class ThreadMessageKind(StrEnum):
    USER_QUESTION = "user_question"
    USER_CLARIFICATION = "user_clarification"
    ROUTER_CLARIFICATION = "router_clarification"
    # A Conversational Agent's reply to a non-analytical message (ADR-0033).
    # No Analysis Run backs it -- `author_id` is None, same as a router
    # clarification.
    ASSISTANT_REPLY = "assistant_reply"
```

Cross-check this against `messages`' `ck_messages_kind` CHECK constraint already installed by Plan 1's `0023_chat_analysis_run_cutover.py` (via `schema_threads.py`) — confirm `'assistant_reply'` is already in that constraint's allowed list (ADR-0033 says it should be; if `messages.kind`'s CHECK in `schema_threads.py` does not already include it, add it here as part of this task, in a new guarded migration following the `0021_intake_role.py` expand pattern).

- [ ] **Step 2: Add `AgentRole.CONVERSATIONAL`** in `contracts.py`, alongside the existing roles:

```python
    KNOWLEDGE = "knowledge"
    CONVERSATIONAL = "conversational"
```

- [ ] **Step 3: Write the migration widening `agent_registry`/`work_items`'s role CHECK**, following `0021_intake_role.py` exactly (copy its `_PRIOR_ROLES`/`_role_check` structure, add `"conversational"` to the new list, set `down_revision` to Task 1's migration or whatever `alembic heads` reports as current at implementation time).

- [ ] **Step 4: Add the prompt** in `prompts.py`:

```python
CONVERSATIONAL_REPLY = """You are the conversational voice of an analytics
product. A user sent a message Intake decided is not a business question --
a greeting, thanks, small talk, or a question about what this product does.

Reply in one or two short sentences, warm but not chatty. If asked what you
can do, describe answering governed business questions over the Tenant's
connected data -- never invent a capability this product does not have, and
never attempt to answer an analytical question yourself; if the message
turns out to need one, say the user can just ask."""
```

- [ ] **Step 5: Add a minimal schema** in `schemas.py`:

```python
CONVERSATIONAL_SCHEMA = _obj({"reply": {"type": "string"}})
```

- [ ] **Step 6: Write the agent adapter** `libs/adapters/langgraph/src/zentra_adapter_langgraph/agents/conversational.py`, following `intake.py`'s shape but without a semantic layer dependency (a conversational reply never reads the catalog):

```python
from __future__ import annotations

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
    ModelMessage,
    ModelPort,
    ValidationOutcome,
    validate_agent_output,
)

from ..constants import CONVERSATIONAL_MODEL, MAX_TOKENS
from ..prompts import CONVERSATIONAL_REPLY
from ..schemas import CONVERSATIONAL_SCHEMA, parse_json_object

AGENT_ID = "conversational_v1"

DESCRIPTOR = AgentDescriptor(
    agent_id=AGENT_ID,
    role=AgentRole.CONVERSATIONAL,
    tool_permissions=(),
    context_budget_tokens=MAX_TOKENS,
    input_schema={"type": "object", "properties": {"message": {"type": "string"}}},
    output_schema=CONVERSATIONAL_SCHEMA,
    output_fields=frozenset({"reply"}),
    eval_suite_ref="evals/conversational",
)


class ConversationalAgent:
    """Replies to a message Intake routed as not analytical (ADR-0033).

    No tool access, no semantic layer: this Agent never queries data and
    never produces an Analysis Run. If a reply looks like it should have
    been analytical, that is Intake's routing to fix, not this Agent's job.
    """

    def __init__(self, *, model: ModelPort) -> None:
        self._model = model

    @property
    def descriptor(self) -> AgentDescriptor:
        return DESCRIPTOR

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        message = str(agent_input.state["message"])
        response = await self._model.complete(
            model=CONVERSATIONAL_MODEL,
            system=CONVERSATIONAL_REPLY,
            messages=[ModelMessage(role="user", content=message)],
            max_tokens=MAX_TOKENS,
            response_schema=CONVERSATIONAL_SCHEMA,
        )
        decision = parse_json_object(response.text)
        reply = str(decision.get("reply", "")).strip()
        return validate_agent_output(
            self,
            AgentOutput(
                fields={"reply": reply},
                outcome=ValidationOutcome(
                    passed=bool(reply),
                    checks=("A reply was produced.",),
                    issues=() if reply else ("The reply was empty.",),
                ),
                usage=response.usage,
                fallbacks=response.fallbacks,
            ),
        )
```

Check `constants.py` for the existing `INTAKE_MODEL`/`MAX_TOKENS` pattern before adding `CONVERSATIONAL_MODEL` — likely the same free-tier model Intake uses (`ModelTier.FREE` is wired at the `apps/api` dependency layer, not per-agent, so `CONVERSATIONAL_MODEL` probably mirrors `INTAKE_MODEL`'s definition exactly).

- [ ] **Step 7: Export `ConversationalAgent`** from `libs/adapters/langgraph/src/zentra_adapter_langgraph/agents/__init__.py` and the package's top-level `__init__.py` (match how `IntakeAgent` is exported).

- [ ] **Step 8: Add `ConversationalPort` to `thread_ports.py`**:

```python
class ConversationalPort(Protocol):
    """Replies to a non-analytical message (ADR-0033)."""

    async def reply(self, message: str, *, tenant_id: UUID) -> str: ...
```

- [ ] **Step 9: Wire `ThreadService` to depend on it.** In `thread_service.py`:

```python
    def __init__(
        self,
        *,
        unit_of_work_factory: ThreadUnitOfWorkFactory,
        intake: IntakePort,
        conversational: ConversationalPort,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._intake = intake
        self._conversational = conversational
        self._now = now
        self._new_id = new_id
```

Add `conversational` as a required keyword-only constructor argument — every call site (`apps/api/src/zentra_api/dependencies.py`, and every test file constructing `ThreadService` directly) must be updated in this task, not deferred. `grep -rn "ThreadService(" libs apps` first to find every call site before starting.

- [ ] **Step 10: Change `_apply_routing`** so a `NOT_ANALYTICAL` disposition produces an assistant reply instead of a router-clarification message:

```python
    async def _apply_routing(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: InvestigationThread,
        message: ThreadMessage,
        routing: RoutingResult,
        now: datetime,
        data_connection_id: UUID | None = None,
    ) -> tuple[UUID | None, tuple[ThreadMessage, ...]]:
        if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
            reply_text = await self._conversational.reply(
                message.content, tenant_id=actor.tenant_id
            )
            reply_message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread.thread_id,
                tenant_id=thread.tenant_id,
                author_id=None,
                kind=ThreadMessageKind.ASSISTANT_REPLY,
                content=reply_text,
                now=now,
            )
            await unit_of_work.threads.add_message(reply_message)
            await unit_of_work.work_feed.append(
                tenant_id=actor.tenant_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                payload=RoutingEventPayload(
                    disposition=routing.disposition.value,
                    suggestion_count=0,
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            return None, (reply_message,)
        if routing.disposition is not RoutingDisposition.RESOLVED:
            ...  # unchanged
```

(the rest of the method is unchanged — only the new `if` branch is inserted before the existing `RoutingDisposition.RESOLVED`-vs-not check). Apply the identical branch to `_append_follow_up`, in the same place its own `routing.disposition is RoutingDisposition.RESOLVED` check happens — a follow-up that turns out to be a "thanks!" should get a reply, not a router clarification, exactly like a first message would.

- [ ] **Step 11: Wire `ConversationalService` (mirroring `IntakeService`'s shape) and register the dependency** in `apps/api/src/zentra_api/dependencies.py`:

```python
        def _build_conversational_agent() -> ConversationalAgent:
            return ConversationalAgent(model=intake_model)

        threads = ThreadService(
            unit_of_work_factory=PostgresThreadUnitOfWorkFactory(database),
            intake=IntakeService(...),  # unchanged
            conversational=ConversationalService(agent_factory=_build_conversational_agent),
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
        )
```

Write `ConversationalService` in `libs/application/investigation/src/zentra_application_investigation/conversational_service.py` — a thin `ConversationalPort` implementation that builds one agent per call (same reasoning as `IntakeService`'s own docstring: nothing here is per-request state, but the pattern matches so a future per-tenant model-tier choice does not require a second refactor) and returns `output.fields["reply"]`.

- [ ] **Step 12: Add `Conversational Agent` to `_PUBLIC_DEFAULTS`** in `apps/api/src/zentra_api/registry.py`, matching the existing entries' shape (display name, description, one capability).

- [ ] **Step 13: Update every `ThreadService(...)` call site found in Step 9** (test fixtures included) to pass a fake/real `conversational` argument. For test fakes, a minimal stub is enough:

```python
class FakeConversational:
    async def reply(self, message: str, *, tenant_id: UUID) -> str:
        return "Thanks for reaching out!"
```

- [ ] **Step 14: Write tests** — `test_thread_service.py`: a message that resolves `NOT_ANALYTICAL` produces a Thread with one `ASSISTANT_REPLY` message, no Investigation queued, `detail.investigation_id is None`. `libs/adapters/langgraph/tests`: a new test file for `ConversationalAgent` mirroring `test_intake_agent.py`'s structure (find and read that file's exact name/pattern first) — asserts the descriptor's role, and that a stubbed model response maps to a plain string reply.

- [ ] **Step 15: Run tests and commit**

```bash
docker compose up -d --wait control-postgres
cd libs/adapters/postgres && DATABASE_OWNER_URL="postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control" uv run alembic upgrade head
cd ../../..
pnpm nx run-many -t test --projects=investigation-application,langgraph,postgres,api --skip-nx-cache
git add -A
git commit -m "feat(thread): add the Conversational Agent for non-analytical messages"
```

---

### Task 4: Remove the follow-up hard block

**Files:**
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_service.py`
- Test: `libs/application/investigation/tests/test_thread_service.py`

**Interfaces:**
- No new public interface — `ThreadService.append()`'s existing signature and `ThreadDetail` return type are unchanged. The behavior change is purely internal to `_append_follow_up`.

The current block:

```python
        latest = await unit_of_work.investigations.latest_for_thread(
            thread.thread_id, for_update=True
        )
        if latest is None or latest.status not in TERMINAL_STATUSES:
            raise ThreadConflictError(
                "The latest Investigation must finish before a follow-up"
            )
```

exists because the original one-Investigation-per-Thread model had nowhere else to put a second in-flight Investigation. ADR-0028 explicitly rejected that model: "Analysis Run granularity is unchanged from Investigation's: one per analytical Message, chained to related follow-ups by `parent_analysis_run_id`." A follow-up sent while the prior Analysis Run is still running should queue its own Analysis Run immediately, chained to whatever the most recent one is — not be refused. `execution_worker.py`'s job leasing is per-job-row (`for_update=True` on the individual job, not a Thread-level lock), so nothing downstream assumes only one Investigation runs per Thread at a time.

- [ ] **Step 1: Write the failing test first**

```python
@pytest.mark.asyncio
async def test_a_follow_up_is_accepted_while_the_prior_investigation_is_still_running() -> None:
    value = repository()
    threads = service(value)
    owner = actor()
    detail = await threads.create(
        owner, project_id=GROUP_ID, content="Why did EU refunds increase from June to July 2026?"
    )
    assert detail.investigation_id is not None
    first_investigation = value.investigations[detail.investigation_id]
    assert first_investigation.status not in TERMINAL_STATUSES  # still running

    follow_up = await threads.append(
        owner, thread_id=detail.thread_id, content="What about refunds in Germany specifically?"
    )

    assert follow_up.investigation_id is not None
    assert follow_up.investigation_id != detail.investigation_id
    second_investigation = value.investigations[follow_up.investigation_id]
    assert second_investigation.parent_investigation_id == detail.investigation_id
```

(the `_combined_question_text`/clarification-round-trip framing in the file's existing `FakeIntake` only resolves messages containing "refund" and "eu"/"europe" — check the actual fixture's matching rule before writing the follow-up's content, so it resolves on the first try rather than needing a clarification round-trip first.)

Run it: `cd libs/application/investigation && uv run pytest tests/test_thread_service.py -k follow_up_is_accepted -v`. Expected: FAIL with `ThreadConflictError`.

- [ ] **Step 2: Remove the block and chain unconditionally**

```python
    async def _append_follow_up(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: InvestigationThread,
        content: str,
        now: datetime,
    ) -> ThreadDetail:
        latest = await unit_of_work.investigations.latest_for_thread(
            thread.thread_id, for_update=True
        )
        message = ThreadMessage.create(
            message_id=self._new_id(),
            thread_id=thread.thread_id,
            tenant_id=actor.tenant_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        routing = await self._intake.resolve(
            message.content,
            tenant_id=actor.tenant_id,
            data_connection_id=latest.data_connection_id if latest else None,
        )
```

Remove the `if latest is None or latest.status not in TERMINAL_STATUSES: raise ThreadConflictError(...)` block entirely. The `published_reference`/"again"/"latest"/"re-run" heuristic below it that upgrades an `UNSUPPORTED` disposition to `RESOLVED` when `latest.status is InvestigationStatus.COMPLETED` stays exactly as-is (it already only fires when `latest` is completed, which is now just one possible state among several instead of an enforced precondition) — but guard it against `latest is None`, since a Thread can now reach `_append_follow_up` with no prior Investigation at all if its first message was `NOT_ANALYTICAL` (Task 3):

```python
        normalized = message.content.casefold()
        published_reference = any(
            token in normalized
            for token in ("again", "latest", "re-run", "rerun", "same")
        )
        if (
            latest is not None
            and routing.disposition is not RoutingDisposition.RESOLVED
            and published_reference
            and latest.status is InvestigationStatus.COMPLETED
        ):
            ...  # unchanged
```

And the chaining below it:

```python
        investigation_id = latest.investigation_id if latest else None
        if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
            ...  # Task 3's branch, using investigation_id from above as the "no change" value
        elif routing.disposition is RoutingDisposition.RESOLVED:
            assert routing.canonical_question is not None
            follow_up = Investigation.create(
                investigation_id=self._new_id(),
                tenant_id=actor.tenant_id,
                question=routing.canonical_question,
                now=now,
                data_connection_id=latest.data_connection_id if latest else None,
                thread_id=thread.thread_id,
                thread_sequence=(latest.thread_sequence or 0) + 1 if latest else 1,
                initiating_message_id=message.message_id,
                parent_investigation_id=latest.investigation_id if latest else None,
            )
            ...  # unchanged from here
```

Read the full current method body before editing — this plan shows the changed lines, not a full replacement; every `unit_of_work.work_feed.append(...)`/`unit_of_work.threads.save_thread(...)`/commit call in the method is otherwise unchanged.

- [ ] **Step 3: Run the new test, confirm it passes**

- [ ] **Step 4: Check for a stale docstring or comment** referencing "the latest Investigation must finish" anywhere else in the codebase (`grep -rn "must finish before a follow-up\|TERMINAL_STATUSES" libs apps`) and update or remove it.

- [ ] **Step 5: Run the full test suite and commit**

```bash
pnpm nx test investigation-application --skip-nx-cache
git add libs/application/investigation
git commit -m "feat(thread): allow a follow-up while the prior Analysis Run is still active"
```

---

### Task 5: Rename the REST surface — `/v1/projects/{id}/threads` to `/v1/groups/{id}/chats`

**Files:**
- Modify: `apps/api/src/zentra_api/thread_routes.py` → consider renaming the file to `chat_routes.py` (check whether other files import `thread_routes` by name first: `grep -rn "thread_routes" apps/api/src`)
- Modify: `apps/api/src/zentra_api/thread_schemas.py`
- Modify: `apps/api/src/zentra_api/main.py` (router registration, if the module is renamed)
- Modify: `docs/05_APIs/zentraos-openapi.json` (regenerate, do not hand-edit — see Plan 1's Task for the exact `uv run python3 -c "..."` regeneration command)
- Modify: `apps/api/tests/test_thread_api.py`, `apps/api/tests/test_zentraos_contract.py`, `apps/api/tests/test_thread_sse.py`

**Interfaces:**
- Produces: `POST /v1/groups/{group_id}/chats`, `GET /v1/groups/{group_id}/chats`, `GET /v1/chats/{chat_id}`, `GET /v1/chats/{chat_id}/events`, `POST /v1/chats/{chat_id}/messages`, `POST /v1/chats/{chat_id}/archive`, `POST /v1/chats/{chat_id}/restore`, `DELETE /v1/chats/{chat_id}`. Every handler's body is unchanged — only the `@router.post(...)`/`@router.get(...)` path strings and the function names change (`create_thread`→`create_chat`, etc.), matching the handoff doc's originally proposed shape (`GET /v1/chats/{chat_id}/events` replaces `GET /v1/threads/{thread_id}/events`, etc.).

This is a mechanical rename — every handler keeps calling `dependencies.threads.create(...)` / `.append(...)` / etc. exactly as before (`ThreadService`'s own method names are unchanged, per this plan's Global Constraints). Only the URL paths, route function names, and response schema class names move from Thread/Project vocabulary to Chat/Group vocabulary.

- [ ] **Step 1: Read the full current `thread_routes.py` and `thread_schemas.py`** (both already shown in full elsewhere in this plan's research — re-read them directly in the actual files before editing, since line numbers will have drifted).

- [ ] **Step 2: Rewrite path strings and function names**, one-for-one:

| Old | New |
|---|---|
| `POST /v1/projects/{project_id}/threads` (`create_thread`) | `POST /v1/groups/{group_id}/chats` (`create_chat`) |
| `GET /v1/projects/{project_id}/threads` (`list_threads`) | `GET /v1/groups/{group_id}/chats` (`list_chats`) |
| `GET /v1/threads/{thread_id}` (`get_thread`) | `GET /v1/chats/{chat_id}` (`get_chat`) |
| `GET /v1/threads/{thread_id}/events` (`stream_thread_events`) | `GET /v1/chats/{chat_id}/events` (`stream_chat_events`) |
| `POST /v1/threads/{thread_id}/messages` (`append_thread_message`) | `POST /v1/chats/{chat_id}/messages` (`append_chat_message`) |
| `POST /v1/threads/{thread_id}/archive` (`archive_thread`) | `POST /v1/chats/{chat_id}/archive` (`archive_chat`) |
| `POST /v1/threads/{thread_id}/restore` (`restore_thread`) | `POST /v1/chats/{chat_id}/restore` (`restore_chat`) |
| `DELETE /v1/threads/{thread_id}` (`delete_thread`) | `DELETE /v1/chats/{chat_id}` (`delete_chat`) |

Path parameter names change too (`project_id`→`group_id`, `thread_id`→`chat_id`), but the values passed to `dependencies.threads.create(..., project_id=group_id, ...)` etc. are unchanged — `ThreadService`'s own parameter is still named `project_id` (Global Constraint: no domain/application-layer renames in this plan).

- [ ] **Step 3: Rename the response schema classes** in `thread_schemas.py` (`ThreadResponse`→`ChatResponse`, `ThreadPageResponse`→`ChatPageResponse`, `ThreadMessageRequest` — keep or rename to `ChatMessageRequest`, your call, but be consistent) and update every `from_detail(...)` call site.

- [ ] **Step 4: Update `main.py`'s router import/registration** if the file was renamed.

- [ ] **Step 5: Update `apps/api/tests/test_thread_api.py`** — every path string and expected JSON key. Consider renaming the file to `test_chat_api.py` for consistency (check the `apps/api/tests/test_workspace_api.py` precedent from Plan 1 — that file was NOT renamed despite `workspace_routes.py` losing its Project routes, so the existing convention favors keeping test file names stable even when route paths inside them change; follow that precedent and do not rename this test file).

- [ ] **Step 6: Update `test_thread_sse.py`** — the SSE endpoint path.

- [ ] **Step 7: Update `test_zentraos_contract.py`**'s hardcoded path list** (`/v1/projects/{project_id}/threads`, `/v1/threads/{thread_id}/messages`, `/v1/threads/{thread_id}/events` → the new paths).

- [ ] **Step 8: Regenerate the OpenAPI snapshot**

```bash
cd apps/api && uv run python3 -c "
import json
from zentra_api.main import create_app
spec = create_app().openapi()
with open('../../docs/05_APIs/zentraos-openapi.json', 'w') as f:
    json.dump(spec, f, indent=2, sort_keys=True)
    f.write('\n')
"
```

Then `git diff docs/05_APIs/zentraos-openapi.json` and confirm only the expected paths/schema names changed — no unrelated diff, matching the verification Plan 1 already did for this exact file.

- [ ] **Step 9: Run the full `api` test suite and commit**

```bash
pnpm nx test api --skip-nx-cache
git add apps/api docs/05_APIs/zentraos-openapi.json
git commit -m "feat(api): rename the Thread REST surface to Chat Session vocabulary"
```

---

### Task 6: Enforce private Chat Session visibility

**Files:**
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_service.py`
- Modify: `libs/application/investigation/src/zentra_application_investigation/thread_dto.py`
- Test: `libs/application/investigation/tests/test_thread_service.py`

**Interfaces:**
- No new public method — `ThreadService.get()`, `.append()`, `.archive()`, `.restore()`, `.delete()`, and `.list()` all gain a private-visibility check. `AuthenticatedActor` (already has `.user_id`) is the only new input needed; no new port or repository method (the check runs against a Thread already fetched for other reasons).

**Design decision, made in this plan rather than left to the implementer:** application-layer filter, not a second RLS policy. Every existing RLS policy in this codebase is tenant-scoped only (`app.tenant_id`); adding a `created_by`-scoped policy on top would mean setting a second session variable (`app.user_id`) on every connection for the sake of two tables, when the check only needs to run at the two or three call sites that read a specific Thread by id. `InvestigationThread` does not carry a `created_by`/`visibility` field today (the domain layer is unchanged per this plan's Global Constraints) — so this task adds narrow read-only lookups through the repository rather than the domain object, the same pattern Task 1 used for `default_data_connection_id`.

- [ ] **Step 1: Add repository lookups** to `libs/adapters/postgres/src/zentra_adapter_postgres/thread.py` (same file, same pattern as Task 1's two new methods):

```python
async def visibility_and_creator(
    self, thread_id: UUID
) -> tuple[str, UUID | None] | None:
    async with self._database.connect() as connection:
        await set_tenant_context(connection, self._tenant_id)
        result = await connection.execute(
            select(chat_sessions.c.visibility, chat_sessions.c.created_by).where(
                chat_sessions.c.chat_session_id == thread_id
            )
        )
        row = result.one_or_none()
        return (row.visibility, row.created_by) if row else None
```

Add the matching Protocol method to `ThreadRepository` in `thread_ports.py`.

- [ ] **Step 2: Add a private helper to `ThreadService`** that every id-scoped method calls right after fetching the Thread:

```python
    async def _require_visible(
        self, unit_of_work: ThreadUnitOfWork, actor: AuthenticatedActor, thread_id: UUID
    ) -> None:
        visibility = await unit_of_work.threads.visibility_and_creator(thread_id)
        if visibility is None:
            return  # thread lookup itself already raised ThreadNotFoundError elsewhere
        session_visibility, created_by = visibility
        if session_visibility == "private" and created_by != actor.user_id:
            raise ThreadNotFoundError("Thread was not found")
```

Raising `ThreadNotFoundError` rather than `PermissionDeniedError` is deliberate and matches this codebase's existing cross-tenant pattern (`test_thread_and_first_message_are_atomic_and_tenant_scoped` in Plan 1's postgres tests asserts a cross-tenant read raises `ThreadNotFoundError`, not a 403) — a private Chat Session another User cannot see should look identical to one that does not exist, not confirm its existence via a different error code.

- [ ] **Step 3: Call `_require_visible` from every id-scoped method** — `get`, `append` (both the resolved-immediately and `_append_follow_up` paths share one entry in `append`, so one call site covers both), `archive`/`restore` (via `_change_status`), `delete`. Do not add it to `create` (no existing Thread yet) or `list` (filtered separately, Step 4).

- [ ] **Step 4: Filter `list_threads`** so a private Chat Session belonging to a different User in the same Group never appears in another member's list. This needs a repository-level change, not a service-level post-filter (post-filtering would break pagination — a page could come back empty or short even though more visible items exist further down). Add `viewer_id: UUID` to `ThreadRepository.list_threads`'s signature and `ThreadUnitOfWork` usage:

```python
    async def list_threads(
        self,
        *,
        project_id: UUID,
        viewer_id: UUID,
        include_archived: bool,
        limit: int,
        after: ThreadCursor | None,
    ) -> ThreadSlice: ...
```

In `thread.py`'s SQL, add `AND (chat_sessions.visibility != 'private' OR chat_sessions.created_by = :viewer_id)` to the existing `WHERE`. Update `ThreadService.list()`'s call site to pass `viewer_id=actor.user_id`. Update every test fake `Repository.list_threads` implementation (`test_thread_service.py` and any other file with a hand-written fake matching this Protocol — `grep -rn "async def list_threads" libs/application/investigation/tests`) to accept and honor the new parameter.

- [ ] **Step 5: Write tests**

```python
@pytest.mark.asyncio
async def test_a_private_thread_is_invisible_to_a_non_creator() -> None:
    value = repository()
    creator = actor()
    other_member = actor()  # same tenant, different user_id -- check the `actor()` helper's signature; it may need a new optional user_id param to produce two distinct actors in the same tenant
    threads = service(value)
    detail = await threads.create(creator, project_id=GROUP_ID, content="...")
    value.threads[detail.thread_id].visibility = "private"  # or however the fake stores it after Step 1's repository change -- adjust to match

    with pytest.raises(ThreadNotFoundError):
        await threads.get(other_member, detail.thread_id)


@pytest.mark.asyncio
async def test_a_private_thread_is_excluded_from_another_users_list() -> None:
    ...  # mirrors the above, asserting the thread_id is absent from list_threads' result for other_member
```

The exact shape of these tests depends on how the fake `Repository` in `test_thread_service.py` stores `visibility`/`created_by` today (it may not store them at all yet, since the domain `InvestigationThread` doesn't carry them) — read that file's current `Repository` class fully before writing the test, and extend its in-memory storage to track these two fields per Thread if it does not already, mirroring how `visibility_and_creator`/`list_threads` are implemented against real Postgres in Step 1/4.

- [ ] **Step 6: Run the full test suite and commit**

```bash
docker compose up -d --wait control-postgres
cd libs/adapters/postgres && DATABASE_OWNER_URL="postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control" uv run alembic upgrade head
cd ../../..
pnpm nx run-many -t test --projects=investigation-application,postgres,api --skip-nx-cache
git add -A
git commit -m "feat(thread): enforce private Chat Session visibility"
```

---

## Final Verification

After all six tasks:

```bash
docker compose down -v control-postgres
docker compose up -d --wait control-postgres
cd libs/adapters/postgres && DATABASE_OWNER_URL="postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control" uv run alembic upgrade head
cd ../../..
export TEST_DATABASE_OWNER_URL="postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control"
export TEST_DATABASE_RUNTIME_URL="postgresql+psycopg://zentra_app:zentra_app@localhost:5432/zentra_control"
pnpm nx run-many -t lint test --projects=postgres,investigation-application,langgraph,api --skip-nx-cache
```

A genuinely fresh Postgres volume, full migration replay, and every affected project's test suite green (or only the pre-existing, unrelated `test_phase_2_acceptance.py` `_Dependencies.connector` failures documented in Plan 1's PR) is the bar for this plan being done — matching exactly how Plan 1 was verified.
