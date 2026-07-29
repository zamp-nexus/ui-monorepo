"""ZentraOS model provider adapter"""

from zentra_domain_agent_execution import model_family

from .anthropic_client import AnthropicModelClient
from .breaker import BreakerState, ProviderCircuitBreaker
from .errors import (
    ChainExhaustedError,
    ProviderAuthError,
    ProviderError,
    ProviderTruncatedError,
    ProviderUnavailableError,
)
from .factory import ProviderClients
from .openai_compatible import OpenAICompatibleModelClient
from .providers import (
    PROVIDERS,
    ModelChoice,
    ModelTier,
    Provider,
    ProviderConfig,
    UnknownModelError,
    token_cost_usd,
)
from .router import RoutedModelClient, SchemaViolationError
from .routing import ROUTING, TrainingProviderInPaidChainError, chain_for

__all__ = [
    "PROVIDERS",
    "ROUTING",
    "AnthropicModelClient",
    "BreakerState",
    "ChainExhaustedError",
    "ModelChoice",
    "ModelTier",
    "OpenAICompatibleModelClient",
    "Provider",
    "ProviderAuthError",
    "ProviderCircuitBreaker",
    "ProviderClients",
    "ProviderConfig",
    "ProviderError",
    "ProviderTruncatedError",
    "ProviderUnavailableError",
    "RoutedModelClient",
    "SchemaViolationError",
    "TrainingProviderInPaidChainError",
    "UnknownModelError",
    "chain_for",
    "model_family",
    "token_cost_usd",
]
