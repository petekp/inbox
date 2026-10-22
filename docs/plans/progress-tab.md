# The Progress tab in every look

Status: proposed

## Summary

The Progress tab is a fourth inbox tab. It shows the session's goal, what the agent is doing now, the subagents it started, and the results the session has reached. All four looks draw it from one shared `sessionView`: the Claude Code terminal, the Claude desktop app's pane, the Codex Inbox tab and the omp panel.

- **Every part ships in every look.** A part ships one look short only when a host check (step 0) shows the host cannot support it. The gap then goes in `hooks/clients.ts` and in "Differences on purpose" in `docs/looks.md`, in the same step.
- **One merge.** Every step stays on the `progress-tab` branch. It merges to `main` once, after the live pass passes in all four looks.
- **Text a model reads changes in steps 1, 3, 4, 6 and 8.** Each of those steps runs the evals its section names.
- **Two results may come back to you.** Step 4 measures whether the label "Progress" hides the desktop pane's Needs you and Findings counts at some widths. Step 0 shows whether Codex needs a new hook entry to learn a subagent's task name. You approved that entry if it does.
- **Each person trusts the new Codex hooks once.** Until they do, Codex shows no subagent rows.

The build order:

0. Host checks: short live runs that settle what each host can do.
1. Milestones.
2. Session fields, `ProgressPage` and the sample's Progress data. Nothing new is drawn yet.
3. Tab plumbing: the types and filters a page tab needs.
4. Draw the Progress tab in each look.
5. The "Working…" line.
6. The `step` tool for the main agent.
7. Subagent rows.
8. Stated steps for subagents.
9. Docs and the full live pass.

Each step needs the one before it. The sections below follow the same order and name their step.

## The name

The tab is called Progress everywhere: in its label, code identifiers, stored values, FeatureIds, eval cases and file names. The first build of this feature, on the `map` branch, used the working name Map.

- **The agent's tool is `step`.** An agent calls it to say which step it is on, and the Progress page shows that line, the stated step. Without one, a subagent's row shows its tool step, worked out from its tool calls. In code the page is `ProgressPage`, built by `progressPage` and held in `SessionView.progressPage`. The stated step is `statedStep` and the tool step is `toolStep`.
- **The label lives in one place:** the `label` of the Progress entry in `TABS` in `hooks/view.ts`. All four looks draw the tab bar from `TABS`, and `screenText` takes the label from it.
- **No text an agent reads names the tab.** The `step` tool's description, its answers, its refusal and `stepRule` say where the text shows with `host.surface` ("the /inbox pane", "the Inbox tab", "the /inbox panel"). The empty page's text names no tab either.
- **The name is final at the merge.** The page tab id is saved, so a rename after it ships changes stored state and needs an upgrade in each host, besides the label, the docs and the evals.
- **Names in this plan that are not contracts:** type and function names, eval case ids, the Codex page's `sessionStorage` copy (it is removed on read and checked by version), the `progress-tab` branch and this file's name.

**Stored and wire names, fixed now.** Each outlives the code or crosses a process boundary, so it must not change after it ships:

- The page tab id `'progress'`: in the mod's new `PAGE` atom, Codex's `SessionState.shownTab`, and the tab the Codex page sends with each view request.
- The mod's atom key `page`, and Codex's field name `shownTab`.
- `Ledger.milestones`, and `Milestone { id, source, text, detail, ref, at }` with `source` one of `done`, `answered`, `fixed`. `detail` is the person's answer or the change that fixed a finding. `ref` is the id of the item or finding, for those two sources. `at` is null when the time is unknown.
- `presence.isTurnRunning` and `presence.statedStep` in `Session`.
- `Session.subagents`, and `Subagent { id, task, state, toolStep, statedStep, result, startedAt, at, transcriptPath }` with `state` one of `running`, `done`, `stopped`. `transcriptPath` is Codex's path to the subagent's rollout, named like `SessionState.transcriptPath`, and is null elsewhere.
- The new `DemoCopy` fields `subagents` and `presence`, saved in the mod's DEMO atom.
- The tool name `step` with its one argument `text`. Claude Code and Codex see it as `mcp__inbox__step`, omp as `step`.
- The FeatureIds `milestones`, `progress-tab`, `turn-working`, `step-tool`, `subagent-rows` and `subagent-step-tool`. `scripts/check-structure.mjs` ties them to `docs/looks.md` rows.
- The position of the new Codex hook entries. Codex keys trust by an entry's event and position, so new entries are appended and existing ones never move.

## Decisions

1. **When does the Progress tab reach `main`?** Decided: once, after the live pass passes in all four looks. Every step stays on the `progress-tab` branch until then.
   - Reason: `main` ships to every new install, and you said the feature is not ready. Steps 1, 3, 4, 6 and 8 change text a model reads, which would reach every install on push.
   - A setting to hide the tab instead would add an option nobody asked for, and code to remove later.
2. **How does Codex learn a subagent's task name?** Decided, in this order:
   - Why it matters: a row named only "Subagent" tells you nothing.
   - First: at SubagentStart, read the first row of the subagent's own rollout. The rollout is the conversation file Codex writes. Its first row, `session_meta`, names the spawn: `agent_path` ends in the task name, and `depth` says how deep the subagent sits. Both sit in `source.subagent.thread_spawn`, and `agent_path` is also a top-level field. SubagentStart's `transcript_path` is that file, and Codex writes the row before the hook runs. Reason: it adds no hook, needs no name queue, and `depth` also drops nested subagents.
   - Step 0 settled this: the row held `agent_path` (`/root/<task_name>`) and `depth` when SubagentStart ran, in Codex 0.163.0-alpha.11 (`docs/reference/codex-plugins.md`). The next two choices are not needed.
   - If step 0 finds no task name there: read the `spawn_agent` call from the parent's rollout. That fails for a subagent's own subagent, whose spawn call sits in the subagent's rollout, and it can run before the parent's row is written.
   - If both reads fail: a new PostToolUse entry matched only to `spawn_agent`, which reads the name from the tool's response. You approved it for this case. Each person must trust it before it runs, and `docs/plans/client-parity.md`'s "no PostToolUse hook" line narrows to shell output.
   - In every case, no existing hook entry changes. A changed entry stops running until the person trusts it again, so widening today's PreToolUse matcher would switch off activity lines for every installed user.
