# Inbox UI: rows

Part of [the inbox UI spec](../inbox-ui.md).

Status: built.

## 2. Shared vocabulary

### 2.1 What comes first

The count of what needs the person and the top row come first. The headline and status go to the agent, in the carry text. Every platform already shows which session waits on the person. The inbox adds the item itself.

The count is named by its tab, Asks. The band reads tab names with counts, and an empty inbox reads "Nothing needs you".

**What the count holds.** Asks counts:

- open questions;
- open tasks not handed off.

It leaves out findings, PR rows, handed-off rows and the stop line. A queued send (2.3) counts as pressed: an answered question is closed and leaves, and a handed-off row leaves, while a row with a queued talk send stays in the count. The Finds tab has its own count. The PRs tab counts the open PRs that need the person: a merge conflict, a failing check, requested changes or a thread waiting on them.

**The order of the Asks list.** The top row is the first row of this list. [Open inbox] opens the pane with it open.

1. Questions from the agent's newest reply, in the order asked.
2. Questions from older replies, newest reply first and each reply in its original order.
3. Tasks not handed off, newest reply first and each reply in its original order.

The Herdr sidebar line names the latest reply's first question through `hooks/herdr.ts:statusLine`. The band shows counts. The pane orders questions by reply, and its terminal handles use the numbered-answer mapping below.

### 2.2 Row types

A row has two forms:

- **Closed**: one line, with the handle, the title and the age.
- **Open**: the full title, the body and the row's actions.

| Row | Where | Closed form | Open form adds |
|---|---|---|---|
| Question | Asks | `ask · 3m ago`. The terminal adds `1)` or `•` before it (see numbers below) | Full ask, one button per option with the recommended one first, styled primary and labeled "(recommended)", help steps |
| Task | Asks | `ask · 3m ago`. The terminal adds `•` before it | Help steps (open, copy, run, terminal, link), "Open PR #N" when the ask names a tracked PR |
| Finding | Finds, under Issues or Opportunities | The kind's mark as the handle (▲ for an issue, ✦ for an opportunity), the title and the age | Detail, and "Relevant file: " with the file's base name |
| PR block | PRs | Always open: `#12 title`, readiness, one line of facts | PR actions |
| PR check | PRs, inside the PR block | Two lines: `✗ Failing check`, then the check's name. | Fix, Open log |
| Review thread | PRs | Two lines: `◦ Review thread · 2h ago`, with the comment count and "outdated" when they apply, then `api.ts:40 latest comment` | Comments as Markdown, and the file:line as a link to the comment. Open comment opens the same page |
| Review thread, sent | PRs | Folds to `✓ Review thread · Addressed 4h ago`, then the latest comment's first line | Unfolds when a newer comment arrives |
| Review thread, lines changed | PRs | Folds with no ✓, noted `Lines changed since this comment · still open on GitHub` | Nothing says the change fixed it, so it gets no ✓ |
| Stop | Top of the band and pane | One red line: what stopped and what to do | Nothing |
| Settled | Where the row was | `✓ Done · just now` with the leave bar | [Undo], after a Mark |
| Closed fold | Under Questions, Tasks, Issues and Opportunities | `▸ 3 Closed` | Up to 3 closed items, each `ask → outcome` |

Findings are grouped under an Issues title and an Opportunities title. Each group has its own Closed fold, and a group with nothing open reads `No open issues` or `No open opportunities`. A finding handed to the agent shows ✓ in place of its mark.

The Codex tab draws its lists flat, with no tree lines, in the app's sans font. Questions and tasks draw no mark, and their titles keep the same column. A row handed to Codex shows ✓. Rows sit flush, with no dividers between them. A collapsed row fills gray on hover and takes a click anywhere on it.

The Closed fold's outcomes are the answer itself ("Yes, rename"), "Done", "You ran it", "Dismissed", "Expired", "Closed by Claude: <reason>", and the per-turn update's own outcome text. A finding that Fix handed off lists as "Fix" or "Do it".

Only the Status tab shows the headline and status. The band shows only counts, and the other tabs only rows. The Codex tab has no band, and its tab labels carry the counts, so it draws no count or headline either.

**Question numbers.** Typing "1 yes" in the prompt answers a numbered question through `hooks/inbox-text.ts:answerNote`. That function maps a typed number to the agent's latest batch of questions: by the agent's own label when it gave one, else by position in the batch. It does this only when that batch came from the reply just before.

The rule, in the terminal: a question's handle shows a number only when a typed number reaches it now, and shows the number `answerNote` would resolve. Every other open question shows a task's bullet, `•`. The Claude app pane and the Codex tab draw no number or bullet: a question's own buttons answer it there, and the agent's reply already shows the numbers a typed answer uses. Once the person sends any message, the batch is no longer "the reply just before", and every handle becomes `•` until the agent asks again. The Codex tab follows the same rule, since it uses `answerNote` through `promptNotes`.

**Which row is open.**

- When the pane or tab opens, its first row that still waits on the person is open. A handed-off row stays closed until clicked, and a tab with no waiting row has none open. `firstWaiting` in `hooks/view.ts` picks the row for every look. Once a row is open that way, rows that arrive above it arrive closed and it stays open, so the row the person is reading does not close under them. `keptOpen` in `hooks/view.ts` picks it. When the pane or tab opens on a tab that shows only its empty text, it moves to the first other tab that lists rows, as it does when rows arrive there. `followTo` in `hooks/arrivals.ts` decides for both.
- A click on a closed row's title opens it. A click on an open row's title does nothing.
- After a press, the pressed row shows its result in place.
- When a press answers, closes or hands off the open row, the next row that still waits on the person opens, its buttons guarded. With none below it, the nearest one above opens. Rows already handed off are skipped. `rowAfterClose` in `hooks/view.ts` picks the row for every look.

**The press guard.** An action button ignores presses for 0.4 s after its row opens (`PRESS_GUARD_MS`). During that time the row's buttons draw dim (`dimColor` on a mod `Button`, `disabled` in HTML), so an ignored press shows why. A double-click on a closed row's title opens the row with its first click, and the second click lands on a button that just drew under the pointer.
