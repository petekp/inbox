#!/bin/sh
# Runs only the named mod test files with `claude plugin test`, and exits with
# its status. `claude plugin test` runs every test file in a plugin folder and
# refuses symlinks, so this copies what the tests import into a temporary
# folder outside the repo: the manifest, hooks/, types/, evals/, the sources of
# codex/ and omp/ that evals/ imports, the helper files in tests/ and the named
# tests. The folder is removed on exit.
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
    "$DIR"/tests/*.test.ts | "$DIR"/tests/*.test.tsx) ;;
    *)
        echo "  x not a mod test file under tests/: $arg" >&2
        exit 2
        ;;
    esac
    if [ ! -f "$file" ]; then
        echo "  x no such test file: $arg" >&2
        exit 2
    fi
    names="$names ${file#"$DIR"/tests/}"
done

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

cp -R "$DIR/.claude-plugin" "$DIR/hooks" "$DIR/types" "$DIR/package.json" "$DIR/tsconfig.json" "$scratch/"
# Copies the files under $1 to the same place under $scratch, leaving out
# test files, which would all run, and installed or generated folders.
copy_sources() {
    # shellcheck disable=SC2016
    (cd "$DIR" && find "$1" -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -path '*/node_modules/*' \
        ! -path 'evals/results/*' -print0 |
        xargs -0 -I{} sh -c 'mkdir -p "$2/$(dirname "$1")" && cp "$1" "$2/$1"' _ {} "$scratch")
}
copy_sources evals
copy_sources tests
copy_sources codex/src
copy_sources omp/src
for name in $names; do
    cp "$DIR/tests/$name" "$scratch/tests/$name"
done

status=0
claude plugin test "$scratch" || status=$?
exit "$status"
