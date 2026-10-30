# Recent changes, and what the latest versions showed

Part of [Claude Code mods](../claude-code-mods.md).

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

- `askLedgerModel` sends `system` as a block array with `cache: true` (`hooks/register.tsx:askLedgerModel`). That form arrived in 2.1.292. [CL#2-1-292]
- README says "built and tested with Claude Code 2.1.292" (`README.md:20`).
- The desktop app keeps a 2.1.289 engine on disk next to 2.1.293 (live). Inference: a Code-mode session on 2.1.289 may fail the per-turn call or lose caching. The sessions running on 2026-10-08 used 2.1.293.
- The inbox sets `isDeferred: false` through `tool.describe` (`hooks/register.tsx:on('tool.describe')`). The changelog and the mods API page date only the `$.tool.register` field (2.1.293, "earlier versions ignore it"). When `tool.describe` gained it is unknown.
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

## Checked against Claude Code 2.1.309 and desktop 3.6556

Checked on 2026-10-23. Claude Code 2.1.309 is the terminal version here
(`claude --version`). The desktop live checks ran in the `inbox-ui` VM on app
3.6556.2 with engine 2.1.308, and are in claude-desktop-app.md under "Live
checks on desktop 3.6556.2". The entries quote the desktop release notes of
the version each names, and the Claude Code changelog.

- **Pre-approved tools (desktop 3.1623.4).** "Changed plugins that the app
  loads to ask before using the tools they pre-approve when your
  organization's Claude Code managed settings, such as `managed-settings.json`,
  set `allowManagedPermissionRulesOnly`." The inbox pre-approves nothing: it
  has no skills, command files or agents, no `allowed-tools`, and `hooks/register.tsx`
  has no `tool.check` that allows a call. Its `record` and `close` are answered
  in `tool.call` with `{ result }`. Live, with the key set in a managed file
  (engine 2.1.308), both completed with no prompt, and a pane press's
  `$.prompt.submit` message ran. Not affected.
- **Desktop smoke test (desktop 3.6556.1 notes: "Bundled Claude Code version:
  2.1.308.").** Run on app 3.6556.2 with engine 2.1.308. Band, pane, presses,
  `$.ui.copy` and `/clear` passed. The pane opened at 41% of the window and
  could be dragged from 28% to 90%. The 2.1.305 changelog's "Changed a mod's
  docked pane to stay within 45% of the terminal's width" names the terminal,
  and no such limit showed in the desktop app. A result line under a row,
  such as a Copy's "✓ Copied …", moves the row's buttons when it comes and
  goes.
- **Settings tab for folder marketplaces (desktop 3.6556.1, third-party
  providers).** "Fixed plugins installed from a marketplace folder on this
  computer having no Settings tab on their page in Customize, so Code tab
  sessions ran them without the values they ask for. Values entered earlier in
  a terminal must be entered again in that tab." The inbox declares no
  `userConfig` (`.claude-plugin/plugin.json`), so it asks for no values. The
  standard install uses the `petekp/inbox` Git marketplace. Not affected.
  Open question [51](unknowns-engine.md#unknown-and-how-to-check-engine-and-api) stays open: it asks whether `userConfig` values
  reach `register(on, options)` in Code mode, and this note adds that a Code
  tab session of a folder-marketplace plugin could run without them on a
  build older than the fix. A future inbox option needs a default for that
  reason.
- **Notes only, from the desktop notes.** Cowork plugins and skills now work
  in scheduled tasks. A Cowork MCP tool that needs a person asks only on the
  in-app card. `allowedPluginMarketplaces` checks `expectedName` when a source
  moves, so the marketplace name `inbox` and the source `petekp/inbox` must
  stay stable. A third-party local MCP server whose `env` uses only `${VAR}`
  now runs. The inbox registers no MCP server of its own in Claude Code.
- **Send now (2.1.309).** "Fixed ctrl+enter (send now) only queuing a message
  when pressed before the response had started, and restarting a prompt's hooks
  while leaving the message queued when pressed while those hooks were
  running." The mod's `prompt.submit` hook is not idempotent. Each run adds one
  to `ledger.turn` and appends the text to `turn.person`
  (`hooks/session.ts:recordPrompt`), and `PromptSubmitInput` has no prompt id
  to dedupe by. So on 2.1.308 and earlier, a restarted hook could count one
  message twice. From 2.1.309 it runs once. The mod does not use
  `prompt.compose` or `prompt.context`. Not reproduced live; no change.
- **VS Code (2.1.309).** "[VSCode] Fixed a mod's 'From the … plugin' label
  above the prompt being drawn over the slash command and @-mention menus."
  The inbox does not draw in the VS Code chat panel (docs/looks.md), and
  neither this Mac nor the VM has VS Code. Not checked.
- **Notes only, from the 2.1.309 notes.** "Fixed a mod's `turn.step` hook that
  names a model by alias, such as `haiku`, failing every request with a model
  error": the inbox names `sonnet` in `$.model.complete`
  (`hooks/register.tsx`), not in a `turn.step` hook. "Improved the error when
  a hooks module is nested too deep to load: it now names the file": the
  inbox's module is `hooks/register.tsx`. "Fixed plugins and skills synced from
  claude.ai being removed, sometimes mid-session, after a disk read error."
  PowerShell hooks exiting 2 now block (Windows only; the inbox has no
  PowerShell hooks). "Fixed messages from a Claude Desktop-hosted session
  sometimes being lost when its connection refreshed" and the desktop and
  terminal account-mismatch fix reach desktop when it bundles 2.1.309.
