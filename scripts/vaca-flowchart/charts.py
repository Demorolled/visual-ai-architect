#!/usr/bin/env python3
# charts.py — the VACA system split into three focused charts.
#
#   docs/vaca-flowchart/01-build-pipeline.svg    plan -> write -> gates -> repair -> export
#   docs/vaca-flowchart/02-llm-layer.svg         translator, roles, providers, fallback
#   docs/vaca-flowchart/03-training-pipeline.svg self-play, adapters, merge, serving
#
# Shares its drawing primitives and its glyph-baking contract with gen.py: labels
# are still baked to outlines by glyphs.py, because Blender's SVG importer drops
# <text>. Run order is the same two phases, but ONE bake covers all three charts:
#
#   python3 charts.py --emit-labels /tmp/vaca/charts-labels.json
#   blender --background --factory-startup --python glyphs.py -- \
#           /tmp/vaca/charts-labels.json /tmp/vaca/charts-glyphs.json
#   python3 charts.py --render /tmp/vaca/charts-glyphs.json ../../docs/vaca-flowchart
#
# Add --background to write "-viewing" copies with a white plate (those import into
# Blender as one large plane, so they are for reading, not for editing).

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen import (Builder, P, FONT_SIZE, TITLE_SIZE, BAND_SIZE, TITLE_MAIN,
                 SUB_MAIN, CHIP_SIZE, BAND, BANDTXT, TITLE, check_placement)

ARROW = "#475569"
RED = "#dc2626"


def B(boxes, key, group, x, y, w, h, title, lines=()):
    boxes[key] = {"group": group, "x": x, "y": y, "w": w, "h": h,
                  "title": title, "lines": list(lines), "r": 12}


