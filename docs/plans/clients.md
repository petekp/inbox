# Inbox architecture review: three clients

In this review, "item N" means the numbered list under "Two hosts: Claude Code and Codex" in `docs/plans/architecture.md`. "Done fix N" means the separate "Done" list at the top of that file. A **client** is one app the inbox runs in. A **host** is the code that adapts the inbox to that app: the mod (`hooks/register.tsx`) or the Codex plugin (`codex/`). A **surface** is the engine's word for an app that shows a Claude Code session: `terminal`, `desktop`, `mobile` or `vscode`. Only `terminal` and `desktop` draw what a mod draws. The **inbox model** is the per-turn model call that updates the ledger: Sonnet in the mod, gpt-6.1-sol through `codex exec` in Codex. `index.d.ts` means the engine's API types, which Claude Code writes to `.claude-plugin/types/claude-code/index.d.ts` when it loads the mod. "The mods docs" means the pages under `code.claude.com/docs/en/plugins/mods/`.

## 1. Verdict

The architecture is not ready for three clients yet. Most of what blocks it is small, though. The biggest blocker is one line: `hooks/register.tsx:1885` sets `isOn = e.isInteractive` once, at `session.start`, and nothing turns the mod on later. The mods docs say a mod's hooks run and its band and pane draw in a local session in the desktop app's Code mode. The engine's types say `isInteractive` is true only under the terminal REPL, and that the desktop app reaches a session by attaching to it. So Code mode, the cheapest third client, probably gets no inbox today. That has not been checked live.

The mod also never reloads its state after `/clear`, `/resume` or `/branch` (I9). After an in-session `/resume`, the inbox is empty and its next save overwrites the previous conversation's saved ledger.

After those, the next problems are about keeping clients in step rather than adding one:

- Model-read texts are kept as copies.
- The update loop and its failure rules are copied and already disagree.
- Each host has its own press vocabulary and its own saved shape.
- `./scripts/check.sh` reports green in a fresh worktree while skipping every Codex check.

Item 4 is the right direction, but it is understated. It needs a press contract, a capabilities input and a `LastAction` migration before the view model itself.

## 2. What the Claude app needs first

The Claude desktop app has two modes, Claude and Code. They need separate plans. The public desktop docs still describe three tabs, Chat, Cowork and Code.

- **Code mode** runs Claude Code. Each session there runs in one of four environments, and the mods docs say what a mod does in each:
  - **Local.** Hooks run, and the band and pane draw on the `desktop` surface. The existing mod is the client, and no new renderer is needed.
  - **SSH.** Claude Code runs on the remote host, and plugins load there. The mods docs don't say whether a mod draws. If it does, `git`, `gh`, `open` and `$.store` all run on the remote host, so that session's inbox is saved there.
  - **Cloud.** Hooks run for a plugin that reaches the session. Nothing draws.
  - **WSL.** Plugins don't load.
- **Claude mode** runs no Claude Code session, so it has no mods. An inbox there could only be an MCP App view plus tools, as the Codex Inbox tab is. Which plugin parts Claude mode loads is not covered by the docs read for this review.

Other places Claude Code runs draw nothing a mod draws, though its hooks still run: the VS Code extension's chat panel, `claude -p`, the Agent SDK, and cloud sessions. Remote Control from claude.ai or the phone shows the mod's drawing only in the terminal on your machine.

| Capability | Code mode, local session | Claude mode | Design decision that waits on it |
| --- | --- | --- | --- |
| Loads the mod | Yes (mods docs), from Claude Code 2.1.286. Not tried live. | No Claude Code session. | Whether Code mode is a third surface of the mod or needs a port. |
| Session starts with `isInteractive` true | Unknown. The types say `desktop` is a remote surface that attaches over the wire, and that only the terminal's attachment is the REPL's. That points to false. | Not applicable. | The gate rule (I1). |
| `session.attach` fires for `desktop` | Likely, per the types ("the desktop app connected"). Not tried. | Not applicable. | Whether the gate turns on at attach, or at start from `$.session.surfaces()`. |
| Band and pane draw | Yes (mods docs). `Svg` is desktop-only. `Raster` and `Image` are terminal-only. A `Link` draws as plain text unless its `href` is `https:` or `http://localhost`. | Unknown whether a view can stay open beside a conversation. | Whether `Host` needs a value for Claude mode. |
| Keys and text fields | `Input` and `Select` work. A button's hotkey shows as a small key beside its label. | Not applicable. | How keyboard hints read on desktop. |
| `$.model.complete` and `$.model.fork` | Documented. They use the person's plan or API key. Not tried here. | Unknown. | Whether Claude mode has a per-turn update at all, or only items Claude writes with tools. |
| `$.prompt.submit({ asUser: true })` | Documented. Not tried here. | Unknown. | How a press sends a message. |
| Conversation id given to an MCP server | Not applicable. | Unknown. | Whether `sessionOf` can work. Today every call without Codex metadata fails (`codex/src/server.ts:139`). |
| Push updates to the view | Yes (`$.ui.invalidate`). | Unknown. | How stale a press can be, which sets how strict press targets must be. |
| `$.store` shared with the terminal | Yes for a local session: every session on the machine shares one store (mods docs). An SSH session uses the remote host's store. | Not applicable. | Store collisions: `KEPT_SESSIONS = 40` (`register.tsx:408`) and one `p:<root>` key per folder. |
| Engine version | The desktop app on this Mac bundles 2.1.289 and 2.1.293. The terminal CLI is 2.1.295. | Not applicable. | The oldest supported engine, and what the type check runs against (I22). |

**First action:** open a local Code-mode session in a git repo. Look for the band and pane. Check whether a new `s:<id>` key appears in `~/.claude/plugins/store/inbox_inline-*.json`, and log what `session.start` receives. That one test settles the first three rows.

**Claude mode:** five unknowns block a real client: which plugin parts it loads, the conversation id, a press that sends a message, a per-reply update and push updates. Run a small test of those before building anything for it.

## 3. Issues

Issues are ranked by how much each one blocks adding the Claude app or keeping three clients in step.

### I1. The mod turns itself off unless a terminal REPL started the session
- **Problem.** The mod decides once, from `e.isInteractive`, whether it runs. It never hooks `session.attach` and never reads `$.session.surfaces()`. A local Code-mode session starts with `isInteractive` false and the desktop app attaches to it, so the mod is fully off there: no band, no pane, no per-turn update. In a live local Code-mode session, `/inbox` and the mod's tools did not exist. The tests lock this in. All 32 mounts use `'terminal'`, and "a headless run does nothing" asserts the off state. The plan has no step for the Claude app.
- **Evidence.**
  - `hooks/register.tsx:1885-1886`
  - `index.d.ts:11610-11616` (`surface` is "null for a `-p` run or the SDK"; `isInteractive` is "true under the REPL")
  - `index.d.ts:10303-10315` (`desktop` is a remote surface) and `:10630-10636` (`session.attach`; "the terminal's attachment is the REPL's binding")
  - `tests/hooks.test.ts:984-994`
