# Inbox for Codex

The inbox as a plugin for the Codex desktop app. It keeps one list of what
waits on you in a conversation: Codex's questions, the tasks only you can do,
checks Codex left failing, and the findings Codex recorded. The list shows in
an Inbox tab beside the conversation, and its buttons send your answer to
Codex as your own message.

Status: first version. A full session ran through `codex exec`. A session in
the desktop app, with the tab open, has not been tried yet.

## Install

```sh
codex plugin marketplace add petekp/inbox
codex plugin add inbox@inbox
```

Without a `codex` command on your PATH, run the one inside the desktop app:

```sh
/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
```

Then, in the desktop app:

1. Trust the plugin's hooks when Codex asks. Codex runs a plugin's hooks only
   after you trust them, and asks again after an update that changes them.
   The hooks give Codex the inbox at each prompt, record the checks it runs,
   and update the inbox after each reply.
2. Open the Inbox tab beside the conversation.

## What it costs

After each reply, the plugin asks a model to update the inbox. It runs the
`codex` binary inside the desktop app, so it uses your Codex sign-in and
counts toward your plan's usage: about 16,000 input tokens per reply, most of
them the base instructions every `codex exec` call includes.

## Needs

- The Codex desktop app on macOS.
- Node.js on your PATH. The hooks and the plugin's server run with `node`.

## Working on it

The source is in `src/`, and the plugin Codex installs is `plugin/`. The
plugin shares `ledger.ts`, `checks.ts`, `check-tracking.ts` and `git.ts` with
the Claude Code mod in `../hooks`, and esbuild bundles them into
`plugin/dist`. The bundles are committed, since an install copies the folder
and runs no build.

```sh
npm ci           # once
npm run build    # after changing src/ or the shared modules
npm test
```

`../scripts/check.sh` checks the bundles are current, the types and the
tests. The design and what was measured are in
[docs/plans/codex-plugin.md](../docs/plans/codex-plugin.md).
