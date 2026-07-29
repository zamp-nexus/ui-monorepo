from __future__ import annotations

from collections.abc import Sequence

from anthropic import AsyncAnthropic
from pydantic.types import JsonValue
from zentra_domain_agent_execution import (
    ExecutionUsage,
    ModelMessage,
    ModelResponse,
)

from .constants import token_cost_usd


class AnthropicModelClient:
    """ModelPort over the Anthropic Messages API.

    System prompts are sent as a cacheable block: they are stable across every
    investigation, so the governed catalog and role instructions are written
    once and read at ~0.1x on every subsequent agent call.
    """

    def __init__(self, client: AsyncAnthropic) -> None:
        self._client = client

    @classmethod
    def from_api_key(cls, api_key: str) -> AnthropicModelClient:
        return cls(AsyncAnthropic(api_key=api_key))

    async def close(self) -> None:
        await self._client.close()

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        response_schema: dict[str, JsonValue] | None = None,
    ) -> ModelResponse:
        request: dict[str, object] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": [
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [message.model_dump() for message in messages],
        }
        if response_schema is not None:
            request["output_config"] = {
                "format": {"type": "json_schema", "schema": response_schema}
            }

        response = await self._client.messages.create(**request)  # type: ignore[arg-type]

        text = next(
            (block.text for block in response.content if block.type == "text"),
            "",
        )
        usage = response.usage
        cache_read = usage.cache_read_input_tokens or 0
        cache_write = usage.cache_creation_input_tokens or 0
        return ModelResponse(
            text=text,
            usage=ExecutionUsage(
                input_tokens=usage.input_tokens + cache_read + cache_write,
                output_tokens=usage.output_tokens,
                cost_usd=token_cost_usd(
                    model,
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    cache_read_tokens=cache_read,
                    cache_write_tokens=cache_write,
                ),
                model=response.model,
            ),
        )
