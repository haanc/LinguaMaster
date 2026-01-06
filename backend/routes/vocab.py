"""
Vocab Routes
Handles saved vocabulary CRUD and spaced repetition review.
"""

import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import SavedWord

router = APIRouter(prefix="/vocab", tags=["vocab"])


# --- Dependencies ---

def get_current_owner(x_owner_id: str = Header(default="guest")) -> str:
    return x_owner_id


# --- Request Models ---

class ReviewRequest(BaseModel):
    quality: int  # 0-5 (SM-2 algorithm quality rating)


# --- Endpoints ---

@router.get("", response_model=List[SavedWord])
def list_saved_words(
    session: Session = Depends(get_session),
    due_only: bool = False,
    language: Optional[str] = None,
    owner_id: str = Depends(get_current_owner),
):
    """List saved vocabulary words, optionally filtered by language or due status."""
    query = select(SavedWord).where(SavedWord.owner_id == owner_id)

    if language and language != "All":
        query = query.where(SavedWord.language == language)

    if due_only:
        query = query.where(SavedWord.next_review_at <= datetime.datetime.utcnow())

    query = query.order_by(SavedWord.next_review_at.asc())
    return session.exec(query).all()


@router.post("", response_model=SavedWord)
def save_word(
    word: SavedWord,
    session: Session = Depends(get_session),
    owner_id: str = Depends(get_current_owner),
):
    """Save a new vocabulary word."""
    try:
        # Handle string to UUID conversion for media_id
        if word.media_id and isinstance(word.media_id, str):
            print(f"DEBUG: Converting media_id string to UUID: {word.media_id}")
            word.media_id = UUID(word.media_id)

        word.owner_id = owner_id

        session.add(word)
        session.commit()
        session.refresh(word)
        return word
    except Exception as e:
        session.rollback()
        print(f"Error saving word: {e}")
        if "foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400, detail="Invalid Video Reference (ID not found)"
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{word_id}/review", response_model=SavedWord)
def review_word(
    word_id: UUID,
    req: ReviewRequest,
    session: Session = Depends(get_session),
):
    """
    Review a vocabulary word using SM-2 spaced repetition algorithm.

    Quality ratings:
    - 0-2: Failed review, reset repetitions
    - 3-5: Successful review, increase interval
    """
    word = session.get(SavedWord, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    q = req.quality

    if q < 3:
        # Review failed, reset
        word.repetitions = 0
        word.interval = 0
        word.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=1)
    else:
        # Review passed
        if word.repetitions == 0:
            word.interval = 1.0
        elif word.repetitions == 1:
            word.interval = 6.0
        else:
            word.interval = word.interval * word.easiness_factor

        word.repetitions += 1

        # Update Easiness Factor (EF)
        # EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
        word.easiness_factor = word.easiness_factor + (
            0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
        )
        if word.easiness_factor < 1.3:
            word.easiness_factor = 1.3

        word.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(
            days=word.interval
        )

    session.add(word)
    session.commit()
    session.refresh(word)
    return word


@router.delete("/{word_id}")
def delete_saved_word(word_id: UUID, session: Session = Depends(get_session)):
    """Delete a saved vocabulary word."""
    word = session.get(SavedWord, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    session.delete(word)
    session.commit()
    return {"message": "Word deleted"}
