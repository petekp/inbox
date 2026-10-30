# Hooks: background work, discovery, trust and where they run

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Background hooks, timeouts and handler types

- **`async: true`** applies to command hooks only. "Background hooks can't
  block, approve, rewrite, or otherwise control the operation that triggered
  them." (L/hooks#run-hooks-in-the-background)
- **Delivery.** "If a turn is active, Codex waits for the current model
  request and tool calls to finish, then makes the output available to the
  next model request in that turn. If no turn is active, Codex waits until the
  next user turn. Finishing a background hook doesn't start a new turn."
  (L/hooks#how-background-hooks-run)
- **Limits.** "Codex runs up to eight background hooks concurrently per
  session. Additional hooks wait." That caps concurrency, not the total.
  "When the session ends, Codex cancels unfinished background hooks and
  discards output that hasn't been delivered." (L/hooks#limitations)
- **Timeouts.** Default 600 s. "`SessionEnd` and `Interrupt` use `1` second by
  default and support up to `3` seconds." (L/hooks#config-shape) Interrupt:
  "including when they run in the background", and "Configured timeouts are
  limited to one through three seconds" (L/hooks#interrupt). "`SessionEnd`
  hooks always run synchronously, even when `async` is `true`."
  (L/hooks#sessionend) The repo's Stop hook sets `timeout: 60` and no `async`
  (the `Stop` block of codex/plugin/hooks/hooks.json).
- **Handlers.** "`command` and `mcp_tool` handlers are supported. `prompt` and
  `agent` handlers are parsed but skipped." "Commands run with the session cwd
  as their working directory." Other fields: `statusMessage`,
  `commandWindows`, a top-level `description`. For repo-local hooks, "prefer
  resolving from the git root … Codex may be started from a subdirectory".
  (L/hooks#config-shape)
- **MCP tool hooks** (L/hooks#mcp-tool-hooks, #execution-and-lifecycle):
  - Shape: `type: "mcp_tool"`, `server`, `tool`, and `input` templates with
    `${tool_input.x}`.
  - "Hooks use an existing MCP connection. They don't start or reconnect
    servers." "SessionStart hooks can run before an MCP server is ready."
    "SessionEnd doesn't support MCP tool hooks."
  - "MCP tool hooks run synchronously. They don't request tool approval or
    trigger other hooks." "The shorter hook or server timeout applies. Time
    spent waiting for an MCP elicitation response doesn't count against the
    timeout."
  - It "uses the same trust review and output contract as a command hook". "A
    hook can block an operation when the tool returns a blocking decision.
    Errors, missing servers, and unavailable tools don't block the operation."
  - How a text or `structuredContent` result becomes hook output JSON is
    [unknown].
  - [inference] An `mcp_tool` PreToolUse hook could replace spawning Node per
    matched tool call.

## Where Codex finds hooks, and trust

- Codex looks for `hooks.json` or inline `[hooks]` next to each active config
  layer, and in plugins. "Higher-precedence config layers don't replace
  lower-precedence hooks." "Matching hooks from multiple files all run."
  "Multiple matching command hooks for the same event are launched
  concurrently". "Project-local hooks load only when the project .codex/ layer
  is trusted." (L/hooks, top and #where-codex-looks-for-hooks)
- **Plugin hook files.** "Codex discovers `hooks/hooks.json` by default when
  the selected OpenAI extension or compatibility manifest doesn't define
  `hooks`." `hooks` can be a path, array of paths, inline object or array of
  objects. "An explicit value replaces default-file discovery; it doesn't add
  to `hooks/hooks.json`." Paths start with `./` and stay in the plugin root.
  "Plugin hooks use the same event schema as regular hooks."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)
- **Trust.** "Non-managed hooks must be reviewed and trusted before they run."
  "Installing or enabling a plugin doesn't automatically trust its hooks.
  Plugin-bundled hooks are non-managed hooks, so Codex skips them until the
  user reviews and trusts the current hook definition."
  (L/hooks; D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) Review is
  in the CLI's `/hooks`; "If hooks need review at startup, Codex prints a
  warning." `--dangerously-bypass-hook-trust` skips trust for one invocation,
  with `codex` and `codex exec`. (L/hooks#review-and-trust-hooks,
  L/developer-commands?surface=cli)
- **Trust keys.** `<plugin_id>:<source_relative_path>:<event>:<group_index>:<handler_index>`,
  for example `demo@test:hooks/hooks.json:pre_tool_use:0:0`. Skipped `prompt`
  and `agent` handlers still take an index. [source]
  (GH/codex-rs/hooks/src/declarations.rs:12-37, 52-100) Live, `config.toml`
  holds `[hooks.state."inbox@inbox:hooks/hooks.json:<event>:<i>:<j>"]
  trusted_hash = "sha256:…"` for `session_start`, `user_prompt_submit`,
  `pre_tool_use` and `stop` [live 2026-10-08].
  - [inference] Reordering hooks changes the keys, so it forces re-trust.
  - Through 0.163.0, changing only `dist/hook.mjs` did not force re-trust:
    the hash covered the definition in `hooks.json`, not the script it names.
    Changing the Stop `timeout` flipped that hook to `modified` and left the
    other three `trusted` [live 0.163.0]. From 0.164.0 the approval is also
    bound to the plugin's contents; see "Checked against Codex 0.164.0".
    Reordering hooks is still [inference].
  - Hooks were trusted and ran in a desktop app session [live]
    (docs/plans/codex-plugin.md:421-423). The docs describe trust review only
    in the CLI's `/hooks`.
- **Environment.** "Plugin hook commands receive the Codex-specific
  environment variables `PLUGIN_ROOT` and `PLUGIN_DATA`. `PLUGIN_ROOT` points
  to the installed plugin root, and `PLUGIN_DATA` points to the plugin's
  writable data directory. Codex also sets `CLAUDE_PLUGIN_ROOT` and
  `CLAUDE_PLUGIN_DATA` for compatibility with existing plugin hooks."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks; L/hooks#plugin-bundled-hooks)
  No page says MCP servers get these.
- **`CODEX_CLI_PATH` and `CODEX_APP_RUNTIME_CLI_PATH`.** Earlier app releases
  gave every hook `CODEX_CLI_PATH`, the path of the desktop app's `codex`
  [live] (docs/plans/codex-plugin.md:361-365). The ChatGPT app 26.1021.31345,
  which bundles `codex-cli 0.164.0-alpha.11.1`, does not. When it starts its
  app-server, it deletes `CODEX_CLI_PATH` unless the app itself was started
  with one, and sets `CODEX_APP_RUNTIME_CLI_PATH` to the `codex` it runs
  (`/Applications/ChatGPT.app/Contents/Resources/app.asar`, byte offset
  6359020). Hooks, and the update process a hook starts, inherit the
  app-server's environment: two live updates had `CODEX_APP_RUNTIME_CLI_PATH`
  and no `CODEX_CLI_PATH` [live 2026-10-26]. The app adds its `codex` folder
  at the end of `PATH`, so a bare `codex` runs any other install first. No
  docs page mentions these variables or `CODEX_MCP_NODE_PATH`. The
  environment-variable page "does not list internal development variables"
  (L/config-file/environment-variables), so none has a stability promise.
- **Plugin hooks flag.** `plugin_hooks` is `Stage::Removed`
  (GH/codex-rs/features/src/lib.rs:1605-1609); Removed means "The feature flag
  is useless but kept for backward compatibility reason" (lib.rs:60-61).
  [inference] No separate flag gates plugin hooks. They still need `hooks`
  on, trust, and no `allow_managed_hooks_only`.

## Where hooks run

- Plugin hooks load "alongside user, project, and managed hooks. This
  includes ChatGPT Work and Codex. Hook scripts must exist in the execution
  environment". (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)
- "Lifecycle hooks are supported for plugins installed manually in Codex
  desktop." (same section)
- Cloud orchestration: "Command hooks and hooks from local configuration or
  plugins do not run, even when tools execute locally and the plugin itself is
  allowed … When both orchestration and execution are local, existing
  supported hooks continue to work in local-only Work and Codex threads."
  (L/enterprise/apps-and-connectors#step-2-manage-capabilities) "Plugin hooks
  are not supported in cloud-orchestrated ChatGPT Work." (L/plugins#overview)
- Managed PreToolUse callbacks fail open: "a `PreToolUse` callback error,
  timeout, or malformed response can fail the hook without blocking the
  tool." (L/hooks#managed-hooks-from-requirementstoml)
- **Live:** every hook fired in a desktop thread [live]
  (docs/plans/codex-plugin.md:331). `codex exec --ephemeral
  --ignore-user-config` fired no plugin hooks and saved no session [live]
  (docs/plans/codex-plugin.md:328).
- **Telling an `exec` run apart.** SessionStart input in `exec` looks the
  same. The transcript's `session_meta` has `originator: "codex_exec"` and
  `source: "exec"` [live] (docs/plans/codex-plugin.md:329). Live, one of two
  recent `codex_exec` transcripts had `source: {subagent: …}` instead
  [live 2026-10-08]. `isNonInteractiveRun` checks either field (codex/src/transcript.ts).
- **Ephemeral threads.** An ephemeral thread has no live thread in the
  session, so its hooks get `transcript_path: null` [source]
  (GH/codex-rs/core/src/session/mod.rs `hook_transcript_path`;
  core/src/session/session.rs, `config.ephemeral`). A normal thread's
  transcript is written before the path is passed. The desktop app runs its
  background jobs, such as suggesting the next message, as one-turn threads
  that fire every hook and save no transcript [live 2026-10-15]. The hooks
  skip a null path.
- [inference] Hooks and their per-reply `codex exec` can fire in Codex CLI
  and local Work threads where no tab exists. The plugin has no surface gate.
- **Telemetry.** OTel metrics `hooks.run` and `hooks.run.duration_ms`, tagged
  `hook_name`, `source`, `status`. (L/config-advanced#turn-and-tool-activity)
  app-server emits `hook/started` and `hook/completed`, but "These
  notifications aren't emitted for asynchronous hooks." (L/app-server#turn-events)
