#!/bin/sh
# Checks the mod: formatting with Prettier, its structure with
# `claude plugin validate`, its types with tsc, and its tests with
# `claude plugin test`. Exits 1 on any failure.
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
    echo "  - types: not checked. Load the mod once to write them: claude --plugin-dir $DIR"
fi
check "tests" claude plugin test "$DIR"

exit "$status"
