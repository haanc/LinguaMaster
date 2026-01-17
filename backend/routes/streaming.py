"""
Streaming Routes
Handles video stream URL resolution and proxying.
"""

import asyncio
import os
import hashlib
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse, FileResponse
import httpx

from media_service import media_service

router = APIRouter(tags=["streaming"])

# Cache directory for merged Bilibili videos (legacy, kept for compatibility)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BILIBILI_CACHE_DIR = os.path.join(BACKEND_DIR, "cache", "bilibili")
os.makedirs(BILIBILI_CACHE_DIR, exist_ok=True)


def get_bilibili_cache_path(url: str) -> str:
    """Generate a cache file path for a Bilibili URL."""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    return os.path.join(BILIBILI_CACHE_DIR, f"{url_hash}.mp4")


async def get_bilibili_stream_url(url: str, format_spec: str) -> str:
    """
    Get direct stream URL for Bilibili video or audio.

    Args:
        url: Bilibili video URL
        format_spec: yt-dlp format specification (e.g., "bestvideo[vcodec^=avc1]" or "bestaudio")

    Returns:
        Direct CDN URL for the stream
    """
    cmd = ["yt-dlp", "-g", "-f", format_spec, "--no-playlist", url]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        error_msg = stderr.decode().strip()
        print(f"ERROR: yt-dlp failed for format {format_spec}: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to get stream URL: {error_msg}")

    stream_url = stdout.decode().strip().split("\n")[0]
    if not stream_url or not stream_url.startswith("http"):
        raise RuntimeError(f"Invalid stream URL returned for format {format_spec}")

    return stream_url


