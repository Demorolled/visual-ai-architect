# Build-Ladder e19 — XOR Neural Network from scratch

> **Build:** FAIL (recorded) · **Tier:** extreme · **Date:** 2026-08-09

## What it is

A 2-2-1 MLP trained on XOR for 500+ epochs with gradient descent, printing the four
predictions rounded to 1 decimal (00,01,10,11).

## Why it broke

Cross-file drift: main.py referenced `xu.Layer` (a full class with weights/bias/activate/
update) that was NEVER generated in xor_util.py — only sigmoid/d_sigmoid/xor_data existed.
The MLP code in main.py depended on a class that existed nowhere. A first correction with
an OO implementation converged to all-0.5 (weak gradients stuck near the sigmoid saddle).

## Fix / corrected pattern

Single self-contained 2-2-1 MLP, classic backprop: output delta (y-o)·o·(1-o), hidden
delta via chain rule w·δ·h·(1-h), lr 0.9, 20000 epochs → converges to 0.0/1.0/1.0/0.0.
Verified PASS. Corrected code recorded.

## Lesson for VACA

When main.py imports a class from a sibling, the sibling MUST define it (or keep it
single-file). For gradient descent: use a learning rate high enough to escape the 0.5
saddle and enough epochs for sigmoid XOR.

---
*VACA build-ladder campaign — 2026-08-09*
