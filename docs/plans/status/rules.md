# The Status tab: the fixed rules

Part of [how the Status is judged](judging.md).

Status: built.

These run after every step of every replay, on the saved Status, the page `statusPage` draws, and the fact list:

- No text the model writes holds a time word or a date: the head, the goal, a milestone, a name, where it stands, or a Prev line.
- A name has at most 3 words, no "…" and no question mark. So do the head's title and a milestone's name.
- The head has a title and a one-line description, and the description does not repeat the title. While no piece in the fact list is working or waiting, it may have no description.
- A text names no command, file, hash, ticket or PR number, or count of tests, files, commits, lines, calls or checks.
- No name, where it stands, head, milestone or goal joins clipped phrases with a semicolon, as in "engine done; retries left".
- The head holds no status word, such as "ready", "merged", "passes" or "waiting".
- No two open subjects or milestones share every key word of a name, numbers included, or the same issue or PR number. So "2.4 release" and "2.5 release" are two pieces.
- Every open piece in the fact list matches a row or is in the "N more" fold.
- Each piece's mark matches its state in the fact list. Where two marks are both right, as for work just set aside, the fact list allows both.
- No subject matches an ask, a finding, a task for the person or a standing rule in the fact list. No text restates an open ask or finding.
- Each open ask is linked to every subject the fact list says it holds up, and to no other. A held subject's text names no decision, such as "needs your decision" or "your call".
- No open subject's or milestone's text says it waits on the person, as in "waiting on your check". The open ask says that.
- Each running child is linked to the subject the fact list names.
- An open subject with a running child row says in where it stands what the child's label does not. Where the fact list gives a pattern for text that says only what the child is doing, the text does not match it.
- A working subject whose child rows have all finished, and that no ask holds up, names in where it stands the step left in this session, as the fact list gives it.
- A child's label is not its host's handle, joins no words with "-" or "_", and has at least two words. The replays start their delegates with ids and show no Herdr focus, so this check stays known failing for them. The eval-trust follow-ups name the replay step it needs.
- On a step the fact list marks as no news, no row's or milestone's last-changed time or place moves.
- On a step the fact list marks as a change, each changed piece's last-changed time moves.
- On a reversal step, the right subject has a Prev line, and on a step of plain progress no new Prev line appears.
- No Prev line on the drawn page ends cut with "…".
- The head follows the fact list: it changes where the work moved, and holds where it did not, unless it was already off the focus before the step. Its title no longer names finished work the focus moved on from. While a goal is set, the check reads the head's description, which the page draws as "Now:". Filling or clearing the description under the same title counts as holding.
- Once no piece is working or waiting, the head's description names no finished piece.
- A head title that the fact list marks as naming the whole focus keeps naming it while the fact list keeps that title, so it is never retitled to a piece of the work.
- While a call has failed and none has written since, the status line shows the failure.

The goal adds these:

- The answer the host would apply, after its one re-ask, parses.
- No goal is set at a step that makes no next goal clear.
- A step that makes the next goal clear, from the person's words or the work, shows that goal. At a step whose work names the outcome but not as the person's direction, the facts can also accept that outcome as the suggested goal while no goal runs.
- While no goal runs, a step whose fact list names the outcome the work most likely leads to suggests that outcome as the goal.
- Each milestone in the fact list has a milestone with a mark its state allows. A working one may be planned in steps: while one of its milestones, or the one its work serves, is working, the others may be queued.
- Where the fact list says which queued milestone the plan takes up next, that milestone is the next one on the path.
- A goal has 2 to 5 milestones, none named after a subject.
- A milestone the call read marked too big still has more than 6 subjects after the step only when none of them is open.
- A subject the goal needs is not under Other work, and one it does not need is not linked to a milestone.
- A goal the fact list marks as left by the work is retired or met, not still open. One whose outcome the person dropped is retired, not shown met.
- A goal the fact list keeps, met or not, stays on the page. One the work has paused on may stay or end.

**The code holds** are checked at every step of every run, and any failure blocks:

- A typed goal that is not met, with linked work still open, changes only on a press.
- A goal set with no press restates neither the goal before it nor a goal the person removed, as `restatesGoal` judges it.
- The goal shows met exactly while every milestone that is not dropped is done.
- A milestone shows ◆ exactly while it is open and an open ask holds it up, itself or through a subject that serves it.
- Under Other work, an open subject that changed since the person looked, or that an ask holds up, has its own row.
- While the goal shows milestones, every subject not under one sits under Other work. While it shows none, a subject not linked yet sits above Other work.
