# Inbox

The inbox of your coding agent, drawn in a Herdr pane beside its terminal. It lists what the agent is waiting on you for, what it found along the way and your pull requests. You answer from the pane, and the agent gets each answer as your next message.

![Inbox](preview.png)

## Before you add it

The mod only draws. The inbox itself runs inside Claude Code, Codex or omp and writes the session the mod reads. Install the inbox in one of them first, as the [README](../README.md#install) describes. Without it, the pane says there is no inbox in the terminal.

The mod reads and writes files and runs two programs, all on this computer:

- It reads the session file the inbox writes under `<app home>/inbox/sessions/`.
- It writes press files, collapse files and look reports under `<app home>/inbox/presses/<session id>/`, and sets a label on the terminal that wakes the agent's host to read them.
- It runs `hc` to set that label, and the macOS `open` command for an Open button. Copy writes to the clipboard.
- It makes no network request. The pull request list comes from `gh`, which the agent's host runs.

You do not need to copy the mod yourself. When a host starts in a Herdr terminal and the mod is missing, the inbox asks "Install the inbox's Herdr mod?". Claude Code and omp ask in their own inbox, and the ChatGPT app asks in its Inbox tab. Install copies `main.js` and `mod.json` into `<app home>/mods/inbox/`. Each later start replaces an older copy. A `mods/inbox` that is a link, or a folder that holds no inbox build, is never written.

To copy it yourself, put this folder's `mods/inbox/` into `<app home>/mods/`.

The mod has no place in any layout. Type `/inbox` in Claude Code or omp to open it beside the terminal. Anywhere else, split a pane for it:

```
herdr-app do pane.split '{"direction":"right","pane":"<pane id>","mod":"inbox"}'
```

Take the pane id from `herdr-app ls`. The Codex CLI has no `/inbox`, so use this command there.

## What you see

One panel with a row of tabs at the top and a scrolling list below it.

- Status shows the goal, its milestones and what is open, running and finished.
- Asks shows each question and task the agent is waiting on, with a button for every answer.
- Finds shows what the agent noticed and left for you, such as a bug or a follow-up.
- PRs shows your pull requests with their checks and review threads, and a Refresh button.
- Help replaces the tabs with the keys and the marks.

Asks, Finds and PRs show a count.

## How it behaves

- The panel shows the inbox of the terminal you last focused in its tab, and keeps it while the panel itself has focus. A shell terminal reads "No inbox in this terminal", and an ended session reads as ended.
- A button press writes a file for the host. The host applies it and the row shows its result. A button you press disappears until the agent has your answer, and a press nobody takes within 15 seconds reads as not applied.
- ← and → switch tabs, `j` and `k` move between rows, `z` folds a row, `u` undoes the last close, and Escape gives the keys back to the terminal.
- The mod reads the session again when its folder changes and every 10 seconds, and redraws ages each minute.
- It takes its colors from Herdr's theme.

## Built from

- One mod, `mods/inbox/`, with `mod.json` (`{ "place": "none" }`) and `main.js`. Bun builds `main.js` from `herdr/src` and the inbox's shared code in `core/`, so do not edit it. `bun build.ts` in `herdr/` rebuilds it.
- The mod uses `herdr` for focus, panes, terminal labels, folder watching, file reads and writes, `exec` and `hc`, and `gpui-kit` and `gpui-base` for drawing.
- It has no art and no layout.

## Watch out

- Herdr kills a draw that takes 50 ms. The mod builds its list once per read and reuses it, so each draw stays short.
- Herdr does not reload a mod whose folder is a link. Copy the files in as a real folder.
- A host outside a Herdr terminal publishes nothing for the panel, and neither does a host whose terminal also has `HERDR_PANE_ID` set.

## Done when

- `herdr-app check mods/inbox` passes.
- With the inbox running in a Herdr terminal, `/inbox` opens this panel to the right of the terminal.
- Answering a question in the panel gives the agent your answer as a message, and the row shows its result.
- Focusing a second terminal switches the panel to that terminal's inbox.
- The panel draws in Herdr's light and dark themes.
