"""
Local Whisper Provider using faster-whisper
Provides offline speech-to-text transcription with model download on first use.
"""

import os
import sys
import json
import hashlib
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from threading import Lock
import urllib.request
import shutil

from .whisper import WhisperProvider, TranscriptionSegment
from ..config import LocalWhisperConfig  # Import from config to avoid duplication

logger = logging.getLogger(__name__)

# Model configurations with Hugging Face URLs
WHISPER_MODELS = {
    "tiny": {
        "size_mb": 75,
        "url": "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/model.bin",
        "description": "Fastest, lowest accuracy (~10x speed)",
        "vram_gb": 1,
    },
    "base": {
        "size_mb": 142,
        "url": "https://huggingface.co/Systran/faster-whisper-base/resolve/main/model.bin",
        "description": "Good balance of speed and accuracy (~7x speed)",
        "vram_gb": 1,
    },
    "small": {
        "size_mb": 466,
        "url": "https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin",
        "description": "Better accuracy, moderate speed (~4x speed)",
        "vram_gb": 2,
    },
    "medium": {
        "size_mb": 1500,
        "url": "https://huggingface.co/Systran/faster-whisper-medium/resolve/main/model.bin",
        "description": "High accuracy, slower (~2x speed)",
        "vram_gb": 5,
    },
    "large-v3": {
        "size_mb": 2900,
        "url": "https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main/model.bin",
        "description": "Best accuracy, slowest (1x speed)",
        "vram_gb": 10,
    },
}


