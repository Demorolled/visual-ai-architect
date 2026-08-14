# R15 Random-3D Breadth Probe (dual-gate)

**Through dspark serving R15 — RAW 4/12 apps pass; after mechanical wiring repair 10/12 pass.**
(R13 baseline: raw 0/12; R11 baseline: raw 0/8 → 3/8 after OrbitControls fix.)

| App | Raw | Repaired | Class |
|---|---|---|---|
| city-skyline | ❌ | ✅ | wiring-only (fixed by addon injection) |
| galaxy-spiral | ❌ | ✅ | wiring-only (fixed by addon injection) |
| ocean-waves | ❌ | ✅ | wiring-only (fixed by addon injection) |
| dna-helix | ✅ | ✅ | wiring-only (fixed by addon injection) |
| lava-lamp | ✅ | ✅ | wiring-only (fixed by addon injection) |
| snow-globe | ✅ | ✅ | wiring-only (fixed by addon injection) |
| molecule-viewer | ❌ | ❌ | other |
| voxel-castle | ✅ | ✅ | wiring-only (fixed by addon injection) |
| butterfly-swarm | ❌ | ❌ | wiring (addon missing) |
| donut-shop | ❌ | ✅ | wiring-only (fixed by addon injection) |
| shooting-stars | ❌ | ✅ | wiring-only (fixed by addon injection) |
| audio-visualizer | ❌ | ✅ | wiring-only (fixed by addon injection) |

## Verdict

- RAW gain vs R13 (0/12): **4 app(s) now pass clean without any repair** — the wiring defect is being learned.
- Repaired-only passes (6) are pure wiring failures (addon script / CDN case).

Run: `python3 scripts/probe-r15-3d.py` — apps in `probes/r15-3d/`, `results.json`.