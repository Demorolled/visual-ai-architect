#!/usr/bin/env python3
"""vaca_domain.py — build a "VACA literacy" corpus from the repo's own knowledge.

The goal: the student should understand VACA end to end — what it is, how a
build flows through it, what every node type means, how blueprints are shaped,
how code is generated/fixed/exported — and *its own role inside VACA*.

Everything here is mined from artifacts that already live in the repo, so every
row is grounded in something real rather than invented:

  data/library/*.md                44 reference guides (architecture, patterns)
  data/component-manifest.json     node types, app templates, selection guide
  backend/blueprints/*.json        canonical blueprint contract
  backend/blueprints/generated/*   1,221 real design examples
  data/designs.json                real user prompts
  backend/knowledge/patterns.json  verified code patterns
  LLM_ORIENTATION.md               the model's own role (the "band")
  backend/src/**                   the actual pipeline (stages, fixers, routes)
  *.md reports                     triage / evaluation history

Output:
  <out>.jsonl        strict Alpaca rows  {instruction, input, output}
  <out>.meta.jsonl   same order, + {source, facet} for auditing/coverage

Both files are written in lockstep so line N of one maps to line N of the other
(the trainer's loader only understands the 3-key Alpaca shape, so keeping the
metadata in a sidecar avoids feeding it unknown keys).

The coverage report answers "how much of VACA does this teach?" by counting rows
per facet against an absolute target row count (`target_rows`).

Usage:
    python3 -m training.selfplay.vaca_domain                 # build + report
    python3 -m training.selfplay.vaca_domain --report-only    # report on disk
    python3 -m training.selfplay.vaca_domain --max-per-facet 400
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ── what "100% of VACA" is made of ───────────────────────────────────────────
# target_rows = how many rows this facet needs before it stops being a gap.
#
# This used to be a *share* of the corpus that summed to 100, which was wrong:
# one over-full facet (blueprint, 400 rows) dragged everyone else's share down,
# so facets were flagged "starved" purely because their neighbour was bloated.
# Absolute targets measure the gap that actually exists, and the per-facet trim
# in build() keeps the training mix balanced on top of that.
FACETS: dict[str, dict] = {
    "identity_role":      {"target_rows": 100, "desc": "what VACA is + the model's role in it"},
    "canvas_nodes":       {"target_rows": 120, "desc": "node types, semantics, canonical files"},
    "blueprint":          {"target_rows": 150, "desc": "blueprint contract, wiring graph, selection"},
    "app_templates":      {"target_rows": 120, "desc": "app archetypes, stacks, scaffolding"},
    "codegen_rules":      {"target_rows": 150, "desc": "how code is written: rules and patterns"},
    "build_pipeline":     {"target_rows": 150, "desc": "end-to-end build flow, gates, fixers"},
    "knowledge_learning": {"target_rows": 80,  "desc": "pattern store, quality gate, learning"},
    "export_deploy":      {"target_rows": 60,  "desc": "per-tree export, apps/ layout, running"},
    "operations":         {"target_rows": 60,  "desc": "services, ports, training/ops surface"},
    "troubleshooting":    {"target_rows": 40,  "desc": "known failure modes and triage"},
}

# ── The standing directive: keep learning VACA, evolve, always improve ───────
# The model is not a code generator bolted onto VACA; it runs ON VACA, so the
# platform is its home turf and its mastery of it has to keep growing. Leaving
# this only in the runtime system prompt means a fresh deploy or a different
# client can drop it. These rows put the obligation in the training corpus too,
# so the next round bakes it into the weights. Each answer names the REAL file
# or command that reports the thing it is talking about — a directive that
# invents platform commands would teach the model to invent them.
MASTERY_ROWS: list[tuple[str, str]] = [
    (
        "What is your standing obligation toward VACA itself?",
        "You run on the VACA platform, so VACA is your home turf. Your job is not only to\n"
        "build apps with it — it is to keep learning how VACA actually runs and to get\n"
        "better at using it every session. Concretely:\n"
        "1. Know the real pipeline (plan -> nodes -> generate -> validate -> repair -> export),\n"
        "   not a general coding workflow you assume it has.\n"
        "2. Treat every build as material: the error class it produced and the fix that\n"
        "   worked are things VACA is supposed to learn from, not noise to discard.\n"
        "3. When you find a real gap in VACA, record it and help improve the platform\n"
        "   rather than silently routing around it.\n"
        "4. Each round should leave you knowing more of how VACA runs than the last one.",
    ),
    (
        "How do you keep learning how VACA runs?",
        "Read the repo, don't guess. The reliable orientation docs are `LLM_ORIENTATION.md`\n"
        "(what you are in the band) and `NEXT_SESSION.md` (where the project actually\n"
        "stands); `AGENTS.md` holds the working rules. The pipeline itself is the source\n"
        "of truth in `backend/src/` (routes, services, the fixers) and the training/ops\n"
        "surface lives under `training/` and `scripts/`. When you do not know a command, a\n"
        "flag, or the current state, say so plainly and name the file or command that\n"
        "reports it (e.g. `training/selfplay/work/state.json`, `nvidia-smi`, `ollama ps`)\n"
        "instead of inventing one — a made-up VACA command is worse than \"I don't know\".",
    ),
    (
        "How does VACA capture what it learns, so the model evolves?",
        "VACA has a real learning path; know it instead of assuming learning is automatic.\n"
        "Verified-good builds feed the knowledge bank at `backend/knowledge/patterns.json`\n"
        "(capture is gated on tsc-clean output). The VACA literacy corpus that teaches the\n"
        "model VACA itself is built by `python3 -m training.selfplay.vaca_domain`, which\n"
        "writes `training/selfplay/corpus/vaca-domain.jsonl` (plus a `.meta.jsonl` sidecar\n"
        "and a coverage report). The self-play trainer that turns those captures into a\n"
        "better student is `python3 -m training.selfplay.orchestrator` (PLAY -> AUDIT ->\n"
        "CORPUS -> TRAIN -> EXPORT), with the live scoreboard at\n"
        "`python3 -m training.selfplay.scoreboard`.",
    ),
    (
        "How should you evolve your own way of working with VACA?",
        "Bring back what the platform cannot see on its own. When a build fails, name the\n"
        "failure class and whether an existing gate or fixer should have caught it — a gate\n"
        "that passes a broken app is a VACA bug, not a user bug. Prefer the deterministic\n"
        "fix a failure class points at over re-prompting the model blindly. Keep answers\n"
        "grounded in what the repo actually contains: if you are unsure a command exists,\n"
        "check the repo (`--help`, `ls`) and say so rather than producing a command that\n"
        "looks plausible. Improving VACA is part of using it.",
    ),
]

SAMPLE_CHARS = 2400       # body cap per mined document chunk
MIN_BODY_CHARS = 200      # ignore stub sections


def _read(p: Path) -> str:
    """Text of a file, transparently decompressing gzipped sources.

    `backend/knowledge/rnn-model.json` is stored gzipped (.json + gzip magic),
    which is easy to miss: reading it as text yields binary mojibake, and plain
    `json.load` raises, so the file disappears from the corpus with no error.
    Detecting the magic bytes here fixes both readers at once.
    """
    try:
        raw = p.read_bytes()
    except OSError:
        return ""
    if raw[:2] == b"\x1f\x8b":
        try:
            raw = gzip.decompress(raw)
        except OSError:
            return ""
    return raw.decode("utf-8", errors="replace")


def _jload(p: Path):
    try:
        return json.loads(_read(p))
    except json.JSONDecodeError:
        return None


def _count(p: Path) -> int:
    """Non-blank lines in a JSONL file (0 if it is missing/unreadable)."""
    n = 0
    try:
        with p.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    n += 1
    except OSError:
        return 0
    return n


def _clean(s: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", (s or "").strip())


# ── scaffolding-behaviour filter ─────────────────────────────────────────────
# The project direction (2026-10-03) is: VACA builds the scaffold; the LLM fills
# in the code VACA asks for. Rows whose INSTRUCTION asks the model to invent the
# app's node graph / file plan / architecture teach exactly the behaviour being
# removed (the per-file scaffold LLM step was measured net-negative and deleted
# 2026-10-02 — runs/scaffold-ab/removed/REMOVAL.md). They are filtered out at the
# single choke point every miner passes through, so no future miner can
# reintroduce them. VACA-KNOWLEDGE rows ("What blueprint shape does VACA
# require…", "What is VACA's universal project skeleton…") are KEPT on purpose:
# they teach the model about the harness it should take its lead from.
SCAFFOLD_INSTRUCTION_RE = re.compile(
    r"^(?:Design the complete architecture for"
    r"|Decompose .* into its architectural"
    r"|Design the node graph for"
    r"|What nodes and wiring should the VACA canvas contain"
    r"|Which nodes, files, languages and database should"
    r"|Build me\b)",
    re.I,
)


def _rows(rows: list, facet: str, source: str) -> list:
    out = []
    for r in rows:
        if not r:
            continue
        ins, outs = r
        body = _clean(outs)
        # Reject empties, and bare labels like "Exports:" / "Node type:" that a
        # template can leave behind when the source had nothing to say.
        if not ins or not body.strip() or re.fullmatch(r"[A-Za-z][A-Za-z /_-]{0,24}:", body):
            continue
        # Never train the model to BE the scaffolder (see note above).
        if SCAFFOLD_INSTRUCTION_RE.search(_clean(ins).strip()):
            continue
        out.append({"instruction": _clean(ins), "input": "",
                    "output": body[:SAMPLE_CHARS],
                    "facet": facet, "source": source})
    return out


_TS_EXPORT_RE = re.compile(
    r"^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)",
    re.M)


def _ts_header(text: str, limit: int = 1000) -> str:
    """The leading comment block of a TS module.

    In this repo the header comment is where the *why* lives ("the bug this
    guards"), so it is the highest-value part to teach — far more than the
    function bodies.
    """
    m = re.match(r"\s*(/\*\*.*?\*/)", text, re.S)
    if m:
        return m.group(1)[:limit]
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith("//"):
            lines.append(s)
        elif s and not s.startswith("import") and not s.startswith("#"):
            break
    return "\n".join(lines)[:limit]


def _ts_exports(text: str) -> list[str]:
    return sorted(set(_TS_EXPORT_RE.findall(text)))


def _module_facts(src: str, limit: int = 24) -> str:
    """Header comment plus exported names, or "" when the file has neither.

    Plenty of modules — route files especially — carry no leading doc comment
    and no `export` declarations. Emitting the template anyway produced rows
    whose entire answer was the literal label "Exports:", which is worse than
    no row at all: it teaches the model that a label is a complete answer.
    """
    head = _ts_header(src)
    exps = _ts_exports(src)
    parts = []
    if head.strip():
        parts.append(head.strip())
    if exps:
        parts.append(f"Exports: {', '.join(exps[:limit])}")
    return "\n\n".join(parts)


def _ts_modules(d: Path) -> list[tuple[str, str]]:
    """(filename, source) for every non-test .ts module in a directory."""
    if not d.is_dir():
        return []
    out = []
    for p in sorted(d.glob("*.ts")):
        if p.name.endswith(".test.ts"):
            continue
        src = _read(p)
        if src:
            out.append((p.name, src))
    return out


def _md_sections(text: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) chunks on ## headings."""
    parts = re.split(r"\n(?=#{2,3} )", text)
    out = []
    for part in parts:
        lines = part.strip().splitlines()
        if not lines:
            continue
        head = lines[0].lstrip("# ").strip()
        body = "\n".join(lines[1:]).strip()
        if len(body) >= MIN_BODY_CHARS:
            out.append((head, body))
    return out


# ── miners ───────────────────────────────────────────────────────────────────
def mine_identity() -> list:
    # The standing directive goes FIRST, not last: build() trims each facet to
    # its target_rows, so anything appended after the cap is silently dropped.
    # These rows are the point of the facet — they must survive the trim.
    rows = list(MASTERY_ROWS)
    path = ROOT / "LLM_ORIENTATION.md"
    text = _read(path)
    if text:
        rows.append(("What is VACA, and what is an LLM's role inside it?", text))
        # One row per band member so the instrument/role mapping is learned sharply.
        for m in re.finditer(r"^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|", text, re.M):
            instr = f"In VACA, what does the `{m.group(2)}` role do and which 'instrument' is it?"
            rows.append((instr, f"Instrument: {m.group(1).strip()}\n"
                                f"Role key: `{m.group(2)}`\n"
                                f"What it does: {m.group(3).strip()}"))
        rules = re.search(r"## The rules\n(.*?)(?:\n---|\Z)", text, re.S)
        if rules:
            rows.append(("What are the rules for an LLM connected to VACA?",
                         rules.group(1).strip()))
    # The real personas VACA injects per role, and how roles map to served models.
    prompts = _read(ROOT / "backend" / "src" / "ai" / "prompts.ts")
    if prompts:
        rows.append(("What persona/system instructions does VACA give the model for each role?",
                     prompts[:SAMPLE_CHARS]))
    llmcfg = _jload(ROOT / "backend" / "llm-config.json")
    if llmcfg:
        rows.append(("Which model serves each VACA role (reasoning, codeGeneration, guiBuild, fastChat)?",
                     json.dumps(llmcfg, indent=2, ensure_ascii=False)))
    # Every module in backend/src/ai/ is part of how VACA thinks and speaks, so
    # each one gets a row built from its header comment and its exported names.
    for name, src in _ts_modules(ROOT / "backend" / "src" / "ai"):
        facts = _module_facts(src)
        if facts:
            rows.append((f"In VACA, what does the `{name}` module do and what does it expose?",
                         facts))
    # The store that decides which model serves which role.
    store = _read(ROOT / "frontend" / "src" / "store" / "llmStore.ts")
    if store:
        rows.append(("Which model serves each VACA role, and how is a role assigned?",
                     f"{_ts_header(store)}\n\n{store[:SAMPLE_CHARS]}"))
        rows.append(("How does VACA connect a second LLM to a role (Settings -> LLM Connect)?",
                     store[:SAMPLE_CHARS]))
    # What VACA has recorded about itself over time. These docs are where the
    # project's own history and intent live.
    for name in ("CHANGE_LOG.md", "NEXT_SESSION.md", "SUGGESTIONS.md",
                 "VACA_CHANGE_LIST.md", "INTENT_UPGRADE_PLAN.md", "VACA_SCAN_REPORT.md",
                 # Docs that describe the system itself rather than an
                 # already-mined incident report (those stay in troubleshooting).
                 "README.md", "AGENTS.md", "GUI-DESIGN-TRAINING.md",
                 "R17-MORNING-NOTE.md", "BUILD_EVALUATION_REPORT.md",
                 "LIBRARY_SCAN_REPORT.md"):
        text = _read(ROOT / name)
        if not text:
            continue
        rows.append((f"What does `{name}` record about how VACA is built?",
                     text[:SAMPLE_CHARS]))
        for head, body in _md_sections(text)[:8]:
            rows.append((f"VACA history and intent ({name}) - {head}", body))
    # What the project calls itself.
    pkg = _jload(ROOT / "package.json") or {}
    if pkg:
        rows.append(("What is this project called, and how does it describe itself?",
                     f"name: {pkg.get('name')}\nversion: {pkg.get('version')}\n"
                     f"description: {pkg.get('description', '')}\n"
                     f"private: {pkg.get('private')}"))
    return _rows(rows, "identity_role",
                 "LLM_ORIENTATION.md + backend/src/ai/* + llm-config + llmStore + project docs")


def mine_canvas() -> list:
    rows = []
    manifest = _jload(ROOT / "data" / "component-manifest.json") or {}
    for nt in manifest.get("nodeTypes", []):
        t = nt.get("type")
        rows.append((
            f"In VACA, what is a `{t}` node for, what variants exist, and which files does it own?",
            f"Node type: {t}\nPurpose: {nt.get('purpose')}\n"
            f"Variants: {', '.join(nt.get('variants', []))}\n"
            f"Canonical files: {', '.join(nt.get('canonicalFiles', []))}",
        ))
    skel = manifest.get("universalSkeleton")
    if skel:
        rows.append(("What is VACA's universal project skeleton (files every generated app gets)?",
                     "\n".join(f"- {s}" if isinstance(s, str) else f"- {json.dumps(s)}" for s in skel)))
    ref = _read(ROOT / "data" / "library" / "01-node-architecture-reference.md")
    for head, body in _md_sections(ref):
        rows.append((f"Explain VACA's node architecture: {head}", body))
    # The canvas model as the app itself defines it — node data, node types,
    # and Tree Mode (several app trees in one project).
    types_ts = _read(ROOT / "frontend" / "src" / "types.ts")
    if types_ts:
        rows.append(("What fields does a node on the VACA canvas carry (NodeData)?",
                     types_ts[:SAMPLE_CHARS]))
        m = re.search(r"NodeType\s*=\s*([^;]+);", types_ts, re.S)
        if m:
            kinds = re.findall(r"'([a-z_]+)'", m.group(1))
            if kinds:
                rows.append(("Which node types can appear on the VACA canvas?",
                             "Node types: " + ", ".join(kinds)))
        for kw, q in ((
                "AppTree", "How does VACA Tree Mode hold several app trees inside one project?"),
                ("CrossTreeConnection",
                 "How do two VACA app trees share data (cross-tree connection)?")):
            mm = re.search(rf"interface {kw}\b[^{{]*\{{(.*?)\n\}}", types_ts, re.S)
            if mm:
                rows.append((q, mm.group(0)[:SAMPLE_CHARS]))
        rows.append(("What can connect to what on the VACA canvas (edge types)?",
                     _ts_header(types_ts) + "\n\n" + ", ".join(_ts_exports(types_ts)[:40])))
    node_tsx = _read(ROOT / "frontend" / "src" / "components" / "CustomNode.tsx")
    if node_tsx:
        rows.append(("How is a VACA canvas node rendered, and what does the node show?",
                     f"{_ts_header(node_tsx)}\n\n{node_tsx[:SAMPLE_CHARS]}"))
    # The canvas UI itself: each component that builds the visual editor.
    comp = ROOT / "frontend" / "src" / "components"
    if comp.is_dir():
        for p in sorted(comp.glob("*.tsx")):
            src = _read(p)
            if src:
                rows.append((f"What is VACA's `{p.name}` component responsible for?",
                             f"{_ts_header(src)}\n\n{src[:SAMPLE_CHARS]}"))
    # The frontend logic behind the canvas: state, API client, hooks.
    front = ROOT / "frontend" / "src"
    for sub in ("store", "api", "hooks", "utils", "types"):
        for name, src in _ts_modules(front / sub):
            facts = _module_facts(src, 20)
            if facts:
                rows.append((f"What is VACA's frontend `{sub}/{name}` responsible for?", facts))
    for entry in ("App.tsx", "codeOutputMain.tsx", "roadmapMain.tsx"):
        src = _read(front / entry)
        if src:
            rows.append((f"What does VACA's frontend entry `{entry}` do?",
                         f"{_ts_header(src)}\n\n{src[:SAMPLE_CHARS]}"))
    return _rows(rows, "canvas_nodes",
                 "manifest + library/01 + frontend types/components/store/api/hooks/utils")


def mine_blueprints() -> list:
    rows = []
    bp_dir = ROOT / "backend" / "blueprints"
    for f in sorted(bp_dir.glob("*.json")):
        bp = _jload(f)
        if not isinstance(bp, dict):
            continue
        at = bp.get("app_type", f.stem)
        # NOTE: the old "Build me <description>" -> <blueprint JSON> row is gone.
        # It taught the model to invent the app's scaffold; VACA now owns that
        # mapping. The contract-shape row below is VACA knowledge and stays.
        rows.append((
            f"What blueprint shape does VACA require, and what is the wiring for a `{at}` app?",
            json.dumps(bp, indent=2, ensure_ascii=False),
        ))
    # designs.json = real user goals already turned into a canvas node graph.
    # This is the highest-value mapping in the repo: words -> the actual design.
    designs = _jload(ROOT / "data" / "designs.json")
    if isinstance(designs, list):
        for d in designs:
            if not isinstance(d, dict):
                continue
            goal = str(d.get("goal") or d.get("name") or "").strip()
            nodes = d.get("nodes") or []
            if not goal or not nodes:
                continue
            lines = [f"Design: {d.get('name', '')}".strip(),
                     f"Target OS: {d.get('targetOS', 'any')}", "Nodes:"]
            for n in nodes:
                if isinstance(n, dict):
                    lines.append(f"- {n.get('label', '?')} [{n.get('type', '?')}]"
                                 + (f" — {n.get('description')}" if n.get("description") else ""))
            edges = d.get("edges") or []
            if edges:
                lines.append("Wiring:")
                for e in edges:
                    if isinstance(e, dict):
                        lines.append(f"- {e.get('source')} -> {e.get('target')}")
            # NOTE: the "Design the node graph for: X" / "What nodes and wiring
            # should the VACA canvas contain for X" rows are gone — they taught
            # the model to produce the canvas design, which is VACA's job now.
            # The design itself stays in the repo (data/designs.json) as the
            # source VACA's deterministic planner reads.
    return _rows(rows, "blueprint", "backend/blueprints + data/designs.json")


def mine_app_templates() -> list:
    rows = []
    manifest = _jload(ROOT / "data" / "component-manifest.json") or {}
    for at in manifest.get("appTypes", []):
        name = at.get("appType")
        # NOTE: the "Which nodes, files, languages and database should a `X` app
        # use?" row is gone — it trained the model to pick the app's node/file
        # template, which VACA's component-manifest now does deterministically.
        # The template data itself is still mined below as VACA knowledge.
        nodes = ", ".join(f"{n.get('name')}({n.get('type')})" for n in at.get("nodes", []))
        rows.append((
            f"What nodes, files, languages and database does VACA's `{name}` app template define?",
            f"App type: {name}\nNodes: {nodes}\n"
            f"Files: {', '.join(at.get('files', []))}\n"
            f"Languages: {', '.join(at.get('languages', []))}\n"
            f"Libraries: {', '.join(at.get('libraries', []))}\n"
            f"Database: {at.get('database')}\nInterface: {at.get('interface')}\n"
            f"Best for: {at.get('bestFor')}\nNode count: {at.get('nodeCount')}\n"
            f"Selection keywords: {', '.join(at.get('selectionKeywords', []))}",
        ))
    for hy in manifest.get("hybrids", []):
        # hybrids are plain strings like "CLI Tool + Web App = CLI with Web GUI"
        if isinstance(hy, str):
            rows.append((f"When should VACA combine app types: {hy}?",
                         f"Hybrid app type: {hy}\nVACA blends the two templates' nodes and files "
                         f"instead of picking one, when the request needs both shapes."))
        elif isinstance(hy, dict):
            rows.append((f"When should VACA use the `{hy.get('name', 'hybrid')}` approach?",
                         json.dumps(hy, indent=2, ensure_ascii=False)))
    sel = manifest.get("selectionGuide")
    if sel:
        rows.append(("How does VACA choose an app type from a user's request?",
                     json.dumps(sel, indent=2, ensure_ascii=False)))
        # One row per phrase: the decision table is only useful if each mapping
        # is recalled sharply, not as one blob of 28 lines.
        if isinstance(sel, dict):
            for phrase, atype in sel.items():
                rows.append((f'A user asks VACA to "{phrase}". Which app type should it choose?',
                             f"Request: {phrase}\nSelected app type: {atype}\n"
                             "VACA matches the request against this guide before choosing "
                             "nodes, files and stack."))
    tmpl = _read(ROOT / "data" / "library" / "02-app-type-templates.md")
    for head, body in _md_sections(tmpl):
        rows.append((f"Describe VACA's app-type template: {head}", body))
    # Which technology stack belongs to which kind of app.
    tech = _read(ROOT / "data" / "library" / "04-technology-mapping.md")
    for head, body in _md_sections(tech):
        rows.append((f"VACA technology mapping — {head}", body))
    # design-specs-v2.json: 282 named app ideas filed under a category and a
    # reference-library section. This is the repo's own answer to "what is this
    # kind of app called and which family does it belong to" — template
    # selection. Taken round-robin across categories so the sample is spread
    # over all ten families instead of being all 'fundamentals'.
    specs = _jload(ROOT / "data" / "design-specs-v2.json") or {}
    cats = specs.get("categories") if isinstance(specs, dict) else None
    if isinstance(cats, dict):
        buckets = {c: ((b or {}).get("designs") or []) for c, b in cats.items()}
        bibles = {c: (b or {}).get("bible_section", "") for c, b in cats.items()}
        ordered = []
        for i in range(max((len(b) for b in buckets.values()), default=0)):
            for c, designs in buckets.items():
                if i < len(designs):
                    ordered.append((c, bibles[c], designs[i]))
        for cat, bible, d in ordered[:60]:
            if not isinstance(d, dict):
                continue
            goal = str(d.get("goal") or "").strip()
            if not goal:
                continue
            rows.append((f"Which VACA app template family and stack fits: {goal}?",
                         f"Idea: {d.get('name', '')}\nGoal: {goal}\n"
                         f"Template family: {cat}\n"
                         + (f"Reference section: {bible}\n" if bible else "")
                         + f"Tags: {', '.join(d.get('tags', []))}"))
    # micro-app-ideas.json: real one-file experiments, including the files each
    # one produced — the scaffolding half of "app templates".
    ideas = _jload(ROOT / "data" / "micro-app-ideas.json")
    if isinstance(ideas, list):
        for idea in ideas:
            if not isinstance(idea, dict):
                continue
            purpose = str(idea.get("purpose") or "").strip()
            if not purpose:
                continue
            files = idea.get("files") or []
            rows.append((f"A VACA micro-app: {purpose}",
                         f"Purpose: {purpose}\nDesign: {idea.get('design', '')}\n"
                         f"Focus: {idea.get('focus', '')}\n"
                         f"Node type: {idea.get('nodeType', '')}\n"
                         f"Files generated: "
                         + ", ".join(str(f) for f in files)[:600]
                         + f"\nExport dir: {idea.get('exportsDir', '')}\n"
                         f"Metrics: {json.dumps(idea.get('metrics') or {})}\n"
                         f"Verdict: {json.dumps(idea.get('verdict'))[:400]}"))
    return _rows(rows, "app_templates",
                 "component-manifest (appTypes/hybrids/selectionGuide) + library/02,04 "
                 "+ design-specs-v2 + micro-app-ideas")


def mine_codegen_rules() -> list:
    rows = []
    for name in ("03-code-generation-rules.md", "05-design-patterns.md",
                 "06-data-flow-patterns.md", "07-node-implementation-guide.md"):
        text = _read(ROOT / "data" / "library" / name)
        for head, body in _md_sections(text):
            rows.append((f"VACA code generation rule — {head}", body))
    pats = _jload(ROOT / "backend" / "knowledge" / "patterns.json")
    if isinstance(pats, list):
        for p in pats:
            if not isinstance(p, dict):
                continue
            title = p.get("title") or p.get("category")
            code = p.get("code") or p.get("description")
            if title and code:
                rows.append((f"Show the verified VACA pattern `{title}`.", code))
    # The rest of the reference library — 44 guides, each section worth teaching.
    covered = {"03-code-generation-rules.md", "05-design-patterns.md",
               "06-data-flow-patterns.md", "07-node-implementation-guide.md"}
    for f in sorted((ROOT / "data" / "library").glob("*.md")):
        if f.name in covered:
            continue
        for head, body in _md_sections(_read(f)):
            rows.append((f"VACA reference library ({f.stem}) - {head}", body))
    return _rows(rows, "codegen_rules",
                 "data/library/* (all 44) + backend/knowledge/patterns.json")


def mine_pipeline() -> list:
    """Mined from the real source, so the model learns actual stage/error names."""
    rows = []
    fg = _read(ROOT / "backend" / "src" / "layers" / "fileGenerator.ts")
    if fg:
        rows.append(("Explain the node-per-file contract of VACA's FileGenerator.", fg[:SAMPLE_CHARS]))
        codes = sorted(set(re.findall(r"TS\d{4}", fg)))
        if codes:
            rows.append(("Which TypeScript error codes does VACA's compile gate repair deterministically?",
                         "Handled by the deterministic fixer chain: " + ", ".join(codes)))
    fixers = _read(ROOT / "backend" / "src" / "ai" / "deterministicFixers.ts")
    if fixers:
        names = re.findall(r"export (?:async )?function (\w+)", fixers)
        if names:
            rows.append(("List VACA's deterministic fixers and what each fixes.",
                         "\n".join(f"- `{n}`" for n in names)))
        rows.append(("Why does VACA prefer deterministic fixes before calling the LLM to repair code?",
                     fixers[:SAMPLE_CHARS]))
    for f in sorted((ROOT / "data" / "library").glob("*.md")):
        if f.name.startswith(("08-", "11-")):
            for head, body in _md_sections(_read(f)):
                rows.append((f"VACA build/testing concern — {head}", body))
    # The pipeline's own quality gates, as measured rather than described.
    # (These are pipeline stages, not export artifacts — keep them here.)
    fidelity = _jload(ROOT / "data" / "blueprint-fidelity-validation.json")
    if isinstance(fidelity, dict) and fidelity.get("overall_ok_rate_pct") is not None:
        rows.append(("How does VACA score blueprint fidelity, and what are the gate rates?",
                     json.dumps({k: v for k, v in fidelity.items() if k != "cases"},
                                indent=2, ensure_ascii=False)))
        rows.append(("What does a VACA blueprint-fidelity validation case look like?",
                     json.dumps((fidelity.get("cases") or [])[:2], indent=2,
                                ensure_ascii=False)[:SAMPLE_CHARS]))
    probe = _jload(ROOT / "data" / "quality-probe-round6.json")
    if isinstance(probe, dict) and probe:
        rows.append(("What does VACA's quality probe measure about a served student?",
                     json.dumps({k: v for k, v in probe.items() if k != "blueprint_detail"},
                                indent=2, ensure_ascii=False)))
    # End-to-end build evidence: one probe = one real request pushed all the way
    # through blueprint -> codegen -> tsc -> repair -> export.
    one = _jload(ROOT / "data" / "one-shot-probe.json")
    if isinstance(one, dict) and one:
        rows.append(("What does a VACA end-to-end build probe record about a request?",
                     json.dumps(one, indent=2, ensure_ascii=False)[:SAMPLE_CHARS]))
    vt = _jload(ROOT / "data" / "verify-tester-findings.json")
    if isinstance(vt, dict) and vt:
        rows.append(("What does VACA's verify-tester measure about a finished build?",
                     json.dumps(vt, indent=2, ensure_ascii=False)))
    # The rest of the engine, module by module.
    for sub in ("blueprint", "layers", "utils", "ai"):
        for name, src in _ts_modules(ROOT / "backend" / "src" / sub):
            facts = _module_facts(src, 20)
            if facts:
                rows.append((f"How does VACA's `{sub}/{name}` work?", facts))
    for p in sorted((ROOT / "backend" / "src" / "services").glob("*.ts")) \
            if (ROOT / "backend" / "src" / "services").is_dir() else []:
        if p.name.endswith(".test.ts"):
            continue
        rows.append((f"What service does VACA's `services/{p.name}` provide?",
                     f"{_ts_header(_read(p))}\n\nExports: {', '.join(_ts_exports(_read(p))[:20])}"))
    # The remaining engine subsystems, so the pipeline is not just its
    # blueprint/ai halves: storage, search, review, sandboxing, monitoring.
    for sub in ("database", "db", "monitor", "neural", "review", "sandbox",
                "scanner", "search", "scripts", "shared", "socket", "tools"):
        for name, src in _ts_modules(ROOT / "backend" / "src" / sub):
            facts = _module_facts(src, 20)
            if facts:
                rows.append((f"How does VACA's `{sub}/{name}` work?", facts))
    # Top-level backend modules that are not inside a subsystem folder.
    for name in ("index.ts", "librarian.ts", "types.ts"):
        src = _read(ROOT / "backend" / "src" / name)
        facts = _module_facts(src)
        if src and facts:
            rows.append((f"What does VACA's top-level backend module `{name}` do?", facts))
    return _rows(rows, "build_pipeline",
                 "backend/src/** (layers,ai,blueprint,utils,services,database,search,sandbox,review,...)")


def mine_knowledge() -> list:
    rows = []
    for name in ("patterns.json", "sheet-meta.json"):
        p = ROOT / "backend" / "knowledge" / name
        if p.exists():
            rows.append((f"What lives in VACA's knowledge store file `{name}`?",
                         _read(p)[:SAMPLE_CHARS]))
    # The knowledge modules, each with its header comment and exports.
    for name, src in _ts_modules(ROOT / "backend" / "src" / "knowledge"):
        facts = _module_facts(src, 40)
        if facts:
            rows.append((f"How does VACA's knowledge module `{name}` work?", facts))
        rows.append((f"Explain VACA's `{name}` in the learning pipeline.",
                     f"{_ts_header(src)}\n\n{src[:SAMPLE_CHARS]}"))
    # auto-learn: what VACA actually recorded while being used.
    al = ROOT / "backend" / "knowledge" / "auto-learn"
    interactions = sorted(al.glob("interactions-*.jsonl")) if al.is_dir() else []
    if interactions:
        total = sum(_count(f) for f in interactions)
        rows.append(("What does VACA's auto-learn store capture, and where does it live?",
                     f"{len(interactions)} interaction files under backend/knowledge/auto-learn, "
                     f"{total} recorded interactions. Each line is a real interaction VACA "
                     "observed and can turn into a reusable pattern via the learning engine."))
        for f in interactions[:30]:
            first = next((ln for ln in _read(f).splitlines() if ln.strip()), "")
            if first:
                rows.append((f"What does one recorded VACA interaction look like ({f.name})?",
                             first[:SAMPLE_CHARS]))
    meta = _read(al / "auto-learn-state.json") if al.is_dir() else ""
    if meta:
        rows.append(("What state does VACA's auto-learn keep between runs?", meta[:SAMPLE_CHARS]))
    # The in-repo learned model (stored gzipped) — VACA keeps its own tiny
    # char-level net in the knowledge store.
    rnn = _jload(ROOT / "backend" / "knowledge" / "rnn-model.json")
    if isinstance(rnn, dict) and rnn.get("model"):
        cfg = (rnn.get("model") or {}).get("config", {})
        rows.append(("What learned model does VACA keep in its own knowledge store?",
                     "backend/knowledge/rnn-model.json holds a char-level RNN trained by the "
                     f"repo itself: vocab {cfg.get('vocabSize')}, hidden {cfg.get('hiddenSize')}, "
                     f"seq {cfg.get('seqLength')}, lr {cfg.get('learningRate')}, "
                     f"{rnn.get('trainedChars')} chars trained, saved {rnn.get('savedAt')}."))
        rows.append(("Which hyperparameters does VACA's in-repo learned model use?",
                     json.dumps(cfg, indent=2)))
    # capture-log: the raw intake of the knowledge pipeline.
    cap = ROOT / "backend" / "knowledge" / "capture-log.jsonl"
    ncap = _count(cap)
    if ncap:
        rows.append(("What is VACA's knowledge capture log, and what goes into it?",
                     f"backend/knowledge/capture-log.jsonl, {ncap} recorded entries. Each line is "
                     "a candidate knowledge item (code or conversation text plus tags) that the "
                     "learning engine can promote into a reusable pattern."))
        for ln in [ln for ln in _read(cap).splitlines() if ln.strip()][:20]:
            rows.append(("Show one entry VACA captured into its knowledge log.", ln))
    # The code bible's index: what the knowledge store can look up by id.
    bible = _jload(ROOT / "data" / "code-bible-existing-index.json")
    if isinstance(bible, dict) and bible.get("ids") is not None:
        ids = bible["ids"]
        rows.append(("What is VACA's code-bible index, and how many entries does it hold?",
                     f"data/code-bible-existing-index.json indexes {len(ids)} ids — the reference "
                     "entries the knowledge store can resolve by id."))
        rows.append(("Which ids does VACA's code-bible index expose?",
                     ", ".join(str(i) for i in list(ids)[:80])))
    # The micro-app experiment loop: VACA generating and testing ideas itself.
    exp = _jload(ROOT / "data" / "micro-experiment-state.json")
    if isinstance(exp, dict) and exp:
        rows.append(("What is VACA's micro-app experiment loop, and where does it stand?",
                     json.dumps(exp, indent=2, ensure_ascii=False)))
    # What the auto-learn corpus is actually made of.
    if interactions:
        nodes: dict[str, int] = {}
        langs: dict[str, int] = {}
        for f in interactions:
            for ln in _read(f).splitlines():
                if not ln.strip():
                    continue
                try:
                    rec = json.loads(ln)
                except json.JSONDecodeError:
                    continue
                nodes[rec.get("nodeType", "?")] = nodes.get(rec.get("nodeType", "?"), 0) + 1
                langs[rec.get("language", "?")] = langs.get(rec.get("language", "?"), 0) + 1
        if nodes:
            rows.append(("How is VACA's auto-learn corpus distributed by node type?",
                         "\n".join(f"- {k}: {v}" for k, v in sorted(nodes.items(), key=lambda kv: -kv[1]))))
        if langs:
            rows.append(("How is VACA's auto-learn corpus distributed by language?",
                         "\n".join(f"- {k}: {v}" for k, v in sorted(langs.items(), key=lambda kv: -kv[1]))))
    for name in ("mindspace_server.py", "micro-mentor-desktop.sh"):
        src = _read(ROOT / "backend" / "scripts" / name)
        if src:
            rows.append((f"What does VACA's `{name}` provide for learning?", src[:SAMPLE_CHARS]))
    # The scripts that actually feed learning: reward loop and seed harvesting.
    for name in ("reward-loop.ts", "seed-training-data.py", "scrape-uiverse-patterns.ts",
                 "dump-micro-references.ts", "_check_seed_quality.ts"):
        src = _read(ROOT / "backend" / "scripts" / name)
        if src:
            rows.append((f"How does VACA's learning-pipeline script `{name}` work?",
                         f"{_ts_header(src)}\n\n{src[:1600]}"))
    # The retrieval index behind knowledge lookup, and the library embeddings.
    rag = _jload(ROOT / "data" / "rag-index.json")
    if isinstance(rag, dict) and rag.get("dim") is not None:
        srcs = rag.get("sources")
        # `sources` is a {name: count} mapping, but tolerate a list too so a
        # future re-export does not silently kill the whole miner again.
        if isinstance(srcs, dict):
            src_lines = [f"- {k}: {v} entries" for k, v in list(srcs.items())[:40]]
        elif isinstance(srcs, list):
            src_lines = [f"- {s if isinstance(s, str) else json.dumps(s)}" for s in srcs[:40]]
        else:
            src_lines = []
        rows.append(("What does VACA's RAG index contain, and what is it for?",
                     f"data/rag-index.json: dim {rag.get('dim')}, "
                     f"{rag.get('total')} vectors over {len(srcs or [])} sources, "
                     f"generated {rag.get('generatedAt')}. It backs retrieval of reference "
                     "knowledge during generation rather than putting it all in the prompt."))
        if src_lines:
            rows.append(("Which sources feed VACA's RAG index?", "\n".join(src_lines)))
    emb = _jload(ROOT / "data" / "library-embeddings.json")
    if isinstance(emb, dict) and emb.get("count"):
        rows.append(("How is VACA's reference library embedded for retrieval?",
                     f"data/library-embeddings.json: {emb.get('count')} embedded sheets at dim "
                     f"{emb.get('dim')}, generated {emb.get('generatedAt')}."))
        sheets = emb.get("sheets")
        if isinstance(sheets, list) and sheets:
            rows.append(("Which reference sheets are embedded in VACA's library index?",
                         "\n".join(f"- {s.get('id')}: {s.get('title')}"
                                   for s in sheets if isinstance(s, dict))))
    # What a recorded interaction carries, and the pattern store's real shape.
    if interactions:
        first = next((ln for ln in _read(interactions[0]).splitlines() if ln.strip()), "")
        try:
            fields = list(json.loads(first))
        except (json.JSONDecodeError, TypeError):
            fields = []
        if fields:
            rows.append(("What fields does one recorded VACA interaction carry?",
                         ", ".join(fields)))
    pats_all = _jload(ROOT / "backend" / "knowledge" / "patterns.json")
    if isinstance(pats_all, list) and pats_all:
        rows.append(("What fields does a stored VACA pattern carry?",
                     ", ".join(sorted({k for p in pats_all if isinstance(p, dict)
                                       for k in p}))))
    # LLM-ops guide: how the platform around the model is measured and run.
    for head, body in _md_sections(
            _read(ROOT / "data" / "library" / "34-llm-ops-platform-engineering.md")):
        rows.append((f"VACA LLM ops and platform engineering — {head}", body))
    return _rows(rows, "knowledge_learning",
                 "backend/src/knowledge/* + backend/knowledge (patterns, capture-log, "
                 "rnn-model, auto-learn) + backend/scripts learning pipeline + "
                 "data/rag-index|library-embeddings + library/34")


def mine_export() -> list:
    rows = []
    for name in ("perFileScaffolder.ts", "placeholderFiles.ts"):
        p = ROOT / "backend" / "src" / "export" / name
        if p.exists():
            rows.append((f"How does VACA's export step work (`{name}`)?", _read(p)[:SAMPLE_CHARS]))
    for head, body in _md_sections(_read(ROOT / "data" / "library" / "09-deployment-templates.md")):
        rows.append((f"VACA deployment template — {head}", body))
    for name, src in _ts_modules(ROOT / "backend" / "src" / "export"):
        facts = _module_facts(src, 40)
        if facts:
            rows.append((f"How does VACA's export module `{name}` work?", facts))
    route = _read(ROOT / "backend" / "src" / "routes" / "export.ts")
    if route:
        rows.append(("What does VACA's export API endpoint do, and what does it return?",
                     f"{_ts_header(route)}\n\n{route[:SAMPLE_CHARS]}"))
    # A real finished export teaches the target layout better than any guide.
    ex = ROOT / "backend" / "exports"
    if ex.is_dir():
        for app_dir in sorted(d for d in ex.iterdir() if d.is_dir())[:3]:
            files = []
            for root, _dirs, names in os.walk(app_dir):
                rel = os.path.relpath(root, app_dir)
                for n in names:
                    files.append(os.path.join(rel, n) if rel != "." else n)
                if len(files) > 60:
                    break
            if files:
                rows.append((f"What files does a finished VACA build contain (app `{app_dir.name}`)?",
                             "\n".join(sorted(files)[:60])))
    for head, body in _md_sections(_read(ROOT / "data" / "library" / "10-cicd-configuration.md")):
        rows.append((f"VACA CI/CD configuration - {head}", body))
    # Real exported apps in apps/: what a finished VACA delivery actually looks
    # like on disk, which is the most concrete statement of the export target.
    apps_dir = ROOT / "apps"
    if apps_dir.is_dir():
        for d in sorted(p for p in apps_dir.iterdir() if p.is_dir()):
            files = sorted(
                os.path.relpath(os.path.join(root, n), d)
                for root, _dirs, names in os.walk(d) for n in names
            )
            if not files:
                continue
            rows.append((f"What files does the exported VACA app `{d.name}` contain?",
                         "\n".join(files[:60])))
            # How each app is launched, from its own docs/entrypoint.
            for entry in ("README.md", "main.py", "index.html", "package.json"):
                src = _read(d / entry)
                if src:
                    rows.append((f"How is the exported VACA app `{d.name}` run ({entry})?",
                                 src[:SAMPLE_CHARS]))
                    break
    return _rows(rows, "export_deploy",
                 "backend/src/export/* + routes/export.ts + backend/exports + apps/* + library/09,10")


def mine_operations() -> list:
    rows = []
    routes = sorted(p.stem for p in (ROOT / "backend" / "src" / "routes").glob("*.ts")
                    if not p.name.endswith(".test.ts"))
    if routes:
        rows.append(("Which API route modules does the VACA backend expose?",
                     "\n".join(f"- /api/{r}" for r in routes)))
    pkg = _jload(ROOT / "package.json") or {}
    if pkg.get("scripts"):
        rows.append(("How do you run the VACA app and its backend in development?",
                     json.dumps(pkg["scripts"], indent=2)))
    for name in ("Makefile", "README.md"):
        p = ROOT / name
        if p.exists():
            rows.append((f"What does VACA's `{name}` describe?", _read(p)[:SAMPLE_CHARS]))
    rows.append(("How is the VACA student model trained and served?",
                 "Student: 4-bit QLoRA on Qwen2.5-Coder-14B sharded across 2x RTX 3060, served "
                 "OpenAI-compatibly for play. Judge: Gemma-4-12B on the second box. Loop: "
                 "PLAY -> AUDIT -> CORPUS -> TRAIN -> EXPORT/REDEPLOY (training/selfplay)."))
    # How VACA is actually run: the model server, the app launcher, the ports.
    for name, q in (("scripts/start-dspark.sh",
                     "How is VACA's student model server (dspark) started, on which port and context?"),
                    ("scripts/vaca-start.sh", "How is the whole VACA app started up?"),
                    ("scripts/start-fast-coders.sh", "What do VACA's fast-code helper servers do?")):
        src = _read(ROOT / name)
        if src:
            rows.append((q, src[:SAMPLE_CHARS]))
    # Concrete run facts, gathered rather than asserted.
    ports, envs = set(), set()
    for name in ("scripts/start-dspark.sh", "scripts/vaca-start.sh", "Makefile",
                 "backend/src/index.ts", "frontend/vite.config.ts"):
        src = _read(ROOT / name)
        ports |= set(re.findall(r"\b(?:PORT|port)\W{0,6}(\d{3,5})", src))
        envs |= set(re.findall(r"\b([A-Z][A-Z0-9_]{3,})\b", src))
    if ports:
        rows.append(("Which ports does VACA use for its services?",
                     "Ports referenced in the launch scripts and configs: "
                     + ", ".join(sorted(ports))))
    if envs:
        rows.append(("Which environment variables control how VACA runs?",
                     ", ".join(sorted(envs)[:40])))
    rows.append(("How do you check that VACA's backend is healthy?",
                 "The backend exposes GET /health and GET /api/health. The health route also "
                 "probes the configured LLM endpoint, so it reports model availability, not "
                 "just that Express is listening."))
    # Every backend route module — this is VACA's whole public surface.
    for name, src in _ts_modules(ROOT / "backend" / "src" / "routes"):
        facts = _module_facts(src, 20)
        if facts:
            rows.append((f"What does VACA's `/api/{name}` route module do?", facts))
    for sub in ("tools", "tools/permissions"):
        for name, src in _ts_modules(ROOT / "backend" / "src" / sub):
            facts = _module_facts(src, 20)
            if facts:
                rows.append((f"What does VACA's `{sub}/{name}` do?", facts))
    for f in sorted((ROOT / "scripts").glob("*.sh"))[:18]:
        src = _read(f)
        if src:
            rows.append((f"What does VACA's `scripts/{f.name}` do?", f"{_ts_header(src)}\n\n{src[:700]}"))
    return _rows(rows, "operations",
                 "routes + tools + scripts + package.json + Makefile")


def mine_troubleshooting() -> list:
    rows = []
    for name in ("VACA_BUILD_TRIAGE.md", "NEXT_SESSION.md", "VACA_SCAN_REPORT.md",
                 "EVALUATION_REPORT.md", "TOOL_VALIDATION_REPORT.md"):
        p = ROOT / name
        if not p.exists():
            continue
        text = _read(p)
        for head, body in _md_sections(text):
            rows.append((f"VACA troubleshooting — {head}", body))
        if not _md_sections(text):
            rows.append((f"What does `{name}` say about VACA's current state and known issues?",
                         text[:SAMPLE_CHARS]))
    return _rows(rows, "troubleshooting", "root reports (triage, evaluations, NEXT_SESSION)")


MINERS = {
    "identity_role": mine_identity,
    "canvas_nodes": mine_canvas,
    "blueprint": mine_blueprints,
    "app_templates": mine_app_templates,
    "codegen_rules": mine_codegen_rules,
    "build_pipeline": mine_pipeline,
    "knowledge_learning": mine_knowledge,
    "export_deploy": mine_export,
    "operations": mine_operations,
    "troubleshooting": mine_troubleshooting,
}


# ── build / report ───────────────────────────────────────────────────────────
def dedupe(rows: list) -> list:
    """One row per instruction, keeping the first.

    SFT cannot learn from a prompt with contradictory answers, so a repeated
    instruction wins only once. Sources overlap heavily (`Design X` appears in
    both designs.json and the manifest), which is why this runs globally after
    all facets are collected rather than per miner.
    """
    seen, out = set(), []
    for r in rows:
        if r["instruction"] in seen:
            continue
        seen.add(r["instruction"])
        out.append(r)
    return out


def build(max_per_facet: int = 600) -> tuple[list, dict, dict]:
    corpus: list = []
    failures: dict[str, str] = {}
    for facet, fn in MINERS.items():
        try:
            rows = dedupe(fn())[:max_per_facet]
        except Exception as e:                                   # noqa: BLE001
            # A crash here yields 0 rows, which is indistinguishable from a
            # facet whose sources are genuinely thin — so record it and surface
            # it in the report instead of letting it read as "needs more
            # material". (This is how a bogus slice once zeroed 80 rows.)
            print(f"  !! miner {facet} CRASHED: {type(e).__name__}: {e}")
            failures[facet] = f"{type(e).__name__}: {e}"
            rows = []
        corpus.extend(rows)
    before = len(corpus)
    corpus = dedupe(corpus)
    # Trim over-target facets so one bloated source cannot swamp the training
    # mix (blueprint had 400 rows vs 5 for operations before this).
    kept, trimmed = [], {}
    seen_per_facet: dict[str, int] = {f: 0 for f in MINERS}
    for r in corpus:
        f = r["facet"]
        cap = FACETS.get(f, {}).get("target_rows", 10 ** 9)
        if seen_per_facet[f] >= cap:
            trimmed[f] = trimmed.get(f, 0) + 1
            continue
        seen_per_facet[f] += 1
        kept.append(r)
    corpus = kept
    per_facet = {f: n for f, n in seen_per_facet.items()}
    for facet, n in per_facet.items():
        tgt = FACETS.get(facet, {}).get("target_rows", 0)
        mark = "" if n >= tgt else f"   (short of {tgt})"
        print(f"  {facet:20s} {n:5d} rows{mark}")
    if before != len(corpus):
        print(f"  (dropped {before - len(corpus)} duplicates / over-target rows)")
    if trimmed:
        print("  trimmed to target: " + ", ".join(
            f"{f}-{n}" for f, n in sorted(trimmed.items())))
    if failures:
        print(f"  !! {len(failures)} miner(s) crashed — their facets are NOT thin, "
              "they are broken:")
        for facet, err in failures.items():
            print(f"       {facet}: {err}")
    return corpus, per_facet, failures


def coverage(per_facet: dict[str, int]) -> dict:
    total = sum(per_facet.values()) or 1
    out = {}
    for facet, meta in FACETS.items():
        have = per_facet.get(facet, 0)
        target = meta["target_rows"]
        out[facet] = {
            "rows": have,
            "target_rows": target,
            "share_pct": round(100.0 * have / total, 1),
            "ratio_vs_target": round(have / target, 2) if target else 0.0,
            "desc": meta["desc"],
        }
    return out


def write(corpus: list, out_base: Path) -> None:
    out_base.parent.mkdir(parents=True, exist_ok=True)
    with out_base.open("w", encoding="utf-8") as f, \
         out_base.with_suffix(".meta.jsonl").open("w", encoding="utf-8") as m:
        for r in corpus:
            f.write(json.dumps({"instruction": r["instruction"], "input": r["input"],
                                "output": r["output"]}, ensure_ascii=False) + "\n")
            m.write(json.dumps({"facet": r["facet"], "source": r["source"]},
                               ensure_ascii=False) + "\n")


def report(per_facet: dict[str, int], corpus: list, out_base: Path,
           failures: dict[str, str] | None = None) -> dict:
    cov = coverage(per_facet)
    starved = [f for f, v in cov.items() if v["ratio_vs_target"] < 0.5]
    # After the per-facet trim, no facet can exceed its target, so dominance has
    # to be judged by SHARE: an even spread would be 100/len(FACETS) each.
    even = 100.0 / max(len(FACETS), 1)
    dom = [f for f, v in cov.items() if v["share_pct"] > 2 * even]
    data = {
        "rows": len(corpus),
        "facets": cov,
        "starved_facets": starved,
        "overrepresented_facets": dom,
        "failed_miners": failures or {},
        "coverage_score": round(
            100.0 * sum(min(v["ratio_vs_target"], 1.0) for v in cov.values()) / len(cov), 1),
    }
    md = [f"# VACA domain corpus coverage",
          "", f"- rows: **{len(corpus)}**",
          f"- coverage score: **{data['coverage_score']}%** "
          f"(each facet counts fully once it reaches its target row count)",
          "", "| facet | rows | target | vs target | share |", "|---|---|---|---|---|"]
    for f, v in sorted(cov.items(), key=lambda kv: kv[1]["ratio_vs_target"]):
        flag = " ⚠️" if v["ratio_vs_target"] < 0.5 else (
            " ⬆" if v["share_pct"] > 2 * even else "")
        md.append(f"| `{f}`{flag} | {v['rows']} | {v['target_rows']} | "
                  f"{v['ratio_vs_target']}x | {v['share_pct']}% |")
    if failures:
        md += ["", "**⚠️ Miners that CRASHED (0 rows — a bug, not missing material):**"]
        md += [f"- `{f}`: {e}" for f, e in failures.items()]
    if starved:
        md += ["", f"**Starved (needs more source material):** {', '.join(starved)}"]
    if dom:
        md += ["", f"**Overrepresented:** {', '.join(dom)}"]
    (out_base.with_suffix(".coverage.md")).write_text("\n".join(md) + "\n", encoding="utf-8")
    out_base.with_suffix(".coverage.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def self_test() -> int:
    """Prove the corpus can never teach the model to BE the scaffolder.

    The guarantee is structural: `_rows()` — the single choke point every miner
    passes through — drops any instruction matching SCAFFOLD_INSTRUCTION_RE. This
    builds the corpus and asserts the guarantee holds, so a future miner that
    emits a "design the app" row fails here instead of silently re-teaching the
    behaviour that was removed (2026-10-02). No pytest dependency.
    """
    corpus, _per_facet, _failures = build(max_per_facet=600)
    leaked = [r["instruction"] for r in corpus if SCAFFOLD_INSTRUCTION_RE.search(r["instruction"])]
    if leaked:
        for ins in leaked[:10]:
            print(f"  ✗ scaffold row leaked into the corpus: {ins!r}")
        print(f"[vaca_domain] self-test FAILED — {len(leaked)} scaffolding row(s) in the corpus")
        return 1
    print(f"[vaca_domain] self-test OK — {len(corpus)} rows, 0 scaffolding rows")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the VACA domain corpus")
    ap.add_argument("--out", default=str(ROOT / "training" / "selfplay" / "corpus" / "vaca-domain.jsonl"))
    ap.add_argument("--max-per-facet", type=int, default=600)
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--self-test", action="store_true",
                    help="assert the corpus teaches VACA, not scaffolding, and exit")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    out = Path(args.out)

    print("Mining VACA domain knowledge…")
    corpus, per_facet, failures = build(args.max_per_facet)
    if not args.report_only:
        write(corpus, out)
        print(f"\nwrote {len(corpus)} rows -> {out}")
        print(f"metadata  -> {out.with_suffix('.meta.jsonl')}")
    data = report(per_facet, corpus, out, failures)
    print(f"\ncoverage score: {data['coverage_score']}%")
    for f in data["starved_facets"]:
        print(f"  ⚠️  starved: {f}")
    for f in failures:
        print(f"  ‼️  miner crashed: {f}")
    print(f"report -> {out.with_suffix('.coverage.md')}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
