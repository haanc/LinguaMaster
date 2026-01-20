"""
AI Routes
Handles AI-powered features: word lookup, context explanation, and tutor chat.
Also provides local Whisper model management endpoints.
"""

from threading import Lock
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ai_service import ai_service
from ai.config import get_config
from ai.dependencies import get_request_llm_provider
from ai.providers.llm import LLMProvider

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


class TestConnectionRequest(BaseModel):
    """Request model for testing LLM connection."""
    pass  # Config comes from X-LLM-Config header


# --- Endpoints ---

@router.post("/lookup-word")
def lookup_word(req: LookupRequest, llm_provider: LLMProvider = Depends(get_request_llm_provider)):
    """
    Look up a word's definition, pronunciation, and translation in context.

    If sentence_translation is provided, uses an optimized chain that's faster
    and uses fewer tokens by extracting the word translation from context.

    Accepts X-LLM-Config header for user-configured LLM.
    """
    return ai_service.lookup_word_with_provider(
        req.word,
        req.context,
        req.target_language,
        req.sentence_translation,
        llm_provider,
    )


@router.post("/explain")
def explain_context(req: ExplainRequest, llm_provider: LLMProvider = Depends(get_request_llm_provider)):
    """
    Explain grammar and cultural context of a text passage.

    Accepts X-LLM-Config header for user-configured LLM.
    """
    return ai_service.explain_context_with_provider(req.text, req.target_language, llm_provider)


@router.post("/chat")
def chat_tutor(req: ChatRequest, llm_provider: LLMProvider = Depends(get_request_llm_provider)):
    """
    Chat with the AI language tutor.
    The tutor only answers questions related to the provided context text.

    Accepts X-LLM-Config header for user-configured LLM.
    """
    return ai_service.chat_with_tutor_with_provider(
        req.messages, req.context, req.target_language, llm_provider
    )


@router.post("/test-connection")
def test_llm_connection(llm_provider: LLMProvider = Depends(get_request_llm_provider)):
    """
    Test connection to the configured LLM provider.

    Sends a simple request to verify the API key and endpoint are valid.
    Returns provider info and a simple test response.
    """
    try:
        llm = llm_provider.get_chat_model(temperature=0.0)
        response = llm.invoke("Say 'Hello' in exactly one word.")

        return {
            "success": True,
            "provider": llm_provider.name,
            "test_response": response.content[:100] if hasattr(response, "content") else str(response)[:100],
        }
    except Exception as e:
        import traceback
        print(f"LLM Test Connection Error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return {
            "success": False,
            "provider": llm_provider.name,
            "error": str(e),
        }


# --- Local Whisper Model Management ---

class ModelDownloadRequest(BaseModel):
    model_name: str  # tiny, base, small, medium, large-v3


class WhisperProviderSwitchRequest(BaseModel):
    provider: str  # "local", "azure", "openai"


# Thread-safe download progress tracking
_download_progress: Dict[str, Dict] = {}
_progress_lock = Lock()


def _get_progress(model_name: str) -> Optional[Dict]:
    """Thread-safe getter for download progress."""
    with _progress_lock:
        return _download_progress.get(model_name)


def _set_progress(model_name: str, progress: Dict) -> None:
    """Thread-safe setter for download progress."""
    with _progress_lock:
        _download_progress[model_name] = progress


@router.get("/whisper/status")
def get_whisper_status():
    """
    Get current Whisper provider status and available models.
    Returns info about which provider is active and local model availability.
    """
    config = get_config()

    result = {
        "current_provider": config.whisper_provider,
        "local_whisper_available": False,
        "local_models": [],
        "azure_configured": config.azure.is_configured,
        "openai_configured": config.openai.is_configured,
    }

    # Check if faster-whisper is installed
    try:
        import faster_whisper
        result["local_whisper_available"] = True

        # Get local model status
        from ai.providers.local_whisper import ModelDownloadManager
        from ai.config import LocalWhisperConfig
        local_config = LocalWhisperConfig.from_env()
        manager = ModelDownloadManager(local_config.models_path)
        result["local_models"] = manager.get_available_models()
        result["models_dir"] = str(local_config.models_path)
        result["disk_usage"] = manager.get_disk_usage()

    except ImportError:
        result["local_whisper_available"] = False
        result["install_command"] = "pip install faster-whisper"

    return result


@router.post("/whisper/download-model")
def download_whisper_model(req: ModelDownloadRequest, background_tasks: BackgroundTasks):
    """
    Start downloading a Whisper model in the background.
    Use GET /ai/whisper/download-progress/{model_name} to check progress.
    """
    try:
        from ai.providers.local_whisper import ModelDownloadManager, WHISPER_MODELS
        from ai.config import LocalWhisperConfig
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="faster-whisper is not installed. Run: pip install faster-whisper"
        )

    if req.model_name not in WHISPER_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {req.model_name}. Available: {list(WHISPER_MODELS.keys())}"
        )

    local_config = LocalWhisperConfig.from_env()
    manager = ModelDownloadManager(local_config.models_path)

    # Check if already downloaded
    if manager.is_model_downloaded(req.model_name):
        return {
            "status": "already_downloaded",
            "model": req.model_name,
            "path": str(manager.get_model_path(req.model_name))
        }

    # Initialize progress tracking
    _set_progress(req.model_name, {
        "status": "starting",
        "progress": 0.0,
        "message": "Initializing download..."
    })

    def do_download():
        def progress_callback(progress: float):
            _set_progress(req.model_name, {
                "status": "downloading",
                "progress": progress,
                "message": f"Downloading: {progress*100:.1f}%"
            })

        try:
            manager.download_model(req.model_name, progress_callback)
            _set_progress(req.model_name, {
                "status": "completed",
                "progress": 1.0,
                "message": "Download complete"
            })
        except Exception as e:
            _set_progress(req.model_name, {
                "status": "error",
                "progress": 0.0,
                "message": str(e)
            })

    background_tasks.add_task(do_download)

    return {
        "status": "started",
        "model": req.model_name,
        "size_mb": WHISPER_MODELS[req.model_name]["size_mb"],
        "message": "Download started in background"
    }


@router.get("/whisper/download-progress/{model_name}")
def get_download_progress(model_name: str):
    """Get the download progress for a specific model."""
    progress = _get_progress(model_name)
    if progress is None:
        # Check if model exists
        try:
            from ai.providers.local_whisper import ModelDownloadManager
            from ai.config import LocalWhisperConfig
            local_config = LocalWhisperConfig.from_env()
            manager = ModelDownloadManager(local_config.models_path)

            if manager.is_model_downloaded(model_name):
                return {
                    "status": "completed",
                    "progress": 1.0,
                    "message": "Model already downloaded"
                }
        except ImportError:
            pass

        return {
            "status": "not_started",
            "progress": 0.0,
            "message": "No download in progress"
        }

    return progress


@router.delete("/whisper/model/{model_name}")
def delete_whisper_model(model_name: str):
    """Delete a downloaded Whisper model to free up disk space."""
    try:
        from ai.providers.local_whisper import ModelDownloadManager
        from ai.config import LocalWhisperConfig
    except ImportError:
        raise HTTPException(status_code=500, detail="faster-whisper not installed")

    local_config = LocalWhisperConfig.from_env()
    manager = ModelDownloadManager(local_config.models_path)

    if not manager.is_model_downloaded(model_name):
        raise HTTPException(status_code=404, detail=f"Model {model_name} not found")

    success = manager.delete_model(model_name)
    if success:
        return {"status": "deleted", "model": model_name}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete model")
