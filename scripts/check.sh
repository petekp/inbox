#!/bin/sh
# Checks the mod: formatting with Prettier, that no file is over its token
# limit, with scripts/check-sizes.mjs, its plugin structure with
# `claude plugin validate`, the imports and docs that keep the three looks in
# step, and the plugin directory's rules for the hooks module, with
# scripts/check-structure.mjs, that every export has an importer, with
# scripts/check-exports.mjs, that the three plugin manifests give one version,
# with scripts/check-versions.mjs, that the comparison page matches its parts, with
# scripts/build-compare-page.mjs, that types/index.d.ts matches its parts, with
# scripts/build-types.mjs, that the inbox tools' input types match their
# schemas, with scripts/build-tool-inputs.mjs, that no Codex server test waits on ticks, with
# scripts/check-tick-waits.mjs, its types with tsc, and its tests with
# `claude plugin test`. Then the Codex plugin in codex/, the omp extension in
# omp/, the Herdr look in herdr/ (each built into the working tree), the Exact
# client tests in exact/tests, and, when the Herdr app is installed, a load of
# the built Herdr mod in the app's own runtime with `herdr-app check`. Then a short fixed-seed fuzz run of the Herdr
# look, the omp panel and the shared row stepper, with scripts/fuzz.sh. Last, on a branch other than next or
# main, that the branch's commits change no built bundle, with
# scripts/bundles.sh. Exits 1 on any failure, and when a check cannot run.
#
# Needs node, bun, the claude CLI and the Herdr app, whose type files the
# Herdr look's types check against. Prettier, TypeScript and esbuild come from
# the root package.json, at the versions the pull request checks run.
#
# Usage: ./scripts/check.sh

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
TOOLS="$DIR/node_modules/.bin"
if [ ! -x "$TOOLS/prettier" ] || [ ! -x "$TOOLS/tsc" ] || [ ! -x "$TOOLS/esbuild" ]; then
    echo "  x not checked. Install the root tools once: npm --prefix $DIR ci --ignore-scripts"
    exit 1
fi
status=0
log=$(mktemp)
herdr_scratch=
# The builds below write the bundles into the working tree. When they matched HEAD before, put them back on exit, so a
# commit after check.sh cannot pick them up. Bundles you built yourself stay.
restore_bundles=no
# shellcheck disable=SC2046
if git -C "$DIR" diff --quiet HEAD -- $("$DIR/scripts/bundles.sh" dirs); then
    restore_bundles=yes
fi
trap 'rm -f "$log"; [ -z "$herdr_scratch" ] || rm -rf "$herdr_scratch"
[ "$restore_bundles" = no ] || "$DIR/scripts/bundles.sh" restore' EXIT

# Runs one check and prints the check's output only when it fails. A log that
# lists every test, as the root tests step's does, prints each failed test's
# name with the error under it and the totals, not the lines of the tests that
# passed. Other logs print whole. bun test prints no passed tests and puts a
# failure's error before its name, so its log is short and prints whole.
check() {
    label=$1
    shift
    if "$@" >"$log" 2>&1; then
        echo "  ok $label"
    else
        echo "  x $label"
        if grep -q '^(pass)' "$log" && grep -q '^(fail)' "$log"; then
            grep -A1 -E '^\(fail\)| pass$| fail$|^Ran ' "$log" | grep -v '^--$' | sed 's/^/      /'
        else
            sed 's/^/      /' "$log"
        fi
        status=1
    fi
}

# Prettier reads .prettierignore and .gitignore from the folder it runs in.
cd "$DIR"
before=$status
check "prettier" "$TOOLS/prettier" --check .
[ "$status" = "$before" ] || echo "      Fix: node_modules/.bin/prettier --write ."

check "file sizes" node "$DIR/scripts/check-sizes.mjs"

