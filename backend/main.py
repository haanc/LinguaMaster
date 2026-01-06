"""
Fluent Learner V2 - Backend API
Main application entry point with route registration.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from database import create_db_and_tables

# Import route modules
from routes import media_router, vocab_router, ai_router, streaming_router

# Create FastAPI app
app = FastAPI(
    title="Fluent Learner API",
    description="Backend API for the Fluent Learner language learning application",
    version="2.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.on_event("startup")
def on_startup():
    """Initialize database on startup."""
    create_db_and_tables()


# --- Health Check ---

@app.get("/health", tags=["system"])
def health():
    """Health check endpoint."""
    return {"status": "ok"}


# --- Entry Point ---

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
