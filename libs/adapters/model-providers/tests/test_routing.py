from __future__ import annotations

import pytest
from zentra_domain_agent_execution import AgentRole

from zentra_adapter_model_providers import (
    PROVIDERS,
    ROUTING,
    ModelTier,
    Provider,
    UnknownModelError,
    model_family,
    token_cost_usd,
)


def test_no_premium_chain_touches_a_provider_that_trains_on_input() -> None:
    """Privacy is what premium tenants are buying, so this is enforced rather
    than left to review. `routing` also asserts it at import."""
    for role, chain in ROUTING[ModelTier.PREMIUM].items():
        offenders = [str(choice) for choice in chain if choice.trains_on_input]
        assert not offenders, f"{role.value} would leak to {offenders}"


def test_free_evaluator_starts_on_a_different_family_from_the_analyst() -> None:
    analyst = ROUTING[ModelTier.FREE][AgentRole.SQL_ANALYST][0]
    evaluator = ROUTING[ModelTier.FREE][AgentRole.EVALUATOR][0]

    assert model_family(analyst.model) != model_family(evaluator.model)
    assert analyst.provider is not evaluator.provider


def test_premium_evaluator_starts_on_a_stronger_model_than_the_analyst() -> None:
    analyst = ROUTING[ModelTier.PREMIUM][AgentRole.SQL_ANALYST][0]
    evaluator = ROUTING[ModelTier.PREMIUM][AgentRole.EVALUATOR][0]

    assert analyst.model == "claude-sonnet-5"
    assert evaluator.model == "claude-opus-5"


def test_every_chain_ends_on_anthropic() -> None:
    """Anthropic is the backstop: no chain may exhaust into nothing."""
    for tier, roles in ROUTING.items():
        for role, chain in roles.items():
            assert chain, f"{tier.value}/{role.value} has no rungs"
            providers = {choice.provider for choice in chain}
            assert Provider.ANTHROPIC in providers, f"{tier.value}/{role.value}"


def test_every_routed_model_has_a_recorded_price() -> None:
    for roles in ROUTING.values():
        for chain in roles.values():
            for choice in chain:
                token_cost_usd(choice.model, input_tokens=1, output_tokens=1)


def test_unpriced_model_fails_loudly_rather_than_recording_zero() -> None:
    with pytest.raises(UnknownModelError):
        token_cost_usd("some-new-model", input_tokens=1, output_tokens=1)


def test_free_tier_models_record_genuinely_zero_cost() -> None:
    cost = token_cost_usd("zai-glm-4.7", input_tokens=100_000, output_tokens=50_000)

    assert cost == 0


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("claude-sonnet-5", "claude"),
        ("groq/openai/gpt-oss-120b", "gpt-oss"),
        ("cerebras/zai-glm-4.7", "glm"),
        ("gemini/gemini-3-flash", "gemini"),
        ("gpt-5.5", "gpt-5"),
        (None, None),
    ],
)
def test_model_family_reduces_to_shared_blind_spots(
    model: str | None,
    expected: str | None,
) -> None:
    assert model_family(model) == expected


def test_only_anthropic_uses_a_native_sdk() -> None:
    """Everything else speaks the OpenAI wire format, which is why one client
    covers five providers."""
    for provider, config in PROVIDERS.items():
        if provider is Provider.ANTHROPIC:
            assert config.base_url is None
        else:
            assert config.base_url is not None
