"""Tenant-scoped settings read and analytical-policy update routes."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from zentra_adapter_postgres.database import set_organization_context
from zentra_adapter_postgres.schema import organization_memberships, organizations, users
from zentra_application_analysis_run import Role

from .request_context import RequestContext, authenticated_context

router = APIRouter(prefix='/v1/settings', tags=['settings'])
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]


class AccountSettingsResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    user_id: UUID
    email: str
    display_name: str | None
    created_at: datetime


class MembershipSettingsResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: str
    joined_at: datetime


class OrganizationSettingsResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    name: str
    created_at: datetime
    data_residency_zone: str
    model_tier: str
    confidence_threshold: Decimal
    cost_ceiling_usd: Decimal


class SettingsResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    account: AccountSettingsResponse
    membership: MembershipSettingsResponse
    organization: OrganizationSettingsResponse
    capabilities: dict[str, bool]


class UpdateOrganizationPolicyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    confidence_threshold: Decimal | None = Field(default=None, ge=0, le=1)
    cost_ceiling_usd: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode='after')
    def has_change(self) -> UpdateOrganizationPolicyRequest:
        if self.confidence_threshold is None and self.cost_ceiling_usd is None:
            raise ValueError('At least one organization policy value is required')
        return self


async def _snapshot(request: Request, context: RequestContext) -> SettingsResponse:
    async with request.app.state.dependencies.database.engine.begin() as connection:
        await set_organization_context(connection, context.identity.organization_id)
        row = (
            await connection.execute(
                select(
                    users.c.user_id,
                    users.c.email,
                    users.c.display_name,
                    users.c.created_at.label('user_created_at'),
                    organization_memberships.c.role,
                    organization_memberships.c.created_at.label('membership_created_at'),
                    organizations.c.organization_id,
                    organizations.c.name,
                    organizations.c.created_at.label('organization_created_at'),
                    organizations.c.data_residency_zone,
                    organizations.c.model_tier,
                    organizations.c.confidence_threshold,
                    organizations.c.cost_ceiling_usd,
                )
                .join(organization_memberships, organization_memberships.c.user_id == users.c.user_id)
                .join(organizations, organizations.c.organization_id == organization_memberships.c.organization_id)
                .where(
                    users.c.user_id == context.identity.user_id,
                    organization_memberships.c.organization_id == context.identity.organization_id,
                )
            )
        ).one()

    return SettingsResponse(
        account=AccountSettingsResponse(
            user_id=row.user_id,
            email=row.email,
            display_name=row.display_name,
            created_at=row.user_created_at,
        ),
        membership=MembershipSettingsResponse(role=row.role, joined_at=row.membership_created_at),
        organization=OrganizationSettingsResponse(
            organization_id=row.organization_id,
            name=row.name,
            created_at=row.organization_created_at,
            data_residency_zone=row.data_residency_zone,
            model_tier=row.model_tier,
            confidence_threshold=row.confidence_threshold,
            cost_ceiling_usd=row.cost_ceiling_usd,
        ),
        capabilities={'can_manage_organization': context.actor.role is Role.OWNER},
    )


@router.get('', response_model=SettingsResponse)
async def get_settings(request: Request, context: AuthenticatedRequest) -> SettingsResponse:
    return await _snapshot(request, context)


@router.patch('/organization', response_model=SettingsResponse)
async def update_organization_policy(
    payload: UpdateOrganizationPolicyRequest,
    request: Request,
    context: AuthenticatedRequest,
) -> SettingsResponse:
    if context.actor.role is not Role.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Only organization owners can change analytical policy',
        )
    changes = payload.model_dump(exclude_none=True)
    async with request.app.state.dependencies.database.engine.begin() as connection:
        await set_organization_context(connection, context.identity.organization_id)
        await connection.execute(
            update(organizations)
            .where(organizations.c.organization_id == context.identity.organization_id)
            .values(**changes)
        )
    return await _snapshot(request, context)
