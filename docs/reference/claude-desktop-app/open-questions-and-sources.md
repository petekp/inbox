# Where sources disagree, what is unknown, and sources

Part of [The Claude desktop app](../claude-desktop-app.md).

## Where sources disagree

| Topic | Sources | Trust | Why |
|---|---|---|---|
| Modes | Docs: three tabs, Chat, Cowork, Code. Repo owner: two modes, Claude and Code. | The repo owner for the current UI. The docs for what each part does. | The owner sees the current app. The docs and changelog have not caught up with the rename. |
| Whether Claude mode runs Claude Code | The repo owner: Claude mode runs no Claude Code session. Gateway docs: Cowork, Code and optionally Chat run "on embedded Claude Code sessions". | The gateway docs, until a live check. | The gateway docs are a direct statement. The owner's claim cites no source. |
| Minimum engine for mods | Overview: Desktop from 2.1.286. Changelog: mods first at 2.1.287. | The overview for Desktop, as a floor. | The inbox was tested with 2.1.292 anyway. |
| Copy on desktop | Types: "a remote surface has no path yet". A live probe returned `isCopied: true`. | The live probe. | It ran against the desktop app. |
| Tested engine | `README.md:20`: tested with 2.1.292. App copy: 2.1.289. | Treat 2.1.292 as the minimum until tested. | Inference: the inbox sends `$.model.complete` cache blocks (`hooks/register.tsx:askInboxModel`). Which engine added them was not found in the changelog. |
| Store key | `AGENTS.md`: the store is "keyed by the mod's name". | Live: name plus where it was loaded from (`inbox@inline`). | The file name hashes `inbox@inline`. |
| Link schemes | Interface docs: `https:` or `http://localhost`. Types: `https:` only. | Unknown. Test `http://localhost` live. | Two engine-side sources disagree. |
| Desktop is interactive | Desktop docs: "Desktop is interactive only." Types: `isInteractive` is false under the SDK. | Both, for different things. | The docs mean the experience. The types mean the engine flag. |
| What the guard blocks | Admin docs: a user mod can't change "the system prompt" or managed instructions; "Everything else is allowed". Guard source: skips all user-tier `prompt.compose`, `prompt.context` and `classic.*` hooks, and refuses `$.tool.register` under `allowedMcpServers`. | The source for intent; unknown for the shipped engine. | The docs never say a user mod's own additions are dropped. |
| Surfaces | Reference: `e.surface` is `terminal` or `desktop`. Types: four values, with element tables for `mobile` and `vscode`. | The types for what a hook must handle. | The overview says VS Code and Remote Control draw nothing in the app; the types may be ahead of the shipped clients. |

## Unknown, and how to check

Each check runs in a local Code-mode session in the app unless noted.

| Question | Live check |
|---|---|
| Whether `keybindings.json` or any key reaches a desktop pane | Rebind `pane:close`, focus the pane, and try it. |
| Whether `/clear` and `/resume` in the app raise `classic.SessionStart` with the new id | Log `classic.SessionStart` and `session.end`, then run both in the app. |
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
- Live checks on this Mac: process arguments, `claude --version`, `claude agents --json`, `claude plugin list`, the files under `~/Library/Application Support/Claude/` and `~/.claude/plugins/store/`.
