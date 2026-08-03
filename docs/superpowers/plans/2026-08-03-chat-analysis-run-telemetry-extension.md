# Chat & Analysis Run Telemetry Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ADR-0031 — point the existing safe-telemetry OTLP pipe at Langfuse Cloud's free tier, and extend `SAFE_ATTRIBUTES` beyond its current coverage (Insight execution, publication decision, citation resolution, evidence deletion) to also cover Intake Agent runs, Cube Analyst Agent runs, Data Visualization Agent runs, tool calls, and skill activations — with no richer, second telemetry channel for Langfuse than any other OTLP consumer gets.

**Architecture:** `libs/adapters/telemetry/src/zentra_adapter_telemetry` owns the allowlist (`SAFE_ATTRIBUTES`, `_record()`) and the OTLP wiring (`configure_telemetry`); every `record_*` function is a thin, allowlisted setter plus a matching OTel metric. Every existing recorder is called from the outermost layer that already has the finished fact to report — `apps/api/src/zentra_api/pipeline.py`'s `PostgresExecutionRecorder.record()` for the Insight/Intake/Cube-Analyst/tool-call/skill path (it is already `zentra_api`, which may import any adapter directly), and, for the Data Visualization Agent — which lives in `zentra_application_investigation`, an application-layer package `.importlinter` forbids from importing `opentelemetry` — through a new `AgentExecutionObserver` port injected from `apps/api/src/zentra_api/dependencies.py`, mirroring the existing `PublicationObserver`/`ErasureObserver` pattern in `libs/application/investigation/src/zentra_application_investigation/ports.py` and `service.py`.

**Tech Stack:** Python 3.13, OpenTelemetry SDK (`opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http`), pytest.

## Global Constraints

