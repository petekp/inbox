# omp look: step 2, the omp host and look

Part of [the omp look plan](../omp-look.md).

Status: built. Merged to main in #5.

## Step 2: omp host and look

omp's code lives in `omp/`. omp runs TypeScript directly, so `omp -e omp/src/host.ts` runs it with no bundle. An installed plugin runs the bundle in step 3.

| File | Role |
| --- | --- |
| `omp/src/host.ts` | omp host. The only file that imports omp's API. It wires omp's events to the shared session modules and supplies the omp `SessionHost`. |
| `omp/src/state.ts` | omp host. One JSON file per session, under a lock held in the process. |
| `omp/src/panel.ts` | omp adapter. Draws the band and the `/inbox` panel from the shared view, and maps keys to presses. |
| `omp/build.ts`, `omp/dist/host.js` | Bundles `src/host.ts` and the shared modules into `dist/host.js`, which is committed. |
| `omp/package.json` | Lists `dist/host.js` under `omp.extensions`, so omp loads it from an installed plugin. |

omp and pi change their extension API often. Keeping every omp import in `host.ts` means a breaking omp release changes one file.

### omp events

| Inbox need | omp event or call |
| --- | --- |
| Guidance in the system prompt | `before_agent_start`, returning `systemPrompt` with `guidanceText(OMP)` added |
| The `inbox:` text beside each prompt | `before_agent_start`, returning a hidden custom message (`display: false`) with `notePrompt`'s notes. The message stays in the session, as the inbox text does in Claude Code and Codex. |
| `record` and `close` | `pi.registerTool`, with the descriptions, schemas and answers from `hooks/tools.ts` |
| Turn activity | `tool_execution_start` events, through `toolActivity`. Not `tool_call`, which omp waits on before every tool runs |
| Turn end | `agent_end`, then `endTurn` and `runUpdates` |
| Send a press's message | `pi.sendUserMessage`, delivered as a follow-up while a turn runs |
| `/inbox` and the band | `registerCommand('inbox')`, `ctx.ui.custom` for the panel, `ctx.ui.setWidget` above the editor for the band |
| PRs | `pi.exec('gh', …)` through `fetchTracked` |
| Session id | `ctx.sessionManager.getSessionId()`. A subagent (`ctx.agent.kind` is `sub`) and a session with no UI (`ctx.hasUI` false, as in print mode) are skipped, and their `session_start` takes `record` and `close` out of the active tools. omp 18.1.17 gives an extension no `ctx.agent` and starts a subagent with no UI, so the read of `ctx.agent` is guarded and `hasUI` covers a subagent there. |

### The omp look

The panel follows the throwaway extension's design, rewritten in `omp/src/panel.ts` with tests. It has three tabs: Asks, Finds and PRs. These differ from the terminal look on purpose:

- Enter presses the focused button. A row opens with its recommended option focused.
- ← and → move between a row's buttons, and wrap at either end.
- Tab and Shift+Tab switch tabs, and 1, 2 and 3 pick one.
- ↑ and ↓ wrap from the last row to the first.
- `r` opens the reply field.
- The panel is an overlay opened by `/inbox`, since omp has no side pane.
- Separators and task bullets use omp's `statusLineSep` theme color, so they match omp's own status line.

The button order still comes from `rowKeyPlan`.

### Choices for step 2

These are settled when step 2 starts:

- **The inbox model in omp.** omp's providers come from each person's own setup. Decided: use the person's `@inbox` role when omp can resolve it. Otherwise use a Sonnet model when the person's providers offer one, since the inbox model evals pass on Sonnet. Otherwise use omp's `@smol` model role. The panel says which model runs.
- **Where state lives.** Recommended: a JSON file per session under omp's agent folder, written like Codex's. `pi.appendEntry` is the alternative. It follows `/branch`, but it writes into the session file the agent reads back.

### Check

- The shared session test from step 1, run against the omp `SessionHost`.
- Tests for `omp/src/panel.ts`: button order from `rowKeyPlan`, focus and wrapping, and each row state.
- The agent eval suite with an omp runner, since `guidanceText(OMP)` and the omp tool descriptions are text a model reads. Each run is a paid model call through the person's omp providers.
- Live in omp: a real send through `sendUserMessage` and its arrival, the reply field, Undo and its countdown, the PRs tab, the light theme, a narrow terminal, and the newest omp release.
