#!/usr/bin/env python3
"""
Render a synthetic turntable capture — a stand-in for a real phone clip.

Why: the physical rig does not exist yet, and the riskiest part of this app is
the *pose convention*. If the camera matrices we write don't match the geometry
they were shot from, training produces mush and nothing tells you why.

So this renders a known object (a box with six distinct face colours and a
sphere on top) from exactly the poses `turntable.py` generates, using the same
look-at maths. If the pipeline reconstructs a coherent, correctly-oriented
object from *these* frames, the convention is proven end to end.

Deliberately mimics the recommended capture setup: a **featureless backdrop**,
object centred, camera fixed on a circle. No floor, no texture in the
background — for a turntable that is not a stylistic choice, it is what keeps
SfM-free reconstruction honest.

    python make_synthetic_scan.py --out /tmp/synth --frames 60 --size 640x480
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
from turntable import build_transforms  # noqa: E402  (same convention, on purpose)

# Six distinct face colours so a wrong orientation is obvious at a glance.
FACE_COLORS = np.array([
    [220, 60, 60],    # +X red
    [60, 200, 90],    # -X green
    [70, 120, 240],   # +Y blue
    [230, 210, 70],   # -Y yellow
    [200, 80, 210],   # +Z magenta
    [70, 210, 210],   # -Z cyan
], dtype=np.float32)

BOX_MIN = np.array([-0.35, -0.55, -0.35], dtype=np.float32)
BOX_MAX = np.array([0.35, 0.55, 0.35], dtype=np.float32)
SPHERE_C = np.array([0.0, 0.62, 0.0], dtype=np.float32)
SPHERE_R = 0.30
LIGHT = np.array([0.4, 0.8, 0.5], dtype=np.float32)
LIGHT /= np.linalg.norm(LIGHT)


def _unit(v):
    return v / (np.linalg.norm(v) or 1.0)


def _rot_from_c2w(m):
    """Rotation part of a c2w matrix -> (right, up, -forward) as world vectors."""
    R = np.array(m, dtype=np.float32)[:3, :3]
    return R[:, 0], R[:, 1], R[:, 2]


def render(width: int, height: int, c2w, fov_deg: float) -> np.ndarray:
    """Raycast the box+sphere and shade it. Returns HxWx3 uint8."""
    fl = (width / 2.0) / math.tan(math.radians(fov_deg) / 2.0)
    cx, cy = width / 2.0, height / 2.0

    xs = np.arange(width, dtype=np.float32) + 0.5
    ys = np.arange(height, dtype=np.float32) + 0.5
    px, py = np.meshgrid(xs, ys)

    # Camera space: looks down -Z (OpenGL), image y increases downward.
    dx = (px - cx) / fl
    dy = -(py - cy) / fl
    dz = -np.ones_like(dx)
    dirs = np.stack([dx, dy, dz], axis=-1)

    R = np.array(c2w, dtype=np.float32)[:3, :3]
    eye = np.array(c2w, dtype=np.float32)[:3, 3]
    dirs = dirs @ R.T
    dirs /= np.linalg.norm(dirs, axis=-1, keepdims=True)

    best_t = np.full((height, width), np.inf, dtype=np.float32)
    color = np.full((height, width, 3), 22.0, dtype=np.float32)  # dark backdrop
    normal = np.zeros((height, width, 3), dtype=np.float32)

    # ── box (slab method) ────────────────────────────────────────────────
    with np.errstate(divide="ignore", invalid="ignore"):
        inv = 1.0 / dirs
        t1 = (BOX_MIN - eye) * inv
        t2 = (BOX_MAX - eye) * inv
    tmin = np.max(np.minimum(t1, t2), axis=-1)
    tmax = np.min(np.maximum(t1, t2), axis=-1)
    hit = (tmax > np.maximum(tmin, 0.0))
    t_box = np.where(hit, np.where(tmin > 0, tmin, tmax), np.inf)

    # Which axis produced tmin decides the face, which picks the colour.
    axis = np.argmax(np.minimum(t1, t2), axis=-1)
    # Per-axis sign of the camera relative to the box centre. `signs` is (3,);
    # indexing it with the (H,W) axis map gives the sign for each pixel's face.
    signs = np.sign(eye - (BOX_MIN + BOX_MAX) / 2.0).astype(np.float32)
    sign = signs[axis]
    face = axis * 2 + (sign < 0).astype(int)   # +X,-X,+Y,-Y,+Z,-Z
    box_color = FACE_COLORS[np.clip(face, 0, 5)]
    # Outward normal on a hit face points the same way as the camera's offset.
    n_box = np.zeros_like(dirs)
    for a in range(3):
        n_box[..., a] = np.where(axis == a, signs[a], 0.0)

    m = t_box < best_t
    best_t = np.where(m, t_box, best_t)
    color = np.where(m[..., None], box_color, color)
    normal = np.where(m[..., None], n_box, normal)

    # ── sphere ──────────────────────────────────────────────────────────
    oc = eye - SPHERE_C
    b = 2.0 * np.sum(dirs * oc, axis=-1)
    c = float(np.dot(oc, oc) - SPHERE_R ** 2)
    disc = b * b - 4.0 * c
    sph_hit = disc > 0
    t_s = np.where(sph_hit, (-b - np.sqrt(np.maximum(disc, 0))) / 2.0, np.inf)
    t_s = np.where(t_s > 0, t_s, np.inf)
    m2 = t_s < best_t
    p = eye + dirs * t_s[..., None]
    n_s = (p - SPHERE_C) / SPHERE_R
    sph_color = np.array([245.0, 245.0, 245.0], dtype=np.float32)
    best_t = np.where(m2, t_s, best_t)
    color = np.where(m2[..., None], sph_color, color)
    normal = np.where(m2[..., None], n_s, normal)

    # ── shade ───────────────────────────────────────────────────────────
    lam = np.clip(np.sum(normal * LIGHT, axis=-1), 0.0, 1.0)
    shade = 0.30 + 0.70 * lam
    # Only shaded where a surface was actually hit; the backdrop stays flat.
    # The mask is 2-D while the colour is HxWx3, so it needs a channel axis.
    shade3 = np.where(np.isfinite(best_t)[..., None], shade[..., None], 1.0)
    lit = color * shade3
    # Tiny deterministic grain: pure flat fills are unrealistically clean and
    # make the splat look better than a real capture would.
    rng = np.random.default_rng(7)
    lit = lit + rng.normal(0.0, 2.5, lit.shape)
    return np.clip(lit, 0, 255).astype(np.uint8)


def main() -> int:
    ap = argparse.ArgumentParser(description="synthetic turntable capture")
    ap.add_argument("--out", required=True, help="dataset dir to create")
    ap.add_argument("--frames", type=int, default=60)
    ap.add_argument("--size", default="640x480", help="WxH")
    ap.add_argument("--turns", type=float, default=1.0)
    ap.add_argument("--elevation-deg", type=float, default=12.0)
    ap.add_argument("--fov-deg", type=float, default=60.0)
    ap.add_argument("--distance", type=float, default=2.4,
                    help="camera distance; sets how much of the frame the item fills")
    ap.add_argument("--check-framing", action="store_true",
                    help="fail if the object touches the frame edge (clipped capture)")
    ap.add_argument("--skip-transforms", action="store_true",
                    help="frames only; let the pipeline write poses itself")
    args = ap.parse_args()

    from PIL import Image

    w, h = (int(x) for x in args.size.lower().split("x"))
    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)

    tf = build_transforms(args.frames, w, h, turns=args.turns,
                          elevation_deg=args.elevation_deg, fov_deg=args.fov_deg,
                          radius=args.distance)
    worst_coverage = 0.0
    clipped = []
    for i, frame in enumerate(tf["frames"]):
        img = render(w, h, frame["transform_matrix"], args.fov_deg)
        mask = img.max(axis=2) > 60
        worst_coverage = max(worst_coverage, mask.mean())
        # A capture where the item runs off the edge is unreconstructable at
        # the border — the same failure a badly-framed phone clip has.
        if (mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any()):
            clipped.append(i)
        Image.fromarray(img).save(out / "images" / f"frame_{i:05d}.jpg", quality=95)

    print(f"✅ rendered {len(tf['frames'])} frames @ {w}x{h} -> {out}/images")
    print(f"   max object coverage: {worst_coverage*100:.1f}% of frame")
    if clipped:
        print(f"   ⚠️  object touches the frame edge in {len(clipped)} frame(s): {clipped[:6]}")
        if args.check_framing:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
