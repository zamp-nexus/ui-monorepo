from __future__ import annotations

from decimal import Decimal

# Tiered router (final architecture §4): the Evaluator deliberately runs a
# different model from the SQL Analyst so the recheck does not inherit the
# analyst's blind spots (§3.9).
ORCHESTRATOR_MODEL = "claude-sonnet-5"
SQL_ANALYST_MODEL = "claude-sonnet-5"
EVALUATOR_MODEL = "claude-opus-5"

# Thinking is on by default on both models and counts against max_tokens.
# Agent outputs are small JSON documents, so the headroom is for reasoning.
MAX_TOKENS = 16000

# Anthropic list price per million tokens. Sonnet 5 has a lower introductory
# rate through 2026-08-31; list price is used so recorded cost never
# understates what the tenant will be billed.
_PER_MILLION: dict[str, tuple[Decimal, Decimal]] = {
    "claude-sonnet-5": (Decimal("3.00"), Decimal("15.00")),
    "claude-opus-5": (Decimal("5.00"), Decimal("25.00")),
}
_MILLION = Decimal("1000000")

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


# The Evaluator-Optimizer loop exits hard at this many attempts regardless of
# score (§3.7 loop failure). The Investigation aggregate enforces the same cap.
MAX_EVALUATION_ATTEMPTS = 3

# A recheck disagreeing by more than this fraction fails and forces a retry.
DISCREPANCY_TOLERANCE = 0.01

EVAL_SUITE_ROOT = "evals"