# ── Chart 1: the build pipeline ──────────────────────────────────────────────
def chart_build():
    W, H = 2500, 2320
    boxes = {}
    B(boxes, "ctx", "rag", 60, 180, 660, 110, "INTENT & CONTEXT",
      ["ai/intentExtractor.ts", "languageInference, emotionEngine"])
    B(boxes, "e1", "pipe", 760, 180, 980, 110, "ENTRY POINTS",
      ["Canvas node graph (React Flow)   |   ReasoningPanel chat",
       "both reduce to one plain-English build request"])
    B(boxes, "role0", "llm", 1780, 180, 660, 110, "WHO PLAYS IT",
      ["job roles live in the LLM layer", "(see chart 02)"])

    B(boxes, "p1", "pipe", 760, 390, 980, 110, "1.  REQUEST",
      ["request + canvas graph  ->  IntentSpec"])
    B(boxes, "p2", "pipe", 760, 530, 980, 180, "2.  PLAN      POST /api/reason/plan-code",
      ["IntentSpec -> clarifying questions -> PlannedFile[] CONTRACTS",
       "tree-aware layout + cross-tree bridge modules",
       "nothing is written until the contracts exist"])
    B(boxes, "q", "rag", 60, 530, 660, 180, "CLARIFYING QUESTIONS",
      ["normalizeQuestions() -> back to the UI",
       "the build WAITS for answers",
       "before the contracts are frozen"])
    B(boxes, "r1", "sandbox", 1780, 530, 660, 180, "FILE CONTRACTS",
      ["PlannedFile[]: path, exports, imports,", "node type",
       "contract consistency is checked", "before any code is written"])

    B(boxes, "w1", "pipe", 760, 810, 980, 180, "3.  WRITE      POST /api/reason/write-code",
      ["three modes:   one-shot  |  per-file  |  chunked",
       "each file written against its own contract",
       "+ the injected library context"])
    B(boxes, "ctxw", "rag", 60, 810, 660, 180, "LIBRARY CONTEXT",
      ["getLibraryContextDense(request)", "node-type-scoped; attached to",
       "every write prompt"])
    B(boxes, "r2", "llm", 1780, 810, 660, 180, "RETRIEVAL + ROLES",
      ["context: ai/libraryContext.ts (dense)",
       "role: codeGeneration",
       "-> LLM layer (chart 02)"])

    B(boxes, "g1", "pipe", 760, 1180, 980, 100, "4.  CONTRACT GATE   (zero LLM)",
      ["every planned file present; every export/import member real"])
    B(boxes, "g2", "pipe", 760, 1310, 980, 100, "5.  TSC GATE",
      ["tsc over .ts/.tsx, reported per file; clean files ship onward"])
    B(boxes, "g3", "pipe", 760, 1440, 980, 100, "6.  DETERMINISTIC FIXERS   (zero LLM)",
      ["sibling-path resolver, name-drift aligner, import patch"])
    B(boxes, "g4", "pipe", 760, 1570, 980, 100, "7.  LLM REPAIR ROUNDS",
      ["each round is fed the REAL type shapes  (TS2339 / 2305 / 2345 / 2322)"])
    B(boxes, "g5", "pipe", 760, 1700, 980, 100, "8.  LANGUAGE GATES   (non-TS)",
      ["go build / py_compile   |   3D headless-Chrome render gate   |   tsx CLI gate"])
    B(boxes, "g6", "pipe", 760, 1830, 980, 100, "9.  RUNTIME SMOKE",
      ["the exported program is actually started, not just compiled"])

    B(boxes, "fb", "tools", 1780, 1440, 660, 260, "HOW YOU KNOW A FIX WORKED",
      ["re-measure, do not assume:",
       "run the 6-write convergence probe,",
       "count tsc errors, compare the error",
       "signature round to round",
       "-> a fix that does not move the",
       "signature did not fix anything"])

    B(boxes, "x1", "tools", 760, 2020, 980, 170, "10.  EXPORT",
      ["perFileScaffolder -> apps/<app>/ per tree",
       "+ shared bridge/ re-exported from both entries",
       "multi-platform: Windows, Mac, Linux, iOS"])
    B(boxes, "out", "tools", 60, 2020, 660, 170, "OUTPUT & PACKAGING",
      ["one export dir per project",
       "packaging/ -> VACAFULL (Electron)"])
    B(boxes, "gap", "sandbox", 1780, 2020, 660, 170, "KNOWN GAP",
      ["the chat path (plan-code/write-code)",
       "is not Tree-Mode aware yet —",
       "it still builds one flat app"])

    def c(k): return boxes[k]
    links = [
        # entry
        {"pts": [(720, 235), (760, 235)], "color": "#15803d", "label": "context", "lx": 712, "ly": 227, "la": "right"},
        {"pts": [(1250, 290), (1250, 390)]},
        {"pts": [(1250, 500), (1250, 530)]},
        # plan
        {"pts": [(720, 620), (760, 620)], "color": "#15803d", "label": "answers", "lx": 712, "ly": 612, "la": "right"},
        {"pts": [(2110, 710), (2110, 810)], "color": "#4338ca", "label": "contracts", "lx": 2120, "ly": 760, "la": "left"},
        {"pts": [(2110, 900), (1740, 900)], "color": "#4338ca"},
        {"pts": [(1250, 710), (1250, 810)], "sw": 2.4},
        # write
        {"pts": [(720, 900), (760, 900)], "color": "#15803d", "label": "context", "lx": 712, "ly": 892, "la": "right"},
        {"pts": [(1780, 900), (1740, 900)], "color": "#b45309", "label": "role", "lx": 1786, "ly": 892, "la": "left"},
        # gates chain
        {"pts": [(1250, 990), (1250, 1180)], "sw": 2.4},
        {"pts": [(1250, 1280), (1250, 1310)]},
        {"pts": [(1250, 1410), (1250, 1440)]},
        {"pts": [(1250, 1540), (1250, 1570)]},
        {"pts": [(1250, 1670), (1250, 1700)]},
        {"pts": [(1250, 1800), (1250, 1830)]},
        # repair loop (gate failure -> deterministic fixers)
        {"pts": [(760, 1880), (720, 1880), (720, 1490), (760, 1490)],
         "color": RED, "sw": 2.2, "label": "gate failure -> repair again", "lx": 712, "ly": 1770, "la": "right"},
        {"pts": [(2110, 1440), (2110, 1490), (1740, 1490)],
         "color": RED, "dash": "6 5", "label": "", "lx": 0, "ly": 0, "la": "left"},
        # export
        {"pts": [(1250, 1930), (1250, 2020)], "sw": 2.4},
        # Centred in the 40 px gap between the two boxes: right-aligning it at 730
        # straddled the edge of `out` (flagged by check_placement).
        {"pts": [(760, 2105), (720, 2105)], "label": "ships", "lx": 740, "ly": 2093, "la": "center"},
        {"pts": [(1780, 2105), (1740, 2105)], "color": "#4338ca", "dash": "6 5"},
    ]

    return {
        "key": "01-build-pipeline", "W": W, "H": H,
        "title": "VACA  —  the build pipeline",
        "subtitle": "how one plain-English request becomes a running, exported program:  "
                    "plan  ->  write  ->  gates  ->  repair  ->  export",
        "bands": [("ENTRY", 130, 310), ("PLAN", 340, 740), ("WRITE", 770, 1110),
                  ("GATES  &  REPAIR LOOP", 1140, 1950), ("EXPORT", 1980, 2260)],
        "boxes": boxes, "links": links,
    }


