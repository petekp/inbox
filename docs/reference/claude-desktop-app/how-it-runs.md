# Modes, engine, versions, environments and plugins

Part of [The Claude desktop app](../claude-desktop-app.md).

## Modes and tabs

The public docs and the app disagree on naming.

| Source | What it says |
|---|---|
| https://code.claude.com/docs/en/desktop (Markdown line 9) | "three tabs: **Chat** … **Cowork** … and **Code**" |
| desktop-quickstart (Markdown lines 34-38) | The same three tabs. |
| The repo owner, told to Claude | "The Claude desktop app has two modes, Claude and Code." |
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

**Environment (app bundle 3.6556.2):** the app's Code-session spawn sets `CLAUDE_CODE_ENTRYPOINT` to `claude-desktop`, or to `claude-desktop-3p` for a third-party provider. It removes `CLAUDECODE` and `CLAUDE_CODE_CHILD_SESSION`, which Claude Code sets for every command it runs.

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

- `session.start` calls `registerInboxCommand` before `next(e)`, so `/inbox` is registered before the first prompt. Registration retries when Inbox activates.
- An interactive start, a start in a process the app started, or a desktop attach activates Inbox. Only a start is sure to register the tools before the first prompt: see "A reopened session's first prompt". A shared initialization promise prevents concurrent handlers from loading it twice.
- `command.run` waits for initialization. While Inbox is inactive, only an engine-stamped `composer` origin can activate it; SDK and plugin command calls leave it inactive.
- `classic.SessionStart` with source `clear`, `resume` or `fork` loads the conversation the event names.
- Prompt bookkeeping skips Inbox's own plugin prompts and counts origins `composer`, `bridge`, or `plugin` with `asUser` as the person's words.

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
| The app holds 2.1.293 and 2.1.295 in `~/Library/Application Support/Claude/claude-code/`. On 2026-10-08 it held 2.1.289 and 2.1.293. | Live |
| The app installed 2.1.295 at 14:41 PDT on 2026-10-09. The Code-mode session started then runs it. Sessions before then ran 2.1.293. | Live: folder time, process path and start time |
| `~/Library/Application Support/Claude/claude-code-vm/` holds 2.1.295. On 2026-10-08 it held 2.1.293. | Live. Inference: the copy for Cowork's VM mode. |

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

- Install a plugin in Code mode through + > Plugins > Add plugin, per the docs. Live on app 2.37337.1 (2026-10-16), the + menu instead reads Add plugins, which opens a Directory of plugins. The Directory's + at the top right offers Add from a repository, which takes a GitHub `owner/repo`, adds the marketplace, and lists its plugins under a Code tab. A plugin's + there installs it at user scope without asking for a scope. Installing works for local and SSH sessions only: "The plugin browser isn't available in the desktop app's cloud sessions" (https://code.claude.com/docs/en/plugins/install#install-a-plugin).
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
