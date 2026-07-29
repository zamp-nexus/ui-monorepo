from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


class Provider(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GEMINI = "gemini"
    GROQ = "groq"
    CEREBRAS = "cerebras"
    OPENROUTER = "openrouter"


class ModelTier(StrEnum):
    FREE = "free"
    PREMIUM = "premium"


@dataclass(frozen=True, slots=True)
class ProviderConfig:
    """How to reach a provider, and whether it may see paid-tier traffic."""

    provider: Provider
    env_key: str
    base_url: str | None
    trains_on_input: bool


# Every provider except Anthropic speaks the OpenAI wire format, so one client
# serves five of the six — only the base URL differs.
PROVIDERS: dict[Provider, ProviderConfig] = {
    Provider.ANTHROPIC: ProviderConfig(
        provider=Provider.ANTHROPIC,
        env_key="ANTHROPIC_API_KEY",
        base_url=None,
        trains_on_input=False,
    ),
    Provider.OPENAI: ProviderConfig(
        provider=Provider.OPENAI,
        env_key="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        trains_on_input=False,
    ),
    Provider.GROQ: ProviderConfig(
        provider=Provider.GROQ,
        env_key="GROQ_API_KEY",
        base_url="https://api.groq.com/openai/v1",
        trains_on_input=False,
    ),
    Provider.CEREBRAS: ProviderConfig(
        provider=Provider.CEREBRAS,
        env_key="CEREBRAS_API_KEY",
        base_url="https://api.cerebras.ai/v1",
        trains_on_input=False,
    ),
    # Gemini and OpenRouter train on free-tier traffic. They are reachable only
    # from the free chain; ROUTING asserts they never appear in a premium one.
    Provider.GEMINI: ProviderConfig(
        provider=Provider.GEMINI,
        env_key="GEMINI_API_KEY",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        trains_on_input=True,
    ),
    Provider.OPENROUTER: ProviderConfig(
        provider=Provider.OPENROUTER,
        env_key="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        trains_on_input=True,
    ),
}


@dataclass(frozen=True, slots=True)
class ModelChoice:
    """One rung of a fallback chain."""

    provider: Provider
    model: str
    # Free tiers meter tokens per minute far more tightly than Anthropic, so
    # the ceiling belongs to the rung rather than being global.
    max_tokens: int

    @property
    def trains_on_input(self) -> bool:
        return PROVIDERS[self.provider].trains_on_input

    def __str__(self) -> str:
        return f"{self.provider.value}/{self.model}"


# ---------------------------------------------------------------------------
# Cost
#
# Free-tier rungs are recorded as genuinely zero rather than at a notional list
# price, so `cost_so_far_usd` stays truthful. An unpriced model is a loud
# failure, never a silent zero.
# ---------------------------------------------------------------------------

_MILLION = Decimal("1000000")
_ZERO = (Decimal("0"), Decimal("0"))

_PER_MILLION: dict[str, tuple[Decimal, Decimal]] = {
    # Anthropic list price. Sonnet 5 has a lower introductory rate through
    # 2026-08-31; list price is used so recorded cost never understates.
    "claude-sonnet-5": (Decimal("3.00"), Decimal("15.00")),
    "claude-opus-5": (Decimal("5.00"), Decimal("25.00")),
    "gpt-5.5": (Decimal("5.00"), Decimal("30.00")),
    # Free tiers: no charge is incurred, so none is recorded.
    "zai-glm-4.7": _ZERO,
    "openai/gpt-oss-120b": _ZERO,
    "openai/gpt-oss-20b": _ZERO,
    "gemini-3-flash": _ZERO,
    "openrouter/free": _ZERO,
}

# Cache reads bill at ~0.1x input; writes at ~1.25x for the 5-minute TTL.
CACHE_READ_MULTIPLIER = Decimal("0.1")
CACHE_WRITE_MULTIPLIER = Decimal("1.25")


class UnknownModelError(ValueError):
    """Cost cannot be attributed for a model with no recorded price."""


def token_cost_usd(
    model: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> Decimal:
    price = _PER_MILLION.get(model)
    if price is None:
        raise UnknownModelError(f"No recorded price for model: {model}")
    input_price, output_price = price
    billable_input = (
        Decimal(input_tokens)
        + Decimal(cache_read_tokens) * CACHE_READ_MULTIPLIER
        + Decimal(cache_write_tokens) * CACHE_WRITE_MULTIPLIER
    )
    return (
        billable_input * input_price + Decimal(output_tokens) * output_price
    ) / _MILLION