# ── Chart 2: the LLM layer ───────────────────────────────────────────────────
def chart_llm():
    W, H = 2500, 1960
    boxes = {}
    B(boxes, "hub", "llm", 760, 180, 980, 130, "ai/translator.ts  —  the LLM router",
      ["loadLlmConfig():  dspark  ->  ollama  ->  gguf",
       "one OpenAI-compatible client, swapped on fallback"])
    B(boxes, "cfg", "llm", 1780, 180, 660, 130, "backend/llm-config.json",
      ["sections: provider, ollama, primary,",
       "secondary, fastChat, roles, dspark"])

    B(boxes, "band", "llm", 760, 400, 980, 290, "JOB ROLES  —  reassigned in Settings -> LLM Connect",
      ["reasoning       = lead vocalist   (the trained VACA model, Veronica)",
       "codeGeneration  = rhythm guitar   (raw code, one file at a time)",
       "guiBuild        = drummer         (interfaces / front end)",
       "fastChat        = backing vocals  (quick casual chat)",
       "persisted by POST /api/llm/roles"])
    B(boxes, "res", "sandbox", 60, 400, 660, 290, "ROLE RESOLUTION",
      ["getRoleTarget(role)", "roleTargetCache — memoised",
       "clearRolesRoleCache() is called", "after a role is reassigned",
       "so the next request honours it", "without a restart"])
    B(boxes, "prompt", "rag", 1780, 400, 660, 290, "PER-ROLE PROMPT",
      ["LLM_ORIENTATION.md is injected",
       "into the matching role's",
       "instructions, so every model",
       "knows which instrument it is",
       "carrying and stays in its lane"])

    B(boxes, "prov", "llm", 760, 800, 980, 190, "PROVIDER PRECEDENCE",
      ["dspark :8000   ->   ollama :11434   ->   gguf",
       "the first configured section in llm-config.json wins",
       "same precedence in the health probe and the translator"])
    B(boxes, "fb", "train", 760, 1040, 980, 150, "FALLBACK  +  RECONNECT",
      ["connection error -> fallbackToOllama() swaps the live client",
       "a 30 s poller switches back to dspark once it is healthy again"])
    B(boxes, "eps", "sandbox", 60, 800, 660, 390, "CONTROL ENDPOINTS",
      ["GET  /api/llm/roles", "GET  /api/llm/providers",
       "POST /api/llm/roles", "POST /api/llm/proxy/chat",
       "POST /api/llm/proxy/scan-provider",
       "POST /api/llm/proxy/verify-model",
       "GET  /api/llm/ollama-scan", "GET  /api/llm/dspark-status",
       "GET  /api/llm/dspark-benchmark"])
    B(boxes, "work", "pipe", 1780, 800, 660, 390, "SPECIALISED WORKERS",
      ["coder tiers, tried in order:",
       "   coderGpu1  0.5B  :11437",
       "   coderGpu0  1.5B  :11434",
       "   coderCpu   0.5B  :11436",
       "vision critic: ai/vision.ts",
       "   POST /api/reason/vision"])

    B(boxes, "models", "rag", 760, 1290, 980, 170, "MODELS ACTUALLY SERVED",
      ["Ollama tags:  vaca-r40-q4, vaca-r20-q4, buffy,",
       "qwen2.5-coder:14b, ornith:35b, qwen2.5vl:7b",
       "embeddings:  nomic-embed-text"])
    B(boxes, "surface", "clients", 760, 1510, 980, 150, "WHERE IT SURFACES IN THE APP",
      ["LLMSelector, LLMConfig, VeronicaLLMIndicator",
       "Settings -> LLM Connect reassigns any role at runtime"])
    B(boxes, "host", "hw", 1780, 1290, 660, 370, "WHERE THE MODELS RUN",
      ["agent computer llmlab@192.168.1.234",
       "2-3x RTX 3060 12 GB",
       "Ollama :11434   dspark :8000",
       "tailnet: llmlab-agent",
       "",
       "local box: 127.0.0.1:11434"])

    def c(k): return boxes[k]
    links = [
        {"pts": [(1740, 245), (1780, 245)], "color": "#b45309", "label": "reads", "lx": 1734, "ly": 237, "la": "right"},
        {"pts": [(1250, 310), (1250, 400)]},
        {"pts": [(720, 545), (760, 545)], "label": "resolve", "lx": 712, "ly": 537, "la": "right"},
        {"pts": [(1740, 545), (1780, 545)], "color": "#15803d", "label": "chart", "lx": 1734, "ly": 537, "la": "right"},
        {"pts": [(1250, 690), (1250, 800)]},
        {"pts": [(1250, 990), (1250, 1040)], "color": RED, "label": "on failure", "lx": 1262, "ly": 1018, "la": "left"},
        {"pts": [(720, 1040), (760, 1040)], "label": "config", "lx": 712, "ly": 1032, "la": "right"},
        {"pts": [(1740, 1040), (1780, 1040)], "color": "#0f766e", "label": "tiers", "lx": 1734, "ly": 1032, "la": "right"},
        {"pts": [(1250, 1190), (1250, 1290)]},
        {"pts": [(1250, 1460), (1250, 1510)]},
        {"pts": [(1740, 1460), (1780, 1460)], "color": "#334155", "label": "serves", "lx": 1734, "ly": 1452, "la": "right"},
    ]

    return {
        "key": "02-llm-layer", "W": W, "H": H,
        "title": "VACA  —  the LLM layer",
        "subtitle": "who answers, in what order, and what happens when a provider dies:  "
                    "roles, precedence, fallback, coder tiers",
        "bands": [("THE HUB", 130, 330), ("JOB ROLES  —  the band", 360, 730),
                  ("PROVIDERS  &  FALLBACK", 760, 1230),
                  ("SPECIALISED WORKERS", 1260, 1500),
                  ("CONTROL SURFACE", 1530, 1900)],
        "boxes": boxes, "links": links,
    }


