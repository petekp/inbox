# Live reload for the Codex tab

**Goal:** while `npm --prefix codex run dev` runs, a saved change to the tab shows in an open Codex Inbox tab within a few seconds. You don't reinstall, reopen the tab, or start a new chat. Changes to the server or hooks still need a reinstall.

## Why a change takes so long to show today

Three copies of the tab's page sit between a saved file and the screen:

1. **The build.** `codex/build.mjs` inlines the tab's script into `tab.html` and bundles that page into `plugin/dist/server.mjs` as a string.
2. **The install.** `codex plugin add` copies `plugin/` into `~/.codex/plugins/cache/inbox/inbox/0.1.0/`, and Codex runs the server from there.
3. **The running server.** Codex starts a server process and keeps it running. That process holds the page from its start in memory. Live on 2026-10-10, two servers started at 13:21 were still running after a 13:25 reinstall. The open tab kept drawing the old buttons.

The page also stays in the open tab. The MCP Apps docs tell hosts to treat a resource's URI as a cache key, so a reopened tab may get Codex's cached copy too.

## The design

1. **Dev build.** `npm --prefix codex run dev` rebuilds on every save. It also writes the finished page to `plugin/dist/tab.html`.
2. **Pointer file.** While it runs, the dev script writes `dev.json` into the plugin's data folder, `~/.codex/plugins/data/inbox-inbox/`. The file holds the path to that `tab.html`. The script deletes it on exit.
3. **Server.** On each call from the tab, the server checks for `dev.json`. When it exists, the server adds the page file's modified time to the view as `tabVersion`. A new app-only tool, `inbox_tab_page`, returns the page's text. With no `dev.json`, nothing changes.
4. **Tab.** The server stamps the page with its own version when it serves it. When a poll brings a different `tabVersion`, the tab fetches the page through `inbox_tab_page` and replaces its own document.

The installed server reads the worktree's files only while `dev.json` exists, and only the one path it names.

## Simpler options, and why they fall short

- **One command that rebuilds and reinstalls.** Running servers keep the old page in memory. You would still need a new chat or a restart, and the tab reopened.
- **The server reads the page from its install folder on every request.** This drops the restart, but only if Codex asks the server again when a tab reopens. Codex may serve its cached copy instead. You would still reinstall and reopen.

## What must be tested first

**Can the tab replace its own document and keep working?** The new page's script starts again and must reconnect to Codex: the MCP Apps `ui/initialize` handshake. Codex may refuse a second handshake from the same frame. The MCP Apps spec gives a view no way to ask the host to reload it (`docs/reference/mcp-apps.md`, the message table). If Codex refuses, step 4 changes: the tab shows "A new build is ready. Reopen the tab." That still removes the reinstall and the new chat, as long as Codex asks the server again when the tab reopens.

**Test:** install a test build whose tab replaces its document 10 seconds after it loads, then draws a marker. Pete starts a new chat, opens the Inbox tab, and waits 10 seconds. A screenshot shows whether the marker drew and whether a press still works.
