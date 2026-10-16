#!/usr/bin/env bash
# Vendor the viewer's JS so the phone needs no internet, and CHECK THE MODULE
# GRAPH before declaring success.
#
# Why this script exists: three r168+ split its build, so `three.module.js`
# starts with `import ... from './three.core.js'`. If you copy only the files you
# think you need, `three.core.js` is missing, and then *every* module fails —
# three fails (missing chunk), spark fails (imports "three"), Pass.js fails
# (imports "three"). The symptom is that the viewer hangs on "loading…" with no
# canvas and NO console error, because a module-fetch failure never reaches
# window.onerror. curl shows 200 for every file you did copy. It cost real
# debugging time; hence the graph check below.
#
#   ./tools/vendor.sh              # into app/static/vendor
#   ./tools/vendor.sh --check      # verify only, download nothing
set -euo pipefail

THREE_VER="0.180.0"
SPARK_VER="2.3.1"
DEST="${VENDOR_DEST:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/app/static/vendor}"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

# sha256 of the pinned builds, first 16 chars. Bump deliberately, never silently.
THREE_MODULE_SHA="c8211c69345d2e99"     # three@0.180.0/build/three.module.js
SPARK_MODULE_SHA="2de375d5e489692f"     # @sparkjsdev/spark@2.3.1/dist/spark.module.js

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
fetch() {  # fetch <url> <dest-relative-path>
  local url="$1" rel="$2"
  mkdir -p "$DEST/$(dirname "$rel")"
  curl -fsS -m 120 -o "$DEST/$rel" "$url"
  printf '  %-46s %8s bytes\n' "$rel" "$(stat -c%s "$DEST/$rel")"
}

if [ "$CHECK_ONLY" = 0 ]; then
  say "Downloading pinned builds"
  fetch "https://unpkg.com/three@$THREE_VER/build/three.module.js"   "three.module.js"
  fetch "https://unpkg.com/three@$THREE_VER/build/three.core.js"     "three.core.js"
  fetch "https://unpkg.com/three@$THREE_VER/examples/jsm/controls/OrbitControls.js" \
        "addons/controls/OrbitControls.js"
  fetch "https://unpkg.com/three@$THREE_VER/examples/jsm/postprocessing/Pass.js" \
        "addons/postprocessing/Pass.js"
  fetch "https://unpkg.com/@sparkjsdev/spark@$SPARK_VER/dist/spark.module.js" \
        "spark.module.js"
fi

say "Version check"
got() { sha256sum "$DEST/$1" | cut -c1-16; }
[ "$(got three.module.js)" = "$THREE_MODULE_SHA" ] \
  || { echo "  three.module.js is NOT three@$THREE_VER (expected $THREE_MODULE_SHA, got $(got three.module.js))"; exit 1; }
[ "$(got spark.module.js)" = "$SPARK_MODULE_SHA" ] \
  || { echo "  spark.module.js is NOT @sparkjsdev/spark@$SPARK_VER (expected $SPARK_MODULE_SHA, got $(got spark.module.js))"; exit 1; }
echo "  three@$THREE_VER, @sparkjsdev/spark@$SPARK_VER — both match"

say "Module-graph check"
# Walk every relative import and every bare specifier. This is the check that
# catches a missing chunk: the import map maps "three" -> /vendor/three.module.js
# and "three/addons/" -> /vendor/addons/, and relative paths must exist on disk.
VENDOR="$DEST" python3 - <<'PY'
import os, re, sys
from pathlib import Path

root = Path(os.environ["VENDOR"])
IMPORT_MAP = {
    "three": "three.module.js",
    "three/addons/": "addons/",
}
REL = re.compile(r"""from\s*['"](\.[^'"]+)['"]""")
BARE = re.compile(r"""from\s*['"]([^'"./][^'"]*)['"]""")

missing, unmapped, checked = set(), set(), 0
for f in sorted(root.rglob("*.js")):
    src = f.read_text(errors="replace")
    for spec in REL.findall(src):
        checked += 1
        target = (f.parent / spec).resolve()
        if not target.is_file():
            missing.add((str(f.relative_to(root)), spec))
    for spec in BARE.findall(src):
        if not any(spec == k or spec.startswith(k) for k in IMPORT_MAP):
            unmapped.add((str(f.relative_to(root)), spec))

for f, spec in sorted(missing):
    print(f"  MISSING CHUNK  {f} imports {spec!r} but that file is not vendored")
for f, spec in sorted(unmapped):
    print(f"  UNMAPPED SPEC  {f} imports {spec!r}, not covered by the import map")
if missing or unmapped:
    sys.exit(1)
print(f"  {checked} relative imports resolved; all bare specifiers covered by the import map")
PY

say "Vendor tree"
find "$DEST" -type f -printf '  %10s  %P\n' | sort -k2
say "OK"
