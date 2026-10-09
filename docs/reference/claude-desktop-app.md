# The Claude desktop app

Checked on 2026-10-08. The app is version 2.31226.0 on macOS (its `Info.plist`). The terminal `claude` is 2.1.295. The app holds its own Claude Code copies, 2.1.289 and 2.1.293.

The desktop app is the inbox's third client, beside the terminal and Codex. Its Code mode runs Claude Code sessions, so the inbox mod (the plugin code in `hooks/`) can run there. Its Claude mode is the chat side of the app; whether it can host any part of the inbox is unknown.

Terms used below:

- **Engine**: the Claude Code program (`claude`) that runs a session and loads plugins and mods.
- **Mod**: a plugin's code that hooks engine events and draws UI. The inbox is one.
- **Surface**: where a session is drawn. The engine's types name four: `terminal`, `desktop`, `mobile`, `vscode` (`RenderSurface` in the engine types).
- **Attach**: a client such as the desktop app connecting to a running session (`session.attach`).
- **SDK host**: a program that runs Claude Code headless and talks to it over stream-json, as the Agent SDK does.
- **Guard**: the built-in mod `sec-default@builtin` (shown as `cc-plugin-sec-default`), which runs ahead of a user's mods in some setups.
- **Live**: checked on this Mac on 2026-10-08, not taken from docs.

## The facts that most constrain the inbox

