# Inbox for Codex

The inbox as a plugin for Codex in the ChatGPT desktop app. It keeps one list
of what waits on you in a conversation: Codex's questions, the tasks only you
can do, the findings Codex recorded, and the PRs of the conversation and your
branch. The list shows in an Inbox tab beside the conversation, and its
buttons send your answer to Codex as your own message.

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

1. Trust the plugin's hooks. Codex runs a plugin's hooks only after you
   trust them. Since Codex 0.164.0 the trust covers every file in the plugin,
   so an update stops the hooks until you trust them again. Click the hook icon beside the
   prompt's approval setting, then Allow all. If the icon isn't there, open Settings,
   then Hooks, then Inbox, then Trust all.
   The hooks give Codex the inbox at each prompt, record what it does, and
   update the inbox after each reply.
2. Open the Inbox tab: press + at the top right of the window to open the
   side panel, then choose More tools, then Inbox.

To update, run `codex plugin marketplace upgrade`, then
`codex plugin add inbox@inbox`, and start a new chat. On Codex 0.164.0 and
later, trust the plugin's hooks again, as in step 1. Until you do, the hooks do not run, and the
Inbox tab says Codex stopped them.

## What it costs

After each reply, the plugin asks a model to update the inbox. It runs the
`codex` binary inside the desktop app, so it uses your Codex sign-in and
counts toward your plan's usage. It makes two calls per reply. Each carries
about 12,000 input tokens of base instructions, which every `codex exec` call
includes, plus its own prompt. The earlier single call came to about 16,000.

## Needs

- The ChatGPT desktop app on macOS. The hooks and the plugin's server run on
  the Node.js the app ships with, or on `node` from your PATH outside the app.

## Working on it

The source is in `src/`, and the plugin Codex installs is `plugin/`. The
plugin shares the modules `docs/looks.md` lists as shared with the Claude Code
mod in `../hooks`, and esbuild bundles them into `plugin/dist`. The bundles
are committed, since an install copies the folder and runs no build.

```sh
npm ci           # once
npm run build    # after changing src/ or the shared modules
npm test
```

A change shows in Codex after `npm run build`, a reinstall with
`codex plugin add inbox@inbox`, and a new chat.

To change the tab or the server while you watch them, run `npm run dev`. On
each save it rebuilds the tab's page and the server's handler, and points the
installed plugin's server at both. An open Inbox tab swaps to the new page
within a few seconds, and the server's next call runs the new handler. The
tab can swap only if its own page came from a build that has this feature.

Codex keeps a plugin's server process running across reinstalls and new
chats. That process is a small loader, `src/server-main.ts`, which imports the
handler, `dist/server-handler.mjs`, again whenever its file changes. Codex
installs each version in its own folder and deletes the old one on update, so
once the loader's own folder is gone it imports the handler from the newest
version's folder. So a build, a reinstall and an update take effect without
restarting Codex. Codex removes an open tab once the server's tool list
names another address for its page, so every build lists the same address,
and an open tab swaps to the new build's page itself. Codex also drops a tab
whose page comes back under another address than the one it asked for, so
the server answers under the address asked for. Only a change to the loader
itself needs Codex quit and reopened. The tab says when its page and the running handler
come from different builds.

`../scripts/check.sh` checks the bundles are current, the types and the
tests. The design and what was measured are in
[docs/plans/codex-plugin.md](../docs/plans/codex-plugin.md).
