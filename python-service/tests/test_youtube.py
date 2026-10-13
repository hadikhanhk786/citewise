import pytest
from app.services.youtube import YouTubeService
from fastapi import HTTPException

def test_extract_video_id_standard_url():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    video_id = YouTubeService.extract_video_id(url)
    assert video_id == "dQw4w9WgXcQ"

def test_extract_video_id_short_url():
    url = "https://youtu.be/dQw4w9WgXcQ?t=1"
    video_id = YouTubeService.extract_video_id(url)
    assert video_id == "dQw4w9WgXcQ"

def test_extract_video_id_invalid_url():
    url = "https://example.com/watch?v=123"
    video_id = YouTubeService.extract_video_id(url)
    assert video_id is None

def test_get_transcript_handles_disabled_correctly():
    from unittest.mock import patch, MagicMock
    with patch("app.services.youtube.YouTubeTranscriptApi") as MockApi:
        instance = MockApi.return_value
        instance.fetch.side_effect = Exception("Transcripts are disabled for this video")
        with pytest.raises(Exception) as exc_info:
            YouTubeService.get_transcript("dQw4w9WgXcQ")
        assert exc_info.value.status_code == 400
        assert "disabled" in exc_info.value.detail.lower()