async def ffmpeg_stream_generator(video_url: str, audio_url: str):
    """
    Generator that yields chunks from FFmpeg's stdout.
    FFmpeg merges video and audio streams in real-time.
    """
    # HTTP headers for Bilibili CDN (防盗链)
    http_headers = "Referer: https://www.bilibili.com\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    ffmpeg_cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        # HTTP headers for video input
        "-headers", http_headers,
        "-i", video_url,
        # HTTP headers for audio input (need to specify again)
        "-headers", http_headers,
        "-i", audio_url,
        # Video: copy (no re-encoding)
        "-c:v", "copy",
        # Audio: convert to AAC for browser compatibility
        "-c:a", "aac",
        "-b:a", "128k",
        # Enable streaming-friendly MP4 output
        "-movflags", "frag_keyframe+empty_moov+faststart",
        # Output format
        "-f", "mp4",
        # Output to stdout
        "pipe:1"
    ]

    print(f"DEBUG: Starting FFmpeg stream merge", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        while True:
            chunk = await proc.stdout.read(65536)  # 64KB chunks
            if not chunk:
                break
            yield chunk
    except Exception as e:
        print(f"ERROR: FFmpeg streaming error: {e}", flush=True)
    finally:
        # Clean up process
        if proc.returncode is None:
            proc.terminate()
            await proc.wait()

        # Log any stderr output
        stderr_output = await proc.stderr.read()
        if stderr_output:
            print(f"DEBUG: FFmpeg stderr: {stderr_output.decode()}", flush=True)

        print(f"DEBUG: FFmpeg process finished with code {proc.returncode}", flush=True)


@router.get("/media/bilibili-stream")
async def stream_bilibili_realtime(url: str, request: Request):
    """
    Real-time streaming proxy for Bilibili videos.
    Uses FFmpeg to merge separate video and audio streams on-the-fly.

    This endpoint does NOT cache the video - it streams directly.
    Audio download for transcription is handled separately.
    """
    print(f"DEBUG: Bilibili real-time stream request: {url[:80]}...", flush=True)

    try:
        # Get video and audio stream URLs in parallel
        video_task = get_bilibili_stream_url(
            url,
            "bestvideo[vcodec^=avc1][ext=mp4]/bestvideo[vcodec^=avc1]/bestvideo[ext=mp4]/bestvideo"
        )
        audio_task = get_bilibili_stream_url(
            url,
            "bestaudio[ext=m4a]/bestaudio"
        )

        video_url, audio_url = await asyncio.gather(video_task, audio_task)

        print(f"DEBUG: Video URL: {video_url[:80]}...", flush=True)
        print(f"DEBUG: Audio URL: {audio_url[:80]}...", flush=True)

        # Return streaming response with FFmpeg output
        return StreamingResponse(
            ffmpeg_stream_generator(video_url, audio_url),
            media_type="video/mp4",
            headers={
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
            }
        )

    except Exception as e:
        print(f"ERROR: Bilibili stream failed: {str(e)}", flush=True)
        return Response(
            status_code=500,
            content=f"Stream failed: {str(e)}"
        )


@router.get("/media/stream-url")
async def get_stream_url(url: str):
    """Resolve a video URL to a direct stream URL (for HLS.js or direct playback)."""
    print(f"DEBUG: Resolving stream URL for: {url[:100]}...", flush=True)

    try:
        metadata = media_service.fetch_metadata(url)
        stream_url = metadata.get("url")

        if stream_url:
            print(f"DEBUG: Resolved stream URL successfully", flush=True)
            return {"stream_url": stream_url}
        else:
            print(f"WARN: No stream URL in metadata", flush=True)
            return {"stream_url": url}

    except Exception as e:
        print(f"ERROR: Failed to resolve stream URL: {e}", flush=True)
        return {"stream_url": url}


@router.get("/media/proxy")
async def proxy_video(url: str, request: Request):
    """Proxy video stream, resolving YouTube URLs and forwarding Range headers."""
    print(f"DEBUG: Proxy request for URL: {url[:100]}...", flush=True)

    # Special handling for Bilibili - needs download + merge
    if "bilibili.com/video" in url:
        return await handle_bilibili_proxy(url, request)

    target_url = url

    # 1. Resolve direct stream if needed
    if "youtube.com/watch" in url or "youtu.be" in url:
        print(f"DEBUG: Attempting to resolve direct stream for {url}", flush=True)
        try:
            cmd_args = [
                "yt-dlp",
                "-g",
                "-f", "best[protocol^=http][ext=mp4]/best[ext=mp4]/best",
                url,
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                candidate = stdout.decode().strip().split("\n")[0]
                if candidate and candidate.startswith("http"):
                    target_url = candidate
                    print(f"DEBUG: Resolved via yt-dlp: {target_url[:80]}...", flush=True)
                else:
                    print(f"WARN: yt-dlp returned no http link", flush=True)
            else:
                print(f"WARN: yt-dlp failed. Stderr: {stderr.decode()}", flush=True)

        except Exception as e:
            print(f"WARN: Failed to resolve stream URL: {e}", flush=True)

    # 2. Prepare headers for upstream
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header
        print(f"DEBUG: Forwarding Range: {range_header}", flush=True)

    # 3. Request upstream and stream response
    client = httpx.AsyncClient()
    try:
        req = client.build_request("GET", target_url, headers=headers, timeout=30.0)
        r = await client.send(req, stream=True)

        if r.status_code >= 400:
            print(f"DEBUG: Upstream Error: {r.status_code}", flush=True)
            await r.aclose()
            return Response(status_code=r.status_code)

        # Forward headers for Range support
        forward_headers = {}
        for h in ["Content-Range", "Content-Length", "Accept-Ranges", "Content-Type"]:
            if h in r.headers:
                forward_headers[h] = r.headers[h]

        media_type = forward_headers.get("Content-Type", "video/mp4")

        async def stream_generator():
            try:
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_generator(),
            status_code=r.status_code,
            headers=forward_headers,
            media_type=media_type,
        )
    except Exception as e:
        print(f"ERROR: Proxy failed: {str(e)}", flush=True)
        await client.aclose()
        return Response(status_code=500, content="Proxy Error")


async def handle_bilibili_proxy(url: str, request: Request):
    """
    Handle Bilibili video proxy by downloading and merging video+audio.
    Uses caching to avoid re-downloading.
    """
    cache_path = get_bilibili_cache_path(url)

    # Check if already cached
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        print(f"DEBUG: Serving Bilibili from cache: {cache_path}", flush=True)
        return FileResponse(
            cache_path,
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"}
        )

    # Download and merge video+audio
    print(f"DEBUG: Downloading Bilibili video: {url}", flush=True)
    try:
        # Use %(id)s to get consistent naming, then rename
        temp_pattern = cache_path.replace(".mp4", ".%(ext)s")

        cmd_args = [
            "yt-dlp",
            # Prefer H.264 (avc1) for browser compatibility, avoid AV1/HEVC
            "-f", "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/best[vcodec^=avc1]/best",
            "--merge-output-format", "mp4",
            "-o", temp_pattern,
            "--no-playlist",
            "--no-part",  # Don't use .part files
            url,
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        stdout_text = stdout.decode()
        stderr_text = stderr.decode()
        print(f"DEBUG: yt-dlp stdout: {stdout_text}", flush=True)
        print(f"DEBUG: yt-dlp stderr: {stderr_text}", flush=True)

        if proc.returncode != 0:
            print(f"ERROR: yt-dlp download failed: {stderr_text}", flush=True)
            return Response(status_code=500, content=f"Download failed: {stderr_text[:200]}")

        # Find the downloaded file (might have different extension)
        cache_dir = os.path.dirname(cache_path)
        base_name = os.path.basename(cache_path).replace(".mp4", "")

        # Look for any matching file
        for f in os.listdir(cache_dir):
            if f.startswith(base_name) and f.endswith(".mp4"):
                actual_path = os.path.join(cache_dir, f)
                # Rename to expected path if different
                if actual_path != cache_path:
                    os.rename(actual_path, cache_path)
                break

        if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
            print(f"DEBUG: Bilibili download complete, serving: {cache_path}", flush=True)
            return FileResponse(
                cache_path,
                media_type="video/mp4",
                headers={"Accept-Ranges": "bytes"}
            )
        else:
            return Response(status_code=500, content="Download completed but file not found")

    except Exception as e:
        print(f"ERROR: Bilibili proxy failed: {str(e)}", flush=True)
        return Response(status_code=500, content=str(e))
