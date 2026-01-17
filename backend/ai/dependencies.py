"""
FastAPI Dependency Injection for LLM Providers.

Provides request-scoped LLM provider injection, allowing per-request
configuration passed via HTTP headers while falling back to environment
configuration when no user config is provided.
"""

import base64
import json
from typing import Optional

from fastapi import Header, HTTPException

from .providers.llm import (
    LLMProvider,
    get_llm_provider,
    get_llm_provider_from_request,
)


def get_request_llm_provider(
    x_llm_config: Optional[str] = Header(None, alias="X-LLM-Config")
) -> LLMProvider:
    """
    FastAPI dependency that provides an LLM provider based on request config.

    The X-LLM-Config header should contain a base64-encoded JSON object with:
    - provider: str (openai, claude, gemini, deepseek, qwen, custom)
    - apiKey: str
    - modelName: str (optional for most providers)
    - baseUrl: str (optional, required for custom)

    If no header is provided, falls back to environment-based configuration.

    Args:
        x_llm_config: Base64-encoded JSON configuration from request header

    Returns:
        An LLMProvider instance

    Raises:
        HTTPException: If the configuration is invalid
    """
    # No user config provided - use environment-based defaults
    if not x_llm_config:
        return get_llm_provider()

    try:
        # Decode base64 and parse JSON
        config_json = base64.b64decode(x_llm_config).decode("utf-8")
        config_dict = json.loads(config_json)
    except (ValueError, json.JSONDecodeError):
        # SECURITY: Do not echo back user input - may contain partial API keys
        raise HTTPException(
            status_code=400,
            detail="Invalid X-LLM-Config header: expected base64-encoded JSON"
        )

    try:
        return get_llm_provider_from_request(config_dict)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


async def get_optional_llm_provider(
    x_llm_config: Optional[str] = Header(None, alias="X-LLM-Config")
) -> Optional[LLMProvider]:
    """
    Optional version - returns None if no config provided instead of falling back.

    Useful for endpoints that want to explicitly check if user has configured LLM.
    """
    if not x_llm_config:
        return None

    return get_request_llm_provider(x_llm_config)
