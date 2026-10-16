#!/usr/bin/env python3
"""
Write a tiny, deterministic 3DGS .ply — a sphere that is GREEN on top and RED
on the bottom, in the model's own (Z-up) frame.

Why: it verifies the viewer without needing a trained scan.
  * a few thousand gaussians loads instantly, so a headless software renderer
    (swiftshader) actually finishes — a real 400k-gaussian scan does not
  * the colours encode orientation. nerfstudio exports "Vertical Axis: z" while
    three.js is Y-up, so the viewer rotates the splat -90° about X. If that is
    right, GREEN ends up at the top of the image. If the rotation is missing or
    inverted, rendering still "works" but the colours come out flipped or the
    sphere lies on its side — which is exactly the bug pixels alone would hide.

Property order is copied from a real nerfstudio 1.1.5 export (62 floats):
  x y z nx ny nz f_dc_0..2 f_rest_0..44 opacity scale_0..2 rot_0..3

    python make_test_splat.py --out /tmp/test-splat/point_cloud.ply
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path

import numpy as np

# 3DGS stores colour as an SH DC term: colour = 0.5 + SH_C0 * f_dc
SH_C0 = 0.28209479177387814
GREEN = np.array([0.10, 0.80, 0.15])
RED = np.array([0.85, 0.15, 0.10])


def make_sphere(n: int, radius: float = 0.5) -> np.ndarray:
    """Evenly-ish distributed points on a sphere (Fibonacci lattice)."""
    i = np.arange(n, dtype=np.float64) + 0.5
    phi = np.arccos(1.0 - 2.0 * i / n)              # polar angle
    theta = np.pi * (1.0 + 5.0 ** 0.5) * i          # golden angle
    x = radius * np.sin(phi) * np.cos(theta)
    y = radius * np.sin(phi) * np.sin(theta)
    z = radius * np.cos(phi)
    return np.stack([x, y, z], axis=1)


def write_ply(path: Path, positions: np.ndarray, colours: np.ndarray,
              scale: float = 0.018, opacity: float = 3.0) -> None:
    n = len(positions)
    props = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2"]
    props += [f"f_rest_{i}" for i in range(45)]
    props += ["opacity", "scale_0", "scale_1", "scale_2",
              "rot_0", "rot_1", "rot_2", "rot_3"]
    assert len(props) == 62, len(props)

    header = ["ply", "format binary_little_endian 1.0",
              "comment written by make_test_splat.py",
              "comment Vertical Axis: z",
              f"element vertex {n}"]
    header += [f"property float {p}" for p in props]
    header += ["end_header", ""]

    # f_dc encodes colour; everything else is a constant for this fixture.
    f_dc = (colours - 0.5) / SH_C0
    ln_scale = np.log(scale)

    rows = np.zeros((n, 62), dtype=np.float32)
    rows[:, 0:3] = positions
    rows[:, 3:6] = 0.0                       # normals unused by 3DGS
    rows[:, 6:9] = f_dc
    rows[:, 9:54] = 0.0                      # higher-order SH = flat colour
    rows[:, 54] = opacity                    # logit
    rows[:, 55:58] = ln_scale
    rows[:, 58] = 1.0                        # quaternion w
    rows[:, 59:62] = 0.0                     # x y z

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        fh.write(("\n".join(header)).encode("ascii"))
        fh.write(struct.pack(f"<{62 * n}f", *rows.reshape(-1)))


def main() -> int:
    ap = argparse.ArgumentParser(description="tiny deterministic 3DGS fixture")
    ap.add_argument("--out", required=True)
    ap.add_argument("--count", type=int, default=6000)
    ap.add_argument("--radius", type=float, default=0.5)
    args = ap.parse_args()

    pts = make_sphere(args.count, args.radius)
    # Top half green, bottom half red — in the model's Z-up frame.
    colours = np.where((pts[:, 2] > 0)[:, None], GREEN, RED).astype(np.float32)
    out = Path(args.out)
    write_ply(out, pts.astype(np.float32), colours)
    print(f"✅ {args.count} gaussians -> {out} ({out.stat().st_size/1e6:.2f} MB)")
    print(f"   top (z>0) = green {GREEN}, bottom (z<0) = red {RED}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
