#!/usr/bin/env bash
# Fuzzes the looks' drawing and motion with generated sessions and events. See docs/plans/ui-fuzz.md.
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun fuzz/run.ts "$@"
