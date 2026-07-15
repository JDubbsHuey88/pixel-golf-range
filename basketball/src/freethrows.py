"""Free-throw routine pipeline.

Workflow:
  1. Detect 10 release timestamps from audio peaks.
  2. Review step: confirm/adjust timestamps, mark each shot make/miss.
  3. Render output with speed-ramping between shots and overlaid counter + tally.

A sidecar `<basename>.shots.json` is written next to the source video so the
review step can be skipped on subsequent renders.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import List, Sequence

from . import detect, ffmpeg_utils, overlays


@dataclass
class Shot:
    release_time: float
    made: bool


@dataclass
class FreethrowPlan:
    source: Path
    shots: List[Shot]
    config: dict

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(
            {
                "source": str(self.source),
                "shots": [asdict(s) for s in self.shots],
            },
            indent=2,
        ))

    @classmethod
    def load(cls, path: Path, config: dict) -> "FreethrowPlan":
        data = json.loads(path.read_text())
        return cls(
            source=Path(data["source"]),
            shots=[Shot(**s) for s in data["shots"]],
            config=config,
        )


def _atempo_chain(multiplier: float) -> str:
    """ffmpeg atempo accepts 0.5–2.0 reliably. Chain factors to reach larger speedups."""
    if 0.5 <= multiplier <= 2.0:
        return f"atempo={multiplier:.4f}"
    parts = []
    remaining = multiplier
    while remaining > 2.0:
        parts.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5
    parts.append(f"atempo={remaining:.4f}")
    return ",".join(parts)


def _interactive_review(
    video: Path,
    timestamps: Sequence[float],
    shot_count: int,
) -> List[Shot]:
    """Print detected timestamps and ask user to mark each shot make/miss."""
    print()
    print(f"Detected {len(timestamps)} candidate release moments in {video.name}:")
    for i, t in enumerate(timestamps, 1):
        mins = int(t // 60)
        secs = t - mins * 60
        print(f"  Shot {i:>2}: {mins:02d}:{secs:05.2f}")
    print()
    print("Adjust any timestamp by typing `<n> <new_time>` (e.g. `3 01:24.5`),")
    print("or press Enter to accept and start marking make/miss.")
    print()

    times = list(timestamps)

    def _parse_time(token: str) -> float:
        if ":" in token:
            mm, ss = token.split(":", 1)
            return int(mm) * 60 + float(ss)
        return float(token)

    while True:
        line = input("> ").strip()
        if not line:
            break
        try:
            n_str, t_str = line.split(maxsplit=1)
            n = int(n_str)
            if not 1 <= n <= len(times):
                print(f"  shot index out of range")
                continue
            times[n - 1] = _parse_time(t_str)
            print(f"  shot {n} → {times[n-1]:.2f}s")
        except (ValueError, IndexError):
            print("  could not parse; expected `<n> <time>` like `3 01:24.5`")

    print()
    print("For each shot, press M (make) or X (miss) then Enter:")
    shots: List[Shot] = []
    for i, t in enumerate(times, 1):
        while True:
            ans = input(f"  Shot {i:>2} @ {t:.2f}s [m/x]: ").strip().lower()
            if ans in {"m", "make", "made"}:
                shots.append(Shot(release_time=t, made=True))
                break
            if ans in {"x", "miss", "missed"}:
                shots.append(Shot(release_time=t, made=False))
                break
            print("    please type m or x")
    return shots


def detect_and_review(video: Path, config: dict) -> FreethrowPlan:
    sidecar = video.with_suffix(video.suffix + ".shots.json")
    if sidecar.exists():
        print(f"Reusing existing markings at {sidecar.name}.")
        return FreethrowPlan.load(sidecar, config)

    det_cfg = config["detection"]
    times = detect.detect_release_times(
        video,
        work_dir=video.parent / ".eagle_work",
        shot_count=config["shot_count"],
        min_gap_seconds=det_cfg["min_gap_seconds"],
        smoothing_ms=det_cfg["audio_smoothing_ms"],
        fallback_to_even_split=det_cfg["fallback_to_even_split"],
    )
    shots = _interactive_review(video, times, config["shot_count"])
    plan = FreethrowPlan(source=video, shots=shots, config=config)
    plan.save(sidecar)
    print(f"Saved markings to {sidecar.name}.")
    return plan


def _build_segments(plan: FreethrowPlan) -> list[tuple[float, float, float]]:
    """Return list of (src_start, src_end, multiplier) segments tiling the source."""
    cfg = plan.config
    info = ffmpeg_utils.probe(plan.source)
    duration = info.duration
    fast = cfg["speed_ramp"]["between_shots_multiplier"]
    pre = cfg["speed_ramp"]["normal_window_before_seconds"]
    post = cfg["speed_ramp"]["normal_window_after_seconds"]

    segments: list[tuple[float, float, float]] = []
    cursor = 0.0
    for shot in plan.shots:
        normal_start = max(cursor, shot.release_time - pre)
        normal_end = max(normal_start, min(duration, shot.release_time + post))
        if normal_start > cursor:
            segments.append((cursor, normal_start, fast))
        if normal_end > normal_start:
            segments.append((normal_start, normal_end, 1.0))
        cursor = normal_end
    if cursor < duration:
        segments.append((cursor, duration, fast))
    return segments


def _segment_output_durations(segments: Sequence[tuple[float, float, float]]) -> list[float]:
    return [(end - start) / mult for start, end, mult in segments]


def render(plan: FreethrowPlan, output_path: Path) -> None:
    cfg = plan.config
    info = ffmpeg_utils.probe(plan.source)
    segments = _build_segments(plan)
    out_durs = _segment_output_durations(segments)

    # Build per-segment trim filter chains
    filter_parts: list[str] = []
    concat_inputs_v: list[str] = []
    concat_inputs_a: list[str] = []
    for i, (start, end, mult) in enumerate(segments):
        v_label = f"v{i}"
        a_label = f"a{i}"
        v_chain = (
            f"[0:v]trim=start={start:.3f}:end={end:.3f},"
            f"setpts=PTS-STARTPTS"
        )
        if mult != 1.0:
            v_chain += f",setpts=PTS/{mult:.4f}"
        v_chain += f"[{v_label}]"
        filter_parts.append(v_chain)

        if info.has_audio:
            a_chain = (
                f"[0:a]atrim=start={start:.3f}:end={end:.3f},"
                f"asetpts=PTS-STARTPTS"
            )
            if mult != 1.0:
                a_chain += f",{_atempo_chain(mult)}"
            a_chain += f"[{a_label}]"
            filter_parts.append(a_chain)

        concat_inputs_v.append(f"[{v_label}]")
        concat_inputs_a.append(f"[{a_label}]")

    n = len(segments)
    if info.has_audio:
        concat = (
            "".join(v + a for v, a in zip(concat_inputs_v, concat_inputs_a))
            + f"concat=n={n}:v=1:a=1[cv][ca]"
        )
    else:
        concat = "".join(concat_inputs_v) + f"concat=n={n}:v=1:a=0[cv]"
    filter_parts.append(concat)

    # Portrait reformat
    if cfg["output"]["orientation"] == "portrait_9_16":
        filter_parts.append(
            "[cv]scale=w=1080:h=1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,setsar=1[cv2]"
        )
        v_in = "[cv2]"
        target_h = 1920
    else:
        filter_parts.append("[cv]copy[cv2]")
        v_in = "[cv2]"
        target_h = info.height

    # Build overlays in OUTPUT time
    overlay_segs: list[overlays.OverlaySegment] = []
    counter_cfg = cfg["overlays"]["shot_counter"]
    tally_cfg = cfg["overlays"]["tally"]

    # Walk segments mapping each "normal" segment to its shot index
    out_t = 0.0
    shot_idx = 0
    makes = 0
    total = cfg["shot_count"]
    for (start, end, mult), out_dur in zip(segments, out_durs):
        seg_out_start = out_t
        seg_out_end = out_t + out_dur
        if mult == 1.0 and shot_idx < len(plan.shots):
            shot = plan.shots[shot_idx]
            shot_idx += 1
            attempt = shot_idx
            if shot.made:
                makes += 1
            if counter_cfg["enabled"]:
                overlay_segs.append(overlays.OverlaySegment(
                    text=counter_cfg["format"].format(n=attempt, total=total),
                    start=seg_out_start, end=seg_out_end,
                    position=counter_cfg["position"],
                    font_size_pct=counter_cfg["font_size_pct_of_height"],
                    text_color=counter_cfg["text_color"],
                    box_color=counter_cfg["box_color"],
                    box_padding=counter_cfg["box_padding_px"],
                    margin=counter_cfg["margin_px"],
                ))
            if tally_cfg["enabled"]:
                overlay_segs.append(overlays.OverlaySegment(
                    text=tally_cfg["format"].format(makes=makes, attempts=attempt),
                    start=seg_out_start, end=seg_out_end,
                    position=tally_cfg["position"],
                    font_size_pct=tally_cfg["font_size_pct_of_height"],
                    text_color=tally_cfg["text_color"],
                    box_color=tally_cfg["box_color"],
                    box_padding=tally_cfg["box_padding_px"],
                    margin=tally_cfg["margin_px"],
                ))
        out_t = seg_out_end

    overlay_chain = overlays.build_drawtext_chain(overlay_segs)
    filter_parts.append(f"{v_in}{overlay_chain}[vout]")

    filter_complex = ";".join(filter_parts)

    args = [
        "-i", str(plan.source),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
    ]
    if info.has_audio:
        args += ["-map", "[ca]"]
    args += [
        "-c:v", cfg["output"]["video_codec"],
        "-preset", cfg["output"]["preset"],
        "-crf", str(cfg["output"]["crf"]),
    ]
    if info.has_audio:
        args += ["-c:a", cfg["output"]["audio_codec"], "-b:a", "160k"]
    args += [str(output_path)]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_utils.run(args)
    print(f"Wrote {output_path}")


def process(video: Path, config: dict, basketball_root: Path) -> Path:
    plan = detect_and_review(video, config)
    out_dir = basketball_root / config["output"]["folder"]
    out_path = out_dir / f"{video.stem}_freethrows.mp4"
    render(plan, out_path)
    return out_path
