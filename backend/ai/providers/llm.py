"""
LLM Provider Abstraction
Provides a unified interface for different LLM backends (Azure, OpenAI, Ollama).
"""

from abc import ABC, abstractmethod
from langchain_core.language_models.chat_models import BaseChatModel

from ..config import get_config, AIConfig


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        """
        Returns a LangChain-compatible chat model.

        Args:
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative)

        Returns:
            A BaseChatModel instance ready for use with LangChain
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for logging/debugging."""
        pass


class AzureLLMProvider(LLMProvider):
    """Azure OpenAI LLM provider."""

    # Models that only support temperature=1 (reasoning models)
    FIXED_TEMPERATURE_MODELS = {"o1-preview", "o1-mini", "o1", "gpt-5.2-chat", "o3-mini"}

    def __init__(self, config: AIConfig):
        self.config = config.azure

    @property
    def name(self) -> str:
        return f"Azure OpenAI ({self.config.chat_deployment})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import AzureChatOpenAI

        # Check if this model supports temperature parameter
        deployment = self.config.chat_deployment.lower()
        supports_temperature = not any(
            model in deployment for model in self.FIXED_TEMPERATURE_MODELS
        )

        if supports_temperature:
            return AzureChatOpenAI(
                azure_endpoint=self.config.endpoint,
                api_key=self.config.api_key,
                azure_deployment=self.config.chat_deployment,
                api_version=self.config.api_version,
                temperature=temperature,
            )
        else:
            # Reasoning models don't support temperature - omit it
            return AzureChatOpenAI(
                azure_endpoint=self.config.endpoint,
                api_key=self.config.api_key,
                azure_deployment=self.config.chat_deployment,
                api_version=self.config.api_version,
            )


class OpenAILLMProvider(LLMProvider):
    """Standard OpenAI LLM provider."""

    def __init__(self, config: AIConfig):
        self.config = config.openai

    @property
    def name(self) -> str:
        return f"OpenAI ({self.config.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            api_key=self.config.api_key,
            model=self.config.model_name,
            temperature=temperature,
        )


class OllamaLLMProvider(LLMProvider):
    """Ollama (local) LLM provider."""

    def __init__(self, config: AIConfig):
        self.config = config.ollama

    @property
    def name(self) -> str:
        return f"Ollama ({self.config.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_ollama import ChatOllama

        return ChatOllama(
            base_url=self.config.base_url,
            model=self.config.model_name,
            temperature=temperature,
        )


# Provider registry
_PROVIDERS = {
    "azure": AzureLLMProvider,
    "openai": OpenAILLMProvider,
    "ollama": OllamaLLMProvider,
}


def get_llm_provider(config: AIConfig = None) -> LLMProvider:
    """
    Factory function to get the appropriate LLM provider.

    Args:
        config: Optional AIConfig. If not provided, uses global config.

    Returns:
        An LLMProvider instance based on configuration.
    """
    if config is None:
        config = get_config()

    provider_type = config.llm_provider
    provider_class = _PROVIDERS.get(provider_type)

    if provider_class is None:
        raise ValueError(f"Unknown LLM provider: {provider_type}")

    provider = provider_class(config)
    print(f"LLM Provider: {provider.name}")
    return provider


# Backwards compatibility: drop-in replacement for old get_llm()
def get_llm(temperature: float = 0.7) -> BaseChatModel:
    """
    Legacy function for backwards compatibility.
    Returns a chat model using the configured provider.
    """
    provider = get_llm_provider()
    return provider.get_chat_model(temperature)
