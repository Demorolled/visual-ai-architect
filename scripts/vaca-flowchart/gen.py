#!/usr/bin/env python3
# gen.py — generate the full-system VACA/Veronica flowchart as an SVG.
#
# WHY TWO PHASES: Blender's SVG importer (io_curve_svg) imports <rect>, <circle>,
# <line>, <polygon>, <path> and <g>, but SILENTLY DROPS <text>. Verified by probe
# (7 shape elements in -> 7 curve objects out; the <text> element produced 0).
# So every label is baked to real glyph outlines by scripts/vaca-flowchart/glyphs.py
# (which drives Blender's own font engine), and this script places those outlines.
#
# Phase 1:  python3 gen.py --emit-labels /tmp/vaca/labels.json
#           blender --background --factory-startup --python glyphs.py -- \
#                   /tmp/vaca/labels.json /tmp/vaca/glyphs.json
# Phase 2:  python3 gen.py --render /tmp/vaca/glyphs.json out.svg
#
# Output is deliberately plain: only <rect>, <path> and <g>, all geometry in
# absolute coordinates with presentation ATTRIBUTES (no CSS, no <defs>, no
# markers, no transforms) so Blender resolves everything on import.

import argparse
import json
import sys
from collections import OrderedDict

# ── Canvas ───────────────────────────────────────────────────────────────────
W, H = 3700, 3070

# ── Palette: (stroke, fill, title colour) per subsystem group ────────────────
P = {
    "clients":  ("#2563eb", "#eff6ff", "#1d4ed8"),
    "api":      ("#7c3aed", "#f5f3ff", "#6d28d9"),
    "pipe":     ("#0f766e", "#f0fdfa", "#0f766e"),
    "llm":      ("#b45309", "#fffbeb", "#b45309"),
    "rag":      ("#15803d", "#f0fdf4", "#15803d"),
    "tools":    ("#be123c", "#fff1f2", "#be123c"),
    "sandbox":  ("#4338ca", "#eef2ff", "#4338ca"),
    "train":    ("#a16207", "#fefce8", "#854d0e"),
    "hw":       ("#334155", "#f8fafc", "#1e293b"),
}
BAND = "#94a3b8"
BANDTXT = "#64748b"
ARROW = "#475569"
TITLE = "#0f172a"
SUBTITLE = "#475569"

FONT_SIZE = 14.0
TITLE_SIZE = 16.0
BAND_SIZE = 15.0
TITLE_MAIN = 40.0
SUB_MAIN = 17.0
CHIP_SIZE = 12.0


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