# ── Chart 3: the training pipeline ───────────────────────────────────────────
def chart_train():
    W, H = 2500, 2200
    boxes = {}
    B(boxes, "seeds", "rag", 60, 180, 660, 130, "SEED DATA",
      ["corpora/, bible-reference/", "curriculum/, data/library/*.md"])
    B(boxes, "domain", "rag", 760, 180, 980, 130, "VACA DOMAIN  +  LEARNED PATTERNS",
      ["training/selfplay/vaca_domain.py",
       "backend/knowledge/patterns.json — grown from real builds"])
    B(boxes, "real", "rag", 1780, 180, 660, 130, "REAL BUILD OUTPUT",
      ["tsc error classes, gate verdicts,",
       "the fix that worked or did not"])

    B(boxes, "sp", "train", 760, 400, 980, 250, "SELF-PLAY",
      ["orchestrator.py drives the rounds",
       "judge.py scores student vs teacher",
       "scoreboard.py ranks the variants",
       "train_student.py trains the student",
       "config.py -> selfplay.json"])
    B(boxes, "jr", "train", 1780, 400, 660, 250, "JUDGE  &  SCOREBOARD",
      ["independent scoring produces the",
       "preference pairs the next round trains on",
       "(ORPO pairs grow every round)"])
    B(boxes, "roles", "train", 60, 400, 660, 250, "ROLE TRAINING",
      ["training/roles/roles.json", "train_roles.py",
       "one adapter per job role:", "reasoning, codeGeneration,",
       "guiBuild, fastChat"])

    B(boxes, "adapt", "train", 760, 860, 980, 230, "ADAPTER TRAINING",
      ["LoRA / QLoRA rounds on the agent box",
       "adapters accumulate: vaca-r31 .. vaca-r40",
       "each round is named and kept, not overwritten"])
    B(boxes, "unl", "train", 1780, 860, 660, 230, "UNLEARNING",
      ["training/unlearn: npo.py, negate.py",
       "evaluate.py, preflight.py", "gguf_to_hf.py",
       "-> refusal / empty-response metrics"])
    B(boxes, "synth", "train", 60, 860, 660, 230, "OTHER TRACKS",
      ["training/fromscratch, smallbase,",
       "cloud, vacalatest, vlm",
       "(parallel experiments, not the main line)"])

    B(boxes, "remote", "train", 760, 1230, 980, 200, "REMOTE ROUNDS",
      ["training/remote/agent_worker.py",
       "remote_job.py, start-agent.sh",
       "training runs on the agent box, not locally"])
    B(boxes, "hw", "hw", 1780, 1230, 660, 200, "AGENT BOX",
      ["2-3x RTX 3060 12 GB (~36 GB VRAM)",
       "Ollama :11434, trainer :8811",
       "the serve is PAUSED to free VRAM"])

    B(boxes, "eval", "sandbox", 60, 1580, 660, 200, "EVALUATION",
      ["eval_acceptance.py, eval-unified-battery",
       "probe-write-convergence.py",
       "logs: eval-unified-r36val, merge-r37"])
    B(boxes, "lin", "train", 760, 1580, 980, 200, "MODEL LINEAGE",
      ["adapters vaca-r31 .. vaca-r40",
       "-> merge  ->  GGUF Q4 (vaca-r40-q4)",
       "-> ollama create <tag>"])
    B(boxes, "guard", "tools", 1780, 1580, 660, 200, "MEASURE, DO NOT ASSUME",
      ["a round is only kept when it moves",
       "the error signature the right way",
       "(a fix that changes nothing is noise)"])

    B(boxes, "serve", "llm", 760, 1930, 980, 150, "BACK INTO SERVING",
      ["ollama create -> served on :11434",
       "backend/llm-config.json points at the new tag",
       "-> consumed by the LLM layer (chart 02)"])

    def c(k): return boxes[k]
    links = [
        {"pts": [(720, 245), (760, 245)], "color": "#15803d"},
        {"pts": [(1740, 245), (1780, 245)], "color": "#15803d"},
        {"pts": [(1250, 310), (1250, 400)], "sw": 2.4},
        {"pts": [(720, 525), (760, 525)], "color": "#a16207", "label": "role targets", "lx": 712, "ly": 517, "la": "right"},
        {"pts": [(1740, 525), (1780, 525)], "color": "#a16207", "label": "pairs", "lx": 1734, "ly": 517, "la": "right"},
        {"pts": [(1250, 650), (1250, 860)], "sw": 2.4, "label": "training data", "lx": 1262, "ly": 800, "la": "left"},
        {"pts": [(1740, 975), (1780, 975)], "color": RED, "label": "negatives", "lx": 1734, "ly": 967, "la": "right"},
        {"pts": [(720, 975), (760, 975)], "color": "#a16207", "dash": "6 5"},
        {"pts": [(1250, 1090), (1250, 1230)], "sw": 2.4},
        {"pts": [(2110, 1230), (2110, 1180), (1250, 1180), (1250, 1230)],
         "color": "#334155", "dash": "6 5", "label": "runs on", "lx": 2118, "ly": 1210, "la": "left"},
        {"pts": [(1250, 1430), (1250, 1580)], "sw": 2.4},
        {"pts": [(720, 1680), (760, 1680)], "color": "#4338ca", "label": "scores", "lx": 712, "ly": 1672, "la": "right"},
        {"pts": [(1740, 1680), (1780, 1680)], "color": RED, "dash": "6 5", "label": "gate", "lx": 1734, "ly": 1672, "la": "right"},
        {"pts": [(1250, 1780), (1250, 1930)], "sw": 2.4, "label": "merged + quantised", "lx": 1262, "ly": 1862, "la": "left"},
        {"pts": [(1740, 2005), (1780, 2005)], "color": "#b45309", "label": "-> chart 02", "lx": 1746, "ly": 1997, "la": "left"},
    ]

    return {
        "key": "03-training-pipeline", "W": W, "H": H,
        "title": "VACA  —  the training pipeline",
        "subtitle": "how the models VACA runs on are produced:  self-play -> adapters -> "
                    "merge -> quantise -> serve, on the agent box's GPUs",
        "bands": [("DATA IN", 130, 340), ("SELF-PLAY LOOP", 370, 680),
                  ("ADAPTERS  &  UNLEARNING", 710, 1120), ("REMOTE ROUNDS", 1150, 1460),
                  ("LINEAGE  &  EVALUATION", 1490, 1810), ("SERVING", 1840, 2130)],
        "boxes": boxes, "links": links,
    }


