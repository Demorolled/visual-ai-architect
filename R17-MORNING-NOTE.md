# ☀️ R17 Morning Note — read when you wake up

**Written:** 2026-08-15 05:18 UTC (kernel had been running ~4h) — **UPDATED 13:30 UTC**

## Where things stand

| Item | Status |
|---|---|
| Base model | `BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored` (verified on HF) |
| Corpus | `round17-corpus` dataset — **ready** (2,063 rows: R16 clean-code 611 + ladder-r1 155 + **round7-emotion 1,275 restored** + verified 22) |
| Kaggle kernel | `vaca-qlora-round17` — **RUNNING** (verified 13:27 UTC, actively training 1:1 GPU pace) |
| Real start | **05:15 UTC** (pushed 01:13, sat ~4h in Kaggle's queue) |
| GPU time so far | **8.2h** of the 12h T4 session cap → **~3.7h runway left (~17:15 UTC kill risk)** |
| Expected completion | **~11:45 UTC original est — ALREADY PAST.** Runs slower than estimated; may not finish before the 12h cap. If killed: restart kernel with `resume` or re-run with fewer rows/lower seq (see note below). |
| **RESULT (15:11 UTC)** | **TRAINING COMPLETED ✅** — kernel ERROR was only the post-training epilogue. Epoch 1.0 done, `train_loss 0.4251`, step 232/232. Full adapter salvaged from `checkpoint-232` (137MB, 673 LoRA tensors, r8/α16). Merge in progress. |

> **⚠️ If the kernel hits the 12h cap:** Kaggle auto-terminates the session. The
> adapter checkpoints are NOT saved to output unless the kernel writes them, so
> a kill means re-running training. Before restarting, consider trimming the
> corpus (e.g. 1,500 rows) or dropping seq to 2048 so it fits in the window.

> **📌 DECISION (09:52 EDT):** user lets it run until **1:00 PM EDT** (17:00 UTC),
> 15 min before the 12h cap (1:15 PM EDT / 17:15 UTC). If still RUNNING at 1 PM:
> restart with the prepped one-command fallback — `bash scripts/kaggle-restart-round17.sh`
> (1,500 rows, seq 2048, ~4-5h). Fallback was verified working 13:50 UTC (see
> conversation) and local state was restored to the full 2,063 corpus + notebook
> afterwards.

## The one command to auto-finish

As soon as you're up (or now, it just polls until done), run the watchdog —
it polls every 5 min, and when the kernel COMPLETEs it downloads the adapter,
merges the 14B locally, converts to q4_k_m, **backs up your 7B R16 GGUF first**,
then restarts dspark on the new model:

```bash
bash scripts/kaggle-watch-round17.sh
```

Log: `/tmp/kaggle-watch-round17.log` (or `KAGGLE_WATCH_LOG=<path>`).
Expected remaining after COMPLETE: ~20-30 min merge + ~1-2h quantize/deploy.

## If you'd rather do it manually

```bash
python3 scripts/download-round17-merged.py all     # 1. fetch adapter
python3 scripts/build-r17-merged.py                # 2. merge base+adapter (fp16)
bash scripts/deploy-round17.sh                     # 3. convert→q4_k_m→deploy dspark
```

## Verify it's serving after deploy

```bash
curl -s http://localhost:8000/v1/health   # expect model = Qwen2.5-Coder-14B...
bash scripts/monitor-ladder.sh             # full app health + ladder status
```

## Reminders

- **Your 7B R16 is NOT lost** — deploy backs it up to `../model-backups/` before
  swapping. `scripts/dspark-target.env` always holds the live target.
- **Emotion is restored**: the 1,276 Gemma-distilled rows (which R16's
  code-focused corpus had silently dropped) are back in the R17 corpus — the
  personality register rides along with the 14B upgrade.
- The R16 watch script (`kaggle-watch-round16.sh`) is for the OLD round — use
  `round17` for this one.

## 📝 Later TODO (user reminder): talk to YOUR ASSISTANT with your voice

> "When I get working later, I need to connect my microphone so I can talk
> directly instead of typing (spelling errors lol)."

**Clarified intent (2026-08-15):** the user means **this coding-assistant chat
(Freebuff / the terminal agent), NOT VACA**. They want voice input →
transcription → into *this* conversation, so they can speak their coding
requests instead of typing them. Talking to VACA by voice is a separate, much
-later idea.

**✅ DONE (2026-08-15):** built `tools/voice/talk.py` — push-to-talk voice
→ text, working end-to-end (verified: Blue Mic capture via PipeWire,
faster-whisper small on CUDA, 1.7s transcription, xdotool types into the
focused window).

**How to use:**
```bash
bash tools/voice/talk.sh        # or: tools/voice/.venv/bin/python -u tools/voice/talk.py
```
- **Ctrl+Z** → start recording (speak)
- **Enter** → stop + transcribe + type into the focused chat box (also copied
  to clipboard)
- **Ctrl+C** → quit
- Options: `--model medium` for better accuracy, `--device cpu` if needed

Notes:
- Uses your **Blue Microphones USB** (auto-detected; `--source` to override).
- venv lives in `tools/voice/.venv` (faster-whisper 1.2.1, model `small` cached
  in ~/.cache). Base conda whisper is broken (numba/NumPy 2.5) — unused.
- Works from any window while the script runs in a terminal.

---

*Kernel: https://www.kaggle.com/code/stevenawoods/vaca-qlora-round17*
*Dataset: https://www.kaggle.com/datasets/stevenawoods/round17-corpus*
