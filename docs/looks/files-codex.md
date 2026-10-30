# Files: Codex

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `codex/src/tab.tsx` | Codex adapter. The tab's entry: `App`, `draw`, the key and pointer listeners, and the start that connects to Codex. |
| `codex/src/tab-state.ts` | Codex adapter. The page's state. `tabState` holds each value that more than one tab file sets, and the file also holds the shared maps and sets and the row types. |
| `codex/src/tab-host.ts` | Codex adapter. The bridge to Codex: timers, `request` and `callTool`, the message listener, the host's theme, and `dispose`. |
| `codex/src/tab-motion.ts` | Codex adapter. Row motion: measured heights, the animation each row state starts, folds, and the draws that end a move. |
| `codex/src/tab-selection.ts` | Codex adapter. The shown tab and its open row: switching tabs, following arrivals, and opening and selecting rows. |
| `codex/src/tab-swap.ts` | Codex adapter. The swap to the server's newer page, and the state the old page hands to it. |
| `codex/src/tab-read.ts` | Codex adapter. Reads the view and applies it, and sends the replies and discards the server holds with each request. |
| `codex/src/tab-press.ts` | Codex adapter. The parts of a press that need no rows: copying its text, checking whether it was sent, and starting or dropping a reply. |
| `codex/src/tab-rows.tsx` | Codex adapter. Each tab's rows, built from the view, and `act`, which sends a press. `act` and the row builders call each other, so they share a file. |
| `codex/src/tab-parts.tsx` | Codex adapter. Parts several views draw: marks, group titles, banners, key buttons, the Undo place, inline text, and a row's feedback. |
| `codex/src/tab-list.tsx` | Codex adapter. A list's rows: the motion state of each, the row line, its open panel, and settled rows with Undo. |
| `codex/src/tab-groups.tsx` | Codex adapter. The Asks and Finds tabs: their groups, empty lines and Closed folds. |
| `codex/src/tab-prs.tsx` | Codex adapter. The PRs tab: PR blocks, their keys, the order lines, and settled PRs. |
| `codex/src/tab-status.tsx` | Codex adapter. The Status tab and the fitting of its names and lines to the width. |
| `codex/src/tab-chrome.tsx` | Codex adapter. The tab bar, the footer's status, Help, and the demo toggle. |
| `codex/src/row-actions.tsx` | Codex adapter. Maps shared actions to buttons and draws reply fields. Its production components have mounted tests. |
| `codex/src/tab.html` | Codex adapter. The tab's page shell. `codex/build.mjs` replaces each `/*TAB_CSS:name*/` line with `tab-css/name.css`, so the shell sets the order the styles apply in. |
| `codex/src/tab-css/` | Codex adapter. The tab's styles, one file per concern. |
| `codex/src/rows.ts` | Codex adapter. The motion state machine for rows. |
| `codex/src/arrivals.ts` | Codex adapter. The tab's rows, tabs and empty-tab rule, built on `hooks/arrivals.ts`. |
| `codex/src/settle.ts` | Codex adapter. Polling, the settled rows the tab draws, and how long the tab offers Undo. |
| `codex/src/texts.ts` | Codex adapter. Texts only Codex reads, and the `CODEX` host. |
| `codex/src/core.ts` | Codex host. Codex bindings over `hooks/session.ts`, the tab view and tab helpers. |
| `codex/src/data-dir.ts` | Codex host. The data folder and the dev build, which the loader reads. It imports no shared module, so a shared-module change leaves the loader's bundle unchanged. |
| `codex/src/state.ts` | Codex host. One JSON state file per session, under a lock. `SessionState` extends the shared `Session` from `hooks/session.ts`. |
| `codex/src/host.ts` | Codex host. `codexStore`, the Codex store that `hooks/session-host.ts` runs on. |
| `codex/src/server.ts` | Codex host. The MCP server: tools, and the host bindings for presses, open, queue and the background fetch of the session's PRs, which run in `hooks/session-host.ts`. |
| `codex/src/server-main.ts` | Codex host. The loader that Codex starts once per app launch. |
| `codex/src/server-handler.ts` | Codex host. The request handler the loader reloads. |
| `codex/src/update.ts` | Codex host. Binds `hooks/session-host.ts` update flows to `codex exec`. Saves a failed call as the session's `lastModelFailure`. |
| `codex/src/update-main.ts` | Codex host. Entry point for the update process. |
| `codex/src/hook.ts` | Codex host. The hook logic that changes session state. |
| `codex/src/hook-main.ts` | Codex host. Entry point for the hooks. |
| `codex/src/demo.ts` | Codex host. Turns the shared demo data into a session. |
| `codex/src/transcript.ts` | Codex host. Reads the Codex session transcript. |
| `codex/src/run.ts` | Codex host. Runs a command with Node. |
| `codex/src/cli.ts` | Codex host. Finds the codex binary the app runs. The hooks, the server and the update process share it. |
| `codex/src/dialogs.ts` | Codex host. Notes the dialogs a Codex turn opened, and words an inbox answer in the dialog's reply form. |
| `codex/src/history.ts` | Codex host. On the first sight of a session, takes a forked chat's ledger from its parent, or marks a session with earlier turns `behind`. At each later hook, marks it `behind` when the rollout holds turns that ended after `coveredTurn`, the newest turn the inbox covered. |
| `codex/src/hook-trust.ts` | Codex host. Whether Codex trusts the inbox's hooks, from the hooks Codex lists. |
| `codex/src/detached-update.ts` | Codex host. Starts the update in a detached process, so a long model call still finishes. |
