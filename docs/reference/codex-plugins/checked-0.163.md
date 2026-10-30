# Checked against Codex 0.163.0, and live checks

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## What this repo verified live

All rows come from `docs/plans/codex-plugin.md`, measured on Codex 0.154.0 or
the desktop app's 0.160.1 (codex-plugin.md:14-15). The plan does not record
which version each check used. Rows marked "2026-10-08" were checked
read-only while writing this file.

| Fact | Where |
| --- | --- |
| Every hook fired in a desktop thread; SessionStart context reached the model | :331 |
| Shell and patch hook shapes; no exit code in `tool_response` | :325-326 |
| Model tool calls carry `x-codex-turn-metadata` with `session_id`, `thread_id`, `turn_id` | :327 |
| `exec --ephemeral --ignore-user-config` fires no plugin hooks; cost 21.5k / 12.5k tokens | :328 |
| `exec` sessions have `originator: "codex_exec"`, `source: "exec"` | :329 |
| `.agents/plugins/marketplace.json` wins over `.claude-plugin/marketplace.json` | :330 |
| A thread tab opens from a local plugin; tab calls carry `_meta.thread_id`; no subscribe; polling works | :332 |
| `ui/message` is wrapped as `untrusted_input` | :333 |
| 17 probe server processes in 3 minutes | :334 |
| `codex queue` delivers to idle and busy threads | :357-359 |
| Hooks get `CODEX_CLI_PATH` from earlier app releases | :361-365 |
| 2026-10-26: hooks get `CODEX_APP_RUNTIME_CLI_PATH` and no `CODEX_CLI_PATH` from the ChatGPT app 26.1021.31345 | This file, "`CODEX_CLI_PATH` and `CODEX_APP_RUNTIME_CLI_PATH`" |
| A long command got no PostToolUse in the desktop app | :373-378 |
| SessionStart fires on resume; Stop `block` continues the turn | :395-396 |
| A server-started press works through `codex queue` / `thread/queue/add` | :397-398 |
| `default_tools_approval_mode: "approve"` in `.mcp.json` skips approval | :399 |
| Servers find the data folder from their install path | :400 |
| Unknown `--disable` names fail; model choice | :407-419 |
| Bundled CLI 0.160.1, PATH CLI 0.154.0, `codex queue --help`, `codex features list` | 2026-10-08 |
| Cache at `.../cache/inbox/inbox/0.1.0/`, matches the repo; data at `.../data/inbox-inbox` | 2026-10-08 |
| Hook trust keys for all four inbox events | 2026-10-08 |
| Transcript row types, item fields, subagent id patterns | 2026-10-08 |

## Checked against Codex 0.163.0

Checked on 2026-10-16. The inbox was built against 0.160.1. This section lists
what 0.163.0 changed for it, or did not. Nothing in the plugin needed a
change. The desktop app still bundles 0.162.0-alpha.17.2, so the Inbox tab
itself was not checked on 0.163.0. Everything below ran in a scratch
`CODEX_HOME` with the CLI from npm, a local marketplace pointing at this
repo, and a probe client speaking app-server JSON-RPC over stdio.

**Install and activation**

- `codex plugin marketplace add <local path>` then `codex plugin add inbox@inbox`
  installs and enables the plugin, and writes `[plugins."inbox@inbox"]
  enabled = true` [live 0.163.0]. `plugin list` shows "installed, enabled".
- 0.163.0 adds `plugins._default.enabled` in `config.toml`: "Defaults for
  installed plugin activation. Omission preserves source enablement. Explicit
  plugin enablement settings override this default, but cannot enable an
  installation disabled by its source." (core/config.schema.json, PR #52220)
  [source 0.163.0] With `_default.enabled = false` and no explicit entry the
  inbox showed "installed, disabled" and `hooks/list` reported its hooks
  disabled. `codex plugin add` after that still wrote `enabled = true` and
  the plugin came out enabled [live 0.163.0].
- It is a user setting. `marketplace.json` has no field for it, so the
  marketplace entry stays as it is (`installation: AVAILABLE`,
  `authentication: ON_INSTALL`).

**Hooks**

- All four events fired in an app-server thread, with the plugin's hooks
  trusted through `[hooks.state."inbox@inbox:hooks/hooks.json:<event>:0:0"]
  trusted_hash`: SessionStart, UserPromptSubmit, PreToolUse for a shell
  command and for the model's `inbox` MCP call, and Stop [live 0.163.0].
- A fresh install reports all four hooks `untrusted`. `hooks/list` gives each
  `currentHash` [live 0.163.0].
- Changing a hook's definition makes its trust status `modified`. Changing
  only `dist/hook.mjs` does not [live 0.163.0].
