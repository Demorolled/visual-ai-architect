# VACA — Visual AI Code Architect: Complete Knowledge Base

> **Purpose**: The single source of truth for training the VACA fine-tune.
> This file merges (1) everything in the wiki (`modelVeronice.txt`, sections 1–35)
> and (2) everything learned AFTER the wiki was written — the DSpark serving
> pipeline, the QLoRA 4-bit fine-tuning pipeline, Campaign 50 and the corrected
> code-generation contract, the benchmark harness, deployment/recovery scripts,
> the dataset pipeline, and the reference library contents.
>
> Converted to training examples by `scripts/build-vaca-knowledge-dataset.py`.
> Target model: `qwen2.5-7b-instruct-uncensored` (exported as Q4_K_M GGUF).

---

## Part A — What the Wiki Covers (modelVeronice.txt, sections 1–35)

### A.1 Project Overview

VACA (Visual AI Code Architect) is an AI-powered visual development environment
with flowchart-based code generation, voice control, emotion-aware LLM reasoning,
and neural training. Version 1.0.0. Monorepo: `frontend/` (React 18 + Vite + TypeScript
strict + Zustand + Three.js/ReactFlow) and `backend/` (Express 4 + OpenAI SDK + socket.io,
ESM, port 3001). Current user profile: default (intermediate, balanced communication).

### A.2 Runtime Tools

Node.js v24.15.0, npm 11.12.1, Bun 1.3.14, Python 3.13.13, tsx v4.21.0, TypeScript 5.3.3
strict mode (noUnusedLocals, noUnusedParameters, noFallthroughCases, react-jsx).

### A.3 Frontend Application

- Framework: React 18.2.0, Vite 8.x, Zustand 4.4.7, Three.js 0.184.0 +
  @react-three/fiber + drei, ReactFlow 11.10.1, axios 1.6.2, Vitest 4.1.8.
- PWA: name "Visual AI Code Architect", theme #00d9ff, bg #0d0d1a, standalone,
  NetworkFirst API cache (50 entries, 1h).
- Capacitor mobile: app id com.visualai.architect, Android emulator 10.0.2.2.
- Source: `frontend/src/` — store/ (projectStore, llmStore), hooks/ (10 hooks),
  50+ components (Canvas 2D+3D, Node3D, MasterNode, Toolbar, LLMSelector,
  LLMStatusPanel, ReasoningPanel, EmotionDropdown, ProjectManager, DesignBrowser,
  ReviewPanel, NodePalette, LearningDashboard, ManifestoEditor, ReferenceLibrary,
  HelpPanel, TutorialOverlay, GlobalShortcuts, ErrorBoundary, ContextStatusBar...),
  utils/ (23 modules: apiUrl, llmClient, autoSave, roadmapSync, emotionEngine,
  tts, screenshotVision, sessionTunnel, systemAwareness, autoLearn, intentParser...).
- Build chunking: vendor, flow, three, state, http.

### A.4 Backend Application

- Express 4.18.2, OpenAI SDK 6.37.0 (Ollama-compatible), socket.io 4.8.3, port 3001.
- ESM (`type: module`), tsx dev / tsc→node prod.
- routes/ (31 modules): architect, config, reasoning, generation, projects, tools,
  knowledge, neural, llm, training, export, tts, emotion, session, memory, context,
  user, search, blueprint, designs, node-store, scanner, voice-action, mindspace,
  auto-learn, ui-functions, manifest, library, design-research, system-monitor, desktop.
- ai/ (7): translator, emotionEngine (Plutchik), vision, manifesto, libraryContext,
  librarySystemPrompt, prompts.
- tools/: Tool.ts, ToolRegistry.ts, FileSystemTool (6 sub-tools), ShellTool,
  ServiceTools (20 sub-tools), AuxTools, permission manager. 27 registered tools.
  Risk levels: low/medium/high/critical. Permission modes: allow_all, auto_approve,
  ask_each, deny_all, plan_only.
- neural/: RNN trainer, rnn.ts, rnnGPU.ts, tokenizer, syncManager.
- knowledge/: knowledgeStore (patterns), learningEngine, knowledgeTypes.

### A.5 LLM Configuration

- Primary: ollama provider, gemma-3-12b, base http://127.0.0.1:11434/v1, 2 GPUs,
  flash attention, KV cache q8_0, num parallel 2.
