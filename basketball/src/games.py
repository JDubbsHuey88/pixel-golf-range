"""Game highlight reel pipeline.

Workflow:
  1. Read made-basket timestamps from a sidecar `<basename>.shots.txt` file
     (one timestamp per line, in HH:MM:SS, MM:SS, or seconds format).
     If missing, the user can run `eagle mark <file>` to record them
     interactively (writes the same sidecar file).
  2. For each timestamp, cut [t - clip_window.before, t + clip_window.after].
  3. Prepend a title card (game date).
  4. Mix in a randomly chosen background music track from assets/music/.
  5. Concatenate clips; write to output/games/<basename>_highlights.mp4.

Note: making a v1 that focuses on reliable assembly. Auto-detection of made
baskets is deferred — the manual mark tool is fast (scrub + tap) and gives
100% accurate cuts.
"""

from __future__ import annotations

import datetime as dt
import os
import random
import re
from pathlib import Path
from typing import List, Optional

from . import ffmpeg_utils, overlays


_FILENAME_DATE_RE = re.compile(r"(\d{4})[-_]?(\d{2})[-_]?(\d{2})")


def _parse_timestamp(token: str) -> float:
    """Parse 'HH:MM:SS', 'MM:SS', or plain seconds (with optional decimals)."""
    token = token.strip()
    if not token or token.startswith("#"):
        raise ValueError("blank")
    parts = token.split(":")
    if len(parts) == 1:
        return float(parts[0])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    raise ValueError(f"unrecognized timestamp: {token}")


def read_shots_file(path: Path) -> List[float]:
    times: List[float] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        times.append(_parse_timestamp(line))
    times.sort()
    return times


def _date_for_video(video: Path, fmt: str) -> str:
    m = _FILENAME_DATE_RE.search(video.stem)
    if m:
        try:
            d = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return d.strftime(fmt)
        except ValueError:
            pass
    mtime = os.path.getmtime(video)
    return dt.datetime.fromtimestamp(mtime).strftime(fmt)


def _pick_music(music_dir: Path) -> Optional[Path]:
    if not music_dir.exists():
        return None
    candidates = [
        p for p in music_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".mp3", ".m4a", ".aac", ".wav", ".ogg"}
    ]
    if not candidates:
        return None
    return random.choice(candidates)


def mark_interactive(video: Path) -> Path:
    """Prompt the user to enter timestamps until they're done.

    A simple text-driven marker; the user typically scrubs in their player of
    choice (QuickTime, VLC) and types the moments here. Saves a sidecar file.
    """
    sidecar = video.with_suffix(video.suffix + ".shots.txt")
    print(f"Marking made baskets for {video.name}.")
    print("Type each timestamp and press Enter (e.g. `1:24`, `12:04.5`, `2:01:33`).")
    print("Type `done` when finished, `undo` to remove the last entry.")
    times: List[float] = []
    while True:
        line = input(f"[{len(times)} marked] > ").strip()
        if line.lower() in {"done", "q", "quit", "exit"}:
            break
        if line.lower() == "undo":
            if times:
                removed = times.pop()
                print(f"  removed {removed:.2f}s")
            continue
        try:
            t = _parse_timestamp(line)
            times.append(t)
            print(f"  marked {t:.2f}s")
        except ValueError as e:
            print(f"  could not parse: {e}")
    times.sort()
    sidecar.write_text("\n".join(f"{t:.2f}" for t in times) + "\n")
    print(f"Wrote {sidecar} ({len(times)} timestamps).")
    return sidecar


def _extract_clip(
    video: Path,
    start: float,
    end: float,
    out_path: Path,
) -> None:
    duration = end - start
    if duration <= 0:
        raise ValueError(f"non-positive clip duration ({start}–{end})")
    ffmpeg_utils.run([
        "-ss", f"{start:.3f}",
        "-i", str(video),
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "160k",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ], quiet=True)


