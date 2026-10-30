# IDE extensions, the status line and artifacts

Part of [Claude Code mods](../claude-code-mods.md).

## VS Code extension

- The extension "bundles its own copy of the CLI (command-line interface) for the chat panel". "The extension's version number is the Claude Code version it bundles." [VSC#prerequisites; VSC#install-the-extension]
- Plugins are shared: "Plugins and marketplaces you configure in the extension are also available in the CLI, and vice versa." After saving, "the open sessions reload their plugins". [VSC#manage-marketplaces; VSC#install-plugins]
- Docs: the chat panel runs a mod's hooks but draws nothing. [O#where-mods-run] Types: `vscode` is a remote surface with its own element table. See "Where sources disagree".
- Inference: the inbox loads in the panel, and its gate keeps it off, so it makes no per-turn model call there. This holds only while the panel never attaches as `desktop`.
- `claudeCode.useTerminal`, or **Open in Terminal**, runs the CLI interface in VS Code. That is the terminal surface, where the band and pane draw. [VSC#switch-to-terminal-mode]
- History is shared with the CLI. A conversation open elsewhere warns "This conversation is still open somewhere else. Using it in two places at once can mix up its messages." **Open here anyway** opens it in both. `claudeProcessWrapper` skips the check. [VSC#resume-past-conversations] Inference: two inbox instances can then update one `s:<sessionId>` record.
- The extension's own "needs you" signals: session filters **Needs input / Working / Completed**, a tab dot ("blue means a permission request is pending"), the agent map dot, and Focus view, which keeps pending-question text visible. [VSC#filter-the-sessions-list; VSC#run-multiple-conversations; VSC#use-the-prompt-box]
- `CLAUDE_CONFIG_DIR` in `claudeCode.environmentVariables` "applies only when its value is an absolute path". [VSC#extension-settings] This matters for live tests with a separate config.
- Deep link: `vscode://anthropic.claude-code/open?prompt=…&session=…`. The prompt is "pre-filled but not submitted". "The session must belong to the workspace currently open in VS Code." [VSC#launch-a-vs-code-tab-from-other-tools]

## JetBrains

- "The plugin runs the `claude` command in your IDE's integrated terminal and connects to it. It does not bundle its own copy of the CLI." It is still Beta. [JB#installation]
- The mods table counts it with the terminal: hooks run and drawing appears. [O#where-mods-run]
- Inference: IDE terminals are often narrow. A pane the mod opens on its own needs 144 columns, or 110 after the person opened it once. [IF#when-a-pane-waits-for-a-wider-terminal] So in IDE terminals the band carries most of the load.

## Platforms page

- "Claude Code runs the same underlying engine everywhere." "Configuration, project memory, and MCP servers are shared across the local surfaces." [PLAT#where-to-run-claude-code]
- "The CLI is the most complete surface for terminal-native work: scripting and the Agent SDK are CLI-only." [PLAT#where-to-run-claude-code]
- It names only "Desktop" and "the Code tab". [PLAT]

## The `statusLine` setting

The **status line** is "a customizable bar at the bottom of Claude Code that runs any shell script you configure". [SL]

- A plugin cannot ship one. A plugin's `settings.json` keeps only "`agent` and `subagentStatusLine`, and every other key is dropped". [PC]
- It "runs locally and does not consume API tokens". It needs workspace trust. Under managed `allowManagedHooksOnly`, "your custom status line disappears without warning". [SL#how-status-lines-work; SL#workspace-trust-required; SL#status-line-not-appearing]
- Updates are debounced at 300 ms, and a new trigger cancels an in-flight script. "The event-driven triggers can go quiet when the main session is idle"; `refreshInterval` covers that. [SL#when-the-status-line-updates]
- Input includes `session_id`, `transcript_path`, `cost`, `context_window`, `rate_limits`, `pr`. `cost.total_cost_usd` "Resets to $0 when `/clear` starts a new session." No field names the surface or client. [SL#available-data]
- The page is written for the terminal. Whether it renders in the desktop app, the VS Code panel or mobile is not stated.
- The mod equivalent is `$.ui.status(text)`: "Pins `text` as this plugin's status line under the prompt … One per plugin". It draws the "first 2000 characters … (10000 remotely)". [T: `ui.status`] `$.session.usage()` returns "the context window's fill, the rate-limit windows and the cost as the status line has them". [T: `session.usage`]
- Repo naming: `statusLine` in `hooks/herdr.ts` builds the Herdr sidebar text. `hooks/register.tsx:publishStatus` calls it through `herdrTokens`. It is not Claude Code's `statusLine` setting.

## Artifacts

An **artifact** is "a live, interactive web page that Claude Code publishes from your session to a private URL on claude.ai". [ART]

- Publishing is the model's `Artifact` tool. No mods API publishes. [ART; T] Inference: every inbox publish would cost a model turn.
- "A new artifact that Claude publishes in response to a prompt you type goes through without a permission prompt or classifier review." Scheduled-task turns ask first. [ART#when-claude-code-asks-before-publishing] Whether a mod-started turn counts as "a prompt you type" is unknown.
- Availability: Pro, Max, Team or Enterprise; a claude.ai login ("Sessions using an API key, gateway token, or cloud-provider credential cannot publish"); Anthropic API only; not with CMEK, HIPAA or ZDR. Surfaces: "Claude Code CLI, or the Claude desktop app version 1.13576.0 or later". "Off by default in the Agent SDK … when you run Claude Code with `-p`". [ART#availability]
- CSP: `fetch` reaches "only the page's own origin and the Google Fonts hosts". The published page "can't call" local MCP servers. [ART#page-constraints; ART#pull-live-data-with-mcp-connectors] Inference: an inbox page is a snapshot the session pushes, not a live view of the store.
- Return path: comments sent with **Send to Claude** reach the publishing session "right away" (2.1.228+). Auto-replies stop after "60 sent comments or thread activations on that artifact within an hour". [ART#let-claude-reply-to-comments-on-its-own]
- Types (2.1.295 only): `session.receive` fires for "an artifact page's room events", with `source` `artifact-room` and events `{ topic, from, isOwnViewer, data, isTruncated }` "as the page's viewers wrote it". A hook can consume one so "nothing is queued, shown or read by the model". [T 2.1.295: `SessionReceiveEvent`] Inference: an artifact page could send answers back to the mod without a model turn. Viewer data is untrusted.
- Live: this session's `Artifact` tool describes multi-file publishes, a per-artifact database (`ArtifactData`) and other runtime capabilities "depending on what is enabled for this person". The public page says "Single page" and "No backend". See "Where sources disagree".
