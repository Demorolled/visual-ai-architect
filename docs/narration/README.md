# VACA hover narration

Hover a headline control in the running app and VACA **speaks** a technical
deep-dive about what that control actually does — the React handler, the API
call, the Express route, and the subsystem behind it.

Nothing is drawn. No tooltip, no overlay, no DOM change. It is audio only, so it
never appears in a screen recording, and the voice is the app's own voice
service (the same one that reads chat replies), so it honours your TTS settings.

**49 controls, 26:55 of narration in total.** Full text and timings:
[`CONTROLS.md`](./CONTROLS.md).

---

## Recording with it

1. The app must be the narration-enabled build (see *Enabling* below).
2. Rest on a control for **450 ms**. It narrates once. Move away and back to
   hear it again.
3. Movement across controls is silent — a pointer on its way somewhere else does
   not trigger anything.
4. Controls with no entry stay silent, and the console logs `[narration] no entry
   for X` so the gap is visible rather than mysterious.

If you want to hear an entry without hunting for the button, open the renderer
console and call:

```js
__vacaNarration.entries()            // what is mapped
__vacaNarration.speakEntry('toolbar.generate')
__vacaNarration.stats()              // how many have been spoken this session
__vacaNarration.keys()               // every match key
```

## Enabling and disabling

Narration is **off by default** — a normal build is completely unaffected.

| Method | Effect |
|---|---|
| `VITE_VACA_NARRATION=1 npm run build` | bakes it on for that bundle |
| `localStorage['vaca-narration'] = '1'` | forces on, overriding the build |
| `localStorage['vaca-narration'] = '0'` | forces off, overriding the build |
| `?narration=1` / `?narration=0` in the URL | same, per load |

Rebuilding the frontend **without** the flag turns it off again. That is
intentional: it is a recording tool, not a product feature.

---

## The toolchain

| File | Purpose |
|---|---|
| `extract-controls.py` | parses every `<button>`/`<a>`/`<select>`/`<input>` in the frontend into `controls.json` + `controls.md` |
| `render-reference.mjs` | renders the narration map into `CONTROLS.md` so the doc cannot drift from what is spoken |
| `deploy-narration.sh` | builds with narration on and deploys into the installed app, **verifying the string is in the bundle before copying** |
| `reset-pwa-cache.mjs` | unregisters the service worker and clears its caches in the running window |
| `verify-hover-cdp.mjs` | drives real hovers in the running app over the DevTools protocol and checks audio came back |

Regenerate the reference after editing the map:

```bash
cd /home/homellmlab/Desktop/visual-ai-architect
python3 docs/narration/extract-controls.py
node    docs/narration/render-reference.mjs
bash    docs/narration/deploy-narration.sh
```

---

## What the scan found

Numbers from the source tree, not estimates:

| Layer | Size |
|---|---|
| Frontend | 135 TS/TSX files · **36,098 lines** · **391 interactive controls** across 51 files |
| Backend | 249 TS files · **96,208 lines** · **101 routes** in 60 route modules · 37 mounted routers |
| Heaviest single files | `codePlanner.ts` 339 KB · `reasoning.ts` 87 KB · `architect.ts` 63 KB · `scanner.ts` 33 KB |

### The main build pipeline

`Generate Code` is the spine of the app, and it is more explicit than a single
"generate" call:

```
handleGenerate (App.tsx)
 ├─ userProfile.record*        preferences, style tags   (local + sync)
 ├─ autoLearn.projectEvent     training signal
 ├─ saveProject()              localStorage snapshot
 ├─ POST   /api/projects       register server-side
 ├─ PUT    /api/projects/:id   push nodes + edges + trees
 ├─ POST   /api/reason         planning call, 15s budget, ADVISORY (timeout never blocks)
 ├─ POST   /api/generate/:id/files   per-file generation
 │     simple files → small fast coders        (0.5B GPU1 → 1.5B GPU0 → 0.5B CPU)
 │     complex logic → primary delegator model (7B)
 ├─ per node: updateNodeStatus + nodeDatabase.learnFromNode + autoLearn.codeGeneration
 ├─ saveRoadmap()
 └─ POST   /api/memory/build
```

Progress is **pushed, not polled**: Socket.IO is mounted at `/ws` and emits
`architect_progress` and `generation_progress`. If the backend is unreachable the
whole thing degrades to a three-phase simulated generation rather than failing.

### The conversational router

`Send` in the reasoning panel is the app's front door, not a chat box.
`processUserRequest` (ReasoningPanel.tsx:1032) runs an ordered gauntlet:

1. answers to questions it previously asked → writes the code
2. session history / wiki / todo intents → opens the real window
3. combined build-and-export
4. auto GUI preview sensing
5. build-scale estimation from the words used
6. interactive code write
7. build via the architect route
8. **only then** a plain LLM reply, with personality + model facts + system
   context + vision context injected

Every turn (prompt *and* reply together) is recorded to the auto-learn collector,
and non-action replies are spoken.

### Where state actually lives

Worth knowing, because it explains several "project not found" bugs the code
guards against:

- Backend projects are **in memory**. A server restart wipes the registry and
  leaves the stored `current-project-id` stale. `ensureServerProject()` exists
  purely for this: it pushes the graph to the stored id, and on 404 re-registers
  the project from canvas state.
- The desktop app stages a read-only payload into `~/.config/Veronica/runtime`
  keyed by a stamp in `PAYLOAD.json`. `backend/users` and `backend/data` are
  stashed and merged back across a re-stage so upgrades don't destroy work.
- Precision matters here: `api/health` reports on the provider in
  `llm-config.json`, **not** a hardcoded port, so the header indicator cannot
  disagree with the model actually answering.

### Subsystems behind the buttons

`blueprint` (1228-blueprint bible matching, deterministic mockup, no LLM for the
mockup) · `codePlanner` · `reasoning` · `architect` · `scanner` · `sandbox`
(single container **and** docker-compose stacks) · `neural`/`mindspace` ·
`librarian` · `review` · `search` · `training` · `tools` (75 exposed to the
client) · `tts` · `auto-learn` · `session` · `soul` · `manifesto` · `library` ·
`merge` (with a semantic connect endpoint that returns a relation + code hint).

---

## Gotchas, all hit for real while building this

**The service worker will serve you a stale bundle.** Deploying `frontend/dist`
is not enough — the PWA precaches the bundle and keeps serving the previous
assets, so a fresh deploy looks like it did nothing. This cost real time and is
why `reset-pwa-cache.mjs` exists. If you change narration text and hear the old
text, this is why.

**A killed app leaves `SingletonLock` behind**, and the next launch quits
silently — no error, no log line, because `requestSingleInstanceLock()` fails.
`rm -f ~/.config/Veronica/Singleton*` before relaunching after a `kill`.

**`--no-sandbox` is needed** for the unpacked tree: `chrome-sandbox` there is not
root-owned/0755, so Electron aborts. The `.deb` install handles this properly;
only a bare folder needs the flag.

**Launching in the background from a shell command is unreliable** — the process
can be reaped when the command's process group is cleaned up. The app must be
started as its own detached process.

---

## Known gaps

- Narration covers the **headline flow**: 49 controls out of 391. The remainder
  (per-node menus, niche dialogs, mobile-only bars) are silent by design, and
  the console says so when you hover one.
- No entry is narrated for the emotion dropdown (verified silent, on purpose).
- The Windows installer has **not** been launched on Windows; narration is
  verified only in the Linux app.
- Everything is verified against the Linux Electron window. The browser-only
  path (`npm run dev` in `frontend/`) has not been exercised with narration on.
