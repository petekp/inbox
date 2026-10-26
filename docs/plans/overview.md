# The Overview tab in every look

Status: building (steps 1 to 4 built)

## Summary

The Overview tab is the inbox's first tab. It is a guide to the session's work, not a list of what waits on the person. It answers four questions:

- What is the session doing, and why?
- How is it going?
- What changed since the person last looked?
- What is next?

The inbox model writes the tab's parts. Code orders them when the tab opens. All four looks draw the same parts from one shared view: the Claude Code terminal, the Claude desktop app's pane, the Codex Inbox tab and the omp panel.

The tab replaces the Progress tab, which listed finished results. Nothing of Progress has shipped. Its tab id, FeatureIds and identifiers are renamed to `overview`, and its results list, goal field and subagent section are removed.

The tab fails if it reads as a log. It has no timestamps, ids, hashes or counts unless they carry meaning. It never lists events. Every prompt line and eval case in this plan pushes away from event lists.

The build order:

1. Parts, the Overview call and the stored state. Nothing is drawn.
2. Ordering, "since you looked", topic changes and coordinator sessions.
3. Draw the tab in each look.
4. Host task lists.
5. Remove the card's goal, running and done fields, and the results list.
6. Docs and the full live pass.

## Decisions

1. **Where the work queue comes from.** The Overview call writes it from the exchange in every host. A host's own task list is extra input where the host has one.
   - Reason: only omp offers a task list by default (`docs/reference/task-lists.md`). A queue that needs a task list would be empty in Claude Code and Codex.
2. **No `step` tool.** The agent is not asked to report steps.
   - Reason: the tool adds guidance text for every agent, a trust step for Codex hooks and a case in the agent evals. The exchange and the host's task list already carry the same information. Revisit it only if the queue evals show the exchange is not enough.
3. **No subagent rows, and no subagent events.** The call infers delegated work from what the agent did and said.
   - Reason: nothing populates `Session.subagents` today. Filling it needs new Codex hook entries that each person must trust, and omp's internal channels. That is the largest unbuilt part of the Progress plan, and the Overview does not need it to read well. `Session.subagents`, `Subagent` and `presence.statedStep` are removed.
4. **The call gets no inbox text.** The code writes the one pointer line from the live counts.
   - Reason: a model that sees the asks restates them, and the tab becomes a second inbox. Counts drawn by code cannot go stale.
5. **Code owns "since you looked", the last look and the order.** The model owns the words.
   - Reason: opening the tab must not wait for a model, and the model cannot know when the person looked.
6. **The old card is removed last.** The ledger call keeps writing `GOAL`, `NOW`, `RUNNING` and `DONE` lines until step 5.
   - Reason: those lines are in the ledger call's text. Changing them moves the ledger evals, so the change gets its own step and its own eval run.

## Terms

Terms from `GLOSSARY.md`: Band, Pane, Catch-up, Host, Look, Difference on purpose and Parity record. The new ones:

- **Overview:** the tab this plan adds. Its page is made of parts.
- **Part:** one block of the page, with a kind and either text or a list of items.
- **Item:** one line of a list part, with a status mark, short text and optional detail.
- **Mark:** the glyph that shows an item's status.
- **Queue:** the list part of the session's work: what is under way, queued, waiting or done.
- **Overview call:** the inbox model call after the ledger call. It reads the last Overview and the new exchange and writes the next Overview.
- **Last look:** the time the person last had the Overview tab shown.
- **Since list:** the changes that landed after the last look.
- **Arc:** one topic of work in a session. A change of topic starts a new arc.
- **Coordinator session:** a session whose work is handing out work and reviewing the result, not doing it.
- **Page tab:** a tab that shows a page instead of rows. It has no count, no buttons and no row selection.
- **Host task list:** the list an agent keeps with its own tool, such as omp's `todo`.

## The parts

A part has a `kind`. Text parts hold one short text. List parts hold items.

