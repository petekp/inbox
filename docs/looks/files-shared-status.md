# Files: shared modules for the Status

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/status-page.ts` | Shared module. `statusPage` builds the Status page's rows in order. Also the merged line and the text before a stall. |
| `hooks/status-page-parts.ts` | Shared module. The parts of the Status's list that `statusPage` builds: subject and child rows in order, with each part's folds after its open or its closed rows, and the counts by mark. |
| `hooks/status.ts` | Shared module. The parser for the Status call's lines, and `askStatus`, which asks the call again when its answer holds no operation. A line that is not an operation is left out. |
| `hooks/status-limits.ts` | Shared module. The Status's limits on words, subjects and children, `EMPTY_SESSION_STATUS`, `isOpen`, and the helpers that clip a text and compare subject names. |
| `hooks/status-ops.ts` | Shared module. How an answer changes the saved Status: `applyOps`, `applyStatus`, and when a HEAD line replaces the head. |
| `hooks/status-goal-ops.ts` | Shared module. How an answer and the goal's presses change the goal: GOAL and RETIRE lines, MILESTONE and SERVES lines, milestones moved by id, met, Remove goal and its Undo, and a typed goal. |
| `hooks/status-suggest.ts` | Shared module. The suggested goal: the SUGGEST line an answer writes, kept only while no goal runs, and Set this goal, which makes it the goal. |
| `hooks/status-milestone-work.ts` | Shared module. A milestone follows its linked work: it closes when that work closes and starts when that work is under way. Also `forgetSeenWas`, which drops a milestone's was line once the person has seen it. |
| `hooks/status-goal-gate.ts` | Shared module. When code takes a GOAL or RETIRE line, and why it refuses one: the work the goal still holds, when it last moved forward, how long the work has left it, and whether there is work for a new goal. |
| `hooks/status-folds.ts` | Shared module. Which Status rows a look draws while done folds and parent folds are open or shut, the chevron after a parent's name, and what waits on the person under each parent, which reopens its fold. |
| `hooks/status-gaps.ts` | Shared module. The space between Status rows: `list` between two one-line rows, `child` under a parent, `item` between top-level items, and the padding each row takes from the gaps beside it. |
| `hooks/fold-chevron.ts` | Shared module. The chevron every fold draws in the text looks, › folded and a lowercase v open. The Codex tab and the Herdr look draw an icon of the same path instead, turned down when open. |
| `hooks/status-path.ts` | Shared module. The goal's milestones as a path: their order, the line below each, where Later starts, which milestones get space above, and when the head's Now line only names the milestone under way. |
| `hooks/status-goal-page.ts` | Shared module. The goal's parts of the Status page: the goal block with its Now line and its milestone rows, the section's heading, and the line drawn while no goal is set. |
| `hooks/status-keys.ts` | Shared module. The Status page's buttons: View on a held subject or milestone, the goal's buttons, the order j and k move through them, and which one is selected. |
| `hooks/status-children.ts` | Shared module. A child the host reports, and its end and activity. Which child rows the page draws. The text of the subjects, asks and children that the Status call reads, with each delegate that finished since the last call read the Status. When a look at the Status starts and ends. |
| `hooks/status-upgrade.ts` | Shared module. `upgradeStatus`, which reads a saved Status from this build or an earlier one and leaves out anything wrongly shaped. |
| `hooks/status-upgrade-goal.ts` | Shared module. The goal's fields of a saved Status, for `upgradeStatus`. Only an object loads as a goal. |
| `hooks/status-prompt.ts` | Shared module. What the Status call reads: `STATUS_SYSTEM`, or for a host with `splitsPlanIntoSubjects` `PARTS_STATUS_SYSTEM`, and its prompts after a reply, during a long turn and for a catch-up. |
| `hooks/status-prompt-goal.ts` | Shared module. What the Status call reads about the goal: its lines and input blocks, and its rules as named parts, so `statusSystem` can leave one out for an ablation. |
| `hooks/status-records.ts` | Shared module. The Status call: `statusCallPrompt` builds its prompt, `askAndWriteStatus` sends it and writes the answer, and `refreshStatus` runs one during a long turn. It also holds the call records, `StatusRecord` and `writeStatusRecord`. |
