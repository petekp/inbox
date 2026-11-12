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

**Opening it.** The host's `/inbox` command, run in a Herdr app terminal, opens the pane with `herdr-app do pane.split '{"direction":"right","pane":"<id>","mod":"inbox"}'`. The spike opened its pane exactly this way. The host knows its terminal, not its pane, and finds the pane in the row `herdr-app ls` lists for its `HC_TERMINAL_ID`. `herdr-app ls` lists terminals and not mod panes, so a host cannot see a look that is already open. After a split, the host sets the terminal's `inbox.panel` label to the pane id `pane.split` printed, and keeps the id itself too. Its next open, or another host's in the same terminal, runs `pane.focus` on that pane. Exit 0 means focused. The error `no such pane` means the panel is gone, so the host removes the label and splits again. Any other failure means the panel is still there, so the host says it is open and splits nothing. Two opens at once share one split.

`herdr-app ls` prints, with no flag: `{ "spaces": [ { "id", "name", "folder", "machine": null, "active", "tabs": [ { "id", "name", "active", "settled", "terminals": [ { "terminal": "t1c", "pane": "p3dad…", "status", "app", "name", "sub_agents": ["t1j"] } ] } ] } ], "recent": … }`. `terminal` is the `HC_TERMINAL_ID`, and a remote space names its `machine`. `herdr-app do pane.focus` on a pane id the app does not have prints `{ "error": "no such pane" }` and exits 1. When the panel cannot open, the host opens its own inbox and says why. "Opening the Herdr look" in [the hosts' differences](../../looks/differences-hosts.md) gives each host's behavior.

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
| `threadActions`, `checkActions`, `prBlockActions` | Buttons under each PR thread, check and PR block |
| `statusKeyPlan` | The View button on a Status subject |
| `helpKeys(look)` | The Help page's key list |

Emphasis maps to Herdr's own button styles. `primary` uses `solid` and `solid_foreground`, the colors Herdr's primary buttons use. `normal` is outlined with `input`. `quiet` is text only, with no side padding. A pressed button dims, or for `normal` takes the `selected` fill. A button whose press is out keeps its size, loses its fill and border, draws its label muted at half strength, and takes no hover and no click. A whole button takes clicks, with `on_click` on its outer element. Every control keeps the default arrow cursor, as in the Codex tab, though Herdr's own mods show a hand. A text field keeps the cursor its `Input` draws. Each button sets `accessibility_label` to its full label.

Text uses Herdr's UI font, so `rowTitle(r, 'herdr')` follows the desktop look's rules rather than the terminal's.

## Every state and every move

The Codex tab steps each row through one state machine: `entering`, `closed`, `opening`, `open`, `closing`, `settling`, `settled`, `undoing` and `leaving`, in `codex/src/rows.ts`. The file imports nothing from Codex. It moves to `hooks/row-motion.ts`, and both the Codex tab and the Herdr look step rows with it. The rules in `docs/plans/codex-row-states.md` then hold in both looks: a panel is never removed while it shows, the settled line shows as soon as the result arrives, and time ends a move, not the animation.

GPUI animates natively, with no script running during the motion:

- `transition(property, { duration, easing })` animates later changes to `opacity`, `width`, `height`, `left` and `top`. The spike drew a row's opacity going from 1 to 0.35 over 1.5 s. Window shots during the fade read the row's text falling from 238 out of 255 before the press to 132 at 601 ms. So the transition runs in the app.
- `spring(property)` for a move that should settle with a little give.
- `.frames(list, ms)` for a spinner, drawn natively and only while shown.
- `.loop(property, { from, to, period })` for a pulse. A running mark keeps its row's color and fades from 1 to 0.3 and back every `RUNNING_PULSE_MS`, as in the Codex tab.

A row's height animates between pixel values. The look learns a row's content height from `on_size_change` on the row's inner element, then animates the outer element's `h` from that height to 0 as the row leaves. Not checked in the spike.

**A row stays in the tree until its move ends.** In the spike's first press, the row left the view mid-fade, so its fade was cut off. Two fixes: send the look's holds with each press, so the row settles in place, and keep a leaving row drawn until `cx.timer.after` ends its move.

**A press shows at once.** The pressed button draws as out and the row's line reads "Sending…" in the same draw, before the press file is written. In the spike, the pressed row's fade showed in a window shot 84 ms after the press.

**Reduced motion.** Neither `herdr.d.ts` nor `gpui-kit.d.ts` exposes a reduced-motion setting. Until one exists, the look follows the system setting if Herdr reports it, and otherwise animates. Open question.

## Keys

Herdr is a desktop app, so the look is click-first, and every move works with the mouse.

- **In the look.** The look takes keys while it has focus, through `track_focus` and `on_key_down`. Its keys match the other looks: `j` and `k` move between rows, each row's hotkeys from `rowKeyPlan` press its buttons, and the arrow keys move between tabs. `Escape` gives focus back to the agent's terminal with `run('pane.focus', { terminal })`.
- **From anywhere.** `keys.json` can bind a key to `inbox.<command>`, which reaches the look's `nextCommand()` only while it shows. Herdr's mod commands are not in its command palette.

## Light and dark

The look draws only with `theme()` colors, which every light and dark theme names alike. Needs you and warnings take the theme's yellow, as the other looks draw them in amber. Findings, PRs and errors take the theme's magenta, cyan and red, and a notice its blue, as the terminal look takes its theme's. So a banner reads by its color: a notice in blue, a warning in yellow, an error in red. Done takes the color Herdr's sidebar gives an agent that is done. A running mark keeps its row's color and fades in and out, so needs you never reads as running. The look draws nothing in `blocked`, which is red in many themes and would make a count read as an error:

| Inbox tone | Herdr color |
| --- | --- |
| Needs you, issue | `ansi3` |
| Done | `done` |
| Findings | `ansi5` |
| PRs | `ansi6` |
| A notice: information or an offer | `ansi4` |
| Warning | `ansi3` |
| Error | `ansi1` |
| Muted text, ages and hints | `muted` |
| Selected row | `selected` |

The look draws no text in `dim`. In the Tokyo Night theme, `dim` on the pane's background is 3.3:1, under the 4.5:1 text needs.

Each state is checked in Herdr's light and dark themes in the VM.

## Help in the pane header

The look draws Help at the right end of its tab row, because a mod pane cannot put a button into Herdr's pane header. A mod pane is a pane that shows a mod instead of a terminal. A layout is the set of mods that draws Herdr's window, and its `pane` mod draws the header above each pane. The shipped `pane` mod finds its pane in `panes()` by `props().pane`. When the pane runs no program, it draws `PaneInfo.title` as the name. For a mod pane that title is the mod's name, so the inbox's header reads "inbox". `herdr.d.ts` has no call that lets a mod set its pane's title or add to its header.

A mod pane needs two things from the header: a title it sets, such as "Inbox", and a few actions the header draws at its right end, such as Help. `PaneInfo` would carry both to the header mod, which draws them as it draws a terminal pane's split, zoom and close. A press on an action would reach the mod pane that set it. Then Help costs the look no row, and the header names the panel the way it names a terminal.

### The route without a change in Herdr

Any mod can set a value with `setShared(key, value)`, and every mod can read it with `shared(key)`. Every mod re-renders when one is set. So a header mod that reads a key the look sets could draw Help, and send `inbox.help` back with `run`. That route has two limits:

1. The shipped `pane` mod reads no shared value. The person would switch to a copy of the layout whose `pane` mod reads the key. A copied layout stops getting Herdr's fixes to the header.
2. `nextCommand()` gives a copy of the mod the command with no pane id, so a copy cannot tell whether the press came from its own header. `herdr.d.ts` says `run('<mod>.<command>')` delivers to that mod's `nextCommand()`. That every shown copy receives it is inferred from that wording, not checked. If so, a Help button in one pane's header would toggle Help in every inbox pane on screen.

### Draft request to Herdr's maintainers

Sent on 2026-11-11 through the Herdr app's feedback form.

> **Let a mod pane set its header's title and actions**
>
> A mod opened with `pane.split {mod}` draws inside the pane frame the layout gives it. The frame's header is the layout's `pane` mod. For a mod pane, it shows the mod's name as the title, from `PaneInfo.title`, and nothing the mod sets. So a mod that wants a title or a button in its header draws a second header inside its own pane, which reads as a frame within a frame.
>
> The inbox is a mod pane that lists what waits on the person in an agent session. It has one control that belongs in the header: Help, which shows a legend of its marks. Today it costs a place in the panel's own tab row.
>
> Proposal: a mod pane can set a title and a short list of actions for its header, such as with a `setPaneHeader({ title, actions: [{ id, label }] })` call. `PaneInfo` carries them to the header mod, which draws the title in place of the mod's name and the actions at the header's right end. A press on an action reaches that pane's copy of the mod, such as through `nextCommand()` with the action's id.
>
> The alternative we found is a shared value that a cloned header mod reads. It needs a cloned layout. And since `"<mod>.<command>"` reaches every shown copy of a mod, a button in one header would act on every copy.
>
> Questions: should actions be text, icons from the app's set, or both? Should the shipped `pane` mod draw them, or only layouts that opt in?
>
> _Written by Claude_
