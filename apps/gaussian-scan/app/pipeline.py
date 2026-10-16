#!/usr/bin/env python3
"""
The scan pipeline: phone video in, Gaussian splat out.

    video ──ffmpeg──▶ images/ ──turntable──▶ transforms.json
          ──ns-train splatfacto──▶ config.yml ──ns-export──▶ point_cloud.ply

Every external command is invoked with arguments verified against the installed
nerfstudio (see README "Verified interfaces"); nothing here is guessed.

Runs one scan per GPU. The agent box has two 3060s, so two scans can run at
once — pin each with --gpu and CUDA_VISIBLE_DEVICES, which is this repo's
existing convention for the two-card box (training/remote/README.md) and
sidesteps nerfstudio's lack of multi-GPU training.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV_BIN = Path(os.environ.get("SPLAT_VENV", Path.home() / "splat/.venv")) / "bin"


class StepFailed(RuntimeError):
    """A pipeline step failed; the message carries the tail of its output."""


@dataclass
class ScanSpec:
    video: Path
    out_dir: Path
    frames: int = 120
    turns: float = 1.0
    start_deg: float = 0.0
    clockwise: bool = False
    elevation_deg: float = 12.0
    fov_deg: float = 60.0
    iterations: int = 15000
    max_dim: int = 1600
    gpu: int = 0
    pose_mode: str = "turntable"        # or "colmap" (needs a working colmap)
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    log: list[str] = field(default_factory=list)

    @property
    def images_dir(self) -> Path:
        return self.out_dir / "images"

    @property
    def dataset_dir(self) -> Path:
        return self.out_dir / "dataset"

    @property
    def train_dir(self) -> Path:
        return self.out_dir / "train"

    @property
    def export_dir(self) -> Path:
        return self.out_dir / "export"


def _run(cmd: list[str], spec: ScanSpec, cwd: Path | None = None) -> str:
    """Run a command, tee its output into the scan log, raise on failure."""
    spec.log.append("$ " + " ".join(str(c) for c in cmd))
    env = dict(os.environ)
    # Pin the card for this scan; nerfstudio itself is single-GPU.
    env["CUDA_VISIBLE_DEVICES"] = str(spec.gpu)
    env.setdefault("PYTHONUNBUFFERED", "1")
    proc = subprocess.run([str(c) for c in cmd], cwd=str(cwd) if cwd else None,
                          env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True)
    out = proc.stdout or ""
    spec.log.extend(out.splitlines()[-400:])
    if proc.returncode != 0:
        tail = "\n".join(out.splitlines()[-25:])
        raise StepFailed(f"{cmd[0]} exited {proc.returncode}\n{tail}")
    return out


def probe_video(spec: ScanSpec) -> dict:
    """Duration / fps / size, so frame count is derived from the real clip."""
    out = _run([
        spec.ffprobe, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,nb_frames,avg_frame_rate,duration",
        "-show_entries", "format=duration",
        "-of", "json", str(spec.video),
    ], spec)
    data = json.loads(out)
    stream = (data.get("streams") or [{}])[0]
    duration = stream.get("duration") or (data.get("format") or {}).get("duration") or 0
    try:
        num, den = (stream.get("avg_frame_rate") or "0/1").split("/")
        fps = float(num) / float(den) if float(den) else 0.0
    except (ValueError, ZeroDivisionError):
        fps = 0.0
    info = {
        "width": stream.get("width"), "height": stream.get("height"),
        "duration": float(duration or 0.0), "fps": fps,
    }
    if info["duration"] <= 0:
        raise StepFailed("could not read a duration from the video — is it valid?")
    return info


def extract_frames(spec: ScanSpec, info: dict) -> int:
    """Evenly sample `frames` stills across the clip, downscaled for VRAM."""
    if spec.images_dir.exists():
        shutil.rmtree(spec.images_dir)
    spec.images_dir.mkdir(parents=True, exist_ok=True)
    fps = spec.frames / info["duration"]
    # -2 keeps the aspect ratio while forcing an even height (codec requirement).
    scale = f"scale='min({spec.max_dim},iw)':-2"
    _run([
        spec.ffmpeg, "-y", "-i", str(spec.video),
        "-vf", f"fps={fps:.6f},{scale}",
        "-q:v", "2", str(spec.images_dir / "frame_%05d.jpg"),
    ], spec)
    got = sorted(spec.images_dir.glob("*.jpg"))
    if not got:
        raise StepFailed("ffmpeg produced no frames")
    return len(got)


def prepare_poses(spec: ScanSpec) -> Path:
    """Build the nerfstudio dataset dir (images + transforms.json)."""
    from turntable import write_transforms

    if spec.dataset_dir.exists():
        shutil.rmtree(spec.dataset_dir)
    spec.dataset_dir.mkdir(parents=True, exist_ok=True)
    # nerfstudio's parser resolves frames relative to the data dir.
    if (spec.dataset_dir / "images").exists():
        shutil.rmtree(spec.dataset_dir / "images")
    shutil.move(str(spec.images_dir), str(spec.dataset_dir / "images"))

    if spec.pose_mode == "turntable":
        write_transforms(
            spec.dataset_dir, turns=spec.turns, start_deg=spec.start_deg,
            clockwise=spec.clockwise, elevation_deg=spec.elevation_deg,
            fov_deg=spec.fov_deg,
        )
        return spec.dataset_dir

    # Fallback: let ns-process-data + COLMAP solve the poses. Blocked on distros
    # whose colmap package is broken (see README "Known environment issues").
    if shutil.which("colmap") is None:
        raise StepFailed(
            "pose_mode=colmap needs the `colmap` binary, which is not installed")
    _run([
        str(VENV_BIN / "ns-process-data"), "video",
        "--data", str(spec.video), "--output-dir", str(spec.dataset_dir),
        "--num-frames-target", str(spec.frames),
    ], spec)
    return spec.dataset_dir


def train(spec: ScanSpec) -> Path:
    """ns-train splatfacto; returns the config.yml of the finished run."""
    spec.train_dir.mkdir(parents=True, exist_ok=True)
    _run([
        str(VENV_BIN / "ns-train"), "splatfacto",
        "--data", str(spec.dataset_dir),
        "--output-dir", str(spec.train_dir),
        "--experiment-name", "scan",
        "--max-num-iterations", str(spec.iterations),
        "--vis", "tensorboard",
        # Guaranteed sensible start when there is no SfM point cloud to seed
        # from (the turntable path has none).
        "--pipeline.model.random-init", "True",
        "--pipeline.model.num-random", "300000",
    ], spec)

    configs = sorted(spec.train_dir.rglob("config.yml"))
    if not configs:
        raise StepFailed(f"no config.yml produced under {spec.train_dir}")
    return configs[-1]


def export_ply(spec: ScanSpec, config: Path) -> Path:
    """ns-export gaussian-splat -> point_cloud.ply."""
    spec.export_dir.mkdir(parents=True, exist_ok=True)
    _run([
        str(VENV_BIN / "ns-export"), "gaussian-splat",
        "--load-config", str(config),
        "--output-dir", str(spec.export_dir),
        "--output-filename", "point_cloud.ply",
    ], spec)
    ply = spec.export_dir / "point_cloud.ply"
    if not ply.exists():
        found = list(spec.export_dir.rglob("*.ply"))
        if not found:
            raise StepFailed(f"export produced no .ply in {spec.export_dir}")
        ply = found[0]
    return ply


def run_scan(spec: ScanSpec, on_step=None) -> dict:
    """Run every stage. Returns a result dict; raises StepFailed on error."""
    def step(name):
        if on_step:
            on_step(name)

    spec.out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    result: dict = {"video": str(spec.video), "out_dir": str(spec.out_dir)}

    step("probing video")
    info = probe_video(spec)
    result["video_info"] = info

    step(f"extracting {spec.frames} frames")
    n_frames = extract_frames(spec, info)
    result["frames"] = n_frames

    step("building poses")
    prepare_poses(spec)
    result["pose_mode"] = spec.pose_mode

    step(f"training {spec.iterations} iterations on GPU {spec.gpu}")
    config = train(spec)
    result["config"] = str(config)

    step("exporting splat")
    ply = export_ply(spec, config)

    result["ply"] = str(ply)
    result["ply_bytes"] = ply.stat().st_size
    result["seconds"] = round(time.time() - t0, 1)
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="phone video -> gaussian splat")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--frames", type=int, default=120)
    ap.add_argument("--turns", type=float, default=1.0)
    ap.add_argument("--start-deg", type=float, default=0.0)
    ap.add_argument("--clockwise", action="store_true")
    ap.add_argument("--elevation-deg", type=float, default=12.0)
    ap.add_argument("--fov-deg", type=float, default=60.0)
    ap.add_argument("--iterations", type=int, default=15000)
    ap.add_argument("--max-dim", type=int, default=1600)
    ap.add_argument("--gpu", type=int, default=0)
    ap.add_argument("--pose-mode", choices=["turntable", "colmap"], default="turntable")
    args = ap.parse_args()

    spec = ScanSpec(
        video=Path(args.video).resolve(), out_dir=Path(args.out_dir).resolve(),
        frames=args.frames, turns=args.turns, start_deg=args.start_deg,
        clockwise=args.clockwise, elevation_deg=args.elevation_deg,
        fov_deg=args.fov_deg, iterations=args.iterations, max_dim=args.max_dim,
        gpu=args.gpu, pose_mode=args.pose_mode,
    )

    def on_step(name):
        print(f"▶ {name}", flush=True)

    result = None
    try:
        result = run_scan(spec, on_step=on_step)
    except StepFailed as e:
        print(f"\n❌ {e}", file=sys.stderr)
    finally:
        (spec.out_dir / "pipeline.log").write_text("\n".join(spec.log[-2000:]))
        if result:
            (spec.out_dir / "result.json").write_text(json.dumps(result, indent=2))

    if not result:
        return 1
    print(f"\n✅ splat: {result['ply']} ({result['ply_bytes']/1e6:.1f} MB) "
          f"in {result['seconds']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
