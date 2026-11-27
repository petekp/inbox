# UI fuzz rules

Status: building.

This is part of [the UI fuzz plan](ui-fuzz.md). It gives the rules the looks are checked against, and the seeds every run checks first.

Each rule has an id that names it in reports.

## Resting

- `plan-order`: the selected open row's buttons are its plan's, in order (AGENTS.md "Drawing in each look"). omp reads them from its lines after the cursor, as `omp/tests/panel.spec.ts` does, at 80 columns or more. Herdr reads each open row block's `buttons`, as `herdr/tests/draw.spec.ts` does. Both skip a row whose text field is open, and omp skips a row that is collapsed, has a press out or a reply sending, or was handed off and not opened again.
- `width`: no omp line is wider than the panel, measured with `visibleWidth` from omp's TUI (`pi-tui`), which cuts a line that is too wide. The panel's `cellWidth` (`core/domain/text.ts`) counts with it once `countCellsAsOmp` hands it over.
- `raw-escape`: with every omp style drawn as plain text, no line holds an escape other than the reset the panel puts after an ellipsis.
- `glyph-cut`: no drawn text holds half a surrogate pair, ends inside a ZWJ sequence, or starts with a combining mark or variation selector. It runs on omp lines and on Herdr's painted text.
- `counts`: the shared view's Asks and Finds counts equal the waiting rows `listWaits` gives, and omp's tab line draws the same counts. Herdr's drawn tab counts are not compared with the view's yet. The `vanish` rule reads whether they go in one draw.
- `no-throw` and `bad-text`: nothing throws, and no drawn text holds `NaN`, `undefined`, `Infinity` or `[object Object]` the input did not hold. In Herdr, a gpui-kit motion-id restart is its own rule, `motion-id`.
- Next: `overlap`, in the stand-in's layout no box has a negative or non-finite top or height, and no two boxes in one column overlap.

## Motion

Motion rules run on the frames `framesOf` draws from 0 ms, the case's start. The stand-in's frames before 0 warm its springs up.

- `cut`: no text is cut by its box while it shows at 0.2 opacity or more (`CUT_OPACITY`), as `framesOf` reports `cuts`.
- `jump`: no box moves off its spring, as `framesOf` reports `jumps`. A panel whose row's form or panel has faded to 0.02 opacity or less is left out, since nothing of it shows.
- `connector-gap`: the tree connectors leave no gap, as `framesOf` reports `gaps`. A stroke draws nothing once its fade to no opacity, or its box's, has ended, or when it is first drawn at none. It joins no column, so a stroke that shows and ends against it leaves a gap.
- `rest-space`: 1.5 s after the case's last event, when every move has come to rest, no clipped box is taller than its content and no blank line's worth of space sits between two lines a block draws. In Herdr it reads the last frame's `rest` from `framesOf`: each clipped box with a set height beside its content's height, and the lines each list block draws at `CUT_OPACITY` or more. In the Codex tab the page sets each clipped box's height to auto for a moment to measure its content, and reads the text, controls and fields each `[data-motion]` box draws, its nested boxes' included. A control counts by its drawn shape, so a button's padding is not blank space. The other rules miss this: `cut`, `vanish` and `jump` look at text and moves, and a line kept hidden at rest moves nothing.
- `vanish`: a text that shows at 0.2 or more of opacity times share does not go in one frame of a draw that does not follow the person's input, while its block still shows. A draw follows input when it comes after a key, click or typing, when the view moves it as the person's, as the draw that answers a press, or when it is one of the next two draws after either, each within a frame of the one before. A new page's first draw counts too. A text changed rather than went when a text that comes in that frame goes on from it, longer, shorter or after a prefix. It also changed when its block shows as many new texts as went, or when it is a row's mark that took another form. A text field that opens hides the lines it takes the place of at once. A text at opacity 0 is left out. The detail names the part that went, such as a row's age, the status under its buttons or a Status line's mark, and what came in its place, so `KNOWN` can tell one issue's drop from another's. A block shows while any of its places draws it: its own id, a moved block's copy at its old place (`~from`) or its boxes at the new place (`~to`), at any opacity. A copy stands for the place the block drew in the frame before the copy came, so a block that moves twice compares with its last place. So a block whose content hides in one frame while the same block shows elsewhere fails, and a moved block's copy drawn new at no opacity fails too. `fuzz/rules-herdr-vanish.ts` holds the rule. Herdr's frames hold only the list's blocks, so `fuzz/rules-herdr-tabs.ts` reads each tab's count from every draw: a count that shows does not go in one draw that does not follow input, unless a fade to under `CUT_OPACITY` has run its course. A mark that turns into another changed rather than went, so the rule cannot see a mark that fades out and back in and leaves its column empty for a moment, as #1030 did.
- `press-shows`: a press shows its result at once. What a press brought is a text its block draws after the press that it did not draw before. When the block shows one at `CUT_OPACITY` before the person's next input, within 1 s, one must start to show (0.01 opacity) soon after the press, or the pressed button's label must go. A text drawn at 0.01 opacity from soon after the press until its growing box reaches it also counts, as a status under the buttons of a row that is still opening. A press here is the person's click or key, and also the host taking a press, judged from the draw after the host's answer. Each look's rule fails on a patch that delays a press's result and passes on `next`.
  - Herdr (`fuzz/rules-herdr-press.ts`): "soon" is `NEXT_FRAME_MS` plus a frame after the first frame after the press. Herdr measures a new line a draw later, and a growing box holds for a draw. A press is timed from the click or key, and what it brought counts from every draw until the next input or press, so a press that draws nothing at first fails too. It skips a host answer that settles a row or brings it back, since the row's form swap fades the old form out first. It also skips a press on a block that drew nothing at `CUT_OPACITY` in the frame before the answer, such as a row that is still coming in, and a click on a button its block drew below it then. The harness clicks a button outside the selected row only when no box around it is set to no opacity.
  - omp (`fuzz/rules-omp.ts`): omp renders after the key's handler and its microtasks have run. The harness draws then, and again once the key's work settles, with every style written as an escape code that names it, so a dimmed button counts as a change. Its stand-in host answers a press a timer later, as the live host reads and locks the session's files first. A key fails when the settled draw differs from the draw before it while its own draw does not.
  - Codex tab (`fuzz/codex-page.ts`): "soon" is 40 ms. The page reads the frames after a click and after the server's reply to the press. A reply ends the window of every earlier press. A row with `swaps-form` in its first frame is skipped, since it fades the old form out first.
