# R11 — 3D Ability Probe Report

Date: 2026-08-10 · Model: Qwen2.5-7B-Instruct-Uncensored.R11.Q4_K_M (sha256 95950d37…)
Method: 8 Three.js app prompts (mirroring the round-11 3D training set) via
dspark `/v1/chat/completions`; each generated HTML render-gated in headless
Chrome (WebGL/swiftshader) with `scripts/smoke-test-html.py` (console/page
errors, WebGL canvas, fallback banner, screenshot).

## Results

| App | Raw | +OrbitControls fix | Defect class |
|---|---|---|---|
| solar-system | ❌ | ❌ | Hallucinated API: `THREE.OrbitPath is not a constructor` |
| chess | ❌ | ❌ | 3× broken external texture URLs (404) — scene otherwise runs |
| maze-explorer | ❌ | ✅ | OrbitControls dependency wiring only |
| terrain-viewer | ❌ | ❌ | Hallucinated API: `THREE.OctaveNoise is not a constructor` |
| fireworks | ❌ | ❌ | Real JS bug: duplicate `firework` declaration |
| product-showcase | ❌ | ✅ | OrbitControls dependency wiring only |
| bar-chart | ❌ | ❌ | Null deref: `Cannot read properties of null (reading 'style')` |
| rubiks-cube | ❌ | ✅ | OrbitControls dependency wiring only |

**Raw pass rate: 0/8 · After mechanical OrbitControls wiring fix: 3/8**

## Capability read

**Works reliably:** single-file HTML scaffolding; loads THREE.js core from the
right CDN; creates a WebGL canvas; builds scene/camera/renderer structure;
produces compact, readable code (600–1000 tokens per app).

**Fails consistently:**
1. **OrbitControls dependency (7/8).** Either references a nonexistent cdnjs
   path (`three.js/r128/controls/OrbitControls.min.js` — 404) or omits the
   OrbitControls script entirely. The training apps loaded it from the
   jsdelivr `three@0.128.0/examples/js/controls/OrbitControls.js` path — the
   model did not retain this convention.
2. **Hallucinated Three.js APIs (2/8).** `THREE.OrbitPath` and
   `THREE.OctaveNoise` do not exist in Three.js — API-name precision is not
   yet imprinted.
3. **Small JS defects (2/8).** Duplicate identifier; null DOM deref.
4. **Broken external assets (1/8).** Chess references 3 nonexistent example
   textures (404) but the scene otherwise runs.

## Interpretation

This matches the round-11 dose: a 26-optimizer-step (LR 5e-5) 3D continuation.
The model learned "what a 3D app looks like" (structure, THREE core usage)
but not the exact conventions (dependency wiring, real API names). Stronger
imprinting requires the full multi-hour run chained from the R11 trained LoRA
(`training/cloud/out/round11/adapter_trained/`), plus defect rows for the
observed error classes in the next dataset.

## Artifacts

- `probes/r11-3d/<name>.html` — raw generated apps
- `probes/r11-3d/<name>-repaired.html` — with canonical OrbitControls fix
- `probes/r11-3d/<name>[-repaired]-shot.png` — headless-Chrome screenshots
- `results.json` (raw) · `results-repaired.json` (repaired tier)
- Repro: `scripts/probe-r11-3d.py` · `scripts/probe-r11-3d-repair.py`
