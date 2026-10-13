"""
Tests for YouTubeService — URL parsing and transcript error handling.
Extends the existing test_youtube.py with additional edge cases.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.youtube import YouTubeService


class TestExtractVideoId:
    def test_standard_youtube_url(self):
        assert YouTubeService.extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_youtube_url(self):
        assert YouTubeService.extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_url_with_timestamp(self):
        assert YouTubeService.extract_video_id("https://youtu.be/dQw4w9WgXcQ?t=42") == "dQw4w9WgXcQ"

    def test_url_with_extra_params(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest&index=1"
        assert YouTubeService.extract_video_id(url) == "dQw4w9WgXcQ"

    def test_non_youtube_url_returns_none(self):
        assert YouTubeService.extract_video_id("https://vimeo.com/123456") is None

    def test_empty_string_returns_none(self):
        assert YouTubeService.extract_video_id("") is None

    def test_random_text_returns_none(self):
        assert YouTubeService.extract_video_id("not a url at all") is None

    def test_youtube_url_without_v_param(self):
        assert YouTubeService.extract_video_id("https://www.youtube.com/watch") is None

    def test_youtube_embed_url(self):
        # embed URLs use a different path format — current implementation doesn't handle these
        result = YouTubeService.extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ")
        # Documenting current behavior: returns None because no ?v= param
        assert result is None


class TestGetTranscript:
    @patch("app.services.youtube.YouTubeTranscriptApi")
    def test_successful_transcript_fetch(self, MockApi):
        mock_data = [{"text": "hello", "start": 0, "duration": 1}]
        instance = MockApi.return_value
        mock_result = MagicMock()
        mock_result.to_raw_data.return_value = mock_data
        instance.fetch.return_value = mock_result

        result = YouTubeService.get_transcript("dQw4w9WgXcQ")
        assert result == mock_data
        instance.fetch.assert_called_once_with("dQw4w9WgXcQ")

    @patch("app.services.youtube.YouTubeTranscriptApi")
    def test_disabled_transcripts_raises_400(self, MockApi):
        instance = MockApi.return_value
        instance.fetch.side_effect = Exception("Transcripts are disabled for this video")

        with pytest.raises(Exception) as exc_info:
            YouTubeService.get_transcript("test123")
        assert exc_info.value.status_code == 400
        assert "disabled" in exc_info.value.detail.lower()

    @patch("app.services.youtube.YouTubeTranscriptApi")
    def test_no_transcript_raises_400(self, MockApi):
        instance = MockApi.return_value
        instance.fetch.side_effect = Exception("No transcript could be found for this video")

        with pytest.raises(Exception) as exc_info:
            YouTubeService.get_transcript("test123")
        assert exc_info.value.status_code == 400
        assert "no transcript" in exc_info.value.detail.lower()

    @patch("app.services.youtube.YouTubeTranscriptApi")
    def test_unavailable_video_raises_400(self, MockApi):
        instance = MockApi.return_value
        instance.fetch.side_effect = Exception("Video unavailable")

        with pytest.raises(Exception) as exc_info:
            YouTubeService.get_transcript("test123")
        assert exc_info.value.status_code == 400
        assert "unavailable" in exc_info.value.detail.lower()

    @patch("app.services.youtube.YouTubeTranscriptApi")
    def test_unknown_error_raises_500(self, MockApi):
        instance = MockApi.return_value
        instance.fetch.side_effect = Exception("Something completely unexpected")

        with pytest.raises(Exception) as exc_info:
            YouTubeService.get_transcript("test123")
        assert exc_info.value.status_code == 500


class TestGetVideoTitle:
    @pytest.mark.asyncio
    @patch("app.services.youtube.httpx.AsyncClient")
    async def test_returns_title_on_success(self, MockClient):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"title": "My Video Title"}

        mock_client_instance = MagicMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client_instance

        title = await YouTubeService.get_video_title("dQw4w9WgXcQ")
        assert title == "My Video Title"

    @pytest.mark.asyncio
    @patch("app.services.youtube.httpx.AsyncClient")
    async def test_returns_fallback_on_failure(self, MockClient):
        mock_client_instance = MagicMock()
        mock_client_instance.get = MagicMock(side_effect=Exception("network error"))
        mock_client_instance.__aenter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = MagicMock(return_value=False)
        MockClient.return_value = mock_client_instance

        title = await YouTubeService.get_video_title("dQw4w9WgXcQ")
        assert title == "Video dQw4w9WgXcQ"
