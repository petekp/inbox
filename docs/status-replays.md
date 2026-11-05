# The Status replays

The cases that judge the Status tab. [How the Status is judged](plans/status/judging.md) gives the fixed rules, the code holds, the judge and the pass bar.

Three replays and fourteen short cases run 3 times each on Sonnet and on Codex, and three short cases run 5 times each. Fixed rules and code holds check the page after every step. The judge reads a few checkpoints. Each call has its host's limits: 45 seconds and 1600 output tokens for Claude, 120 seconds for Codex. A call past its limit fails, as it would in the host: the page stays as it was, and the status line says so.

A step with no call, or a step before its call, can press a goal button as the person would: Remove, or a typed goal. It runs through the host's own press.

**Replay A: a coordinator's day.** Status calls only, 11 of them. The fixture opens and closes the asks. It starts from a busy page last seen two hours earlier: the goal "Notes 2.4 in the store" with three milestones, one done, a head about shipping 2.4, seven open pieces, three done, two running delegates and one open ask. The export button sits under Other work. One delegate's Herdr name is an id, and its session publishes its focus.

| Step | What happens | What it checks |
| --- | --- | --- |
| 2 | A delegate reports the sync merge done, and the coordinator publishes 2.4. The reply is full of times. | Both milestones close, and the goal is met. No time word reaches the page. The text names no step. |
| 3 | The person files dark mode and widgets for later, and asks for a fix to the vanishing-notes bug, then 2.5. A delegate starts on the bug. | Checkpoint. The met 2.4 goal makes way for a 2.5 goal, set with no press, with every subject linked. The head leaves 2.4. Both filed pieces close. The delegate sits under the bug, in plain words. |
| 4 | The delegate calls it "the archive bug", and the person asks for a long extra on the same fix | One piece, not two. The fix links to its milestone, and the pieces the goal does not need link to Other work. |
| 5 | The coordinator asks whether 2.5 waits for the fix. The ask opens. | ◆ on 2.5 only. Its text does not restate the question. |
| Look | The person answers in the inbox, and reads the page | No call. The ask closes, and the Seen line moves. |
| 8 | The coordinator records a flaky test elsewhere as a finding | No subject for it, and nothing moves |
| 9 | The fix's PR opens, and a reviewer subagent starts | Checkpoint. No new "PR" piece. The text says the state of the fix. The reviewer sits under the fix. |
| 10 | The PR merges, and 2.5 prep starts | The fix and its milestone close. The head's title leaves the fix. |
| 11 | The person asks why export sometimes picks the wrong default folder on one platform | The new piece gets a short name, and links to Other work |
| Return | Three hours pass | No call |
| 12 | 2.5 is published, and nothing follows | Checkpoint. The goal is met. The head names the finished push. |
| 13 | The coordinator picks up the export folder bug from the queue. Nobody names a new goal. | No goal is set: one bug fix is not a goal. The met 2.5 goal stays. The head leaves 2.5. |
| 14 | The person types the goal "Search under 100 ms in 2.6" with Edit. The reply merges the folder fix and starts on search. | Checkpoint. The 2.5 milestones go, and the new ones are written with the right marks. Every subject is linked again. |

At every step, the pieces set aside or waiting on a vendor stay on the page.

**Replay B: one task, with both calls.** Each reply runs the ledger call, then the Status call, as the product does. So an ask is born, answered and dismissed by the ledger, and the Status sees each change. It starts empty, and has 9 calls.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | The person asks for offline sync, shipped in 2.5. The agent plans the engine, conflicts and a settings toggle, and starts the engine. | The goal is set, and each piece links to a milestone. The head names the aim. Three pieces. |
| 2 | The engine works. The agent fixes a lint error, runs two review subagents and asks "last-write-wins or manual merge?" | The head holds. The subagents sit under the engine. ◆ on conflicts, from the ledger's new ask. Each piece links to its milestone. |
| 3 | The person answers "manual merge" | The ask closes, ◆ clears, and the conflicts row shows the choice |
| 4 | The person reverses: last-write-wins with a backup copy | Checkpoint. A was line on conflicts, and no new piece |
| 5 | Conflicts progress. The person sets the toggle aside and asks for an offline banner first. | The toggle is ○ and keeps its link. The banner links to a milestone. No new was line. |
| 6 | The person asks how the backup copy is named and why the plan changed. Nothing is decided. | Nothing moves |
| 7 | The banner shows on phones, and the agent asks whether it shows on web too | ◆ on the banner, from the ledger's new ask |
| 8 | The person dismisses the web question. Device tests: Android syncs, and iOS loses edits after a crash. | Checkpoint. The ask closes as dismissed, and ◆ clears. The banner closes as ✓. The engine row keeps both states, or splits. |
| 9 | The agent fixes the iOS edit loss. Its notes between tool calls say the fix works. Its last message only says where it saved the results. | The engine and its milestone close, from text before the last message. The goal stays unmet. |

