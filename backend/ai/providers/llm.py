"""
LLM Provider Abstraction
Provides a unified interface for different LLM backends.

Supports:
- Azure OpenAI (env-based)
- OpenAI (env-based or per-request)
- Ollama (env-based)
- Claude/Anthropic (per-request)
- Gemini/Google (per-request)
- DeepSeek (per-request, OpenAI compatible)
- Qwen/Alibaba (per-request, OpenAI compatible)
- Custom OpenAI-compatible endpoints (per-request)
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from urllib.parse import urlparse
from langchain_core.language_models.chat_models import BaseChatModel

from ..config import get_config, AIConfig


def validate_base_url(url: str, allow_internal: bool = False) -> str:
    """
    Validate that a base URL is safe and well-formed.

    Args:
        url: The URL to validate
        allow_internal: If False (default), blocks internal/private IP addresses

    Returns:
        The validated URL

    Raises:
        ValueError: If URL is invalid or potentially dangerous
    """
    if not url:
        raise ValueError("base_url cannot be empty")

    parsed = urlparse(url)

    # Must have valid scheme
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("base_url must use http or https scheme")

    # Must have valid host
    if not parsed.netloc:
        raise ValueError("Invalid base_url format: missing host")

    # Block potentially dangerous internal addresses (SSRF protection)
    if not allow_internal:
        host = parsed.hostname or ""
        host_lower = host.lower()

        # Block localhost variants
        if host_lower in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
            raise ValueError("base_url cannot point to localhost")

        # Block private IP ranges
        if host_lower.startswith('10.') or host_lower.startswith('192.168.'):
            raise ValueError("base_url cannot point to private IP addresses")

        # Block 172.16.0.0 - 172.31.255.255
        if host_lower.startswith('172.'):
            try:
                second_octet = int(host_lower.split('.')[1])
                if 16 <= second_octet <= 31:
                    raise ValueError("base_url cannot point to private IP addresses")
            except (IndexError, ValueError):
                pass

        # Block link-local and metadata endpoints
        if host_lower.startswith('169.254.') or host_lower == '169.254.169.254':
            raise ValueError("base_url cannot point to link-local or metadata endpoints")

    return url


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


# =============================================================================
# Per-Request LLM Providers (user-configurable, API key passed per request)
# =============================================================================


class DirectOpenAIProvider(LLMProvider):
    """OpenAI provider with direct API key (per-request)."""

    def __init__(self, api_key: str, model_name: str = "gpt-4o-mini", base_url: Optional[str] = None):
        self.api_key = api_key
        self.model_name = model_name
        self.base_url = base_url

    @property
    def name(self) -> str:
        return f"OpenAI ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        kwargs = {
            "api_key": self.api_key,
            "model": self.model_name,
            "temperature": temperature,
        }
        if self.base_url:
            kwargs["base_url"] = self.base_url

        return ChatOpenAI(**kwargs)


class ClaudeLLMProvider(LLMProvider):
    """Anthropic Claude LLM provider (per-request)."""

    def __init__(self, api_key: str, model_name: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model_name = model_name

    @property
    def name(self) -> str:
        return f"Claude ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            anthropic_api_key=self.api_key,
            model_name=self.model_name,
            temperature=temperature,
        )


class GeminiLLMProvider(LLMProvider):
    """Google Gemini LLM provider (per-request)."""

    def __init__(self, api_key: str, model_name: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model_name = model_name

    @property
    def name(self) -> str:
        return f"Gemini ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            google_api_key=self.api_key,
            model=self.model_name,
            temperature=temperature,
        )


class DeepSeekLLMProvider(LLMProvider):
    """DeepSeek LLM provider (OpenAI compatible, per-request)."""

    DEFAULT_BASE_URL = "https://api.deepseek.com/v1"

    def __init__(self, api_key: str, model_name: str = "deepseek-chat", base_url: Optional[str] = None):
        self.api_key = api_key
        self.model_name = model_name
        # Validate custom URL to prevent SSRF attacks
        self.base_url = validate_base_url(base_url) if base_url else self.DEFAULT_BASE_URL

    @property
    def name(self) -> str:
        return f"DeepSeek ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            api_key=self.api_key,
            model=self.model_name,
            base_url=self.base_url,
            temperature=temperature,
        )


class QwenLLMProvider(LLMProvider):
    """Alibaba Qwen LLM provider (OpenAI compatible, per-request)."""

    DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def __init__(self, api_key: str, model_name: str = "qwen-plus", base_url: Optional[str] = None):
        self.api_key = api_key
        self.model_name = model_name
        # Validate custom URL to prevent SSRF attacks
        self.base_url = validate_base_url(base_url) if base_url else self.DEFAULT_BASE_URL

    @property
    def name(self) -> str:
        return f"Qwen ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            api_key=self.api_key,
            model=self.model_name,
            base_url=self.base_url,
            temperature=temperature,
        )


class CustomLLMProvider(LLMProvider):
    """Custom OpenAI-compatible LLM provider (per-request)."""

    def __init__(self, api_key: str, model_name: str, base_url: str):
        # Validate URL to prevent SSRF attacks
        self.base_url = validate_base_url(base_url)
        self.api_key = api_key
        self.model_name = model_name

    @property
    def name(self) -> str:
        return f"Custom ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            api_key=self.api_key,
            model=self.model_name,
            base_url=self.base_url,
            temperature=temperature,
        )


class AzureAPIMProvider(LLMProvider):
    """Azure APIM-proxied OpenAI provider (per-request).

    Azure APIM uses api-key header for authentication and requires
    api-version query parameter on all requests. This provider handles
    APIM setups that use OpenAI-compatible endpoints (not Azure OpenAI
    deployment-based endpoints).

    The httpx client is lazily created and reused across calls to prevent
    resource leaks. The client is properly closed when the provider is
    garbage collected.
    """

    # Models that only support temperature=1 (reasoning models)
    FIXED_TEMPERATURE_MODELS = {"o1-preview", "o1-mini", "o1", "gpt-5.2-chat", "o3-mini"}

    # Default API version for Azure OpenAI via APIM
    DEFAULT_API_VERSION = "2023-05-15"

    def __init__(self, api_key: str, model_name: str, base_url: str):
        # Validate URL to prevent SSRF attacks
        self.base_url = validate_base_url(base_url)
        self.api_key = api_key
        self.model_name = model_name
        self._http_client: Optional["httpx.Client"] = None

    def __del__(self):
        """Ensure httpx client is properly closed on garbage collection."""
        if self._http_client is not None:
            try:
                self._http_client.close()
            except Exception:
                pass  # Ignore errors during cleanup

    def _get_http_client(self) -> "httpx.Client":
        """Get or create the shared httpx client."""
        import httpx

        if self._http_client is None:
            def add_api_version(request: httpx.Request) -> httpx.Request:
                url = request.url
                if "api-version" not in str(url):
                    new_params = dict(url.params)
                    new_params["api-version"] = self.DEFAULT_API_VERSION
                    request.url = url.copy_with(params=new_params)
                return request

            self._http_client = httpx.Client(
                headers={"api-key": self.api_key},
                event_hooks={"request": [add_api_version]},
            )

        return self._http_client

    @property
    def name(self) -> str:
        return f"Azure APIM ({self.model_name})"

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        # Check if this model supports temperature parameter
        model_lower = self.model_name.lower()
        supports_temperature = not any(
            model in model_lower for model in self.FIXED_TEMPERATURE_MODELS
        )

        # Ensure base_url ends with /v1
        base_url = self.base_url.rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = base_url + "/v1"

        # Use shared httpx client to prevent resource leaks
        http_client = self._get_http_client()

        if supports_temperature:
            llm = ChatOpenAI(
                api_key=self.api_key,
                model=self.model_name,
                base_url=base_url,
                temperature=temperature,
                http_client=http_client,
            )
        else:
            # Reasoning models don't support temperature - omit it
            llm = ChatOpenAI(
                api_key=self.api_key,
                model=self.model_name,
                base_url=base_url,
                http_client=http_client,
            )

        return llm


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


# =============================================================================
# Per-Request Provider Factory (for user-configurable LLM)
# =============================================================================

# Dynamic provider registry for per-request configuration
_DYNAMIC_PROVIDERS = {
    "openai": lambda cfg: DirectOpenAIProvider(
        api_key=cfg["apiKey"],
        model_name=cfg.get("modelName", "gpt-4o-mini"),
        base_url=cfg.get("baseUrl"),
    ),
    "claude": lambda cfg: ClaudeLLMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg.get("modelName", "claude-sonnet-4-20250514"),
    ),
    "gemini": lambda cfg: GeminiLLMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg.get("modelName", "gemini-2.0-flash"),
    ),
    "deepseek": lambda cfg: DeepSeekLLMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg.get("modelName", "deepseek-chat"),
        base_url=cfg.get("baseUrl"),
    ),
    "qwen": lambda cfg: QwenLLMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg.get("modelName", "qwen-plus"),
        base_url=cfg.get("baseUrl"),
    ),
    "custom": lambda cfg: CustomLLMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg["modelName"],
        base_url=cfg["baseUrl"],
    ),
    "azure_apim": lambda cfg: AzureAPIMProvider(
        api_key=cfg["apiKey"],
        model_name=cfg["modelName"],
        base_url=cfg["baseUrl"],
    ),
}


def get_llm_provider_from_request(config_dict: Dict[str, Any]) -> LLMProvider:
    """
    Create an LLM provider from a per-request configuration.
    Used when user provides their own API key via X-LLM-Config header.

    Args:
        config_dict: Dictionary with provider config, must include:
            - provider: str (openai, claude, gemini, deepseek, qwen, custom)
            - apiKey: str
            - modelName: str (optional for most providers)
            - baseUrl: str (optional, required for custom)

    Returns:
        An LLMProvider instance

    Raises:
        ValueError: If provider is unknown or required fields are missing
    """
    provider_type = config_dict.get("provider")

    if not provider_type:
        raise ValueError("Missing 'provider' field in LLM config")

    if provider_type not in _DYNAMIC_PROVIDERS:
        raise ValueError(f"Unknown LLM provider: {provider_type}. "
                         f"Supported: {list(_DYNAMIC_PROVIDERS.keys())}")

    if not config_dict.get("apiKey"):
        raise ValueError("Missing 'apiKey' field in LLM config")

    # Custom provider requires baseUrl
    if provider_type == "custom" and not config_dict.get("baseUrl"):
        raise ValueError("Custom provider requires 'baseUrl' field")

    provider = _DYNAMIC_PROVIDERS[provider_type](config_dict)
    # SECURITY: Do NOT log the full config (contains API key)
    print(f"LLM Provider (per-request): {provider.name}")
    return provider
