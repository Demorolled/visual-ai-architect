#!/usr/bin/env python3
"""gguf_to_hf.py — dequantize a GGUF into a trainable HF checkpoint.

Why this exists. The only copy of the model we want to prune is a **Q4_K_M
GGUF** — the file Ollama actually serves. PEFT and bitsandbytes cannot train on
a GGUF: they need dense weights plus a `config.json`, and `--base <gguf>` fails
in a way that looks like a missing model rather than a format problem. So we
dequantize once, in a single streaming pass, and keep the result as fp16
safetensors shards. After that everything downstream — `train`, `negate`,
`eval`, `inspect` — is unchanged, because the output is an ordinary HF model
directory.

Two things this deliberately does NOT do:

  * It does not need the base model downloaded from the Hub. The GGUF carries
    the full config (shape, rope, norm epsilon, vocab) and the tokenizer byte
    strings, so the architecture is rebuilt from the file itself.
  * It does not spool the GGUF to disk. `--stdin` reads the tensor blocks
    straight from a pipe in offset order, so pruning a remote blob costs the
    output size and nothing more:

        ssh host 'sudo cat /path/to/blob' \\
            | python3 -m training.unlearn dequant --stdin --out <dir>

That matters here: the dequantized 14B is ~29.5 GB and the box has ~42 GB free.
Copying the 8.4 GB GGUF first would leave almost no headroom.

On fidelity. Dequantizing a Q4_K_M file gives weights that already carry the
quantization error, and no amount of care removes it — the error is in the file.
That is acceptable *because the operand is the thing being deployed*: the task
vector is subtracted from these weights and the result is what gets served, so
the error is common to both sides. If you want a cleaner base, point this at a
Q8_0 GGUF instead of the Q4 (same code path, ~2x the output size, much smaller
error). It cannot recover the original fp16 — that needs the Hub checkpoint.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]

GGUF_MAGIC = 0x46554747                      # b"GGUF" little-endian
SUPPORTED_VERSIONS = (2, 3)

# GGUF value-type tags. Only the ones a real model file uses are decoded.
_T_STRING, _T_ARRAY = 8, 9
_SCALAR = {0: ("<B", 1), 1: ("<b", 1), 2: ("<H", 2), 3: ("<h", 2), 4: ("<I", 4),
           5: ("<i", 4), 6: ("<f", 4), 7: ("<B", 1), 10: ("<Q", 8), 11: ("<q", 8),
           12: ("<d", 8)}

# Sampling keeps the 152k-entry tokenizer arrays out of memory; the count is
# what the config needs, and the sample is what the tokenizer cross-check reads.
_SAMPLED_PREFIXES = ("tokenizer.",)

# GGUF component name → HF module path. The `blk.N.` prefix and the `.weight` /
# `.bias` suffix are carried across unchanged, so one table covers the whole
# llama/qwen2 dense family.
_BLOCK = {
    "attn_norm":      "input_layernorm",
    "ffn_norm":       "post_attention_layernorm",
    "attn_q":         "self_attn.q_proj",
    "attn_k":         "self_attn.k_proj",
    "attn_v":         "self_attn.v_proj",
    "attn_output":    "self_attn.o_proj",
    "attn_q_norm":    "self_attn.q_norm",
    "attn_k_norm":    "self_attn.k_norm",
    "ffn_gate":       "mlp.gate_proj",
    "ffn_up":         "mlp.up_proj",
    "ffn_down":       "mlp.down_proj",
}
_TOP = {"token_embd": "model.embed_tokens", "output_norm": "model.norm",
        "output": "lm_head"}

# Repos that carry an identical tokenizer for each architecture we can rebuild.
_TOKENIZER_FOR = {"qwen2": "Qwen/Qwen2.5-Coder-14B-Instruct",
                  "qwen3": "Qwen/Qwen3-14B",
                  "llama": "NousResearch/Llama-2-7b-hf"}


class _Arr:
    """A GGUF array reduced to (count, sample) so huge ones stay cheap."""
    __slots__ = ("count", "sample")

    def __init__(self, count: int, sample: list):
        self.count, self.sample = count, sample


class _Reader:
    """Exact-read helper over a possibly non-seekable stream."""

    def __init__(self, fh):
        self.fh, self.pos = fh, 0

    def read(self, n: int) -> bytes:
        b = self.fh.read(n)
        if b is None or len(b) != n:
            raise EOFError(f"wanted {n} bytes at offset {self.pos}, got "
                           f"{0 if b is None else len(b)} — truncated GGUF?")
        self.pos += n
        return b

    def scalar(self, t: int):
        fmt, size = _SCALAR[t]
        return struct.unpack(fmt, self.read(size))[0]

    def string_bytes(self) -> bytes:
        return self.read(struct.unpack("<Q", self.read(8))[0])

    def string(self) -> str:
        return self.string_bytes().decode("utf-8", "replace")

    def value(self, t: int, sample: bool):
        if t == _T_STRING:
            return self.string()
        if t == _T_ARRAY:
            et = struct.unpack("<I", self.read(4))[0]
            n = struct.unpack("<Q", self.read(8))[0]
            # Vocabularies are sampled — nobody needs 152k Python strings — and
            # the samples are kept as raw BYTES, because a byte-level BPE token
            # is very often not valid UTF-8 by itself and decoding with
            # 'replace' would destroy precisely the bytes being compared.
            if sample and et == _T_STRING:
                head = [self.string_bytes() for _ in range(min(n, 24))]
                for _ in range(max(0, n - 24)):
                    self.string_bytes()         # consume without keeping
                return _Arr(n, head)
            if sample:
                head = [self.value(et, False) for _ in range(min(n, 24))]
                for _ in range(max(0, n - 24)):
                    self.value(et, False)       # consume without keeping
                return _Arr(n, head)
            return [self.value(et, False) for _ in range(n)]
        if t not in _SCALAR:
            raise ValueError(f"unknown GGUF value type {t}")
        return self.scalar(t)


def read_header(r: _Reader):
    """Parse the header. Returns (kv, tensors, data_start)."""
    magic = r.scalar(4)
    if magic != GGUF_MAGIC:
        raise ValueError("not a GGUF file (bad magic) — is this the actual blob?")
    version = r.scalar(4)
    if version not in SUPPORTED_VERSIONS:
        raise ValueError(f"unsupported GGUF version {version}")
    n_tensors, n_kv = struct.unpack("<QQ", r.read(16))

    kv: dict = {}
    for _ in range(n_kv):
        key = r.string()
        t = struct.unpack("<I", r.read(4))[0]
        kv[key] = r.value(t, key.startswith(_SAMPLED_PREFIXES))

    tensors = []
    for _ in range(n_tensors):
        name = r.string()
        nd = struct.unpack("<I", r.read(4))[0]
        dims = [struct.unpack("<Q", r.read(8))[0] for _ in range(nd)]
        qtype = struct.unpack("<I", r.read(4))[0]
        offset = struct.unpack("<Q", r.read(8))[0]
        tensors.append({"name": name, "dims": dims, "qtype": qtype, "offset": offset})

    align = int(kv.get("general.alignment", 32) or 32)
    data_start = -(-r.pos // align) * align          # round up to alignment
    return kv, tensors, data_start


def hf_shape(t: dict) -> tuple:
    """GGUF `ne` is innermost-dimension-first; HF is row-major.

    So a GGUF tensor of ne [5120, 152064] (embed_tokens) is HF shape
    (152064, 5120). Skipping this reversal transposes every 2-D weight.
    """
    return tuple(reversed([int(d) for d in t["dims"]]))


def _prod(xs) -> int:
    n = 1
    for x in xs:
        n *= int(x)
    return n


def tensor_nbytes(t: dict) -> int:
    """Exact byte size of a tensor's packed data, from the quant block layout."""
    from gguf.constants import GGMLQuantizationType
    from gguf import GGML_QUANT_SIZES
    blk, tsize = GGML_QUANT_SIZES[GGMLQuantizationType(t["qtype"])]
    n = 1
    for d in t["dims"]:
        n *= d
    if n % blk:
        raise ValueError(f"{t['name']}: {n} elements is not a multiple of the "
                         f"quant block size {blk}")
    return n // blk * tsize


