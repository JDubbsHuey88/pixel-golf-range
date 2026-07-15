"""Free-throw release-moment detection from audio.

Approach: extract a low-rate mono PCM, compute a smoothed envelope of absolute
amplitude, then pick the top-N peaks separated by at least `min_gap` seconds.
The rim/swish/ball-bounce sounds tend to be the loudest events in a quiet gym
when the camera is fixed nearby.

Falls back to evenly spaced timestamps if not enough confident peaks are found.
"""

from __future__ import annotations

import struct
import wave
from pathlib import Path
from typing import List

from . import ffmpeg_utils


def _read_wav_mono(path: Path) -> tuple[list[int], int]:
    with wave.open(str(path), "rb") as wf:
        if wf.getnchannels() != 1:
            raise ValueError(f"expected mono WAV, got {wf.getnchannels()} channels")
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sample_width == 2:
        fmt = f"<{n_frames}h"
        samples = list(struct.unpack(fmt, raw))
    elif sample_width == 1:
        # 8-bit WAV is unsigned; recenter to signed for envelope work
        samples = [b - 128 for b in raw]
    else:
        raise ValueError(f"unsupported sample width {sample_width}")
    return samples, sample_rate


def _envelope(samples: list[int], sample_rate: int, smoothing_ms: int) -> list[float]:
    """Return |x| smoothed by a moving average. Sampled at ~100 Hz to keep memory low."""
    target_rate = 100
    bucket = max(1, sample_rate // target_rate)
    coarse: list[float] = []
    acc = 0
    count = 0
    for s in samples:
        acc += abs(s)
        count += 1
        if count == bucket:
            coarse.append(acc / count)
            acc = 0
            count = 0
    if count:
        coarse.append(acc / count)

    # Moving-average smoothing, window in ms expressed as coarse samples
    window = max(1, int(smoothing_ms / 1000.0 * target_rate))
    if window <= 1:
        return coarse
    smoothed: list[float] = []
    running = sum(coarse[:window])
    smoothed.append(running / window)
    for i in range(window, len(coarse)):
        running += coarse[i] - coarse[i - window]
        smoothed.append(running / window)
    # Pad the head so smoothed length matches coarse
    head = [smoothed[0]] * (len(coarse) - len(smoothed))
    return head + smoothed


def _pick_peaks(envelope: list[float], coarse_rate: int, n: int, min_gap_s: float) -> list[float]:
    """Greedy peak picking: sort indices by amplitude desc, accept ones not too close."""
    indexed = sorted(enumerate(envelope), key=lambda p: p[1], reverse=True)
    min_gap_samples = int(min_gap_s * coarse_rate)
    chosen: list[int] = []
    for idx, _ in indexed:
        if all(abs(idx - c) >= min_gap_samples for c in chosen):
            chosen.append(idx)
            if len(chosen) >= n:
                break
    chosen.sort()
    return [c / coarse_rate for c in chosen]


def detect_release_times(
    video_path: Path,
    work_dir: Path,
    *,
    shot_count: int,
    min_gap_seconds: float,
    smoothing_ms: int,
    fallback_to_even_split: bool,
) -> List[float]:
    """Return a list of `shot_count` timestamps (seconds) believed to be release moments."""
    work_dir.mkdir(parents=True, exist_ok=True)
    wav = work_dir / "freethrows_audio.wav"
    ffmpeg_utils.extract_audio_pcm(video_path, wav, sample_rate=16000)
    samples, sr = _read_wav_mono(wav)
    env = _envelope(samples, sr, smoothing_ms)
    peaks = _pick_peaks(env, coarse_rate=100, n=shot_count, min_gap_s=min_gap_seconds)

    if len(peaks) < shot_count:
        if not fallback_to_even_split:
            raise RuntimeError(
                f"only found {len(peaks)} confident peaks; needed {shot_count}. "
                f"Enable fallback or supply timestamps manually."
            )
        info = ffmpeg_utils.probe(video_path)
        duration = info.duration
        # Even split places shots at the midpoints of equal segments
        peaks = [duration * (i + 0.5) / shot_count for i in range(shot_count)]
    return peaks
