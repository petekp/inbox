# One spacing scale for every look

Status: proposed, waiting for a pick between scales A, B and C. Nothing is built yet. [The audit](spacing-system-audit.md) lists every spacing value each look uses today.

## The problem

The Herdr panel spaces its Status rows too loosely, and the looks have drifted apart.

- In Herdr, a title and its detail line sit 24 pt apart, 4 pt more than a line of text. Two one-line items sit 28 pt apart. Two items with detail lines leave about 34 pt between their text blocks.
- Herdr's "Other work" heading sits 16 pt under the item above it, while items sit 24 pt apart. The heading reads as part of the item above.
- The Codex tab spaces Status items 9.5 px apart and puts no space between a title and its detail. Its marks and text start 2 and 4 px right of Herdr's.
- The desktop pane draws Status row padding at about half the size `hooks/layout.ts` states. "A bug the audit found" below gives the cause.
- The terminal leaves no space between Status items, and two blank rows between Asks sections. omp leaves no space between anything but Status parts.

## The rule

Space shows what belongs together. Each distance is one of a few named steps, and the steps rise in this order:

1. The lines of one item, such as a title and its detail: `inside`.
2. Two one-line items in a list: `list`.
3. Two items when either has more than one line: `item`.
4. Two groups or sections, with any rule halfway between them: `section`.

A heading sits `head` above its first item, which is less than `item`, so the heading binds to what it heads. Text sits `control` above its buttons, and buttons sit `control` apart. The panel keeps `edge` on each side. Marks take a `mark`-wide column, so text starts at `edge + mark`.

Every gap, padding and line height in a look comes from these steps. A row's padding counts toward the gap: a list of rows that are `list` apart gives each row `list / 2` of padding above and below.

## Three scales

Each scale fills the steps with numbers. The row spacing columns show the distance from one row's first line to the next row's first line.

| Scale | line | inside | list | item | head | control | section | edge | mark | One-line rows | Title and detail | Two-line rows |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Today, Herdr | 20 | 4 | 8 | 24 | 12 | 8 | 32 | 16 | 24 | 28 | 24 | 68 |
| A, 4-pt grid | 20 | 0 | 4 | 12 | 8 | 8 | 24 | 16 | 24 | 24 | 20 | 52 |
| B, 18-pt line | 18 | 0 | 4.5 | 9 | 4.5 | 9 | 18 | 18 | 22.5 | 22.5 | 18 | 45 |
| C, 4-pt grid, roomier | 20 | 0 | 4 | 16 | 8 | 8 | 32 | 16 | 24 | 24 | 20 | 56 |

- A keeps the 13/20 type the Herdr panel and the Codex tab use now. Every step is a multiple of 4, the unit Herdr's `SPACE` and the Codex CSS already use. Its steps from `list` up are 4, 12 and 24, each at least twice the one before.
- B ties every step to the line: a quarter, a half or a whole line of 18. It is the tightest. It shrinks the line from 20 to 18, so 13-pt text sits closer than in the hosts around it, and its half-point steps do not land on whole pixels at 1x.
- C uses A's grid with more air between items and sections. It is closest to today's look, without the 4 pt inside each item.

The recommendation is A. It cuts the space Pete flagged by about a quarter: two-line Status rows go from 68 to 52 pt apart, and one-line rows from 28 to 24. It keeps the host's type, so only the gaps change. Each step is clearly larger than the one below it, so the groups still read at a glance.

## How each look draws the scale

The scale lives in `hooks/layout.ts` as points, with `SPACE_UNIT` 4 and one named constant for each step. Each look converts the steps to its own units.

