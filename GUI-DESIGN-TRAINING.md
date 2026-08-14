# GUI-Design Training Plan

> Implementation plan distilled from `~/Desktop/GUI.odt` — teaching an LLM to generate
> professional GUI designs by combining **structured design tokens**, **visual context
> injection**, **QLoRA fine-tuning**, and an **automated validator loop**.
>
> Status checkboxes reflect what is built in this repo **today**. This file is the
> living plan: tick boxes as work lands, add file paths under each item.

## Status at a glance

| Phase | Status |
|---|---|
| 1. Dataset (component pairs + design tokens) | ✅ Built (`gui-design.jsonl`, 186 rows) |
| 2. Training environment (QLoRA 7B) | ✅ Built (engine + launcher) |
| 3. Retention mix (anti-regression) | ✅ Built (engine `mix_paths`/`mix_ratio`) |
| 4. DPO (taste) | ⬜ Not built — needs chosen/rejected triplets |
| 5. Validator loop (headless render + linter) | ⬜ Not built |

---

## Why this plan

Standard LLMs are trained mostly on raw web text — they write outdated CSS, hallucinate
layout dimensions, and fail at spatial hierarchy. This plan transforms GUI generation
from a vague text problem into a **precise structural and visual coding task**:

- feed the model **structured design tokens** (a "design law bible"),
- inject **visual references** of top-tier products,
- **fine-tune** on designer-grade code rather than loose preference rankings,
- **verify with automated linters** so bad layouts are caught during training.

---

## Phase 1 — Curate and Format the Dataset

> An LLM cannot "see" a GUI unless you teach it the relationship between code and
> layout geometry. The dataset must tightly couple code with design tokens.

### 1.1 Component-driven pairs
- [x] **Built** — `scripts/build-gui-design-dataset.py` converts the 96 self-contained
  `projects/*.html` apps into **186 rows** (`training/dataset/gui-design.jsonl`):
  - **DESIGN rows (95):** instruction asks for the UI; `input` is a deterministic
    `DESIGN TOKENS` block (palette, theme, fonts, spacing scale, radii, layout,
    components, behaviors, custom props) extracted from each project's own CSS;
    `output` is the complete HTML document up to the inline `<script>`.
  - **BEHAVIOR rows (91):** same token block as `input`; `output` is the extracted
    inline `<script>` (4 files have no JS).
  - Schema: `{instruction, input, output, source}` — engine-compatible.
  - Deterministic extraction: **zero LLM calls**.
  - Extend toward the plan's 10k+ target by adding more component-isolated examples
    (auth screens, dashboard sidebars, pricing grids) as the corpus grows.

### 1.2 Inject bounding boxes (multimodal)
- [x] **Deferred by design** — the current corpus is text-only HTML, so tokens are the
  coupling mechanism for now (noted in the builder docstring).
- [ ] **Not built** — for multimodal training, add normalized coordinates
  `[ymin, xmin, ymax, xmax]` to tokens, e.g.:
  `<button box="[80, 20, 85, 40]">Submit</button>`.
  This forces the model to respect spatial constraints.

### 1.3 Strict tokenization / system prompt
- [x] **Built** — the DESIGN-TOKENS `input` block acts as the strict spec the model must
  honor ("same theme, palette, fonts, spacing scale…" — no invented values).