class ModelDownloadManager:
    """Manages Whisper model downloads with progress tracking."""

    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self._download_lock = Lock()
        self._progress_callbacks: List[Callable[[str, float], None]] = []

    def add_progress_callback(self, callback: Callable[[str, float], None]):
        """Add a callback for download progress updates."""
        self._progress_callbacks.append(callback)

    def _notify_progress(self, status: str, progress: float):
        """Notify all callbacks of progress."""
        for callback in self._progress_callbacks:
            try:
                callback(status, progress)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")

    def get_model_path(self, model_name: str) -> Path:
        """Get the path where a model should be stored."""
        return self.models_dir / model_name

    def is_model_downloaded(self, model_name: str) -> bool:
        """Check if a model is already downloaded and valid."""
        model_path = self.get_model_path(model_name)
        # faster-whisper expects a directory with model files
        return (model_path / "model.bin").exists() or model_path.exists()

    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get list of all models with their status."""
        models = []
        for name, info in WHISPER_MODELS.items():
            models.append({
                "name": name,
                "size_mb": info["size_mb"],
                "description": info["description"],
                "vram_gb": info["vram_gb"],
                "downloaded": self.is_model_downloaded(name),
            })
        return models

    def download_model(
        self,
        model_name: str,
        progress_callback: Optional[Callable[[float], None]] = None
    ) -> Path:
        """
        Download a Whisper model if not already present.
        Uses faster-whisper's built-in download from Hugging Face.

        Args:
            model_name: Name of the model (tiny, base, small, medium, large-v3)
            progress_callback: Optional callback(progress: 0.0-1.0)

        Returns:
            Path to the downloaded model
        """
        if model_name not in WHISPER_MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {list(WHISPER_MODELS.keys())}")

        with self._download_lock:
            model_path = self.get_model_path(model_name)

            if self.is_model_downloaded(model_name):
                logger.info(f"Model {model_name} already downloaded at {model_path}")
                if progress_callback:
                    progress_callback(1.0)
                return model_path

            # Create models directory
            self.models_dir.mkdir(parents=True, exist_ok=True)

            logger.info(f"Downloading Whisper model: {model_name}")
            self._notify_progress(f"Downloading {model_name} model...", 0.0)

            try:
                # Use faster-whisper's download mechanism
                # It will download to the specified directory
                from faster_whisper import WhisperModel

                # This triggers the download with caching
                # faster-whisper downloads from Hugging Face automatically
                model = WhisperModel(
                    model_name,
                    device="cpu",  # Use CPU for initial download
                    download_root=str(self.models_dir),
                )

                # Clean up the model instance after download
                del model

                if progress_callback:
                    progress_callback(1.0)
                self._notify_progress(f"Model {model_name} downloaded successfully", 1.0)

                return model_path

            except ImportError:
                raise ImportError(
                    "faster-whisper is not installed. "
                    "Install it with: pip install faster-whisper"
                )
            except Exception as e:
                logger.error(f"Failed to download model {model_name}: {e}")
                self._notify_progress(f"Download failed: {e}", -1.0)
                raise

    def delete_model(self, model_name: str) -> bool:
        """Delete a downloaded model to free up space."""
        model_path = self.get_model_path(model_name)
        if model_path.exists():
            shutil.rmtree(model_path)
            logger.info(f"Deleted model: {model_name}")
            return True
        return False

    def get_disk_usage(self) -> Dict[str, int]:
        """Get disk usage for downloaded models."""
        usage = {}
        for name in WHISPER_MODELS:
            model_path = self.get_model_path(name)
            if model_path.exists():
                size = sum(f.stat().st_size for f in model_path.rglob("*") if f.is_file())
                usage[name] = size
        return usage


class LocalWhisperProvider(WhisperProvider):
    """
    Local Whisper provider using faster-whisper.
    Downloads models on first use and supports GPU acceleration.
    """

    def __init__(self, config: LocalWhisperConfig):
        self.config = config
        self._model = None
        self._model_lock = Lock()
        self.download_manager = ModelDownloadManager(config.models_path)

    @property
    def name(self) -> str:
        return f"Local Whisper ({self.config.model_name})"

    def _detect_device(self) -> tuple[str, str]:
        """Detect the best available device and compute type."""
        device = self.config.device
        compute_type = self.config.compute_type

        if device == "auto":
            try:
                import torch
                if torch.cuda.is_available():
                    device = "cuda"
                    logger.info("CUDA GPU detected, using GPU acceleration")
                else:
                    device = "cpu"
                    logger.info("No CUDA GPU detected, using CPU")
            except ImportError:
                device = "cpu"
                logger.info("PyTorch not installed, using CPU")

        if compute_type == "auto":
            if device == "cuda":
                compute_type = "float16"  # Best for GPU
            else:
                compute_type = "int8"  # Best for CPU (faster, less memory)

        return device, compute_type

    def _ensure_model_loaded(self):
        """Ensure the model is loaded, downloading if necessary."""
        if self._model is not None:
            return

        with self._model_lock:
            if self._model is not None:
                return

            try:
                from faster_whisper import WhisperModel
            except ImportError:
                raise ImportError(
                    "faster-whisper is not installed. "
                    "Install it with: pip install faster-whisper"
                )

            model_name = self.config.model_name
            device, compute_type = self._detect_device()

            logger.info(f"Loading Whisper model: {model_name} on {device} ({compute_type})")

            # This will download if not present
            self._model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(self.config.models_path),
            )

            logger.info(f"Whisper model loaded successfully: {model_name}")

    def transcribe(self, audio_path: str) -> List[TranscriptionSegment]:
        """
        Transcribe audio file to text segments.

        Args:
            audio_path: Path to the audio file

        Returns:
            List of TranscriptionSegment objects
        """
        audio_file = Path(audio_path)
        if not audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        self._ensure_model_loaded()

        logger.info(f"Transcribing: {audio_path}")

        # Transcribe with word-level timestamps and optimized VAD parameters
        # Increase min_silence_duration to avoid splitting mid-sentence
        segments_gen, info = self._model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,  # Filter out silence
            vad_parameters={
                "min_silence_duration_ms": 700,  # Require 700ms silence to split (default: 400ms)
                "speech_pad_ms": 200,  # Pad speech with 200ms (default: 30ms)
            },
        )

        logger.info(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")

        segments = []
        for i, seg in enumerate(segments_gen):
            segments.append(
                TranscriptionSegment(
                    index=i,
                    start_time=seg.start,
                    end_time=seg.end,
                    text=seg.text.strip(),
                )
            )

        logger.info(f"Transcription complete: {len(segments)} segments")
        return segments

    def transcribe_with_progress(
        self,
        audio_path: str,
        progress_callback: Callable[[float, str], None]
    ) -> List[TranscriptionSegment]:
        """
        Transcribe with progress updates.

        Args:
            audio_path: Path to the audio file
            progress_callback: Callback(progress: 0.0-1.0, status: str)

        Returns:
            List of TranscriptionSegment objects
        """
        audio_file = Path(audio_path)
        if not audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Check if model needs download
        if not self.download_manager.is_model_downloaded(self.config.model_name):
            progress_callback(0.0, "Downloading Whisper model...")
            self.download_manager.download_model(
                self.config.model_name,
                progress_callback=lambda p: progress_callback(p * 0.3, f"Downloading model: {p*100:.0f}%")
            )

        progress_callback(0.3, "Loading model...")
        self._ensure_model_loaded()

        progress_callback(0.4, "Transcribing audio...")

        # Get audio duration for progress estimation
        try:
            import subprocess
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
                capture_output=True, text=True
            )
            total_duration = float(result.stdout.strip())
        except:
            total_duration = None

        segments_gen, info = self._model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": 700,
                "speech_pad_ms": 200,
            },
        )

        segments = []
        for i, seg in enumerate(segments_gen):
            segments.append(
                TranscriptionSegment(
                    index=i,
                    start_time=seg.start,
                    end_time=seg.end,
                    text=seg.text.strip(),
                )
            )

            # Update progress based on audio position
            if total_duration and total_duration > 0:
                audio_progress = min(seg.end / total_duration, 1.0)
                overall_progress = 0.4 + (audio_progress * 0.6)
                progress_callback(overall_progress, f"Transcribing: {seg.end:.1f}s / {total_duration:.1f}s")

        progress_callback(1.0, "Transcription complete")
        return segments

    def is_available(self) -> bool:
        """Check if local Whisper is available (faster-whisper installed)."""
        try:
            from faster_whisper import WhisperModel
            return True
        except ImportError:
            return False

    def get_model_status(self) -> Dict[str, Any]:
        """Get current model status and available models."""
        return {
            "current_model": self.config.model_name,
            "is_loaded": self._model is not None,
            "device": self.config.device,
            "compute_type": self.config.compute_type,
            "models_dir": str(self.config.models_path),
            "available_models": self.download_manager.get_available_models(),
            "disk_usage": self.download_manager.get_disk_usage(),
        }

    def unload_model(self):
        """Unload the model to free up memory."""
        with self._model_lock:
            if self._model is not None:
                del self._model
                self._model = None
                logger.info("Whisper model unloaded")

                # Force garbage collection
                import gc
                gc.collect()

                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except ImportError:
                    pass
