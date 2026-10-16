# gaussian-scan — phone video → 3D Gaussian splat

Scan a physical item with your phone and get a viewable Gaussian splat back.
**All compute runs on the agent box** (`llmlab@192.168.1.234`); the phone is just a
browser, so there is nothing to install on it.

You are building an item stand + phone stand, which is the ideal rig for this:
the item turns on a platform, so the camera poses are **known from the rotation
angle** and no Structure-from-Motion is required. That single fact is why this
pipeline is small and reliable.

```
phone browser ──video──▶ :8090 ──queue──▶ ffmpeg frames ──▶ transforms.json (known poses)
                     ◀── viewer + .ply ── ns-export ◀── ns-train splatfacto
```

## 1. Using it

Open on your phone (same Wi‑Fi):

```
http://192.168.1.234:8090
```

1. Record one full slow turn of the item on the stand (§3).
2. Pick the clip, leave **Frames 120** / **Full turns 1**, press
   **Send & reconstruct**.
3. Watch the status. You can close the page — the scan keeps running.
4. When it says `done`, press **View** to open the Spark viewer, or
   **Download .ply**.

Timing on the agent box (2× RTX 3060), measured on a 640×480 / 60-frame clip:

| iterations | wall time |
|---|---|
| 1,500 | ~3.5 min (incl. frame extraction + export) |
| 3,000 | ~4 min training alone (~12.5 it/s) |
| 15,000 (default) | ~20 min |

## 2. Two scans at once

The box has two cards and nerfstudio trains single-GPU, so `server.py` runs **one
worker per GPU** and pins each scan with `CUDA_VISIBLE_DEVICES`. Submit two scans
and both cards work; a third queues. This is the same convention the repo already
uses for the two-card box (`training/remote/README.md`).

## 3. Capture protocol — this is where quality is won or lost

The pipeline is forgiving of *compute*, not of *capture*. In rough order of impact:

1. **Plain, featureless backdrop.** Black cloth, a plain wall, a seamless sheet —
   anything uniform. A busy background does not just distract: splatfacto cannot
   tell object from background, so it spends gaussians modelling your room. If you
   fix one thing, fix this.
2. **Frame the item at ~30–60 % of the image,** with margin on all sides. An item
   that runs off the edge is unreconstructable at the border.
3. **Lock exposure, focus and white balance** (tap-and-hold on iOS, AE/AF lock on
   Android). A clip that brightens halfway through bakes that change into the splat.
4. **Do not zoom, and do not switch lenses.** The pose model assumes *fixed*
   intrinsics; digital zoom or an ultrawide→wide handoff silently breaks it. Move
   the phone stand instead.
5. **Constant rotation, one full turn.** The tool divides 360° by the number of
   frames, so it trusts that the platform turned evenly. If the clip holds 3 turns,
   set **Full turns 3** — otherwise every pose is 3× wrong and the result is mush.
6. **Slow enough for no motion blur.** A full turn in ~20–30 s is comfortable at
   30–60 fps.
7. **Even, diffuse light; no moving shadows.** A shadow that sweeps as the item
   turns becomes a real object in the splat.
8. **120 frames over one turn is ~3° apart** — plenty. More frames mostly cost time.

A quick way to sanity-check a capture before uploading: scrub the clip. The item
should stay centred, the brightness should not shift, and the background should stay
boring.

## 4. Verified interfaces

Nothing below is guessed — each was read out of the installed packages or measured.

**nerfstudio 1.1.5** (`~/splat/.venv`):

```bash
ns-train splatfacto --data <dir> --output-dir <dir> --experiment-name scan \
    --max-num-iterations N --vis tensorboard \
    --pipeline.model.random-init True --pipeline.model.num-random 300000

ns-export gaussian-splat --load-config <config.yml> \
    --output-dir <dir> --output-filename point_cloud.ply
```

- The default dataparser is `nerfstudio-data`, which reads `transforms.json` — so
  the turntable path needs no dataparser flags.
- `splatfacto` defaults: `random_init=False`, `num_random=50000`, `sh_degree=3`.
  With no SfM point cloud the parser warns and falls back to random init, which is
  why `--pipeline.model.random-init True` is passed explicitly.
- Export is a **62-float binary PLY**, SH degree 3:
  `x y z nx ny nz f_dc_0..2 f_rest_0..44 opacity scale_0..2 rot_0..3`.

**`transforms.json`** keys written by `app/turntable.py` are exactly the ones
`nerfstudio/data/dataparsers/nerfstudio_dataparser.py` reads: `camera_model`,
`fl_x/fl_y`, `cx/cy`, `w/h`, `k1/k2/p1/p2`, `frames[].file_path`,
`frames[].transform_matrix` (camera-to-world, OpenGL convention).

**Viewer**: Spark **2.3.1** + three **0.180.0**, vendored under `static/vendor/`
so the phone needs no internet. API verified against the loaded bundle, not the
types: `new SparkRenderer({ renderer })`, `new SplatMesh({ url, onProgress })`,
`await splat.initialized`, `splat.getBoundingBox()`, and **`splat.numSplats`** (a
property — `getNumSplats()` is a method on the inner `PackedSplats`/`SplatLoader`,
not on `SplatMesh`, and calling it on the mesh throws).

The vendor tree needs **five** files, and one of them is easy to miss: three r168+
split the build, so `three.module.js` does `import ... from './three.core.js'`.
Omit `three.core.js` and every module fails to load (a module-fetch error, which
never reaches `window.onerror`), leaving the viewer stuck on "loading…" with no
canvas. `tools/vendor.sh` fetches all five and checks the graph.

## 5. Known environment issues

These are real and were hit during development:

