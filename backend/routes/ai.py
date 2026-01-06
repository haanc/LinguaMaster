"""
AI Routes
Handles AI-powered features: word lookup, context explanation, and tutor chat.
"""

from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


# --- Request Models ---

class LookupRequest(BaseModel):
    word: str
    context: str
    target_language: str = "Chinese"
    sentence_translation: Optional[str] = None  # If provided, uses faster augmented lookup


class ExplainRequest(BaseModel):
    text: str
    target_language: str = "Chinese"


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    context: Optional[str] = None
    target_language: str = "Chinese"


# --- Endpoints ---

@router.post("/lookup-word")
def lookup_word(req: LookupRequest):
    """
    Look up a word's definition, pronunciation, and translation in context.

    If sentence_translation is provided, uses an optimized chain that's faster
    and uses fewer tokens by extracting the word translation from context.
    """
    return ai_service.lookup_word(
        req.word,
        req.context,
        req.target_language,
        req.sentence_translation,
    )


@router.post("/explain")
def explain_context(req: ExplainRequest):
    """Explain grammar and cultural context of a text passage."""
    return ai_service.explain_context(req.text, req.target_language)


@router.post("/chat")
def chat_tutor(req: ChatRequest):
    """
    Chat with the AI language tutor.
    The tutor only answers questions related to the provided context text.
    """
    return ai_service.chat_with_tutor(req.messages, req.context, req.target_language)
