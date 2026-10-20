# Map tab in every look

Status: proposed

The Map is a fourth inbox tab. It shows the session's goal, what the agent is doing now, the subagents it started, and the results the session has reached. This plan builds it on the shared session code, so all four looks draw it from one `sessionView`: the Claude Code terminal, the Claude desktop app's pane, the Codex Inbox tab and the omp panel.

Every part ships in all four looks. A part ships one look short only when a host check (step 0) shows the host cannot support it. That gap then goes in `hooks/clients.ts` and in "Differences on purpose" in `docs/looks.md`, in the same step.

The build order:

0. Host checks: short live runs that settle what each host can do.
1. Milestones.
2. Session fields, `MapView` and the sample's Map data. Nothing new is drawn yet.
3. Tab plumbing: the types and filters a page tab needs.
4. Draw the Map in each look.
5. The "Working…" line.
6. The `progress` tool for the main agent.
7. Subagent rows.
8. Subagent progress.
9. Docs and the full live pass.

Each step needs the one before it. The sections below follow the same order and name their step.

## Decide now

1. **When does the Map reach `main`?**
   - Recommended: keep every step on the `map-port` branch. Merge once, after the live pass passes in all four looks.
   - Reason: `main` ships to every new install, and you said the Map is not ready. Steps 1, 4, 6 and 8 change text a model reads, which would reach every install on push.
   - A setting to hide the Map instead would add an option nobody asked for, and code to remove later.
2. **How does Codex learn a subagent's task name?**
   - Why it matters: a row named only "Subagent" tells you nothing.
   - Recommended: read the `spawn_agent` call from the parent's rollout at SubagentStart. The rollout is the conversation file Codex writes. This adds no hook and follows your "rollout at Stop" choice for shell output.
   - If step 0 finds the task text unreadable there (a map branch commit says it arrives encrypted), approve a new PostToolUse hook entry matched only to `spawn_agent`? It reads the name from the tool's response. It goes in `codex/plugin/hooks/hooks.json`, so each person must trust it before it runs. `docs/plans/client-parity.md` says Codex adds no PostToolUse hook; that line would narrow to shell output.
   - Either way, no existing hook entry changes. Codex keys trust by an entry's event and position, and a changed entry stops running until the person trusts it again. Widening today's PreToolUse matcher would switch off activity lines for every installed user.

"Milestones first" is already settled. It answered "Ship milestones before planned steps?", so planned steps stay out of scope.

## Terms

Terms from `GLOSSARY.md`: Card, Band, Pane, New row, Catch-up, Host, Look, Difference on purpose and Parity record. The new ones:

- **Ledger:** the saved record of a session's card, items, findings and closed records (`Ledger` in `types/index.d.ts`).
- **Inbox model:** the model call after each reply that reads the exchange and updates the ledger.
- **DONE line:** a line the inbox model writes for one result the agent finished.
- **The mod:** the inbox in Claude Code. The terminal and desktop looks share its code, `hooks/register.tsx`.
- **omp:** the oh-my-pi coding agent, which has its own host in `omp/`.
- **Milestone:** one result the session reached, with where it came from and when.
- **Listed tab:** a tab of inbox rows you answer or close: Needs you and Findings.
- **PRs tab:** the tab of your pull requests. Its rows can be new rows, but it has its own counts and buttons, so it is not a listed tab.
- **Page tab:** a tab that shows a page instead of rows. It has no count, no buttons and no row selection. The Map is the only one.
- **Subagent row:** one line on the Map for a subagent the main agent started.
- **Progress text:** a short line an agent sets with the `progress` tool to say what it is doing now.
- **Rollout:** the file Codex writes for each conversation. The Codex host already reads it at Stop.
- **Fork:** a conversation started from another one, which continues its ledger.
- **Compact:** the host shortening the conversation's history. It is not a new session.
- **Done message:** the message the inbox sends the agent about rows you marked done. It waits while a turn runs (`doneWake` in `hooks/presses.ts`).
- **Client:** a custom-drawn control in the desktop pane that takes clicks over its whole shape.
- **Live pass:** the release checks in section 4 of `docs/release.md`, run by hand in each look.
- **Host check:** a short live run that settles a host fact before code depends on it. It ships no code. (The word "probe" is kept for the stand-in MCP server in `evals/probe.ts`.)

