#!/usr/bin/env bash
# Launch the push-to-talk voice tool.
#   Ctrl+Z  start recording | Enter  stop+transcribe+type | Ctrl+C quit
cd "$(dirname "$0")"
exec .venv/bin/python -u talk.py "$@"
