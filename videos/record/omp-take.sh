#!/bin/sh
# Starts omp for a take, in $TAKE_HOME/Projects/visor with HOME set to $TAKE_HOME. Run it through term.py:
#
#   python3 videos/record/term.py <video> <take> --size 100x30 --env TAKE_HOME=<folder> --env BUILD=<checkout> \
#     -- videos/record/omp-take.sh --model claude-opus-5-5 --thinking=high
#
# $BUILD is the checkout whose omp/dist/host.js the take shows. $TAKE_HOME must sit outside the temp folders, which
# omp marks as scratch, and outside any repo, whose AGENTS.md omp would read. Its .omp/agent/config.yml turns off
# omp's setup wizard, update check and Ask tool.
#
# As the agent evals do, omp runs under sandbox-exec, which lets omp and its shell write only under $TAKE_HOME and the
# temp folders. It gets only the environment it needs, with the Claude sign-in from your own omp profile, so the token
# never appears in a command line or a take's log.
token=$(omp token anthropic) || exit 1
home=$(cd "$TAKE_HOME" && pwd -P)
tmp=$(cd "${TMPDIR:-/tmp}" && pwd -P)
policy="(version 1)(allow default)(deny file-write*)(allow file-write* (subpath \"$home\") (subpath \"$tmp\") (subpath \"/private/tmp\") (subpath \"/private/var/folders\") (literal \"/dev/null\") (regex #\"^/dev/(tty|fd/|ttys)\"))"
cd "$home/Projects/visor" || exit 1
exec sandbox-exec -p "$policy" env -i PATH="$PATH" HOME="$home" TERM="$TERM" COLORTERM=truecolor LANG=en_US.UTF-8 \
  ANTHROPIC_OAUTH_TOKEN="$token" \
  omp --no-extensions -e "$BUILD/omp/dist/host.js" --no-lsp --no-skills --no-rules --no-title --approval-mode=yolo "$@"
