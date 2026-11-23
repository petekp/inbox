# Files: shared modules for the Status

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `core/view/status-page.ts` | Shared module. `statusPage` builds the Status page's rows in order. |
| `core/view/status-repeats.ts` | Shared module. When the Status page draws one piece of work once: the goal's Now line that repeats a working subject, the subject drawn in its milestone's place, and the head's title that repeats a subject while no goal is set. |
| `core/view/status-page-parts.ts` | Shared module. The parts of the Status's list that `statusPage` builds: subject and child rows in order, with each part's folds after its open or its closed rows, and the counts by mark. Also the merged line and the text before a stall. |
| `core/domain/status.ts` | Shared module. The parser for the Status call's lines, and `askStatus`, which asks the call again when its answer holds no operation, or with a retry prompt when one is given. A line that is not an operation is left out. |
| `core/domain/status-freshness.ts` | Shared module. When a Status call last changed what the page says, and the Status tab's status line: a failed update, or "Not updated in 2h" after five calls that read a reply with agent work and changed nothing. |
| `core/domain/status-limits.ts` | Shared module. The Status's limits on words, subjects and children, `EMPTY_SESSION_STATUS`, `isOpen`, and the helpers that clip a text and compare subject names. |
| `core/domain/status-ops.ts` | Shared module. How an answer changes the saved Status: `applyOps`, `applyStatus`, and when a HEAD line replaces the head. |
| `core/domain/status-goal-ops.ts` | Shared module. How an answer and the goal's presses change the goal: GOAL and RETIRE lines, MILESTONE and SERVES lines, milestones moved by id, met, Remove goal and its Undo, and a typed goal. |
| `core/domain/status-suggest.ts` | Shared module. The suggested goal: the SUGGEST line an answer writes, kept only while no goal runs, and Set goal, which makes it the goal. |
| `core/domain/status-milestone-work.ts` | Shared module. A milestone follows its linked work: it closes when that work closes and starts when that work is under way. Also `forgetSeenWas`, which drops a milestone's was line once the person has seen it. |
| `core/domain/status-goal-gate.ts` | Shared module. When code takes a GOAL or RETIRE line, and why it refuses one: the work the goal still holds, when it last moved forward, how long the work has left it, and whether there is work for a new goal. |
| `core/view/status-folds.ts` | Shared module. Which Status rows a look draws while done folds and parent folds are open or shut, the chevron after a parent's name, and what waits on the person under each parent, which reopens its fold. |
| `core/view/status-gaps.ts` | Shared module. The space between Status rows: `list` between two one-line rows, `child` under a parent, `item` between top-level items, and the padding each row takes from the gaps beside it. |
| `core/view/fold-chevron.ts` | Shared module. The chevron every fold draws in the text looks, › folded and a lowercase v open. The Codex tab and the Herdr look draw an icon of the same path instead, turned down when open. |
| `core/view/status-path.ts` | Shared module. The goal's milestones as a path: their order, the line below each, where Later starts, which milestones get space above, and when the head's Now line only names the milestone under way. |
| `core/view/status-goal-page.ts` | Shared module. The goal's parts of the Status page: the goal block with its Now line and its milestone rows, the section's heading, and the line drawn while no goal is set. |
| `core/view/status-keys.ts` | Shared module. The Status page's buttons: View on a held subject or milestone, the goal's buttons, the order j and k move through them, and which one is selected. |
| `core/domain/status-children.ts` | Shared module. A child the host reports, and its end and activity. Which child rows the page draws. The text of the subjects, asks and children that the Status call reads, with each delegate that finished since the last call read the Status. When a look at the Status starts and ends. |
| `core/domain/status-upgrade.ts` | Shared module. `upgradeStatus`, which reads a saved Status from this build or an earlier one and leaves out anything wrongly shaped. |
| `core/domain/status-upgrade-goal.ts` | Shared module. The goal's fields of a saved Status, for `upgradeStatus`. Only an object loads as a goal. |
| `core/domain/status-prompt.ts` | Shared module. What the Status call reads: `STATUS_SYSTEM`, or for a host with `splitsPlanIntoSubjects` `PARTS_STATUS_SYSTEM`, and its prompts after a reply, during a long turn and for a catch-up. |
| `core/domain/status-prompt-goal.ts` | Shared module. What the Status call reads about the goal: its lines and input blocks, and its rules as named parts, so `statusSystem` can leave one out for an ablation. |
| `core/domain/status-retry.ts` | Shared module. `statusRetry`: what the Status call is asked once more after an answer that leaves a subject in `<idle>` with no line, or leaves no goal running and none suggested with no GOAL or SUGGEST line, and which lines of the second answer are kept. |
| `core/runtime/status-records.ts` | Shared module. The Status call: `statusCallPrompt` builds its prompt, `askAndWriteStatus` sends it and writes the answer, and `refreshStatus` runs one during a long turn. It also holds the call records, `StatusRecord` and `writeStatusRecord`. |