CHARTS = [chart_build, chart_llm, chart_train]


def draw_chart(b: Builder, ch: dict):
    W, H = ch["W"], ch["H"]

    b.label(60, 78, ch["title"], TITLE_MAIN, "bold", "left", TITLE)
    b.label(60, 108, ch["subtitle"], SUB_MAIN, "regular", "left", BANDTXT)

    for i, (title, y0, y1) in enumerate(ch["bands"]):
        b.rect(30, y0, W - 60, y1 - y0, r=16, fill="none", stroke=BAND, sw=1.6,
               dash="9 7", name=f"band{i}")
        b.label(52, y0 + 28, title, BAND_SIZE, "bold", "left", BANDTXT)

    for key, c in ch["boxes"].items():
        stroke, fill, tcol = P[c["group"]]
        b.rect(c["x"], c["y"], c["w"], c["h"], r=c["r"], fill=fill,
               stroke=stroke, sw=2.0, name=key)
        b.containers.append({"name": key, "x": c["x"], "y": c["y"],
                             "w": c["w"], "h": c["h"]})
        cx = c["x"] + c["w"] / 2
        b.label(cx, c["y"] + 34, c["title"], TITLE_SIZE, "bold", "center", tcol)
        for i, line in enumerate(c["lines"]):
            b.label(cx, c["y"] + 62 + i * 22, line, FONT_SIZE, "regular", "center", "#475569")

    for lk in ch["links"]:
        b.polyline(lk["pts"], stroke=lk.get("color", ARROW), sw=lk.get("sw", 2.0),
                   dash=lk.get("dash"), name="link")
        if lk.get("label"):
            b.label(lk["lx"], lk["ly"], lk["label"], 12, "bold",
                    lk.get("la", "left"), lk.get("color", ARROW))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit-labels")
    ap.add_argument("--render", nargs=2, metavar=("GLYPHS_JSON", "OUT_PREFIX"))
    ap.add_argument("--background", action="store_true",
                    help="also write -viewing copies with a white plate")
    args = ap.parse_args()

    if args.emit_labels:
        b = Builder("labels")
        for factory in CHARTS:
            draw_chart(b, factory())
        with open(args.emit_labels, "w", encoding="utf-8") as fh:
            json.dump(list(b.labels.values()), fh, indent=1)
        print(f"charts: {len(CHARTS)}  labels: {len(b.labels)} unique")
        return

    if args.render:
        glyphs_path, out_prefix = args.render
        with open(glyphs_path, "r", encoding="utf-8") as fh:
            glyphs = json.load(fh)

        # OUT_PREFIX is the DIRECTORY the charts are written into (one chart per
        # file), so a bare directory name still lands the files where asked.
        out_dir = out_prefix
        os.makedirs(out_dir, exist_ok=True)

        for factory in CHARTS:
            ch = factory()
            for viewing in ([False, True] if args.background else [False]):
                b = Builder("render", glyphs)
                if viewing:
                    b.rect(0, 0, ch["W"], ch["H"], r=0, fill="#ffffff",
                           stroke=None, name="background")
                draw_chart(b, ch)
                report = check_placement(b)
                body = "\n".join(b.svg)
                svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
                       f'<svg xmlns="http://www.w3.org/2000/svg" width="{ch["W"]}" '
                       f'height="{ch["H"]}" viewBox="0 0 {ch["W"]} {ch["H"]}">\n'
                       f'{body}\n</svg>\n')
                suffix = "-viewing" if viewing else ""
                path = os.path.join(out_dir, ch["key"] + suffix + ".svg")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(svg)
                print(f"wrote {path}: {len(b.svg)} elements | {report}")
        return

    ap.error("choose --emit-labels or --render")


if __name__ == "__main__":
    main()
