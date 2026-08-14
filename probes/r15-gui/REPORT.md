# R15 GUI-App Battery (dual-gate, DOM bar)

**Through dspark serving R14 — RAW 8/12 GUI apps pass; after mechanical repair 10/12 pass.**
Gate: 0 page/console errors + DOM probe + interactive elements (no WebGL bar).

| App | Raw | Repaired | Class |
|---|---|---|---|
| interactive-dashboard | ✅ | ✅ | GUI-fixable (mechanical repair) |
| kanban-board | ❌ | ✅ | GUI-fixable (mechanical repair) |
| chat-app | ✅ | ✅ | GUI-fixable (mechanical repair) |
| terminal-os | ✅ | ✅ | GUI-fixable (mechanical repair) |
| spreadsheet-pro | ✅ | ✅ | GUI-fixable (mechanical repair) |
| todo-list | ✅ | ✅ | GUI-fixable (mechanical repair) |
| markdown-previewer | ✅ | ❌ | other |
| weather-widget | ❌ | ✅ | GUI-fixable (mechanical repair) |
| pomodoro-timer | ✅ | ✅ | GUI-fixable (mechanical repair) |
| code-editor | ✅ | ✅ | GUI-fixable (mechanical repair) |
| music-player | ❌ | ❌ | asset/network 404 |
| quiz-app | ❌ | ✅ | GUI-fixable (mechanical repair) |

## Verdict

- RAW GUI pass: 8/12 (first GUI breadth measure for R14).
- Repaired pass: 10/12.

Run: `python3 scripts/probe-r15-gui.py` — apps in `probes/r15-gui/`.
`results.json`.