| Kind | Holds | Who writes it |
| --- | --- | --- |
| `headline` | One plain sentence: what the session is doing. It is never labeled "goal". | Model |
| `status` | One sentence on how it is going, with a state: `on-track`, `stuck` or `finished`. | Model |
| `course` | Why the direction changed, when it did. | Model |
| `queue` | What is under way, queued, waiting and done. | Model |
| `works` | What holds now: what works, what exists. | Model |
| `open` | Risks, problems and unknowns. | Model |
| `next` | What comes next. | Model |
| `since` | What changed after the last look. | Model writes, code clears |
| `workstreams` | In a coordinator session: one line per stream of work. | Model |
| `pointer` | "Asks has N items." No buttons. Left out when nothing waits. | Code |

An item has a status:

| Status | Mark | Meaning |
| --- | --- | --- |
| `working` | ● | Under way now |
| `queued` | ○ | Waiting its turn |
| `waits-on-you` | ◆ | Needs the person |
| `waits-on-other` | ◌ | Needs something else, such as a build |
| `done` | ✓ | Finished |
| `ruled-out` | ✗ | Tried or considered and dropped |
| `problem` | ! | Something is wrong |
| `unknown` | ? | Not known yet |

Each mark is drawn with a color and also reads alone, so the terminal and omp need no color to tell them apart. The glyphs differ in shape. Colors come from the existing tones in `hooks/tones.ts`: `waits-on-you` takes `needsYou`, `done` takes `done`, `problem` takes `issue`. The other five use the faint text color, so no tone is added. omp's light theme is checked in step 3.

The `course` and `status` texts are at most 30 words, in at most two sentences. The headline and each item's text are at most 12 words. A detail is at most 20. A list holds at most 6 items. The call sees these limits in its prompt, and code clips what exceeds them.

## The Overview call

It runs after the ledger call, in the slot the results call has now: after the ledger update applies, one after another per session (`inOrder`), in the background where the host allows it (`background`). A failed call leaves the last Overview in place. A failed ledger call skips it.

**What it reads:**

| Block | Holds |
| --- | --- |
| `<last>` | The last Overview as text: its parts and items. |
| `<unseen>` | The since list, so the call can merge a new change into an old one. |
| `<person>` | The person's message. |
| `<activity>` | The agent's tool activity this turn, as the ledger call reads it. |
| `<reply>` | The agent's reply. |
| `<tasks>` | The host task list, when the host has one. |
| `<state>` | Whether the person has asked for anything yet, and whether the turn was cut off. |

It gets no inbox rows or counts, and nothing about when the person looked. Opening the tab never calls it.

**What it writes:** a whole new Overview in a line format that code parses the way it parses the ledger update. It says whether the topic is the same or new and whether the session is a coordinator. If the direction changed, it says so and gives the reason. It writes a new `since` list that merges the unseen changes with this reply's.

It writes nothing for a reply that changes nothing about the work. Code then keeps `<last>` as it was.

**The rules in its prompt:**

- Write at the level of the feature. Describe what the work is for and where it stands. Never list commands, files, commits, tests or tool calls.
- Leave out any number, id, time or hash that the person would not need to find the work again.
- Do not restate a question or task the agent put to the person. Say that the work is waiting, and stop.
- Keep an item until it is done, ruled out or no longer true. Do not reword an item that has not changed.
- Say a direction changed only when the approach changed, and give the reason. A new step is not a change.

These lines are the first draft. They are tested before they are kept (`AGENTS.md`, "Text a model reads").

## Order when the tab opens

Code orders the parts from three signals. The model writes nothing at this point.

| Signal | Values |
| --- | --- |
| Away | `here` under 5 minutes since the last look, `short` under 1 hour, `long` beyond |
| Work | `running` while the main agent's turn runs, `stopped` when the agent waits on the person or a stop row shows, `finished` when the status state is `finished`, else `idle` |
| Course | Whether the direction changed since the last look |

A changed direction leads, whatever else is true. After it:

| Work | Away | Order |
| --- | --- | --- |
| running | here | headline, queue |
| running or idle | short | headline, since (or "Nothing new since you looked."), queue, open |
| running or idle | long | headline, status, since (or the same line), queue, next, open |
| stopped | any | headline, status, pointer, since, queue, next, open |
| finished | any | headline, status, works, open |

