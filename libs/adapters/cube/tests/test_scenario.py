from __future__ import annotations

import pytest

from zentra_adapter_cube import EuRefundSpikeScenario


class StubCubeClient:
    def __init__(self) -> None:
        self.queries: list[dict[str, object]] = []

    async def load(self, query: dict[str, object]) -> dict[str, object]:
        self.queries.append(query)
        if "Commerce.refundReason" in query.get("dimensions", []):
            return {
                "data": [
                    {
                        "Commerce.refundReason": "shipping_delay",
                        "Commerce.refundAmount": "240.00",
                    }
                ]
            }
        return {
            "data": [
                {
                    "Commerce.orderedAt.month": "2026-06-01T00:00:00.000",
                    "Commerce.orderCount": "4",
                    "Commerce.refundAmount": "20.00",
                    "Commerce.refundRate": "25",
                },
                {
                    "Commerce.orderedAt.month": "2026-07-01T00:00:00.000",
                    "Commerce.orderCount": "4",
                    "Commerce.refundAmount": "260.00",
                    "Commerce.refundRate": "75",
                },
            ]
        }


@pytest.mark.asyncio
async def test_eu_refund_spike_is_deterministic_and_requires_review() -> None:
    client = StubCubeClient()

    result = await EuRefundSpikeScenario(client).run()  # type: ignore[arg-type]

    assert result.finding.headline == "EU refunds rose $240 in July"
    assert result.finding.evidence_refs[0].value.startswith("artifact://")
    assert [metric.metric for metric in result.finding.metrics] == [
        "order_count",
        "refund_amount",
        "refund_rate",
    ]
    assert result.validation.passed is False
    assert result.validation.issues == (
        "Only four governed orders are present in each month; tenant policy "
        "requires Human Approval.",
    )
    assert len(client.queries) == 2


@pytest.mark.asyncio
async def test_eu_refund_spike_rejects_changed_seed_totals() -> None:
    client = StubCubeClient()

    async def changed_load(query: dict[str, object]) -> dict[str, object]:
        result = await StubCubeClient().load(query)
        if "data" in result and "dimensions" not in query:
            result["data"][1]["Commerce.refundAmount"] = "250.00"  # type: ignore[index]
        return result

    client.load = changed_load  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="governed seed"):
        await EuRefundSpikeScenario(client).run()  # type: ignore[arg-type]
