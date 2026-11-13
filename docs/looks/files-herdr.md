# Files: the Herdr look

Part of [the look map](../looks.md#files).

The Herdr look is a Herdr app mod. It draws the inbox of the session that a host publishes for the terminal it follows. `herdr/build.ts` bundles `herdr/src` and the shared modules it imports into `herdr/mod/inbox/`, the folder an install copies into the app's `mods` folder.

| File | Role |
| --- | --- |
| `herdr/src/main.ts` | Herdr adapter. The only file that imports `herdr`, the Herdr app's state and effects. It and the `herdr/src/paint-*.ts` files are the only ones that import `gpui-kit` and `gpui-base`, since painting does not fit one file under the size limit. The other files decide what to draw, so they stay testable without Herdr. The mod's `View`: it follows the terminal, watches and reads the session's file, keeps what the person opened, and writes presses. |
| `herdr/src/follow.ts` | Herdr adapter. Which terminal in the look's tab it follows, from Herdr's focus, panes and terminal labels, and whether that terminal shows a session, no inbox, or an ended session. It imports no Herdr module. |
| `herdr/src/files.ts` | Herdr adapter. Which changes `watchFolder` reports can change the session's file, at the path `hooks/herdr.ts:publishedSessionPath` gives, and reading that file: missing, torn by a read mid-write, from a newer host, refused, or read with its session upgraded. |
| `herdr/src/screen.ts` | Herdr adapter. What one draw shows: the message for each case of the followed terminal, or the inbox's tabs, banners, status line and blocks. |
| `herdr/src/blocks.ts` | Herdr adapter. The blocks the paint draws: headings, rows, Status lines, PRs, text fields, folds, notes and rules, with the tones the paint maps onto Herdr's theme. Each button says what a press does: change the view, send a press, open a text field, or send or leave one. |
| `herdr/src/draw.ts` | Herdr adapter. Asks and Finds as blocks, from the shared view and `rowKeyPlan`: groups, rows with their buttons in the plan's order, a settled row's Undo from its `undo` action, and Closed folds. Also the tab cells, banners and status line. |
| `herdr/src/draw-status.ts` | Herdr adapter. The Status page as blocks, from the shared page and its key plans: the goal, milestones, rows, folds and rules, and the goal's text field. |
| `herdr/src/draw-prs.ts` | Herdr adapter. The PRs tab as blocks, from `threadActions`, `checkActions`, `prBlockActions` and `prClearActions`: each PR with its threads and checks, the refresh, clear and order lines, and the empty and `gh` notes. |
| `herdr/src/draw-help.ts` | Herdr adapter. Help as blocks: the keys from `helpKeys` and the marks from `markLegend`. |
| `herdr/src/keys.ts` | Herdr adapter. What a key does: change tab, move the selection, press the last close's Undo, leave the pane, close the open text field, or press the selected row's button with that key. Which moves close the text field, what sending its text does to the field and its draft, and whether a click in the list gives the keys to the open field or to the look. |
| `herdr/src/motion.ts` | Herdr adapter. Steps each drawn row through the shared row states in `hooks/row-motion.ts`, and keeps a row the publish dropped drawn while it leaves. |
| `herdr/src/out.ts` | Herdr adapter. The presses the look sent that have no result yet: which buttons draw out, what their rows read, and when a read of the session ends each one. |
| `herdr/src/press-queue.ts` | Herdr adapter. One session's presses from send to end: refusing a press, running the look's own opens, writing the press file, waking the host, and taking back a file no host took in time. Its effects come through `QueueIo`, so the tests run it without the app. |
| `herdr/src/press-file.ts` | Herdr adapter. Where the look writes a press for the host, the file's text in the format `hooks/herdr-press-file.ts:pressFile` reads, and the label that wakes the host. |
| `herdr/src/run-here.ts` | Herdr adapter. Which opens and copies the look runs itself, at once, and running them. |
| `herdr/src/paint-theme.ts` | Herdr adapter. Maps the blocks' tones onto Herdr's theme, the text sizes and column positions the paint files share, and what they share for one draw. |
| `herdr/src/paint-blocks.ts` | Herdr adapter. Paints each block with `gpui-kit` and `gpui-base`: buttons, rows with their motion, text fields, Status lines, PRs, headings, folds, rules, notes, empty states and banner blocks. |
| `herdr/src/paint-chrome.ts` | Herdr adapter. Paints the tab row with the status line and Help at its right end, the banners, the session notes, and the message for a terminal with no inbox. Herdr's pane header names the pane, so the look draws no title. |
| `herdr/src/paint-timer.ts` | Herdr adapter. A timed button's time left, as Undo shows it: the share of `SETTLED_MS` left, and the fill behind the label that empties over it, as the Codex tab's Undo does. A timed button keeps a fixed width, so nothing shifts while its time runs. |