check "plugin validate" claude plugin validate "$DIR"
check "structure" node "$DIR/scripts/check-structure.mjs"
check "exports" node "$DIR/scripts/check-exports.mjs"
check "versions" node "$DIR/scripts/check-versions.mjs"
check "compare page" node "$DIR/scripts/build-compare-page.mjs" --check
check "types parts" node "$DIR/scripts/build-types.mjs" --check
# The inbox tools' inputs come from their schemas, not from the MCP tools of
# the session that last wrote the engine types, which tsconfig.json leaves out.
check "tool inputs" node "$DIR/scripts/build-tool-inputs.mjs" --check
check "tick waits" node "$DIR/scripts/check-tick-waits.mjs"
# Claude Code writes these types into this folder when a session loads the mod
# from it, through --plugin-dir or CLAUDE_CODE_PLUGIN_DIRS, with or without -p.
# A session that only starts here writes none. The types name no paths, so a
# worktree that has none uses the main checkout's.
types="$DIR/.claude-plugin/types"
main=$(git -C "$DIR" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')
if [ ! -e "$types" ] && [ -n "$main" ] && [ -f "$main/.claude-plugin/types/tsconfig.json" ]; then
    cp -R "$main/.claude-plugin/types" "$types"
    echo "  - types: copied from $main"
fi
if [ -f "$types/tsconfig.json" ]; then
    check "types" "$TOOLS/tsc" --noEmit -p "$DIR"
else
    echo "  x types: not checked. Start one interactive session to write them: claude --plugin-dir $DIR"
    status=1
fi
check "tests" claude plugin test "$DIR"

# The eval case files, with no model calls: every saved ledger loads, and every Compare case gives its press and
# checks that no close of the agent's takes effect. The check is TypeScript, so esbuild bundles it first.
cases=$(mktemp -d)
check "eval cases" sh -c '"$1/node_modules/.bin/esbuild" "$1/evals/check-cases.ts" --bundle --platform=node \
    --format=esm --outfile="$2/check-cases.mjs" --log-level=warning && node "$2/check-cases.mjs" "$1"' _ "$DIR" "$cases"
rm -rf "$cases"

# The Codex plugin in codex/: its bundles build, its types, and its tests. The
# build writes into the working tree, and the tests run the built bundles. Its tools come from its own package.json.
if [ -d "$DIR/codex/node_modules" ]; then
    check "codex build" npm --prefix "$DIR/codex" run --silent build
    check "codex types" npm --prefix "$DIR/codex" run --silent types
    check "codex tests" npm --prefix "$DIR/codex" test --silent
else
    echo "  x codex: not checked. Install its tools once: npm --prefix $DIR/codex ci"
    status=1
fi

# The omp extension in omp/: its bundle builds, its types and its tests. omp runs on Bun, and its
# types come from omp's own packages in omp/node_modules.
if ! command -v bun >/dev/null 2>&1; then
    echo "  x omp: not checked. Install Bun: https://bun.sh"
    status=1
elif [ ! -d "$DIR/omp/node_modules" ]; then
    echo "  x omp: not checked. Install its tools once: bun install --cwd $DIR/omp --frozen-lockfile --ignore-scripts"
    status=1
else
    check "omp build" npm --prefix "$DIR/omp" run --silent build
    check "omp types" npm --prefix "$DIR/omp" run --silent types
    check "omp tests" bun test --cwd "$DIR/omp" tests
fi

# The Herdr look in herdr/: its mod builds, its types and its tests, which load the built mod. Its types check against
# the type files of the Herdr app installed here, which herdr/herdr-types.ts copies in.
if ! command -v bun >/dev/null 2>&1; then
    echo "  x herdr: not checked. Install Bun: https://bun.sh"
    status=1
elif [ ! -d "$DIR/herdr/node_modules" ]; then
    echo "  x herdr: not checked. Install its tools once: bun install --cwd $DIR/herdr --frozen-lockfile --ignore-scripts"
    status=1
else
    check "herdr build" npm --prefix "$DIR/herdr" run --silent build
    check "herdr types" npm --prefix "$DIR/herdr" run --silent types
    check "herdr tests" bun test --cwd "$DIR/herdr" tests
fi

# The Exact Web and iOS clients in exact/: unit tests for bridge projection, recovery, motion and local actions.
if ! command -v bun >/dev/null 2>&1; then
    echo "  x exact: not checked. Install Bun: https://bun.sh"
    status=1
elif [ -d "$DIR/exact/tests" ]; then
    check "exact tests" bun test --cwd "$DIR/exact" tests
fi

# The Herdr app's own check loads the built mod once in the app's runtime, which lacks globals Bun has, such as Intl.
# It runs on a copy of the mod folder, since it writes type files beside the mod. env -i leaves out HC_TERMINAL_ID and
# every HERDR_ variable of the shell, and HOME and HERDR_APP_HOME both name the scratch folder, so no variable the
# check reads names the real app home.
# The check exits 0 when the mod starts timers or tasks it cannot end, and only warns that a reload stranded them. The
# warning has to fail the step.
herdr_app_check() {
    app_log=$(mktemp)
    if ! env -i PATH="$PATH" HOME="$herdr_scratch/home" HERDR_APP_HOME="$herdr_scratch/home" \
        herdr-app check "$herdr_scratch/inbox" >"$app_log" 2>&1; then
        cat "$app_log"
        rm -f "$app_log"
        return 1
    fi
    cat "$app_log"
    if grep -q 'stranded script tasks' "$app_log"; then
        echo "The mod starts background work while the app checks it, and the check ends before that work can finish."
        echo "Start no timers or tasks when herdr.checking() is true, as herdr/src/background.ts does."
        rm -f "$app_log"
        return 1
    fi
    rm -f "$app_log"
}

if command -v herdr-app >/dev/null 2>&1; then
    herdr_scratch=$(mktemp -d)
    mkdir "$herdr_scratch/home" "$herdr_scratch/inbox"
    cp "$DIR/herdr/mods/inbox/main.js" "$DIR/herdr/mods/inbox/mod.json" "$herdr_scratch/inbox/"
    check "herdr app check" herdr_app_check
    rm -rf "$herdr_scratch"
    herdr_scratch=
else
    echo "  - herdr app check: skipped, herdr-app is not installed"
fi

# A short fixed-seed fuzz run of the Herdr look, the omp panel and the shared row stepper. It exits 0 when every failure
# is one an open issue describes (KNOWN in fuzz/known.ts), no seed fails differently from its issue, and no seed whose issue is open passes. It runs only where the
# omp and herdr checks above could run, which already say what is missing. Its reports go to fuzz/out/, which Git ignores.
if command -v bun >/dev/null 2>&1 && [ -d "$DIR/omp/node_modules" ] && [ -d "$DIR/herdr/node_modules" ]; then
    check "fuzz" "$DIR/scripts/fuzz.sh" --seed 1 --runs 12 --shrinks 0
fi

# A pull request carries source only, and a bot commits the rebuilt bundles to next after it merges.
branch=$(git -C "$DIR" symbolic-ref -q --short HEAD || true)
case $branch in
'' | next | main) echo "  - source only: skipped, HEAD is ${branch:-detached}" ;;
*)
    if git -C "$DIR" rev-parse -q --verify origin/next >/dev/null; then
        check "source only" "$DIR/scripts/bundles.sh" source-only origin/next
    else
        echo "  x source only: not checked. Fetch next first: git fetch origin next"
        status=1
    fi
    ;;
esac

exit "$status"
