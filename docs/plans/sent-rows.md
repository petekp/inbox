# Rows handed to Claude

Status: built. Terms follow `GLOSSARY.md`. It extends
[action-feedback.md](action-feedback.md).

## The rule

When the person hands a row's work to Claude, the row stops waiting on them.
Every surface shows that the same way:

- **It folds.** One line with a ✓ and what was sent, as in "Run load script
  sent · 1m ago". The body and the row's keys sit behind Details, on `v`.
- **It leaves every "waiting on you" count:** the band and the tab counts.
  A PR's blockers still list it, in words that say it was sent, since it still
  blocks the merge.
- **It unfolds and counts again** when something shows it waits on the person
  again. Each row kind names that event below.

An answered question already behaves this way, by closing. The rows below
stay open because the outside world, not the inbox, decides when they are
done: Claude's next reply, a check's next run, or GitHub.

## What the pane does now

| Row | Hand-off press | Folds | Leaves the count |
| --- | --- | --- | --- |
| Question | An answer, typed or picked | Closes | Yes |
| Task | A Run step, or a typed reply | No | No |
| Failing check, this session | Fix | No | Yes |
| Failing check on a PR | Fix | No | PRs tab only. The band and blockers still count it |
| Review thread | Address, Address all, Draft reply, Discuss | Yes | No |
| Finding | Address, Discuss, a typed reply | Leaves the list | Yes |

So the same press means three different things on three surfaces. A task
still shows its options after Run, which is the bug the person reported.

## Changes

1. **Task.** A Run step or a typed reply folds the task. It unfolds when the
   inbox update for the turn that answered the send has applied and the task
   is still open. That means Claude's reply did not show it done, so it waits
   on the person again. Rejected: closing the task on the press, as a
   question closes. If Claude cannot run it, the task is gone, and the inbox
   model is told never to re-add a closed item.
2. **Failing check, this session and on a PR.** Fix folds the row. A new run
   of the check unfolds it, as now: a rerun replaces the result, and a PR
   check's new run has a new URL. The band stops counting a check whose fix was sent. The PR's blockers keep
   it, as "1 failing check, fix sent".
3. **Review thread.** A sent thread leaves "N threads waiting on you" in the
   band, the blockers and the PRs tab count. The blockers list it as "1 thread
   sent to Claude". It already folds.
4. **Outdated review thread.** GitHub marks a comment outdated when a later
   commit changed the lines it was on. An unresolved, outdated thread folds
   with "Lines changed since this comment · still open on GitHub" and leaves
   the counts. Its handle stays the muted dot, since the person sent nothing and GitHub
   cannot tell whether the change fixed it. The blockers list it as "1 thread
   on changed lines". A reply from someone
   else newer than the PR's latest commit keeps it waiting. That needs the
   latest commit's date in `THREADS_QUERY`.
5. **Which presses hand off work.** Run, Fix, Address, Address all, Resolve
   conflicts and a typed reply hand work to Claude. Explain, Discuss and Draft
   reply ask Claude to talk or draft, and the person still owes a decision or
   a post. So those three record their last action but don't fold the row.
   This replaces the thread rule in action-feedback.md, which folded on
   Discuss and Draft reply.
6. **Last-action color.** The last action is green only on a row with a ✓.
   On a row still open it is muted, so it does not read as an answer.

Findings keep their current behavior. Whether Address and Discuss should
keep a finding open until Claude closes it is an open decision in
[instructions.md](instructions.md).

## Saved state

A task's fold needs to know which turn its send started. `LastAction` gains an
optional field for it, so saved state from older versions still reads.
