# Files: omp

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `omp/src/host.ts` | omp host. The only file that imports omp's packages. It binds the calls that need omp's types into a `HostContext`, and wires omp's events to the handlers in the `host-*.ts` files. It also registers the `record` and `close` tools and the `/inbox` command, and shows the band and the panel. |
| `omp/src/host-context.ts` | omp host. `HostContext`, what `createInbox` holds for the handler files, and `OmpContext`, the part of omp's context they read. |
| `omp/src/host-sessions.ts` | omp host. The session calls the handler files share: saving a change, omp's `SessionHost` and update host, catching up over the branch, and the PR and Herdr checks when due. |
| `omp/src/host-turns.ts` | omp host. The handlers for omp's session and turn events: a session's start and shutdown, a prompt's arrival, the reply, and the turn's end. |
| `omp/src/host-activity.ts` | omp host. The handlers for the main agent's activity: subagent frames, tool calls, and bash calls that wait on Herdr delegates. |
| `omp/src/host-panel.ts` | omp host. The `Inbox` calls the panel makes on the host, and the live source the panel draws from. |
| `omp/src/omp-messages.ts` | omp host. Reads omp's messages and session branch: a message's text, why a turn stopped, the conversation as turns, and the line under a `record` or `close` call. |
| `omp/src/tool-calls.ts` | omp host. What an omp tool call and its result say: the call's activity line, and how an `ask` dialog ended. It imports no omp package. |
| `omp/src/state.ts` | omp host. One JSON file per session under omp's agent folder, with a lock held in the process. `OmpState` extends the shared `Session`. |
| `omp/src/commands.ts` | omp host. Opens links and paths for omp's `SessionHost`. |
| `omp/src/theme.ts` | omp host. Maps the panel's styles onto omp's theme. |
| `omp/src/texts.ts` | omp host. The `OMP` host names the shared guidance uses. |
| `omp/src/panel.ts` | omp adapter. The panel's ui state, the screen it draws, and the calls the controller makes: `render`, `drawPanel`, the band, and whether the view animates. It and the `panel-*.ts` files import no omp package. |
| `omp/src/panel-lines.ts` | omp adapter. The `Line` and `Entry` types, and the lines for rows, buttons and Closed groups. |
| `omp/src/panel-entries.ts` | omp adapter. Each tab's entries: the Asks and Finds groups, the stop line, the PRs tab, the Status page and Help. |
| `omp/src/panel-keys.ts` | omp adapter. Selection, button focus and `handleKey`, which maps each key to a ui change or a press. |
| `omp/src/panel-text.ts` | omp adapter. Measures, cuts and wraps text that holds ANSI styles. |
| `omp/src/panel-draw.ts` | omp adapter. Draws a line with its marks and buttons, and a banner in its box. |
| `omp/src/panel-page.ts` | omp adapter. Draws the Status page's rows: the tree, stall words, rules and buttons. |
| `omp/src/panel-tabs.ts` | omp adapter. The tab bar, the footer, scrolling, and the tab the panel moves to as rows arrive. |
| `omp/src/controller.ts` | omp adapter. The open panel: the cached screen, the person's ui state, the work a key starts, and the redraw timer. |
| `omp/src/demo.ts` | omp host. Turns the shared demo data into a panel source for `/inbox demo`. |
| `omp/build.ts` | omp host. Bundles `omp/src/host.ts` and the shared modules into `omp/dist/host.js`. `--check` fails when the bundle is stale. |
| `omp/dist/host.js` | omp host. The committed bundle, which `omp/package.json` lists under `omp.extensions`. |
| `omp/package.json` | omp host. The plugin's version, `omp.extensions`, and the build, check, test and type scripts. |
| `.omp-plugin/marketplace.json` | omp host. The omp marketplace, which points at `omp/`. omp reads it before `.claude-plugin/marketplace.json`, which Claude Code reads. |
