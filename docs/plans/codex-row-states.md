# Codex row states

Status: built.

Every row in the Codex tab moves through one state machine, in `codex/src/rows.ts`. The machine decides what each row draws and which animation runs. Before it, that decision was spread over separate sets in `codex/src/tab.tsx`, and each fix covered one transition.

## What it fixed

Measured in the harness on 2026-10-10:

- **Dismiss, Done and answers.** The open row turned into its settled line in one draw. Its body and buttons vanished in the frame the reply arrived, and the row dropped from 108 px to 44 px with no animation.
- **A settling row measured its end height while an earlier animation still held it.** When a press's reply came back while the row was still growing to show "Sending…", the collapse measured the held height. The row then sat at 80 px for 200 ms and jumped to 44 px.

The simpler fix was to extend the switch-rows code, `closingRows` and `collapse()`, to the settle case. One machine for every state replaced it, so a new transition cannot be added without a defined start, end and animation.

## The states

Each row the shown tab draws, keyed by its id, is in one state:

| State | Draws | Comes to rest as |
| --- | --- | --- |
| `entering` | The row the view just brought in, growing from 0 height and fading in, 300 ms | `closed` or `open`, the form it arrived in |
| `closed` | The line | |
| `opening` | Line and panel, the height growing to fit, 200 ms | `open` |
| `open` | Line and panel | |
| `closing` | The line, and the panel, inert, while the height shrinks over it, 200 ms | `closed` |
| `settling` | The settled line, and the panel the row last drew open, inert, while the height shrinks over it, 200 ms | `settled` |
| `settled` | The settled line, with Undo and its countdown when the person's own Done or Dismiss closed it | |
| `undoing` | The settled line while an Undo press is out: Undo's label and arrow dim, the arrow turns and the countdown pauses | |
| `leaving` | The row's last form, fading while its height collapses to 0, 200 ms | Removed. A settled row counts in the Closed fold from the start of its exit |

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
- **A settling row is laid out as an open row is.** The settled line and the panel share one column, so the panel stays exactly where the open row drew it. The row's fill fades out over the same 200 ms as its height.
- **Nothing under the line moves while a press is out.** "Sending…" shows in the line's age slot. That slot is at least as wide as "Sending…" on every row, so the title keeps its width and does not wrap again when a press starts. The open row's panel runs under the side column, so the reserved width narrows only the title, and the panel is as wide as a settling row's. A local press's "Opening x…" shows after the title, where its result will show.
- **A row's parts do not fade in.** When a row settles or is undone, its line, panel and Undo swap in place. A fade from nothing there reads as a flicker. A row that arrives still fades in as a whole.
- **Time ends a move, not the animation.** After each draw, the tab schedules one more draw for when the first moving row's move is due to end. That draw brings the row to rest, so an animation that never reports its end cannot hold a row.
- **A move starts from the drawn height and opacity.** A row turned around mid-move, or closed while it still grows in, starts the new animation from where it is drawn.
- **A resting row takes a new height at once.** When the content of a `closed`, `open`, `settled` or `undoing` row changes height, the row resizes in the same draw. An example is a close that adds its reason to a held row's title line. An animated height would clip content that already shows, such as the field the person is typing in. While a press on the row is out, its height still animates, because the press's reply starts the row's next move from the height it has then.
- **A row's end height is its content's height.** The tab adds up the heights of the row's children, which no animation of the row changes. A group's empty line and fold take their end height the same way, so a draw in the middle of their move does not cut it short.
- **A leaving row keeps its place.** The tab draws it where it last drew it until it is removed, in its Asks group or its kind's Finds group.
- **A group's empty line and Closed fold take a leaving row's place.** A leaving row no longer counts in its group, so they show from the draw that starts its exit. One element holds both, with its content at its bottom. Its height grows on the exit's curve while the row collapses, so a fold already shown stays in view and the empty line slides in above it. The rows below move once, in one direction.
- **A row that arrives in an empty group takes the empty line's place.** While every row that stays in the group is entering, the empty line stays drawn, out of the flow, just above the fold. It fades out where it was, and the space it held closes on the entry's curve while the row grows over it. The rows below move only by the difference in height, in one direction. With reduced motion, rows do not enter, so the line goes in one draw.
- **Rows of a tab not shown are forgotten.** They show their form at once when their tab shows.
- **Reduced motion.** Every move ends in the draw that starts it.
- **The line never moves** between `closed`, `opening`, `open` and `closing`, as [motion-and-undo.md](motion-and-undo.md) says.

## Not changing

- The Claude app's pane. Its engine has no opacity or CSS, and fast redraws break its clicks, so Dismiss there still swaps the row in one draw.
- The Codex app's move, enter and exit curves and lengths.
- The settle clock in `codex/src/settle.ts`, which the server shares. Changing it would change the server's build fingerprint.

## Checks

- Tests in `codex/tests/press-row-states.spec.ts`: every state reaches every target, a row drawing its panel never drops it except through `closing`, `settling` or `leaving`, a row turned around mid-move, and reduced motion.
- In the harness, each row's height, opacity and panel, frame by frame, on both tabs: Dismiss with a slow reply, an answer with an instant reply, Undo, a failing Undo, a settled row leaving, a row arriving, a row arriving open and closed while it grows in, switching rows, reopening a row mid-close, and the Closed fold.
- `./scripts/check.sh`.
