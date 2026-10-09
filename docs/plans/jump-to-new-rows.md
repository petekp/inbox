# Jump to a new row

Status: built. Terms follow `GLOSSARY.md`.

## The rule

When the tab the person is on is empty and a new row appears on another tab,
the pane switches to that tab and selects the new row. Reason: an empty tab
has nothing to lose, and the new row is the next thing to look at.

## What counts

- **An empty tab** shows only its empty text. Each of these puts something on
  screen the person may be reading, so the tab is not empty while it shows:
  - an open row
  - a just-closed row, during its 5.12 seconds in place
  - a Closed fold opened over closed items
  - a stop, on the Needs you tab
  - "Checking for PRs…" or "Refreshing PRs", on the PRs tab
- **A new row** is one its tab did not have before the change that added it.
  On the PRs tab, a new PR counts too, even with no rows under it.
- **When several tabs gain rows at once**, the pane goes to the first in tab
  order: Needs you, Findings, PRs. Reason: Needs you is what waits on the
  person.
- **The selection** goes to the first new row in the tab's order. A new PR with
  no rows selects nothing, and the pane scrolls to the top.
- **The pane must be on screen.** A row that arrives while the pane is closed
  or behind another pane moves nothing.

## The arrival

A jump shows where the pane went, for a person looking at the conversation:

- **The tab's top edge draws in.** The line in the tab's color along the top of
  the selected tab fills from left to right over 200 milliseconds.
- **The new row gets a bar in the tab's color** along its left edge for 1.5
  seconds. Then it goes back to how a selected row looks in the theme: no bar
  where the theme marks selection with a background, or the usual bar.

Both redraw the pane a few times, once per jump. Nothing keeps animating.

## What doesn't count

- **Opening the pane.** `/inbox` records what each tab holds, so nothing in
  them is new yet. Reason: the person opened it to see the tab they left.
- **A PR fetch still running.** The PRs tab's rows are compared only when no
  fetch runs. So the PRs a fetch finds as the pane opens, as at the start of
  a session, are recorded without a jump. Reason: the person opened the pane
  to see that nothing waits on them, and a jump a second later would undo
  that.
- **Turning `/inbox demo` on or off.** Every tab's rows change at once, so the
  pane records them again without a jump.

## Where it runs

Rows can arrive three ways: a ledger change (questions, tasks, findings), the
checks left failing when a turn ends, and the end of a PR fetch. Each of those
writes calls `followNewRows`.

It can't run in the pane's render, because the engine refuses a state write
while a render draws. A `state.set` hook was tried too. In the test harness,
it missed the writes from the update after a turn and from a PR fetch.