1. The app runs its own Claude Code copy, separate from the terminal's. "The desktop app downloads and updates that copy, so it can differ from the `claude` command in your terminal" (https://code.claude.com/docs/en/desktop#claude-code-version-in-the-code-tab). Live: 2.1.289 and 2.1.293 versus 2.1.295.
2. The app runs each session headless, as an SDK host (live process arguments). Inference: `isInteractive` is false there. The types say it is "true under the REPL, false for a `-p` run or the SDK" (`SessionStartInput.isInteractive`). The mod stayed off in Code mode until commit 05c3548 stopped gating on that flag alone (`docs/plans/clients.md:56`).
3. Mods run and draw in local Code-mode sessions. WSL sessions get no plugins. A cloud session runs a mod's hooks only for a plugin that reaches it, and draws nothing (https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run).
4. Mods need engine 2.1.286 on Desktop (overview page). The inbox "was built and tested with Claude Code 2.1.292" (`README.md:20`). Whether it works on the app's 2.1.289 copy is unknown.
5. `ToolProgress`, `TurnDuration`, `InfoNotice`, `Raster` and `Image` do not draw on the desktop (https://code.claude.com/docs/en/plugins/mods/reference#render-sites, #elements). `$.ui.copy` has no desktop path yet (engine types, `$.ui.copy`).
6. Unknown: which `origin.kind` a typed Code-mode prompt has. `hooks/register.tsx:2025` counts only `composer`, `bridge`, or `plugin` with `asUser` as the person's words. The types also define `sdk`: "The SDK host's own turn (`claude -p`, the Agent SDK), not typed at a terminal". Inference: Code-mode prompts may arrive as `sdk`, which the inbox would not count as the person's words.
7. The app and the CLI share `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md, hooks and skills (https://code.claude.com/docs/en/desktop#shared-configuration).
8. The repo owner reported the mod loading in a local Code-mode session after commit 05c3548. Commit f7536d0 fixed `/clear`, `/resume` and `/branch`.
9. There is no in-app way to confirm the mod loaded. `/plugin` does not run in Code mode (see "Plugins and Customize"). For an installed mod, refusal and `hook skipped` lines go to the debug log only (https://code.claude.com/docs/en/plugins/mods/troubleshoot#find-out-why-a-mod-does-nothing).

## Modes and tabs

The public docs and the app disagree on naming.

| Source | What it says |
|---|---|
| https://code.claude.com/docs/en/desktop (Markdown line 9) | "three tabs: **Chat** … **Cowork** … and **Code**" |
| desktop-quickstart (Markdown lines 34-38) | The same three tabs. |
| `docs/plans/clients.md:22` (this repo, from the repo owner) | "The Claude desktop app has two modes, Claude and Code." |
| Changelog through 2.1.295 | Never says "Claude mode" or "Code mode". Still says "Code tab" and "Cowork" at 2.1.290 and 2.1.292. |

- **Code mode** (the docs' "Code tab") runs Claude Code sessions. Everything in this file about plugins and mods applies here.
- **Cowork** runs the Claude Code engine too. The changelog mentions Cowork fixes at 2.1.205, 2.1.261, 2.1.268 and 2.1.292 (https://code.claude.com/docs/en/changelog).
- Cowork "sources its skills, plugins, and connectors from this Customize configuration, which syncs through your claude.ai account, not from the CLI's `~/.claude` directory" (https://code.claude.com/docs/en/desktop, section "Extend Claude Code", Markdown line 444).
- The gateway docs say all three tabs can run on the engine: "Claude Desktop runs its Cowork and Code tabs, plus the Chat tab when you enable it, on embedded Claude Code sessions" (https://code.claude.com/docs/en/claude-apps-gateway#deliver-policy-to-claude-desktop-sessions).
- Inference: "Claude mode" may be the merged Chat and Cowork side of the app. That is not confirmed.

Plugin parts by app, from https://claude.com/docs/plugins/platform-support#compare-component-support-by-app. There, "Claude Code" means "the terminal, the IDE extensions, and the desktop app's Code tab".

- Chat ignores plugin hooks (`hooks/hooks.json`) and local MCP servers.
- Cowork loads hooks. It loads local MCP servers only "when the Cowork session runs on your computer".
- On mods, the page says only that the plugin directory "lists a mod … for Claude Code". Whether Chat or Cowork runs a mod is not stated.
- A plugin with a top-level `bin/` folder cannot be installed in Chat or Cowork. The inbox has none.

## How the app runs Claude Code

**Live process tree (macOS):** the Electron app, then a `disclaimer --pgroup` wrapper, then the app's `claude`, run from `~/Library/Application Support/Claude/claude-code/<version>/…/claude`. That `claude` starts with these flags:

`--input-format stream-json --output-format stream-json --verbose --include-partial-messages --replay-user-messages --await-initialize --permission-prompt-tool stdio --permission-mode … --model … --resume=<id> --settings … --setting-sources=user,project,local --allowedTools … --disallowedTools … --thinking-display …`

There is no `-p` flag and no `--plugin-dir` on the command line. It is still a headless SDK session.

**What the engine types say** (`.claude-plugin/types/claude-code/index.d.ts`, cite by symbol because the file is rewritten by whichever engine last loaded the mod; it read "Written by Claude Code 2.1.293" on 2026-10-08):

- `SessionStartInput.isInteractive` is "true under the REPL, false for a `-p` run or the SDK".
- `SessionStartInput.surface` is "null for a `-p` run or the SDK, which draw nowhere yet".
- `session.attach` fires for "attached clients (a phone opened the session; the desktop app connected)".
- `$.session.surfaces()` lists the surfaces drawing the session.
- The `prompt.submit` origin kinds include `composer` (typed at the terminal), `bridge` (Remote Control), `sdk` (an SDK host's own turn), `scheduled-trigger`, `peer` and `projects-relay`.

**What the docs say:**

- The start sequence (start, then attach, or the reverse) is not documented. The mods reference has one row: "`session.attach`, `session.detach` | Another app connects to or disconnects from the session" (https://code.claude.com/docs/en/plugins/mods/reference#events).
- "Desktop is interactive only" (https://code.claude.com/docs/en/desktop, Markdown line 979). This describes the person's experience, not the engine's `isInteractive` flag.
- The changelog treats the app as an SDK host that resumes sessions: entries at 2.1.208, 2.1.260 and 2.1.282. Entry 2.1.269 adds a fix "(once Desktop bundles this CLI version)".

**How the inbox handles it now** (`hooks/register.tsx`):

- `:1966`: at `session.start`, turn on if `e.isInteractive` or `$.session.surfaces()` includes `desktop`.
- `:1971`: at `session.attach` with surface `desktop`, turn on if not already on.
- `:1977`: at `classic.SessionStart` with source `clear`, `resume` or `fork`, load the conversation the event names.
- `:2022`: skip the inbox's own plugin prompts.
- `:2025`: count as the person's words only origin `composer`, `bridge`, or `plugin` with `asUser`.
- `turnOn` (`:1877`) sets `isOn` and registers `/inbox` and the tools. It has no guard of its own. The attach path checks `isOn`; the start path does not. If attach fires before start, `turnOn` runs twice. Whether that order happens is unknown.

**App tools passed into each session (live):** `mcp__ccd_session__*` (`list_sessions`, `send_message`, `spawn_task`, `dismiss_task`), `mcp__ccd_session_mgmt__*`, `mcp__ccd_view__*` (`show_pane`, `close_pane`), `mcp__ccd_window__*`, `mcp__ccd_sidebar__*`, `mcp__ccd_pr__get_status`, `mcp__ccd_connectors__*` and `mcp__ccd_settings__get_settings`. They are not documented publicly.

**How other tools see these sessions (live):** `claude agents --json` lists Code-mode sessions as `interactive` entries whose parent process is inside Claude.app. Their transcripts are at `~/.claude/projects/*/<sessionId>.jsonl`, the same place as terminal sessions.

## Engine versions and updates

| Fact | Source |
|---|---|
| The Code tab runs its own copy, which can differ from the terminal's. "updating one doesn't update the other". | https://code.claude.com/docs/en/desktop#claude-code-version-in-the-code-tab (Markdown line 1056) |
| To update it: Claude, then Check for Updates, then start a new session. | Same section |
| `/status` shows the version in its Claude Code row. | Same section |
| The app updates itself on launch on macOS and Windows. | desktop page, Markdown line 1072 |
| MDM (device management) can control app updates. | desktop page, Markdown line 863 |
| On Linux, updates come through apt. With `CLAUDE_DESKTOP_ADD_REPO="false"`, "apt doesn't deliver new versions". | https://code.claude.com/docs/en/desktop-linux, Markdown line 88 |
| Mods work on Desktop from 2.1.286 and in the terminal from 2.1.287. | https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off (Markdown line 97) |
| The changelog first mentions mods at 2.1.287 (October 1). | https://code.claude.com/docs/en/changelog |
| The mods reference describes the CLI and the Desktop app "as of v2.1.290". | https://code.claude.com/docs/en/plugins/mods/reference (Markdown line 9) |
| The app holds 2.1.289 and 2.1.293 in `~/Library/Application Support/Claude/claude-code/`. | Live |
| A Code-mode session running at check time used the 2.1.293 copy. | Live: its process path |
| `~/Library/Application Support/Claude/claude-code-vm/` holds 2.1.293. | Live. Inference: the copy for Cowork's VM mode. |

The app downloads these copies into Application Support. It does not ship them inside the app bundle (live; the desktop page says "The desktop app downloads and updates that copy").

Whether every new session uses the newest copy, and whether old copies are deleted, is unknown.

Behavior that differs on the 2.1.289 copy, per the mods docs:

- Before 2.1.292, a fresh copy of a mod (after the hooks worker is replaced) ran `$.prompt.submit`, `$.command.run` and `$.agent.spawn` from `session.start` again (https://code.claude.com/docs/en/plugins/mods/troubleshoot#its-sessionstart-ran-again-in-a-fresh-copy).
- Before 2.1.290, a toast raised within 2 seconds of the last one was dropped (troubleshoot#a-toast-doesnt-appear).
- `ui.fault` needs 2.1.289 (reference#interface).
- A mod can read its engine version at runtime with `$.session.version()` (engine types).

## Session environments in Code mode

Each Code-mode session runs in one of four environments. Source: https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run unless noted. Its Desktop row reads "The Code tab of the Desktop app, except in a WSL session": hooks "Yes", draws "Yes, except elements the elements table marks terminal-only".

| Environment | Plugins | Mod hooks | Mod draws | Notes |
|---|---|---|---|---|
| Local | Yes | Yes | Yes, except terminal-only elements | The repo owner reported the inbox loading here after commit 05c3548. |
| SSH | Yes | Yes per the overview's Code-tab row; unverified live | Same | "Desktop installs Claude Code on the remote machine automatically … SSH sessions support permission modes, connectors, plugins, and MCP servers" (desktop page, Markdown line 717). It reads the remote host's skills and managed settings. The store's location there is unknown. |
| WSL | No | No | No | overview Markdown line 197; https://code.claude.com/docs/en/desktop-wsl (Markdown line 43). A `\\wsl.localhost` folder picked in the normal folder picker reopens as a WSL session. |
| Cloud | Desktop-installed plugins do not reach it (desktop page, Markdown line 476) | Only for a plugin that reaches the session | No | In an Anthropic-hosted environment, "only server-managed settings reach the session, which waits for them before it installs plugins" (https://code.claude.com/docs/en/plugins/org#when-each-surface-applies-the-plugin-keys). A user-installed inbox does not reach it. |

## Plugins and Customize

- Install a plugin in Code mode through + > Plugins > Add plugin, then Manage plugins. This works for local and SSH sessions only: "The plugin browser isn't available in the desktop app's cloud sessions" (https://code.claude.com/docs/en/plugins/install#install-a-plugin).
- `/plugin` does not run in Code mode. It replies `/plugin isn't available in this environment`, as in `-p`, the Agent SDK and VS Code (https://code.claude.com/docs/en/plugins/troubleshooting#plugin-isnt-available-in-this-environment). So the `mods active` line, documented only for "a terminal session" (overview#see-which-mods-a-session-loaded), is not available there.
- One user-scope install covers the terminal, local Desktop sessions and VS Code (https://code.claude.com/docs/en/plugins/install, Markdown line 150).
- Customize is the app's plugin, skill and connector settings. It syncs through the claude.ai account and feeds Cowork, not `~/.claude` (desktop page, Markdown line 444).
- `disableSideloadFlags`, a managed setting (https://code.claude.com/docs/en/settings-reference#disablesideloadflags):
  - The app withholds synced and app-deployed plugins and claude.ai skills from Code sessions on the person's machine.
  - It also covers `CLAUDE_CODE_PLUGIN_DIRS`: "When the variable names a folder, Claude Code exits with the same error, and the error says to unset the variable." Inference: on a machine with this policy, the dev setup below stops every session from starting, not only the inbox.
- Hot reload in the app needs `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, read from the environment only: "`1` makes a long-running non-interactive session reload `--plugin-dir` mods on save" (https://code.claude.com/docs/en/plugins/mods/reference#settings-and-environment-variables). Not checked live.

**How the inbox loads on this Mac (live):**

- `~/.claude/settings.json` sets `env.CLAUDE_CODE_PLUGIN_DIRS` to this repo. So the mod loads everywhere as `inbox@inline`. The reference allows this variable from "Environment, or `env` in `~/.claude/settings.json`" (reference#settings-and-environment-variables).
- `claude plugin list` shows it as session-only, version unknown.
- Its store is `~/.claude/plugins/store/inbox_inline-7e8589075f50.json`, about 76 KB. The suffix is the first 12 hex digits of the sha256 of `inbox@inline`.
- A second file, `session-inbox_inline-8e8b5072f657.json`, sits in the same folder. Its role is unknown.
- Inference: a marketplace install would get a different suffix, so a separate store.

## What draws on the desktop

Sources: https://code.claude.com/docs/en/plugins/mods/reference#render-sites and #elements, https://code.claude.com/docs/en/plugins/mods/interface, and the engine types.

| Element or API | Terminal | Desktop |
|---|---|---|
| `Pane`, `AbovePrompt` | Draws | Draws |
| `ToolProgress`, `TurnDuration`, `InfoNotice` | Draws | No |
| `Svg` | No | Draws, up to 131,072 characters |
| `Raster`, `Image` | Draws | No |
| `Link` | Draws | Plain text unless the `href` is `https:` or `http://localhost`, has no `@`, and is in canonical form (https://code.claude.com/docs/en/plugins/mods/interface#link-in-the-desktop-app). The types say plain text for "anything but the `https:` URL its wire promises" (`LinkProps.href`). |
| `Button` with `plain` | Terminal style | "A desktop draws its native button either way" (types, `ButtonProps.plain`) |
| `role: 'dismiss'`, `variant` | Terminal style | Native controls (types) |
| `$.ui.copy` | Works | "a remote surface has no path yet" (types, `$.ui.copy`) |
| `$.prompt.read` | Works | Returns `{ text: '', cursor: 0 }` "where the session draws no box (a -p run, an SDK host)" (types) |
| `$.process` | Works | Types say "CLI only". A local Code-mode session runs the CLI engine, so it likely works. Unverified. |
| Redraw rate | 30 per second for the visible pane, the expanded band and the hint line | "Throttled to 10 a second" (https://code.claude.com/docs/en/plugins/mods/reference#limits) |

The reference says "`e.surface` is `terminal` or `desktop`" (reference#render-sites). The types allow four values, so a render hook typed from them must also handle `mobile` and `vscode`.

Risks for the inbox:

- The inbox hides hotkey `Button`s in a `Box` with `display="none"` (`hooks/register.tsx:3728`). A desktop that draws native buttons may show them or drop them. Unverified.
- Copy actions (`hooks/register.tsx:905`, `:911`) likely fail in Code mode.

## Connectors and MCP

- The app delivers claude.ai connectors to local and SSH Code sessions as in-process `type: "sdk"` servers. "no MCP setting or `managed-mcp.json` reaches them" (https://code.claude.com/docs/en/mcp#how-connectors-reach-claude-code).
- Servers in `claude_desktop_config.json` reach both the chat side and local Code sessions, and win name clashes. The CLI does not read that file (https://code.claude.com/docs/en/desktop#mcp-servers-from-the-claude-desktop-chat-app, Markdown lines 995-1002).
- MCP Apps (tool results with an HTML view) render in Claude Desktop chat and claude.ai as inline iframes, one per tool call. "Claude Code calls the tool as text and doesn't render the UI" (https://claude.com/docs/connectors/building/mcp-apps/quickstart#see-the-ui-render-in-claude). Whether Code mode renders them is unknown.
- The Codex Inbox tab is an MCP App. An inbox in Claude mode could only take that form, plus tools (`docs/plans/clients.md:29`).

## Settings and environment

- Shared with the CLI: `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md files, hooks and skills (desktop page, Markdown lines 985-991).
- When the app starts a session, its launch environment wins: "Claude Code ignores an `env` value from any settings file for a variable the launch environment already sets. The debug log names each ignored variable" (https://code.claude.com/docs/en/settings-reference#how-env-values-interact-with-your-shell).
- Launched from the Dock or Finder on macOS, the app "reads your shell profile … to extract `PATH` and a fixed set of Claude Code variables, but other variables you export there are not picked up" (https://code.claude.com/docs/en/desktop, section "Local sessions", Markdown line 681). Inference: a `GH_TOKEN` exported only in the profile may be missing, so the inbox's `gh` calls may fail in the app.
- The app supplies "parent settings", which are managed settings passed by an embedding host. Claude Code ignores them "whenever an admin source is present" (settings-reference, sections `disableDesktopLocalSessions` and `parentSettingsBehavior`; https://code.claude.com/docs/en/managed-settings#let-an-embedding-host-add-policy).
- `disableDesktopLocalSessions` greys out Local and WSL sessions.
- `desktopSessionCleanupPeriodDays` sets an age limit for transcripts of sessions started or last continued in Claude Desktop or Cowork. Its default is `0`, "which sets no age limit". A transcript is deleted only once it is older than both this limit and `cleanupPeriodDays`. Needs 2.1.248 (https://code.claude.com/docs/en/settings-reference#desktopsessioncleanupperioddays).
- The guard loads when "The machine has managed settings" or "The user is signed in to Claude Code with a Team or Enterprise plan" (https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default, Markdown lines 58-63). There, a user's mod "can't change … the system prompt" or managed instructions (same page, line 64).
- The guard's public source goes further than the docs. It skips every user-tier hook on `prompt.compose`, `prompt.context`, `prompt.section`, `skill.prompt`, `attribution.text`, `settings.read` and `classic.*` (anthropics/claude-code `mods/sec-default/hooks/register.ts` L24-32, main at commit 684800b, 2026-09-29). It also refuses a user mod's `$.tool.register` while managed settings set `allowedMcpServers` (same source, L39-50). Whether the shipped engine's guard matches this source is unknown.
- Inference for the inbox where the guard loads: Claude would not get the inbox's guidance (`prompt.compose`, `hooks/register.tsx:2047`) or carry block (`prompt.context`, `:2228`). The reload after `/clear` and `/resume` (`classic.SessionStart`, `:1977`) and the `classic.PermissionRequest` hook (`:2150`) would not run. The band, pane and per-turn update would still run. Not verified live.
- Inference: the app's parent settings may count as managed settings and so seat the guard. Unverified.

## /resume, moving sessions and Remote Control

Source: https://code.claude.com/docs/en/desktop, Markdown lines 942-960, unless noted.

- `/resume` in Code mode works in local sessions only. It can pick up a CLI session.
- "Desktop continues the same session rather than a copy."
- `claude --desktop`, with `--continue` or `--resume <id>`, opens a CLI session in the app. It needs 2.1.285 or later.
- `/desktop` in the CLI moves the running session to the app. Both `/desktop` and `claude --desktop` need macOS or x64 Windows and a Claude subscription. They are "not available with API key authentication or on Amazon Bedrock, Google Cloud's Agent Platform, or Microsoft Foundry".
- Work across sessions sees only sessions the app ran: "By default it sees the 20 most recently active sessions" (desktop page, Markdown line 381).
- The app is both a Remote Control host (`/rc`) and a viewer (https://code.claude.com/docs/en/remote-control). A local session can connect to Remote Control automatically when it starts, per the app's setting or `remoteControlAtStartup` (desktop page, Markdown lines 411-424).
- A mod's drawing shows only "In the terminal on your machine" for Remote Control (overview#where-mods-run). Inference: a person who answers a Code-mode session from the phone sees no inbox.
- For the inbox: a resume loads a different conversation into a running session. Commit f7536d0 handles this at `classic.SessionStart`.

## App features that overlap the inbox

Source: https://code.claude.com/docs/en/desktop unless noted.

- **PR status bar.** "a CI status bar appears in the session. Claude Code uses the GitHub CLI to poll check results" (section "Monitor pull request status", Markdown lines 184-192). It can auto-fix CI and auto-merge.
- **Code review card.** `/code-review` findings appear "as a **Code review** card, grouped by file" in local, SSH and WSL sessions (section "Review your code", Markdown lines 173-178).
- **Task chips.** "When it notices something worth fixing that's out of scope … it offers the work as a task chip in the chat" (Markdown line 392). These overlap the inbox's findings. Inference: `mcp__ccd_session__spawn_task` backs them.
- **Projects.** The Overview pane has a "Waiting on you" group: "Threads that need your reply or approval, or that failed". Notifications fire when "a thread needs your input" (claude-projects page, Markdown lines 192-201). Projects threads are usually cloud sessions, where a mod draws nothing (line 15).

## Costs

- The inbox's per-turn update (a Sonnet call through `$.model.complete`, `MODEL` at `hooks/register.tsx:405`) uses "the user's plan or API key" (https://code.claude.com/docs/en/plugins/mods/api).
- Scheduled tasks and Dispatch run sessions with no one watching. If the app attaches to them, the inbox would spend usage there. Unknown.

## Where sources disagree

| Topic | Sources | Trust | Why |
|---|---|---|---|
| Modes | Docs: three tabs, Chat, Cowork, Code. Repo owner (`clients.md:22`): two modes, Claude and Code. | The repo owner for the current UI. The docs for what each part does. | The owner sees the current app. The docs and changelog have not caught up with the rename. |
| Whether Claude mode runs Claude Code | `clients.md:29`: "Claude mode runs no Claude Code session". Gateway docs: Cowork, Code and optionally Chat run "on embedded Claude Code sessions". | The gateway docs, until a live check. | It is a direct statement. `clients.md` cites no source. |
| Minimum engine for mods | Overview: Desktop from 2.1.286. Changelog: mods first at 2.1.287. | The overview for Desktop, as a floor. | The inbox was tested with 2.1.292 anyway. |
| How the inbox turns on | `clients.md:7` and `:56` say the mod "never hooks `session.attach`" and cite `register.tsx:1885`. | The code: `hooks/register.tsx:1966`, `:1971`. | The plan predates commit 05c3548. |
| Status of Code mode | `clients.md:35-37` say "Not tried" or unknown. | The repo owner's report: it loads. | Reported after commit 05c3548. Not rechecked on 2026-10-08. |
| Where engine copies live | `clients.md:45`, `:462` say the app "bundles" them. | Live and the desktop page: downloaded into `~/Library/Application Support/Claude/`. | Seen on disk; the docs say "downloads and updates". |
| Types version | `clients.md:460`: 2.1.293. | Neither is fixed. | The types file is rewritten by whichever engine last loaded the mod. It has read 2.1.292, 2.1.293, 2.1.294 and 2.1.295 at different times. |
| Copy on desktop | `clients.md:362`: copy routing is correct. Types: "a remote surface has no path yet". | The types. | They come from the engine. |
| Tested engine | `README.md:20`: tested with 2.1.292. App copy: 2.1.289. | Treat 2.1.292 as the minimum until tested. | Inference: the inbox sends `$.model.complete` cache blocks (`hooks/register.tsx:735`). Which engine added them was not found in the changelog. |
| Store key | `AGENTS.md`: the store is "keyed by the mod's name". | Live: name plus where it was loaded from (`inbox@inline`). | The file name hashes `inbox@inline`. |
| Link schemes | Interface docs: `https:` or `http://localhost`. Types: `https:` only. | Unknown. Test `http://localhost` live. | Two engine-side sources disagree. |
| Desktop is interactive | Desktop docs: "Desktop is interactive only." Types: `isInteractive` is false under the SDK. | Both, for different things. | The docs mean the experience. The types mean the engine flag. |
| What the guard blocks | Admin docs: a user mod can't change "the system prompt" or managed instructions; "Everything else is allowed". Guard source: skips all user-tier `prompt.compose`, `prompt.context` and `classic.*` hooks, and refuses `$.tool.register` under `allowedMcpServers`. | The source for intent; unknown for the shipped engine. | The docs never say a user mod's own additions are dropped. |
| Surfaces | Reference: `e.surface` is `terminal` or `desktop`. Types: four values, with element tables for `mobile` and `vscode`. | The types for what a hook must handle. | The overview says VS Code and Remote Control draw nothing in the app; the types may be ahead of the shipped clients. |

## Unknown, and how to check

Each check runs in a local Code-mode session in the app unless noted.

| Question | Live check |
|---|---|
| Which `origin.kind` a typed prompt has (`composer` or `sdk`) | Log `e.origin.kind` at `prompt.submit`, type a prompt, read the log. |
| Whether start or attach fires first, and whether `turnOn` runs twice | Log both events with a timestamp. Count `/inbox` registrations. |
| Whether tools registered at attach miss the first turn | Start a session, ask Claude on turn one to list `mcp__inbox__*` tools. |
| Whether `$.process` and `$.ui.copy` work | Press a copy action. Run a mod call to `$.process`. Log the results. |
| Pane placement | Log `viewport.isFullscreen`, `placement` and `bodyColumns` at draw time. |
| Whether hidden hotkey `Button`s draw or work | Look at the pane. Press the hotkey. |
| Whether `http://localhost` links are clickable | Draw one `Link` with that `href`. |
| Whether `classic.PermissionRequest` fires | Trigger a permission prompt; log the event. |
| What happens on `session.detach` and app quit | Log `session.detach` and `session.end`. Quit the app. Check whether the 1.5 s `session.end` budget is met and the store was written. |
| Whether a mod draws over SSH, and where its store lives | Open an SSH session to a host with the plugin. Look for the band. List `~/.claude/plugins/store/` on the remote host. |
| Whether Claude mode is Cowork, and what plugin parts it loads | Install a test plugin with a hook and a skill through Customize. Use them in Claude mode. |
| Whether Code mode renders MCP Apps | Call a tool from an MCP App server in Code mode. |
| Whether hot reload works in the app | Put `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` in the app's launch environment, edit the mod, check the pane. |
| Where the app shows mod failure lines | Save a hook that throws. Watch the app and `~/.claude/debug/`. |
| Whether every new session uses the newest copy; whether old copies are deleted | Run `/status` in a new session. List `~/Library/Application Support/Claude/claude-code/` after an app update. |
| Whether `--bare` becoming the `-p` default affects the app | Read the changelog when it lands. Check whether the app's command line changes. |
| Whether the app's parent settings seat the guard, and what it drops | Check whether `prompt.context` runs (the inbox's context reaches Claude). Check the debug log for the guard. |
| Whether scheduled and Dispatch sessions attach | Run a scheduled task. Check `claude agents --json` and the store for a new session entry. |
| Whether `$.ui.notify` works on desktop | Needs an app engine at 2.1.295 or later. Call it and watch for an OS notification. |
| Whether `/inbox` appears in the `/` menu | Type `/` in a Code-mode session. |
| Whether a mod can call `mcp__ccd_*` tools | Call `mcp__ccd_view__show_pane` from the mod and log the result. |

## Sources

Public docs read on 2026-10-08:

- https://code.claude.com/docs/en/desktop: tabs, Code-tab engine copy and updates, environments, Customize, shared settings, `/resume` and `--desktop`, Remote Control, chat-app MCP servers.
- https://code.claude.com/docs/en/desktop#claude-code-version-in-the-code-tab: the separate engine copy and how to update it.
- https://code.claude.com/docs/en/desktop#mcp-servers-from-the-claude-desktop-chat-app: `claude_desktop_config.json` servers.
- https://code.claude.com/docs/en/desktop#network-access-requirements: network needs.
- https://code.claude.com/docs/en/desktop-wsl: WSL sessions, no plugins.
- https://code.claude.com/docs/en/desktop-quickstart: the three tabs, the `/` menu.
- https://code.claude.com/docs/en/desktop-linux: the same tabs on Linux, updates through apt.
- https://code.claude.com/docs/en/plugins/install: installing plugins, one user-scope install for all local surfaces, the app's plugin browser.
- https://code.claude.com/docs/en/plugins/troubleshooting#plugin-isnt-available-in-this-environment: `/plugin` in the app.
- https://code.claude.com/docs/en/sessions: transcript storage.
- https://code.claude.com/docs/en/claude-projects: Projects and "Waiting on you".
- https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run: mods by environment and minimum versions.
- https://code.claude.com/docs/en/plugins/mods/reference: render sites, elements, limits, `session.attach`, plugin-folder variables.
- https://code.claude.com/docs/en/plugins/mods/interface#link-in-the-desktop-app: desktop `Link` rules.
- https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default: the built-in guard.
- https://code.claude.com/docs/en/plugins/mods/troubleshoot: why a mod does nothing, version-gated behavior.
- https://code.claude.com/docs/en/plugins/mods/api, /events, /create, /test, /gallery: API and event details.
- https://code.claude.com/docs/en/plugins/org#when-each-surface-applies-the-plugin-keys: plugin keys by surface.
- https://code.claude.com/docs/en/plugins/components#reach-users-on-claude-ai-and-cowork: plugins in claude.ai and Cowork.
- https://claude.com/docs/plugins/platform-support#compare-component-support-by-app: plugin parts by app.
- https://code.claude.com/docs/en/settings-reference: `disableSideloadFlags`, env precedence, `disableDesktopLocalSessions`, `parentSettingsBehavior`, `desktopSessionCleanupPeriodDays`.
- https://code.claude.com/docs/en/managed-settings#let-an-embedding-host-add-policy: parent settings.
- https://code.claude.com/docs/en/env-vars#in-settings-files: env in settings.
- https://code.claude.com/docs/en/mcp: connectors as `sdk` servers, importing from Claude Desktop.
- https://claude.com/docs/connectors/building/mcp-apps/quickstart#see-the-ui-render-in-claude: where MCP Apps render.
- https://claude.com/docs/connectors/building/mcp-apps/getting-started#try-an-example-mcp-app-in-claude-desktop: MCP Apps in Claude Desktop.
- https://code.claude.com/docs/en/claude-apps-gateway#deliver-policy-to-claude-desktop-sessions: tabs run on embedded Claude Code.
- https://code.claude.com/docs/en/network-config#desktop-and-claude-ai: network setup for the app.
- https://code.claude.com/docs/en/remote-control: the app as host and viewer.
- https://code.claude.com/docs/en/changelog: Cowork, SDK-host and mods entries through 2.1.295.

Other public source:

- anthropics/claude-code `mods/sec-default/` (README and `hooks/register.ts`), main at commit 684800b, 2026-09-29: what the guard skips and refuses. It may differ from the guard in a shipped engine.

Local sources:

- `.claude-plugin/types/claude-code/index.d.ts`: the engine types. Gitignored; rewritten by the engine that loads the mod.
- `hooks/register.tsx`: how the inbox turns on, reloads and reads prompt origins.
- `docs/plans/clients.md`: the client plan, including the repo owner's mode names.
- Live checks on this Mac: process arguments, `claude --version`, `claude agents --json`, `claude plugin list`, the files under `~/Library/Application Support/Claude/` and `~/.claude/plugins/store/`.
