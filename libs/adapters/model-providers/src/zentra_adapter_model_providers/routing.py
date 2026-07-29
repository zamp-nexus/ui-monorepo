from __future__ import annotations

from zentra_domain_agent_execution import AgentRole

from .providers import ModelChoice, ModelTier, Provider

# Free-tier ceilings are set well under the tightest published TPM budget
# (Groq bottoms out at 6K/min on some models), because one investigation makes
# six or more calls. Anthropic has the headroom for real reasoning depth.
_FREE_MAX_TOKENS = 8000
_PAID_MAX_TOKENS = 16000


def _free(provider: Provider, model: str) -> ModelChoice:
    return ModelChoice(provider=provider, model=model, max_tokens=_FREE_MAX_TOKENS)


def _paid(provider: Provider, model: str) -> ModelChoice:
    return ModelChoice(provider=provider, model=model, max_tokens=_PAID_MAX_TOKENS)


# Ordered by measured Artificial Analysis Intelligence Index v4.1, not vendor
# claim: Gemini 3.6 Flash 50 > Nemotron 3 Ultra 38 > GLM-4.7 34 >
# gpt-oss-120b 24; Opus 5 61 > GPT-5.5 55 > Sonnet 5 53. Sonnet 5 still leads
# the premium workhorse chain because it reaches 96% of GPT-5.5's score at
# roughly a third of the blended price.
_GEMINI_FLASH = _free(Provider.GEMINI, "gemini-3.6-flash")

# Verified 2026-07-29 against the live NIM endpoint: it honours strict
# json_schema with our real QUERY_PLAN_SCHEMA, despite NVIDIA documenting only
# JSON mode. It therefore leads the Evaluator chain — highest free Index after
# Gemini, a different model family from the Analyst's primary, and 40 requests
# per minute against Cerebras's 5.
_NVIDIA_NEMOTRON = _free(Provider.NVIDIA, "nvidia/nemotron-3-ultra-550b-a55b")

# Cerebras deprecates this on 2026-08-17. Fallback will hide its death rather
# than surface it, so it must not be anything's only real option by then.
_CEREBRAS_GLM = _free(Provider.CEREBRAS, "zai-glm-4.7")

_GROQ_OSS = _free(Provider.GROQ, "openai/gpt-oss-120b")
_OPENROUTER_FREE = _free(Provider.OPENROUTER, "openrouter/free")

_SONNET = _paid(Provider.ANTHROPIC, "claude-sonnet-5")
_OPUS = _paid(Provider.ANTHROPIC, "claude-opus-5")
_GPT = _paid(Provider.OPENAI, "gpt-5.5")

# The Evaluator's chain deliberately starts on a different vendor and model
# family from the SQL Analyst, so the independent recheck stays independent
# without costing anything. OpenAI is absent from the free chains: at $4.35
# blended it is worse value than falling straight through to Sonnet 5.
ROUTING: dict[ModelTier, dict[AgentRole, tuple[ModelChoice, ...]]] = {
    ModelTier.FREE: {
        AgentRole.ORCHESTRATOR: (
            _GEMINI_FLASH,
            _NVIDIA_NEMOTRON,
            _CEREBRAS_GLM,
            _GROQ_OSS,
            _OPENROUTER_FREE,
            _SONNET,
        ),
        AgentRole.SQL_ANALYST: (
            _GEMINI_FLASH,
            _NVIDIA_NEMOTRON,
            _CEREBRAS_GLM,
            _GROQ_OSS,
            _OPENROUTER_FREE,
            _SONNET,
        ),
        AgentRole.EVALUATOR: (
            _NVIDIA_NEMOTRON,
            _GROQ_OSS,
            _CEREBRAS_GLM,
            _GEMINI_FLASH,
            _OPENROUTER_FREE,
            _OPUS,
        ),
    },
    ModelTier.PREMIUM: {
        AgentRole.ORCHESTRATOR: (_SONNET, _GPT, _CEREBRAS_GLM, _GROQ_OSS),
        AgentRole.SQL_ANALYST: (_SONNET, _GPT, _CEREBRAS_GLM, _GROQ_OSS),
        AgentRole.EVALUATOR: (_OPUS, _GPT, _GROQ_OSS, _CEREBRAS_GLM),
    },
}


class TrainingProviderInPaidChainError(RuntimeError):
    """A provider that trains on input reached a premium chain.

    Privacy is what premium tenants are paying for, so this is enforced at
    import rather than left to review.
    """


def _assert_premium_never_trains() -> None:
    for role, chain in ROUTING[ModelTier.PREMIUM].items():
        offenders = [str(choice) for choice in chain if choice.trains_on_input]
        if offenders:
            raise TrainingProviderInPaidChainError(
                f"Premium chain for {role.value} includes providers that train "
                f"on input: {', '.join(offenders)}"
            )


_assert_premium_never_trains()


def chain_for(tier: ModelTier, role: AgentRole) -> tuple[ModelChoice, ...]:
    try:
        return ROUTING[tier][role]
    except KeyError as error:
        raise KeyError(f"No routing chain for {tier.value}/{role.value}") from error
