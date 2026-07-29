from __future__ import annotations

from typing import Any, Protocol

from zentra_application_investigation import ScenarioResult
from zentra_domain_investigation import (
    EvidenceReference,
    Finding,
    InvestigationValidation,
    MetricComparison,
)


class CubeLoader(Protocol):
    async def load(self, query: dict[str, Any]) -> dict[str, Any]: ...


class EuRefundSpikeScenario:
    """Runs the single governed Phase 1A scenario against Cube."""

    def __init__(self, client: CubeLoader) -> None:
        self._client = client

    async def run(self) -> ScenarioResult:
        monthly = await self._client.load(
            {
                "measures": [
                    "Commerce.orderCount",
                    "Commerce.refundAmount",
                    "Commerce.refundRate",
                ],
                "timeDimensions": [
                    {
                        "dimension": "Commerce.orderedAt",
                        "granularity": "month",
                        "dateRange": ["2026-06-01", "2026-07-31"],
                    }
                ],
                "filters": [
                    {
                        "member": "Commerce.region",
                        "operator": "equals",
                        "values": ["EU"],
                    }
                ],
            }
        )
        reasons = await self._client.load(
            {
                "measures": ["Commerce.refundAmount"],
                "dimensions": ["Commerce.refundReason"],
                "timeDimensions": [
                    {
                        "dimension": "Commerce.orderedAt",
                        "dateRange": ["2026-07-01", "2026-07-31"],
                    }
                ],
                "filters": [
                    {
                        "member": "Commerce.region",
                        "operator": "equals",
                        "values": ["EU"],
                    }
                ],
            }
        )

        by_month = {
            row["Commerce.orderedAt.month"][:7]: row for row in monthly.get("data", [])
        }
        june = by_month.get("2026-06")
        july = by_month.get("2026-07")
        shipping_delay = next(
            (
                row
                for row in reasons.get("data", [])
                if row.get("Commerce.refundReason") == "shipping_delay"
            ),
            None,
        )
        expected = (
            june
            and july
            and june.get("Commerce.orderCount") == "4"
            and june.get("Commerce.refundAmount") == "20.00"
            and float(june.get("Commerce.refundRate", -1)) == 25
            and july.get("Commerce.orderCount") == "4"
            and july.get("Commerce.refundAmount") == "260.00"
            and float(july.get("Commerce.refundRate", -1)) == 75
            and shipping_delay is not None
        )
        if not expected:
            raise RuntimeError("Cube results do not match the governed seed")

        return ScenarioResult(
            finding=Finding(
                headline="EU refunds rose $240 in July",
                summary=(
                    "Governed EU refund amount increased from $20 in June to "
                    "$260 in July while order volume remained flat at four. "
                    "The July increase is associated with shipping-delay refunds."
                ),
                metrics=(
                    MetricComparison("order_count", "4", "4", "orders"),
                    MetricComparison("refund_amount", "20.00", "260.00", "USD"),
                    MetricComparison("refund_rate", "25", "75", "percent"),
                ),
                evidence_refs=(
                    EvidenceReference(
                        "artifact://semantic/eu-refund-spike/2026-06_2026-07"
                    ),
                ),
            ),
            validation=InvestigationValidation(
                passed=False,
                checks=(
                    "Governed monthly metrics match the deterministic seed.",
                    "July shipping-delay refunds are present.",
                    "Order volume is unchanged month over month.",
                ),
                issues=(
                    "Only four governed orders are present in each month; "
                    "tenant policy requires Human Approval.",
                ),
            ),
        )
