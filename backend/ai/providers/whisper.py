"""
Whisper Provider Abstraction
Provides a unified interface for different speech-to-text backends.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Dict, Any

from ..config import get_config, AIConfig


class TranscriptionSegment:
    """Standard segment format returned by all Whisper providers."""

    def __init__(self, index: int, start_time: float, end_time: float, text: str):
        self.index = index
        self.start_time = start_time
        self.end_time = end_time
        self.text = text

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "text": self.text,
        }


class WhisperProvider(ABC):
    """Abstract base class for Whisper/STT providers."""

    @abstractmethod
    def transcribe(self, audio_path: str) -> List[TranscriptionSegment]:
        """
        Transcribe audio file to text segments.

        Args:
            audio_path: Path to the audio file

        Returns:
            List of TranscriptionSegment objects
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for logging/debugging."""
        pass


class AzureWhisperProvider(WhisperProvider):
    """Azure OpenAI Whisper provider."""

    def __init__(self, config: AIConfig):
        self.config = config.azure
        self._client = None

    @property
    def name(self) -> str:
        return f"Azure Whisper ({self.config.whisper_deployment})"

    @property
    def client(self):
        if self._client is None:
            from openai import AzureOpenAI

            self._client = AzureOpenAI(
                api_key=self.config.api_key,
                api_version=self.config.api_version,
                azure_endpoint=self.config.endpoint,
            )
        return self._client

    def transcribe(self, audio_path: str) -> List[TranscriptionSegment]:
        audio_file_path = Path(audio_path)
        if not audio_file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        with open(audio_file_path, "rb") as audio_file:
            transcript = self.client.audio.transcriptions.create(
                model=self.config.whisper_deployment,
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        return self._parse_response(transcript)

    def _parse_response(self, transcript) -> List[TranscriptionSegment]:
        segments = []
        if hasattr(transcript, "segments"):
            for i, seg in enumerate(transcript.segments):
                segments.append(
                    TranscriptionSegment(
                        index=i,
                        start_time=seg.start,
                        end_time=seg.end,
                        text=seg.text.strip(),
                    )
                )
        else:
            # Fallback for short audio without segments
            segments.append(
                TranscriptionSegment(
                    index=0,
                    start_time=0.0,
                    end_time=getattr(transcript, "duration", 0.0),
                    text=transcript.text,
                )
            )
        return segments


class OpenAIWhisperProvider(WhisperProvider):
    """Standard OpenAI Whisper provider."""

    def __init__(self, config: AIConfig):
        self.config = config.openai
        self._client = None

    @property
    def name(self) -> str:
        return f"OpenAI Whisper ({self.config.whisper_model})"

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI(api_key=self.config.api_key)
        return self._client

    def transcribe(self, audio_path: str) -> List[TranscriptionSegment]:
        audio_file_path = Path(audio_path)
        if not audio_file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        with open(audio_file_path, "rb") as audio_file:
            transcript = self.client.audio.transcriptions.create(
                model=self.config.whisper_model,
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        return self._parse_response(transcript)

    def _parse_response(self, transcript) -> List[TranscriptionSegment]:
        segments = []
        if hasattr(transcript, "segments"):
            for i, seg in enumerate(transcript.segments):
                segments.append(
                    TranscriptionSegment(
                        index=i,
                        start_time=seg.start,
                        end_time=seg.end,
                        text=seg.text.strip(),
                    )
                )
        else:
            segments.append(
                TranscriptionSegment(
                    index=0,
                    start_time=0.0,
                    end_time=getattr(transcript, "duration", 0.0),
                    text=transcript.text,
                )
            )
        return segments


class LocalWhisperProvider(WhisperProvider):
    """
    Local Whisper provider using whisper.cpp or faster-whisper.
    Placeholder for future implementation.
    """

    def __init__(self, config: AIConfig):
        self.config = config

    @property
    def name(self) -> str:
        return "Local Whisper (not implemented)"

    def transcribe(self, audio_path: str) -> List[TranscriptionSegment]:
        raise NotImplementedError(
            "Local Whisper is not yet implemented. "
            "Please configure Azure or OpenAI Whisper in .env"
        )


# Provider registry
_PROVIDERS = {
    "azure": AzureWhisperProvider,
    "openai": OpenAIWhisperProvider,
    "local": LocalWhisperProvider,
}


def get_whisper_provider(config: AIConfig = None) -> WhisperProvider:
    """
    Factory function to get the appropriate Whisper provider.

    Args:
        config: Optional AIConfig. If not provided, uses global config.

    Returns:
        A WhisperProvider instance based on configuration.
    """
    if config is None:
        config = get_config()

    provider_type = config.whisper_provider
    provider_class = _PROVIDERS.get(provider_type)

    if provider_class is None:
        raise ValueError(f"Unknown Whisper provider: {provider_type}")

    provider = provider_class(config)
    print(f"Whisper Provider: {provider.name}")
    return provider
