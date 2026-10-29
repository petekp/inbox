#!/bin/sh
# Prints a next build's record of one Status call: who made it and when, each answer or error, the prompt, and the
# Status before and after. Given a session's folder, it prints the newest record there. The system text is printed
# only when it is not this checkout's STATUS_SYSTEM, or with --system.
#
# --run sends the record's prompt and system text once more to the model it asked, as the eval harness calls it:
# Sonnet through claude -p for the mod, the model's Claude id for omp, and codexAsk for Codex. It makes one model
# call, and prints the answer and whether it parses. Exits 1 when the call gives no answer.
#
# The mod keeps records in <Claude Code config folder>/plugins/data/inbox/overview-calls/, Codex in
# ~/.codex/plugins/data/inbox-inbox/overview-calls/, and omp in ~/.omp/agent/inbox/overview-calls/, one folder per
# session.
#
# Usage: ./scripts/status-call.sh [--run] [--system] <record file or session folder>

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
bundle=$(mktemp -d)
trap 'rm -rf "$bundle"' EXIT
"$DIR/codex/node_modules/.bin/esbuild" "$DIR/evals/status-call.ts" --bundle --platform=node --format=esm \
    --outfile="$bundle/status-call.mjs" --log-level=warning
node "$bundle/status-call.mjs" "$@"
