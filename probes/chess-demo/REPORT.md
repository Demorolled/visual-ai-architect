# 3D Chess Demo — built by VACA (dspark, R13)

**Render gate: RAW ❌ (THREE.CubeGeometry) → after mechanical repair ✅ PASS.**
**Functional playtest (scripts/playtest-chess.py): ❌ NOT PLAYABLE.**

## What the model got right
- Loaded BOTH CDN scripts (three.min.js + OrbitControls addon) — the two-script
  rule, when stated in the prompt.
- Zero external texture/model URLs (R11's chess killer is gone).
- Renders a 3D board + pieces + starfield with soft shadows, 0 console errors.

## What the model got wrong (functional, not visual)
- **No game logic**: clicks do nothing; there is no move()/capture/check code.
  `state` exists but nothing drives it (moveHistory stays empty).
- **No real black side**: the color flag is inverted — the 8 'black' pieces are
  the white pawns; there are no black pieces at all.
- **Board spins continuously** (whole board+pieces rotate every frame).
- Pieces are placed with charCode math (7 - pos.charCodeAt(0) -> x = -90), off
  the board plane.
- Hint button shows one static string only.

## Why the render gate passed anyway
smoke-test-html.py checks: no console/page errors + WebGL canvas + THREE loaded.
It cannot verify FUNCTION. This demo is the proof: 'renders clean' does not
mean 'works'.

## Data consequence (R15)
chunk-3d-chess.jsonl contains NO full-app row (a broken-as-a-game app must not
be a positive training example). It keeps two QA-rule rows instead:
1. THREE.CubeGeometry -> THREE.BoxGeometry (removed-API rule).
2. 'A game app must be a game': two sides, click-to-move, legal moves,
   captures, check, static board — verify by PLAYING it.

Files: chess.html (raw), chess-repaired.html (gate-passing), chess-shot.png,
playtest-shot.png, results.json, playtest.json.
