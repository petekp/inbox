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
2. The app runs each session headless, as an SDK host (live process arguments). Live: `session.start` has `isInteractive: false`, `surface: null` and no surfaces. The app attaches about 0.1 s later with `surface: 'desktop'`. See "Live probe of a Code-mode session" below.
3. Mods run and draw in local Code-mode sessions. WSL sessions get no plugins. A cloud session runs a mod's hooks only for a plugin that reaches it, and draws nothing (https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run).
4. Mods need engine 2.1.286 on Desktop (overview page). The inbox "was built and tested with Claude Code 2.1.292" (`README.md:20`). Whether it works on the app's 2.1.289 copy is unknown.
5. `ToolProgress`, `TurnDuration`, `InfoNotice`, `Raster` and `Image` do not draw on the desktop (https://code.claude.com/docs/en/plugins/mods/reference#render-sites, #elements). Live: `$.ui.copy` works on the desktop, although a types comment says "a remote surface has no path yet".
6. Live: a prompt typed in Code mode arrives with `origin.kind` `composer`, so the inbox counts it as the person's words (`hooks/register.tsx:2025`).
7. The app and the CLI share `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md, hooks and skills (https://code.claude.com/docs/en/desktop#shared-configuration).
8. The repo owner reported the mod loading in a local Code-mode session after commit 05c3548. Commit f7536d0 fixed `/clear`, `/resume` and `/branch`.
9. There is no in-app way to confirm the mod loaded. `/plugin` does not run in Code mode (see "Plugins and Customize"). For an installed mod, refusal and `hook skipped` lines go to the debug log only (https://code.claude.com/docs/en/plugins/mods/troubleshoot#find-out-why-a-mod-does-nothing).

## Live probe of a Code-mode session

On 2026-10-08, a throwaway mod logged one new local Code-mode session in the app (version 2.31226.0). The mod loaded through `CLAUDE_CODE_PLUGIN_DIRS`, ahead of the inbox. Times are seconds from the first event.

| Time | Event | What it showed |
|---|---|---|
| 0.00 | `classic.SessionStart` | `source: 'startup'`. `e.session_id` and `$.session.id()` match. It fires before `session.start`, as it does in the terminal. |
| 0.02 | `session.start` | `isInteractive: false`, `surface: null`, `$.session.surfaces()` empty. |
| 0.14 | `session.attach` | `{ surface: 'desktop', clientId: 'desktop-2', viewport: { columns: 106, rows: 48, isFullscreen: true } }`. `surfaces()` is now `['desktop']`. |
| 0.17 | `prompt.submit` | The first typed prompt, `origin: { kind: 'composer' }`. The mod's tool was not registered yet. |
| 0.19 | `$.tool.register` resolves | 20 ms after the first prompt. |
| 0.26 | `turn.start` | Its input has `text` and `turnId`. |
| 3.65 | `tool.call` | Claude called the mod's tool in that first turn. |

What follows from it:

- **Turning on.** A desktop session turns on at `session.attach`, never at `session.start`. The first prompt can arrive before setup that runs at attach has finished.
- **Tools on turn one.** A tool registered at attach was still offered on the first turn, because the turn starts after registration finishes. The margin was 70 ms. This is one run, not a guarantee.
- **The person's words.** A typed prompt is `composer`, the same as in the terminal.
- **`$.process.run`** works. `git --version` and `gh auth status` succeeded, and `gh` used the keychain sign-in. The session's `PATH` matched the login shell's.
- **`$.ui.copy`** returned `{ isCopied: true }` with `surface: 'desktop'`.
- **`$.prompt.submit({ text, asUser: true })`** started a turn at once, with `origin: { kind: 'plugin', name, asUser: true }`.
- **The pane** opened with `placement: 'dock'` and `isFocused: true`. Its `bodyColumns` changed from 36 to 69 as the person widened it, and the viewport narrowed from 106 to 70 columns to match. `bodyRows` was 42.
- **The band** had `maxRows: 12`. The terminal at 49 rows gave 19. Its `bodyColumns` shrank as the pane widened.
- **Button presses** carry `surface: 'desktop'`. Native buttons drew and clicks worked.
- **Hotkeys do nothing.** With the pane focused, pressing a `Button`'s `hotkey` (`g`, `j`, `k`) logged no press. Only clicks reached the mod.
- **Not covered:** `keybindings.json`, `/clear` and `/resume` in the app, `Link` targets and `session.detach`.

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
| `$.ui.copy` | Works | Works (live), although the types say "a remote surface has no path yet" |
| `$.prompt.read` | Works | Returns `{ text: '', cursor: 0 }` "where the session draws no box (a -p run, an SDK host)" (types) |
| `$.process` | Works | Works in a local Code-mode session (live), although the types say "CLI only" |
| Redraw rate | 30 per second for the visible pane, the expanded band and the hint line | "Throttled to 10 a second" (https://code.claude.com/docs/en/plugins/mods/reference#limits) |

The reference says "`e.surface` is `terminal` or `desktop`" (reference#render-sites). The types allow four values, so a render hook typed from them must also handle `mobile` and `vscode`.

Risks for the inbox:

- The inbox hides hotkey `Button`s in a `Box` with `display="none"` (`hooks/register.tsx:3728`). A desktop that draws native buttons may show them or drop them. Unverified.

## Drawing limits for desktop design

Read this before designing any desktop UI for the inbox. It lists what a mod can draw in Code mode on engine 2.1.293, with a source and a status for each claim. Each claim is either verified live, stated in the docs or types, inferred, or unknown.

**What this means for the inbox's tabs:**
- A mod cannot customize the engine's pane tabs. The only thing a mod controls is the title text. Another `$.ui.open` with the same id changes that text, so a title can carry a count.
- Box and Button cannot make a whole tab, row or card clickable. A Box takes no clicks. A Button is only as big as its label and does not stretch.
- A `Client` can. It is a region a separate surface module draws, with a set width and height, and it gets pointer input over the whole region on desktop (live, 2026-10-09). Its module can post each click to the hooks module.

**Source key:**
- `types:N (Symbol)` is `.claude-plugin/types/claude-code/index.d.ts` line N, as written by engine 2.1.293. Each engine that loads the mod rewrites this file, so the line numbers drift. Find the line by the symbol (desktop.md:89).
- `mods.md:N` is `docs/reference/claude-code-mods.md`.
- `desktop.md:N` is `docs/reference/claude-desktop-app.md`.
- `live` means probes in this project's desktop Code-mode sessions. The attach, viewport, placement, band, copy and submit probes ran on 2026-10-08 (desktop.md:29-55). The drawing probes ran on 2026-10-09.
- The app keeps two engine copies, 2.1.289 and 2.1.293. It downloads them into Application Support; they are not built into the app. The probed sessions ran 2.1.293 (desktop.md:3, :129-133).

### What desktop draws

| Element | What desktop does | Status | Source |
|---|---|---|---|
| Pane placement | Opens docked (`placement: 'dock'`) and focused. `bodyColumns` went from 36 to 69 as the person widened it, and `bodyRows` was 42. The types describe placement only in terminal terms. Where the pane sits among the app's own panes is unknown. | verified live | desktop.md:51; types:10241 (`Pane`), 10267 (`Pane.placement`); mods.md:231. mods.md:623 says docking is unknown, which the live probe supersedes. |
| Pane size request | `rows` and `columns` on `$.ui.open` are requests. A size the person dragged wins. The dock ignores `rows`, and an inline pane ignores `columns`. | stated | types:7383-7402 (`PaneOpenArgs.rows`, `.columns`) |
| Older desktop | Places no pane. `$.ui.open` answers `isPlaced: false` until a surface that places panes attaches. | stated | types:13994 (`UiOpenResult`) |
| Engine pane tabs | The label is the pane's `title`, or its id, and nothing else. A title may hold emoji. Control characters are refused. Tabs exist only while 2 or more panes are open. A click on a tab switches panes, and the engine does that. Re-opening the same id changes the title. No prop styles, sizes, colors or replaces a tab. Whether desktop draws these tabs at all is unknown. | stated. No customization: inferred. Desktop drawing: unknown. | types:7342-7346 (`PaneOpenArgs.title`), 10249-10253 (`Pane.title`), 7333-7403 (`PaneOpenArgs`); mods.md:586 |
| Pane frame, close mark, tab row | Drawn by the engine, outside the mod's tree. Not counted in `bodyColumns` or `bodyRows`. No prop changes them. | stated; no prop: inferred | types:10262-10263 (`Pane.bodyColumns`), 10278-10280 (`Pane.scroll`) |
| Layout units | The types say layout is in cells: the pane's pixels divided by the code font's character width and line height. They add "Cell-based until the first element lays out in pixels". But Text draws in a proportional font, and about 1.25 characters fit per column. The sources conflict, and the live result wins. | verified live; stated | live; types:10318-10323 (`RenderViewport`); mods.md:620 |
| Viewport | At attach: `{ columns: 106, rows: 48, isFullscreen: true }`. The docs say `rows` is the whole window, not the pane. The types say that on a remote surface the viewport is the pane's width and height. Live, `columns` narrowed from 106 to 70 as the pane widened, so it tracks the transcript, not the mod pane. The types conflict with both the docs and the live result. | verified live; stated; conflicting | desktop.md:37, :51; mods.md:613; types:10321-10322 (`RenderViewport`) |
| Box | Drawn as a flex div. `backgroundColor` and hover `backgroundColor` draw. It takes no clicks. An absolute Box is clipped, for both pointer and paint, to its site's region, and the pointer on it counts as on its parent. Offsets are whole cells. There are no per-side borders and no borderRadius, opacity, shadow, cursor, maxWidth, z-index or font props. | verified live (background, hover, clicks, borders); stated (props, offsets, absolute); inferred (absences) | live; types:901-990 (`BoxProps`), 921-931 (`BoxProps.position`), 933 (`BoxProps.top`), 12139 (`StyledElement`) |
| Box borderStyle | The docs list ten names, and any other name draws no border. Which names desktop honors is untested. | stated; unknown on desktop | mods.md:692; types:984 (`BoxProps.borderStyle`) |
| Box `display: 'none'` | Hides the Box. Whether native Buttons inside it stay hidden on desktop is unverified. | unknown | desktop.md:196; mods.md:1580 |
| Hover | Hover is plain data in the tree. No hook runs. A Box hover can change border style and color, background, `display: 'flex'`, and an absolute Box's offsets. Box hover background works on desktop. Text and Button hover, and scope groups, are unknown on desktop. A Text or Button hover outside a keyed Box with no scope is refused. A Button always inverts under the pointer. | verified live (Box background); stated; unknown | live; types:855-895 (`BoxHoverProps`), 915 (`BoxProps.hover`), 1133-1140 (`ButtonProps.hover`), 12499-12500 (`TextProps.hover`) |
| Text | Drawn as a styled span in a proportional font. Props: color, backgroundColor, dimColor, bold, italic, underline, strikethrough, inverse, wrap, hover. There is no font size, family or weight beyond bold. `wrap="truncate-end"` does not stop wrapping. The types say a tree wider than the room "wraps or truncates, as its Text props say", so this conflicts with them. | verified live (font, wrap); stated (props); inferred (absences) | live; types:12494-12512 (`TextProps`), 10327 (`RenderViewport.columns`) |
| Box-drawing characters | A run of `─` wraps instead of drawing a rule. | verified live | live |
| Color | A theme key or any raw string. The types say a surface draws a value it does not know in its own way. How desktop paints colors and dimColor is not documented. | stated; unknown | types:1667-1673 (`Color`) |
| Button drawing | Always a native button, plain or not. A plain Button still highlights under the pointer and on focus. One line tall and as wide as its label. It does not stretch to fill a column Box or an absolute overlay. Taller than a line of text. A long label is cut with an ellipsis. | verified live; stated (native, plain) | live; types:1056-1057 (`ButtonProps`), 1094 (`ButtonProps.plain`) |
| Button label spaces | A label of plain spaces draws with no size and takes no clicks. Non-breaking spaces keep their size. | verified live | live |
| Button variant | `primary` draws a white filled button. The default is a dark gray rounded button. `secondary` exists and was not tried. `plain` wins over `variant`. | verified live (primary, default); stated (secondary, plain) | live; types:1103-1112 (`ButtonProps.variant`); mods.md:664 |
| Button `role: 'dismiss'` | Desktop draws its native close control at the trailing edge, with the label as its accessible name. Not seen live. | stated | types:1117-1118 (`ButtonProps.role`); mods.md:665 |
| Button props | Only key, label, hotkey, action, plain, dimColor, variant, role, autoFocus, hover, onPress. No width, padding, flex, color, bold, border, icon, disabled or tooltip. Any other prop fails the whole tree. | stated (list); inferred (absences) | types:1060-1152 (`ButtonProps`), 9309-9311 (`RenderElement`), 9323-9389 (`RenderElement` Button) |
| Button children | A string label only on 2.1.293. String and `Text` children need engine 2.1.295, and the probed sessions ran 2.1.293. TypeScript does not catch an element child, because every element constructor accepts children. The types say a press on an Svg or Raster "goes on an enclosing Button", but a Button is a leaf and cannot enclose anything. | verified live (string only); stated (2.1.295, TypeScript, contradiction) | live; desktop.md:3, :130; mods.md:668, :1469; types:9320 (`RenderElement` Button), 3744-3756 (`ElementChildren`, `ElementConstructor`), 9579, 9610 |
| Clicks | Buttons and Clients take clicks, and a Box takes none. A press carries surface `'desktop'`. Clicks on Input, Select and Link were not tested. | verified live (Button, Client, Box) | live; desktop.md:53 |
| Hotkeys | Do nothing. A Button's hotkey logs no press while the pane is focused. The types do not limit hotkeys to the terminal, and the docs say a small key shows beside the label. The live result wins. | verified live | live; desktop.md:54; types:1071-1078 (`ButtonProps.hotkey`); mods.md:656-659 |
| Button `action` chord | Terminal only. | stated | types:1083-1086 (`ButtonProps.action`); mods.md:662 |
| Focus | The pane and the band each keep a focus ring. The `focus` request on open is not a grant. If the focused Button is missing from the next drawing, the app takes focus off the pane, and the next click only refocuses it (anthropics/claude-code#100874). Keeping the same key avoids this. `$.ui.focus` acts only in a site that holds the keyboard. | verified live; stated | live; types:13736-13739 (`UiFocusComponent`), 7350-7356 (`PaneOpenArgs.focus`), 13712 (`ui.focus`) |
| Band (AbovePrompt) | Draws on desktop. `maxRows` was 12, where a 49-row terminal gave 19. `bodyColumns` shrank as the pane widened. The types explain why: the band's column is the transcript beside a docked pane, less 5 columns for `[-]`. The types describe the engine's `[-]` and `n more` rows without naming a surface. Whether desktop draws them is unknown. Every mod shares the band. | verified live; stated; unknown (`[-]`, `n more`) | desktop.md:52; types:10181-10188 (`AbovePrompt`), 10212-10216 (`AbovePrompt.bodyColumns`); mods.md:588-589, 615-617 |
| Input, Select | Draw on desktop. Leaf elements with no width or style props. Typing into an Input on desktop is untested. | stated | types:5441-5483 (`InputProps`), 10419-10458 (`SelectProps`); mods.md:640, 675 |
| Link | Drawn as an anchor. The sources conflict: the types allow only `https:` on a remote surface. The docs also allow `http://localhost`, with no `@` and in canonical form. Anything else draws as plain text. The types leave where a click opens to the surface. Where it opens is untested. | stated, conflicting | types:5608-5619 (`LinkProps`); desktop.md:184; mods.md:683-684 |
| Markdown | A leaf element. A link that is not https, http or file draws as text. The types describe `onLinkPress` clicks only for "the fullscreen terminal". Whether desktop sends link clicks to it is unknown. | stated; unknown | types:5688-5695 (`MarkdownProps.onLinkPress`); mods.md:687 |
| Code | Colors come from the engine's highlighter, never the mod. | stated | types:1612-1614 (`CodeProps`) |
| Svg | Drawn as an image. With `isInteractive` it draws in a sandboxed frame with CSS :hover, SMIL animation and `<title>` tooltips, but no scripts or event handlers. Width and height are CSS pixels. Up to 131,072 characters, and `alt` is required. Not drawn on the terminal. | stated | types:12196-12229 (`SvgProps`); mods.md:641, 694 |
| Client | A region drawn by a separate module "for animation and pointer input". It takes `width`, `height` and `flexGrow`, and a module sets a pointer listener with `onPointer`. The types conflict about desktop. The test types say `pointer` reaches a Client on "terminal and desktop today". The element type says "The desktop carries it as data". Pointer events count whole cells, and finer positions come only from terminals that report pixels. Live on desktop, a Client under the pane's tabs with `width="100%"` and `height={4}` laid out at 36 by 3 cells and drew its module's Box and Text. Its pointer listener got `down`, `move` and `leave` events with cell positions, on every row of the region. Each `surface.post` reached a `ui.message` hook, and the hook's `{ props }` answer redrew the instance. So "carries it as data" is wrong for engine 2.1.293. | verified live; stated | types:1489-1530 (`ClientProps`), 1433-1483 (`ClientPointerEvent`), 1577-1580 (`ClientSurface.onPointer`), 9555-9561 (`RenderElement` Client), 14811-14813 (`ElementOfAct`); mods.md:642, 695 |
| Not drawn | The Raster and Image elements. The ToolProgress, TurnDuration and InfoNotice render sites. | stated | types:3796-3807 (`Elements.desktop`); mods.md:597; desktop.md:23, 181, 183 |
| Invalid tree | One prop off the allowlist fails the whole tree, and the engine draws its own content instead. For an element the surface lacks, the sources disagree. The interface docs say the engine draws its own site. The gallery says an Svg-only terminal pane opens empty. The types disagree with each other: one place says a missing element draws a fragment, another says the tree is refused. | stated; conflicting | types:9309-9311 (`RenderElement`), 12146 (`StyledElement.props`), 3758-3760 (`ElementName`), 9579-9580 (`RenderElement` Svg); mods.md:358, 646, 1576 |
| Spinner | On desktop, the row that carries the turn's mark. | stated | types:10035-10037 (Spinner) |
| PromptHint `tail` | Terminal only. | stated | types:10170-10174 (`PromptHint.tail`) |
| Redraw | After a hot reload, the pane redraws only on its next state change or minute tick. The docs state a limit of 10 redraws a second outside the terminal's fast sites. The real desktop rate was not measured. | verified live (reload); stated (limit); unmeasured (rate) | live; mods.md:702, :1708; desktop.md:190 |
| `e.surface` | The docs say `terminal` or `desktop`. The types also allow `mobile` and `vscode`. | stated, conflicting | desktop.md:192; mods.md:1558; types:10315 (`RenderSurface`) |
| `$.ui.copy` | Returns `{ isCopied: true }`. This supersedes the types' "a remote surface has no path yet" and the docs' inference that copy fails on desktop. | verified live | desktop.md:49; mods.md:505 |
| `$.prompt.submit` | With `asUser: true`, starts a turn at once. | verified live | desktop.md:50 |
| `$.prompt.read`, fill, suggest | The types say they return empty results in headless sessions. Desktop runs sessions headless, so they may be inert there. | stated (headless); inferred (desktop) | desktop.md:188; mods.md:513 |
| Sessions | Mods draw in local Code-mode sessions. They draw nothing in WSL or cloud sessions. The docs say SSH sessions draw too; that is untested. | verified live (local); stated (WSL, cloud, SSH) | desktop.md:21, 146-153, 275 |

### What this rules out

- **Customizing the engine's pane tabs.** Only `title` reaches a tab. Nothing styles, sizes, badges or replaces it. The title text can change, as with a count.
- **A whole-tab hit area built from Box or Button.** A Box takes no clicks. A Button sizes to its label and does not stretch, even in an absolute overlay. Draw the tabs in a Client instead.
- **Clickable whole rows or cards built from Box or Button.** Same reason as the tab bar.
- **Making a Button look like text or a tab.** `plain` still draws native chrome and a pointer highlight.
- **Styled content inside a Button**, such as colored counts, dim parts, chips or icons. Engine 2.1.293 takes only a string label.
- **Spacer or invisible Buttons made of spaces.** They have no size and take no clicks.
- **Keyboard-first design and key hints beside labels.** Hotkeys do nothing, and `action` chords are terminal only.
- **Column-exact alignment with spaces or character counts.** The font is proportional, about 1.25 characters per column.
- **Relying on `wrap="truncate-end"` to keep one line.** Text still wraps. Keep the text short.
- **Rules drawn with `─` and other box-drawing characters.** They wrap.
- **Single-side dividers.** A Box has no per-side borders.
- **Rounded corners, shadows, opacity, font sizes or font families.** No props exist for them.
- **Mixed Button-and-Text rows at text height.** A native button is taller than a text line.
- **Trying a prop just to see what happens.** One unsupported prop drops the mod's whole drawing.
- **Image or Raster.** They are not drawn on desktop. Svg is the only image route, and the mod receives no clicks from it.
- **Redrawing a focused Button under a new key.** The pane loses focus (#100874), unless the mod moves the focus to a Button that is still drawn.
- **A scrolling list drawn in Clients.** The scroll wheel does nothing with the pointer over a Client, while it scrolls the pane over Box and Text (live, #100923).
- **Redrawing the pane every fraction of a second.** While a settled row's leave bar redrew every 213 ms, clicks on the pane's Buttons did nothing. With one redraw at the end, they worked (live, #100924).

### What works

- A docked pane whose width follows the person's drag. Fit content to `bodyColumns`.
- Native Buttons. `onPress` fires with surface `'desktop'`, and a click on a button's corners or edges presses it (live).
- Moving the focus to a Button the next drawing still has, when a press removes the focused one. A `$.ui.focus` for that Button, called once the render hook has returned, kept every next click working in a run of 19 presses (live).
- A `Client` for any click area larger than a Button label. Its module draws with Box and Text, gets pointer events over its whole region, and posts to the hooks module through `ui.message`.
- Hierarchy with `variant="primary"` (white filled) against the default (dark gray rounded).
- A Box `backgroundColor` and hover `backgroundColor` for row highlight. This is visual only, not clickable.
- Stable Button keys across redraws, which keep pane focus.
- Non-breaking spaces to pad a Button label. A long label shows an ellipsis.
- `$.ui.copy` and `$.prompt.submit({ asUser: true })`.
- The band draws, up to 12 rows here.

### Still unknown

- **How a Client maps a click to what it drew.** Pointer positions are whole cells, but desktop text is proportional. Check whether a Box with a set width in cells lines up with the cells the pointer reports.
- **Whether a Client keeps the pane's focus, takes keys after a click, and draws its own hover.** Draw tabs in a Client, then click, type and hover.
- **Whether desktop draws engine pane tabs, and whether they switch on click.** Open two mod panes in a desktop session, then screenshot and click.
- **Where a mod pane docks among the app's panes, whether Cmd+\ closes it, and whether it pops out.** Try each in a desktop session.
- **Which `borderStyle` names and `borderColor` values desktop honors.** Draw one Box per name and screenshot.
- **Text and Button hover, and scope groups, on desktop.** Draw each inside a keyed Box and hover.
- **Whether Buttons inside a `display: 'none'` Box stay hidden.** Draw one and screenshot.
- **How `role: 'dismiss'` and `variant="secondary"` look.** Draw each in the pane and in the band.
- **Whether the band shows `[-]` and `n more` on desktop.** Overflow the band past `maxRows` and screenshot.
- **Where a Link click opens, and whether `http://localhost` links work.** Click both kinds of link.
- **Whether Markdown link clicks reach `onLinkPress`.** Log presses while clicking a Markdown link.
- **Whether typing reaches an Input on desktop.** Draw an autoFocus Input and type.
- **Whether `ctrl+x tab` or `focus: true` focuses the pane on desktop, and whether keybindings.json applies.** Try each and read `isFocused`.
- **Toasts, status, `holdToasts` and `$.ui.selection` on desktop.** Call each and screenshot or log the result.
- **`$.ui.notify`.** Retest once the app runs 2.1.295. Check the session's engine version first.
- **The real redraw rate on desktop.** Log redraw timestamps under rapid state changes.
- **Which surface fires `onPress` when a terminal and the desktop share a session.** Attach both and click.
- **Whether `/inbox` appears in the app's `/` menu.** Type `/` in a desktop session.
- **Whether the app shows failure and reload lines.** Break the mod with the watch variable set and look.

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
