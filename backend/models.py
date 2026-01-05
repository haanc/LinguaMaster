from typing import Optional, List
from uuid import UUID, uuid4
from datetime import datetime
from sqlmodel import Field, SQLModel, Relationship
from pydantic import field_validator

class MediaSource(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str
    source_url: Optional[str] = Field(default=None, index=True)
    file_path: Optional[str] = None
    duration: float = 0.0
    language: str = "en"
    # Status tracking for AI processing: pending, downloading, processing_audio, transcribing, ready, error
    status: str = Field(default="ready") 
    error_message: Optional[str] = None
    cover_image: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_played_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: str = Field(default="guest", index=True)
    
    # Relationships
    segments: List["SubtitleSegment"] = Relationship(back_populates="media")

class SubtitleSegment(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    media_id: UUID = Field(foreign_key="mediasource.id")
    index: int
    start_time: float
    end_time: float
    text: str
    translation: Optional[str] = None
    grammar_notes_json: Optional[str] = None 
    
    # Relationships
    media: MediaSource = Relationship(back_populates="segments")

class SavedWord(SQLModel, table=True):
    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    word: str
    context_sentence: Optional[str] = None
    translation: Optional[str] = None
    media_id: Optional[UUID] = Field(default=None, foreign_key="mediasource.id")
    media_time: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # SRS Fields
    language: str = Field(default="en", index=True)
    next_review_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    interval: float = Field(default=0.0)
    easiness_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)
    owner_id: str = Field(default="guest", index=True)
