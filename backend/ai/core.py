"""
AI Core Module
Re-exports get_llm for backwards compatibility with chains.py
"""

from .providers.llm import get_llm

__all__ = ["get_llm"]
