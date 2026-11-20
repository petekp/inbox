#!/bin/sh
# The two halves of the bot in .github/workflows/bundles.yml, which keeps next's committed bundles built from next's
# sources.
#
#   bundle-bot.sh build <dir>   in the checkout of next's tip, builds the bundles. When they differ from the committed
#                               ones, writes <dir>/bundles.patch and <dir>/base, the commit they were built from, and
#                               sets the step output changed=true.
#   bundle-bot.sh push <dir>    in a checkout of <dir>/base, applies the patch, commits it as "Rebuild bundles for
#                               <short sha>" and pushes it to next with the token in BUNDLE_PUSH_TOKEN. It runs no
#                               build and no installed tool, so no dependency's code sees the token.
#
# The push never forces. When next moved after the build, git refuses it, and push exits 0 without a commit: the push
# that moved next started its own run, which builds the new tip. So every bundle commit is built from exactly its
# parent.

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
cd "$DIR"

[ $# -eq 2 ] || {
    echo "Usage: ./scripts/bundle-bot.sh build <dir> | push <dir>" >&2
    exit 1
}
out=$2
dirs=$(./scripts/bundles.sh dirs)

case $1 in
build)
    mkdir -p "$out"
    base=$(git rev-parse HEAD)
    echo "Building the bundles for $(git rev-parse --short HEAD)"
    ./scripts/bundles.sh build
    # git add with a folder stages new, changed and removed files under it.
    # shellcheck disable=SC2086
    git add -- $dirs
    if git diff --cached --quiet; then
        echo "The bundles match the sources. Nothing to commit."
        changed=false
    else
        git diff --cached --stat
        git diff --cached --binary >"$out/bundles.patch"
        echo "$base" >"$out/base"
        changed=true
    fi
    [ -z "${GITHUB_OUTPUT:-}" ] || echo "changed=$changed" >>"$GITHUB_OUTPUT"
    ;;
push)
    [ -n "${BUNDLE_PUSH_TOKEN:-}" ] || {
        echo "bundle-bot: BUNDLE_PUSH_TOKEN is not set." >&2
        exit 1
    }
    base=$(cat "$out/base")
    [ "$(git rev-parse HEAD)" = "$base" ] || {
        echo "bundle-bot: the checkout is not at $base, the commit the bundles were built from." >&2
        exit 1
    }
    short=$(git rev-parse --short HEAD)
    git apply --index "$out/bundles.patch"
    git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
        commit --quiet -m "Rebuild bundles for $short"
    auth=$(printf 'x-access-token:%s' "$BUNDLE_PUSH_TOKEN" | base64 | tr -d '\n')
    echo "::add-mask::$auth"
    if git -c http.extraheader="AUTHORIZATION: basic $auth" push origin HEAD:refs/heads/next; then
        echo "Pushed $(git rev-parse --short HEAD), the bundles for $short."
        exit 0
    fi
    tip=$(git ls-remote origin refs/heads/next | cut -f1)
    if [ "$tip" = "$base" ]; then
        echo "bundle-bot: the push was refused, and next has not moved." >&2
        exit 1
    fi
    echo "next moved to $tip after the build, so the push was refused. The run for that push builds the new tip."
    ;;
*)
    echo "Usage: ./scripts/bundle-bot.sh build <dir> | push <dir>" >&2
    exit 1
    ;;
esac
