# omp look: step 1, the shared session modules

Part of [the omp look plan](../omp-look.md).

Status: built. Merged to main in #5.

## Step 1: shared session modules

### The session modules

Shared modules holding a session's state and the pure changes to it. `Session` is in `types/index.d.ts`. The changes are in `hooks/session-files.ts`, `hooks/session-turns.ts`, `hooks/session-status.ts`, `hooks/session-presses.ts` and `hooks/session-view.ts`.

`Session` holds the fields of `SessionState` in `codex/src/state.ts` that do not depend on Codex:

| Field | What it holds |
| --- | --- |
| `ledger` | Items, closed items and linked PRs |
| `turn` | What the running turn gathered for the per-reply update: the person's words, activity, the press that sent it |
| `told` | The inbox text the agent last read, and the closed items it was told about |
| `presence` | Turns started and applied, ledger state, whether an update runs |
| `pending` | Exchanges waiting for the inbox model |
| `sent` | Messages a press sent, kept until the agent receives them |
| `lastActions` | Each row's last press |
| `heldRows` | Rows held while the person replies |
| `prViews` | The PRs tab's data |

Codex keeps `root`, `home`, `cliPath`, `tabSeenAt` and `heard` in its own `SessionState`, which extends `Session`. `heard` records whether Codex has run the inbox's hooks, which only Codex can skip.

These functions move from the Codex host, and take the host's `Host` names where they now read `CODEX`:

| Function | From | Does |
| --- | --- | --- |
| `cleared` | `core.ts` | Empties a session after `/clear` |
| `startContext` | `core.ts` | The guidance and carried items at session start |
| `notePrompt` | `core.ts` | Records a prompt, matches a press's sent message, returns the inbox text |
| `noteActivity` | `core.ts` | Adds a line of turn activity |
| `endTurn` | `core.ts` | Queues the exchange for the inbox model |
| `applied` | `update.ts` | Applies the inbox model's answer to the oldest exchange |
| `viewOf` | `core.ts` | The view a look draws, without Codex's `heard` |
| `pressOn` | `server.ts` | Applies a row or PR press |
| `completedAttempt` | `server.ts` | Records how a sent message's delivery went |
| the record and close changes | `server.ts` | Applies `recordItem` and `recordClose` |
| `withFetchedPrs` | `server.ts` | Merges fetched PRs into `prViews` |

Whether a look is open is a host fact, so `notePrompt`, `endTurn` and `viewOf` take it as an argument. Codex passes `isTabOpen`.

### `hooks/session-host.ts`

A shared module holding the `SessionHost` type and the async work that runs through it. `SessionHost` is everything a host supplies to run one session. Each function takes only the members it uses. The `Host` names and whether the inbox is open are arguments to the functions in the session modules, not members:

| Member | What the host does | Codex | omp |
| --- | --- | --- | --- |
| `now` | The clock | `Date.now` | `Date.now` |
| `read`, `update` | Read the session, and change it under a lock | a JSON file under a file lock | a JSON file under a lock held in the process |
| `exclusive` | Run the per-reply update while no other run holds the session | the `.updating` file lock | a flag held in the process |
| `ask` | Call the inbox model with the prompt `buildPrompt` writes | `codex exec` | `completeSimple` on a model from omp's registry |
| `deliver` | Send a message to the agent as if the person typed it | `codex queue` | `sendUserMessage` |
| `perform` | Open a link or path, or copy text | `open`, and copies return to the tab | `open`, and the clipboard |
| `prepare` | Throw before a sent record is saved when delivery cannot start | resolves the codex binary | nothing |
| `gh` | Find gh, run it, and report when it cannot start | `ghFinder` and `ghIn` | `pi.exec` |
| `settleWindowMs`, `newId` | The settle window before Done tells the agent, and delivery ids | `SETTLE_WINDOW_MS`, `randomUUID` | the same |

Three pieces of `codex/src/server.ts` and `update.ts` move here and run through a `SessionHost`:

- `runUpdates`: runs pending exchanges through `ask`, oldest first, once a turn ends.
- `press`: the body of `onPress`. It applies the press, saves a sent record before delivery, delivers, and runs local effects.
- `wakeForDone` and the PR fetch.

Codex keeps the MCP server, the tab, the hooks' input parsing, `codex queue` and `codex exec`. Each becomes a member of the Codex `SessionHost` or calls into these functions.

### Check

- The Codex tests in `codex/tests` keep passing unchanged. They are the proof that Codex behaves as before.
- `tests/session-script.ts` drives one scripted session through the shared functions and a `SessionHost`: a prompt, a `record` call, a turn end, the inbox model's answer, a press that sends, the arrival of that message, Done and Undo. It checks the rows, deliveries, turn counts and sent records after each event. `tests/session.test.ts` runs it with the in-memory host in `tests/session-fake-host.ts`. A later host runs it with its own `SessionHost`, which catches a host whose storage, lock or delivery breaks the shared flow. It calls the shared functions directly, so a host's event wiring needs its own tests.
- `scripts/check-structure.mjs` lists the two new shared modules.
