# Desktop polish

The open row and the lists looked haphazard in the Claude app, and less so in the Codex tab. This plan sets one spacing rule for both, and for each app an action layout, tabs and rows drawn with that app's own controls.

## What is wrong today

Captured on 2026-10-09 in the Claude app's demo pane and the Codex tab:

- **Typing a reply.** The Claude app draws two send buttons: the field's own `send` and the pane's `Send`. Send and Cancel touch the field. The "Type a reply" button that opened the field stays drawn.
- **Action rows.** An open row splits its buttons into two rows 38 px apart, twice every other gap in the row. A lone button such as Done looks orphaned.
- **List spacing.** Closed rows sit a full line (38 px) apart, but an open row pads itself by half a line (19 px).
- **Status line.** When a note appears, such as "Sample entry: nothing was sent.", the status line moves under the tabs with no gap.
- **Closed items.** They sit a full line apart, and the "▸ 3 Closed" line sits a full line below the last row.
- **Codex tab actions** are plain words with no button shape, joined by a dot, and the last one wraps onto a line alone. The recommended option is marked only by bold.

## Rules

1. **One spacing step: half a line.** In the Claude app that is a padding or gap of 1, 19 px. Every gap inside an open row and above the fold line is one step. Closed rows have no gap between them (rule 6). Reason: the card's padding is already one step, and mixing 19 px and 38 px gaps is what reads as haphazard.
2. **One action line, main action first.** In the Claude app an open row draws its actions on one line that wraps: the options or the main action, then the follow-ups (Type, Explain or Discuss, Dismiss). In the Claude app the main action is the primary button: the recommended option, Done, Address, Open log, or a PR's first action. A row has at most one primary button. Reason: split over two lines, a lone Done sat on a line of its own, and nothing showed it was the action that finishes the row.
3. **Typing replaces the follow-ups.** While the field is open, the follow-ups leave the action line, and the field takes the next line, then Send, then Cancel. The button that opened the field is gone. There is one Send. Reason: the field is the follow-up the person chose, and a second Send asks them to choose between identical buttons.
   - In the Claude app, Send is the field's own button (`submitLabel`), labeled "Send". It is drawn before the field is clicked, and a click on it sends. The terminal keeps `send` as its Enter hint.
   - The field keeps the app's own width. It does not stretch inside a growing Box.
4. **The status line never moves for a note.** The age stays at the right of the tabs. A note or error takes its own line under the tab row, one step below it. Reason: text that jumps when a note appears looks broken.
5. **Codex tab actions follow rule 3, drawn as Codex's own buttons.** Like the Claude app's, they take one line that wraps: the answers and main action, then the follow-ups as ghost buttons. Each client uses its host app's controls, so the Codex tab copies the Button in the Codex app's bundled styles.
   - Every action is a pill, 26 px tall, Codex's size `sm`. Undo sits in a line of text, so it takes Codex's smallest size, 20 px, and the closed row keeps its height.
   - The recommended option is solid: filled with the text color, labeled in the background color.
   - The row's other answers and main action have a gray fill: the text color at 8% in light and 12% in dark.
   - The follow-ups, Cancel and Undo are ghost buttons: muted text that turns to the text color on hover, with no fill. When a row has no answers or main action, the first follow-up's label lines up with the row's text.
   - The field is a pill with a 1 px border, the text color at 16%.

   Reason: these are the app's primary, secondary and ghost button styles, so the tab reads as part of Codex.

6. **Closed rows are flush, and the whole row takes the click.** In the Claude app a closed row has no gap above or below it. It is padded by a quarter line on each side, so it is 1.5 lines tall, and its hover fill covers that whole height. A row that just closed and a PR's check and thread rows are padded the same. The "▸ 3 Closed" line takes the same height and hover, one step below the rows (rule 1). Reason: the click target was one line of text with a half-line gap the pointer fell into, and flush fills read as one list.
   - A Client's `surface.rows` rounds the fractional height down, so the row's hover test adds the padding back.
7. **The tabs are a row of rounded segments.** Only the shown tab has a fill: `pal.raised`, rounded, 1.25 lines tall, about the app's own segmented control. A hovered tab takes `pal.tab`. The other tabs have no fill and muted labels. Counts are muted, and the line in the tab's tone is gone. Reason: three square gray blocks with a colored top line looked unlike any control in the app.
   - The app's segmented control also draws a track behind the segments. The pane cannot: a rounded fill comes only from a transparent border, which insets its content by half a line, so a rounded track pushes its rounded segments out of place.
8. **Actions show an icon where one names the effect.** In the Claude app only, a label starts with a glyph:

   | Glyph | Actions |
   | --- | --- |
   | ⧉ | A step that copies text or a command |
   | ↗ | A step that opens a file or link, Open PR, Open log, Open |
   | ▶ | A step that asks Claude to run a command |
   | → | Address, Address all, Resolve conflicts |
   | ✎ | Type a reply, Type an answer |
   | ↻ | Try again |
   | ↺ | Undo |
   | ▸ ▾ | Details, Hide details |

   Done, Dismiss, the options, Explain, Discuss and Draft reply have none.

   The Codex tab draws real outline icons, stroked in the button's text color at 14 px, in the style of Codex's own. There every action but an answer has one: copy, open and play for steps, an arrow for Address, a pencil for Type, a speech bubble for Explain and Discuss, a cross for Dismiss, a check for Done, a turning arrow for Try again, a back arrow for Undo, and a chevron for Details. Reason: the follow-ups there are text-only buttons in one line, and an icon makes each one quick to find. An answer's own words say what it does. Reason: an icon tells the person what a press will do to their machine before they press it, and the rest only answer or talk. The glyph is added when the button is drawn, never to a saved label, so feedback still reads "✓ Copy theme command". The app has no icon prop, and Text inside a Button draws no dimmer than the label, so the glyph is part of the label.
9. **A PR block reads title first.** In the Claude app:
   - The title is bold. "#31" before it is muted and not bold.
   - The status starts at the title's column, with no ◇ or ✓ mark. Its first word, as "Blocked", "Ready to merge" or "Merged", takes the status color. The reasons after it are muted.
   - The main action is primary (rule 2), and actions carry icons (rule 8).
   - An open check or thread row's context line, "Failing check" or "Review thread", is not bold, so the row's own name is the only bold line.

   Reason: the amber sentence of seven reasons was the loudest text in the card, louder than the PR's title, and the number, title and context lines were all bold.

## Not changing

- The cards and the palettes, set by desktop-look.md. Rules 7 and 9 change only which text takes which palette color.
- The terminal's look.
- Any wording, except Send's capital S.

## Checks that need you

- **Hover over the flush rows and the tabs.** Sweep the pointer down a list and across the tabs. Each row and tab should light over its whole height, with no dead band at its bottom edge.
- **The press after a field opens or closes.** Type a reply removes its own button, the case where the app's next click only refocuses the pane (#100874). Click Type, then Cancel at once, then Type again, then another button, and count retries.

## Checks

- Capture each open-row kind before and after: a question, a task, a finding, a PR check and a thread, closed and typing.
- In the Claude app, confirm the field's own Send shows and sends, and that Cancel closes the field.
- Run `./scripts/check.sh`.
