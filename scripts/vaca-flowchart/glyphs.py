# glyphs.py — Blender helper: turn label strings into vector outlines.
#
# WHY THIS EXISTS: Blender's SVG importer (io_curve_svg) imports <rect>, <circle>,
# <line>, <polygon>, <path> and <g> — but SILENTLY DROPS <text>. A flowchart SVG
# with <text> labels therefore imports into Blender as a field of empty boxes.
# Verified by probe: 7 shape elements in -> 7 curve objects out; the <text>
# element produced 0 objects.
#
# So labels are baked to outlines here. Blender is used as the font engine
# (no fontTools/pip available in this environment — PEP 668 blocks system
# installs and ensurepip is missing).
#
# Usage:
#   blender --background --factory-startup --python glyphs.py -- <labels.json> <out.json>
#
# Input : [{ "key": "<text>@<size>", "text": "...", "size": 14.0 }, ...]
# Output: { "<key>": { "bbox": [xmin,ymin,xmax,ymax],
#                      "contours": [ [ {"co":[x,y],"hl":[x,y],"hr":[x,y]}, ... ], ... ] } }
# Coordinates are in Blender object space (y-up), origin near the text baseline.

import bpy
import json
import sys

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

FONT_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def argv_after_ddash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    return []


def pick_font(candidates: list[str]) -> str:
    import os
    for path in candidates:
        if os.path.exists(path):
            return path
    raise SystemExit(f"No usable font found in: {candidates}")


def round_pt(p) -> list[float]:
    return [round(p.x, 3), round(p.y, 3)]


def extract_contours(obj) -> tuple[list[list[dict]], list[float]]:
    """Pull every closed contour out of a converted text curve."""
    contours: list[list[dict]] = []
    xs: list[float] = []
    ys: list[float] = []

    for spline in obj.data.splines:
        pts = spline.bezier_points
        if spline.type == 'BEZIER' and len(pts) > 0:
            contour = []
            for bp in pts:
                contour.append({
                    "co": round_pt(bp.co),
                    "hl": round_pt(bp.handle_left),
                    "hr": round_pt(bp.handle_right),
                })
                xs.append(bp.co.x)
                ys.append(bp.co.y)
            if len(contour) > 1:
                contours.append(contour)
        else:
            # Poly fallback: synthesise zero-length handles so the downstream
            # renderer can treat every contour uniformly as cubic.
            sp = spline.points
            if len(sp) < 2:
                continue
            contour = []
            for p in sp:
                co = [round(p.co.x, 3), round(p.co.y, 3)]
                contour.append({"co": co, "hl": list(co), "hr": list(co)})
                xs.append(p.co.x)
                ys.append(p.co.y)
            contours.append(contour)

    if not xs:
        return [], [0.0, 0.0, 0.0, 0.0]
    return contours, [min(xs), min(ys), max(xs), max(ys)]


def main() -> None:
    args = argv_after_ddash()
    if len(args) != 2:
        raise SystemExit("usage: ... -- <labels.json> <out.json>")
    labels_path, out_path = args

    with open(labels_path, "r", encoding="utf-8") as fh:
        labels = json.load(fh)

    regular_path = pick_font(FONT_CANDIDATES)
    body_path = pick_font(FONT_BOLD_CANDIDATES)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    fonts = {
        "regular": bpy.data.fonts.load(regular_path),
        "bold": bpy.data.fonts.load(body_path),
    }

    out: dict[str, dict] = {}
    made = 0

    for item in labels:
        key = item["key"]
        if key in out:
            continue
        text = item.get("text", "")
        if not text.strip():
            continue
        size = float(item.get("size", 14.0))
        weight = item.get("weight", "regular")
        align = item.get("align", "left")

        cu = bpy.data.curves.new(name="vc_txt", type='FONT')
        cu.body = text
        cu.font = fonts.get(weight, fonts["regular"])
        cu.size = size
        cu.align_x = {'left': 'LEFT', 'center': 'CENTER', 'right': 'RIGHT'}[align]
        cu.align_y = 'TOP_BASELINE'

        ob = bpy.data.objects.new("vc_txt", cu)
        scene.collection.objects.link(ob)

        for other in scene.collection.objects:
            other.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob

        try:
            bpy.ops.object.convert(target='CURVE')
        except Exception as exc:  # keep going; report at the end
            print(f"GLYPH_CONVERT_FAILED: {key!r}: {exc}")
            bpy.data.objects.remove(ob, do_unlink=True)
            continue

        conv = bpy.context.view_layer.objects.active
        contours, bbox = extract_contours(conv)
        if contours:
            out[key] = {"bbox": bbox, "contours": contours}
            made += 1

        # Clean up so 100+ labels don't pile up in the scene.
        bpy.data.objects.remove(conv, do_unlink=True)
        for block in list(bpy.data.curves):
            if block.users == 0:
                bpy.data.curves.remove(block)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))

    print(f"GLYPHS_OK made={made} requested={len(labels)} font={regular_path}")


main()