- **Proposed change.**
  - Turn on when a surface that draws is present: `isInteractive`, or `desktop` in `$.session.surfaces()` at start, or a `session.attach` from `desktop`.
  - Run the session-start setup once, whichever comes first. The setup reads the session id, root and store, registers `/inbox` and the tools, and starts the timers. Running it once avoids duplicate timers and registrations when a second client attaches.
  - `-p`, the Agent SDK, VS Code and cloud sessions stay off. Nothing draws there, so the per-turn call would buy nothing.
  - Split the headless test: `-p` stays off, while a start plus a `desktop` attach turns on. Mount the pane and band tests on `desktop` as well as `terminal`.
  - Confirm with one live local Code-mode session.
- **Rejected alternatives.**
  - Turning on for any attached surface. `vscode` and `mobile` draw nothing a mod draws.
  - Detecting the desktop app by an environment variable. The engine already reports the surface.
  - Dropping the gate. It runs Sonnet after every turn of every `-p` and SDK run.
- **Approval.** Needed for the cost: each local Code-mode session would run one Sonnet call per turn on the person's plan, as a terminal session does now. No stored names change.
- **Plan.** New. It goes before item 4, because it decides whether item 4 has two renderers or three.

### I2. `check.sh` exits 0 in a fresh worktree while skipping every Codex check
- **Problem.** In a fresh clone or worktree, `.claude-plugin/types` and `codex/node_modules` are missing, because both are gitignored. `check.sh` then runs 3 of 7 checks and exits 0. It skips the root type check and the Codex bundle-freshness, type and test checks. Each skip prints "not checked" but leaves the exit status alone. The plan does item 4 in a worktree "with `./scripts/check.sh` green". There is no CI. So a change to shared `hooks/` code that breaks Codex, or leaves `codex/plugin/dist` stale, passes the only gate. A green run also replaces recorded failing checks in the inbox's own tracking (`hooks/check-tracking.ts:53-54`).
- **Evidence.**
  - `scripts/check.sh:41-45` and `:50-56`
  - `docs/plans/architecture.md:114-116`
  - `.gitignore:2`
  - The main checkout runs all 7 checks.
- **Proposed change.**
  - Make a skip fail unless it is explicitly opted out.
  - Run `npm --prefix codex ci` when `node_modules` is missing.
  - Remove the Codex type check's dependence on generated types (I3).
- **Rejected alternative.** A louder message. Agents read "exit 0" as green.
- **Approval.** None for the script. A CI job that runs it needs approval.
- **Plan.** It contradicts the plan's "How to do it" step. It goes before item 4.

### I3. Shared code imports a Claude Code type and holds Claude-Code-only adapters
- **Problem.** `hooks/ledger.ts:1` imports `SessionMessage` from `'claude-code'`. That module exists only after a Claude Code engine has loaded the mod and written the gitignored types folder. On a fresh copy with `codex/node_modules` installed, the Codex type check fails with one error: `ledger.ts(1,37) TS2307`. Replacing that one import with a local row type makes it pass. That was verified. `ledger.ts` also holds code only the mod uses:
  - `transcriptText`
  - `readCommandRow` and `commandRowLine`
  - `tasksRunBy`
  - the stop texts, including "Run /login"
  - `dialogText`
  - `statusLine`, which builds the Herdr sidebar line
- **Evidence.**
  - `hooks/ledger.ts:1`, `:213`, `:981`, `:1016`
  - `codex/tsconfig.json:15`
  - `.gitignore:2`
- **Proposed change.** Move those functions into the mod's adapter, or give `transcriptText` a local row type. Then drop the `paths` entry in `codex/tsconfig.json`. Keep `toolActivity` shared. Codex calls it (`codex/src/core.ts:106-108`). Its Claude Code tool names should become per-host input.
- **Rejected alternative.** Vendoring a stub `claude-code` type. It hides the dependency.
- **Approval.** None.
- **Plan.** New. It is an unstated prerequisite for item 5's "build in CI" option. `architecture.md:44` ("sound and should stay as they are") overstates how host-neutral `hooks/` is.

### I4. Model-read texts are hand-kept copies, and the rule that guards them is stale
- **Problem.**
  - GUIDANCE exists twice, and the copies differ only in the first paragraph (`register.tsx:181-194` and `codex/src/texts.ts:16-31`).
  - The start title is a byte-identical copy (`register.tsx:2205` and `START_TITLE`).
  - None of these is built from `Host`.
  - AGENTS.md's list of model-read text puts the tool descriptions in `register.tsx`, but they moved to `hooks/tools.ts`. The list omits `codex/src/texts.ts`, `catchUpPrompt`, `transcriptCatchUpPrompt`, `CATCH_UP`, `screenText` and `promptNotes`.
  - The rule prescribes only a Sonnet measurement. Yet `systemText`, `inboxText` and `buildPrompt` now reach Codex and gpt-6.1-sol too.
  - No test covers either host's GUIDANCE, check refusal or start title.
  - A third client would make a third copy.
- **Evidence.**
  - `AGENTS.md:6`, `:8`
  - `hooks/tools.ts:43`
  - `codex/src/texts.ts:17`
  - `hooks/register.tsx:182`
- **Proposed change.**
  - Build GUIDANCE's first paragraph and the start title in `hooks/` from `Host`. If the built texts match today's byte for byte, no model trial is needed.
  - Keep `CHECK_REFUSAL` per host, since only the mod has `run_check`. A `hasRunCheck` field on `Host` could build it.
  - Rewrite the AGENTS.md section per reader: the agent (Claude, Codex) and the inbox model (Sonnet, gpt-6.1-sol), with the files that hold each text.
  - Optionally, add one test that the shared GUIDANCE body matches across hosts.
- **Rejected alternative.** Only correcting AGENTS.md's list. It went stale once already, when `tools.ts` was split out.
- **Approval.** None. Any wording change is measured first, per AGENTS.md.
- **Plan.** Item 2 removed the `.replace()` patches as it says. These copies are separate, and no item covers them.

### I5. The per-turn update loop is copied per host, and its failure rules disagree
- **Problem.** Both hosts copy the same step: the Explain filter, the source string, `parseReply` and `applyUpdate`. Their failure rules differ:
  - **The mod.** A failed update keeps `turnsApplied` and runs a catch-up.
  - **Codex.** A failed update advances `turnsApplied` and drops the exchange. This is deliberate, because Codex has no catch-up yet (`codex/src/update.ts:129-130`).
  - The shared `isTaskHandedOff` reads `turnsApplied`, so a handed-off task unfolds at different times in each client.
  - **A live wrong text.** The Codex tab says "update failed, retries after the next reply" (`codex/src/tab.tsx:778`). Nothing retries.
  - Codex's SessionStart does not restart pending updates. A killed update shows "Updating…" until the next Stop.
  - Neither host keeps raw replies that failed to parse, so format drift on a new model cannot be counted.
  - `codex-plugin.md:76` calls the Codex catch-up port "Direct". It is not, because `transcriptText` reads Claude Code's `SessionMessage` and tool names.
