# Packaging — Veronica (VACA) desktop builds

Two independent platform folders, each holding a **fully usable app plus its
installer**. The original application tree is untouched: packaging only *reads*
from `backend/`, `frontend/` and the seed content dirs.

```
packaging/
├── electron/            shared desktop shell (the actual app source)
│   ├── main.js          main process: stages payload, spawns backend, window
│   ├── preload.js       contextBridge API (settings/status only)
│   ├── settings.html    Settings window
│   ├── electron-builder.yml
│   ├── stage-payload.sh assembles payload/ + vendors production deps
│   ├── llm-config.qwen14b.json   ship-time LLM config (Qwen2.5 14B only)
│   └── build/           app icons (png + ico)
├── linux/               ← Linux deliverables land here
└── windows/             ← Windows deliverables land here
```

## Build

```bash
# Linux: AppImage + .deb
bash packaging/linux/build.sh

# Windows: NSIS installer .exe (built from Linux via wine)
bash packaging/windows/build.sh
```

Each script re-stages the payload first, so it always ships the current
`backend/dist` and `frontend/dist`, and it runs `smoke-test.sh` as a **gate** —
a payload that cannot boot fails the build instead of reaching an installer.
Build the app workspaces first:

```bash
npm run build --workspace=backend
npm run build --workspace=frontend
```

### Verify a payload on its own

```bash
bash packaging/electron/smoke-test.sh
```

Boots the staged payload backend on a free port and asserts `/health` and `/`
respond, plus that no `dspark` key crept back into the shipped config.

## Output

| Folder | Artifacts |
|---|---|
| `packaging/linux/` | `Veronica-<ver>.AppImage`, `veronica_<ver>_amd64.deb`, `linux-unpacked/` |
| `packaging/windows/` | `Veronica-Setup-<ver>.exe`, `win-unpacked/` |

## How the app runs

The backend writes next to itself (`data/`, `projects/`, `users/`, `scripts/`).
Inside an installed app those paths are root-owned, so the shell **mirrors the
payload into the user's data dir on first run** and runs the backend from there:

| OS | Runtime copy |
|---|---|
| Linux | `~/.config/Veronica/runtime` |
| Windows | `%APPDATA%\Veronica\runtime` |

The backend is spawned on **Electron's own bundled Node**
(`ELECTRON_RUN_AS_NODE=1`), so no system Node install is required.

### Backend modes (Settings ▸ Backend)

- **Local (bundled)** — default. Runs the shipped backend on a free port.
- **Remote** — loads a backend already running elsewhere, e.g. the agent box at
  `http://192.168.1.234:3001`, and does not spawn anything locally.

## Model — Qwen2.5 14B only

This build ships pinned to a **single** model. `llm-config.qwen14b.json`
deliberately omits the `dspark` key, because the backend resolves its provider as
`config.dspark ? 'dspark' : config.ollama ? 'ollama' : 'gguf'` — omitting it is
what forces every role onto Ollama. `main.js` rewrites
`runtime/backend/llm-config.json` from Settings on each launch.

Set the endpoint to any Ollama/OpenAI-compatible server hosting the model
(`http://127.0.0.1:11434/v1` locally, or `http://192.168.1.234:11434/v1` for the
agent box).

The model *weights* are never bundled — they are tens of GB. The app needs a
reachable server that has `qwen2.5-coder:14b`.

## Before you distribute

- `packaging/electron/package.json` has placeholder `author`, `homepage` and
  `maintainer` values (derived from the repo's git identity). Replace them — the
  deb and the NSIS installer both embed them.
- The Windows installer is **unsigned** (no code-signing certificate is
  configured), so Windows will show a SmartScreen warning on first run.
- The Windows build is produced on Linux via wine; it was verified here by
  inspecting the installer and unpacked app, not by running it on Windows.

## Not shipped (deliberately)

`data/rico` (179 MB), `data/galaxy` (24 MB), `data/ladder-responses`, and the
`models/` directory (24 GB). The backend boots and serves without them; they are
large derived caches. Add them to `stage-payload.sh` if you want them bundled.
