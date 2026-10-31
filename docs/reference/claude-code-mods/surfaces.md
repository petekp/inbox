# Where mods run: terminal, desktop, mobile and cloud

Part of [Claude Code mods](../claude-code-mods.md).

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
- Live probe, 2026-10-08: a Code-mode session starts with `isInteractive: false`, `surface: null` and no surfaces. About 0.1 s later the app joins as surface `desktop` through `session.attach`, and the first typed prompt can follow within 30 ms. So the inbox turns on through its `session.attach` path (commit `05c3548`). The full timeline is in [desktop](../claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session).
- `SessionStartInput` documents only two cases: `surface` is "`terminal` under the REPL; null for a `-p` run or the SDK", and `isInteractive` is "true under the REPL, false for a `-p` run or the SDK". [T: `SessionStartInput`]
- `session.attach` "Fires when a remote client joins the session's roster … (a phone opened the session; the desktop app connected)". It carries `surface`, `clientId` and `viewport?`. "the terminal's attachment is the REPL's binding and raises nothing". `session.detach` carries reasons, session end among them. [T: `session.attach`, `session.detach`]
- `$.session.surfaces()` "Returns every surface the session draws on … `terminal` under the REPL first, then the remote ones in the order they attached. A session may draw on several at once (a terminal and two phones) … Empty in a plain -p run". `$.session.surface()` is deprecated. [T: `session.surfaces`]
- `PromptComposeInput.surfaces` gives "Where the session draws at this render … empty where nothing draws". [T: `PromptComposeInput`]

The inbox's gate (`hooks/register.tsx`):

```ts
on('session.start', async ($, e, next) => {
  await registerInboxCommand($)
  const r = await next(e)
  const isDesktop = (await $.session.surfaces()).includes('desktop') || (await isStartedByDesktopApp($))
  if (e.isInteractive || isDesktop) await turnOn($)
  return r
})
on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
  await ensureOn($)
  return next(e)
})
```

