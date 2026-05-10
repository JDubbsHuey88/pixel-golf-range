# eagle — basketball video tool

Drag-and-drop video processor for two recipes:

- **Game highlights** — title card + clipped made-baskets + random background music.
- **Free-throw routine** — auto-detects the 10 release moments in a continuous
  daily video, you mark each make/miss, output is a portrait reel with shot
  counter, running tally, and 2.5x speed-ramping between attempts.

## Requirements

- Python 3.9+
- `ffmpeg` and `ffprobe` on PATH

```sh
# macOS
brew install ffmpeg
# Debian/Ubuntu
sudo apt install ffmpeg
```

No Python packages are required — eagle uses only the standard library.

## Folder layout

```
basketball/
├── inbox/
│   ├── games/         drop full or pre-cut game videos here
│   └── freethrows/    drop daily 10-shot continuous videos here
├── output/
│   ├── games/         finished highlight reels land here
│   └── freethrows/    finished free-throw reels land here
├── assets/
│   ├── music/         mp3/m4a/wav/etc. — used for random pick under game reels
│   └── fonts/         (reserved)
├── config/
│   ├── games.json     all game-mode parameters
│   └── freethrows.json all free-throw parameters
└── src/               source code
```

## How to use

### Free-throw video (the daily routine)

1. Record one continuous video of all 10 attempts on your phone.
2. Drop it into `inbox/freethrows/`.
3. Run:

   ```sh
   ./run.sh process inbox/freethrows/2026-05-10.mp4
   ```

4. The tool auto-detects the 10 release moments (audio peaks). It prints
   them and lets you adjust any with `<n> <new_time>` (e.g. `3 01:24.5`).
5. For each shot, press `m` (make) or `x` (miss). Markings save to a
   sidecar `.shots.json` so re-runs skip the prompt.
6. Output appears in `output/freethrows/`.

The output is portrait 9:16 with:
- Shot counter top-left ("Shot 3 of 10")
- Running tally top-right ("2/3")
- 2.5x speed-up between shots, normal speed in a 2s-before / 3s-after
  window around each release.

### Game highlights

1. Drop the game video into `inbox/games/`. If the filename contains a
   date like `2026-05-10` it'll be detected automatically; otherwise the
   file modification date is used.
2. Mark made-basket timestamps. Easiest path:

   ```sh
   ./run.sh mark inbox/games/2026-05-10-vs-Tigers.mp4
   ```

   You'll be prompted to type each timestamp (`1:24`, `12:04.5`,
   `2:01:33`); type `done` when finished. Saves a sidecar
   `.shots.txt`.

   Alternative: open the video in QuickTime/VLC, write a `.shots.txt`
   file by hand with one timestamp per line, and skip the marker.

3. Run:

   ```sh
   ./run.sh process inbox/games/2026-05-10-vs-Tigers.mp4
   ```

4. Output appears in `output/games/` with a date title card, every
   marked play clipped (5s before → 2s after), and a randomly-picked
   track from `assets/music/` mixed under the original audio.

### Process everything in both inboxes

```sh
./run.sh process-all
```

Skips files that have no `.shots.txt` sidecar and prints an error.

## Tweaking parameters

Open `config/games.json` or `config/freethrows.json`. Every clip-window,
speed-ramp, overlay color, and font size is configurable without
touching code. Key knobs:

| File | Setting | Default |
|---|---|---|
| games.json | `clip_window_seconds.before / after` | 5 / 2 |
| games.json | `title_card.duration_seconds` | 2.5 |
| games.json | `music.volume_db` | -6 |
| freethrows.json | `speed_ramp.between_shots_multiplier` | 2.5 |
| freethrows.json | `speed_ramp.normal_window_*` | 2 / 3 |
| freethrows.json | `output.orientation` | portrait_9_16 |

## v1 limitations (known and intentional)

- **Game made-basket auto-detection is not implemented.** It's a
  research-grade ML problem on consumer game footage, and a flaky
  detector creates more review work than just typing timestamps. Manual
  marker is fast (~2 min per game). Auto-detection is a v2 candidate.
- **Player ID ("his plays only") is not implemented.** Currently every
  marked timestamp gets clipped. If you only mark his made baskets when
  marking, the output is already filtered to him.
- **Music ducking is a simple volume mix** rather than true sidechain
  compression. It sounds fine for highlight reels; revisit if the
  bench/whistle audio fights the music.
- **Filesystem watcher is not implemented.** Use `process-all` after
  drag-and-drop, or wire up `entr` / `fswatch` yourself.
- **Free-throw release detection** uses audio peaks — works well in a
  quiet gym with the camera near the rim, less well with crowd noise
  or a phone far from the basket. Fallback evenly splits the duration
  if fewer than 10 confident peaks are found; you can adjust each
  timestamp during the review step.