- Next: `press-steady`, a button whose press is out keeps its place and size while nothing above it changed. `flicker`, within one move a text's opacity does not rise, fall and rise again. `animates`, a box whose resting height changes passes through a height between the two.
- Built for the shared row stepper (`--look rows`, also in `--look all`): `stepper-time`, no track has a `since` after its draw or a `since` that is not finite. `stepper-rest`, a moving state comes to rest within `moveMs` plus one frame of its last change, drawn every 16 ms toward the same target. `stepper-form-left`, `drawsFormLeft` holds only within the move. `stepper-reduced`, with `isReduced` every target is reached in the draw that asks for it. `stepper-form`, a resting row rests in the form it was asked for, and only `gone` drops it. Each rule fails on a broken `stepRow` that breaks it: one that ignores `isReduced`, sets `since` ahead, restarts an opening move each draw, or rests a closed row open. The stepper passes all of them on 10,000 cases.
- Next, with the Codex tab: the same rules on the rows it draws, read from its `[data-motion]` rects.

`vanish` and the next motion rules leave out the one-draw changes that `docs/looks/differences-herdr-motion.md` keeps on purpose:

- A status a press brings, such as "Sending…", shows in that press's draw, and goes at once when a press takes it away.
- A text field's lines hide at once.
- Banner words appear and go without a fade.
- A newly shown tab, Help page or session draws at rest.
- A box whose height changed with its width takes its new height at once.
- A close held for less than `LEAVE_FADE_MS` swaps form at once.
- A block that moved takes new ids (`MOVED_TO` in `herdr/src/heights.ts`).

## Seeds

Recent bugs are seed cases in `fuzz/seeds.ts`, those the press rules found in `fuzz/seeds-press.ts`, and the Codex tab's in `fuzz/seeds-codex.ts`, which every run checks before its generated cases. A seed for a closed issue must pass, and the run fails when it does not. A seed for an open issue is expected to fail with its rule, and the run says so without failing. When it passes, the run fails and says to close the issue and mark the seed closed.

A known failure in `KNOWN`, in `fuzz/known.ts`, matches on part of its detail, so keep that part as narrow as its issue. #832's part, any cut in a panel's box, also matched a cut that a tab shown again makes. That cut is now #898.

- Herdr: #771 (a row that settles while it opens), #811's second Copy press, #827's four seeds, #828's leave just after Explain, #832's collapse just after Explain, #833's fold of every Status fold, #950's, #956's Reply after an option, #957's Fix whose refresh fails, #967, #971, #972, #980, #981, #988, #991, #995, #997, #998, #999, #1000, #1001 and #1002 pass. #811's collapse right after Undo does not reproduce: the stand-in cuts no second title line.
- Open, from the press rules and the clicks that now reach buttons outside rows: Herdr #1005, #1006, #1007, #1008, #1009, #1010, #1013 and #1015. omp #1011 and Codex #1012 and #1014 pass.
- Herdr: #1007's seeds, #1017 and #1031, a tab count that went in one draw, pass. #1032, a Status answer during Remove on the goal, is open with two seeds. #1034, Undo 25 ms after Remove, passes. #1041, Undo 200 ms after Remove, is open with one seed.
- From the first runs: #827, #828, #830, #831, #832 and #833, each with its seed. #898 has its seed too. #829 was a false report from the frame replay animating a tab switch, and is closed.

