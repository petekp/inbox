# Headless `-p` and the Agent SDK

Part of [Claude Code mods](../claude-code-mods.md).

**Headless** means a run with no terminal UI: `claude -p` (print mode) or the **Agent SDK**, a library that "runs the Claude Code binary, with Claude Code's capabilities". [SDK-overview#compare-the-agent-sdk-to-other-claude-tools] The desktop app's Code mode drives a headless engine too (see "The desktop app"), so these rules shape the inbox there.

## What `-p` loads, and `--bare`

- Default `-p` "loads the same context an interactive session would, including anything configured in the working directory or `~/.claude`." It runs project hooks and `.mcp.json` servers "even in a folder you've never trusted", with no trust dialog. [HL#start-faster-with-bare-mode]
- `--bare` skips "hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and CLAUDE.md". It still loads a plugin passed by `--plugin-dir` or `--plugin-url`. It "never reads OAuth credentials or the system keychain", so it needs `ANTHROPIC_API_KEY` or an `apiKeyHelper`. Since 2.1.286 it connects only command-line MCP servers, sends no system reminders and starts no background tasks. [HL#start-faster-with-bare-mode; CL#2-1-286]
- "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." [HL#start-faster-with-bare-mode]
- Refusal message under `--bare`: "installed plugins that are not managed load no hooks module in this mode (--bare)". [TS#refusal-messages] Whether a `--plugin-dir` (`@inline`) hooks module loads under `--bare` is not stated.
- `--bare` is not `--safe-mode`. Safe mode disables plugins and hooks but keeps login and model selection. [CLI#cli-flags]
- Exit 0 on success. Bad flags go to stderr. In-run failures such as missing auth print as the result on stdout. [HL#basic-usage]

## `--plugin-dir` and `--plugin-url`

- `--plugin-dir` loads "a directory or `.zip` archive, or several from a folder of plugins, for this session only". A folder of plugins needs 2.1.265. `--plugin-url` fetches a `.zip` for one session. [CLI#cli-flags]
- A `--plugin-dir` plugin's id is `<name>@inline`. [T: `PluginOptions`]
- "Claude Code watches a directory loaded with `--plugin-dir` and hot-reloads the hooks module when a file in it changes. Each reload runs `register` again." [C]
- 2.1.295: "Fixed generated type files being written into a `--plugin-dir` plugin's folder in `-p` and SDK sessions; they are now written only where a mod is being developed." [CL#2-1-295] Fixed symlinked `--plugin-dir` hot reload: 2.1.289. [CL]

## `system/init` and plugin reports in stream-json

- `system/init` "reports session metadata including the model, tools, MCP servers, and loaded plugins". [HL#read-session-metadata]
- `plugins` lists plugins "that loaded successfully, each with `name` and `path`". `plugin_errors` entries have `plugin`, `type`, `message`. "A plugin that didn't load is absent from `plugins`." `path` on a `--plugin-dir` failure needs 2.1.283. [HL#fail-ci-when-a-plugin-or-mcp-server-doesnt-load]
- `plugin_errors` also covers "a plugin that loaded without one of its parts, such as its hooks file". [SDK-ts#sdksystemmessage]
- `capabilities` (2.1.205+) is the way to "feature-detect instead of comparing version strings". [HL#read-session-metadata] No capability names a mod feature.
- Use: to confirm a patched copy of the inbox loaded in a `-p` trial, read `init.plugins` and `plugin_errors`. A failed hooks module also prints to stderr. [TS#a-claude--p-run-prints-hooks-module-not-loaded]

## Shutdown and the 1.5-second end bound

- SIGTERM: exit code 143. "Claude Code leaves the turn that was in progress unfinished and records no result for it." It "then runs `SessionEnd` hooks and exits", starting "no new tool call" and "no new model request". [HL#stop-a-run-with-sigterm]
- "One short wall-clock bound (1.5 s by default) covers every hook, its `$` waits and core". [T: `SessionEndInput`] The settings-hook docs agree and name the override `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`. The budget "applies when you exit, run `/clear`, or switch sessions with interactive `/resume`". [H#sessionend]
- On `/clear` "the conversation ends, the process goes on under a new session id, and no `session.start` fires for it." [T: `SessionEndInput.reason`]
- `session.detach` with reason `end` "runs inside `session.end`'s one short bound". [T: `session.detach`]
- Inference: the inbox's `session.end` work (store writes and `publishStatus`, a `$.process.run` with a 5,000 ms timeout at `hooks/register.tsx:publishStatus`) can be cut off. The saved ledger must not depend on `session.end`.
- After the turn, `-p` waits for background work. It stops idle work after 10 minutes by default (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`), but not while a main-conversation background command still runs. [HL#background-tasks-at-exit]

## Other `-p` behavior

- `--output-format json` includes `total_cost_usd`, a client-side estimate. [HL#get-structured-output]
- `--permission-prompts none` (2.1.259+) denies anything that would prompt unless a `PermissionRequest` hook allows it. In stream-json, denials appear as `permission_denied` messages. [HL#turn-off-permission-prompts-in-unattended-runs]
- Commands: skills and custom commands work as `/name` in the prompt. Terminal-only built-ins such as `/login` do not. [HL#create-a-commit] `/reload-plugins` works in headless sessions since 2.1.260. [CL#2-1-260]
- `--resume <id>` finds a session in any project on the machine (2.1.223+). [HL#continue-conversations]

## Agent SDK

- With `settingSources` omitted, `query()` "reads the same filesystem settings as the Claude Code CLI", equal to `["user", "project", "local"]`. The source table does not mention installed plugins. [SDK-features#control-filesystem-settings-with-settingsources]
- Read regardless: managed settings, `~/.claude.json`, auto memory, claude.ai connectors. "Do not rely on default `query()` options for multi-tenant isolation." [SDK-features#what-settingsources-does-not-control]
- SDK plugins: "The `type` field must be `"local"`". "The SDK doesn't expand tilde paths". A missing path is skipped silently. [SDK-plugins#loading-plugins; SDK-plugins#multiple-plugin-sources] The page never mentions mods or a hooks module.
- `reloadPlugins()` reloads plugins mid-session (SDK 0.2.85+). Its plugin `version` "is plugin-author-controlled". [SDK-ts#query-object]
- SDK callback hooks are separate from mod events. The SDK hook list has no `session.attach` or `ui.render`. [SDK-hooks#available-hooks]
- SDK sessions emit only `permission_prompt` and elicitation notifications. "Claude Code emits the other types, such as `idle_prompt` … from interactive UI that SDK sessions don't run." [SDK-hooks#forward-notifications-to-slack]
- Third parties may not offer claude.ai login "Unless previously approved". [SDK-overview]

## Mods in headless hosts (engine types)

- `SessionStartInput.isInteractive` is "true under the REPL, false for a `-p` run or the SDK". `surface` is "`terminal` under the REPL; null for a `-p` run or the SDK, which draw nowhere yet". [T: `SessionStartInput`]
- `$.session.surfaces()` lists "`terminal` under the REPL first, then the remote ones in the order they attached … Empty in a plain -p run." [T: `session.surfaces`]
- `session.attach` "Fires when a remote client joins the session's roster … it said so (ui_attach), or it first asked to draw". `clientId` is `<surface>:default` when unnamed. "the terminal's attachment is the REPL's binding and raises nothing." [T: `SessionAttachInput`]
- `$.process` is "Commands on the host, run as the user the session runs as. CLI only." [T: `process`]
- `$.prompt.read()` returns empty "where the session draws no box (a -p run, an SDK host)". `fill` reports `isFilled: false` and `suggest` reports `isShown: false` when headless. [T: `prompt`]
- No public SDK page says how a host attaches a drawing surface. Only the types mention `ui_attach`. Inference: a third-party SDK host, or the Codex app, cannot show the mod's band or pane through any documented interface.

## Evidence that the desktop app is an SDK host

Only the changelog says so:

- 2.1.208: "'Change directory' in SDK hosts (e.g. Claude Desktop)".
- 2.1.260: "`-p --resume`/`--continue` (as used by the desktop app)".
- 2.1.280: "a host app (Claude Desktop, VS Code, SDK)".
- 2.1.282: "SDK-hosted sessions such as Claude Desktop".
- 2.1.269: "(once Desktop bundles this CLI version)", which shows the app lags the changelog. [CL]

The live process list on 2026-10-08 showed the app's engine started with `--input-format stream-json --output-format stream-json` and no `-p` flag (see "The desktop app"). So the changelog's "`-p --resume`" may describe an older launch line, or a mode the engine enters without the flag. Unknown.

Inference, high impact: if `--bare` becomes the `-p` default and the app's sessions count as `-p` without opting out, installed mods, including the inbox, would stop in Code mode.
