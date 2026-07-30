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


@pytest.mark.asyncio
async def test_na_channel_growth_is_unambiguous_in_the_governed_layer() -> None:
    """The scenario that reaches the publish path.

    Web revenue is identical across both months, so the entire increase is
    partner. A model reporting high confidence on 'which channel accounted for
    it' is correct rather than overconfident — which is the only honest way to
    exercise a path where nothing gates.
    """
    assert CUBE_URL is not None
    client = CubeClient(CUBE_URL, "local-cube-secret")
    result = await client.load(
        {
            "measures": ["Commerce.orderCount", "Commerce.grossRevenue"],
            "dimensions": ["Commerce.channel"],
            "timeDimensions": [
                {
                    "dimension": "Commerce.orderedAt",
                    "granularity": "month",
                    "dateRange": ["2026-10-01", "2026-11-30"],
                }
            ],
            "filters": [
                {
                    "member": "Commerce.region",
                    "operator": "equals",
                    "values": ["NA"],
                }
            ],
        }
    )

    rows = {
        (row["Commerce.orderedAt.month"][:7], row["Commerce.channel"]): row
        for row in result["data"]
    }
    assert rows[("2026-10", "web")]["Commerce.grossRevenue"] == "10000.00"
    assert rows[("2026-11", "web")]["Commerce.grossRevenue"] == "10000.00"
    assert rows[("2026-10", "partner")]["Commerce.grossRevenue"] == "3000.00"
    assert rows[("2026-11", "partner")]["Commerce.grossRevenue"] == "12000.00"
    assert rows[("2026-11", "partner")]["Commerce.orderCount"] == "80"

    # Past the >= 100 band, so the sample ceiling cannot cap a confident answer.
    total_orders = sum(int(row["Commerce.orderCount"]) for row in result["data"])
    assert total_orders == 300