- [ ] **Optional** — add a dedicated training system prompt in the row schema
  ("You are an expert UI/UX system… no hardcoded pixel values outside the design
  tokens") for SFT rows.

---

## Phase 2 — Prepare the Training Environment

> Memory-efficient PEFT on consumer hardware: freeze a 7B base in 4-bit, train small
> adapters (QLoRA). Runs on a single 24GB GPU (L4/RTX 4090); this repo runs on
> 2× RTX 3060 12GB.

### 2.1 QLoRA fine-tuning
- [x] **Built** — `scripts/launch-qlora-gui-design.py`:
  - QLoRA **4-bit** on `Qwen2.5-7B-Instruct-Uncensored`, 2 epochs, lr 2e-4, `lora_r` 8.
  - GGUF **q4_k_m** export automatic (engine) → `training/gui_trainer/models/`.
  - `--dry-run` validates config + datasets without touching GPUs.
  - Multi-GPU: `torchrun --standalone --nproc_per_node=2`.

### 2.2 Target all linear layers
- [x] **Built** — engine targets every linear layer
  (`q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`), exactly the
  plan's list, so the adapter absorbs design patterns and CSS syntax.

### 2.3 Context length ≥ 8,192 tokens
- [x] **Available** — `--seq 8192` exists on the launcher.
- [ ] **Not default** — default is **2048** (proven on 2× 12GB, ~40 s/it in round-5);
  8192 costs ~4× memory/time per step. Raise when hardware allows.

### 2.4 Retention mix (anti-regression)
- [x] **Built** — the engine now honors `mix_paths` / `mix_ratio` / `mix_seed`
  (`training/gui_trainer/engine.py` → `_apply_retention_mix`, `load_gui_dataset`
  `row_caps`). Retention files are sampled deterministically **before tokenization**;
  primary rows stay uncapped. The launcher passes
  `mix_paths=[round8-code.jsonl], mix_ratio=0.15` via `update_config` (no pre-merge).
  The curriculum template (`curriculum/lib/train.py`) contract now works as written.
- [x] **Tested** — `training/gui_trainer/test_engine_mix.py` (5 tests: cap math,
  wiring, seed-42 determinism, disabled states, missing-file skip).

---

## Phase 3 — Direct Preference Optimization (DPO)

> "SFT teaches the model *how* to write code; DPO teaches it *taste*."

- [ ] **Not built** — needs a **chosen/rejected triplet dataset**
  (`prompt`, `chosen` = professional, `rejected` = amateur) before any DPO round:
  - **Chosen:** clean layouts, semantic colors, consistent 4px spacing scale,
    clear typography contrast, robust responsive classes.
  - **Rejected:** cluttered margins, random hex codes, misaligned labels, broken
    flexbox wraps.
- [ ] **Dataset builder** — `scripts/build-gui-dpo-triplets.py` (planned): derive
  pairs from the `projects/` corpus by degrading correct HTML (violate spacing,
  randomize palette) so chosen/rejected stay comparable.
- [ ] **Training round** — DPO launcher (planned) after SFT round completes.

---

## Phase 4 — Close the Loop with an Automated Validator

> Models learn best when bad layouts are caught during evaluation.

- [ ] **Headless rendering** — render generated GUI code to an image with a headless
  browser (Puppeteer/Playwright) at validation checkpoints.
- [ ] **Design linter** — check structural compliance (semantic colors, padding/spacing
  scale, grid config, hallucinated tokens); feed failures back into training as a
  negative signal.
- [ ] **Eval harness** — score the tuned model on held-out DESIGN-TOKENS: structure
  completeness, token adherence, renderability.

---

## Appendix — Prompt Engineering & Context Guardrails (from the research brief)

Complementary, lower-cost levers to apply **before/during** generation:

- **Atomic design frameworks** — force hierarchical UI construction (atoms → molecules
  → organisms). Partially embodied by the DESIGN-TOKENS component list.
- **Style-guide injection** — a centralized system instruction with exact palettes and
  typography scales (a "design law bible"). The `projects/` corpus + `DESIGN TOKENS`
  are the seed; a dedicated `style-guide.md` is optional.
- **Visual RAG** — supply screenshots of professional components (e.g. Mobbin) so an
  MLLM can mimic professional layouts. Needs the multimodal path (Phase 1.2).
- **Self-correction via linters** — the validator loop (Phase 4).
- **MCP design-file servers** — precise context over layers/spacing tokens; out of scope
  for this repo's local-first stack.

---

## Repo map

| Artifact | Path |
|---|---|
| Dataset builder | `scripts/build-gui-design-dataset.py` |
| Dataset (186 rows) | `training/dataset/gui-design.jsonl` |
| Retention mix source | `training/dataset/round8-code.jsonl` |
| QLoRA launcher | `scripts/launch-qlora-gui-design.py` |
| Training engine | `training/gui_trainer/engine.py` |
| Mix tests | `training/gui_trainer/test_engine_mix.py` |
| Curriculum template (engine consumer) | `curriculum/lib/train.py` |
| Source corpus (96 apps) | `projects/*.html` |

**To run the round when ready:**

```bash
bash scripts/start-dspark.sh --stop          # free the GPUs
python3 scripts/launch-qlora-gui-design.py --dry-run   # preview config + mix
python3 scripts/launch-qlora-gui-design.py             # SFT round (hours)
```
