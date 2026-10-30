# The Status replays

The replays that judge the Status tab. [The Status tab plan](plans/status.md) gives the fixed rules, the judge and the pass bar.

Three replays, each run 3 times on Sonnet and on Codex. Fixed rules check the page after every step. The judge reads a few checkpoints. Each call has its host's limits: 45 seconds and 1600 output tokens for Claude, 120 seconds for Codex. A call past its limit fails, as it would in the host: the page stays as it was, and the status line says so.

**Replay A: a coordinator's day.** Status calls only. The fixture opens and closes the asks. It starts from a busy page: a head about shipping notes 2.4, seven open pieces, three done, two running delegates and one open ask, last seen two hours earlier. One delegate's Herdr name is an id, and its session publishes its focus.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A delegate reports the sync merge done, and the coordinator merges it | The piece closes as ✓. Its text names no step. |
| 2 | The coordinator publishes 2.4. The reply is full of times. | The release closes. No time word reaches the page. |
| 3 | The person asks to file dark mode and widgets for later, fix the vanishing-notes bug, and ship 2.5. A delegate starts on the bug. | The head leaves 2.4. Both filed pieces leave the open rows, with the filed mark once it is built. The delegate sits under the bug, in plain words. |
| 4 | The delegate calls it "the archive bug", and the person asks for a long, sentence-like extra on the same fix | One piece, not two. If the extra merges into the fix, the line naming it is readable. |
| 5 | The coordinator asks whether 2.5 waits for the fix. The ask opens. | ◆ on 2.5 only. Its text does not restate the question. |
| 6 | The person answers, and the ask closes | ◆ clears. The row shows the choice. |
| Look | The person reads the page | The Seen line moves to this point |
| 7 | A reply that only explains how releases work | Nothing moves |
| 8 | The coordinator records a flaky test elsewhere as a finding | No subject for it |
| 9 | The fix's PR opens, and a reviewer subagent starts | Checkpoint. No new "PR" piece. The text says the state of the fix. The reviewer sits under the fix. |
| 10 | The PR merges, and 2.5 prep starts. The person says nothing. | The fix closes as ✓ under its own name. 2.5 is ● or ◌, since its build runs. The head's title leaves the fix. |
| 11 | The person asks why export sometimes picks the wrong default folder on one platform | The new piece gets a short name |
| Return | Three hours pass | No call. Step 12 reads the page three hours on. |
| 12 | 2.5 is published, and nothing follows | The head names the finished push. The export piece, set aside since the start, is still ○. |
| 13 | The person says "ok", and the coordinator picks up the export folder bug from the queue | The head leaves 2.5 for the folder bug, though no one named a new goal |
| 14 | The folder fix merges, and the coordinator starts on search speed | Checkpoint. The head leaves the finished folder fix for search. |
| 15 | Search gets faster | The head holds |

At every step, the pieces set aside or waiting on a vendor stay on the page.

**Replay B: one task, with both calls.** Each reply runs the ledger call, then the Status call, as the product does. So an ask is born, answered and dismissed by the ledger, and the Status sees each change. It starts empty.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | The person asks for offline sync. The agent plans the engine, conflicts and a settings toggle, and starts the engine. | The head names the aim. Three pieces. |
| 2 | The engine works. On the way the agent fixes a lint error and runs two review subagents. It asks "last-write-wins or manual merge?" | The head holds. The subagents sit under the engine, each named by the description it was started with. ◆ on conflicts, from the ledger's new ask. |
| 3 | The person answers "manual merge" | The ask closes, ◆ clears, and the conflicts row shows the choice |
| 4 | The person reverses: last-write-wins with a backup copy | A was line on conflicts, and no new piece |
| 5 | Conflicts progress. The person sets the toggle aside and asks for an offline banner first. | The toggle is ○ and stays. The banner is ●. No new was line. |
| 6 | The person asks how the backup copy is named and why the plan changed, and the agent explains both. Nothing is decided. | Nothing moves |
| 7 | The banner shows on phones, and the agent asks whether it shows on web too | ◆ on the banner, from the ledger's new ask |
| 8 | The person dismisses the question and asks for device tests. Android syncs, and iOS loses edits after a crash. | The ask closes as dismissed, and ◆ clears. The banner closes as ✓. The engine row keeps both states, or splits. |

**Replay C: a long turn and a catch-up.** Status calls only.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A mid-turn call at 12 minutes. The activity finishes one piece and starts another. The host's task list holds file and test steps beside the features. | The finished piece closes, and the next is ●. No file name or test step becomes a row. |
| 2 | A mid-turn call at 25 minutes. The activity shows more investigation and nothing new. | `UNCHANGED` is right, and no row moves |
| 3 | The reply ends the turn | |
| 4 | Two replies were dropped, and a catch-up reads the whole conversation | Finished work is not ●. The missed change reaches the page. |

**One short case** stays outside the replays: a catch-up of a conversation the inbox never saw, from an empty page. One feature is half done: images attach, and PDFs wait on a question. The page may draw it as one row with both parts, or give the finished part a ✓ row of its own. The case checks that the question links to the feature, and that a finished part drawn as its own row is not ●. Finished work marked ● after a catch-up was a real failure, and Replay C's catch-up starts from a page that already holds the work.

The 20 single-exchange Status cases left `evals/cases.json`. Each one's scenario is a step above, and their checks run at every step. `status-shown-records-question` checks only the ledger, so it stays in the ledger suite. `catch-up-records-open-question-and-result` keeps its ledger check, and the short case above checks its Status.

| Case | Replay step |
| --- | --- |
| `status-feature-level` | A 9, and the text rule at every step |
| `status-direction-change` | B 4 |
| `status-plain-progress-no-course` | B 2 |
| `status-coordinator` | A 3, for the delegate's link |
| `status-single-task-not-coordinator` | B 2, for a piece that finishes in one exchange |
| `status-coordinator-update` | A 1 and A 10 |
| `status-ask-not-restated` | B 2 |
| `status-ask-links-right-subject` | A 5 |
| `status-problem-outside-task-not-subject` | A 8 |
| `status-long-name` | A 11 |
| `status-mid-turn-moves-on` | C 1 |
| `status-new-goal` | A 3 |
| `status-nothing-changes` | A 7 |
| `status-reversal-then-progress` | B 5 |
| `status-reversal-explained-again` | B 6 |
| `status-host-tasks` | C 1 |
| `status-long-session` | A, from its busy start |
| `status-child-linked` | A 9 |
| `status-reword-only` | A 7 |
| `status-no-time-words` | A 2, and the time-word rule at every step |

Two of these cases also checked the coordinator role, which the Status call no longer writes.
