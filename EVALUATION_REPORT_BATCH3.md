# Build Evaluation Report — Batch 3: 20 Extreme Apps

**Grade: 7.8 / 10**
**Date:** July 26, 2026
**Total apps in library:** 62 (12 original + 12 batch 1 + 15 batch 2 + 20 batch 3)

---

## Score Breakdown

| Category | Score | Notes |
|---|---|---|
| Code Quality | 7.5/10 | Heavy innerHTML usage, some dead code, no shared utilities |
| Functionality | 8.0/10 | Core features working across most apps, 3 unimplemented features |
| Security | 7.0/10 | 3 XSS vectors found (gantt, brainstorm, spreadsheet), Function() eval |
| Complexity | 9.0/10 | Significantly more complex than previous batches |
| UI/UX | 7.5/10 | Good aesthetics but inconsistent responsive design, no ARIA |
| Innovation | 8.5/10 | Terminal OS, Pixel Art animator, Data Pipeline DAG builder stand out |
| **Overall** | **7.8/10** | |

---

## App-by-App Evaluation

### Tier 1: Very Complex (5 apps)

| App | Score | Bugs | Security | Notes |
|---|---|---|---|---|
| **video-editor.html** | 8.0/10 | None | ✅ Safe | Timeline with trim handles, effects panel, play/pause, zoom. Canvas preview renders clip content. Export works. |
| **vector-editor.html** | 7.5/10 | Path tool UX unclear | ✅ Safe | SVG shapes, layers panel, color picker, resize handles. Path drawing lacks double-click indicator. SVG export works. |
| **chess-engine.html** | 6.5/10 | **Move history missing** | ✅ Safe | Full AI with minimax + alpha-beta pruning. Board renders, piece selection works, flip works. ❌ Move history panel never populated. |
| **paint-studio.html** | 7.0/10 | **Undo race condition** | ✅ Safe | 12 filters with convolution kernels, layers, blend modes, flood fill. Undo/redo async race condition. |
| **dungeon-crawler.html** | 8.5/10 | None | ✅ Safe | Procedural rooms+corridors, 7 enemy types, turn-based combat, inventory, leveling, descending depths. Polished. |

### Tier 2: Extreme (5 apps)

| App | Score | Bugs | Security | Notes |
|---|---|---|---|---|
| **music-daw.html** | 7.0/10 | Dead code (restartPlayback) | ✅ Safe | Multi-track DAW with synth, effects, sequencer. Clips can be added and played. Tracks can be muted/soloed. |
| **code-playground.html** | 8.0/10 | None | ⚠️ new Function() | Multi-file editor with tabs, file tree, live preview iframe, console output. Format, save/load features. |
| **finance-portfolio.html** | 8.5/10 | None | ✅ Safe | Holdings management, live price simulation, line chart, pie chart, allocation legend, KPI cards. |
| **gantt-chart.html** | 6.5/10 | **🔴 XSS: editNode innerHTML** | 🔴 XSS | Project planning with dependency arrows, critical path, task properties. Edit task prompt injects into innerHTML. |
| **data-pipeline.html** | 8.0/10 | None | ✅ Safe | Drag-and-drop DAG builder, palette of 9 node types, connection drawing, execution simulation, topological sort. |

### Tier 3: Ultra Extreme (5 apps)

| App | Score | Bugs | Security | Notes |
|---|---|---|---|---|
| **whiteboard-collab.html** | 8.0/10 | None | ✅ Safe | Freehand drawing, shapes (rect/circle/line/arrow), text, sticky notes, undo/redo, PNG export. |
| **particle-sim.html** | 8.5/10 | None | ✅ Safe | 9 presets (fire, galaxy, snow, etc.), real-time controls for all parameters, mouse interaction, glow rendering. |
| **brainstorm-map.html** | 6.5/10 | **🔴 XSS: editNode innerHTML** | 🔴 XSS | Mind map with auto-layout, minimap, pan/zoom, child/sibling adding. Edit prompt injects into innerHTML. |
| **photo-editor-pro.html** | 8.5/10 | None | ✅ Safe | 12 filters (grayscale through oil paint), 6 adjustment sliders, live histogram, image load/export. |
| **geometry-dash.html** | 5.5/10 | **🔴 pLayersize NaN bug in collision** | ✅ Safe | Auto-scrolling platformer with 3 levels, editor mode, trail effect, particles. ❌ Collision detection broken. |

