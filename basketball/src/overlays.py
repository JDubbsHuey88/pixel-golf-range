"""ffmpeg drawtext filter builders for shot counters, tallies, and title cards."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


_POSITION_EXPR = {
    "top_left":     ("{m}",                       "{m}"),
    "top_right":    ("w-tw-{m}",                  "{m}"),
    "bottom_left":  ("{m}",                       "h-th-{m}"),
    "bottom_right": ("w-tw-{m}",                  "h-th-{m}"),
    "center":       ("(w-tw)/2",                  "(h-th)/2"),
    "bottom_center":("(w-tw)/2",                  "h-th-{m}"),
}


def _escape(text: str) -> str:
    # ffmpeg drawtext escaping: backslashes, colons, and single quotes.
    return (
        text.replace("\\", "\\\\")
            .replace(":", "\\:")
            .replace("'", "\\'")
    )


@dataclass(frozen=True)
class OverlaySegment:
    """A piece of text shown for [start, end) seconds within the rendered output."""
    text: str
    start: float
    end: float
    position: str
    font_size_pct: float
    text_color: str
    box_color: str
    box_padding: int
    margin: int


def build_drawtext_chain(segments: Sequence[OverlaySegment]) -> str:
    """Build a chained drawtext filter string for a list of overlay segments.

    Each segment is gated by an `enable=between(t,start,end)` expression, so they only
    appear during their assigned slice of the output timeline.
    """
    if not segments:
        return "null"

    parts = []
    for seg in segments:
        x_expr, y_expr = _POSITION_EXPR[seg.position]
        x_expr = x_expr.format(m=seg.margin)
        y_expr = y_expr.format(m=seg.margin)
        # Font size keyed off output height so it scales with portrait/landscape
        font_size_expr = f"(h*{seg.font_size_pct}/100)"
        parts.append(
            "drawtext="
            f"text='{_escape(seg.text)}':"
            f"fontcolor={seg.text_color}:"
            f"fontsize={font_size_expr}:"
            f"box=1:boxcolor={seg.box_color}:boxborderw={seg.box_padding}:"
            f"x={x_expr}:y={y_expr}:"
            f"enable='between(t,{seg.start:.3f},{seg.end:.3f})'"
        )
    return ",".join(parts)


def build_title_card_filter(
    text_lines: Sequence[str],
    width: int,
    height: int,
    duration: float,
    background_color: str = "black",
    text_color: str = "white",
) -> tuple[str, str]:
    """Return (lavfi_input_spec, drawtext_chain) for a generated title-card clip.

    The lavfi spec is fed via `-f lavfi -i <spec>`, producing a silent solid-color
    clip; the drawtext chain is then applied via the filter graph to stack the
    lines centered on the card.
    """
    line_count = max(1, len(text_lines))
    line_filters = []
    for i, line in enumerate(text_lines):
        offset = (i - (line_count - 1) / 2.0) * 0.12
        y_expr = f"(h-th)/2 + ({offset:+.3f})*h"
        line_filters.append(
            "drawtext="
            f"text='{_escape(line)}':"
            f"fontcolor={text_color}:"
            f"fontsize=h/12:"
            f"x=(w-tw)/2:y={y_expr}"
        )
    chain = ",".join(line_filters) if line_filters else "null"
    spec = f"color=c={background_color}:s={width}x{height}:d={duration:.3f}"
    return spec, chain