def _render_title_card(
    text_lines: List[str],
    width: int,
    height: int,
    fps: float,
    duration: float,
    background: str,
    text_color: str,
    out_path: Path,
) -> None:
    spec, chain = overlays.build_title_card_filter(
        text_lines, width, height, duration, background, text_color
    )
    args = [
        "-f", "lavfi", "-i", spec,
        "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000",
        "-filter_complex", f"[0:v]{chain}[v]",
        "-map", "[v]", "-map", "1:a",
        "-t", f"{duration:.3f}",
        "-r", str(int(round(fps))),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    ffmpeg_utils.run(args, quiet=True)


def _concat_with_music(
    parts: List[Path],
    music: Optional[Path],
    music_cfg: dict,
    out_path: Path,
) -> None:
    work = out_path.parent / ".eagle_work"
    work.mkdir(parents=True, exist_ok=True)
    list_file = work / f"{out_path.stem}_concat.txt"
    list_file.write_text("\n".join(f"file '{p.resolve()}'" for p in parts))

    args = ["-f", "concat", "-safe", "0", "-i", str(list_file)]
    filter_complex = ""
    if music and music_cfg["mode"] != "none":
        args += ["-i", str(music)]
        # Duck the music under the original audio (sidechain-lite via volume mix).
        # For v1 keep it simple: lower music to configured dB and mix.
        vol = music_cfg["volume_db"]
        fade_in = music_cfg["fade_in_seconds"]
        # We don't know total duration here; rely on shortest=1 to clip music.
        filter_complex = (
            f"[1:a]volume={vol}dB,afade=t=in:st=0:d={fade_in}[m];"
            "[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )
        args += ["-filter_complex", filter_complex, "-map", "0:v", "-map", "[aout]"]
    else:
        args += ["-c", "copy"]

    if filter_complex:
        args += [
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
        ]

    args += [str(out_path)]
    ffmpeg_utils.run(args)


def process(video: Path, config: dict, basketball_root: Path) -> Path:
    sidecar = video.with_suffix(video.suffix + ".shots.txt")
    if not sidecar.exists():
        raise FileNotFoundError(
            f"No shot timestamps found at {sidecar.name}.\n"
            f"Run `eagle mark {video}` to mark made baskets, or create the file "
            f"manually with one timestamp per line."
        )
    times = read_shots_file(sidecar)
    if not times:
        raise ValueError(f"{sidecar.name} has no timestamps; nothing to clip.")

    info = ffmpeg_utils.probe(video)
    cw = config["clip_window_seconds"]
    title_cfg = config["title_card"]
    music_cfg = config["music"]

    work = video.parent / ".eagle_work" / video.stem
    work.mkdir(parents=True, exist_ok=True)

    parts: List[Path] = []

    if title_cfg["show_date"]:
        date_str = _date_for_video(video, title_cfg["date_format"])
        title_path = work / "00_title.mp4"
        _render_title_card(
            text_lines=[date_str],
            width=info.width,
            height=info.height,
            fps=info.fps,
            duration=title_cfg["duration_seconds"],
            background=title_cfg["background_color"],
            text_color=title_cfg["text_color"],
            out_path=title_path,
        )
        parts.append(title_path)

    for i, t in enumerate(times, 1):
        start = max(0.0, t - cw["before"])
        end = min(info.duration, t + cw["after"])
        clip_path = work / f"{i:03d}_clip.mp4"
        _extract_clip(video, start, end, clip_path)
        parts.append(clip_path)

    music_path: Optional[Path] = None
    if music_cfg["mode"] == "random_from_folder":
        music_path = _pick_music(basketball_root / music_cfg["folder"])

    out_dir = basketball_root / config["output"]["folder"]
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{video.stem}_highlights.mp4"
    _concat_with_music(parts, music_path, music_cfg, out_path)
    print(f"Wrote {out_path}")
    return out_path
