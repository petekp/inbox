# Checked against Codex 0.166.0

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Checked on 2026-10-29, with the CLI from npm in a scratch `CODEX_HOME` whose
`config.toml` points at a local stand-in Responses server, so no check called
a real model. The scratch home held a local marketplace for this repo, the
plugin installed from it, and a daemon started with `codex app-server daemon
start` (its socket is `<codex home>/app-server-control/app-server-control.sock`).
Codex 0.164.0 was installed the same way for the older-version checks. Quotes
are from the 0.166.0 release notes (2026-10-29). Nothing here ran in the
ChatGPT app.

**Queue (#57232, #57273, #57242)**

- The default `thread_unload_delay_secs` dropped from 1800 to 60: a thread
  "become[s] eligible for unloading after one minute with no subscribers and
  no activity" (PR #57242).
- `codex queue --help` lists `--thread`, `--message`, `--resume`, `--remote`,
  `--remote-auth-token-env`, `--enable`, `--disable`, `-p`,
  `--strict-config`, `-c` and `-C`. Other options of the interactive CLI now
  fail, for example "`codex queue` does not support image attachments"
  (cli/src/queue_cmd.rs `validate_options`) [source 0.166.0]. The inbox passes
  only `--thread`, `--message` and, where supported, `--resume`.
- `--resume` reads the thread's status and sends `thread/resume` only when it
  is `NotLoaded`. A failed resume prints "Warning: message was queued, but
  could not resume thread …" and the command still exits 0. With no daemon it
  fails that way, with "start a local daemon or specify a server with
  --remote" (tui/src/session_queue_commands.rs `resume_if_unloaded`) [source
  0.166.0].
- Live, on a TUI thread through the scratch daemon [live 0.166.0]:

  | Case | Result |
  | --- | --- |
  | TUI open on the thread, idle 75 s, no `--resume` | Turn ran |
  | TUI quit, then 60 s idle, no `--resume` | "Queued message …", exit 0, no turn |
  | Same thread, `--resume` | Exit 0; the earlier message and this one each ran a turn |
  | Inbox handler (built bundle), cached `cliPath` 0.166.0, unloaded thread | `queue --resume`, the turn ran |
  | Inbox handler, cached `cliPath` 0.164.0, unloaded thread | `queue` with no `--resume`, accepted; the message waits, as before |
  | 0.164.0 with `--resume` | `error: unexpected argument '--resume' found`, exit 2 |

- So the server asks each binary's `queue --help` for `--resume` and passes
  it only when listed (codex/src/cli.ts `queueResumeCheck`). The desktop app
  bundles alpha versions such as `0.163.0-alpha.11.2`, so the help is a
  better signal than the version.
- Not checked: whether the ChatGPT app's chat view keeps its thread loaded on
  the server `codex queue` reaches. `--resume` leaves a loaded thread alone.

**Shared MCP connections (#57211, #57196, #57210)**

- Sharing needs the `mcp_connection_sharing` feature, which is "under
  development" and off by default. With it on, a local stdio server is shared
  across chats only when it negotiates MCP `2026-07-28` and asks for no input
  during startup (codex-mcp/src/connection_pool.rs `finish`; PR #57211)
  [source 0.166.0]. There is no per-server opt-out.
- With the feature on, Codex first sends `server/discover` with
  `io.modelcontextprotocol/protocolVersion: "2026-07-28"`. The inbox server
  answers `-32601 Method not found`, and Codex falls back to `initialize`
  with `protocolVersion: "2025-06-18"`. The connection stays private
  [live 0.166.0, stdio logged through a `CODEX_MCP_NODE_PATH` wrapper].
- The inbox server's `initialize` echoes the version the client offers
  (codex/src/server.ts). 0.166.0 offers `2026-07-28` only through
  `server/discover`, so this does not make the server eligible.

**Untrusted context as tool outputs (#57181, #57279, #57204)**

- `untrusted_as_tool_output` is "under development" and off by default. It
  renders the `additionalContext` an app-server client passes on
  `turn/start` or `turn/steer` as `function_call_output` items in the `agent`
  namespace (core/src/session/turn_input.rs; context-fragments/src/additional_context.rs)
  [source 0.166.0].
- A hook's `additionalContext` is not on that path. It is recorded as a
  developer message (core/src/hook_runtime.rs `record_additional_contexts`)
  [source 0.166.0]. Two turns with the inbox's hooks running, one with
  `--enable untrusted_as_tool_output`, sent the stand-in the same input
  items; the inbox guidance arrived whole as one developer message both times
  [live 0.166.0].
- A hook's context over 2,500 tokens is truncated with a pointer to the full
  text (hooks/src/output_spill.rs), as in 0.164.0. `hooks/list` now shows an
  `additionalContextLimit` field per hook; the inbox's hooks leave it null.

**Plugin runtime (#57290, #57508, #57819, #57166, #56483, #57317)**

- `codex plugin marketplace upgrade` printed "No configured Git marketplaces
  to upgrade." for the local-path marketplace. An app-server `initialize`
  sent no `configWarning` or `warning` notification, and a TUI start showed
  only the stand-in model's missing-metadata warning [live 0.166.0].
- The plugin process host and bounded V8 runtime are for UI plugin
  processes. The inbox's tab is an MCP App served by its stdio MCP server.

**Hook cwd (#57198, #57203)**

- PreToolUse's `cwd` is now the working folder of a local `exec_command`
  (its `workdir`), not the session's folder. Only `exec_command` sets it;
  `apply_patch` and MCP calls keep the turn's folder
  (hooks/src/events/pre_tool_use.rs `tool_cwd`; core/src/tools/handlers/unified_exec/exec_command.rs)
  [source 0.166.0]. There is no new field. The inbox reads PreToolUse's `cwd`
  only for `apply_patch` paths.

**Rollouts (#57800, #57280)**

- #57800 changes `codex exec`'s own output recovery through
  `thread/items/list`, and #57280 the separate rollout trace bundle. Neither
  writes the session rollout.
- 0.166.0 rollouts have `history_mode: "paginated"` and two new row kinds,
  `world_state` and `token_usage_record`, which the inbox skips. Five
  rollouts, including a thread resumed by `queue --resume`, repeated no
  `item_completed` id, and the inbox's reader read each command and message
  once [live 0.166.0].

**Native binary (#57513)**

- The npm launcher now calls `process.execve` on macOS and Linux, so its
  process becomes the native binary. `ps -o comm=` names it
  `…/vendor/aarch64-apple-darwin/bin/codex`, which `findCli` matches
  [live 0.166.0].
- `update.ts`'s `codex exec` command line, all 16 `--disable` names
  included, exited 0 and wrote its `-o` file [live 0.166.0, stand-in through
  `-c`].
- After `codex exec resume`, the inbox's hooks ran "Completed" and
  `hooks/list` read them `trusted` [live 0.166.0].
