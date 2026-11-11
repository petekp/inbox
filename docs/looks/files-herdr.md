# Files: the Herdr look

Part of [the look map](../looks.md#files).

The Herdr look is a Herdr app mod. It draws the inbox of the session that a host publishes for the terminal it follows. `herdr/build.ts` bundles `herdr/src` and the shared modules it imports into `herdr/mod/inbox/`, the folder an install copies into the app's `mods` folder.

| File | Role |
| --- | --- |
| `herdr/src/main.ts` | Herdr adapter. The only file that imports the Herdr app's modules, `gpui-kit`, `gpui-base` and `herdr`. The mod's `View`: it follows the terminal, watches and reads the session's file, keeps what the person opened, and paints the blocks with the theme's colors. |
| `herdr/src/follow.ts` | Herdr adapter. Which terminal in the look's tab it follows, from Herdr's focus, panes and terminal labels, and whether that terminal shows a session, no inbox, or an ended session. It imports no Herdr module. |
| `herdr/src/files.ts` | Herdr adapter. Where a host publishes a session under the app's home folder, and reading that file: missing, torn by a read mid-write, from a newer host, refused, or read with its session upgraded. |
| `herdr/src/screen.ts` | Herdr adapter. What one draw shows: the message for each case of the followed terminal, or the inbox's tabs, banners, status line and blocks. |
| `herdr/src/blocks.ts` | Herdr adapter. The blocks the paint draws: headings, rows, Status lines, folds, notes and rules, with their buttons and the tones the paint maps onto Herdr's theme. |
| `herdr/src/draw.ts` | Herdr adapter. Asks and Finds as blocks, from the shared view and `rowKeyPlan`: groups, rows with their buttons in the plan's order, and Closed folds. Also the tab cells, banners and status line. |
| `herdr/src/draw-status.ts` | Herdr adapter. The Status page as blocks, from the shared page and its key plans: the goal, milestones, rows, folds and rules. |
