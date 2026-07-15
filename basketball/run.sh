#!/usr/bin/env bash
# Convenience launcher: runs eagle from the basketball/ directory.
# Usage:
#   ./run.sh process inbox/freethrows/2026-05-10.mp4
#   ./run.sh process-all
#   ./run.sh mark inbox/games/2026-05-10-vs-Tigers.mp4
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -m src.eagle "$@"
