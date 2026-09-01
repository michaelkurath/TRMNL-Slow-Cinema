#!/usr/bin/env python3
"""Sample a film at 1 fps and prepare deterministic OG/X PNG sequences."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


DEVICES = {
    "og": {"width": 800, "height": 480, "levels": 2},
    "x": {"width": 1872, "height": 1404, "levels": 16},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Source movie file")
    parser.add_argument("--slug", required=True, help="Stable film identifier")
    parser.add_argument("--output", type=Path, default=Path("frames"))
    parser.add_argument("--sample-fps", type=int, default=1, choices=[1])
    parser.add_argument(
        "--workers",
        type=int,
        default=min(os.cpu_count() or 1, 8),
        help="Parallel PNG optimization workers (default: up to 8)",
    )
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def require_binary(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Required program not found: {name}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def duration_seconds(source: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def extract(source: Path, output: Path, width: int, height: int) -> None:
    output.mkdir(parents=True, exist_ok=True)
    filtergraph = (
        f"fps=1,scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,format=gray"
    )
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(source),
            "-an",
            "-vf",
            filtergraph,
            "-start_number",
            "0",
            "-fps_mode",
            "vfr",
            str(output / "%06d.png"),
        ],
        check=True,
    )


def optimize_frame(path: Path, levels: int) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.unlink(missing_ok=True)
    try:
        with Image.open(path) as source:
            grayscale = source.convert("L")
            if levels == 2:
                prepared = grayscale.convert(
                    "1", dither=Image.Dither.FLOYDSTEINBERG
                ).convert("L")
            else:
                step = 255 / (levels - 1)
                prepared = grayscale.point(lambda value: round(value / step) * step)
            prepared.save(temporary, format="PNG", optimize=True)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def optimize_frames(frames: list[Path], levels: int, workers: int) -> None:
    if workers <= 0:
        raise SystemExit("--workers must be a positive integer")
    with ProcessPoolExecutor(max_workers=workers) as executor:
        list(executor.map(optimize_frame, frames, [levels] * len(frames), chunksize=8))


def validate_frames(frames: list[Path], width: int, height: int, levels: int) -> None:
    for frame in frames:
        if frame.stat().st_size == 0:
            raise SystemExit(f"Generated an empty frame: {frame}")
        with Image.open(frame) as image:
            image.verify()
        with Image.open(frame) as image:
            if image.size != (width, height):
                raise SystemExit(
                    f"Unexpected frame dimensions for {frame}: {image.size}"
                )
            if image.convert("L").getcolors(maxcolors=levels + 1) is None:
                raise SystemExit(f"Too many grayscale levels in {frame}")


def main() -> None:
    args = parse_args()
    require_binary("ffmpeg")
    require_binary("ffprobe")

    source = args.source.resolve()
    if not source.is_file():
        raise SystemExit(f"Source movie not found: {source}")

    root = (args.output / "films" / args.slug).resolve()
    if root.exists() and any(root.iterdir()) and not args.overwrite:
        raise SystemExit(f"Output already exists: {root} (use --overwrite)")
    if args.overwrite and root.exists():
        shutil.rmtree(root)

    counts = {}
    for device, config in DEVICES.items():
        device_dir = root / device
        extract(source, device_dir, config["width"], config["height"])
        frames = sorted(device_dir.glob("*.png"))
        optimize_frames(frames, config["levels"], args.workers)
        validate_frames(
            frames, config["width"], config["height"], config["levels"]
        )
        counts[device] = len(frames)

    if len(set(counts.values())) != 1:
        raise SystemExit(f"Device frame counts differ: {counts}")

    manifest = {
        "schemaVersion": 1,
        "filmSlug": args.slug,
        "sampleFps": args.sample_fps,
        "durationSeconds": duration_seconds(source),
        "frameCount": next(iter(counts.values())),
        "sourceFile": source.name,
        "sourceSha256": sha256(source),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "devices": DEVICES,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