- Herdr draws points. `herdr/src/paint-theme.ts` takes its roles from the shared steps instead of its own `SPACE`, and `gapBetween` in `herdr/src/paint-space.ts` picks a step for each pair of blocks.
- The Codex tab draws CSS pixels. `codex/src/tab-motion.ts` already passes shared sizes to the page as CSS variables. It passes every step, and the CSS in `codex/src/tab-css/` reads the variables instead of literals.
- The desktop pane draws a 19-pt line, which the Claude app sets. It converts a step to lines by dividing by 19, and doubles that for a Box's padding, margin and gap, which the app draws at half the written value. Horizontal steps round to whole cells of 8.8 pt.
- The terminal and omp draw whole rows. A step becomes the nearest whole number of rows, with `section` kept one row above `item` so the order survives. For every scale that gives `inside` 0, `list` 0, `item` 1 and `section` 2. So one-line rows sit flush, two-line items get a blank row between them, and sections get two. The terminal keeps its `│ ───` divider as its one-row `item` gap. One-line closed rows lose that divider.

## What changes in each look under A

- Herdr: a title sits on the line directly above its detail. One-line items move from 8 to 4 apart, items with detail from 24 to 12. A heading sits 8 above its items instead of 12. A rule sits 12 from what is above and below it instead of 16. Closed rows and folds pad 2 instead of 8 each, so one-line Asks rows go from 36 to 24 apart. An open row pads 6, half of `item`. `INSET`, `HEAD_GAP`, `ITEM_GAP`, `GROUP_GAP` and `LINE_GAP` give way to the shared steps.
- Codex: Status items with detail move from 9.5 to 12 apart, and one-line items from 9.5 to 4. Closed Asks rows go from 36 to 24 apart. Marks move from 18 to 16 px and text from 44 to 40, the right edge from 14 to 16. A group title sits 8 above its first row's text instead of 14, the title's 6 plus the row's 8. A section's padding moves from 10 to 12, and the gap above an open row's buttons from 6 to 8. The literal gaps of 2, 3, 5, 6, 10, 11 and 14 px move to the nearest step.
- Desktop: the shared row padding and section gap take the new steps. The Status row padding bug is fixed.
- Terminal: Status items with detail get a blank row between them. Above Other work and Later, two rows instead of one. One-line closed Asks rows sit flush.
- omp: the same rows as the terminal, with a blank row where the terminal draws its divider.

## Where a look cannot follow the scale

These go into the looks' differences files when built.

| Look | Difference | Reason |
|---|---|---|
| Desktop | The line is 19 pt, not 20. | The Claude app sets the line and the text size. |
| Desktop | A button is 23 pt tall. | The app draws native buttons at their own height. |
| Desktop | Horizontal steps round to whole cells. | The app lays out widths in cells of 8.8 pt. |
| Desktop | Each row frame adds a 1 pt border to the gap. | The app draws the border outside the padding. |
| Terminal, omp | Steps under one row draw as none, and `section` is two rows. | They draw whole rows only. |

## A bug the audit found

The desktop Status row draws about 2.4 pt of padding per side, not the 4.75 pt `STATUS_ROW_PAD_PT` states. `STATUS_PAD_Y` (`hooks/pane-sizes.ts:70`) divides the points by the 19-pt line but does not double the result. The Box draws padding at half the written value (`desktopSpaceLines` in `hooks/pane-status-tops.ts:71`). This is not yet checked in real pixels. The build replaces the constant with one converted from the new step.

## The mocks

The mocks show the Status tab and the Asks tab in Herdr and in the Codex tab, today and under each scale, side by side.

- Codex: the real built tab with its demo data, in a local page, with each scale's spacing laid over its CSS. The fonts and sizes are the tab's own.
- Herdr: an HTML copy of the panel, since the panel draws only inside the Herdr app window. It follows `gapBetween` and the paint constants, at the panel's 13/20 type and 374-pt width. Today's version matches a capture of the real panel within 1 pt for the gaps it shows.
- The terminal, desktop and omp are not mocked. They get before-and-after captures once the pick is built.

## After the pick

1. Build the scale in `hooks/layout.ts` and each look, with real-pixel captures before and after in each look.
2. Propose a check that fails on a spacing value outside the scale. It would read the padding, margin, gap and line-height values in `herdr/src/paint-*.ts`, `codex/src/tab-css/*.css`, `omp/src/panel*.ts` and the `hooks/pane-*.tsx` files. It would fail on a number that is not a named step, a sum of steps or an entry in a short allowlist with its reason.