- **Evidence.**
  - `hooks/register.tsx:745`, `:786`
  - `codex/src/update.ts:111`, `:125`, `:131`, `:43`
  - `codex/src/tab.tsx:778`
  - `hooks/presses.ts:63`
- **Proposed change.**
  - Fix the tab text now.
  - Move the pure "apply one exchange" step into `hooks/ledger.ts`, with the model call injected as `Ask`.
  - Give Codex a catch-up, then adopt the mod's rule (advance only on success) for both hosts.
  - Have Codex's SessionStart restart pending work.
  - Optionally keep the last N failed raw replies for the measurement harness. In the mod, that extends `PluginState` and needs an `upgradeState` entry.
- **Rejected alternative.** Documenting the difference. The tab already tells the person something false.
- **Approval.** None.
- **Plan.** Item 3 left this step copied. "Left for later: Ledger freshness" says the counters "work". That is true in the mod alone.

### I6. Item 4 needs a press contract before the view model
- **Problem.** Item 4 gives each key "its press" without saying what a press is.
  - **Three things share the word "press".** The mod's presses are closures over `$`, with ad hoc Ink Button keys (`help-<id>-<n>`, `drop-<id>`). Codex's are data (`TabPress`, 12 actions) applied by `press()` and returning `Effect`s. The model-facing `Press` (`answer | explain | run`) is a separate concept: which press sent a prompt.
  - **The reducer is bound to Codex.** `press()` works only on Codex's `SessionState` and hardcodes "Sent to Codex to …".
  - **The view crosses a JSON tool boundary in Codex,** so the shared view model cannot carry closures.
  - **Failed sends differ.** Codex sends under the lock and keeps the row if the send fails. The mod's `actOnFinding` removes the finding before sending. `withLastAction` records the ✓ after a fire-and-forget `onPress`, whether or not the send worked.
  - **Press targets are fragile.** Codex addresses steps by position. If the model adds a help, a stale press runs a different step. For example, `[copy C, run A]` plus "open B" makes step 0 "Run A". When a row is gone, Codex reports success and the tab deletes the typed draft.
  - **Host differences are checked inline.** Each host decides on its own whether there is an `Input`, a `!` shell hint, PRs or a stop section (`register.tsx:2451`, `:2857`, `:921`; `codex/src/core.ts:331`).
- **Evidence.**
  - `codex/src/core.ts:210`, `:225-226`, `:277`, `:290`, `:319`
  - `codex/src/server.ts:99-101`
  - `codex/src/tab.tsx:188`, `:270`
  - `hooks/register.tsx:824-825`, `:1532`, `:2610`, `:2880`
  - `hooks/ledger.ts:264`, `:355`
  - `docs/plans/architecture.md:86`, `:90-98`
- **Proposed change.** Split item 4 into ordered sub-steps:
  - (a) Move `TabPress`, `Effect` and `press()` into `hooks/presses.ts`. They should run over the ledger and check state, take the agent's name from `Host`, and address steps by `helpTarget` (exported from `ledger.ts`). They return an explicit outcome: `applied`, `gone` or `changed`. Each host gets one effect executor that reports success or failure, and keeps the row only on success. Every renderer shows a gone row and keeps the draft.
  - (b) Add a few capability fields for differences that exist today: typing, shell hint, PRs, stop signal, open local path.
  - (c) Build the view model.
  - (d) Write the renderers.
  - Replace the `DEMO_PRESSES` key-prefix regex (`register.tsx:176`) with a flag on each press.
  - Wait on Claude-app-specific flags until its unknowns are answered.
- **Rejected alternative.** Sharing only row data and leaving presses as closures. The "again" rule, done texts and hand-off flags would stay copied.
- **Approval.** None for the code. Putting a session id in the `inbox_press` payload is a wire change. Defer it until the Claude mode's conversation id is known.
- **Plan.** It sharpens item 4 and the note at `architecture.md:86`.

### I7. "One `LastAction` type" is a migration of saved values
- **Problem.** The two stores save different things:
  - **The mod.** The Ink Button key as `action`, the bare label as `text`, and pane fields `tab` and `index`. The GLOSSARY uses this form.
  - **Codex.** Press names (`explain`, `step-<n>`) and sentences: "Explain sent", "Sent to Codex to fix". `docs/plans/codex-tab.md:61` documents that form.
  - Each host's "again" rule matches only its own form.
  - Codex has no `lastActions` upgrade. The mod's upgrade rewrites only its own old "Sent to Claude to …" texts.
- **Evidence.**
  - `hooks/register.tsx:975-976`, `:2878`, `:2882-2883`
  - `types/index.d.ts:71`, `:79-81`
  - `codex/src/core.ts:277`, `:310`, `:339`
  - `codex/src/tab.tsx:230`
  - `GLOSSARY.md:94`
- **Proposed change.**
  - Save `{ press, step?, at, isHandoff?, turnsStarted?, title? }`.
  - The view model derives the label and the "again" state from `press` and `Host`.
  - `tab` and `index` stay in the mod's pane state.
  - Add an upgrade in each store: the mod's `upgradeState` and Codex's `upgraded()`.
  - Fix `codex-tab.md` and AGENTS.md.
- **Rejected alternative.** Merging the TypeScript types and leaving the stored strings. Codex rows would read "Explain sent again" or fail the match.
- **Approval.** Yes. This changes stored values in both stores.
- **Plan.** Item 4 understates it. Decide it before the view model is built on it.

### I8. Saved shapes and upgrades are defined per host
- **Problem.** The ledger core is shared, through `Ledger`, `Checks` and `upgradeLedger`. The fields around it are not:
  - The mod saves only `{ savedAt, ledger }` to `$.store`, through inline casts. Checks, `lastActions` and presence live only in `$.state`.
  - Codex saves everything in its own `SessionState`, with its own `LastAction` and an inline presence type.
  - Codex's `upgraded()` never calls `upgradeChecks`. The next `Check` shape change will be converted in the mod and missed in Codex.
  - `version: 1` is written and never read.
  - AGENTS.md's saved-state rule names only `PluginState`/`upgradeState`.
- **Evidence.**
  - `hooks/register.tsx:985`, `:1901`
  - `codex/src/state.ts:15`, `:27`, `:53`, `:125`
  - `AGENTS.md:10`
- **Proposed change.**
  - Add one shared upgrade function in `hooks/` for the shared pieces: ledger, checks, snapshots, `LastAction`. Both hosts call it.
  - Name Codex's `SessionState`/`upgraded()` in AGENTS.md.
  - A full shared `SavedSession` type can follow with the cross-client record (I15).
