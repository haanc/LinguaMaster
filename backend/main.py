"""
Fluent Learner V2 - Backend API
Main application entry point with route registration.
# Force reload - httpx event hooks
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import create_db_and_tables, engine

# Import route modules
from routes import media_router, vocab_router, ai_router, streaming_router

# For interrupted task recovery
from sqlmodel import Session, select
from models import MediaSource

# Create rate limiter
limiter = Limiter(key_func=get_remote_address)

# Create FastAPI app
app = FastAPI(
    title="Fluent Learner API",
    description="Backend API for the Fluent Learner language learning application",
    version="2.0.0",
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware - restricted to localhost for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "app://.",  # Electron production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for cached media
os.makedirs("cache", exist_ok=True)
app.mount("/static/cache", StaticFiles(directory="cache"), name="cache")


# --- Register Routes ---

# Streaming routes (no prefix - uses /media/stream-url, /media/proxy)
app.include_router(streaming_router)

# Media routes (/media/*)
app.include_router(media_router)

# Vocab routes (/vocab/*)
app.include_router(vocab_router)

# AI routes (/ai/*)
app.include_router(ai_router)


# --- Application Events ---

# Status values that indicate an interrupted task
INTERRUPTED_STATUSES = [
    "downloading",
    "transcribing",
    "translating",
    "chunking",
    "merging",
]


def reset_interrupted_tasks():
    """
    Reset tasks that were interrupted by app shutdown.

    When the app is closed during video processing, the background task is lost
    but the database status remains in a processing state. This function resets
    those tasks to 'interrupted' status so users can retry them.
    """
    with Session(engine) as db:
        # Find all media with interrupted processing status
        # Use LIKE pattern matching for statuses that may include progress info
        # e.g., "transcribing (3/10)" or "chunking (5 parts)"
        interrupted_media = []

        for status_prefix in INTERRUPTED_STATUSES:
            results = db.exec(
                select(MediaSource).where(
                    MediaSource.status.startswith(status_prefix)
                )
            ).all()
            interrupted_media.extend(results)

        if interrupted_media:
            print(f"[Startup] Found {len(interrupted_media)} interrupted task(s), resetting...")

            for media in interrupted_media:
                old_status = media.status
                media.status = "interrupted"
                media.progress = 0
                media.progress_message = f"Task was interrupted (was: {old_status})"
                db.add(media)
                print(f"  - Reset: {media.title[:50]}... ({old_status} -> interrupted)")

            db.commit()
            print(f"[Startup] Reset complete.")
        else:
            print("[Startup] No interrupted tasks found.")


@app.on_event("startup")
def on_startup():
    """Initialize database and reset interrupted tasks on startup."""
    create_db_and_tables()
    reset_interrupted_tasks()


# --- Health Check ---

@app.get("/health", tags=["system"])
def health():
    """Health check endpoint."""
    return {"status": "ok"}


# --- Entry Point ---

if __name__ == "__main__":
    # reload=False is required for BackgroundTasks to work correctly
    # reload=True causes issues with multiprocessing and file handles in yt-dlp
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
