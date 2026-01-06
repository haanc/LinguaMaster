"""
Media Routes
Handles media CRUD, download, transcription, and translation.
"""

import os
from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session, engine
from models import MediaSource, SubtitleSegment
from media_service import media_service
from ai_service import ai_service
from translation_cache import get_translation_cache

router = APIRouter(prefix="/media", tags=["media"])


# --- Request Models ---

class URLRequest(BaseModel):
    url: str


class TranslateSegmentsRequest(BaseModel):
    segment_ids: List[str]
    target_language: str = "Chinese"


# --- Dependencies ---

def get_current_owner(x_owner_id: str = Header(default="guest")) -> str:
    return x_owner_id


# --- Background Tasks ---

def background_download_and_process(url: str, media_id_str: str):
    """
    Handles metadata fetch, download, and AI processing pipeline.
    Updates the existing MediaSource entry.
    """
    media_id = UUID(media_id_str)

    with Session(engine) as db:
        try:
            media = db.get(MediaSource, media_id)
            if not media:
                print(f"ERROR: Media {media_id} not found in background task.")
                return

            # 1. Fetch Metadata
            print(f"DEBUG: Background fetching metadata for {url}...")
            try:
                meta = media_service.fetch_metadata(url)
                media.title = meta.get("title", "Unknown Title")
                media.duration = meta.get("duration") or 0.0
                media.cover_image = meta.get("thumbnail")
                db.add(media)
                db.commit()
                print(f"DEBUG: Updated metadata for {media.title}")
            except Exception:
                pass

            # Check cancellation
            if not db.get(MediaSource, media_id):
                print(f"DEBUG: Task cancelled for {media_id}")
                return

            # 2. Download Audio
            print(f"DEBUG: Starting audio download for {media.id}...")
            try:
                local_path = media_service.download_audio(url)
            except Exception as e:
                media.status = "error"
                media.error_message = f"Download Failed: {str(e)}"
                db.add(media)
                db.commit()
                return

            media.file_path = local_path
            media.status = "transcribing"
            db.add(media)
            db.commit()

            print(f"DEBUG: Audio ready: {local_path}")

            # 3. Transcribe with Whisper
            try:
                print(f"DEBUG: Transcribing audio...")

                if not db.get(MediaSource, media_id):
                    return

                segments_data = ai_service.transcribe_audio(local_path)
                print(f"DEBUG: Transcription complete. {len(segments_data)} segments.")

                for seg in segments_data:
                    db_seg = SubtitleSegment(
                        media_id=media.id,
                        index=seg["index"],
                        start_time=seg["start_time"],
                        end_time=seg["end_time"],
                        text=seg["text"],
                    )
                    db.add(db_seg)

                media.status = "ready"
                db.add(media)
                db.commit()

            except Exception as e:
                print(f"Error in processing pipeline: {e}")
                media.status = "error"
                media.error_message = f"Processing failed: {str(e)}"
                db.add(media)
                db.commit()

        except Exception as e:
            print(f"Error in background task wrapper: {e}")


def background_transcribe_only(audio_path: str, media_id_str: str):
    """Transcribe audio only (for re-triggering stuck jobs)."""
    media_id = UUID(media_id_str)

    with Session(engine) as db:
        try:
            media = db.get(MediaSource, media_id)
            if not media:
                print(f"ERROR: Media {media_id} not found in transcribe task.")
                return

            print(f"DEBUG: Starting transcription for {audio_path}...")
            media.status = "transcribing"
            db.add(media)
            db.commit()

            segments_data = ai_service.transcribe_audio(audio_path)
            print(f"DEBUG: Transcription complete. {len(segments_data)} segments.")

            for seg in segments_data:
                db_seg = SubtitleSegment(
                    media_id=media.id,
                    index=seg["index"],
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    text=seg["text"],
                )
                db.add(db_seg)

            media.status = "ready"
            db.add(media)
            db.commit()
            print(f"DEBUG: Media {media_id} transcription saved successfully!")

        except Exception as e:
            print(f"ERROR in transcribe task: {e}")
            media = db.get(MediaSource, media_id)
            if media:
                media.status = "error"
                media.error_message = f"Transcription failed: {str(e)}"
                db.add(media)
                db.commit()


# --- Media CRUD Endpoints ---

@router.get("", response_model=List[MediaSource])
def list_media(
    db: Session = Depends(get_session),
    owner_id: str = Depends(get_current_owner),
):
    statement = (
        select(MediaSource)
        .where(MediaSource.owner_id == owner_id)
        .order_by(MediaSource.created_at.desc())
    )
    return db.exec(statement).all()


