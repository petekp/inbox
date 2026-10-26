#!/bin/sh
# Merges origin/next into the current branch and rebuilds the committed bundles from the merged sources, so nobody
# resolves a bundle by hand. The bundles are the files Git tracks in the folders the builds write: codex/plugin/dist
# (codex/build.mjs) and omp/dist (omp/build.ts). The Codex tab page is one long line of
# codex/plugin/dist/server-handler.mjs, so two branches that change what the tab draws conflict on that line.
#
# - A clean merge: rebuilds anyway, since a text merge of two bundles can be wrong without conflicting, and commits
#   any bundle the rebuild changed as its own commit.
# - Only bundles conflict: rebuilds them and finishes the merge commit.
# - A source file conflicts: stops with the merge in progress and lists the files. Resolve each, stage it with
#   git add, and run the script again with --continue, which rebuilds the bundles and finishes the merge.
#
# Then it runs ./scripts/check.sh, writes its output to .scratch/merge-next-check.log, and exits with its status. It
# exits 1 when it stops before that. It never pushes.
#
# Installs a look's tools, with the commands check.sh names, when they are missing or the merge changed the look's
# lockfile, since a rebuild with older tools writes bundles that differ from next's. Needs git, npm and bun.
#
# Usage: ./scripts/merge-next.sh [--from <ref>]
#        ./scripts/merge-next.sh --continue
# --from merges <ref> in place of origin/next.

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
BUNDLE_DIRS='codex/plugin/dist omp/dist'
SCRIPT=./scripts/merge-next.sh
from=origin/next
resume=0

fail() {
    echo "merge-next: $*" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case $1 in
    --continue) resume=1 ;;
    --from)
        [ $# -ge 2 ] || fail "--from needs a ref."
        from=$2
        shift
        ;;
    *) fail "Unknown option $1. Usage: $SCRIPT [--from <ref>], or $SCRIPT --continue" ;;
    esac
    shift
done

cd "$DIR"

is_bundle() {
    for dir in $BUNDLE_DIRS; do
        case $1 in "$dir"/*) return 0 ;; esac
    done
    return 1
}

# Prints the paths on stdin that are not bundles.
sources_only() {
    while IFS= read -r path; do
        is_bundle "$path" || echo "$path"
    done
}

is_merging() {
    git rev-parse -q --verify MERGE_HEAD >/dev/null
}

# Prints why the tools in folder $1 need installing, given its lockfile $2, or nothing when they are current. Git sets
# ORIG_HEAD to the branch as it was before the merge.
install_reason() {
    if [ ! -d "$1/node_modules" ]; then
        echo "they are missing"
    elif ! git diff --quiet ORIG_HEAD -- "$2"; then
        echo "the merge changed $2"
    fi
}

rebuild() {
    reason=$(install_reason codex codex/package-lock.json)
    if [ -n "$reason" ]; then
        echo "Installing the Codex plugin's tools: $reason"
        npm --prefix "$DIR/codex" ci || return 1
    fi
    reason=$(install_reason omp omp/bun.lock)
    if [ -n "$reason" ]; then
        echo "Installing the omp extension's tools: $reason"
        bun install --cwd "$DIR/omp" --frozen-lockfile --ignore-scripts || return 1
    fi
    echo "Rebuilding the bundles"
    npm --prefix "$DIR/codex" run --silent build || return 1
    npm --prefix "$DIR/omp" run --silent build || return 1
}

branch=$(git symbolic-ref -q --short HEAD) || fail "HEAD is not on a branch. Check out the PR branch first."
case $branch in
next | main) fail "This is $branch. Run it on a PR branch." ;;
esac
command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v bun >/dev/null 2>&1 || fail "Bun is not installed: https://bun.sh"

if [ "$resume" = 1 ]; then
    is_merging || fail "No merge is in progress. To merge again, run $SCRIPT without --continue."
    # The bundles are built from the working tree and committed from the index, so every source must be staged.
    unresolved=$({
        git diff --name-only
        git ls-files --others --exclude-standard
    } | sources_only | sort -u)
    if [ -n "$unresolved" ]; then
        echo "merge-next: These files are not resolved and staged:" >&2
        echo "$unresolved" | sed 's/^/  /' >&2
        fail "Resolve each, stage it with git add, then run $SCRIPT --continue."
    fi
else
    if is_merging; then
        fail "A merge is already in progress. Finish it with $SCRIPT --continue, or stop it with git merge --abort."
    fi
    changes=$(git status --porcelain)
    if [ -n "$changes" ]; then
        echo "merge-next: The tree has changes:" >&2
        echo "$changes" | sed 's/^/  /' >&2
        fail "Commit them or move them aside first."
    fi
    git fetch origin
    if ! git merge --no-edit "$from"; then
        is_merging || fail "Git could not merge $from."
        conflicts=$(git diff --name-only --diff-filter=U | sources_only)
        if [ -n "$conflicts" ]; then
            echo "merge-next: These source files conflict:" >&2
            echo "$conflicts" | sed 's/^/  /' >&2
            echo "merge-next: The merge is still in progress. Leave the bundles: --continue rebuilds them." >&2
            fail "Resolve each source file, stage it with git add, then run $SCRIPT --continue."
        fi
        echo "Only bundles conflict."
    fi
fi

if is_merging; then
    rebuild ||
        fail "The build failed, and the merge is still in progress. Fix the sources, stage them with git add, then run $SCRIPT --continue."
    git add -- $(git ls-files -- $BUNDLE_DIRS | sort -u)
    git commit --no-edit --cleanup=strip
else
    rebuild || fail "The build failed after the merge. Fix the sources, commit them, then run $SCRIPT again."
    rebuilt=$(git diff --name-only -- $BUNDLE_DIRS)
    if [ -n "$rebuilt" ]; then
        git add -- $rebuilt
        git commit -m "Rebuild the bundles after merging $from"
    else
        echo "The rebuild changed no bundle."
    fi
fi

mkdir -p .scratch
log="$DIR/.scratch/merge-next-check.log"
echo "Running ./scripts/check.sh"
if ./scripts/check.sh >"$log" 2>&1; then
    status=0
else
    status=$?
fi
grep -v '^      ' "$log" || true
echo "check.sh exited $status. Its output: $log"
exit "$status"
