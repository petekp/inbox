# omp 19.2

Checked on 2026-11-25 against `@oh-my-pi/pi-coding-agent` 19.2.1, installed from npm in a scratch folder, and live in tmux on 19.2.1 and 18.12.3. Each live check ran under `env -i` with a fresh `HOME` and a stand-in Messages API server. Source paths are under `@oh-my-pi/<package>/src/` in 19.2.1. Part of [omp.md](omp.md).

## Extension UI

- **A UI factory gets a UI host, not a `TUI` [source 19.2.1].** `ExtensionUiHost` has `requestRender()`, `size()` and `suspend(run)`, and no `terminal` (`pi-coding-agent/src/extensibility/extensions/render-types.ts:ExtensionUiHost`). omp 18's `tui.terminal.rows` throws there, so the panel reads the rows from whichever the factory got (`omp/src/panel-view.ts:screenRows`).
- **A view is a pi-tui node or a rows object [source 19.2.1].** `ExtensionRender` is `JSXNode | ExtensionRows`. A rows object's `handleInput` gets the raw bytes of each key (`render-types.ts:ExtensionRows`).
- **pi-tui's root drops the key parser [source 19.2.1].** `parseKey`, `extractPrintableText` and `truncateToWidth` are gone from `@oh-my-pi/pi-tui`. It exports `jsx` and `signal` instead. A `canvas` node takes `paint(width)`, `onKey(key)` and `onPaste`, and no row it paints may be wider than the view. A key is `{ id, text?, kind, raw }`, and `id` names keys as omp 18's `parseKey` did, such as `shift+tab` and `escape`. So on 19.2 the panel is a `canvas` node that repaints when a signal it reads changes, and on omp 18 it stays a rows object (`omp/src/panel-view.ts:panelView`).
- **`ctx.ui.custom` disposes no node [live 19.2.1].** The panel is disposed when `custom` settles (`omp/src/host.ts:openPanelUi`).
- **The theme says `dark`, not `isLight` [source 19.2.1].** pi-tui's `Theme` has `readonly dark: boolean` (`pi-tui/src/theme/contract.ts:Theme`). Without the change, the panel drew omp's light theme with its dark tones (`omp/src/theme.ts:styleOf`).
- **What still works unchanged [live 19.2.1].** The band's `setWidget` factory, the tools' `renderResult` rows, and the band above an open `ask` form, which reads "omp is waiting for your answer". The panel opens with `/inbox`, Tab and `?` work, Esc closes help and then the panel, and it fits at 60 columns.

## Runs and turns

- **A run that waits on outside work ends its loop with `willContinue` and `awaitingAsyncWork` [source 19.2.1, live 19.2.1 and 18.12.3].** In 19.2, `task` spawns run as background jobs by default. Once the agent has replied, omp sends `agent_end` with both flags while the job runs (`pi-coding-agent/src/session/agent-session.ts:#pauseLoop`). The job's result starts a new loop with `agent_start`, and the run's last loop ends with a plain `agent_end`. 18.12.3 sent the same flags live. The inbox ends the turn at that pause with the agent's reply, and the result starts the next turn (`omp/src/host-context.ts:isRunContinuing`). That loop gets no `before_agent_start`, so the inbox counts its turn at `agent_start` (`omp/src/host-turns.ts:onAgentStart`).
- **A run that ends after a pause with no loop repeats the pause's messages [source 19.2.1].** When the outside work goes away without waking the run, `#checkRun` sends a plain `agent_end` with the paused loop's messages. The inbox ends no turn on it (`omp/src/host-turns.ts:onAgentEnd`).
- **`/new` or a switch during a run sends no `agent_end` [source 19.2.1, live 19.2.1 and 18.12.3].** "Without a following `agent_end`, a transition or dispose abandons it" (`agent-session.ts:#closeRun`). The inbox cuts off the running turn of the session it leaves (`omp/src/host-turns.ts:start`).
- **`/fork` during a run [live].** On 19.2.1, the old session's `agent_end` came before `session_switch`. On 18.12.3, `/fork` did nothing while the agent streamed.
- **A queued follow-up gets its own exchange [live 19.2.1 and 18.12.3].** A message typed while a slow reply ran reached the inbox model as its own exchange, after the one for the reply before it.

## `/clear`

- **`session_clear` fires once the context is reset [source 19.2.1, live 19.2.1].** It is the last step of `resetContext` (`agent-session.ts`), and the session keeps its id. omp's notes date the event to 18.20.1. The inbox resets the session as Claude Code and Codex do at `/clear` (`omp/src/host-turns.ts:onSessionClear`).
- **18.12.3's `/clear` sends no extension event [live 18.12.3].** The command exists there, but the event log showed nothing, so the inbox keeps the cleared conversation's rows.

## Loading, turning off and turning on again

Checked on 2026-11-26 on 19.2.1, live in tmux with a fresh `HOME`, and in its source.

- **The extension's id comes from its file name [source 19.2.1].** omp names a loaded file `extension-module:<name>`. The inbox's `omp/dist/host.js` is `extension-module:host`, so `disabledExtensions: [extension-module:inbox]` turns nothing off.
- **An extension added while omp runs loads at once [live 19.2.1].** An edit to `extensions` or `disabledExtensions` makes omp load what changed. omp sends the session's `session_start` again to an extension it adds, so the band appeared and `/inbox` worked without a restart.
- **Turning an extension off leaves it loaded [live 19.2.1, source 19.2.1].** omp stops calling its handlers, commands and tools: `/inbox` went to the agent as a prompt. It sends no event, and keeps the module, its timers and the widgets it set with `setWidget`. The band "Nothing needed · /inbox to open" stayed on screen. From the source, the inbox's timers and its Herdr press follower (`omp/src/host-presses.ts`) keep running too.
- **Turning it on again resumes the same module [live 19.2.1].** omp never unloads a module, so one band showed and `/inbox` worked, with no second copy.
- **A fresh `HOME` needs `setupVersion: 3` [live 19.2.1 and 18.12.3].** 19.2.1 opens its setup wizard at `setupVersion: 2`. 18.12.3 skips it at 3.
- **Tools marked `essential` never become bash commands [source 19.2.1].** The agent eval's probe registers `record`, `close` and `order_prs` as native tools, and `evals/agent-cli.ts:assertOnlyOmpProbe` stops a run whose tools are not bash and those three.

## In a Herdr app terminal

Checked on 2026-11-26 on 19.2.1 with hc 0.1.22, in a hidden terminal `hc run` made, with a scratch `HOME` and `XDG_STATE_HOME`.

- **Herdr's agent menu starts `omp` with `HC_TERMINAL_ID` set [Herdr app binary, live].** The menu entry runs `["omp"]`, and herdr-core sets `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HC_SCOPE` in each terminal it runs. So the inbox reports to the app terminal (`core/remote/herdr.ts:herdrTarget`).
- **The inbox published its session file and set `inbox.session` on its terminal [live 19.2.1].** `hc` takes its socket path from `XDG_STATE_HOME`. A long scratch path there made `hc` fail with "the socket path … is too long here (121 bytes; this system allows 103)", which the inbox logged to `herdr.log`.