@router.get("/{media_id}", response_model=MediaSource)
def get_media(media_id: UUID, session: Session = Depends(get_session)):
    media = session.get(MediaSource, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return media


@router.post("", response_model=MediaSource)
def create_media(media: MediaSource, session: Session = Depends(get_session)):
    session.add(media)
    session.commit()
    session.refresh(media)
    return media


@router.post("/download", response_model=MediaSource)
def download_media(
    req: URLRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    owner_id: str = Depends(get_current_owner),
):
    """Start a background download and processing job for a URL."""
    url = req.url

    media = MediaSource(
        id=uuid4(),
        title="Importing...",
        source_url=url,
        status="downloading",
        owner_id=owner_id,
    )
    session.add(media)
    session.commit()
    session.refresh(media)

    background_tasks.add_task(background_download_and_process, url, str(media.id))

    return media


@router.post("/{media_id}/retranscribe", response_model=MediaSource)
def retranscribe_media(
    media_id: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Manually re-trigger transcription for a stuck media."""
    media = session.get(MediaSource, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if not media.file_path or not os.path.exists(media.file_path):
        raise HTTPException(
            status_code=400, detail="Audio file not found. Please re-import the video."
        )

    # Clear existing segments
    existing_segments = session.exec(
        select(SubtitleSegment).where(SubtitleSegment.media_id == media_id)
    ).all()
    for seg in existing_segments:
        session.delete(seg)

    media.status = "transcribing"
    media.error_message = None
    session.add(media)
    session.commit()
    session.refresh(media)

    background_tasks.add_task(background_transcribe_only, media.file_path, str(media.id))

    return media


@router.delete("/{media_id}")
def delete_media(media_id: UUID, session: Session = Depends(get_session)):
    media = session.get(MediaSource, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Delete local files
    if media.file_path and os.path.exists(media.file_path):
        try:
            os.remove(media.file_path)
            print(f"DEBUG: Deleted file {media.file_path}")
        except Exception as e:
            print(f"WARN: Failed to delete file: {e}")

    if media.file_path:
        base, _ = os.path.splitext(media.file_path)
        audio_sidecar = base + ".mp3"
        if os.path.exists(audio_sidecar):
            try:
                os.remove(audio_sidecar)
            except Exception:
                pass

    # Delete subtitles
    subtitles = session.exec(
        select(SubtitleSegment).where(SubtitleSegment.media_id == media_id)
    ).all()
    for sub in subtitles:
        session.delete(sub)

    session.delete(media)
    session.commit()
    return {"message": "Media deleted successfully"}


# --- Segment Endpoints ---

@router.get("/{media_id}/segments", response_model=List[SubtitleSegment])
def list_segments(media_id: UUID, session: Session = Depends(get_session)):
    media = session.get(MediaSource, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    segments = session.exec(
        select(SubtitleSegment)
        .where(SubtitleSegment.media_id == media_id)
        .order_by(SubtitleSegment.index)
    ).all()
    return segments


@router.post("/{media_id}/segments", response_model=List[SubtitleSegment])
def create_segments(
    media_id: UUID,
    segments: List[SubtitleSegment],
    session: Session = Depends(get_session),
):
    media = session.get(MediaSource, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    for segment in segments:
        segment.media_id = media_id
        session.add(segment)

    session.commit()
    return segments


# --- Translation Endpoint ---

@router.post("/{media_id}/translate")
def translate_segments(
    media_id: UUID,
    req: TranslateSegmentsRequest,
    session: Session = Depends(get_session),
):
    """
    Translate specified segments with multi-layer caching.
    """
    segments = session.exec(
        select(SubtitleSegment).where(
            SubtitleSegment.media_id == media_id,
            SubtitleSegment.id.in_([UUID(sid) for sid in req.segment_ids]),
        )
    ).all()

    if not segments:
        raise HTTPException(status_code=404, detail="No segments found")

    # Layer 1: Database cache
    results = []
    segments_needing_translation = []

    for seg in segments:
        if seg.translation:
            results.append({"id": str(seg.id), "translation": seg.translation})
        else:
            segments_needing_translation.append(seg)

    if not segments_needing_translation:
        print(f"Cache hit: All {len(segments)} segments already translated")
        return results

    # Layer 2: Memory cache
    cache = get_translation_cache()
    texts_to_translate = []
    segment_index_map = {}

    for seg in segments_needing_translation:
        cached = cache.get(seg.text, req.target_language)
        if cached:
            seg.translation = cached
            session.add(seg)
            results.append({"id": str(seg.id), "translation": cached})
        else:
            batch_idx = len(texts_to_translate)
            texts_to_translate.append(seg.text)
            segment_index_map[batch_idx] = seg

    if not texts_to_translate:
        session.commit()
        print(f"Memory cache hit: {len(segments_needing_translation)} segments")
        return results

    # Layer 3: AI API
    print(f"Translating {len(texts_to_translate)} segments")

    try:
        translations = ai_service.translate_batch(texts_to_translate, req.target_language)

        for batch_idx, translation in translations.items():
            seg = segment_index_map.get(batch_idx)
            if seg and translation:
                seg.translation = translation
                session.add(seg)
                results.append({"id": str(seg.id), "translation": translation})
                cache.set(seg.text, req.target_language, translation)

        session.commit()
        return results

    except Exception as e:
        print(f"ERROR in translate_segments: {e}")
        raise HTTPException(status_code=500, detail=str(e))