- Frontend defaults: http://127.0.0.1:11434, heartbeat 30s, keep-alive 5m, timeout 15s,
  50 connection events in localStorage.
- config.yaml: gemma4:12b, 8192 ctx, temp 0.7, max predict 2048; TTS pyttsx3 +
  Edge TTS (en-US-GuyNeural); emotion engine plutchik, empathy 0.6.

### A.6 Data & Knowledge Stores

- data/: designs.json, design-specs-v2.json, node-designs.json, session-memory.json,
  design-manifesto.md, ubuntu-diag-architecture.md, calendar.db (SQLite), data/library/ (42 docs).
- backend/knowledge/: auto-learn/ interactions-*.jsonl + auto-learn-state.json,
  patterns.json, rnn-model.json, sheet-meta.json, capture-log.jsonl.

### A.7 Training System (as of wiki)

- llm-training-app: FastAPI backend, custom engine.py, RAG (FAISS +
  sentence-transformers), LoRA fine-tuning, CustomTkinter desktop UI.
- training/: datasheets.yaml, rules.yaml.
- scripts/: master-pipeline-v3.py, generate-batch1-designs.py, generate-batch2-games.py,
  generate-batches-3-to-10.py, generate-training-datasheets.py, gguf_server.py, etc.

### A.8 Generated Apps Library

92 HTML apps in projects/ across batches:
- Batch 1 (12 simple→very complex), Batch 2 (15 medium→extreme), Batch 3 (20 very
  complex→insane), Batch 4 (13 reasoning/logic: sudoku-solver, n-queens, maze-solver,
  pathfinder, logic-gates, truth-table, inference-engine, binary-tree, sorting-viz,
  knapsack, cellular-auto, regex-tester, turing-machine), Batch 5 (2 reasoning +
  15 GUI builders: form-builder, button-maker, card-builder, navbar-builder,
  modal-builder, layout-builder, theme-builder, tab-builder, table-builder,
  dashboard-widgets, icon-builder, animation-studio, form-validator,
  component-playground, color-palette).

### A.9 Quality Evolution

System grade 7.5 → 8.1 → 7.8 → 8.7 (highest) across batches. Security: escapeHTML()
everywhere, localStorage try/catch persistence everywhere, zero eval()/Function() in
logic code (spreadsheet-pro → recursive descent parseArithmetic; truth-table →
recursive descent parseBoolean), iframe sandbox (sandbox='allow-scripts', no
allow-same-origin) replaces eval() in preview builder. Remaining: accessibility
(ARIA labels, keyboard nav) for all apps.

### A.10 Jarvis 55 Addendum

