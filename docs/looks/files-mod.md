# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/register.tsx` | Mod adapter and host. Runs the Pane render. It reads the drawn state, builds the handlers for the calls that need `$`, and calls the `pane-*.tsx` files, which draw every tab. It also runs the band, the per-reply update and the press runner. It keeps the drawn session in an engine atom, saves each conversation's session in the engine store, and builds the mod's `SessionHost`. The plugin directory refuses `$` passed to a function another of the mod's files declares, so every function that takes `$` lives in this file. |
| `hooks/pane-context.ts` | Mod only. The types the Pane render hands its drawing files: `PaneBase` for the values the render computed, `PaneClient` for whether the surface draws Clients, `PaneHandlers` for the calls that need `$`, and `Row`, the shape every list row is drawn from. |
| `hooks/pane-frame.tsx` | Mod only. The pane's frame in both looks: the tab bar, the inline rail, banners, the status line and the footer. |
| `hooks/pane-row-frame.tsx` | Mod only. `desktopFrame`, the frame a desktop row, group title, PR block or Status row draws in: its mark column, side column and padding. |
| `hooks/pane-asks.tsx` | Mod only. The Asks and Finds tabs: question, task and finding rows, the Needs you and Finds groups, and a tab's empty state. |
| `hooks/pane-rows.tsx` | Mod only. `listRow`, which draws one list row, selected or not, in both looks. |
| `hooks/pane-row-lines.tsx` | Mod only. The parts a row's lines are drawn from: marks, tree lines, ages, feedback labels, an unselected row's line, and the props of the desktop row Client. |
| `hooks/pane-row-keys.tsx` | Mod only. A row's buttons: keyed buttons, the desktop follow-up links, the terminal's action lines and a reply field's actions. |
| `hooks/pane-row-parts.tsx` | Mod only. Group titles and sections, and closed rows: the result line, the fold line, the closed fold, Undo and the settled row. |
| `hooks/pane-prs.tsx` | Mod only. The PRs tab: thread and check rows, PR blocks and their settled form, the PR order lines, the tab's buttons, and its empty state and gh notice. |
| `hooks/pane-status-lines.tsx` | Mod only. The lines a Status row is drawn from: the head, a subject's name line and its text width, and the tree beside a subject's children. |
| `hooks/pane-status-shown.ts` | Mod only. Which Status subject rows a look had on screen: in the terminal, the rows whose first line is in the pane's window. On desktop, every subject. |
| `hooks/pane-status-tops.ts` | Mod only. `Drawn`: a part of the Status with the terminal lines it takes, which each Status drawing function returns with its element, and how parts stack into each subject row's first line. |
| `hooks/pane-status.tsx` | Mod only. The Status tab: the rules between items, each row and its buttons, and the tab's page. |
| `hooks/inbox-model.ts` | Mod only. The model the mod's ledger and Status calls ask, and the report each call gives its record. |
| `hooks/pane-status-goal.tsx` | Mod only. The Status tab's goal section: its heading, the goal or the line that says none is set, its buttons, its text field, the Now line and the milestones. |
| `hooks/pane-help.tsx` | Mod only. The Help page: the key list and the mark legend. |
| `hooks/pane-sizes.ts` | Mod only. The terminal and desktop looks' sizes in cells, lines and points: row columns, padding, tree lines, tab layouts and the inline tab column. `desktopTabSizes` fits the desktop tab bar to the pane's width. |
| `hooks/running-mark-timer.ts` | Mod only. The terminal look's running-mark timer. It asks for a new frame each `RUNNING_FRAME_MS` while the pane draws a running mark, and only once the last frame has drawn. |
| `hooks/palettes.ts` | Mod only. The pane's colors for each Claude Code theme and for desktop. `lookOf` picks a surface's look, and `paletteFor` picks the palette for a theme and look. |
| `hooks/desktop-svg.ts` | Mod only. The Svg images the desktop pane draws: Undo's draining fill, marks that follow the system's light or dark setting, the running dot and the fold chevron. |
| `hooks/terminal-text.ts` | Mod only. Text drawn as styled spans: terminal word wrapping, the cut to a line limit with an ellipsis in both looks, and the glyph columns that draw tree lines and the selection bar. |
| `hooks/pane-selection.ts` | Mod only. The shown tab, each tab's cursor and selected row, closed folds, the rows each tab gained since the last draw, Undo's scroll and redraw timing, and the keys that hold a settled layout and its scroll. |
| `hooks/pane-keys.ts` | Mod only. Row buttons and their keys: the `Action` type, each PR press's key, button glyphs, which element takes focus, a reply field's key, and the text a failed copy shows. |
| `hooks/mod-delivery.ts` | Mod only. Matches each prompt row Claude Code stores to the message a press sent, so the press reads as delivered. It also settles a message another plugin rewrote, and adds back, as uncertain, a queued message's sent record that an older build lost. |
| `hooks/mod-records.ts` | Mod only. What the mod tracks about tool calls, subagents, workflows and Herdr delegates. That includes which calls ran, and the child a finished Agent or Workflow call ended or started. Also the text a permission dialog shows for a tool call. |
| `hooks/mod-herdr.ts` | Mod only. Reports the drawn conversation to the Herdr pane or app terminal the session runs in. In an app terminal it publishes the session first, moving and removing files with `mv` and `rm` because the engine has no call for either. `listenForHerdrPresses` follows the terminal's `inbox.press` label with `hc events` and applies the presses the look writes while the session's published file names this terminal. `openInHerdr` opens the Herdr look beside the terminal for `/inbox` and the band's Open inbox press. |
| `hooks/mod-old-fields.ts` | Mod only. `sessionFromOldFields` builds the session from the separate store fields an older build kept, for a hot reload into this build. The fields' atoms stay in `register.tsx`, because the engine reads an atom only where the file that reads it declares it. |
| `hooks/mod-saves.ts` | Mod only. Saves to the engine store and reads of saved sessions. A save retries while another process holds the store's lock. When a write to a conversation off screen meets the lock through every retry, the changed session is held in memory and tried again in the background, for up to 10 minutes. Later writes and reads of that session start from it, until a newer save of the conversation lands. Every session of the mod shares one store, which the engine caps at 4 MiB of JSON. A saved session keeps at most `SAVED_PR_VIEWS_MAX` characters of PR views: merged and closed PRs go first, then the open PRs read longest ago. The first save of each conversation keeps every running conversation's saved session, and the newest `KEPT_SESSIONS` of the rest. A write the store refuses as full drops the shared PR views no fetch reads and tries again. When it is still full, it deletes the saved sessions of ended conversations, oldest first, and tries once more. A save of the drawn session that still does not fit is logged, and `isLastSaveRefused` tells the `record`, `close` and `order_prs` answers to say the change is not saved. |
| `hooks/running-sessions.ts` | Mod only. Which Claude Code conversations run: the `sessions/<pid>.json` files in Claude Code's configuration folder whose process `ps` lists. |
| `hooks/mod-store.ts` | Mod only. The engine store's errors: a held lock, which `whileLockHeld` waits out, and a full store. |
| `hooks/mod-sessions.ts` | Mod only. Which conversation a session write belongs to, and the per-conversation queues for updates and Status calls. |
| `hooks/mod-pr-shared.ts` | Mod only. `prSharedStore`: the views and the limit error every Claude Code session shares, in one engine store key. `dropUnreadSharedViews` drops each view read `PR_SHARED_MS` or longer ago, which no fetch takes in place of a read, to make room in a full store. |
| `hooks/mod-state.ts` | Mod only. The values the hooks module keeps between events, in three holders: `paneState` for the drawn pane, `sessionState` for the conversation the session runs, and `mod` for the rest of the process. A reload that runs the modules again resets them. |
| `hooks/tabs-client.tsx` | Mod only. A Client region for the desktop tab bar, so each tab takes clicks over its whole shape. |
| `hooks/row-client.tsx` | Mod only. A Client region for a closed row in the desktop pane. |
| `hooks/fold-keys.ts` | Mod only. The keys a fold line draws under, for an Asks group's Closed fold and a Status done fold, which a desktop click and hover come back with, and the upgrade of the saved Asks folds. |
| `hooks/fold-client.tsx` | Mod only. A Client region for a desktop fold line: "N closed" on Asks and "N done" on the Status. |
| `hooks/links-client.tsx` | Mod only. A Client region for an open row's follow-ups on desktop. |
| `hooks/undo-client.tsx` | Mod only. A Client region for Undo on desktop, whose fill drains while Undo lasts. |
| `hooks/desktop-metrics.ts` | Mod only. How wide the desktop pane draws text: characters per column, each character's width in points, a Button's padding, and line wrapping. |
