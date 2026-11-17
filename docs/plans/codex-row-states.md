# Codex row states

Status: built.

Every row in the Codex tab moves through one state machine, in `hooks/row-motion.ts`. The machine decides what each row draws and which animation runs. Before it, that decision was spread over separate sets in `codex/src/tab.tsx`, and each fix covered one transition.

## What it fixed

Measured in the harness on 2026-10-10:

- **Dismiss, Done and answers.** The open row turned into its settled line in one draw. Its body and buttons vanished in the frame the reply arrived, and the row dropped from 108 px to 44 px with no animation.
- **A settling row measured its end height while an earlier animation still held it.** When a press's reply came back while the row was still growing to show "Sending…", the collapse measured the held height. The row then sat at 80 px for 200 ms and jumped to 44 px.

The simpler fix was to extend the switch-rows code, `closingRows` and `collapse()`, to the settle case. One machine for every state replaced it, so a new transition cannot be added without a defined start, end and animation.

## The states

Each row the shown tab draws, keyed by its id, is in one state:

| State | Draws | Comes to rest as |
| --- | --- | --- |
| `entering` | The row the view just brought in, growing from 0 height, then fading in over `ENTER_FADE_MS` once its space is nearly open | `closed` or `open`, the form it arrived in |
| `closed` | The line | |
| `opening` | Line and panel, the height growing to fit | `open` |
| `open` | Line and panel | |
| `closing` | The line, and the panel, inert, while the height shrinks over it | `closed` |
| `settling` | The settled line, and the panel the row last drew open, inert, while the height shrinks over it | `settled` |
| `settled` | The settled line, with Undo and its countdown when the person's own Done or Dismiss closed it | |
| `undoing` | The settled line while an Undo press is out: Undo's label and arrow dim, the arrow turns and the countdown pauses | |
| `leaving` | The row's last form, fading out over `LEAVE_FADE_MS` while its height holds, then collapsing to 0 | Removed. A settled row counts in the Closed fold from the start of its exit |

Every height moves on `HEIGHT_SPRING` in `hooks/springs.ts`, the spring the Herdr panel uses, which does not overshoot. A move from rest, or one turned back mid-way, comes to rest within `HEIGHT_SETTLE_MS`, 528 ms, so each moving state lasts that long, as `ROW_STATE_MS` in `hooks/row-motion.ts` says. Content that leaves fades out over `LEAVE_FADE_MS`, 120 ms, while its space holds its height, and its space closes as soon as the fade ends, so a leaving row stays `leaving` for `LEAVE_FADE_MS` more. Content that enters waits while its space opens, until the space is within half of `SLIDE_PX` of open (`enterDelayMs`), then fades in over `ENTER_FADE_MS`, 150 ms. So no text is cut by a moving space. While a block that leaves holds its space, a height move that starts in the same draw waits for it, so nothing grows into the list before that space starts to close. The person's own moves do not wait: a row the selection opens, and a leave turned back, which fades back in from where it is. A glide already under way keeps moving. A settling row's fill fades over `FADE_MS`, 200 ms, since it is not content in a space that closes. A row, line or fold that enters or leaves also slides with its fade, `SLIDE_PX` (8 px) above its place when faded out: it slides up as it leaves and down as it enters, and nothing scales. The offset follows the opacity, so a move turned around mid-way slides back from where it is. With reduced motion there is no slide. The tab samples the spring once a frame and plays the positions as keyframes through `el.animate`.

At each draw the tab works out the form each row should have now, its target:

| Target | When |
| --- | --- |
| `open` | The view lists the row open or held, and it is the tab's open row |
| `closed` | The view lists the row open or held, and another row is open |
| `settled` | The view lists the row settled, and its time to show in place has not run out |
| `undoing` | As `settled`, while its Undo press is out |
| `gone` | The view no longer lists the row, its settled time ran out, or the tab no longer holds it |

A held row is drawn as an open row, so it needs no state of its own. When its reply sends, it moves through `settling`. After Discard, it moves through `leaving`.

