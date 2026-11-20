#!/bin/sh
# Merges origin/next into the current branch and takes next's built bundles, so the branch carries source only and
# nobody resolves a bundle by hand. scripts/bundles.sh lists the bundles. A bot commits them to next after each merge,
# so next's copies are built from next's sources.
#
# - First it puts the bundles back to the branch's committed copies, since a local build changes them. A build
#   makes them again.
# - Nothing to merge: sets every bundle to next's copy, as a clean merge does. When that changes nothing, says so and
#   exits 0, without checking.
# - A clean merge: sets every bundle to next's copy, and commits that as its own commit when it differs, as on a
#   branch whose earlier commits changed a bundle.
# - Only bundles conflict: takes next's copies and finishes the merge commit.
# - A source file conflicts: stops with the merge in progress and lists the files. Resolve each, stage it with
#   git add, and run the script again with --continue, which takes next's bundles and finishes the merge.
#
# Then it runs ./scripts/check.sh, which builds the bundles into the working tree, writes its output to
# .scratch/merge-next-check.log, and exits with its status. With --no-check it skips check.sh and exits 0 after the
# merge, for a round of merges that runs check.sh once at the end. It exits 1 when it stops before that. It never
# pushes.
#
# Installs a look's tools, with the commands check.sh names, when they are missing or the merge changed the look's
# lockfile, so check.sh builds with next's tools. Needs git, npm and bun.
#
# Usage: ./scripts/merge-next.sh [--from <ref>] [--no-check]
#        ./scripts/merge-next.sh --continue [--no-check]
# --from merges <ref> in place of origin/next.

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
BUNDLE_DIRS=$("$DIR/scripts/bundles.sh" dirs)
SCRIPT=./scripts/merge-next.sh
from=origin/next
resume=0
check=1

fail() {
    echo "merge-next: $*" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case $1 in
    --continue) resume=1 ;;
    --no-check) check=0 ;;
    --from)
        [ $# -ge 2 ] || fail "--from needs a ref."
        from=$2
        shift
        ;;
    *) fail "Unknown option $1. Usage: $SCRIPT [--from <ref>] [--no-check], or $SCRIPT --continue [--no-check]" ;;
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

install_tools() {
    reason=$(install_reason . package-lock.json)
    if [ -n "$reason" ]; then
        echo "Installing the root tools: $reason"
        npm --prefix "$DIR" ci --ignore-scripts || return 1
    fi
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
    reason=$(install_reason herdr herdr/bun.lock)
    if [ -n "$reason" ]; then
        echo "Installing the Herdr look's tools: $reason"
        bun install --cwd "$DIR/herdr" --frozen-lockfile --ignore-scripts || return 1
    fi
}

# Sets every bundle, in the index and the working tree, to the merged commit's copy: MERGE_HEAD while the merge is in
# progress, else $from. It resolves a bundle in conflict, and removes a bundle file the merged commit does not have.
take_bundles() {
    merged=$(git rev-parse -q --verify MERGE_HEAD || git rev-parse --verify "$from^{commit}")
    # shellcheck disable=SC2086
    git restore --source="$merged" --staged --worktree -- $BUNDLE_DIRS
}

branch=$(git symbolic-ref -q --short HEAD) || fail "HEAD is not on a branch. Check out the PR branch first."
case $branch in
next | main) fail "This is $branch. Run it on a PR branch." ;;
esac
resume_with="$SCRIPT --continue"
[ "$check" = 1 ] || resume_with="$resume_with --no-check"

command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v bun >/dev/null 2>&1 || fail "Bun is not installed: https://bun.sh"

if [ "$resume" = 1 ]; then
    is_merging || fail "No merge is in progress. To merge again, run $SCRIPT without --continue."
    # The merge commits the index, so every source must be staged.
    unresolved=$({
        git diff --name-only
        git ls-files --others --exclude-standard
    } | sources_only | sort -u)
    if [ -n "$unresolved" ]; then
        echo "merge-next: These files are not resolved and staged:" >&2
        echo "$unresolved" | sed 's/^/  /' >&2
        fail "Resolve each, stage it with git add, then run $resume_with."
    fi
else
    if is_merging; then
        fail "A merge is already in progress. Finish it with $SCRIPT --continue, or stop it with git merge --abort."
    fi
    # shellcheck disable=SC2086
    git restore --source=HEAD --staged --worktree -- $BUNDLE_DIRS
    changes=$(git status --porcelain)
    if [ -n "$changes" ]; then
        echo "merge-next: The tree has changes:" >&2
        echo "$changes" | sed 's/^/  /' >&2
        fail "Commit them or move them aside first."
    fi
    git fetch origin
    before=$(git rev-parse HEAD)
    if ! git merge --no-edit "$from"; then
        is_merging || fail "Git could not merge $from."
        conflicts=$(git diff --name-only --diff-filter=U | sources_only)
        if [ -n "$conflicts" ]; then
            echo "merge-next: These source files conflict:" >&2
            echo "$conflicts" | sed 's/^/  /' >&2
            echo "merge-next: The merge is still in progress. Leave the bundles: --continue takes next's." >&2
            fail "Resolve each source file, stage it with git add, then run $resume_with."
        fi
        echo "Only bundles conflict."
    fi
    if ! is_merging && [ "$(git rev-parse HEAD)" = "$before" ]; then
        take_bundles
        if git diff --cached --quiet; then
            echo "Nothing merged from $from, and the bundles match it, so nothing to check."
            exit 0
        fi
        echo "Nothing merged from $from, but this branch's commits changed its bundles."
    fi
fi

take_bundles
if is_merging; then
    git commit --no-edit --cleanup=strip
elif git diff --cached --quiet; then
    echo "The bundles already match $from."
else
    git commit -m "Take the bundles from $from"
fi
install_tools || fail "Installing the tools failed. The merge is committed. Install them with the commands check.sh names."

if [ "$check" = 0 ]; then
    echo "Skipped ./scripts/check.sh (--no-check)."
    exit 0
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
