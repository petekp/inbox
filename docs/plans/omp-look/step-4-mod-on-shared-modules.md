# omp look: step 4, the mod on the shared session modules

Part of [the omp look plan](../omp-look.md).

Status: built. Merged to main in #5.

## Step 4: the mod on the shared session modules

Built. The mod keeps one `session` value of type `Session`, and runs its presses, Done messages, turns, updates and PR fetches through the session modules and `hooks/session-host.ts`. `hooks/register.tsx` holds the mod's `SessionHost`, how it stores and saves each conversation's session, and its effects. It also handles Claude Code's events and draws the terminal and desktop looks.

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