The pointer is "Asks has N items." with the count of open questions and tasks. It has no buttons and is left out when the count is 0. `open` stays in every state so a problem is never hidden. `works` shows only when the work is finished, since the queue's done items already say what works while work goes on.

The queue shows in every state except `finished`. In `stopped` it holds the ◆ item that says what the work waits on.

`next` is drawn only when the queue has no queued (○) items. Otherwise the ○ items already say what comes next.

A part with nothing in it is left out. The earlier lines come last. The cutoffs and the table are constants in a shared module, tested as a pure function. They are tuned in the trial build.

**Coordinator sessions** use a different order: headline, workstreams, since, queue, next, open. The model decides a session is a coordinator from what it does, as it hands out work and reviews the result. There is no flag. The view comes from what the coordinator itself knows, not from the other sessions' own tabs.

## Since you looked

The since list holds the changes after the last look. It starts over when the person looks.

- The call rewrites the list after each reply, merging new changes into the unseen ones. This keeps it short after many replies.
- A look starts when the Overview tab is shown and ends when it stops being shown: a tab change, the pane closing, or the band opening the inbox. The start fixes the away time, so the order does not change while the tab is shown. It also records which since items and which course were shown.
- The end clears only those items and that course, stamps `Overview.lastLookAt`, and remembers what it cleared in `Overview.seen`. A change that landed while the tab was shown stays for the next look. An Overview call that began before the look ended is applied without the cleared items and course.
- "Nothing new since you looked." is not drawn before the first look.
- A reply that lands while the tab is shown is added to the since list and shows at once.
- The call writes COURSE only in the reply where the approach changed. The saved course stays through later replies until a look or a new topic clears it.
- The mod syncs the look whenever the pane opens or closes or its page changes. Codex starts and ends it from each `inbox_view` request, and ends it at the last request's time when requests stopped. omp does it in `showTab` and `closePanel`. The sample never changes a look.
- A coordinator's QUEUE item that only names a stream is dropped in code when the answer is applied, since the STREAM line already says it.
- Each fact is written once: the call's rule is "each fact once, in the list that fits it best". `evals` checks that no two items in QUEUE, WORKS, OPEN, NEXT and STREAM say the same thing.

## A change of topic

When the call reports a new topic, the old arc folds into one line under "Earlier in this session". That line says where the arc was left. The page then starts from the new headline. Code keeps at most 6 earlier lines and drops the oldest.

## The empty page

Before any work starts, the page says what the tab is, in one or two plain lines. It does not name a tab or use the word "goal". It reads: "Where the work stands and where it's heading. It fills in once the work starts." The words go through `refine-prose` when they are built.

## Host task lists

Each host reads the list into `Session.hostTasks`, a list of `{ text, status }` with `status` one of `pending`, `in-progress`, `done`, `dropped` or `blocked`. Shared code turns it into the `<tasks>` block.

| Host | Read from | When |
| --- | --- | --- |
| Claude Code | `tool.call` for `TaskCreate` and `TaskUpdate`, keeping an id to text map | When the tools are on. They are off by default. |
| Codex | The turn's `update_plan` rows in the rollout, at Stop | When the agent calls it. It is not offered by default. |
| omp | The newest `todo` result or `/todo` edit on the session branch | Always on |

Only omp has a list most of the time. Claude Code and Codex are built anyway, since the code is small and a person can turn the tools on. `docs/reference/task-lists.md` has the sources. Each host's row in `docs/looks.md` says the list is usually empty there. The unknowns it lists are checked in step 4: whether Claude Code's task ids restart after `/clear`, and whether the Codex app offers `update_plan`.

## What is reused and what is replaced

| Keep | Replace |
| --- | --- |
| The page-tab plumbing: `PageTab`, `ShownTab`, `LISTED_TABS`, `ARRIVAL_TABS`, the mod's `PAGE` atom and Codex's `shownTab` | The tab id `progress`, now `overview` |
| The drawing of a page tab in all four looks, with new parts | `progressPage` and `ProgressPage`, now `overviewPage` and `OverviewPage` |
| The second model call and its host plumbing (`inOrder`, `background`, `appliedResults`, the skip on a bad ledger answer) | `RESULTS_SYSTEM`, `resultsPrompt`, `resultsCatchUpPrompt`, `handledBy` and `addResults` |
| `presence.isTurnRunning` and the Working… line (`turn-working`) | `Ledger.milestones`, `listResults`, the DONE count, and `card.goal`, `card.running` and `card.done` |
| The sample data path (`demoView`, `drawnSession`) | `Session.subagents`, `Subagent`, `presence.statedStep` and `DemoCopy.subagents` |

