#!/usr/bin/env python3
"""
Turntable pose generator — build a nerfstudio `transforms.json` from a
known rotation, so a phone-on-a-stand scan needs **no** Structure-from-Motion.

Why this exists
---------------
`ns-process-data video` runs COLMAP, which (a) is broken on this box's distro
and (b) is fragile on turntable footage anyway — a rotating object against a
rotating background is not the static scene SfM assumes. If the item sits on a
platform that turns a known amount, the camera poses are *known*: the camera is
effectively orbiting the object. So we synthesise them exactly.

The one assumption: the video captures a whole number of revolutions, and the
platform turns at a constant rate. Then frame `i` of `n` sits at

    theta_i = start_deg + 360 * turns * i / n        (negated for cw)

Coordinate convention (matches what nerfstudio's nerfstudio-data parser reads):
`transform_matrix` is camera-to-world, OpenGL style — camera looks down its own
-Z, +X right, +Y up. nerfstudio then re-orients/centres/scales the poses itself
(`auto_orient_and_center_poses`), so the nominal radius here only has to be
self-consistent, not metric.

Verified against nerfstudio 1.x source: the keys written here are exactly the
ones `nerfstudio/data/dataparsers/nerfstudio_dataparser.py` reads
(camera_model, fl_x/fl_y, cx/cy, w/h, k1/k2/p1/p2, frames[].file_path,
frames[].transform_matrix).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"}


def _look_at_c2w(eye, target=(0.0, 0.0, 0.0), up=(0.0, 1.0, 0.0)):
    """Camera-to-world matrix for a camera at `eye` looking at `target`.

    Columns are (right, up, -forward, position) — the OpenGL/NeRF convention
    where the camera's viewing axis is its own -Z.
    """
    def sub(a, b):
        return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

    def cross(a, b):
        return (a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0])

    def norm(v):
        n = math.sqrt(sum(c * c for c in v)) or 1.0
        return (v[0] / n, v[1] / n, v[2] / n)

    fwd = norm(sub(target, eye))          # where the camera looks
    right = norm(cross(fwd, up))
    true_up = cross(right, fwd)
    return [
        [right[0], true_up[0], -fwd[0], eye[0]],
        [right[1], true_up[1], -fwd[1], eye[1]],
        [right[2], true_up[2], -fwd[2], eye[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def frame_angles(n_frames: int, turns: float = 1.0, start_deg: float = 0.0,
                 clockwise: bool = False) -> list[float]:
    """Azimuth in degrees for each frame, evenly dividing `turns` revolutions."""
    if n_frames <= 0:
        raise ValueError("n_frames must be > 0")
    span = 360.0 * abs(turns)
    step = span / n_frames
    out = []
    for i in range(n_frames):
        a = start_deg + i * step
        out.append(-a if clockwise else a)
    return out


def build_transforms(n_frames: int, width: int, height: int, *,
                     turns: float = 1.0, start_deg: float = 0.0,
                     clockwise: bool = False, radius: float = 1.0,
                     elevation_deg: float = 12.0, fov_deg: float = 60.0,
                     filenames: list[str] | None = None,
                     camera_model: str = "OPENCV") -> dict:
    """The transforms.json payload for an even turntable sweep."""
    if fov_deg <= 0 or fov_deg >= 180:
        raise ValueError("fov_deg must be in (0, 180)")
    # Horizontal focal length from horizontal FOV; square pixels so fl_y == fl_x.
    fl = (width / 2.0) / math.tan(math.radians(fov_deg) / 2.0)
    elev = math.radians(elevation_deg)
    angles = frame_angles(n_frames, turns, start_deg, clockwise)

    frames = []
    for i, theta_deg in enumerate(angles):
        theta = math.radians(theta_deg)
        eye = (radius * math.cos(theta) * math.cos(elev),
               radius * math.sin(elev),
               radius * math.sin(theta) * math.cos(elev))
        name = filenames[i] if filenames else f"images/frame_{i:05d}.jpg"
        frames.append({
            "file_path": name,
            "transform_matrix": _look_at_c2w(eye),
            "colmap_im_id": i + 1,
        })

    return {
        "camera_model": camera_model,
        "fl_x": fl, "fl_y": fl,
        "cx": width / 2.0, "cy": height / 2.0,
        "w": width, "h": height,
        # No distortion estimate; zeroes make OPENCV behave as a pinhole, which
        # is the honest default when we haven't calibrated the phone lens.
        "k1": 0.0, "k2": 0.0, "p1": 0.0, "p2": 0.0,
        "frames": frames,
    }


def resolve_images(images_dir: Path) -> list[str]:
    """Sorted image paths, relative to the dataset root."""
    if not images_dir.is_dir():
        raise FileNotFoundError(f"no images dir at {images_dir}")
    names = sorted(p.name for p in images_dir.iterdir()
                   if p.is_file() and p.suffix in IMAGE_EXTS)
    if not names:
        raise FileNotFoundError(f"no images found in {images_dir}")
    return [f"images/{n}" for n in names]


def write_transforms(dataset_dir: Path, *, turns: float = 1.0,
                     start_deg: float = 0.0, clockwise: bool = False,
                     elevation_deg: float = 12.0, fov_deg: float = 60.0,
                     width: int | None = None, height: int | None = None,
                     camera_model: str = "OPENCV") -> dict:
    """Write transforms.json into `dataset_dir` (which holds images/).

    Image count drives the sweep: every extracted frame becomes one known pose.
    """
    from PIL import Image  # pillow ships with nerfstudio's dependency tree

    dataset_dir = Path(dataset_dir)
    rel = resolve_images(dataset_dir / "images")

    if width is None or height is None:
        with Image.open(dataset_dir / rel[0]) as im:
            w, h = im.size
        width = width or w
        height = height or h

    payload = build_transforms(
        len(rel), width, height, turns=turns, start_deg=start_deg,
        clockwise=clockwise, elevation_deg=elevation_deg, fov_deg=fov_deg,
        filenames=rel, camera_model=camera_model,
    )
    out = dataset_dir / "transforms.json"
    out.write_text(json.dumps(payload, indent=2))
    return payload


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate turntable poses (transforms.json)")
    ap.add_argument("dataset", help="dataset dir containing images/")
    ap.add_argument("--turns", type=float, default=1.0,
                    help="full revolutions captured in the clip (default 1)")
    ap.add_argument("--start-deg", type=float, default=0.0)
    ap.add_argument("--clockwise", action="store_true")
    ap.add_argument("--elevation-deg", type=float, default=12.0,
                    help="camera height above the object centre, in degrees")
    ap.add_argument("--fov-deg", type=float, default=60.0,
                    help="horizontal field of view of the phone lens")
    args = ap.parse_args()

    payload = write_transforms(
        Path(args.dataset), turns=args.turns, start_deg=args.start_deg,
        clockwise=args.clockwise, elevation_deg=args.elevation_deg,
        fov_deg=args.fov_deg,
    )
    print(f"✅ wrote {len(payload['frames'])} poses -> "
          f"{Path(args.dataset) / 'transforms.json'}")
    print(f"   {payload['w']}x{payload['h']} · fl={payload['fl_x']:.1f}px · "
          f"{args.turns} turn(s) · elevation {args.elevation_deg}°")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
