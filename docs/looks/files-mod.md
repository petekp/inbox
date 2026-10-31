# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/register.tsx` | Mod adapter and host. Runs the Pane render, which draws the PRs, Status and Help tabs and calls the `pane-*.tsx` files for the rest. It also runs the band, the per-reply update and the press runner. It keeps the drawn session in an engine atom, saves each conversation's session in the engine store, and builds the mod's `SessionHost`. The plugin directory refuses `$` passed to a function another of the mod's files declares, so every function that takes `$` lives in this file. |
| `hooks/pane-context.ts` | Mod only. The types the Pane render hands its drawing files: `PaneBase` for the values the render computed, `PaneClient` for whether the surface draws Clients, `PaneHandlers` for the calls that need `$`, and `Row`, the shape every list row is drawn from. |
| `hooks/pane-frame.tsx` | Mod only. The pane's frame in both looks: the tab bar, the inline rail, banners, the status line and the footer. |
| `hooks/pane-row-frame.tsx` | Mod only. `desktopFrame`, the frame a desktop row, group title, PR block or Status row draws in: its mark column, side column and padding. |
| `hooks/pane-asks.tsx` | Mod only. The Asks and Finds tabs: question, task and finding rows, the Needs you and Finds groups, and a tab's empty state. |
| `hooks/pane-rows.tsx` | Mod only. `listRow`, which draws one list row, selected or not, in both looks. |
| `hooks/pane-row-lines.tsx` | Mod only. The parts a row's lines are drawn from: marks, tree lines, ages, feedback labels, an unselected row's line, and the props of the desktop row Client. |
| `hooks/pane-row-keys.tsx` | Mod only. A row's buttons: keyed buttons, the desktop follow-up links, the terminal's action lines and a reply field's actions. |
| `hooks/pane-row-parts.tsx` | Mod only. Group titles and sections, and closed rows: the result line, the closed fold, Undo and the settled row. |
| `hooks/pane-sizes.ts` | Mod only. The terminal and desktop looks' sizes in cells, lines and points: row columns, padding, tree lines, tab layouts and the inline tab column. `desktopTabSizes` fits the desktop tab bar to the pane's width. |
| `hooks/running-mark-timer.ts` | Mod only. The terminal look's running-mark timer. It asks for a new frame each `RUNNING_FRAME_MS` while the pane draws a running mark, and only once the last frame has drawn. |
| `hooks/palettes.ts` | Mod only. The pane's colors for each Claude Code theme and for desktop. `lookOf` picks a surface's look, and `paletteFor` picks the palette for a theme and look. |
| `hooks/desktop-svg.ts` | Mod only. The Svg images the desktop pane draws: Undo's draining fill, marks that follow the system's light or dark setting, the running dot and the fold chevron. |
| `hooks/terminal-text.ts` | Mod only. Text drawn as styled spans: terminal word wrapping, the cut to a line limit with an ellipsis in both looks, and the glyph columns that draw tree lines and the selection bar. |
| `hooks/pane-selection.ts` | Mod only. The shown tab, each tab's cursor and selected row, closed folds, Undo's scroll and redraw timing, and the keys that hold a settled layout and its scroll. |
| `hooks/pane-keys.ts` | Mod only. Row buttons and their keys: the `Action` type, each PR press's key, button glyphs, which element takes focus, a reply field's key, and the text a failed copy shows. |
| `hooks/mod-delivery.ts` | Mod only. Matches each prompt row Claude Code stores to the message a press sent, so the press reads as delivered. It also settles a message another plugin rewrote, and adds back, as uncertain, a queued message's sent record that an older build lost. |
| `hooks/mod-records.ts` | Mod only. What the mod tracks about tool calls, subagents, workflows and Herdr delegates. That includes which calls ran, and the child a finished Agent, Monitor or Workflow call ended or started. Also the text a permission dialog shows for a tool call. |
| `hooks/mod-sessions.ts` | Mod only. Which conversation a session write belongs to, saves to the engine store and their retries while another process holds its lock, and the per-conversation queues for updates and Status calls. |
| `hooks/mod-state.ts` | Mod only. The values the hooks module keeps between events, in three holders: `paneState` for the drawn pane, `sessionState` for the conversation the session runs, and `mod` for the rest of the process. A reload that runs the modules again resets them. |
| `hooks/tabs-client.tsx` | Mod only. A Client region for the desktop tab bar, so each tab takes clicks over its whole shape. |
| `hooks/row-client.tsx` | Mod only. A Client region for a closed row in the desktop pane. |
| `hooks/fold-client.tsx` | Mod only. A Client region for the desktop "N Closed" line. |
| `hooks/links-client.tsx` | Mod only. A Client region for an open row's follow-ups on desktop. |
| `hooks/undo-client.tsx` | Mod only. A Client region for Undo on desktop, whose fill drains while Undo lasts. |
| `hooks/desktop-metrics.ts` | Mod only. How wide the desktop pane draws text: characters per column, each character's width in points, a Button's padding, and line wrapping. |
