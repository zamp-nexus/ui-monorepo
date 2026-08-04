from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from decimal import Decimal
from hashlib import sha256
from pathlib import Path

from pydantic.types import JsonValue
from zentra_domain_agent_execution import (
    ExecutionUsage,
    ModelMessage,
    ModelPort,
    ModelResponse,
    ModelStreamDelta,
    ModelStreamEnd,
    ModelStreamEvent,
    ToolDefinition,
)


class UnrecordedRequestError(RuntimeError):
    """Replay was asked for a request the cassette does not hold.

    Raised rather than falling back to the network, so a test can never
    silently start costing money.
    """


def _key(
    *,
    model: str,
    system: str,
    messages: Sequence[ModelMessage],
    response_schema: dict[str, JsonValue] | None,
    tools: Sequence[ToolDefinition] = (),
) -> str:
    """Content hash of everything that determines the answer.

    Deliberately excludes max_tokens: the routed chain lowers it per rung, and a
    recording should survive that being retuned.

    Tool definitions are included, and omitted from the payload entirely when
    there are none, so that adding tool support did not silently invalidate
    every recording made before it existed.
    """
    payload = json.dumps(
        {
            "model": model,
            "system": system,
            "messages": [message.model_dump() for message in messages],
            "schema": response_schema,
            **({"tools": [tool.model_dump() for tool in tools]} if tools else {}),
        },
        sort_keys=True,
    )
    return sha256(payload.encode()).hexdigest()[:16]


class RecordingModelClient:
    """Passes calls through to a real client and writes down what came back.

    One paid run becomes a permanent fixture: the recordings hold model output
    over the synthetic seed dataset, so they carry no secrets and belong in the
    repository.
    """

    def __init__(self, inner: ModelPort, directory: Path) -> None:
        self._inner = inner
        self._directory = directory
        self._directory.mkdir(parents=True, exist_ok=True)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        response_schema: dict[str, JsonValue] | None = None,
        tools: Sequence[ToolDefinition] = (),
        temperature: float = 0.2,
    ) -> ModelResponse:
        response = await self._inner.complete(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            response_schema=response_schema,
            tools=tools,
            temperature=temperature,
        )
        key = _key(
            model=model,
            system=system,
            messages=messages,
            response_schema=response_schema,
            tools=tools,
        )
        (self._directory / f"{key}.json").write_text(
            json.dumps(
                {
                    "requested_model": model,
                    "text": response.text,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens,
                        "cost_usd": str(response.usage.cost_usd),
                        "model": response.usage.model,
                    },
                    "fallbacks": list(response.fallbacks),
                },
                indent=2,
            )
            + "\n"
        )
        return response

    async def stream(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        temperature: float = 0.2,
    ) -> AsyncIterator[ModelStreamEvent]:
        """Passes the stream through and records it as one recorded reply.

        Recorded the same way a non-streaming call is: the cassette holds the
        final text and usage, not the individual chunk boundaries — replay
        reproduces the same reply, delivered as a single chunk, which is
        sufficient for a test asserting on final content.
        """
        text_parts: list[str] = []
        end: ModelStreamEnd | None = None
        async for event in self._inner.stream(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            if isinstance(event, ModelStreamDelta):
                text_parts.append(event.text)
            else:
                end = event
            yield event
        assert end is not None
        key = _key(
            model=model, system=system, messages=messages, response_schema=None
        )
        (self._directory / f"{key}.json").write_text(
            json.dumps(
                {
                    "requested_model": model,
                    "text": "".join(text_parts),
                    "usage": {
                        "input_tokens": end.usage.input_tokens,
                        "output_tokens": end.usage.output_tokens,
                        "cost_usd": str(end.usage.cost_usd),
                        "model": end.usage.model,
                    },
                    "fallbacks": list(end.fallbacks),
                },
                indent=2,
            )
            + "\n"
        )


class ReplayModelClient:
    """Serves recorded responses. Never touches the network."""

    def __init__(self, directory: Path) -> None:
        self._directory = directory

    @property
    def recorded(self) -> int:
        return len(list(self._directory.glob("*.json")))

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        response_schema: dict[str, JsonValue] | None = None,
        tools: Sequence[ToolDefinition] = (),
        temperature: float = 0.2,
    ) -> ModelResponse:
        key = _key(
            model=model,
            system=system,
            messages=messages,
            response_schema=response_schema,
            tools=tools,
        )
        path = self._directory / f"{key}.json"
        if not path.exists():
            raise UnrecordedRequestError(
                f"No recording for {model} at {path.name}. Re-record with "
                f"--record, or check whether a prompt changed."
            )
        recorded = json.loads(path.read_text())
        usage = recorded["usage"]
        return ModelResponse(
            text=recorded["text"],
            usage=ExecutionUsage(
                input_tokens=usage["input_tokens"],
                output_tokens=usage["output_tokens"],
                # Zero, always. No provider was called, so nothing was spent —
                # and the pipeline writes this straight into agent_executions,
                # which is what cost governance reads. Replaying the premium
                # cassette a few times while verifying a change had already
                # booked several times its real cost as if it were spend. The
                # cassette keeps the recorded figure; the ledger must not.
                cost_usd=Decimal("0"),
                model=usage["model"],
            ),
            fallbacks=tuple(recorded.get("fallbacks", ())),
        )

    async def stream(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        temperature: float = 0.2,
    ) -> AsyncIterator[ModelStreamEvent]:
        """Replays the recorded reply as a single chunk, then the terminal event."""
        key = _key(
            model=model, system=system, messages=messages, response_schema=None
        )
        path = self._directory / f"{key}.json"
        if not path.exists():
            raise UnrecordedRequestError(
                f"No recording for {model} at {path.name}. Re-record with "
                f"--record, or check whether a prompt changed."
            )
        recorded = json.loads(path.read_text())
        usage = recorded["usage"]
        if recorded["text"]:
            yield ModelStreamDelta(text=recorded["text"])
        yield ModelStreamEnd(
            usage=ExecutionUsage(
                input_tokens=usage["input_tokens"],
                output_tokens=usage["output_tokens"],
                cost_usd=Decimal("0"),
                model=usage["model"],
            ),
            fallbacks=tuple(recorded.get("fallbacks", ())),
        )

    @staticmethod
    def recorded_cost(path: Path) -> Decimal:
        """What the original call cost, for reporting on the recording itself."""
        return Decimal(json.loads(path.read_text())["usage"]["cost_usd"])
