#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# stage-payload.sh — assemble the runtime payload that ships inside the app.
# =============================================================================
# Produces packaging/electron/payload/ containing everything the bundled
# backend needs, in the EXACT depth it expects:
#
#   payload/
#     backend/dist/…        <- compiled backend  (../../frontend, ../../../data)
#     backend/package.json  <- marks the tree as ESM for the compiled .js files
#     backend/llm-config.json
#     frontend/dist/…       <- built UI, served by the backend at /
#     node_modules/…        <- PRODUCTION deps only (vendored, test not included)
#     knowledge/ projects/ apps/ bible-reference/ data/…
#     modelVeronice.txt tts-config.json config.yaml
#     PAYLOAD.json          <- stamp used by main.js to know when to re-stage
#
# The heavy optional caches (data/rico 179M, data/galaxy 24M, the model dir)
# are deliberately NOT shipped: the backend boots and serves without them, and
# they would multiply the installer size for features that regenerate.
#
# Usage:  bash packaging/electron/stage-payload.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PAYLOAD="$HERE/payload"

echo "repo root : $ROOT"
echo "payload   : $PAYLOAD"

# ── sanity: the artifacts we are about to ship must exist ───────────────────
[ -f "$ROOT/backend/dist/index.js" ] || { echo "ERROR: backend not built — run: npm run build --workspace=backend" >&2; exit 1; }
[ -f "$ROOT/frontend/dist/index.html" ] || { echo "ERROR: frontend not built — run: npm run build --workspace=frontend" >&2; exit 1; }

rm -rf "$PAYLOAD"
mkdir -p "$PAYLOAD/backend" "$PAYLOAD/frontend"

# ── code ────────────────────────────────────────────────────────────────────
cp -r "$ROOT/backend/dist"          "$PAYLOAD/backend/dist"
cp    "$ROOT/backend/package.json"  "$PAYLOAD/backend/package.json"
cp    "$HERE/llm-config.qwen14b.json" "$PAYLOAD/backend/llm-config.json"
cp -r "$ROOT/frontend/dist"         "$PAYLOAD/frontend/dist"

# ── seed content the backend reads at the repo root ─────────────────────────
# `scripts/` is included because backend/src/sandbox/behavioralSmoke.ts runs
# scripts/smoke-test-html.py as the PRIMARY render-smoke gate. Without it the
# gate still works (it falls back to the TS Playwright engine), but shipping it
# keeps the primary path present instead of reporting a missing-file reason.
for d in knowledge projects apps bible-reference scripts; do
  if [ -e "$ROOT/$d" ]; then cp -r "$ROOT/$d" "$PAYLOAD/$d"; fi
done

# `scripts/` is copied wholesale, and on a working checkout that also means this
# machine's LIVE STATE: the PID files of the running services plus ~25 logs (one
# of them 235 KB). Shipping them put one box's PIDs inside the app bundle, and
# from there a tracked `payload/scripts/dspark.pid` into the release repo, where
# every rebuild committed a new number. A stale PID is not inert — the repo's own
# .gitignore explains why: `kill $(cat x.pid)` hits whatever process happens to
# hold that number on the box that reads it. They are runner state, not code, and
# the start scripts recreate them; never ship them.
rm -f "$PAYLOAD"/scripts/*.pid "$PAYLOAD"/scripts/*.log "$PAYLOAD"/scripts/*-state.json
for f in modelVeronice.txt tts-config.json config.yaml; do
  if [ -e "$ROOT/$f" ]; then cp "$ROOT/$f" "$PAYLOAD/$f"; fi
done

# ── small data seeds (skip the multi-hundred-MB caches) ─────────────────────
mkdir -p "$PAYLOAD/data"
for f in library code-bible designs.json soul.json library-embeddings.json; do
  if [ -e "$ROOT/data/$f" ]; then cp -r "$ROOT/data/$f" "$PAYLOAD/data/$f"; fi
done

# ── production dependencies, vendored ───────────────────────────────────────
#
# `typescript` is declared as a devDependency but is imported at RUNTIME by the
# compiled backend (backend/dist/ai/guiShared.js), so `npm install --omit=dev`
# alone produces a payload that crashes on boot with ERR_MODULE_NOT_FOUND.
# Anything the dist actually imports at runtime must be listed here.
EXTRA_RUNTIME_DEPS='{"typescript": "^5.3.3", "playwright": "^1.62.1"}'

python3 - "$ROOT/backend/package.json" "$PAYLOAD/package.json" "$EXTRA_RUNTIME_DEPS" <<'PY'
import json, sys
src, dst, extras = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
backend = json.load(open(src))
deps = dict(backend.get("dependencies", {}))
for name, ver in extras.items():
    if name not in deps:
        deps[name] = ver
out = {
    "name": "veronica-runtime",
    "version": backend.get("version", "1.0.0"),
    "private": True,
    "type": "module",
    "description": "Vendored runtime deps for the bundled VACA backend.",
    "dependencies": deps,
}
json.dump(out, open(dst, "w"), indent=2)
print(f"wrote {dst} with {len(deps)} runtime deps")
print("  + runtime-only extras:", ", ".join(extras))
PY

echo "── npm install --omit=dev (vendoring runtime deps) ──"
( cd "$PAYLOAD" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

# ── stamp ───────────────────────────────────────────────────────────────────
python3 - "$PAYLOAD" <<'PY'
import hashlib, json, os, sys, time
payload = sys.argv[1]
h = hashlib.sha256()

def add_file(fp, label):
    h.update(label.encode())
    with open(fp, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)

# Hash the CODE plus the dependency SET. package.json/package-lock.json are
# included deliberately: without them, a change that only affects node_modules
# (e.g. adding a missing runtime dep like `typescript`) would leave the stamp
# unchanged, so an installed app would never re-stage and would stay broken.
# Content dirs (knowledge/, data/, projects/) are excluded — they legitimately
# diverge from the user's copy and must not force a re-copy.
for rel in ("backend/dist", "frontend/dist", "backend/llm-config.json",
            "package.json", "package-lock.json"):
    p = os.path.join(payload, rel)
    if os.path.isfile(p):
        add_file(p, rel)
    elif os.path.isdir(p):
        for dirpath, _dn, fnames in os.walk(p):
            for fn in sorted(fnames):
                fp = os.path.join(dirpath, fn)
                add_file(fp, os.path.relpath(fp, payload))

stamp = {
    "stamp": h.hexdigest()[:32],
    "builtAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
}
json.dump(stamp, open(os.path.join(payload, "PAYLOAD.json"), "w"), indent=2)
print("payload stamp:", stamp["stamp"], "at", stamp["builtAt"])
PY

echo
echo "── payload summary ──"
du -sh "$PAYLOAD"
du -sh "$PAYLOAD"/* 2>/dev/null | sort -rh | head -12
echo
echo "payload ready: $PAYLOAD"
