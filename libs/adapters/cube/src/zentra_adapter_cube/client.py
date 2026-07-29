from __future__ import annotations

from typing import Any

import httpx


class CubeClient:
    def __init__(self, base_url: str, api_secret: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_secret = api_secret

    def _headers(self) -> dict[str, str]:
        if not self._api_secret:
            return {}
        return {"Authorization": self._api_secret}

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{self._base_url}/readyz")
            return response.is_success
        except httpx.HTTPError:
            return False

    async def meta(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{self._base_url}/cubejs-api/v1/meta",
                headers=self._headers(),
            )
        response.raise_for_status()
        return response.json()

    async def load(self, query: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self._base_url}/cubejs-api/v1/load",
                headers=self._headers(),
                json={"query": query},
            )
        response.raise_for_status()
        return response.json()