class GGUFSource:
    """Header + tensor data, read in offset order.

    Offset order is not a limitation in practice — that is how the data is laid
    out on disk, so a sequential read is the natural one — and it is what lets
    the same code accept a pipe.
    """

    def __init__(self, fh, seekable: bool, size_hint: int = 0):
        self.r = _Reader(fh)
        self.seekable = seekable
        self.size_hint = size_hint
        self.kv, self.tensors, self.data_start = read_header(self.r)
        # The stream sits at the END OF THE HEADER, not at data_start — the
        # alignment padding between them has not been consumed yet. Starting
        # the cursor at data_start silently short-reads every tensor by
        # (data_start - header_end) bytes, which dequantizes to NaN/Inf rather
        # than failing. This is the bug that made --stdin produce garbage.
        self.cur = self.r.pos
        ordered = sorted(self.tensors, key=lambda t: t["offset"])
        for a, b in zip(ordered, ordered[1:]):
            if a["offset"] + tensor_nbytes(a) > b["offset"]:
                raise ValueError(f"tensor data overlaps: {a['name']} / {b['name']}")
        self.order = ordered

    def data_size(self) -> int:
        end = max(t["offset"] + tensor_nbytes(t) for t in self.tensors)
        return self.data_start + end

    def open(self, t: dict) -> "np.ndarray":
        """Yield the tensor's raw packed bytes as a uint8 array."""
        import numpy as np
        off = self.data_start + t["offset"]
        n = tensor_nbytes(t)
        if self.seekable:
            self.r.fh.seek(off)
            self.cur = off
        else:
            if off < self.cur:
                raise RuntimeError(f"stream went backwards at {t['name']}")
            self._skip(off - self.cur)
        raw = self.r.read(n)
        self.cur = off + n
        return np.frombuffer(raw, dtype=np.uint8)

    def _skip(self, n: int):
        while n > 0:
            chunk = min(n, 1 << 22)
            self.r.read(chunk)
            n -= chunk


