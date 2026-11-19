# Files: Codex

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `codex/src/tab.tsx` | Codex adapter. The tab's entry: `App`, `draw`, the key and pointer listeners, and the start that connects to Codex. |
| `codex/src/tab-state.ts` | Codex adapter. The page's state. `tabState` holds each value that more than one tab file sets, and the file also holds the shared maps and sets and the row types. |
| `codex/src/tab-host.ts` | Codex adapter. The bridge to Codex: timers, `request` and `callTool`, the message listener, the host's theme, and `dispose`. |
| `codex/src/tab-motion.ts` | Codex adapter. Motion: measured heights, the animation each row state starts, tab widths, folds, and the draws that end a move. |
| `codex/src/tab-panel-fade.ts` | Codex adapter. A row's panel fades: through a list of steps, the parts of a closing panel that fade, and a faint turned-back panel's close. |
| `codex/src/tab-glide.ts` | Codex adapter. The Web Animations each move plays: the spring glide of a height or offset, and fades. |
| `codex/src/tab-title-motion.ts` | Codex adapter. When a row's title swaps between its full and clamped forms while its line grows or shrinks, so one form shows at a time and the line never cuts a line of the title that shows. |
| `codex/src/tab-page-variables.ts` | Codex adapter. The shared spacing scale and motion lengths, set as the CSS variables the tab's styles read. |
| `codex/src/tab-fold-all.ts` | Codex adapter. `foldAllHere` applies a fold-all to the tab's folds through each fold's own toggle, so each animates and saves as a single click would, and `clickFold` turns an Option-click on a fold into a fold-all. |
| `codex/src/tab-title-tint.tsx` | Codex adapter. A row's title in a span whose tint a Web Animation fades from the clock's point, so a row drawn again mid-fade does not start over. |
| `codex/src/tab-line-steps.ts` | Codex adapter. Steps lines that come and go, such as banners and a press's status, through the row states, so a line enters and leaves from its place. |
| `codex/src/tab-status-steps.ts` | Codex adapter. Steps the Status page's lines, the goal's milestones and the lines under the goal's text with `stepLines`. |
| `codex/src/tab-selection.ts` | Codex adapter. The shown tab and its open row: switching tabs, following arrivals, and opening and selecting rows. |
| `codex/src/tab-swap.ts` | Codex adapter. The swap to the server's newer page, and the state the old page hands to it. |
| `codex/src/tab-read.ts` | Codex adapter. Reads the view and applies it, and sends the replies and discards the server holds with each request. |
| `codex/src/tab-press.ts` | Codex adapter. The parts of a press that need no rows: showing the text a failed copy leaves for copying by hand, checking whether it was sent, and starting or dropping a reply. |
| `codex/src/tab-rows.tsx` | Codex adapter. Each tab's rows, built from the view, and `act`, which sends a press. `act` and the row builders call each other, so they share a file. |
| `codex/src/tab-part-gap.ts` | Codex adapter. `partAttrs` names a part of an open row and sets its top padding, and `--above` for the tree's strokes, from `partGap`. |
| `codex/src/tab-ask-tree.tsx` | Codex adapter. An open row's Holds up line, context and option lines as the `.tree` its ◆ starts. |
| `codex/src/tab-parts.tsx` | Codex adapter. Parts several views draw: marks, group titles, banners, key buttons, the Undo place, inline text, and a row's feedback. |
| `codex/src/tab-parted.tsx` | Codex adapter. `Sep`, the ` · ` that leads each part of a `.parted` line, so a part that starts a line hides its dot. Its layout is in `tab-css/parted.css`. |
| `codex/src/tab-list.tsx` | Codex adapter. A list's rows: the motion state of each, the row line, its open panel, and settled rows with Undo. |
| `codex/src/tab-groups.tsx` | Codex adapter. The Asks and Finds tabs: their groups, empty lines and Closed folds. |
| `codex/src/tab-prs.tsx` | Codex adapter. The PRs tab: PR blocks, their keys, the order lines, and settled PRs. |
| `codex/src/tab-pr-steps.ts` | Codex adapter. The motion state of each PR block, PR row, PR group, press line and the tab's own buttons on the PRs tab, through the row states. |
| `codex/src/tab-pr-lines.ts` | Codex adapter. The press status under a PR block's buttons and under the order's changed line. |
| `codex/src/tab-status.tsx` | Codex adapter. The Status tab: the goal and its milestones, a met goal's folded milestones, and the goal's text field. |
| `codex/src/tab-status-line.tsx` | Codex adapter. A Status row with its keys and presses, the done folds' toggle, and the fitting of merged lines to the width. |
| `codex/src/tab-shown.ts` | Codex adapter. The Status subject rows the tab had on screen since its last view request, which the request sends. |
| `codex/src/tab-status-fold.tsx` | Codex adapter. A Status parent's name line as its fold: the chevron after it, the click and keyboard press, and the collapse it sends. |
| `codex/src/tab-status-name.tsx` | Codex adapter. A Status row's name line, cut so that it and its stall word fit the lines it may take. |
| `codex/src/tab-chrome.tsx` | Codex adapter. The tab bar, the footer's status, Help, and the demo toggle. |
| `codex/src/tab-herdr-ask.tsx` | Codex adapter. The question before the tab installs the inbox's Herdr mod, drawn as a banner under the tab bar with Install filled. Each press goes to the server through `inbox_press`, and the press's result stays for `SETTLED_MS`. |
| `codex/src/row-actions.tsx` | Codex adapter. Maps shared actions to buttons and draws reply fields. Its production components have mounted tests. |
| `codex/src/tab.html` | Codex adapter. The tab's page shell. `codex/build.mjs` replaces each `/*TAB_CSS:name*/` line with `tab-css/name.css`, so the shell sets the order the styles apply in. |
| `codex/src/tab-css/` | Codex adapter. The tab's styles, one file per concern. |
| `codex/src/arrivals.ts` | Codex adapter. The tab's rows, tabs and empty-tab rule, built on `hooks/arrivals.ts`. |
| `codex/src/settle.ts` | Codex adapter. Polling, the settled rows the tab draws, and how long the tab offers Undo. |
| `codex/src/list-input.ts` | Codex adapter. The person's presses, keys, scrolls and pointer on the list, which keep a row due to fold in place. |
| `codex/src/undo-key.ts` | Codex adapter. The undo key: presses the Undo the shared rule picks, by the tab's own Undo timing. |
| `codex/src/texts.ts` | Codex adapter. Texts only Codex reads, and the `CODEX` host. |
| `codex/src/core.ts` | Codex host. Codex bindings over `hooks/session-turns.ts`, `hooks/session-status.ts` and `hooks/session-view.ts`, the tab view and tab helpers. |
| `codex/src/data-dir.ts` | Codex host. The data folder and the dev build, which the loader reads. It imports no shared module, so a shared-module change leaves the loader's bundle unchanged. |
| `codex/src/state.ts` | Codex host. One JSON state file per session, under a lock. `SessionState` extends the shared `Session` from `types/index.d.ts`. |
| `codex/src/question-history.ts` | Codex host. The question history's file calls through `node:fs`, and the sessions Codex keeps, which seed its first history files. Each entry point turns the history on with `useQuestionHistory`. |
| `codex/src/host.ts` | Codex host. `codexStore`, the Codex store that `hooks/session-host.ts` runs on. |
| `codex/src/server.ts` | Codex host. The MCP server: `makeServer`, which takes `ServerDeps` and answers each JSON-RPC call. Its `settled` resolves once the PR fetches, their state updates, the prune and the delegate check it started have ended. |
| `codex/src/background.ts` | Codex host. `makeBackground`, which tracks the work the server starts and does not wait for, such as a PR fetch's state update, so `settled` can wait for it. |
| `codex/src/server-tools.ts` | Codex host. The tools and tab page the server lists, the tool fields of the last list it gave, and the readers of a call's session, turn and arguments. |
| `codex/src/server-herdr.ts` | Codex host. `followCodexPresses`: in a Herdr app terminal, the MCP server watches the presses folder and applies the presses for the Codex sessions this terminal publishes. |
| `codex/src/clipboard.ts` | Codex host. Puts a copy press's text on the clipboard of the machine the server runs on, through `hooks/clipboard-commands.ts`, since the tab's frame gets no clipboard permission. |
| `codex/src/server-host.ts` | Codex host. The bindings `hooks/session-host.ts` runs on for presses, opening, sending a press's message and the session's background PR fetch. Also the tab view each answer carries. |
| `codex/src/app-steer.ts` | Codex host. Puts a press's message into a turn the ChatGPT app runs, through the app's IPC socket. The only code that speaks that socket. |
| `codex/src/server-trust.ts` | Codex host. Whether Codex runs the inbox's hooks in a chat's folder. The server asks Codex in the background and caches the answer. |
| `codex/src/server-catch-up.ts` | Codex host. When the inbox has not seen a chat, the chat's first view copies a fork's ledger and starts a catch-up. |
| `codex/src/server-demo.ts` | Codex host. The demo session and its presses. |
| `codex/src/server-main.ts` | Codex host. The loader that Codex starts once per app launch. |
| `codex/src/server-handler.ts` | Codex host. The request handler the loader reloads. |
| `codex/src/update.ts` | Codex host. Binds `hooks/session-host.ts` update flows to `codex exec`. Reports a failed call with its process, which the shared flow saves in `callFailures`. |
| `codex/src/diagnostics.ts` | Codex host. Keeps only the diagnostic lines of a `codex exec` call's stderr, its errors and warnings. |
| `codex/src/update-main.ts` | Codex host. Entry point for the update process. |
| `codex/src/hook.ts` | Codex host. The hook logic that changes session state. |
| `codex/src/hook-main.ts` | Codex host. Entry point for the hooks. |
| `codex/src/demo.ts` | Codex host. Turns the shared demo data into a session. |
| `codex/src/transcript.ts` | Codex host. Reads the Codex session transcript, which Codex calls the rollout. Finds a chat's rollout and reads its tail and history. |
| `codex/src/rollout-file.ts` | Codex host. Reads a rollout file's bytes: its start, or its end before an offset. Streams a rollout Codex compressed with zstd, and keeps the end of a few once read. |
| `codex/src/rollout-rows.ts` | Codex host. The rollout's row types and the readers of a row's payload and text. Also reads the first row, `session_meta`. |
| `codex/src/rollout-turns.ts` | Codex host. Finds the turns in the rollout's lines: a turn's dialogs, commands and plan, the conversation, and where each turn starts and ends. |
| `codex/src/rollout-commands.ts` | Codex host. Reads the shell commands, patches and tool calls in rollout rows, and words them as activity lines. |
| `codex/src/rollout-unran.ts` | Codex host. Finds the tool calls of a turn that did not run, because the person declined them or a hook blocked them, and gives their activity lines and the delegates their herdr commands name. |
| `codex/src/rollout-arrivals.ts` | Codex host. Marks a press arrived when the rollout holds its message as a user message and no prompt hook matched it. A message `codex queue` puts into a running turn can arrive that way. |
| `codex/src/delegate-calls.ts` | Codex host. Keeps each `herdr agent` command's delegate rows as they were before the command, and puts them back when the command did not run. |
| `codex/src/run.ts` | Codex host. Runs a command with Node. |
| `codex/src/shared-daemon.ts` | Codex host. `withoutSharedTerminal` removes `HC_TERMINAL_ID` from a hook's or server's environment when it runs under the Codex app server that no terminal owns, which every Codex CLI started without `--no-daemon` shares. The terminal the environment names is then the one that started the daemon, so the process reports to no terminal and logs why. |
| `codex/src/cli.ts` | Codex host. Finds the codex binary the app runs. The hooks, the server and the update process share it. |
| `codex/src/dialogs.ts` | Codex host. Notes the dialogs a Codex turn opened, and words an inbox answer in the dialog's reply form. |
| `codex/src/history.ts` | Codex host. On the first sight of a session, takes a forked chat's ledger from its parent, or marks a session with earlier turns `behind`. At each later hook, marks it `behind` when the rollout holds turns that ended after `coveredTurn`, the newest turn the inbox covered. |
| `codex/src/hook-trust.ts` | Codex host. Whether Codex trusts the inbox's hooks, from the hooks Codex lists. |
| `codex/src/detached-update.ts` | Codex host. Starts the update in a detached process, so a long model call still finishes. |
| `codex/src/companion-listener.ts` | Codex host. Private socket, explicit chat scope and bounded requests. |
| `codex/src/companion-protocol.ts` | Codex host. The companion request and presentation types. |
| `codex/src/server-companion.ts` | Codex host. Companion access through the existing state and effects. |
| `codex/src/hook-trust-text.ts` | Codex adapter. Shared wording for hook-trust notices. |
