# UI fuzz rules

Status: building.

This is part of [the UI fuzz plan](ui-fuzz.md). It gives the rules the looks are checked against, and the seeds every run checks first.

Each rule has an id that names it in reports.

## Resting

- `plan-order`: the selected open row's buttons are its plan's, in order (AGENTS.md "Drawing in each look"). omp reads them from its lines after the cursor, as `omp/tests/panel.spec.ts` does, at 80 columns or more. Herdr reads each open row block's `buttons`, as `herdr/tests/draw.spec.ts` does. Both skip a row whose text field is open, and omp skips a row that is collapsed, has a press out or a reply sending, or was handed off and not opened again.
- `width`: no omp line is wider than the panel, measured with `visibleWidth` from omp's TUI (`pi-tui`), which cuts a line that is too wide. The panel's `cellWidth` (`core/domain/text.ts`) counts with it once `countCellsAsOmp` hands it over.
- `raw-escape`: with every omp style drawn as plain text, no line holds an escape other than the reset the panel puts after an ellipsis.
- `glyph-cut`: no drawn text holds half a surrogate pair, ends inside a ZWJ sequence, or starts with a combining mark or variation selector. It runs on omp lines and on Herdr's painted text.
- `counts`: the shared view's Asks and Finds counts equal the waiting rows `listWaits` gives, and omp's tab line draws the same counts. Herdr's drawn tab counts are not read yet.
- `no-throw` and `bad-text`: nothing throws, and no drawn text holds `NaN`, `undefined`, `Infinity` or `[object Object]` the input did not hold. In Herdr, a gpui-kit motion-id restart is its own rule, `motion-id`.
- Next: `overlap`, in the stand-in's layout no box has a negative or non-finite top or height, and no two boxes in one column overlap.

## Motion

Motion rules run on the frames `framesOf` draws from 0 ms, the case's start. The stand-in's frames before 0 warm its springs up.

- `cut`: no text is cut by its box while it shows at 0.2 opacity or more (`CUT_OPACITY`), as `framesOf` reports `cuts`.
- `jump`: no box moves off its spring, as `framesOf` reports `jumps`. A panel whose row's form or panel has faded to 0.02 opacity or less is left out, since nothing of it shows.
- `connector-gap`: the tree connectors leave no gap, as `framesOf` reports `gaps`. A stroke draws nothing once its fade to no opacity, or its box's, has ended, or when it is first drawn at none. It joins no column, so a stroke that shows and ends against it leaves a gap.
- `rest-space`: 1.5 s after the case's last event, when every move has come to rest, no clipped box is taller than its content and no blank line's worth of space sits between two lines a block draws. In Herdr it reads the last frame's `rest` from `framesOf`: each clipped box with a set height beside its content's height, and the lines each list block draws at `CUT_OPACITY` or more. In the Codex tab the page sets each clipped box's height to auto for a moment to measure its content, and reads the text, controls and fields each `[data-motion]` box draws, its nested boxes' included. A control counts by its drawn shape, so a button's padding is not blank space. The other rules miss this: `cut`, `vanish` and `jump` look at text and moves, and a line kept hidden at rest moves nothing.
- `vanish`: a text that shows at 0.2 or more of opacity times share does not go in one frame of a draw that does not follow the person's input, while its block still shows. A draw follows input when it comes after a key, click or typing, when the view moves it as the person's, as the draw that answers a press, or when it is one of the next two draws after either, each within a frame of the one before. A new page's first draw counts too. A text changed rather than went when a text that comes in that frame goes on from it, longer, shorter or after a prefix. It also changed when its block shows as many new texts as went, or when it is a row's mark that took another form. A text field that opens hides the lines it takes the place of at once. A text at opacity 0 is left out. The detail names the part that went, such as the age or the status under the buttons, and what came in its place, so `KNOWN` can tell one issue's drop from another's. `fuzz/rules-herdr-vanish.ts` holds the rule.
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

Recent bugs are seed cases in `fuzz/seeds.ts`, and the Codex tab's in `fuzz/seeds-codex.ts`, which every run checks before its generated cases. A seed for a closed issue must pass, and the run fails when it does not. A seed for an open issue is expected to fail with its rule, and the run says so without failing. When it passes, the run fails and says to close the issue and mark the seed closed.

A known failure in `KNOWN`, in `fuzz/known.ts`, matches on part of its detail, so keep that part as narrow as its issue. #832's part, any cut in a panel's box, also matched a cut that a tab shown again makes. That cut is now #898.

- Herdr: #771 (a row that settles while it opens), #811's second Copy press, #827's four seeds, #828's leave just after Explain, #832's collapse just after Explain, #833's fold of every Status fold, #950's, #956's Reply after an option, #957's Fix whose refresh fails, #967, #971, #972, #980, #981, #988, #991 and #995 pass. #771, #832 and #967 pass apart from #997 and #998. #811's collapse right after Undo does not reproduce: the stand-in cuts no second title line. The seeds for #997, #998, #999 and #1000 are open.
- From the first runs: #827, #828, #830, #831, #832 and #833, each with its seed. #898 has its seed too. #829 was a false report from the frame replay animating a tab switch, and is closed.

