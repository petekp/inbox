# Adding a host

A host is a program that runs the inbox's agent: it reacts to events, keeps state, runs the inbox model and the presses. It supplies a `SessionHost`, calls the shared session functions on its events, and draws a look. `omp/` is the example, and `docs/plans/omp-look.md` records how it was built.

## What a host supplies

`SessionHost` in `hooks/session-host.ts` is everything a host provides to run one session. Each shared function takes only the members it uses.

| Member | What the host does |
| --- | --- |
| `now` | The clock. |
| `read`, `update` | Read the session, and change it under a lock. An external effect, such as a delivery, runs outside the change. |
| `exclusive` | Runs the per-reply update unless another run holds the session. |
| `catchUp` | Optional, on the update host. Has the inbox model read the whole conversation and returns its ledger answer and the Status call to make, the conversation it reads and the `ask` that sends it, which `runUpdates` runs once the catch-up has applied, or says the conversation is unreadable. Without it, a host only runs the pending exchanges. The mod forks the conversation, and Codex and omp pass their conversation text to `askOverConversation`. |
| `ask` | Calls the inbox model with a prompt and the system text for it, and returns null when it fails. It tells its optional `report` the model it asked for, the model that answered when the host knows, and why a call gave no answer. `runUpdates` calls it twice for a reply, one after the other: the ledger call with `systemText` and `buildPrompt`, whose update applies at once, then the Status call with `STATUS_SYSTEM` and `statusPrompt`, whose answer `hooks/session-status.ts:appliedStatus` writes to the ledger. |
| `inOrder` | Required on the update host. Runs a Status call after the earlier ones for the session have finished, so each reads the Status the one before wrote. The mod and omp chain them in process. Codex chains calls in process, then takes a `.results` file lock, which waits up to 8 minutes. The lock does not queue across processes, so Status calls waiting in two update processes can run in either order. That needs a second update process to start while the first still waits on its Status calls. No ledger call and no lock waits on it. |
| `background` | Optional, on the update host. Keeps Status calls running after `runUpdates` returns, so the next ledger update starts at once. The mod and omp pass it. Codex omits it, so its detached update process stays until the calls end. |
| `records` | Optional, on the update host. Where a next build keeps its Status call records: the host, the folder, the session, and the file calls that write, list and remove them. A release build passes none. |
| `deliver` | Sends a message to the agent as if the person typed it. |
| `isDeliveryHeldUntilRun` | Optional. True when `deliver` returns only once the message runs, which can be a whole turn later. Until then the press reads Queued. The mod sets it. |
| `prepare` | Throws when `deliver` could not start, before a sent record is saved. |
| `perform` | Opens a link or path, or copies text. Returns why it could not, or null. |
| `refreshPrs` | Fetches the session's PRs, and resolves once that fetch ends. `startPress` calls it for a press's `refresh-prs` effect, and before a fix press sends. |
| `gh` | Finds gh, drops the one it kept, runs gh for the session, and reports when none starts. |
| `settleWindowMs`, `newId` | The settle window before Done tells the agent, and delivery ids. |
| `answerMessage` | Optional. Builds the message an answer press sends when the agent reads answers in its own form. Codex sets it for a question linked to an open dialog. |
| `comparePage` | The absolute path of the host's copy of the comparison page template, which the Compare message names. |

A host reports a running turn by calling `hooks/session-turns.ts:turnStarted` and `turnEnded`, which set `presence.isTurnRunning`. A running turn holds a Done message back and moves a working subject's mark on the Status.

The host's state type extends `Session` from `hooks/session.ts`. It adds its own fields, and upgrades a state saved by an earlier build, as `omp/src/state.ts:upgraded` does.

## What a host calls on each event

