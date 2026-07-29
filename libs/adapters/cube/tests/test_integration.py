from __future__ import annotations

import os

import pytest

from zentra_adapter_cube import CubeClient

CUBE_URL = os.getenv("TEST_CUBE_URL")

pytestmark = pytest.mark.skipif(
    not CUBE_URL,
    reason="local Cube integration service is not configured",
)


@pytest.mark.asyncio
async def test_all_governed_metrics_and_eu_refund_spike() -> None:
    assert CUBE_URL is not None
    client = CubeClient(CUBE_URL, "local-cube-secret")
    result = await client.load(
        {
            "measures": [
                "Commerce.grossRevenue",
                "Commerce.netRevenue",
                "Commerce.orderCount",
                "Commerce.averageOrderValue",
                "Commerce.refundAmount",
                "Commerce.refundRate",
                "Commerce.activeCustomers",
                "Commerce.repeatPurchaseRate",
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

    rows = {row["Commerce.orderedAt.month"][:7]: row for row in result["data"]}
    assert rows["2026-06"]["Commerce.orderCount"] == "4"
    assert rows["2026-06"]["Commerce.refundAmount"] == "20.00"
    assert float(rows["2026-06"]["Commerce.refundRate"]) == 25
    assert rows["2026-07"]["Commerce.orderCount"] == "4"
    assert rows["2026-07"]["Commerce.refundAmount"] == "260.00"
    assert float(rows["2026-07"]["Commerce.refundRate"]) == 75