- **Rejected alternative.** Only adding `upgradeChecks` to Codex. The next field brings the drift back.
- **Approval.** Yes, if it changes stored shapes or meanings.
- **Plan.** It widens item 4's `LastAction` note to the whole saved shape. Land it before or with item 4.

### I9. After `/clear`, `/resume` or `/branch`, the mod keeps the old session id and never reloads
- **Problem.** The mod reads the session id and loads saved state only in `session.start`. The mods docs say `session.start` doesn't fire after `/clear`, `/resume` or `/branch`, and that all three reset every `$.state` value to its default. The mod handles only one of the three: the `clear` branch of `session.end`.
  - **After `/clear`.** The ledger resets, but `sessionId` and `isSaved` don't. Every later save overwrites `s:<old id>`. Resuming the old conversation later restores the new one's ledger. Check logs go to the old id's folder, because `checkLogFolder` is memoized. This lasts until a reload or exit.
  - **After `/resume` or `/branch` in a running session.** `$.state` resets, so the ledger, checks and recovery counters empty. The resumed conversation's saved ledger never loads, and no catch-up runs. `sessionId` still names the previous conversation, so the next update overwrites that conversation's saved ledger with the resumed one's. Code mode makes this path common: its `/resume` picks up a CLI session inside the desktop app.
  - No test covers any of the three.
- **Evidence.**
  - `hooks/register.tsx:426`, `:1883-1891`, `:1961-1987`
  - `index.d.ts:10989-10992` (after `clear`, "no `session.start` fires")
  - The mods docs: `session.start` fires "Not after `/clear`, `/resume`, or `/branch`", and `$.state` lasts until "the user runs `/clear`, `/resume`, or `/branch`".
- **Proposed change.**
  - Move the loading half of the `session.start` hook into one function: read the session id and root, reset `isSaved` and the log-folder memo, load `s:<id>`, and decide whether to catch up.
  - Call it from `session.start` and from `classic.SessionStart` with `source` `clear`, `resume` or `fork`. The mods docs give this pattern for reloading after a reset.
  - Later, write down once in shared code what each lifecycle event keeps.
  - Add a GLOSSARY definition: a session id names one conversation, and `/clear`, `/resume` and `/branch` each switch to another.
- **Rejected alternative.** Reading the id only inside `save`. The ledger would still be empty after `/resume`, and the log folder would stay on the old id.
- **Approval.** None.
- **Plan.** New. Fix it before any every-session view.

### I10. The mod loses the last turn's update across a new process
- **Problem.** The mod keeps the pending update in an in-memory `queue`, and the recovery counters in `PRESENCE` (`$.state`). Both start empty in a new process. Only a successful update writes `s:<id>`, and `session.end` does not wait for `queue`. Suppose the person quits while the final reply's update is queued, running or just failed. On resume, the ledger is not empty, `PRESENCE` reads `'current'` with 0/0 turns, and no catch-up runs. Items that appeared only in the lost reply never appear. Codex saves `pending` and retries it. Code mode makes resumes more likely: its `/resume` picks up a CLI session.
- **Evidence.**
  - `hooks/register.tsx:128`, `:843`, `:1949`, `:1961`
  - `codex/src/state.ts:57`
  - `tests/hooks.test.ts:232` (the only resume test starts with an empty store)
- **Proposed change.** Save `turnsStarted`, `turnsApplied` and `ledgerState`, or the pending exchange, in `s:<id>`. Read them back in `session.start`.
- **Rejected alternative.** Waiting a bounded time in `session.end`. It does nothing on a kill or sleep.
- **Approval.** Yes. This changes the `s:` shape and needs an upgrade.
- **Plan.** New. It reopens "Left for later: Ledger freshness".

### I11. `Host` mixes the agent with surface facts, and "surface" means three things
- **Problem.**
  - `Host` is four wording fields, fixed per process.
  - **Band wording.** `CLAUDE_CODE.band` tells the inbox model the person always sees a band. That holds wherever the band draws, and the band draws only on `terminal` and `desktop`. If the mod turns on only where it draws (I1), the sentence stays true.
  - **Pane wording.** `inboxText` and `screenText` say the open pane is "beside the conversation". The engine seats it inline unless the terminal is fullscreen and at least 110 columns wide (`index.d.ts:10265-10273`).
  - **"Surface".** `Host.surface` holds a phrase ("the /inbox pane"). The engine's `RenderSurface` is the draw target. GLOSSARY uses "Surfaces" as a heading for band, pane and card.
- **Evidence.**
  - `hooks/ledger.ts:100`, `:112`, `:407-421`, `:863`
  - `index.d.ts:10188`, `:2781`, `:10315`
  - `hooks/register.tsx:735`, `:911`
  - `GLOSSARY.md:3`
- **Proposed change.**
  - Rename `Host.surface`, for example to `inboxView`. It is not stored, so no approval is needed.
  - Move the band sentence out of `systemText` into the per-exchange `<screen>` text. Build it from the attached surfaces, so `systemText` is the same for every Claude Code surface. This needs measurement.
  - Verifiers disagreed on a full `Agent` plus `Surfaces` split. Code mode does raise `AbovePrompt`, so `CLAUDE_CODE` is right there. Rebuilding GUIDANCE on each surface change also works against prompt caching. Treat the split as optional: the band draws only where the mod would run.
- **Rejected alternative.** A `CLAUDE_DESKTOP` constant. Same agent, and one session can be on several surfaces.
- **Approval.** None. The model text needs measurement.
- **Plan.** It extends item 2.

### I12. No contract tests across hosts, and shared-module tests need the Claude CLI
- **Problem.**
  - Each host tests only its own texts. The mod pins its tool results (`tests/hooks.test.ts:368`, `:451-457`). Codex pins `inboxText` (`codex/tests/hook.spec.ts:163`).
  - No test covers `systemText` or `buildPrompt` for any host, or `inboxText`/`screenText` for `CLAUDE_CODE`.
  - The pure shared-module tests (ledger, checks, check-tracking, prs) import `'claude-code/testing'`, so only `claude plugin test` runs them.
  - The two suites share no fixtures.
  - Item 2's "character for character" parity was a one-time manual check.
- **Evidence.**
  - `tests/ledger.test.ts:1`
  - `tests/hooks.test.ts:4`
  - `architecture.md:64`
- **Proposed change.**
  - Add a host-neutral suite on the existing esbuild plus `node:test` path. Move the pure-module tests there; they use only describe, expect and test.
  - For every `Host`, check properties: each text names its own surface, never another host's, and mentions the band only when `band` is set.
  - Make it item 4's acceptance gate for view-model rows.
- **Rejected alternative.** Two runners with copied fixtures.
- **Approval.** None.
- **Plan.** Item 4 is understated without it.

