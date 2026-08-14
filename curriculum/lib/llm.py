"""LLM clients for the curriculum engine.

Teacher = a powerful local model (e.g. qwen3.6:27b) that reads the app corpus,
builds the dictionary, writes tests and judges answers.
Student = the model being tested/trained (e.g. the tuned qwen2.5-7b on dspark).

Call patterns are the PROVEN ones from scripts/build-round8-code-dataset.py:
  - teacher: native POST {base}/api/chat with think:false + stream:false
    (the OpenAI-compatible /v1/chat/completions IGNORES think:false and
     returns empty content for reasoning models — verified twice).
  - student: OpenAI-compatible POST {base}/v1/chat/completions.
"""
from __future__ import annotations

import json
import re
import time
import urllib.request


def _post_json(base_url: str, path: str, payload: dict, timeout: int,
               retries: int = 2) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url + path, data=body, headers={"Content-Type": "application/json"})
    last = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 — network/server hiccups
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{path} failed after {retries + 1} tries: {last}")


def teacher_reply(messages: list[dict], model: str, base_url: str,
                  temperature: float = 0.4, max_tokens: int = 1500,
                  num_ctx: int = 4096, timeout: int = 300,
                  format_json: bool = False) -> str:
    """One teacher call (Ollama /api/chat, think disabled). Returns text.

    format_json=True sends Ollama's `format: "json"` (llama.cpp grammar) so the
    reply is GUARANTEED parseable — small models otherwise stop mid-JSON
    (verified: gemma4 truncates without it, never does with it).
    """
    payload = {
        "model": model,
        "messages": messages,
        "think": False,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
            # num_ctx 8192 wedges llama-server on the dual-RTX3060 rig; 4096
            # is the verified-stable context window for tight prompts.
            "num_ctx": num_ctx,
        },
    }
    if format_json:
        payload["format"] = "json"
    data = _post_json(base_url, "/api/chat", payload, timeout=timeout)
    return (data.get("message", {}).get("content") or "").strip()


def student_reply(messages: list[dict], model: str, base_url: str,
                  temperature: float = 0.3, max_tokens: int = 900,
                  timeout: int = 240) -> str:
    """One student call (OpenAI-compatible). Returns text."""
    data = _post_json(base_url, "/v1/chat/completions", {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }, timeout=timeout)
    choices = data.get("choices") or [{}]
    return (choices[0].get("message", {}).get("content") or "").strip()


def teacher_json(messages: list[dict], model: str, base_url: str,
                 temperature: float = 0.2, max_tokens: int = 2000,
                 num_ctx: int = 4096, retries: int = 3) -> object | None:
    """Teacher call expecting JSON; retries on parse failure. Returns payload or None.

    The 12B teacher is deterministic-enough with think:false + format:json
    (~100% on short outputs) but occasionally truncates long outputs — a retry
    with a fresh generation is cheap insurance.
    """
    for attempt in range(retries):
        try:
            reply = teacher_reply(messages, model, base_url,
                                  temperature=temperature, max_tokens=max_tokens,
                                  num_ctx=num_ctx, format_json=True)
        except Exception as e:  # noqa: BLE001
            print(f"  ! teacher call failed (attempt {attempt + 1}): {e}")
            continue
        data = extract_json(reply)
        if data is not None:
            return data
        print(f"  ! unparseable JSON (attempt {attempt + 1}/{retries}, {len(reply)} chars)")
    return None


def extract_json(text: str):
    """Best-effort JSON parse of an LLM reply (handles fences + prose).

    The 12B teacher sometimes wraps its chain-of-thought inside the JSON
    ({"thought": "...", then the real payload) — so prefer the array slice
    when present, then the object slice, then the full text.
    """
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"^```[a-zA-Z0-9+#.-]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    candidates = [t]
    if "[" in t:
        candidates.append(t[t.find("["):t.rfind("]") + 1])
    if "{" in t:
        candidates.append(t[t.find("{"):t.rfind("}") + 1])
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def as_list(data):
    """Normalize a JSON payload into a list (unwrap dict-wrapped arrays)."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("tests", "items", "ladder", "questions", "results", "verdicts", "entries"):
            v = data.get(key)
            if isinstance(v, list):
                return v
    return None
