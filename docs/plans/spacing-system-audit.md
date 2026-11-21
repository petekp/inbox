# Spacing audit, 2026-11-16

Status: built. This is the audit behind [the spacing system plan](spacing-system.md), taken at `78f26fc9` before the scale was built. It lists the spacing values each look drew with then, where each is set and what it separates. Points (pt) are the Herdr panel's and the desktop pane's unit. The Codex tab's CSS pixels are points on macOS. The terminal and omp count whole rows and columns.

## Rhythm at the audit, side by side

| Distance | Herdr | Codex tab | Desktop pane | Terminal | omp |
|---|---|---|---|---|---|
| Line height | 20 | 20 (`body` 13px/20px) | 19 | 1 row | 1 row |
| A title to its detail line | 4 (`LINE_GAP`), so 24 apart | 0 | 0 | 0 | 0 |
| Two one-line Status items | 8, so 28 apart | 9.5 (`--status-row-pad` 4.75 twice) | about 6.75 (see below) | 0 | 0 |
| Two Status items with detail | 24 (`ITEM_GAP`) | 9.5 | about 6.75 | 0 | 0 |
| Two closed Asks rows | 16 (`ROW_PAD_PT` 8 twice), so 36 apart | 16, so 36 apart | 16 plus a 1 pt border each, so 37 apart | a 1-row `│ ───` divider | 0 |
| Above a section heading (Other work, Later) | 32 (a `GROUP_GAP` gap block) | 19 (`--section-gap` and row padding) | about 16.25 (`SECTION_GAP_PT` and row padding) | 1 blank row | 1 blank row |
| A heading to its first item | 12 (`HEAD_GAP`) | 6 (`.group-title`) plus the row's 8 | 8 | a `│` row | 0 |
| Between two groups or sections | 32 (`GROUP_GAP`) around a rule | 20 (`section` 10px twice) around a rule | 20 around a hairline | 2 blank rows | 0 |

Five things in this table break the proximity rule or drift between looks:

- Herdr puts 4 pt between a title and its detail. Every other look puts none.
- Herdr's "Other work" heading sits 32 pt under the item above it and 12 pt over its first item. Items sit 24 pt apart, so the heading binds to what it heads, but the steps are larger than the content needs.
- The desktop Status row's padding is `STATUS_PAD_Y` = 4.75 / 19 (`hooks/pane/pane-sizes.ts:70`), passed to a Box that counts padding in half lines (`desktopSpaceLines`, `hooks/pane/pane-status-tops.ts:71`). So it draws about 2.4 pt per side, not the 4.75 pt `core/view/layout.ts:4` states. Not checked in real pixels.
- Codex places marks and text at 18 and 44 px with a 14 px right edge. Herdr uses 16, 40 and 16.
- The terminal leaves 2 blank rows between Asks sections. omp leaves none between groups.

## Herdr panel

`herdr/src/paint-theme.ts` already defines a 4-pt scale, `SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 }`, and names roles from it. `gapBetween` in `herdr/src/paint-space.ts:45` picks the space between two blocks. A row's padding (`ROW_PAD_PT`, `core/view/layout.ts:2`) counts toward that space.

| Value | Where | What it separates |
|---|---|---|
| `LINE_HEIGHT` 20, `TEXT` 13, `HEAD_LINE` 24 | paint-theme.ts:90–95 | lines of text; the Status head |
| `LINE_GAP` 4 | paint-theme.ts:103; paint-blocks.ts:144, 314, 381; paint-space.ts:50 | a title to each line under it; Help rows |
| `CONTROL_GAP` 8 | paint-theme.ts:105; paint-space.ts:36, 46 | text to buttons; button to button; two one-line items |
| `HEAD_GAP` 12 | paint-theme.ts:107; paint-space.ts:48 | a heading or labelled rule to what it heads |
| `INSET` 12 | paint-theme.ts:109; paint-space.ts:39, 46 | a nested Status item to the line above; pill and banner side padding; title to age |
| `EDGE` 16 | paint-theme.ts:111; paint-space.ts:54 | panel padding; row to row, padding included |
| `ITEM_GAP` 24 | paint-theme.ts:113; paint-space.ts:37 | two top-level Status items; a row to a heading |
| `GROUP_GAP` 32, `END_SPACE` 32 | paint-theme.ts:115–116; paint-space.ts:49, 52, 92 | around a rule (16 each side); a line or banner to the next block; under the list |
| `ROW_PAD_PT` 8 | layout.ts:2; paint-blocks.ts:246, 528; paint-space.ts:26, 175 | inside a row's and a fold's box, above and below |
| `MARK_W` 24, `TEXT_X` 40, `NEST` 24 | paint-theme.ts:122–124 | mark column; text start; nesting step |
| `BUTTON_H` 28, `BOX_RADIUS` 10, `TAB_RADIUS` 6 | paint-theme.ts:130–132 | button and tab height; corners |
| `SPACE.xs` 4 | paint-blocks.ts:190 | the goal field's padding |
| `BANNER_PAD_Y_PT` 8 | layout.ts:16; paint-chrome.ts:143 | banner text to its edge |
| `HELP_KEY_W` 32, `HELP_ICON` 14, `HELP_ICON_TEXT` 10 | paint-theme.ts:136–142 | Help's key column and icon |

