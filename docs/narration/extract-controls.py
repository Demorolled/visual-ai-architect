#!/usr/bin/env python3
"""
extract-controls.py — mechanical inventory of every interactive control in the
VACA frontend.

Why this exists: the narration track for the demo video is keyed by the *control*
the viewer hovers. Eyeballing 326 <button>s across 40 components is how you get a
map that silently misses half of them, so the inventory is parsed, not guessed.

Usage:
    python3 extract-controls.py [--root frontend/src] [--json out.json] [--md out.md]

Output per control: file, line, tag, className, onClick handler, title,
aria-label, static label text, and any JSX-ternary label variants.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TAG_RE = re.compile(r"<(button|a|select|input)\b")


def scan_opening_tag(src: str, start: int) -> tuple[int, str]:
    """Return (index just past the tag's closing '>', raw tag text).

    Walks the tag respecting {}, (), [] nesting and ', ", ` strings (including
    template literals with ${...}) so a '>' inside an onClick arrow function or
    a string does not truncate the tag.
    """
    i = start
    n = len(src)
    depth = 0
    while i < n:
        c = src[i]
        if c in "'\"`":
            quote = c
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == quote:
                    break
                i += 1
            i += 1
            continue
        if c in "{([":
            depth += 1
        elif c in "})]":
            depth -= 1
        elif c == ">" and depth <= 0:
            return i + 1, src[start : i + 1]
        elif c == "/" and i + 1 < n and src[i + 1] == ">" and depth <= 0:
            return i + 2, src[start : i + 2]
        i += 1
    return n, src[start:]


def attr(tag: str, name: str) -> str | None:
    """Pull a JSX attribute value, respecting nested braces/quotes."""
    m = re.search(rf"(?:^|\s){re.escape(name)}\s*=\s*", tag)
    if not m:
        return None
    i = m.end()
    if i >= len(tag):
        return None
    if tag[i] not in "\"' {":
        return None
    if tag[i] in "\"'":
        quote = tag[i]
        j = tag.find(quote, i + 1)
        return tag[i + 1 : j] if j != -1 else tag[i + 1 :]
    # { ... } expression — balance braces
    depth = 0
    j = i
    while j < len(tag):
        if tag[j] == "{":
            depth += 1
        elif tag[j] == "}":
            depth -= 1
            if depth == 0:
                return tag[i + 1 : j]
        j += 1
    return tag[i + 1 :]


def inner_text(src: str, start: int, tag: str) -> tuple[str, list[str]]:
    """Text between open and matching close tag, plus quoted label variants."""
    end = src.find(f"</{tag}>", start)
    if end == -1:
        return "", []
    raw = src[start:end]
    # Quoted strings inside JSX expressions are almost always label variants
    variants = re.findall(r"'([^'\\]{2,60})'|\"([^\"\\]{2,60})\"", raw)
    variants = [a or b for a, b in variants]
    variants = [v.strip() for v in variants if v.strip() and not v.strip().startswith(("http", "/", "."))]
    text = re.sub(r"\{[^{}]*\}", " ", raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text, variants


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="frontend/src")
    ap.add_argument("--json", default="docs/narration/controls.json")
    ap.add_argument("--md", default="docs/narration/controls.md")
    ap.add_argument("--repo", default=".")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    root = (repo / args.root).resolve()
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 1

    controls = []
    for path in sorted(root.rglob("*.tsx")):
        if "__tests__" in path.parts:
            continue
        src = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(repo))
        for m in TAG_RE.finditer(src):
            tag = m.group(1)
            end, raw = scan_opening_tag(src, m.start())
            if not raw.endswith(">"):
                continue
            self_closing = raw.endswith("/>")
            line = src.count("\n", 0, m.start()) + 1
            label, variants = ("", [])
            if not self_closing:
                label, variants = inner_text(src, end, tag)
            controls.append(
                {
                    "file": rel,
                    "line": line,
                    "tag": tag,
                    "className": attr(raw, "className"),
                    "onClick": attr(raw, "onClick"),
                    "onChange": attr(raw, "onChange"),
                    "title": attr(raw, "title"),
                    "ariaLabel": attr(raw, "aria-label"),
                    "label": label,
                    "labelVariants": variants,
                    "selfClosing": self_closing,
                }
            )

    out_json = repo / args.json
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(controls, indent=1), encoding="utf-8")

    by_file: dict[str, int] = {}
    for c in controls:
        by_file[c["file"]] = by_file.get(c["file"], 0) + 1

    lines = [
        "# VACA frontend control inventory (generated)",
        "",
        f"Total controls: **{len(controls)}** across **{len(by_file)}** files.",
        "",
        "Regenerate: `python3 docs/narration/extract-controls.py`",
        "",
        "| # | file:line | tag | label | onClick | title |",
        "|---|---|---|---|---|---|",
    ]
    for i, c in enumerate(controls, 1):
        def cell(v: str | None, limit: int = 70) -> str:
            if not v:
                return ""
            v = re.sub(r"\s+", " ", v).strip().replace("|", "\\|")
            return v[: limit - 1] + "…" if len(v) > limit else v
        lines.append(
            f"| {i} | `{c['file']}:{c['line']}` | {c['tag']} | {cell(c['label'])} "
            f"| {cell(c['onClick'], 60)} | {cell(c['title'], 60)} |"
        )
    out_md = repo / args.md
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"controls: {len(controls)} in {len(by_file)} files")
    print(f"wrote {out_json}")
    print(f"wrote {out_md}")
    print("\ntop files:")
    for f, n in sorted(by_file.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  {n:3d}  {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
