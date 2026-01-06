"""
Streaming Routes
Handles video stream URL resolution and proxying.
"""

import asyncio
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
import httpx

from media_service import media_service

router = APIRouter(tags=["streaming"])


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
    target_url = url

    # 1. Resolve direct stream if needed
    if "youtube.com/watch" in url or "youtu.be" in url or "bilibili.com/video" in url:
        print(f"DEBUG: Attempting to resolve direct stream for {url}", flush=True)
        try:
            cmd_args = [
                "yt-dlp",
                "-g",
                "-f", "b",  # Best pre-merged format
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
    if "bilibili.com" in target_url:
        headers["Referer"] = "https://www.bilibili.com/"

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
