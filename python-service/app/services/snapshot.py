from __future__ import annotations
import logging
import asyncio
from typing import Optional

logger = logging.getLogger("uvicorn")


class SnapshotService:
    """Extract video frame thumbnails from YouTube storyboard sprites.

    YouTube generates storyboard sprite sheets (grid images) used for hover
    previews on the progress bar.  We use yt-dlp to locate those sprites, then
    return per-timestamp crop coordinates so the frontend can render each frame
    with a CSS background-position trick — no ffmpeg or image library required.
    """

    def _parse_storyboard(self, thumbnails: list[dict], duration: float) -> Optional[dict]:
        """Find the highest-quality storyboard sprite metadata."""
        candidates = [
            t for t in thumbnails
            if t.get("rows") and t.get("cols") and t.get("url")
        ]
        if not candidates:
            return None
        # Prefer the largest frames (highest resolution storyboard level)
        candidates.sort(key=lambda t: (t.get("width", 0) * t.get("height", 0)), reverse=True)
        best = candidates[0]
        rows = best["rows"]
        cols = best["cols"]
        total_frames = rows * cols
        # Some sprite sheets cover only part of the video; use the reported
        # duration as a fallback when the field is absent.
        secs_per_frame = duration / total_frames if total_frames > 0 else 10
        return {
            "url": best["url"],
            "rows": rows,
            "cols": cols,
            "frame_width": best.get("width", 160),
            "frame_height": best.get("height", 90),
            "secs_per_frame": secs_per_frame,
        }

    def _frame_coords(self, storyboard: dict, timestamp: float) -> dict:
        """Return (col, row) and pixel offsets for a given timestamp."""
        secs = storyboard["secs_per_frame"]
        total_frames = storyboard["rows"] * storyboard["cols"]
        frame_index = min(int(timestamp / secs), total_frames - 1)
        row = frame_index // storyboard["cols"]
        col = frame_index % storyboard["cols"]
        return {
            "col": col,
            "row": row,
            "x": col * storyboard["frame_width"],
            "y": row * storyboard["frame_height"],
        }

    async def get_snapshots(
        self,
        video_id: str,
        timestamps: list[float],
        labels: list[str],
        duration: float,
    ) -> list[dict]:
        """Return snapshot metadata for each timestamp.

        Each result dict contains:
          spriteUrl, frameWidth, frameHeight, x, y,
          timestamp, timestampDisplay, label
        """
        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            storyboard = await asyncio.to_thread(self._fetch_storyboard, url, duration)
        except Exception as exc:
            logger.warning("Storyboard fetch failed, falling back to default thumbnail",
                           extra={"video_id": video_id, "error": str(exc)})
            storyboard = None

        results = []
        for ts, label in zip(timestamps, labels):
            if storyboard:
                coords = self._frame_coords(storyboard, ts)
                results.append({
                    "timestamp": ts,
                    "timestampDisplay": self._fmt(ts),
                    "label": label,
                    "spriteUrl": storyboard["url"],
                    "frameWidth": storyboard["frame_width"],
                    "frameHeight": storyboard["frame_height"],
                    "x": coords["x"],
                    "y": coords["y"],
                })
            else:
                # Fallback: use YouTube's static thumbnail (same image for all)
                results.append({
                    "timestamp": ts,
                    "timestampDisplay": self._fmt(ts),
                    "label": label,
                    "spriteUrl": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "frameWidth": 480,
                    "frameHeight": 360,
                    "x": 0,
                    "y": 0,
                })
        return results

    def _fetch_storyboard(self, url: str, duration: float) -> Optional[dict]:
        import yt_dlp
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        thumbnails = info.get("thumbnails") or []
        reported_duration = info.get("duration") or duration
        return self._parse_storyboard(thumbnails, reported_duration)

    @staticmethod
    def _fmt(seconds: float) -> str:
        mins, secs = divmod(int(seconds), 60)
        return f"{mins:02d}:{secs:02d}"