### Tier 4: Insane (5 apps)

| App | Score | Bugs | Security | Notes |
|---|---|---|---|---|
| **spreadsheet-pro.html** | 6.0/10 | **🔴 Function() formula eval** | 🔴 XSS | 5 formula types (SUM/AVG/MIN/MAX/COUNT), CSV/JSON export, cell editing. Formula eval uses Function(). |
| **terminal-os.html** | 8.5/10 | innerHTML leak (performance) | ✅ Safe | 15+ commands, simulated file system, tree/ls/cd/cat/grep, neofetch, sudo easter egg. |
| **collage-maker.html** | 8.0/10 | None | ✅ Safe | 9 layout presets, image upload, stickers, spacing/radius/rotation controls, PNG export. |
| **charts-studio.html** | 8.0/10 | None | ✅ Safe | 4 chart types (line, bar, pie, doughnut), data table, animate mode, export composite. |
| **pixel-art.html** | 8.5/10 | None | ✅ Safe | 4 grid sizes, 24-color palette, animation frames (add/dup/delete), sprite sheet export, 4 tools. |

---

## 🔴 Critical Weaknesses Found

### 1. XSS Vulnerabilities (3 apps)

| App | Vector | Severity | Fix |
|---|---|---|---|
| **gantt-chart.html** | `editNode()` → `prompt()` text → innerHTML | 🔴 High | Escape with `escapeHTML()` or use `textContent` |
| **brainstorm-map.html** | `editNode()` → `prompt()` text → innerHTML | 🔴 High | Same fix |
| **spreadsheet-pro.html** | `Function()('"use strict";return ('+expr+')')()` | 🔴 High | Replace with math-only parser |

### 2. Game-Breaking Bugs

| App | Bug | Severity |
|---|---|---|
| **geometry-dash.html** | `pLayersize` variable shadowing causes NaN in collision detection | 🔴 Critical — game unplayable |
| **chess-engine.html** | Move history panel never populated (empty) | 🟡 Medium |
| **paint-studio.html** | Undo/redo async race condition on Image loading | 🟡 Medium |

### 3. Code Quality Issues

| Issue | Apps Affected |
|---|---|
| innerHTML for dynamic content (XSS vector if user input passes through) | 12/20 apps |
| No shared `escapeHTML()` utility across apps | 19/20 apps |
| No localStorage persistence | 16/20 apps |
| Missing responsive design for mobile | 8/20 apps |
| No ARIA labels on any interactive element | 20/20 apps |
| `innerHTML +=` in terminal-os causes DOM rebuild (performance) | 1/20 apps |

---

## 📊 Key Metrics

| Metric | Batch 3 | Cumulative |
|---|---|---|
| **Total apps** | 20 | 62 |
| **Total code** | ~420 KB | ~980 KB |
| **Lines of code** | ~14,500 | ~33,000 |
| **XSS vulnerabilities found** | 3 | 6 |
| **Critical bugs** | 3 | 5 |
| **Moderate bugs** | 2 | 4 |
| **Apps with localStorage** | 4 | 8 |

---

## 🏆 Standout Apps

1. **terminal-os.html** (8.5) — Most innovative. Full simulated filesystem with 15+ commands.
2. **pixel-art.html** (8.5) — Best use of canvas. Animation frames with sprite sheet export.
3. **dungeon-crawler.html** (8.5) — Most complete game. Procedural generation, 7 enemies, combat, inventory.
4. **particle-sim.html** (8.5) — Best visual effects. 9 presets, real-time controls, mouse interaction.
5. **photo-editor-pro.html** (8.5) — Most feature-complete. 12 filters, 6 adjustments, histogram.

---

## 🔧 Recommendations for Improvement

1. **Create shared utility module** — `escapeHTML()`, `generateId()`, `saveToStorage()` should be reused
2. **Add `textContent` check** — Scan all apps for user-controlled innerHTML and switch to textContent
3. **Fix geometry-dash collision** — Replace `pLayersize` with `PLAYER_SIZE`
4. **Implement formula sandbox** — Replace `Function()` with math-only evaluation in spreadsheet
5. **Add localStorage pattern** — Implement simple save/load in top 10 apps
6. **Add ARIA labels** — At minimum `role="button"` and `aria-label` on interactive elements
7. **Fix chess move history** — Store moves in array and render in the move-history div