| Event | Shared function |
| --- | --- |
| Session start or resume | `hooks/session-turns.ts:startContext` gives the guidance and carried items. `hooks/session-turns.ts:cleared` empties a session after a clear. A session with turns the inbox never recorded (`hooks/session-status.ts:isUnseen`) is marked `behind`, and its first update catches up. |
| A prompt reaches the agent | `hooks/session-turns.ts:notePrompt` records it, matches a press's message, and returns the notes to add beside the prompt. |
| The person sends a message they typed | `hooks/session-turns.ts:messageTyped` saves its time, and the rows that settled before it fold. A host never calls it for a message a press sent. |
| The agent uses a tool | `hooks/catch-up-text.ts:toolActivity` and `hooks/session-turns.ts:noteActivity` add a line of turn activity. |
| The agent calls `record` or `close` | `hooks/session-presses.ts:recorded`, with the answer from `hooks/tools.ts`: the text the agent reads, and the person's line, which the host draws under the call. |
| A turn ends | `hooks/session-turns.ts:endTurn` queues the exchange. Then `hooks/session-host.ts:runUpdates` runs the inbox model on it, or catches up when `needsCatchUp` says the ledger may have missed a turn, and `hooks/host-press.ts:wakeForDone` tells the agent about rows closed with Done. |
| The person presses a button | `hooks/host-press.ts:press` applies it, saves a sent record before delivery, delivers, and runs local effects. |
| The PRs tab opens | `hooks/host-prs.ts:fetchPrs` fetches through the host's gh. |
| A look draws | `hooks/session-view.ts:sessionView` builds the view. |

## The Host names

`Host` in `hooks/model-text.ts` names the agent, the surface the person sees, the band if there is one, where findings show, and the tools the agent calls, `recordTool` and `closeTool`. Its `intro` is the first paragraph of `guidanceText`. omp's is `omp/src/texts.ts:OMP`, and its tools are `record` and `close`. The Claude Code mod's are `mcp__inbox__record` and `mcp__inbox__close`, since an MCP server's name prefixes its tools.

## Files to add

| Add | In omp |
| --- | --- |
| The host, the only file that imports the agent's packages | `omp/src/host.ts` |
| State storage | `omp/src/state.ts` |
| The `Host` names | `omp/src/texts.ts` |
| The look's drawing, which imports only shared modules | `omp/src/panel.ts`, `omp/src/controller.ts` |
| A demo source | `omp/src/demo.ts` |
| Tests: the shared session script, the panel, the state and the host's events | `omp/tests/` |
| A bundle, when the agent installs a plugin by copying only its folder | `omp/build.ts`, `omp/dist/host.js` |
| The plugin's manifest and marketplace entry | `omp/package.json`, `.omp-plugin/marketplace.json` |

## Where else to register a host

1. `Look` in `hooks/rows.ts` gains the new value. Name the places that branch on it, as `isTerminalLike` does for the terminal's handles.
2. `scripts/check-structure.mjs` checks the host's imports. omp's rule is that its files import only shared modules, and that one file imports the agent's packages.
3. `scripts/check.sh` runs the host's bundle check, type check and tests.
4. `evals/agent.ts` gains the agent, with a stand-in for the inbox that uses the real tool descriptions, as `evals/omp-probe.ts` does for omp. `scripts/eval.sh` passes it through.
5. The tests run `tests/session-script.ts` against the host's `SessionHost`, as `omp/tests/session.spec.ts` does. The script drives a prompt, a `record` call, a turn end, the inbox model's answer, a press that sends, its arrival, Done and Undo. It calls the shared functions directly, so the host's event wiring needs its own tests.
6. `ClientId` in `hooks/clients.ts` gains the host. Classify every `FeatureId` for it as `full`, `different` or `unsupported`, check each against the host's code, and give each `different` or `unsupported` entry a reason that is a real host limit or a product decision. Add the host to `DIFFERENCE_TABLES` in `scripts/check-structure.mjs`, with a table in "Differences on purpose" in [the look map](looks.md) that has a row for each of those features.
7. The docs rows: the look map's Files table, owners table, Differences on purpose and "After you change X"; `GLOSSARY.md`; `AGENTS.md`; the README's install steps; and `docs/release.md` for the version field and the build.