Numbers in this plan (the cap of 200, the 30 shown, 60 characters, 8 words, the 4 in `card.done`, 3 and 6 DONE lines) are kept from the map branch. Change one only with a reason.

## Source commits

The `map` branch holds the first build of this design. It cannot be cherry-picked: it forked before `hooks/session.ts`, the shared catch-up and omp existed. Each step ports from these commits and rebuilds the code on the current shape.

| Commit  | What it holds                                                                         | What changes in the port                                                                            |
| ------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3873967 | Milestones in the ledger                                                              | Catch-up count moves into `systemText`; the flag goes through `appliedCatchUp`.                     |
| 5345f96 | The Map tab in three looks, and `FRAMED_TAB_LAYOUTS` for the docked terminal          | `MapView` moves into `sessionView`; omp gets its own drawing.                                       |
| 6d1d6b5 | Evals, tests and docs                                                                 | The `evals/run.ts` changes port too.                                                                |
| 1dc3689 | Four tabs fit the narrow desktop pane (`isEachFramed`) and the docked terminal steps  | Ported as is.                                                                                       |
| a1bf881 | "Working…"                                                                            | State moves into `Session`, with one shared rule.                                                   |
| 43e5386 | Subagent rows in the mod                                                              | Rows move into `Session`.                                                                           |
| db9f1e8 | Subagent rows in Codex                                                                | Task name comes from the rollout, per decision 2.                                                   |
| 1708383 | Kept finished rows, pruning                                                           | Running rows stop only at a host's start event.                                                     |
| aeaf700 | The `progress` tool                                                                   | Rebuilt on the current private schemas in `hooks/tools.ts`, with a `Host.progressTool` name.        |
| e4e0024 | The AGENTS.md "New features" rule                                                     | Lands in step 9, since you said it waits for the Map merge.                                        |

The map branch's `docs/plans/session-progress.md` and `docs/plans/multi-client-architecture.md` are not ported. This plan replaces them.

## Milestones (step 1)

**Behavior.** The Map lists results newest first, with their ages. A milestone has one of three sources:

- **done:** a DONE line from the inbox model.
- **answered:** a question you answered.
- **fixed:** a finding closed as fixed.

An answered or fixed milestone goes away if its row reopens, since the result no longer holds. A bare yes, a put-off and the Proceed/Not yet question add none, since they record no result.

**Per host.** The code is shared, so it applies in the mod, Codex and omp alike. All three catch up through `appliedCatchUp`, so the catch-up count applies in each. Codex and omp upgrade saved state through `upgradeSession`, and the mod through `upgradeDrawn`, which calls it.

**Owner.**

- `hooks/ledger.ts`: `applyUpdate`, `upgradeLedger`, `doneTexts`, the cap and the duplicate rules.
- `hooks/model-text.ts`: the DONE rule in `systemText`, and `ledgerBlocks`.
- `hooks/session.ts`: `appliedCatchUp` passes `isCatchUp` to `applyUpdate`. Today it passes no flag, so catch-up results would get per-reply times and the per-reply cap.

**Stored state.**

- `Milestone` and `Ledger.milestones` go in `types/index.d.ts`, with a default in `EMPTY`.
- The list is capped at 200. Past the cap, the oldest goes first, and an untimed one goes before a timed one.
- `upgradeLedger` seeds milestones from an old `card.done`, with no time.
- `card.done` stays as the newest 4 done milestones, built by `doneTexts`. Older builds and `carryText` still read it.
- `forkedFrom` copies milestones with the ledger, since a fork shares its parent's past.
- `cleared` resets them with the ledger.
- `hasLedger` counts milestones. Today it checks only the card, items and findings, so a parent whose only record is its results reads as empty, and Codex and omp skip the fork copy. A test covers a parent with milestones and no card.
- `isUnseen` counts milestones too, since a session with recorded results has been seen. A test covers it.

**Catch-up count.** A catch-up may write up to 6 DONE lines; an update after one reply, up to 3. Reason: when you come back to a long conversation, 3 results are not enough to show where it stands.

- The count becomes a parameter: `systemText(host, { isCatchUp })`. Each catch-up call site passes `true`: `catchUpPrompt`, which embeds `systemText` inline, and the system prompt for a catch-up in each host (`hooks/claude-host.ts`, `codex/src/update.ts`, `omp/src/host.ts`).
- Reason: the model sees one count in each call. A separate "at most 6" sentence beside "At most 3 lines" would show it two counts that disagree.
- Catch-up results get no time, since the model cannot date them.

