# Desktop polish

The open row and the lists look haphazard in the Claude app, and less so in the Codex tab. This plan gives both one spacing rule and one action layout. The goal is the same pane in both apps, drawn with each app's own controls.

## What is wrong today

Captured on 2026-10-09 in the Claude app's demo pane and the Codex tab:

- **Typing a reply.** The Claude app draws two send buttons: the field's own `send` and the pane's `Send`. Send and Cancel touch the field. The "Type a reply" button that opened the field stays drawn.
- **Action rows.** An open row splits its buttons into two rows 38 px apart, twice every other gap in the row. A lone button such as Done looks orphaned.
- **List spacing.** Closed rows sit a full line (38 px) apart, but an open row pads itself by half a line (19 px).
- **Status line.** When a note appears, such as "Sample entry: nothing was sent.", the status line moves under the tabs with no gap.
- **Closed items.** They sit a full line apart, and the "▸ 3 Closed" line sits a full line below the last row.
- **Codex tab actions** are plain words with no button shape, joined by a dot, and the last one wraps onto a line alone. The recommended option is marked only by bold.

## Rules

1. **One spacing step: half a line.** In the Claude app that is a padding or gap of 1, 19 px. Every gap inside an open row, between closed rows, and above the fold line is one step. Reason: the card's padding is already one step, and mixing 19 px and 38 px gaps is what reads as haphazard.
2. **Two action lines, each a full line.** The first line answers the row: the options, or its main action (Done, Address, Open log, Open PR). The second holds the follow-ups: Type, Explain or Discuss, Dismiss. One step separates them. Reason: the person reads what answers the row first, and a line break with one step shows the grouping without a large gap.
3. **Typing replaces the follow-up line.** While the field is open, the second line is the field, then Send, then Cancel. The button that opened the field is gone. There is one Send. Reason: the field is the follow-up the person chose, and a second Send asks them to choose between identical buttons.
   - In the Claude app, Send is the field's own button (`submitLabel`), labeled "Send". It is drawn before the field is clicked, and a click on it sends. The terminal keeps `send` as its Enter hint.
   - The field keeps the app's own width. It does not stretch inside a growing Box.
4. **The status line never moves for a note.** The age stays at the right of the tabs. A note or error takes its own line under the tab row, one step below it. Reason: text that jumps when a note appears looks broken.
5. **Codex tab actions follow rules 2 and 3.** Their two lines and their typing line match the Claude app's.

## Your decision

- **Whether Codex tab actions look like buttons.** Today they are plain words, close to the terminal, as your earlier brief for the tab asked. Small filled buttons would match the Claude app's native buttons. The recommended option would then be the filled accent button, and "(recommended)" would be added to its label, as the mod does.

## Not changing

- The tabs, the cards, the colors and the tone line, set by desktop-look.md.
- The terminal's look.
- Any wording, except Send's capital S.

## Checks that need you

- **The press after a field opens or closes.** Type a reply removes its own button, the case where the app's next click only refocuses the pane (#100874). Click Type, then Cancel at once, then Type again, then another button, and count retries.

## Checks

- Capture each open-row kind before and after: a question, a task, a finding, a PR check and a thread, closed and typing.
- In the Claude app, confirm the field's own Send shows and sends, and that Cancel closes the field.
- Run `./scripts/check.sh`.
