from __future__ import annotations
from youtube_transcript_api import YouTubeTranscriptApi
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, parse_qs
import requests
import httpx

_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(_BROWSER_HEADERS)
    return s

class YouTubeService:
    @staticmethod
    def extract_video_id(url: str) -> Optional[str]:
        # Handle https://youtu.be/<id>
        if "youtu.be" in url:
            return url.split("/")[-1].split("?")[0]
        # Handle https://www.youtube.com/watch?v=<id>
        parsed = urlparse(url)
        if "youtube.com" in parsed.netloc:
            qs = parse_qs(parsed.query)
            return qs.get("v", [None])[0]
        return None

    @staticmethod
    def get_transcript(video_id: str) -> List[Dict[str, Any]]:
        try:
            api = YouTubeTranscriptApi(http_client=_make_session())
            try:
                return api.fetch(video_id).to_raw_data()
            except Exception:
                # Fall back to any available language (e.g. auto-generated non-English)
                transcript_list = api.list(video_id)
                available_langs = [t.language_code for t in transcript_list]
                if not available_langs:
                    raise
                return api.fetch(video_id, languages=available_langs).to_raw_data()
        except Exception as e:
            from fastapi import HTTPException
            error_msg = str(e).lower()
            if 'disabled' in error_msg:
                raise HTTPException(status_code=400, detail="Transcripts are disabled for this video")
            elif 'no transcript' in error_msg or 'could not be found' in error_msg:
                raise HTTPException(status_code=400, detail="No transcript found for this video")
            elif 'unavailable' in error_msg:
                raise HTTPException(status_code=400, detail="Video is unavailable")
            raise HTTPException(status_code=500, detail=f"Transcript extraction failed: {str(e)}")

    @staticmethod
    async def get_video_title(video_id: str) -> str:
        """Fetch video title via YouTube oEmbed API (no API key required)."""
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(oembed_url)
                if response.status_code == 200:
                    return response.json().get("title", f"Video {video_id}")
        except Exception:
            pass
        return f"Video {video_id}"
