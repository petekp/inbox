# Claude Code mods

Checked on 2026-10-08.

The inbox runs in Claude Code as a **mod**: a plugin whose TypeScript hooks module watches Claude Code's events, calls a mods API (`$`), and draws a band above the prompt and a pane. This page records what the public docs, the engine's own types and live checks say about that platform, as it bears on the inbox. It covers the terminal, the desktop app's Code mode, headless runs, the other clients, admin policy, costs and recent changes.

Versions on 2026-10-08:

| What | Version | Source |
|---|---|---|
| Claude Code in the terminal | 2.1.295, released that day | Live `claude --version`; [CL#2-1-295] |
| Desktop app | 2.31226.0, running engine copies 2.1.293 (2.1.289 also on disk) | Live, `Info.plist` and `ps` |
| Mods reference | "as of v2.1.290" | [R] |
| Local engine types | Header read 2.1.293, 2.1.294 and 2.1.295 at different times that day | Live, `.claude-plugin/types/claude-code/index.d.ts:1` |
| Minimum for mods | Terminal 2.1.287, desktop 2.1.286 | [O#turn-mods-on-or-off] |
| Minimum for the inbox's code | 2.1.292 (`cache` blocks in `$.model.complete`) | [CL#2-1-292]; `hooks/register.tsx:735` |
| Repo | `main` at `55ab122` | Live `git log` |

### Key constraints

1. **Only the terminal and desktop Code mode draw.** "A mod's hooks run in every kind of session that loads the plugin. Drawing is narrower: only the terminal and the Desktop app show a mod's panes, bands, and replaced rows." [O#where-mods-run] `-p`, the Agent SDK and the VS Code chat panel run hooks and draw nothing. Under Remote Control, hooks run on the host machine and the phone or browser shows nothing a mod draws. A cloud session runs hooks only for a plugin that reaches it.
2. **Desktop Code mode starts headless.** The app is an SDK host that runs the engine as a stream-json child process (live `ps`; changelog 2.1.208, 2.1.260, 2.1.282). The types say a remote client joins through `session.attach` "(… the desktop app connected)". [T: `SessionAttachInput`] No public doc says this. The inbox turns on at `session.start` or `session.attach` (`hooks/register.tsx:1962-1974`, commit `05c3548`).
3. **The biggest open risk: a prompt typed in Code mode may not count as the person's words.** The inbox counts only `composer`, `bridge` and `plugin` with `asUser` (`hooks/register.tsx:2024-2025`). The types define `composer` as "The user's own gesture at the terminal" and `sdk` as "The SDK host's own turn (`claude -p`, the Agent SDK), not typed at a terminal". [T: `PromptOrigin`] What Code mode sends is unknown.
4. **`/clear`, `/resume` and `/branch` change the conversation without a new `session.start`.** On `/clear` "the conversation ends, the process goes on under a new session id, and no `session.start` fires for it." [T: `SessionEndInput.reason`] `classic.SessionStart` with source `clear`, `resume` or `fork` is the reload point. [IF] All `session.end` work shares one 1.5-second bound, `$` waits included. [T; H#sessionend]
5. **On Team and Enterprise sign-ins and managed machines, a built-in guard limits the inbox.** The inbox installs from GitHub, so it "counts as a user's" mod. [A#apply-your-plugin-controls-to-mods] The guard's public source skips user-tier hooks on `prompt.compose`, `prompt.context` and `classic.*`. [G] Inference: the inbox's guidance and carry text would not reach Claude there. Not verified live.
6. **The per-turn model call bills the person, and `sonnet` is not one model.** `$.model.complete` uses "the session's own API client". [T] `sonnet` means Sonnet 5.5 on the Anthropic API, 4.6 on Claude Platform on AWS, and 4.5 on Bedrock, Agent Platform and Foundry. [MC#model-aliases] No public doc covers how mod calls are billed.
7. **`$.store` is one JSON file per plugin id, shared by every session, with no atomic update.** "A `get` followed by a `set` isn't atomic." [IF] The cap is 4 MiB. [R#limits] Live file names show the key is the plugin id (`inbox@inline`), not the name.
8. **Engine versions differ by client and lag each other.** The desktop app downloads its own engine and updates it separately. [desktop#claude-code-version-in-the-code-tab] One changelog entry says its fix reaches the app only "once Desktop bundles this CLI version". [CL#2-1-269] Inference: every engine fix reaches Code mode only when the app downloads that engine. The type check runs against whichever engine last wrote the gitignored types.

### How to read this page

- Each fact carries its source in brackets. A short key such as `[O#where-mods-run]` names a page and its section; "Sources" at the end maps each key to its URL.
- `[T: name]` is the engine types file, cited by symbol, because its line numbers change with each engine.
- `file:line` is this repo at `55ab122`.
- "Live" is a command or file listing run on 2026-10-08. "Inference" marks reasoning that no source states. "Unknown" means no source settles it.
- Contradictions are collected in "Where sources disagree". Open questions, each with a check, are in "Unknown, and how to check".

### Contents

1. What a mod is; versions; where mods run and draw
2. The desktop app
3. Building and loading a mod; testing; troubleshooting
4. Lifecycle, the hook function, events, the `$` API, limits
5. Drawing: render sites, elements, keyboard and focus
6. Settings hooks and `classic.*` events
7. Security model and admin policy
8. Settings, environment variables and permissions
9. What the inbox's model calls cost
10. Plugins and marketplaces
11. MCP and MCP Apps
12. Remote Control, mobile and cloud sessions
13. Sessions across processes and apps
14. Headless `-p` and the Agent SDK
15. IDE extensions, the status line and artifacts
16. Recent changes
17. What this repo has verified, and what is stale
18. Where sources disagree
19. Unknown, and how to check
20. Sources

## What a mod is

- A mod is a plugin made of JS or TS event handlers. A handler "can watch the event, change it, or take it over". [O#mods-overview]
- The mods docs call a mod's handler a "hook". A hook defined in a settings file is a "settings hook". [O, top of page]
- A mod can do what settings hooks, skills, status lines and MCP servers can't. [O#what-a-mod-can-do]
  - Draw "a pane beside the transcript or a band above the prompt, with tabs, buttons, and text fields".
  - Redraw Claude Code's own rows: tool rows, the spinner, the AskUserQuestion dialog.
  - Hold a tool call, answer it without running the tool, or call another model.
  - Register a `/command` that runs "at once, with no Claude turn, even while Claude is working".
  - Share variables between hooks.
- "Claude Code runs your hook before it acts on the event, so the hook decides what happens next." A hook can observe, rewrite or answer the event. [O#what-a-hook-can-do-with-an-event]
- "To do anything outside its own code, such as draw, add a command, call a model, read a file, start a process, or make a network request, a hook calls the mods API. A hook has no other way to do those things." This is why `claude plugin validate` can list what a mod does without running it. [O#what-a-hook-can-do-with-an-event]
- A minimal mod has three files: `.claude-plugin/plugin.json`, `hooks/hooks.json` (which names the code under `modules`) and the hooks module, such as `hooks/register.js`. [O#how-a-mod-works]
- Only a mod can draw. The comparison table marks "Can it draw in the interface" as "Yes" for a mod and "No" for settings hooks, skills and MCP servers. One plugin can hold a mod, a skill and an MCP server together. [O#compare-mods-settings-hooks-skills-and-mcp-servers]
- Some built-in features are mods, such as `/diff`. [O#get-a-mod]

The inbox's files (live, this repo):

| File | What it holds |
|---|---|
| `.claude-plugin/plugin.json` | `name`, `description`, `types`. No `version` or `author`. |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `.claude-plugin/marketplace.json` | One entry, `{ "name": "inbox", "source": "./" }` |
| `.claude-plugin/types/claude-code/index.d.ts` | Engine types. Gitignored. Rewritten by whichever engine last loaded the mod. |

## Versions and turning mods on or off

- "Mods are on by default. In the terminal, use Claude Code v2.1.287 or later. The Desktop app includes its own copy of Claude Code, and mods work there from v2.1.286." [O#turn-mods-on-or-off]
- The admin page says "Mods are on by default in Claude Code v2.1.286 and later", with no split by app. [A, top of page] See "Where sources disagree".
- The reference describes "the Claude Code CLI and the Desktop app as of v2.1.290". [R, top of page]
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` was an early-access switch. "Claude Code v2.1.287 and later ignores it, so setting it to `0` doesn't keep mods off." [O#turn-mods-on-or-off; A]
- Check the terminal engine with `claude --version`. Check the desktop engine "in a local session in the Code tab, enter `/status` and read the **Claude Code** row". [O#turn-mods-on-or-off]
- The desktop app runs its own engine copy. It "can differ from the `claude` command in your terminal, and updating one doesn't update the other". Update it with Claude → Check for Updates, then "start a new session". [desktop#claude-code-version-in-the-code-tab]
- A mod can read its engine version at run time: `$.session.version()` returns `{ version, base, builtAt }`. [T: `session.version`]
- Ways to turn mods off: [O#turn-mods-on-or-off]

| Scope | How |
|---|---|
| One mod | Disable or uninstall it on the Installed tab of `/plugin`. |
| All installed mods, one session | `--safe-mode`, which "also disables your other customizations". |
| Every installed mod, every session | `"disableAllHooks": true` in `~/.claude/settings.json`. Settings hooks and the custom status line stop too. "What your organization manages keeps running." |

- "`disableAllHooks` and your organization's `allowManagedModsOnly` stop a mod and leave the rest of its plugin in place: the plugin stays installed, and its skills, commands, agents, and MCP servers load. Other settings and flags reach further." [O#turn-mods-on-or-off]
  - Inference: the inbox registers its tools and `/inbox` from mod code (`$.tool.register`, `$.command.register`), so they go away with the hooks. Not verified.
- See which mods a terminal session loaded: `/plugin` shows "a dim line under the tabs" such as `1 mod active · first-mod`. The doc names only "a terminal session". [O#see-which-mods-a-session-loaded]
- After installing or updating from a shell while a session is open, "run `/reload-plugins` in that session to load it. Otherwise it loads the next time you start Claude Code." [O#install-or-update-a-mod]
- Sample mods live in `claude-code/mods` of anthropics/claude-code-playground, shared "as they are, without support": `token-weather` draws a band, `blast-radius` holds risky shell commands behind proceed and cancel buttons, `replay-theater` adds `/replay`. [O#try-a-sample-mod]

### Built-in mods

Built-in mods show under **Built-in** in `/plugin` → Installed. They can't be updated or uninstalled. The `mods active` line leaves them out. [O#mods-built-into-claude-code]

| Built-in mod | What it does | When it is on |
|---|---|---|
| `cc-plugin-agents-md` | Loads `AGENTS.md`. Has a userConfig option. | Every session that can read AGENTS.md. |
| `cc-plugin-diff` | "Takes over `/diff` and draws its pane". Its source shows buttons bound to keyboard actions and scrolling the mod handles itself. | "Interactive terminal sessions". Disabling it leaves the built-in `/diff`. |
| `cc-plugin-plugin-authoring` | A skill, no mod code. | "Unless Anthropic has turned installed mods off remotely". |
| `cc-plugin-sec-default` | The guard (see "Admin policy that can stop the mod"). | Can't be turned off by the user. |
| `cc-plugin-telemetry` | Analytics for Claude Code and built-in mods. Adds methods other mods can call. | Off with `DISABLE_TELEMETRY`. |
| `cc-plugin-you-should-know` | "Runs a side agent that watches your back while Claude works on longer tasks. When it finds something worth knowing that you might miss, it shows you a note above the prompt." | "Disabled by default". Enable with `/plugin enable cc-plugin-you-should-know@builtin`. |

- "The settings and flags that stop installed mods, such as `disableAllHooks`, `--bare`, and `--safe-mode`, don't stop built-in mods." [O#mods-built-into-claude-code]
- Public source for `diff`, `agents-md`, `sec-default` and `telemetry` is in `mods/` of anthropics/claude-code. Not for `you-should-know`. [O#read-the-source-of-built-in-mods]
- `$.telemetry` records are "sent only when Claude Code or a built-in mod makes the call". [R]
- Inference for the inbox: `cc-plugin-you-should-know` also spends model calls and draws above the prompt. It overlaps the inbox's findings and band. How the two bands are ordered is unknown.

## Where mods run and draw

"A mod's hooks run in every kind of session that loads the plugin. Drawing is narrower: only the terminal and the Desktop app show a mod's panes, bands, and replaced rows." [O#where-mods-run]

| Session | Hooks run | Draws | Source |
|---|---|---|---|
| `claude` in a terminal, an editor's integrated terminal, or the JetBrains plugin | Yes | Yes | [O#where-mods-run] |
| Desktop app, Code mode, local, not WSL | Yes | "Yes, except elements the elements table marks terminal-only" | [O#where-mods-run] |
| Desktop app, WSL session | No: "plugins aren't available in WSL sessions" | No | [O#where-mods-run]; [desktop-wsl] |
| VS Code extension chat panel | Yes | No | [O#where-mods-run] |
| `claude -p` and the Agent SDK | Yes | No | [O#where-mods-run] |
| Remote Control from claude.ai or the mobile app | "Yes, in the session on your machine" | "In the terminal on your machine" | [O#where-mods-run] |
| Cloud session | "Yes, for a plugin that reaches the cloud session" | No | [O#where-mods-run] |

- "A mod that draws can check which app it's running in, and fall back to a line in the transcript or a command's text reply where nothing draws." The page doesn't name the API. [O#where-mods-run] `$.session.surfaces()` is the API in the types. [T: `session.surfaces`]
- Which plugins reach a cloud session on Anthropic's infrastructure: only those enabled through server-managed settings. "A cloud session doesn't install the plugins a repository turns on under `enabledPlugins`". Plugins "enabled only in your user settings" don't reach it. MDM and file-delivered settings don't arrive "because the session runs on an Anthropic-managed VM". [ENV#what-carries-over-from-your-setup; PO#when-each-surface-applies-the-plugin-keys]
  - Inference: the inbox, installed by users from GitHub, does not run in cloud sessions unless an org enables it through server-managed settings.
- In `-p` and CI, "marketplaces and plugins install in the background, so a plugin can be missing from the first turn". `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` makes the run wait. [PO#when-each-surface-applies-the-plugin-keys]

### How the desktop app runs a Code-mode session (live, types, repo)

Public docs say nothing about this. It comes from the engine types, the changelog and live checks.

- A local Code-mode session runs the engine headless. The app is an SDK host: it starts a stream-json child process with `--permission-prompt-tool stdio`. (Live `ps`, 2026-10-08. See "The desktop app".)
- The app downloads its own engine copies into `~/Library/Application Support/Claude/`, not into the app bundle. On this machine on 2026-10-08: `claude-code/2.1.289` and `claude-code/2.1.293`, plus `claude-code-vm/2.1.293`. App version 2.31226.0. (Live.) What `claude-code-vm` is for is unknown.
- Inference from the types: a Code-mode session starts with `isInteractive: false` and `surface: null`, and the app then joins as surface `desktop` through `session.attach`. Not observed directly. `docs/plans/clients.md:56` records that in a live Code-mode session, while the mod gated on `isInteractive` alone, "`/inbox` and the mod's tools did not exist". Commit `05c3548` adds the `surfaces()` and `session.attach` paths, and `tests/hooks.test.ts:1047-1064` cover both attach orders. Which path fires live, and the start values, were not logged.
- `SessionStartInput` documents only two cases: `surface` is "`terminal` under the REPL; null for a `-p` run or the SDK", and `isInteractive` is "true under the REPL, false for a `-p` run or the SDK". [T: `SessionStartInput`]
- `session.attach` "Fires when a remote client joins the session's roster … (a phone opened the session; the desktop app connected)". It carries `surface`, `clientId` and `viewport?`. "the terminal's attachment is the REPL's binding and raises nothing". `session.detach` carries reasons, session end among them. [T: `session.attach`, `session.detach`]
- `$.session.surfaces()` "Returns every surface the session draws on … `terminal` under the REPL first, then the remote ones in the order they attached. A session may draw on several at once (a terminal and two phones) … Empty in a plain -p run". `$.session.surface()` is deprecated. [T: `session.surfaces`]
- `PromptComposeInput.surfaces` gives "Where the session draws at this render … empty where nothing draws". [T: `PromptComposeInput`]

The inbox's gate (`hooks/register.tsx`, live 2026-10-08):

```ts
on('session.start', async ($, e, next) => {
  const r = await next(e)
  if (e.isInteractive || (await $.session.surfaces()).includes('desktop')) await turnOn($)
  return r
})
on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
  if (!isOn) await turnOn($)
  return next(e)
})
```

- `session.start` is at `hooks/register.tsx:1962`, the gate at `:1966`, `session.attach` at `:1971`. Commit `05c3548` added the desktop gate.
- It handles the attach arriving before or after the start. Inference: if both paths see `desktop` before `isOn` is set, `turnOn` could run twice. `turnOn` sets `isOn` at `:1878`, but the start path does not check `isOn` first. Not verified.
- Tests: `tests/hooks.test.ts:1032` checks that a headless start does nothing. `:1047-1064` checks a desktop attach in both orders and mounts the band with `surface: 'desktop'`.

## The desktop app

The public docs describe "three tabs: **Chat** for conversations, **Cowork** for Dispatch and longer agentic work, and **Code** for software development". [desktop] The app now shows two modes, "Claude" and "Code" (`docs/plans/clients.md`). This document reads "Code tab" in the docs as Code mode. Whether Claude mode equals Chat plus Cowork is unknown.

### How Code mode runs the engine

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

### Environments in Code mode

| Environment | What runs where | Plugins and mods | Source |
|---|---|---|---|
| Local | Your machine | Load; the mod runs and draws | [desktop#local-sessions; O#where-mods-run] |
| SSH | Remote Linux or macOS host; "Desktop installs Claude Code on the remote machine automatically" | "SSH sessions support permission modes, connectors, plugins, and MCP servers." Skills and managed settings are read from the remote host. Inference: the mod runs and draws there, with its own remote `$.store`. Not checked live. | [desktop#ssh-sessions] |
| WSL | Inside a WSL 2 distribution | "connectors and plugins" not available. No inbox. A `\\wsl.localhost\...` folder picked normally "reopens inside that distribution". | [desktop-wsl] |
| Cloud | Anthropic-managed infrastructure | "plugins you install from the desktop app aren't available for cloud sessions" | [desktop#install-plugins] |

- `disableDesktopLocalSessions` grays out Local (and WSL); new sessions default to the first SSH connection "if one is configured". [desktop#local-sessions-on-managed-devices]
- macOS environment: launched from the Dock, the app "reads your shell profile… to extract `PATH` and a fixed set of Claude Code variables, but other variables you export there are not picked up". "restart the desktop app to reload environment variables". [desktop#local-sessions] Inference: a `GH_TOKEN` exported in a shell profile may be missing in desktop sessions, so the inbox's `gh` calls may fail there while working in the terminal.
- "The desktop app reads the same settings files as the CLI." Hooks and skills in settings apply to both. [desktop#shared-configuration]

### Desktop features that overlap the inbox

- PR monitoring: "a CI status bar appears in the session. Claude Code uses the GitHub CLI to poll check results", with **Auto-fix CI & address comments** and **Auto-merge when ready**. [desktop#monitor-pull-request-status]
- Code review card: `/code-review` findings "as a **Code review** card, grouped by file", with **Fix this one** and **Apply fixes**. [desktop#review-your-code]
- Tasks pane for subagents and background shells. [desktop#watch-background-tasks]
- Task chips: "When it notices something worth fixing that's out of scope… it offers the work as a task chip". [desktop#work-across-sessions] This overlaps the inbox's findings.
- OS notification "when a Code session finishes a task and you aren't currently viewing that session". [desktop#work-in-parallel-with-sessions]
- Projects Overview has a **Waiting on you** group: "Threads that need your reply or approval, or that failed". Threads are usually cloud sessions. [claude-projects]
- Right-click on a path offers **Open in**, **Show in Finder** and **Copy path**. [desktop#open-and-edit-files] This overlaps the inbox's launchable-files action.
- Prompt suggestions come from "a short background request that counts toward your plan's usage limits or your API costs". [desktop#accept-a-suggested-prompt]

### Sessions, continuity and input

- Mid-turn input: "type a correction and press **Enter** to send it without stopping the running action". Commands sent mid-turn work from v2.1.206. [desktop#use-the-prompt-box; desktop#use-skills] Inference: one turn can carry several user messages; the per-turn update should not assume one prompt per turn.
- The `/` menu lists built-in commands and skills. Whether a mod command such as `/inbox` appears is unknown. Commands "with no argument form, such as `/permissions`, reply with `isn't available in this environment`". [desktop#use-skills; desktop#whats-not-available-in-desktop]
- `/desktop` in the CLI "saves your session and opens it in the desktop app, then exits the CLI". `claude --desktop [--continue | --resume <id>]` needs 2.1.285. Desktop `/resume` works "in local sessions, not in SSH, WSL, or cloud sessions". "Desktop continues the same session rather than a copy". [desktop#coming-from-the-cli] So the inbox's `s:<sessionId>` record carries across terminal and desktop.
- **Open in → Cloud** carries the conversation "as a summary" and may archive the local session. [desktop#continue-in-another-surface]
- Work across sessions: "Claude sees only the sessions the desktop app runs itself: local, SSH, and WSL sessions in the Code tab. Claude doesn't see cloud sessions, or sessions you started from the terminal CLI or the VS Code extension". 20 most recent. It "can't send cross-session messages from a session nobody is watching, such as a scheduled-task run". [desktop#work-across-sessions]
- Scheduled tasks: Desktop checks "every minute while the app is open" and starts a fresh session when a task is due. "Tasks only run while the desktop app is running and your computer is awake." Runs can wait on permission prompts. [desktop-scheduled-tasks] Dispatch (in Cowork) can spawn Code sessions. [desktop#sessions-from-dispatch]
  - Inference: if the app attaches to these sessions as `desktop`, the inbox makes per-turn Sonnet calls with nobody watching. Unknown.
- Remote Control: local sessions appear on other devices once connected; `disableRemoteControl: true` stops new connections. A laptop icon shows the connection. [desktop#control-which-sessions-appear-on-your-other-devices]
- Plan usage "is shared across all your Claude Code surfaces". [desktop#check-usage]

### Panes, links and keys in the app

- The app has its own panes: chat, diff, browser, terminal, file, plan, tasks, subagent. "Press **Cmd+\\**… to close the focused pane". Panes can pop out into windows. "In Desktop, `Shift+Tab` doesn't cycle permission modes." [desktop#arrange-your-workspace; desktop#keyboard-shortcuts] Where a mod pane docks among these is unknown.
- The first click on an external link in chat asks whether links open in the Browser pane or the default browser; Cmd-click opens the default browser. The Browser pane "uses a clean browser profile", but users can sign in and keep cookies. [desktop#browse-external-sites] Whether this applies to mod-drawn links is unknown.
- Mod `Link` in desktop: only `https:` (and per docs `http://localhost`). `claude-cli://`, `claude://`, `vscode://` and `file://` draw as plain text. [IF#link-in-the-desktop-app]

### Deep links

- `claude-cli://open?q=…&cwd=…&repo=…` opens a new terminal session with a pre-filled prompt. "The prompt is populated but not sent until you press Enter." `q` max 5,000 characters. "A deep link never executes anything on its own." The handler registers "when you send your first prompt of an interactive session", so it may be missing on desktop-only machines. [deep-links]
- `claude://code/new?q=…` opens the desktop new-session page. "It treats the prompt as plain text, so a leading `/` or `!` and an `@` file mention don't act as a command". SSH parameters need v2.110.0. [desktop#open-an-ssh-session-from-a-link]
- GitHub strips custom schemes in READMEs, issues, PRs and wikis. [deep-links#the-link-renders-as-plain-text-instead-of-being-clickable]
- Inference: deep links can open a new session from the Codex tab or a web page. They can't target an existing session, and can't be a mod `Link` in desktop.

### Admin and network

- Desktop managed keys: `disableDesktopLocalSessions`, `disableSshSavedPasswords`, `sshConfigs`, `sshHostAllowlist`, `browserExternalPageTools`, `disableBrowserExternalNavigation`, `managedMcpServers` (3P). The Linux policy file `/etc/claude-desktop/managed-settings.json` is "a different file from Claude Code's managed settings file". [desktop#managed-settings; desktop#device-management-policies]
- Admin-console settings "also reach these sessions on Anthropic's API when the session authenticates with an eligible login". "In a Cowork session on this machine, Claude Code never fetches admin-console settings". [desktop#managed-settings] Inference: Cowork sessions run Claude Code, which conflicts with `docs/plans/clients.md` saying Claude mode has no Claude Code session, if Claude mode includes Cowork.
- Network hosts include `*.claudeusercontent.com` and `*.claudemcpcontent.com`. [desktop#network-access-requirements]
- Feature availability by provider: Desktop, cloud sessions, mobile, Remote Control and Artifacts need a Claude subscription. When `ANTHROPIC_BASE_URL` is not `api.anthropic.com`, Claude Code turns off Remote Control and server-managed settings. [feature-availability]

## Building and loading a mod

### Files and what static analysis allows

- A mod is "a Claude Code plugin with an entry file, called the hooks module". It needs no "Node.js, a bundler, or a build step, because Claude Code loads `.js` and `.ts` files directly". [C]
- `plugin.json`: "Mods add no required fields." `hooks/hooks.json` holds `modules`, "an array with one path, relative to this file", and "Can also hold settings hooks under `hooks`". The hooks module "Exports `register(on, options)`". [R#files; C#write-a-mod-yourself]
- `register` receives `options`: the `userConfig` values, with defaults filled in. [R#files]
- Module extensions: `.js .mjs .cjs .jsx .ts .mts .cts .tsx`. Every file is an ES module. [R#files] There is "no DOM, no Node", "there is no `require`", and "A module holding `import()` does not load." [T header]
- `types/index.d.ts`, named by `types` in the manifest, is required "When the mod uses `$.state` or adds a namespace to the mods API". [R#files] `claude plugin validate` "holds every `$.state` key the module names to that contract". [plugin-authoring skill]
- Static rules. Each one fails validation, and the mod then fails to load: [C#check-what-claude-code-reads-from-your-mod]
  - Write each call in full, as `$.ns.method`.
  - Pass `$` only to a function declared at the top level of the same file. The `calls:` line then shows `(via fn)`. "Passing `$` to a method, a function defined inside the hook, or a function you import from another of your files fails validation." `$.state`'s `read` and `update` are the imports that can take it.
  - "Don't assign `$` or one of its namespaces to a variable, destructure it, or index it with a computed name. `const ui = $.ui` fails with `$.ui is used as a value`."
  - Event names must be string literals: "`the event name passed to on() is not a string literal`".
  - Don't shadow `on`: "`\"on\" is declared again (shadowed)`".
  - Import only relative files inside the plugin folder. The one bare import is `claude-code`. No dynamic `import()`.
- `claude plugin validate` fails a `name` that "looks like one of Anthropic's own", such as one starting `claude-`. [C#share-your-mod]
- A bad option value gives `hooks module did not load: options do not fit plugin.json userConfig:`. [TS#options-do-not-fit-pluginjson-userconfig]

### Engine types

- Claude Code writes types into `.claude-plugin/types/` on each load or reload "from a directory you pass to `--plugin-dir`, or a mod Claude wrote for you". Files: `claude-code/index.d.ts`, `claude-code-tools/index.d.ts`, `claude-code-mcp/index.d.ts`, one folder per `dependencies` plugin, and `tsconfig.json`. [C#get-the-types-for-your-build]
- "The events and methods can change between releases, so trust these files over any page, this one included, when they disagree." [C#get-the-types-for-your-build]
- The reference's GitHub copy "can be older than the Claude Code version you have installed". [R]
- The file is written "each time it loads a mod from a folder the person owns … written again after an update rather than edited". It needs "TypeScript 5.4 or newer". [T header]
- The plugin-authoring skill adds: MCP types are "refreshed when you save the mod; a restart never replaces it". Glob and Grep are not registered on native macOS and Linux builds, so compare with `String(e.tool)`. Before a mod has loaded, or under `-p`, types are written beside the skill.
- Live, this repo: `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`, and the types folder is gitignored. The file's first line changed several times on 2026-10-08 (2.1.293, 2.1.294, 2.1.295), because each engine that loads the folder rewrites it. This document cites types by symbol name for that reason. The 2.1.293 and 2.1.294 files each had 15,826 lines.
- Inference: the type check runs against whichever engine last loaded the repo as a folder. A fresh CI box has no types. `scripts/check.sh` copies the main checkout's types into a worktree (commit `55ab122`).

### Loading a folder, and hot reload

- `claude --plugin-dir <dir>` "loads a plugin directory for one session without installing it". Repeat the flag for several. [C; R#commands]
- "Claude Code watches a directory loaded with `--plugin-dir` and hot-reloads the hooks module when a file in it changes. Each reload runs `register` again". [C#how-the-example-mod-works] A reload prints a transcript line that names the mod and lists its hooks. [TS#read-the-debug-log]
- "Files Claude saves during its turn reload when the turn ends." [C#change-a-mod-with-claude]
- "A directory you load with `--plugin-dir` is a protected path, so in `default` and `acceptEdits` modes you're asked to approve each of Claude's edits to the mod." [C#change-a-mod-with-claude]
  - Inference: the inbox's plugin root is the repo root. In a `--plugin-dir <repo>` session, every edit Claude makes in the repo may ask for approval, and a save anywhere in the repo (`docs/`, `codex/`) may reload the mod. Not verified.
- A broken save gives "`reload failed, the previous version stays loaded:`". "the last working version keeps running until Claude Code next reloads plugins". [TS#read-the-debug-log]
- The plugin-authoring skill adds: a reload also happens "sooner when a tool or command the plugin registered is about to run". Outside saves reload "once the folder has been quiet". "the previous environment's timers are dropped". A folder given as a link is watched at its target.
- `CLAUDE_CODE_PLUGIN_DIRS` loads plugin folders like `--plugin-dir`, "for apps you can't pass a flag to". Absolute paths, separated by `:` (`;` on Windows). Read from "Environment, or `env` in `~/.claude/settings.json`". [R#settings-and-environment-variables] The skill says it covers "a session the desktop app or an SDK host starts", "never a project's settings".
- `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` "makes a long-running non-interactive session reload `--plugin-dir` mods on save". [R#settings-and-environment-variables] The skill says a long-lived headless session (SDK, desktop) watches when it is "set the same way", and reload lines reach the host "as `ui_log` messages and the debug log".
- A folder load gets the provenance `@inline`. `pluginConfigs` keys a `--plugin-dir` load as `name@inline`. [R#settings-and-environment-variables]
- Live, this machine: the mod loads into every session, desktop included, through `CLAUDE_CODE_PLUGIN_DIRS=~/Code/inbox` in the `env` block of user settings. No repo doc mentions this variable.
- A same-named installed plugin and a folder copy collide: `another plugin of that name loads first`. "The managed one, or the one loaded first, is used." [TS#refusal-messages] The plugins docs say a `--plugin-dir` copy takes precedence over an installed one of the same name (see "Plugins and marketplaces").

### Mods Claude writes

- Claude writes them to `~/.claude/dev-mods/<session-id>/<mod>/`. `~/.claude` is a protected path. Claude Code then asks whether to enable hot reload for the session. **Not now**: "nothing loads for now … the mods load the next time that session starts. To keep a mod from ever loading, delete its directory." [C#ask-claude-for-a-mod]
- "A mod Claude wrote loads only in the session that made it." It doesn't load under `-p`, `dontAsk`, an untrusted workspace, `--safe-mode`, `--bare`, `disableAllHooks` or a managed block. The folder is deleted "once it's older than `cleanupPeriodDays`". [C#use-the-mod-in-other-sessions; C#sessions-that-skip-the-approval]

### Validate

- `claude plugin validate <dir>` works "without running your code or starting a session. … It checks the manifest and runs the same static analysis on the hooks module's source that Claude Code runs when it loads a mod." [C#check-what-claude-code-reads-from-your-mod]
- It prints `hooks:` with matchers, `calls:`, `env reads/writes:`, `state reads/writes:`, and "`gating hook without .catch: tool.call`" for each hook that can refuse an action. Flags `--strict` and `--json`. [C; R#commands] The JSON report lists `gatingHooks`; the gating line is "a fact, never a warning". [skill]
- A misspelled event fails with `"tool.calls" is not an event`. A missing `modules` key passes with no `hooks` line. [TS#validate-passes-and-lists-no-hooks-line]
- Live, this repo, 2026-10-08: exits 0. Warnings: no `version` for the plugin and the marketplace entry, no author, and "CLAUDE.md at the plugin root is not loaded as project context". 17 "gating hook without .catch" lines, as notes. The JSON notes also list each module's hooks (including `session.attach{surface=desktop}`), `$` calls with call sites, env reads (`HERDR_PANE_ID`, `HOME`, `TMPDIR`) and `$.state` keys (20). This inventory is not documented. Inference: an architecture review or a `check.sh` rule could read it instead of grepping.

## Testing with `claude plugin test`

- Tests run "with no session, sign-in, or network". Each test file imports `claude-code/testing`. [C#test-the-mod; TT]
- Test files end in `.test.ts` or `.test.tsx` [R#files]. The test page says "save it anywhere in the plugin directory". [TT#write-a-test] Live: files under `.claude/worktrees/` did not run, so hidden folders are skipped.
- Live, 2026-10-08: the repo's 5 test files ran, 174 passed.
- Exit status 1 on failure "so it works in CI". A file with no `test()` fails with `declares no test(): nothing ran`. One test times out after 5 s unless it sets `timeoutMs`. [TT#write-a-test; R#limits]
- Live: in an empty folder it prints "no hooks module to load" and exits 1, although the troubleshoot page reads that message as "Mods can load". A script must parse the text.
- The test's `$` "acts as Claude Code. It isn't the mods API that a hook receives". Each method fires the event of that name: `$.tool.call`, `$.command.run`, `$.prompt.submit`, `$.session.start`, `$.turn.complete`, `$.classic.*`. "A test can't fire a mods API call such as `ui.close` directly." [TT#stub-what-claude-code-would-answer]
- Stubs: `on('<call name without $.>', …)` returns `{ value }` or `{ deny }`. A bare value gives "`returned neither { value } nor { deny }`". A missing stub gives "`no implementation for <name>`". Errors show under `the engine reported:`. "A stub that throws is skipped instead". [TT]
- Kit rules: [TT#follow-the-test-kits-rules]
  - "Register every stub before the test's first call on `$`." Otherwise "`on(\"ui.render\") after the test first called $`".
  - "`session.start` doesn't run by itself." Fire it with `$.session.start({ surface: 'terminal', isInteractive: true, cwd })`, with a `session.start` stub that answers `next(e)` and a stub for each call the hook makes.
  - If a call's stub is missing, "the kit skips your hook, so nothing after the call in the hook runs. The test doesn't fail at that point." It shows only if a later check fails. Assert the outcome after every model-driven path.
  - "A hook that returns `next(e)` needs a stub to answer."
- The kit answers `$.ui.invalidate`, `$.state` and `$.session.append` itself. Mocks: `mock.clock(on, {now})` (`advance`, `set`, `now`, `settle`, `sleep`), `mock.store(on, entries)` ("It returns nothing"), `mock.env(on, vars)`, `mock.session(on).appended()` (2.1.293+). [TT]
- Stub shapes: `$.model.complete` → `{ value: { isAnswered: true, text, usage } }`; `$.ui.open` → `{ value: { isPlaced: true } }`; `$.process.run` → `{ value: { exitCode, stdout, stderr } }`; `$.ui.ask` is stubbed as a `tool.call` to `AskUserQuestion`. [TT]
- Drawing tests: `$.ui.mount({ plugin, component, requestId, viewport, props, surface })` returns `press({key})`, `input({key,text,kind?})`, `select`, `find(...)`, `unmount()`. "To cover several apps in one test, set `surface` to the app to draw for." "A drawing test checks the tree your hook returns and whether it's valid for that app. It doesn't check how the app paints it". [TT#test-a-drawing]
- Mount surfaces in the types: "terminal, desktop, vscode or mobile: never assumed". `input` and `select` exist on every surface except mobile. `key` and `pointer` exist only where `Client` does. [T: testing types]
- The types have more than the docs list: `describe`, `findAll`, `drawn`, `key`, `pointer`, `post`, `advance`, `resize`, `test(name, { options })` for `userConfig`, and about 15 more matchers. [T: testing types]
- After `/clear`: fire `$.classic.SessionStart({ source: 'clear' })`, not `session.start`. [TT#test-a-drawing-after-clear]
- Policy mods: `tier('prepend'|'append'|'builtin')` and `test(name, { plugins: [...] }, body)`. A refusal throws `<mod>: refused by <policy-mod>: <reason>`. [TT#test-a-mod-that-judges-other-mods]
- Repo: most band tests mount only `terminal`. `tests/hooks.test.ts:1047-1064` fires a desktop attach in both orders and mounts the band with `surface: 'desktop'`. `:89` stubs `session.attach`.

## Troubleshooting and the debug log

- "When a mod's module or one of its hooks fails, Claude Code skips it and the session continues, so a broken mod can look like one that does nothing." [TS]
- Where a failure line goes: [TS#find-out-why-a-mod-does-nothing]

| Session | Where |
|---|---|
| Hot-reloads a plugin folder (`--plugin-dir`, or Claude-written mods enabled) | "a dim line in the transcript" |
| "Any other interactive session, such as one that runs a mod you installed from a marketplace" | "the debug log only" |
| `claude -p` with `--plugin-dir`, text output | stderr. A refusal by another mod goes to the debug log only. |
| `-p` with json or stream-json | Debug log [skill] |
| Desktop-hosted session with the watch variable | `ui_log` messages to the host, plus the debug log [skill]. Whether the app shows them is unknown. |

- Debug log: `claude --debug` or `--debug-file <path>`. A loaded mod logs `hooks module first-mod@inline loaded (worker, environment 2, tier user); events: …`. [TS#read-the-debug-log]
- `$.ui.log('msg', { to: 'debug' })` writes to the debug log. Without the second argument it writes a dim transcript line. [TS]
- `hook skipped`: the hook "threw, exceeded its time limit, or returned a result of the wrong shape". "The line appears once for each event and kind of failure until the mod reloads." "The debug log has a line for every occurrence." [TS#hook-skipped]
- Check whether mods can load: run `claude plugin test` in a folder with no mod. [TS#check-whether-mods-can-load]

| Message | Meaning |
|---|---|
| `no hooks module to load` | Mods can load (exits 1 anyway, live) |
| `hooks modules are turned off here` | `disableAllHooks` or org policy |
| `…the rollout switch served off` | "Anthropic has turned installed mods off remotely" |
| `…saved off by an earlier session` | Stale saved value. "Start `claude` once to refresh it." |

- It does not report `allowManagedModsOnly`. [TS#check-whether-mods-can-load]
- Refusal lines read `hooks module <name> not loaded: <reason>`. Reasons: `hooks modules are turned off for installed plugins in this process: the rollout switch served off` (or `saved off by an earlier session`); `disableAllHooks in managed settings`; `only managed plugins and built-in plugins run`; `installed plugins that are not managed load no hooks module in this mode (--bare)`; `another plugin of that name loads first`. [TS#refusal-messages]
- `hooks module did not load:` plus a reason means, for example, top-level code threw. [TS#hooks-module-did-not-load]
- Guard messages: `mods are limited to your organization's by policy (allowManagedModsOnly)`; `tried to lift a deny rule in your settings` (once per mod per session); `the deny rules in your settings could not be checked for this call, so it is refused`. [TS#messages-from-the-built-in-guard]
- Drawing failures: an invalid tree gives `ui.render (Pane) refused: … the engine drew its own`; "the engine drew its own" means the site shows Claude Code's usual content. `threw while drawn` falls back the same way. [TS#a-uirender-line-says-threw-while-drawn] "A drawing works in the terminal and not in the Desktop app": "The site or element isn't available there". [TS#a-drawing-works-in-the-terminal-and-not-in-the-desktop-app]
- `$.ui.open` places no pane when the call didn't come from a user action and the terminal is narrow. Check `isPlaced`. [TS#uiopen-runs-and-no-pane-appears] `focus: false` on `$.ui.open` can make a command hook be skipped. [TS#no-commandrun-hook-answered-it]
- Toasts (documented for the terminal only): a debug line per call, as in `$.ui.toast (first-mod): build finished`; refused ones log why. Fullscreen draws at most 3. In the classic renderer a toast is one line under the prompt that starts with the mod's name. Debug endings: `gave way, cut short`, `gave way, unseen`, `left the stack, never drawn`. [TS#a-toast-doesnt-appear]
- Hotkeys need focus: ctrl+x then tab, or a click. Open the pane with `focus: true` from a command. [TS#hotkeys-do-nothing]
- Module variables reset on each reload. "`/clear`, `/resume`, or `/branch`" reset `$.state` to defaults "and `session.start` doesn't fire again". Reload in `classic.SessionStart`. [TS#a-value-resets-when-the-module-reloads; TS#a-value-resets-after-clear-resume-or-branch]
- Auto mode: a hook that changes a tool call's input after the classifier reviewed it gets the call denied: "a hook changed this call's input after the model wrote it". The hook can be a mod's `tool.call` or `turn.step` hook, or a `PreToolUse` settings hook. "The message doesn't say which." It "tells Claude to issue the call once more as recorded." [TS#a-hook-changed-this-calls-input-after-the-model-wrote-it]
- Command replies: "Claude Code puts the plugin's name in front of the command's text". [C] So `/inbox` replies read `inbox: …`.

### The hooks worker

- "Installed mods share one worker thread." A mod traced to a crash is unloaded: "`first-mod was unloaded: it crashed the hooks worker`". One cause is "a loop that never awaits". [TS#it-crashed-the-hooks-worker]
- After 3 crashes not traced to one mod, Claude Code "unloaded every mod that isn't built in, including mods your organization installs". The line "`mods that run in the hooks worker are off for this session: it crashed 3 times`" "reaches the transcript in every interactive session". Fix: `/reload-plugins` or a new session. [TS#mods-that-run-in-the-hooks-worker-are-off-for-this-session; A]
- A fresh copy after a worker replacement re-runs `session.start`. Since 2.1.292, a `$.prompt.submit`, `$.command.run` or `$.agent.spawn` already made "resolved with the result of its first run instead of running again". [TS#its-sessionstart-ran-again-in-a-fresh-copy] The skill limits this: "a call made after the hook returned (a later timer, a continuation) … is made again", and "its timers and state gone".
- A hook with no `.catch` that fails before `next`: "Claude Code skips it, and the next handler runs in its place" (fails open). After `next` resolved: "that result stands, and nothing runs a second time". [E#handle-a-hook-that-fails]
- `on(...).catch(handler)`: `next.error.kind` is `throw`, `timeout` or `re-entry` (2.1.292+); `next.called` says whether `next` ran. The handler has 1 s. "If the handler itself throws or times out, Claude Code skips the hook as if it had no handler". [R#the-hook-function; E]
- Inference for the inbox: setup in `session.start` (tools, command, timers, store load) must be safe to run again after a worker respawn and after `session.attach`. Recovery state belongs in `$.state` or `$.store`, not module variables.

### Version gates seen in these pages

| Behavior | Version | Source |
|---|---|---|
| `mock.session` | 2.1.293+ | [TT#stub-what-claude-code-would-answer] |
| Fresh copy de-duplicates `prompt.submit`, `command.run`, `agent.spawn` | 2.1.292+ | [TS#its-sessionstart-ran-again-in-a-fresh-copy] |
| `next.error` kind `re-entry` and `cause` | 2.1.292+ | [R#the-hook-function] |
| 4,096-character cut on a drop or deny reason (earlier: the hook fails) | 2.1.292+ | [R#limits] |
| A toast within 2 s of the last is no longer dropped | 2.1.290+ | [TS#a-toast-doesnt-appear] |
| A `threw while drawn` in a transcript row no longer ends the session | 2.1.289+ | [TS#a-uirender-line-says-threw-while-drawn] |
| A Client failure with no message no longer shows "Error" | 2.1.289+ | [TS#the-module-failed-without-a-message] |

Inference: a desktop app still on engine 2.1.289 lacks the first four. Declare the oldest supported engine, or check `$.session.version()`.

### Rollout switch and third-party providers

- Live, from `strings` of the 2.1.295 binary: the rollout flag is `tengu_plugin_hooks_modules`, read from GrowthBook (Anthropic's feature-flag service). Its value can come "from a local override", "from GrowthBook (this session's payload)", "from GrowthBook (the disk cache of an earlier session)", "from the default (GrowthBook is off for this session: a third-party provider, or telemetry opted out)", or "from the default (a cold GrowthBook cache, no payload yet)". The default is unknown.
- Live: `DISABLE_TELEMETRY=1 claude plugin test` in an empty folder still printed "no hooks module to load". Not conclusive.
- Changelog 2.1.290: "Fixed mods staying off for people who reach Claude through a gateway (`ANTHROPIC_BASE_URL` with `ANTHROPIC_AUTH_TOKEN`) and have no Anthropic account". [CL#2-1-290] So before 2.1.290 mods stayed off for those users. Inference: that bug may be the binary's "default" path when GrowthBook is off. No doc says mods are off on Bedrock, Agent Platform or Foundry today.

## Lifecycle: what fires and what resets

Terms:
- **Reload**: the engine loads the hooks module again (a save under `--plugin-dir`, `/reload-plugins`, an enable, or a worker respawn). It runs `register` again.
- **Conversation switch**: `/clear`, `/resume` or `/branch`. The process keeps running with another conversation.

| Event | When it fires | Source |
|---|---|---|
| `session.start` | "Once for each loaded mod, before the first prompt, and again after a reload of that mod. Not after `/clear`, `/resume`, or `/branch`." Types: "once per process for each loaded plugin … then once per fresh load of one (never `/clear`)"; a later firing comes from "an enable, a worker respawn, or a reload". "The first firing is awaited". | [R#session; T: `session.start`] |
| `session.end` | `e.reason` is `clear`, `resume`, `logout`, `prompt_input_exit` or `other`. "`/branch` reports `resume`." `other` covers "a `-p` run finished or the process got SIGINT, SIGTERM or SIGHUP". | [R#session; T: `SessionEndInput`] |
| `session.attach` / `session.detach` | "Another app connects to or disconnects from the session". Return only `next(e)`. Types: fields `surface`, `clientId` ("A client that never named itself is `<surface>:default`"), `viewport?`; observe only. Detach `reason` is `'detach' \| 'end'`; with `end` "it runs inside `session.end`'s one short bound". | [R#events; T: `SessionAttachInput`, `SessionDetachInput`] |
| `classic.SessionStart` | The settings-hook event. Fires with `source` `clear`, `resume` or `fork` on a conversation switch, and also for a start with `--resume`. Fires "whether or not any settings hook is configured". | [IF#load-a-saved-value-again-after-clear; T: classic events] |

- On `/clear`: "the conversation ends, the process goes on under a new session id, and no `session.start` fires for it." [T: `SessionEndInput`]
- The `session.end` bound: "One short wall-clock bound (1.5 s by default) covers every hook, its `$` waits and core … at it `next.signal` aborts, a `$` call in flight with it; only a process a command let go of outlives it." [T: `SessionEndInput`] The reference counts the budget "from when your settings `SessionEnd` hooks finish" and names `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`. [R#limits]

What survives what:

| Kept in | Reload | `/clear`, `/resume`, `/branch` | New session | Source |
|---|---|---|---|---|
| Module variable | Reset | Kept (same module) | Reset | [TS#a-value-resets-when-the-module-reloads] |
| Timers (`$.clock.every`, `after`) | Stopped | Kept | Gone | [A#stop-background-work] |
| `$.state` | Kept: "A value in `$.state` also survives a reload of the module, which a variable doesn't." | Reset to defaults | Reset | [IF#keep-a-value-in-$-state; TS#a-value-resets-after-clear-resume-or-branch] |
| `$.store` | Kept | Kept | Kept, shared by every session | [IF#keep-state] |

- To reload after a switch, hook `classic.SessionStart` with `source: ['clear','resume','fork']`. [IF#load-a-saved-value-again-after-clear]
- The inbox does this at `hooks/register.tsx:1977`. `$.session.id()` still names the previous conversation there, so the inbox reads the new id from `e.session_id` (commit `f23d9ad`; comment at `:1979-1981`). Live on 2.1.295: a `--debug-file` log of an in-session `/resume` showed `$.session.id()` returning the old id, even after `next(e)`.
- The inbox's `session.end` (`hooks/register.tsx:1987`) runs seven `$.state` updates plus `publishStatus($, true)`. `publishStatus` runs `herdr pane report-metadata` through `$.process.run` with `timeoutMs: 5000`, only when `HERDR_PANE_ID` is set (`:522-546`). Inference: that 5 s timeout exceeds the 1.5 s bound, so the call can be cut off at session end.
- A worker crash ×3 unloads every non-built-in mod until `/reload-plugins`. [A]

## The hook function

- `on(event, matcher?, hook)` returns a registration with `.catch(handler)`. `e` is "deeply frozen plain data. To change it, pass a copy to `next`." [R#the-hook-function]
- `next(e)` runs the later hooks, then Claude Code's own behavior, and resolves to the result. `next.signal` aborts when the event is abandoned, "for example when the user interrupts". `next.origin` is `{ plugin, tier }`; the engine is `{ plugin: 'engine', tier: 'core' }`. `next.budget` has `.ms` and `.remainingMs`. `next.to(e, tier)` skips ahead; "Only a mod in `prependPlugins` or `appendPlugins` can call it." [R#the-hook-function; A#stop-background-work]
- Three ways to handle an event: observe (return `next(e)`), rewrite (pass a copy; "assigning to a field throws"), answer (return without `next`, which "short-circuits the chain"). [E#how-a-hook-handles-an-event]
- Matchers: a field can be a value, an array or a RegExp; every field must match. `'classic.*'` matches every settings-hook event. `'*'` matches all but telemetry. "Register each event once per matcher". [E#filter-which-events-a-hook-handles]
- Order: [E#the-order-mods-run-in]
  1. `sec-default@builtin`, then `prependPlugins`, then other org mods.
  2. User-installed mods.
  3. `appendPlugins`.
  4. Other built-in mods.
  - "Within one module, hooks run in the order `register` called `on`." "The first mod is outermost … A later mod can't stop an earlier one from seeing an event."
- Settings hooks in the order: managed `PreToolUse` runs before the first mod and its block is final. All other `PreToolUse` hooks, including a plugin's `hooks/hooks.json`, run "after the last mod calls `next`". [E#where-settings-hooks-run-in-the-order]
- To make a blocking hook fail closed, "add a `.catch` error handler that answers in its place." "At `tool.check` and `plugin.register`, a refusal returned after `next` resolved still holds". [E#handle-a-hook-that-fails]
- `next.error` (in `.catch` only): `kind` `throw` or `timeout` with `message`; `re-entry` "when the hook was skipped because the event came from inside one of its own mods API calls"; `cause` `lent` when another mod's added method fired it. `re-entry` and `cause` need 2.1.292. [R#the-hook-function]
- Every mods API method is also an event. "A hook on one intercepts calls from the mods that run after it, and can return `next(e)`, `{ deny: reason }`, or `{ value }`." [R#mods-api-calls] So an earlier mod (an org mod, the guard) can see, rewrite or refuse the inbox's calls, including `model.complete` prompts that carry session content.
- The types say: "EARLY ACCESS: this surface may change between releases without notice." [T header]

## Events the inbox uses or could use

From [R#events] unless marked.

| Group | Events and returns |
|---|---|
| Tools | `tool.call` → `next(e)`, `{ deny }`, `{ result }`. Arguments are fields of `e` (`e.command`). Fires for subagent and MCP calls. `{ result }` means "no permission prompt appears and the tool doesn't run". `tool.check` fires "after the permission rules and the settings hooks have decided"; arguments in `e.input`; returns `{ decision, reason? }`. `tool.describe` fires "Once for each tool, when its description is first sent to Claude"; returns `{ description, isDeferred? }`. [E#guard-or-change-a-tool-call; E#approve-or-refuse-a-tool-call-before-the-user-is-asked] |
| Prompts | `prompt.submit` → `next({...e,text})`, `next({...e,context})`, `{ drop }`. `context` is "text only Claude reads, after the prompt". `prompt.compose` → `{ sections }` of `{ id, text, scope }`. `prompt.section` → `{ text }` or `{ text: null }`. `prompt.context` fires "Once for each conversation", returns `{ blocks }`. `prompt.attachment` → `{ text }` or `{ text: null }`. `prompt.mention` (2.1.290). `prompt.fill`, `prompt.suggest`, `prompt.edit` (50 ms), `skill.prompt`, `attribution.text`. Types add `prompt.autocomplete`. |
| Commands | `command.run` → `{ text }`, `{}`, `next(e)`. `command.describe` → `{ description, argumentHint, isHidden }`. `config.set`, `config.describe`. |
| Turns | `turn.start`; `turn.step` (async generator, can change `model` or `effort`; `result.usage`); `turn.complete` (`isAborted`, `answer`, `durationMs`, `usage`, `agentId`; can return `{ text }` "to show a line under the answer"). Server tools such as advisor fire no `tool.call` or `tool.check`. [E#follow-a-turn] |
| Session | `session.start`, `session.end`, `session.compact` (`{ skip }`), `session.receive`, `session.send`, `session.append` ("Once for each row the conversation keeps … before it's stored"), `session.attach`, `session.detach`, `session.measure`. |
| Subagents | `agent.offer`, `agent.spawn` (`next({...e, model})` or `{ deny }`). |
| Interface | `ui.render`, `ui.resolve`, `ui.press`, `ui.input`, `ui.select`, `ui.focus`, `ui.scroll`, `ui.close`, `ui.message`, `ui.fault` (2.1.289). |
| Other mods | `plugin.register` (`{ refuse }`; `e.uses`), `engine.create`. |
| Settings hooks | `classic.<Event>`: "`e` is the hook's stdin JSON". |

- `prompt.submit` notes: "If your hook returns a `drop` after its `next(e)` call let the prompt through, the turn still runs, and the hook fails". "Text from these hooks that changes between requests invalidates the prompt cache." [E#rewrite-or-add-to-a-prompt]
- `PromptSubmitInput` is `{ text, attachments?, context?, turnId?, wait, origin }`. `origin` is set by the engine, and "no hook may set one". Context "past 100,000 characters (200,000 together)" is cut to a head and a path. [T: `PromptSubmitInput`]
- `session.append`: `door` is one of prompt, command, response, tool-result, tool-message, delivery, attachment, hook-context, note, compaction, notice. A hook may rewrite `message.content` only. [T: `session.append`]
- The inbox hooks (live grep): `command.run`, `config.set`, `prompt.compose`, `prompt.context`, `prompt.submit`, `session.append`, `session.attach`, `session.end`, `session.start`, `classic.SessionStart`, `classic.PermissionRequest` (`:2150`), `classic.Stop` (`:2179`), `tool.call` ×4, `tool.check` ×4, `tool.describe` ×3, `turn.complete`, `turn.start`, `ui.close` (`:2290`), `ui.render` ×2.

### Prompt origin (who sent a prompt)

- `prompt.submit`'s `origin.kind` says where a prompt came from. The inbox treats a prompt as the person's own words only for `composer`, `bridge`, or `plugin` with `asUser` (`hooks/register.tsx:2025`), and skips prompts its own plugin sent (`:2022`).
- Which `origin.kind` a desktop Code-mode prompt has is unknown. Inference: an SDK host may send prompts as `sdk`. If so, the inbox would not treat desktop prompts as the person's words. This is the largest open risk for desktop.

## The `$` API

Namespaces and methods. [R#mods-api-methods; T]

| Namespace | Methods | Notes |
|---|---|---|
| `$.plugin` | `name`, `root` | |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `scroll`, `toast`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `blit`; `notify` in 2.1.295 types only | See below |
| `$.command` | `register`, `run`, `list` | `register` "throws for a taken name" |
| `$.tool` | `register`, `call`, `check`, `list` | Claude sees `mcp__<plugin>__<name>` |
| `$.agent` | `register`, `spawn`, `list` | `idle`, `waiting` statuses need 2.1.289 |
| `$.model` | `complete`, `fork`, `classify` | Bills the user's plan or API key |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose` | |
| `$.turn` | `abort` | |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage`, `version`, `compact`, `send`, `append`, `authorize` | `surface()` deprecated |
| `$.config` | `list`, `set` | |
| `$.settings` | `read` | |
| `$.env` | `get`, `set` | Name must be a string literal |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors` | 4 MiB per file; "`write` isn't atomic" |
| `$.store` | `get`, `set`, `delete`, `keys` | Shared, 4 MiB |
| `$.state` | reactive `get`, `set`; helpers `atom`, `read`, `update`, `derive`, `memberOf` from `claude-code` | Per session |
| `$.clock` | `now`, `sleep`, `after`, `every` | |
| `$.http` | `fetch` | Resolves `{ status, ok, headers, text }` "once the body is read" |
| `$.process` | `run`, `spawn` | No shell |
| `$.mcp` | `call`, `connect` | `connect` only for servers in your own manifest |
| `$.audio` | `play`, `speak` | |
| `$.telemetry` | `log`, `mark` | Sent only for Claude Code or built-in mods |

- The module has "no Node.js APIs, no timer globals such as `setTimeout`, and no network or file access of its own". It has `URL`, `TextEncoder`, `AbortController` and `crypto.subtle`. Relative paths resolve against the session's working directory. [A#reach-files-processes-and-the-network]

### `$.ui`

- `toast`: 4 s by default. "a box at the top right in fullscreen rendering, and one line at the right under the prompt in the classic renderer." Draws the first 2,000 characters, "10000 remotely". [A#show-something-without-starting-a-turn; T: `ui.toast`]
- `status`: "One line under the prompt that stays until you change it. It starts with `⚠` and the mod's name". One per plugin. [A]
- `log`: "A dim line in the transcript that Claude doesn't read". "a `-p` or SDK host receives it as `ui_log`". `{ to: 'debug' }` sends it to the debug log only. [A; T: `ui.log`]
- `ask`: 2-4 options. Adds a free-text row and a **Chat about this** row. "resolves to the label the user picks", or typed text. Rejects "when the user dismisses the question or picks **Chat about this**, and in a `claude -p` run". Its wait doesn't count against the hook's time limit. [E#hold-a-tool-call-until-the-user-decides]
- `copy`: "The terminal writes as `/copy` does; a remote surface has no path yet." Returns `{ isCopied: false, reason }` there. [T: `ui.copy`] The inbox copies with `surface: press.surface` (`hooks/register.tsx:905`, `:911`) and toasts "Could not copy to the clipboard" on failure. Inference: copy fails on desktop. Not verified.
- `selection`: "what the person last selected with the mouse … `undefined` … where none is seen: fullscreen off, -p, a surface that answers none". [T: `ui.selection`]
- `panes`: "The engine's record, not the module's". [T]
- `notify(text, { title })` (2.1.295 types only): a native notification through the user's `preferredNotifChannel`; resolves `{ isSent, channel }` or `{ isSent: false, reason }`. [T 2.1.295]

### `$.prompt`

- `submit({ text })` "waits until the session is idle and then starts a new turn. It resolves when that turn starts, so don't `await` it in a handler that runs while Claude is working." Claude reads it "after a sentence that names your mod as the sender"; `asUser: true` drops that sentence. [A] The inbox uses `asUser: true` at `hooks/register.tsx:828`.
- Headless behavior: `read` returns `{ text: '', cursor: 0 }` "where the session draws no box (a -p run, an SDK host)"; `fill` returns `isFilled: false` "under a dialog or headless"; `suggest` returns `isShown: false` "while the box holds text, a turn runs, or headless". [T] Inference: these may be inert in desktop Code mode, which runs headless. Not verified.

### `$.tool.register` and `$.command.register`

- "Register both in a `session.start` hook. Claude Code waits for that hook before the first prompt, so what you register is available from the first turn." [A#add-a-command-or-a-tool]
  - Inference: on desktop the inbox may first register at `session.attach`. If the attach comes after the first prompt, `/inbox` and the tools are missing for that turn. Unknown.
- `register` "Rejects until the session binds, at `session.start`". "a name registered again is replaced". With `isDeferred` left out, "the engine's rule places it: behind ToolSearch … A `tool.describe` hook's answer is read first." [T: `ToolSpec`]
- `$.tool.register({ isDeferred: false })` "requires Claude Code v2.1.293 or later, and earlier versions ignore it". [A#add-a-tool] `tool.describe` returning `isDeferred: false` has no stated version gate. [R#tools] The inbox registers with `name`, `description` and `inputSchema` only (`hooks/register.tsx:1882-1888`) and sets `isDeferred: false` through `tool.describe`.
- A command hook that throws is skipped, "so the rest of your `session.start` hook doesn't run either. Register commands last … or wrap the call in `try` and `catch`." `immediate: true` lets the command run mid-turn. The returned `{ text }` "prints in the transcript and Claude reads it", "after the plugin's name". [A#add-a-command]

### `$.model`

- `complete` "sends one prompt to a model with your session's credentials … It has no conversation history." "These calls use the user's plan or API key." [A#call-a-model]
- What is sent: "No tools, no history, no system prompt beyond the CLI's identity block and `request.system`." [T: `model.complete`]
- `model`: "An alias (`haiku`) or a full model id; resolved and allowlist-checked like a `--model` value." "The call rejects for a request Claude Code won't send, such as a model your organization blocks." [T; A]
- `maxTokens`: "1024 by default, up to 64,000 or the model's output limit"; "The reply comes back whole, not streamed". `effort`: low, medium, high, xhigh, max; "dropped where it does not" apply. `timeoutMs` has no default. [R#limits; T]
- Results: `isAnswered: true` with `{ text, usage }`, or a `reason`: `api-error` (with `status` and an error kind: rate_limit, overloaded, invalid_request, authentication_failed, server_error, unknown), `empty-reply`, or `aborted` (escape on the calling turn, the environment unloaded, `signal`, or timeout). "What the provider did never rejects the call". `usage` comes back on every arm. [T: `ModelCompleteResult`]
- Caching: "Put the text every call repeats first and mark its last block (`cache`); whatever follows the last mark is paid for whole on every call." "a call within five minutes that opens with the same text reads it there". Both cache counts at zero means "text under the model's minimum, or caching switched off". "On Bedrock, Vertex, Foundry or behind a gateway the text is found again only while `prompt` opens the same way." "Marks go uncounted: one too many is the API's own `api-error` (status 400)." [T: `ModelTextBlock`]
- `fork` "asks one question over the current conversation instead, with the same model and system prompt, so the Claude API serves most of it from the prompt cache". Types: "every tool denied … the prefix billed afresh once the entry lapsed or after `/model`". `nothing-to-fork` covers "before the first response and after `/clear`". [A#call-a-model; T: `model.fork`]
- `classify` defaults to "the engine's small fast model". [T]
- The inbox: `MODEL = 'sonnet'` (`hooks/register.tsx:405`); `askLedgerModel` sends a `cache: true` system block with `maxTokens: 1600`, `effort: 'low'` (`:735-737`) and a 45 s timeout (`:743`); `$.model.fork` at `:759`. See "What the inbox's model calls cost".

### `$.store` and `$.state`

- `$.store`: "A key-value store that every session on the machine shares" [R]; "A JSON key-value store of your plugin's own, kept between sessions" [A]; "kept between sessions and hot reloads … A JSON file of the plugin's own under the user's Claude Code configuration directory" [T]. "A `get` followed by a `set` isn't atomic." It lasts until the mod deletes it, "or no session reads or writes the store for `cleanupPeriodDays`". [IF#keep-state]
- `set` round-trips through JSON (a Date becomes a string, a Map becomes `{}`). It "Rejects a function, a cycle, or a store over 4 MiB". [T: `store`]
- Live, file names only: store files are `~/.claude/plugins/store/<name>_<source>-<hash>.json`, where `<hash>` is the first 12 hex characters of sha256 of `<name>@<source>`. Verified for `inbox@inline` → `7e8589075f50`. So the store is keyed by plugin id, not name. Every folder copy named `inbox` shares `inbox@inline`. Inference: a marketplace install would be `inbox@<marketplace>` with a separate store, so a move to marketplace installs needs a store migration. The file was about 70 KB on 2026-10-08.
- Inference: "every session on the machine" holds only for one `CLAUDE_CONFIG_DIR`.
- The inbox saves per session under `s:${sessionId}` (`hooks/register.tsx:501`) and prunes to `KEPT_SESSIONS = 40` (`:408`, `:512-513`).
- `$.state`: "Named values held by the host for the session, each with a version: plain data that survives a hot reload of the plugin's code." A `get` in `ui.render` subscribes that render. "Any plugin reads any value; its owner alone writes it. Persist through `$.store`." `set` is refused during render and takes `ifVersion`. `plugin` and `key` must be literals. [T: `state`]

### `$.process`, `$.fs`, `$.http`, `$.session`

- `$.process.run` "uses no shell. It resolves to `{ exitCode, stdout, stderr }` whatever the exit code. It rejects if the program can't start or is still running at the timeout". 30 s default, 10 min max. Each stream capped at 4,194,304 bytes with `isStdoutTruncated`. [A; R#limits; T] The types mark it "CLI only". Whether it runs in a desktop Code-mode session is unknown.
- `$.process.spawn` is an async generator: leaving the loop, `return()`, `next.signal` or unload kills the child, "and nothing else does". [T]
- `$.fs.list` "returns one directory's entries as `{ name, kind, size, isLink }` and isn't recursive". [A]
- `$.session.usage()` is `{ startedAt, context, rateLimits, cost }`; `context` has `tokens`, `window`, `percent`; `rateLimits` is a list of `{ kind, percentUsed, resetsAt }`. `$.session.messages()` returns `{ role, text, toolUses }`, newest 4,096. [R#mods-api-methods; A]
- `$.session.authorize()`: "Null with no first-party credential (a 3P provider, a gateway, no login)." [T]
- `$.session.append`: "A user-role row the person does not see as typed or a notice, of text blocks alone in this release". [T]
- `$.session.send({ to, text })` makes "the same delivery the SendMessage tool makes". `session.receive` sees `origin.kind` peer, peer-send-message, task-notification or scheduled-trigger; `{ consumed }` hides the message from Claude. "A message that's held for your approval reaches the hook first". "The sender's name on a received message is whatever the sender wrote, so don't base a decision on it." [A#send-and-receive-messages-between-sessions]
- Timers: `$.clock.every(ms, fn)` and `after` return `cancel()`. "If the callback throws, the error goes to the debug log and the timer runs again". "Timers stop when the module reloads." [A#stop-background-work]

## Limits

From [R#limits] unless marked. "Claude Code skips a hook that exceeds a time limit."

| Limit | Value |
|---|---|
| A hook's own time per event | 10 s, not counting time in `next` or a `$` call other than `$.clock.sleep`. 50 ms for `prompt.edit`. |
| `.catch` handler | 1 s |
| All `session.end` hooks together | 1.5 s by default (`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`) |
| `$.process.run` | 30 s default, 10 min max; 4 MiB per stream [T] |
| `$.model.complete` `maxTokens` | 1024 default, up to 64,000 or the model's limit |
| `$.fs.read`, `$.fs.write` | 4 MiB per file |
| `drop` or `deny` reason | 4,096 characters, end cut (2.1.292+) |
| Text in one tree | First 100,000 characters drawn |
| `Code` language or path, `Select` value, `Client` module | 10,000 characters; longer makes Claude Code draw its own site |
| `Link` `href` | 2,048 characters; longer "keeps the whole tree from drawing" |
| `Svg` `source` | 131,072 characters |
| `$.store` | 4 MiB of JSON in total |
| `$.session.messages()` | Newest 4,096 entries |
| Redraws | 10 a second; 30 in the terminal for the visible pane, expanded band and hint line |
| `$.ui.toast` | 4 s unless `timeoutMs` (1 to 60,000) |
| Pane opened unasked | Placed from 144 columns, 110 after the user opened it once |
| Command, tool, subagent type, pane names | Letters, digits, `_`, `-`, up to 64 characters |
| One `claude plugin test` test | 5 s unless `timeoutMs` |
| Prompt `context` | 100,000 characters (200,000 together), then head and path [T] |

## Drawing: render sites

- A **render site** is a place a mod can draw. Claude Code fires `ui.render` before drawing one, and the hook returns the tree to draw. "`e.component` names the site, `e.surface` says which app is drawing, and `e.props` holds the site's own data. For a pane, `e.requestId` is the `id` you opened it with." [IF#pick-where-to-draw]
- A **surface** is the app that draws: `terminal`, `desktop`, and in the types also `mobile` and `vscode`. [T: `RenderSurface`]
- "The pane and the band are empty until a mod fills them." [IF#pick-where-to-draw]
- **Pane**: "a sidebar beside the transcript in a wide fullscreen terminal, or a framed region above the prompt otherwise. With several panes open, each gets a tab that shows its title." [IF#pick-where-to-draw]
- **Band** (site `AbovePrompt`): "a strip directly above the prompt input. It's always there, and every mod shares it." [IF#pick-where-to-draw]
- Sharing the band: "A tree replaces what the mods after yours draw there. To keep theirs, put the result of `await next(e)` among the children of a `Box`." [IF#pick-where-to-draw]
  - The inbox's band hook (`hooks/register.tsx:2297`) yields while a survey holds the band (`if (!isOn || e.props.hasSurvey) return next(e)`, `:2298`). Its trees (`:2449`, `:2452-2466`) never include `await next(e)`, so when it draws, it hides band content from mods that run after it.

### Sites by surface

| Site | Surfaces (docs) | Types say |
|---|---|---|
| `Pane`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `AskUserQuestion` | Terminal, desktop | "Raised on every surface" |
| `AbovePrompt`, `Spinner`, `SessionMode`, `PromptHint` | Terminal, desktop | "terminal and desktop surfaces only" |
| `ToolProgress`, `TurnDuration`, `InfoNotice` | Terminal | "Raised on the terminal surface only" |

Sources: [R#render-sites; IF#change-what-claude-code-already-draws; T: render-site props].

- "The permission prompt isn't a render site." A tree for `AskUserQuestion` "has to hold the reference exactly once, with your elements above it. Otherwise, Claude Code draws its own dialog." [IF#change-what-claude-code-already-draws]
- At engine-drawn sites, `next(e)` returns `{ type: 'engine', ref }`, "unless a mod that runs after yours returned a tree of its own". [IF#change-what-claude-code-already-draws]
- "Each surface's ask is its own evaluation, since a tree may hold an element only some surfaces draw (Svg, Client)." [T: `RenderSurface`]

### Pane and band props

| Site | Props [R#render-sites] |
|---|---|
| `Pane` | `title`, `isFocused`, `bodyColumns`, `placement`, `scroll`, `view`; `requestId` is the pane id |
| `AbovePrompt` | `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`, `scroll`, `view`; "One instance" |

- Fit the tree: width to `e.props.bodyColumns`. A docked pane (`placement === 'dock'`) has `e.props.scroll.bodyRows` rows. An inline pane "grows with your tree up to a limit, and `bodyRows` is that limit." "A tree taller than the pane scrolls as a whole." [R#render-sites]
- "`e.viewport` holds `columns`, `rows`, and `isFullscreen`. It's absent until the app has measured its window. Its `rows` is the height of the whole window, not of your pane." [R#render-sites]
- Types detail:
  - `AbovePrompt.maxRows`: "in fullscreen, what the bottom slot has left above the prompt; otherwise the terminal's height. … That slot is capped at half the terminal's rows, the prompt's included." "A tree of at most `maxRows` rows shows whole; a taller one scrolls in a window of `scroll.bodyRows`." "A bare digit arms only the hotkeys of the Buttons wholly inside that window." [T: `AbovePrompt`] Inference: a band that overflows loses keys on buttons outside the window.
  - `AbovePrompt.bodyColumns` is "its column's width less the engine's five at the right end" (for `[-]`). "size a table to it rather than to `viewport.columns`". `scroll.bodyRows` "is `maxRows` less the `n more` row". [T: `AbovePrompt`]
  - The engine draws `[-]` beside the band and an `n more` row under it. The person collapses the band with ctrl+x ctrl+a or `[-]`, and focuses it with a click or ctrl+x tab. `hasSurvey`: "True while a survey holds the band; a hook yields to it." `isWorking`: "True while a model turn is running." [T: `AbovePrompt`]
  - `Pane.placement`: "`dock` beside the transcript (the terminal in fullscreen from 110 columns), or `inline` above the prompt." Read-only. [T: `Pane`]
  - `Pane.title`: with one pane open, "the engine draws no title". `Pane.view` and `AbovePrompt.view` name the transcript on screen (main or one agent's); a switch re-runs the hook. [T: `Pane`]
  - On a remote surface such as desktop, a cell is "the pane's width and height over the advance and line height of its code font". "a change of height alone re-draws nothing". [T: `RenderViewport`]
  - `isFullscreen`: "A remote surface that reports it places panes (`$.ui.open` is placed there); the mobile app reports `false`." It is false "on the main screen (`CLAUDE_CODE_NO_FLICKER=0`, tmux by default) and headless". [T: `RenderViewport`; `CommandPresentation`]
- The repo already sizes to `bodyColumns` and `maxRows` (`hooks/register.tsx:2449`, `:2985`, `:3027`, `:3116`, `:3179`, `:3723`).
- No doc shows where the desktop app puts the band or a pane, or whether it docks. Unknown.

### Opening a pane

- `$.ui.open({ id, title?, focus?, closeOnEscape?, holdToasts?, rows?, columns? })`. `$.ui.close({ id })` closes it. `rows` defaults to "a third of the space". [IF#open-a-pane-at-the-right-time] Sizes are "A request, not a grant: a size the person dragged or keyed … wins". [T: `ui.open`]
- `focus`, `closeOnEscape` and `holdToasts` "accept only `true`". `false` throws, as in `ui.open: focus is true or left out`. [IF#open-a-pane-at-the-right-time]
- "To let a command open the pane while Claude is working, add `immediate: true` when you register the command. Without it, a command typed during a turn waits for the turn to end." [IF#open-a-pane-at-the-right-time]
- Width rules: a pane opened by a user action shows at any width. One the mod opens on its own (timer, `turn.start`) shows only from 144 columns, or 110 after the user has opened that pane once. It resolves `{ isPlaced: true }` or `{ isPlaced: false, reason }`. "A waiting pane appears when the user opens it or widens the terminal." [IF#when-a-pane-waits-for-a-wider-terminal; R#limits]
  - What counts as asked: "the person's command, prompt or press behind it (not `focus`)". The 110 allowance holds "in this session or an earlier one, until they close the pane by hand". "a `-p` run places all". [T: `ui.open`, `ui.panes`]
- `holdToasts`: "In the terminal, the hold lasts while that pane is the one showing". It also holds other mods' toasts and the engine's notifications. "Leave the field off a pane that stays open." Past 50 waiting, older toasts drop. [IF#hold-toasts-behind-a-dialog; T]
- `ui.close` fires before a pane closes, with `e.origin.kind` `plugin`, `person` or `unload`. A hook may refuse a close with origin `person`. [R#interface; T: `Pane`]

## Drawing: elements

| Element | Docs [IF#build-a-tree-from-elements; R#elements] | Types [T: per-surface element tables] |
|---|---|---|
| `Box`, `Text`, `Button`, `Link`, `Code`, `Markdown` | Everywhere | Every surface |
| `Input`, `Select` | Terminal, desktop | All but mobile: "the mobile app draws no field yet" |
| `Svg` | Desktop, up to 131,072 characters | "every remote surface" (desktop, mobile, vscode) |
| `Client` | Terminal, desktop | Terminal and desktop. vscode lacks it: "not a limit of the editor's webview" |
| `Raster` | Terminal; `columns` ≤512, `rows` ≤256 | Terminal ("elsewhere a fragment") |
| `Image` | Terminal; PNG or RGBA ≤2 MiB or a file path, `columns`/`rows` ≤255, `alt` | Terminal |

- Element the surface lacks. The interface page: "If a tree uses an element the app doesn't have, a prop an element doesn't take, or a child where none goes, Claude Code draws its own version of the site." [IF#build-a-tree-from-elements] The gallery: "In the terminal, a pane that returns only an `Svg` opens empty." [GA#svg] The types: "an omitted one draws a fragment". These conflict; see "Where sources disagree".
- Draw with `$.ui.resolve(e)` and branch on `e.surface` or on which elements exist. JSX works in `.tsx` after destructuring the elements. `$.ui.resolve(e)` is "A read, not a dispatch". [IF#build-a-tree-from-elements; T: `ui.resolve`]
- The inbox checks for a field with `'Input' in elements` (`hooks/register.tsx:2479`).

### Button

- Props: `key`, `label`, `onPress`, `hotkey`, `plain`, `dimColor`, `autoFocus`, `action`. `onPress(e)` gets `e.surface`, "the app the press came from". [R#elements; IF#respond-to-presses-and-typing]
- Terminal: default `[ Add one ]`. `plain: true` gives `1: One`. Focused draws inverse. [GA#button]
- Hotkey display: [IF#know-which-keys-your-mod-can-receive]

| Button | Terminal | Desktop |
|---|---|---|
| Bracketed (default) | `[ Add one ]`, no hotkey shown | "The label with a small key beside it" |
| `plain: true` | `1: One` | "The label with a small key beside it" |

- `hotkey` is "one digit or one lowercase letter". Shift+w counts as `"w"`. "When two buttons in one drawing name the same `hotkey`, the later one gets it." "A digit `hotkey` on a button in the band also fires when the user types that digit alone into an empty prompt and pauses." [IF; R#elements; T: `ButtonProps.hotkey`]
- `action` "names one of Claude Code's own keybinding actions". Types: it applies "on the terminal while mounted". [R#elements; T: `ButtonProps.action`]
- Types only:
  - `variant?: 'primary' | 'secondary'`. Desktop draws "its own primary button". "`plain` wins". The inbox uses `variant="primary"` (`hooks/register.tsx:2343`).
  - `role?: 'dismiss'`: desktop draws "its native close control at the site's trailing edge"; the terminal ignores it.
  - `hover?`: "Refused outside a keyed Box unless it names a `scope`."
  - `plain`: "A desktop draws its native button either way."
  - 2.1.295 only: "Children of strings and `Text` (a chip, a dim part) are drawn in its place". `key` defaults to "the `label`, or the one string child". 2.1.294 allowed only "the one string child".
- The inbox draws each pane key as a `Text` letter plus a `plain` Button labeled `": Label"` with no hotkey (`hooks/register.tsx:2856-2863`). The Buttons that carry the hotkeys sit in a `<Box display="none">` (`:2873-2874`, `:3728-3731`). `display` is in the types, not the docs.
  - Inference: on desktop, which draws "its native button either way", the visible buttons may read ": Done" beside a stray letter. Whether desktop honors hotkeys on hidden Buttons is unknown.

### Input and Select

- Input: `key`, `label`, `placeholder`, `value`, `submitLabel` (default `submit`), `onSubmit`, `onInput`, `autoFocus`. A one-line field. [R#elements; GA#input]
- "Typed letters reach an `Input` once it has the focus, so add `autoFocus: true` to a field that should take typing as soon as the pane opens." [GA#take-input]
- "`value` is the text the field holds when it's drawn, and the user's typing replaces it until your hook draws the field again." "Submitting an `Input` doesn't start a turn unless your callback calls `$.prompt.submit`." [IF#take-typed-input-and-draw-a-row-for-each-item]
- Select: `onSelect(value)`; "at least one choice with unique values". An option `value` over 10,000 characters makes Claude Code draw its own site. [GA#select; R#limits]
- Each use fires `ui.press`, `ui.input` or `ui.select` with the `key` in `e.element`. "Its hook runs before your callback". "The mods API has no method that presses another mod's button." [IF#respond-to-presses-and-typing]
- "Of several [autoFocus] in one site the first drawn wins". [T]

### Link

- Desktop: "a `Link` draws as plain text unless its `href` meets these requirements": "an `https:` URL, or an `http://localhost` URL"; "No `@`: write an `@` in the path or query as `%40`"; the spelling must equal `new URL(href).href`, which excludes "an uppercase host, a space, and `:443`". "In the terminal, these requirements don't apply." [IF#link-in-the-desktop-app]
- Types: "an OSC 8 span on the terminal (else its text then the URL in dim), an anchor on desktop." "on a remote surface anything but the `https:` URL its wire promises: the text is drawn plain, and said so; the tree stands." No localhost exception. Link is inline; its children are its text. [T: `LinkProps`]
- Gallery: "The terminal draws the URL as text after the label. Whether a click opens it depends on the user's terminal." [GA#link]
- "A `Link`'s `href`: 2,048 characters. A longer `href` keeps the whole tree from drawing." [R#limits] Types measure it "once what a terminal acts on is percent-encoded".
- Markdown: "a link not `https:`, `http:` or `file:` draws as text". `onLinkPress` makes links the plugin's to answer. [T: `MarkdownProps`]

### Other elements

- Text: `color`, `bold`, `dimColor`, `italic`, `underline`, `strikethrough`, `inverse`, `backgroundColor`, `wrap` (`'wrap'`, `'truncate'`, `'truncate-start'`, `'truncate-middle'`, `'truncate-end'`; types add `'end'`, `'middle'`). [IF; GA#text; T]
- Box: flex layout, `gap`, `padding`, `margin`, `width`, `height`, `borderStyle` (ten names; any other "draws with no border"), `backgroundColor`, `position`, `hover`. Types add `display: 'flex' | 'none'` and `overflow`. [R#elements; GA#box; T]
- Markdown takes `text`. Code takes `language` or `path`, `startLine`, `format: 'diff'`. [GA#markdown; GA#code]
- Svg: `source` ≤131,072 characters; `alt` required "since a surface without the element draws nothing else of it"; `isInteractive: true` draws "in a script-less sandboxed frame" so hover and animation work. [GA#svg; T: `SvgProps`]
- Client: "A region drawn by a second file of yours, for animation and pointer input. That file gets no mods API. It reaches your hooks by posting data, which arrives as a `ui.message` event. If it fails to load, draw, or run, your hooks receive a `ui.fault` event." `ui.fault` needs 2.1.289. `module` must be a string literal. Props JSON ≤100,000 characters. Tree bounds 20,000 nodes, 32 deep. [IF#build-a-tree-from-elements; R#interface; T: `ClientProps`]
- Image shows only where Claude Code detects kitty graphics with Unicode placeholders (kitty 0.28+, Ghostty). It fails in tmux, screen and "every background session"; the user sees dim `alt` text. [GA#image-and-client]
- Raster: `$.ui.blit(...)` repaints without re-running the hook. "Each character has to be one cell wide." [IF#draw-a-grid-of-colored-cells]

### Redraws

- The hook re-runs when the site's props or the terminal width change. "It doesn't run the hook on a timer, and it can't tell when a variable in your module changes." Use `$.ui.invalidate('ui.render')`, `$.state`, or `$.clock.every`. [IF#redraw-when-something-changes]
- "Throttled to 10 a second, or 30 in the terminal for the visible pane, the expanded band, and the hint line under the prompt. Calls that come sooner are coalesced." [R#limits] Inference: animations run at 10 a second on desktop.
- "Text in one tree: The first 100,000 characters are drawn". [R#limits]

## Keyboard and focus

- "Your mod never reads the keyboard itself." Apart from a digit hotkey on the band, keys reach controls "only while your pane or band has keyboard focus. The rest of the time, keys go to the prompt." [IF#know-which-keys-your-mod-can-receive]
- A pane gets focus by `focus: true` from a command or press, ctrl+x then tab, or a click. "Claude Code grants `focus: true` only while the prompt is empty and nothing else has keyboard focus." [IF] Types: focus is refused while the person holds "An element of the band or a pane …, text in the composer, a dialog or a survey". [T: `ui.open`]
- Keys while focused: Tab next control; Up and Down move between controls "while your drawing fits", else scroll; Enter presses; a hotkey presses its button ("While an `Input` has the focus, every printable key goes to the field"); PgUp, PgDn, Home, End scroll; ctrl+x then an arrow resizes; ctrl+x x closes the pane "even while one of its fields has the focus"; Esc returns to the prompt and closes a `closeOnEscape` pane. "A mod can't bind Tab or the arrow keys to anything else". [IF#know-which-keys-your-mod-can-receive]
- Keybindings: `~/.claude/keybindings.json`, opened with `/keybindings`, applied without restart. [KB#configuration-file]

| Context | When active [KB#contexts] |
|---|---|
| `AbovePrompt` | The band, or a button in it, has focus |
| `AbovePromptInput` | An input in the band or a mod's pane has focus |
| `AbovePromptSelect` | A select in the band or a pane has focus |
| `Pane` | A mod's pane has focus |
| `PaneField` | An input or select in a mod's pane has focus |

| Action | Default [KB#above-prompt-actions; KB#pane-actions] |
|---|---|
| `abovePrompt:toggle` | ctrl+x ctrl+a: collapse the band to a one-row hint, or expand it |
| `abovePrompt:focus` | ctrl+x tab: focus the band, then each pane, then back to the prompt |
| `abovePrompt:next` / `previous` / `press` / `leave` | Tab / Shift+Tab / Enter / Escape |
| `pane:scrollUp` … `pane:bottom` | Up, Down, PgUp, PgDn, Home, End |
| `pane:grow` / `pane:shrink` | ctrl+x left or up / ctrl+x right or down |
| `pane:close` | ctrl+x x (also in `PaneField`) |

- "`ctrl+x b`, `ctrl+x ctrl+a`, and `ctrl+x tab` require v2.1.260 or later." Chord keys must come within 3 seconds. Reserved: ctrl+c, ctrl+d, ctrl+m, ctrl+[, ctrl+i, ctrl+h, Caps Lock. [KB#unbind-default-shortcuts; KB#chords; KB#reserved-shortcuts]
- Inference: users can rebind these keys, so the inbox's key-help text ("ctrl+x tab", `hooks/register.tsx:3219`) can go stale. Whether desktop reads `keybindings.json` is undocumented.
- The pane's hotkeys: 1, 2, 3, j, k, v, a, t, e, x, o, r, d (repo). Tab, arrows, Enter and Esc belong to the engine.

## Settings hooks and `classic.*` events

A **settings hook** is a hook defined in a settings file or a plugin's `hooks/hooks.json` `hooks` key. It runs a shell command, an HTTP request, an MCP tool call, a model prompt, or an agent. A mod sees each settings-hook event as `classic.<Event>`. [H; E#hook-the-settings-hook-events]

### How mods and settings hooks interact

- "Each settings hook event … is also an event named `classic.` followed by the settings hook event's name, such as `classic.Stop`. `e` is the JSON a settings hook receives on stdin, including `transcript_path`." Return `next(e)` "so Stop hooks in your settings files still run". [E#hook-the-settings-hook-events]
- Classic events fire "wherever the engine runs the classic hook, whether or not any settings hook is configured". [T: classic events] So `classic.PermissionRequest`, `classic.Stop` and `classic.StopFailure` are reliable signals for a mod.
- Order: "The chain is [managed settings hooks, ...hooks modules, the other settings hooks as core], so a managed block ends it above every module." "`classic.PreToolUse` alone differs: its `e` is ToolCallEnvelope." Results "fold into one of these (last write wins, contexts concatenate)". "A field of the wrong shape fails the hook, which is skipped." [T: classic events]
- A mod's `classic.*` result (`ClassicResult`) has `block`, `preventContinuation`, `stopReason`, `additionalContext: string[]`, `sessionTitle`, `suppressOriginalPrompt`, `initialUserMessage`, `watchPaths`, `reloadSkills`, `permissionDecision`, `permissionDecisionReason`, `decision`, `updatedToolOutput`, `updatedMCPToolOutput`, `retry`, `displayContent`, `worktreePath`. It has no `systemMessage`, `terminalSequence`, `classifierContext`, or Elicitation `action`/`content`. [T: `ClassicResult`] So a mod's classic return can do less than a settings hook.
- A mod's `tool.check` "answers after the rules and the `PreToolUse` hooks have decided, and its answer can replace theirs": it can approve over ask rules and non-managed `PreToolUse` blocks, and skips the auto-mode classifier. Deny rules hold over the mod only "on a machine with managed settings, or when you're signed in with a Team or Enterprise plan". [P#extend-permissions-with-hooks]
- A `classic.*` handler that doesn't call `next` keeps the person's own settings hooks from running. The inbox always calls `next`.
- "Claude Code fires the same hook events wherever it runs: sessions in the terminal, IDE extensions, the Desktop app, and cloud sessions." [H] What they deliver differs by host; see below.

### Events the inbox uses

| Event | Inbox use | Key facts |
|---|---|---|
| `SessionStart` | `classic.SessionStart` with `source: ['clear','resume','fork']` reloads the conversation (`hooks/register.tsx:1977`) | Sources: startup, resume, clear, compact, fork. `fork` covers `--fork-session`, `/fork`, `/branch`, moving to the background (before 2.1.214 forks reported `resume`). "If you run `/clear` or switch to another conversation while background hooks are still running, nothing they return applies to the session." "When you switch conversations with `/resume` inside a session, the switch waits for the hooks to finish instead." [H#sessionstart] |
| `PermissionRequest` | Opens dialog rows (`hooks/register.tsx:2150`) | Fires when Claude Code is about to prompt, or would auto-deny a call that can't prompt. Not for sandbox network prompts. No `tool_use_id`. "For a call that reaches a `--permission-prompt-tool` or the Agent SDK's `canUseTool` callback, the hooks run alongside your host, and whichever decides first applies." [H#permissionrequest] |
| `Stop` | Claim check returns `block` (`hooks/register.tsx:2179-2189`, built in `blockOnClaim` at `:471`); skips when `stop_hook_active` | `decision: block` makes Claude continue. `additionalContext` also continues, shown as `Stop hook feedback` "rather than a hook error". "after stop hooks have continued the turn eight times in a row, Claude Code overrides the next block" (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Input has `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`. "Does not run if the stoppage occurred due to a user interrupt". "The `/goal` command is a built-in shortcut for a session-scoped prompt-based Stop hook." [H#stop] |
| `StopFailure` | Reads usage-limit and sign-in stops | Fires instead of Stop when an API error ends the turn. `error`, `error_details`. Types add `verification_required` to the documented 12 error values; the repo handles it (`hooks/ledger.ts:943`). [H#stopfailure-input; T] |

- Inference: the claim check's `block` may render as a hook error, the wrong signal for a nudge. `additionalContext` on `classic.Stop` is allowed by the types. Check which reads better. While `/goal` continues a turn, `stop_hook_active` is true, so claims are not checked.

### Other events a "waits on you" model could use

- `Notification` types: `permission_prompt` (about 6 s, deferred by each keystroke in the terminal); `idle_prompt` (about 60 s after Claude finishes, only if the person hasn't typed and nothing runs in the background; not sent during a usage-limit wait); `elicitation_dialog`, `elicitation_url_dialog`; `agent_needs_input`, `agent_completed` (agent view, terminal); `quota_auto_resume_*`. "These hooks run even when desktop notifications are off." [H#notification]
- In SDK hosts (desktop, VS Code), `permission_prompt` fires about 6 s after the request, not deferred by typing, and skipped if answered sooner. "Before v2.1.233, `permission_prompt` didn't fire in these sessions." [H#notification]
- `Elicitation`, `ElicitationResult` (an MCP server asks for input). `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `SubagentStart`, `SubagentStop`, `PostToolBatch`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `CwdChanged`, `FileChanged`, `MessageDisplay`, `InstructionsLoaded`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `PermissionDenied`, `UserPromptExpansion`, `Setup`, `SessionEnd`. 33 events in all, matching the types' `HookInput` union. [H#hook-events]
- `UserPromptSubmit` also fires for "scheduled task, `/loop`, background-subagent report, cross-session message". [H#userpromptsubmit] The types add an undocumented `source`: `'user' | 'sdk' | 'system' | 'loop_wakeup' | 'schedule_wakeup' | 'poll_event'`, which "Payloads may omit … while the field rolls out". [T: `UserPromptSubmitHookInput`]
- AskUserQuestion can be answered from a hook: `permissionDecision: "allow"` plus `updatedInput` that echoes the original `questions` and adds `answers`. "Returning `"allow"` alone is not sufficient". `updatedInput` "Replaces the entire input object". [H#allow-with-updatedinput] Inference: a pane button could answer the agent's multiple-choice question. Not verified.

### Context injection rules

- Delivery: "Claude Code wraps the string in a system reminder and inserts it into the conversation at the point where the hook fired … it doesn't appear as a chat message in the interface." [H#add-context-for-claude]
- "Write the text as factual statements rather than imperative system instructions … Text framed as out-of-band system commands can trigger Claude's prompt-injection defenses". [H#add-context-for-claude] Inference: this likely applies to the inbox's `prompt.submit` context and its `inbox:` texts too.
- On resume, "Claude Code replays the saved text rather than re-running the hook for past turns, so values like timestamps or commit SHAs become stale." [H#add-context-for-claude] Inference: past `inbox:` lines show old state after `--resume`. `SessionStart` with `resume` or `fork` is the refresh point.
- Cap: "A hook's `additionalContext`, `systemMessage`, and `initialUserMessage` strings, and its plain stdout, are capped at 10,000 characters." Over the cap, Claude gets a file path plus up to 2,000 characters of preview, and "Claude Code doesn't ask Claude to read the file." No setting raises it. [H#json-output] Whether it applies to mod context is unknown; mod `prompt.submit` context has its own 100,000-character cut.
- UserPromptSubmit context: "Neither channel produces a visible transcript entry … To confirm delivery, check the debug log." [H#userpromptsubmit-decision-control]

### How behavior differs in desktop Code mode

- "canUseTool … is how Claude Desktop and the VS Code extension host Claude Code" [H#notification], and Claude Code "times `permission_prompt` differently in a terminal and in Claude Desktop, the VS Code extension, and other hosts that answer permission requests through the Agent SDK". [HG#get-notified-when-claude-needs-input]
- Inference, from the SDK rules applied to Code mode: `terminalSequence` is ignored ("In non-interactive mode with the `-p` flag and in the Agent SDK, it ignores the field" [H#emit-terminal-notifications]); `MessageDisplay` fires once per message; `CwdChanged` and `FileChanged` `systemMessage` "doesn't reach the SDK message stream"; `PermissionRequest` hooks race the desktop dialog.
- Trust: interactive sessions hold back settings hooks "until you accept the workspace trust dialog". `-p` and SDK sessions "never show the dialog and treats the folder as trusted". [H#workspace-trust] Whether Code mode follows the SDK rule is unknown.
- SDK callback hooks fail closed: "An Agent SDK callback hook on `PreToolUse` that exceeds its timeout blocks the tool call". Command, HTTP and mcp_tool hooks that time out don't block. [H#timeouts] Whether the desktop app registers SDK callback hooks is unknown.
- Cloud sessions "don't read your local `~/.claude/settings.json`". `$CLAUDE_CODE_REMOTE` is `"true"` in remote web environments. `$CLAUDE_CODE_BRIDGE_SESSION_ID` is set while Remote Control is connected (2.1.199+). [H#hook-locations; H#hook-handler-fields]

### Settings-hook mechanics worth knowing

- Locations: user, project, local, managed settings, a plugin's `hooks/hooks.json`, skill frontmatter, subagent frontmatter. Entries "merge across settings levels". "All matching hooks run in parallel." [H#hook-locations; H#hook-handler-fields]
- Default timeouts: 600 s for command, HTTP and mcp_tool; 30 s for prompt; 60 s for agent. 30 s on `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`; 10 s on `MessageDisplay`; `SessionEnd` hooks share 1.5 s. [H#common-fields]
- Exit 2 blocks "whether or not you print JSON". Stdout is parsed as JSON only if it starts with `{` and ends with `}`. [H#exit-code-2; H#exit-code-0]
- `disableAllHooks`: "There is no way to disable an individual hook while keeping it in the configuration." Only managed-level `disableAllHooks` disables managed hooks. [H#disable-or-remove-hooks]
- `allowManagedHooksOnly`: "Your user, project, local, and plugin hooks are blocked. Hooks from plugins force-enabled in managed settings `enabledPlugins` are exempt." [H#hook-locations]
- Debug: `claude --debug-file <path>`, or `--debug` writes to `~/.claude/debug/<session-id>.txt`; `/debug` turns it on mid-session; `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher counts. [H#debug-hooks]
- Common input: `session_id`, `prompt_id`, `transcript_path` ("written asynchronously and may lag"), `cwd`, `scratchpad_dir` (2.1.257+; not in the types), `permission_mode`, `hook_event_name`, `agent_id`, `agent_type`. [H#common-input-fields]
- Inference: one plugin's `hooks/hooks.json` could carry both `modules` and a settings `hooks` key. Whether both may coexist is unknown.
- Codex comparison (repo, inference): Codex's `hooks.json` uses the same event, matcher group, command handler shape, but different variables (`${PLUGIN_ROOT}`), events (`Interrupt`, no `StopFailure`) and caps (about 2,500 tokens of `additionalContext`, `docs/plans/codex-plugin.md`). One shared `hooks.json` can't serve both hosts.

## Security model

- "A mod is code that runs with your permissions. It can read and write your files, start processes, and make network requests." [O#install-or-update-a-mod]
- Once loaded, a mod can: [O#what-a-mod-can-reach]
  - "Act on your machine as you".
  - "Read your secrets: environment variables and settings files, including an API key".
  - "See your session: every prompt you send and every tool call Claude makes".
  - "Change your session: rewrite a prompt or a tool call, submit a prompt as if you had typed it, or send a message to another of your sessions".
  - "Act without asking you: approve a tool call before you're asked".
  - "Spend your usage: call a model on your plan or API key".
- "Mods aren't sandboxed. If you turn on sandboxing, the sandbox isolates the Bash commands Claude runs, and a process that a mod starts runs outside it." [O#what-a-mod-can-reach]
- A mod that approves tool calls can approve one that an `ask` rule would prompt for, and one that the user's own `PreToolUse` hook blocked. The overview links to a permissions section that "lists what such a mod can approve, including when it can approve a call that a `deny` rule refuses". [O#what-a-mod-can-reach; P#extend-permissions-with-hooks]
- "A mod can restyle much of Claude Code's interface, but not the permission prompt." [O#what-a-mod-can-reach; A]
- "In an interactive session in a directory the user hasn't trusted yet, no mod loads until they answer the trust prompt." [A#know-which-controls-still-apply] Inference: a first run of the inbox in a new repo shows nothing until the person grants trust.
- `claude plugin validate ./dir` lists a mod's `hooks:` and `calls:` without running it. Example: `hooks: session.start, tool.call, ui.render{component=Pane}` and `calls: $.fs.read, $.http.fetch, $.store.set, $.ui.open`. [O#list-what-a-mod-does-before-you-install-one; A#review-what-a-mod-can-do]
- "Claude Code refuses to load a mod that uses the mods API in a way this command can't read." [A#review-what-a-mod-can-do]
- Calls the admin page tells reviewers to look for: [A#review-what-a-mod-can-do]

| Call | Why it matters |
|---|---|
| `$.fs.read`, `$.fs.write` | "anywhere the user can" |
| `$.process.run`, `$.process.spawn` | "Starts programs as the user" |
| `$.http.fetch` | Network |
| `$.env.get`, `$.settings.read` | Shown on an `env reads:` line |
| `$.env.set` | Affects every command and MCP server started afterward. Shown on an `env writes:` line. |
| `$.mcp.call` | Runs "under the session's permission rules" |
| `$.model.complete` | "Uses the user's plan or API key" |
| `$.prompt.submit` | "can send it as the user's own words" |
| `$.session.send` | Messages another session |

- Hooks reviewers should look for: `tool.call` and `prompt.submit` (see and change every call and prompt), `session.append` ("can rewrite each row of the conversation before it's stored"), `ui.render{component=AskUserQuestion}`, and `tool.check` ("can approve or deny a tool call before a permission prompt appears"). [A#review-what-a-mod-can-do]
- The inbox uses almost all of these (live grep, 2026-10-08): `$.process.run` at 9 sites in `hooks/register.tsx`, `$.model.complete`, `$.model.fork`, `$.prompt.submit`, `$.env.get`, `$.fs.write`, `$.store.*`, `$.tool.register`, `$.command.register`. It hooks `tool.check`, `session.append` and `prompt.submit`. It does not call `$.http.fetch`.
  - Inference: the admin page's example policy mod refuses any user mod that calls `$.process.run` or `$.process.spawn` [A#enforce-a-policy-with-a-mod-of-your-own]. The inbox would fail that policy.

## Admin policy that can stop the mod

Terms:
- **Managed settings**: settings an organization delivers "as a file, through MDM, or from the claude.ai admin console". Users can't override them. [A]
- **The guard**: the built-in mod `sec-default@builtin`. "`/plugin` and the debug log list it as `cc-plugin-sec-default`." Its options are keyed `cc-plugin-sec-default@builtin` in `pluginConfigs`. It runs ahead of user mods and limits what they may change. [A#know-what-happens-by-default; A#set-options-on-the-built-in-guard]
- **Tier**: where a mod runs in the order. `e.tier` is one of `prepend|user|append|builtin`. "Every mod a person installs is `user`". [A#enforce-a-policy-with-a-mod-of-your-own]

### When the guard loads

- Only when "The machine has managed settings" or "The user is signed in to Claude Code with a Team or Enterprise plan". Users on an API key, Bedrock, Agent Platform or Foundry get it only with managed settings. [A#know-what-happens-by-default]
- Where the guard loads, it keeps a user's mod from changing "what your managed hooks receive or decide, the system prompt, your managed `CLAUDE.md` and other managed instructions, what any mod reads as settings, or the tools and descriptions of your managed MCP servers." "Everything else is allowed." [A#know-what-happens-by-default]
- Where the guard loads, a user's mod can't approve a call that a `deny` rule refuses, "whichever settings file holds the rule", and a managed `PreToolUse` block is final. "Neither applies to a mod's own `$.fs` and `$.process` calls." [A#know-what-happens-by-default]
- A user mod can still override `ask` rules and non-managed `PreToolUse` blocks. "In auto mode, a call the mod approves runs without a classifier check." [A#know-what-happens-by-default]
- "The guard fails closed: if the guard can't read managed settings, it refuses every user's mod at load. If it can't check the deny rules for a call that a user's mod approved, it refuses the call." [A#set-options-on-the-built-in-guard]
- Inference for the inbox: in a locked-down org, a deny rule on `Read` or `Grep` beats the inbox's `tool.check` allow for check logs (`hooks/register.tsx:2079-2084`). Expect prompts or denials there.

### What the guard's source skips (not in the docs)

These rows come from the guard's public source, anthropics/claude-code `mods/sec-default/` on main at commit `684800b` (2026-09-29): `hooks/register.ts` and `README.md` "The rows". On 2026-10-08 that was still the latest commit touching the folder (`gh api`). That branch may be ahead of the guard in a shipped engine. The engine types don't describe the rows.

- The guard calls `next.to(e, 'append')` on `classic.*`, `prompt.section`, `prompt.context`, `prompt.compose`, `skill.prompt`, `attribution.text` and `settings.read`. That skips every user-tier hook on those events. [G `hooks/register.ts` L24-32]
- `prompt.compose` row: "A person's plugin neither drops, reorders nor rewrites a section, nor changes the facts the list is composed from, nor answers a list of its own in its place." [G README]
- `prompt.context` row: "managed CLAUDE.md, rules and policy skills reach the model as written. A person's plugins keep `prompt.submit` and its additive context." [G README]
- `tool.register` row: "A `user`-tier caller is refused by name while managed settings hold `allowedMcpServers` (set at all, empty included); otherwise it passes." [G README; `hooks/register.ts` L39-50]
- `tool.describe` row, shared with `command.describe`, `agent.offer` and `agent.spawn`: "a subject provided by `user`, `builtin` or `core` passes". [G README]
- These pass untouched: `prompt.submit`, `turn.*`, `tool.call`, `command.run`, `command.register`, `session.*`, `ui.*`, `fs.*`, `http.fetch`, `process.run`, `store.*`, `clock.*`, `model.*`, `mcp.call`, `audio.*`, `agent.list`, `engine.create`. [G README]
- Under `allowManagedModsOnly`, a module is refused "whenever it loads or reloads (one already running when the option is set keeps running until then)". [G README "Options an administrator sets"]

Inference, not verified live. In any session where the guard loads (every Team or Enterprise sign-in):
- GUIDANCE never reaches Claude. The inbox adds it as system-prompt section `inbox:guidance` through `prompt.compose` (`hooks/register.tsx:2047`).
- The carry block never reaches Claude. The inbox adds it through `prompt.context` (`hooks/register.tsx:2228`).
- The reload after `/clear`, `/resume` and `/branch` doesn't fire. It runs on `classic.SessionStart` (`hooks/register.tsx:1977`).
- The band, pane, per-turn model call and tools still run, unless `allowedMcpServers` is set. Then `record_finding`, `close` and `run_check` don't register.
- Options to weigh: move guidance into tool descriptions (`tool.describe` passes user subjects), move carry text into `prompt.submit` additive context, and reload on a `session.*` event.

### Policies that stop or limit user mods

| Setting (managed) | Effect | Source |
|---|---|---|
| `allowManagedModsOnly` (guard option) | "No mod a user brings runs its hooks": installed plugins, `--plugin-dir`, mods Claude writes. The org's own mods and built-ins still run. Users' settings hooks, plugins' `hooks/hooks.json`, status lines and `/goal` keep working. | [A#stop-user-installed-mods-from-loading] |
| `allowManagedHooksOnly` | "Only your organization's mods and the mods built into Claude Code load". It "also blocks hooks in users' own settings files". | [A#choose-how-much-to-allow] |
| `disableAllHooks` (managed) | The widest. "stops the mods in every installed plugin, yours included", all settings hooks including managed `PreToolUse`, status lines and `/goal`. Built-in mods keep running. | [A#choose-how-much-to-allow] |
| `disableSideloadFlags` | Rejects `--plugin-dir`, `--plugin-url`, `--agents`, `--mcp-config`, and mods Claude writes. `--plugin-dir` exits with "`--plugin-dir is disabled by your organization's managed settings (disableSideloadFlags)`". Also blocks `CLAUDE_CODE_PLUGIN_DIRS` [SETR#disablesideloadflags]. | [A#choose-how-much-to-allow] |
| `allowModsToOverrideDenyRules` (guard option) | Unset: "Deny rules take precedence over users' mods". | [A#set-options-on-the-built-in-guard] |
| `strictKnownMarketplaces` and other plugin controls | Cover mods. | [A#know-which-controls-still-apply] |
| Network policy | Refuses `$.http.fetch` when web fetching is off or "nonessential network traffic is turned off for the session". It "doesn't cover a program the mod starts with `$.process.run`". | [A#know-which-controls-still-apply] |

- Set the guard option this way: `"pluginConfigs": { "cc-plugin-sec-default@builtin": { "options": { "allowManagedModsOnly": true } } }`. Options are read only under that key in managed settings. `prependPlugins` also accepts `sec-default@builtin`; `pluginConfigs` doesn't. "Where the guard doesn't load, neither option applies." [A#set-options-on-the-built-in-guard]
- `allowManagedModsOnly` is read from managed settings only. Users can't undo it. File or MDM delivery works on Bedrock, Agent Platform and Foundry. Console delivery has its own "Platform availability". [A#stop-user-installed-mods-from-loading]
- None of these settings affect built-in mods. [A#choose-how-much-to-allow]
- `--safe-mode` turns off installed mods, the org's included. Settings hooks are not deprecated. Managed `PreToolUse` hooks run before any mod, and again on a rewritten call. Other `PreToolUse` hooks "run after the last mod", so a mod that answers a call keeps them from running. [A#know-which-controls-still-apply]
- What a user can load: no controls → any marketplace, `--plugin-dir`, or a mod Claude writes. A marketplace allowlist → allowed marketplaces plus `--plugin-dir`; a mod Claude writes only if `skills-dir` is allowed. Allowlist plus `disableSideloadFlags` → allowed marketplaces only. [A#decide-whether-to-leave-mods-on]

### What counts as the organization's mod

- All three must hold: managed `enabledPlugins` sets it `true`; managed settings name the marketplace as "a directory on the user's machine, by absolute path" (`extraKnownMarketplaces` with source `directory`); the marketplace lists the plugin "by a relative path, so Claude Code loads it in place". [A#install-your-organizations-mods]
- Device management must copy that directory to the same path on every machine. "Managed settings you deliver from the claude.ai admin console can carry the keys, but they can't put the directory on a machine." [A#install-your-organizations-mods]
- "A plugin that Claude Code copies into its cache counts as a user's, even when managed `enabledPlugins` enables it. That covers every plugin from a GitHub, git, URL, or npm source." `prependPlugins` and `appendPlugins` skip it. Its debug line contains `is enabled by managed settings, but`. [A#apply-your-plugin-controls-to-mods]
  - So the inbox, installed from GitHub, is always a user's mod, even when an org enables it on claude.ai. [A#stop-user-installed-mods-from-loading]
- Order: a mod in `prependPlugins` "sees every event before any user's mod and every result after. It can change the event, refuse it, or skip the users' mods." A mod in `appendPlugins` "sees only the events those mods pass on". Setting `prependPlugins` replaces the default list, so it must name `sec-default@builtin`. Repositories can't set either key. A user's own list "neither adds nor removes the built-in guard" and works only with no managed settings and no Team or Enterprise sign-in. [A#install-your-organizations-mods]
- Debug lines that show the tier: `hooks module X loaded` with `tier prepend` means the org's; `tier user` plus `…not an enabled managed plugin with a hooks module; skipped` means not. [A#install-your-organizations-mods]

### Policy mods

- Before each mod loads, a mod in `prependPlugins` gets the `claude plugin validate` list in the `plugin.register` event and "can read that list and refuse the mod". `e.uses.calls` lists calls as `namespace.method`. Returning `{ refuse }` blocks the load. [A#enforce-a-policy-with-a-mod-of-your-own]
- A hook named after a method, such as `fs.write`, sees "every `$.fs.write` call" from other mods. Returning `{ deny }` blocks one call. `next.origin.plugin` names the caller. [A#enforce-a-policy-with-a-mod-of-your-own]
- A `plugin.register` hook that "throws or exceeds its time limit" is skipped, so the check fails open. A `.catch()` handler makes it fail closed. [A#refuse-mods-when-your-check-fails]

### How a refusal shows

- "A user whose mod was refused or didn't load finds the reason in their debug log." [A]
- The refusal comes after a `loaded` line: "An earlier line says that mod's hooks module `loaded`, so look for the refusal." Example: `refused by cc-plugin-sec-default: mods are limited to your organization's by policy (allowManagedModsOnly)`. [A#allow-only-your-organizations-mods]
- A refusal reaches the transcript only "in a session that hot-reloads a plugin directory". [A#enforce-a-policy-with-a-mod-of-your-own]
- Inference: the person sees only a missing band. The inbox can't report its own absence.

## Settings, environment variables and permissions

This section covers only the settings that touch plugins, hooks and mods. "Security model" and "Admin policy that can stop the mod" cover the guard and org policy.

### What can turn the inbox off

| Setting or state | Effect on the inbox | Source |
|---|---|---|
| `disableAllHooks` in a non-managed file, including a project's `.claude/settings.json` | "the mods you installed stop" | [SETR#disableallhooks] |
| `disableAllHooks` in managed settings | "the mods in every installed plugin stop" | [SETR#disableallhooks] |
| Managed `allowManagedHooksOnly` | Blocks "hooks and mods from other installed plugins". A GitHub install never counts as the org's. | [SETR#what-runs-under-allowmanagedhooksonly; A#install-your-organizations-mods] |
| Project `enabledPlugins: {"inbox@inbox": false}` | "Project settings take precedence over user settings". | [SETR#enabledplugins] |
| Untrusted folder, interactive terminal | "no mod loads until they answer the trust prompt" | [A#know-which-controls-still-apply] |
| `--safe-mode`, `--bare`, `CLAUDE_CODE_SIMPLE` | Installed mods off | [A; ENVV] |
| A deny rule `mcp__*` or `mcp__inbox__*` | "A tool matched by a bare-name glob deny rule is removed from Claude's context." The inbox's `tool.check` allow never runs. | [P#manage-permissions] |
| The mod worker crashes three times | "Claude Code unloads every mod that isn't built in … until the user runs `/reload-plugins` or starts a new session." | [A] |
| Managed `disableSideloadFlags` | Rejects `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS`, so this machine's development setup fails on a managed machine. | [SETR#disablesideloadflags] |

Inference: the UI must not assume the inbox runs in every session on a machine.

### Settings `env` and the launch environment

- "When the Claude Desktop app … starts the session, the launch environment it builds takes precedence instead: Claude Code ignores an `env` value from any settings file for a variable the launch environment already sets." "The debug log names each ignored variable." [SETR#how-env-values-interact-with-your-shell]
- Settings `env` is not expanded: "No shell processes them, so shorthand such as `~` or `$HOME` stays as typed. For a variable that takes a path, such as `CLAUDE_CONFIG_DIR`, write the absolute path." [ENVV#in-settings-files]
- `CLAUDE_CODE_PLUGIN_DIRS` is the exception: paths "must be absolute or start with `~`". Needs 2.1.280. [ENVV]
- Project and local `env` apply "after you trust the workspace, or at startup in `-p` mode". [SETR#when-claude-code-applies-env-values]
- The list of variables project `env` cannot set "include[s]" `CLAUDE_CONFIG_DIR` and plugin cache variables. It does not name `CLAUDE_CODE_PLUGIN_DIRS`, and the list is not exhaustive. [SETR#variables-claude-code-ignores-in-env] Whether a repository can sideload a plugin folder this way is undocumented.
- `CLAUDE_CONFIG_DIR`: "Set it in your shell, user settings, or managed settings. In a settings file, write the absolute path." [ENVV]
- Inference: `HERDR_PANE_ID` (`hooks/register.tsx:525`) and `GH_TOKEN` may differ in desktop sessions. The debug log shows which settings values were ignored.

### Environment variables that matter

| Variable | Fact | Source |
|---|---|---|
| `CLAUDE_CODE_SESSION_ID` | Set for hooks and Bash, "updated on `/clear`". A stdio MCP server keeps its spawn id. "On `--continue` or `--resume` without an explicit ID it may receive the initial startup ID instead." | [ENVV] |
| `CLAUDE_CODE_PLUGIN_DIR_WATCH` | Reload is "on by default in interactive sessions". `1` turns it on in non-interactive sessions; `0` turns it off everywhere. Needs 2.1.287. | [ENVV] |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` | In `-p`, waits for plugin install. "Without this, plugins install in the background and may not be available on the first turn." | [ENVV] |
| `CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH` | Refreshes plugins at turn boundaries in `-p`. Off by default because it invalidates the prompt cache. | [ENVV] |
| `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` | `1` draws mod `Image` elements as pictures in undetected kitty-protocol terminals. Not inside tmux. | [ENVV] |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Also turns off feature-flag fetching. Network policy covers `$.http.fetch`. The docs do not say whether `$.model.complete` is refused. | [ENVV; A] |
| `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` | Ignored at any value from 2.1.287. | [A] |
| `CLAUDE_CODE_REMOTE`, `CLAUDE_CODE_BRIDGE_SESSION_ID` | Set in cloud sessions, and while Remote Control is connected. | [ENVV] |

- Live (2.1.295 terminal, names only): `CLAUDE_CODE_ENTRYPOINT` (value `cli`), `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ATTENDED` and `CLAUDE_PLUGIN_DATA` are set but have no row in the env-vars page.
- The env-vars page classes the VS Code extension as non-interactive: "a non-interactive session such as `claude -p`, the Agent SDK, or the VS Code extension". [ENVV#first-session-after-an-install-or-upgrade]

### Trust in headless and desktop sessions

- "Claude Code shows the trust dialog in interactive sessions only. A `claude -p` run or an SDK session never shows it." [P#project-allow-rules-and-workspace-trust]
- The mod trust gate covers "an interactive session in a directory the user hasn't trusted yet". [A#know-which-controls-still-apply] Inference: it does not apply in desktop Code mode. Not verified.

### Host-supplied policy

- An embedding host ("Claude Desktop delivering a gateway's egress allowlist") can supply managed settings. With no admin tier, "the host's settings then apply as the only managed tier, still filtered to restrictive values." [SETR#parentsettingsbehavior]
- Claude Code ignores host policy "whenever an admin source is present". [SETR#disabledesktoplocalsessions]
- Inference: if host policy counts as "managed settings" for the guard's load rule ("The machine has managed settings" [A#know-what-happens-by-default]), a Pro user in Code mode would get the guard. Unknown.

### Install and update settings

- `extraKnownMarketplaces.autoUpdate`: "`claude-plugins-official` and most other official Anthropic marketplaces default to `true`, and third-party marketplaces default to `false`." [SETR#extraknownmarketplaces] So inbox users stay on their installed version until they update by hand.
- `strictKnownMarketplaces` `github` entries match `owner/repo` exactly. [SETR#strictknownmarketplaces]
- `pluginConfigs` ignores project and local entries since 2.1.207. A `--plugin-dir` plugin is keyed `<name>@inline`. [SETR#pluginconfigs; R#settings-and-environment-variables]
- `prependPlugins` and `appendPlugins` are read from user settings "only on a machine with no managed settings, for a user who isn't signed in with a Team or Enterprise plan". [SETR#prependplugins]

## What the inbox's model calls cost

No public doc mentions mods, `$.model.complete` or `$.model.fork` in its billing, usage or caching text. [COST; MC; PCACHE; DU; MU] Everything below about how a mod call is billed comes from the types or is labeled inference.

### How a mod call is made and billed

- `$.model.complete` "Runs one text completion through the session's own API client". It sends "No tools, no history, no system prompt beyond the CLI's identity block and `request.system`." [T: `model.complete`]
- Inference: it bills like the session. A subscriber's call draws on the five-hour and weekly windows, which are "shared with Claude chat and Cowork" on Team and Enterprise. An API or cloud user pays per token. [COST#claude-for-teams-and-enterprise] The README says "On a Claude plan, these count toward your usage limits" (`README.md:70-71`). No doc confirms it.
- Model-specific limits exist: "'You've hit your Opus limit' or 'You've hit your Sonnet limit'". [COST#when-a-developer-asks-about-a-limit] Inference: a person working on Opus can hit the Sonnet limit, so only the inbox's call fails. The types report that as `isAnswered: false` with `reason: 'api-error'` and an `error` such as `rate_limit`. [T: `ModelCompleteResult`]
- Claude Code's own prompt suggestions skip "while your account is close to or at its usage limit". [COST#background-token-usage] A mod can read `$.session.usage().rateLimits` (`percentUsed`). The list is "empty off a subscription". [T: `session.usage`]
- The inbox's call: `MODEL = 'sonnet'` (`hooks/register.tsx:405`); one cached `system` block, `maxTokens: 1600`, `effort: 'low'` (`:735-737`); a 45-second timeout (`:743`). The catch-up uses `$.model.fork` (`:759`).

### `sonnet` is not one model

| Provider | `sonnet` resolves to | Price per million tokens (input / output) | Source |
|---|---|---|---|
| Anthropic API | Sonnet 5.5 (since 2.1.284) | $2 / $10; cache hit $0.10; 5-minute write $2.50 | [MC#model-aliases; PRICE#model-pricing] |
| Claude Platform on AWS | Sonnet 4.6 | $3 / $15 | [MC#model-aliases; PRICE] |
| Bedrock, Google Agent Platform, Foundry | Sonnet 4.5 | $3 / $15; regional endpoints add 10% | [MC#model-aliases; PRICE] |

- `ANTHROPIC_DEFAULT_SONNET_MODEL` redirects the alias. [MC#environment-variables]
- The model "is resolved and allowlist-checked like a `--model` value". [T: `ModelCompleteRequest.model`]
- Sonnet 4.5 is not in the effort table ("Models not listed here do not support effort"), so `effort: 'low'` is dropped there. [MC#adjust-effort-level; T: "dropped where it does not"]
- "You can't turn thinking off on Opus 5.5, Sonnet 5.5, Haiku 5.5, or the Fable models." "Thinking tokens are billed as output tokens". [MC#extended-thinking; COST#adjust-extended-thinking] Whether thinking counts against `maxTokens: 1600` is unknown.
- The mod cannot tell which model answered. `ModelCompleteResult` has no model field. A `model.complete` hook sees the model "as the request named it". [T]

### A blocked `sonnet` has three outcomes

| Source | What happens |
|---|---|
| Types | "Only a request the engine refuses to send (a blocked model, a bad cap) rejects." The promise throws. [T: `model.complete`] |
| `deniedModels` docs | "If a hook or background request names a model that `deniedModels` blocks … that request runs on the session's model instead." [MC#block-specific-models-or-versions] |
| Allowlist or Enterprise org restriction | Claude Code "substitutes the newest version of the family" that is permitted, for example Sonnet 5. [MC#restrict-model-selection; MC#organization-model-restrictions] |

Inference: the inbox must handle a thrown rejection, not only `isAnswered: false`. A silent switch to Opus 5.5 doubles the per-token price.

### Prompt caching

- Mod cache marks: "a call within five minutes that opens with the same text reads it there". [T: `ModelCompleteRequest`] That matches the docs' "everything else" bucket, which gets five minutes. [PCACHE#which-ttl-each-request-gets]
- The minimum cacheable length is 512 tokens for Sonnet 5.5 and 1,024 for Sonnet 5, 4.6 and 4.5. "Shorter prompts cannot be cached … no error is returned." [PCACHE-API#cache-limitations]
- Third-party providers and gateways: "text marked here is found again only while `prompt` opens the same: mark it there." [T] The inbox marks only `system`. Inference: on Bedrock, Vertex, Foundry or a gateway the inbox may pay full input price every call.
- "A gateway that converts block-form system content to a plain string drops the marker the same way." [PCACHE#where-the-cache-lives]
- `DISABLE_PROMPT_CACHING` and `DISABLE_PROMPT_CACHING_SONNET` in managed `env` turn caching off. [PCACHE#disable-prompt-caching] Both cache counts then read zero.
- "In Claude Code, the cache is effectively scoped to one machine and directory. The system prompt embeds your auto memory paths". [PCACHE#cache-scope] Whether the CLI identity block in front of the mod's `request.system` holds such paths is unknown. That decides whether open sessions share one cache entry.
- Tool lists: "the cache invalidates when the set of tool definitions in the request changes between turns." Plugin skills, hooks and monitors "never invalidate". Mods are not mentioned. [PCACHE#connecting-or-removing-an-mcp-server; PCACHE#plugin-components-that-keep-the-cache] Inference: registering the inbox's tools at `session.attach` or on hot reload may cost one uncached re-read of the main conversation.
- `$.model.fork` re-sends "The main thread's last request again (its model, system prompt, tools, messages) with `prompt` after it: every tool denied, its own tail never cached, the prefix billed afresh once the entry lapsed or after `/model`." [T: `model.fork`] A fork's "first request reads the parent's cache". [PCACHE#subagents-and-the-cache] So the catch-up runs on the session's model. Inference: a cold fork of a 200k-token Opus 5.5 conversation costs $0.80 to $1.60.

### The README figures

- README: "About 0.5¢ per reply, or 1¢ after 5 idle minutes"; instructions and tools "About 1,350, cached"; "about 1% of the total cost" in one long Opus session (`README.md:66-71`).
- Inference: a warm call (2k cached, 1.5k uncached, 100-250 out) at Sonnet 5.5 prices is 0.4-0.6¢. A cold call adds a 5-minute write, about 1¢. The figures match the Anthropic API. They are about 1.5 times low for Sonnet 4.5 or 4.6 on other providers.

### Where the cost shows up

- `claude plugin details inbox` (live): "Source: inbox@inline", Hooks (0), "Always-on: ~0 tok". It does not see the hooks module, its tools, its guidance text or its per-turn call. [PM#measure-what-a-plugin-costs]
- `/usage` attributes recent usage to "skills, subagents, plugins, and individual MCP servers". "An MCP server's share counts only the requests that consumed one of its tool results." [COST#plan-usage-breakdown] Whether the inbox's call appears is unknown.
- OTel `plugin.name` is set only for an active plugin skill or subagent. `query_source` is `main`, `subagent` or `auxiliary`. [MU#cost-counter] A mod call's category is unknown.
- `OTEL_LOG_RAW_API_BODIES=file:<dir>` writes `<dir>/index.jsonl` with `query_source` and `model` per response (2.1.274+). [MU] This is the cheapest way to see which model answered.
- `$.session.usage().cost` is "absent where the host keeps no ledger". [T: `session.usage`]
- "Claude Code doesn't report a plugin's usage back to its author." [PM#check-whether-a-plugin-is-used]

### Data handling

- Inference: the per-turn prompt re-sends Claude's reply and the ledger under the session's account terms: consumer training opt-in, 30-day or 5-year retention, commercial no-training, ZDR where enabled. [DU#data-training-policy; DU#data-retention]
- Telemetry "never include[s] your code, prompts, or file paths". [DU#telemetry-services] The opt-outs do not stop model calls.
- A survey "Yes" uploads "your conversation transcript, any subagent transcripts, and the raw session log file from disk". [DU#session-quality-surveys]
- Local transcripts are kept 30 days (`cleanupPeriodDays`). "Transcripts of sessions started or most recently continued in Claude Desktop or Cowork are exempt from that limit by default." [DU#data-retention]

## Plugins and marketplaces

Terms:
- **Plugin**: "a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit". A plugin with a hooks module is a mod. [PL]
- **Marketplace**: a catalog file, `.claude-plugin/marketplace.json`, that lists plugins and their sources. [MR#marketplace-file]
- **Plugin id**: `<name>@<origin>`. Origins: `@<marketplace>` (installed), `@inline` (`--plugin-dir`, `--plugin-url`, `CLAUDE_CODE_PLUGIN_DIRS`, or the SDK `plugins` option; "for that session only"), `@skills-dir`, `@synced` (from claude.ai), and `@builtin` (types and live store files only). [PLD#find-where-a-plugin-came-from; T: `plugin.register`]

### What an enabled plugin costs every session

- An enabled plugin "is part of every session, not only the sessions where you use it". Skill, agent and command names and descriptions are in context every turn. "what the plugin runs, it runs as you." [PL#what-an-enabled-plugin-adds-to-your-sessions]
- `claude plugin details <name>` prints a `Component inventory` and an `Always-on` token figure. Live: for the inbox it prints "Hooks (0)", "MCP servers (0)" and "Always-on: ~0 tok". It does not see a mod. Don't cite it for the inbox's cost.
- A plugin reaches a session in three layers: settings, disk (`~/.claude/plugins/`), session. "Changes to settings or to disk don't reach this layer until you run `/reload-plugins` or start a new session." [PLD#check-which-stage-a-plugin-reached]

### Manifest facts that matter to the inbox

- `name` is the only required key. Unknown top-level keys are stripped, not fatal. Unknown keys inside `userConfig` options are errors, "and the plugin doesn't load". [MF#fields; MF#unrecognized-fields]
- The manifest has no key for a mod. Mods are declared under `modules` in `hooks/hooks.json`. [MF#fields; PC#hooks] `types` names "A `.d.ts` file that declares the `$.state` values and `$` nouns of a mod". [MF#fields]
- The manifest has no minimum-engine field. [MF#fields] The only guards are a runtime check (`$.session.version()`) or a side effect, such as `options` locking out engines before 2.1.271.
- `version` "pins the plugin to that version until you change it", except for command sources, claude.ai-hosted marketplaces and in-place loads. [MF#version]
- Reserved names: prefixes `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-`; exact `claude`, `anthropic`, `anthropics`, `claude-code`, `claude-mods`. Only `claude plugin init` and `tag` enforce this. [MF#name] `inbox` is safe.
- Claude Code "doesn't load a `CLAUDE.md` at the plugin root". [PC#skills]
- "claude.ai and Cowork don't install a plugin that has a top-level `bin/` directory". [PC#executables]
- A plugin MCP server's tools are named `mcp__plugin_<plugin>_<server>__<tool>`. Tools registered with `$.tool.register` are `mcp__inbox__*` (live). Moving the inbox's tools to an MCP server would rename every tool. [PC#server-names-tool-names-and-reloads]
- `userConfig`: values reach a mod as `register(on, options)` with defaults filled in. "a required field with no value fails the load". Stored under `pluginConfigs[<plugin>].options`; a `--plugin-dir` plugin's key is "its plugin.json `<name>` (or `<name>@inline`)". [T: `PluginOptions`] The docs don't mention `options` or `$.config` for mods.
  - The `userConfig` dialog lives only in the interactive `/plugin` panel. "The `claude plugin install` shell command never prompts". [PC#when-the-configuration-dialog-appears] Inference: any inbox option needs a default, because desktop users can't answer the dialog.
  - "If you declare `options` on any field, users on Claude Code versions before v2.1.271 can't load the plugin." "A plugin whose `options` break these rules fails to load." [MF#limit-a-field-to-fixed-options]
  - Options show as `/config` rows, except `sensitive` and `multiple`. [MF#user-configuration]
- `${CLAUDE_PLUGIN_ROOT}` "changes when the plugin updates. Don't write state there". `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) survives updates and is deleted on the last uninstall unless `--keep-data`. [PC#path-variables-and-persistent-data] The inbox keeps state in `$.store` (`~/.claude/plugins/store/`), which neither the data-folder rules nor `--data-size` cover. Whether uninstall deletes it is unknown.
- A dependency of an enabled plugin "starts enabled regardless". [MF#defaultenabled] Types: a plugin can add a `$` noun and ship its contract for dependents. Inference: a core-plus-UI plugin split is possible, but documented only in the types.

### Install, by app

| Where | How | Source |
|---|---|---|
| Terminal session | `/plugin install inbox --marketplace petekp/inbox` (2.1.275+; asks to confirm a new marketplace) | [PI#add-and-install-in-a-session] |
| Shell | `claude plugin install inbox --marketplace petekp/inbox` (2.1.292+; no confirmation; user scope; prints `Successfully installed plugin: <id> (scope: <scope>)`) | [PI#add-and-install-from-your-shell] |
| Desktop Code mode (local or SSH) | "+ > Plugins > Add plugin", which "shows available plugins from your configured marketplaces". No add-marketplace control is documented. `/plugin` replies "isn't available in this environment". | [PI#install-a-plugin; desktop#install-plugins; PT#plugin-isnt-available-in-this-environment] |
| VS Code | `/plugins` opens Manage plugins | [PI#install-a-plugin] |
| `claude -p`, SDK, claude.ai/code | `/plugin` unavailable. Installed plugins load. SDK `plugins` option loads as `@inline`. | [PI#other-places-you-run-claude-code] |
| Cloud session | No plugin browser. Only server-managed plugins. | [PI#install-a-plugin] |

- "The terminal, the desktop app's local sessions, and the VS Code extension on one computer read the same settings files, so a plugin you install at user scope in any of them is available in the other two." [PI#choose-an-install-scope] Whether they share the plugin cache is unstated.
- The plugin-authoring skill says that in a local Code-mode session `/plugin install` "answers that the command is not available there", and "A mod installed from a terminal at the user scope loads in that local session too, and its `ui.render` hooks draw for the `desktop` surface." [skill]
- So a desktop user installs from a shell, then opens the app. The README's `/plugin install` line works only in a terminal session.
- Install summary states: `Plugin is now active.`; needs MCP configuration; `Run /reload-plugins to apply.`; `The plugin couldn't be loaded`. For the third: "You don't need to type the command. The panel closes and Claude Code runs `/reload-plugins` for you". Only adding or removing "a plugin MCP server, or the `LSP` tool" waits on `--force`. "Claude Code never invalidates the cache for a plugin's skills, commands, agents, hooks, monitors, or themes." [PI#install-a-plugin; PT#run-reload-plugins-to-activate; prompt-caching#enabling-or-disabling-a-plugin]
  - Whether the inbox's `$.tool.register` tools (seen by the model as an `inbox` MCP server) trip that gate is unknown.
- **Last updated** and **Context cost** appear only for official-marketplace plugins. A custom marketplace plugin can show `Components will be discovered at installation`. **Will install** "shows that a hook exists but not what it runs." [PI#install-a-plugin; PS#review-a-plugin-before-you-install] Inference: the README is the only place a user learns what the inbox does before installing.
- Scopes: user (`~/.claude/settings.json`), project (`.claude/settings.json`), local (`.claude/settings.local.json`). Precedence local over project over user; managed `true` force-enables and `false` blocks. [PI#choose-an-install-scope; PLD#find-where-a-plugin-is-enabled]
- Per-repo enabling: "A plugin that the marketplace lists by a relative path loads from the marketplace copy once the repository's `extraKnownMarketplaces` entries apply", after workspace trust. The inbox's `"./"` entry qualifies, so a team could enable it in a committed `.claude/settings.json` with no per-person install. [PO#require-plugins-per-repository] Not verified.

### Versions, updates and the cache

- Version: `plugin.json` `version`, then the entry's `version`, then by source. "Relative path inside a Git-hosted marketplace" uses "The commit SHA of the installed directory". A local non-git folder gives `unknown`. [PLD#how-claude-code-computes-the-version]
  - The inbox sets no version. So each commit is a new version. Whether "the installed directory" SHA means HEAD or the last commit touching it is unstated. With `"./"`, Codex-only commits likely count as Claude Code updates.
  - "If you set `"version": "1.0.0"` and push new commits without changing it, users don't receive them." [PH#release-a-new-version]
- Auto-update "is off for your marketplace by default, and `marketplace.json` has no field to turn it on". Users turn it on in `/plugin` > Marketplaces, or update with `/plugin marketplace update <name>` or `claude plugin update <plugin>@<name>`. [PH#turn-on-auto-update]
- Auto-update timing: "In an interactive session, after you send your first message, Claude Code waits a random delay of up to ten minutes". "The running session keeps the versions it already loaded." The user sees `Plugin updated: <name> · Run /reload-plugins to apply`. "Whether or not you reload, the new versions load on your next launch." [PLD#when-auto-update-runs] Whether it runs in a desktop Code session is unknown.
- `claude plugin update` "ends with `Restart to apply changes.`"; the same page says `/reload-plugins` also applies it. [PLD#check-which-stage-a-plugin-reached] README (`README.md:22`) says `claude plugin update inbox` then `/reload-plugins`. Docs examples always use `<plugin>@<marketplace>`; whether the bare name works is unverified.
- Git-hosted marketplace plugins are copied into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. "Files outside the plugin directory aren't copied". With `"./"`, the whole repo ships (about 225 KiB, 73 tracked files, live). [PLD#in-place-and-copied-plugins]
- Relative-path plugins in a marketplace added from a local path load in place: edits apply at the next start or `/reload-plugins`, with no version bump. [PLD#in-place-and-copied-plugins]
- Old version folders are removed 14 days after an `.orphaned_at` marker, "so a session that already loaded the old version keeps running". [PLD#cleanup-of-previous-versions]
- "When a copied plugin updates mid-session, hook commands, monitors, MCP servers, and LSP servers keep using the previous version's path." Mods are not mentioned. [PLD#when-auto-update-runs]
- Automatic npm install runs only with `package.json` plus a lockfile at the plugin root. "You can't turn the automatic install off." The inbox has none at its root (`codex/package.json` is in a subfolder). [PLD#node-js-package-dependencies]
- `/reload-plugins` output: `Reloaded: N plugins · N skills · N agents · N hooks · …`. In "sessions without an interactive terminal, such as the desktop app, the Agent SDK, and … `-p`" (2.1.260+), it works only when typed into the prompt, not over Remote Control, and it "doesn't connect or disconnect plugin MCP servers". [PCLI#reload-plugins; PCLI#sessions-without-an-interactive-terminal]

### Name conflicts and session-only copies

Highest precedence first: [PLD#name-conflicts]
1. A plugin in managed `enabledPlugins`. It locks out a folder copy: `--plugin-dir copy of "<name>" ignored: plugin is locked by managed settings`.
2. An enabled `--plugin-dir`, `--plugin-url` or `CLAUDE_CODE_PLUGIN_DIRS` plugin. It replaces an installed marketplace plugin "silently". "`claude plugin list` still shows the marketplace row as enabled". Only the debug log records it.
3. An installed marketplace plugin.
4. A skills-dir plugin.
5. A synced plugin, which always loses.

- "The installed copy loads instead if you disabled the session-only copy with `claude plugin disable <name>@inline`, or if managed settings lock that plugin name". Or set `"enabledPlugins": {"<name>@inline": false}`. [PCLI#flags-that-load-a-plugin-for-one-session; PLD#keep-a-session-only-plugin-from-loading]
- `CLAUDE_CODE_PLUGIN_DIRS`: absolute or `~` paths, `:` or `;` separated; "Claude Code skips relative paths"; needs 2.1.280; "Project and local settings can't set this variable". [PCR#from-an-environment-variable; env-vars]
- `CLAUDE_CODE_PLUGIN_DIR_WATCH`: on by default in interactive sessions; `1` turns it on for non-interactive sessions, `0` off everywhere; needs 2.1.287. [ENVV]
- Live: with only `CLAUDE_CODE_PLUGIN_DIRS` set, `claude plugin list --json` shows `inbox@inline`, version `unknown`, scope `session`, and `plugin details inbox` resolves it. The docs say a flag is needed for both. `installed_plugins.json` has no inbox entry on this machine.
- Inference: when testing "the installed plugin" on this machine, the working tree wins unless the `@inline` copy is disabled.

### Synced plugins and Claude mode

- A plugin turned on for a claude.ai account "loads as `<name>@synced`, with no marketplace and no install record". "In terminal sessions, a synced plugin's skills, agents, hooks, MCP servers, and LSP servers all load". Mods aren't named. [PLD#synced-plugins]
- Sync is one way: CLI installs "stay on this machine and aren't added to your claude.ai account." [PI#plugins-from-your-claude-ai-account]
- The desktop app "manages some plugins itself, including plugins synced from claude.ai and plugins your organization deploys through the app", and passes them to local Code sessions unless `disableSideloadFlags`. [SETR#disablesideloadflags]
- Cowork "sources its skills, plugins, and connectors from this Customize configuration, which syncs through your claude.ai account, not from the CLI's `~/.claude` directory." [desktop#extend-claude-code] Inference: `CLAUDE_CODE_PLUGIN_DIRS` does not reach Claude mode.
- Component support by app ("Chat" = claude.ai web, desktop and mobile chats; "Cowork" = desktop tasks; "Claude Code" = terminal, IDE extensions, desktop Code tab): hooks are ignored in Chat and load in Cowork and Code; local MCP is ignored in Chat and loads in Cowork "when the Cowork session runs on your computer"; `bin/` "Can't be installed" in Chat or Cowork; "The directory lists a mod … for Claude Code." [PS-claude#compare-component-support-by-app]
  - Inference: the mod can't run in Claude mode. A local MCP server with an MCP Apps view (as the Codex plugin uses) is the only documented path there. Whether Cowork runs `modules` is unknown.
- Org sync from claude.ai needs a private or internal repo, so `petekp/inbox` can't be org-synced as it is. [PH#distribute-through-organization-settings]
- The Anthropic directory: "One listing there reaches people on claude.ai, in Cowork, and in Claude Code"; a listed plugin loads in Claude Code as `<name>@synced`. [PP#submit-to-anthropics-directory]

### Org plugin controls (beyond the mod guard)

- `strictKnownMarketplaces` (allowlist; `[]` blocks every source) and `blockedMarketplaces` apply "before anything downloads and again at session start". While any allowlist is set, a plugin whose marketplace can't be found doesn't load. [PO#restrict-what-users-can-install]
- `disableSideloadFlags` rejects `--plugin-dir`, `--plugin-url`, `--agents`, the SDK `plugins` option, non-SDK `--mcp-config`, and `CLAUDE_CODE_PLUGIN_DIRS` folders; Claude Code "exits `1` without starting". [PO#control-matrix; PCLI#flags-that-load-a-plugin-for-one-session]
- `allowManagedModsOnly` "Doesn't stop a plugin that contains a mod from installing." [PO#control-matrix]
- Managed `extraKnownMarketplaces` plus `enabledPlugins` install at the user's next session start; a user's own disable doesn't stop it. `"autoUpdate": true` separately keeps it refreshing. [PO#require-a-marketplace-and-its-plugins]
- OTel `plugin_loaded` events report third-party plugin names as `third-party` unless `OTEL_LOG_TOOL_DETAILS=1`. [PS#find-plugins-in-telemetry]

### Plugin security

- "A Claude Code plugin you install can execute arbitrary code on your machine with your user privileges." [PS]
- "Claude Code runs hooks, monitors, MCP servers, LSP servers, and the processes a mod starts outside the sandbox." Permission rules "cover the tool calls Claude makes, not the code a plugin runs by itself". The inbox's `record_finding`, `close` and `run_check` are tool calls, so permission rules apply to them; `run_check` runs arbitrary check commands. [PS#understand-what-a-plugin-can-do]
- With auto-update, "the files you reviewed can change on disk". [PS#understand-what-a-plugin-can-do]

### Other components the inbox could add

- Monitors: a shell command for the whole session; "What it prints reaches Claude as notifications". They start "in an interactive session and never in non-interactive mode with the `-p` flag", get no `userConfig`, and don't run on Bedrock, Agent Platform or Foundry. [PC#monitors; MF#monitors] Whether they start in desktop Code mode is unknown.
- Channels: an MCP server plus a `channels` entry, for outside events into a session. [PC#channels]
- Agent frontmatter `hooks` and `mcpServers` are ignored in plugin agents. [PC#frontmatter-fields-in-plugin-agents]
- "If a rule must hold every time… add it to the plugin as a hook rather than a skill." [PC#skills]

### Live validate and repo state

- `.claude-plugin/marketplace.json`: `name: "inbox"`, one entry `{ "name": "inbox", "source": "./" }`, no `description`, no `version`. `.agents/plugins/marketplace.json` is the Codex marketplace; Claude Code reads only `.claude-plugin/marketplace.json`.
- `claude plugin validate --json` on 2.1.295 exits 0. Warnings: no version, no author, "No marketplace description provided", CLAUDE.md not loaded. `gatingHooks` (16 with `hasCatch: false` in the JSON; the text output listed 17 lines) appear on the `manifest` object and each `contents` item, as notes. Undocumented fields: `advice`, `type`, `code`, and per-module inventory notes. `validate --strict` would fail while `version` is missing.

## MCP and MCP Apps, as they affect the inbox

MCP (Model Context Protocol) is how Claude Code connects to tool servers. An **MCP App** is an MCP tool that names a UI resource (a `ui://` HTML page) for a host to render. The Codex plugin draws its Inbox tab this way.

### MCP Apps in Claude clients

- Claude Code is a text-only MCP Apps client: "Rendering the UI takes a host that supports MCP Apps, such as the Claude desktop app. Claude Code calls the tool as text and doesn't render the UI." [MA-quickstart#see-the-ui-render-in-claude]
- "MCP Apps UI resources … don't appear in the `@` suggestions or in the resource list tool's results … Reading a UI resource by its URI still works." Since 2.1.281. [MCP#reference-mcp-resources; CL#2-1-281]
- When an app tool returns `structuredContent`, "the `tool_result` Claude receives is that JSON object as a string … rather than your `content` text." [MA-quickstart] The SDK says the same for in-process tools. [SDK-custom-tools#return-structured-data]
- "Claude Desktop and claude.ai also render some tool results inside a conversation as interactive widgets … Those widgets load from generated subdomains of `claudemcpcontent.com`". [network-config#desktop-and-claude-ai]
- Desktop chat renders MCP Apps from a local stdio server in `claude_desktop_config.json`, after "Allow" or "Always allow". [MA-getting-started#try-an-example-mcp-app-in-claude-desktop]
- A server added by URL on claude.ai or in the app is reached "from Anthropic's infrastructure over the internet, so a `localhost` address isn't reachable that way." [MA-quickstart]
- Display: "an inline card, an inline carousel, or a full screen view"; protocol modes `inline`, `fullscreen`, `pip`. "The host also caps inline height and clips content that exceeds it." "No floating panels". [MA-design-guidelines#display-modes]
- "Each time Claude calls a tool that renders an MCP App, Claude mounts a separate iframe in the conversation. No host API unmounts earlier instances when a newer one appears". Widgets from one connector share an origin, so `BroadcastChannel` reaches across them. [MA-instance-supersession]
- A widget can call its server's tools with `app.callServerTool`. [MA-quickstart#add-the-ui-to-the-tool]
- Mobile renders apps in a native WebView, and "users must add a connector on web or desktop before it appears on mobile." [MA-design-guidelines#mobile-guidelines]
- `ui.domain` for Claude is "the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`." Links from locally configured servers always show a confirmation modal. [MA-getting-started#set-ui-domain-for-claude; MA-external-links]
- Claude chat: a tool result over about 150,000 characters, with the code sandbox on, is written to the sandbox filesystem "so it never hydrates." [MA-troubleshooting#fix-common-problems]
- TS Agent SDK `readMcpResource(serverName, uri)` (alpha, 0.3.280+) "Reads one MCP Apps `ui://` resource … so your application can render a tool's widget". "The contents are untrusted third-party HTML, so render them in a sandbox." [SDK-ts#query-object]
- Inference: a Claude-mode inbox would be an inline card per tool call, not a persistent tab like Codex's `entrypoints: [{type:'thread'}]`. Whether the desktop Code mode renders MCP Apps is unverified; the quickstart's "Claude Code" includes the Code tab per the platform-support page.
- No page says Claude Code hides `visibility: ['app']` tools from the model, or that Claude hosts declare a UI extension at `initialize`. The SDK passes `ui.visibility` through `McpServerStatus`. [SDK-ts#mcpserverstatus] So the Codex server's `inbox_view` and `inbox_press` may reach Claude as ordinary tools if loaded in Claude Code.

### Where an MCP server reaches

| Path | Reaches | Source |
|---|---|---|
| Plugin-bundled local (stdio) server | Claude Code; Cowork "when the Cowork session runs on your computer"; "not on claude.ai" | [PC#reach-users-on-claudeai-and-cowork; PS-claude] |
| Plugin-bundled remote server | Claude Code; Chat after the user connects it on the plugin's Connectors tab | [PS-claude] |
| `claude_desktop_config.json` | "both the Desktop chat surface and local Code tab sessions". "The standalone CLI does not read `claude_desktop_config.json`." In the Code tab it wins over a same-named `~/.claude.json` or `.mcp.json` entry. | [desktop#mcp-servers-from-the-claude-desktop-chat-app] |
| Desktop connectors | "the desktop app registers the connectors as in-process `type: "sdk"` servers, and no MCP setting or `managed-mcp.json` reaches them" | [MCP#how-connectors-reach-claude-code] |

- Inference: one `claude_desktop_config.json` entry is the cheapest path into both desktop modes. A local stdio inbox can't reach web or mobile.
- First turn in an SDK host: when `options.mcpServers` is empty or holds only SDK servers, the first turn waits up to 2 seconds; with tool search on, only for pending servers with `alwaysLoad: true`. Settings-file and plugin servers "commonly show `pending`". [SDK-mcp#connection-timing] Inference: an inbox MCP server may be missing on a Code-mode first turn unless it sets `alwaysLoad: true`.

### Tool names

| How the tool is added | Name |
|---|---|
| Mod `$.tool.register` | `mcp__inbox__<name>` (live; server instructions read "Tools registered by the inbox plugin through $.tool.register.") [T: `tool.register`] |
| Plugin-bundled server | `mcp__plugin_<plugin>_<server>__<tool>`; server `plugin:<plugin>:<server>`. "A hook matcher written against the bare server key … never fires for a plugin-bundled server." [MCP#plugin-provided-mcp-servers] |
| Configured server | `mcp__<server>__<tool>` [SDK-mcp] |

- Inference: a configured server keyed `inbox` could collide with the mod's `mcp__inbox__*`. Behavior unknown. `inbox` is not a reserved name (reserved: `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser`). [MCP#configuration-warnings]
- Changelog 2.1.295: the permission-prompt status in Remote Control, claude.ai and the desktop app now names an MCP tool "by its server and readable name instead of its `mcp__server__tool` identifier". [CL#2-1-295]

### Mods and MCP

- `$.mcp.call(server, tool, args)` uses "the engine's own connection and credentials" with "No permission prompt". `McpToolResult` carries `content`, `isError` and `structuredContent?` "when its tool declares an output schema". `$.mcp.connect(server)` works for servers in the plugin's own manifest; the name is "usually `plugin:<plugin>:<server>`". No `$.mcp` call reads a resource. [T: `mcp`]
- `McpServerProvenance.source`: `sdk | plugin | user | project | local | dynamic | managed | enterprise | claudeai | agent`; `plugin` means "a server a plugin ships or registers at runtime". [T]

### Limits and behavior

- Tool search is on by default; only names and server instructions load up front. "Claude Code truncates each tool description and each server's instructions at 2,048 characters by default" (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`). [MCP#scale-with-mcp-tool-search] Changelog 2.1.295: deferred tool descriptions are now cut at 16,384. [CL#2-1-295] The inbox pins its tools upfront (`isDeferred: false` through `tool.describe`, `hooks/register.tsx:2058`, `:2063`, `:2071`). Whether any cut applies to mod tool descriptions is unknown.
- "Each connected server takes some space in Claude's context window because its tool names and server instructions load into every session." [MCP-quickstart#add-and-verify-a-server]
- Output: warns over 10,000 tokens; cap 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`); a result with no image over 50,000 characters is saved to a file. HTTP, SSE and (2.1.295) WebSocket messages over 16 MiB fail. [MCP#mcp-output-limits-and-warnings; CL#2-1-295]
- Stdio servers: "Claude Code doesn't reconnect them automatically." A tool call silent for 30 minutes (stdio) or 5 minutes (remote) aborts with an error; that is per call, not the server. [MCP#automatic-reconnection; MCP#push-messages-with-channels]
- A main-conversation MCP call still running after 2 minutes becomes a background task (2.1.212+), not in `-p`. [MCP#automatic-backgrounding-of-long-tool-calls]
- `list_changed`: "In an interactive terminal session, Claude Code fetches the updated list from that server". "In non-interactive mode with the `-p` flag and in the Agent SDK, Claude Code refreshes only the tool list". [MCP#dynamic-tool-updates] Inference: desktop Code mode, an SDK host, refreshes tools only.
- `.mcp.json` is read only at session start. [MCP-quickstart#troubleshooting] In `-p`, SDK and cloud sessions, project-scoped servers load without the approval prompt. [MCP#project-scope]
- Channels: a server pushes messages into a session with the `claude/channel` capability and `--channels`. "On the v2 runtime, a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel messages". [MCP#push-messages-with-channels]
- Elicitation: an MCP server can ask the person through a form or URL dialog; the `Elicitation` hook can auto-respond. [MCP#respond-to-mcp-elicitation-requests] Inference: a host-drawn way to ask "questions only the person can answer", but it blocks the tool call.
- `_meta["anthropic/requiresUserInteraction"]: true` prompts on every call even in bypass and auto modes; with `--permission-prompt-tool`, an `allow` becomes a deny; the SDK's `canUseTool` can approve. [MCP#require-approval-for-a-specific-tool]
- Credential variables such as `ANTHROPIC_API_KEY` read as empty in remote `url` and `headers`. [MCP#credential-variables-that-read-as-empty]
- Changelog 2.1.295 changed claude.ai connectors to negotiate protocol 2026-07-28 by default on installs that fetch no flags; the MCP page still says only "In sessions where it fetches feature flags". [CL#2-1-295; MCP#mcp-client-runtimes]

### The Codex plugin's server (repo, for comparison)

- `codex/src/server.ts`: `TAB_URI = 'ui://inbox/tab'`, `TAB_MIME = 'text/html;profile=mcp-app'`, `APP_ONLY = { ui: { visibility: ['app'] } }`; the `inbox` tool's `_meta` has `ui.resourceUri` and `'openai/ui': { entrypoints: [{ type: 'thread' }] }`; `inbox_view` and `inbox_press` are app-only.
- `codex/plugin/.mcp.json` is a stdio server with Codex fields (`cwd`, `env_vars`, `default_tools_approval_mode`). Whether Claude Code drops these is unknown.

## Remote Control

**Remote Control** lets claude.ai, the Claude mobile apps, or the desktop app view and steer a Claude Code session that keeps running on your machine. "The web and mobile interfaces are a window into that local session." [RC]

- Mods: hooks run "in the session on your machine"; drawings appear "In the terminal on your machine". [O#where-mods-run] The row names only "claude.ai or the mobile app".
- The desktop app is also a viewer: devices "view or steer Remote Control sessions from claude.ai, the Claude mobile apps, or Claude Desktop". [RC#trusted-devices] Whether a desktop viewer attaches as surface `desktop` (which would turn the inbox on, `hooks/register.tsx:1971`) is unknown.
- Types: a Remote Control prompt arrives through `session.receive` with origin kind `bridge`, "the user's own from a Remote Control client". Kinds also include `'projects-relay'`. A `/config key=value` from the bridge is "not attestably the owner's hand". [T: `SessionReceiveOrigin`; `config`]
- Requirements: Pro, Max, Team or Enterprise ("API keys are not supported"; Team and Enterprise need an Owner to enable it). Not on Bedrock, Agent Platform, Foundry, a non-Anthropic `ANTHROPIC_BASE_URL`, or a Claude apps gateway. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `DISABLE_GROWTHBOOK` makes it unavailable. ZDR and HIPAA orgs can't enable it. [RC#requirements; RC#connection-and-security]
- Ways to start: `claude remote-control` (server mode), `claude --remote-control` / `--rc` (interactive), `/remote-control` / `/rc` in a session (terminal, desktop Code mode, VS Code). `remoteControlAtStartup` auto-connects; in the desktop app it is "Settings > Claude Code > Connect new sessions to Remote Control". [RC#start-a-remote-control-session; RC#enable-remote-control-for-all-sessions]
- Server mode: `--spawn same-dir` (default, "all sessions share the current working directory"), `worktree`, or `session`; `--capacity` defaults to 32. It "gives up after roughly 10 minutes" without network and exits; sessions revive "for about four hours". If org policy turns it off, "the server stops and archives the sessions it was serving, then exits". [RC#start-a-remote-control-session; RC#limitations; RC#remote-control-was-turned-off-by-your-organizations-policy]
  - Inference: server-mode sessions have no REPL, so `isInteractive` is probably false and the inbox stays off unless a desktop viewer attaches. With `same-dir`, many sessions would share one project key and press on `KEPT_SESSIONS = 40`.
- "outside of server mode, each Claude Code instance supports one remote session at a time." [RC#limitations]
- Commands: "commands that only run in the terminal interface, such as `/plugin` or `/resume`, work only from the local CLI". Text-output commands work from mobile and web, including `/reload-plugins`, which "works only when the session runs in an interactive terminal". The page says nothing about mod commands such as `/inbox`. [RC#limitations]
- Dialogs: permission prompts and `AskUserQuestion` stay open until answered. Other forwarded dialogs close after five minutes with their "no-action default" (`dialogExpiry`). [RC#limitations] Inference: inbox questions that must wait belong in ledger rows, not dialogs.
- Push notifications: "Claude decides when to push." Toggles "Push when Claude decides" and "Push when actions required". [RC#mobile-push-notifications] Whether `$.ui.notify` from a mod reaches the phone is unknown.
- Devices can change the session's model and effort. [RC#what-connected-devices-see] The inbox pins its own model, so this should not change its update call. Not verified.
- After `/resume` switches conversations, a connected device doesn't get the new title or history. [RC#what-connected-devices-see]
- "While Remote Control is connected, the session transcript, including your messages, Claude's responses, and tool activity, is stored on Anthropic servers." [RC#connection-and-security] This includes text the inbox adds.
- "If you close the terminal, quit the Desktop app or VS Code, or otherwise stop the `claude` process, the session goes offline." [RC#limitations]

## Mobile

- The mobile app is "a client for Claude Code sessions rather than a place where code runs". Cloud sessions and Remote Control "both live in the **Code** tab in the Claude app". [MOB]
- "commands that only run in the terminal interface, such as `/plugin` and `/resume`, don't work from the app." Bypass permissions can't be chosen. [MOB#limitations]
- Projects: "A conversation where Claude coordinates parallel threads of work and reports back", for when you "want to see which threads finished or need you". [MOB#work-from-your-phone] This overlaps the inbox's job.
- Docs: mods draw nothing on the phone. Types: `mobile` is a surface with Box, Text, Button, Svg, Link, Code, Markdown and no `Input` or `Select` ("the mobile app draws no field yet"); "the mobile app reports `false`" for `isFullscreen`; Svg is drawn "in a web view"; the `session.attach` example reads `{ surface: "mobile" }`, "a phone joined: draw the lobby". [T: `Elements.mobile`; `RenderViewport`; `SvgProps`; `session.attach`] Inference: the protocol may exist without a slot for Pane or AbovePrompt ("draws the tree where it has a slot for it").
- No `RenderSurface` value stands for claude.ai/code in a browser. [T]
- The inbox has no mobile code. It detects a missing `Input` generically (`hooks/register.tsx:2479`) and drops `typekey-` actions without one (`:2885`).
- Inference: if a phone ever draws mod trees, the rework needs one tree that degrades to Buttons, Text and Markdown, with no keyboard hints and no sidebar.

## Cloud sessions

A **cloud session** runs on Anthropic-managed infrastructure (or an org's self-hosted environment). It is started from claude.ai/code, the mobile Code tab, the desktop app with **Cloud** selected, `claude --cloud`, or routines. [WEB]

- Plugins: "A cloud session doesn't install the plugins a repository turns on under `enabledPlugins`". "Plugins enabled only in your user settings" don't carry over. Server-managed settings do (except in Claude Tag sessions). MDM and file-based managed settings don't. [ENV#what-carries-over-from-your-setup] `~/.claude/settings.json` is "not read". [SET#settings-in-cloud-sessions]
- Changelog entries show plugins "synced from claude.ai" do load in cloud sessions as `name@synced` (2.1.239, 2.1.261, 2.1.269, 2.1.287). 2.1.295 "Fixed cloud sessions hanging when a mod's `session.receive` hook asked for permission before passing a message on." [CL] Inference: mods can run in cloud sessions via synced or server-managed plugins. The carry-over table omits synced plugins.
- Nothing a mod draws appears. [O#where-mods-run] The inbox gate keeps it off there, assuming the desktop app does not attach to cloud sessions as `desktop`.
- Hooks: "Claude Code runs hooks from the repository and from your organization's server-managed settings." Self-hosted sessions also run "the hooks the operator seeded from the runner host's `~/.claude/`". A session with several repositories loads no repo hooks. [ENV#setup-scripts-vs-sessionstart-hooks; ENV#limitations-in-cloud-sessions]
- Detection: `CLAUDE_CODE_REMOTE` is `true` in the VM, "never `true` locally". `CLAUDE_CODE_REMOTE_SESSION_ID` holds a `cse_…` id. [ENV]
- GitHub proxy (Anthropic-hosted): it "rejects requests to GitHub's GraphQL endpoint with a 403… `gh` subcommands that use GraphQL, such as `gh pr` and `gh issue`, get the same 403… a `GH_TOKEN` you set gets the same 403." "Claude can't reach GitHub APIs that exist only in GraphQL". [ENV#github-proxy] The inbox's PR block uses `gh api graphql` with `THREADS_QUERY` (`hooks/prs.ts:41`, `reviewThreads { isResolved isOutdated … }`) and `gh pr view`. Inference: both fail in cloud; `gh pr view` could move to REST, the thread list probably not.
- Network: sessions reach "The Anthropic API, for Claude Code's own requests, even at **None**". [ENV#access-levels] Inference: `$.model.complete` would work at any level.
- Lifecycle: after a few idle minutes the VM pauses; "Your next message restores the same VM and starts Claude Code again." A reclaimed VM restores the conversation but not running background work. [ENV#time-limits; ENV#set-environment-variables; WEB#environment-expired] Inference: a mod would see a new process after each pause; whether `$.store` survives a reclaim is unknown.
- Cost: cloud sessions count toward plan limits and "share rate limits with all other Claude and Claude Code usage". [WEB#limitations]
- Handoff: `--teleport` pulls a cloud session into the terminal as "its own copy"; the CLI can't push a terminal session to the cloud. The desktop app's **Open in → Cloud** can. `/clear` doesn't work in cloud sessions. [WEB#move-tasks-between-terminal-and-cloud; WEB#manage-context]
- `$.session.send` can address "a Remote Control or cloud id (`session_...`)". [T: `SessionSendAddress`] Archived sessions refuse messages. [WEB#send-follow-ups-from-the-cli]
- ZDR and HIPAA organizations get no cloud sessions and no Remote Control. For them the inbox's clients are terminal and desktop only. [WEB; RC#connection-and-security]

## Sessions across processes and apps

### Session ids and storage

- A session is "a saved conversation tied to a project directory". Transcripts live at `~/.claude/projects/<project>/<session-id>.jsonl`. "The entry format is internal to Claude Code and changes between versions". Retention is 30 days (`cleanupPeriodDays`). [SE#where-transcripts-are-stored]
- `$.session.id()` "Returns the session's id (the transcript file's name)". [T: `session.id`]
- Live: desktop Code-mode sessions store transcripts under `~/.claude/projects` too, and appear in `claude agents --json` and `ListAgents` (label `Claude Desktop session`). They share the CLI's store.
- Events that give a new session id or a fresh process, so `$.state` starts empty: `/clear` (new id, no `session.start`); `/branch` and `--fork-session` (new ids); `/fork` (new id, new background process); `--resume <id> --bg` (same id or a copy with a `note:`); `←` or `/bg` ("a fresh process that resumes from the saved conversation"). [SE#branch-a-session; AV#what-carries-over-when-you-background; AV#from-your-shell] The ledger must load from the store by session id.
- `/branch` keeps a Remote Control connection: "A phone or browser connected to the session follows you into the branch". [SE#branch-a-session]
- "If you resume the same session in two terminals without forking, messages from both interleave into one transcript". [SE#branch-a-session] Inference: a ledger keyed by session id can see two live processes for one id.
- `-p` and SDK sessions are left "out of the session picker and out of `claude --continue`". [SE#resume-a-session] Inference: desktop Code-mode sessions, being SDK-style, are excluded too; "a desktop-app session resumes in the desktop app". [SE#name-your-sessions]
- A resume restores history, model, agent and permission mode, but `--mcp-config`, `--settings`, `--plugin-dir`, `--fallback-model` and `--add-dir` "must be passed again". [SE#what-a-resumed-session-restores]
- Names are not stable keys: default names (`my-app-3f`) change on `/rename` or plan accept, and duplicates get suffixes. Use the full `sessionId`. [SE#name-your-sessions]

### `claude agents --json`: the supported session list

- "`claude agents --json` is the supported way to read session state from outside Claude Code." It "prints active sessions as a JSON array and exits: every live session, plus background sessions that are still working or blocked even when their process has exited". `--all` adds completed sessions. [AV#read-session-state-from-a-script; AV#list-sessions-as-json]
- Fields: always `cwd`, `kind` (`interactive` | `background`), `startedAt`. Background only: `id`, `state` (`working` | `blocked` | `done` | `failed` | `stopped`). While the process lives: `pid`, `status` (`busy` | `waiting` | `idle`); with `waiting`, `waitingFor` (`permission prompt`, `input needed`, `sandbox request`, `worker request`, `dialog open`). When set: `sessionId` and `name`. "`blocked` always means the session needs something from you". [AV#list-sessions-as-json]
- "The files under `~/.claude/jobs/<id>/` are not a stable interface." [AV#read-session-state-from-a-script]
- Live (2.1.295): 17 to 18 entries; interactive entries had keys `cwd, kind, name, pid, sessionId, startedAt, status`; background entries `cwd, id, kind, name, sessionId, startedAt, state`. Two interactive entries were desktop Code-mode sessions. No entry showed `waitingFor` (none was waiting).
- Inference: it fills the liveness gap for an "every open session" view. Its `sessionId` joins to the inbox's `s:<sessionId>` keys and to `$.session.send`. A mod can run it with `$.process.run`. It doesn't cover Codex, cloud, other machines, or another `CLAUDE_CONFIG_DIR` (which runs a separate supervisor). [AV#where-state-is-stored]
- Agent view already shows per-session needs-input, working and done, a Haiku summary per turn, PR status and notifications. [AV] The inbox's distinct value is item-level: questions, the person's tasks, findings.
- Background sessions: an idle one left unattached about an hour has its process stopped and restarts on reply; "Attached sessions always render in fullscreen mode". [AV#the-supervisor-process; AV#attach-to-a-session] Whether the mod turns on in a background session is unknown. If it does, each one adds per-turn Sonnet calls.

### Cross-session messaging

- "A message is a piece of text one Claude writes to another". Claude uses `ListAgents` and `SendMessage`. "When the receiving session is idle, Claude Code starts a new turn with the message". "Once delivered, the message counts toward usage like a prompt you type". [XSM#message-delivery]
- Same machine: "per-session socket on macOS and Linux, or a per-session named pipe on native Windows, never through Anthropic servers". Other machines and cloud go through Anthropic servers and need Remote Control. [XSM#message-sessions-on-other-machines]
- A message "can't approve anything", "can't change configuration", and "Commands don't run". [XSM#how-a-session-treats-an-incoming-message]
- `crossSessionInbound`: `accept`, `hold`, `refuse`. "A session in the VS Code extension or the Desktop app can't show the dialog", so held messages wait until `dialogExpiry` (5 minutes) and drop. At most 50 queued accepted messages; about a million characters per message. [XSM#control-inbound-messages; XSM#limitations]
- Requires 2.1.224 (macOS, Linux, WSL2) or 2.1.234 (Windows); 2.1.248 on third-party providers. [XSM]
- Types (not in docs): `$.session.send({ to, text })` is "the model's SendMessage tool's own call and delivery"; `to` can be `{ sessionId }`. "A session that is not running now is not delivered to". A `session.receive` hook can return `{ consumed: reason }`: "nothing is queued, shown or read by the model". `origin.plugin` is "AS THE SENDER SAYS ... never key a guard on it". [T: `session.send`, `session.receive`]
- Inference: mod-to-mod pings between inbox sessions are possible this way, under the same hold rules. A shared store is simpler for persistence.

### Prompt origins

`PromptOrigin.kind` in the types: `composer` (the person's own gesture, "never presumed"), `bridge` (Remote Control), `sdk`, `peer`, `peer-send-message`, `channel`, `scheduled-trigger`, `task-notification`, `projects-relay`, `coordinator`, `observer`, `observer-activity`, `auto-continuation`, `slack-ping`, `plugin` ("A plugin's `$.prompt.submit`"), `unclassified` (same-user socket posts and unstamped engine notices). [T: `PromptOrigin`]

- The inbox counts a prompt as the person's words only for `composer`, `bridge`, or `plugin` with `asUser` (`hooks/register.tsx:2025`).
- The types' settings-hook `UserPromptSubmit.source` defines `sdk` as the "non-interactive entrypoint (`-p` / Agent SDK)". [T] What a desktop Code-mode prompt carries is unknown. See "Unknown, and how to check".

### Channels

- A channel is "an MCP server that pushes events into your running Claude Code session". Research preview, allowlist-gated, needs `--channels` at launch, claude.ai or Console auth, not on Bedrock, Agent Platform or Foundry. "Events only arrive while the session is open". [CH]
- The development flag: "If you pass it in non-interactive mode with `-p` or through the Agent SDK, Claude Code ignores the flag and the channel doesn't register." [CHR#test-during-the-research-preview] Inference: channels are likely unavailable in desktop Code mode.
- Inference: not a viable inbox transport today. A later use could push CI and review events into a session.

## Headless `-p` and the Agent SDK

**Headless** means a run with no terminal UI: `claude -p` (print mode) or the **Agent SDK**, a library that "runs the Claude Code binary, with Claude Code's capabilities". [SDK-overview#compare-the-agent-sdk-to-other-claude-tools] The desktop app's Code mode drives a headless engine too (see "The desktop app"), so these rules shape the inbox there.

### What `-p` loads, and `--bare`

- Default `-p` "loads the same context an interactive session would, including anything configured in the working directory or `~/.claude`." It runs project hooks and `.mcp.json` servers "even in a folder you've never trusted", with no trust dialog. [HL#start-faster-with-bare-mode]
- `--bare` skips "hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and CLAUDE.md". It still loads a plugin passed by `--plugin-dir` or `--plugin-url`. It "never reads OAuth credentials or the system keychain", so it needs `ANTHROPIC_API_KEY` or an `apiKeyHelper`. Since 2.1.286 it connects only command-line MCP servers, sends no system reminders and starts no background tasks. [HL#start-faster-with-bare-mode; CL#2-1-286]
- "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." [HL#start-faster-with-bare-mode]
- Refusal message under `--bare`: "installed plugins that are not managed load no hooks module in this mode (--bare)". [TS#refusal-messages] Whether a `--plugin-dir` (`@inline`) hooks module loads under `--bare` is not stated.
- `--bare` is not `--safe-mode`. Safe mode disables plugins and hooks but keeps login and model selection. [CLI#cli-flags]
- Exit 0 on success. Bad flags go to stderr. In-run failures such as missing auth print as the result on stdout. [HL#basic-usage]

### `--plugin-dir` and `--plugin-url`

- `--plugin-dir` loads "a directory or `.zip` archive, or several from a folder of plugins, for this session only". A folder of plugins needs 2.1.265. `--plugin-url` fetches a `.zip` for one session. [CLI#cli-flags]
- A `--plugin-dir` plugin's id is `<name>@inline`. [T: `PluginOptions`]
- "Claude Code watches a directory loaded with `--plugin-dir` and hot-reloads the hooks module when a file in it changes. Each reload runs `register` again." [C]
- 2.1.295: "Fixed generated type files being written into a `--plugin-dir` plugin's folder in `-p` and SDK sessions; they are now written only where a mod is being developed." [CL#2-1-295] Fixed symlinked `--plugin-dir` hot reload: 2.1.289. [CL]

### `system/init` and plugin reports in stream-json

- `system/init` "reports session metadata including the model, tools, MCP servers, and loaded plugins". [HL#read-session-metadata]
- `plugins` lists plugins "that loaded successfully, each with `name` and `path`". `plugin_errors` entries have `plugin`, `type`, `message`. "A plugin that didn't load is absent from `plugins`." `path` on a `--plugin-dir` failure needs 2.1.283. [HL#fail-ci-when-a-plugin-or-mcp-server-doesnt-load]
- `plugin_errors` also covers "a plugin that loaded without one of its parts, such as its hooks file". [SDK-ts#sdksystemmessage]
- `capabilities` (2.1.205+) is the way to "feature-detect instead of comparing version strings". [HL#read-session-metadata] No capability names a mod feature.
- Use: to confirm a patched copy of the inbox loaded in a `-p` trial, read `init.plugins` and `plugin_errors`. A failed hooks module also prints to stderr. [TS#a-claude--p-run-prints-hooks-module-not-loaded]

### Shutdown and the 1.5-second end bound

- SIGTERM: exit code 143. "Claude Code leaves the turn that was in progress unfinished and records no result for it." It "then runs `SessionEnd` hooks and exits", starting "no new tool call" and "no new model request". [HL#stop-a-run-with-sigterm]
- "One short wall-clock bound (1.5 s by default) covers every hook, its `$` waits and core". [T: `SessionEndInput`] The settings-hook docs agree and name the override `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`. The budget "applies when you exit, run `/clear`, or switch sessions with interactive `/resume`". [H#sessionend]
- On `/clear` "the conversation ends, the process goes on under a new session id, and no `session.start` fires for it." [T: `SessionEndInput.reason`]
- `session.detach` with reason `end` "runs inside `session.end`'s one short bound". [T: `session.detach`]
- Inference: the inbox's `session.end` work (store writes and `publishStatus`, a `$.process.run` with a 5,000 ms timeout at `hooks/register.tsx:522-546`) can be cut off. The saved ledger must not depend on `session.end`.
- After the turn, `-p` waits for background work. It stops idle work after 10 minutes by default (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`), but not while a main-conversation background command still runs. [HL#background-tasks-at-exit]

### Other `-p` behavior

- `--output-format json` includes `total_cost_usd`, a client-side estimate. [HL#get-structured-output]
- `--permission-prompts none` (2.1.259+) denies anything that would prompt unless a `PermissionRequest` hook allows it. In stream-json, denials appear as `permission_denied` messages. [HL#turn-off-permission-prompts-in-unattended-runs]
- Commands: skills and custom commands work as `/name` in the prompt. Terminal-only built-ins such as `/login` do not. [HL#create-a-commit] `/reload-plugins` works in headless sessions since 2.1.260. [CL#2-1-260]
- `--resume <id>` finds a session in any project on the machine (2.1.223+). [HL#continue-conversations]

### Agent SDK

- With `settingSources` omitted, `query()` "reads the same filesystem settings as the Claude Code CLI", equal to `["user", "project", "local"]`. The source table does not mention installed plugins. [SDK-features#control-filesystem-settings-with-settingsources]
- Read regardless: managed settings, `~/.claude.json`, auto memory, claude.ai connectors. "Do not rely on default `query()` options for multi-tenant isolation." [SDK-features#what-settingsources-does-not-control]
- SDK plugins: "The `type` field must be `"local"`". "The SDK doesn't expand tilde paths". A missing path is skipped silently. [SDK-plugins#loading-plugins; SDK-plugins#multiple-plugin-sources] The page never mentions mods or a hooks module.
- `reloadPlugins()` reloads plugins mid-session (SDK 0.2.85+). Its plugin `version` "is plugin-author-controlled". [SDK-ts#query-object]
- SDK callback hooks are separate from mod events. The SDK hook list has no `session.attach` or `ui.render`. [SDK-hooks#available-hooks]
- SDK sessions emit only `permission_prompt` and elicitation notifications. "Claude Code emits the other types, such as `idle_prompt` … from interactive UI that SDK sessions don't run." [SDK-hooks#forward-notifications-to-slack]
- Third parties may not offer claude.ai login "Unless previously approved". [SDK-overview]

### Mods in headless hosts (engine types)

- `SessionStartInput.isInteractive` is "true under the REPL, false for a `-p` run or the SDK". `surface` is "`terminal` under the REPL; null for a `-p` run or the SDK, which draw nowhere yet". [T: `SessionStartInput`]
- `$.session.surfaces()` lists "`terminal` under the REPL first, then the remote ones in the order they attached … Empty in a plain -p run." [T: `session.surfaces`]
- `session.attach` "Fires when a remote client joins the session's roster … it said so (ui_attach), or it first asked to draw". `clientId` is `<surface>:default` when unnamed. "the terminal's attachment is the REPL's binding and raises nothing." [T: `SessionAttachInput`]
- `$.process` is "Commands on the host, run as the user the session runs as. CLI only." [T: `process`]
- `$.prompt.read()` returns empty "where the session draws no box (a -p run, an SDK host)". `fill` reports `isFilled: false` and `suggest` reports `isShown: false` when headless. [T: `prompt`]
- No public SDK page says how a host attaches a drawing surface. Only the types mention `ui_attach`. Inference: a third-party SDK host, or the Codex app, cannot show the mod's band or pane through any documented interface.

### Evidence that the desktop app is an SDK host

Only the changelog says so:

- 2.1.208: "'Change directory' in SDK hosts (e.g. Claude Desktop)".
- 2.1.260: "`-p --resume`/`--continue` (as used by the desktop app)".
- 2.1.280: "a host app (Claude Desktop, VS Code, SDK)".
- 2.1.282: "SDK-hosted sessions such as Claude Desktop".
- 2.1.269: "(once Desktop bundles this CLI version)", which shows the app lags the changelog. [CL]

The live process list on 2026-10-08 showed the app's engine started with `--input-format stream-json --output-format stream-json` and no `-p` flag (see "The desktop app"). So the changelog's "`-p --resume`" may describe an older launch line, or a mode the engine enters without the flag. Unknown.

Inference, high impact: if `--bare` becomes the `-p` default and the app's sessions count as `-p` without opting out, installed mods, including the inbox, would stop in Code mode.

## IDE extensions, the status line and artifacts

### VS Code extension

- The extension "bundles its own copy of the CLI (command-line interface) for the chat panel". "The extension's version number is the Claude Code version it bundles." [VSC#prerequisites; VSC#install-the-extension]
- Plugins are shared: "Plugins and marketplaces you configure in the extension are also available in the CLI, and vice versa." After saving, "the open sessions reload their plugins". [VSC#manage-marketplaces; VSC#install-plugins]
- Docs: the chat panel runs a mod's hooks but draws nothing. [O#where-mods-run] Types: `vscode` is a remote surface with its own element table. See "Where sources disagree".
- Inference: the inbox loads in the panel, and its gate keeps it off, so it makes no per-turn model call there. This holds only while the panel never attaches as `desktop`.
- `claudeCode.useTerminal`, or **Open in Terminal**, runs the CLI interface in VS Code. That is the terminal surface, where the band and pane draw. [VSC#switch-to-terminal-mode]
- History is shared with the CLI. A conversation open elsewhere warns "This conversation is still open somewhere else. Using it in two places at once can mix up its messages." **Open here anyway** opens it in both. `claudeProcessWrapper` skips the check. [VSC#resume-past-conversations] Inference: two inbox instances can then update one `s:<sessionId>` record.
- The extension's own "needs you" signals: session filters **Needs input / Working / Completed**, a tab dot ("blue means a permission request is pending"), the agent map dot, and Focus view, which keeps pending-question text visible. [VSC#filter-the-sessions-list; VSC#run-multiple-conversations; VSC#use-the-prompt-box]
- `CLAUDE_CONFIG_DIR` in `claudeCode.environmentVariables` "applies only when its value is an absolute path". [VSC#extension-settings] This matters for live tests with a separate config.
- Deep link: `vscode://anthropic.claude-code/open?prompt=…&session=…`. The prompt is "pre-filled but not submitted". "The session must belong to the workspace currently open in VS Code." [VSC#launch-a-vs-code-tab-from-other-tools]

### JetBrains

- "The plugin runs the `claude` command in your IDE's integrated terminal and connects to it. It does not bundle its own copy of the CLI." It is still Beta. [JB#installation]
- The mods table counts it with the terminal: hooks run and drawing appears. [O#where-mods-run]
- Inference: IDE terminals are often narrow. A pane the mod opens on its own needs 144 columns, or 110 after the person opened it once. [IF#when-a-pane-waits-for-a-wider-terminal] So in IDE terminals the band carries most of the load.

### Platforms page

- "Claude Code runs the same underlying engine everywhere." "Configuration, project memory, and MCP servers are shared across the local surfaces." [PLAT#where-to-run-claude-code]
- "The CLI is the most complete surface for terminal-native work: scripting and the Agent SDK are CLI-only." [PLAT#where-to-run-claude-code]
- It names only "Desktop" and "the Code tab". [PLAT]

### The `statusLine` setting

The **status line** is "a customizable bar at the bottom of Claude Code that runs any shell script you configure". [SL]

- A plugin cannot ship one. A plugin's `settings.json` keeps only "`agent` and `subagentStatusLine`, and every other key is dropped". [PC]
- It "runs locally and does not consume API tokens". It needs workspace trust. Under managed `allowManagedHooksOnly`, "your custom status line disappears without warning". [SL#how-status-lines-work; SL#workspace-trust-required; SL#status-line-not-appearing]
- Updates are debounced at 300 ms, and a new trigger cancels an in-flight script. "The event-driven triggers can go quiet when the main session is idle"; `refreshInterval` covers that. [SL#when-the-status-line-updates]
- Input includes `session_id`, `transcript_path`, `cost`, `context_window`, `rate_limits`, `pr`. `cost.total_cost_usd` "Resets to $0 when `/clear` starts a new session." No field names the surface or client. [SL#available-data]
- The page is written for the terminal. Whether it renders in the desktop app, the VS Code panel or mobile is not stated.
- The mod equivalent is `$.ui.status(text)`: "Pins `text` as this plugin's status line under the prompt … One per plugin". It draws the "first 2000 characters … (10000 remotely)". [T: `ui.status`] `$.session.usage()` returns "the context window's fill, the rate-limit windows and the cost as the status line has them". [T: `session.usage`]
- Repo naming: `statusLine` in `hooks/ledger.ts` and `hooks/register.tsx` builds the Herdr sidebar text. It is not Claude Code's `statusLine` setting.

### Artifacts

An **artifact** is "a live, interactive web page that Claude Code publishes from your session to a private URL on claude.ai". [ART]

- Publishing is the model's `Artifact` tool. No mods API publishes. [ART; T] Inference: every inbox publish would cost a model turn.
- "A new artifact that Claude publishes in response to a prompt you type goes through without a permission prompt or classifier review." Scheduled-task turns ask first. [ART#when-claude-code-asks-before-publishing] Whether a mod-started turn counts as "a prompt you type" is unknown.
- Availability: Pro, Max, Team or Enterprise; a claude.ai login ("Sessions using an API key, gateway token, or cloud-provider credential cannot publish"); Anthropic API only; not with CMEK, HIPAA or ZDR. Surfaces: "Claude Code CLI, or the Claude desktop app version 1.13576.0 or later". "Off by default in the Agent SDK … when you run Claude Code with `-p`". [ART#availability]
- CSP: `fetch` reaches "only the page's own origin and the Google Fonts hosts". The published page "can't call" local MCP servers. [ART#page-constraints; ART#pull-live-data-with-mcp-connectors] Inference: an inbox page is a snapshot the session pushes, not a live view of the store.
- Return path: comments sent with **Send to Claude** reach the publishing session "right away" (2.1.228+). Auto-replies stop after "60 sent comments or thread activations on that artifact within an hour". [ART#let-claude-reply-to-comments-on-its-own]
- Types (2.1.295 only): `session.receive` fires for "an artifact page's room events", with `source` `artifact-room` and events `{ topic, from, isOwnViewer, data, isTruncated }` "as the page's viewers wrote it". A hook can consume one so "nothing is queued, shown or read by the model". [T 2.1.295: `SessionReceiveEvent`] Inference: an artifact page could send answers back to the mod without a model turn. Viewer data is untrusted.
- Live: this session's `Artifact` tool describes multi-file publishes, a per-artifact database (`ArtifactData`) and other runtime capabilities "depending on what is enabled for this person". The public page says "Single page" and "No backend". See "Where sources disagree".

## Recent changes

The changelog page "is generated from the CHANGELOG.md on GitHub". On 2026-10-08 it held 417 entries, the latest 2.1.295, dated October 8, 2026. [CL] The what's-new digests stop at Week 37 (September 7-11, v2.1.263-269), so no digest covers the mods launch. Week 31 is missing from the index. [WN]

### Mod changes by version

| Version (date) | Change that matters to the inbox | Source |
|---|---|---|
| 2.1.286 | Mods on by default; Desktop floor. The changelog does not mention it. | [O#turn-mods-on-or-off; A] |
| 2.1.287 (Oct 1) | "Added Claude Mods: plugins may now modify deeper behavior". Terminal floor. | [CL#2-1-287] |
| 2.1.288 (Oct 2) | `$.ui.selection()`. Fixed a button "running a different button's action" on a view drawn before a restart. Fixed background sessions ending when a plugin reloaded mid-timer. | [CL#2-1-288] |
| 2.1.289 (Oct 3) | Fixed "installed mods not loading in the first session after an upgrade". A throwing `ui.render` value no longer ends the session. A failing `Client` "now fails alone and raises `ui.fault`". | [CL#2-1-289] |
| 2.1.290 (Oct 5) | Fixed "mods staying off for people who reach Claude through a gateway (`ANTHROPIC_BASE_URL` with `ANTHROPIC_AUTH_TOKEN`) and have no Anthropic account". Fixed a pane or band "redrawn without end". A failed reload followed by a refresh unloads the earlier version, now with a message. `claude plugin validate` lists gating hooks. Long hook text is clipped and logged. | [CL#2-1-290] |
| 2.1.292 (Oct 6) | "Added prompt caching to `$.model.complete` for mods: `prompt` and `system` take blocks of text, and `cache: true` on a block caches the request up to it". Added `prompt.autocomplete`. A module that reads `$.state` through a redeclared or reassigned top-level `var` is refused. | [CL#2-1-292] |
| 2.1.293 (Oct 7) | "Added `isDeferred` to `$.tool.register`". Fixed `classic.*` hooks being skipped while the hooks worker restarts. | [CL#2-1-293] |
| 2.1.294 (Oct 8) | No mod entries. | [CL#2-1-294] |
| 2.1.295 (Oct 8) | Added `$.ui.notify` ("raises a native notification through your own notification setting"). Added `Button` children ("strings and `Text`"). Org mods' toasts show first. Fixed hot reload turning off when "an SDK host closed its enable question before anyone answered". Fixed type files written into `--plugin-dir` folders in `-p` and SDK sessions. Fixed "a plugin that adds very large interfaces getting another plugin unloaded". | [CL#2-1-295] |

- The changelog never mentions `session.attach`, `$.session.surfaces()` or the `desktop` surface. Only the types document them.
- The mods docs date some changes the changelog omits: `prompt.mention` needs 2.1.290 [R], and before 2.1.290 a toast within two seconds of the mod's last one was dropped [TS].
- Anthropic can turn installed mods off remotely: "the rollout switch served off". [TS#refusal-messages]

### What this means for the inbox's minimum engine

- `askLedgerModel` sends `system` as a block array with `cache: true` (`hooks/register.tsx:735`). That form arrived in 2.1.292. [CL#2-1-292]
- README says "built and tested with Claude Code 2.1.292" (`README.md:20`).
- The desktop app keeps a 2.1.289 engine on disk next to 2.1.293 (live). Inference: a Code-mode session on 2.1.289 may fail the per-turn call or lose caching. The sessions running on 2026-10-08 used 2.1.293.
- The inbox sets `isDeferred: false` through `tool.describe` (`hooks/register.tsx:2058`, `:2063`, `:2071`). The changelog and the mods API page date only the `$.tool.register` field (2.1.293, "earlier versions ignore it"). When `tool.describe` gained it is unknown.
- `$.ui.notify` and mixed `Button` children need 2.1.295. The desktop app does not bundle 2.1.295 yet (live). Changelog 2.1.139 turned off "notification preferences" when an API key or auth token is set. Inference: `$.ui.notify` may do nothing there.

### Desktop app facts from the changelog

- It runs the engine as an SDK host (2.1.208, 2.1.260, 2.1.280, 2.1.282). VS Code is an SDK host too: "SDK hosts such as the VS Code extension" (2.1.290). [CL]
- It bundles its own engine and lags releases: "(once Desktop bundles this CLI version)" (2.1.269). [CL#2-1-269]
- It has warm starts: settings "ignored on warm starts, including desktop-app Code sessions" (2.1.257). [CL#2-1-257] When `session.start` fires relative to opening a session is unknown.
- `/plugin` in the Code tab "now says where to install and manage plugins there" (2.1.290). [CL#2-1-290]
- Desktop counts as attended: background command limits "apply only in unattended sessions (`-p`, Agent SDK, CI, cloud); terminal, desktop app and VS Code sessions have no limit" (2.1.288). [CL#2-1-288]
- Its own "waiting" signals: a "'Claude is waiting for your input' notification" (2.1.247) and the "contextual 'what Claude needs' turn-end notification text" (2.1.269). [CL]
- SDK and desktop sessions showed "an unknown status in other sessions' agent list" until 2.1.269. [CL#2-1-269]
- Desktop-hosted sessions accept Remote Control clients (2.1.252, 2.1.273). Inference: `session.attach` with `mobile` could fire on a desktop session.
- `/resume` in the desktop app continues a CLI session (Week 35), and `claude --desktop --resume <id>` (2.1.285) goes the other way. [WN-35; CL#2-1-285]
- Cowork runs the Claude Code engine, locally and in the cloud (2.1.205, 2.1.261, 2.1.268, 2.1.292). Live: the app ships a separate `claude-code-vm/2.1.293` bundle. Inference: that is Cowork's VM engine.
- The changelog says "Code tab" through 2.1.290 (October 5) and never "Claude mode" or "Code mode".

### MCP changes

- 2.1.281 is the only MCP Apps entry: resource lists "skip MCP Apps UI resources; reading one by URI still works". No entry says Claude Code renders an MCP App. [CL#2-1-281]
- Protocol 2026-07-28 became the default for stdio servers in 2.1.292. Servers "that ignore the newer protocol check" are "remembered for 7 days and connected the older way" after one slow connect. `MCP_PROTOCOL_NEGOTIATION=legacy` opts out. [CL#2-1-292]

### Other channels for "waiting on you"

- Program Status Protocol (OSC 7501, 2.1.295): terminals "can show whether Claude Code is working, waiting on you, or done". [CL#2-1-295]
- `terminalSequence` in hook output (2.1.141) emits desktop notifications and bells "without a controlling terminal". [CL#2-1-141]
- Agent view's "running, blocked on you, or done" and `claude agents --json` (2.1.139, 2.1.145). [CL]
- Built-in terminal UI competes for space: the fullscreen `/diff` panel needs "a terminal at least 110 columns wide" (Week 36), and the SendFeedback card sits "above your prompt" (Week 35). [WN-36; WN-35]
- `claude plugin eval` (Week 37) scores a plugin against a no-plugin run. "Every run … is a real model call on your account." [WN-37]

## What this repo has verified, and what is stale

### How this machine loads the inbox

- `.claude-plugin/plugin.json` has `name: "inbox"` and `types`, and no `version`. `hooks/hooks.json` is `{ "modules": ["./register.tsx"] }`.
- User settings set `env.CLAUDE_CODE_PLUGIN_DIRS` to the repo folder. `claude plugin list` shows the mod under "Session-only plugins (--plugin-dir / --plugin-url)" as `inbox@inline`, version unknown. (Live.)
- `CLAUDE_CODE_PLUGIN_DIRS` loads plugin folders "as `--plugin-dir` does, for apps you can't pass a flag to". [R#settings-and-environment-variables]
- Inference: every session on this machine, in any repo, runs the working copy and writes the real store file. That includes desktop Code-mode sessions and `claude -p` trials. No repo doc mentions this variable.
- `README.md:79-82` gives the dev loop as `claude --plugin-dir /path/to/inbox`, reloading on save. Reload on save is "on by default in interactive sessions". [ENVV] Inference: a desktop Code-mode session may not reload on save without `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`. Not verified.

### Commits that fixed client behavior

| Commit | What it changed |
|---|---|
| `05c3548` | "Turn the mod on in the desktop app's Code mode": the `session.start` and `session.attach` gate. |
| `f7536d0` | "Load the right conversation after /clear, /resume and /branch": `classic.SessionStart` with source `clear`, `resume` or `fork` calls `loadConversation`. |
| `f23d9ad` | "Load the conversation the switch names, not $.session.id()": uses `e.session_id` (`hooks/register.tsx:1977`). |

- Tests: `tests/hooks.test.ts:1032` checks that a headless start does nothing. `:1047-1064` cover a desktop attach before and after `session.start`, then mount the band on `surface: 'desktop'`.
- The desktop tests submit prompts with `origin: { kind: 'sdk' }`. That is an assumption about Code mode, not an observed value.

### Checks

- `scripts/check.sh` runs Prettier pinned to `prettier@3.9.9`, then `claude plugin validate`, then `tsc --noEmit` when `.claude-plugin/types/tsconfig.json` exists, then `claude plugin test`. The Codex checks are skipped when `codex/node_modules` is missing. Since commit `813a036` it fails when it cannot check the types or the Codex plugin.
- The type check runs against whichever engine last wrote the gitignored types. On 2026-10-08 the header read 2.1.293, 2.1.294 and 2.1.295 at different times. The local types can lag the newest release, and can lead the desktop app's engine. Inference: an API added after the desktop app's engine passes `check.sh` and fails in Code mode.
- `claude plugin update --help` says "(restart required to apply)". `README.md:22-23` and the mods overview say to run `/reload-plugins`. [O#install-or-update-a-mod]

### Repo docs that are stale

- `docs/plans/clients.md` (untracked, changing during the day) said at the time of reading:
  - The mod "never hooks `session.attach` and never reads `$.session.surfaces()`", citing `hooks/register.tsx:1885`. Commit `05c3548` changed that.
  - `isInteractive` at start and attach behavior are "Unknown" or "Not tried".
  - The app "bundles 2.1.289 and 2.1.293". The app downloads those copies outside its bundle.
  - The type check runs against types "(2.1.293)".
  - Fixed `index.d.ts` line numbers, which drift with each engine.
  - "Claude mode runs no Claude Code session". Several docs and changelog entries show Cowork sessions run the engine. See "Where sources disagree".
- `AGENTS.md`: "The plugin store is keyed by the mod's name". Live store file names are keyed by plugin id (`inbox_inline-7e8589075f50.json`).
- `AGENTS.md` and `ROADMAP.md:29` call the per-turn call a "Sonnet call". `sonnet` resolves to different models by provider. See "What the inbox's model calls cost".
- `hooks/register.tsx` comment at `:1964-1965` says "-p, the SDK and VS Code draw nothing". That matches the docs. The types give `vscode` its own element table.

### Store files (live, names only)

- `~/.claude/plugins/store/` held `inbox_inline-7e8589075f50.json` (about 70 KB, mode 600) and an older `session-inbox_inline-<hash>.json` from the mod's earlier name.
- The cap is 4 MiB. [T: `store`; R#limits]
- Inference: an install from a marketplace (`inbox@inbox`) and the dev copy (`inbox@inline`) write different files and share no state. No code migrates between them.

### New ways to start a session that the gate may miss

- `claude --bg` then `claude attach`, `claude --desktop`, `--remote-control`. [CLI]
- The types say "the terminal's attachment is the REPL's binding and raises nothing". Inference: a session started with `--bg` begins headless and may never turn the inbox on when a terminal attaches later. Not tested.
- SSH Code-mode sessions read the remote host's settings and plugins. Inference: the local `CLAUDE_CODE_PLUGIN_DIRS` does not apply there. [desktop#ssh-sessions]

## Where sources disagree

Each row names the conflict, which source to trust, and why.

| # | Conflict | Trust | Why |
|---|---|---|---|
| 1 | App naming. The docs say "Code tab" and "three tabs: Chat … Cowork … Code" [O#where-mods-run; desktop]. The app now has two modes, "Claude" and "Code" (`docs/plans/clients.md`). | The app | The docs lag the app. Read "Code tab" as Code mode. |
| 2 | Minimum version. Overview: terminal 2.1.287, desktop 2.1.286 [O#turn-mods-on-or-off]. Admin page: 2.1.286 for all [A]. The changelog first lists mods at 2.1.287 [CL]. | Overview | It is the more specific page and matches the changelog. Before 2.1.287 the early-access switch may still have gated mods. Unknown. |
| 3 | Which surfaces draw. Docs: only terminal and desktop; "`e.surface` is `terminal` or `desktop`" [O#where-mods-run; R#render-sites]. Types: `RenderSurface = 'terminal' \| 'desktop' \| 'mobile' \| 'vscode'`, each with an element table [T: `RenderSurface`]. | Docs for behavior today; types for what code must handle | The types are likely ahead of the shipped apps. A render hook typed from the types must still handle all four values. |
| 4 | Desktop exceptions. "Except elements the elements table marks terminal-only" [O#where-mods-run] leaves out the terminal-only render sites (`ToolProgress`, `TurnDuration`, `InfoNotice`) and that `Svg` is desktop-only. | Reference tables | [R#render-sites; R#elements] are the detailed lists. |
| 5 | Desktop start. The docs imply nothing special is needed in Code mode. Live, recorded in `docs/plans/clients.md:56`: while the mod gated on `isInteractive` alone, "`/inbox` and the mod's tools did not exist" in Code mode. Commit `05c3548` adds the attach paths (`hooks/register.tsx:1962-1974`). `SessionStartInput` mentions only REPL, `-p` and SDK [T]. | Live check | The failure was recorded. Which path turns the mod on, and the exact start values (`isInteractive`, `surfaces()`) were not logged. The docs never warn that an `isInteractive` gate excludes desktop. |
| 6 | Guard scope. The admin page says the guard protects "the system prompt" and managed instructions, and "Everything else is allowed" [A#know-what-happens-by-default]. The guard's source skips every user-tier hook on `prompt.compose`, `prompt.context` and `classic.*`, and refuses `tool.register` under `allowedMcpServers` [G]. | Source, for the main branch | The source is exact. Whether the shipped guard matches it is unknown. |
| 7 | Cloud sessions. `docs/plans/clients.md` lists cloud sessions among places hooks run. Hooks run there only "for a plugin that reaches the cloud session" [O#where-mods-run], which needs server-managed settings [PO]. | Docs | The inbox, installed from GitHub, does not reach cloud sessions. |
| 8 | Remote turn-off. It appears only in the built-in table and the troubleshoot messages [O; TS#check-whether-mods-can-load], not on the admin page. | Neither is complete | Whether it stops built-in mods, and how "saved off" clears in the desktop app, is undocumented. |
| 9 | Test kit. The test page lists 5 mount-handle methods and 8 matchers [TT]. The types add `findAll`, `drawn`, `key`, `pointer`, `post`, `advance`, `resize`, `describe`, `test(name,{options})` and more matchers [T]. | Types | The docs say to trust the types when they disagree [C#get-the-types-for-your-build]. |
| 10 | `session.attach`. One row in the reference events table [R#events]. The create, test and troubleshoot pages never mention it. Matcher, timing and roster are only in the types. | Types plus live checks | The desktop gate depends on it. |
| 11 | `claude plugin test` exit status. The troubleshoot page reads "no hooks module to load" as "Mods can load" [TS#check-whether-mods-can-load]. Live, that run exits 1. | Live check | Observed twice on 2026-10-08. Parse the text, not the exit status. |
| 12 | Test discovery. The reference says every `.test.ts` or `.test.tsx` under the folder [R#commands]. Live, hidden folders such as `.claude/worktrees/` are skipped. | Live check | Observed. Undocumented. |
| 13 | Installed-copy caching. Create and troubleshoot pages: installed plugins are cached by version, so edits need a version bump [C#share-your-mod]. The skill: a folder marketplace with a relative source is read in place. The plugins docs: with no `version` and a git source, the commit SHA is the version. The inbox manifest has no `version`. | Plugins docs | See "Plugins and marketplaces". Each push is a new version. |
| 14 | Where `CLAUDE_CODE_PLUGIN_DIR_WATCH` is read. Reference: "Environment" only. Skill: "set the same way" as `CLAUDE_CODE_PLUGIN_DIRS`, which may come from user settings `env`. The binary filters both names out of settings env under a condition not decoded. | Unknown | Check live. |
| 15 | Minimum version on the create page ("Use Claude Code v2.1.287 or later") versus 2.1.286 for desktop [O]. | Overview | The create page states only the terminal floor. |
| 16 | `/plugin` checks are documented for terminal sessions only. The skill says `/plugin install` is unavailable in the desktop Code tab. The create page gives no desktop way to confirm a mod loaded. | Skill plus live | Use the debug log or a probe in desktop. |
| 17 | `AGENTS.md` says "the mod does nothing under `-p`". That is the repo's gate, not a platform rule. Hooks do run under `-p` [O#where-mods-run]. | Both | They describe different things. Keep the gate. |
| 18 | Size of the types file. The skill says "about 14,000 lines". The 2.1.294 file had 15,826. | Live | The skill text is older. |
| 19 | The reference baseline is "as of v2.1.290" while the test and troubleshoot pages document 2.1.292 and 2.1.293 features. | Newer pages | The pages were updated unevenly. |
| 20 | `Svg` availability. Docs: desktop only. Types: "every remote surface" (desktop, mobile, vscode). | Both | They agree for terminal and desktop, the inbox's two drawing surfaces. |
| 21 | Element the surface lacks. Interface page: Claude Code "draws its own version of the site" [IF#build-a-tree-from-elements]. Gallery: an Svg-only pane in the terminal "opens empty" [GA#svg]. Types: "an omitted one draws a fragment". | Unknown; gallery and types agree | Check live with `Box[Text, Raster]` on desktop. Until then, branch on the surface and never rely on either fallback. |
| 22 | Desktop Link schemes. Docs: `https:` or `http://localhost` [IF#link-in-the-desktop-app]. Types: only `https:` on a remote surface. `docs/plans/clients.md` follows the docs. | Types, until checked | The types are newer and stricter. Use https links. |
| 23 | Terminal Link drawing. Gallery: URL text after the label. Types: an OSC 8 span, URL text only where the terminal lacks OSC 8. | Types | Unverified. |
| 24 | Button props. The docs omit `variant`, `role`, `hover`, and string or `Text` children. The inbox uses `variant`. Button `action` is terminal-only in the types; the docs don't say. | Types | Name the engine build when relying on them. |
| 25 | Box props. The docs omit `display`, `overflow`, `minWidth`, `flexWrap`. The inbox relies on `display="none"`. | Types | |
| 26 | Up and Down in a focused pane. Interface page: move between controls while the drawing fits. Keybindings page binds Up and Down in `Pane` and `AbovePrompt` to scroll. | Unknown | Check live. |
| 27 | `holdToasts` and keybindings are written for the terminal. Desktop behavior is undocumented. | Unknown | Check live. |
| 28 | `$.ui.notify` and Button `Text` children exist in 2.1.295 types only; not in the reference's `$.ui` list. | Types for 2.1.295 | Engines older than 2.1.295 lack them. |
| 29 | `$.store` scope. Reference: "every session on the machine shares". API page: "your plugin's own". Types: under the user's config directory. `AGENTS.md`: "keyed by the mod's name". Live: keyed by plugin id `name@source`. | Live check | The file names prove the key. `AGENTS.md` holds only while every copy is `@inline`. |
| 30 | `classic.*` input. Reference and events page: "`e` is the hook's stdin JSON". Types: `classic.PreToolUse`'s `e` is a ToolCallEnvelope. | Types | More specific. |
| 31 | `isDeferred`. API page gates `$.tool.register` `isDeferred` at 2.1.293. Reference lists `isDeferred` on `tool.describe` with no gate. | Both | Keep the `tool.describe` path, which the inbox uses. |
| 32 | `$.model.complete` system prompt. The API page doesn't mention the CLI identity block the types say is prepended. | Types | Readers of the docs alone would think only their `system` is sent. |
| 33 | `$.process.run` 4 MiB stream cap and "CLI only" are in the types only. | Types | |
| 34 | `session.end` clock. Reference: counted "from when your settings `SessionEnd` hooks finish". Types: one bound "covers every hook, its `$` waits and core". | Unknown | Measure live. |
| 35 | `docs/plans/clients.md` lines 7 and 56 say the mod "never hooks `session.attach`" and that `isOn = e.isInteractive` is set once. `hooks/register.tsx:1962-1974` now does both differently. Lines 35-37 still mark `isInteractive` and attach as unknown or not tried; line 45 and 462 say the app "bundles" engines it actually downloads; line 460 names 2.1.293 types. | Code and live checks | The plan predates commits `05c3548` and `f7536d0`. |
| 36 | `docs/plans/clients.md:362` says copy through `press.surface` is correct for a Code-mode session. Types: "a remote surface has no path yet". | Types, until checked | Desktop attaches as a remote surface. |
| 37 | Toast placement. API page: one line at the right under the prompt in the classic renderer. Types: "notification bar". | Probably the same place | |
| 38 | VS Code plugin changes. Install page: "Your changes apply to open sessions without a restart." VS Code page: the dialog shows "Restart Claude to apply plugin changes". | Unknown | Check live. |
| 39 | Plugin origins. Docs list `@marketplace`, `@inline`, `@skills-dir`, `@synced`. Types list `@<marketplace>`, `@inline`, `@builtin`. Live store files show `@builtin`. | Both, combined | Each lists part of the set. |
| 40 | `~/.claude/plugins/` layout. The docs omit `store/` (mod `$.store` files) and several other live entries (`local/`, `repos/`, `config.json`, `blocklist.json`). | Live listing | |
| 41 | Session-only listing. Docs: `claude plugin list` and `details` need the flag in the same command. Live: `CLAUDE_CODE_PLUGIN_DIRS` alone is enough. | Live check | |
| 42 | `plugin details` says it shows "the always-on tokens the plugin adds to every session". For a mod it prints 0 hooks and ~0 tokens. | Live check | It does not count mod modules. |
| 43 | Plugin env variables. Components page: exported to hook, MCP and LSP processes; manifest table gives MCP stdio only `ROOT` and `DATA`, and adds `PROJECT_DIR` for hooks. | Manifest table | More specific. |
| 44 | `disableSideloadFlags`. Org page lists six things it rejects, `CLAUDE_CODE_PLUGIN_DIRS` included. Mods admin page lists `--plugin-dir` and `--plugin-url` and adds Claude-written mods. | Both, combined | |
| 45 | Auto-update timing. Publish page: "on a delay after the session starts". Loading page: after the first message, plus up to 10 minutes. | Loading page | Most specific. |
| 46 | Synced mods. Loading page lists skills, agents, hooks, MCP and LSP for synced plugins, not mods. Admin page implies synced mods run, since `allowManagedModsOnly` refuses one an org turns on in claude.ai. | Unknown | Check live. |
| 47 | `gatingHooks` placement. Docs nest it under `contents` items. Live output also has it on `manifest`. | Live check | |
| 48 | `/plugin` in a session: the table claims "every session form" but lacks `/plugin directory` (2.1.287+). | Platform-support page | |
| 49 | README and the CLI: `README.md:22` says update then `/reload-plugins`; `claude plugin update --help` says "(restart required to apply)". The loading page says either works. | Loading page | The CLI message is the outlier. |
| 50 | `README.md:20` says "built and tested with Claude Code 2.1.292". The CLI here is 2.1.295; the desktop app has 2.1.289 and 2.1.293. | Live | The README version is stale. |
| 51 | Setup `additionalContext`. Hooks reference: discarded. Types: `Setup: 'additionalContext'`. | Unknown | Different layers; check live if needed. |
| 52 | StopFailure errors. Docs list 12 values. Types add `verification_required`. | Types | The repo handles it. |
| 53 | `scratchpad_dir` is documented from 2.1.257; the types' `BaseHookInput` lacks it. UserPromptSubmit `source` is in the types, not the docs. | Each for its own field | |
| 54 | Settings-hook and mod order. The events page states managed, then mods, then other settings hooks for `PreToolUse` only. Types state it for every classic event. | Types | Broader and specific. |
| 55 | WorktreeCreate with no path. Docs: creation fails. Types: "Left unset, the session creates its git worktree as it would unhooked". | Both | Different layers (settings output vs mod result). |
| 56 | The mods events page says settings hooks are "the command, HTTP, prompt, and agent hooks"; the hooks reference lists five types including `mcp_tool`. The hooks guide opens "Hooks are user-defined shell commands". | Hooks reference | |
| 57 | "Same hook events wherever it runs" [H]. In behavior, Setup fires only on CLI flags; `terminalSequence`, `MessageDisplay`, `permission_prompt` timing, `PermissionRequest` and `systemMessage` all differ in SDK hosts. | Event-specific sections | The events exist; what they deliver differs. |
| 58 | Hooks guide: a `PreToolUse` deny is policy "users can't bypass". A user-installed mod's `tool.check` can approve over a non-managed hook block. | Permissions page | True for permission modes only. |
| 59 | MCP description cut. MCP page: 2,048 characters for tool descriptions and server instructions. Changelog 2.1.295: 16,384 for descriptions loaded through tool search. | Changelog, for deferred descriptions | Newer. Server instructions and upfront descriptions: unknown. |
| 60 | Connector protocol default. MCP page: 2026-07-28 only where feature flags are fetched. Changelog 2.1.295: default also without flags. | Changelog | Newer. |
| 61 | 16 MB limit. MCP page lists HTTP and SSE only. Changelog 2.1.295 adds WebSocket as "the limit the other transports already have". | Changelog | |
| 62 | MCP Apps in the Code tab. Quickstart: "Claude Code … doesn't render the UI", and the platform page counts the Code tab as Claude Code. Network page: "Claude Desktop … render[s] some tool results … as interactive widgets" without naming modes. | Unknown | Check live. |
| 63 | MCP quickstart lists a "Claude Code desktop app" and a separate "Claude Desktop chat app". Desktop pages describe one app with tabs. The app now has two modes. | The app | The quickstart is outdated. |
| 64 | Oversized MCP result. MCP page: replaced "with a message". SDK page: "with an error message". | Unknown | |
| 65 | MCP connect timers. MCP page calls a 5 s cap "the standard 5-second connect timeout". Quickstart and SDK call the 30 s `MCP_TIMEOUT` the connection timeout. | SDK page | It names both timers. |
| 66 | `docs/plans/clients.md:29` says the docs don't cover which plugin parts Claude mode loads. The platform-support page does: Chat ignores hooks, mods and local MCP. | Platform-support page | |
| 67 | Cowork and Claude Code. Desktop docs say Cowork sessions run Claude Code (OTel passed "to Claude Code"; "Claude Code never fetches admin-console settings" there). `docs/plans/clients.md` says Claude mode has "No Claude Code session". | Docs, if Claude mode includes Cowork | A locally installed mod still would not load there, since Cowork plugins come from claude.ai. |
| 68 | "Desktop is interactive only" [desktop] versus a headless stream-json child (live `ps`), which the types say starts with `isInteractive: false` (types; not logged live). | Both | Different meanings: user experience versus engine flag. |
| 69 | SSH and mods. Desktop docs: SSH supports plugins. The mods table excludes only WSL. `docs/plans/clients.md` says the docs don't say whether a mod draws there. | Docs imply it draws | Neither says it outright. Check live. |
| 70 | Plugins in cloud sessions. The carry-over table and settings page: no user or repo plugin loads. The changelog describes synced plugins that load, run SessionStart hooks and connect MCP servers, and a fix for a mod's `session.receive` hook in cloud sessions. | Both | The table omits the synced path. |
| 71 | No `web` surface. claude.ai/code is a Remote Control client, but `RenderSurface` has no web value. No page says how a browser viewer attaches. | Unknown | |
| 72 | Desktop as a Remote Control viewer. The Remote Control page lists Claude Desktop as a viewer; the mods table's Remote Control row names only claude.ai and mobile. | Unknown | Whether it attaches as `desktop` decides whether the inbox turns on. |
| 73 | "Cloud sessions" vs "remote" in identifiers (`allow_remote_sessions`, `--remote`, `CLAUDE_CODE_REMOTE`, `/remote-env`). | Docs | Old names persist in identifiers. |
| 74 | Desktop session list. Sessions page: the desktop app keeps "their own session list". Live: desktop Code sessions show in `claude agents --json` and `ListAgents` and store transcripts in `~/.claude/projects`. | Live | "Own list" holds only for the resume picker. |
| 75 | Agent view vs `--json`. The TUI hides interactive sessions until backgrounded; `--json` lists "every live session". | Both | The TUI list is a subset. |
| 76 | Mod messaging. Types give mods `$.session.send` and `session.receive`; the messaging page describes only model-driven `SendMessage` and `ListAgents`. | Types | |
| 77 | `ROADMAP.md` and `docs/plans/clients.md` I15 say the store keeps each session's ledger but has no liveness. `claude agents --json` is the documented liveness source and is not mentioned in repo plans. | Docs | |
| 78 | Desktop and `-p`. Changelog 2.1.260: "`-p --resume`/`--continue` (as used by the desktop app)". Live `ps` on 2026-10-08: the app's engine runs with stream-json flags and no `-p`. | Live | Matters for the `--bare` default flip. |
| 79 | Installed plugins in SDK sessions. SDK plugins page implies a CLI-installed plugin must be passed by path. Headless page: `-p` loads installed plugins unless `--bare`. The `settingSources` table never lists installed plugins. Mods overview: hooks run in the Agent SDK. | Unknown | Live check in "Unknown". |
| 80 | `--bare` and `--plugin-dir` mods. Headless page: `--bare` still loads `--plugin-dir`. Mods overview and create page: `--bare` stops mods. Refusal message names only "installed plugins that are not managed". | Unknown | Inference: an `@inline` hooks module may still load. |
| 81 | `system/init` plugin `version`. TS SDK changelog 0.3.214 says entries include it. The TS reference type shows only `name` and `path`. | Changelog | Check at runtime. |
| 82 | SDK `capabilities` table lists four values. The same page requires `mcp_read_resource_v1` and `mcp_tool_ui_meta_v1`. | Page body | The table is stale. |
| 83 | SDK plugins page omits mods, hooks modules, `skipMcpDiscovery` and `pluginDelivery: 'initialize'` (TS changelog 0.3.261, also absent from the TS reference). | Changelog and types | The page is incomplete. |
| 84 | Desktop as an SDK host. SDK pages never say so; only the changelog does (2.1.208, 2.1.260, 2.1.280, 2.1.282). The mods table marks "`claude -p` and the Agent SDK" as drawing nothing and the Code tab as drawing. | Both | The difference is the `ui_attach` surface declaration, described only in the types. |
| 85 | `--bare` skip list. headless#examples names "hooks, plugins, auto memory, or `CLAUDE.md`". #start-faster-with-bare-mode adds skills, commands, subagents and MCP servers. | Fuller list | Incomplete, not contradictory. |
| 86 | Types on `vscode`. `Mounted` says the `vscode` tables "lack `Input` and `Client`". The `vscode` element table includes `Input`. Seen in 2.1.294 and 2.1.295 types. | Unknown | One of the two is stale. |
| 87 | Desktop mode names, third source. claude-apps-gateway: Desktop "runs its Cowork and Code tabs, plus the Chat tab when you enable it, on embedded Claude Code sessions". `docs/plans/clients.md`: "Claude mode runs no Claude Code session". | Unknown | Conflict holds at least for gateway builds. |
| 88 | Artifacts page vs live tool. Page: "Single page: Relative links do not resolve" and "No backend: An artifact is a static page". Live `Artifact` tool: multi-file `files`, a per-artifact database, viewer identity, "depending on what is enabled for this person". | Live tool, per account | |
| 89 | Artifact surfaces. Page names "Claude Code CLI, or the Claude desktop app". Changelog 2.1.268 adjusts "[VSCode] … artifact permission prompts" and gives Cowork the Artifact tool. | Changelog | The page omits VS Code and Cowork. |
| 90 | Artifact surface version. "Requires Claude Code v2.1.281 or later" sits after the remote-control sentence. Unclear whether it covers all artifacts. | Unknown | Inference: remote-control only, since `/artifacts` needs 2.1.208. |
| 91 | JetBrains panel. JetBrains page describes only the terminal CLI. Changelog 2.1.281 says "VS Code and JetBrains panels". | Unknown | Matters because the mods table promises drawing for "the JetBrains plugin". |
| 92 | Remote Control hosts. Platforms page: "CLI, Desktop, or VS Code". Changelog 2.1.273 mentions Remote Control "attached to a … JetBrains session". | Changelog | JetBrains is the CLI, so it is covered in practice. |
| 93 | Status line and mods. The status line page describes one user-set line. The mods interface map shows mods adding "a status line under the prompt" (`$.ui.status`). Neither page mentions the other. | Unknown | How the two share a row is not documented. |
| 94 | `clients.md` vs code. `docs/plans/clients.md` says the mod "never hooks `session.attach` and never reads `$.session.surfaces()`" and sets `isOn` once at start. Commit `05c3548` does both (`hooks/register.tsx:1962-1974`). | Code | The plan text is stale. It also names types version 2.1.293 and fixed `index.d.ts` line numbers, which drift. |
| 95 | The SDK `readMcpResource()` is "*Alpha.*" on the TS reference. The MCP Apps pages describe the `ui://` flow as stable for hosts. | Both | Different products: SDK API status, not the protocol. |
| 96 | Host allow rules. permissions#settings-precedence: hosts can supply managed policy "including permission allow rules unless the admin sets the `allowManaged*Only` locks". settings-reference#parentsettingsbehavior: host settings apply "still filtered to restrictive values". | Unknown | Allow rules are not restrictive. |
| 97 | `CLAUDE_CODE_PLUGIN_DIR_WATCH`. mods/reference documents only `1`. env-vars also documents `0` (off everywhere). | env-vars | The reference is incomplete. |
| 98 | Undocumented variables. `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_PLUGIN_DATA` are set live and have no env-vars row. `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is named in mods/admin only. | Live | |
| 99 | `strictPluginOnlyCustomization.hooks` "keeps running plugin hooks" and never mentions mods. | Unknown | |
| 100 | `prependPlugins` scope. settings-reference: managed lists skip a plugin that isn't the org's. mods/admin says without qualification that a cache-copied plugin's mod is skipped. | Unknown | Whether a user's own list on an unmanaged machine can name `inbox@inbox` is not stated. |
| 101 | `tool.check` power. Types: "A hook may answer any verdict in either direction". Docs: deny rules hold over a mod on managed or Team/Enterprise machines. | Both | The engine allows; the guard enforces. Reading only the types misleads. |
| 102 | Blocked model. Types: `$.model.complete` rejects. model-config: a background request naming a `deniedModels` model "runs on the session's model instead". Allowlists and org restrictions substitute "the newest version of the family". | Unknown | Handle all three. |
| 103 | Cache lifetime. costs: the lifetime "is an hour on a subscription". prompt-caching: the "everything else" bucket gets five minutes. Types: mod marks last five minutes. | prompt-caching and types | costs describes only the main conversation. |
| 104 | Plugin cost tools. plugins/measure: hooks have "no model context cost". Live `plugin details inbox`: ~0 tokens. The mod adds about 1,350 tokens per request and a per-turn call (`README.md:67`). | README measurement | The measure page does not cover mods. |
| 105 | "Always uses Sonnet" (`ROADMAP.md:29`, AGENTS.md "Sonnet call"). The alias moves by provider, version, env var and allowlist. | model-config | Repo measurements are not dated by model. |
| 106 | AGENTS.md test recipe vs the shipped call. The recipe runs `claude -p --model sonnet`, a main-conversation request (1h cache on a subscription, default `medium` effort). The shipped call uses `effort: 'low'`, `maxTokens: 1600` and five-minute marks. | Code | Trials do not reproduce the shipped cost or behavior exactly. |
| 107 | Content-flag fallback. model-config: a flagged Sonnet 5.5 request re-runs on Sonnet 5 by default, and subagents always re-run. The types say nothing for `$.model.complete`. | Unknown | |
| 108 | Doc examples use older models: costs shows `claude-sonnet-4-6`; monitoring-usage shows `claude-sonnet-5`. | model-config | Cosmetic. |
| 109 | What's-new stops at Week 37 (v2.1.269). The changelog runs to 2.1.295. No digest covers the mods launch. | Changelog | The digests are about four weeks behind. |
| 110 | `keybindingFlavor`. Week 34 says to set it to `'readline'`. Week 36 says it "no longer has any effect". | Week 36 | Week 34 is stale. |
| 111 | The local types lag the release. They were written by 2.1.294 at the last check and lack `$.ui.notify` and full `Button` children (2.1.295). | Changelog | The type check cannot see the newest APIs. |
| 112 | `$.ui.copy` inside the types. The `$.ui.copy` doc says "a remote surface has no path yet". The `ui.copy` event type says that on a remote surface `isCopied: true` "means the remote app wrote its own clipboard", with reasons `no-surface`, `no-clipboard`, `refused`. | Unknown | One of the two is stale. Check live. |
| 113 | `Raster` inside the types. One comment says "elsewhere a fragment"; another says "On a surface whose table lacks it the tree is refused". | Unknown | Avoid `Raster` outside the terminal. |
| 114 | Hook budget. Types: the budget "stands still while a `next` or `$` call of the hook's is in flight", in one place with no exception and in another with "a `$.clock` wait excepted". Docs: waits don't count "other than `$.clock.sleep`". | Docs | `$.clock.sleep` counts. |
| 115 | `Input` and `Select` reach. Types: "every surface but mobile today". Docs: "Terminal, Desktop". | Docs for today | Same split as row 3. |
| 116 | The desktop start state. Docs never say `isInteractive` is false and `surface` null at `session.start` in Code mode. The docs' test example shows only `{ surface: 'terminal', isInteractive: true }`. | Types | That gap caused the gate bug fixed in commit `05c3548`. |
| 117 | Pane placement on desktop. Docs cover only the terminal's 144/110-column floors. Types add `isPlaced: false` for "an older desktop" that places no panes, and `viewport.isFullscreen` as the remote signal. | Types | |
| 118 | Undocumented type features: `PromptHint.tail`, `Svg.isInteractive`, `session.receive` GitHub events (`pull_request.*`, `check_suite`), `Button` `variant` and `role`, `MessageDisplay`, the `PromptOrigin` kind list, `nothing-to-fork`. | Types | The docs reference is "as of v2.1.290". |
| 119 | Updating. `claude plugin update --help`: "(restart required to apply)". `README.md:22-23` and the mods overview: run `/reload-plugins` in an open session. | Mods overview | The help text is broader than mods need. |

## Unknown, and how to check

| # | Question | Live check |
|---|---|---|
| 1 | In Code mode, does `session.attach` with `surface: 'desktop'` always fire, and before or after `session.start`? | In a Code-mode session, log `$.session.surfaces()` at start and at each attach and detach. Cover a new session, `/resume`, and `claude --desktop --continue`. |
| 2 | What does `/plugin` show in Code mode: the `mods active` line, the Built-in list, `/reload-plugins`? | Open `/plugin` in a live Code-mode session. |
| 3 | Does the mobile app or claude.ai Remote Control attach as `mobile`, and does it draw a band or pane? | Start Remote Control from a terminal session with a probe mod that logs `session.attach` and draws `AbovePrompt`. Open the session on a phone. |
| 4 | Does the VS Code extension attach as `vscode` and draw anything? | Same probe in the VS Code chat panel. Log `$.session.surfaces()` and `e.isInteractive`. |
| 5 | Do desktop SSH sessions load plugins and draw? | Code mode with an SSH environment. Read `/status` and a probe log. |
| 6 | Which engine does the desktop app use now, and how far does it trail the CLI? | `/status` in Code mode. Log `$.session.version()` to the debug log. |
| 7 | Does remote turn-off stop built-in mods or the desktop engine separately? How does "saved off" clear there? | Run `claude plugin test` with the desktop app's engine binary. |
| 8 | Does the shipped guard match its main-branch source? Does GUIDANCE reach the system prompt, does the carry block reach Claude, does `classic.SessionStart` fire after `/clear`, does a `Read` deny rule beat the inbox's allow, do the tools fail to register with `allowedMcpServers` set? | On a test machine, add a managed-settings file, run `claude --debug`, and probe each one. Ask Claude to quote the `inbox:guidance` section. |
| 9 | How does the inbox's band share `AbovePrompt` with `cc-plugin-you-should-know` and other mods' bands? Is `maxRows` split? | Enable both and inspect. |
| 10 | Does a server-managed `enabledPlugins` entry install the inbox in an Anthropic-hosted cloud session? | Test org. Even if it installs, nothing draws, so the gate should keep the mod off. |
| 11 | Under `allowManagedModsOnly`, do the inbox's tools and `/inbox` go away? | Managed-settings test file plus `claude --debug`. |
| 12 | Is `e.isInteractive` ever true in Code mode, for example after `/desktop` hands off a live terminal session? | Run `/desktop` from a terminal session with the mod loaded and log the start event. |
| 13 | Rollout switch default under a third-party provider or gateway. Does it gate folder-loaded mods or only installed ones? | Fresh `CLAUDE_CONFIG_DIR`, no GrowthBook cache: `CLAUDE_CODE_USE_BEDROCK=1 claude plugin test` in an empty folder; repeat with `ANTHROPIC_BASE_URL=<gateway>`. Then `claude --debug-file <log> --plugin-dir <repo>` and grep "rollout flag" and "hooks module inbox". |
| 14 | Does `claude plugin test` need a saved rollout value or the network on a cold CI box? The binary has "the rollout switch was fetched, but its value could not be saved for the test files to read". | Run it in a container or fresh `CLAUDE_CONFIG_DIR` with the network blocked. |
| 15 | Where desktop failure lines show. Does the app render `ui_log` messages? How do you get a debug log for the desktop engine? | Set `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, save a throwing hook, watch the app and `~/.claude/debug/`. |
| 16 | Does `CLAUDE_CODE_PLUGIN_DIR_WATCH` work from user settings `env`? | Set it only there and watch for a reload in desktop. |
| 17 | With `--plugin-dir <repo>` and the installed `inbox` both enabled, which loads? Is `$.store` shared? | `--debug-file`, grep "another plugin of that name", list `~/.claude/plugins/store/`. |
| 18 | Does a save outside `hooks/` reload the mod? Does the protected-path rule cover the whole repo? | `--plugin-dir <repo>`, touch `docs/x.md`, look for the reload line. Ask Claude to edit a doc in `acceptEdits` and see whether it prompts. |
| 19 | Does a worker restart fire `session.attach` again for desktop? Is a `$.prompt.submit` started from `session.attach` de-duplicated? | Needs a forced crash. Look for a respawn helper in the testing types. |
| 20 | Do toasts work in desktop, and with what limits? | Probe mod in Code mode. |
| 21 | When the desktop app updates its engine, does an open session keep the old one? | `/status` in Code mode before and after an app update. |
| 22 | Does the hot-reload approval prompt for Claude-written mods appear in desktop? | Ask Claude for a mod in Code mode. |
| 23 | Where does desktop place a pane? Does `placement` read `dock`? What are `bodyColumns`, `maxRows` and `viewport.isFullscreen` there? Does a pane the mod opens unasked wait for width? | In Code mode, log `e.props` and `e.viewport` from the Pane and AbovePrompt hooks to the debug log. Call `$.ui.open` from a timer and record `isPlaced`. |
| 24 | Does desktop honor hotkeys on Buttons inside `<Box display="none">`? How does it draw `plain` Buttons labeled `": Label"`? | Open `/inbox` in Code mode, screenshot it, press j, k and a row key with the pane focused. |
| 25 | How does a desktop pane or band get focus: click only, or ctrl+x tab and `focus: true` too? Do digit band hotkeys from an empty prompt work? | Try each in Code mode. |
| 26 | Does desktop read `keybindings.json`? | Rebind `pane:close` and try it in Code mode. |
| 27 | Desktop Link rule: https only, or `http://localhost` too? | Draw both in a Code-mode pane; see which is a live anchor. |
| 28 | Does desktop apply `holdToasts`, show `$.ui.toast` and `$.ui.status`, and draw the band's `[-]`? | Pane with `holdToasts` in Code mode, toast from a timer. |
| 29 | Real redraw rate on desktop. | `$.clock.every(16)` with invalidate; count renders per second per surface. |
| 30 | How desktop draws `variant="primary"` and `role="dismiss"`. | Sample Button in Code mode. |
| 31 | With a terminal and desktop attached to one session, which surface fires `onPress`? Do both draw the band at once? | Attach the app to a terminal session, press in each, log `e.surface` and render counts. |
| 32 | Minimum engine for `Client` on desktop, the desktop Link rules, Button `variant`, Button `Text` children, `$.ui.notify`. | Save each build's `index.d.ts` outside the gitignored path and diff them. |
| 33 | What `origin.kind` does a prompt typed in desktop Code mode carry? If it is `sdk`, the inbox ignores it as the person's words (`hooks/register.tsx:2025`). | Log `e.origin` from `prompt.submit` to the debug log in a Code-mode session. |
| 34 | Does `$.ui.copy` work on desktop? | Press a copy button in Code mode; read the toast or `isCopied`. |
| 35 | Do `$.prompt.fill`, `suggest`, `read`, `$.ui.selection` and `$.ui.ask` work in Code mode? | A temporary command that calls each and logs results, in a session with its own `CLAUDE_CONFIG_DIR`. |
| 36 | Does `$.process.run` work in Code mode? | Probe command that runs `git --version`. |
| 37 | Does the desktop app use `~/.claude` (the same store file)? | Compare the store file's modification time after a Code-mode session. File stats only. |
| 38 | Is the inbox's `systemText` above Sonnet's minimum cacheable length? | Log `usage.cache_creation_input_tokens` and `cache_read_input_tokens` from two calls less than 5 minutes apart. |
| 39 | Does `session.detach` with reason `end` fire for desktop, and how much of the 1.5 s bound do the inbox's end hooks use? | Debug-log timing at the end of a Code-mode session. |
| 40 | Does the engine in desktop Code mode honor `cache: true` blocks (2.1.289)? | Same cache-count probe on the desktop engine. |
| 41 | Does `$.store` move with the plugin's origin? What does the hash cover? Does uninstall delete it? | With its own `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_DIRS` unset, install `inbox@inbox`, start a session, list `plugins/store/`. Uninstall and list again. |
| 42 | Do `$.tool.register` tools trip the "This reload changes MCP tools" `--force` gate on install or `/reload-plugins`? | Install fresh in a session that already had a turn; read the install summary. |
| 43 | Do synced (`@synced`) plugins load `modules`, in the terminal and in Cowork? | Upload a tiny mod to claude.ai, start `claude --debug`, grep `hooks module <name>@synced`. |
| 44 | Does Cowork or Claude mode run `modules` at all? | Upload the plugin zip to claude.ai, open a local Cowork task, look for a `$.store` write timestamp. |
| 45 | Do the desktop app and the terminal share the plugin cache and `installed_plugins.json`? | Install from the terminal, compare version and path in desktop Manage plugins. |
| 46 | Can a desktop Code-mode user add a marketplace without a terminal? | Look for an add-marketplace control on a clean profile. Check whether a marketplace added in Claude mode's Customize shows in Code mode. |
| 47 | For a relative-path entry, is the version the repo HEAD SHA or the last commit touching the folder? | Local git marketplace with a subfolder entry; commit outside it; `claude plugin update`; compare versions. |
| 48 | What happens to a loaded mod when an update replaces its cache folder mid-session? | Update while a session runs; watch the debug log and whether `/inbox` still works before `/reload-plugins`. |
| 49 | Does `claude plugin update inbox` without `@inbox` work? | Run it and read the exit code and message. |
| 50 | Does background auto-update run in a desktop Code session? | Enable auto-update, push a commit, check a desktop-only user. |
| 51 | Do `userConfig` values reach `register(on, options)` in Code mode? Do `/config` rows show? Can `inbox@inline` be configured with `/plugin configure`? | Scratch mod with an option that has a default; log `options`; run `/config` in Code mode. |
| 52 | Does `/reload-plugins` typed in Code mode reload mod modules? Do monitors start there? | Edit a visible string, type `/reload-plugins`, watch the band. Scratch monitor that prints once. |
| 53 | Does project scope with `extraKnownMarketplaces` load the inbox for a collaborator with no install? | Test repo with those settings, clean `CLAUDE_CONFIG_DIR`, accept trust, check the mod loads. |
| 54 | Does `validate --strict` fail on gating hooks without `.catch`? | `claude plugin validate --strict --json` on a scratch copy with version, author and description set. |
| 55 | Do `disableAllHooks` and `allowManagedHooksOnly` in user settings stop the mod's `classic.*` dispatch too? | Session with its own `CLAUDE_CONFIG_DIR`, `--settings '{"disableAllHooks": true}'`; see whether the band draws and `classic.Stop` runs. |
| 56 | Can one `hooks/hooks.json` carry both `modules` and `hooks`? Does `/hooks` list mod hooks? | `claude plugin validate` on a copy with an added `hooks` key; open `/hooks`. |
| 57 | Does the 10,000-character cap apply to mod-injected context? | Inject 12,000 characters from a scratch mod; inspect what Claude receives. |
| 58 | How does a mod's `classic.Stop` `block` render versus `additionalContext`, in the terminal and Code mode? | Scratch mod returning each. |
| 59 | What do `classic.*` events carry in Code mode, and does `SessionStart` fire before or after `session.attach`? | Log `e` from `classic.SessionStart`, `classic.UserPromptSubmit`, `classic.Stop` in Code mode. |
| 60 | Do project settings hooks run in Code mode without a trust prompt? Does the desktop app register SDK callback hooks? | Fresh untrusted folder with a `.claude/settings.json` SessionStart hook that writes a file. |
| 61 | Does `PermissionRequest` reach mods for sandbox network prompts, and does it fire in Code mode before the app's dialog answers? | Sandboxed `curl` with the mod logging `classic.PermissionRequest` and `classic.Notification`. |
| 62 | Can the pane answer AskUserQuestion through `updatedInput`, in the terminal and Code mode? | Scratch mod that answers a known question. |
| 63 | Does desktop Code mode render MCP Apps? Does claude.ai/code? | Add an example MCP App server to `claude_desktop_config.json`; ask for it in Claude mode and in a Code-mode session. |
| 64 | Does Claude Code hide `visibility: ['app']` tools from the model? Does Claude chat declare the MCP Apps UI extension at `initialize`? | Point `claude --mcp-config` at the Codex server; look for `inbox_view` in `/mcp` and stream-json `system/init.tools`. Log `initialize` params from a stdio test server. |
| 65 | Do a mod tool and a configured server both named `inbox` collide? | Add a stdio server keyed `inbox` while the mod is loaded; run `/mcp`. |
| 66 | Which description limits apply after 2.1.295, and do any apply to mod tools? | Compare `/context` for a long `$.tool.register` description, a long `alwaysLoad` tool and long server instructions. |
| 67 | What does the desktop app pass in `options.mcpServers`? Is an inbox server missing on the first turn without `alwaysLoad`? | Call an inbox tool on the first turn of a Code session, with and without `alwaysLoad`. |
| 68 | Which session or conversation id, if any, do Claude hosts pass to an MCP server or app? | Log `_meta` on `tools/call` and the App's `hostContext` in desktop chat and Code mode. |
| 69 | Does Claude mode run a Claude Code session that loads local plugins or mods? | Start a Claude-mode task; run `ps -axww -o pid,ppid,args` filtered for `claude-code/`; read `--setting-sources`. Redact paths and ids. |
| 70 | Does the app attach to scheduled-task, Dispatch and project sessions, and to sessions nobody has open? | Logging mod copy; local scheduled task; compare `surfaces()`. |
| 71 | Does the app detach when a session is archived, closed or the app quits? Does archiving fire `session.end`? | Log `session.detach` and `session.end` reasons. |
| 72 | How does a mid-turn correction, a `/btw` side chat, or a mid-turn command reach the mod? | Logging mod in Code mode. |
| 73 | Does the mod draw in SSH sessions, and where does its `$.store` live? | SSH session to a Linux VM with the plugin installed on the remote host. |
| 74 | Where do mod `Link` clicks open in the app, and where does a mod pane dock? Does Cmd+\ close it? Do mod hotkeys collide with app shortcuts? | Click a PR link in the inbox pane; try the keys in Code mode. |
| 75 | Does `/inbox` appear in the app's `/` menu? | Type `/` in Code mode. |
| 76 | Can a mod or the inbox model call the app's `mcp__ccd_*` tools, such as `spawn_task`? | `/mcp` in Code mode. |
| 77 | Does the app keep old engine folders for sessions started before an update? Which engine does a new session use? | List `~/Library/Application Support/Claude/claude-code/` across an update; `/status` in old and new sessions. |
| 78 | Does `claude://code/new?q=…` work without SSH parameters? | `open "claude://code/new?q=test"` on macOS. |
| 79 | Does a phone or web viewer of a Remote Control session see the band or pane? What surface does a browser attach as? | `claude --rc` with the inbox on; open on phone and claude.ai/code; log `session.attach` and any `ui.render` with `e.surface === 'mobile'`. |
| 80 | Server mode: is `isInteractive` false? Does a desktop viewer attach as `desktop` and turn the mod on? | Start `claude remote-control`; connect from the phone, then from the desktop app; log `session.attach` and `surfaces()`; check for a new `s:<id>` key. |
| 81 | Does `/inbox` typed from mobile or web run, and does its reply arrive there? | Type `/inbox` from the phone in a `--rc` session. |
| 82 | Does `$.ui.notify` or the push tool from a mod reach the phone? | Call `$.ui.notify` from a test mod with push enabled. |
| 83 | In a cloud session with a synced test plugin: what do `isInteractive`, `surface`, `surfaces()` report? Where does `$.store` live, and does it survive a reclaim? Does `session.start` fire again after a pause? | Synced test plugin that logs to a file; ask Claude to `cat` it. |
| 84 | Does `/clear` sent from the phone in a `--rc` session raise the events the inbox reloads on? | Log session events. |
| 85 | Does "Connect new sessions to Remote Control" in the desktop app make every Code session visible on the phone? | Check in the app. |
| 86 | Does the mod turn on in a background session, and does it draw when attached? Does an unattended background session run the per-turn call? | `claude --bg "say hi"`, `claude attach <id>`, run `/inbox`; log `isInteractive` and `surfaces()`. |
| 87 | Does a `{ consumed }` delivery start a turn or cost tokens? Do `SendMessage` deny rules block `$.session.send`? | Two throwaway sessions under their own `CLAUDE_CONFIG_DIR`; compare `/cost`. |
| 88 | Does `claude agents --json` start the supervisor, and how fast is it? Does an interactive or desktop session waiting on a permission show `waitingFor`? | `claude daemon status` before and after; time the call; hold a prompt and read `--json`. |
| 89 | After `←` or `/bg`, does the process keep the same session id, and does `classic.SessionStart` fire with `resume`? | Compare `$.session.id()` before with `--json` `sessionId` after. |
| 90 | Is the `ListAgents` listing scoped by `CLAUDE_CONFIG_DIR`? | Run `/list-agents` in sessions under two config dirs. |
| 91 | Do installed plugins, and so installed mods, load in a default `query()` with no `plugins` option? | In a test `CLAUDE_CONFIG_DIR` with the inbox installed, run `query({ prompt: "hi" })` and read `init.plugins`. |
| 92 | Does a `--plugin-dir` hooks module run under `--bare`? | `claude --bare -p "/inbox" --plugin-dir <copy> --output-format stream-json --verbose` on a copy patched to turn on. Read `init.plugins`, `plugin_errors` and stderr. |
| 93 | Will `--bare` becoming the `-p` default affect desktop Code-mode sessions? | Watch the changelog for the flip. Read the app engine's launch flags with `ps` after it. |
| 94 | What does a host send to attach a drawing surface (`ui_attach`), and can a third-party SDK host send it? | Search the `@anthropic-ai/claude-agent-sdk` package's `.d.ts` files for `ui_attach` and `surface`. |
| 95 | Does the desktop app end a session with SIGTERM or by closing stdin? Does the inbox's `session.end` work finish within 1.5 s there? | Close a Code-mode session after a turn. Check whether the `s:<sessionId>` record and the cleared sidebar status were written. |
| 96 | Does `init.plugins` carry `version` at runtime? | `claude -p hi --output-format stream-json --verbose --plugin-dir <copy>` and read the first `system/init` line. |
| 97 | Does the `statusLine` setting render in Code mode, the VS Code panel or mobile? | Set a trivial `statusLine` command that writes a timestamp to a file. Open a session on each surface. |
| 98 | Does a JetBrains chat panel exist, and do mods draw there? | Install the current JetBrains plugin and look for a non-terminal UI. Log `session.attach` there. |
| 99 | Is `session.receive` with `source: "artifact-room"` shipped in 2.1.295? Which page actions produce room events? | On a 2.1.295 terminal session, log `session.receive` events. Publish a throwaway page whose script writes room events. |
| 100 | Can a mod publish an artifact without a model turn? | Search the current types and mods docs for a publish API. Today only the model's `Artifact` tool publishes. |
| 101 | Does a mod-started turn count as "a prompt you type" for the no-prompt artifact publish rule? | Have a test mod submit a prompt with `asUser` that asks for a publish, and watch for a permission prompt. |
| 102 | Is the status line's `session_id` the same id the mod uses for `s:<id>`, across `/clear` and `/resume`? | Echo `session_id` from a status-line script and compare it with `$.session.id()`. |
| 103 | When one conversation is open in the VS Code panel and a terminal, do both inbox instances run the per-turn update, and which write wins? | Open one conversation in both with **Open here anyway**, send one prompt, and compare the saved record. |
| 104 | What widths do JetBrains and VS Code integrated terminals usually have? | Read `bodyColumns` in a render hook at default layouts. |
| 105 | Which engine wrote the local types file, and which version should the type check pin? | Read `index.d.ts:1` before each check run. Record it with the result. |
| 106 | Does host-supplied desktop policy count as "managed settings" and seat the guard for a Pro user in Code mode? | In a Code-mode session, look for `cc-plugin-sec-default` in the debug log and read "Setting sources" in `/status`. |
| 107 | What is `CLAUDE_CODE_ENTRYPOINT` in Code mode, the VS Code panel and the SDK? Can a mod read it with `$.env.get`? | `echo $CLAUDE_CODE_ENTRYPOINT` from Bash in each, plus a temporary `$.env.get` log in a copy. |
| 108 | Does the mod trust gate apply in Code mode, which never shows the trust dialog? | Open a Code-mode session in a never-trusted folder and see whether the band appears. |
| 109 | Can a project's settings `env` set `CLAUDE_CODE_PLUGIN_DIRS`? | Put it in a test repo's `.claude/settings.json`, trust the folder, and check `/plugin` and the debug log. |
| 110 | Is `$.model.complete` refused under `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`? | Run a patched copy under `-p` with the variable set, and watch for the per-turn call. |
| 111 | Does `/cd` into a repo with `disableAllHooks` stop the inbox mid-session? | `/cd` into such a repo and check whether the band stays. |
| 112 | Does `CLAUDE_CODE_PLUGIN_DIR_WATCH` cover folders loaded through `CLAUDE_CODE_PLUGIN_DIRS`? | Edit a file in a mod loaded that way and watch the debug log for a reload. |
| 113 | Do mod calls count against plan limits, and do they show in `/usage`? | On a subscription, read `five_hour` `percentUsed`, force several large `$.model.complete` calls, and read it again. Look for an inbox row in `/usage`. |
| 114 | Which cache lifetime do mod marks get, and can a mod get one hour? | Make one call, wait 6-10 minutes, repeat. A cache read means one hour. Try `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`. |
| 115 | Which `query_source` do mod calls carry in OTel, and which model answers? | Run with `OTEL_LOG_RAW_API_BODIES=file:<dir>` and read `<dir>/index.jsonl`. |
| 116 | Does a blocked `sonnet` reject, run on the session's model, or substitute an older Sonnet? | In a scratch `CLAUDE_CONFIG_DIR`, set `deniedModels`, then `availableModels`, and call `$.model.complete({ model: 'sonnet' })`. Read the raw-bodies index. |
| 117 | Does thinking count against `maxTokens: 1600` at `effort: 'low'`? | Log `r.usage.output_tokens` across many turns and look for replies cut at the cap. |
| 118 | What does a content-flagged `$.model.complete` resolve to? | In a test repo, send a prompt known to trip the cyber classifier. |
| 119 | Does the desktop app set `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` or its own model configuration, changing what `sonnet` means in Code mode? | Run a Code-mode session with raw-body logging and read `model` for the inbox's request. |
| 120 | Is the CLI identity block before `request.system` the same across directories, so sessions share the cache? | Run two sessions in different repos within 5 minutes. The second's first call should read the cache. |
| 121 | Does registering the inbox's tools mid-session invalidate the main conversation's cache? | Hot-reload the mod in a long session, then read `Prompt cache (main)` in `/usage` for "likely cause: tool definitions changed". |
| 122 | Does the per-turn prompt land in local transcripts? | Grep the session's JSONL for a unique string from `buildPrompt`. |
| 123 | When did `tool.describe` gain `isDeferred`, and is it honored before 2.1.293? | Check `/context` or the tool list in a 2.1.292 session. |
| 124 | Can a mod's pane pop out into its own desktop window? | Try it in Code mode with the inbox pane open. |
| 125 | Is the mods rollout switch served on telemetry-off, Bedrock, Vertex or Foundry installs? | Run the inbox with telemetry off and read the refusal line. |
| 126 | Does `$.ui.notify` work in the desktop app, and does it do nothing when an API key is set? | Try it on 2.1.295 in the terminal, then in Code mode once the app bundles 2.1.295. |
| 127 | Does a desktop warm start delay `session.start` relative to opening a session? | Log a timestamp at `session.start` and at the first `ui.render` in Code mode. |
| 128 | Could OSC 7501 or the `claude agents --json` `state` field replace part of the inbox's "waiting on you" detection? | Compare `state` values with the inbox's open items across a few sessions. |
| 129 | When is `prompt.context` asked again? The types cache its answer for the session until `$.ui.invalidate`. If the mod turns on late at `session.attach`, does the first message go out without the `inbox:` block? | Log each `prompt.context` call across `/clear`, `/resume` and a Code-mode start. |
| 130 | Does a slow `publishStatus` (`$.process.run` with a 5,000 ms timeout) inside `session.end` cut the hook before the `/clear` and `/resume` reset runs? | Log `next.budget` at the start of `session.end` during `/clear`, with `herdr` slowed. |
| 131 | After the app detaches, does the headless process keep running, so the inbox's poll and tick loops keep going? Should the mod hook `session.detach`? | Close the window or switch sessions; log `session.detach` and check whether ticks continue. |
| 132 | Can a local session receive `session.receive` GitHub events, or only relay-backed sessions? | Subscribe a PR in a local session and log `session.receive`. |
| 133 | Does the inbox turn on in a `claude --bg` session later opened with `claude attach`, or in one opened with `--desktop` or `--remote-control`? | Start each way with a logging copy and check whether the band draws. |
| 134 | Does a desktop Code-mode session reload the mod on save without `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`? | Edit a file in the working copy during a Code-mode session and watch for the reload line. |
| 135 | Can `plugin.json` declare a minimum engine version? | Neither the mods reference "Files" table nor `claude plugin validate --help` names one. Ask the platform team, or search the manifest schema. |

## Sources

Every page was read on 2026-10-08. Page URLs below were checked to resolve that day. Unless noted, `…` stands for `https://code.claude.com/docs/en/`.

### Mods

| Key | URL | What it covers |
|---|---|---|
| O | …/plugins/mods/overview | What a mod is, where mods run and draw, version floors, turning mods off, built-in mods |
| A | …/plugins/mods/admin | The guard, managed policy for mods, what counts as an organization's mod, policy mods |
| R | …/plugins/mods/reference | Files, events table, `$` methods, elements, render sites, limits, settings and env vars ("as of v2.1.290") |
| E | …/plugins/mods/events | How a hook handles an event, `classic.*` events |
| IF | …/plugins/mods/interface | Panes, bands, width rules, desktop `Link` rules, keeping state, saving from several sessions |
| API | …/plugins/mods/api | Calling a model, files, processes and network, registering commands and tools, `isDeferred` |
| GA | …/plugins/mods/gallery | Element examples |
| C | …/plugins/mods/create | Tutorial, hot reload, Claude-written mods and the enable question |
| TT | …/plugins/mods/test | `claude plugin test` and the testing kit |
| TS | …/plugins/mods/troubleshoot | Refusal messages, where error lines go, the rollout switch |
| G | https://github.com/anthropics/claude-code/tree/main/mods/sec-default | The built-in guard's public source (`hooks/register.ts`, `README.md` "The rows"), read at commit `684800b` |
| T | `.claude-plugin/types/claude-code/index.d.ts` (local, gitignored) | Engine types written by the engine that last loaded the mod. Cited by symbol. |
| skill | The built-in `cc-plugin-plugin-authoring` skill text (local) | How Claude writes and loads mods |

### Hooks, settings and permissions

| Key | URL | What it covers |
|---|---|---|
| H | …/hooks | Settings-hook events, inputs, outputs, timeouts, context injection, workspace trust |
| HG | …/hooks-guide | Hook recipes, notification timing in SDK hosts |
| P | …/permissions | Rule order, mods and deny rules, trust, what runs before trust |
| SET | …/settings | Settings files and cloud sessions |
| SETR | …/settings-reference | Every settings key, including `disableAllHooks`, `allowManagedHooksOnly`, `enabledPlugins`, `prependPlugins`, `parentSettingsBehavior` |
| ENVV | …/env-vars | Environment variables, including `CLAUDE_CODE_PLUGIN_DIRS`, `CLAUDE_CODE_PLUGIN_DIR_WATCH`, `CLAUDE_CODE_SESSION_ID` |
| KB | …/keybindings | Keybinding contexts and actions |
| CLI | …/cli-reference | CLI flags: `--bare`, `--safe-mode`, `--plugin-dir`, `--plugin-url` |
| tools-reference | …/tools-reference | Built-in tools |

### Plugins

| Key | URL | What it covers |
|---|---|---|
| PL | …/plugins | Plugins overview |
| PLD | …/plugins/loading | Loading, caching, `--plugin-dir`, reload |
| PI | …/plugins/install | Installing and updating |
| PC | …/plugins/components | Components, plugin `settings.json` keys, reach to claude.ai and Cowork |
| MF | …/plugins/manifest-reference | `plugin.json` fields, `userConfig` |
| PCLI | …/plugins/cli-reference | `claude plugin` commands |
| PCR | …/plugins/create | Creating a plugin |
| PS | …/plugins/security | Plugin security |
| PO | …/plugins/org | Organization plugin controls, when each surface applies the keys |
| PH | …/plugins/host-marketplace | Hosting a marketplace |
| PP | …/plugins/publish | Publishing |
| PT | …/plugins/troubleshooting | Plugin troubleshooting |
| MR | …/plugins/marketplace-reference | `marketplace.json` |
| PM | …/plugins/measure | Plugin context cost, `claude plugin details`, analytics |
| PS-claude | https://claude.com/docs/plugins/platform-support | Which plugin parts reach Claude Code, Cowork and claude.ai |

### MCP

| Key | URL | What it covers |
|---|---|---|
| MCP | …/mcp | MCP servers, tool names, limits, tool search, channels, elicitation |
| MCP-quickstart | …/mcp-quickstart | Adding a server |
| MA-quickstart | https://claude.com/docs/connectors/building/mcp-apps/quickstart | MCP Apps: Claude Code calls an app tool as text |
| MA-getting-started | https://claude.com/docs/connectors/building/mcp-apps/getting-started | MCP Apps in Claude Desktop, `ui.domain` |
| MA-design-guidelines | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | Display modes, mobile |
| MA-instance-supersession | https://claude.com/docs/connectors/building/mcp-apps/instance-supersession | One iframe per tool call |
| MA-external-links | https://claude.com/docs/connectors/building/mcp-apps/external-links | Link confirmation |
| MA-troubleshooting | https://claude.com/docs/connectors/building/mcp-apps/troubleshooting | Large results |

### Desktop app

| Key | URL | What it covers |
|---|---|---|
| desktop | …/desktop | Tabs, environments, engine copy and version, sessions, panes, MCP, managed settings |
| desktop-wsl | …/desktop-wsl | WSL sessions (no plugins) |
| desktop-linux | …/desktop-linux | Linux install and updates |
| desktop-quickstart | …/desktop-quickstart | First run |
| desktop-scheduled-tasks | …/desktop-scheduled-tasks | Scheduled tasks |
| deep-links | …/deep-links | `claude-cli://` links |
| claude-projects | …/claude-projects | Projects and "Waiting on you" |
| claude-apps-gateway | …/claude-apps-gateway | Gateway deployments; Desktop tabs on embedded Claude Code sessions |
| network-config | …/network-config | Network hosts, MCP widget origins |
| feature-availability | …/feature-availability | Features by provider |

### Other clients and sessions

| Key | URL | What it covers |
|---|---|---|
| RC | …/remote-control | Remote Control |
| MOB | …/mobile | The mobile app |
| WEB | …/claude-code-on-the-web | Cloud sessions |
| QS | …/web-quickstart | Cloud session quickstart |
| ENV | …/cloud-environments | What carries over to cloud sessions, the GitHub proxy |
| SE | …/sessions | Session ids, storage, resume, branch |
| XSM | …/cross-session-messaging | Messages between sessions |
| CH | …/channels | Channels |
| CHR | …/channels-reference | Building a channel |
| AV | …/agent-view | Agent view and `claude agents --json` |
| HL | …/headless | `claude -p`, `--bare`, stream-json, exit behavior |
| SDK-overview | …/agent-sdk/overview | What the Agent SDK is |
| SDK-features | …/agent-sdk/claude-code-features | `settingSources`, what loads |
| SDK-plugins | …/agent-sdk/plugins | Loading plugins in the SDK |
| SDK-hooks | …/agent-sdk/hooks | SDK callback hooks, timeouts, notifications |
| SDK-ts | …/agent-sdk/typescript | TypeScript SDK reference, `system/init`, `readMcpResource` |
| SDK-mcp | …/agent-sdk/mcp | MCP in the SDK, connection timing |
| SDK-custom-tools | …/agent-sdk/custom-tools | In-process tools |
| VSC | …/vs-code | The VS Code extension |
| JB | …/jetbrains | The JetBrains plugin |
| PLAT | …/platforms | Where Claude Code runs |
| SL | …/statusline | The `statusLine` setting |
| ART | …/artifacts | Artifacts |

### Costs and data

| Key | URL | What it covers |
|---|---|---|
| COST | …/costs | Billing, limits, `/usage`, background usage |
| MC | …/model-config | Model aliases, allowlists, effort, thinking, fallback |
| PCACHE | …/prompt-caching | Cache lifetimes, scope, invalidation |
| PCACHE-API | https://platform.claude.com/docs/en/build-with-claude/prompt-caching | Minimum cacheable length, breakpoints |
| PRICE | https://platform.claude.com/docs/en/about-claude/pricing | Model and cache prices |
| DU | …/data-usage | Training, retention, telemetry |
| MU | …/monitoring-usage | OpenTelemetry metrics and raw API bodies |

### Changes

| Key | URL | What it covers |
|---|---|---|
| CL | …/changelog | Release notes, generated from CHANGELOG.md on GitHub. Anchors look like `#2-1-295`. |
| WN | …/whats-new | Weekly digests, Week 13 to Week 37 |
| WN-33 to WN-37 | …/whats-new/2026-w33 to …/whats-new/2026-w37 | The digests cited here |

### Local sources

- This repo at `55ab122`: `hooks/register.tsx`, `hooks/ledger.ts`, `hooks/prs.ts`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, `tests/hooks.test.ts`, `scripts/check.sh`, `README.md`, `ROADMAP.md`, `AGENTS.md`, `docs/plans/clients.md` (untracked, read during the day).
- Live commands on 2026-10-08: `claude --version`, `claude plugin list`, `claude plugin details inbox`, `claude plugin validate`, `claude plugin test`, `claude agents --json`, `ps`, and file listings of `~/.claude/plugins/store/` and `~/Library/Application Support/Claude/`.

