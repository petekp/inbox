#!/bin/sh
# Reports how well the Status call keeps the page current, from a folder of next builds' Status call records. It
# replays each record's answer through this checkout's parseStatus and applyStatus, and prints, pooled and as the
# median per session: head descriptions code dropped, open milestones with blank text, idle working subjects the
# answer left untouched, suggested goals while a goal is met or none is set, and the lines code dropped, by kind.
# --sessions adds a line per session, numbered by folder order. It reads the records only, and prints no record text.
#
# The mod keeps records in <Claude Code config folder>/plugins/data/inbox/overview-calls/, Codex in
# ~/.codex/plugins/data/inbox-inbox/overview-calls/, and omp in ~/.omp/agent/inbox/overview-calls/. Copy the folder
# first to compare two checkouts at the same data state.
#
# Usage: ./scripts/status-health.sh [--sessions] <records folder>

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
bundle=$(mktemp -d)
trap 'rm -rf "$bundle"' EXIT
"$DIR/codex/node_modules/.bin/esbuild" "$DIR/evals/status-health.ts" --bundle --platform=node --format=esm \
    --outfile="$bundle/status-health.mjs" --log-level=warning
node "$bundle/status-health.mjs" "$@"
