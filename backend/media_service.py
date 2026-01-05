import yt_dlp
import os

class MediaService:
    def __init__(self, download_dir="cache"):
        self.download_dir = download_dir
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)

    def fetch_metadata(self, url: str):
        """Fetch video metadata using yt-dlp."""
        ydl_opts = {
            'quiet': True, # Keep it quiet to clean up terminal
            'no_warnings': False,
            # Strictly prefer progressive HTTP/HTTPS mp4. Exclude manifests.
            # 22 = 720p mp4, 18 = 360p mp4 (standard youtube progressive)
            'format': 'best[protocol^=http][protocol!*=m3u8][protocol!*=dash][ext=mp4]/best[ext=mp4]', 
            'nocheckcertificate': True,
            'javascript_runtime': 'node',
            'socket_timeout': 15, # Prevent hanging
            'retries': 10, # Retry on network error
            'fragment_retries': 10, # Retry on fragment error
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
                stream_url = info.get('url')
                
                print(f"DEBUG: Selected Format ID: {info.get('format_id')}")
                print(f"DEBUG: Selected Protocol: {info.get('protocol')}")
                print(f"DEBUG: Final Stream URL: {stream_url[:100]}...")
                if not stream_url and 'formats' in info:
                    # Look for the best mp4 format
                    mp4_formats = [f for f in info['formats'] if f.get('ext') == 'mp4' and f.get('url')]
                    if mp4_formats:
                        stream_url = mp4_formats[-1]['url']
                
                print(f"DEBUG: Found stream URL for {url}: {'Yes' if stream_url else 'No'}")
                
                return {
                    "title": info.get('title'),
                    "duration": info.get('duration'),
                    "thumbnail": info.get('thumbnail'),
                    "url": stream_url,
                    "original_url": url,
                    "uploader": info.get('uploader'),
                    "webpage_url": info.get('webpage_url')
                }
            except Exception as e:
                print(f"ERROR fetching metadata: {str(e)}")
                raise e

    def download_audio(self, url: str) -> str:
        """Download AUDIO ONLY using yt-dlp to local cache."""
        ydl_opts = {
            'outtmpl': f'{self.download_dir}/%(id)s.%(ext)s',
            'format': 'bestaudio/best', # Audio only
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'force_overwrites': True,
            'socket_timeout': 30, 
            'retries': 10,
            'fragment_retries': 10,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            # After post-processing, the file is .mp3
            # yt-dlp info dict 'filepath' might point to temp file, so we construct expected path
            video_id = info['id']
            audio_path = os.path.abspath(f"{self.download_dir}/{video_id}.mp3")
            
            if not os.path.exists(audio_path):
                # Fallback check if it didn't convert?
                raise FileNotFoundError(f"Audio file not found at {audio_path}")
                
            return audio_path

    def fetch_stream_url(self, video_id_or_url: str) -> str:
        """
        Fetch the DIRECT video stream URL using yt-dlp (get-url).
        We use the backend's yt-dlp to get a link, then proxy it.
        Because we run yt-dlp locally, it uses the server's IP,
        matching the subsequent requests proxy will make.
        """
        # Construct full URL if just ID
        if "http" not in video_id_or_url:
            url = f"https://www.youtube.com/watch?v={video_id_or_url}"
        else:
            url = video_id_or_url
            
        print(f"DEBUG: Fetching stream URL for {url} via yt-dlp...")
        
        # We want "best video" stream that is NOT dash (if possible) or just best generic.
        # But actually, 'best' usually gives a combiner url or video+audio if pre-merged exists.
        # For streaming, we often want 'best[ext=mp4]' or similar. 
        # Actually 'best' is fine if we proxy it.
        
        cmd = [
            "yt_dlp",
            "-g", # Get URL
            "-f", "best[ext=mp4]/best", # Prefer mp4 for browser compatibility
            url
        ]
        
        # Add proxy env if needed (handled by env vars usually)
        
        try:
            # Run yt-dlp
            result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stream_url = result.stdout.strip().split('\n')[0] # It might return video_url\naudio_url
            
            if not stream_url:
                raise ValueError("yt-dlp returned data but no URL found")
                
            print(f"DEBUG: detailed stream url found: {stream_url[:50]}...")
            return stream_url
            
        except subprocess.CalledProcessError as e:
            print(f"ERROR: yt-dlp get-url failed: {e.stderr}")
            raise RuntimeError(f"Failed to get stream URL: {e.stderr}")


media_service = MediaService()
