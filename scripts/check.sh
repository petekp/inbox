#!/bin/sh
# Checks the mod: formatting with Prettier, its structure with
# `claude plugin validate`, its types with tsc, and its tests with
# `claude plugin test`. Then the Codex plugin in codex/. Exits 1 on any failure,
# and when a check cannot run.
#
# Needs npx and the claude CLI.
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
# Claude Code writes these types when it loads the mod from this folder.
if [ -f "$DIR/.claude-plugin/types/tsconfig.json" ]; then
    check "types" npx -y -p typescript tsc --noEmit -p "$DIR"
else
    echo "  x types: not checked. Start one interactive session to write them (claude -p does not): claude --plugin-dir $DIR"
    status=1
fi
check "tests" claude plugin test "$DIR"

# The Codex plugin in codex/: its committed bundles match its sources, its
# types, and its tests. Its tools come from its own package.json.
if [ -d "$DIR/codex/node_modules" ]; then
    check "codex bundles" npm --prefix "$DIR/codex" run --silent check
    check "codex types" npm --prefix "$DIR/codex" run --silent types
    check "codex tests" npm --prefix "$DIR/codex" test --silent
else
    echo "  x codex: not checked. Install its tools once: npm --prefix $DIR/codex ci"
    status=1
fi

exit "$status"
