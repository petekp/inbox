# Connectors, settings, /resume and app features

Part of [The Claude desktop app](../claude-desktop-app.md).

## Connectors and MCP

- The app delivers claude.ai connectors to local and SSH Code sessions as in-process `type: "sdk"` servers. "no MCP setting or `managed-mcp.json` reaches them" (https://code.claude.com/docs/en/mcp#how-connectors-reach-claude-code).
- Servers in `claude_desktop_config.json` reach both the chat side and local Code sessions, and win name clashes. The CLI does not read that file (https://code.claude.com/docs/en/desktop#mcp-servers-from-the-claude-desktop-chat-app, Markdown lines 995-1002).
- MCP Apps (tool results with an HTML view) render in Claude Desktop chat and claude.ai as inline iframes, one per tool call. "Claude Code calls the tool as text and doesn't render the UI" (https://claude.com/docs/connectors/building/mcp-apps/quickstart#see-the-ui-render-in-claude). Whether Code mode renders them is unknown.
- The Codex Inbox tab is an MCP App. An inbox in Claude mode could only take that form, plus tools.

## Settings and environment

- Shared with the CLI: `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md files, hooks and skills (desktop page, Markdown lines 985-991).
- When the app starts a session, its launch environment wins: "Claude Code ignores an `env` value from any settings file for a variable the launch environment already sets. The debug log names each ignored variable" (https://code.claude.com/docs/en/settings-reference#how-env-values-interact-with-your-shell).
- Launched from the Dock or Finder on macOS, the app "reads your shell profile … to extract `PATH` and a fixed set of Claude Code variables, but other variables you export there are not picked up" (https://code.claude.com/docs/en/desktop, section "Local sessions", Markdown line 681). Inference: a `GH_TOKEN` exported only in the profile may be missing, so the inbox's `gh` calls may fail in the app.
- The app supplies "parent settings", which are managed settings passed by an embedding host. Claude Code ignores them "whenever an admin source is present" (settings-reference, sections `disableDesktopLocalSessions` and `parentSettingsBehavior`; https://code.claude.com/docs/en/managed-settings#let-an-embedding-host-add-policy).
- `disableDesktopLocalSessions` greys out Local and WSL sessions.
- `desktopSessionCleanupPeriodDays` sets an age limit for transcripts of sessions started or last continued in Claude Desktop or Cowork. Its default is `0`, "which sets no age limit". A transcript is deleted only once it is older than both this limit and `cleanupPeriodDays`. Needs 2.1.248 (https://code.claude.com/docs/en/settings-reference#desktopsessioncleanupperioddays).
- The guard loads when "The machine has managed settings" or "The user is signed in to Claude Code with a Team or Enterprise plan" (https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default, Markdown lines 58-63). There, a user's mod "can't change … the system prompt" or managed instructions (same page, line 64).
- The guard's public source goes further than the docs. It skips every user-tier hook on `prompt.compose`, `prompt.context`, `prompt.section`, `skill.prompt`, `attribution.text`, `settings.read` and `classic.*` (anthropics/claude-code `mods/sec-default/hooks/register.ts` L24-32, main at commit 684800b, 2026-09-29). It also refuses a user mod's `$.tool.register` while managed settings set `allowedMcpServers` (same source, L39-50). Whether the shipped engine's guard matches this source is unknown.
- What this means for the inbox where the guard loads: the inbox uses no `prompt.compose` or `prompt.context` hook. Its guidance is in the `close` tool's description (`hooks/register.tsx:on('tool.describe')`), and its carry card is in the first prompt's added context (`hooks/register.tsx:on('prompt.submit')`). The guard passes both. It skips the reload after `/clear` and `/resume` (`hooks/register.tsx:on('classic.SessionStart')`), so the mod reloads at the first prompt after the switch. It also skips `hooks/register.tsx:on('classic.PermissionRequest')`, so the permission row comes from `tool.check`. The band, pane and per-turn update still run. See claude-code-mods.md, "What the guard's source skips (not in the docs)".
- Live on desktop 3.6556.2 with a managed settings file, a build with main's code got one "hook was skipped" notice, for `classic.SessionStart`, and `record`, `close` and a pane press worked. The older 0.2.9 build, which still had `prompt.compose` and `prompt.context` hooks, got four notices: `classic.SessionStart`, `prompt.context`, `prompt.compose` and `classic.Stop`. See `allowManagedPermissionRulesOnly` under "Live checks on desktop 3.6556.2".
- Live, 2026-10-23, desktop 3.6556.2 with engine 2.1.308: in a session with no managed settings file, the transcript held no guard text, so the app's parent settings did not seat the guard on that account. With `/Library/Application Support/ClaudeCode/managed-settings.json` present, the guard seated. See "Live checks on desktop 3.6556.2".

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

- The inbox's per-turn update (a Sonnet call through `$.model.complete`, `hooks/register.tsx:MODEL`) uses "the user's plan or API key" (https://code.claude.com/docs/en/plugins/mods/api).
- Scheduled tasks and Dispatch run sessions with no one watching. If the app attaches to them, the inbox would spend usage there. Unknown.
