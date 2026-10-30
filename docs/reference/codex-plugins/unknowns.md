# Unknown, and how to check

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Each check below is concrete. Run it in a scratch `CODEX_HOME` where it would
otherwise write to real state.

| Question | Check |
| --- | --- |
| Does `codex queue --thread` need the fork's own id? (Forks send their own id in hooks and MCP calls: see "Session, thread and turn ids".) | Fork a desktop chat (`/fork`, `/side`), then press a button in the fork and see which chat receives the message. |
| Do MCP server processes receive `PLUGIN_DATA`, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_*`, `CODEX_CLI_PATH`, `CODEX_MCP_NODE_PATH`? | Log `process.env` keys at server start, in the desktop app and in the CLI. Repeat with a portable `mcp.json` (`type: "stdio"`). |
| Is per-tool `approval_mode` honored in `.mcp.json`? Which `config.toml` key form works (`inbox` or `inbox@inbox`)? | Set `tools.inbox_press.approval_mode = "prompt"` in a scratch `.mcp.json`, call through app-server `mcpServer/tool/call`. Then try both `config.toml` forms. |
| What do `auto` and `approve` mean exactly? Does `approve` override `destructiveHint: true`? | Give a test tool `destructiveHint: true` with `approve` and watch for a prompt. |
| When is the cache folder `local` vs the version? Does a same-version reinstall overwrite? Are old folders deleted? | Change only file content, reinstall, compare `ls -la` timestamps under `~/.codex/plugins/cache/inbox/inbox/`. |
| Is the data folder `<plugin>-<market>` or `<market>-<plugin>`? Where is it for Git and npm installs? | Install a scratch plugin whose plugin and marketplace names differ, from a local, a Git and an npm source; `ls ~/.codex/plugins/data`. |
| Do hooks and the `exec` update fire in Codex CLI and local Work threads? | Run `codex` with the plugin enabled and open a local Work thread; look for new session files in the data folder. |
| Do hooks and MCP servers run inside the sandbox? | Under workspace-write, write outside the workspace and open a network connection from a hook and from the server. |
| Does Codex send `ui/notifications/tool-result` to a thread-entrypoint view? | Add a handler in the tab that records arrival time relative to `initialized`. |
| Does the model see the tab's `structuredContent`? | Open the tab, ask the model what the inbox tool returned, and inspect the transcript JSONL. |
| What does Codex send in `initialize` (`extensions`, `protocolVersion`) and does it call `server/discover`? | Log raw `initialize` params and every method name for one session. Also try declaring `extensions["io.modelcontextprotocol/ui"]` server-side. |
| What is in `ui/initialize`'s result (`hostCapabilities`, `displayMode`, `platform`, draft keys)? | Dump it to the tab's debug view or a server log. |
| Which `_meta` keys reach the server and the widget (`openai/session`, `openai/widgetSessionId`)? | Log `params._meta` on `tools/call`, and the `_meta` of each result the tab receives. |
| Does Codex hide `visibility: ["app"]` tools from the model, and reject app calls to model-only tools? | Ask the model to list or call `inbox_press`; call `record` from the tab. |
| Is `ui/update-model-context` supported in Codex tabs, and is it marked untrusted? | Send a text block, ask the model to repeat it, inspect the transcript wrapper and composer. |
| Does Codex send `ui/resource-teardown` and `host-context-changed`? | Log both; toggle the theme and resize the panel. |
| Do `ui/request-display-mode`, entrypoint `icons`, a distinct title, `ui/open-link` and `clipboardWrite` work in the Codex tab? | Try each in a copy of the plugin and compare. |
| Does a global entrypoint get its own thread, and do its `ui/message` calls start turns there? | Add `{type: "global"}` to a copy and press a message button. |
| Does Codex show structured settings for a local plugin? | Add a minimal `openai/settings` capability with read and update tools. |
| Does any Claude client (terminal, desktop Code mode, desktop Claude mode) render MCP Apps from a plugin's server? | Install a minimal `ui://` tool in each and ask the model to call it. |
| Does the desktop app use the daemon `codex queue` finds? What happens when the app is closed? | Quit the app, run `codex queue`, reopen. Run `codex doctor`. |
| Do `codex queue` messages show above the composer as editable items? | Queue during a busy turn and look. |
| Does Activity view include Codex chats? What counts as "waiting for your response"? | Leave an approval pending and an open question in a Codex chat, then open Activity view. |
| Does PermissionRequest fire before automatic review under "Approve for me"? | Log it under each permission mode and compare with what the person sees. |
| How does an `mcp_tool` hook's result map to hook output? | Build a UserPromptSubmit `mcp_tool` hook that returns JSON; check whether the model gets the context. |
| Does Codex re-read MCP `instructions` after compaction or resume? | Put a marker sentence in `instructions`, compact, ask about it. |
| Does a slow server miss the first turn's tool catalog? | Add `sleep 2` before server start; list tools on turns one and two. |
| Is a detached child of a synchronous Stop hook killed at session end? Does an `async` Stop hook survive closing the app? | Start a long update, close the app, read its log. |
| Does `non_prefixed_mcp_tool_names` change hook `tool_name`? | `codex --enable non_prefixed_mcp_tool_names` with a PreToolUse logger. |
| Can plain stdout exceed the 2,500-token default? | Emit 20k tokens of stdout from SessionStart with `additionalContextLimit: 0`. |
| Is `thread/attachment/*` written by the desktop PR panel? | Open a PR from a desktop chat; call `thread/attachment/list` for that thread. |
| Does `codex://threads/<id>` open Worktree and Cloud chats? | Try it with ids of each kind. |
| Is the `exec` cost floor the same on 0.162.0 with GPT-6.1 Sol? | Rerun the plan's measurement. |
| How does a missing `interface.displayName` show in the Plugins Directory? | Open Plugins, then Personal, and read the source label. |
| Can an `onboardingSkill` run for a local install and walk the person through hook trust? | Add `extensions.com.openai.onboardingSkill` to a scratch copy. |
| Which marketplace file does a workspace GitHub import read when both exist? | Import this repo in a test workspace's Admin > Plugins. |
| Does `restrict_to_allowed_sources` hide an already-configured local marketplace? | Needs `/etc/codex/requirements.toml` (admin rights, affects every Codex session on the Mac) or a test workspace's Agent Security policy. |
| Will paginated history or compression change `transcript_path` contents? | Recheck row types and file extension after each Codex update. |
| Does Codex read a portable root `plugin.json` and `mcp.json` next to a Claude Code plugin's files? | Add both to a scratch copy and install it. |
| When does `enable_mcp_apps` leave Under development, and is `thread/queue/add` deprecated? | Read `features/src/lib.rs` and the `#[experimental]` markers in `common.rs` each release. |
