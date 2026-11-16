# Splitting a milestone that grows too big

Status: built

A milestone can collect far more work than one outcome. One session's "Fixes merged" held 16 done fixes and 4 open features, so the Status page drew 20 rows under one name. This doc says how the Status call splits such a milestone. [agent-managed-goal.md](agent-managed-goal.md) describes the goal and milestones it builds on.

The mark `too big, N subjects, room for R` goes on an open milestone that more than `MILESTONE_SUBJECTS` subjects serve, open or done, when two or more of them are open and the goal has room for another milestone. `tooBigMilestones` in `hooks/status-prompt-goal.ts` decides it, and R is how many more milestones the goal can hold.

- The limit is 6, as many as the open subjects the page keeps (`OPEN_SUBJECTS`). Past it, the milestone collects whatever work comes along instead of naming one outcome.
- Done subjects count, since a catch-all milestone grows by collecting finished work. The page folds the done ones the person has seen into one "N done" row, but the milestone still names no single outcome.
- Two or more must be open, so a split moves real work. A milestone with one open subject left is nearly finished, and splitting that subject off would give a milestone named after one subject.
- With no room, nothing can be split, so the mark stays off rather than ask every call for a move it cannot make.

The `milestone-split` rule asks the call to split it by theme with the lines it already has:

- MILESTONE for each outcome its open subjects are for, named by theme, such as "Status page polish" or "Herdr drawing fixed", no more than R. Code drops a MILESTONE line past the 5 a goal holds.
- SERVES to move each open subject to its new milestone, or to - when the goal does not need it. Done subjects stay with the milestone they finished under and get no SERVES line.
- DONE for the old milestone once the split leaves none of its subjects open, or DROP when none of them is done. DONE applies before MILESTONE and SERVES, so a MILESTONE line past the room would leave open work under a done milestone. The room in the mark is there to prevent that.

A split changes milestones only, so it applies to a typed goal too, and the goal's words stay. While a typed goal waits for its milestones, those milestones belong to the goal before it and get no mark.

The `milestone-size` eval rule fails a milestone the call read marked too big that still has more than 6 subjects, one of them open, after the step. It ignores a milestone the call never saw marked.

The replay `milestone-split` in [status-replays.md](../../status-replays.md) checks it.