### I13. No committed measurement harness, and recovery runs on an unmeasured path
- **Problem.**
  - **The recipe does not match the shipped call.** AGENTS.md's recipe (`claude -p --model sonnet --system-prompt`) leaves out the shipped call's `effort: 'low'`, `maxTokens: 1600` and cached system block.
  - **The Codex baseline cannot be rerun.** The four Codex sample exchanges behind "12 of 12" are not committed.
  - **The fork catch-up is unmeasured and unguarded.** It uses `$.model.fork`, which runs the protocol on the session's main model, behind Claude Code's system prompt, with `systemText` in a user message. Nothing measures that. It also passes `source = null`, so `readHelp` skips its check that HELP values appear in the conversation. This is documented, but unguarded.
  - **The harness is only an aside.** The plan names it in an unnumbered paragraph after item 5.
- **Evidence.**
  - `AGENTS.md:8`
  - `hooks/register.tsx:405`, `:737`, `:759-760`, `:777`
  - `hooks/ledger.ts:153`, `:299`
  - `codex/src/update.ts:16`
  - `docs/plans/codex-plugin.md:410`
  - `architecture.md:110`
  - `ROADMAP.md:29`
- **Proposed change.**
  - Make the harness a numbered item. Commit the sample cases (ledger, exchange, outcome checks) and one runner over the `Ask` seam, with the shipped parameters.
  - Configurations: Sonnet as shipped, `codexAsk`, and the fork.
  - Pass `transcriptText($.session.messages())` as the fork's source now.
  - Make the Sonnet transcript catch-up the default unless measurements show the fork is as good.
- **Rejected alternative.** Correcting the recipe's flags. Still a throwaway harness with no baseline.
- **Approval.** None for a local script. CI needs approval.
- **Plan.** Promote the note to a numbered item, before any model-read text change, new model or `ROADMAP` model choice. It does not need to come before item 4, which changes no model-read text.

### I14. `parseReply` fails open
- **Problem.**
  - Any reply with one recognized key counts as `'current'`.
  - Lines with bold or title-case keys are dropped without a trace.
  - Kind words are case-sensitive, so "Do" becomes a question.
  - A NEW line cut off mid-field still adds an item.
  - The mod never compares `usage.output_tokens` with its 1600 cap. Codex has no cap.
  - The parser is shared, so this is one gap, not drift between hosts. It matters more as other model families run updates.
  - How often these formats actually occur is unmeasured.
- **Evidence.**
  - `hooks/ledger.ts:31`, `:495-549` (`:505-506`, `:548`), `:672`
  - `hooks/register.tsx:737`
  - `tests/ledger.test.ts:105`
- **Proposed change.**
  - Accept case and markdown variants in the key regex.
  - Read kinds case-insensitively.
  - Return the rejected lines.
  - Treat `output_tokens >= maxTokens`, or a cut-off last line, as a failed update.
- **Rejected alternative.** A schema-driven spec that generates `systemText`. It is not needed for sync, and it changes model-read text.
- **Approval.** None. A new `'partial'` ledger state would change `Presence` and need an upgrade.
- **Plan.** New.

### I15. No shared store exists for "every open session in one view"
- **Problem.**
  - `ROADMAP.md:24-26` says the store "already keeps each session's ledger under `s:<session id>`". Only the mod writes that.
  - Its value, `{ savedAt, ledger }`, has no folder, ended mark or checks, and is capped at 40.
  - Codex keeps fuller `SessionState` files in its own plugin data folder, which no other client reads.
  - Item ids are per-ledger counters, so a cross-session view must address `(host, sessionId, id)`.
  - `p:<root>` is last-writer-wins by design, and never pruned.
  - `$.store.set` rejects past 4 MiB. `save` does not catch that, so every update and catch-up would then fail. The store is about 70 KB today.
- **Evidence.**
  - `ROADMAP.md:24`
  - `hooks/register.tsx:408`, `:507-514`, `:629`
  - `types/index.d.ts:139`
  - `codex/src/state.ts:113`
  - `hooks/ledger.ts:695`, `:793`
  - `index.d.ts:3337`
- **Proposed change.**
  - Decide whether the view spans one host or all hosts. That is a product decision.
  - If it spans all hosts, define a versioned record (`host`, `sessionId`, `root`, `top`, `savedAt`, `endedAt`, `ledger`) and one place every client can read it.
  - Test first whether `$.fs.write` can write outside the session folder.
  - Make `save` failures visible and non-fatal now.
  - Prune `p:` keys by age.
- **Rejected alternative.** Building the view on the mod's `s:` keys. It leaves out Codex and has no liveness.
- **Approval.** Yes: a new stored format and location, plus a pruning rule.
- **Plan.** New. It does not block item 4, because the view model can take one session and be mapped over a list later.

### I16. Opening a file runs `open` on the engine's machine, and Codex launches what the mod only reveals
- **Problem.**
  - **Codex launches files.** It runs a plain `open <path>`. The mod reveals folders, executables and launchable types (`.app`, `.command`, `.pkg`, `.dmg`, `.scpt` and others) with `open -R`, which shows them in Finder instead of running them. So in Codex, one press on an Open step for a `.command` file Codex mentioned runs it. `readHelp` accepts any quoted path, and Codex joins relative paths onto the root.
  - **Codex hides failures.** It does not expand `~/` and ignores the exit status.
  - **Both hosts open on the wrong machine for remote surfaces.** They run `open` where the engine runs, not where the press happened. Copy already routes through `press.surface`. This is correct for the terminal, a local Code-mode session and the local Codex server. In a Code-mode SSH session, `open` runs on the remote host.
- **Evidence.**
  - `codex/src/server.ts:113-115`
  - `hooks/register.tsx:409`, `:900-901`, `:911`, `:921`, `:1426`
  - `hooks/ledger.ts:303`
  - `codex/src/core.ts:328`
  - `index.d.ts:5610`
- **Proposed change.**
  - Put the open decision in shared code as one pure function: expand `~`, then return open, reveal or open in the text editor. Each host only runs the result and reports failure.
  - Draw URL steps as `Link` elements, and use `ui/open-link` in an MCP App.
  - Offer opening a local path only on the engine's own machine.
- **Rejected alternative.** Copying the `LAUNCHES` regex into `server.ts`. It drifts with the next client.
- **Approval.** None.
- **Plan.** New. It belongs with I6's effect executor.

### I17. Codex: unreadable session file replaced by an empty one
- **Problem.** `readState` turns any error into `emptyState`: ENOENT, a parse error, or an exception in `upgraded` or `upgradeSnapshots`. The next `updateState` writes that empty state over the file, and every tab poll triggers one through `tabSeenAt`. Writes are atomic, so the likely trigger is upgrade code throwing on another build's shape. All installed versions share one unversioned data folder.
- **Evidence.**
  - `codex/src/state.ts:27`, `:100`, `:148-152`, `:197`
  - `codex/src/server.ts:157`
