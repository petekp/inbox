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
| Minimum for the inbox's code | 2.1.292 (`cache` blocks in `$.model.complete`) | [CL#2-1-292]; `hooks/register.tsx:askLedgerModel` |
| Repo | `main` at `55ab122` | Live `git log` |

### Key constraints

1. **Only the terminal and desktop Code mode draw.** "A mod's hooks run in every kind of session that loads the plugin. Drawing is narrower: only the terminal and the Desktop app show a mod's panes, bands, and replaced rows." [O#where-mods-run] `-p`, the Agent SDK and the VS Code chat panel run hooks and draw nothing. Under Remote Control, hooks run on the host machine and the phone or browser shows nothing a mod draws. A cloud session runs hooks only for a plugin that reaches it.
2. **Desktop Code mode starts headless.** The app is an SDK host that runs the engine as a stream-json child process (live `ps`; changelog 2.1.208, 2.1.260, 2.1.282). The types say a remote client joins through `session.attach` "(… the desktop app connected)". [T: `SessionAttachInput`] No public doc says this. Live: `session.start` has `isInteractive: false` and no surfaces, and the attach follows about 0.1 s later ([desktop](claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session)). The inbox turns on at `session.start` when the app started the process or has already attached, and otherwise at `session.attach` (`hooks/register.tsx:on('session.start')` and `hooks/register.tsx:on('session.attach')`). `hooks/register.tsx:isStartedByDesktopApp` tells the app's process from `CLAUDE_CODE_ENTRYPOINT`.
3. **A prompt typed in Code mode counts as the person's words.** It arrives with `origin.kind` `composer`, as in the terminal (live probe, [desktop](claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session)). The inbox counts `composer`, `bridge` and `plugin` with `asUser` (`hooks/register.tsx:isPersonsWords`).
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

### Parts

- [What a mod is, and its versions](claude-code-mods/what-a-mod-is.md)
- [Where mods run: terminal, desktop, mobile and cloud](claude-code-mods/surfaces.md)
- [The desktop app](claude-code-mods/desktop-app.md)
- [Building and loading a mod](claude-code-mods/building-and-loading.md)
- [Testing and debugging](claude-code-mods/testing-and-debugging.md)
- [Subagents, lifecycle, the hook function and events](claude-code-mods/lifecycle-and-events.md)
- [The `$` API and its limits](claude-code-mods/api.md)
- [Drawing: render sites, keyboard and focus](claude-code-mods/drawing.md)
- [Drawing: elements](claude-code-mods/drawing-elements.md)
- [Settings hooks and `classic.*` events](claude-code-mods/settings-hooks.md)
- [Security model, settings and environment variables](claude-code-mods/security-and-settings.md)
- [Admin policy that can stop the mod](claude-code-mods/admin-policy.md)
- [What the inbox's model calls cost](claude-code-mods/costs.md)
- [Plugins: cost, manifest and install](claude-code-mods/plugins.md)
- [Plugin updates, conflicts and controls](claude-code-mods/plugin-updates-and-controls.md)
- [MCP and MCP Apps, as they affect the inbox](claude-code-mods/mcp.md)
- [Remote Control and sessions across processes](claude-code-mods/sessions-across-apps.md)
- [Headless `-p` and the Agent SDK](claude-code-mods/headless-and-sdk.md)
- [IDE extensions, the status line and artifacts](claude-code-mods/ide-and-status-line.md)
- [Recent changes, and what the latest versions showed](claude-code-mods/recent-changes.md)
- [What this repo has verified, and what is stale](claude-code-mods/verified.md)
- [Where sources disagree: engine and API](claude-code-mods/disagreements-engine.md): rows 1-58 and 111-119
- [Where sources disagree: clients and admin](claude-code-mods/disagreements-clients.md): rows 59-110
- [Unknown, and how to check: engine and API](claude-code-mods/unknowns-engine.md): rows 1-62
- [Unknown, and how to check: clients and admin](claude-code-mods/unknowns-clients.md): rows 63-135
- [Sources](claude-code-mods/sources.md)