`stepRow` takes a row's track and its target and returns the next track. A track is the row's state, when it entered it, and whether it draws the open row's panel. When the target changes, the row starts moving toward it from where it is drawn: `opening` toward open, `closing` toward closed, `settling` toward settled, `leaving` toward gone. This holds for a row still growing in, too. A leaving row that is listed again grows back in. When a moving state's time has passed, it comes to rest.

Rules that hold in every state:

- **A panel is never removed while it shows.** A track that draws the panel keeps drawing it through `closing`, `settling` and `leaving`, so its content is clipped by the shrinking height instead of vanishing. A row that settles from closed shows only its settled line.
- **The settled line shows as soon as the reply arrives.** It shows the outcome and Undo while the panel shrinks under it, so the press's result is visible at once.
- **A settling row is laid out as an open row is.** The settled line and the panel share one column, so the panel stays exactly where the open row drew it. The row's fill fades out over 200 ms.
- **Nothing under the line moves while a press is out.** "Sending…" shows in the line's age slot. That slot is at least as wide as "Sending…" on every row, so the title keeps its width and does not wrap again when a press starts. The open row's panel runs under the side column, so the reserved width narrows only the title, and the panel is as wide as a settling row's. A local press's "Opening x…" shows after the title, where its result will show.
- **A row's parts do not fade in.** When a row settles or is undone, its line, panel and Undo swap in place. A fade from nothing there reads as a flicker. A row that arrives still fades in as a whole.
- **Time ends a move, not the animation.** After each draw, the tab schedules one more draw for when the first moving row's move is due to end. That draw brings the row to rest, so an animation that never reports its end cannot hold a row.
- **A move starts from the drawn height, speed and opacity.** A row turned around mid-move, or closed while it still grows in, starts the new animation from where it is drawn, with the speed its height has there.
- **A resting row glides to a new height.** When the content of a `closed`, `open`, `settled` or `undoing` row changes height, the row's height moves to the new one on the height spring. Examples are the reply field opening and a title that wraps again. The reply field takes focus and shows its caret from the first frame of the glide. A row inside another moving element glides on its own, and the element around it follows at its natural height. A resting element whose content changes width, such as a tab whose count widens, glides its width the same way.
- **Lines enter and leave.** `stepLines` in `codex/src/tab-line-steps.ts` steps a list of lines through `stepRow`, the same as `stepLists` does for rows. It steps the Status page's lines, the goal's milestones and the lines under the goal's text, in `codex/src/tab-status-steps.ts`. It also steps the line a met goal's milestones fold into and the head drawn in its own section. The milestones that fold opens to are the goal's milestones, so they grow in and leave as stepped lines, and stay at rest while the goal turns met or unmet with the fold open. It also steps the banners under the tab bar, and the status an open row draws under its buttons while its press is out. A line the tab brings in grows in, and a line it drops leaves from its place, so its text stays until its space has closed. A line that grows in or leaves scales its vertical padding and top margin with its height, so it starts and ends at no height. The goal's heading glides when its height changes.
- **A settling part keeps its place.** When a row or block settles, the panel or body it drew open stays at the top it had, so its buttons do not jump up while the height shrinks over them.
- **A row's end height is its content's height.** The tab cancels the row's own glide and measures the row before the next paint, so no animation of the row changes it. A group's empty line and fold take their end height the same way, so a draw in the middle of their move does not cut it short.
- **A leaving row keeps its place.** The tab draws it where it last drew it until it is removed, in its Asks group or its kind's Finds group.
- **A group's empty line and Closed fold take a leaving row's place.** A leaving row no longer counts in its group, so they show from the draw that starts its exit. One element holds both, with its content at its bottom. Its height grows on the height spring while the row collapses, so a fold already shown stays in view and the empty line slides in above it. The rows below move once, in one direction.
- **A row that arrives in an empty group takes the empty line's place.** While every row that stays in the group is entering, the empty line stays drawn, out of the flow, just above the fold. It fades out where it was, and the space it held closes on the height spring while the row grows over it. The rows below move only by the difference in height, in one direction. With reduced motion, rows do not enter, so the line goes in one draw.
- **A PR row moves as an item row does.** `stepPrs` in `codex/src/tab-pr-steps.ts` steps each PR row on the PRs tab through `stepRow`, the same as `stepLists` does for the other tabs. A row the view no longer lists, such as a cancelled check after Re-run, leaves from its place in its group.
- **A PR group leaves with its last row.** A group's title and rows share one element with its own track. Its title counts only the rows the view lists. When the view lists none, the group leaves on the height spring while its rows collapse inside it, so the title stays drawn until its last row has left.
- **A PR block moves as a row does.** `stepPrs` steps each block through `stepRow` on its own track: `open` while the view lists it open, `settled` or `undoing` once it is dismissed, and `gone` once the view no longer lists it. Dismiss, Clear merged and closed and a ranked PR's Dismiss all go through it, so each block settles on its own. A settling block draws its settled line over the body it last drew open, inert, in the place it had, while its height shrinks to the settled line's. The body stays the same element, so a row still closing, opening or leaving in it finishes its move. That block fades over 200 ms, since the settled block's padding would otherwise still show its top. Undo opens the block again, its height growing from the settled line's. A block the view no longer lists leaves from its place in its last form.
- **A block's padding is inside the element that animates,** so the block's height is its content's height and its end height measures right.
- **The PRs tab's own buttons leave with the last merged or closed PR.** "Clear merged and closed" has its own track. It leaves when the view no longer offers it, drawn inert, and grows in when Undo brings a merged or closed PR back.
- **A PR block's press line grows in.** The line under a block's buttons, such as "✓ Started a re-run of CI", has its own track. It enters when it first shows on a block the last draw drew, and leaves with its last text.
- **A closing row comes to rest at its closed line's height.** A closing row also draws its closed line's after-label and side column, hidden, so the collapse measures the height the row has once the move ends. A PR row's ran line, which only the closed form shows, is hidden while the row closes.
- **Rows of a tab not shown are forgotten.** They show their form at once when their tab shows.
- **Reduced motion.** Every move ends in the draw that starts it, including a resting row's glide, a Status line, a banner and a tab's width.
- **A closing row's title keeps its open form until the height rests.** The title keeps its semibold weight through `closing`, and the weight eases to regular once the state ends. The row's line, which holds the title, glides from its open height to the closed title's height with the row, so the lines the closed title clamps away are clipped as the height shrinks instead of vanishing in one draw. A close that turns back glides the line up again. A measure of the row's natural height ignores a running line glide.
- **The line never moves** between `closed`, `opening`, `open` and `closing`, as [motion-and-undo.md](motion-and-undo.md) says.

