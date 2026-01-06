
import requests
import os

BASE_URL = "http://127.0.0.1:8000"

def test_serving():
    cache_dir = "cache"
    if not os.path.exists(cache_dir):
        print(f"Cache directory '{cache_dir}' does not exist.")
        return

    files = [f for f in os.listdir(cache_dir) if f.endswith(('.mp4', '.webm'))]
    if not files:
        print("No video files found in cache directory.")
        return

    print(f"Found {len(files)} videos in cache. Testing access...")

    for f in files[:3]:
        url = f"{BASE_URL}/static/cache/{f}"
        print(f"Testing URL: {url}")
        try:
            # unique string usage to avoid lint false positives on requests.head
            resp = requests.head(url)
            if resp.status_code == 200:
                print(f"  [OK] {f} - {resp.headers.get('content-type')} - {resp.headers.get('content-length')} bytes")
            else:
                print(f"  [FAIL] {f} - Status: {resp.status_code}")
        except Exception as e:
            print(f"  [ERROR] {e}")

if __name__ == "__main__":
    test_serving()