- No second, richer Langfuse integration path (ADR-0031's "Considered Options"): every new attribute is allowlisted the same way the existing four recorders are, and reaches Langfuse only as an OTLP span/metric attribute — never a native Langfuse SDK call.
- `SAFE_ATTRIBUTES` and `SAFE_DIMENSIONS` are enforced at runtime (`_record()` / `dimensions()` raise `ValueError` on an unlisted key) — every new key is added to the relevant frozenset in the same commit as its first use, never after.
- `zentra_application_investigation` (and every other `zentra_application_*`/`zentra_domain_*` package) may not import `opentelemetry` or any adapter package directly (`.importlinter`'s `application-is-framework-independent` and `adapters-do-not-depend-on-each-other` contracts) — the Data Visualization Agent's telemetry is wired through a `Protocol` port and injected from `apps/api`, exactly like `PublicationObserver`/`ErasureObserver` already are.
- `record_insight_execution` and its existing call site are untouched — Insight already has ADR-blessed, tested telemetry under its own `zentra.insight.*` namespace; Intake, Cube Analyst, and the Data Visualization Agent share one new generic recorder (`record_agent_execution`, `zentra.agent.*`) instead of each getting a bespoke near-duplicate, because their reported shape is identical.
- No Evaluator telemetry is added. ADR-0031's consequence list names Intake, Cube Analyst, and Data Visualization Agent runs specifically — Evaluator is not in that list, and adding it would be scope the ADR did not ask for. Evaluator's tool calls and skill activations are still recorded, because "tool calls" and "skill activations" are unscoped by role in the ADR.
- No Postgres migration. Nothing in this plan touches persisted schema — every change is telemetry (OTel spans/metrics) plus the observer-port wiring needed to reach the Data Visualization Agent.
- File size: keep every edited file at or under 600 lines (per this repo's coding standard); `apps/api/src/zentra_api/pipeline.py` is already 557 lines, so its new logic is isolated in one small private helper (`_record_agent_telemetry`) rather than inlined into `record()`.

---

## File Structure

- Modify `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py` — extend `SAFE_ATTRIBUTES`; add `record_agent_execution`, `record_tool_call`, `record_skill_activation`, `correlate_thread`; fix `configure_telemetry`'s header wiring.
- Modify `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py` — extend `SAFE_DIMENSIONS`; add `agent_duration`/`agent_cost`/`agent_tokens`/`agent_fallbacks`/`tool_calls`/`skill_activations` instruments; make `_parse_headers` public as `parse_headers`.
- Modify `libs/adapters/telemetry/src/zentra_adapter_telemetry/__init__.py` — export the four new symbols.
- Modify `libs/adapters/telemetry/tests/test_no_evidence_leaks.py` — cover the new recorders in the poison/allowlist/change-detector tests.
- Modify `libs/adapters/telemetry/tests/test_tracing.py` — cover `correlate_thread` and the Langfuse-shaped `configure_telemetry` header wiring.
- Modify `apps/api/src/zentra_api/pipeline.py` — wire Intake/Cube-Analyst/tool-call/skill-activation telemetry into `PostgresExecutionRecorder`.
- Modify `apps/api/tests/test_pipeline.py` — cover the new telemetry calls with a fake unit of work.
- Modify `libs/application/investigation/src/zentra_application_investigation/ports.py` — add `AgentExecutionObserver`.
- Modify `libs/application/investigation/src/zentra_application_investigation/visualization_service.py` — accept and call the observer on the Data Visualization Agent's success/failure paths.
- Create `libs/application/investigation/tests/test_visualization_service.py` — cover the observer wiring.
- Modify `apps/api/src/zentra_api/dependencies.py` — wire `record_agent_execution` into `VisualizationService`.
- Modify `apps/api/src/zentra_api/routes.py` — correlate the Chat Session identifier (`zentra.thread_id`) at the one call site that already resolves one.

---

### Task 1: Extend the allowlists and add the new recorders

**Files:**
- Modify: `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py`
- Modify: `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py`
- Modify: `libs/adapters/telemetry/src/zentra_adapter_telemetry/__init__.py`
- Test: `libs/adapters/telemetry/tests/test_no_evidence_leaks.py`, `libs/adapters/telemetry/tests/test_tracing.py`

**Interfaces:**
- Consumes: nothing new — `_record()`, `dimensions()`, `instruments()` already exist.
- Produces: `record_agent_execution`, `record_tool_call`, `record_skill_activation`, `correlate_thread`, `parse_headers` (renamed from `_parse_headers`). Tasks 2 and 3 depend on the first three; Task 4 depends on `correlate_thread`.

- [ ] **Step 1: Write the failing change-detector test**

In `libs/adapters/telemetry/tests/test_no_evidence_leaks.py`, update `test_the_allowlists_hold_only_categories_counts_and_identifiers` so the expected `SAFE_ATTRIBUTES` frozenset literal also contains:

```python
            "zentra.thread_id",
            "zentra.agent.role",
            "zentra.agent.agent_id",
            "zentra.agent.model",
            "zentra.agent.provider",
            "zentra.agent.fallback_count",
            "zentra.agent.input_tokens",
            "zentra.agent.output_tokens",
            "zentra.agent.cost_usd",
            "zentra.agent.duration_ms",
            "zentra.agent.status",
            "zentra.agent.error_category",
            "zentra.tool.role",
            "zentra.tool.name",
            "zentra.tool.status",
            "zentra.tool.latency_ms",
            "zentra.skill.role",
            "zentra.skill.names",
```

and the expected `SAFE_DIMENSIONS` frozenset literal also contains `"role"`, `"tool_name"`, `"skill_name"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test telemetry -- -k test_the_allowlists_hold_only_categories_counts_and_identifiers`
Expected: FAIL — the module's actual `SAFE_ATTRIBUTES`/`SAFE_DIMENSIONS` do not yet contain the new keys.

- [ ] **Step 3: Extend `SAFE_ATTRIBUTES` and `SAFE_DIMENSIONS`**

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py`, add to the `SAFE_ATTRIBUTES` frozenset literal (after the existing `"zentra.investigation_id",` line, before the `# Insight execution` comment block, in the same style as the existing per-domain comment groups):

```python
        # Chat Session correlation (paired with zentra.investigation_id)
        "zentra.thread_id",
```

and after the existing `# Evidence deletion` block's last entry, append:

```python
        # Generic Agent execution: Intake, Cube Analyst, Data Visualization.
        # Insight keeps its own zentra.insight.* recorder above — its shape
        # predates this one and nothing about it needed to change.
        "zentra.agent.role",
        "zentra.agent.agent_id",
        "zentra.agent.model",
        "zentra.agent.provider",
        "zentra.agent.fallback_count",
        "zentra.agent.input_tokens",
        "zentra.agent.output_tokens",
        "zentra.agent.cost_usd",
        "zentra.agent.duration_ms",
        "zentra.agent.status",
        "zentra.agent.error_category",
        # Tool calls, across every Agent that holds one
        "zentra.tool.role",
        "zentra.tool.name",
        "zentra.tool.status",
        "zentra.tool.latency_ms",
        # Skill activations
        "zentra.skill.role",
        "zentra.skill.names",
```

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py`, add `"role"`, `"tool_name"`, `"skill_name"` to the `SAFE_DIMENSIONS` frozenset literal.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test telemetry -- -k test_the_allowlists_hold_only_categories_counts_and_identifiers`
Expected: PASS

- [ ] **Step 5: Write the failing recorder tests**

In `libs/adapters/telemetry/tests/test_no_evidence_leaks.py`, extend `_emit_everything()` to also call the three new recorders:

```python
    record_agent_execution(
        agent_id="cube_analyst_v1",
        role="cube_analyst",
        model="gemini/gemini-3.6-flash",
        provider="gemini",
        fallback_count=0,
        input_tokens=900,
        output_tokens=210,
        cost_usd="0.0044",
        duration_ms=2100,
        status="success",
        error_category=None,
    )
    record_tool_call(
        role="cube_analyst", tool_name="semantic_query", status="success", latency_ms=340
    )
    record_skill_activation(role="cube_analyst", skill_names=("sample-size-discipline",))
```

Update the `from zentra_adapter_telemetry import (...)` block at the top of the file to also import `record_agent_execution`, `record_skill_activation`, `record_tool_call`.

Add a new parametrized test mirroring `test_poison_cannot_reach_a_span_through_an_unlisted_key`, but for the new `zentra.agent.*` prefix, and a new test asserting `record_skill_activation` with an empty `skill_names` tuple writes nothing (mirrors `record_evidence_deletion`'s "nothing written when there is nothing to say" discipline used implicitly elsewhere):

```python
def test_an_execution_with_no_skills_writes_no_skill_attribute(telemetry) -> None:
    with telemetry.tracer.start_as_current_span("investigation"):
        record_skill_activation(role="intake", skill_names=())

    assert "zentra.skill.role" not in telemetry.attributes()
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm nx test telemetry -- -k "test_no_recorder_writes_an_attribute_nobody_reviewed or test_no_metric_carries_an_unbounded_dimension or test_an_execution_with_no_skills_writes_no_skill_attribute"`
Expected: FAIL — `record_agent_execution`, `record_tool_call`, `record_skill_activation` do not exist yet.

- [ ] **Step 7: Add the three new recorders to `tracing.py`**

Append to `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py`, after `record_evidence_deletion`:

```python
def record_agent_execution(
    *,
    role: str,
    agent_id: str,
    model: str | None,
    provider: str | None,
    fallback_count: int,
    input_tokens: int,
    output_tokens: int,
    cost_usd: str,
    duration_ms: int,
    status: str,
    error_category: str | None = None,
) -> None:
    """What a governed Agent step other than Insight cost and how it went.

    Intake, Cube Analyst and the Data Visualization Agent share this one
    recorder rather than each getting a bespoke `record_insight_execution`-
    shaped function: the fields they report are identical, and a third or
    fourth near-duplicate would only be a third or fourth place the allowlist
    could drift from what is actually written. `role` names which one ran.
    """
    _record(
        {
            "zentra.agent.role": role,
            "zentra.agent.agent_id": agent_id,
            "zentra.agent.model": model,
            "zentra.agent.provider": provider,
            "zentra.agent.fallback_count": fallback_count,
            "zentra.agent.input_tokens": input_tokens,
            "zentra.agent.output_tokens": output_tokens,
            "zentra.agent.cost_usd": cost_usd,
            "zentra.agent.duration_ms": duration_ms,
            "zentra.agent.status": status,
            "zentra.agent.error_category": error_category,
        }
    )
    dims = dimensions(role=role, status=status, provider=provider, model=model)
    meters = instruments()
    meters.agent_duration.record(duration_ms, dims)
    meters.agent_cost.record(float(cost_usd), dims)
    meters.agent_tokens.record(input_tokens + output_tokens, dims)
    if fallback_count:
        meters.agent_fallbacks.add(fallback_count, dims)


def record_tool_call(*, role: str, tool_name: str, status: str, latency_ms: int) -> None:
    """That a tool ran, which one, and how it went. Never its arguments or
    results — `ToolInvocation` already withholds those (ADR-0006), and this
    recorder only ever sees what that type carries.
    """
    _record(
        {
            "zentra.tool.role": role,
            "zentra.tool.name": tool_name,
            "zentra.tool.status": status,
            "zentra.tool.latency_ms": latency_ms,
        }
    )
    instruments().tool_calls.add(
        1, dimensions(role=role, tool_name=tool_name, status=status)
    )


def record_skill_activation(*, role: str, skill_names: tuple[str, ...]) -> None:
    """Which Skills were appended to a role's system prompt for this execution.

    Skills are static per role rather than chosen per call
    (`SkillRegistry.apply`), so this reports the role's configuration at the
    moment it ran — the only way an operator or Langfuse could otherwise learn
    it is the system prompt itself, which this codebase deliberately never
    exports. Writes nothing for a role with no skills applied, the same
    "nothing to say" discipline the other recorders already follow.
    """
    if not skill_names:
        return
    _record(
        {
            "zentra.skill.role": role,
            "zentra.skill.names": ",".join(skill_names),
        }
    )
    meters = instruments()
    for name in skill_names:
        meters.skill_activations.add(1, dimensions(role=role, skill_name=name))
```

And after `correlate_investigation`:

```python
def correlate_thread(thread_id: UUID) -> None:
    """Internal identifier only, so a trace can be followed to its Chat
    Session. Mirrors `correlate_investigation`: never the message content,
    which is a Tenant's own words.
    """
    trace.get_current_span().set_attribute("zentra.thread_id", str(thread_id))
```

- [ ] **Step 8: Add the matching instruments to `metrics.py`**

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py`, inside `_Instruments.__init__`, after the existing `deletion_operations` assignment, add:

```python
        self.agent_duration = meter.create_histogram(
            "zentra.agent.duration",
            unit="ms",
            description="Wall time of one Intake, Cube Analyst, or Data "
            "Visualization Agent execution",
        )
        self.agent_cost = meter.create_histogram(
            "zentra.agent.cost",
            unit="USD",
            description="Provider cost of one such Agent execution",
        )
        self.agent_tokens = meter.create_histogram(
            "zentra.agent.tokens",
            unit="{token}",
            description="Tokens consumed by one such Agent execution",
        )
        self.agent_fallbacks = meter.create_counter(
            "zentra.agent.fallbacks",
            unit="{rung}",
            description="Fallback rungs descended before such an execution "
            "succeeded",
        )
        self.tool_calls = meter.create_counter(
            "zentra.tool.calls",
            unit="{call}",
            description="Tool calls an Agent made, by tool and outcome",
        )
        self.skill_activations = meter.create_counter(
            "zentra.skill.activations",
            unit="{activation}",
            description="Skills applied to an Agent execution's system prompt",
        )
```

- [ ] **Step 9: Export the new symbols**

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/__init__.py`, add `correlate_thread`, `record_agent_execution`, `record_skill_activation`, `record_tool_call` to both the `from .tracing import (...)` block and `__all__`, alphabetically.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm nx test telemetry`
Expected: PASS — every existing test still passes, and the new ones from Steps 1 and 5 pass.

- [ ] **Step 11: Commit**

```bash
git add libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py \
        libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py \
        libs/adapters/telemetry/src/zentra_adapter_telemetry/__init__.py \
        libs/adapters/telemetry/tests/test_no_evidence_leaks.py
git commit -m "feat(telemetry): extend SAFE_ATTRIBUTES for Intake, Cube Analyst, tool calls, and skill activations (ADR-0031)"
```

---

### Task 2: Fix `configure_telemetry`'s header wiring and prove the Langfuse-shaped configuration

**Files:**
- Modify: `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py`
- Modify: `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py`
- Test: `libs/adapters/telemetry/tests/test_tracing.py`

**Interfaces:**
- Consumes: `TelemetrySettings`, `configure_telemetry` (existing).
- Produces: `parse_headers` (renamed from the private `_parse_headers`), used by both `configure_metrics` (existing call site) and `configure_telemetry` (new call site).

This task exists because verifying the Langfuse-shaped configuration at the unit level (Step 1 below) surfaces a real, pre-existing bug: `configure_telemetry` passes `settings.otlp_headers` — a comma-separated `key=value` *string* — directly to `OTLPSpanExporter(headers=...)`, which requires a `dict`. Passed a string, the SDK treats it as truthy and hands it unparsed to `requests.Session.headers.update(...)`, which raises `ValueError: not enough values to unpack` the moment a real header string (e.g. Langfuse's `Authorization=Basic ...`) is supplied. This has never been caught because no existing test configures `otlp_endpoint` together with `otlp_headers`.

- [ ] **Step 1: Write the failing test**

In `libs/adapters/telemetry/tests/test_tracing.py`, add:

```python
def test_configuring_langfuse_shaped_settings_builds_a_working_exporter() -> None:
    """The whole of ADR-0031's infrastructure change: point the existing OTLP
    exporter at Langfuse Cloud's free tier. No new adapter, no new
    dependency — an endpoint and a Basic-auth header, verified at the
    settings level rather than against a real Langfuse project.
    """
    app = FastAPI()
    settings = TelemetrySettings(
        otlp_endpoint="https://cloud.langfuse.com/api/public/otel",
        otlp_headers="Authorization=Basic cGstbGYtMTIzOnNrLWxmLTQ1Ng==",
    )

    configure_telemetry(app, settings)

    provider = trace.get_tracer_provider()
    (processor,) = provider._active_span_processor._span_processors  # noqa: SLF001
    exporter = processor.span_exporter
    assert exporter._endpoint == settings.otlp_endpoint  # noqa: SLF001
    assert exporter._headers == {  # noqa: SLF001
        "Authorization": "Basic cGstbGYtMTIzOnNrLWxmLTQ1Ng=="
    }
```

Add the needed imports (`TracerProvider`'s internals are reached through `trace.get_tracer_provider()`, already available via the `trace` import this file already has — no new import needed beyond what Step 1 uses, which is already imported).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test telemetry -- -k test_configuring_langfuse_shaped_settings_builds_a_working_exporter`
Expected: FAIL — `exporter._headers` is the raw unparsed string, not a dict (or the test setup itself raises the `ValueError` described above, depending on OTel SDK version behaviour verified above).

- [ ] **Step 3: Rename `_parse_headers` to `parse_headers` and use it from both configurers**

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py`, rename `_parse_headers` to `parse_headers` (drop the leading underscore) and update its one call site inside `configure_metrics`. Add a one-line docstring note matching `dimensions()`'s existing rationale: "Public because `configure_telemetry` in `tracing.py` needs the same parsing; a private name imported across modules is a private name in title only."

In `libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py`, change the import line:

```python
from .metrics import configure_metrics, dimensions, instruments
```

to:

```python
from .metrics import configure_metrics, dimensions, instruments, parse_headers
```

and in `configure_telemetry`, change:

```python
        exporter = OTLPSpanExporter(
            endpoint=settings.otlp_endpoint,
            headers=settings.otlp_headers,
        )
```

to:

```python
        exporter = OTLPSpanExporter(
            endpoint=settings.otlp_endpoint,
            headers=parse_headers(settings.otlp_headers),
        )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test telemetry -- -k test_configuring_langfuse_shaped_settings_builds_a_working_exporter`
Expected: PASS

- [ ] **Step 5: Run the full telemetry suite to check for fallout**

Run: `pnpm nx test telemetry`
Expected: PASS — `test_costs_nothing_by_default.py`'s tests are unaffected (they never set both endpoint and headers), and `configure_metrics`'s existing behaviour is unchanged (same parsing logic, new name).

- [ ] **Step 6: Commit**

```bash
git add libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py \
        libs/adapters/telemetry/src/zentra_adapter_telemetry/metrics.py \
        libs/adapters/telemetry/tests/test_tracing.py
git commit -m "fix(telemetry): parse OTLP header string into a dict before handing it to the span exporter"
```

---

### Task 3: Wire Intake, Cube Analyst, tool-call, and skill-activation telemetry into `PostgresExecutionRecorder`

**Files:**
- Modify: `apps/api/src/zentra_api/pipeline.py`
- Test: `apps/api/tests/test_pipeline.py`

**Interfaces:**
- Consumes: `record_agent_execution`, `record_tool_call`, `record_skill_activation` (Task 1); `SkillRegistry` (`zentra_adapter_langgraph`, already a `zentra_api` dependency).
- Produces: nothing further downstream — this is a leaf call site, same as `record_insight_execution`'s existing one.

- [ ] **Step 1: Write the failing tests**

In `apps/api/tests/test_pipeline.py`, add a minimal fake unit-of-work (the existing `ExplodingUnitOfWorkFactory` only covers the legacy-role short-circuit and cannot reach `record()`'s body):

```python
class _RecordingUnitOfWork:
    def __init__(self) -> None:
        self.committed = False

    async def __aenter__(self) -> "_RecordingUnitOfWork":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    @property
    def agent_executions(self):
        return self

    async def add(self, execution: AgentExecutionRecord) -> None:
        return None

    @property
    def outbox(self):
        return self

    async def enqueue(self, events) -> None:
        return None

    @property
    def work_feed(self):
        return self

    async def append_for_investigation(self, **kwargs: object) -> None:
        return None


class _RecordingFactory:
    def __init__(self) -> None:
        self.uow = _RecordingUnitOfWork()

    def __call__(self, *_: object) -> _RecordingUnitOfWork:
        return self.uow


@pytest.mark.asyncio
async def test_intake_and_cube_analyst_executions_are_recorded_as_agent_telemetry(
    monkeypatch,
) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "zentra_api.pipeline.record_agent_execution",
        lambda **kwargs: calls.append(kwargs),
    )
    recorder = PostgresExecutionRecorder(_RecordingFactory())

    await recorder.record(execution(AgentRole.INTAKE))
    await recorder.record(execution(AgentRole.CUBE_ANALYST))

    assert [call["role"] for call in calls] == ["intake", "cube_analyst"]


@pytest.mark.asyncio
async def test_insight_executions_do_not_double_report_as_generic_agent_telemetry(
    monkeypatch,
) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "zentra_api.pipeline.record_agent_execution",
        lambda **kwargs: calls.append(kwargs),
    )
    recorder = PostgresExecutionRecorder(_RecordingFactory())

    await recorder.record(execution(AgentRole.INSIGHT))

    assert calls == []


@pytest.mark.asyncio
async def test_every_tool_call_is_recorded(monkeypatch) -> None:
    from zentra_domain_agent_execution import ToolInvocation

    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "zentra_api.pipeline.record_tool_call",
        lambda **kwargs: calls.append(kwargs),
    )
    recorder = PostgresExecutionRecorder(_RecordingFactory())
    with_tools = execution(AgentRole.CUBE_ANALYST).model_copy(
        update={
            "tool_calls": (
                ToolInvocation(name="semantic_catalog_search", latency_ms=80, ok=True),
                ToolInvocation(name="semantic_query", latency_ms=340, ok=False),
            )
        }
    )

    await recorder.record(with_tools)

    assert [(c["tool_name"], c["status"]) for c in calls] == [
        ("semantic_catalog_search", "success"),
        ("semantic_query", "failure"),
    ]


@pytest.mark.asyncio
async def test_skill_activation_is_recorded_for_a_role_that_has_skills(
    monkeypatch,
) -> None:
    from zentra_adapter_langgraph import Skill, SkillRegistry

    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "zentra_api.pipeline.record_skill_activation",
        lambda **kwargs: calls.append(kwargs),
    )
    skills = SkillRegistry(
        [
            Skill(
                name="sample-size-discipline",
                applies_to=frozenset({AgentRole.CUBE_ANALYST}),
                instructions="Report a sample size only if a query ran.",
            )
        ]
    )
    recorder = PostgresExecutionRecorder(_RecordingFactory(), skills=skills)

    await recorder.record(execution(AgentRole.CUBE_ANALYST))
    await recorder.record(execution(AgentRole.INTAKE))

    assert calls == [
        {"role": "cube_analyst", "skill_names": ("sample-size-discipline",)}
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test api -- -k "agent_telemetry or double_report or every_tool_call or skill_activation_is_recorded"`
Expected: FAIL — `PostgresExecutionRecorder` does not yet accept `skills`, and none of the three new recorders are called from `record()`.

- [ ] **Step 3: Wire the new recorders into `pipeline.py`**

Update the import block:

```python
from zentra_adapter_langgraph import SkillRegistry
from zentra_adapter_telemetry import (
    record_agent_execution,
    record_insight_execution,
    record_skill_activation,
    record_tool_call,
)
```

Update `PostgresExecutionRecorder.__init__`:

```python
    def __init__(
        self,
        unit_of_work_factory: PostgresInvestigationUnitOfWorkFactory,
        *,
        skills: SkillRegistry | None = None,
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._skills = skills or SkillRegistry.from_directory()
```

Add a private module-level helper just above `class PostgresExecutionRecorder`:

```python
def _record_agent_telemetry(execution: AgentExecutionRecord, skills: SkillRegistry) -> None:
    """Extend telemetry beyond Insight to every other governed step.

    Same call site as `record_insight_execution` below, for the same reason:
    the finished record already exists here, so telemetry cannot disagree
    with what was persisted about the same step.
    """
    if execution.role in (AgentRole.INTAKE, AgentRole.CUBE_ANALYST):
        record_agent_execution(
            role=execution.role.value,
            agent_id=execution.agent_id,
            model=execution.usage.model,
            provider=_provider_of(execution.usage.model),
            fallback_count=len(execution.fallbacks),
            input_tokens=execution.usage.input_tokens,
            output_tokens=execution.usage.output_tokens,
            cost_usd=str(execution.usage.cost_usd),
            duration_ms=execution.latency_ms,
            status=execution.status.value,
            error_category=_error_category(execution.errors),
        )
    for invocation in execution.tool_calls:
        record_tool_call(
            role=execution.role.value,
            tool_name=invocation.name,
            status="success" if invocation.ok else "failure",
            latency_ms=invocation.latency_ms,
        )
    record_skill_activation(
        role=execution.role.value,
        skill_names=tuple(skill.name for skill in skills.for_role(execution.role)),
    )
```

In `record()`, after the existing `if execution.role is AgentRole.INSIGHT: record_insight_execution(...)` block, add:

```python
        _record_agent_telemetry(execution, self._skills)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test api -- -k "agent_telemetry or double_report or every_tool_call or skill_activation_is_recorded"`
Expected: PASS

- [ ] **Step 5: Run the full `api` and `telemetry` suites to check for fallout**

Run: `pnpm nx test api` and `pnpm nx test telemetry`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/zentra_api/pipeline.py apps/api/tests/test_pipeline.py
git commit -m "feat(api): record Intake, Cube Analyst, tool-call, and skill-activation telemetry from the execution recorder"
```

---

### Task 4: Add `AgentExecutionObserver` and wire the Data Visualization Agent's telemetry

**Files:**
- Modify: `libs/application/investigation/src/zentra_application_investigation/ports.py`
- Modify: `libs/application/investigation/src/zentra_application_investigation/visualization_service.py`
- Create: `libs/application/investigation/tests/test_visualization_service.py`

**Interfaces:**
- Consumes: nothing from the telemetry adapter directly (forbidden by `.importlinter`) — only the new `Protocol`.
- Produces: `AgentExecutionObserver`, an optional constructor parameter on `VisualizationService`. Task 5 wires the concrete `record_agent_execution` into it from `apps/api`.

- [ ] **Step 1: Add the port**

In `libs/application/investigation/src/zentra_application_investigation/ports.py`, after `ErasureObserver`, add:

```python
class AgentExecutionObserver(Protocol):
    """Somewhere to report how an Agent execution went, for an Agent outside
    the Insight/pipeline recording path that still needs it — the Data
    Visualization Agent here.

    A port for the same reason as `PublicationObserver`: the application may
    not import an adapter, and an operator's dashboard is a different
    obligation from the Tenant's own Replay record.
    """

    def __call__(
        self,
        *,
        role: str,
        agent_id: str,
        model: str | None,
        provider: str | None,
        fallback_count: int,
        input_tokens: int,
        output_tokens: int,
        cost_usd: str,
        duration_ms: int,
        status: str,
        error_category: str | None = None,
    ) -> None: ...
```

- [ ] **Step 2: Write the failing tests**

Create `libs/application/investigation/tests/test_visualization_service.py`. Build a minimal fake `InvestigationUnitOfWorkFactory`/unit-of-work exposing only what `execute_visualization_job`/`fail_visualization_job` call (`visualizations.get`, `.brief`, `.save`; `work_feed.append_for_investigation`; `outbox.enqueue`; `commit`), a fake `VisualizationRenderer` returning a fixed `RenderResult`, and construct `VisualizationService` with `agent_execution_observer=` a recording callable. Cover:

```python
@pytest.mark.asyncio
async def test_a_successful_render_reports_agent_execution_telemetry() -> None:
    ...
    await service.execute_visualization_job(
        tenant_id=TENANT_ID, visualization_id=VISUALIZATION_ID
    )

    assert observed == [
        {
            "role": "visualization",
            "agent_id": "data_visualization_v1",
            "model": "thesys-c1",
            "provider": "thesys",
            "fallback_count": 0,
            "input_tokens": 120,
            "output_tokens": 340,
            "cost_usd": "0.0021",
            "duration_ms": 950,
            "status": "success",
            "error_category": None,
        }
    ]


@pytest.mark.asyncio
async def test_a_failed_render_reports_the_failure_category_as_error_category() -> None:
    ...
    await service.fail_visualization_job(
        tenant_id=TENANT_ID,
        visualization_id=VISUALIZATION_ID,
        failure_category="renderer_timeout",
    )

    assert observed[-1]["status"] == "failure"
    assert observed[-1]["error_category"] == "renderer_timeout"


@pytest.mark.asyncio
async def test_no_observer_configured_is_a_silent_no_op() -> None:
    """The observer is optional — a deployment without one must not crash."""
    ...  # construct with agent_execution_observer=None (the default) and assert no error
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm nx test investigation -- -k test_visualization_service`
Expected: FAIL — `VisualizationService` does not yet accept or call `agent_execution_observer`.

- [ ] **Step 4: Wire the observer into `VisualizationService`**

In `libs/application/investigation/src/zentra_application_investigation/visualization_service.py`, import `AgentExecutionObserver` from `.ports` (add to the existing `from .ports import InvestigationUnitOfWorkFactory` line). Add to `__init__`:

```python
        agent_execution_observer: AgentExecutionObserver | None = None,
```

storing `self._agent_execution_observer = agent_execution_observer`. Add a private method, near `_event`:

```python
    def _observe_agent_execution(
        self,
        artifact: VisualizationArtifact,
        *,
        status: str,
        error_category: str | None,
    ) -> None:
        """Report the Data Visualization Agent's run, never its C1 response."""
        if self._agent_execution_observer is None:
            return
        self._agent_execution_observer(
            role="visualization",
            agent_id="data_visualization_v1",
            model=artifact.model,
            provider="thesys",
            fallback_count=0,
            input_tokens=artifact.usage.input_tokens,
            output_tokens=artifact.usage.output_tokens,
            cost_usd=str(artifact.usage.cost_usd),
            duration_ms=artifact.usage.latency_ms,
            status=status,
            error_category=error_category,
        )
```

Call it in `execute_visualization_job`, right after `await uow.visualizations.save(ready)`:

```python
            await uow.visualizations.save(ready)
            self._observe_agent_execution(ready, status="success", error_category=None)
```

And in `fail_visualization_job`, right after `await uow.visualizations.save(failed)`:

```python
            await uow.visualizations.save(failed)
            self._observe_agent_execution(
                failed, status="failure", error_category=failure_category
            )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test investigation -- -k test_visualization_service`
Expected: PASS

- [ ] **Step 6: Run the full `investigation` application suite and the import-linter check**

Run: `pnpm nx test investigation` and `pnpm nx lint langgraph` (or whichever target runs `lint-imports --config .importlinter` in this workspace — confirm via `pnpm nx show project investigation --json` if the target name differs)
Expected: PASS — no new forbidden import was introduced.

- [ ] **Step 7: Commit**

```bash
git add libs/application/investigation/src/zentra_application_investigation/ports.py \
        libs/application/investigation/src/zentra_application_investigation/visualization_service.py \
        libs/application/investigation/tests/test_visualization_service.py
git commit -m "feat(investigation): report Data Visualization Agent runs through a new AgentExecutionObserver port"
```

---

### Task 5: Wire the observer and Chat Session correlation at the `apps/api` edge

**Files:**
- Modify: `apps/api/src/zentra_api/dependencies.py`
- Modify: `apps/api/src/zentra_api/routes.py`

**Interfaces:**
- Consumes: `record_agent_execution` (Task 1), `AgentExecutionObserver` (Task 4), `correlate_thread` (Task 1).
- Produces: nothing further downstream — this is the outermost wiring layer.

- [ ] **Step 1: Wire `record_agent_execution` into `VisualizationService`**

In `apps/api/src/zentra_api/dependencies.py`, update the import:

```python
from zentra_adapter_telemetry import (
    record_agent_execution,
    record_evidence_deletion,
    record_publication_decision,
)
```

In the `VisualizationService(...)` construction, add:

```python
            agent_execution_observer=record_agent_execution,
```

- [ ] **Step 2: Correlate the Chat Session identifier where one is already resolved**

In `apps/api/src/zentra_api/routes.py`, update the import:

```python
from zentra_adapter_telemetry import (
    correlate_investigation,
    correlate_thread,
    record_citation_resolution,
)
```

In `execute_visualization_action`, after the `result = await ...execute_action(...)` call succeeds and before building the response, add:

```python
    if result.thread_id is not None:
        correlate_thread(result.thread_id)
```

This is the one call site in this codebase where a Chat Session identifier is already resolved without new plumbing (`VisualizationActionResult.thread_id`, set for a `continue_conversation` action). Extending correlation to every chat-turn-initiating endpoint (e.g. `create_investigation`) would require threading `thread_id` through `InvestigationDetail`/`AgentExecutionRecord`, which is domain-model surgery this telemetry-allowlist plan does not attempt — see "What this plan does not cover" below.

- [ ] **Step 3: Run the full `api` suite**

Run: `pnpm nx test api`
Expected: PASS — no existing test constructs `VisualizationService` or calls `execute_visualization_action` in a way this changes; both edits are additive at the wiring layer.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/zentra_api/dependencies.py apps/api/src/zentra_api/routes.py
git commit -m "feat(api): wire Data Visualization Agent telemetry and Chat Session correlation at the dependency edge"
```

---

## Self-Review

**Spec coverage:**
- ADR-0031's core decision (point the existing OTLP exporter at Langfuse Cloud's free tier, no richer path) — Task 2 (and the pre-existing, now-fixed `configure_telemetry`/`TelemetrySettings` wiring Task 2 repairs).
- "SAFE_ATTRIBUTES must be extended ... to also cover Intake Agent runs, Cube Analyst Agent runs, Data Visualization Agent runs, tool calls, and skill activations" — Task 1 (allowlist + recorders), Task 3 (Intake/Cube Analyst/tool calls/skill activations), Task 4 (Data Visualization Agent).
- "Any span carrying a `model` attribute is auto-classified by Langfuse as a Generation" — `record_agent_execution` always sets `zentra.agent.model` (even when `None`, since `_record()` only skips `None` values, never raises for one), matching `record_insight_execution`'s existing behaviour.
- "Langfuse Sessions map to Chat Sessions and Langfuse Traces map to Analysis Runs via identifiers already on the allowlist" — `zentra.investigation_id` (existing) and the new `zentra.thread_id`, added in Task 1 and wired in Task 5.
- No richer, second Langfuse channel — every new attribute goes through the same `_record()`/`SAFE_ATTRIBUTES` gate as the existing four recorders; nothing calls a Langfuse SDK.

**Placeholder scan:** No TBD/TODO/"add appropriate"/"similar to Task N" language. Every code block is real, runnable Python matching this codebase's existing style (frozen dataclasses/Pydantic models, `_record()`/`dimensions()` gates, docstrings that explain *why*).

**Type consistency:** `role`, `agent_id`, `model`, `provider`, `fallback_count`, `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms`, `status`, `error_category` are spelled identically across `record_agent_execution` (Task 1), `AgentExecutionObserver` (Task 4), and every call site (Tasks 3 and 4) — the whole point of the port being able to accept `record_agent_execution` directly as `agent_execution_observer=record_agent_execution` (Task 5) with no adapter shim, exactly like `publication_observer=record_publication_decision` already works.

---

## What this plan does not cover

- Evaluator Agent-run telemetry (`zentra.agent.*` for `AgentRole.EVALUATOR`) — not named in ADR-0031's consequence list. Evaluator's tool calls and skill activations are still recorded, since those two categories are unscoped by role.
- Chat Session correlation (`correlate_thread`) at every chat-turn-initiating endpoint — only wired at the one call site (`execute_visualization_action`) where a `thread_id` is already resolved without new plumbing. Wiring it into `create_investigation`/Intake would require adding `thread_id` to `InvestigationDetail` and/or `AgentExecutionRecord`, a domain-model change out of scope for a telemetry-allowlist plan.
- Deploying an actual Langfuse Cloud project or setting `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` in any environment's configuration — this plan proves the wiring works at the settings/unit level (Task 2) per the same guardrail the schema-cutover and application-API-cutover plans followed for their own infrastructure edges; standing up a real Langfuse account is an operational step, not a code change.
- Frontend consumption of the new telemetry (Activity Inspector, composer commands) — that is Plan 4 in this sequence, per ADR-0031's own "Consequences" section and this migration's `docs/adr/0031-...md`.
