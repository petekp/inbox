# Files: Codex

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `codex/src/tab.tsx` | Codex adapter. Draws the tab and runs page code: polling, selection, keys and clipboard. |
| `codex/src/row-actions.tsx` | Codex adapter. Maps shared actions to buttons and draws reply fields. Its production components have mounted tests. |
| `codex/src/tab.html` | Codex adapter. The tab's styles and page shell. |
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
| `codex/src/transcript.ts` | Codex host. Reads the Codex session transcript, which Codex calls the rollout. Finds a chat's rollout and reads its tail and history. |
| `codex/src/rollout-rows.ts` | Codex host. The rollout's row types and the readers of a row's payload and text. Also reads the first row, `session_meta`. |
| `codex/src/rollout-turns.ts` | Codex host. Finds the turns in the rollout's lines: a turn's dialogs, commands and plan, the conversation, and where each turn starts and ends. |
| `codex/src/rollout-commands.ts` | Codex host. Reads the shell commands, patches and tool calls in rollout rows, and words them as activity lines. |
| `codex/src/run.ts` | Codex host. Runs a command with Node. |
| `codex/src/cli.ts` | Codex host. Finds the codex binary the app runs. The hooks, the server and the update process share it. |
| `codex/src/dialogs.ts` | Codex host. Notes the dialogs a Codex turn opened, and words an inbox answer in the dialog's reply form. |
| `codex/src/history.ts` | Codex host. On the first sight of a session, takes a forked chat's ledger from its parent, or marks a session with earlier turns `behind`. At each later hook, marks it `behind` when the rollout holds turns that ended after `coveredTurn`, the newest turn the inbox covered. |
| `codex/src/hook-trust.ts` | Codex host. Whether Codex trusts the inbox's hooks, from the hooks Codex lists. |
| `codex/src/detached-update.ts` | Codex host. Starts the update in a detached process, so a long model call still finishes. |
