#!/bin/sh
# Runs only the named mod test files with `claude plugin test`, and exits with
# its status. `claude plugin test` runs every test file in a plugin folder and
# refuses symlinks, so this copies what the tests import into a temporary
# folder outside the repo: the manifest, core/, hooks/, types/, evals/, the sources of
# codex/ and omp/ that evals/ imports, the helper files in tests/ and the named
# tests. The folder is removed on exit. A fuzz file, fuzz/**/*.fuzz.ts, runs as a
# test there, beside the sources in fuzz/.
#
# Works from any worktree. Paths are relative to the repo root, or absolute.
#
# Usage: ./scripts/test-files.sh tests/pr-fetch.test.ts tests/status-idle.test.ts

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)

if [ "$#" -eq 0 ]; then
    echo "usage: scripts/test-files.sh tests/<name>.test.ts ..." >&2
    exit 2
fi

names=
for arg in "$@"; do
    case $arg in
    /*) file=$arg ;;
    *) file=$DIR/$arg ;;
    esac
    case $file in
    "$DIR"/tests/*.test.ts | "$DIR"/tests/*.test.tsx | "$DIR"/fuzz/*.fuzz.ts) ;;
    *)
        echo "  x not a mod test file under tests/ or a fuzz file under fuzz/: $arg" >&2
        exit 2
        ;;
    esac
    if [ ! -f "$file" ]; then
        echo "  x no such test file: $arg" >&2
        exit 2
    fi
    names="$names ${file#"$DIR"/}"
done

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

cp -R "$DIR/.claude-plugin" "$DIR/core" "$DIR/hooks" "$DIR/types" "$DIR/package.json" "$DIR/tsconfig.json" "$scratch/"
# Copies the files under $1 to the same place under $scratch, leaving out
# test files, which would all run, and installed or generated folders.
copy_sources() {
    # shellcheck disable=SC2016
    (cd "$DIR" && find "$1" -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -path '*/node_modules/*' \
        ! -path 'evals/results/*' ! -path 'fuzz/out/*' -print0 |
        xargs -0 -I{} sh -c 'mkdir -p "$2/$(dirname "$1")" && cp "$1" "$2/$1"' _ {} "$scratch")
}
copy_sources evals
copy_sources tests
copy_sources codex/src
copy_sources omp/src
copy_sources fuzz
for name in $names; do
    case $name in
    fuzz/*) cp "$DIR/$name" "$scratch/tests/$(basename "$name" .fuzz.ts).test.ts" ;;
    *) cp "$DIR/$name" "$scratch/$name" ;;
    esac
done

status=0
claude plugin test "$scratch" || status=$?
exit "$status"
