"""Thin wrappers around ffmpeg/ffprobe.

Everything here shells out. Keeps the rest of the codebase free of subprocess noise.
"""

from __future__ import annotations

import json
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


class FFmpegError(RuntimeError):
    pass


def _require_binary(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise FFmpegError(
            f"`{name}` not found on PATH. Install ffmpeg (e.g. `brew install ffmpeg` "
            f"or `apt install ffmpeg`) before running eagle."
        )
    return path


@dataclass(frozen=True)
class VideoInfo:
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool

    @property
    def is_portrait(self) -> bool:
        return self.height >= self.width


def probe(path: Path) -> VideoInfo:
    ffprobe = _require_binary("ffprobe")
    result = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise FFmpegError(f"ffprobe failed for {path}: {result.stderr.strip()}")

    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise FFmpegError(f"No video stream in {path}")
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    fps_raw = video.get("avg_frame_rate") or video.get("r_frame_rate") or "30/1"
    num, _, den = fps_raw.partition("/")
    fps = float(num) / float(den) if den and float(den) != 0 else 30.0

    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0.0)

    return VideoInfo(
        duration=duration,
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        has_audio=audio is not None,
    )


def run(args: Iterable[str], *, quiet: bool = False) -> None:
    """Run an ffmpeg invocation, raising on non-zero exit."""
    ffmpeg = _require_binary("ffmpeg")
    cmd = [ffmpeg, "-hide_banner", "-y", *args] if quiet else [ffmpeg, "-hide_banner", "-y", *args]
    if not quiet:
        print(f"$ ffmpeg {' '.join(shlex.quote(a) for a in args)}")
    result = subprocess.run(cmd, capture_output=quiet, text=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr if quiet else "(see above)"
        raise FFmpegError(f"ffmpeg failed (exit {result.returncode}): {stderr}")


def extract_audio_pcm(video: Path, out_wav: Path, sample_rate: int = 16000) -> None:
    """Extract a mono PCM WAV for downstream analysis."""
    run([
        "-i", str(video),
        "-vn",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-f", "wav",
        str(out_wav),
    ], quiet=True)
