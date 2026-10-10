# Motion and Undo

The Codex tab gets enter, exit and move animations, and both clients get a clearer Undo state. Codex gets motion first, because its view is a web page. The Claude app's pane has no CSS, so its motion waits on a probe.

## Status

- **Codex tab:** built and checked in a local copy of the tab, in both themes and with reduced motion. Not yet seen in the Codex app.
- **Claude app:** the outcome colors and the countdown are built. A real click on Undo while the countdown runs is not yet tested.

## How the Codex tab animates

The tab uses the browser's own animation engine: CSS transitions and `@starting-style` for most moments, and the Web Animations API for heights. It adds no library.

Reason: the `motion` package's small build is a wrapper over the same Web Animations API. Its spring curves compile to CSS `linear()` easing, and Codex already ships one as a token. Every effect below runs on the browser alone. The full `animate` adds 20 KB gzipped to a 12 KB tab, and nothing below needs it. View Transitions were ruled out: they snapshot the whole page and jump to the end when interrupted, and the tab redraws every 3 s.

The timing and curves are the Codex app's own tokens, from its bundled styles:

| Token | Value | Used for |
| --- | --- | --- |
| `--cubic-enter` | `cubic-bezier(.19, 1, .22, 1)` | Things appearing |
| `--cubic-exit` | `cubic-bezier(.8, 0, .4, 1)` | Things leaving |
| `--cubic-move` | `cubic-bezier(.65, 0, .35, 1)` | Heights and positions changing |
| `--ease-spring-snappy` | a `linear()` spring | A pressed button settling back |
| Durations | 150, 200 and 300 ms | Hover and fades, moves, enters |

When the system asks for reduced motion, every duration is 0 and the leave countdown does not run.

### What moves

1. **A row arrives.** Its height grows from 0 and it fades in, 300 ms. The rows below slide down with it. The new-row bar fades out instead of vanishing.
2. **A row opens or closes, as an accordion.** The row's line, its mark, title and age, stays where it is in both states. Opening reveals a panel under it, and closing hides that panel again. The row being closed and the row being opened move together, 200 ms on the move curve, so the rows below slide once.
   - **Opening:** the row's height grows to fit the panel. The panel fades in and slides down 4 px. The title unclamps to its full length in place.
   - **Closing:** the panel stays drawn, and takes no clicks, while it fades out and the row's height shrinks to the line. Then it is removed.
   - **The line never moves.** Open and closed rows have the same padding, and the title keeps its weight, because a bolder title rewraps the line. The open row is marked by its fill and its panel. The kind label, as "Opportunity", moves into the panel, under the line.

   Reason: the old open row replaced the line with a block that put the kind label above the title, so the title jumped down a line, and closing removed the content at once, so the row shrank around an empty space.
3. **A row closes by a press.** The open row turns into its settled form in place: its height moves to the settled size and the content crossfades.
4. **A settled row leaves.** It fades and its height collapses, 200 ms, and only then is it removed. The rows below slide up.
5. **The Closed fold opens or closes.** The closed list's height moves. Its chevron switches from right to down at once, with no turn.
6. **The field opens.** The field and its buttons fade in where the follow-ups were.
7. **A tab switches.** The new tab's body fades in, 150 ms.
8. **A note or error appears under the tab row.** It fades in.
9. **Hover.** Fills and text colors change over 150 ms, on rows, buttons and tabs.
10. **A press.** A button scales to 0.97 while pressed and springs back.

The tab plan's earlier rule, that motion only answers a press, is replaced: anything that appears or leaves moves, including rows a poll brings.

Every row keeps one element from arrival to removal, keyed by its id, whether it is open, settled or back after Undo. Today a row changes key when it settles, so nothing can move between the two states.

The 400 ms guard after a row opens stays, but it no longer dims the buttons. The dimming read as a flicker on every click.

After a press in a list, closed rows and the fold show no hover fill until the pointer moves. Rows slide under a pointer that stays where it clicked, and the row that ends up under it would light up as the list settled.

## The settled row and Undo

The settled row in the Codex tab is one line, as tall as an open row's closed line, so the list keeps its rhythm:

- **Mark:** ✓ in green for Done and answers. For Dismissed, Expired and closes by Codex, a muted ✓, matching how the Closed fold draws them.
- **Outcome first:** "Done" or "Dismissed" in weight 500, green for Done and answers. The person just caused it, so it reads first.
- **Then the title:** muted, after " · ", cut with an ellipsis.
- **Undo:** a text button with the undo icon at the row's right, as Codex draws its own Undo. It shows only when the person's own Done or Dismiss closed the row.
- **Countdown:** a 14 px clock face just left of Undo. Its wedge empties clockwise over the time Undo has left. A partial ring would read as a loading spinner. A row with no Undo has no clock, and simply leaves when its time is up.

Pressing Undo:

- The button reads "Undoing…" and takes no second press. The clock stops, and the row does not leave while the press is out.
- On success, the row grows back to its open form in place, with "✓ Undo" under its title for 5.12 s, as every other press shows its result.
- On failure, the error replaces the title, in the error color, while the row has time left. It wraps, so none of it is cut. If the row's time is up, the row leaves and the error shows under the tab row.

## The Claude app pane

The pane is drawn through the engine's elements, which have no opacity, transform or CSS. Fast redraws from the hooks module break clicks, as issue #100924 records. So the pane gets:

- **Now:** the outcome colors above. Green only for Done and answers. The terminal pane shares this code, so its settled rows change the same way.
- **The countdown:** a 2 pt bar under a settled row that has Undo, from the text column to the card's edge. It drains in muted gray over a divider-gray track. No way to draw a clock face in the pane has been verified, so it keeps the bar. It is its own keyed `Client`, `countdown-client.tsx`, which ticks every 100 ms with `surface.every` and stops when empty, so the pane does not redraw. A probe showed the timer ticking on desktop, and five accessibility presses on a Button beside a ticking Client all registered. Real pointer clicks on Undo while it ticks still need a check.

## Checks

- Capture each moment above in the harness, in both themes, mid-animation and at rest.
- Check with reduced motion: nothing moves, and every state still shows.
- Press Undo, a slow Undo and a failing Undo in the harness.
- Run `./scripts/check.sh`.
- Reinstall the Codex plugin and look in the app.
