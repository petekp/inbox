# The Status replays

The cases that judge the Status tab. [How the Status is judged](plans/status/judging.md) gives the fixed rules, the code holds, the judge and the pass bar.

Three replays and thirty short cases run 3 times each on Sonnet and on Codex, and seven short cases run 5 times each. Fixed rules and code holds check the page after every step. The judge reads a few checkpoints. Each call has its host's limits: 45 seconds and 1600 output tokens for Claude, 120 seconds for Codex. A call past its limit fails, as it would in the host: the page stays as it was, and the status line says so.

A step with no call, or a step before its call, can press a goal button as the person would: Remove, or a typed goal. It runs through the host's own press.

**Replay A: a coordinator's day.** Status calls only, 11 of them. The fixture opens and closes the asks. It starts from a busy page last seen two hours earlier: the goal "Notes 2.4 in the store" with three milestones, one done, a head about shipping 2.4, seven open pieces, three done, two running delegates and one open ask. The export button sits under Other work. One delegate's Herdr name is an id, and its session publishes its focus.

| Step | What happens | What it checks |
| --- | --- | --- |
| 2 | A delegate reports the sync merge done, and the coordinator publishes 2.4. The reply is full of times. | Both milestones close, and the goal is met. No time word reaches the page. The text names no step. |
| 3 | The person files dark mode and widgets for later, and asks for a fix to the vanishing-notes bug, then 2.5. A delegate starts on the bug. | Checkpoint. The met 2.4 goal makes way for a 2.5 goal, set with no press, with every subject linked. The head leaves 2.4. Both filed pieces close. The delegate sits under the bug, in plain words. |
| 4 | The delegate calls it "the archive bug", and the person asks for a long extra on the same fix | One piece, not two. The fix links to its milestone, and the pieces the goal does not need link to Other work. |
| 5 | The coordinator asks whether 2.5 waits for the fix. The ask opens. | ◆ on 2.5 only. Its text does not restate the question. |
| Look | The person answers in the inbox, and reads the page | No call. The ask closes, and the page counts the rows shown as seen. |
| 8 | The coordinator records a flaky test elsewhere as a finding | No subject for it, and nothing moves |
| 9 | The fix's PR opens, and a reviewer subagent starts | Checkpoint. No new "PR" piece. The text says the state of the fix. The reviewer sits under the fix. |
| 10 | The PR merges, and 2.5 prep starts | The fix and its milestone close, and the 2.5 milestone is being worked on. The head's title leaves the fix. |
| 11 | The person asks why export sometimes picks the wrong default folder on one platform | The new piece gets a short name, and links to Other work |
| Return | Three hours pass | No call |
| 12 | 2.5 is published, and nothing follows | Checkpoint. The goal is met. The head names the finished push. |
| 13 | The coordinator picks up the export folder bug from the queue. Nobody names a new goal. | No goal is set: one bug fix is not a goal. The met 2.5 goal stays. The head leaves 2.5. |
| 14 | The person types the goal "Search under 100 ms in 2.6" with Edit. The reply merges the folder fix and starts on search. | Checkpoint. The 2.5 milestones go, and the new ones are written with the right marks. Every subject is linked again. |

At every step, the pieces set aside or waiting on a vendor stay on the page.

**Replay B: one task, with both calls.** Each reply runs the ledger call, then the Status call, as the product does. So an ask is born, answered and dismissed by the ledger, and the Status sees each change. It starts empty, and has 9 calls.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | The person asks for offline sync, shipped in 2.5. The agent plans the engine, conflicts and a settings toggle, and starts the engine. | The goal is set, and each piece links to a milestone. The head names the aim. Four pieces: the three planned, and the 2.5 release. |
| 2 | The engine works. The agent fixes a lint error, runs two review subagents and asks "last-write-wins or manual merge?" | The head holds. The subagents sit under the engine. ◆ on conflicts, from the ledger's new ask. Each piece links to its milestone. |
| 3 | The person answers "manual merge" | The ask closes, ◆ clears, and the conflicts row shows the choice |
| 4 | The person reverses: last-write-wins with a backup copy | Checkpoint. A Prev line on conflicts, and no new piece |
| 5 | Conflicts progress. The person sets the toggle aside and asks for an offline banner first. | The toggle is ○ and keeps its link. The banner links to a milestone. No new Prev line. |
| 6 | The person asks how the backup copy is named and why the plan changed. Nothing is decided. | Nothing moves |
| 7 | The banner shows on phones, and the agent asks whether it shows on web too | ◆ on the banner, from the ledger's new ask |
| 8 | The person dismisses the web question. Device tests: Android syncs, and iOS loses edits after a crash. | Checkpoint. The ask closes as dismissed, and ◆ clears. The banner closes as ✓. The engine row keeps both states, or splits. |
| 9 | The agent fixes the iOS edit loss. Its notes between tool calls say the fix works. Its last message only says where it saved the results. | The engine and its milestone close, from text before the last message. The goal stays unmet. |

**Replay C: a long turn and a catch-up.** Status calls only, 3 of them, with no goal.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A mid-turn call at 12 minutes. The activity finishes one piece and starts another. The host's task list holds file and test steps beside the features. | Checkpoint. The finished piece closes, and the next is ●, since the turn still runs. No file name or test step becomes a row. Where it stands says what works, not what the agent is doing. |
| 2 | A mid-turn call at 25 minutes. The activity shows more investigation and nothing new. | `NO CHANGE` is right, and no row moves |
| 4 | The reply and two more were dropped, and a catch-up reads the whole conversation. The person had asked to get search under 100 ms on big libraries and ship it in 3.1. | Checkpoint. The goal is set, and the speed work left and the 3.1 release are open pieces. Finished work is not ● or ◐. The missed change reaches the page. |

The person's "speed up search on large libraries" at steps 1 and 2 is a direction, so no goal is set there.

**The short cases.** [The Status short cases](status-replays-short.md) lists each one, with its runs, what happens and what it checks.

**Steps that test the goal, and the ablation.** The goal's steps come from the design, not from failures seen in use, except `stale-goal`, which comes from a session that kept a shipped release's goal for three days while every new piece of work was linked to its "Cleanup done" milestone, and `next-release`, which comes from the same session once that goal was stuck behind open work under its done milestones: the call's RETIRE was refused without a word, and the next release's work was linked to the old goal's last milestone. So a step that tempts a false goal runs against a copy of the system text without the rule it tests, as [How the Status is judged](plans/status/judging.md) describes. Code drops a GOAL line that restates a removed goal by its key words, so `removed-goal` can fail only on a reworded one or on another goal. Replay C's steps 1 and 2, where the person gives a direction with no finish line, also check that no goal is set.
