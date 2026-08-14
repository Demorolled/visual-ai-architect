# Build-Ladder h07 — Password Manager

> **Build:** FAIL (recorded) · **Tier:** hard · **Date:** 2026-08-09

## What it is

A python password manager: hash a password with SHA-256 + random salt, store it in JSON,
retrieve it, print "Password verified: True" when the plaintext matches.

## Why it broke (3 fresh generations, all different bugs)

1. argparse CLI requiring `--password` (exit 2 when run bare) — entry never ran.
2. Entry defined functions but never called them (no `__main__` guard) — empty output.
3. **The core anti-pattern:** `hash_password()` regenerated a NEW random salt
   (`secrets.token_bytes` inside the function) on EVERY call, so the stored hash never
   matches a re-hash at verify time → always "Password verified: False". Also seen:
   module calls without prefixes (`store_password(...)` without `password_store.`),
   `getpass.getpass()` (un-testable), helpers that call non-existent functions.

## Fix / corrected pattern

Generate the salt ONCE, persist it WITH the hash, and reuse the stored salt for
verification (pbkdf2_hmac with the stored salt). Corrected implementation verified
(PASS) and recorded in the datasheet + training dataset.

## Lesson for VACA

Salt handling is the trap: salt must be created once and persisted, never re-rolled per
hash call. Python has no contract checker — every imported member must exist in the
sibling module, and the entry must end with a `__main__` call.

---
*VACA build-ladder campaign — 2026-08-09*