3. **What is the feature called?** Decided: Progress, 8 letters. Its width costs, estimated from the sizing formulas and not yet measured:
   - Desktop: about 6 letters or fewer keeps the Needs you and Findings counts at every pane width that keeps them today (36 columns and up). With "Progress", the step that keeps the counts needs about 39 columns, so panes of 36 to 38 columns would lose counts they show today. The narrowest pane (34 columns) still fits the tabs without counts. Step 4 measures this. If the estimate holds, the choice between a shorter name and losing the counts at those widths goes back to you before the merge.
   - omp: each letter past 3 moves the tab line's fit from 57 columns and the "esc to close" hint from 72 columns up by one. With "Progress", that is 62 and 77 columns.
   - Codex: four tabs need about 330 to 360 px with a 3-letter label. "Progress" wraps the bar sooner. The bar wraps between tabs, never inside a label.

"Milestones first" is already settled. It answered "Ship milestones before planned steps?", so planned steps stay out of scope.

## Terms

Terms from `GLOSSARY.md`: Card, Band, Pane, New row, Catch-up, Host, Look, Difference on purpose and Parity record. The new ones:

- **Progress tab:** the tab this plan adds. Its page shows the goal, the Now line, subagents and milestones.
- **Ledger:** the saved record of a session's card, items, findings and closed records (`Ledger` in `types/index.d.ts`).
- **Inbox model:** the model call after each reply that reads the exchange and updates the ledger.
- **DONE line:** a line the inbox model writes for one result the agent finished.
- **The mod:** the inbox in Claude Code. The terminal and desktop looks share its code, `hooks/register.tsx`.
- **omp:** the oh-my-pi coding agent, which has its own host in `omp/`.
- **Milestone:** one result the session reached, with where it came from and when.
- **Listed tab:** a tab of inbox rows you answer or close: Needs you and Findings.
- **PRs tab:** the tab of your pull requests. Its rows can be new rows, but it has its own counts and buttons, so it is not a listed tab.
- **Row tab:** a tab of rows: Needs you, Findings and PRs. The shared type `Tab` names this set.
- **Page tab:** a tab that shows a page instead of rows. It has no count, no buttons and no row selection. The Progress tab is the only one.
- **Subagent row:** one line on the Progress page for a subagent the main agent started.
- **Stated step:** a short line an agent sets with the `step` tool to say which step it is on.
- **Tool step:** a subagent's latest step, worked out from its tool calls, such as "Reading x".
- **Rollout:** the file Codex writes for each conversation, one JSON row per event. The Codex host already reads it at Stop. A subagent has its own rollout.
- **Fork:** a conversation started from another one, which continues its ledger.
- **Compact:** the host shortening the conversation's history. It is not a new session.
- **Done message:** the message the inbox sends the agent about rows you marked done. It waits while a turn runs (`doneWake` in `hooks/presses.ts`).
- **Client:** a custom-drawn control in the desktop pane that takes clicks over its whole shape.
- **Live pass:** the release checks in section 4 of `docs/release.md`, run by hand in each look.
- **Host check:** a short live run that settles a host fact before code depends on it. It ships no code. (The word "probe" is kept for the stand-in MCP server in `evals/probe.ts`.)

Numbers in this plan (the cap of 200, the 30 shown, 60 characters, 8 words, the 4 in `card.done`, 3 and 6 DONE lines) are kept from the map branch. Change one only with a reason.

## Source commits

The `map` branch holds the first build of this design. It cannot be cherry-picked: it forked before `hooks/session.ts`, the shared catch-up and omp existed. Each step ports from these commits and rebuilds the code on the current shape. Port each file from the map branch's head, so later fixes come along.

| Commit  | What it holds                                                                        | What changes in the port                                                                        |
| ------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 3873967 | Milestones in the ledger                                                             | The DONE count moves into the prompts; the flag goes through `appliedCatchUp`.                  |
| 5345f96 | The tab in three looks, and `FRAMED_TAB_LAYOUTS` for the docked terminal             | The page view moves into `sessionView`; omp gets its own drawing; every ✓ takes the done tone.  |
| 6d1d6b5 | Evals, tests and docs                                                                | The `evals/run.ts` changes port too.                                                            |
| 1dc3689 | Four tabs fit the narrow desktop pane (`isEachFramed`) and the docked terminal steps | Gains a step that keeps counts (see Desktop).                                                   |
| f082c0e | Two eval cases accept quoting or escaping as the encoder result                      | Ported with the cases. Without it, two cases fail a right Codex answer.                         |
| 96e68a0 | `docs/looks.md` wording for the docked tab layout                                    | Ported with the docs in step 9.                                                                 |
| 85fbc30 | One `addMilestones` for `closeItem` and `applyUpdate`; page view built only on draw  | The ledger and page code port from this shape, not the one before it.                           |
| a1bf881 | "Working…"                                                                           | State moves into `Session`, with one shared rule.                                               |
| 43e5386 | Subagent rows in the mod                                                             | Rows move into `Session`.                                                                       |
| db9f1e8 | Subagent rows in Codex                                                               | Task name and depth come from the subagent's rollout, per decision 2.                           |
| 1708383 | Kept finished rows, pruning                                                          | Running rows stop only at a host's start event or from a rollout's abort row.                   |
| aeaf700 | The `progress` tool, renamed `step` here                                                                  | Rebuilt on the current private schemas in `hooks/tools.ts`, with a `Host.stepTool` name.    |
| be09fb8 | Codex SubagentStart names no parent                                                  | Replaced: the subagent's `session_meta` row gives `parent_thread_id` and `depth`.               |
| e4e0024 | The AGENTS.md "New features" rule                                                    | Lands in step 9, since you said it waits for the merge.                                         |

The map branch's `docs/plans/session-progress.md` and `docs/plans/multi-client-architecture.md` are not ported. This plan replaces them.

## Milestones (step 1)

**Behavior.** The Progress page lists results newest first, with their ages. A milestone has one of three sources:

- **done:** a DONE line from the inbox model.
- **answered:** a question you answered.
- **fixed:** a finding closed as fixed.

An answered or fixed milestone goes away if its row reopens, since the result no longer holds. A bare yes, a put-off, the "List the choices" answer and the Proceed/Not yet question add none, since they record no result.

**Per host.** The code is shared, so it applies in the mod, Codex and omp alike. All three catch up through `appliedCatchUp`, so the catch-up count applies in each. Codex and omp upgrade saved state through `upgradeSession`, and the mod through `upgradeDrawn`, which calls it.

**Owner.**

- `hooks/ledger.ts`: `applyUpdate`, `addMilestones`, `upgradeLedger`, `doneTexts`, the cap and the duplicate rules.
- `hooks/model-text.ts`: `RESULTS_SYSTEM`, `resultsPrompt` and `resultsCatchUpPrompt`. `hooks/ledger.ts:withResults` merges the results call into the update.
- `hooks/session.ts`: `appliedCatchUp` passes `isCatchUp` to `applyUpdate`. Today it passes no flag, so catch-up results would get per-reply times and the per-reply cap.

