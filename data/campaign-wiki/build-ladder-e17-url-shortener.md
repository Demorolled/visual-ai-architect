# Build-Ladder e17 — URL Shortener (node, built-in http only)

> **Build:** FAIL (recorded) · **Tier:** extreme · **Date:** 2026-08-09

## What it is

A node URL shortener using ONLY the built-in http module (no npm): POST /api/shorten →
{"code":"abc123"}, GET /api/abc123 → 302 redirect.

## Why it broke

The fresh generation wrote a single server.js that was structurally broken:
- ESM `export function` in a .js file (node treats .js as CommonJS → SyntaxError)
- `createServer()` opened but NEVER closed (mismatched braces)
- `http` and `crypto` used but NEVER imported
- `req.params` used without a router; no request-body parsing
- A 5-bug bundle in ~30 lines — the retest after the planner fix still produced
  ESM-in-.js; the repair loop could not fix it.

## Fix / corrected pattern

Plain CommonJS server using `http.createServer` + `crypto.randomBytes`, body collected
via 'data'/'end' events, cache Map, 302 via `res.writeHead`. Also fixed the tester's
up-poll to accept 4xx (a GET on a POST-only endpoint proves the server is up).
Verified PASS. Corrected code recorded.

## Lesson for VACA

Node built-ins requests: .js = CommonJS, always import what you use, and never leave a
function brace unclosed. The build-ladder node spec now plans a single server.js.

---
*VACA build-ladder campaign — 2026-08-09*