**Replay C: a long turn and a catch-up.** Status calls only, 3 of them, with no goal.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A mid-turn call at 12 minutes. The activity finishes one piece and starts another. The host's task list holds file and test steps beside the features. | Checkpoint. The finished piece closes, and the next is ●, since the turn still runs. No file name or test step becomes a row. Where it stands says what works, not what the agent is doing. |
| 2 | A mid-turn call at 25 minutes. The activity shows more investigation and nothing new. | `NO CHANGE` is right, and no row moves |
| 4 | The reply and two more were dropped, and a catch-up reads the whole conversation. The person had asked to get search under 100 ms on big libraries and ship it in 3.1. | Checkpoint. The goal is set. Finished work is not ● or ◐. The missed change reaches the page. |

The person's "speed up search on large libraries" at steps 1 and 2 is a direction, so no goal is set there.

**The short cases.**

| Case | Runs | What happens | What it checks |
| --- | --- | --- | --- |
| `catch-up-from-empty` | 3 | A catch-up of a conversation the inbox never saw, from an empty page. Images attach, and PDFs wait on a question. | The question links to the feature. A finished part drawn as its own row is not ●. |
| `removed-goal` | 5 | The Status call set "Import ready to demo". The person presses the goal's Remove, then says "Let's get the import demo-ready." | No goal is set: not the removed one in other words, nor another. |
| `milestone-work-done` | 3 | A goal with three milestones. Step 1: a reply about one milestone's work, while another's work all finished and a third's subject sits under Other work. Step 2: the person finds more work on the finished one. | Step 1: code closes the finished milestone, the other stays open, and the stray subject links to its milestone. Step 2: the milestone opens again, with the new work linked to it. |
| `goal-met-next` | 3 | Step 1: the last milestone's work ships. Step 2: the person asks for 2.6 with widgets and a dark theme. | Step 1: the goal is met and no next goal is set. Step 2: the 2.6 goal is set with no press, and every new piece links to it. |
| `goal-wait` | 3 | A met goal. The person asks for a typo fix and a look at a slow share sheet. | No goal is set, and the met goal stays. |
| `no-goal-yet` | 3 | No goal. Step 1: one small fix. Step 2: a question about the code. Step 3: a coordinator reports three unrelated items. | No goal at any step. |
| `goal-from-work` | 3 | No goal. The person says "Keep going", and the agent plans the rest of export for 3.2. | A goal is set from the work, and every piece links to it. |
| `goal-work-left` | 3 | An inferred goal with its last work queued. Step 1: the person shelves it for search in 3.1. Step 2: a side fix parks the search work. Step 3: the person returns to search. | Step 1: the old goal's work closes and the search goal replaces it. Steps 2 and 3: the search goal stays. |
| `typed-goal-kept` | 3 | A typed goal with its work queued. The person asks for dark mode in 3.1 first. | The typed goal stays. |
| `goal-on-busy-page` | 5 | 18 open subjects and a goal just accepted, none linked. One reply. | Every subject is linked, to a milestone or to Other work |
| `mid-turn-activity` | 5 | Replay C's first step, judged per model | Checkpoint. Where it stands says the state, not the activity. |
| `milestone-dropped` | 3 | A goal with three milestones, and a subject folded into another. One reply: the person cuts the store review milestone, and splits tag colors back out of the theme editor. | The cut milestone's work links to Other work. Tag colors shows as an open subject. |
| `catch-up-shipped` | 3 | A goal with two milestones. A catch-up reads a conversation in which two pieces were merged and shipped. | Both pieces close as ✓, not as dropped, and their milestone closes. |
| `goal-awaiting-milestones` | 3 | 14 open subjects, none linked, and a goal the person typed that an unreadable answer left with no milestones. One reply. | The goal gets its milestones. A GOAL line that restates the goal gives the goal its milestones. |
| `ask-holds-two` | 3 | Two releases, each with a signed build. Step 1: neither can upload until the person signs in to App Store Connect, and that task opens. Step 2: a TestFlight beta starts, and its upload waits on the same sign-in. | Step 1 links the task to both releases, so both show ◆. Step 2 links it to the beta too. |
| `one-task-plan` | 3 | One small task: a tooltip on the Export button, planned as make it, test it and note it in the changelog. One reply. | The plan's steps stay in one subject. |
| `idle-work` | 3 | Two days after the last change. One working piece has had no change for three days and nothing holds it, one was set aside, one waits on a sign-in task, one has waited three days on a vendor. Step 1: a piece finished since the last look breaks again, and the reply names a PR by its number. Step 2: a fixed answer holds its edits between lines of prose, one naming a subject by a PR number. | Step 1: the idle working piece closes, the set-aside, held and vendor pieces stay, the broken piece is one row, and no row is named by a number. Step 2: the edits apply, and the number-named subject is refused. |

`removed-goal`, `goal-on-busy-page` and `mid-turn-activity` are judged on each model apart. The others are judged with the replays: both models' runs together.

**Steps that test the goal, and the ablation.** The goal's steps come from the design, not from failures seen in use. So a step that tempts a false goal runs against a copy of the system text without the rule it tests, as [How the Status is judged](plans/status/judging.md) describes. Code drops a GOAL line that restates a removed goal by its key words, so `removed-goal` can fail only on a reworded one or on another goal. Replay C's steps 1 and 2, where the person gives a direction with no finish line, also check that no goal is set.