- **Proposed change.**
  - Only ENOENT means a fresh session.
  - On any other error, move the file aside and throw.
  - A newer `version` makes the session read-only for that process.
- **Rejected alternative.** Wrapping only `JSON.parse`.
- **Approval.** None.
- **Plan.** New. It is Codex-only today, and it matters for any future shared store.

### I18. Codex: the state lock can break while held, and the Stop hook overwrites presses
- **Problem.**
  - **The lock break.** `onPress` holds the mkdir lock across `codex queue`, whose timeout is 15 s, the same as `LOCK_STALE_MS`. A waiter can then remove a live lock, and the first holder's `finally` removes the waiter's lock. Two waiters can both break a stale lock.
  - **Silent hook loss.** A hook that waits 10 s throws, and `hook-main` exits 0 with no output. A lost UserPromptSubmit leaves a `sent` entry with no age limit, so a later identical prompt reads as a press.
  - **The Stop overwrite.** The Stop hook builds `checks`, `snapshots` and `recordedRuns` outside the lock and spreads them over the current state. A Dismiss or Fix pressed meanwhile is lost; `hook.ts:170` says so. That contradicts item 3's rule that each host applies tree changes to its own current checks. The mod follows the rule (`register.tsx:1682-1700`).
  - The lock problems need a slow or hung queue. Normal is about 0.2 s.
- **Evidence.**
  - `codex/src/state.ts:158`, `:176`, `:184`
  - `codex/src/server.ts:89`, `:101`
  - `codex/src/hook-main.ts:26`
  - `codex/src/hook.ts:170`, `:174`
  - `codex/src/tree.ts:60-81`
  - `architecture.md:77`
- **Proposed change.**
  - Record the `sent` marker under the lock, run `codex queue` outside it, then re-apply `press()` under the lock, or remove the marker if the send failed.
  - Detect a dead holder by pid, as `takeUpdateLock` does. Use an owner token.
  - Give `sent` entries an age limit.
  - Have `tree.ts` return readings and changes, and apply them inside `updateState` with the shared reducers.
- **Rejected alternative.** Raising `LOCK_STALE_MS`.
- **Approval.** None.
- **Plan.** It corrects item 3's "Done" for the Codex Stop path.

### I19. Codex: server errors never reach the person
- **Problem.**
  - Tools report errors two ways: an `isError` text result, or `structuredContent.error`. The tab reads only the second.
  - A missing session id, or an error thrown outside `onPress`'s catch, leaves the first view on "Loading…" and a later view stale. The press counts as sent, so a typed draft is deleted.
  - Errors that do reach a row are raw internals: a lock path, or `codex queue` stderr.
  - In the mod, the ✓ is recorded even if the send rejects.
  - A host that sends no Codex metadata would sit on "Loading…" forever. That is the first thing a Claude-mode port would hit.
- **Evidence.**
  - `codex/src/server.ts:110`, `:139`, `:188`
  - `codex/src/tab.tsx:111`, `:807`
  - `codex/src/state.ts:177`
  - `hooks/register.tsx:2880`
- **Proposed change.**
  - Use one result shape, `{ view?, outcome, error? }`, read once in `callTool`.
  - Classify errors into the person's terms.
  - In the mod, `onPress` returns a promise, and the ✓ is recorded only on success.
- **Rejected alternative.** A catch-all "Something went wrong". It hides which host capability is missing.
- **Approval.** None.
- **Plan.** It extends item 4, and merges with I6's outcome.

### I20. Codex: the MCP server finds its data folder by a regex over a private cache path
- **Problem.** Hooks get `PLUGIN_DATA`. The update process gets `INBOX_DATA` from the hook. The MCP server alone derives the folder from Codex's cache layout. If that layout changes, the server silently uses `~/.codex/inbox-dev`: the tab shows nothing, and findings go to a ledger nobody reads.
- **Evidence.**
  - `codex/src/state.ts:97-102`
  - `codex/plugin/.mcp.json:7`
  - `codex/src/hook.ts:195`
- **Proposed change.** Have a hook write its `PLUGIN_DATA` to a fixed file under `CODEX_HOME` for the server to read. Show "no session file" in the view instead of empty state. Add a unit test for `dataDir`.
- **Rejected alternative.** Rebuilding the path from `CODEX_HOME`. The market name comes only from the cache path.
- **Approval.** Yes, if the data folder moves.
- **Plan.** New. It is a latent risk, not current breakage.

### I21. Codex: `inbox_press` relies on the host to hide it from the model
- **Problem.**
  - `inbox_press` closes items and queues arbitrary text as the person (the `type` and `typedFinding` presses). Step presses run `open`.
  - It is hidden only by `_meta.ui.visibility: ['app']`, and it is listed to every client in `tools/list`.
  - `default_tools_approval_mode: "approve"` means no prompt (`codex-plugin.md:399`).
  - A call carries nothing that shows it came from the tab.
  - Which hosts honor `visibility` is unconfirmed.
- **Evidence.**
  - `codex/src/server.ts:26`, `:44-53`, `:180-181`
  - `codex/plugin/.mcp.json:8`
- **Proposed change.** List the app-only tools only when the client declares the MCP Apps UI extension at `initialize`. Require a per-tab token from `inbox_view` on each press.
- **Rejected alternative.** Documenting the reliance.
- **Approval.** None.
- **Plan.** New. Do it before the server serves a second host.

### I22. The engine version is unpinned and differs between checks and clients
- **Problem.**
  - The type check runs against whichever engine last wrote the gitignored types (2.1.293).
  - Tests run on the CLI in PATH (2.1.295).
  - The desktop app bundles 2.1.289 and 2.1.293.
  - The README says 2.1.292.
  - Root `tsc` is unpinned.
  - An API added in a newer terminal engine can pass every check and fail in Code mode.
- **Evidence.**
  - `index.d.ts:1`, `:4`
  - `README.md:20`
  - `scripts/check.sh:42`
- **Proposed change.**
  - Declare the oldest supported engine, which is the oldest one the desktop app ships.
  - Type-check against it, or guard at runtime with `$.session.version()`.
  - Pin `tsc` to 7.0.2.
  - Whether `plugin.json` supports a minimum-engine field is unconfirmed.
- **Rejected alternative.** Updating the README by hand.
- **Approval.** Yes. This is release policy.
- **Plan.** New.

### I23. Codex: the committed bundles are compared but never run
- **Problem.**
  - Nothing starts `dist/server.mjs`, `hook.mjs` or `update.mjs`.
  - The stdio loop, `dataDir`, `appCli` and `codexAsk` have no tests.
  - The hook and update entries exit 0 on any error.
  - `test-dist` is never cleaned, so a deleted spec's compiled copy keeps running.
