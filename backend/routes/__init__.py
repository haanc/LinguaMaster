"""
Routes Package
Modular API route handlers for the Fluent Learner backend.
"""

from .media import router as media_router
from .vocab import router as vocab_router
from .ai import router as ai_router
from .streaming import router as streaming_router

__all__ = [
    "media_router",
    "vocab_router",
    "ai_router",
    "streaming_router",
]