- Sixteen PreToolUse hook processes started at once all recorded their
  activity line; the state lock held [live 0.163.0]. Codex 0.163.0 may now run
  read-only tool calls in parallel (PR #52245), which makes such overlap
  normal.
- Stop does not run when a turn is interrupted. `turn/interrupt` ended the
  turn as `interrupted` and no Stop hook started [live 0.163.0]. Stop runs
  only when the turn's sampling loop ends with no follow-up
  (core/src/session/turn.rs:718-725); an abort returns first [source 0.163.0].
  The next hook finds the turn ended in the rollout after `coveredTurn`, so
  the inbox drops the interrupted prompt and catches up over the whole
  conversation (`withMissedTurns`).
- A steer arrives as more input in the running turn, so Stop runs once at the
  end [source 0.163.0].

**Presses**

- `codex queue --thread <id> --message <text>` sent while a turn ran did not
  steer. The turn finished first. Its queued message started its own turn
  17 ms later, as a user message with the `clientId` of the queued item
  [live 0.163.0]. `thread/queue/add` only stores the item. The queue service
  starts it with `start_turn_if_idle`, and an item that cannot start stays
  queued (ext/queue/src/service.rs:370-460) [source 0.163.0].
- PR #53452 closes input admission for a turn that is finishing. That
  rejects injection into the running turn, which is the steer path. The queue
  does not use that path, so `queue/add` has no new "admission closed" error
  [source 0.163.0].
- Through a daemon started in the scratch home with `app-server daemon
  start`, `codex queue` queued a message, kept working after `daemon
  restart`, and failed with exit 1 and the server's message for an unknown
  thread ("no rollout found for thread id …") [live 0.163.0]. The server
  treats a non-zero exit as `unconfirmed`, as before.
- The `-32600` "unknown variant `thread/queue/add`" mapping still exists
  (tui/src/session_queue_commands.rs:130-143) [source 0.163.0]. PR #52648
  limits daemon compatibility checks to explicit CLI overrides such as `-c`;
  the server passes none.

**MCP server**

- `inbox` started from `./dist/server.mjs` with `cwd` at the plugin root. It
  received `PATH`, `HOME`, `CODEX_HOME`, `CODEX_CLI_PATH` and
  `CODEX_MCP_NODE_PATH` from `env_vars`, and not an unlisted variable
  [live 0.163.0].
- `mcpServerStatus/list` shows the six tools with their `_meta`
  (`ui.visibility: ["app"]` on the three app-only tools, the thread
  entrypoint on `inbox_view`) and one resource. `mcpServer/resource/read`
  returned the tab page as `text/html;profile=mcp-app` [live 0.163.0].
- `mcpServer/tool/call` for `inbox_view` returned `structuredContent`.
  App-server adds `threadId` to the call's `_meta` (app-server/src/request_processors/mcp_processor.rs:16);
  `sessionOf` reads it [live 0.163.0, source 0.163.0].
- The model's `inbox` call resolved its session and turn from
  `x-codex-turn-metadata`, and the session's `promptMissedAt` stayed null
  [live 0.163.0].
- `default_tools_approval_mode: "approve"` let the model's call run under
  `approval_policy: never` [live 0.163.0].
- PRs #52182 and #53709 add sandbox-launcher metadata for servers that
  advertise the sandbox-state capability. The inbox server does not
  [source 0.163.0]. PR #51611 signals an abandoned elicitation; the inbox
  sends none.

**Per-reply update**

- The exact `codex exec` command line in `codex/src/update.ts` (all 16
  `--disable` names, `--ephemeral --ignore-user-config --ignore-rules`,
  `-o`) exited 0 and wrote the reply. The Stop hook started the same update
  twice in the thread test and both applied (`turnsApplied` 2) [live 0.163.0].
  A one-word prompt used 5,383 tokens with the plugin's own instructions
  file.
- No shell-migration notice appeared in stdout or stderr. stderr carried one
  new-looking line, "Code Mode is unavailable because code-mode host is
  disabled …"; `update.ts` reads stderr only for "Unknown feature flag"
  [live 0.163.0]. Whether 0.160.1 printed it was not checked.
- `shell_zsh_fork` and `unified_exec_zsh_fork` are "removed" in `features
  list`; the inbox uses neither [live 0.163.0].
- Daybreak is the feature `cli_daybreak` (stable, default on). In `exec` it
  picks a cyber access program from the model catalog for the turn, and fails
  the run only when Daybreak is switched on for a provider or model that
  cannot use it (exec/src/daybreak.rs) [source 0.163.0]. The update runs with
  the default and succeeded, so it is not in the `OFF` list.
- `exec --json` events: `thread.started`, `turn.started`, `item.started` and
  `item.completed` (`agent_message`, `command_execution` with `command`,
  `aggregated_output`, `exit_code`, `status`), `turn.completed` with `usage`
  [live 0.163.0]. The item has no `cwd` (exec/src/exec_events.rs:161-166)
  [source 0.163.0]. Nothing in `codex/src` reads these fields; `update.ts`
  does not use `--json`.
- An incomplete response (PR #53451) is a non-retryable `ResponseIncomplete`
  error. `exec` sets `error_seen` on a non-retrying `error` notification or a
  failed turn and exits 1 (exec/src/lib.rs:1341-1360, :1403-1405)
  [source 0.163.0]. `update.ts` treats a non-zero exit as a failed run and
  keeps the exchange pending. The 120 s timeout covers a hang. Not triggered
  live.

**Opportunities, not built** [source 0.163.0]

- Durable thread read state with revision-checked updates (PRs #52337,
  #52350, #52384, #52395).
- `thread/items/read`, experimental: items of one turn by id (PR #52637).
- `excludedThreadIds` on `thread/list` (PR #51595).
- Command environments get `CODEX_TOOL_CALL_ID` and `CODEX_THREAD_ID` (PR
  #52119). A shell command's call id could be matched to its hook's
  `tool_use_id`.
