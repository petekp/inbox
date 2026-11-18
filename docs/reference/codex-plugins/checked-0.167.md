# Checked against Codex 0.167.0

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Checked on 2026-11-18, with the 0.167.0 CLI from npm, installed in a folder of
this worktree. A scratch `CODEX_HOME` and `HOME` held a link to the real
`auth.json`, a config that points at a local stand-in Responses server, and a
local marketplace for this repo with the plugin installed from it. The
stand-in answered each model request with a scripted tool call, so no check
called a real model. A script drove `codex app-server` over stdio. The inbox
server ran through a `CODEX_MCP_NODE_PATH` wrapper that logged its stdin.
Nothing here ran in the ChatGPT app. Issue: #368.

**MCP request metadata (#58378, #58395)**

`sessionOf` and `turnOf` in `codex/src/server-tools.ts` still read the right
fields [live 0.167.0]. `params._meta` of each `tools/call`:

| Call | `_meta` keys | Ids |
| --- | --- | --- |
| Model call, plain chat | `callId`, `x-codex-turn-metadata`, `plugin_id`, `threadId`, `sessionId`, `windowId`, `itemId`, `progressToken` | `session_id` = `thread_id` = `threadId` = `sessionId`; `turn_id` set |
| Model call, subagent chat | the same keys | `session_id` and `sessionId` are the root chat's, `thread_id` and `threadId` the subagent's, and `parent_thread_id` is the root's |
| Tab call (`mcpServer/tool/call`) | `threadId`, `progressToken` | `threadId` is the chat's id; no turn metadata |

- `plugin_id`, `sessionId`, `windowId` and `itemId` are new beside the 0.166.0
  shape. The inbox reads none of them. `sessionOf` already falls back from
  `session_id` to `threadId`, and `turnOf` already returns `undefined` for a
  call with `parent_thread_id` set.
- The turn metadata also holds `model`, `turn_started_at_unix_ms`, `sandbox`,
  `sandbox_mode`, `workspaces` and `codex_version`. The inbox ignores them.
- The app-server's `mcpToolCall` item reports `pluginId: "inbox@inbox"`.

**Plugin toggled mid-chat (#57974)**

Run on one chat: a model turn, a tab call, a subagent turn, the plugin
disabled, then enabled, then a tab call to `record`, a tab call to `inbox` and
a model turn [live 0.167.0].

- Disabling set `plugins."inbox@inbox".enabled = false` through the
  app-server's `config/value/write`. `mcpServerStatus/list` then listed no
  `inbox` server.
- Enabling it again listed `inbox` with its 7 tools. The `record` tab call
  answered "Recorded", and the `inbox` call listed all three findings
  recorded before and after, so the rows were kept. They live on disk, not in
  the server process.
- The model turn after the toggle called `record` with the chat's session id
  and a turn id, as before.
- Codex started a separate inbox server process for the subagent's thread.

**Not checked**

- Whether the open Inbox tab in the ChatGPT app reloads on its own after the
  toggle. The check reached the server only through the app-server.
- A tab or model call made while the plugin is disabled.
- Disabling through the app's settings screen instead of `config/value/write`.