- **Evidence.**
  - `codex/src/server-main.ts:23`
  - `codex/src/hook-main.ts:26`
  - `codex/package.json:7`
  - `codex/build.mjs:89`
- **Proposed change.**
  - Add a `dataDir` unit test.
  - Add one smoke test that spawns `dist/server.mjs` with a temp `INBOX_DATA` and sends `initialize` and `tools/list`.
  - Clean `test-dist` before `--tests`.
- **Rejected alternative.** Manual trials after reinstall.
- **Approval.** None.
- **Plan.** It complements item 5.

### I24. Codex: the Stop hook awaits serial git work before writing the turn
- **Problem.** The Stop hook does one git reading per check run, then one over every checked repo. Each git call may take 15 s, and nothing caps the total. All of it runs before `endTurn`, under a 60 s hook limit. Past the limit, the exchange is never queued, and its prompt merges into the next one. This needs a very large repo or many check runs. Whether Codex kills the hook at the limit is unconfirmed.
- **Evidence.**
  - `codex/src/hook.ts:166`, `:169`, `:181`
  - `hooks/tree.ts:21`, `:66`
  - `codex/plugin/hooks/hooks.json:25`
- **Proposed change.** Give `readRepo` a total deadline that the host passes in, and treat a missed deadline as "changed". Still run `endTurn` when the claim check is cut short.
- **Rejected alternative.** A longer timeout.
- **Approval.** None.
- **Plan.** New.

### I25. Docs state superseded facts
- **Problem.**
  - `architecture.md:42` lists `prs.ts` as shared. Codex imports 7 of the 9 modules; `prs.ts` is unused there, and `git.ts` is reached only through `tree.ts`.
  - It calls the pane function 950 lines (`:32`). It runs from 2447 to 3706.
  - `codex-plugin.md:4` says the mod "stays unchanged" and that four modules are reused.
  - `codex-plugin.md:233` says the plugin sets `additionalContextLimit`. Nothing in `codex/` sets it.
  - `codex/README.md:9` says a desktop session is untried. `codex-plugin.md` says one ran.
  - `codex-tab.md:157` says the tab imports only types and `ago`. It imports the value `SETTLED_MS` from `core.ts` (`tab.tsx:9`), which pulls 2394 bytes of `hooks/checks.ts` into the browser bundle.
  - `ROADMAP.md:24-26` is covered under I15.
  - `README.md` describes only the mod.
- **Proposed change.**
  - Delete superseded statements rather than annotating them.
  - Add one "Clients" table to `architecture.md` (client, host, surfaces, renderer, store, model, status) and point both READMEs at it.
  - Set `additionalContextLimit` or remove the claim.
- **Rejected alternative.** Patching each sentence. The same facts repeat across four files.
- **Approval.** None.

## 4. Opportunities

Ranked the same way.

### O1. Give item 4's view model a host-neutral home, with no host imports
- **Problem.**
  - The only view model is `codex/src/core.ts` `View`/`viewOf`, which imports Codex's texts.
  - `tab.tsx` imports `SETTLED_MS` from `core.ts`.
  - `View` names two things: `hooks/demo.ts:7` (drawn state) and `codex/src/core.ts:388`.
  - The shared modules live in `hooks/`, the mod's folder. `architecture.md:117-119` says cross-folder imports are "not verified". `claude plugin validate` accepts a relative import into a sibling folder and enforces the `node:*` ban there too. The runtime loader was not tested.
  - Verifiers split on the folder. Two support a root `engine/` folder. Two say keep it in `hooks/` (for example `hooks/view.ts`), because the move fixes naming, not sync.
- **Proposed change.**
  - Either way, state in item 4 that the view module imports nothing from `codex/` or `claude-code`, and that renderers import only it and types.
  - Rename demo's `View` (`DrawnState` or `DemoState`).
  - If you move the folder, do it in one commit before item 4, after a live load test in a session with its own `CLAUDE_CONFIG_DIR`.
  - Drop the "not verified" line.
- **Rejected alternative.** Growing `core.ts`'s `viewOf` and having the mod import it. That reverses the dependency direction.
- **Approval.** None.

### O2. Put the session summary count in one function
- **Problem.** `statusLine` (the Herdr line) counts `ledger.items` only. The band and the Needs you tab add failing checks (`needsYouCount`). So the numbers disagree, and with no items, failing checks are not shown at all. Codex's `waiting` computes the count a third time. Done fix 6 ("Needs you counts") missed the Herdr line.
- **Evidence.**
  - `hooks/ledger.ts:1016-1020`
  - `hooks/register.tsx:536`, `:1078-1080`
  - `codex/src/core.ts:468`
- **Proposed change.** One shared pure count function that all three call, and that a future session list can reuse.
- **Approval.** None.

### O3. Draw a seam in the Codex server now, and wait on the full adapter
- **Problem.** `server.ts` hardwires four Codex bindings, and `ServerDeps` (`:56`) already injects `exec`, `dir`, `now` and `fallbackCli`. The four:
  - `sessionOf` (`:71-73`)
  - `codex queue` (`:87`)
  - `'openai/ui'` placement (`:36`)
  - macOS `open` (`:115`)

  The resource also carries the standard `ui.resourceUri`, so only the persistent per-thread placement is Codex-specific. `core.ts` uses `CODEX` (`:73`, `:202`), `GUIDANCE` and `START_TITLE`.
- **Proposed change.** Add `sessionOf`, `send`, `openTarget` and the tab `_meta` to `ServerDeps`, and pass `Host` into `core`.
- **Rejected alternatives.**
  - A root `mcp-app/` adapter layer now. It has no confirmed requirement until the Claude-mode spike answers the session id and send questions.
  - A generic `x-session-id` fallback. It would merge conversations.
- **Approval.** None.

### O4. Split `register.tsx` into sibling modules
- **Problem.** `register.tsx` is 3707 lines and holds:
  - the update queue and catch-up (741-795)
  - the PR fetch and poll (1289-1471)
  - the check runner (1706-1860)
  - the band (2269)
  - a pane closure of about 1,260 lines (2447-3706)
  - about 25 module `let`s

  Item 4 moves the row rules only.
- **Proposed change.** Split into `update.ts`, `pr-watcher.ts`, `check-runner.ts`, `band.tsx` and `pane.tsx`, each taking `$`, as its own plan step alongside item 4. It reduces collisions between parallel sessions, which the plan already cites.
- **Approval.** None.

### O5. Order item 4 against the ROADMAP's Findings redesign
- **Problem.** ROADMAP plans two changes: "Claude writes its own items" (`:5-7`) and "calls replace Findings" (`:11`). That is open Decision 1 in `docs/plans/instructions.md`.
  - Item 4 first does not mean redoing it. Tabs, keys, presses and the cursor carry over, and centralizing the Findings rules makes the switch cheaper.
  - No plan says that a hookless client, such as Claude mode, would depend on tool-written items. That client would have no card either.
