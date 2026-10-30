# A shared session core, then omp as the third host

Status: built. Merged to main in #5.

omp ([omp.sh](https://omp.sh/)) is a terminal coding agent forked from pi. It loads TypeScript extensions in its own Bun process. A throwaway extension showed that the shared modules in `hooks/` load in omp unchanged, and that omp can draw the band above the prompt and an `/inbox` panel and take its keys. That extension drew the shared demo data only. It never ran a real session.

A host does more than draw. It reacts to the prompt, tool-call and turn-end events, keeps each session's state, runs the inbox model after each reply, runs a press's sends, opens and copies, and runs gh. That work is written twice today: in the mod's `hooks/register.tsx`, and in the Codex host's `codex/src/core.ts`, `hook.ts`, `server.ts` and `update.ts`. omp would make a third copy, and each later feature would be wired three times. So the shared part of that work moves into `hooks/` first, and omp is built on it.

## Order

1. Move the Codex host's session logic into shared modules. Codex runs on them with no change in behavior.
2. Build omp as a host and a look on those modules.
3. Add omp to the repo's checks, docs and release steps, and write down what a new host supplies.
4. Move the mod onto the shared session modules.

Each step passes `./scripts/check.sh` and leaves the shipped hosts working, so the steps can ship one at a time.

## Step 1: shared session modules

### `hooks/session.ts`

A shared module holding a session's state and the pure changes to it.

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

A shared module holding the `SessionHost` type and the async work that runs through it. `SessionHost` is everything a host supplies to run one session. Each function takes only the members it uses. The `Host` names and whether the inbox is open are arguments to the functions in `hooks/session.ts`, not members:

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

## Step 3: omp in the repo

Built. It adds omp to the repo's checks, docs and release steps, and to omp's own marketplace.

- `Look` in `hooks/view.ts` gained `omp` in step 2.
- `docs/looks.md` lists omp's files, owners and differences on purpose, and has a section on adding a host. `GLOSSARY.md` names omp under Look, Host and Adapter. `AGENTS.md`, `README.md` and `docs/release.md` cover omp.
- `omp/tests/panel.spec.ts` checks the omp panel's button order against `rowKeyPlan`. The demo test in `tests/hooks.test.ts` stays on the terminal and desktop looks.
- `scripts/check-structure.mjs` checks `omp/` imports, and `scripts/check.sh` runs omp's bundle check, types and tests.
- `.omp-plugin/marketplace.json` lists the omp plugin. omp reads `.omp-plugin/marketplace.json` before `.claude-plugin/marketplace.json`, so the omp catalog sits where Claude Code never reads it, and `.claude-plugin/` is untouched. The plugin's source is `./omp`, and omp copies only that folder when it installs. `../hooks` is not in the copy, so `omp/build.ts` bundles the extension and its shared modules into `omp/dist/host.js`. The bundle is committed, since an install runs no build. omp's own packages stay external, because omp supplies them.
- `docs/release.md` lists `version` in `omp/package.json` and the omp bundle build.

omp installs the plugin from a local checkout with `omp plugin marketplace add <path>` and `omp plugin install inbox@inbox-omp`, with no `-e` flag. The band showed and `/inbox` opened the panel, also with only the bundle left in the installed copy. The install from GitHub and the update commands are untested.

## Step 4: the mod on the shared session modules

Built. The mod keeps one `session` value of type `Session`, and runs its presses, Done messages, turns, updates and PR fetches through `hooks/session.ts` and `hooks/session-host.ts`. `hooks/register.tsx` holds the mod's `SessionHost`, how it stores and saves each conversation's session, and its effects. It also handles Claude Code's events and draws the terminal and desktop looks.

This step changes the most code, and runs last so that the `SessionHost` shape has been tested on two hosts first. After it, each host runs the same session code, and a new host supplies a `SessionHost`, a look and their tests.

### Gap list

The mod's host code does more than `Session` and `SessionHost` model. Each difference below is marked with what step 4 does with it:

- **Move into the shared modules.** Codex and omp gain it, or run as before.
- **Keep in the mod.** It depends on something only Claude Code has. The mod's `SessionHost` or its event handlers keep it.
- **Drop.** The shared code already does the same job.

#### Move into the shared modules

- **A refused Done message.** The mod records the refusal on the closed row, as `doneNotification.error`. The row then reads "Not sent: …" and offers Undo. The shared `wakeForDone` leaves a refused message's row reading as unconfirmed, because `completedAttempt` only drops the sent record. Codex and omp would show "Not sent" as the mod does. This fixes a drift between the looks.
- **A message another plugin rewrote.** `$.prompt.submit` can return different text than the mod sent. The mod moves the row's delivery to the new text with `withRewrite` in `awaitRewritten`. `SendOutcome` would carry the text that was entered, and `completedAttempt` would apply the rewrite. Codex and omp never rewrite, so nothing changes for them.
- **Counting turn starts.** The mod counts a turn when the turn starts, in `turn.start`. That event also covers turns the person did not start. The shared `notePrompt` counts on each prompt. A shared `startTurn` does the counting and clears the last stop. `notePrompt` calls it, so Codex and omp count as before. The mod calls it from `turn.start`.
- **What started a turn.** The mod records `trigger`, such as a task notification, when no person's words started the turn. `Session.turn` would gain `trigger`. `endTurn` already writes `'unknown'` when no person's words started the turn, and that stays the fallback.
- **A turn with no reply.** The mod queues an exchange when the person dismissed a question dialog, even with an empty reply. `endTurn` drops an empty reply. It would take a flag to queue the exchange anyway.
- **Row notes in the view.** The mod's view shows each row's notes, such as a stale press. `sessionView` passes no notes. It would take them as an argument.
- **Finding the branch's PR.** The mod looks up the current branch's PR only while the PRs tab is shown. The shared `fetchPrs` always looks it up. It would take a `findsBranchPr` argument, which Codex and omp set to true.
- **A ledger that may have missed a turn.** The mod marks its ledger `behind` when it cannot read a turn, and catches up on the next update. `Session.presence.ledgerState` has `behind`. The view treats it as current, as the mod does.
- **Stops.** The mod and omp each keep a `stop` beside the session and clear it when a turn starts. `Session` holds `stop`, and `startTurn` clears it. omp also clears it in `turn_start`, because a message queued during a run starts a turn with no prompt event. Codex sets none.
- **Delivery outside the session's lock.** `$.prompt.submit` runs the mod's own `session.append` handler before it returns, and that handler changes the session. The shared `press` and `wakeForDone` delivered inside a locked update, which would deadlock the mod. They now save the sent record in one update, deliver outside it, and record the outcome in another. `SessionHost.update` no longer passes a `checkpoint`, since nothing saves partway through a change now.
- **Untracked sends.** The mod keeps `untrackedSent` for messages an older build sent without a record that can be matched. A shared `sent` record with `phase: 'uncertain'` blocks a false match in the same way. `upgradeState` would convert each `untrackedSent` entry into one, and the field would go.

#### Keep in the mod

- **Catching up.** When the ledger is `behind` or `failed`, or a reload cut off an update, the shared `runUpdates` catches up through the host's `catchUp` member. The mod forks the conversation with `$.model.fork`, or reads the transcript when there is nothing to fork. Codex and omp have no fork, so they read the conversation (the rollout and the session branch) and call `askOverConversation`.
- **Delivery receipts.** The mod learns that a message arrived when Claude Code stores its prompt row, in `session.append`. It adds the inbox text at that point too. The shared `notePrompt` matches arrivals by the prompt's text. It is built from three parts: `matchSent` matches the arrival, `startTurn` counts the turn, and `recordPrompt` records the words and returns the notes. Codex and omp call `notePrompt`. The mod calls `recordPrompt` for the person's words and its own sends, and its `session.append` handler marks arrivals on the shared `sent` records.
- **Conversation switches.** `/clear`, `/resume` and `/branch` switch conversations inside one process. The mod tracks which conversation a write belongs to, and drops a write that arrives after a switch. A branched conversation starts from its parent's saved state. The mod's `SessionHost.read` and `update` hold the conversation they were made for, and do nothing once it changes.
- **An unreadable store.** When the store cannot read a conversation's saved state, the mod skips saves until a read succeeds, so it does not overwrite that state. This stays in `changeSession` in `hooks/register.tsx`.
- **Claude Code's signals.** These stay in the mod's event handlers:
  - permission and question dialogs
  - away time and the minute tick
  - the Herdr status line
  - the theme
  - the demo
  - closing a task when the shell command it names ran
  - clearing a sign-in stop after `/login`
  - linking a PR after `gh pr create`
  - local URLs in command output
  - replies a Stop hook sent back
  - the turn box
- **Coalesced PR fetches.** The mod runs one PR fetch at a time, shows that one is running, and polls every two minutes unless the person is away. A dismissed PR leaves the tab once its row settles. These stay in the mod, around the shared `fetchPrs`.
- **The pane's follow-ups to a press.** Undo scrolling, keeping the pressed row open, reopening a row whose send failed, and restoring a draft stay in `register.tsx`. They read the shared `press`'s outcome.

#### Drop

- **`applyAnyPress`.** It is a copy of the shared `pressOn`.
- **Press order.** The mod numbers each press in `lastActions` as `pressOrder`, so a press's late write cannot replace a later press's. The shared `press` applies each press inside one locked update, so its writes land in press order.
- **The mod's record and close changes.** `runTool` applies `recordItem` and `recordClose` as the shared `recorded` does.
- **The mod's PR merge.** The merge in `fetchPrsNow` keeps the same PRs as the shared `withFetchedPrs`.
- **The mod's update queue.** An in-memory promise chain ran one exchange at a time. The shared `runUpdates` saves the pending exchanges instead. After a failed update the next `runUpdates` catches up over the whole conversation before it runs any exchange.
- **`SentPrompt`.** The shared `sent` record holds the same fields. The session id is unneeded, because each conversation saves its own session.

### How the mod saves its session

Before step 4 the mod saved only `{ savedAt, ledger }` for each conversation, under `s:<id>`. It kept everything else in separate `PluginState` fields that only the running process used. Now `PluginState` holds one `session` field of type `Session`, and every write saves the whole session for its conversation, as Codex and omp do. The fields only the pane uses stay as they were: the tab, the selection, the typing row, drafts, folds, notes and the demo.

`Session` moved to `types/index.d.ts`, since the plugin's state contract may not import from `hooks/`. Two older shapes convert:

- A saved `{ savedAt, ledger }` goes through `upgradeSession`, which every host uses. It becomes a session with that ledger and empty other fields.
- The separate `PluginState` fields that a hot reload kept move into `session` in `upgradeDrawn`. An `untrackedSent` entry becomes an uncertain `sent` record. A queued message with no record also gets one, and its row reads unconfirmed.

### What people will notice in the mod

- `/resume` brings back each row's last press and any update that had not run, not only the rows.
- A PR fetch now saves, so a resumed conversation shows the PRs it last fetched.
- Nothing else should change. The tests in `tests/hooks.test.ts` that read separate `PluginState` fields now read `session`, with the same expected results.

### Build order

Each part passes `./scripts/check.sh` and can be committed on its own.

1. Make the shared changes listed under "Move into the shared modules". The Codex and omp tests keep passing. Their only visible change is the "Not sent" text on a refused Done. Built: `untrackedSent` converts in part 2, with the rest of the mod's saved state.
2. Move the mod's state into one `session` field, saved whole, and convert the older shapes.
3. Give the mod a `SessionHost`, and route its tools, prompts, turn ends, updates, presses, Done messages and PR fetches through the shared functions. Delete what the "Drop" list names.
4. Run `tests/session-script.ts` against the mod's `SessionHost`. Check the terminal and the desktop pane live, in a session with its own `CLAUDE_CONFIG_DIR`.

Parts 2 and 3 were built as one, since the mod's `SessionHost` needs the single `session` value.

The script does not run on the mod's storage, because a test in `claude plugin test` gets no `$.state`. The 145 tests in `tests/hooks.test.ts` run the mod's storage through its events instead.

Every look was checked live after step 4.

- **Terminal,** with its own `CLAUDE_CONFIG_DIR`: the demo pane, an answer press, a stop row from a failed turn, and `/clear`. In the inbox-ui VM, a session a released build saved resumed with its four questions. An answer press arrived and folded into Closed, and the saved record converted to the session shape.
- **Claude app,** in the inbox-ui VM: a task Claude recorded, Done on it, the Done message sent after the settle window, its closed row reading Done, and the empty pane after `/clear`. A session a released build saved opened with its question and task, and an answer press arrived and folded into Closed.
- **Codex tab,** in the inbox-ui VM: a question a released build saved showed in the tab. Its answer press settled with ✓, arrived, and folded into Closed.
- **omp,** with its own `HOME`: the band, a question, a resumed session, the closed list, Copy, Done, Explain, and Dismiss with Undo. Reply and the PRs tab were not checked live.
