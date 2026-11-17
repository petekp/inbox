#!/bin/sh
# Serves the built Codex tab, with demo data, in a local page that sends Codex's real host colors.
# Usage: codex/scripts/tab-page.sh [port] [handler]
# Open /?theme=light or /?theme=dark. Add &colors=fallback to send no host colors. A new &thread=<id> shows a fresh demo.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
port=${1:-4700}
handler=${2:-$here/../plugin/dist/server-handler.mjs}
node_bin=$(node -p process.execPath)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT INT TERM
mkdir "$scratch/home" "$scratch/codex" "$scratch/data"
env -i HOME="$scratch/home" CODEX_HOME="$scratch/codex" XDG_STATE_HOME="$scratch/home/state" \
  PATH=/usr/bin:/bin \
  "$node_bin" "$here/tab-page.mjs" "$handler" "$scratch/data" "$port"
