# 3D Rook Chess Piece — built by VACA (dspark, R13) + surgically repaired

## Verdict: RAW ❌ -> REPAIRED ✅ (12 surgical fixes, all gate-verified)

### What the model got right (v2 regen, after the spec was upgraded)
- Both CDN scripts loaded (two-script rule), OrbitControls wired, no external assets
- Y-stacked parts with explicit positions (base y=-1.5, collar y=0.3, crown y=0.6)
- Battlements in a proper trig ring (0.45*cos(i*2π/5)), no Math.random placement
- Turntable auto-rotation (rook.rotation.y = t*0.1), fog, canvas renderer

### Defect classes the repair fixed (each is now a QA rule in the training data)
1. `const top` collides with built-in global `window.top` -> the ENTIRE script dies
   at instantiation ('Identifier top has already been declared'), every other
   binding stays in TDZ. Renamed to `crown` (geometry + Mesh usage).
2. `CylinderGeometry(radiusTop, radiusBottom, h)` — model put the WIDE end on top,
   inverting the rook's taper. Fixed to (0.5, 0.9, 1.4).
3. position.y is the part's CENTER, not its bottom — shaft at y=-1.4 (h=1.4)
   spanned -2.1..-0.7: sank through the base, gaped the collar. Centered at -0.6.
4. Crown at y=0.8 floated off the collar; battlements added as crown children at
   local y=0.8 landed at world y=1.6 (0.65 above the crown top). Local y -> 0.28.
5. Battlements were rotated flat (-π/2); now stand vertical on the rim.
6. LIGHTING: metalness 0.95 + one weak PointLight(1.5) rendered the piece nearly
   BLACK (metals reflect no diffuse; dim point light = no specular). Fixed:
   metalness 0.7 / roughness 0.3, PointLight 2.5, + directional fill + ambient 0x444444.
7. FRAMING: camera.position was set but lookAt never called — camera stared level
   along -Z, piece landed low-left. Added lookAt(0,0,0) + controls.target + closer
   camera (2.6, 2.0, 4.2).
8. Dark-on-dark: piece 0x222222 on bg 0x222222 -> gunmetal 0x777777 on 0x4a4a4a.

### Final measurements (pixel analysis of rook-repaired-shot.png, 1280x800)
- Piece center (640, 436) vs frame (640, 400) — horizontally dead center, 9% low
- Fills 15%w x 36%h, aspect h/w = 1.47 (standing upright)
- Luminance max 255 (well-lit), 9 meshes / 9 cylinders in the scene graph

### Files
- rook.html            — raw VACA output (broken: `const top` kills the script)
- rook-repaired.html   — 12 surgical fixes applied, gate-passing
- rook-repaired-shot.png — the render above
- results.json         — raw/repaired gate + functional probe data
- chunk-3d-rook.jsonl  — 2 training rows (generation-framed fixed app + QA rules)
