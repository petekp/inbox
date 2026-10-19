#!/bin/sh
# Runs model eval cases and exits 1 when a case passes in fewer runs than its bar. Each run calls a model, so
# check.sh leaves this out.
#
# The default suite is the inbox model: the cases in evals/cases.json on Sonnet, the Codex model, or both. Run it
# after a change to systemText or buildPrompt, and when a model alias moves.
#
# The agent suite is the agent that uses the inbox: the cases in evals/agent-cases.json on Claude Code with Opus,
# Codex, or both. Each run gives the agent the shipped guidance and a stand-in MCP server named probe, and checks
# its record, close and progress calls and its reply. Run it before a release, and after a change to guidanceText,
# a tool description or a tool answer.
#
# Needs the claude CLI for Sonnet and Opus and the codex CLI, or CODEX_CLI_PATH, for Codex.
#
# Usage: ./scripts/eval.sh [--suite model|agent] [--agent claude|codex|both] [--claude-model opus|haiku|...]
#                          [--runs N] [--case name,name] [--out results.json]
# --claude-model sets the model of the Claude agent in the agent suite. It defaults to opus.
# Runs default to 8 for the model suite and 5 for the agent suite.

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
suite=model
if [ "${1:-}" = "--suite" ]; then
    suite=${2:-}
    shift 2 || true
fi
bundle=$(mktemp -d)
trap 'rm -rf "$bundle"' EXIT
esbuild="$DIR/codex/node_modules/.bin/esbuild"
case "$suite" in
    model)
        "$esbuild" "$DIR/evals/run.ts" --bundle --platform=node --format=esm \
            --outfile="$bundle/run.mjs" --log-level=warning
        node "$bundle/run.mjs" --cases "$DIR/evals/cases.json" "$@"
        ;;
    agent)
        "$esbuild" "$DIR/evals/agent.ts" "$DIR/evals/probe.ts" --bundle --platform=node --format=esm \
            --outdir="$bundle" --out-extension:.js=.mjs --log-level=warning
        node "$bundle/agent.mjs" --cases "$DIR/evals/agent-cases.json" "$@"
        ;;
    *)
        echo "Unknown suite: $suite. Use model or agent." >&2
        exit 2
        ;;
esac
