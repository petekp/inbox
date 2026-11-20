#!/bin/sh
# The built bundles: the files Git tracks in the folders the builds write, codex/plugin/dist (codex/build.mjs), omp/dist
# (omp/build.ts) and herdr/mod/inbox (herdr/build.ts, which also writes codex/plugin/dist/herdr-mod and
# omp/dist/herdr-mod). An install runs no build, so next and main commit them. A pull request carries source only: after
# each push to next, .github/workflows/bundles.yml rebuilds them and commits any change, with scripts/bundle-bot.sh.
# A commit whose message holds [skip ci] starts no workflow, so its bundles wait for the next push.
#
# Usage:
#   ./scripts/bundles.sh build                 rebuilds every bundle in the working tree
#   ./scripts/bundles.sh check                 exits 1 when a committed bundle does not match its sources, and when
#                                              the working tree's bundles differ from HEAD's
#   ./scripts/bundles.sh source-only [<base>]  exits 1 when the commits since <base> change a bundle. <base> defaults to
#                                              origin/next, and the commits are those since its merge base with HEAD.
#   ./scripts/bundles.sh restore               puts every bundle back to HEAD's copy, in the index and working tree
#   ./scripts/bundles.sh dirs                  prints the bundle folders
#
# build and check need each look's tools installed, with the commands scripts/check.sh names.

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
BUNDLE_DIRS='codex/plugin/dist omp/dist herdr/mod/inbox'

cd "$DIR"

case ${1:-} in
build)
    npm --prefix "$DIR/codex" run --silent build
    npm --prefix "$DIR/omp" run --silent build
    npm --prefix "$DIR/herdr" run --silent build
    ;;
check)
    # The builds' --check compares the bundle files on disk, so a local build would hide a stale committed bundle.
    # shellcheck disable=SC2086
    if ! git diff --quiet HEAD -- $BUNDLE_DIRS; then
        echo "bundles: the working tree's bundles differ from HEAD's, so this cannot check the committed ones." >&2
        echo "Put them back first: ./scripts/bundles.sh restore" >&2
        exit 1
    fi
    status=0
    npm --prefix "$DIR/codex" run --silent check || status=1
    npm --prefix "$DIR/omp" run --silent check || status=1
    npm --prefix "$DIR/herdr" run --silent check || status=1
    exit "$status"
    ;;
source-only)
    base=${2:-origin/next}
    git rev-parse -q --verify "$base^{commit}" >/dev/null || {
        echo "bundles: $base is not a commit here. Fetch it first: git fetch origin" >&2
        exit 1
    }
    # shellcheck disable=SC2086
    changed=$(git diff --name-only "$base...HEAD" -- $BUNDLE_DIRS)
    if [ -n "$changed" ]; then
        echo "These commits change built bundles:"
        echo "$changed" | sed 's/^/  /'
        echo "A pull request carries source only. After it merges, a bot rebuilds the bundles on next and commits them."
        echo "Fix: ./scripts/merge-next.sh takes next's bundles. Or run"
        echo "  git restore --source=\"\$(git merge-base origin/next HEAD)\" --staged --worktree -- $BUNDLE_DIRS"
        echo "and commit the result."
        exit 1
    fi
    ;;
restore)
    # shellcheck disable=SC2086
    git restore --source=HEAD --staged --worktree -- $BUNDLE_DIRS
    ;;
dirs)
    echo "$BUNDLE_DIRS"
    ;;
*)
    echo "Usage: ./scripts/bundles.sh build | check | source-only [<base>] | restore | dirs" >&2
    exit 1
    ;;
esac