**Stored state.**

- `Milestone` and `Ledger.milestones` go in `types/index.d.ts`, with a default in `EMPTY`.
- The list is capped at 200. Past the cap, the oldest by place in the list goes first. A milestone the same update just added is never the one to go, so a catch-up on a full list keeps its results. `upgradeLedger` puts the results it seeds from `card.done`, which have no time, at the start of the list, so they go first.
- `upgradeLedger` adds each `card.done` text that no done milestone has, untimed, under the existing duplicate rule. It compares clipped text, since `doneMilestone` clips. Reason: 0.2.10 keeps a saved `milestones` list but writes new results only to `card.done`. Seeding only an empty list would drop those results after a move back to this build. In normal use `card.done` equals the newest done milestones, so this adds nothing.
- `card.done` stays as the newest 4 done milestones, built by `doneTexts`. Older builds and `carryText` still read it.
- `forkedFrom` copies milestones with the ledger, since a fork shares its parent's past.
- `cleared` resets them with the ledger.
- `hasLedger` counts milestones. Today it checks only the card, items and findings, so a parent whose only record is its results reads as empty, and Codex and omp skip the fork copy. A test covers a parent with milestones and no card.
- `isUnseen` counts milestones too, since a session with recorded results has been seen. A test covers it.

**Duplicate results.** The model sometimes writes a DONE line for the work behind an answer or a fix, which the inbox already lists. Wording does not stop it reliably, so the list merges them when it is read.

- A milestone has an optional `turn`, the conversation turn it was made in. `applyUpdate` stamps its exchange's turn. `closeItem` stamps `ledger.turn`. A button press stamps none; `recordPrompt` stamps its answered milestone with the turn its message starts, when the message arrives through the sent record, so until then it merges with nothing. A catch-up's results get none, and neither do milestones saved before `turn` existed. No upgrade is needed: those never merge.
- `listResults` in `hooks/ledger.ts` returns the results newest first. A done milestone folds into an answered or fixed one of the same turn when their words overlap (two shared key words, or one when the line has at most two, not counting the generic verbs added, updated, fixed, created, changed, removed, wrote and set), unless they name different numbers. One answered or fixed result may take several DONE lines, kept in `merged`. Nothing draws it yet: `progressPage` calls it in step 2.
- The stored DONE milestones and `card.done` are unchanged.

**Catch-up count.** A catch-up may write up to 6 DONE lines. An update after one reply may write up to 3. Reason: when you come back to a long conversation, 3 results are not enough to show where it stands. `applyUpdate` keeps the newest 3, or 6 for a catch-up, and `resultsPrompt` and `resultsCatchUpPrompt` state the same counts. Catch-up results get no time, since the model cannot date them.

**Model-read text.** Results come from a separate model call, so the ledger call's text stays what it was on `main`.

- The ledger call reads `systemText` and `buildPrompt`, unchanged from `main`. Its DONE lines are dropped.
- The results call reads `RESULTS_SYSTEM` with `resultsPrompt`, or `resultsCatchUpPrompt` for a catch-up. The prompt holds `<listed>` (the newest 8 results, or all in a catch-up), `<open>`, `<findings>`, `<person>`, `<activity>` and `<reply>` or `<conversation>`. Its rule says to write no DONE line for the work that answers an `<open>` item or fixes a `<finding>`, since the inbox lists those itself.
- Both calls start together, so a reply waits for the slower one. `Ask` takes the system text with the prompt. `runUpdates` and `askOverConversation` make both calls, and `withResults` replaces the ledger update's DONE lines with the results call's. A failed results call leaves the ledger update applied with no new results. A failed ledger call fails the update as before.
- Reason: a DONE rule inside the ledger call moved unrelated cases, such as dismissed questions, by 10 to 20 runs of 32 with each wording. A separate call lets the results wording change without retesting the ledger cases.
- The mod's catch-up runs the ledger call as a fork of the conversation, and the results call over the transcript from `$.session.messages()`. With no transcript, it writes no results.

**Checks.**

- The ported ledger tests, plus:
  - a unit test that `appliedCatchUp` applies the catch-up count and leaves catch-up results untimed;
  - a round-trip test: a ledger saved with milestones, updated by 0.2.10's `applyUpdate`, then upgraded, keeps the new result.
- Port the `evals/run.ts` changes: the `results`, `result` and `noResult` checks, `upgradeLedger` on case ledgers, and the catch-up flag on its `applyUpdate` call. Without them the ported cases do not type-check, and a catch-up case can never pass the cap of 3.
- `./scripts/eval.sh` (inbox model, Sonnet and Codex) with:
  - the five DONE cases from the map branch's head, which carry f082c0e's looser encoder patterns;
  - one catch-up case that expects more than 3 results;
  - one case where the reply fixes an open finding and the person answers an open item, expecting a FIXED line, a CLOSED line and `results: 0`.
- An A/B run of the mod's `catchUpPrompt`. It runs on the agent's own model through `$.model.fork`, and no eval covers that path.

## The Progress tab (steps 2 to 4)

**Behavior.**

