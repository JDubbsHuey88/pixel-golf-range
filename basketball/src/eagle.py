"""eagle: CLI entry point for the basketball video tool.

Usage:
  python -m src.eagle process <file>     route a single file by its inbox subfolder
  python -m src.eagle process-all        process every file in inbox/games and inbox/freethrows
  python -m src.eagle mark <file>        interactively mark made baskets for a game video
  python -m src.eagle inspect <file>     dump probed video info

Run from inside the basketball/ directory (or set --root).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional

from . import freethrows, games, ffmpeg_utils


VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}


def _load_config(root: Path, name: str) -> dict:
    cfg_path = root / "config" / f"{name}.json"
    if not cfg_path.exists():
        raise FileNotFoundError(f"config not found: {cfg_path}")
    return json.loads(cfg_path.read_text())


def _expand(path_str: str) -> Path:
    return Path(os.path.expanduser(os.path.expandvars(path_str)))


def _post_process(output_file: Path, config: dict) -> None:
    """Auto-open the output and/or mirror it to a sync folder.

    Both behaviors are opt-in via the `output` config block:
      - "auto_open": true     -> `open <file>` on macOS, `xdg-open` on Linux
      - "mirror_to": "<path>" -> copy the finished file to this directory
                                 (e.g. an iCloud Drive folder for phone access)
    """
    out_cfg = config.get("output", {})

    mirror_to = out_cfg.get("mirror_to")
    if mirror_to:
        dest_dir = _expand(mirror_to)
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / output_file.name
            shutil.copy2(output_file, dest_file)
            print(f"  mirrored to {dest_file}")
        except OSError as e:
            print(f"  mirror_to failed ({mirror_to}): {e}", file=sys.stderr)

    if out_cfg.get("auto_open", False):
        try:
            if sys.platform == "darwin":
                subprocess.run(["open", str(output_file)], check=False)
            elif sys.platform.startswith("linux"):
                subprocess.run(["xdg-open", str(output_file)], check=False)
        except FileNotFoundError:
            pass


def _classify(root: Path, video: Path) -> str:
    """Decide which mode based on which inbox subfolder the video lives in."""
    try:
        rel = video.resolve().relative_to((root / "inbox").resolve())
    except ValueError:
        raise SystemExit(
            f"{video} is not inside {root/'inbox'}. Move it into inbox/games/ "
            f"or inbox/freethrows/ first."
        )
    parts = rel.parts
    if not parts:
        raise SystemExit(f"{video} must be inside a mode subfolder of inbox/")
    mode = parts[0]
    if mode not in {"games", "freethrows"}:
        raise SystemExit(f"unknown inbox subfolder: {mode}")
    return mode


def _iter_videos(folder: Path) -> Iterable[Path]:
    if not folder.exists():
        return
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS:
            yield p


def cmd_process(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    video = Path(args.file).resolve()
    mode = _classify(root, video)
    config = _load_config(root, mode)
    module = games if mode == "games" else freethrows
    out = module.process(video, config, root)
    _post_process(out, config)
    return 0


def cmd_process_all(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    found = 0
    for mode in ("games", "freethrows"):
        config = _load_config(root, mode)
        module = games if mode == "games" else freethrows
        for video in _iter_videos(root / "inbox" / mode):
            print(f"\n=== Processing {mode}: {video.name} ===")
            try:
                out = module.process(video, config, root)
                _post_process(out, config)
                found += 1
            except Exception as e:
                print(f"  ERROR: {e}", file=sys.stderr)
    if found == 0:
        print("No videos found in inbox/games or inbox/freethrows.")
    return 0


def cmd_mark(args: argparse.Namespace) -> int:
    video = Path(args.file).resolve()
    if not video.exists():
        raise SystemExit(f"file not found: {video}")
    games.mark_interactive(video)
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    video = Path(args.file).resolve()
    info = ffmpeg_utils.probe(video)
    print(f"  duration: {info.duration:.2f}s")
    print(f"  size:     {info.width}x{info.height}")
    print(f"  fps:      {info.fps:.2f}")
    print(f"  audio:    {'yes' if info.has_audio else 'no'}")
    print(f"  portrait: {info.is_portrait}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="eagle", description="Basketball video tool")
    p.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="basketball/ project root (default: parent of src/)",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("process", help="Process a single video")
    sp.add_argument("file")
    sp.set_defaults(func=cmd_process)

    sp = sub.add_parser("process-all", help="Process every video in both inboxes")
    sp.set_defaults(func=cmd_process_all)

    sp = sub.add_parser("mark", help="Interactively mark made baskets in a game video")
    sp.add_argument("file")
    sp.set_defaults(func=cmd_mark)

    sp = sub.add_parser("inspect", help="Probe a video and print metadata")
    sp.add_argument("file")
    sp.set_defaults(func=cmd_inspect)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
