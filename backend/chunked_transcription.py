"""
Chunked Transcription Service
Handles long video/audio transcription by splitting into chunks and processing concurrently.
"""

import os
import subprocess
import asyncio
import concurrent.futures
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional
from dataclasses import dataclass


@dataclass
class ChunkInfo:
    """Information about an audio chunk."""
    index: int
    path: str
    start_time: float  # Start time in the original audio (seconds)
    duration: float    # Duration of this chunk (seconds)


@dataclass
class TranscriptionProgress:
    """Progress information for transcription."""
    total_chunks: int
    completed_chunks: int
    current_chunk: int
    status: str  # 'chunking', 'transcribing', 'merging', 'done', 'error'
    message: str


class ChunkedTranscriptionService:
    """
    Service for transcribing long audio files by splitting them into chunks.

    Features:
    - Splits audio into chunks of configurable duration
    - Processes chunks concurrently for speed
    - Merges results with correct timestamp offsets
    - Provides progress callbacks
    """

    # Whisper API limit is 25MB, ~10 min of MP3 is safe
    DEFAULT_CHUNK_DURATION = 600  # 10 minutes in seconds
    MAX_CONCURRENT_CHUNKS = 3     # Parallel API calls

    def __init__(
        self,
        chunk_duration: int = DEFAULT_CHUNK_DURATION,
        max_concurrent: int = MAX_CONCURRENT_CHUNKS,
        temp_dir: str = "cache/chunks"
    ):
        self.chunk_duration = chunk_duration
        self.max_concurrent = max_concurrent
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)

    def get_audio_duration(self, audio_path: str) -> float:
        """Get the duration of an audio file using ffprobe."""
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return float(result.stdout.strip())
        except Exception as e:
            print(f"Error getting duration: {e}")
            return 0.0

    def split_audio(
        self,
        audio_path: str,
        progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None
    ) -> List[ChunkInfo]:
        """
        Split audio file into chunks using ffmpeg.

        Args:
            audio_path: Path to the source audio file
            progress_callback: Optional callback for progress updates

        Returns:
            List of ChunkInfo objects describing each chunk
        """
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Get total duration
        total_duration = self.get_audio_duration(str(audio_path))
        if total_duration == 0:
            raise ValueError("Could not determine audio duration")

        # If audio is short enough, no need to split
        if total_duration <= self.chunk_duration:
            return [ChunkInfo(
                index=0,
                path=str(audio_path),
                start_time=0.0,
                duration=total_duration
            )]

        # Calculate number of chunks
        num_chunks = int(total_duration / self.chunk_duration) + 1
        chunks: List[ChunkInfo] = []

        # Create unique subdirectory for this audio
        chunk_dir = Path(self.temp_dir) / audio_path.stem
        os.makedirs(chunk_dir, exist_ok=True)

        if progress_callback:
            progress_callback(TranscriptionProgress(
                total_chunks=num_chunks,
                completed_chunks=0,
                current_chunk=0,
                status="chunking",
                message=f"Splitting audio into {num_chunks} chunks..."
            ))

        for i in range(num_chunks):
            start_time = i * self.chunk_duration
            # Last chunk may be shorter
            duration = min(self.chunk_duration, total_duration - start_time)

            if duration <= 0:
                break

            chunk_path = chunk_dir / f"chunk_{i:04d}.mp3"

            # Use ffmpeg to extract chunk
            cmd = [
                "ffmpeg",
                "-y",  # Overwrite
                "-i", str(audio_path),
                "-ss", str(start_time),
                "-t", str(duration),
                "-acodec", "libmp3lame",
                "-q:a", "4",
                str(chunk_path)
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True)
                chunks.append(ChunkInfo(
                    index=i,
                    path=str(chunk_path),
                    start_time=start_time,
                    duration=duration
                ))
            except subprocess.CalledProcessError as e:
                print(f"Error creating chunk {i}: {e.stderr}")
                raise RuntimeError(f"Failed to create chunk {i}")

        return chunks

    def transcribe_chunk(
        self,
        chunk: ChunkInfo,
        whisper_provider
    ) -> List[Dict[str, Any]]:
        """
        Transcribe a single chunk and adjust timestamps.

        Args:
            chunk: ChunkInfo object
            whisper_provider: WhisperProvider instance

        Returns:
            List of segment dicts with adjusted timestamps
        """
        segments = whisper_provider.transcribe(chunk.path)

        # Adjust timestamps to account for chunk offset
        adjusted_segments = []
        for seg in segments:
            adjusted_segments.append({
                "index": seg.index,
                "start_time": seg.start_time + chunk.start_time,
                "end_time": seg.end_time + chunk.start_time,
                "text": seg.text,
                "chunk_index": chunk.index
            })

        return adjusted_segments

    async def transcribe_chunks_concurrent(
        self,
        chunks: List[ChunkInfo],
        whisper_provider,
        progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        Transcribe multiple chunks concurrently.

        Args:
            chunks: List of ChunkInfo objects
            whisper_provider: WhisperProvider instance
            progress_callback: Optional callback for progress updates

        Returns:
            Combined list of all segments with correct timestamps
        """
        all_segments: List[Dict[str, Any]] = []
        completed = 0
        total = len(chunks)

        # Use ThreadPoolExecutor for concurrent API calls
        loop = asyncio.get_event_loop()

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            # Create futures for all chunks
            futures = {
                executor.submit(self.transcribe_chunk, chunk, whisper_provider): chunk
                for chunk in chunks
            }

            # Process as they complete
            for future in concurrent.futures.as_completed(futures):
                chunk = futures[future]
                try:
                    segments = future.result()
                    all_segments.extend(segments)
                    completed += 1

                    if progress_callback:
                        progress_callback(TranscriptionProgress(
                            total_chunks=total,
                            completed_chunks=completed,
                            current_chunk=chunk.index,
                            status="transcribing",
                            message=f"Transcribed chunk {completed}/{total}"
                        ))

                except Exception as e:
                    print(f"Error transcribing chunk {chunk.index}: {e}")
                    raise

        return all_segments

    def _merge_short_segments(
        self,
        segments: List[Dict[str, Any]],
        min_duration: float = 2.0,
        max_merged_duration: float = 15.0
    ) -> List[Dict[str, Any]]:
        """
        Merge short segments that don't end with sentence-ending punctuation.

        Args:
            segments: Sorted list of segments
            min_duration: Minimum segment duration (seconds) before considering merge
            max_merged_duration: Maximum duration of merged segment

        Returns:
            List of segments with short fragments merged
        """
        if not segments:
            return segments

        # Sentence-ending punctuation (including CJK)
        sentence_endings = {'.', '!', '?', '。', '！', '？', '…'}

        merged = []
        current = None

        for seg in segments:
            if current is None:
                current = seg.copy()
                continue

            current_duration = current["end_time"] - current["start_time"]
            seg_duration = seg["end_time"] - seg["start_time"]
            current_text = current["text"].strip()

            # Check if current segment ends with sentence-ending punctuation
            ends_with_punctuation = current_text and current_text[-1] in sentence_endings

            # Merge conditions:
            # 1. Current segment is short AND doesn't end with punctuation
            # 2. Merged duration won't exceed max
            # 3. Gap between segments is small (< 1 second)
            gap = seg["start_time"] - current["end_time"]
            merged_duration = seg["end_time"] - current["start_time"]

            should_merge = (
                current_duration < min_duration and
                not ends_with_punctuation and
                merged_duration <= max_merged_duration and
                gap < 1.0
            )

            if should_merge:
                # Merge: extend current segment
                current["end_time"] = seg["end_time"]
                current["text"] = current["text"].strip() + " " + seg["text"].strip()
            else:
                # Don't merge: save current and start new
                merged.append(current)
                current = seg.copy()

        # Don't forget the last segment
        if current is not None:
            merged.append(current)

        if len(merged) < len(segments):
            print(f"  Merged {len(segments)} segments -> {len(merged)} segments")

        return merged

    def merge_segments(
        self,
        segments: List[Dict[str, Any]],
        progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        Merge and reindex segments from multiple chunks.

        Args:
            segments: List of segments from all chunks
            progress_callback: Optional callback for progress updates

        Returns:
            Merged and reindexed segment list
        """
        if progress_callback:
            progress_callback(TranscriptionProgress(
                total_chunks=0,
                completed_chunks=0,
                current_chunk=0,
                status="merging",
                message="Merging transcription segments..."
            ))

        # Sort by start_time to ensure correct order
        sorted_segments = sorted(segments, key=lambda s: s["start_time"])

        # Merge short segments that don't end with sentence-ending punctuation
        merged_segments = self._merge_short_segments(sorted_segments)

        # Reindex
        for i, seg in enumerate(merged_segments):
            seg["index"] = i
            # Remove chunk_index as it's no longer needed
            seg.pop("chunk_index", None)

        return merged_segments

    def cleanup_chunks(self, chunks: List[ChunkInfo]):
        """Remove temporary chunk files."""
        for chunk in chunks:
            # Don't delete the original file (index 0 when no splitting occurred)
            if chunk.index == 0 and not chunk.path.endswith(f"chunk_0000.mp3"):
                continue
            try:
                if os.path.exists(chunk.path):
                    os.remove(chunk.path)
            except Exception as e:
                print(f"Warning: Could not delete chunk {chunk.path}: {e}")

        # Try to remove chunk directory if empty
        if chunks and "chunk_" in chunks[0].path:
            chunk_dir = Path(chunks[0].path).parent
            try:
                if chunk_dir.exists() and not any(chunk_dir.iterdir()):
                    chunk_dir.rmdir()
            except Exception:
                pass

    async def transcribe_audio(
        self,
        audio_path: str,
        whisper_provider,
        progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None,
        cleanup: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Main entry point: transcribe an audio file with automatic chunking.

        Args:
            audio_path: Path to the audio file
            whisper_provider: WhisperProvider instance
            progress_callback: Optional callback for progress updates
            cleanup: Whether to delete chunk files after transcription

        Returns:
            List of transcribed segments with correct timestamps
        """
        chunks = []
        try:
            # Step 1: Split audio into chunks
            chunks = self.split_audio(audio_path, progress_callback)

            if len(chunks) == 1 and chunks[0].path == audio_path:
                # No splitting needed, use regular transcription
                if progress_callback:
                    progress_callback(TranscriptionProgress(
                        total_chunks=1,
                        completed_chunks=0,
                        current_chunk=0,
                        status="transcribing",
                        message="Transcribing audio (no chunking needed)..."
                    ))

                segments = whisper_provider.transcribe(audio_path)
                result = [seg.to_dict() for seg in segments]

                if progress_callback:
                    progress_callback(TranscriptionProgress(
                        total_chunks=1,
                        completed_chunks=1,
                        current_chunk=0,
                        status="done",
                        message="Transcription complete"
                    ))

                return result

            # Step 2: Transcribe chunks concurrently
            all_segments = await self.transcribe_chunks_concurrent(
                chunks, whisper_provider, progress_callback
            )

            # Step 3: Merge and reindex
            merged = self.merge_segments(all_segments, progress_callback)

            if progress_callback:
                progress_callback(TranscriptionProgress(
                    total_chunks=len(chunks),
                    completed_chunks=len(chunks),
                    current_chunk=0,
                    status="done",
                    message=f"Transcription complete: {len(merged)} segments"
                ))

            return merged

        finally:
            # Cleanup temp files
            if cleanup and chunks:
                self.cleanup_chunks(chunks)


# Singleton instance
chunked_transcription_service = ChunkedTranscriptionService()


# Synchronous wrapper for non-async contexts
def transcribe_audio_chunked(
    audio_path: str,
    whisper_provider,
    progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None,
    cleanup: bool = True
) -> List[Dict[str, Any]]:
    """
    Synchronous wrapper for chunked transcription.

    Use this in non-async contexts like FastAPI background tasks.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            chunked_transcription_service.transcribe_audio(
                audio_path, whisper_provider, progress_callback, cleanup
            )
        )
    finally:
        loop.close()