def hf_name(name: str) -> str:
    """GGUF tensor name → HF state-dict key. Raises on anything unmapped."""
    if name.startswith("blk."):
        _, idx, rest = name.split(".", 2)
        comp, _, suffix = rest.partition(".")
        if comp not in _BLOCK:
            raise KeyError(f"no HF mapping for '{comp}' (from '{name}')")
        base = f"model.layers.{idx}.{_BLOCK[comp]}"
        return f"{base}.{suffix}" if suffix else base
    for prefix, target in _TOP.items():
        if name == prefix or name.startswith(prefix + "."):
            return target + name[len(prefix):]
    raise KeyError(f"no HF mapping for '{name}'")


def dequantize_tensor(raw, qtype: int, dims: list[int]):
    """Dequantize to float32, in bounded chunks.

    The 152k×5120 embedding is 3.1 GB as fp32; doing the whole file one tensor
    at a time but each tensor one *chunk* at a time keeps peak RSS well under
    the 14 GB this box has.
    """
    import numpy as np
    from gguf.constants import GGMLQuantizationType
    from gguf import GGML_QUANT_SIZES
    from gguf.quants import dequantize

    qt = GGMLQuantizationType(qtype)
    blk, tsize = GGML_QUANT_SIZES[qt]
    n = 1
    for d in dims:
        n *= d

    def _deq(slice_):
        try:
            return dequantize(slice_, qt).astype(np.float32, copy=False)
        except (ValueError, TypeError):     # read-only buffer tripped something
            return dequantize(np.array(slice_, copy=True), qt).astype(np.float32)

    if blk == 1:                            # F32 / F16 / BF16: already dense
        return _deq(raw).reshape(dims)

    out = np.empty(n, dtype=np.float32)
    per = max(blk, (1 << 23) // blk * blk)  # ~8M elements per chunk
    for s in range(0, n, per):
        e = min(n, s + per)
        out[s:e] = _deq(raw[s // blk * tsize:e // blk * tsize])
    return out.reshape(dims)


# ── output ──────────────────────────────────────────────────────────────────
class ShardWriter:
    """Accumulate tensors into safetensors shards plus an HF index."""

    def __init__(self, out: Path, shard_bytes: int, dtype):
        self.out, self.limit, self.dtype = out, shard_bytes, dtype
        self.buf: dict = {}
        self.buf_bytes = 0
        self.weight_map: dict = {}
        self.files: list[str] = []
        self.total = 0

    def add(self, key: str, arr):
        import torch
        tensor = torch.from_numpy(arr).to(self.dtype).contiguous()
        self.buf[key] = tensor
        self.buf_bytes += tensor.numel() * tensor.element_size()
        self.total += tensor.numel() * tensor.element_size()
        if self.buf_bytes >= self.limit:
            self.flush()

    def flush(self):
        if not self.buf:
            return
        from safetensors.torch import save_file
        idx = len(self.files) + 1
        name = f"model-{idx:05d}.safetensors"
        save_file(self.buf, str(self.out / name), metadata={"format": "pt"})
        for k in self.buf:
            self.weight_map[k] = name
        self.files.append(name)
        self.buf, self.buf_bytes = {}, 0

    def close(self):
        self.flush()
        if len(self.files) == 1:
            os.replace(self.out / self.files[0], self.out / "model.safetensors")
            return {"shards": 1, "total_bytes": self.total}
        total_shards = len(self.files)
        renamed = {}
        for i, name in enumerate(self.files, 1):
            new = f"model-{i:05d}-of-{total_shards:05d}.safetensors"
            os.replace(self.out / name, self.out / new)
            renamed[name] = new
        (self.out / "model.safetensors.index.json").write_text(json.dumps(
            {"metadata": {"total_size": self.total},
             "weight_map": {k: renamed[v] for k, v in self.weight_map.items()}},
            indent=2))
        return {"shards": total_shards, "total_bytes": self.total}


def build_config(kv: dict) -> dict:
    """Rebuild an HF `config.json` from the GGUF's own metadata."""
    arch = kv.get("general.architecture", "qwen2")
    q = lambda k: kv.get(f"{arch}.{k}")
    tokens = kv.get("tokenizer.ggml.tokens")
    vocab = tokens.count if isinstance(tokens, _Arr) else (len(tokens) if tokens else None)
    n_layers = int(q("block_count") or 0)
    cfg = {
        "architectures": [{"qwen2": "Qwen2ForCausalLM", "qwen3": "Qwen3ForCausalLM",
                           "llama": "LlamaForCausalLM"}.get(arch, "Qwen2ForCausalLM")],
        "model_type": arch,
        "attention_dropout": 0.0,
        "bos_token_id": kv.get("tokenizer.ggml.bos_token_id", 151643),
        "eos_token_id": kv.get("tokenizer.ggml.eos_token_id", 151645),
        "hidden_act": "silu",
        "hidden_size": int(q("embedding_length") or 0),
        "initializer_range": 0.02,
        "intermediate_size": int(q("feed_forward_length") or 0),
        "max_position_embeddings": int(q("context_length") or 32768),
        "max_window_layers": n_layers,
        "num_attention_heads": int(q("attention.head_count") or 0),
        "num_hidden_layers": n_layers,
        "num_key_value_heads": int(q("attention.head_count_kv") or q("attention.head_count") or 0),
        "rms_norm_eps": float(q("attention.layer_norm_rms_epsilon") or 1e-6),
        # Emitted in both the legacy and the current spelling: transformers 4.x
        # reads `rope_theta`, 5.x moved it to `rope_parameters`. Writing only the
        # old key works today (5.x migrates it) but silently drops to the 10000
        # default the day it stops, which would wreck long-context behaviour.
        "rope_theta": float(q("rope.freq_base") or 10000.0),
        "rope_parameters": {"rope_theta": float(q("rope.freq_base") or 10000.0),
                            "rope_type": "default"},
        "sliding_window": None,
        "tie_word_embeddings": False,
        "torch_dtype": "float16",
        "use_cache": True,
        "use_sliding_window": False,
        "vocab_size": vocab,
    }
    scale = q("rope.scaling.type")
    if scale:
        cfg["rope_scaling"] = {"type": str(scale),
                               "factor": float(q("rope.scaling.factor") or 1.0)}
        cfg["rope_parameters"] = {"rope_type": str(scale),
                                  "factor": float(q("rope.scaling.factor") or 1.0),
                                  "rope_theta": cfg["rope_theta"]}
    return cfg


def _bytes_to_unicode() -> dict:
    """GPT-2's byte↔unicode table, exactly as HF's tokenizers use it."""
    bs = list(range(ord("!"), ord("~") + 1)) + \
         list(range(0xA1, 0xAC + 1)) + list(range(0xAE, 0xFF + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return {b: chr(c) for b, c in zip(bs, cs)}


_B2U = _bytes_to_unicode()


def _hf_token_from_gguf(raw: bytes) -> str:
    """GGUF stores tokens as raw bytes; HF stores them byte-escaped.

    llama.cpp undoes the GPT-2 escaping on the way in ('Ġ'→' '), so a token is
    the plain byte string here and has to be re-escaped to match
    `convert_ids_to_tokens`. Taking bytes rather than str is deliberate: tokens
    that are not valid UTF-8 are normal in a byte-level BPE vocabulary.
    """
    return "".join(_B2U[b] for b in raw)


def write_tokenizer(out: Path, kv: dict, source: str) -> dict:
    """Fetch the tokenizer that matches this architecture and verify it fits."""
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(source, trust_remote_code=True)
    tokens = kv.get("tokenizer.ggml.tokens")
    count = tokens.count if isinstance(tokens, _Arr) else None
    tmpl = kv.get("tokenizer.chat_template")
    if tmpl:
        tok.chat_template = tmpl
    tok.save_pretrained(out)

    report = {"source": source, "gguf_vocab": count, "hf_vocab": tok.vocab_size}
    if count and tok.vocab_size and count != tok.vocab_size:
        # Qwen pads the embedding to 152064 while the tokenizer holds 151665.
        report["note"] = (f"vocab differs (GGUF {count} vs tokenizer "
                          f"{tok.vocab_size}); expected only if the embedding is "
                          f"padded — ids above {tok.vocab_size} are never emitted")
    if isinstance(tokens, _Arr) and tokens.sample:
        mismatches = []
        for i, raw in enumerate(tokens.sample):
            want = _hf_token_from_gguf(raw)
            got = tok.convert_ids_to_tokens(i)
            if got is not None and got != want:
                mismatches.append((i, want, got))
        report["checked"] = len(tokens.sample)
        report["mismatches"] = mismatches[:5]
    return report


# ── the pass ────────────────────────────────────────────────────────────────
def convert(src: GGUFSource, out: Path, shard_gb: float, tokenizer_from: str | None,
            dry_run: bool = False) -> dict:
    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)
    dest = src.data_size()
    plan = []
    for t in src.order:
        try:
            key = hf_name(t["name"])
        except KeyError as e:
            plan.append({"gguf": t["name"], "error": str(e)})
            continue
        plan.append({"gguf": t["name"], "hf": key, "dims": hf_shape(t),
                     "bytes": tensor_nbytes(t)})
    unmapped = [p for p in plan if "error" in p]

    info = {
        "architecture": src.kv.get("general.architecture"),
        "name": src.kv.get("general.name"),
        "tensors": len(src.tensors),
        "mapped": len(plan) - len(unmapped),
        "unmapped": unmapped,
        "expected_bytes": sum(p.get("bytes", 0) for p in plan),
        "params": sum(_prod(p["dims"]) for p in plan if "dims" in p),
        "gguf_data_bytes": dest,
    }
    if dry_run:
        return info
    if unmapped:
        raise ValueError(f"{len(unmapped)} tensor(s) have no HF mapping: "
                         f"{[u['gguf'] for u in unmapped][:5]}")

    import torch

    cfg = build_config(src.kv)
    (out / "config.json").write_text(json.dumps(cfg, indent=2))
    (out / "generation_config.json").write_text(json.dumps(
        {"bos_token_id": cfg["bos_token_id"], "eos_token_id": cfg["eos_token_id"],
         "transformers_version": "4.40.0"}, indent=2))

    writer = ShardWriter(out, int(shard_gb * (1 << 30)), torch.float16)
    n = len(src.order)
    for i, t in enumerate(src.order, 1):
        raw = src.open(t)
        arr = dequantize_tensor(raw, t["qtype"], hf_shape(t))
        # A shift in the byte stream does not raise — it produces NaN/Inf. Make
        # that loud instead of shipping 29 GB of noise to the trainer.
        if not np.isfinite(arr).all():
            raise ValueError(
                f"{t['name']}: dequantized values contain NaN/Inf — the tensor "
                f"data is misaligned in the stream. Refusing to write it.")
        writer.add(hf_name(t["name"]), arr)
        del raw, arr
        if i % 25 == 0 or i == n:
            print(f"  [{i}/{n}] {writer.total / 1e9:.2f} GB written "
                  f"({t['name']})", flush=True)
    shard_info = writer.close()

    try:
        info["tokenizer"] = write_tokenizer(out, src.kv, _tokenizer_repo(src, tokenizer_from))
    except Exception as e:                      # never discard 30 GB of weights
        info["tokenizer"] = {"error": f"{type(e).__name__}: {e}"}
    info.update(shard_info)
    (out / "dequant-report.json").write_text(json.dumps(info, indent=2, default=str))
    return info


def _tokenizer_repo(src: GGUFSource, explicit: str | None) -> str:
    return explicit or _TOKENIZER_FOR.get(
        src.kv.get("general.architecture", "qwen2"),
        "Qwen/Qwen2.5-Coder-14B-Instruct")


def check_model(src: GGUFSource, out: Path, tokenizer_from: str | None) -> int:
    """Audit a written checkpoint against the GGUF it came from.

    Shapes are read from the safetensors headers, so this costs milliseconds and
    does not touch 30 GB of weight data. It is the check that catches a
    transposed or missing tensor after the fact, when re-running the conversion
    would mean freeing another 30 GB.
    """
    import json
    from safetensors import safe_open

    problems: list[str] = []
    index = out / "model.safetensors.index.json"
    if index.exists():
        files = sorted(set(json.loads(index.read_text())["weight_map"].values()))
    else:
        files = ["model.safetensors"]
    if not all((out / f).exists() for f in files):
        print(f"  ! missing shard(s); expected {files}")
        return 1

    shapes: dict[str, tuple] = {}
    for f in files:
        with safe_open(str(out / f), framework="np") as sf:
            for k in sf.keys():
                shapes[k] = tuple(sf.get_slice(k).get_shape())

    expected = {hf_name(t["name"]): hf_shape(t) for t in src.tensors}
    for k, want in expected.items():
        got = shapes.get(k)
        if got is None:
            problems.append(f"missing from the checkpoint: {k}")
        elif got != want:
            problems.append(f"{k}: shape {got}, GGUF implies {want}")
    for k in set(shapes) - set(expected):
        problems.append(f"unexpected tensor: {k}")

    cfg = json.loads((out / "config.json").read_text()) if (out / "config.json").exists() else {}
    if cfg.get("vocab_size") != expected.get("model.embed_tokens.weight", (0, 0))[0]:
        problems.append(f"config vocab_size {cfg.get('vocab_size')} does not match the "
                        f"embedding rows {expected.get('model.embed_tokens.weight')}")
    tok = write_tokenizer(out, src.kv, _tokenizer_repo(src, tokenizer_from))
    if tok.get("mismatches"):
        problems.append(f"tokenizer ids disagree with the GGUF: {tok['mismatches']}")

    print(f"[check] {len(shapes)} tensors in {len(files)} shard(s), "
          f"GGUF implies {len(expected)}")
    print(f"[check] tokenizer {tok.get('source')}: {tok.get('checked', 0)} sampled ids, "
          f"{len(tok.get('mismatches', []))} mismatch(es)")
    for p in problems[:10]:
        print(f"  ✗ {p}")
    print(f"[check] {'OK' if not problems else f'{len(problems)} problem(s)'}")
    return 1 if problems else 0


# ── self-test ───────────────────────────────────────────────────────────────
def _write_test_gguf(path: Path, tensors: dict, kv: dict, align: int = 32):
    """Minimal GGUF v3 writer, enough to exercise the reader end to end."""
    import numpy as np
    from gguf.constants import GGMLQuantizationType
    from gguf.quants import quantize

    def _kv_bytes(k, v):
        out = struct.pack("<Q", len(k)) + k.encode()
        if isinstance(v, str):
            return out + struct.pack("<I", _T_STRING) + struct.pack("<Q", len(v)) + v.encode()
        if isinstance(v, int):
            return out + struct.pack("<I", 11) + struct.pack("<q", v)
        if isinstance(v, float):
            return out + struct.pack("<I", 6) + struct.pack("<f", v)
        raise TypeError(type(v))

    # Quantize the 2-D weights so the reader's block arithmetic is exercised;
    # vectors stay F32, which is what real GGUF norm weights look like.
    # Dimensions are written innermost-first, exactly as llama.cpp does, so the
    # test also proves the reader reverses them back into HF row-major order.
    entries = []
    for name, arr in tensors.items():
        dims = tuple(reversed(arr.shape))
        if arr.ndim == 2:
            raw = quantize(arr.astype(np.float32), GGMLQuantizationType.Q8_0).tobytes()
            entries.append((name, dims, int(GGMLQuantizationType.Q8_0), raw))
        else:
            entries.append((name, dims, int(GGMLQuantizationType.F32),
                            arr.astype(np.float32).tobytes()))

    head = b"GGUF" + struct.pack("<I", 3) + struct.pack("<QQ", len(entries), len(kv))
    head += b"".join(_kv_bytes(k, v) for k, v in kv.items())
    offsets, off = [], 0
    for name, shape, qtype, raw in entries:
        off = -(-off // align) * align
        offsets.append(off)
        head += struct.pack("<Q", len(name)) + name.encode()
        head += struct.pack("<I", len(shape))
        head += b"".join(struct.pack("<Q", d) for d in shape)
        head += struct.pack("<I", qtype) + struct.pack("<Q", off)
        off += len(raw)
    data_start = -(-len(head) // align) * align

    data = bytearray()
    for (_, _, _, raw), o in zip(entries, offsets):
        data += b"\0" * (o - len(data))
        data += raw
    with path.open("wb") as fh:
        fh.write(head)
        fh.write(b"\0" * (data_start - len(head)))
        fh.write(data)


def self_test() -> int:
    """Prove the reader, the dequant math, and the name mapping on real bytes."""
    import numpy as np
    import tempfile
    fails: list[str] = []

    # (1) Name mapping — the whole point is that nothing is dropped silently.
    cases = {
        "token_embd.weight": "model.embed_tokens.weight",
        "output.weight": "lm_head.weight",
        "output_norm.weight": "model.norm.weight",
        "blk.0.attn_norm.weight": "model.layers.0.input_layernorm.weight",
        "blk.47.ffn_norm.weight": "model.layers.47.post_attention_layernorm.weight",
        "blk.12.attn_q.weight": "model.layers.12.self_attn.q_proj.weight",
        "blk.12.attn_q.bias": "model.layers.12.self_attn.q_proj.bias",
        "blk.3.attn_output.weight": "model.layers.3.self_attn.o_proj.weight",
        "blk.3.ffn_down.weight": "model.layers.3.mlp.down_proj.weight",
        "blk.5.attn_k_norm.weight": "model.layers.5.self_attn.k_norm.weight",
    }
    for g, want in cases.items():
        try:
            got = hf_name(g)
        except KeyError as e:
            fails.append(f"mapping {g}: {e}")
            continue
        if got != want:
            fails.append(f"mapping {g}: got {got}, want {want}")
    for bad in ("blk.0.attn_rot.weight", "token_embd_norm.weight", "nonsense"):
        try:
            hf_name(bad)
            fails.append(f"mapping {bad}: should have raised")
        except KeyError:
            pass

    # (2) Dequant math, including the chunked path, against a known array.
    from gguf.constants import GGMLQuantizationType as Q
    from gguf.quants import quantize
    rng = np.random.default_rng(0)
    a = rng.standard_normal((64, 256)).astype(np.float32).reshape(16384)
    q = quantize(a, Q.Q8_0)
    got = dequantize_tensor(q.view(np.uint8), int(Q.Q8_0), [64, 256])
    err = float(np.abs(got.reshape(-1) - a).max())
    if err > 0.02:
        fails.append(f"Q8_0 round-trip error {err:.4f} — dequant is wrong")
    if got.shape != (64, 256):
        fails.append(f"shape lost: {got.shape}")
    # a chunk boundary that does not divide the tensor evenly must still work
    small = dequantize_tensor(q.view(np.uint8), int(Q.Q8_0), [1, 16384])
    if small.shape != (1, 16384):
        fails.append(f"chunked reshape wrong: {small.shape}")

    # (3) Header round-trip on a synthetic GGUF written by hand.
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "t.gguf"
        tensors = {"token_embd.weight": rng.standard_normal((8, 256)).astype(np.float32),
                   "output_norm.weight": rng.standard_normal((256,)).astype(np.float32),
                   "output.weight": rng.standard_normal((8, 256)).astype(np.float32),
                   "blk.0.attn_norm.weight": rng.standard_normal((256,)).astype(np.float32),
                   "blk.0.attn_q.weight": rng.standard_normal((256, 256)).astype(np.float32)}
        kv = {"general.architecture": "qwen2", "general.name": "selftest",
              # Deliberately a length that is not a multiple of the alignment, so
              # the header does not end on a data boundary and real padding must
              # be skipped (asserted below).
              "general.quantized_by": "selftest",
              "general.alignment": 32, "qwen2.block_count": 1,
              "qwen2.embedding_length": 256, "qwen2.feed_forward_length": 512,
              "qwen2.attention.head_count": 4, "qwen2.attention.head_count_kv": 2,
              "qwen2.context_length": 128, "qwen2.rope.freq_base": 1000000.0,
              "qwen2.attention.layer_norm_rms_epsilon": 1e-05}
        _write_test_gguf(p, tensors, kv)
        fh = p.open("rb")
        try:
            src = GGUFSource(fh, seekable=True)
            if src.data_size() != p.stat().st_size:
                fails.append(f"data_size {src.data_size()} != file size {p.stat().st_size}")
            if sorted(t["name"] for t in src.tensors) != sorted(tensors):
                fails.append("tensor list did not round-trip")
            cfg = build_config(src.kv)
            if cfg["hidden_size"] != 256 or cfg["num_attention_heads"] != 4:
                fails.append(f"config built wrong: {cfg}")
            # The fixture must actually HAVE padding between header and data,
            # or the streaming cursor bug below is not exercised at all.
            if src.data_start == src.r.pos:
                fails.append("fixture has no alignment padding — widen the kv set")
            for t in src.order:
                got = dequantize_tensor(src.open(t), t["qtype"], hf_shape(t))
                want = tensors[t["name"]]
                if got.shape != want.shape:
                    fails.append(f"{t['name']}: shape {got.shape} != {want.shape} "
                                 f"(dims not reversed into HF order?)")
                elif float(np.abs(got.reshape(-1) - want.reshape(-1)).max()) > 0.03:
                    fails.append(f"{t['name']}: values did not survive the round-trip")
        finally:
            fh.close()
        # The streaming path must reach the same bytes with no seek back. This
        # is the path --stdin uses, and it is misaligned by exactly the padding
        # above if the cursor starts at data_start instead of the header end.
        fh = p.open("rb")
        try:
            stream = GGUFSource(fh, seekable=False)
            for t in stream.order:
                got = dequantize_tensor(stream.open(t), t["qtype"], hf_shape(t))
                want = tensors[t["name"]]
                err = float(np.abs(got.reshape(-1) - want.reshape(-1)).max())
                if not np.isfinite(got).all() or err > 0.03:
                    fails.append(f"stream {t['name']}: misaligned read (max err "
                                 f"{err:.4g}) — padding not skipped?")
        finally:
            fh.close()

    for f in fails:
        print(f"  ✗ {f}")
    print(f"gguf_to_hf self-test: {'PASS' if not fails else 'FAIL'} "
          f"({len(fails)} failure(s))")
    return 1 if fails else 0


def _free_at(p: Path) -> int:
    import shutil
    probe = p
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return shutil.disk_usage(probe).free


def _open_stream(gguf: Path | None):
    if gguf is None:
        import io
        return io.BufferedReader(sys.stdin.buffer, buffer_size=1 << 22), False, 0
    fh = gguf.open("rb")
    return fh, True, gguf.stat().st_size


def run(gguf: Path | None, out: Path, shard_gb: float, tokenizer_from: str | None,
        dry_run: bool, check: bool = False) -> int:
    fh, seekable, size = _open_stream(gguf)
    try:
        src = GGUFSource(fh, seekable, size)
        if check:
            return check_model(src, out, tokenizer_from)
        info = convert(src, out, shard_gb, tokenizer_from, dry_run)
    finally:
        if gguf is not None:
            fh.close()

    print(f"[gguf_to_hf] arch={info['architecture']} name={info['name']!r} "
          f"tensors={info['tensors']} mapped={info['mapped']}")
    print(f"[gguf_to_hf] packed data {info['gguf_data_bytes'] / 1e9:.2f} GB "
          f"-> fp16 ~{info['params'] * 2 / 1e9:.2f} GB ({info['params'] / 1e9:.2f}B params)")
    if size:
        drift = abs(info["gguf_data_bytes"] - size) / size
        print(f"[gguf_to_hf] file {size / 1e9:.2f} GB, header+padding "
              f"{(size - info['gguf_data_bytes']) / 1e6:.1f} MB ({drift:.2%} drift)")
        if drift > 0.001:
            print("  ! data size disagrees with the file size — the header parse "
                  "is probably wrong; do not trust the output")
    if info["unmapped"]:
        print(f"  ! {len(info['unmapped'])} unmapped tensor(s): "
              f"{[u['gguf'] for u in info['unmapped']][:5]}")
    need = info["params"] * 2
    free = _free_at(out)
    print(f"[gguf_to_hf] disk: need ~{need / 1e9:.1f} GB, {free / 1e9:.1f} GB free")
    if need > free * 0.9:
        print("  ! not enough headroom — free space first, or write to another disk")
        return 3
    if dry_run:
        return 0
    print(f"[gguf_to_hf] wrote {info['shards']} shard(s), "
          f"{info['total_bytes'] / 1e9:.2f} GB fp16 -> {out}")
    tok = info.get("tokenizer", {})
    if tok.get("error"):
        print(f"  ! tokenizer step failed: {tok['error']}")
        print("    the weights are written; re-run the tokenizer step with "
              "`--check` once this is fixed")
        return 1
    print(f"[gguf_to_hf] tokenizer {tok.get('source')} "
          f"(gguf vocab {tok.get('gguf_vocab')} / hf {tok.get('hf_vocab')}), "
          f"{len(tok.get('mismatches', []))} mismatch(es) in "
          f"{tok.get('checked', 0)} sampled ids")
    if tok.get("note"):
        print(f"  · {tok['note']}")
    if tok.get("mismatches"):
        print(f"  ! token ids disagree with the GGUF: {tok['mismatches']} — wrong "
              f"tokenizer repo would train against the wrong vocabulary")
        return 1
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--gguf", type=Path, default=None,
                    help="GGUF file (or use --stdin to read one from a pipe)")
    ap.add_argument("--stdin", action="store_true",
                    help="read the GGUF sequentially from stdin, never spooling it")
    ap.add_argument("--out", type=Path, required=False)
    ap.add_argument("--shard-gb", type=float, default=4.0)
    ap.add_argument("--tokenizer-from", default=None,
                    help="HF repo or local dir for the tokenizer (default: matched "
                         "to the architecture)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="audit an already-written --out against the GGUF header")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args(argv)

    if a.self_test:
        return self_test()
    if a.stdin and a.gguf:
        print("--stdin and --gguf are mutually exclusive", file=sys.stderr)
        return 2
    if not a.stdin and not a.gguf:
        print("need --gguf <file> or --stdin", file=sys.stderr)
        return 2
    if a.out is None:
        print("--out is required", file=sys.stderr)
        return 2
    return run(a.gguf, a.out, a.shard_gb, a.tokenizer_from, a.dry_run, a.check)


if __name__ == "__main__":
    raise SystemExit(main())
