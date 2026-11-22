# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/mod/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/mod/explanation-reply.ts` | Mod only. Saves the transcript row where an explanation's reply begins, for Show explanation, and words a refused scroll for the row. |
| `hooks/register.tsx` | Mod entry. Declares the mod's engine atoms and wires each Claude Code hook to the `hooks/mod/mod-*.ts` module that handles it. The plugin directory accepts `# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/mod/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/mod/explanation-reply.ts` | Mod only. Saves the transcript row where an explanation's reply begins, for Show explanation, and words a refused scroll for the row. |
 passed only to a function declared in this file, and the engine reads an atom or a state key only where this file names it. So `modOf` binds, for each hook, the narrow engine calls the modules make, as the `Mod` of `hooks/mod/mod-ports.ts`. The permission hooks stay written here, because the directory accepts one only when it returns `next(e)` itself. |
| `hooks/mod/mod-ports.ts` | Mod only. `Mod`, what the mod's modules reach through `# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/mod/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/mod/explanation-reply.ts` | Mod only. Saves the transcript row where an explanation's reply begins, for Show explanation, and words a refused scroll for the row. |
: the atoms, clock, pane, conversation, model, setup, store, history, command and Herdr calls. It also carries the operations several modules share, `commit`, `sendUi`, `publishStatus`, `syncLook`, `hostOf` and `fetchPrs`, so the modules that call them and the modules that define them import no value from each other in a loop. A module that uses some fields names them with `Pick`, and one that uses most takes `Mod`. Of those that name their fields, only the session write loop, the state upgrade and message delivery in `hooks/mod/mod-host.ts` take `writeSession`. |
| `hooks/mod/mod-upgrade.ts` | Mod only. On load, brings what an older build left in engine state to the current shape: the drawn session, the pane's fields from before the shared controller, and a sample copy that lacks a field. `OLD_INITIAL` gives each old field its value while that build wrote nothing there. |
| `hooks/mod/mod-drawn.ts` | Mod only. Reads what the pane draws: the controller's state, the drawn session or the sample, whether the pane and the PRs tab show, and the /config theme. `redraw` draws the pane again. |
| `hooks/mod/mod-session-write.ts` | Mod only. Writes a conversation's session. `changeSession` writes the drawn session's atom while no other write lands, saves it to the engine store, and sends a write for a conversation off screen to its saved session. `commit` then updates the Status look, the Herdr look and the controller. |
| `hooks/mod/mod-host.ts` | Mod only. The mod's `SessionHost`: the inbox model call, a press's effects, and delivering a message to the agent. |
| `hooks/mod/mod-updates.ts` | Mod only. The inbox model's calls after a reply and during a turn: the ledger update, the Status call and its catch-up, and the records of each call. |
| `hooks/mod/mod-publish.ts` | Mod only. Publishes the drawn session to the Herdr look, and applies a press that look wrote. |
| `hooks/mod/mod-dialogs.ts` | Mod only. Permission and question dialogs: notes one opening and closing, and `waitForPermission`, the permission row where the guard skips `classic.PermissionRequest`. |
| `hooks/mod/mod-ui-loop.ts` | Mod only. Runs events through the shared controller, applies the commands it returns, and schedules its next wake and the terminal's frames. |
| `hooks/mod/mod-pane-open.ts` | Mod only. Opens and focuses the pane, shows a tab, starts and ends a look at the Status, and follows Herdr delegates while the Status shows. |
| `hooks/mod/mod-pane-scroll.ts` | Mod only. Scrolls the pane to a row, a Status row or the open row, and keeps the terminal's Undo in view. |
| `hooks/mod/mod-pane-input.ts` | Mod only. The pane's typing and folds: sends or discards a reply, opens and closes the reply field, moves the cursor, and sets folds, Help and collapsed rows. |
| `hooks/mod/mod-prs.ts` | Mod only. Finds and fetches the session's PRs, links the PRs a reply names, and polls while a fetch is due. |
| `hooks/mod/mod-press-run.ts` | Mod only. Runs a row or PR press through the shared press runner, and wakes the controller after a press settles or held sends go out. |
| `hooks/mod/mod-demo.ts` | Mod only. Shows or hides the sample, runs a press on it, and gives the stand-in agent's reply. |
| `hooks/mod/mod-load.ts` | Mod only. Loads a conversation's session after a start, `/clear`, `/resume` or a fork, brings it back after a reload, and saves the session's folder and branch. |
| `hooks/mod/mod-turns.ts` | Mod only. A turn's start and end, and the stop a failed or cut-off turn leaves, with Resume. |
| `hooks/mod/mod-prompts.ts` | Mod only. A submitted prompt and the rows Claude Code stores: which prompt is the person's words, what Claude reads beside it, and the replies and command rows a turn records. |
| `hooks/mod/mod-tool-calls.ts` | Mod only. The `record`, `close` and `order_prs` calls, and what other tool calls and spawned agents add to the turn and to the Status's children. |
| `hooks/mod/mod-lifecycle.ts` | Mod only. Turns the mod on: registers `/inbox` and the tools, upgrades and loads state, and starts the clock and the Herdr listener. Also ends the session's conversation, at exit and at /clear and /resume. |
| `hooks/mod/mod-command.ts` | Mod only. Runs `/inbox`: opens the pane, shows or hides the sample, or asks about the Herdr mod again. |
| `hooks/mod/mod-pane-events.ts` | Mod only. The pane's presses, scrolls, messages and close. |
| `hooks/mod/mod-pane-handlers.ts` | Mod only. The handlers the pane's rows and buttons call, the pane's tab and move keys, where the Status starts in the pane, and the desktop focus after a draw. |
| `hooks/mod/mod-pane-render.tsx` | Mod only. The Pane render in both looks. It reads the drawn state and the controller's state, and calls the `pane-*.tsx` files, which draw every tab. |
| `hooks/mod/mod-band.tsx` | Mod only. The band above the prompt: the inbox's counts with Open inbox, and the stop row with Resume. |
| `hooks/pane/pane-context.ts` | Mod only. The types the Pane render hands its drawing files: `PaneBase` for the values the render computed, `PaneClient` for whether the surface draws Clients, `PaneHandlers` for the calls that need `$`, and `Row`, the shape every list row is drawn from. |
| `hooks/pane/pane-frame.tsx` | Mod only. The pane's frame in both looks: the tab bar, the inline rail, banners and the status block. |
| `hooks/pane/pane-herdr-ask.tsx` | Mod only. The Herdr install question's buttons under its banner, and `herdrAskKeys`, the y and q bindings the pane draws hidden in the terminal. |
| `hooks/pane/pane-row-frame.tsx` | Mod only. `desktopFrame`, the frame a desktop row, group title, PR block or Status row draws in: its mark column, side column and padding. |
| `hooks/pane/pane-asks.tsx` | Mod only. The Asks and Finds tabs: question, task and finding rows, the Needs you and Finds groups, and a tab's empty state. |
| `hooks/pane/pane-ask-tree.tsx` | Mod only. An open question's or task's Holds up line, context, option lines, hung on one connector in the terminal, and the entries desktop draws on its own lines. |
| `hooks/pane/pane-part-space.ts` | Mod only. `partSpace` turns `partGap` into the value a Box writes: desktop's padding in lines, or the terminal's blank rows. |
| `hooks/pane/pane-desktop-card.tsx` | Mod only. The selected card of an open question or task on desktop when it has a tree: the title, branch and button frames, inside one Box that draws the border, fill and padding. |
| `hooks/pane/pane-desktop-tree.tsx` | Mod only. A desktop tree line drawn from 1 pt pieces in a frame's mark column, for the Status tree and an open question's tree. |
| `hooks/pane/pane-rows.tsx` | Mod only. `listRow`, which draws one list row, selected or not, in both looks. |
| `hooks/pane/pane-title-tint.ts` | Mod only. `newTitleTint` and `closedTitleTint`, the color a row's title takes while its tint lasts, in both looks. |
| `hooks/pane/title-client.tsx` | Mod only. The desktop pane's open row title, as a Client, so a click anywhere on the title collapses the row. It draws its own hover and pressed colors. |
| `hooks/pane/pane-row-lines.tsx` | Mod only. The parts a row's lines are drawn from: marks, tree lines, ages, feedback labels, an unselected row's line, and the props of the desktop row Client. |
| `hooks/pane/pane-row-keys.tsx` | Mod only. A row's buttons: keyed buttons, the desktop follow-up links, the terminal's action lines and a reply field's actions. |
| `hooks/pane/row-key-actions.ts` | Mod only. Turns a row's planned options, keys and more-options into keyed actions that run its presses. |
| `hooks/pane/pane-row-parts.tsx` | Mod only. Group titles and sections, and closed rows: the result line, the fold line, the closed fold, Undo and the settled row. |
| `hooks/pane/pane-prs.tsx` | Mod only. The PRs tab: thread and check rows, PR blocks and their settled form, the PR order lines, the tab's buttons, and its empty state and gh notice. |
| `hooks/pane/pane-status-lines.tsx` | Mod only. The lines a Status row is drawn from: the head, a subject's name line and its text width, and the tree beside a subject's children. |
| `hooks/pane/pane-status-shown.ts` | Mod only. Which Status subject rows a look had on screen: in the terminal, the rows whose first line is in the pane's window. On desktop, every subject. |
| `hooks/pane/pane-status-tops.ts` | Mod only. `Drawn`: a part of the Status with the terminal lines it takes, which each Status drawing function returns with its element, and how parts stack into each subject row's first line. |
| `hooks/pane/pane-status.tsx` | Mod only. The Status tab: each row and its buttons, Other work's rule, and the tab's page. |
| `hooks/mod/inbox-model.ts` | Mod only. The model the mod's ledger and Status calls ask, and the report each call gives its record. |
| `hooks/pane/pane-status-goal.tsx` | Mod only. The Status tab's goal section: its heading, the goal, the suggested goal or the line that says none is set, its buttons, the Now line and the milestones. |
| `hooks/pane/pane-status-goal-field.tsx` | Mod only. The goal's text field and its Cancel, whose submit button reads Set for a new goal and Save for an edit. |
| `hooks/pane/pane-status-parent.tsx` | Mod only. A Status parent's name line as its fold in the terminal and desktop looks: the chevron as a dim Button in the terminal, and the line as a Client on desktop. |
| `hooks/pane/pane-text.tsx` | Mod only. The pane's formatted text: inline Markdown, and lines already wrapped into spans. |
| `hooks/pane/pane-status-part.tsx` | Mod only. A Status part's line in the terminal and desktop looks, such as Other work: the space above it, its name or the head's title, its rule, and the head's description. |
| `hooks/pane/pane-status-milestone-space.tsx` | Mod only. The space between the goal's milestones in the terminal and desktop looks, and the Later label above the milestones that wait. |
| `hooks/pane/pane-status-path.tsx` | Mod only. The goal's path in the terminal and desktop looks: the line in the milestones' mark column, and a done milestone folded to its name. |
| `hooks/pane/pane-help.tsx` | Mod only. The Help page: the key list and the mark legend. |
| `hooks/pane/pane-sizes.ts` | Mod only. The terminal and desktop looks' sizes in cells, lines and points: row columns, padding, tree lines, tab layouts and the inline tab column. `desktopTabSizes` fits the desktop tab bar to the pane's width. |
| `hooks/pane/palettes.ts` | Mod only. The pane's colors for each Claude Code theme and for desktop. `lookOf` picks a surface's look, and `paletteFor` picks the palette for a theme and look. |
| `hooks/pane/desktop-svg.ts` | Mod only. The Svg images the desktop pane draws: Undo's draining fill, marks that follow the system's light or dark setting, the running dot and the fold chevron. |
| `hooks/pane/terminal-text.ts` | Mod only. Text drawn as styled spans: terminal word wrapping, the cut to a line limit with an ellipsis in both looks, and the glyph columns that draw tree lines and the selection bar. |
| `hooks/pane/pane-selection.ts` | Mod only. The fold kinds, each tab's row ids, closed lines, Undo's scroll, and the keys that hold a settled layout and its scroll. The shared controller keeps the shown tab and each tab's cursor. |
| `hooks/pane/pane-keys.ts` | Mod only. Row buttons and their keys: the `Action` type, each PR press's key, button glyphs, which element takes focus, a reply field's key, and the text a failed copy shows. |
| `hooks/mod/mod-delivery.ts` | Mod only. Matches each prompt row Claude Code stores to the message a press sent, so the press reads as delivered. It also settles a message another plugin rewrote, and adds back, as uncertain, a queued message's sent record that an older build lost. |
| `hooks/mod/mod-ui.ts` | Mod only. The mod's side of the shared controller: each look's `LookConfig`, the host facts it reads from the drawn session, running a batch of events through `reduceUi`, which wakes read the view again, the terminal's Undo steps, the open the engine reports before `/inbox` does, and the conversion of an older build's pane fields into the controller's state. |
| `hooks/mod/mod-demo-press.ts` | Mod only. A press on the sample: it changes the sample copy, sends nothing, and gives the message the stand-in agent answers. |
| `hooks/mod/mod-records.ts` | Mod only. What the mod tracks about tool calls, subagents, workflows and Herdr delegates. That includes which calls ran, and the child a finished Agent or Workflow call ended or started. Also the text a permission dialog shows for a tool call. |
| `hooks/mod/mod-herdr.ts` | Mod only. Reports the drawn conversation to the Herdr pane or app terminal the session runs in. In an app terminal it publishes the session first, moving and removing files with `mv` and `rm` because the engine has no call for either. `delegatesAsked` asks Herdr or `hc` about the session's delegates. `listenForHerdrPresses` follows the terminal's `inbox.press` label with `hc events` and applies the presses the look writes while the session's published file names this terminal. `openInHerdr` opens the Herdr look beside the terminal for `/inbox` and the band's Open inbox press. |
| `hooks/mod/mod-old-fields.ts` | Mod only. `sessionFromOldFields` builds the session from the separate store fields an older build kept, for a hot reload into this build. `register.tsx` reads the fields, because the engine reads a state key only where the hooks module names it. |
| `hooks/mod/mod-plugin-files.ts` | Mod only. Paths in the mod's own folder: the comparison page template and the next-build mark. |
| `hooks/mod/mod-commands.ts` | Mod only. How the mod runs commands and where. `sessionFolder` reads the session's folder from `$.session.root()` before each command and gives null for a folder that is gone, so no command starts in it. `placeChange` saves that folder and its branch as the session's place, and replaces a saved folder the session moved away from or that is gone. `runOf` turns `$.process.run` into the shared `Run`. |
| `hooks/mod/mod-engine-calls.ts` | Mod only. Adapters from the engine's `fs`, `process` and `env` to the Status call records and the configuration folder. |
| `hooks/mod/mod-pr-queue.ts` | Mod only. `queuePrFetch` runs the session's PR fetches one at a time and folds a fetch asked for while one runs into the next. `isPrFetchBusy` says from memory whether one runs or waits, which the poll reads because the saved `isFetching` stays set when the save that clears it fails. |
| `hooks/mod/mod-pr-shared.ts` | Mod only. `prSharedStore`: the views and the limit error every Claude Code session shares, in one engine store key. `dropUnreadSharedViews` drops each view read `PR_SHARED_MS` or longer ago, which no fetch takes in place of a read, to make room in a full store. |
| `hooks/mod/mod-state.ts` | Mod only. The values the hooks module keeps between events, in three holders: `paneState` for the drawn pane, `sessionState` for the conversation the session runs, and `mod` for the rest of the process. A reload that runs the modules again resets them. |
| `hooks/pane/tabs-client.tsx` | Mod only. A Client region for the desktop tab bar, so each tab takes clicks over its whole shape. |
| `hooks/pane/row-client.tsx` | Mod only. A Client region for a closed row in the desktop pane. |
| `hooks/pane/fold-keys.ts` | Mod only. The keys a fold line draws under, for an Asks group's Closed fold and a Status done fold, which a desktop click and hover come back with, and the upgrade of the saved Asks folds. |
| `hooks/pane/parent-client.tsx` | Mod only. A Client region for a Status parent's name line on desktop, which folds or opens its rows on a click anywhere on the line. |
| `hooks/pane/fold-client.tsx` | Mod only. A Client region for a desktop fold line: "N closed" on Asks and "N done" on the Status. |
| `hooks/pane/links-client.tsx` | Mod only. A Client region for an open row's follow-ups on desktop. |
| `hooks/pane/press-client.tsx` | Mod only. A Client region that takes a click over its whole shape and tints under the pointer. Undo uses it on desktop. |
| `hooks/pane/desktop-metrics.ts` | Mod only. How wide the desktop pane draws text: characters per column, each character's width in points, a Button's padding, and line wrapping. |