The tab bar uses `EDGE` above, `CONTROL_GAP` below and between lines, and `LINE_GAP` between tabs (paint-chrome.ts:65–69, 87, 101).

## Codex tab

The tab reads `--row-pad`, `--status-row-pad`, `--section-gap`, `--banner-pad-y` and `--banner-gap` from `core/view/layout.ts` (`codex/src/tab-motion.ts:316–320`). Everything else is a literal in `codex/src/tab-css/`.

| Value | Where | What it separates |
|---|---|---|
| `font: 13px/20px` | base.css:52 | lines of text |
| `--mark-x` 18, `--text-x` 44 | base.css:20–21 | mark column and text start; 41 and 67 in nested closed rows and PRs (closed-rows.css:43–44, prs.css:55–59) |
| right padding 14 | rows.css:5; closed-rows.css:12; groups.css:21; status-page.css:3, 111, 127, 307; page.css:81, 104 | content to the tab's right edge |
| `--row-pad` (8) | rows.css:5; closed-rows.css:12, 53–54; page.css:90, 94 | a row's text to its box, above and below |
| `--status-row-pad` (4.75) | status-page.css:7–8, 71, 80, 87, 186, 189, 219–224, 248–264 | a Status row to its box; tree-line offsets |
| `--section-gap` (9.5) | status-page.css:170, 287 | goal to milestones; above Other work and Later |
| `.panel` gap 8, padding 8 0 2 | rows.css:82–83 | an open row's title to its body, buttons and field |
| `.body p + p` 4 | rows.css:205 | paragraphs in an open row |
| `.actions` gap 4; `.keys` and `.follow-ups` gap 6 | rows.css:286, 292, 349 | button rows and buttons |
| button: min-height 26, padding 3 11, gap 5, radius 13 | rows.css:299–301 | a button's own size |
| input: min-height 28, padding 4 10, radius 10 | rows.css:359–365 | the reply field |
| `.side` margin-left 12 | rows.css:44 | title to age |
| `.mark` padding-right 8 | rows.css:12 | mark to text |
| `section` padding 10 0 | groups.css:8 | between groups, around the rule |
| `main` padding 8 0 4 | groups.css:4 | tab bar to list; list to footer |
| `.group-title` padding-bottom 6 | groups.css:21 | a group's title to its first row |
| goal heading gaps 8 and 4; `.actions` margin-top 6 | status-page.css:29, 109–110, 126, 136, 143, 149, 157 | the goal's heading, text and buttons |
| `h1` 15px/22px | status-page.css:96–97 | the Status head |
| `.part-rule` gap 8 | status-page.css:296 | Other work label to its rule |
| `--mark-middle` 5.5, `--arm-gap` 2 | status-page.css:44–45 | tree line under a mark; arm to a child's mark |
| banners: padding 10 16, gap 12 and 8, margin 12, line-height 19 | base.css:98–175 | banner text, buttons and stacking |
| tab bar: padding 12 12 0, gap 4 16, tab padding 6 12 | tab-bar.css:6–17 | tabs and the bar's edges |
| footer: padding 8 16 16, gap 4 16 and 16 | page.css:22–30 | footer contents |
| PRs: gaps 10 and 6, margins 8 and 12, padding 6 and 10 | prs.css:13–88 | a PR's title, status, buttons and groups |

## Terminal and desktop pane

The two looks share `hooks/register.tsx` and the `hooks/pane/pane-*.tsx` files. Desktop counts a Box's height and width in lines of 19 pt (`DESKTOP_LINE_PT`) and cells of 8.8 pt (`DESKTOP_CELL_PT`). It counts a Box's padding, margin and gap in half lines, so a written 1 draws 9.5 pt. The terminal counts whole rows and columns. `blankLine` (register.tsx:2961) is 1 row docked and 0 inline. On desktop it draws 9.5 pt.

