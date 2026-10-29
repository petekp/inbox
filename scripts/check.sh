#!/bin/sh
# Checks the mod: formatting with Prettier, its plugin structure with
# `claude plugin validate`, the imports and docs that keep the three looks in
# step, and the plugin directory's rules for the hooks module, with
# scripts/check-structure.mjs, its types with tsc, and its tests with
# `claude plugin test`. Then the Codex plugin in codex/ and the omp extension in
# omp/. Exits 1 on any failure, and when a check cannot run.
#
# Needs npx, bun and the claude CLI.
#
# Usage: ./scripts/check.sh

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
# Prettier changes its output between minor versions, so a pinned version
# keeps the check from failing on files nobody changed.
PRETTIER=prettier@3.9.9
status=0
log=$(mktemp)
trap 'rm -f "$log"' EXIT

# Runs one check and prints the check's output only when it fails.
check() {
    label=$1
    shift
    if "$@" >"$log" 2>&1; then
        echo "  ok $label"
    else
        echo "  x $label"
        sed 's/^/      /' "$log"
        status=1
    fi
}

# Prettier reads .prettierignore and .gitignore from the folder it runs in.
cd "$DIR"
before=$status
check "prettier" npx -y "$PRETTIER" --check .
[ "$status" = "$before" ] || echo "      Fix: npx -y $PRETTIER --write ."

check "plugin validate" claude plugin validate "$DIR"
check "structure" node "$DIR/scripts/check-structure.mjs"
# Claude Code writes these types when it loads the mod from this folder, and
# claude -p does not. A worktree's copy does not load while another copy of the
# mod loads first. The types name no paths, so a worktree uses the main checkout's.
types="$DIR/.claude-plugin/types"
main=$(git -C "$DIR" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')
if [ ! -e "$types" ] && [ -n "$main" ] && [ -f "$main/.claude-plugin/types/tsconfig.json" ]; then
    cp -R "$main/.claude-plugin/types" "$types"
    echo "  - types: copied from $main"
fi
if [ -f "$types/tsconfig.json" ]; then
    check "types" npx -y -p typescript tsc --noEmit -p "$DIR"
else
    echo "  x types: not checked. Start one interactive session to write them: claude --plugin-dir $DIR"
    status=1
fi
check "tests" claude plugin test "$DIR"

# The Codex plugin in codex/: its committed bundles match its sources, its
# types, and its tests. Its tools come from its own package.json.
if [ -d "$DIR/codex/node_modules" ]; then
    check "codex bundles" npm --prefix "$DIR/codex" run --silent check
    check "codex types" npm --prefix "$DIR/codex" run --silent types
    check "codex tests" npm --prefix "$DIR/codex" test --silent
    # The eval case files, with no model calls: every saved ledger loads, and every Compare case checks that the
    # agent closes nothing. The check is TypeScript, so Codex's esbuild bundles it first.
    cases=$(mktemp -d)
    check "eval cases" sh -c '"$1/codex/node_modules/.bin/esbuild" "$1/evals/check-cases.ts" --bundle --platform=node \
        --format=esm --outfile="$2/check-cases.mjs" --log-level=warning && node "$2/check-cases.mjs" "$1"' _ "$DIR" "$cases"
    rm -rf "$cases"
else
    echo "  x codex: not checked. Install its tools once: npm --prefix $DIR/codex ci"
    status=1
fi

# The omp extension in omp/: its committed bundle matches its sources, its types and its tests. omp runs on Bun, and its
# types come from omp's own packages in omp/node_modules.
if ! command -v bun >/dev/null 2>&1; then
    echo "  x omp: not checked. Install Bun: https://bun.sh"
    status=1
elif [ ! -d "$DIR/omp/node_modules" ]; then
    echo "  x omp: not checked. Install its tools once: bun install --cwd $DIR/omp --frozen-lockfile --ignore-scripts"
    status=1
else
    check "omp bundle" npm --prefix "$DIR/omp" run --silent check
    check "omp types" npm --prefix "$DIR/omp" run --silent types
    check "omp tests" bun test --cwd "$DIR/omp" tests
fi

exit "$status"
