# The desktop app

Part of [Claude Code mods](../claude-code-mods.md).

The public docs describe "three tabs: **Chat** for conversations, **Cowork** for Dispatch and longer agentic work, and **Code** for software development". [desktop] The app now shows two modes, "Claude" and "Code" (reported by the repo owner). This document reads "Code tab" in the docs as Code mode. Whether Claude mode equals Chat plus Cowork is unknown.

## How Code mode runs the engine

- Docs: "Desktop runs the same underlying engine with a graphical interface… Each keeps its own session list". [desktop#coming-from-the-cli] "In a local session, the **Code** tab runs its own copy of Claude Code, which has its own version number. The desktop app downloads and updates that copy". [desktop#claude-code-version-in-the-code-tab]
- Docs: "Desktop is interactive only" (no `--print`). [desktop#cli-flag-equivalents] The docs never say "SDK", "headless" or "child process" for the desktop app. They do say canUseTool "is how Claude Desktop and the VS Code extension host Claude Code". [H#notification]
- Live (`ps`, 2026-10-08): the app launches `~/Library/Application Support/Claude/claude-code/2.1.293/<hash>/claude.app/Contents/MacOS/claude` with `--input-format stream-json --output-format stream-json --verbose --include-partial-messages --replay-user-messages --await-initialize --permission-prompt-tool stdio --permission-mode --model --resume=<id> --settings --setting-sources --project-config-root --allowedTools --disallowedTools --thinking-display`. No `-p`.
  - Inference: the app drives a headless child over the SDK stream-json protocol. "Interactive" in the docs means the user experience, not the engine's `isInteractive` flag.
- Live: the child's `--allowedTools` lists app-injected MCP tools: `mcp__ccd_session__*`, `mcp__ccd_session_mgmt__*`, `mcp__ccd_view__*`, `mcp__ccd_window__*`, `mcp__ccd_sidebar__*`, `mcp__ccd_pr__get_status`, `mcp__ccd_connectors__*`, `mcp__ccd_settings__get_settings` (for example `list_sessions`, `send_message`, `show_pane`, `spawn_task`). Inference: these back "Work across sessions", task chips and pane control. Whether a mod can call them is unknown.
- Types: "`desktop` is Claude Code Desktop… A remote surface asks over the wire (ui_render)". [T: `RenderSurface`]
- Live versions: app 2.31226.0 (Info.plist); engines on disk 2.1.289 and 2.1.293; running children 2.1.293; terminal CLI 2.1.295.
- The app auto-updates on launch on macOS and Windows. MDM can control that. Linux has no self-update ("apt doesn't deliver new versions" with `CLAUDE_DESKTOP_ADD_REPO="false"`). [desktop; desktop-linux#update] So desktop users may run older engines than the terminal.
- Desktop requires a Claude subscription. It can route through a gateway ("Claude Desktop on 3P"). [feature-availability]
- Desktop docs cite app versions in two schemes (v1.2581.0, 1.1.5368, v2.110.0). The live app is 2.31226.0. Inference: the scheme moved from 1.x to 2.x, and every 1.x minimum is met.

## Environments in Code mode

| Environment | What runs where | Plugins and mods | Source |
|---|---|---|---|
| Local | Your machine | Load; the mod runs and draws | [desktop#local-sessions; O#where-mods-run] |
| SSH | Remote Linux or macOS host; "Desktop installs Claude Code on the remote machine automatically" | "SSH sessions support permission modes, connectors, plugins, and MCP servers." Skills and managed settings are read from the remote host. Inference: the mod runs and draws there, with its own remote `$.store`. Not checked live. | [desktop#ssh-sessions] |
| WSL | Inside a WSL 2 distribution | "connectors and plugins" not available. No inbox. A `\\wsl.localhost\...` folder picked normally "reopens inside that distribution". | [desktop-wsl] |
| Cloud | Anthropic-managed infrastructure | "plugins you install from the desktop app aren't available for cloud sessions" | [desktop#install-plugins] |

- `disableDesktopLocalSessions` grays out Local (and WSL); new sessions default to the first SSH connection "if one is configured". [desktop#local-sessions-on-managed-devices]
- macOS environment: launched from the Dock, the app "reads your shell profile… to extract `PATH` and a fixed set of Claude Code variables, but other variables you export there are not picked up". "restart the desktop app to reload environment variables". [desktop#local-sessions] Inference: a `GH_TOKEN` exported in a shell profile may be missing in desktop sessions, so the inbox's `gh` calls may fail there while working in the terminal.
- "The desktop app reads the same settings files as the CLI." Hooks and skills in settings apply to both. [desktop#shared-configuration]

## Desktop features that overlap the inbox

- PR monitoring: "a CI status bar appears in the session. Claude Code uses the GitHub CLI to poll check results", with **Auto-fix CI & address comments** and **Auto-merge when ready**. [desktop#monitor-pull-request-status]
- Code review card: `/code-review` findings "as a **Code review** card, grouped by file", with **Fix this one** and **Apply fixes**. [desktop#review-your-code]
- Tasks pane for subagents and background shells. [desktop#watch-background-tasks]
- Task chips: "When it notices something worth fixing that's out of scope… it offers the work as a task chip". [desktop#work-across-sessions] This overlaps the inbox's findings.
- OS notification "when a Code session finishes a task and you aren't currently viewing that session". [desktop#work-in-parallel-with-sessions]
- Projects Overview has a **Waiting on you** group: "Threads that need your reply or approval, or that failed". Threads are usually cloud sessions. [claude-projects]
- Right-click on a path offers **Open in**, **Show in Finder** and **Copy path**. [desktop#open-and-edit-files] This overlaps the inbox's launchable-files action.
- Prompt suggestions come from "a short background request that counts toward your plan's usage limits or your API costs". [desktop#accept-a-suggested-prompt]

## Sessions, continuity and input

- Mid-turn input: "type a correction and press **Enter** to send it without stopping the running action". Commands sent mid-turn work from v2.1.206. [desktop#use-the-prompt-box; desktop#use-skills] Inference: one turn can carry several user messages; the per-turn update should not assume one prompt per turn.
- The `/` menu lists built-in commands and skills. Whether a mod command such as `/inbox` appears is unknown. Commands "with no argument form, such as `/permissions`, reply with `isn't available in this environment`". [desktop#use-skills; desktop#whats-not-available-in-desktop]
- `/desktop` in the CLI "saves your session and opens it in the desktop app, then exits the CLI". `claude --desktop [--continue | --resume <id>]` needs 2.1.285. Desktop `/resume` works "in local sessions, not in SSH, WSL, or cloud sessions". "Desktop continues the same session rather than a copy". [desktop#coming-from-the-cli] So the inbox's `s:<sessionId>` record carries across terminal and desktop.
- **Open in → Cloud** carries the conversation "as a summary" and may archive the local session. [desktop#continue-in-another-surface]
- Work across sessions: "Claude sees only the sessions the desktop app runs itself: local, SSH, and WSL sessions in the Code tab. Claude doesn't see cloud sessions, or sessions you started from the terminal CLI or the VS Code extension". 20 most recent. It "can't send cross-session messages from a session nobody is watching, such as a scheduled-task run". [desktop#work-across-sessions]
- Scheduled tasks: Desktop checks "every minute while the app is open" and starts a fresh session when a task is due. "Tasks only run while the desktop app is running and your computer is awake." Runs can wait on permission prompts. [desktop-scheduled-tasks] Dispatch (in Cowork) can spawn Code sessions. [desktop#sessions-from-dispatch]
  - Inference: if the app attaches to these sessions as `desktop`, the inbox makes per-turn Sonnet calls with nobody watching. Unknown.
- Remote Control: local sessions appear on other devices once connected; `disableRemoteControl: true` stops new connections. A laptop icon shows the connection. [desktop#control-which-sessions-appear-on-your-other-devices]
- Plan usage "is shared across all your Claude Code surfaces". [desktop#check-usage]

## Panes, links and keys in the app

- The app has its own panes: chat, diff, browser, terminal, file, plan, tasks, subagent. "Press **Cmd+\\**… to close the focused pane". Panes can pop out into windows. "In Desktop, `Shift+Tab` doesn't cycle permission modes." [desktop#arrange-your-workspace; desktop#keyboard-shortcuts] Where a mod pane docks among these is unknown.
- The first click on an external link in chat asks whether links open in the Browser pane or the default browser; Cmd-click opens the default browser. The Browser pane "uses a clean browser profile", but users can sign in and keep cookies. [desktop#browse-external-sites] Whether this applies to mod-drawn links is unknown.
- Mod `Link` in desktop: only `https:` (and per docs `http://localhost`). `claude-cli://`, `claude://`, `vscode://` and `file://` draw as plain text. [IF#link-in-the-desktop-app]

## Deep links

- `claude-cli://open?q=…&cwd=…&repo=…` opens a new terminal session with a pre-filled prompt. "The prompt is populated but not sent until you press Enter." `q` max 5,000 characters. "A deep link never executes anything on its own." The handler registers "when you send your first prompt of an interactive session", so it may be missing on desktop-only machines. [deep-links]
- `claude://code/new?q=…` opens the desktop new-session page. "It treats the prompt as plain text, so a leading `/` or `!` and an `@` file mention don't act as a command". SSH parameters need v2.110.0. [desktop#open-an-ssh-session-from-a-link]
- GitHub strips custom schemes in READMEs, issues, PRs and wikis. [deep-links#the-link-renders-as-plain-text-instead-of-being-clickable]
- Inference: deep links can open a new session from the Codex tab or a web page. They can't target an existing session, and can't be a mod `Link` in desktop.

## Admin and network

- Desktop managed keys: `disableDesktopLocalSessions`, `disableSshSavedPasswords`, `sshConfigs`, `sshHostAllowlist`, `browserExternalPageTools`, `disableBrowserExternalNavigation`, `managedMcpServers` (3P). The Linux policy file `/etc/claude-desktop/managed-settings.json` is "a different file from Claude Code's managed settings file". [desktop#managed-settings; desktop#device-management-policies]
- Admin-console settings "also reach these sessions on Anthropic's API when the session authenticates with an eligible login". "In a Cowork session on this machine, Claude Code never fetches admin-console settings". [desktop#managed-settings] Inference: Cowork sessions run Claude Code. Whether Claude mode runs a Claude Code session is open if Claude mode includes Cowork.
- Live, 2026-10-16, `claude plugin validate` on Claude Code 2.1.302 (first seen on 2.1.299, absent on 2.1.296): "hooks on classic.SessionStart, prompt.compose, classic.PermissionRequest, classic.StopFailure, classic.Stop, prompt.context do not run in a plugin a person installs where an organization manages Claude Code: there, these events pass over the plugins you install, and only a plugin the organization lists in managed settings runs them".
- 2.1.304 "Removed the notes from `claude plugin validate` that predicted where a mod's hooks would run", and "Added a transcript line when a plugin that runs first skips one of your mod's hooks, naming the event and the plugin". [CL#2-1-304] Live, 2026-10-21, on 2.1.306: `claude plugin validate` no longer prints the note above. It still lists the gating hooks without `.catch`.
- Engine source, 2.1.302 binary: the passed-over set is every `classic.*` event, plus `prompt.section`, `prompt.context`, `prompt.attachment`, `prompt.compose`, `skill.prompt`, `attribution.text`, `session.compact`, `settings.read`, and `session.append` on the `attachment`, `hook-context` and `compaction` doors. It applies to plugins of tier `user` while a module named `cc-plugin-sec-default` is loaded. A plugin listed in managed settings gets tier `prepend`. `tool.describe`, `tool.call`, `turn.complete` and `ui.*` are not in the set. Inference: the inbox's per-reply update and its tools keep working; its guidance, `inbox:` texts, `/clear` and resume reloads, permission and stop-failure rows do not.
- Network hosts include `*.claudeusercontent.com` and `*.claudemcpcontent.com`. [desktop#network-access-requirements]
- Feature availability by provider: Desktop, cloud sessions, mobile, Remote Control and Artifacts need a Claude subscription. When `ANTHROPIC_BASE_URL` is not `api.anthropic.com`, Claude Code turns off Remote Control and server-managed settings. [feature-availability]