**Model-read text.**

- `systemText` gets the new DONE rule and a `<listed>` block of results already shown, so the model does not repeat them.
- `ledgerBlocks` drops DONE from `<card>` and adds `<listed>`: the newest 8, or all of them in a catch-up.

**Checks.**

- The ported ledger tests, plus a unit test that `appliedCatchUp` applies the catch-up count and leaves catch-up results untimed.
- Port the `evals/run.ts` changes: the `results`, `result` and `noResult` checks, `upgradeLedger` on case ledgers, and the catch-up flag on its `applyUpdate` call. Without them the ported cases do not type-check, and a catch-up case can never pass the cap of 3.
- `./scripts/eval.sh` (inbox model, Sonnet and Codex) with the five cases from 6d1d6b5, plus one catch-up case that expects more than 3 results.
- An A/B run of the mod's `catchUpPrompt`. It runs on the agent's own model through `$.model.fork`, and no eval covers that path.

## The Map tab (steps 2 to 4)

**Behavior.**

- A fourth tab, "Map", with hotkey 4.
- From the top: the goal in bold, then "Now · …", then Subagents, then Running (the card's background work), then Milestones. Reason: what changes while you watch sits at the top, and the record of results sits below it.
- Milestones show the newest 30, then "N earlier".
- Each milestone has a ✓, colored by source: the done tone, the Needs you tone for answered, the Findings tone for fixed.
- When there is nothing yet, the tab reads "No map yet" with a hint.
- The Map has no count, because nothing on it waits for you. A count would read as work to do.
- The Map is never where the inbox moves you when rows arrive. Arrivals move you to rows that need you, and a result does not.

**Per host.**

- **Terminal.** Port `mapPage`, `markedRow` and `mapTextRow` into `hooks/register.tsx`. `readRowTab` guards every row path on the Map. The docked terminal gets `FRAMED_TAB_LAYOUTS` from 5345f96 with 1dc3689's steps; map-port does not have it yet. The narrow tab bar keeps the joined band, as you chose.
- **Desktop.** It shares `hooks/register.tsx` with the terminal. Two things differ:
  - The tabs are drawn in a Client (`hooks/tabs-client.tsx`), because the app's own pane tabs cannot be customized.
  - Four framed tabs need 37 columns, and the narrowest pane gives 34. So `desktopTabSizes` gets 1dc3689's last step, where only the shown tab keeps its frame (`isEachFramed`). Its widest case needs about 29 columns.
- **Codex.** `MapTab` in `codex/src/tab.tsx`, with its CSS in `codex/src/tab.html`. Following new rows and j/k skip the Map.
  - Map rows draw without the row motion in `codex/src/rows.ts`. Reason: nothing on the Map can be pressed or worked through, so a moving row would only pull your eye from the rows that wait.
  - Width is the real limit. Four tabs need about 330 to 360 px, and MCP Apps design from 320 px. If the bar overflows, `.tabs` wraps between tabs, never inside a label, as the terminal's tabs wrap. Reason: a label broken across two lines is hard to read.
- **omp.** Draw `SessionView.map` in `omp/src/panel.ts`. The tab bar shows Map with no count and no tone. `bandLines` uses `LISTED_TABS`, so Map stays out of the band. `followRows` skips it.
  - The tab line fits from about 57 columns, and the "esc to close" hint from about 72. Narrower, `fit()` cuts tab 4 with "…", but key 4 still opens it.

**Owner.**

- `hooks/view.ts`: `mapView`, `MapView`, `PageTab = 'map'`, `ShownTab = Tab | PageTab` and `isListedTab`.
- One name per set of tabs:
  - `ListedTab` stays the type for Needs you and Findings (`hooks/arrivals.ts`).
  - `ROW_TABS` becomes `LISTED_TABS`, built as an inclusion filter. As today's exclusion filter (every tab but PRs), it would make Map a listed tab.
  - In Codex, the local `Tab` (two tabs) becomes the shared `ListedTab`, `TAB_IDS` becomes `LISTED_TABS`, and the local `ShownTab` (three tabs) becomes the shared `Tab`. Today the same names mean different sets in Codex.
- `hooks/session.ts`: `SessionView` gains `map`, built inside `sessionView`, so every host gets it.
- `hooks/arrivals.ts`: `followTo` takes `LISTED_TABS`.
- `hooks/tones.ts`: no new tone. The tab bar takes a tone only from a tab with a count.
- `screenText` takes `{ label, isPage }`, so the inbox model knows the pane shows the goal and results, not rows. Every caller changes: `endTurn`, the mod, Codex and omp.

**Stored state.** Only the shown tab, which is UI state:

- The mod's `TAB` atom, upgraded in `upgradeState`.
- Codex: a new Codex-only `shownTab` beside `tabSeenAt` in `SessionState`, with its default in `emptyState`, typed in `Saved` and `upgraded`. The page adds it to the arguments it already sends with each view request, next to `replies`. The server saves it. The Stop hook (`endTurn` in `codex/src/core.ts`) and `codex/src/update.ts` pass it to `screenText`. Today Codex passes no tab, so its inbox model never hears which tab is shown.
- The Codex page's kept state restores the tab from the shared `TABS`, not a hardcoded list.
- omp: `PanelUi.tab`, held in memory. omp passes it to `screenText` and `endTurn`, where today it passes no tab.

**Model-read text.**

- `screenText` reaches the inbox model's `<screen>` block, not the agent. The model skips "anything the person already has on screen", so the Map wording can change what it records.
- Sending the shown tab also changes Codex's and omp's `<screen>` text on Needs you and Findings.
- `Host.mapIn` names where the Map is, in one pattern: "the Map tab of the /inbox pane" (Claude Code), "the Map tab of the Inbox tab" (Codex) and "the Map tab of the /inbox panel" (omp). The `progress` tool's answers and `progressRule` use it.

**Checks.** `./scripts/eval.sh` (inbox model, Sonnet and Codex) in steps 3 and 4, with a case where the Map is shown and a new question must still be recorded. The step list below has the drawing checks.

## The sample (step 2)

**Behavior.** The sample the inbox shows before a session has rows gains Map data: a goal, a Now line, one running and one finished subagent, and a few milestones. It shows you what the Map is for.

**Per host.** All four looks draw the same sample, seeded in the shared `demoSession`. The terminal and desktop draw it through `drawnSession`. Codex builds its samples in memory, and omp draws from the shared sample.

**Owner.** `demoSession` in `hooks/demo.ts`, plus `codex/src/demo.ts` and `omp/src/demo.ts` where they add host data.

**Stored state.** Only the mod saves a sample copy, in its DEMO atom, checked by `isDemoCopy`. A copy saved without Map data is upgraded with empty Map data instead of thrown away, since saved state outlives the code.

## Working… (fields in step 2, behavior in step 5)

**Behavior.** While the main agent's turn runs, the Map's Now line reads "Working…", or the main agent's progress text. A subagent's turn does not set it. It clears when the turn ends, when you interrupt, and when a new session starts. A compact does not count as a new session.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`. Set at the main `turn.start`, cleared at the main `turn.complete`. The desktop pane redraws only on events, and both are events.
- **Codex.** Set at a main-agent UserPromptSubmit. Cleared at Stop, at Interrupt, and at a SessionStart that is not a compact.
  - Interrupt is a new entry in `codex/plugin/hooks/hooks.json`. Existing entries stay as they are.
  - Stop does not run on an interrupt, so without a trusted Interrupt hook, "Working…" would stay until your next message.
  - Fallback, if step 0 finds the rollout marks an aborted turn: each view request reads it, so the tab's 3 s poll (`codex/src/settle.ts`) clears "Working…".
  - The same rollout read tells when the Interrupt hook is off: an aborted turn with no Interrupt heard makes `heardState` read `partial`, and the tab shows its existing hooks help. Without the rollout, an untrusted Interrupt hook cannot be told from a session where nobody interrupted.
- **omp.** Set at `agent_start`. Cleared at `agent_end` when `willContinue` is false, which also fires on an abort.
  - Not `before_agent_start`: it can run twice for one prompt, and a press queued during a run arrives as `message_start` without it.
  - Not `turn_start`: it fires once per model call inside one run.
  - Fallback, if step 0 finds Esc does not deliver `agent_end`: the host clears the flag when `ctx.isIdle()` reports idle at the next event it handles.

**Owner.** One shared rule in `hooks/session.ts`: `turnStarted(s)` and `turnEnded(s)` set `presence.isTurnRunning`. Each host calls them from its own events.

- In step 5, `SessionHost.isTurnRunning` switches its default to `presence.isTurnRunning`, and the mod's module-level `let isTurnRunning` goes away. This waits for step 5 because no host sets the field before then. Switching early would let Codex and omp send a Done message mid-turn.
- This changes the shared rule that holds back Done messages (`wakeForDone`) and the mod's away tick. Today the default is "a prompt is recorded" (`s.turn.person !== null`). That misses a turn with no prompt, and in Codex it stays set after an interrupt.
- `turn-working` covers Done-message timing too, since both read the same field. In Codex, an untrusted Interrupt hook with no rollout fallback also holds Done messages after an interrupt until the next prompt.

**Stored state.** `presence.isTurnRunning` and `presence.progress` in `Session`. `upgradeSession` defaults them to false and null. `cleared` resets both. `forkedFrom` takes neither, since the running turn belongs to the parent.

**Model-read text.** None.

**Checks.** `tests/hooks.test.ts`, `codex/tests/hook.spec.ts` and `omp/tests/host.spec.ts`, each with a `wakeForDone` case during a turn and after an interrupt. Then live in each look: start a turn, interrupt it, compact.

## The progress tool (step 6)

**Behavior.** A third agent tool, `progress { text }`. It keeps the first line, clipped to 60 characters.

- A main-agent call sets `presence.progress`, which replaces "Working…".
- A subagent call sets its own row's progress (step 8).
- A call from an agent with no row is refused with "Not shown: the Map lists only the main agent and the subagents it started."
- Repeating the same text writes nothing, so the age stays.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`. A `tool.describe` and `tool.call` handler for `progress`, with `isDeferred: false`. The `record` and `close` handlers return without passing the call on, so they never become activity lines for the inbox model. The `progress` handler does the same.
- **Codex.** A `progress` case in `callTool` in `codex/src/server.ts`.
  - A call is the main agent's when its turn metadata has no `parent_thread_id`, fork or not. It does not go through `turnOf`, which drops every call in a forked chat.
  - Keying: `sessionOf` reads `session_id` first. In a fork that may be the root chat's id, while the hooks key the fork's state by its own chat. Step 0 checks which ids a fork's call carries. If `session_id` is the root's, `progress` keys by `thread_id`.
  - `record` and `close` have the same latent keying problem. That fix is its own change, raised separately.
- **omp.** `tool()` in `omp/src/host.ts` takes the new name and label. Its `execute` calls `progressShown`.

**Owner.**

- `hooks/tools.ts`: `agentTools` gains the progress entry, its schema and `progressResult`.
- `hooks/session.ts`: a new `progressShown(s, caller, text)`. It does not go through `recorded`, which sends any name but `close` to `recordItem`.
- `hooks/model-text.ts`: `Host.progressTool`, beside `recordTool` and `closeTool`, since omp's tools are bare names.

Every site typed `'record' | 'close'` changes:

- the return type of `agentTools`;
- the mod's `runTool`;
- omp's `tool()` and its label, which falls through to "Inbox close";
- `evals/probe.ts`, which answers "Unknown tool" for any new name;
- `evals/omp-probe.ts`, which would send a third tool to `recordClose`;
- in `evals/agent.ts`: `Check.calls`, `PROBE_TOOLS`, `--allowedTools` and omp's `wanted` list. Every agent eval fails until all four change.

**Stored state.** `presence.progress`, from step 2.

**Model-read text.**

- The tool description: "at most 8 plain words… Call it as you start each step of a task that takes several steps, and skip it for one that takes one or two tool calls. Your reply still says what you did."
- `progressRule` at the end of `guidanceText`, naming `host.progressTool` and `host.mapIn`.

**Checks.**

- A test in each host that a progress call adds no activity line.
- `./scripts/eval.sh --suite agent --agent all`, with progress-multi-step (at least one call) and no-progress-one-liner (no calls).
- Live in each look.

## Subagent rows (fields in step 2, behavior in step 7)

**Behavior.** One row per subagent the main agent started.

- The row's text is the subagent's task.
- While it runs, the detail shows its progress text, or else its latest step, such as "Reading x" or "Editing x".
- Once it is done, the detail shows the first line of its final reply.
- Marks: ● running (muted), ✓ done, ✕ stopped (red).
- Age counts from the start while it runs, and from the end after.
- Finished rows stay until the next main turn, so you can read the result.
- A subagent's tool calls set its row's step. They are not the main agent's activity, so the inbox model does not read them as the main agent's work.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`. `agent.spawn` adds a row only when there is no `parentAgentId`, so a nested subagent gets none. `tool.call` with `agentId` sets the step. A subagent's `turn.complete` sets done on an answer and stopped otherwise. `$.agent.list()` prunes rows the engine reports ended.
- **Codex.** New SubagentStart and SubagentStop entries in `codex/plugin/hooks/hooks.json`, with an `agent_type` matcher so guardian reviews (Codex's own safety checks) get no row and no `progressRule`. A matcher keeps the rule out of their context; a check in code would run after the context is returned.
  - SubagentStart starts a row, with the task name per decision 2.
  - PreToolUse with `agent_id` sets the row's step and records no activity. Today it records activity for every call.
  - UserPromptSubmit with `agent_id` leaves the main turn alone, if step 0 finds it fires. Otherwise a subagent's prompt would become the main turn's and set "Working…".
  - SubagentStop ends the row. Interrupt stops every running row.
  - What step 0 must settle: whether a subagent's rollout shows its parent (to drop nested subagents) and how it ended (to tell done from stopped).
- **omp.** The parent extension listens on `pi.events` for `task:subagent:lifecycle` and `task:subagent:progress`. Started maps to running, completed to done, and failed or aborted to stopped. The step comes from `currentTool` or `lastIntent`. Only direct children reach the parent's bus, which matches the mod's rule.
  - These channels are omp's internal names, not a typed extension API. A test reads the names from the installed omp package, so a rename fails the build.

**Owner.** `hooks/session.ts`: `subagentStarted`, `subagentStep`, `subagentEnded` and `subagentsBefore` for pruning. `hooks/view.ts`: `subagentStep` wording and the Map's Subagents section.

**Stored state.** `Session.subagents: Subagent[]`, with `Subagent { id, task, state, step, progress, result, startedAt, at }`. Codex's queue of spawned task names stays a Codex field on `SessionState`. The list lives in `Session`, not a host atom, for three reasons:

- omp's `upgraded` drops any field outside `Session`.
- Codex hooks run as separate processes and need it saved.
- A list scoped to the conversation survives a switch or a fork.

`upgradeSession` defaults it to empty. `cleared` empties it. `forkedFrom` does not copy it, since those subagents run under the parent.

Running rows stop only at a host's start event, never on a state read. Codex and omp read state on every event, so a rule on read would stop every row each time.

- The mod: at load, any running row `$.agent.list()` does not list becomes stopped.
- Codex: a SessionStart that is not a compact, including a resume, stops every running row. A Codex subagent does not outlive the process that ran it.
- omp: `session_start` and `session_switch` stop every running row.

**Model-read text.** None of its own. The subagent receives `progressRule` (step 8).

**Checks.** Tests in each host, then a live run with a real subagent in each look: done, stopped and interrupted.

## Subagent progress (step 8)

**Behavior.** A subagent can set its own row's progress text. Its row then shows that text in place of its step, as you chose. A subagent reads no inbox guidance, so the host hands it `progressRule` when it starts.

**Per host.**

- **Terminal and desktop.** `agent.spawn` appends `progressRule` to the spawn prompt. A `tool.call` with `agentId` finds the row.
- **Codex.** SubagentStart returns `progressRule` as `additionalContext`. The server reads `parent_thread_id` and `thread_id` from the turn metadata to find the row. Subagent hooks use the parent session's id, so the root session holds the rows, and `sessionOf` keying a subagent's call to the root session finds the right list.
  - This needs a subagent to be offered plugin tools at all, `thread_id` to equal the hook's `agent_id`, and `additionalContext` to reach it. Step 0 checks all three.
- **omp.** The child loads the parent's extensions, but `isUnattended` refuses every call today.
  - Tell a subagent from print mode by its session file: a subagent's file sits in a folder whose name plus `.jsonl` is an existing session file. Print mode has no such parent.
  - Allow `progress` alone in a subagent. Every other call is still refused, and print mode still skips everything.
  - The parent is that folder's name plus `.jsonl`, and the agent id is the file name. A child with no session file gets the refusal.
  - The child's `before_agent_start` adds `progressRule` alone, not `guidanceText`, which carries `record` and `close`.
  - The "Sessions with no screen" row in `docs/looks.md` changes to match.

**Owner.** The same `progressShown`, keyed by the subagent's id.

**Stored state.** `Subagent.progress`.

**Model-read text.** `progressRule`, delivered at the subagent's start. No eval harness runs a subagent today. Check it with A/B runs (`claude -p` and `codex exec`, several runs per version, as `AGENTS.md` describes) and count the calls.

## New features in `hooks/clients.ts`

Each entry lands in the step that builds it, after its host check, together with its "Differences on purpose" row in `docs/looks.md`. `scripts/check-structure.mjs` fails a `different` or `unsupported` entry that has no row, so the two cannot land apart. Reasons must be plain string literals.

| FeatureId           | claude-code | codex                       | omp                                    |
| ------------------- | ----------- | --------------------------- | -------------------------------------- |
| `milestones`        | full        | full                        | full                                   |
| `map-tab`           | full        | full                        | full                                   |
| `turn-working`      | full        | full; if not, `different` A | full                                   |
| `progress-tool`     | full        | full                        | full                                   |
| `subagent-rows`     | full        | per step 0, B               | full; if not, `unsupported` C          |
| `subagent-progress` | full        | full; if not, `unsupported` D | full; if not, `unsupported` E       |

- **A** (no abort marker in the rollout): "Codex runs a plugin hook only after the person trusts it, and Stop does not run on an interrupt, so until the Interrupt hook is trusted, Working stays after an interrupt until the next message."
- **omp `turn-working`** stays full either way: the `ctx.isIdle()` fallback covers a missing `agent_end`.
- **B** (Codex `subagent-rows`): `full` if the subagent's rollout shows its parent and how it ended. Otherwise `different`, with only the limits step 0 confirms, for example: "SubagentStop gives no end reason, so a finished subagent row reads done unless the person interrupted." If `agent_type` cannot tell guardian reviews from the agent's own subagents, `unsupported`: "Codex SubagentStart does not tell the agent's subagents from its own safety reviews."
- **C** (frames do not reach `pi.events`): "omp sends an extension no event when a subagent starts or ends."
- **D** (no plugin tools, no matching id, or no context in a subagent): the reason states which one step 0 found, for example: "Codex does not offer plugin tools to a subagent."
- **E** (the child cannot find its parent, or its prompt edit has no effect): "An omp subagent's extension cannot tell which session started it."

The map branch's `docs/looks.md` rows name tokens in backticks. Each must name one of these ids or lose its backticks, or `check-structure.mjs` fails. Its "screen text" difference is dropped, since Codex now sends its shown tab.

## Build steps and checks

Every step runs `./scripts/check.sh`. After a shared-module change it rebuilds with `npm --prefix codex run build` and `npm --prefix omp run build`. Each commit stays on `map-port`. Rebase on `main` after each step, so the branch does not drift.

0. **Host checks.** No shipped code. Run them in the inbox-ui VM (the Tart virtual machine with the Claude app, Codex and the mod installed), with an isolated config. Never let a test reach an MCP server named `inbox`.
   - Codex: do Interrupt, SubagentStart and SubagentStop fire? With which `agent_type` for the agent's subagents and for guardian reviews? With which `session_id` and `agent_id`?
   - Codex: does UserPromptSubmit fire for a subagent's prompt?
   - Codex: is a subagent offered plugin tools? Does its metadata `thread_id` equal its hooks' `agent_id`? Does `additionalContext` reach it?
   - Codex: can the parent's rollout give the `spawn_agent` task name at SubagentStart? Does a subagent's rollout show its parent and how it ended? Does the rollout mark an aborted turn?
   - Codex: in a forked chat, which `session_id` and `thread_id` does a model's MCP call carry?
   - omp: do `task:subagent:*` frames arrive on `pi.events`? Does Esc deliver `agent_end`? Can a child extension tell it is a subagent and find its parent? Does a child's `before_agent_start` prompt edit take effect?
   - Record the Codex answers in `docs/reference/codex-plugins.md`. Record the omp answers in a new `docs/reference/omp.md`, since no omp reference exists.
1. **Milestones.** Ledger, upgrade, the catch-up flag and count, `systemText`, `ledgerBlocks` and the `evals/run.ts` port. Checks are in the Milestones section.
2. **Session fields, `MapView` and the sample.** `isTurnRunning`, `progress` and `subagents` in `Session`, with their upgrades and their behavior in `cleared` and `forkedFrom`. `mapView` in `sessionView`. `turnStarted` and `turnEnded` exist but no host calls them yet. Nothing new is drawn. Checks: `tests/session-script.ts` through `tests/session.test.ts`, `codex/tests/session.spec.ts` and `omp/tests/session.spec.ts`; loading a state saved by `main` in each host; loading the mod's saved sample copy.
3. **Tab plumbing.** `PageTab`, `ShownTab`, `isListedTab` and `LISTED_TABS`. Every `Record<Tab>` site, `followTo`, omp's `bandLines`, the Codex renames, the new `screenText` argument, and Codex's saved `shownTab`. Map is not in `TABS` yet, so no look draws it. The inbox model's `<screen>` text changes in Codex and omp. Checks: all test suites, and `./scripts/eval.sh`.
4. **Draw the Map.** Add Map to `TABS` and draw it, one commit per look, so a problem in one look can be reverted alone. Add `milestones` and `map-tab` to `hooks/clients.ts`. Checks:
   - the demo test's tab order in `tests/hooks.test.ts`;
   - desktop at its narrowest pane;
   - the Codex tab measured in a local page that hosts the built tab, in both themes and with reduced motion, then in the Codex side panel;
   - omp at 50, 60 and 80 columns;
   - `./scripts/eval.sh` with the Map-shown case.
5. **The Working… line.** Host events in each host, the Codex Interrupt entry, the rollout fallback, the switch of `SessionHost.isTurnRunning`, and the removal of the mod's `let isTurnRunning`. Add `turn-working` and its row. Checks are in the Working… section.
6. **The progress tool, main agent.** Every tool site, `Host.progressTool`, `progressRule`, and the activity-line tests. The eval-suite line in `AGENTS.md` and the text in `scripts/eval.sh` name `progress`. Add `progress-tool`. Checks are in the progress tool section.
7. **Subagent rows.** In each host, with the omp channel-name test. Add `subagent-rows` and its row.
8. **Subagent progress.** Add `subagent-progress` and its row. Checks: the A/B runs and a live run in each look.
9. **Docs and the full pass.**
   - `docs/looks.md`: owner rows; the "A tab" and "A saved field" rows, which still name `PluginState` and miss most tab sites; the omp "Switching tabs" row (`1`, `2` and `3`); and "Sessions with no screen".
   - `GLOSSARY.md`: Milestone, Map, Subagent row, Listed tab and Page tab. Card, which says no look draws it. Pane, which lists three tabs.
   - `README.md`: "three tabs" (line 109), the keys at lines 157 and 166, a Map section, and the step to trust the new Codex hooks.
   - `docs/plans/omp-look.md`: "three tabs" and "1, 2 and 3".
   - `docs/release.md`: "`1`, `2` and `3`" becomes "`1` to `4`". New live-pass rows: the Map; Working… (start, interrupt, compact); a subagent row (done and stopped); progress text; trusting the new Codex hooks; and, under Saved state, a `main` session that loads with milestones seeded.
   - `AGENTS.md`: the "New features" rule from e4e0024, and a note on testing the subagent progress rule.
   - Then every check in `docs/release.md`, the live pass in all four looks, the merge question, and the release notes.

## Risks

- **Codex hook trust.** Interrupt, SubagentStart and SubagentStop stay off until you trust them. The README and the release notes say so.
- **omp's internal channels.** omp could rename `task:subagent:*`. The step 7 test catches a rename at build time.
- **Codex width.** The Codex side panel's width is not documented. Four tabs may wrap there.
- **Model behavior.** The new DONE rule could change which results the card keeps. The progress rule could make agents call a tool on short tasks. The evals cover both, but only for the main agent.
- **Saved subagents.** Rows are now saved. Without the stop-at-start rule, a crash would leave rows running.

## Out of scope

- Planned steps and a Next section, from a host plan tool or an inbox `plan` tool.
- A Map across sessions.
- PR milestones. Codex now reads shell output at Stop, so this is possible in every host, but it is a separate feature.