| Value | Where | Desktop | Terminal | What it separates |
|---|---|---|---|---|
| `DESKTOP_ROW_PAD` (8 / 19) | pane-sizes.ts:53; pane-row-lines.tsx:322; row-client.tsx:95 | 8 pt plus a 1 pt border | none | a row's text to its box |
| `space.rowPad` | register.tsx:2961–2965; pane-rows.tsx:440, 456, 499 | 8 pt | 1 row, selected row only | a selected row to its neighbours |
| `SELECTED_GAP_PT` 3 | pane-sizes.ts:75; pane-rows.tsx:312, 338 | 3 pt | none | a selected frame to its neighbours |
| `divided` | pane-row-lines.tsx:161–176 | rows flush | a `│ ───` row | row to row |
| `marginTop={blankLine}` | pane-rows.tsx:251, 350, 352, 409, 412, 473, 478; pane-ask-tree.tsx:74 | 9.5 pt | 1 row | an open row's title to its body, tree, buttons and status |
| `titleGap` (2 × 8 / 19) | pane-row-parts.tsx:194–204, 345 | 8 pt | a `│` row | a group title to its first row; last row to Closed |
| `terminalSectionGap`; `section` padding | pane-row-parts.tsx:157–185; pane-status.tsx:525 | 9.5 + 1 pt hairline + 9.5 | 2 rows, 1 inline | section to section |
| `sections([...], 2)` | pane-prs.tsx:443, 461 | 39 pt | 2 rows | PR block to PR block |
| `STATUS_PAD_Y` | pane-sizes.ts:70; pane-status-lines.tsx:122, 137 | about 2.4 pt plus a 1 pt border | 0 | a Status row to its box |
| `SECTION_GAP_PT` (9.5) | layout.ts:13; pane-status.tsx:172; pane-status-goal.tsx:204 | 9.5 pt | 1 row | above Other work and Later; goal text to milestones |
| `STATUS_ROW_PAD_PT` (4.75) | layout.ts:5; pane-status-goal.tsx:204 | 4.75 pt | 1 row | milestone to milestone |
| `BANNER_PAD_Y_PT`, `BANNER_GAP_PT` (8) | layout.ts:16–19; pane-frame.tsx:136, 151, 179, 404 | 8 pt | 1 row between banners | banner text to its edge; banner to banner |
| list `paddingTop={blankLine}` | register.tsx:3550 | 9.5 pt | 1 row | tab bar to list |
| footer `paddingTop={blankLine}`, `columnGap={3}` | pane-frame.tsx:445–446 | 9.5 pt; 3 cells | 1 row; 3 columns | list to footer |
| `ROW_COLUMNS`, `TREE_LINE_AT` 2 | pane-sizes.ts:54–58 | mark 1 cell, text 3 cells | tree 2, mark 5, text 8 | mark column and text start |
| `FRAME_INSET_PT` 17.6 | pane-sizes.ts:72 | 2 cells each side | none | a frame's edge to its content |
| nesting | pane-status.tsx:253, 269; pane-row-lines.tsx:136 | 2 cells a level | 3 columns a level | a child under its parent |
| `space.buttonGap` | register.tsx:2963–2965 | 1 cell | 2 columns | button to button |
| `DESKTOP_BUTTON_PT` 23 | pane-sizes.ts:36 | fixed by the app | none | a native button's height |

## omp panel

omp draws plain lines in `omp/src/panel*.ts`. It has no spacing constants of its own: blank lines are literal `''` entries, and columns are literal numbers. It reads `isSpacedAbove` (`core/view/status-path.ts:118`) to decide whether a milestone gets a blank line.

| Value | Where | What it separates |
|---|---|---|
| no blank lines | panel-draw.ts:187–205; panel-lines.ts:287–323 | a row's title to its detail; row to row; group to group; heading to its rows |
| `''` above each part heading | panel-page.ts:224–229 | above Other work and Later |
| `''` after the goal section | panel-entries.ts:359–366 | goal to the first subject |
| `''` before a milestone | panel-goal.ts:98–101, 287 | milestone to milestone, when the one above draws more than its name |
| `''` above the other PRs note; between Help sections | panel-entries.ts:206, 383, 386 | those blocks |
| cursor col 1, lead mark col 3, title col 6, `INDENT` 7 | panel-draw.ts:107, 171; panel-lines.ts:32 | Asks columns |
| `PAGE_MARK_AT` 1, `PAGE_TEXT_AT` 3, nest 2 columns | panel-entries.ts:351–354; panel-page.ts:101 | Status columns |
| right padding 1 column | panel-text.ts:67 | content to the right edge |
| banner box: border plus 1 column each side | panel-draw.ts:24–34 | banner text to its edge |