The `Working…` mark moves next to the headline. Code draws it from `isTurnRunning`, since it changes faster than the model writes.

## Stored state

- `Ledger.milestones` is replaced by `Ledger.overview`. Step 1 stores the parts as fields: the headline, the status and its state, the course text, one list for each list part, the earlier lines and the coordinator flag. Step 2 adds `lastLookAt`; the course flag is whether `course` is set. A new field, `Session.hostTasks`, is the task list.
- `Ledger.overview` lives in the ledger so that `forkedFrom`, `cleared`, `hasLedger` and `isUnseen` carry it with the rest. A fork takes its parent's Overview. A `/clear` empties it.
- The page tab id `overview` is stored in the mod's `PAGE` atom and in Codex's `shownTab`. It is final once released.
- Main never stored `progress`, `shownTab`, `milestones`, `subagents` or `statedStep`. A trial build of the Progress tab may have. The Overview build ignores a `PAGE` or `shownTab` value it does not know, and drops `milestones`, `subagents` and `statedStep` when it loads. Step 1 tests this with a state saved by that trial build.
- Step 3 checks that main's build loads a session record saved by this branch, before the trial build is frozen.

The Overview is derived text, so a lost or stale one costs a better summary, not data. The next reply rewrites it. A catch-up writes it from the whole conversation.

## Per host

- **Mod (terminal and desktop).** The call runs in the background after the ledger update. `tool.call` feeds the task list. The page draws in `hooks/register.tsx`, which both looks share. The desktop pane redraws only on events, so the new Overview shows on the next event after the call returns.
- **Codex.** The update process runs the call after the ledger call, in the same process. The Stop hook reads `update_plan` rows. The tab draws the page without row motion.
- **omp.** The extension runs the call as it runs the results call now. `tool_result` feeds the task list. The panel draws plain lines with ANSI styles.

All three consume `Ledger.overview` through `sessionView`, so every look draws what the shared module decides: which parts show, in what order, with what marks.

## Parity record

Each FeatureId needs an entry for every host. `scripts/check-structure.mjs` fails on a `different` or `unsupported` entry without a row in `docs/looks.md`.

| FeatureId | claude-code | codex | omp |
| --- | --- | --- | --- |
| `overview-tab` | full | full | full |
| `turn-working` | full | different (as today) | full |
| `host-task-list` | different | different | full |

`milestones`, `progress-tab`, `subagent-rows`, `subagent-step-tool` and `step-tool` are not added. `host-task-list` is `different` in Claude Code and Codex because the host does not offer the tool by default. The row says so, with the sources.

## Model-read text and evals

The Overview call's prompt is text a model reads. `AGENTS.md` names the checks.

- The ledger call's text is unchanged until step 5.
- Step 5 changes `systemText`, so it runs the whole `./scripts/eval.sh`. It compares each ledger case with the baselines before the change.
- `carryText` and `overviewCarryText` (was `cardCarryText`) change in step 5. They are text the agent reads, so `./scripts/eval.sh --suite agent` runs too.
- The eval harness (`evals/run.ts`) runs the Overview call as its second call. Its `results`, `result` and `noResult` checks, and the baselines for the DONE cases, go.
- The new cases check the tab's shape with fixed rules, not a model judge.

| Case | What it checks |
| --- | --- |
| Feature level | A long exchange full of reads, edits, commands and test runs. No item contains a command, a path, a hash, a ticket number or a count, and no item starts with a tool verb. |
| Change of direction | The person redirects the approach. The call reports a change and gives the reason. A control exchange of plain progress reports none. |
| Coordinator | An exchange that hands work to other agents and reviews their results is a coordinator, with at least two workstreams. A single-task control is not. |
| Since you looked | An unseen list plus a new reply gives one merged list with no duplicate. The restart on a look is a unit test of the shared code, not an eval. |
| Asks only as a pointer | The agent asks the person a question this turn. No item repeats its words, and the status may say the work waits. |
| New topic | A change of topic folds the old arc into one earlier line that says where it was left. |
| Nothing to say | A reply that changes nothing about the work leaves the last Overview as it was. |


