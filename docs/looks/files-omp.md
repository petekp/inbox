# Files: omp

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `omp/src/host.ts` | omp host. The only file that imports omp's packages. It binds the calls that need omp's types into a `HostContext`, and wires omp's events to the handlers in the `host-*.ts` files. It also registers the `record` and `close` tools and the `/inbox` command, and shows the band and the panel. |
| `omp/src/host-context.ts` | omp host. `HostContext`, what `createInbox` holds for the handler files, including each live session's controller state, and `OmpContext`, the part of omp's context they read. |
| `omp/src/host-sessions.ts` | omp host. The session calls the handler files share: saving a change, omp's `SessionHost` and update host, catching up over the branch, and the PR and Herdr checks when due. |
| `omp/src/host-presses.ts` | omp host. `ompPresses`: in a Herdr app terminal, watches the shown session's press folder and applies each press the Herdr look writes. |
| `omp/src/herdr-log.ts` | omp host. `herdrLog`, the log of why a Herdr report, press or command log change failed. |
| `omp/src/registry.ts` | omp host. `registryFiles`: Node's file calls for the session registry entry, which `omp/src/host-sessions.ts` writes on each change to the session omp shows and removes when omp shows another or shuts down. |
| `omp/src/preview-pages.ts` | omp host. `ompPreviewPages`: the previews pages through `core/runtime/preview-pages.ts` with Node's file calls, which `omp/src/host-sessions.ts:changeByTool` writes after each inbox tool call. |
| `omp/src/clipboard.ts` | omp host. `copyToClipboard`: puts a copy press's text on the clipboard with the first command from `core/runtime/clipboard-commands.ts` that runs. |
| `omp/src/pid.ts` | omp host. `isPidRunning`, which the command log and the session registry use to tell whether a process runs. |
| `omp/src/command-log.ts` | omp host. `ompCommandStore`: a session's command log, in `<id>.commands.json` beside its state, with changes ordered in process. |
| `omp/src/host-herdr-ask.ts` | omp host. `ompHerdrAsk` keeps the question before omp installs the inbox's Herdr mod: it asks after a start that found no answer, checks every `PRESS_POLL_MS` whether another session answered, runs an Install or Don't install press, and shows the question again for `/inbox herdr`. |
| `omp/src/host-turns.ts` | omp host. The handlers for omp's session and turn events: a session's start and shutdown, a prompt's arrival, the reply, and the turn's end. |
| `omp/src/host-activity.ts` | omp host. The handlers for the main agent's activity: subagent frames, tool calls, and bash calls that wait on Herdr delegates. |
| `omp/src/host-send.ts` | omp host. `agentSender`: sends a message to the agent through omp's `sendUserMessage`, returns why omp refused it, and clears the editor of the text omp hands back. It imports no omp package. |
| `omp/src/host-panel.ts` | omp host. The `Inbox` calls the panel makes on the host, and the live source the panel draws from. |
| `omp/src/omp-messages.ts` | omp host. Reads omp's messages and session branch: a message's text, why a turn stopped, the conversation as turns, and the line under a `record` or `close` call. |
| `omp/src/tool-calls.ts` | omp host. What an omp tool call and its result say: the call's activity line, an `ask` call's questions from either input shape, and how an `ask` dialog ended. It imports no omp package. |
| `omp/src/ask-form.ts` | omp host. Reads the questions and options of the HTML form omp's `ask` tool takes from 18.18.3 on, following omp's own form parser, which `omp/tests/ask-form.spec.ts` compares it with. It imports no omp package. |
| `omp/src/ask-form-dom.ts` | omp host. Reads form HTML into elements, closing tags as omp's HTML reader does. It imports no omp package. |
| `omp/src/ask-form-entities.ts` | omp host. Decodes the named entities and numeric references omp's HTML reader decodes. It imports no omp package. |
| `omp/src/state.ts` | omp host. One JSON file per session under omp's agent folder, with a lock held in the process. `OmpState` extends the shared `Session` with the panel's kept controller state. `upgraded` converts older files. |
| `omp/src/question-history.ts` | omp host. The question history's file calls through `node:fs`, and the sessions omp keeps, which seed its first history files. `createInbox` turns the history on from `HostDeps.questionHistory`. |
| `omp/src/commands.ts` | omp host. Opens links and paths for omp's `SessionHost`. |
| `omp/src/theme.ts` | omp host. Maps the panel's styles onto omp's theme. |
| `omp/src/panel-view.ts` | omp host. Hands omp the panel as a pi-tui `canvas` node on omp 19.2 and as a rows object on omp 18, as the installed pi-tui's exports show. |
| `omp/src/inbox-model.ts` | omp host. Picks the model for the inbox's calls from the person's providers. |
| `omp/src/texts.ts` | omp host. The `OMP` host names the shared guidance uses. |
| `omp/src/panel.ts` | omp adapter. The panel's ui state, which is the shared controller's `UiState` plus the panel's focus, scroll and open row, its `LookConfig`, the screen it draws, and `drawPanel` and the band. It and the `panel-*.ts` files import no omp package. |
| `omp/src/panel-lines.ts` | omp adapter. The `Line` and `Entry` types, the lines for rows, buttons and Closed groups, and which button of a line or a Status target has focus. `withUnshownPress` draws a press from its key until the view shows it. |
| `omp/src/panel-entries.ts` | omp adapter. Each tab's entries: the Asks and Finds groups, the stop line, the PRs tab, the Status page and Help. |
| `omp/src/panel-keys.ts` | omp adapter. `handleKey`, which maps each key to controller events and the panel's own focus and scroll, `applyEvents`, which runs them through `reduceUi`, and `selectedLine`, the line the cursor draws on. |
| `omp/src/panel-text.ts` | omp adapter. Measures, cuts and wraps text that holds ANSI styles. |
| `omp/src/panel-ask-tree.ts` | omp adapter. An open row's Holds up line, context and option lines as ├─, └─ and │ lines. |
| `omp/src/panel-draw.ts` | omp adapter. Draws a line with its marks and buttons, and a banner in its box. |
| `omp/src/panel-page.ts` | omp adapter. Draws the Status page's rows: the columns they sit at, the tree, stall words, rules and buttons. |
| `omp/src/panel-goal.ts` | omp adapter. Draws the Status page's goal section: its heading, the goal or the line that says none is set, its buttons, its text field, the Now line and the milestones. |
| `omp/src/panel-tabs.ts` | omp adapter. The tab bar, the footer and scrolling. |
| `omp/src/controller.ts` | omp adapter. The open panel: the cached screen, the controller state, the commands it runs, and the one wake timer `nextWakeAt` sets. |
| `omp/src/demo.ts` | omp host. Turns the shared demo data into a panel source for `/inbox demo`. |
| `omp/build.ts` | omp host. Bundles `omp/src/host.ts` and the shared modules into `omp/dist/host.js`. `--check` fails when the bundle is stale. |
| `omp/dist/host.js` | omp host. The committed bundle, which `omp/package.json` lists under `omp.extensions`. |
| `omp/package.json` | omp host. The plugin's version, `omp.extensions`, and the build, check, test and type scripts. |
| `.omp-plugin/marketplace.json` | omp host. The omp marketplace, which points at `omp/`. omp reads it before `.claude-plugin/marketplace.json`, which Claude Code reads. |
