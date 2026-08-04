"""Extended-thinking capture on the Anthropic client path.

Mirrors `test_tool_wire_format.py`'s approach: the SDK client is replaced by a
recorder that captures the outgoing request and returns a canned response, so
these tests pin the wire shape and the response parsing with no network call.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from zentra_domain_agent_execution import ModelMessage, ModelResponse

from zentra_adapter_model_providers.anthropic_client import (
    AnthropicModelClient,
    AnthropicModelResponse,
)


class RecordingAnthropic:
    def __init__(self, response: Any) -> None:
        self.request: dict[str, Any] = {}
        self._response = response
        self.messages = SimpleNamespace(create=self._create)

    async def _create(self, **kwargs: Any) -> Any:
        self.request = kwargs
        return self._response


def _anthropic_response(*content: Any) -> Any:
    return SimpleNamespace(
        stop_reason="end_turn",
        content=list(content),
        model="claude-opus-5",
        usage=SimpleNamespace(
            input_tokens=10,
            output_tokens=5,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        ),
    )


@pytest.mark.asyncio
async def test_thinking_defaults_to_off_and_sends_no_thinking_key() -> None:
    """The default keeps every existing call site's request byte-for-byte —
    no `thinking` key, same as before this capability existed."""
    client = RecordingAnthropic(
        _anthropic_response(SimpleNamespace(type="text", text="done"))
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    response = await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
    )

    assert "thinking" not in client.request
    assert response.reasoning is None  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_thinking_true_requests_adaptive_thinking_with_summarized_display() -> (
    None
):
    """Adaptive is the only supported mode on current Anthropic models —
    `budget_tokens` is deprecated. `display: "summarized"` is requested
    alongside it: the API default, "omitted", streams empty thinking text,
    and asking for reasoning without reading anything back would be pointless.
    """
    client = RecordingAnthropic(
        _anthropic_response(SimpleNamespace(type="text", text="done"))
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
        thinking=True,
    )

    assert client.request["thinking"] == {
        "type": "adaptive",
        "display": "summarized",
    }


@pytest.mark.asyncio
async def test_thinking_block_is_captured_separately_from_the_answer_text() -> None:
    """The chain-of-thought and the final answer must never be conflated —
    a caller reading `.text` alone should see only the answer."""
    client = RecordingAnthropic(
        _anthropic_response(
            SimpleNamespace(
                type="thinking",
                thinking="Refunds rose because of the promo in March.",
            ),
            SimpleNamespace(type="text", text="Refunds rose 12% in March."),
        )
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    response = await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
        thinking=True,
    )

    assert response.text == "Refunds rose 12% in March."
    assert response.reasoning == "Refunds rose because of the promo in March."  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_multiple_thinking_blocks_are_joined() -> None:
    client = RecordingAnthropic(
        _anthropic_response(
            SimpleNamespace(type="thinking", thinking="First, I checked X."),
            SimpleNamespace(type="thinking", thinking="Then I checked Y."),
            SimpleNamespace(type="text", text="done"),
        )
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    response = await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
        thinking=True,
    )

    assert response.reasoning == "First, I checked X.\n\nThen I checked Y."  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_empty_thinking_text_is_treated_as_absent() -> None:
    """The API's default `display: "omitted"` streams a `thinking` block
    whose text is an empty string. Even though this client always asks for
    `"summarized"`, an empty block should not surface as a non-None empty
    string a caller has to special-case."""
    client = RecordingAnthropic(
        _anthropic_response(
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text="done"),
        )
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    response = await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
        thinking=True,
    )

    assert response.reasoning is None  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_response_is_still_a_model_response_for_untouched_callers() -> None:
    """Every other caller of `ModelPort.complete()` reads a `ModelResponse`
    and must keep working unchanged — the reasoning field is additive."""
    client = RecordingAnthropic(
        _anthropic_response(SimpleNamespace(type="text", text="done"))
    )
    model = AnthropicModelClient(client)  # type: ignore[arg-type]

    response = await model.complete(
        model="claude-opus-5",
        system="s",
        messages=[ModelMessage(role="user", content="q")],
        max_tokens=1000,
    )

    assert isinstance(response, ModelResponse)
    assert isinstance(response, AnthropicModelResponse)
    assert response.text == "done"
