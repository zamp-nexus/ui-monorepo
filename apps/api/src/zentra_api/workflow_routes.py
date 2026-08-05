"""Persisted Workflow Studio API and guarded published Workflow execution."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, insert, select, update
from sqlalchemy.engine import RowMapping
from zentra_adapter_postgres.schema import (
    workflow_definitions,
    workflow_executions,
    workflow_versions,
)
from zentra_application_analysis_run import Role

from .active_connection import active_data_connection_id
from .agent_data_discovery import ConnectorDataDiscovery
from .request_context import RequestContext, authenticated_context
from .workflow_execution_service import WorkflowExecutionService
from .workflow_schemas import (
    DEFAULT_WORKFLOW_DEFINITION,
    DEFAULT_WORKFLOW_ID,
    WORKFLOW_TOOL_CATALOG,
    CloneDefaultRequest,
    CreateWorkflowRequest,
    WorkflowDetailResponse,
    WorkflowDocumentRequest,
    WorkflowExecuteRequest,
    WorkflowExecutionResponse,
    WorkflowSummaryResponse,
    NEW_WORKFLOW_DEFINITION,
    WorkflowRoutingProfile,
)

router = APIRouter(prefix="/v1/workflows", tags=["workflow"])
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]
MANAGER_ROLES = frozenset({Role.OWNER, Role.ADMIN})


def _default_detail() -> WorkflowDetailResponse:
    return WorkflowDetailResponse(
        workflow_id=DEFAULT_WORKFLOW_ID,
        name="Analytics trust loop",
        is_system=True,
        published_version=1,
        updated_at=None,
        definition=DEFAULT_WORKFLOW_DEFINITION,
        versions=[1],
        routing_profile=WorkflowRoutingProfile(),
    )


def _require_manager(context: RequestContext) -> None:
    if context.actor.role not in MANAGER_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This membership cannot manage Workflows"
        )


def _uses_raw_query(definition: dict[str, Any]) -> bool:
    return any(
        isinstance(node, dict)
        and isinstance(node.get("data"), dict)
        and "raw_query" in node["data"].get("tools", [])
        for node in definition.get("nodes", [])
    )


def _require_raw_query_admin(
    context: RequestContext, definition: dict[str, Any]
) -> None:
    if _uses_raw_query(definition) and context.actor.role is not Role.ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only an Admin may grant raw_query to a Workflow agent",
        )


def _document_error(definition: dict[str, Any]) -> str | None:
    nodes = definition.get("nodes")
    edges = definition.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return "A Workflow needs nodes and edges"
    node_ids = [item.get("id") for item in nodes if isinstance(item, dict)]
    if len(node_ids) != len(nodes) or any(
        not isinstance(item, str) or not item for item in node_ids
    ):
        return "Every Workflow node needs an id"
    if len(set(node_ids)) != len(node_ids):
        return "Workflow node ids must be unique"
    trigger_ids = [
        item["id"]
        for item in nodes
        if isinstance(item, dict) and item.get("type") == "trigger"
    ]
    result_ids = {
        item["id"]
        for item in nodes
        if isinstance(item, dict) and item.get("type") == "result"
    }
    if not trigger_ids:
        return "A Workflow needs a trigger node"
    if not result_ids:
        return "A Workflow needs a result node"
    controllers = [
        item
        for item in nodes
        if isinstance(item, dict)
        and isinstance(item.get("data"), dict)
        and item["data"].get("controller")
    ]
    if len(controllers) != 1:
        return "A Workflow needs exactly one controller"
    for node in nodes:
        if not isinstance(node, dict) or node.get("type") != "agent":
            continue
        data = node.get("data")
        tools = data.get("tools", []) if isinstance(data, dict) else []
        if not isinstance(tools, list) or any(
            tool not in WORKFLOW_TOOL_CATALOG for tool in tools
        ):
            return "Workflow agents may use only registered tools"
    for edge in edges:
        if (
            not isinstance(edge, dict)
            or edge.get("source") not in node_ids
            or edge.get("target") not in node_ids
        ):
            return "Every Workflow edge must connect existing nodes"
        data = edge.get("data", {})
        if (
            isinstance(data, dict)
            and data.get("is_loop")
            and (
                not isinstance(data.get("max_iterations"), int)
                or data["max_iterations"] < 1
            )
        ):
            return "A loop edge needs a positive max_iterations value"
    reachable = set(trigger_ids)
    changed = True
    while changed:
        changed = False
        for edge in edges:
            if edge["source"] in reachable and edge["target"] not in reachable:
                reachable.add(edge["target"])
                changed = True
    if not reachable & result_ids:
        return "A Workflow needs a terminal path from its trigger"
    by_source: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        by_source.setdefault(edge["source"], []).append(edge)
    for node in nodes:
        if (
            node.get("type") == "agent"
            and len(by_source.get(node["id"], [])) > 1
            and not node.get("data", {}).get("controller")
        ):
            return "Only the controller may choose between Workflow routes"

    def has_unbounded_cycle(
        node_id: str, path_nodes: list[str], path_edges: list[dict[str, Any]]
    ) -> bool:
        if node_id in path_nodes:
            return False
        path_nodes.append(node_id)
        for edge in by_source.get(node_id, []):
            target = edge["target"]
            if target in path_nodes:
                start = path_nodes.index(target)
                cycle = path_edges[start:] + [edge]
                if not any(
                    isinstance(candidate.get("data"), dict)
                    and candidate["data"].get("is_loop")
                    for candidate in cycle
                ):
                    return True
            elif has_unbounded_cycle(target, path_nodes, path_edges + [edge]):
                return True
        path_nodes.pop()
        return False

    if any(has_unbounded_cycle(node_id, [], []) for node_id in node_ids):
        return "Every Workflow cycle needs bounded loop metadata"
    return None


def _routing_profile_error(profile: WorkflowRoutingProfile) -> str | None:
    if not profile.auto_select_enabled:
        return None
    if not profile.purpose.strip():
        return "An Auto-enabled Workflow needs a routing purpose"
    if not profile.tags:
        return "An Auto-enabled Workflow needs at least one routing tag"
    if not profile.example_requests:
        return "An Auto-enabled Workflow needs an example request"
    return None


def _profile(value: object) -> WorkflowRoutingProfile:
    return WorkflowRoutingProfile.model_validate(value or {})


def _detail(value: RowMapping, versions: list[int]) -> WorkflowDetailResponse:
    return WorkflowDetailResponse(
        workflow_id=str(value["workflow_id"]),
        name=value["name"],
        is_system=False,
        published_version=max(versions) if versions else None,
        updated_at=value["updated_at"],
        definition=value["draft_definition"],
        versions=versions,
        routing_profile=_profile(value.get("routing_profile")),
    )


@router.get("", response_model=list[WorkflowSummaryResponse])
async def list_workflows(
    request: Request, context: AuthenticatedRequest
) -> list[WorkflowSummaryResponse]:
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        rows = (
            await connection.execute(
                select(workflow_definitions).order_by(
                    workflow_definitions.c.updated_at.desc()
                )
            )
        ).all()
        published = (
            await connection.execute(
                select(
                    workflow_versions.c.workflow_id,
                    func.max(workflow_versions.c.version).label("version"),
                ).group_by(workflow_versions.c.workflow_id)
            )
        ).all()
    versions = {row.workflow_id: row.version for row in published}
    return [
        WorkflowSummaryResponse(
            workflow_id=DEFAULT_WORKFLOW_ID,
            name="Analytics trust loop",
            is_system=True,
            published_version=1,
            updated_at=None,
            routing_profile=WorkflowRoutingProfile(),
        ),
        *[
            WorkflowSummaryResponse(
                workflow_id=str(row.workflow_id),
                name=row.name,
                is_system=False,
                published_version=versions.get(row.workflow_id),
                updated_at=row.updated_at,
                routing_profile=_profile(row.routing_profile),
            )
            for row in rows
        ],
    ]


@router.get("/{workflow_id}", response_model=WorkflowDetailResponse)
async def get_workflow(
    workflow_id: str, request: Request, context: AuthenticatedRequest
) -> WorkflowDetailResponse:
    if workflow_id == DEFAULT_WORKFLOW_ID:
        return _default_detail()
    try:
        parsed = UUID(workflow_id)
    except ValueError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found") from error
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        row = (
            await connection.execute(
                select(workflow_definitions).where(
                    workflow_definitions.c.workflow_id == parsed
                )
            )
        ).first()
        versions = (
            (
                await connection.execute(
                    select(workflow_versions.c.version)
                    .where(workflow_versions.c.workflow_id == parsed)
                    .order_by(workflow_versions.c.version)
                )
            )
            .scalars()
            .all()
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    return _detail(row._mapping, list(versions))


@router.post(
    "/clone-default",
    response_model=WorkflowDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_default(
    body: CloneDefaultRequest, request: Request, context: AuthenticatedRequest
) -> WorkflowDetailResponse:
    _require_manager(context)
    definition = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    workflow_id = uuid4()
    now = datetime.now(UTC)
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        await connection.execute(
            insert(workflow_definitions).values(
                workflow_id=workflow_id,
                organization_id=context.actor.organization_id,
                name=body.name.strip(),
                draft_definition=definition,
                routing_profile=WorkflowRoutingProfile().model_dump(),
                created_at=now,
                updated_at=now,
            )
        )
        row = (
            await connection.execute(
                select(workflow_definitions).where(
                    workflow_definitions.c.workflow_id == workflow_id
                )
            )
        ).one()
    return _detail(row._mapping, [])


@router.post("", response_model=WorkflowDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    body: CreateWorkflowRequest, request: Request, context: AuthenticatedRequest
) -> WorkflowDetailResponse:
    """Create a valid minimal draft; Workflow authors never start from an executable void."""
    _require_manager(context)
    workflow_id = uuid4()
    now = datetime.now(UTC)
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        await connection.execute(
            insert(workflow_definitions).values(
                workflow_id=workflow_id,
                organization_id=context.actor.organization_id,
                name=body.name.strip(),
                draft_definition=deepcopy(NEW_WORKFLOW_DEFINITION),
                routing_profile=WorkflowRoutingProfile().model_dump(),
                created_at=now,
                updated_at=now,
            )
        )
        row = (
            await connection.execute(
                select(workflow_definitions).where(
                    workflow_definitions.c.workflow_id == workflow_id
                )
            )
        ).one()
    return _detail(row._mapping, [])


@router.put("/{workflow_id}", response_model=WorkflowDetailResponse)
async def save_workflow(
    workflow_id: UUID,
    body: WorkflowDocumentRequest,
    request: Request,
    context: AuthenticatedRequest,
) -> WorkflowDetailResponse:
    _require_manager(context)
    _require_raw_query_admin(context, body.definition)
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        result = await connection.execute(
            update(workflow_definitions)
            .where(workflow_definitions.c.workflow_id == workflow_id)
            .values(
                name=body.name.strip(),
                draft_definition=body.definition,
                routing_profile=body.routing_profile.model_dump(),
                updated_at=datetime.now(UTC),
            )
            .returning(workflow_definitions)
        )
        row = result.first()
        versions = (
            (
                await connection.execute(
                    select(workflow_versions.c.version).where(
                        workflow_versions.c.workflow_id == workflow_id
                    )
                )
            )
            .scalars()
            .all()
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    return _detail(row._mapping, list(versions))


@router.post("/{workflow_id}/publish", response_model=WorkflowDetailResponse)
async def publish_workflow(
    workflow_id: UUID, request: Request, context: AuthenticatedRequest
) -> WorkflowDetailResponse:
    _require_manager(context)
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        row = (
            await connection.execute(
                select(workflow_definitions).where(
                    workflow_definitions.c.workflow_id == workflow_id
                )
            )
        ).first()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        _require_raw_query_admin(context, row.draft_definition)
        reason = _document_error(row.draft_definition)
        reason = reason or _routing_profile_error(_profile(row.routing_profile))
        if reason:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, reason)
        version = (
            await connection.execute(
                select(func.coalesce(func.max(workflow_versions.c.version), 0)).where(
                    workflow_versions.c.workflow_id == workflow_id
                )
            )
        ).scalar_one() + 1
        await connection.execute(
            insert(workflow_versions).values(
                workflow_version_id=uuid4(),
                workflow_id=workflow_id,
                organization_id=context.actor.organization_id,
                version=version,
                definition=row.draft_definition,
                routing_profile=row.routing_profile,
                published_by_user_id=context.actor.user_id,
            )
        )
        versions = (
            (
                await connection.execute(
                    select(workflow_versions.c.version)
                    .where(workflow_versions.c.workflow_id == workflow_id)
                    .order_by(workflow_versions.c.version)
                )
            )
            .scalars()
            .all()
        )
    return _detail(row._mapping, list(versions))


@router.post("/{workflow_id}/execute", response_model=WorkflowExecutionResponse)
async def execute_workflow(
    workflow_id: UUID,
    body: WorkflowExecuteRequest,
    request: Request,
    context: AuthenticatedRequest,
) -> WorkflowExecutionResponse:
    """Run an immutable published custom Workflow and retain a safe trace."""
    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        definition_row = (
            await connection.execute(
                select(workflow_definitions).where(
                    workflow_definitions.c.workflow_id == workflow_id
                )
            )
        ).first()
        version_query = select(workflow_versions).where(
            workflow_versions.c.workflow_id == workflow_id
        )
        if body.workflow_version is not None:
            version_query = version_query.where(
                workflow_versions.c.version == body.workflow_version
            )
        else:
            version_query = version_query.order_by(
                workflow_versions.c.version.desc()
            ).limit(1)
        version_row = (await connection.execute(version_query)).first()
        if definition_row is None or version_row is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Published Workflow not found"
            )
        execution_id = uuid4()
        await connection.execute(
            insert(workflow_executions).values(
                workflow_execution_id=execution_id,
                organization_id=context.actor.organization_id,
                workflow_id=workflow_id,
                workflow_version=version_row.version,
                workflow_name=definition_row.name,
                status="running",
            )
        )

    service = WorkflowExecutionService(
        models=request.app.state.dependencies.models.as_dict(),
        semantic_layers=request.app.state.dependencies.semantic_layers,
        discovery_factory=lambda: ConnectorDataDiscovery(
            lambda: request.app.state.dependencies.connector
        ),
    )
    try:
        data_connection_id = await active_data_connection_id(
            request.app.state.dependencies.connector, context.actor
        )
        result = await service.run(
            version_row.definition,
            organization_id=context.actor.organization_id,
            data_connection_id=data_connection_id,
            message=body.message,
        )
    except (ValueError, RuntimeError) as error:
        async with request.app.state.dependencies.database.organization_connection(
            context.actor.organization_id
        ) as connection:
            await connection.execute(
                update(workflow_executions)
                .where(workflow_executions.c.workflow_execution_id == execution_id)
                .values(
                    status="failed", error=str(error), finished_at=datetime.now(UTC)
                )
            )
        return WorkflowExecutionResponse(
            execution_id=str(execution_id),
            workflow_id=str(workflow_id),
            workflow_name=definition_row.name,
            workflow_version=version_row.version,
            status="failed",
            error=str(error),
        )

    async with request.app.state.dependencies.database.organization_connection(
        context.actor.organization_id
    ) as connection:
        await connection.execute(
            update(workflow_executions)
            .where(workflow_executions.c.workflow_execution_id == execution_id)
            .values(
                status="completed",
                nodes=list(result.nodes),
                routes=list(result.routes),
                output=result.output,
                finished_at=datetime.now(UTC),
            )
        )
    return WorkflowExecutionResponse(
        execution_id=str(execution_id),
        workflow_id=str(workflow_id),
        workflow_name=definition_row.name,
        workflow_version=version_row.version,
        status="completed",
        output=result.output,
        nodes=list(result.nodes),
        routes=list(result.routes),
        selection_mode="manual",
    )
