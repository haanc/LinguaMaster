"""
AI Configuration Module
Centralizes all AI-related configuration and provider selection.
"""

import os
from dataclasses import dataclass, field
from typing import Literal, Optional
from dotenv import load_dotenv
from pathlib import Path

# Load .env from backend directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

LLMProviderType = Literal["azure", "openai", "ollama"]
WhisperProviderType = Literal["azure", "openai", "local"]


@dataclass
class AzureConfig:
    """Azure OpenAI specific configuration."""
    endpoint: str = ""
    api_key: str = ""
    api_version: str = "2024-02-01"
    chat_deployment: str = "gpt-4o"
    whisper_deployment: str = "whisper"

    @classmethod
    def from_env(cls) -> "AzureConfig":
        return cls(
            endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
            chat_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_CHAT", "gpt-4o"),
            whisper_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_WHISPER", "whisper"),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint and self.api_key)


@dataclass
class OpenAIConfig:
    """Standard OpenAI configuration."""
    api_key: str = ""
    model_name: str = "gpt-4o-mini"
    whisper_model: str = "whisper-1"

    @classmethod
    def from_env(cls) -> "OpenAIConfig":
        return cls(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model_name=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini"),
            whisper_model=os.getenv("OPENAI_WHISPER_MODEL", "whisper-1"),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and "placeholder" not in self.api_key)


@dataclass
class OllamaConfig:
    """Ollama (local) configuration."""
    base_url: str = "http://localhost:11434"
    model_name: str = "llama3"

    @classmethod
    def from_env(cls) -> "OllamaConfig":
        return cls(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model_name=os.getenv("OLLAMA_MODEL_NAME", "llama3"),
        )


@dataclass
class AIConfig:
    """
    Main AI configuration container.
    Determines which providers to use based on environment configuration.
    """
    azure: AzureConfig = field(default_factory=AzureConfig.from_env)
    openai: OpenAIConfig = field(default_factory=OpenAIConfig.from_env)
    ollama: OllamaConfig = field(default_factory=OllamaConfig.from_env)

    # Provider preference (can be overridden via env)
    llm_provider_override: Optional[str] = None
    whisper_provider_override: Optional[str] = None

    @classmethod
    def from_env(cls) -> "AIConfig":
        return cls(
            azure=AzureConfig.from_env(),
            openai=OpenAIConfig.from_env(),
            ollama=OllamaConfig.from_env(),
            llm_provider_override=os.getenv("LLM_PROVIDER"),
            whisper_provider_override=os.getenv("WHISPER_PROVIDER"),
        )

    @property
    def llm_provider(self) -> LLMProviderType:
        """Determine which LLM provider to use."""
        # Check for explicit override first
        if self.llm_provider_override:
            return self.llm_provider_override  # type: ignore

        # Auto-detect based on available configuration
        if self.azure.is_configured:
            return "azure"
        elif self.openai.is_configured:
            return "openai"
        else:
            return "ollama"  # Fallback to local

    @property
    def whisper_provider(self) -> WhisperProviderType:
        """Determine which Whisper provider to use."""
        if self.whisper_provider_override:
            return self.whisper_provider_override  # type: ignore

        # Whisper: prefer Azure if configured, then OpenAI
        if self.azure.is_configured:
            return "azure"
        elif self.openai.is_configured:
            return "openai"
        else:
            return "local"


# Global config instance
_config: Optional[AIConfig] = None


def get_config() -> AIConfig:
    """Get the global AI configuration (lazy loaded)."""
    global _config
    if _config is None:
        _config = AIConfig.from_env()
    return _config


def reload_config() -> AIConfig:
    """Force reload configuration from environment."""
    global _config
    _config = AIConfig.from_env()
    return _config
