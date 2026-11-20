#!/bin/sh
# Rebuilds the bundles from the tip of next and pushes them to next as one commit, "Rebuild bundles for <short sha>",
# when they differ from the committed ones. .github/workflows/bundles.yml runs it after each push to next.
#
# Each try builds from the latest next. When a push lands on next during the build, git push is refused, and the next
# try builds again from the new tip, so every bundle commit is built from exactly its parent. It never force-pushes.
#
# The token in BUNDLE_PUSH_TOKEN reaches only git push. The builds run without it.
#
# Usage: BUNDLE_PUSH_TOKEN=<token> ./scripts/bundle-bot.sh

set -eu

DIR=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
TRIES=5
cd "$DIR"

[ -n "${BUNDLE_PUSH_TOKEN:-}" ] || {
    echo "bundle-bot: BUNDLE_PUSH_TOKEN is not set." >&2
    exit 1
}
auth=$(printf 'x-access-token:%s' "$BUNDLE_PUSH_TOKEN" | base64 | tr -d '\n')
echo "::add-mask::$auth"
dirs=$(./scripts/bundles.sh dirs)

try=1
while [ "$try" -le "$TRIES" ]; do
    git fetch --quiet origin next
    git reset --quiet --hard origin/next
    base=$(git rev-parse --short HEAD)
    echo "Try $try: building the bundles for $base"
    env -u BUNDLE_PUSH_TOKEN ./scripts/bundles.sh build
    # git add with a folder stages new, changed and removed files under it.
    # shellcheck disable=SC2086
    git add -- $dirs
    if git diff --cached --quiet; then
        echo "The bundles for $base match its sources. Nothing to commit."
        exit 0
    fi
    git diff --cached --stat
    git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
        commit --quiet -m "Rebuild bundles for $base"
    if git -c http.extraheader="AUTHORIZATION: basic $auth" push origin HEAD:refs/heads/next; then
        echo "Pushed $(git rev-parse --short HEAD), the bundles for $base."
        exit 0
    fi
    git fetch --quiet origin next
    if [ "$(git rev-parse --short origin/next)" = "$base" ]; then
        echo "bundle-bot: the push was refused, and next has not moved." >&2
        exit 1
    fi
    echo "next moved during the build, so the push was refused. Building again from the new tip."
    try=$((try + 1))
done
echo "bundle-bot: next kept moving, and $TRIES tries could not push. The next push to next runs this again." >&2
exit 1