## Not changing

- The Claude app's pane. Its engine has no opacity or CSS, and fast redraws break its clicks, so Dismiss there still swaps the row in one draw.
- The settle clock in `codex/src/settle.ts`, which the server shares. Changing it would change the server's build fingerprint.

## Checks

- Tests in `codex/tests/press-row-states.spec.ts`: every state reaches every target, a row drawing its panel never drops it except through `closing`, `settling` or `leaving`, a row turned around mid-move, and reduced motion. On the PRs tab of the real tab: a PR row closing with its panel, rows leaving from their places with their group and title, the press line growing in, a dismissed block settling under its settled line and growing back on Undo, Clear merged and closed settling two blocks while its buttons leave, a block leaving once the view drops it, and reduced motion.
- In the harness, each PR row's, group's and press line's height and position, frame by frame, in both themes and with reduced motion: switching rows, Fix, and Re-run with the cancelled rows leaving.
- In the harness, each PR block's and the tab's buttons' height and position, frame by frame, in both themes and with reduced motion: Dismiss and Undo, Clear merged and closed across two PRs and Undo on one, and Dismiss and Undo on a ranked PR.
- In the harness, each row's height, opacity and panel, frame by frame, on both tabs: Dismiss with a slow reply, an answer with an instant reply, Undo, a failing Undo, a settled row leaving, a row arriving, a row arriving open and closed while it grows in, switching rows, reopening a row mid-close, and the Closed fold.
- `./scripts/check.sh`.