Python→Node.js full port (TypeScript ESM, 164 packages). 5 CLI modes, 13 source files.
Voice system: MsEdgeTTS speaker, node-microphone listener, wake words. JarvisDashboard
integrated into VACA frontend (purple #7c3aed toggle). IPC over Unix socket /tmp/jarvis.sock.

---

## Part B — The DSpark LLM Serving Pipeline (NOT in the wiki)

### B.1 What DSpark Is

DSpark is VACA's primary local LLM server: a llama.cpp `llama-server` binary launched
by `scripts/dspark_server.py`, serving an OpenAI-compatible API on **port 8000**.
The backend calls it for chat/reasoning. It replaced the older GGUF server (port 8083)
as the production inference path.

### B.2 Launch & Model Targeting

- `scripts/dspark_server.py --target <path-to-gguf>` starts the server with a specific
  GGUF. The active model path is persisted in `scripts/dspark-target.env`
  (KEY=value, e.g. `DSPARK_TARGET=/path/to/model.gguf`).
- The stock/control model is `models/qwen2.5-7b-instruct-uncensored-q4_k_m.gguf`.
- The fine-tuned model is `models/Qwen2.5-7B-Instruct-Uncensored.Q4_K_M.gguf` (4.4 GB).
- `scripts/dspark.log` holds server stdout (includes per-request `(N tok/s)` lines).
- PID file: `scripts/dspark.pid`.

### B.3 Health & Inference Endpoints

- `GET /v1/health` returns JSON: `{ status, model, draft_mode, speculative_decoding, draft, stats }`.
  - `stats.tokens_per_sec` = server-side rolling token throughput.
  - `model` is a static friendly name, NOT the GGUF filename — a known trap for
    naive health checks (see Part E — the `dspark_serves()` fix).
- `GET /v1/models` lists loaded models.
- `POST /v1/chat/completions` — OpenAI-compatible chat completions (stream + non-stream).
- Draft mode health field: `{ ok, health: { draft_mode: 'model'|'none', speculative_decoding: bool, draft: 'qwen2.5-coder:0.5b' } }`.

### B.4 Draft Mode (Speculative Decoding)

- DSpark runs **draft mode** with a small draft model (`qwen2.5-coder:0.5b`) enabling
  speculative decoding: the draft model proposes tokens, the big model verifies in
  parallel. In the tuned-model benchmark, draft mode measured **54.2 tok/s** with
  `draft_mode=model` and `speculative_decoding=true`.
- Draft mode works with the tuned Q4_K_M GGUF — the tuned model serves in draft mode
  without degradation.

### B.5 Known Operational Facts

- Tuned model measured **57.08 tok/s** (client-side) / 56.76 (server rolling stats)
  vs stock control **58.7 tok/s** on the same hardware — i.e. the QLoRA fine-tune
  does NOT meaningfully slow inference (~3%).
- Pre-training stock baseline (from dspark.log): **47.55 tok/s** — the tuned model
  beats the original baseline by ~20% (hardware/temperature variation).
- The health `model` field is the friendly name — process cmdline `--target` is the
  only reliable way to verify which GGUF is served.

---

## Part C — The Fine-Tuning Pipeline (QLoRA 4-bit) (NOT in the wiki)

### C.1 Stack

- `training/gui_trainer/engine.py` — training engine (Unsloth + transformers + PEFT).
- `scripts/launch-qlora-campaign50.py` — DDP launcher (torchrun, world_size 2).
- Model: `Orion-zhen/Qwen2.5-7B-Instruct-Uncensored` (HF) — base for the fine-tune.
- Quantization: **4-bit QLoRA** (`load_in_4bit`), GGUF export quant **q4_k_m**.
- LoRA rank 8.
- 2× NVIDIA RTX 3060 (12 GB each). Effective batch = per-device 1 × grad-accum 8 × 2 GPUs = 16.
- Max seq length 512 tokens (longer sequences truncated).

### C.2 Training Configuration (engine.py defaults)

- `num_epochs`: 2
- `learning_rate`: 2e-4 (constant schedule; multi-round LR ladder 2e-4→1e-6 available)
- `warmup_ratio`: 0.03
- `batch_size`: 1, `gradient_accumulation`: 8
- `max_rounds`: capped at 3 (was uncapped → training-time blowup; capped to keep
  wall time bounded)
- `quantization`: "4bit", `gguf_quantization`: "q4_k_m"
- `max_seq_length`: 512

### C.3 Measured Throughput (Ground Truth for Timeline Estimates)

Campaign-50 run (train split 2,717 examples, 2 epochs):
- Total steps = 340 (2,717 × 2 epochs ÷ effective batch 16 ≈ 339.6 → 340).
- Wall time: **1:07:29** for 340 steps → **~11.9 s/it** (steady state 11.1–11.9 s/it).
- This is the empirical rate: on 2×RTX 3060, QLoRA 4-bit, 7B, seq 512.
- GGUF export (merge + q4_k_m): ~4 min (239 s measured in recovery run).

### C.4 Failure Modes Learned

- `SFTConfig` PicklingError at final save → the training checkpoint (LoRA adapter at
  step 340) SURVIVED; recovery script merged adapter into fp16 base and exported
  q4_k_m — no retrain needed. Lesson: keep checkpoints; the adapter is the precious asset.
- Adapter silently not attaching (`is_peft=False` after load) → must `assert
  isinstance(model, PeftModel)` before `merge_and_unload()`.
- bitsandbytes export crash → load base fp16 (NOT 4-bit) for merge/export.
- `wait_for_health` comparing health's static model name to GGUF basename →
  false failures on every restart; fixed by parsing `--target` from cmdline.

---

## Part D — Campaign 50 & the Corrected Code-Generation Contract (NOT in the wiki)

### D.1 What Campaign 50 Is

Campaign 50 = batch generation of ~75 standalone apps (countdown-timer, color-palette,
etc.), each built from a node graph (input/logic/database/ui nodes) with
per-node source files generated by the LLM. This campaign exposed contract violations
in generated code and produced the corrected teaching data.

### D.2 The Corrected Code-Generation Contract (CRITICAL)

Generated TypeScript node source files MUST obey:

1. **NO import statements** — the build system adds imports automatically.
   Exception: a **side-effect import** `import './dep.ts';` is REQUIRED when this
   node's code references symbols from a dependency node that has no matching
   named export (dependency is consumed for side effects).
2. **NO JSX** — build the DOM with `document.createElement(...)`; JSX in a `.ts`
   file fails tsc and breaks the build.
3. **Named exports only** — `export function foo()`, `export class Foo`,
   `export const X = ...`. Never default exports.
4. **Complete, production-ready code** — error handling, edge cases, typed params
   and returns, no `any`, no dead code.
5. **Return only code** — no markdown fences, no explanations, in the generation
   response.

### D.3 The Rebuild Pipeline

- `scripts/scan-campaign-50.py` — scans generated builds: counts tsc errors,
  finds placeholder/not-implemented markers, writes `data/campaign-wiki/<slug>.md`
  wiki page per build, persists `data/campaign50-scan.json` + manifest.
- `scripts/rebuild-campaign-50.py` (or the rebuild loop) — regenerates failing
  per-node files with the corrected contract, reruns `npx tsc --noEmit`, iterates.
- Validation gate: **0 tsc errors** + **no JSX in .ts** + **named exports present** +
  **imports only as side-effect `import './x.ts'`**.
- Corrected clean examples saved to `training/dataset/campaign50-corrected.jsonl`
  (215 per-node files) — the primary teaching signal for the fixed contract.

---

## Part E — Benchmark, Deploy & Recovery (NOT in the wiki)

### E.1 Benchmark Harness (`scripts/benchmark-dspark.py`)

- Modes: `--wait` (wait for deploy then benchmark) or `--now`.
- Measures client-side tok/s via `/v1/chat/completions` (several requests, take mean)
  and server-side rolling tok/s via `/v1/health` stats.
- Captures historical stock baseline from `scripts/dspark.log` `(N tok/s)` lines,
  **persisted to `data/historical-stock-baseline.json`** and re-used when the log
  has no live tok/s lines (log rotated/overwritten).
- Compares **tuned vs stock** (swaps `--target` between the two GGUFs).
- Verifies **draft mode** still works with the tuned model.
- Writes `data/benchmark-dspark.json` report consumed by the backend.
- `dspark_serves(path)` — the correct check: `pgrep -fa dspark_server.py`, parse
  `--target <path>` from cmdline, compare basename. Do NOT trust health.model.

### E.2 Deploy (`scripts/deploy-tuned-dspark.sh --now`)

- Stops dspark, writes `dspark-target.env` with the tuned GGUF path, restarts
  dspark with the tuned target, waits for `/v1/health` to serve, verifies.

### E.3 Recovery (`scripts/recover-checkpoint-gguf.py`)

- Loads the trained LoRA adapter from the surviving checkpoint (fp16 base, not 4-bit),
- Asserts `isinstance(model, PeftModel)`, `merge_and_unload()`,
- Exports Q4_K_M GGUF (~4 min), deploys into `training/gui_trainer/models_gguf/` and `models/`,
- Deletes the ~4.4 GB f16 intermediate (guarded: never if target quant is f16).

### E.4 Benchmark Results (real, validated)

- Tuned: 57.08 tok/s (server 56.76) | Stock control: 58.7 tok/s (server 58.5)
- Pre-training stock baseline: 47.55 tok/s (cached)
- Draft mode with tuned GGUF: OK, draft_mode=model, speculative_decoding=true,
  draft throughput 54.2 tok/s.

---

## Part F — Backend & Frontend Wiring (post-wiki updates)

### F.1 Backend (backend/src/routes/llm.ts)

- `GET /api/llm/dspark-status` — returns dspark process status (running? model target?)
  using `isDSparkPidAlive()` which reads `scripts/dspark.pid` and the process cmdline.
- `GET /api/llm/dspark-benchmark` — reads `data/benchmark-dspark.json` and serves a
  flattened steps object: `{ exists, timestamp, steps: { beforeDeployHistorical,
  tunedTps, tunedServerTps, stockTps, stockServerTps, stockError, draftOk, draftMode,
  draftSpeculative, draftTps, finalModel } }`.
- **ESM gotcha fixed**: `const __dirname = dirname(fileURLToPath(import.meta.url));`
  — llm.ts is ESM under tsx; `__dirname` was undefined and crashed the route
  (and a latent bug in `isDSparkPidAlive()`). `dirname/join` from `'path'`,
  `fileURLToPath` from `'url'`.

### F.2 Frontend (frontend/src/store/llmStore.ts, components/LLMSelector.tsx)

- `DSparkBenchmarkInfo` type + `fetchDsparkBenchmark` action in llmStore.
- LLMSelector shows a **DSpark Server card** with: status (running/loading/draft mode),
  draft-mode performance, and a **"📊 Tuned vs Stock" benchmark block**:
  tuned tok/s, stock tok/s, delta %, pre-training baseline, draft-mode verdict.
- Polling: 30 s interval consolidating `fetchDsparkStatus` + `fetchDsparkBenchmark`
  (stable deps; Zustand actions stable).

---

## Part G — The Training Dataset Pipeline (NOT in the wiki)

### G.1 Format

All training data is JSONL with **`{ instruction, input, output, source }`**:
- `instruction`: the task (e.g. code-gen contract prompt, or "Explain 'X' in the
  Visual AI Architect platform." for knowledge Q&A).
- `input`: optional context/empty string.
- `output`: the expected completion.
- `source`: provenance tag (e.g. `library/03-code-generation-rules.md`,
  `modelVeronice.txt → 5. BACKEND APPLICATION`, `projects/calculator.html → JS`).

### G.2 Current Dataset (training/dataset/)

- train.jsonl: 3,019 | val.jsonl: 377 | test.jsonl: 378 (total 3,774) — 80/10/10 split.
- campaign50-corrected.jsonl: 215 clean per-node examples (all guaranteed into train).
- Sources include: projects/*.html (per-language extracts), data/library/*.md,
  modelVeronice.txt sections, knowledge/patterns.json, auto-learn interactions,
  frontend/backend source code.
- metadata.json: format instruction-input-output, target qwen2.5-7b-instruct-uncensored,
  ChatML recommended.
- dataset_meta.json: totals + per-source list.

### G.3 Merge Process (`scripts/merge-campaign50-into-dataset.py`)

- Pool = existing train+val+test + new examples; dedupe on
  (instruction, input, output), new examples win on collision.
- New teaching examples are guaranteed into train; existing pool fills train to 80%,
  remainder split 50/50 into val/test.
- Backs up the 4 files to `training/dataset/backup-<timestamp>/`, overwrites,
  updates dataset_meta.json.

---

## Part H — The Reference Library (42 files — 00 index + 41 sheets; wiki lists names, this has contents)

Library files (data/library/*.md) are the app-builder's domain knowledge. Each is a
markdown reference with a title, tagline, and numbered sections of rules/patterns.
Key ones:

- 01-node-architecture-reference — node type specs + codegen patterns
  (input, logic, database, ui, util, service, storage, media, network, security,
  system, integration, testing, deployment, config).
- 02-app-type-templates — app architecture templates by category.
- 03-code-generation-rules — universal rules: single responsibility (≤50 lines/fn),
  early returns, no magic values, error handling always, type annotations always,
  no `any`, no dead code, no console.log in prod, async/await, max nesting 3.
  Naming: camelCase vars, verbNoun functions, PascalCase classes/interfaces/types,
  kebab-case files, UPPER_CASE constants, `_prefix` private.
- 04-technology-mapping — language/framework per node type.
- 05-design-patterns — common patterns (factory, observer, strategy, pub/sub...).
- 06-data-flow-patterns — node graph data flow.
- 07-node-implementation-guide — how to implement each node type in code.
- 08-testing-patterns — unit/integration/E2E/property-based.
- 09-deployment-templates, 10-cicd-configuration, 11-debugging-strategies.
- 12-game-development-patterns — game loop, ECS, collision, AI, networking.
- 13-desktop-application-architecture — event loop, widgets, Linux integration.
- 14-web-application-architecture — full-stack web patterns.
- 15-database-design-patterns — indexing, query optimization, migrations.
- 16-systems-programming-guide — memory mgmt, concurrency, compilers, profiling.
- 17-security-architecture-guide — threat modeling, auth, XSS/SQLi prevention.
- 18-media-multimedia-processing — audio/video codecs, streaming, DCC.
- 19-ai-ml-integration-guide — model serving, training pipelines, LLM integration.
- 20-networking-communication-protocols — TCP/IP, HTTP/3, WebRTC, WebSocket.
- 21-iot-embedded-systems — MQTT, RTOS, edge computing.
- 22-enterprise-systems-integration — ERP/CRM, event-driven integration.
- 23-cloud-native-infrastructure — K8s, containers, GitOps, service mesh.
- 24-devops-sre-tooling — monitoring, alerting, SLOs, observability.
- 25-distributed-systems — consensus, Raft, message queues, CAP.
- 26-data-engineering-analytics — ETL, stream processing, warehousing, Airflow.
- 27-mobile-cross-platform — React Native, Flutter, offline-first, push.
- 28-fintech-insurance-systems — payments, banking, ledger.
- 29-healthcare-life-sciences — EHR, FHIR, HIPAA.
- 30-browser-engineering — rendering engine, DOM, JS engine, WebAssembly.
- 31-compilers-language-design — lexing, parsing, type systems, optimization.
- 32-realtime-collaboration-systems — CRDTs, WebSocket, collaborative editing.
- 33-search-recommendation-engines — TF-IDF, BM25, vector search, recommendations.
- 34-llm-ops-platform-engineering — model serving, RAG, fine-tuning, prompt eng.
- 35-computer-graphics-gpu — rendering pipelines, shaders, GPU, WebGPU.
- 36-api-integration-platforms — gateways, GraphQL federation, gRPC, webhooks.
- 37-media-entertainment-social — streaming, social feeds, moderation.
- 38-marketplace-ecommerce — marketplaces, carts, payments, logistics.
- 39-education-learning-platforms — LMS, adaptive learning, assessments.
- 40-formal-methods-verification — proofs, model checking, verified code.
- 41-emerging-technologies — new stacks and frontier patterns.

---

## Part I — Build Knowledge & Quality Data (NOT in the wiki)

### I.1 Build Knowledge Base (data/build-knowledge.md)

12 end-to-end builds through the multi-model delegation pipeline (2026-07-29):
100% pass rate, 63 files, 215,495 chars, 4 min 9 s wall time, avg 20.7 s/build.
Fastest: Config Reader 5.5 s (3 nodes). Slowest: Password Generator 85.5 s
(4 nodes, 7B delegation).

Escalating complexity ★☆☆☆☆→★★★★★, 2→7 nodes:
Hello CLI, Config Reader, Temperature Converter, File Line Counter, HTTP Server,
Todo Manager, Password Generator, Markdown Parser, File Sync, Chat Server,
URL Shortener, E-Commerce Cart.

Build patterns catalog: (1) Linear Pipeline, (2) Hub-and-Spoke, (3) Stateful Chain,
(4) Multi-Service, (5) Network Service. Delegation: fast coder (0.5B/1.5B) for simple
nodes, 7B delegator for complex logic (classification triggers route to 7B).
Resource usage and API reliability tracked through all builds.

### I.2 Design Manifesto (data/design-manifesto.md)

Sections: Architectural Philosophy; Code Style & Conventions; Preferred Technologies;
Design Principles; Quality Standards; Anti-Patterns & Pet Peeves; Project Structure;
AI Communication preferences; Vision Statement. The manifesto constrains generated
code style: clean idiomatic code, typed, error-handled, no magic values, no `any`,
no dead code, no console.log, early returns, ≤3 nesting, kebab-case files.

### I.3 Patterns Store (knowledge/patterns.json)

Structured pattern objects (name/code/description) injected into the knowledge store;
pattern types include test_writer_mini (testing tool), codegen helpers, etc.
Also used for RNN training (backend/neural/) and auto-learn.

---

## Part J — Anti-Patterns & Hard-Won Lessons (NOT in the wiki)

1. **Never `eval()` generated code** — use `sandbox='allow-scripts'` iframes (no
   allow-same-origin) so generated code can't touch parent DOM/localStorage/cookies.
2. **Never `new Function()` for expression eval** in app logic — recursive descent
   parsers are fast, safe, and zero-injection (parseArithmetic, parseBoolean).
3. **Escape ALL user input before innerHTML** — `escapeHTML()` in every app that
   renders user text.
4. **Timers**: use `Date.now()` differential ticks, not naive setInterval(1000) —
   eliminates drift (±200 ms over 25 min vs ±2–3 s).
5. **DOM perf**: `innerHTML +=` is O(n²); use `createElement/appendChild` (terminal-os
   fix: preserved event listeners, O(1) per append).
6. **Async canvas races**: sequential image loading (`loadNext(i+1)`) instead of
   parallel onload handlers.
7. **DDP**: effective batch = per-device × grad-accum × world_size; keep max_rounds
   capped; the adapter checkpoint is the precious asset (export can crash after).
8. **Health checks**: verify the served GGUF via process cmdline `--target`, never
   the static `model` name in health.
9. **ESM**: `__dirname` is undefined under tsx ESM — use
   `dirname(fileURLToPath(import.meta.url))`.
10. **The codegen contract** (Part D.2) is the single most important lesson for the
    fine-tune: no imports (except side-effect `import './x.ts'`), no JSX in .ts,
    named exports only, production-ready code, code-only responses.

---

## Part K — Key Numbers Reference (for estimation)

- 2× RTX 3060 12 GB, QLoRA 4-bit 7B, seq 512: **~11.9 s/it** (steady 11.1–11.9).
- Steps for a dataset of N train examples, 2 epochs, effective batch 16: `N*2/16`.
- GGUF q4_k_m export: ~4 min. Checkpoint adapter recovery: no retrain needed.
- Deployed tuned GGUF: **4.4 GB** (`models/Qwen2.5-7B-Instruct-Uncensored.Q4_K_M.gguf`).
- Tuned throughput: 57.08 tok/s client / 56.76 server; stock 58.7; baseline 47.55.
- Draft mode: 54.2 tok/s, speculative_decoding=true, draft qwen2.5-coder:0.5b.

---

## Part L — Intent Upgrade, Contracts & Semantic Retrieval (July 31, post-wiki)

### L.1 The Failure Class That Drove It

The chess one-shot repeatedly failed: ~14 tsc errors from cross-file mismatches
(ai.ts imported ChessBoard from game.ts but game.ts never exported it), stray
Go/Rust/Java files written into backend/src (model ignored the target language),
third-person self-answering narration, and one-shot JSON truncation at 8192 ctx.

### L.2 DSpark Serving (production)

- llama.cpp speculative-decoding server on :8000 (scripts/start-dspark.sh),
  auto-started with the backend; status + draft-mode tok/s in the frontend LLM
  settings panel.
- nCtx raised 8192 → 16384 (backend/llm-config.json) so a 5-file one-shot JSON
  fits without truncation.
- Model targeting via scripts/dspark-target.env (DSPARK_TARGET=<GGUF>); health
  verifies the served GGUF via process cmdline `--target`.
- Tuned GGUF deployed post-QLoRA: models/Qwen2.5-7B-Instruct-Uncensored
  .Q4_K_M.gguf — 57.08/56.76 tok/s (client/server) vs stock 58.7; draft 54.2.

### L.3 Intent Upgrade (parts 1–4 + 2b/2c)

1. **Structured questions**: {key, question, options[], type}; ReasoningPanel
   renders radios/dropdowns. Plain-string questions were the #1 stub killer.
2. **Context injection**: profile (styleTags/preferences) + design manifesto +
   library context → WRITE_PROMPT/FILE_WRITE_PROMPT and PLAN_PROMPT.
   Hybrid library block: 900 goal + 900 dominant-node-type, capped
   (getLibraryContextForNodeType); goal-only-1800 was the A/B control.
3. **Intent extraction**: rule-based extractIntent → {goal, targetUser,
   coreFeatures, uiStyle, language} before planning; translator.reasonFast
   (fast-coder) fills gaps on low confidence. Editable UNDERSTOOD INTENT card.

### L.4 Phase 1: Per-File Export/Uses Contracts

PlannedFile.exports/uses + FileUse; normalizeFileContracts (sanitizes plan
JSON); buildPerFileContractBlock / checkContractConsistency /
orderFilesByDependency (cycle-safe). Injected into one-shot, per-file, and
chunked prompts; WRITE_PROMPT rule 10 "HONOR THE FILE CONTRACTS"; 10 tests.

### L.5 Semantic Retrieval & Bible Scaffold

- data/library-embeddings.json — embeddings of the 42 library sheets;
  getLibraryContext matches by vector similarity instead of keywords.
- bible-reference/ — 57 level dirs scaffolded from the wiki + library
  (scaffold-bible-curriculum.py, generate-bible-deep-guides.py).

### L.6 Training-Data Loop (feed the LoRA)

- capture-verified-pairs.py — tsc-clean exports write a _training.json sidecar;
  sidecar libraryContext → row input; trainer concats instruction\n\n<input> so
  the LoRA learns request+library→code.
- merge-campaign50-into-dataset.py — priority sources campaign→captured→
  existing; backs up train/val/test/META for full revert.
- Splits: train 3260 / val 407 / test 408; captured-verified.jsonl grows from
  real exports; 4-bit QLoRA (2-GPU DDP) deployed once already.

---

## Part M — Folder Drop & Content Description (August 3, post-wiki)

### M.1 The Feature

Drag & drop now accepts BOTH files AND folders. Folders are read recursively
in-browser via `webkitGetAsEntry()` (DataTransferItem → FileSystemEntry): file
names, the full file tree, and text content are captured — no OS path handle
(the maximum any web app can do).

New "📂 Describe Folder Contents" action in the Send-to-Veronica group: builds
a compact folder manifest (folder root, file count, total size, extension
histogram, full file tree, content samples of key files) and sends it to the
LLM (`/api/reason`) for a plain-language description of what is inside the
folder — project type, main modules, tech stack, notable files.

### M.2 Implementation

- `frontend/src/utils/folderManifest.ts` (new) — pure helpers
  `detectFolderRoot`, `extensionCounts`, `formatBytes`, `buildFolderManifest`.
  Caps: 200 files listed, 8 sampled files, 800 chars per sample — huge
  folders never blow the model context window.
- `frontend/src/components/FileDropHandler.tsx` — folder-aware dialog header
  ("📂 folder/ — N files scanned from folder"), Describe button + results
  views (processing/done/error), overlay close guard while processing.
- `frontend/src/components/FileDropHandler.css` — `.filedrop-describe-btn`.
- `frontend/src/__tests__/folderManifest.test.ts` — 8 unit tests.

### M.3 LLM / Training Notes

- The folder-description system prompt tells the model to answer in plain
  text (no markdown code fences) — keeps answers clean AND TTS-friendly
  (nothing read aloud as symbols).
- Lesson: web apps receive folder CONTENTS, not a path handle. Any
  "scan this folder" feature must use `webkitGetAsEntry()` recursion, never
  made-up APIs like `webkitGet2DData()`.
- Wiki section 37 (modelVeronice.txt) and the bible level `04-web` deep guide
  (`bible-reference/04-web/01-folder-drop-content-description.md`) document
  this feature as reference sources.

### M.4 Validation

Frontend tsc clean; 93/93 vitest tests pass (8 new); dist/ rebuilt with
"Describe Folder Contents" in the bundle; end-to-end `/api/reason` correctly
described a sample folder ("basic calculator app… TypeScript, no frameworks").

---

## Part N — Merge Two Apps Feature Request (August 3, post-wiki)

### N.1 The Request

User story: "After we create an app, I want to merge the app into another app
that is already built — one already finished, one being built or just finished
— can you merge the two together?" This is a FEATURE REQUEST for the VACA app
builder: combine two projects (two node-graph architectures + their generated
code) into a single merged app.

### N.2 What Merging Means

Merge = combine two architecture graphs: nodes, edges, metadata, plus the
generated file trees. A correct implementation:

1. Load both projects (nodes/edges, generated file trees).
2. Detect overlaps: duplicate node ids, same labels, colliding module/file
   names, shared dependencies with conflicting versions.
3. Resolve: re-id collisions, namespace or rename modules, unify entry
   points, merge package manifests (dependencies/scripts).
4. Integrate: wire cross-app edges (e.g., app B's API into app A's UI),
   merge asset folders, combine config.
5. Validate: regenerate/merge code, run typecheck + tests on the merged
   output, report what changed.

UX: a "Merge Project" action taking a second project file/export and
producing a merged canvas + merged code preview.

### N.3 LLM / Training Notes

- A naive answer ("app1.py imports app2.py") is NOT merging two apps; the
  model must describe the real VACA merge flow (graphs + generated code).
- The chat LLM has NO file access. When it printed a fake `wiki/` folder tree
  (00-index.md, 02-architecture.md…) claiming it wrote the idea, it was
  hallucinating — every claimed write must be verified on disk (same lesson
  as Part M).
- When asked to record an idea in the wiki, answer with WHERE it would go and
  note the write is performed by the platform, not the chat model.

### N.4 Validation

Wiki section 38 (modelVeronice.txt), this Part N, and the bible level `04-web`
deep guide (`bible-reference/04-web/02-app-merging-guide.md`) document the
feature. Dataset rebuilt via `build-vaca-knowledge-dataset.py`; §38 + Part N
examples guaranteed into train.

---

## END OF VACA COMPLETE KNOWLEDGE BASE