- **`colmap` is broken on Ubuntu 26.04.** The distro package (`colmap 3.12.6-4`)
  links `libPoseLib.so`, which it neither ships nor declares as a dependency, so
  the binary refuses to start. This blocks `--pose-mode colmap` only; the
  turntable path does not use COLMAP at all. `pycolmap` is installed and works
  in-process if you later want a programmatic SfM fallback.
- **torch 2.6 breaks `ns-export`.** torch 2.6 flipped `torch.load` to
  `weights_only=True`, and nerfstudio 1.1.5 checkpoints contain a numpy scalar
  that is not allowlisted → `UnpicklingError` when loading the checkpoint. Pin
  **torch 2.5.1** (done in this install); do not "fix" it by allowlisting pickles
  from a file you do not control.
- **Ubuntu 26.04 ships only Python 3.14**, and nerfstudio needs <3.13. A standalone
  Python 3.11 is fetched with `uv` into `~/splat/.venv`, isolated from the studio
  venv at `llm-training-app/.venv`.
- **`chrome --dump-dom` cannot verify this viewer.** It dumps at the *load*
event, which fires long before the splat is fetched, so it always reports the
  initial `loading…` whether or not the viewer works. `tools/verify_viewer.py`
  drives Chrome over CDP and waits in real time instead (§7).

## 6. Files

| Path | What it is |
|---|---|
| `app/turntable.py` | Known-pose generator → `transforms.json`. Pose maths is unit-checked. |
| `app/pipeline.py` | video → frames → poses → train → export. Prints/returns each stage. |
| `app/server.py` | FastAPI: upload, queue (one worker per GPU), status, artifacts. |
| `app/static/index.html` | Phone-first upload + scan list UI. |
| `app/static/viewer.html` | Spark viewer: auto-frames the scan, touch orbit, Z-up fix. |
| `tools/make_synthetic_scan.py` | Renders a synthetic turntable clip — verifies the pipeline with no rig. |
| `tools/make_test_splat.py` | Emits a tiny green-top/red-bottom sphere to test the viewer's orientation. |
| `tools/verify_viewer.py` | Drives Chrome over CDP to prove the viewer renders (see §7). |
| `tools/vendor.sh` | Re-vendors the JS and **checks the module graph** (see §7). |
| `install.sh` | One-shot setup on the agent box. |
| `splat-scan.service` | systemd unit so the app survives reboot. |

## 7. Verifying it (no phone, no rig needed)

```bash
cd ~/splat

# 1. does the viewer actually draw? waits in real time, writes a PNG
.venv/bin/python tools/verify_viewer.py --scan testsplat --screenshot /tmp/v.png

# 2. the fixture is green-on-top / red-on-bottom, so the PNG also proves the
#    Z-up -> Y-up fix. Green centroid must be ABOVE red.
python3 - <<'EOF'
from PIL import Image
im = Image.open("/tmp/v.png").convert("RGB"); W,H = im.size; px = im.load()
gy, ry = [], []
for y in range(H):
    for x in range(W):
        r,g,b = px[x,y]
        if g>110 and g>r+40 and g>b+40: gy.append(y)
        elif r>110 and r>g+40 and r>b+40: ry.append(y)
print("green above red:", sum(gy)/len(gy) < sum(ry)/len(ry))
EOF

# 3. is the vendored JS complete and correctly mapped?
./tools/vendor.sh --check
```

The harness prints `RESULT: RENDERED` and exits 0 only when the page reports a
splat count. It also prints the WebGL context state and the import probe, so a
failure says *which* stage broke rather than just "blank screen".

## 8. Two bugs this harness caught

Both were invisible to `curl`, to HTTP status checks, and to `--dump-dom`. Both
would have broken the viewer on your phone.

1. **A missing vendor chunk.** three r168+ split its build, so `three.module.js`
   imports `./three.core.js`. Only `three.module.js` had been vendored, so three
   failed, and `spark.module.js` and `Pass.js` failed with it (they import
   `three`). A module-fetch failure never reaches `window.onerror`, so the page
   sat on `loading…` with no canvas and no error message. `tools/vendor.sh` now
   downloads all five files and refuses to pass unless every relative import
   resolves.
2. **A wrong method name.** The viewer called `splat.getNumSplats()`, which does
   not exist on `SplatMesh` — `getNumSplats()` is a method on the inner
   `PackedSplats`/`SplatLoader`; the mesh exposes **`splat.numSplats`** as a
   property. The type declarations do not make this distinction clear; reading the
   loaded bundle does.

## 9. Running it by hand

```bash
# server (what install.sh wires into systemd)
cd ~/splat/app
SPLAT_DATA=$HOME/splat/scans SPLAT_GPUS=2 \
  ~/splat/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8090

# the pipeline straight from the CLI, no web layer
~/splat/.venv/bin/python pipeline.py --video clip.mp4 --out-dir /tmp/scan \
    --frames 120 --turns 1 --iterations 15000 --gpu 0

# prove the whole thing without the physical rig
~/splat/.venv/bin/python make_synthetic_scan.py --out /tmp/synth --frames 60 --check-framing
ffmpeg -y -framerate 30 -i /tmp/synth/images/frame_%05d.jpg -c:v libx264 -pix_fmt yuv420p /tmp/synth.mp4
~/splat/.venv/bin/python pipeline.py --video /tmp/synth.mp4 --out-dir /tmp/e2e --frames 60 --iterations 3000
```

## 10. Re-vendoring the viewer's JS

```bash
./tools/vendor.sh            # download the pinned versions into app/static/vendor
./tools/vendor.sh --check    # verify hashes + module graph, download nothing
```

Pinned: three **0.180.0**, @sparkjsdev/spark **2.3.1**. Both are hash-checked, so a
silent upstream change cannot slip in. Re-run `--check` after touching the vendor
tree — it is the guard for bug 1 above.
