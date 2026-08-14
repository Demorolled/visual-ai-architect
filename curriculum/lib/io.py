"""Tiny IO helpers shared by every pipeline stage."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path


def did(directory: Path, stage: str) -> Path:
    """Progress marker: stages skip work whose key is already recorded here."""
    return directory / f"{stage}-done.json"


def mark_done(directory: Path, stage: str, key: str) -> None:
    p = did(directory, stage)
    d = {}
    if p.exists():
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            d = {}
    d[key] = True
    p.write_text(json.dumps(d), encoding="utf-8")


def is_done(directory: Path, stage: str, key: str) -> bool:
    p = did(directory, stage)
    if not p.exists():
        return False
    try:
        return json.loads(p.read_text(encoding="utf-8")).get(key, False)
    except json.JSONDecodeError:
        return False


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def obj_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]


def norm(s: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def chunk_text(text: str, size: int = 6000) -> list[str]:
    """Split text into ~size-char chunks on paragraph/line boundaries."""
    if len(text) <= size:
        return [text] if text.strip() else []
    chunks, buf = [], []
    chars = 0
    for para in text.split("\n"):
        buf.append(para)
        chars += len(para) + 1
        if chars >= size:
            chunks.append("\n".join(buf))
            buf, chars = [], 0
    if buf:
        chunks.append("\n".join(buf))
    return [c for c in chunks if c.strip()]


def corpus_files(cfg: dict) -> list[Path]:
    """Resolve the configured corpus into a concrete file list."""
    files: list[Path] = []
    seen = set()
    exts = set(cfg.get("extensions", [".md", ".ts", ".py", ".json", ".yaml"]))
    exclude = cfg.get("exclude", ["node_modules", "dist", "out", ".git"])
    max_bytes = cfg.get("max_bytes_per_file", 200_000)

    for raw in cfg.get("files", []):
        p = Path(raw)
        if p.exists():
            files.append(p)
            seen.add(str(p.resolve()))
    for d in cfg.get("dirs", []):
        root = Path(d)
        if not root.is_dir():
            continue
        candidates = sorted(
            (p for p in root.rglob("*") if p.is_file() and p.suffix in exts),
            key=lambda p: p.stat().st_size, reverse=True)
        for p in candidates[: cfg.get("max_files_per_dir", 40)]:
            if str(p.resolve()) in seen:
                continue
            seen.add(str(p.resolve()))
            files.append(p)
    result = []
    for p in files:
        if any(part in exclude for part in p.parts):
            continue
        try:
            if p.stat().st_size > max_bytes:
                continue
        except OSError:
            continue
        result.append(p)
    return result
