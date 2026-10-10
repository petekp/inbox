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
2. **A row opens or closes.** Its height moves between the two sizes, 200 ms, and the opened content fades in, 150 ms.
3. **A row closes by a press.** The open row turns into its settled form in place: its height moves to the settled size and the content crossfades.
4. **A settled row leaves.** It fades and its height collapses, 200 ms, and only then is it removed. The rows below slide up.
5. **The Closed fold opens or closes.** The closed list's height moves, and its arrow turns.
6. **The field opens.** The field and its buttons fade in where the follow-ups were.
7. **A tab switches.** The new tab's body fades in, 150 ms.
8. **A note or error appears under the tab row.** It fades in.
9. **Hover.** Fills and text colors change over 150 ms, on rows, buttons and tabs.
10. **A press.** A button scales to 0.97 while pressed and springs back.

The tab plan's earlier rule, that motion only answers a press, is replaced: anything that appears or leaves moves, including rows a poll brings.

Every row keeps one element from arrival to removal, keyed by its id, whether it is open, settled or back after Undo. Today a row changes key when it settles, so nothing can move between the two states.

The 400 ms guard after a row opens stays, but it no longer dims the buttons. The dimming read as a flicker on every click.

## The settled row and Undo

Today the settled row puts a green label and a small gray "Undo" on one line, over a 96 px hairline that counts down. Every outcome is green, including Dismissed and Expired. Undo shows nothing while it runs and nothing if it fails.

The settled row in the Codex tab becomes:

- **Mark:** ✓ in green for Done and answers. For Dismissed, Expired and closes by Codex, a muted ✓, matching how the Closed fold draws them.
- **Line 1:** the title, muted.
- **Line 2:** the outcome. Green for Done and answers, muted for the rest.
- **Undo:** a gray pill at the row's right, centered on its two lines, when the person's own Done or Dismiss closed the row.
- **Countdown:** the row's bottom edge, from the text column to the card's edge, is a 2 px bar that drains over the time Undo has left. It replaces the 96 px hairline. A row with no Undo has no bar, and simply leaves when its time is up.

Pressing Undo:

- The button reads "Undoing…" and takes no second press. The countdown pauses, and the row does not leave while the press is out.
- On success, the row grows back to its open form in place, with "✓ Undo" under its title for 5.12 s, as every other press shows its result.
- On failure, the error shows on the settled row in the error color while the row has time left. If the row's time is up, the row leaves and the error shows under the tab row.

## The Claude app pane

The pane is drawn through the engine's elements, which have no opacity, transform or CSS. Fast redraws from the hooks module break clicks, as issue #100924 records. So the pane gets:

- **Now:** the outcome colors above. Green only for Done and answers. The terminal pane shares this code, so its settled rows change the same way.
- **The countdown:** a 2 pt bar under a settled row that has Undo, from the text column to the card's edge. It drains in muted gray over a divider-gray track, as in the Codex tab. It is its own keyed `Client`, `countdown-client.tsx`, which ticks every 100 ms with `surface.every` and stops when empty, so the pane does not redraw. A probe showed the timer ticking on desktop, and five accessibility presses on a Button beside a ticking Client all registered. Real pointer clicks on Undo while it ticks still need a check.

## Checks

- Capture each moment above in the harness, in both themes, mid-animation and at rest.
- Check with reduced motion: nothing moves, and every state still shows.
- Press Undo, a slow Undo and a failing Undo in the harness.
- Run `./scripts/check.sh`.
- Reinstall the Codex plugin and look in the app.
