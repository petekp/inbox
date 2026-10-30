# The look

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

The look is a Herdr app mod: JavaScript that describes native GPUI elements, drawn with Herdr's theme colors. It should read as one of Herdr's own panels, like its Files and Changes panels, not as a copy of the Codex tab.

## Where it opens

| Place | How | For | Against |
| --- | --- | --- | --- |
| A pane beside the agent | `pane.split { mod }` | Sits next to the session it shows. Herdr's pane frame gives it a header with split, zoom and close. A pane mod belongs to its tab and stays alive in it. | Takes width from the terminal. |
| A tab of its own | `tab.new { mod }` | Full width. | The session is in another tab, so the person switches back and forth. |
| A floating window | `openOverlay({ kind: 'window', key, keep })` | One window for every tab, and it can reopen on start. | Floats over terminals, and a layout switch closes it. |
| A popup or dialog | `openOverlay({ kind: 'popup' })` | Quick look. | Closes on a click outside, so it cannot stay open while the person works. |
| A sidebar section | A cloned layout | Always there. | A shipped layout is read-only. The person runs a clone that stops getting Herdr's layout updates. |

The look opens in **a pane to the right of the agent's terminal**, about 420 px wide. Every look today sits beside its session, and a pane is the only place that does that without a cloned layout.

**Opening it.** The host's `/inbox` command, run in a Herdr app terminal, opens the pane with `herdr-app do pane.split '{"direction":"right","pane":"<id>","mod":"inbox"}'`. The spike opened its pane exactly this way. The host does not know its pane's id, only its terminal, so it needs a way to find the pane from the terminal. `herdr-app status` names only the focused pane. This is an open question.

A key cannot ask a closed look to open, because a copy of a mod receives `<mod>.<command>` only while it shows. A key in `keys.json` could open the look only if a binding can carry `pane.split`'s arguments, which was not checked.

## Following the focused pane

The look shows the session of the terminal the person last focused in its tab. Herdr re-renders a mod when focus or a terminal's labels change, so the look needs no timer for this.

- **A terminal has focus.** `focused().terminal` names it. Its `inbox.session` label names the session, and the look loads `<app home>/inbox/sessions/<id>.json`.
- **The look itself has focus.** `focused().terminal` is null for a mod pane. The look keeps the last terminal.
- **Nothing in its tab had focus yet.** The look takes the first terminal in its tab that has an `inbox.session` label. The spike needed this: reloaded while it had focus, it showed no inbox until this fallback was added.
- **The terminal has no inbox.** A shell, or an agent without the inbox: the look says "No inbox in this terminal" and names the program that runs there.
- **The session ended.** The terminal's foreground program is a shell again: the look says the session ended.
- **The session changes.** The look resets its holds, as switching tabs does in the other looks. `shownSince` becomes the time it first drew the new session.

## Mapping the shared plans to native controls

The look draws the buttons each shared plan lists, in the plan's order. It styles and wraps them, and never reorders, adds or drops one.

| Plan | Drawn as |
| --- | --- |
| `shownTabs`, `tabBadge` | A row of tab buttons with counts |
| `rowKeyPlan(r).keys`, then `.more` | Buttons in one wrapping row, the follow-ups after the keys, as the Codex tab orders them |
| `threadActions`, `checkActions`, `prBlockActions`, `prTabActions` | Buttons under each PR thread, check and PR block, and in the PRs tab's header |
| `statusKeyPlan` | The View button on a Status subject |
| `helpKeys(look)` | The Help page's key list |

Emphasis maps to Herdr's own button styles. `primary` uses `solid` and `solid_foreground`, the colors Herdr's primary buttons use. `normal` is `raised` with a `border`. `quiet` is text only. A whole button takes clicks, with `on_click` on its outer element and `cursor_pointer`. Each button sets `accessibility_label` to its full label.

Text uses Herdr's UI font, so `rowTitle(r, 'herdr')` follows the desktop look's rules rather than the terminal's.

## Every state and every move

The Codex tab steps each row through one state machine: `entering`, `closed`, `opening`, `open`, `closing`, `settling`, `settled`, `undoing` and `leaving`, in `codex/src/rows.ts`. The file imports nothing from Codex. It moves to `hooks/row-motion.ts`, and both the Codex tab and the Herdr look step rows with it. The rules in `docs/plans/codex-row-states.md` then hold in both looks: a panel is never removed while it shows, the settled line shows as soon as the result arrives, and time ends a move, not the animation.

GPUI animates natively, with no script running during the motion:

- `transition(property, { duration, easing })` animates later changes to `opacity`, `width`, `height`, `left` and `top`. The spike drew a row's opacity going from 1 to 0.35 over 1.5 s. Window shots during the fade read the row's text falling from 238 out of 255 before the press to 132 at 601 ms. So the transition runs in the app.
- `spring(property)` for a move that should settle with a little give.
- `.frames(list, ms)` for running marks: `RUNNING_FRAMES` at `RUNNING_FRAME_MS`, drawn natively and only while shown.
- `.loop(property, { from, to, period })` for a pulse.

A row's height animates between pixel values. The look learns a row's content height from `on_size_change` on the row's inner element, then animates the outer element's `h` from that height to 0 as the row leaves. Not checked in the spike.

**A row stays in the tree until its move ends.** In the spike's first press, the row left the view mid-fade, so its fade was cut off. Two fixes: send the look's holds with each press, so the row settles in place, and keep a leaving row drawn until `cx.timer.after` ends its move.

**A press shows at once.** The pressed button draws as out and the row's line reads "Sending…" in the same draw, before the press file is written. In the spike, the pressed row's fade showed in a window shot 84 ms after the press.

**Reduced motion.** Neither `herdr.d.ts` nor `gpui-kit.d.ts` exposes a reduced-motion setting. Until one exists, the look follows the system setting if Herdr reports it, and otherwise animates. Open question.

## Keys

Herdr is a desktop app, so the look is click-first, and every move works with the mouse.

- **In the look.** The look takes keys while it has focus, through `track_focus` and `on_key_down`. Its keys match the other looks: `j` and `k` move between rows, each row's hotkeys from `rowKeyPlan` press its buttons, and the arrow keys move between tabs. `Escape` gives focus back to the agent's terminal with `run('pane.focus', { terminal })`.
- **From anywhere.** `keys.json` can bind a key to `inbox.<command>`, which reaches the look's `nextCommand()` only while it shows. Herdr's mod commands are not in its command palette.

## Light and dark

The look draws only with `theme()` colors, which every light and dark theme names alike. The inbox's tones map onto Herdr's agent colors, so a count means the same thing in the inbox and in Herdr's sidebar:

| Inbox tone | Herdr color |
| --- | --- |
| Needs you | `blocked` |
| Done | `done` |
| Running | `working` |
| Muted text | `muted`, and `dim` for the quietest |
| Row fill | `background` on `surface` |

Each state is checked in Herdr's light and dark themes in the VM.