- A fourth tab, labeled "Progress", with hotkey 4.
- From the top: the goal in bold, then "Now · …", then Subagents, then Running (the card's background work), then Milestones. Reason: what changes while you watch sits at the top, and the record of results sits below it.
- Milestones show the newest 30, then "N earlier".
- Every milestone's ✓ takes the done tone. The detail says where it came from, as in "you answered" or "fixed". Reason: the Needs you tone is the inbox's "waits on you" color, and nothing on this page waits on you. A three-color legend would also teach a difference that changes nothing you do.
- When there is nothing yet, the page reads "Nothing here yet" with a hint. It names no tab, so a rename does not touch it.
- The tab has no count, because nothing on it waits for you. A count would read as work to do.
- The inbox never moves you to the Progress tab when rows arrive. Arrivals move you to rows that need you, and a result does not. New PRs still move an empty tab to PRs, as today.

**Per host.**

- **Terminal.** Port the map branch's page drawing (`mapPage`, `markedRow`, `mapTextRow`) into `hooks/register.tsx` under Progress names. `readRowTab` guards every row path while the page shows. The docked terminal gets `FRAMED_TAB_LAYOUTS` from 5345f96 with 1dc3689's steps; `progress-tab` does not have it yet. The narrow tab bar keeps the joined band, as you chose.
- **Desktop.** It shares `hooks/register.tsx` with the terminal. Two things differ:
  - The tabs are drawn in a Client (`hooks/tabs-client.tsx`), because the app's own pane tabs cannot be customized.
  - Width. `desktopTabSizes` gets a new step before the one that drops the counts: keep the counts, frame only the shown tab, gap 1. Then 1dc3689's last step, with no counts and only the shown tab framed (`isEachFramed`). Reason: 1dc3689's ladder drops counts before it drops frames, so a fourth tab with no count would hide the Needs you and Findings counts at widths that show them today. Estimated with a 3-letter label: four framed tabs with counts need 43 columns, the new step 34, the last step 29. The narrowest pane gives 34. "Progress" adds 5 columns to each: 48, 39 and 34. See "Decisions" for what that costs.
- **Codex.** `ProgressTab` in `codex/src/tab.tsx`, with its CSS in `codex/src/tab.html`. Following new rows and j/k skip the page.
  - Page rows draw without the row motion in `codex/src/rows.ts`. Reason: nothing on the page can be pressed or worked through, so a moving row would only pull your eye from the rows that wait.
  - Width is the real limit. Four tabs need about 330 to 360 px, and MCP Apps design from 320 px. If the bar overflows, `.tabs` wraps between tabs, never inside a label, as the terminal's tabs wrap. Reason: a label broken across two lines is hard to read.
- **omp.** Draw `SessionView.progressPage` in `omp/src/panel.ts`. The tab bar shows the tab with no count and no tone. `bandLines` uses `LISTED_TABS`, so the page stays out of the band. `followRows` skips it.
  - The tab line fits from about 57 columns, and the "esc to close" hint from about 72. Narrower, the line drops the `[n]` brackets first, then zero counts. Only then does `fit()` cut, and the shown tab's label always stays visible. Reason: today `fit()` cuts from the right, so at 50 columns no letter of tab 4 shows, and while it is the shown tab the bar marks no tab at all. Tab still cycles to the page.

**Owner.**

- `hooks/view.ts`: `progressPage`, `ProgressPage`, `PageTab = 'progress'`, `ShownTab = Tab | PageTab`, `isListedTab`, and the Progress entry in `TABS`, which holds the label.
- One name per set of tabs:
  - `Tab` stays the row tabs: Needs you, Findings and PRs.
  - `ListedTab` stays the type for Needs you and Findings (`hooks/arrivals.ts`).
  - `ROW_TABS` becomes `LISTED_TABS`, built as an inclusion filter. As today's exclusion filter (every tab but PRs), it would make the page a listed tab.
  - `ARRIVAL_TABS` is every row tab, in `hooks/arrivals.ts`. It replaces Codex's local `ARRIVAL_TAB_IDS`.
  - In Codex, the local `Tab` (two tabs) becomes the shared `ListedTab`, `TAB_IDS` becomes `LISTED_TABS`, and the local `ShownTab` (three tabs) becomes the shared `Tab`. Today the same names mean different sets in Codex.
- `hooks/session.ts`: `SessionView` gains `progressPage`, built inside `sessionView`, so every host gets it.
- `hooks/arrivals.ts`: `followTo` takes `ARRIVAL_TABS` in every host. Reason: every host follows PRs today (`pr-arrivals` is `full` in all three), and `followTo` reads `rows[t]`, so a page tab with no rows record would throw. The page tab stays out by type.
- `hooks/tones.ts`: no new tone. The tab bar takes a tone only from a tab with a count.
- `screenText` takes `{ label, isPage }`, so the inbox model knows the pane shows the goal and results, not rows. Every caller changes: `endTurn`, the mod, Codex and omp.

**Stored state.** Only the shown tab, which is UI state:

- The mod: `TAB` keeps its type, `Tab`. A new `PAGE` atom (key `page`) holds `'progress'` while the page shows, else null. Reason: `$.state` survives a reload of the module, so after a downgrade with `/reload-plugins` an older build reads `TAB` and indexes `rows[tab]`, which throws for an unknown id. An older build ignores a key it does not know. This also returns you to the row tab you left. `upgradeState` and the mod's draw also map any `TAB` value that is not a row tab to Needs you, and any `PAGE` value not in `TABS` to null, so a later revert cannot crash this build either.
- Codex: a new Codex-only `shownTab` beside `tabSeenAt` in `SessionState`, with its default in `emptyState`, typed in `Saved` and `upgraded`. The page adds it to the arguments it already sends with each view request, next to `replies`. The server saves it. The Stop hook (`endTurn` in `codex/src/core.ts`) and `codex/src/update.ts` pass it to `screenText`. Today Codex passes no tab, so its inbox model never hears which tab is shown.
- The Codex page's kept state restores the tab only if it is in the shared `TABS`. It is written as version 2 while a page tab shows, so an older page, which checks `kept.version !== 1`, drops it.
- omp: `PanelUi.tab`, held in memory. omp passes it to `screenText` and `endTurn`, where today it passes no tab.

**Model-read text.**

- `screenText` reaches the inbox model's `<screen>` block, not the agent. The model skips "anything the person already has on screen", so the page wording can change what it records.
- Sending the shown tab also changes Codex's and omp's `<screen>` text on Needs you and Findings.

**Checks.**

- `./scripts/eval.sh` (inbox model, Sonnet and Codex) in step 3, and again in step 4.
- A case declares its screen as `{ isOpen, tab, isPage }`, and `evals/run.ts` builds the text with `screenText` for each agent's host. Reason: a hand-typed screen sentence would not follow a wording change or the rename, and today the Codex model reads the mod's "/inbox pane" text.
- Step 3 adds one Codex case with the tab open on Needs you. Step 4 adds `progress-shown-records-question`: the page shows and a new question must still be recorded.
- A test in each host that a new PR still moves an empty Needs you tab to PRs.
- The step list below has the drawing checks.

## The sample (step 2)

**Behavior.** The sample the inbox shows before a session has rows gains Progress data: a goal, a Now line, one running and one finished subagent, and a few milestones. It shows you what the page is for.

**Per host.** All four looks draw the same sample, built by `demoView`. The mod saves a copy of it and draws it through `drawnSession`. `demoSession` derives from `demoView`, and Codex and omp draw from `demoSession`.

**Owner.**

- `demoView` and `isDemoCopy` in `hooks/demo.ts`, and `demoSession`, which derives from `demoView`.
- `DemoCopy` in `types/index.d.ts` gains `subagents` and `presence` (`isTurnRunning`, `statedStep`). Goal, Now text and milestones already come through `ledger`.
- `drawnSession` in `hooks/register.tsx` overlays `subagents` and those presence fields. Today it overlays only the ledger, stop, PR views, last actions and turn counts, so the sample would show the live session's subagents and Working… state.
- `codex/src/demo.ts` and `omp/src/demo.ts` only where they add host data.

**Stored state.** Only the mod saves a sample copy, in its DEMO atom, checked by `isDemoCopy`. A copy saved without the new fields gets empty ones instead of being thrown away, since saved state outlives the code.

## Working… (fields in step 2, behavior in step 5)

**Behavior.** While the main agent's turn runs, the Now line reads "Working…", or the main agent's stated step. A subagent's turn does not set it. It clears when the turn ends, when you interrupt, and when a new session starts. A compact does not count as a new session.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`.
  - Set at the main `turn.start`, cleared at the main `turn.complete`. The desktop pane redraws only on events, and both are events.
  - Cleared at load too: `bringBack` and the module's load reset `presence.isTurnRunning` and `presence.statedStep`, as `bringBack` already resets `stop` and `turn`. Reason: a reload or a quit can cut off `turn.complete`, and a saved true would then read Working… while idle, hold Done messages and stop the away tick. A turn the engine still runs sets the flag again at its next `turn.start`, which matches today's in-memory flag.
- **Codex.** Set at a main-agent UserPromptSubmit. Cleared at Stop and at a SessionStart that is not a compact.
  - Stop does not run on an interrupt. The rollout records an aborted turn as a `turn_aborted` row with reason `interrupted` (Codex `rollout/src/policy.rs`). So each view request and each press reads the rollout's tail before it reads the flag, and clears the flag when the last turn ended. The tab's 3 s poll (`codex/src/settle.ts`) then clears Working…, and the same read releases held Done messages, since `wakeForDone` runs after it.
  - No Interrupt hook entry. Reason: in Codex, only the tab's view requests and presses read the flag, and both read the rollout first. A hook would add a trust step for each person and change nothing they see. Add one, appended with `timeout: 3` and a single state write, only if step 0 finds the abort row reaches the file more than one poll late. Codex gives an Interrupt hook 1 s by default and 3 s at most.
  - A chat Codex quit during a turn has no end row. Codex runs no hook when a chat is opened, so Working… stays until the next message's SessionStart. Step 0 confirms this, and the `turn-working` row records it.
- **omp.** Set at `agent_start`. Cleared at `agent_end` when `willContinue` is not true. Esc ends the run with `stopReason: 'aborted'` and still emits `agent_end` (omp `agent-session.ts`), so no fallback is needed.
  - Not `before_agent_start`: it can run twice for one prompt, and a press queued during a run arrives as `message_start` without it.
  - Not `turn_start`: it fires once per model call inside one run.

**Owner.** One shared rule in `hooks/session.ts`: `turnStarted(s)` and `turnEnded(s)` set `presence.isTurnRunning`. Each host calls them from its own events.

- In step 5, `SessionHost.isTurnRunning` switches its default to `presence.isTurnRunning`, and the mod's module-level `let isTurnRunning` goes away. This waits for step 5 because no host sets the field before then. Switching early would let Codex and omp send a Done message mid-turn.
- This changes the shared rule that holds back Done messages (`wakeForDone`) and the mod's away tick. Today the default is "a prompt is recorded" (`s.turn.person !== null`). That misses a turn with no prompt, and in Codex it stays set after an interrupt.
- Codex's `isTurnRunning` reads the flag after the rollout read, so Done messages follow the same rule as the Now line.

**Stored state.** `presence.isTurnRunning` and `presence.statedStep` in `Session`. `upgradeSession` defaults them to false and null. `cleared` resets both. `forkedFrom` takes neither, since the running turn belongs to the parent.

**Model-read text.** None.

**Checks.**

- `tests/hooks.test.ts`, `codex/tests/hook.spec.ts` and `omp/tests/host.spec.ts`, each with a `wakeForDone` case during a turn and after an interrupt.
- A test in each host that loads a session saved with the flag true. The mod clears it. Codex clears it when the rollout's last turn ended.
- Live in each look: start a turn, interrupt it, compact.

## The step tool (step 6)

**Behavior.** A third agent tool, `step { text }`. It keeps the first line, clipped to 60 characters.

- A main-agent call sets `presence.statedStep`, which replaces "Working…".
- A subagent call sets its own row's stated step (step 8).
- A call from an agent with no row is refused with "Not shown: the inbox lists only the main agent and the subagents it started."
- Repeating the same text writes nothing, so the age stays.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`. A `tool.describe` and `tool.call` handler for `step`, with `isDeferred: false`. The `record` and `close` handlers return without passing the call on, so they never become activity lines for the inbox model. The `step` handler does the same.
- **Codex.** A `step` case in `callTool` in `codex/src/server.ts`.
  - A call is the main agent's when its turn metadata has no `parent_thread_id`, fork or not. It does not go through `turnOf`, which drops every call in a forked chat.
  - Keying follows the one rule step 0 sets (see "Codex session keys" in step 0).
  - `activityOf` in `codex/src/core.ts` skips the inbox's own tools (`CODEX.recordTool`, `closeTool` and `stepTool`). Reason: PreToolUse matches `mcp__.*` and the Stop-time rollout read turns MCP calls into activity too, so today Codex shows its own record and close calls to the inbox model as the agent's work. `activityOf` serves both paths, and the hook entry stays as it is, so it keeps its trust. This also removes record and close lines from Codex's `<activity>`, so `./scripts/eval.sh` runs again.
- **omp.** `tool()` in `omp/src/host.ts` takes the new name and label. Its `execute` calls `stepStated`.

**Owner.**

- `hooks/tools.ts`: `agentTools` gains the step entry, its schema and `stepResult`.
- `hooks/session.ts`: a new `stepStated(s, caller, text)`. It does not go through `recorded`, which sends any name but `close` to `recordItem`.
- `hooks/model-text.ts`: `Host.stepTool`, beside `recordTool` and `closeTool`, since omp's tools are bare names.
- `codex/src/core.ts`: `activityOf`.

Every site typed `'record' | 'close'` changes:

- the return type of `agentTools`;
- the mod's `runTool`;
- omp's `tool()` and its label, which falls through to "Inbox close";
- `evals/probe.ts`, which answers "Unknown tool" for any new name;
- `evals/omp-probe.ts`, which would send a third tool to `recordClose`;
- in `evals/agent.ts`: `Check.calls`, `PROBE_TOOLS`, `--allowedTools` and omp's `wanted` list. Every agent eval fails until all four change.

**Stored state.** `presence.statedStep`, from step 2.

**Model-read text.**

- The tool description: "at most 8 plain words… Call it as you start each step of a task that takes several steps, and skip it for one that takes one or two tool calls. Your reply still says what you did." It says the text shows in `host.surface` until your turn ends.
- `stepRule` at the end of `guidanceText`, naming `host.stepTool` and `host.surface`.

**Checks.**

- A test in each host that a step call adds no activity line. In Codex it covers the PreToolUse path and the rollout path.
- `./scripts/eval.sh` after the `activityOf` change.
- `./scripts/eval.sh --suite agent --agent all` with:
  - `step-multi-step`: at least one call and at most five, one per named step. Its prompt says file and shell tools are not connected, which is true only for Claude, so it runs for Claude only.
  - `no-step-one-liner`: no calls.
  - For Codex and omp, a case built from `files`: read one file and answer, expecting no step call.
  - `{ calls: 'step', max: 0 }` added to a few existing short record and close cases.
- Live in each look.

## Subagent rows (fields in step 2, behavior in step 7)

**Behavior.** One row per subagent the main agent started.

- The row's text is the subagent's task.
- While it runs, the detail shows its stated step, or else its tool step, such as "Reading x" or "Editing x".
- Once it is done, the detail shows the first line of its final reply.
- Marks: ● running (muted), ✓ done, ✕ stopped (red).
- Age counts from the start while it runs, and from the end after.
- Finished rows stay until the next main turn, so you can read the result.
- A subagent's tool calls set its row's step. They are not the main agent's activity, so the inbox model does not read them as the main agent's work.

**Per host.**

- **Terminal and desktop.** They share `hooks/register.tsx`. `agent.spawn` adds a row only when there is no `parentAgentId`, so a nested subagent gets none. `tool.call` with `agentId` sets the step. A subagent's `turn.complete` sets done on an answer and stopped otherwise. `$.agent.list()` prunes rows the engine reports ended.
- **Codex.** New SubagentStart and SubagentStop entries in `codex/plugin/hooks/hooks.json`, appended after today's entries, with no matcher. Reason for no matcher: guardian reviews (Codex's own safety checks) never fire either event, so a matcher filters nothing. Codex matchers are Rust regexes with no lookahead, so "every type but guardian" cannot be written, and a list of allowed types would drop subagents with custom roles.
  - SubagentStart starts a row, with the task name per decision 2. A `depth` above 1 gets no row, which matches the mod's rule. The row saves the hook's `transcript_path`, the subagent's own rollout, as `transcriptPath`.
  - Any hook that carries the row's `agent_id` (PreToolUse, UserPromptSubmit) marks it running. PreToolUse also sets the step and records no activity; today it records activity for every call. Reason: SubagentStart fires once per subagent, but a later turn from `send_input`, `followup_task` or `resume_agent` runs without it. A hook for a pruned row adds it back from its `transcript_path`.
  - UserPromptSubmit with `agent_id` returns no `inbox:` notes, and leaves `told`, `ledger.turn` and `turn.person` unchanged. Reason: today it runs `notePrompt` for every prompt, which hands the subagent the inbox notes and their close ids, moves `told` so the main agent can miss its next note, and adds the subagent's task to what the inbox model reads as the person's words.
  - SubagentStop marks the row done. It fires only at the normal end of a subagent's turn.
  - Stopped comes from the subagent's rollout. Codex runs no hook when a subagent's turn is aborted: Interrupt skips subagents, and an aborted turn returns before the stop hooks run. So the main Stop and each view request read each running row's rollout, and a `turn_aborted` row marks it stopped.
  - SessionStart and Stop act only for the main agent. If step 0 finds either fires in a subagent or guardian thread, the hook reads the first row of the `transcript_path` rollout and ignores the event when it names a parent or a subagent source. Otherwise a subagent's start would clear Working… and stop every running row.
- **omp.** The parent extension listens on `pi.events` for `task:subagent:lifecycle` and `task:subagent:progress`. Started maps to running, completed to done, and failed or aborted to stopped. The tool step comes from `currentTool` or `lastIntent`. Only direct children reach the parent's bus (omp `task/executor.ts`), which matches the mod's rule.
  - These channels are omp's internal names, not a typed extension API. `omp/src/host.ts` takes them from the `@oh-my-pi/pi-coding-agent/task/types` subpath, or types them against pi-wire's `BusChannel`. A rename then fails `npm --prefix omp run types`. Reason for no test: `scripts/check-structure.mjs` lets only `omp/src/host.ts` import omp's packages, and reading the package files from a test would be a source-text check.

**Owner.** `hooks/session.ts`: `subagentStarted`, `subagentToolStep`, `subagentEnded` and `subagentsBefore` for pruning. `hooks/view.ts`: `toolStepText` wording and the page's Subagents section. `codex/src/transcript.ts`: the `session_meta` read and the abort read.

**Stored state.** `Session.subagents: Subagent[]`, with `Subagent { id, task, state, toolStep, statedStep, result, startedAt, at, transcriptPath }`. Codex needs no name queue, since each row reads its own name. The list lives in `Session`, not a host atom, for three reasons:

- omp's `upgraded` drops any field outside `Session`.
- Codex hooks run as separate processes and need it saved.
- A list scoped to the conversation survives a switch or a fork.

`upgradeSession` defaults it to empty. `cleared` empties it. `forkedFrom` does not copy it, since those subagents run under the parent.

Running rows stop only at a host's start event or from an abort row in a Codex subagent's rollout, never on a plain state read. Codex and omp read state on every event, so a rule on read would stop every row each time.

- The mod: at load, any running row `$.agent.list()` does not list becomes stopped.
- Codex: a main-agent SessionStart that is not a compact, including a resume, stops every running row. A Codex subagent does not outlive the process that ran it.
- omp: `session_start` and `session_switch` stop every running row.

**Model-read text.** None of its own. The subagent receives `stepRule` (step 8).

**Checks.**

- Tests in each host. In Codex: a follow-up turn marks a done row running again; an abort row marks it stopped; a subagent's UserPromptSubmit returns no notes and changes no turn state.
- A live run with a real subagent in each look: done, stopped, interrupted, and in Codex a follow-up turn.

## Stated steps for subagents (step 8)

**Behavior.** A subagent can state its own step with the `step` tool. Its row then shows the stated step in place of its tool step, as you chose. The host hands the subagent `stepRule` when it starts, since it is not known to read the inbox guidance.

**Per host.**

- **Terminal and desktop.** `agent.spawn` appends `stepRule` to the spawn prompt. A `tool.call` with `agentId` finds the row.
  - Step 0 checks whether a subagent's system prompt already holds `inbox:guidance` and whether it is offered the `step` tool. If it holds the guidance, the append is dropped, and a `record` or `close` from a subagent is refused, as omp refuses it.
- **Codex.** SubagentStart returns `stepRule` as `additionalContext`. The server reads `parent_thread_id` and `thread_id` from the turn metadata to find the row, keyed by the rule step 0 sets.
  - This needs a subagent to be offered plugin tools at all, and `additionalContext` to reach it. Step 0 checks both. A subagent's hooks carry its thread id as `agent_id` (Codex `hook_runtime.rs`), so the row and the call share an id.
- **omp.** The child loads the parent's extensions in a normal spawn, but `isUnattended` refuses every call today. A subagent started in plan mode, or from a restricted session, loads no extensions and no extension tools (omp `task/structured-subagent.ts`, `sdk.ts`). It cannot get `step` or `stepRule`.
  - Tell a subagent from print mode by its session file. omp writes a subagent's file as `<parent>/<agentId>.jsonl` beside `<parent>.jsonl` (omp `session-manager.ts`). Print mode has no such parent.
  - Allow `step` alone in a subagent. Every other call is still refused, and print mode still skips everything.
  - The parent is that folder's name plus `.jsonl`, and the agent id is the file name. A child with no session file gets the refusal.
  - The child's `before_agent_start` adds `stepRule` alone, not `guidanceText`, which carries `record` and `close`.
  - The "Sessions with no screen" row in `docs/looks.md` changes to match.

**Owner.** The same `stepStated`, keyed by the subagent's id.

**Stored state.** `Subagent.statedStep`.

**Model-read text.** `stepRule`, delivered at the subagent's start. No eval harness runs a subagent. Check it with A/B runs, 5 runs per version in each host:

- **The mod:** a copy of the mod patched to run under `claude -p` and to skip its `$.store` writes, as `AGENTS.md` describes, with no MCP server named `inbox`.
- **Codex:** `codex exec` with `INBOX_IN_EXEC` set and a temporary `CODEX_HOME`, so the hook runs in an exec rollout and the installed plugin does not load.
- **omp:** a child session that loads `evals/omp-probe.ts` in place of the inbox.
- **Pass bar:** a subagent given a task of several steps calls `step` at least once in 4 of 5 runs. No subagent calls `record` or `close` in any run. A subagent asked for an exact output returns it unchanged in every run, since the rule changes every subagent's prompt.

Step 9 writes these prompts, the run count and the pass bar into `AGENTS.md`, so a later edit to `stepRule` reruns them.

## New features in `hooks/clients.ts`

Each entry lands in the step that builds it, after its host check, together with its "Differences on purpose" row in `docs/looks.md`. `scripts/check-structure.mjs` fails a `different` or `unsupported` entry that has no row, so the two cannot land apart. Reasons must be plain string literals.

| FeatureId           | claude-code | codex                         | omp                                            |
| ------------------- | ----------- | ----------------------------- | ---------------------------------------------- |
| `milestones`        | full        | full                          | full                                           |
| `progress-tab`      | full        | full                          | full                                           |
| `turn-working`      | full        | `different` A; maybe full     | full                                           |
| `step-tool`     | full        | full                          | full                                           |
| `subagent-rows`     | full        | full; if not, `different` B   | full; if not, `unsupported` C                  |
| `subagent-step-tool` | full        | full; if not, `unsupported` D | `different` E; if not even that, `unsupported` |

- **A** (a chat Codex quit during a turn): "Codex runs no hook when a chat is opened, so after Codex quits during a turn, Working… stays until the next message." If step 0 finds such a rollout does mark the turn ended, this becomes `full`.
- **B** (Codex `subagent-rows`): `full` if step 0 confirms the abort row in a subagent's rollout, the hooks a follow-up turn runs, and an end row in a rollout Codex quit during a turn. Otherwise `different`, with only the limits step 0 confirms, for example: "Codex runs no hook when a chat is opened, so after Codex quits, a subagent row reads running until the next message."
- **C** (frames do not reach `pi.events`): "omp sends an extension no event when a subagent starts or ends."
- **D** (no plugin tools or no context in a subagent): the reason states which one step 0 found, for example: "Codex does not offer plugin tools to a subagent."
- **E** (omp `subagent-step-tool`): "omp starts a subagent in plan mode without extensions, so that subagent cannot state its step." If the normal spawn also fails (the child cannot find its parent, or its prompt edit has no effect), `unsupported`: "An omp subagent's extension cannot tell which session started it."

The map branch's `docs/looks.md` rows name tokens in backticks. Each must name one of these ids or lose its backticks, or `check-structure.mjs` fails. Its "screen text" difference is dropped, since Codex now sends its shown tab.

## Build steps and checks

Every step runs `./scripts/check.sh`. After a shared-module change it rebuilds with `npm --prefix codex run build` and `npm --prefix omp run build`. Each commit stays on `progress-tab`. Rebase on `main` after each step, so the branch does not drift.

0. **Host checks.** No shipped code. Run them in the inbox-ui VM (the Tart virtual machine with the Claude app, Codex and the mod installed), with an isolated config. Never let a test reach an MCP server named `inbox`.
   - **Facts the source already settles.** Record them in `docs/reference/codex-plugins.md` and a new `docs/reference/omp.md` with their source lines, and run no live check for them:
     - Codex (rust-v0.163.0): the rollout keeps `turn_aborted`; Interrupt skips subagents; SubagentStop fires only at a normal turn end; SubagentStart fires once per subagent and never for guardian reviews; a subagent's hooks carry its thread id as `agent_id`; a subagent's first `session_meta` row holds `parent_thread_id`, `depth` and `agent_path`; hook matchers are Rust regexes; an Interrupt hook gets 1 s by default and 3 s at most.
     - omp (18.1.17): Esc emits `agent_end` with `stopReason: 'aborted'`; a subagent's session file is `<parent>/<agentId>.jsonl`; only direct children's frames reach the parent's `pi.events`; a plan-mode subagent loads no extensions.
     - Fix `docs/reference/codex-plugins.md`'s line that forked threads keep the root's session id, if the fork check below disagrees.
   - **Codex subagent hooks.** Does SubagentStart's `session_meta` row give the task name and `depth`? Which hooks fire when the main agent interrupts, closes or follows up a subagent? Does a main-turn interrupt stop spawned subagents? How soon after an abort does the `turn_aborted` row reach the file?
   - **Codex subagent and guardian threads.** Do SessionStart, Stop, UserPromptSubmit or PreToolUse fire in a subagent thread or a guardian review? With which `session_id`, `agent_id`, `transcript_path` and `source`?
   - **Codex subagent tools.** Is a subagent offered plugin tools? Does `additionalContext` from SubagentStart reach it?
   - **Codex quit mid-turn.** Quit Codex during a turn and reopen the chat. Does the rollout show the turn ended?
   - **Codex session keys.** In a forked chat, and in a subagent spawned inside a forked chat, log the hook input (`session_id`, `agent_id`, `transcript_path`) beside the MCP call's metadata (`session_id`, `thread_id`, `parent_thread_id`). Codex source (`session.rs`) gives a user fork its own session id and a subagent its parent's. Then write one keying rule that the hooks and the server both use for `step`, subagent rows, `record` and `close`, before step 6. If the source holds, today's keying by `session_id` already is that rule.
   - **The mod.** Does a subagent's system prompt hold `inbox:guidance`? Ask Claude to quote it from inside a subagent. Is the subagent offered the `step` tool?
   - **omp.** Do `task:subagent:*` frames arrive on `pi.events`? Does a child's `before_agent_start` prompt edit take effect? Is `step` offered to a child in a normal spawn and in plan mode?
1. **Milestones.** Ledger, upgrade, the catch-up flag and count, the results call and the `evals/run.ts` port. Checks are in the Milestones section.
2. **Session fields, `ProgressPage` and the sample.** `isTurnRunning`, `statedStep` and `subagents` in `Session`, with their upgrades and their behavior in `cleared` and `forkedFrom`. `progressPage` in `sessionView`. The new `DemoCopy` fields, `demoView` and `drawnSession`. `turnStarted` and `turnEnded` exist but no host calls them yet. Nothing new is drawn. Checks: `tests/session-script.ts` through `tests/session.test.ts`, `codex/tests/session.spec.ts` and `omp/tests/session.spec.ts`; loading a state saved by `main` in each host; loading the mod's saved sample copy.
3. **Tab plumbing.** `PageTab`, `ShownTab`, `isListedTab`, `LISTED_TABS` and `ARRIVAL_TABS`. Every `Record<Tab>` site, `followTo`, omp's `bandLines`, the Codex renames, the new `screenText` argument and screen cases, the mod's `PAGE` atom, and Codex's saved `shownTab`. The Progress entry is not in `TABS` yet, so no look draws it. The inbox model's `<screen>` text changes in Codex and omp. Checks: all test suites, the PR-arrival test in each host, and `./scripts/eval.sh`.
4. **Draw the Progress tab.** One commit per look adds that look's drawing with the page unreachable: the Progress entry stays out of `TABS`, and the look's tests set the shown tab directly. Then one last commit adds the entry to `TABS`, adds `milestones` and `progress-tab` to `hooks/clients.ts`, and updates the demo test's tab order. Reason: every look reads the one shared `TABS`, so adding the entry gives every look the tab at once. Reverting that last commit takes the tab out of every look cleanly. If a look's tests cannot reach the page without a seam in production code, step 4 is one commit instead. Checks, with "Progress" and again with a 10-letter placeholder:
   - the demo test's tab order in `tests/hooks.test.ts`;
   - desktop at its narrowest pane, with counts, and at 36 and 43 columns;
   - the Codex tab measured in a local page that hosts the built tab, in both themes and with reduced motion, then in the Codex side panel;
   - omp at 50, 60 and 80 columns: the shown tab's label and all four labels, or their short forms, stay visible;
   - `./scripts/eval.sh` with `progress-shown-records-question`.
5. **The Working… line.** Host events in each host, the reset at load in the mod, the rollout read in Codex, the switch of `SessionHost.isTurnRunning`, and the removal of the mod's `let isTurnRunning`. Add `turn-working` and its row. Checks are in the Working… section.
6. **The step tool, main agent.** Every tool site, `Host.stepTool`, `stepRule`, `activityOf`, and the activity-line tests. The eval-suite line in `AGENTS.md` and the text in `scripts/eval.sh` name `step`. Add `step-tool`. Checks are in the step tool section.
7. **Subagent rows.** In each host, with omp's typed channel names. Add `subagent-rows` and its row.
8. **Stated steps for subagents.** Add `subagent-step-tool` and its row. Checks: the A/B runs and a live run in each look.
9. **Docs and the full pass.** The docs call the tab Progress.
   - `docs/looks.md`: owner rows; the "A tab" and "A saved field" rows, which still name `PluginState` and miss most tab sites; the omp "Switching tabs" row (`1`, `2` and `3`); "Sessions with no screen"; and 96e68a0's wording.
   - `GLOSSARY.md`: Milestone, the Progress tab, Subagent row, Listed tab, Row tab and Page tab. Card, which says no look draws it. Pane, which lists three tabs.
   - `README.md`: "three tabs" (line 109), the keys at lines 157 and 166, a section for the tab, and the step to trust the new Codex hooks.
   - `docs/plans/omp-look.md`: "three tabs" and "1, 2 and 3".
   - `docs/release.md`: "`1`, `2` and `3`" becomes "`1` to `4`". New live-pass rows: the Progress tab; Working… (start, interrupt, compact); a subagent row (done, stopped, and a Codex follow-up turn); a stated step; trusting the new Codex hooks. Under Saved state: a `main` session that loads with milestones seeded, and 0.2.10 loading state saved by this build with the page shown.
   - `AGENTS.md`: the "New features" rule from e4e0024, and the subagent A/B procedure from step 8.
   - Then every check in `docs/release.md`, the live pass in all four looks, the merge question, and the release notes.

## Risks

- **Codex hook trust.** SubagentStart and SubagentStop stay off until you trust them. Without them Codex shows no subagent rows. The README and the release notes say so.
- **omp's internal channels.** omp could rename `task:subagent:*`. The typed names in `omp/src/host.ts` fail the omp type check when it does.
- **Codex width.** The Codex side panel's width is not documented. Four tabs may wrap there.
- **Label width.** The width limits in "Decisions" are estimates from the sizing formulas. "Progress" may cost the counts on desktop at 36 to 38 columns.
- **Model behavior.** The new DONE rule could change which results the card keeps. The step rule could make agents call a tool on short tasks. The evals measure the short-task line for Codex and omp only, since Claude runs the agent suite with no tools. The subagent A/B runs are the only check of the rule in subagents.
- **Saved subagents.** Rows are now saved. Without the stop-at-start rule and the rollout read, a crash would leave rows running.

## Out of scope

- Planned steps and a Next section, from a host plan tool or an inbox `plan` tool.
- One view of progress across sessions.
- PR milestones. Codex now reads shell output at Stop, so this is possible in every host, but it is a separate feature.