- `session.start` is at `hooks/register.tsx:on('session.start')`, the gate inside it, `session.attach` at `hooks/register.tsx:on('session.attach')`. Commit `05c3548` added the desktop gate.
- `isStartedByDesktopApp` is true when `CLAUDE_CODE_ENTRYPOINT` is `claude-desktop` or `claude-desktop-3p` and `CLAUDE_CODE_CHILD_SESSION` is unset. The app sets the entrypoint and removes `CLAUDE_CODE_CHILD_SESSION` ([desktop](../claude-desktop-app/how-it-runs.md#how-the-app-runs-claude-code)). Claude Code sets `CLAUDE_CODE_CHILD_SESSION=1` for every command it runs. So a `claude -p` that a desktop session runs inherits the entrypoint, reads as a child, and stays off.
- It handles the attach arriving before or after the start. `hooks/register.tsx:turnOn` shares one `turningOn` promise, so two calls that overlap run `hooks/register.tsx:initializeInbox` once. `initializeInbox` sets `isOn`. `hooks/register.tsx:ensureOn` returns early when `isOn` is set or `turningOn` is pending. The start path calls `turnOn` without that check, so a start that follows a finished attach runs `initializeInbox` again. That run cancels the intervals the first one started before it starts its own. Whether a start can follow an attach is not verified.
- Tests: `tests/hooks-startup.test.ts` test "a headless run stays inactive when ${origin.kind} invokes the inbox command" checks that a headless start does nothing. The tests `tests/hooks-startup.test.ts` "the desktop app turns the mod on when it attaches before the start" and "… after the start" check a desktop attach in both orders and mount the band with `surface: 'desktop'`. "a session the desktop app started carries its saved rows into a first prompt that comes before the attach" and "a claude -p run from a desktop session stays off" check the entrypoint path.

## Mobile

- The mobile app is "a client for Claude Code sessions rather than a place where code runs". Cloud sessions and Remote Control "both live in the **Code** tab in the Claude app". [MOB]
- "commands that only run in the terminal interface, such as `/plugin` and `/resume`, don't work from the app." Bypass permissions can't be chosen. [MOB#limitations]
- Projects: "A conversation where Claude coordinates parallel threads of work and reports back", for when you "want to see which threads finished or need you". [MOB#work-from-your-phone] This overlaps the inbox's job.
- Docs: mods draw nothing on the phone. Types: `mobile` is a surface with Box, Text, Button, Svg, Link, Code, Markdown and no `Input` or `Select` ("the mobile app draws no field yet"); "the mobile app reports `false`" for `isFullscreen`; Svg is drawn "in a web view"; the `session.attach` example reads `{ surface: "mobile" }`, "a phone joined: draw the lobby". [T: `Elements.mobile`; `RenderViewport`; `SvgProps`; `session.attach`] Inference: the protocol may exist without a slot for Pane or AbovePrompt ("draws the tree where it has a slot for it").
- No `RenderSurface` value stands for claude.ai/code in a browser. [T]
- The inbox has no mobile code. It detects a missing `Input` generically (`hooks/register.tsx:on('ui.render', Pane)`) and drops `typekey-` actions without one (`hooks/pane-row-keys.tsx:pressable`).
- Inference: if a phone ever draws mod trees, the rework needs one tree that degrades to Buttons, Text and Markdown, with no keyboard hints and no sidebar.

## Cloud sessions

A **cloud session** runs on Anthropic-managed infrastructure (or an org's self-hosted environment). It is started from claude.ai/code, the mobile Code tab, the desktop app with **Cloud** selected, `claude --cloud`, or routines. [WEB]

- Plugins: "A cloud session doesn't install the plugins a repository turns on under `enabledPlugins`". "Plugins enabled only in your user settings" don't carry over. Server-managed settings do (except in Claude Tag sessions). MDM and file-based managed settings don't. [ENV#what-carries-over-from-your-setup] `~/.claude/settings.json` is "not read". [SET#settings-in-cloud-sessions]
- Changelog entries show plugins "synced from claude.ai" do load in cloud sessions as `name@synced` (2.1.239, 2.1.261, 2.1.269, 2.1.287). 2.1.295 "Fixed cloud sessions hanging when a mod's `session.receive` hook asked for permission before passing a message on." [CL] Inference: mods can run in cloud sessions via synced or server-managed plugins. The carry-over table omits synced plugins.
- Nothing a mod draws appears. [O#where-mods-run] The inbox gate keeps it off there, assuming the desktop app does not attach to cloud sessions as `desktop`.
- Hooks: "Claude Code runs hooks from the repository and from your organization's server-managed settings." Self-hosted sessions also run "the hooks the operator seeded from the runner host's `~/.claude/`". A session with several repositories loads no repo hooks. [ENV#setup-scripts-vs-sessionstart-hooks; ENV#limitations-in-cloud-sessions]
- Detection: `CLAUDE_CODE_REMOTE` is `true` in the VM, "never `true` locally". `CLAUDE_CODE_REMOTE_SESSION_ID` holds a `cse_…` id. [ENV]
- GitHub proxy (Anthropic-hosted): it "rejects requests to GitHub's GraphQL endpoint with a 403… `gh` subcommands that use GraphQL, such as `gh pr` and `gh issue`, get the same 403… a `GH_TOKEN` you set gets the same 403." "Claude can't reach GitHub APIs that exist only in GraphQL". [ENV#github-proxy] The inbox's PR block uses `gh api graphql` with `THREADS_QUERY` (`hooks/prs.ts:THREADS_QUERY`, `reviewThreads { isResolved isOutdated … }`) and `gh pr view`. Inference: both fail in cloud; `gh pr view` could move to REST, the thread list probably not.
- Network: sessions reach "The Anthropic API, for Claude Code's own requests, even at **None**". [ENV#access-levels] Inference: `$.model.complete` would work at any level.
- Lifecycle: after a few idle minutes the VM pauses; "Your next message restores the same VM and starts Claude Code again." A reclaimed VM restores the conversation but not running background work. [ENV#time-limits; ENV#set-environment-variables; WEB#environment-expired] Inference: a mod would see a new process after each pause; whether `$.store` survives a reclaim is unknown.
- Cost: cloud sessions count toward plan limits and "share rate limits with all other Claude and Claude Code usage". [WEB#limitations]
- Handoff: `--teleport` pulls a cloud session into the terminal as "its own copy"; the CLI can't push a terminal session to the cloud. The desktop app's **Open in → Cloud** can. `/clear` doesn't work in cloud sessions. [WEB#move-tasks-between-terminal-and-cloud; WEB#manage-context]
- `$.session.send` can address "a Remote Control or cloud id (`session_...`)". [T: `SessionSendAddress`] Archived sessions refuse messages. [WEB#send-follow-ups-from-the-cli]
- ZDR and HIPAA organizations get no cloud sessions and no Remote Control. For them the inbox's clients are terminal and desktop only. [WEB; RC#connection-and-security]
