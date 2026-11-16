# One spacing scale for every look

Status: built. Pete picked scale A, a 4 pt grid, from the three this plan proposed. [The audit](spacing-system-audit.md) lists the spacing each look drew before the build.

## The problem

The Herdr panel spaced its Status rows too loosely, and the looks had drifted apart.

- In Herdr, a title and its detail line sat 24 pt apart, 4 pt more than a line of text. Two one-line items sat 28 pt apart.
- The Codex tab spaced Status items 9.5 px apart and put no space between a title and its detail. Its marks and text started 2 and 4 px right of Herdr's.
- The desktop pane drew Status row padding at half the size `hooks/layout.ts` stated, because a Box draws padding at half the written value.
- The terminal left no space between Status items.

## The rule

Space shows what belongs together. Each distance is one of a few named steps, and the steps rise in this order:

1. The lines of one item, such as a title and its detail: `inside`, 0.
2. Two one-line items in a list: `list`, 4.
3. Two items under one parent when either has more than one line: `child`, 8.
4. Two top-level items when either has more than one line: `item`, 12.
5. Two groups or sections, with any rule halfway between them: `section`, 24, twice `item`.

A heading sits `head` (8) above its first item, less than `item`, so the heading binds to what it heads. Text sits `control` (8) above its buttons, and buttons sit `control` apart. The panel keeps `edge` (16) on each side. Marks take a `mark`-wide column (24), so text starts at 40.

Every gap, padding and line height comes from these steps. A row's padding counts toward the gap: a closed row pads `list / 2` above and below, and an open row, whose box shows, pads `item / 2`. Text lines are 20 pt, five units. Headings that take a taller line, such as Herdr's `HEAD_LINE` and the Codex tab's page title, take 24.

The scale lives in `hooks/layout.ts`: `SPACE_UNIT` and one constant per step, from `INSIDE_GAP_PT` to `MARK_PT`.

## How each look draws it

- Herdr draws points. `herdr/src/paint-theme.ts` takes its roles from the shared steps, and `gapBetween` in `herdr/src/paint-space.ts` picks a step for each pair of blocks.
- The Codex tab draws CSS pixels. `applyPageVariables` in `codex/src/tab-motion.ts` passes every step as a CSS variable, and the CSS in `codex/src/tab-css/` reads the variables.
- The desktop pane converts a step to its lines, `DESKTOP_LINE_PT`, and doubles the result for a Box, which draws padding, margin and gap at half the written value.
- The terminal draws whole rows. Only `item` and `section` round to a row. Docked, it adds a blank row between top-level Status items when either takes more than one line. It keeps the blank rows and dividers it drew on the other tabs.
- omp keeps its lines as they were. Its panel takes the prompt's place, so each added line moves the session up.

[Differences on purpose: spacing](../looks/differences-spacing.md) gives each look's conversion and where it cannot follow the scale. The Herdr and omp tables carry their own rows.

## What changed in each look

- Herdr: a title sits on the line directly above its detail. One-line items moved from 8 to 4 apart, and items with detail from 24 to 12. A heading sits 8 above its items instead of 12. A rule sits 12 from what is above and below it instead of 16. Closed rows and folds pad 2 instead of 8, so one-line Asks rows went from 36 to 24 apart.
- Codex: Status items with detail moved from 9.5 to 12 apart, and one-line items from 9.5 to 4. Closed Asks rows went from 36 to 24 apart. Marks moved from 18 to 16 px, text from 44 to 40, and the right edge from 14 to 16. The page title's line went from 22 to 24, and a banner's from 19 to 20. The literal gaps of 2, 3, 5, 6, 10, 11 and 14 px moved to the nearest step.
- Desktop: Status rows pad half of `list` or half of `item` as drawn, where they had drawn half the stated padding. The shared row padding and section gap take the new steps.
- Terminal: docked Status items with more than one line get a blank row between them.
- omp: no change.

Closed one-line rows now pad 2 instead of 8. In Herdr and the Codex tab, their hover and click box is 24 pt tall instead of 36.

## A check that keeps new values on the scale

A script would read the padding, margin, gap and line-height values in `herdr/src/paint-*.ts`, `codex/src/tab-css/*.css` and the `hooks/pane-*.tsx` files. It would fail on a number that is not a named step, a sum or multiple of `SPACE_UNIT`, or an entry in a short allowlist that gives its reason, such as a tree line's offset or an icon's size. `./scripts/check.sh` would run it. It is proposed, not built.