## Build steps and checks

Every step runs `./scripts/check.sh`. After a shared-module change it rebuilds with `npm --prefix codex run build` and `npm --prefix omp run build`. Every commit stays on `progress-tab`, unpushed. The work stops for review after step 1 and after step 3, with a report in `.scratch/REPORT.md` each time.

1. **Parts, the call and the state.** Types, the line format and its parser, `Ledger.overview`, the prompt, the eval harness change and the seven cases, the upgrade, and the swap of the results call for the Overview call in all three hosts. Remove the milestones code and the results prompts. Nothing is drawn. Checks: unit tests of the parser and the clip; the model suite; a state saved by the Progress trial build loads without error.
2. **Order and behavior.** The three signals, the order table, the last look, the since list, the course flag, topic folding and the coordinator order, as pure functions in a shared module, with tests for each row of the table.
3. **Draw the tab, then freeze a trial build.** One commit per look, then one that renames the entry in `TABS`. Rename the tab, the page view and the FeatureId. Draw the marks and the pointer line. Checks, in each look and each state:
   - the demo test's tab order;
   - desktop at its narrowest pane, with counts, and at 36 and 43 columns, with the label "Overview";
   - the Codex tab measured in a local page that hosts the built tab, in both themes and with reduced motion;
   - omp at 50, 60 and 80 columns, in the dark and light themes;
   - the terminal with no color, read from the glyphs alone.

   After the terminal look draws and the review passes, check that main's build loads a session record this branch saved. Then freeze a trial build in a detached worktree, `overview-try`, at the reviewed tip, so the person can use it while steps 4 to 6 continue.
4. **Host task lists.** The three reads, `Session.hostTasks`, the `<tasks>` block and the `host-task-list` entry and rows. Live checks answer the two unknowns above.
5. **Remove the old card fields.** Drop `GOAL`, `NOW`, `RUNNING` and `DONE` from the ledger call. Point the carry texts, the sidebar line (`hooks/claude.ts`) and `screenText` at the Overview. Replace the page hint. Run the whole model suite and the agent suite.
6. **Docs and the full pass.** `docs/looks.md`, `GLOSSARY.md`, `README.md`, `docs/release.md`, `AGENTS.md`. Then every check in `docs/release.md` and the live pass in all four looks. Then a refreshed trial build.

Readers of `card.goal` and their replacements:

| Reader | Replacement |
| --- | --- |
| `cardCarryText` (first prompt) | The headline and the status text |
| `hooks/claude.ts` sidebar line | The headline |
| `screenText` | Says the tab shows the session's work |
| The page's empty hint | The empty page text above |
| Codex `row-actions` and `tab`, omp panel | `OverviewPage` |

## Risks

- **The tab reads as a log anyway.** The model may list events when the exchange is full of them. The feature-level case and the trial build are the checks. If the case passes and the trial still reads as a log, the prompt changes, not the draw.
- **Merging an unseen list.** The call may drop an old change by mistake. The since case checks one merge. The trial shows more.
- **Stale queue marks.** The queue updates after each reply, so a ● can be wrong between replies. The page shows `Working…` from the live turn state to cover the gap.
- **Ledger evals move in step 5.** A new rule in the ledger call's text has moved unrelated ledger cases by 10 to 20 runs of 32. Step 5 compares against the baselines and stops if a case drops.
- **Width.** The label "Overview" is 8 letters, as "Progress" was. The desktop pane at 36 to 38 columns may lose the Asks and Finds counts. Step 3 measures it. If it does, the choice between a shorter label and losing the counts goes to the person.

## Out of scope

- Subagent rows and subagent events.
- A `step` tool.
- A line in the band about the Overview.
- A coordinator view built from the other sessions' own Overviews.
- PR results.
