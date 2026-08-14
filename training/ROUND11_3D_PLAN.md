# ROUND 11 — 3D Rendering Capability (Three.js)

**Goal:** make the tuned Qwen2.5 generate *stunning* 3D GUI apps — real depth,
shadows, lighting, animated 3D games (chess first) — instead of flat 2D.

**Status:** all three levers shipped (recipes → gate → dataset). Training is
**NOT started** — this plan is the runbook. Launcher:
`scripts/launch-qlora-3d-round.py` (mirror of `launch-qlora-gui-design.py`).

---

## The three levers (already in place)

1. **Prompt/pattern layer (shipped, zero-GPU, live today)**
   - `data/library/44-threejs-scene-recipes.md` — CDN-safe r128 UMD recipes,
     scene skeleton, lighting/shadows, materials, LatheGeometry chess pieces,
     checkerboard board, lerp animation, particles, CSS-3D fallback, failure
     modes. Registered in `00-reference-index.md`, injected via
     `backend/src/ai/librarySystemPrompt.ts`, metadata in
     `backend/src/routes/library.ts`.
   - `02-app-type-templates.md` → new "3D App" template + keywords.
   - `12-game-development-patterns.md` → new §8 Rendering & 3D.
   - **The current deployed model is already 3D-capable via these prompts.**
     Probe it BEFORE training to get the baseline (see Verification).

2. **Verification layer (shipped)**
   - `scripts/smoke-test-html.py` — headless-Chrome (Playwright + system
     Chrome) render gate: console/page errors, WebGL canvas, 3D-fallback
     banner, screenshot. Exit 0 = PASS.
   - Wired into the codegen gate: `runRenderSmoke` in
     `backend/src/routes/codePlanner.ts` — runs on every generated HTML entry
     and reports `renderSmoke: {status, errors, detail}` in the write-code
     response; `test-one-shot.py` prints it.
   - Reference app `projects/3d-chess.html` verified: PASS, zero errors; full
     game loop (e2-e4 → AI reply → turn cycle) exercised via `window.__vaca3d`
     test hook.

3. **Training layer (this round)**
   - Dataset: `new training data set/chunk-3d.jsonl` (built by
     `build-3d-chunk.py`) — 22 rows: 9 full-app rows + 13 focused recipe rows.
     Every HTML row was render-verified by `scripts/smoke-test-html.py`
     (9/9 compact copies PASS, zero page/console errors) before inclusion.
     Full apps (compact, verified — the corpus-wide truncation mechanism
     applies to rows over the budget):
       1. 3D chess (rules + minimax AI + animation) — ~7.7k tok
       2. Solar system (pivot-group orbits, rings, raycaster facts)
       3. Product showcase (cinematic 3-point lighting, LatheGeometry bottle)
       4. Rubik's cube (face materials, pivot+attach+bake layer turns)
       5. Maze explorer (recursive-backtracker gen, first-person collision,
          minimap)
       6. Fireworks (Points bursts, AdditiveBlending, gravity lifecycle)
       7. Terrain viewer (seeded fbm value noise, color bands)
       8. Torus knot showcase (metal material, orbit particles, color cycle)
       9. 3D bar chart (HSL gradient bars, grow-in, hover tooltip)
     Focused rows (all fit seq-2048): scene skeleton, LatheGeometry pieces,
     lerp animation + picking, chess rules + minimax, pivot-group orbits,
     three-point lighting rig, Rubik's layer-rotation bake, maze gen + FPS
     collision, fireworks particle bursts, terrain fbm noise, bar-chart hover,
     torus-knot orbit particles, BoxGeometry face materials.

## Config (proven on 2× RTX 3060 12GB)

- QLoRA 4-bit, `max_seq_length=3072` (fits 8/9 compact full-app rows; only
  the 3d-chess row at ~7.7k truncates, like larger rows corpus-wide), lora
  r8/α16/d0.05, lr 2e-4, 2 epochs, batch 1, grad-accum 8, GGUF q4_k_m
  export automatic.
- Retention mix: `chunk-1.jsonl` @ 0.15 — the 2D corpus stays alive so the
  round can't regress prior UI/codegen quality.

## Run

```bash
bash scripts/start-dspark.sh --stop            # free both GPUs
python3 scripts/launch-qlora-3d-round.py --dry-run
python3 scripts/launch-qlora-3d-round.py       # or torchrun --standalone --nproc_per_node=2
# GGUF lands in training/gui_trainer/models/ → deploy watcher picks it up:
bash scripts/deploy-tuned-dspark.sh --now training/gui_trainer/models/*q4_k_m.gguf
```

## Verification (before AND after the round)

```bash
# 3D probe set — same requests, before/after
python3 scripts/test-one-shot.py "a 3d chess game in a single html file with three.js, animated pieces, and an ai opponent"
python3 scripts/test-one-shot.py "a rotating 3d product showcase page with particles and orbit controls"
python3 scripts/test-one-shot.py "a 3d maze explorer game with first-person camera"
# watch the new fields:
#   renderSmoke: passed/failed — the actual render verdict (headless Chrome)
#   tscErrors / contractViolations — existing gates
# Every renderSmoke=passed + tsc-clean request is a win vs the Aug-7 baseline.
```

## Success criteria

- ≥ 2/3 3D probe requests render `renderSmoke: passed` with 0 console errors
  (vs 0/3 before the round, where 3D wasn't even attempted correctly).
- No regression: 2D probe set (weather GUI, todo CLI, CSV tool, expense
  tracker) keeps tsc-clean rates where they were pre-round.

## If the round under-delivers

1. The recipes are already in the prompt — check the generated HTML against
   `44-threejs-scene-recipes.md` for CDN/version drift first.
2. Add more verified 3D examples to the chunk (each MUST render green under
   `scripts/smoke-test-html.py` before inclusion — the gate is the curator).
3. Raise `--seq` (4096) only for the focused rows; never for the full app row.