- **Proposed change.** Name the dependency in `architecture.md`, and point at Decision 1.
- **Approval.** A product decision for Pete.

### O6. Single version source and build identity
- **Problem.** `0.1.0` is written by hand in `codex/plugin/.codex-plugin/plugin.json:3` and `codex/src/server.ts:178`. The Claude Code manifest and marketplaces have no version. A reinstall overwrites the same `0.1.0` folder.
- **Proposed change.** Have `build.mjs` inject the manifest version with an esbuild define. Do not embed the commit hash in the committed bundles: `--check` would always report stale.
- **Approval.** Yes. This is release tooling.

### O7. Glossary and naming
- **Proposed change.**
  - Add GLOSSARY entries: host, client, agent, the engine's surface, inbox view, the Codex Inbox tab, inbox model, press, handed off.
  - Fix the opening "a Claude Code session" (`GLOSSARY.md:3`).
  - "Tab" names both the pane's inner tabs and Codex's whole Inbox tab (`tabSeenAt`, `isTabOpen`, `TAB_URI`). Codex's model text calls Findings a "section" (`codex/src/texts.ts:13`), while its UI draws a tab.
  - `tab.tsx:12` redeclares `Tab` and `Settled`.
- **Approval.** Renaming the stored `tabSeenAt` or the `ui://inbox/tab` URI needs approval. Code-only renames do not.

### O8. Codex check-capture health signal
- **Problem.** `commandEnds` matches Codex's private transcript JSONL shape exactly and silently skips anything else. Only a hand-written fixture tests it (`codex/src/transcript.ts:69-95`, `codex/tests/helpers.ts:39`). Drift is already visible: the plan names stdout and stderr, while the code reads `aggregated_output`.
- **Proposed change.** Record and show "checks not tracked" when a turn's activity has shell commands but no parsed rows. Keep fixtures copied from real Codex releases.
- **Approval.** None.

### O9. Tone colors per renderer
- **Problem.** `codex/src/tab.html:15` copies `LIGHT_TONES` and `DARK_TONES` (`register.tsx:291`). They are checked against the tab's fallback backgrounds, not the host's `--color-background-primary`.
- **Proposed change.** Put tone names in the view model, and give each renderer its own colors, checked against its own backgrounds. One shared hex file would carry unchecked values.
- **Approval.** None.

## 5. Proposed revised order

0. **Small, independent fixes now.** Each is local and cheap, and several are live wrong behavior:
   - the tab text (I5)
   - reloading after `/clear`, `/resume` and `/branch` (I9)
   - `readState` failing closed (I17)
   - the Codex open reveal rule (I16)
   - pass a source to the fork catch-up (I13)
1. **Claude Code in the desktop app.** Live local Code-mode test, gate fix, desktop surface tests, cost approval (I1). It blocks the cheapest third client, and it decides how many renderers item 4 serves.
2. **Honest checks.** Fail on skips, install Codex tools, remove the `claude-code` import from shared code (I2, I3). Every later step happens in worktrees that this gate must cover.
3. **Shared contract suite and measurement harness** (I12, I13). Item 4 and any text change need a gate across hosts and models.
4. **Model-read texts from `Host`, AGENTS.md rewritten** (I4, plus the band sentence from I11). This removes the copies before a third client multiplies them. Measure first.
5. **Shared update step and Codex catch-up.** Persist the mod's recovery state (I5, I10; I10 needs approval). One failure rule before the view model draws status and fold state from it.
6. **Item 4 as ordered sub-steps:**
   - 4a. Press contract: vocabulary, target, outcome, executor (I6, I19).
   - 4b. Shared upgrade function and `LastAction` migration (I7, I8). Needs approval.
   - 4c. Capability fields.
   - 4d. View model in a host-neutral module, including the summary count (O1, O2).
   - 4e. Renderers.
   - Optional: the folder move and `register.tsx` split just before 4d (O1, O4).

   Presses and saved shapes must be settled before rows carry them.
7. **Item 5, reproducible bundles,** with bundle smoke tests and a version source (I23, O6; O6 needs approval). These are worth more once the bundles are exercised.
8. **Claude-mode spike** on the four unknowns. Then the server seam and app-only gating (O3, I21). Do not build an adapter before the unknowns are answered.
9. **Cross-client session record and index** (I15). Needs approval. It is a prerequisite for "every open session in one view", not for the Claude app.

Codex robustness (I18, I20, I24) and the engine version policy (I22) can run in parallel at any point. They are local to Codex, or policy decisions.

## 6. Refuted or narrowed claims

- **Refuted:** "Closed items store `how: 'claude'` even when Codex closed them." `architecture.md` item 2 (lines 65-66) and the `closeByAgent` comment (`hooks/ledger.ts:628`) already record this as intended, pending approval for a stored rename.
- **Narrowed:** "A hand-off is stored three ways." `Check.fixSentAt` and `PR_FIXES_SENT` record fix requests, which are a different concept from `LastAction.isHandoff`. "Fix sent" is already in the glossary.
- **Narrowed:** "Codex's `turnsApplied` divergence is unnoticed." It is a deliberate stopgap, commented at `update.ts:129-130`. Only the tab text and the missing shared rule are new.
- **Narrowed:** "Codex treats session ids differently across `/clear`." Unverified. Codex's `cleared()` is correct either way, so only the mod has the bug.
- **Narrowed:** "Splitting `types/index.d.ts` fixes the Codex type check." `skipLibCheck` covers that file. Only `ledger.ts:1` causes the failure.
- **Narrowed:** "`core.ts` cannot be reused because it imports `CODEX`." `press()` does not use `CODEX`. The obstacles are `SessionState` and the hardcoded done texts.
- **Narrowed:** "A bundle smoke test would catch `node:*` imports or a broken tab inline." The esbuild browser build and `build.mjs:37` already catch those.
- **Narrowed:** "Put the commit hash in the committed bundles." A bundle cannot contain its own commit's hash, and `--check` would always fail.
- **Narrowed:** "A full `Agent` plus `Surfaces` split of `Host` is needed for the Claude app." Code mode raises `AbovePrompt`, so `CLAUDE_CODE` wording is right there. Only the inline pane wording is wrong.
- **Narrowed:** "A data-driven protocol spec that generates `systemText`." Not needed for sync. It is a model-text change requiring measurement.
- **Narrowed:** "A full store fails invisibly." The pane shows a failed update. It just does not say why, and says a retry is coming.
- **Narrowed:** "The `LastAction` merge is a large migration." It is a few-line mapping per host. It is still a stored-value change needing approval.
- **Narrowed:** "Item 3 is falsely marked done." Item 3 covers what it lists, and the plan already defers presses, `LastAction` and the turn recorder. The gaps are the copied update-apply step (I5) and the Codex Stop path (I18).
- **Narrowed:** "Cross-folder imports are verified." Verified with `claude plugin validate` only, not a live load.