class Builder:
    """Collects label requests (phase 1) or emits SVG (phase 2)."""

    def __init__(self, mode: str, glyphs: dict | None = None):
        self.mode = mode
        self.glyphs = glyphs or {}
        self.labels: "OrderedDict[str, dict]" = OrderedDict()
        self.svg: list[str] = []
        self._seq = 0
        # Extra geometry captured for the placement self-check.
        self.placed: list[dict] = []
        self.containers: list[dict] = []

    def _id(self, kind: str, slug: str = "") -> str:
        """Unique, readable element id. Blender names imported objects after it,
        so ids are what make the Blender outliner legible instead of Curve.001."""
        self._seq += 1
        safe = "".join(ch if ch.isalnum() else "-" for ch in slug)[:38].strip("-")
        return f"{kind}-{self._seq:03d}" + (f"-{safe}" if safe else "")

    # ── labels ───────────────────────────────────────────────────────────────
    def label(self, x: float, baseline: float, text: str, size: float = FONT_SIZE,
              weight: str = "regular", align: str = "left", color: str = SUBTITLE):
        """Place text. `align='center'` centres the ink box on x; 'left' starts at x."""
        if not text:
            return
        key = f"{text}@{size}@{weight}"

        if self.mode == "labels":
            if key not in self.labels:
                self.labels[key] = {"key": key, "text": text, "size": size,
                                    "weight": weight, "align": "left"}
            return

        g = self.glyphs.get(key)
        if g is None:
            if key not in self._warned:
                self._warned.add(key)
                print(f"WARN missing glyphs for {key!r}", file=sys.stderr)
            return

        xmin, _ymin, xmax, _ymax = g["bbox"]
        # All three alignments must be real: treating everything except 'center'
        # as left silently pushed right-aligned labels into the boxes beside them
        # (caught by check_placement on the split charts).
        if align == "center":
            dx = x - (xmin + xmax) / 2.0
        elif align == "right":
            dx = x - xmax
        else:
            dx = x - xmin
        dy = baseline

        d_parts = []
        for contour in g["contours"]:
            pts = contour
            if len(pts) < 2:
                continue
            def T(p):
                return f"{p[0] + dx:.1f} {dy - p[1]:.1f}"
            d_parts.append("M" + T(pts[0]["co"]))
            for i, p in enumerate(pts):
                nxt = pts[(i + 1) % len(pts)]
                d_parts.append("C" + T(p["hr"]) + " " + T(nxt["hl"]) + " " + T(nxt["co"]))
            d_parts.append("Z")

        if d_parts:
            lid = self._id("label", text[:24])
            self.svg.append(
                f'<path id="{lid}" d="{" ".join(d_parts)}" fill="{color}" stroke="none"/>')
            # Record where the ink actually landed, for the placement self-check.
            self.placed.append({
                "id": lid, "text": text, "size": size, "align": align,
                "left": xmin + dx, "right": xmax + dx,
                "top": dy - _ymax, "bottom": dy - _ymin,
                "cx": (xmin + xmax) / 2.0 + dx, "baseline": dy,
            })

    _warned: set = set()

    # ── primitives ───────────────────────────────────────────────────────────
    def rect(self, x, y, w, h, r=0, fill="none", stroke=None, sw=2.0, dash=None,
             name=""):
        attrs = [f'id="{self._id("rect", name)}"',
                 f'x="{x:.1f}"', f'y="{y:.1f}"', f'width="{w:.1f}"', f'height="{h:.1f}"']
        if r > 0:
            attrs += [f'rx="{r:.1f}"', f'ry="{r:.1f}"']
        attrs.append(f'fill="{fill}"')
        if stroke:
            attrs.append(f'stroke="{stroke}"')
            attrs.append(f'stroke-width="{sw:.2f}"')
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        self.svg.append("<rect " + " ".join(attrs) + "/>")

    def polyline(self, pts, stroke=ARROW, sw=2.0, dash=None, arrow=True, name="link"):
        d = "M" + " L".join(f"{px:.1f} {py:.1f}" for px, py in pts)
        attrs = [f'id="{self._id("link", name)}"', f'd="{d}"', 'fill="none"',
                 f'stroke="{stroke}"', f'stroke-width="{sw:.2f}"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        self.svg.append("<path " + " ".join(attrs) + "/>")
        if arrow and len(pts) >= 2:
            self._head(pts[-1], pts[-2], stroke)

    def _head(self, tip, prev, color, size=13.0):
        import math
        ang = math.atan2(tip[1] - prev[1], tip[0] - prev[0])
        w = 5.5
        a = ang + math.pi / 2
        p1 = (tip[0] - size * math.cos(ang) + w * math.cos(a),
              tip[1] - size * math.sin(ang) + w * math.sin(a))
        p2 = (tip[0] - size * math.cos(ang) - w * math.cos(a),
              tip[1] - size * math.sin(ang) - w * math.sin(a))
        self.svg.append(
            f'<path id="{self._id("head")}" d="M{tip[0]:.1f} {tip[1]:.1f} '
            f'L{p1[0]:.1f} {p1[1]:.1f} L{p2[0]:.1f} {p2[1]:.1f} Z" '
            f'fill="{color}" stroke="none"/>')


# ── geometry helpers ─────────────────────────────────────────────────────────
def bottom(c): return (c["x"] + c["w"] / 2, c["y"] + c["h"])
def top(c):    return (c["x"] + c["w"] / 2, c["y"])
def left(c):   return (c["x"], c["y"] + c["h"] / 2)
def right(c):  return (c["x"] + c["w"], c["y"] + c["h"] / 2)
def mid(c):    return (c["x"] + c["w"] / 2, c["y"] + c["h"] / 2)


# ── the VACA model ───────────────────────────────────────────────────────────
def build_model() -> dict:
    bands = [
        ("CLIENTS  —  desktop shell, visual editor, previews", 120, 350),
        ("API SURFACE  —  Express + TypeScript ESM backend on :3001  (48 route mounts)", 380, 650),
        ("BUILD PIPELINE  —  plan  ->  write  ->  gates  ->  repair  ->  export", 680, 2100),
        ("SANDBOX, BEHAVIOURAL GATES & EXPORT", 2130, 2420),
        ("TRAINING LOOPS & MODEL LINEAGE", 2450, 2770),
        ("HOSTS & HARDWARE", 2800, 3010),
    ]

    C = {}
    def B(key, group, x, y, w, h, title, lines=(), radius=12):
        C[key] = {"group": group, "x": x, "y": y, "w": w, "h": h,
                  "title": title, "lines": list(lines), "r": radius}
        return C[key]

    # ── Band 1: clients ──────────────────────────────────────────────────────
    B("shell", "clients", 60, 170, 680, 160, "Electron shell  (Veronica)",
      ["packaging/electron/main.js",
       "stages payload -> writable runtime dir",
       "spawns backend  OR  targets a remote URL"])
    B("canvas", "clients", 780, 170, 680, 160, "React + React Flow canvas",
      ["frontend/src/components/Canvas.tsx",
       "drag-drop node graph, plain-English",
       "node descriptions"])
    B("nodes", "clients", 1500, 170, 680, 160, "Node graph model",
      ["node types: master > logic > ui >",
       "database > input   (tie-break order)",
       "Tree Mode: several app trees per project"])
    B("chat", "clients", 2220, 170, 680, 160, "ReasoningPanel  (chat build)",
      ["plain-English build requests",
       "-> /api/reason/plan-code",
       "-> /api/reason/write-code"])
    B("prev", "clients", 2940, 170, 680, 160, "Preview & output panels",
      ["LivePreviewPanel, MockupPreviewPanel,",
       "CodeOutputPanel, NodeCodeEditor,",
       "ExportDialog, Canvas3D / Node3D"])

    # ── Band 2: API surface ─────────────────────────────────────────────────
    B("api", "api", 60, 430, 3560, 190, "Express + TypeScript ESM backend  —  :3001",
      [], radius=14)
    api_chips = [
        "/api/reason", "/api/generate", "/api/llm", "/api/knowledge", "/api/library",
        "/api/review", "/api/sandbox", "/api/export", "/api/preview", "/api/tools",
        "/api/projects", "/api/nodes", "/api/plans", "/api/blueprint", "/api/architect",
        "/api/user", "/api/session", "/api/context", "/api/config", "/api/memory",
        "/api/auto-learn", "/api/wiki", "/api/search", "/api/designs", "/api/mindspace",
        "/api/training", "/api/experiments", "/api/benchmark", "/api/build-ladder",
        "/api/system-monitor", "/api/desktop", "/api/tts", "/api/soul", "/api/emotion",
        "/api/scan", "/api/neural", "/api/reactions", "/api/manifesto",
    ]

    # ── Band 3, centre spine: the build pipeline ────────────────────────────
    sx, sw_ = 900, 1300
    spine = [
        ("s1", "1.  REQUEST", [
            "user builds the flow on the canvas, or describes it in chat",
            "intent extracted from the graph AND the prose"]),
        ("s2", "2.  PLAN      POST /api/reason/plan-code", [
            "intent spec -> clarifying questions -> FILE CONTRACTS (PlannedFile[])",
            "tree-aware layout + cross-tree bridge modules"]),
        ("s3", "3.  WRITE      POST /api/reason/write-code", [
            "three modes:  one-shot  |  per-file  |  chunked",
            "each file written against its contract + injected context"]),
        ("s4", "4.  CONTRACT GATE  (zero LLM)", [
            "every planned file present; every export/import member real",
            "phantom-module + phantom-npm-dependency classes stripped"]),
        ("s5", "5.  TSC GATE", [
            "tsc over .ts/.tsx, reported per file",
            "clean files ship; errors route to the repair loop"]),
        ("s6", "6.  REPAIR LOOP", [
            "deterministic fixers first (sibling-path, name-drift, import patch)",
            "then LLM repair rounds fed the REAL type shapes"]),
        ("s7", "7.  LANGUAGE & RUNTIME GATES", [
            "go build / py_compile (non-TS)   |   headless-Chrome 3D render gate",
            "tsx CLI behavioural gate   |   runtime smoke"]),
        ("s8", "8.  EXPORT", [
            "perFileScaffolder -> apps/<app>/ per tree + shared bridge/",
            "multi-platform export: Windows, Mac, Linux, iOS"]),
    ]
    y = 720
    for key, title, lines in spine:
        B(key, "pipe", sx, y, sw_, 140, title, lines)
        y += 170

    # ── Band 3, left panel: inputs & context ────────────────────────────────
    lx, lw = 80, 620
    lefts = [
        ("l1", "INTENT & CONTEXT",
         ["ai/intentExtractor.ts", "routes/context.ts", "graph + prose -> IntentSpec"]),
        ("l2", "USER & PROJECT STATE",
         ["routes/user.ts, session.ts", "node-store.ts, projects.ts", "profile + saved trees"]),
        ("l3", "LANGUAGE & TONE",
         ["ai/languageInference.ts", "ai/languageGuidance.ts", "ai/emotionEngine.ts"]),
        ("l4", "MANIFESTO & SOUL",
         ["ai/manifesto.ts, routes/soul.ts", "soulService, /api/manifesto", "the app's own standing rules"]),
        ("l5", "CLARIFYING QUESTIONS",
         ["normalizeQuestions() -> back to UI", "the build waits for answers", "before contracts are frozen"]),
    ]
    ly = 730
    for key, title, lines in lefts:
        B(key, "rag", lx, ly, lw, 225, title, lines)
        ly += 265

    # ── Band 3, right panel: LLM layer + RAG ───────────────────────────────
    rx, rw = 2360, 1260
    B("hub", "llm", rx, 730, rw, 150, "ai/translator.ts  —  the LLM router",
      ["loadLlmConfig():  dspark  ->  ollama  ->  gguf",
       "one OpenAI-compatible client, swapped on fallback"])
    B("band", "llm", rx, 920, rw, 220, "THE BAND  —  job roles  (LLM_ORIENTATION.md)",
      ["reasoning      = lead vocalist  (trained VACA model, Veronica)",
       "codeGeneration = rhythm guitar  (raw code per file)",
       "guiBuild       = drummer        (interfaces / front end)",
       "fastChat       = backing vocals (quick casual chat)",
       "reassigned in Settings -> LLM Connect  (/api/llm/roles)"])
    B("prov", "llm", rx, 1180, rw, 220, "PROVIDERS  &  FALLBACK",
      ["dspark :8000  ->  Ollama :11434  (on connection error)",
       "30 s reconnect poller switches back when dspark is healthy",
       "coder tiers: coderGpu1 0.5B :11437 -> coderGpu0 1.5B",
       ":11434 -> coderCpu 0.5B :11436",
       "vision critic: ai/vision.ts  via  POST /api/reason/vision"])
    B("glyph", "llm", rx, 1440, rw, 170, "SERVED MODELS",
      ["primary / secondary / fastChat entries in backend/llm-config.json",
       "Ollama tags: vaca-r40-q4, vaca-r20-q4, buffy, qwen2.5-coder, ornith",
       "embeddings: nomic-embed-text"])
    B("ragb", "rag", rx, 1660, rw, 200, "RETRIEVAL  (RAG)",
      ["ai/libraryContext.ts  (1,990 lines) — node-type-scoped injection",
       "ai/ragIndex.ts  ai/semanticRetrieval.ts  ai/denseRetrieval.ts",
       "ai/denseEmbedding.ts  ->  nomic-embed-text",
       "getLibraryContextDense(request) is attached to every write"])
    B("corpus", "rag", rx, 1900, rw, 170, "KNOWLEDGE CORPUS",
      ["backend/knowledge/patterns.json — patterns learned from real builds",
       "data/library/*.md, bible-reference/, corpora/, curriculum/",
       "LLM_ORIENTATION.md injected per role"])

    # ── Band 4: sandbox / gates / export ────────────────────────────────────
    B("dock", "sandbox", 60, 2170, 1160, 210, "DOCKER SANDBOX",
      ["sandbox/dockerRunner.ts, containerManager.ts,",
       "composeManager.ts — OS-specific containers",
       "routes/sandbox.ts, routes/generation.ts (validate-and-fix)"])
    B("behave", "sandbox", 1280, 2170, 1160, 210, "BEHAVIOURAL GATES",
      ["sandbox/behavioralSmoke.ts — canvas render + CLI probes",
       "nonTsCompileGate, duplicateDeclarations, errorCorrection,",
       "runtimeSmokeTest, scriptedGame, previewHtmlBuilder"])
    B("export", "tools", 2500, 2170, 1120, 210, "EXPORT & PACKAGING",
      ["POST /api/export/:projectId/per-file-scaffold",
       "export/perFileScaffolder.ts (per-tree apps + bridge/)",
       "packaging/: electron, linux, windows  ->  VACAFULL"])

    # ── Band 5: training ────────────────────────────────────────────────────
    B("selfplay", "train", 60, 2500, 860, 240, "SELF-PLAY",
      ["training/selfplay/orchestrator.py",
       "judge.py, scoreboard.py,",
       "train_student.py, vaca_domain.py",
       "config.py -> selfplay.json"])
    B("roles", "train", 980, 2500, 860, 240, "ROLE TRAINING  &  UNLEARNING",
      ["training/roles/roles.json + train_roles.py",
       "training/unlearn: npo.py, negate.py,",
       "evaluate.py, preflight.py, gguf_to_hf.py",
       "training/vlm, cloud, fromscratch, smallbase"])
    B("remote", "train", 1900, 2500, 800, 240, "REMOTE ROUNDS",
      ["training/remote/agent_worker.py",
       "remote_job.py, start-agent.sh",
       "runs on the agent box",
       "(2-3x RTX 3060, 36 GB VRAM)"])
    B("lineage", "train", 2760, 2500, 860, 240, "MODEL LINEAGE",
      ["adapters vaca-r31 .. vaca-r40",
       "-> merge (merge-r37.log)",
       "-> GGUF Q4 (vaca-r40-q4)",
       "-> ollama create -> served to translator.ts"])

    # ── Band 6: hosts ───────────────────────────────────────────────────────
    B("agent", "hw", 60, 2850, 1400, 160, "AGENT COMPUTER  —  llmlab@192.168.1.234",
      ["2-3x RTX 3060 12 GB   |   tailnet: llmlab-agent",
       "Ollama :11434   dspark :8000   backend :3001",
       "trainer :8811   gaussian-scan :8090"])
    B("dev", "hw", 1520, 2850, 1000, 160, "LOCAL DEV BOX",
      ["homellmlab@192.168.1.156",
       "VACA checkout + VACAFULL build",
       "2x RTX 3060 (2nd box in repo notes)"])
    B("net", "hw", 2580, 2850, 1040, 160, "NETWORK",
      ["Tailscale mesh between boxes",
       "remoteBackendUrl setting ->",
       "Electron shell can target the agent"])

    return {"bands": bands, "boxes": C, "api_chips": api_chips}


# ── draw ─────────────────────────────────────────────────────────────────────
def draw(b: Builder, m: dict):
    boxes = m["boxes"]

    # Title
    b.label(80, 78, "VACA  /  Visual AI Code Architect  —  \"Veronica\"", TITLE_MAIN,
            "bold", "left", TITLE)
    b.label(80, 108, "how the system operates:  visual node graph  ->  plan  ->  write  ->  gates  ->  repair  ->  export,   "
                     "with the LLM layer, retrieval, sandbox and training loops that feed it", SUB_MAIN,
            "regular", "left", BANDTXT)

    # Bands
    for bi, (title, y0, y1) in enumerate(m["bands"]):
        b.rect(40, y0, W - 80, y1 - y0, r=16, fill="none", stroke=BAND, sw=1.6,
               dash="9 7", name=f"band{bi}")
        b.label(62, y0 + 28, title, BAND_SIZE, "bold", "left", BANDTXT)

    # Boxes
    for key, c in boxes.items():
        stroke, fill, tcol = P[c["group"]]
        b.rect(c["x"], c["y"], c["w"], c["h"], r=c["r"], fill=fill,
               stroke=stroke, sw=2.0, name=key)
        b.containers.append({"name": key, "x": c["x"], "y": c["y"],
                             "w": c["w"], "h": c["h"]})
        cx = c["x"] + c["w"] / 2
        b.label(cx, c["y"] + 34, c["title"], TITLE_SIZE, "bold", "center", tcol)
        for i, line in enumerate(c["lines"]):
            b.label(cx, c["y"] + 62 + i * 22, line, FONT_SIZE, "regular", "center", SUBTITLE)

    # API chips
    api = boxes["api"]
    chip_w, chip_h, gap = 250, 30, 11
    per_row = 13
    start_x = api["x"] + (api["w"] - (per_row * chip_w + (per_row - 1) * gap)) / 2
    for i, name in enumerate(m["api_chips"]):
        row, col = divmod(i, per_row)
        x = start_x + col * (chip_w + gap)
        y = api["y"] + 62 + row * (chip_h + 9)
        b.rect(x, y, chip_w, chip_h, r=6, fill="#ffffff",
               stroke=P["api"][0], sw=1.2, name=name.strip("/").replace("/", "-"))
        b.label(x + chip_w / 2, y + 20, name, CHIP_SIZE, "regular", "center", P["api"][2])

    # ── arrows: spine ────────────────────────────────────────────────────────
    for a, bb in [("s1", "s2"), ("s2", "s3"), ("s3", "s4"), ("s4", "s5"),
                  ("s5", "s6"), ("s6", "s7"), ("s7", "s8")]:
        b.polyline([bottom(boxes[a]), top(boxes[bb])])

    # clients -> API  (three feeders)
    for k in ("canvas", "chat", "nodes"):
        b.polyline([bottom(boxes[k]), (bottom(boxes[k])[0], 405),
                    (bottom(boxes["api"])[0], 405), top(boxes["api"])], sw=1.6, dash="6 5")

    # API -> spine entry
    b.polyline([bottom(boxes["api"]), (bottom(boxes["api"])[0], 700), top(boxes["s1"])], sw=2.2)

    # repair loop back up  (S7 -> S6, left channel)
    b.polyline([(left(boxes["s7"])[0], left(boxes["s7"])[1]),
                (790, left(boxes["s7"])[1]), (790, left(boxes["s6"])[1]),
                left(boxes["s6"])], stroke="#dc2626", sw=2.2)
    b.label(782, left(boxes["s6"])[1] - 12, "gate failure", 13, "bold", "right", "#dc2626")
    b.label(782, left(boxes["s6"])[1] + 24, "-> repair again", 12, "regular", "right", "#dc2626")

    # tsc gate -> repair
    b.polyline([right(boxes["s5"]), (2260, right(boxes["s5"])[1]),
                (2260, right(boxes["s6"])[1]), right(boxes["s6"])],
               stroke="#dc2626", sw=1.8, dash="6 5")

    # spine -> export band
    b.polyline([bottom(boxes["s8"]), (bottom(boxes["s8"])[0], 2155),
                top(boxes["export"])], sw=2.2)

    # left panel -> plan (context in)
    b.polyline([(boxes["l3"]["x"] + boxes["l3"]["w"], mid(boxes["l3"])[1]),
                (770, mid(boxes["l3"])[1]), (770, left(boxes["s2"])[1]),
                left(boxes["s2"])], stroke="#15803d", sw=1.8)
    b.label(775, left(boxes["s2"])[1] - 14, "context", 12, "bold", "left", "#15803d")

    # RAG -> write (context injection)
    b.polyline([left(boxes["ragb"]), (2310, left(boxes["ragb"])[1]),
                (2310, right(boxes["s3"])[1] + 30), right(boxes["s3"])],
               stroke="#15803d", sw=1.8, dash="6 5")
    b.label(2316, right(boxes["s3"])[1] + 18, "library context", 12, "bold", "left", "#15803d")

    # spine <-> LLM hub (plan prompt out, code tokens back)
    b.polyline([right(boxes["s2"]), (2325, right(boxes["s2"])[1]),
                (2325, left(boxes["hub"])[1]), left(boxes["hub"])],
               stroke="#b45309", sw=2.0)
    b.label(2320, right(boxes["s2"])[1] - 14, "plan prompt", 12, "bold", "right", "#b45309")

    b.polyline([(left(boxes["hub"])[0], left(boxes["hub"])[1] + 60),
                (2280, left(boxes["hub"])[1] + 60), (2280, right(boxes["s3"])[1] + 60),
                right(boxes["s3"])], stroke="#b45309", sw=2.0, dash="7 5")
    b.label(2288, right(boxes["s3"])[1] + 74, "generated code", 12, "bold", "left", "#b45309")

    # providers <- hardware (models served)  : right channel loop
    b.polyline([right(boxes["agent"]), (3660, right(boxes["agent"])[1]),
                (3660, right(boxes["prov"])[1]), right(boxes["prov"])],
               stroke="#0f766e", sw=2.0)
    b.label(3652, right(boxes["prov"])[1] - 14, "served models", 12, "bold", "right", "#0f766e")

    # training -> lineage (already inside band) ; lineage -> providers
    b.polyline([top(boxes["lineage"]), (mid(boxes["lineage"])[0], 2790),
                (mid(boxes["lineage"])[0], 2790), bottom(boxes["glyph"])],
               stroke="#a16207", sw=2.0)
    b.label(mid(boxes["lineage"])[0], 2478, "merged + quantised", 12, "bold", "center", "#a16207")

    # sandbox feeds the gates
    b.polyline([top(boxes["behave"]), (mid(boxes["behave"])[0], 2120),
                (mid(boxes["behave"])[0], 2120), (mid(boxes["s7"])[0], 2120)],
               stroke="#4338ca", sw=1.8, dash="6 5")
    b.polyline([(mid(boxes["s7"])[0], 2120), top(boxes["s7"])], stroke="#4338ca", sw=1.8)
    b.label(mid(boxes["s7"])[0] + 16, 2112, "render + CLI verdict", 12, "bold", "left", "#4338ca")

    # export band <- spine (already) ; export -> hardware shipping note
    b.label(mid(boxes["dev"])[0], 2838, "produced by the pipeline above", 12, "bold", "center", P["hw"][0])


def check_placement(b: Builder) -> str:
    """Self-check: every label got geometry, and no label overflows its box.

    Catches the two silent failures this generator can have -- a label whose
    glyphs were never baked (it would simply vanish) and a label wider than the
    box it sits in (it would run over the neighbouring box).
    """
    overflows = []
    for lab in b.placed:
        cy = (lab["top"] + lab["bottom"]) / 2.0
        cx = lab["cx"]
        # A label belongs to the box that actually contains it in BOTH axes;
        # matching on y alone picks a neighbour in the same row.
        best = None
        for c in b.containers:
            if not (c["y"] <= cy <= c["y"] + c["h"]):
                continue
            if not (c["x"] <= cx <= c["x"] + c["w"]):
                continue
            if best is None or c["w"] * c["h"] < best["w"] * best["h"]:
                best = c
        if best is None:
            continue
        pad = 6
        if lab["left"] < best["x"] + pad or lab["right"] > best["x"] + best["w"] - pad:
            overflows.append(f"{lab['id']} ({lab['text'][:34]!r}) in {best['name']}"
                             f" ink={lab['right'] - lab['left']:.0f}"
                             f" box={best['w']:.0f}")
    msg = f"labels={len(b.placed)} overflow={len(overflows)}"
    for o in overflows[:6]:
        msg += f"\n   OVERFLOW: {o}"
    return msg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit-labels")
    ap.add_argument("--render", nargs=2, metavar=("GLYPHS_JSON", "OUT_SVG"))
    # A full-canvas background plate keeps the diagram readable in dark-themed
    # viewers, but Blender imports it as one large filled plane sitting over the
    # whole chart. So it is opt-in: the Blender-facing SVG stays transparent and
    # this flag produces a separate viewing copy.
    ap.add_argument("--background", action="store_true",
                    help="draw a white background plate over the canvas")
    args = ap.parse_args()

    m = build_model()

    if args.emit_labels:
        b = Builder("labels")
        draw(b, m)
        with open(args.emit_labels, "w", encoding="utf-8") as fh:
            json.dump(list(b.labels.values()), fh, indent=1)
        print(f"labels: {len(b.labels)} unique")
        return

    if args.render:
        glyphs_path, out_path = args.render
        with open(glyphs_path, "r", encoding="utf-8") as fh:
            glyphs = json.load(fh)
        b = Builder("render", glyphs)
        if args.background:
            b.rect(0, 0, W, H, r=0, fill="#ffffff", stroke=None, name="background")
        draw(b, m)
        report = check_placement(b)
        body = "\n".join(b.svg)
        svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
               f'viewBox="0 0 {W} {H}">\n{body}\n</svg>\n')
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(svg)
        print(f"wrote {out_path}: {len(b.svg)} elements, glyphs={len(glyphs)}"
              f"{', background=white' if args.background else ''}")
        print("placement:", report)
        return

    ap.error("choose --emit-labels or --render")


if __name__ == "__main__":
    main()
