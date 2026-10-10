# Inbox target architecture and build plan

This plan sets the code shape that serves the UI in [inbox-ui.md](inbox-ui.md), and the order to build it in. The UI plan is decided. This plan follows it in three layers: the view model first, then the press contract, then the renderers.

Section references such as "UI 2.3" point to `inbox-ui.md`.

## Terms

- **Ledger**: the saved list of items, closed items, findings and linked PRs (`Ledger` in `types/index.d.ts`). The mod keeps it in the `LEDGER` atom and saves a copy per session in `$.store`, which survives restarts. The Codex plugin saves it in one JSON file per session.
- **Atom**: a piece of mod state in `$.state`. It survives a hot reload, but not a restart. The engine may reset atoms on `/clear`, `/resume` and `/branch`.
- **Saved state**: the ledger, the mod's atoms, and the Codex session file. Its shapes are `PluginState` and `Ledger` in `types/index.d.ts`, and `SessionState` in `codex/src/state.ts`. Code that changes a saved shape converts old state: `upgradeLedger` and `upgradeState` in the mod, `upgraded()` in Codex.
- **UI state**: what only the screen needs: selection, open field, drafts, unfolded rows, shown options, and row notes. In the mod it lives in atoms that no other host reads. In Codex it lives in the tab and is never written to the session file.
- **Host**: the program that runs the inbox. Two hosts are built: the mod (Claude Code, terminal and desktop Code mode) and the Codex plugin.
- **Per-turn update**: the model call after each reply that adds and closes items. It is today's only item source.
- **Press**: a person's click or key on an action.
- **Press kind**: one of Talk, Hand-off, Local, Mark or View (UI 2.3). The kind decides what the row shows at once.
- **Effect**: what a press asks its host to do outside saved state: send a message, open a file or page, or copy text.
- **Reducer**: a pure function that takes state and a press, and returns the new state and a list of effects. Pure means it reads nothing but its arguments and writes nothing.
- **Last action**: the record of the latest Talk, Hand-off or Mark press on a row (`LastAction`), plus the result of a later Local press. The row draws its feedback from it.
- **Row note**: a short-lived note on a row that is not a press result: the stale-press note and the demo's sample note. It is UI state.
- **Settled row**: a row that just closed, kept in place with a ✓ and its outcome for 5.12 s (`SETTLED_MS`) before it leaves.
- **Delivery state**: whether a sent message has reached the agent: queued, arrived, or failed.
- **Model-read text**: any text a model reads. AGENTS.md lists it, and requires a measured A/B before changing it (section 8).
- **Owner decisions**: the three decisions the owner made for this work. Owner decision 1: session checks leave the inbox. Owner decision 2: the defaults for UI 6. Owner decision 3: keyboard shortcuts are a terminal-only extra, and desktop is click-first.
- **UI 6.n(x)**: the default taken for choice n in UI section 6, under owner decision 2. These are UI 6.1(b), where Address hands a finding off and Discuss keeps it open. UI 6.2(b): Claude mode is not built now. UI 6.3(a): no row opens on its own after a press. UI 6.4(b): the band has no answer buttons.

## 1. Summary

- One new pure module, `hooks/view.ts`, builds the inbox view model from saved state. The band, the pane and the Codex tab all read it. It owns the Needs you order and count, question handles, row states, feedback and settled rows.
- One shared reducer, `applyPress` in `hooks/presses.ts`, applies every item and finding press in both hosts. It grows out of Codex's existing `press()`. The mod's hand-written press functions go. PR presses use a mod-only apply function with the same contract.
- Each host performs effects and records their outcome: delivery for sends, a result for opens and copies.
- The mod keeps one renderer in `hooks/register.tsx` and picks terminal or desktop drawing per draw. The Codex tab keeps its own HTML renderer and draws the same view model.
- Step 1 removes session checks from both hosts, as its own commit.
- Nothing is built for Claude mode. The seams it needs stay open.

## 2. Modules

| File | Owns | Imports |
|---|---|---|
| `hooks/view.ts` (new) | `inboxView`, the view types, the Needs you order and count, row state, feedback, settled rows, `perTurnStatus`, `isGuarded`, `feedbackText`, and the shared timing constants | `types`, `hooks/ledger.ts` (`questionNumbers`), `hooks/presses.ts` (types, `stepsOf`, `isHandedOff`). Nothing from the engine. |
| `hooks/presses.ts` | `PressKind` (defined in `types/index.d.ts` beside `LastAction`, which stores it, and re-exported here), `RowPress`, `Effect`, `applyPress`, `reopenOnFailure`, `retryOf`, `actionId`, `stepsOf`, `isHandedOff` (renamed from `isTaskHandedOff`), and today's `messages`, `steps`, `openCommands`, `localPath` | `types`, `hooks/ledger.ts`, `hooks/prs.ts` (`namedPrs`, `parseRef`) |
| `hooks/ledger.ts` | Today's ledger writes and model-read texts. Gains `questionNumbers`, `reopenItem`, `closeFinding` and `reopenFinding`. `closedRecord` keeps the item. | `types` |
| `hooks/prs.ts` | PR readiness and PR prompts. Loses `isFixSent` and `prompts.fix`. | `types` |
| `hooks/tools.ts` | `record_finding` and `close`. Unchanged. It is the item-source seam (section 5). | `hooks/ledger.ts` |
| `hooks/demo.ts` | Sample data. Returns a `DemoCopy`: ledger, last actions, turns, PR views and stop. | `types` |
| `hooks/register.tsx` | Engine hooks, atoms, the mod's press runner and effect performer, PR presses and their apply function, PR fetches, the band and the pane | everything above, and `claude-code` |
| `codex/src/core.ts` | Codex-only logic: `notePrompt`, activity lines, `endTurn`, `heardState`, and `viewOf`, which becomes `inboxView` plus Codex fields | `hooks/*` |
| `codex/src/server.ts` | MCP tools, the Codex press runner and effect performer, `codex queue` | `core.ts`, `state.ts`, `hooks/presses.ts` |
| `codex/src/state.ts` | `SessionState`, `upgraded()`, the lock | `types`, `hooks/ledger.ts` |
| `codex/src/hook.ts` | Hook events, the `heard` record | `core.ts`, `state.ts`, `run.ts` |
| `codex/src/run.ts` (renamed from `tree.ts`) | The process runner `run` and its type `Run`. The check-only parts of `tree.ts` go in step 1. | Node |
| `codex/src/tab.tsx` | The HTML renderer of the Inbox tab, and the tab's UI state: drafts, row notes, first-sight times | `view.ts` types and pure helpers, `ago` |

Deleted in step 1: `hooks/checks.ts`, `hooks/check-tracking.ts`, `hooks/tree.ts`, `hooks/git.ts` and their tests. Only check code uses them.

**Why `hooks/view.ts` is new.** The band, the pane, `followNewRows`, `publishStatus` and the Codex tab must agree on one order, one count and one numbering. Today that logic lives in four places: `needsYouCount`, `tabRowIds` and the pane's `rows` in `register.tsx`, and `viewOf` in `codex/src/core.ts`. The simpler path is to keep the functions in `register.tsx` and import them from Codex. That cannot work, because `register.tsx` imports the engine and the Codex bundle cannot load it. The other simpler path, putting them in `ledger.ts`, is rejected because AGENTS.md names `ledger.ts` as model-read text. View code changes often in this work, and keeping it apart keeps model-read diffs easy to spot.

**Why the reducer goes in `presses.ts`, not a new file.** That file already holds what every host shares about presses (`messages`, `steps`). Codex's `press()` already has the reducer's shape: state and press in, state and effects out. Moving it there replaces the mod's hand-written transitions (`sendAnswer`, `actOnFinding`, `close`, `useStep`, `removeFinding`) instead of keeping two copies that drift.

**Why the drawing stays in `register.tsx`.** Moving the pane into its own file would be a diff of about 1,000 lines that meets no current requirement. The desktop branch touches only leaf helpers. The move can happen later, once the pane closure has shrunk.

**Why the band's drawing stays in `register.tsx`.** Only the mod has a band. Its inputs (the stop, the demo and `maxRows`) are mod-only. Shared code is for what more than one host reads.

## 3. View model

All types live in `hooks/view.ts`, except the saved shapes, which stay in `types/index.d.ts`.

```ts
export const SETTLED_MS = 5120     // moved here from register.tsx and codex/src/core.ts
export const NEW_ROW_MS = 1500     // replaces the mod's ARRIVAL_MS
export const PRESS_GUARD_MS = 400
export const CLOSED_SHOWN = 3      // moved here from both hosts
export const OPTIONS_FOLD_AT = 5   // more options than this show the first 4 and [All N options]

export type Turns = { turnsStarted: number; turnsApplied: number }

export type ItemStatus = { changedAt: number | null; isUpdating: boolean; error: string | null }

/** UI state: a note on a row that is not a press result. The mod keeps these in an atom; the Codex tab in its own state. */
export type RowNote = { note: 'stale' | 'sample'; at: number }

export type ViewInput = {
  ledger: Ledger
  lastActions: Record<string, LastAction>
  notes: Record<string, RowNote>
  turns: Turns
  /** Per item id, steps a host adds beyond the item's own helps: the mod's "Open PR #N". Codex passes {}. */
  extraSteps: Record<string, HelpStep[]>
  /** How long after a close the view still lists the row as settled. The mod passes SETTLED_MS; Codex adds two poll intervals. */
  settleWindowMs: number
  status: ItemStatus
  now: number
}

export type RowState =
  | { is: 'open' }
  | { is: 'handedOff' }                                  // folds; Details unfolds it
  | { is: 'settled'; label: string; at: number; canUndo: boolean }

export type Feedback =
  | { is: 'done'; label: string; at: number }            // "✓ Explain · 1m ago". Talk and Hand-off ✓ persist.
  | { is: 'queued'; label: string; at: number }          // "Queued: Explain · 2m ago"
  | { is: 'notSent'; reason: string; retry: RowPress | null }
  | { is: 'local'; result: LocalResult }                 // worded per surface at draw time
  | { is: 'note'; note: 'stale' | 'sample'; at: number }

export type ActionView = {
  press: RowPress
  label: string          // "Explain", or "Explain again" when the last action was this one
  kind: PressKind
  isPrimary: boolean     // the recommended option
  isFolded: boolean      // an option behind [All N options]
}

export type RowView = {
  id: string
  type: 'question' | 'task' | 'finding'
  handle: string         // "1)", "?" or "•"
  title: string
  at: number | null
  item: Item | null      // the body source for questions and tasks
  finding: Finding | null
  steps: HelpStep[]      // the item's steps, then extraSteps
  state: RowState
  feedback: Feedback | null
  actions: ActionView[]  // in UI 2.4's order; every option, no letter cap
  field: 'answer' | 'reply' | null
}

export type InboxView = {
  needsYou: {
    count: number
    topId: string | null
    questions: RowView[]
    tasks: RowView[]
    closed: { questions: Closed[]; tasks: Closed[] }   // every close the ledger keeps, newest first; see "Closed fold"
  }
  findings: { count: number; rows: RowView[]; closed: ClosedFinding[] }
  card: Card | null      // goal, current step, done steps, running
  status: ItemStatus
}

export function inboxView(input: ViewInput): InboxView
export function perTurnStatus(ledger: Ledger, update: { isUpdating: boolean; isFailed: boolean }): ItemStatus
export function isGuarded(openedAt: number, now: number): boolean
export function feedbackText(f: Feedback, look: 'terminal' | 'desktop' | 'html'): string
```

**Rules that live only in `view.ts`.**

- **Count (UI 2.1).** Open questions plus open tasks that are not handed off. Findings get their own count: open findings that are not handed off. PR rows are counted by the mod's PR code, as today.
- **Order (UI 2.1).**
  1. Questions from the latest batch, in the order Claude asked them.
  2. Other open questions, newest first.
  3. Tasks, oldest first.

  A handed-off task keeps its place and folds. `topId` is the first row that counts. Findings are newest first, as today.
- **Handles (UI 2.2).** `questionNumbers(ledger, promptTurn)` in `ledger.ts` returns `Map<id, number>`. For each question in the latest batch, it gives the number n that `answerNote` would map to that question. It follows `answerNote` exactly:
  - The batch is `latestBatch(ledger)`, tasks included, and is used only when `batchTurn === promptTurn - 1`.
  - When any batch item has a numeric label, n comes from the label, and unlabeled items get no number. When two labels have the same digits, the first match wins.
  - Otherwise n is the item's 1-based position in the whole batch, so tasks take positions too.
  - Only questions are returned.

  `questionNumbers` and `answerNote` share this rule through two functions in `ledger.ts`: `answerableBatch(ledger, promptTurn)` picks the batch, and `batchNumbers(batch)` maps each number to its item. `answerNote` does not call `questionNumbers`, because it also answers tasks by number. `answerNote` passes `ledger.turn`, because `notePrompt` has already counted the prompt. The view calls `questionNumbers` with `ledger.turn + 1`, the turn the next prompt will have. Every other question shows `?`. Tasks and findings show `•`.
- **Handed off.** `isHandedOff(last, turns)` is today's `isTaskHandedOff` turn rule: the press's `turnsStarted` is at most `turns.turnsStarted`, and `turns.turnsApplied` has not passed it. It applies to tasks and findings. Questions never fold. Which field marks a hand-off changes by step:
  - Steps 3 and 4: `last.isHandoff === true`, as today.
  - Step 5 on: `last.kind === 'handoff'`.
  - Step 11 on: also requires that `last.delivery` has not failed.
- **Settled rows.** A closed item with a stored `item`, closed less than `settleWindowMs` ago, is drawn in place as settled. A closed finding works the same way. Each is put back into the list before ordering, using its stored item or finding, so it stays where it was. `canUndo` is true when `how` is `done` or `dismissed`. This one rule covers closes by a press, by Claude's `close` tool and by the per-turn update.
- **Closed fold.** `closed` holds every close the ledger keeps, including the ones drawn as settled. Each renderer hides from its fold the ids it is drawing as settled right now, then takes `CLOSED_SHOWN`. The fold's count is the number left after hiding. The mod and the view agree on the window, so the pane hides exactly the view's settled ids. The Codex tab keeps its own settle timer (6.2), so only it knows which ids it still draws.
- **Feedback.** It comes from the row's `LastAction`, then its `RowNote`, in this order:
  1. A `RowNote` newer than the last action's `at`, while `now - at < SETTLED_MS`, gives `note`.
  2. A `result` that is pending or failed, or done with `now - result.at < SETTLED_MS`, gives `local`. A failed result stays until the next press on that row.
  3. Otherwise the kind's own feedback: `delivery` queued gives `queued`; arrived, or no delivery, gives `done`; failed gives `notSent`, with `retry` from `retryOf`. A last action of kind `local` with no live result gives no feedback.
- **Actions (UI 2.4).**
  - Question: each option (with more than 5, the fifth and later are `isFolded`), then each step (own helps, then `extraSteps`), Type an answer, Explain, Dismiss.
  - Task: each step (own helps, then `extraSteps`), Done, Type a reply, Explain.
  - Finding: Address, Discuss, Type a reply, Dismiss.
  - In the terminal, letters go on the first 9 options and steps together, counted in this order.
  - A label reads "X again" when the row's last action has the same action id.
- **Status (UI 2.6).** `perTurnStatus` gives `changedAt` as the latest of `card.updatedAt` and the newest `at` among items, closed items, findings and closed findings. So it counts both the update and the tool calls that write the list. `isUpdating` and `isFailed` are passed in. The mod passes `presence.isUpdating` and `presence.ledgerState === 'failed'`; its `behind` state never shows as an error. Codex passes `presence.isUpdating || pending.length > 0`, so the tab reads `Updating…` while exchanges still wait for the inbox model, and `presence.ledgerState === 'failed'`. `error` is UI 2.6's sentence when `isFailed`. The UI never names the source.

**Local result wording.** `LocalResult` (section 7) stores the parts, not the words, and its own `at`. `feedbackText` builds them per look. One press gives one note, so a step with three PR links reads `✓ Opened 3 PRs`, and a mixed step reads `✓ Copied the key · Opened .env`. A copied command adds `Run it in a terminal, or type ! and paste.` in the terminal, and `Run it in Terminal.` on desktop and in HTML.

**What stays out of the view model.**
- PR rows. Only the mod has them. They keep their builders in `register.tsx` and `prs.ts`, and use the shared `PressKind`, `LastAction` and `feedbackText`.
- The band's state choice (`register.tsx`).
- UI state, except row notes, which the view reads as `notes` so feedback has one order.
- The new-row bar. The mod records the ids `newRows()` reports and when (step 12). The Codex tab records the first time it sees each row id (step 15). Neither reads a row's own `at`: an item's `at` can be null, and a thread's `at` is GitHub's comment time.

## 4. Press contract

### 4.1 Kinds

| Kind | Presses | What the press records |
|---|---|---|
| Talk | Explain, Discuss; Draft reply and Discuss on a thread | `LastAction{kind:'talk'}`, delivery queued |
| Hand-off | Type a reply on a task or finding, Address on a finding, a step with a Run; Address, Resolve conflicts and Address all on PRs | `LastAction{kind:'handoff', turnsStarted}`, delivery queued |
| Local | Steps that open, link or copy; Open, Open PR, Open log, thread Open | Only `result` (4.3, "Local presses") |
| Mark | Done, Dismiss (item, finding, PR); an answer, which also sends | The ledger close. An answer adds `LastAction{kind:'mark'}` with delivery queued. |
| View | Tabs, Details, [All N options], Closed fold, [Open inbox], demo toggles, Retry, Undo | Nothing in the reducer, except Undo (4.5) |

`kind` replaces the mod's `Action.done` and `Action.handsOff`, and the `isHandoff` field of `LastAction`.

### 4.2 Action ids

`LastAction.action` stores an action id. One function, `actionId(press)`, makes it from a press, so the two hosts store the same ids:

- `answer`, `type`, `explain`, `done`, `dismiss`, `address`, `discuss`;
- `step-<n>` for the nth step;
- PR presses: `thread-address`, `thread-draft`, `thread-open`, `thread-discuss`, `pr-conflicts`, `pr-address-all`, `pr-open`, `pr-dismiss`, `log`.

Button keys in the mod stay as today (`explain-i3`, `typekey-i3`), because they are element addresses and nothing stores them after this change.

### 4.3 The reducer

```ts
export type RowPress =                     // also the Codex tab-to-server wire shape
  | { action: 'answer'; id: string; option: string }       // option text, not an index
  | { action: 'type'; id: string; text: string }
  | { action: 'explain' | 'done' | 'dismiss' | 'address' | 'discuss' | 'undo'; id: string }
  | { action: 'step'; id: string; step: number; label: string }

export type Effect =
  | { kind: 'send'; text: string; by: Press | null }
  | { kind: 'open'; target: string; name: string }
  | { kind: 'copy'; text: string; name: string; isCommand: boolean }

export type PressResult =
  | { ledger: Ledger; last: LastAction | null; effects: Effect[] }
  | { stale: true }

export function applyPress(
  ledger: Ledger,
  last: LastAction | undefined,           // the row's current last action, which a Local press keeps
  p: RowPress,
  ctx: { now: number; turnsStarted: number; extraSteps: HelpStep[] },
): PressResult
```

- It returns the new ledger and at most one `LastAction`, for the pressed row only. It never returns a whole `lastActions` map. So a host merges one entry, and cannot overwrite other rows' entries.
- **Stale press.** It returns `{ stale: true }` in four cases:
  - the row is gone;
  - an answer's option text is no longer among the item's options;
  - a step's label no longer matches the step at that index;
  - an `undo` whose close record cannot be undone (4.5).

  A press on a row that changed in other ways is harmless, so it goes through. On a stale result the host writes a `stale` row note, never a `LastAction`. A stale `type` press puts its text back into the row's draft.
- **Answer and typed answer:** close the question with the answer, return a mark `LastAction` with delivery queued, and one send.
- **Type a reply on a task or finding:** hand-off `LastAction`, and one send. The row stays. The words are not stored in `LastAction`; the draft store keeps them (4.4).
- **Address:** hand-off, one send. The finding stays (UI 6.1(b)).
- **Discuss and Explain:** talk, one send. The row stays.
- **Done and Dismiss:** close the item, or move the finding to `closedFindings`. No send and no `LastAction`; the settled row draws from the close record.
- **Step:** the step's helps become effects in order, on questions and tasks alike. A Run help makes the press a hand-off and sends. On a question the row stays open, since questions never fold. A step with no Run help is a Local press.
- **Local presses** keep the hand-off apart from the latest result. A Local press returns the row's current `LastAction` with only `result` set to pending: `kind`, `action`, `text`, `at`, `turnsStarted` and `delivery` stay. With no current last action it returns `{ kind: 'local', action, text, at, result }`. So an Open on a folded thread or task, or a Copy step on a handed-off task, never unfolds or recounts it. A later Talk, Hand-off or Mark press replaces the whole entry, which also clears `result`.
- **Undo:** see 4.5.

**The `by` field of a send stays exactly as each host sets it today.** It is model-read input:
- Explain sends `{ action: 'explain' }`, because `runUpdate` drops CLOSED lines for the explained item.
- An answer sends `'answer'` and a Run step sends `'run'`.
- Task replies, finding sends and PR sends send `null`. In the mod, `promptNotes` runs `answerNote` only when `isPress` is false, and `isPress` is `by !== null`.

The reducer reads PR links only through `ctx.extraSteps`. The mod passes the item's "Open PR #N" steps, built by `stepsOf(item, prLinks)` in `presses.ts` from today's `itemSteps`. Codex passes none.

### 4.4 Delivery

A send is **queued** when the press records it, **arrived** when the host sees the message enter as a turn's prompt, and **failed** when the host learns it will not enter.

```ts
type Delivery = { state: 'queued'; message: string } | { state: 'arrived' } | { state: 'failed'; reason: string }
```

`message` is the sent text, so the host can match the arrival to the row. Two queued sends with the same text match oldest first.

Staging: until step 11, the reducer leaves `delivery` unset, and section 3 reads a missing delivery as done. Step 11 starts writing `queued` and adds the arrival and failure paths in the same commit, so no step shows `Queued` with nothing to clear it.

**Mod.**
- `send()` calls `notePrompt`, then `$.prompt.submit({ text, asUser: true })`.
- `$.prompt.submit` resolves once the prompt entered and its turn started, or once it was queued behind the running turn (`PromptSubmitResult`). It does not mean the prompt arrived. Arrival comes only from `session.append`.
- Arrived: the existing `session.append` hook for this mod's own prompts (`door: ['prompt','delivery']`, origin `inbox`). It already attaches the context. It now also sets the oldest queued delivery with that message to arrived. Because the match reads `LAST_ACTIONS`, an atom, it survives a hot reload.
- Failed: `submit` resolves with `{ drop: reason }` (a hook refused the prompt, or a settings hook blocked it), or rejects. The runner then calls `reopenOnFailure`:
  - an answered question reopens from its stored item;
  - a hand-off stops counting as handed off, because its delivery failed, so the row unfolds;
  - the row reads `Not sent: <reason>` in red with [Try again];
  - a typed reply's or answer's words go back into `DRAFTS[id]`. The runner holds them in its send continuation; nothing saves them.
- `notePrompt` has already run for a failed send. The runner undoes the parts that would leak the unsent text into model-read input, each only when nothing else changed it since:
  - `told` (the inbox text Claude last read) goes back to its value before the send;
  - the text is removed from `person` when it is still the tail, so the next exchange's `<person>` does not hold it;
  - `press` is cleared when it is still this send's, so the next update neither treats the turn as a press nor drops CLOSED lines for an Explain that never arrived;
  - the `contextFor` entry for the text is deleted.

  It leaves `ledger.turn` counted. The cost: question handles read `?` until Claude asks again, and items move one prompt nearer to expiry. Both are safe. Moving `notePrompt` into the `session.append` arrival would leave nothing to undo. It is rejected for now, because it moves every press's turn counting into a hook that no test drives yet (step 11's spike).
- If the mod reloads while waiting for `submit`, the failure path should still run. The Button returns the press's work, and a hot reload keeps returned work. So the failed mark, the reopened item and the restored words should land after the new load starts. This is inferred from a probe with another mod and not verified in the inbox. If the failure path is lost, the row stays Queued. UI 2.3 allows that: it never claims a ✓ it cannot back.

**Codex.**
- The server runs the press, `codex queue`, and the `sent` write inside one `updateState` call, under the session lock, as today.
- On success it appends `{ text, press, at, row, queuedId }` to `sent` and saves the `LastAction` with delivery queued. `queuedId` comes from `codex queue`'s `Queued message {id}` line.
- On failure it saves the state from before the press, plus a failed `LastAction` on the row. The lock means no other writer can land in between, so nothing newer is lost.
- Arrived: `notePrompt` (`UserPromptSubmit`) already matches `sent` by text. A matched entry with a `row` sets that row's delivery to arrived.
- The tab shows `Sending…` from its own state while `inbox_press` runs. It deletes a row's draft only when the reply reports the press went through, as `act(..., () => drafts.delete(id))` does today. A stale or failed reply keeps the words in the field.

### 4.5 Undo

- Offered on a settled row whose close was Done or Dismiss: item Done and Dismiss, finding Dismiss, PR Dismiss (mod only).
- The reducer accepts `undo` when the close record still holds its item, its `how` is `done` or `dismissed`, and the id is not open. Anything else is stale, so an old tab cannot reopen an answered, expired or Claude-closed item. It does not check the settle window, because the Codex tab can show a settled row a few seconds past the server's window, and a late Undo must not read as stale.
- `reopenItem(ledger, id)` moves `closed[i].item` back into `items` at its place in numeric id order (the number after `i`, so `i2` comes before `i10`), and removes the close record. Array order matters: `answerNote`'s `batch[n-1]` and the `slice(-MAX_OPEN)` expiry read it. `reopenFinding` does the same with `closedFindings`, by the number after `f`.
- Undo also removes the id from `told.closed` in both hosts (the mod's `told`, Codex's `s.told`). Otherwise a second close of the same item would never be reported, because `promptNotes` skips ids it already reported.
- Undo puts the row back open: the runner selects the restored row in its tab. From step 12 that selection sets `Cursor.openedAt`, so the press guard applies. The Codex tab sets its selection to the row on Undo.
- Claude learns of the reopen through the next carry text: `inboxText` lists the item again, and its first line already says "Anything not listed here is closed". Whether an explicit "Reopened" line is needed is measured (section 8, A/B 3).
- **PR Dismiss** is mod-only. `dismissPr` removes the ref from `ledger.prs` and writes a mark `LastAction` at `pr:<ref>`. It keeps `PR_VIEWS[ref]` until the settle window ends, and a PR fetch in that window does not drop it. The leave timer drops it. Undo adds the ref back to `ledger.prs` and deletes the mark.

### 4.6 The press guard

- An action button ignores presses for `PRESS_GUARD_MS` (0.4 s) after its row opens, and draws dim (`dimColor` in the mod, `disabled` in HTML) during that time.
- Mod: `Cursor.openedAt` is set by every route that opens a row (`select`, `openPane`, `jumpTo`, `followNewRows`, Undo). A render cannot write state, so the opener schedules one redraw at +400 ms. A row shown open by the render-time default (6.1, Selection) has `openedAt` 0 and is not guarded, since no click opened it.
- The guard applies to pointer presses only. A mod hotkey press comes from the hidden hotkey Box, whose Button keys end in `-key`, so `runPress` skips the guard for those. In Codex, the keydown handler skips it. Fast `j` then a letter is a normal flow, and a double-click is the case the guard exists for.

### 4.7 The demo

- The demo runs presses on a copy of sample state, never saved state (UI 7).
- Mod: a `DEMO` atom holds `DemoCopy | null`. `/inbox demo` seeds it from `demoView(now)`, and [Hide demo] sets it to null. While it is set, drawing reads it and `runPress` applies the reducer to it. Every send, open or copy effect becomes a `sample` row note, drawn as `Sample entry: nothing was sent.` Settle, fold and Undo work as for real rows.
- Codex: the in-memory demo map stays. Its presses already run the same reducer on a copy. Effects become the sample note, returned in the press reply.
- This replaces `DEMO_PRESSES`, the pane's Button wrap and the demo toast.

### 4.8 How each host applies a press

**Mod, `runPress($, press, element)`.** Each Button's `onPress` is `() => void runPress(...)`, so the engine never waits on it.

1. Guard (4.6).
2. Demo (4.7).
3. `commitLedger($, l => { result = applyPress(l, lastActions[id], press, ctx); return 'stale' in result ? l : result.ledger })`. `update` may run its callback again on a version miss, so the reducer must stay pure. The result of the last run is the one used.
4. Merge `result.last` into `LAST_ACTIONS[id]` with one `update`. When the merged entry is a hand-off, call `publishStatus`, so the Herdr sidebar line stops counting the row at once, as `recordLastAction` does today. A stale result writes a `stale` row note instead (and, for a `type` press, the text back into `DRAFTS[id]`). If no row with that id is drawn, the pane's status line shows the note for 5.12 s.
5. Perform effects. Opens and copies run first, and the runner writes one `result` for the press when all have finished. Then sends go through `send()` (4.4). The runner does not await `$.prompt.submit` before other work; the send's outcome is handled in its own continuation. That continuation calls `publishStatus` again after `reopenOnFailure` and after any delivery change, since both change what counts.
6. `runPress` holds no lock across an `await`.

`withLastAction`, `recordLastAction`'s redraw loop for presses that do not leave, `sendAnswer`, `actOnFinding`, `removeFinding`, `close` as a press, `useStep`, `useHelp` and every press toast are replaced. The leave redraw for settled rows and Local results stays (step 10).

**PR presses.** They go through the same runner with a mod-only `PrPress` union and their own apply function, `applyPrPress`, in `register.tsx`. They stay out of `RowPress` because Codex has no PRs.

```ts
type PrPress =
  | { action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open'; ref: string; thread: string }
  | { action: 'pr-conflicts' | 'pr-address-all' | 'pr-open' | 'pr-dismiss' | 'pr-undo'; ref: string }
  | { action: 'log'; ref: string; check: string }
```

- They use the same kinds, `LastAction` shape, Local rule, stale note and delivery path.
- **Stale rule:** the PR is no longer in `ledger.prs` or `PR_VIEWS`, or the thread is no longer among the PR's threads. `pr-conflicts` is also stale when the PR no longer conflicts, and `pr-address-all` when no thread waits on the person.
- `pr-address-all` is the one press that writes more than one `LastAction`: a hand-off on each thread it sends, as today. On failure, all of them get the failed delivery.
- Sends keep today's `by: null` and today's `prompts.*` text.

**Codex, `onPress` in `server.ts`.** Inside `updateState`: check the press's thread (below), run `applyPress` with the row's `s.lastActions[id]` as `last`, run sends (4.4), and save. After the lock: run opens, then a second `updateState` writes the Local `result`. Copies return to the tab, which copies and shows the note itself. A stale result writes nothing; the press reply carries the `stale` note, and the tab shows it on the row, or on its own line under the tab row when the row is no longer drawn.

**The thread a press targets (UI 7).** `inbox_view` returns the session id it read (`sessionOf`), and the tab sends it back as `thread` beside each `inbox_press`. The server reads the press's session from the call's meta, as today, and answers stale when that differs from `thread`. Meta alone is not enough. Whether one tab instance stays open across threads is unsourced (live check 5), and `docs/reference/README.md` notes that a forked chat may route a call to the root's session. Either case would apply a press drawn for `i3` in one chat to a different `i3` in another.

## 5. Item-source seam

An item source is whatever adds and closes items. Today it is the per-turn update. Later it may be Claude recording its own items with tools (UI 6.2(b): not built now).

- **Write side.** Every source writes the ledger through `hooks/ledger.ts` functions: `applyUpdate` for the per-turn update, and `hooks/tools.ts` for Claude's tools (`addFinding`, `closeByAgent`). New record tools would go in `tools.ts` beside `record_finding` and `close`. In the mod every write goes through `commitLedger`. In Codex it goes through `updateState`.
- **Read side.** A source supplies two things. Its `ItemStatus` (section 3). And the turn counters `Turns`, which drive re-entry after a hand-off. A Claude-recorded source would advance `turnsApplied` on each inbox tool call, so the same rule means "unfold after Claude's next inbox call".
- **Settled rows** come from close records, so they work for any source.
- `RowPress`, `InboxView` and `ItemStatus` are plain data, so a future Claude-mode server can serve them unchanged.

## 6. Renderers

### 6.1 The mod

- The band and the pane read `inboxView`, the PR rows, and UI atoms. Drawing never calls a press function directly; every Button calls `runPress`.
- On each draw the renderer sets `look = e.surface === 'desktop' ? 'desktop' : 'terminal'` (UI 3.2). Only leaf helpers branch on it.

| Element | Terminal | Desktop |
|---|---|---|
| Action labels | `a: Explain`, letters on the first 9 options and steps | `[Explain]`, no letters |
| Recommended option | `variant: 'primary'`, as today, with no ` (recommended)` suffix | The same. If live check 4 shows a desktop Button ignores `variant`, keep the suffix on desktop only. |
| Hidden hotkey Box | Drawn | Not drawn |
| Tabs | Raised panel | The same panel of plain Buttons for every tab, the shown one in the selection color |
| Closed row | Handle Button and title Button | Handle as Text; title as one Button cut to one line with "…" |
| Keys drawer, "1 2 3", "j k", "ctrl+x tab" | Shown | Not drawn |
| Tab draw-in | Drawn | Not drawn |
| Close | Esc | The app's own ✕ on the pane's title bar |
| Local file and folder links | A Button that runs `open` through `openCommands`, as today | The same |
| https links | A Button that runs `open`, as today, so the press records a result | The same |
| Width | As today | Below 50 columns closed rows drop their age. At 50 or more, the status moves onto the tab line and buttons share lines. |
| Text field | Drawn | Drawn while `DESKTOP_TYPING` is true. If live check 4 shows `Input` does not paint, set it false and desktop rows get no Type action. |

UI 3.2's table lists terminal links as `Link`. The mod draws no `Link` today: every open is a Button that runs `open`, with the Finder reveal for folders, executables and launchers, and the text-editor fallback. A `Link` has no `onPress`, so it could not show `Opening x…` and `✓ Opened x`, which UI 2.3 requires. This plan keeps Buttons. Section 10 lists the departure.

The recommended option drops its ` (recommended)` suffix because UI 3.2's sketch shows bare labels and UI 2.2 marks it by style. `variant: 'primary'` already carries that.

- **Band.** `bandState(...)` in `register.tsx` picks one of UI 3.1's seven states as data, and the band draws it. Line 1 leads with [Open inbox], which opens the pane with `topId` selected. Every state is cut to `maxRows`, with line 1 kept. No answer buttons (UI 6.4(b)). The demo banner shows while `DEMO` is set.
- **Pane.** UI 3.1 and 3.2. It adds the demo banner with [Hide demo], [Send] and [Cancel] on the field, [Undo] on settled rows, [All N options], and [Retry] after a failed PR fetch. The status line names refused tools (UI 2.7) from a `toolsRefused` flag that `turnOn` sets from a caught `$.tool.register` failure (step 13). `Could not read the inbox.` with [Try again] replaces Needs you when the saved session could not be read (step 13).
- **Selection (UI 6.3(a)).** `Cursor` gains `openedAt`.
  - Opening the pane selects `topId`.
  - **Render-time default:** a tab whose cursor has `id: null` and `openedAt: 0` has never had a row opened in this conversation. It draws `topId` (Needs you) or its first row (other tabs) as open, without writing state. This also covers a pane restored on reload, and tests that mount the pane without `/inbox`.
  - When the selected row leaves, the cursor becomes `id: null` with its `openedAt` kept, so nothing is open and the default does not apply.
  - `j` and `k` from none go to the first row.
  - `selectedIndex` no longer falls back to the row at the old index.
- **Typing.** `TYPING` holds the row whose field is open. `DRAFTS` holds one draft per row, written by `Input.onInput`. Opening another row closes the field and keeps the draft.
- **Unreadable.** The mod has one read that can fail and leave it with nothing true to show: the `$.store.get` of the saved session in `loadConversation`. Today that rejection stops `turnOn`, so the mod never loads. Atom reads do not fail this way.

### 6.2 The Codex tab

- `inbox_view` returns `viewOf(state)`: `inboxView` plus `{ heard, isDemo, at, thread }`. `viewOf` passes `notes: {}`, since row notes live in the tab.
- The tab draws the same rows, order, handles, actions and feedback as the pane, with UI 3.4's layout: the status at the right of the tab row, and no count or goal line.
- The tab's UI state: drafts, row notes from press replies (stale, sample, copy results, `Sending…`), first-sight times, open rows. None of it goes to the session file. A note in tab state overrides the row's view feedback while it lasts.
- Client-side timing:
  - A settled row shows from the first poll that lists it, for `SETTLED_MS`, with the leave bar. The server lists recent closes as settled for `SETTLED_MS` plus two poll intervals, so every close is seen at least once. The tab hides from its Closed fold only the ids it is drawing as settled. When its own timer ends, the id shows in the fold, even while the server still lists it as settled. This replaces the client diff (`applyView`, `leftText`) and the server's `leaving` list.
  - The 1.5 s new-row bar starts when the tab first sees a row id, and skips rows in the first view.
  - The press guard records when each row opened.
  - **Jump from an empty tab (UI 2.8).** When the shown tab draws only its empty text and a poll brings a new row into the other tab, the tab switches to it. This is the mod's `followNewRows` rule.
- Kept: the poll guard, drafts with Send and Cancel, the clipboard fallback box, the demo toggle, and the keys (1 and 2 for tabs, j and k, row hotkeys, Esc in a field), with no key text (UI 2.9).
- New: Sending…, all options with [All N options], the recommended option as primary, Undo, delivery states, the not-heard text, the states in UI 3.4 (Loading, Unreadable with [Try again], No connection, Polls failing), and the demo banner.
- **The `inbox` tool split (UI 3.4).** The model-facing `inbox` tool loses `_meta.ui` and returns text: the count, one line per open row, and "Open the Inbox tab to act on these." The tab's `resourceUri` and `thread` entrypoint move to the app-only `inbox_view` tool, which the tab already calls. This adds no tool. If live check 5 shows that an entrypoint on `inbox_view` does not open the tab, add a separate app-only `inbox_tab` tool that carries only the entrypoint and returns the view.

**Keys and owner decision 3.** UI 2.9 keeps the Codex tab's keys as an optional extra with no key text, and drops keys only on Claude desktop, where a Button's hotkey does nothing. This plan reads owner decision 3's "desktop" as the Claude desktop app, which agrees with UI 2.9: no action depends on a key, so the tab stays click-first. Section 10 asks the owner to confirm before step 12. If keys are terminal-only everywhere, step 15 drops the Codex keydown handler and its guard exemption.

### 6.3 The HTML view seam (not built)

UI 7 asks for one HTML view module that serves Codex and Claude mode, with a host adapter for three things: identity (thread id or chat key), the send route (`codex queue`, `ui/message` or `updateModelContext`), and the layout (tab, card or full view). Nothing is built for it now. `tab.tsx` keeps talking to the server only through `callTool`, and draws only `InboxView`. Those are the two places a host adapter would go. The `thread` value on `inbox_press` is the Codex form of the identity part.

## 7. Saved state

| Shape | Change | Conversion | Flag |
|---|---|---|---|
| `Closed` (store, Codex file) | Adds optional `item?: Item`, kept by `closedRecord` | None. Old records have no item, so they get no Undo. They are past the settle window anyway. | Added key |
| `Ledger` | Adds `closedFindings: ClosedFinding[]`, where `ClosedFinding = Finding & Pick<Closed, 'how' \| 'outcome'> & { closedAt: number }`, capped at 12. A person's Dismiss gives `dismissed`. The per-turn update gives `update`. Claude's `close` gives `claude` with a reason, or `answered` with an answer, as `closeByAgent` builds for items today. | `EMPTY` and `upgradeLedger` default it to `[]`. Codex gets it through `upgraded()`, which runs `upgradeLedger`. `hooks/demo.ts`'s Ledger literal adds it. | Added key. A separate list keeps `closed` unchanged, since `carryText`, `closedText` and `<decided>` read `closed`, and findings would push items out of its cap. |
| `LastAction` (atom, Codex file) | Adds `kind` (`'talk' \| 'handoff' \| 'mark' \| 'local'`), `delivery?`, and `result?: LocalResult` (with its own `at`). `action` holds an action id (4.2). Drops `isHandoff`. Drops `tab`, `title` and `index` (mod) and `title` (Codex) in step 9, with their readers. Codex imports the shared type and deletes its own. Notes and typed words are not stored here; they are UI state (UI 7). | See "LastAction conversion" below. A missing `delivery` reads as arrived. | `isHandoff` is a stored key, replaced as UI 7 requires. `action` values change. |
| `upgradeState` rules | The `isHandoff` backfill becomes the `kind` conversion. Legacy `open-` and `log-` entries are still dropped. Every conversion runs only on an entry with no `kind`. | Not applicable | `upgradeState` runs on every load and hot reload, so it must change nothing on its second run. |
| `Cursor` (atom) | Adds `openedAt`. `id: null` with `openedAt: 0` means never opened; `id: null` with `openedAt > 0` means the open row left. | `upgradeState` fills `openedAt: 0`. | |
| Mod atoms added | `DRAFTS` (`Record<rowId, string>`, step 6), `NOTES` (`Record<rowId, RowNote>`, step 6), `OPTIONS_SHOWN` (row ids, step 5), `DEMO` (`DemoCopy \| null`, step 8) | Defaults. `upgradeState` sets `DEMO` to null when its shape is not the current `DemoCopy`, since the atom outlives hot reloads across steps 8 to 10. | `DEMO` replaces `IS_DEMO`. Atoms are not on disk, so the old key is just no longer read. Each is added to `PluginState`. |
| `ARRIVAL` (atom) | Its shape becomes `{ ids: string[]; at: number } \| null`: every row `newRows()` reported, not only the jump target (step 12). | `upgradeState` sets it to null when it holds the old `{ tab, id, at }` shape. | Same key, new shape |
| Mod atoms removed | `CHECKS`, `SNAPSHOTS`, `PR_FIXES_SENT` (step 1). `SETTLED` (step 10). `IS_DEMO` (step 8). | No longer read. Step 1's `upgradeState` drops `SETTLED` entries of kind `check` until step 10 removes the atom. | Stored keys removed |
| `session.end` on `/clear` and `/resume` | Also resets `SELECTION`, `TYPING`, `DRAFTS`, `NOTES`, `UNFOLDED`, `SHOWN_DETAILS`, `OPTIONS_SHOWN`, and the `LAST_ACTIONS` entries for item and finding ids | Not applicable | Ids restart at `i1` and `f1` in a new conversation, so a stale entry would mark a new row. Thread and `pr:` entries stay, because the branch PR survives a clear and `isThreadSent` reads them. |
| Codex `SessionState` | Drops `checks`, `snapshots`, `recordedRuns`, `top`, `turn.sentBack` and `pending[].ex.checks` (step 1). `sent[]` entries add `row` and `queuedId`. Adds `heard`. | `upgraded()` deletes the dropped keys by name, since its `...saved` spread would otherwise keep them. It defaults `row` and `queuedId` to null, so an old entry's arrival changes no row. `heard` for an old file reads as all heard (next row). `version` stays 1. | Stored keys removed |
| Codex `heard` | `{ startAt, promptAt, prompts, promptTurns, stopAt, stops, promptMissedAt }`, times or null; `promptTurns` holds the last few turn ids `UserPromptSubmit` recorded | An old file gets `startAt` set and `prompts = stops = presence.turnsStarted`, so it reads as heard. A false "not heard" on a working session costs more than a missed one. | |
| Codex wire | `TabPress` becomes `RowPress`. `option` changes from an index to the option's text. `fix`, `dismissCheck`, `dismissFinding` and `typedFinding` go; `dismiss` and `type` cover findings. `undo` is added. `inbox_press` takes `thread`, and `inbox_view` returns it. The press reply carries a row note. The `thread` entrypoint moves from `inbox` to `inbox_view`. | None for the press shape, since the tab and server ship in one build. A tab loaded before an update sends an index, or no `thread`, which reads as stale and sends nothing. | Wire names changed |

**LastAction conversion** (step 5, in `upgradeState` and `upgraded()`). It touches only entries with no `kind`, so a converted entry is never converted again. The map key's shape decides the target, because `address-` and `discuss-` name both finding and thread actions.

| Map key | Old `action` | New `action` |
|---|---|---|
| Item id (`i3`) or finding id (`f3`) | `explain-<id>`, `explain` | `explain` |
| | `help-<id>-<n>`, `step-<n>` | `step-<n>` |
| | `typed` | `type` |
| | `address-<id>`, `address` | `address` |
| | `discuss-<id>`, `discuss` | `discuss` |
| Thread (`<ref> thread <id>`) | `address-<threadId>` | `thread-address` |
| | `draft-<threadId>` | `thread-draft` |
| | `discuss-<threadId>` | `thread-discuss` |
| PR (`pr:<ref>`) | `resolve-<ref>` | `pr-conflicts` |
| | `address-all-<ref>` | `pr-address-all` |

- An entry whose action is not in the table is dropped. This covers legacy `open-` and `log-` entries, answers, Marks, Codex `fix`, and `check:` keys. Dropping costs at most one row's ✓.
- `kind` is `handoff` when `isHandoff` is true. When `isHandoff` is absent, it is `handoff` for `address`, `type`, `step-<n>`, `thread-address`, `pr-conflicts` and `pr-address-all`. Otherwise it is `talk`.
- `text`: a text starting `Sent to Claude to ` or `Sent to Codex to ` becomes `Address`. Otherwise a trailing ` sent` is removed, so "Explain sent", "Discuss sent", "Reply sent" and "<label> sent" become "Explain", "Discuss", "Reply" and "<label>".
- A second run of `upgradeState` or `upgraded()` changes nothing. Step 5 tests this.

`Presence.turnsStarted` and `turnsApplied`, `LastAction`, and the settle window live in atoms in the mod, so a restart loses them. Only the ledger comes back. That is true today and stays true.

## 8. Text a model reads

Method, from AGENTS.md: print each version's prompt for the same sample exchange, run each version 8 times with `claude -p --model sonnet --tools "" --system-prompt …`, and count the outcomes. Record the counts in the commit message.

`GUIDANCE`, `carryText`, `inboxText`, `closedText`, `answerNote`'s output and `messages.*` keep their exact bytes, except where listed below. Codex's `texts.ts` loses only `CHECK_REFUSAL`, which goes with its feature. Every send's `by` stays as today (4.3), because it decides which notes Claude and the inbox model read.

1. **Removing checks (step 1).**
   - Inbox model side: the `<checks>` bullet in `systemText`, and the `<checks>` block and `Exchange.checks` in `buildPrompt`. Codex's update uses the same functions.
     - Samples: a reply that says "fixed the parser; tests pass" with `npm test` in the activity, and an ordinary question exchange as a control.
     - Count: DONE or NOW lines that claim tests pass; new tasks asking the person to run tests; whether NEW and CLOSED match in the control; parse failures.
   - Claude side: Claude reads `GUIDANCE` and the tool list, which loses `run_check` with its description, schema and results. It also stops getting both Bash refusals and the claim send-back.
     - Sample: `GUIDANCE` with the tool list minus `run_check`, and a turn whose activity runs `npm test | tail`, then a reply that claims tests pass.
     - Count: replies that state a test result they did not see in full; replies that say the output was cut; replies that rerun the tests without `| tail`.
   - Why: owner decision 1. The removal is binding. The counts record its cost. Keep it if the control matches and there are no parse failures.
   - Removed with their features: `fixMessage`, `claimMessage`, `CHECK_REFUSAL` and `prompts.fix`. No text replaces them.
2. **Findings under UI 6.1(b) (step 9).** No wording changes. An addressed or discussed finding now stays listed in `inboxText` and in the update's `<findings>`.
   - Sample A: Address, then a reply that fixed it. Count `CLOSED: f..` lines from the per-turn update, and count runs where Claude, given `GUIDANCE` and the new `inboxText`, says it would close the finding. Target: 6 of 8 or more.
   - Sample B: Discuss, then "let's leave it for later". Count runs that keep the finding open. Target: 6 of 8 or more.
   - If sample A misses, add one line to `systemText` or `GUIDANCE`, and A/B that line before keeping the step.
   - If sample B misses, first try extending `runUpdate`'s Explain filter (it drops CLOSED lines for the explained item) to Discuss. That changes no model-read text. Otherwise add one line to `systemText` or `GUIDANCE` and A/B it.
3. **Reopen after Undo (step 10).** Version A only lists the item again and drops its id from `told.closed`. Version B also adds `Reopened by the user: [i3] "<ask>"` to the next notes.
   - Sample: the previous notes told Claude i3 closed as dismissed. The next prompt is unrelated.
   - Count replies that treat i3 as open. Ship A if 7 of 8 or more do, else B.
   - UI 2.3 says the next carry text "reports the item reopened". A is a literal departure from that wording. Section 10 lists it for the owner.
4. **The Codex `inbox` tool split (step 16).** The new text result and the reworded descriptions of `inbox` and `inbox_view`.
   - Sample: Codex's `GUIDANCE` as the system prompt, "what's waiting on me?", and the tool's text result.
   - Count replies that relay the open rows correctly and point to the Inbox tab without claiming it opened. Sonnet only approximates Codex's model, so also run the new version 3 times in Codex itself.

**The mod's `classic.Stop` hook.** Owner decision 1 names "the classic.Stop send-back" for removal. Two facts decide what that covers:
- In the mod, `classic.Stop` does two things. `blockOnClaim` sends Claude back over a claim; that is the inbox's own send-back, and it goes. Separately, `if (result.block) sentBack.push(reply)` records a reply that any other hook blocked, whether or not `blockOnClaim` ran. That capture is not a send-back. `sentBack` feeds the reply text the per-turn update reads, so removing it would change model-read input.
- In Codex, `turn.sentBack` is filled only by the claim guard (`codex/src/core.ts`), so it goes with the guard.

Step 1 therefore keeps the mod's hook, reduced to the capture. The owner confirms this reading before step 1 commits (section 10). If the owner meant the whole hook, step 1 removes it and adds an A/B of the reply text without other hooks' blocked replies.

## 9. Build steps

Each step is one commit in the `revamp` worktree, and fits one implementer.

Every step:
- ends with `./scripts/check.sh` passing;
- rebuilds the Codex bundles with `npm --prefix codex run build` when it touches `hooks/` or `types/`;
- formats with `npx -y prettier@3.9.9 --write .`;
- extends existing tests (`tests/hooks.test.ts` through `world()`, `tests/ledger.test.ts`, `tests/prs.test.ts`, `codex/tests/*.spec.ts`) and tests what gets drawn and saved, not source text;
- lists `hooks/demo.ts` and `codex/src/demo.ts` when it changes `Ledger`, `LastAction` or a view type, since the demo builds them as literals;
- lists `types/index.d.ts` when it adds, removes or reshapes an atom, since `PluginState` types every atom;
- updates AGENTS.md lines that name what it replaces;
- leaves `codex/plugin/hooks/hooks.json` byte for byte unchanged. Codex treats a changed hook definition as untrusted and skips it (UI 3.4), which would silently stop the per-turn update.

"Verify live" means: start a session with its own `CLAUDE_CONFIG_DIR`, as AGENTS.md describes, and press through the change. For Codex, load the plugin from `codex/plugin` and press through the tab.

### Step 0. Baseline

- **Goal:** a known passing start.
- **Do:**
  - In the worktree, run `npm --prefix codex ci` if `codex/node_modules` is missing, then `./scripts/check.sh`. If it fails on files this work did not touch, stop and report to the owner before step 1.
  - Check whether the main checkout still has uncommitted edits to `docs/plans/architecture.md`. If it does, ask the owner whether they will be committed first. Until they are, step 1 leaves that file alone, and its update moves to the first step after the branch is rebased onto them.
- **Commit:** none.

### Step 1. Remove session checks and PR Fix

- **Goal:** owner decision 1, as one separate commit.
- **Files:**
  - Delete `hooks/checks.ts`, `hooks/check-tracking.ts`, `hooks/tree.ts`, `hooks/git.ts`, `tests/checks.test.ts`, `tests/check-tracking.test.ts`.
  - `hooks/register.tsx`:
    - `run_check` with its describe, check and call hooks, and its `$.tool.register` in `turnOn`;
    - the Read and Grep log allow-list; the Bash interception and refusals;
    - `EDIT_TOOLS` and repo tracking; `repoTops`;
    - the `CHECKS`, `SNAPSHOTS` and `PR_FIXES_SENT` atoms;
    - `blockOnClaim`. Keep `classic.Stop`'s `sentBack` capture (section 8);
    - the check rows, group, band lines and count input; `checkRowId`;
    - `sendPrFix`, `prFixSentAt`, the PR check row's Fix, and `isFixSent` in `handoffs()`;
    - `home` and `tilde()`, which only check rows use.
    - `top` stays, since `repoPath` uses it.
  - `hooks/ledger.ts`: the `<checks>` bullet, the `<checks>` block, `Exchange.checks`.
  - `hooks/prs.ts`: `isFixSent` in `Handoffs` and `NO_HANDOFFS`; its uses in `prRowsOnYou`, `readiness` (the fix count) and `prAttention`; `failingText`'s `sent` parameter; `prompts.fix`.
  - `hooks/demo.ts`: `checks`, `prFixesSent`.
  - `types/index.d.ts`: `LeftCheck`, `CheckKind`, `Target`, `Check`, `Snapshot`, `Checks`, `PrFixSent`, and the `checks`, `snapshots` and `prFixesSent` atoms.
  - Codex:
    - `core.ts`, `state.ts`, `demo.ts`, `texts.ts`, `tab.tsx`;
    - `hook.ts`: replace `resolvePath` with Node's `path.resolve` for the apply_patch activity lines; `Stop` keeps `endTurn` and `startUpdate`;
    - `transcript.ts`: keep only `isExecRun`;
    - `tree.ts` renamed `run.ts`, with only `run` and `Run`, and its importers;
    - `codex/tsconfig.json` drops the deleted files; `codex/README.md`.
    - Not `codex/plugin/hooks/hooks.json`. Its matchers and the Stop timeout of 60 stay as they are, even where a matcher now serves no check.
  - Tests: `tests/hooks.test.ts`, `tests/prs.test.ts`, `codex/tests/hook.spec.ts`, `update.spec.ts`, `server.spec.ts`, `helpers.ts` (`commandEndLine`).
  - Docs: `GLOSSARY.md`, `docs/plans/codex-plugin.md`, `docs/reference/claude-code-mods.md` (its `run_check` line), and `docs/plans/architecture.md` unless step 0 deferred it. Mark `check-tracking.md` and `exact-check-results.md` as superseded at their top. AGENTS.md: the line naming `toolAnswer`.
- **Behavior:**
  - No failing-check rows, band check lines, `run_check`, Bash refusal or claim send-back.
  - The count is questions plus tasks that are not handed off.
  - A PR check row shows status and Open log only.
  - With no Fix, a failing PR check always counts in the band's PR alert. The commit says so.
  - Every send keeps its `by` exactly as today (4.3).
- **Tests:**
  - Delete every mod test that exercises checks; find them by grepping for `RUN_CHECK`, `run_check`, `claim` and `check`.
  - Remove `RUN_CHECK`, `toolAnswer` and `toolCalls`. Keep `world()`'s `tool.call` handler, because other tests call Bash through it.
  - The `/inbox demo` test: fix the first-row comment and its `next` press.
  - Change the PR Fix cases (`tests/prs.test.ts` readiness "fix sent", and the `hooks.test.ts` test that presses Fix) to assert there is no Fix and the check still counts.
  - Codex, `hook.spec.ts`: trim, do not delete, the two specs that also cover non-check behavior.
    - The session spec keeps its SessionStart guidance and `cliPath` assertions, a resume returning null, `UserPromptSubmit` recording `person`, and `Stop` ending the turn into `pending` and calling `startUpdate`. It drops the check, `top` and claim assertions.
    - The patch spec keeps `edited <path>` in `turn.activity`, which covers the `path.resolve` change. It drops `checks.repos`.
  - Codex: delete the refusal spec. Extend the `upgraded()` spec with an old file holding `checks`, `snapshots`, `recordedRuns`, `top` and `turn.sentBack`, and assert they are gone.
- **Saved state:**
  - `upgradeState` drops `SETTLED` entries of kind `check`.
  - `upgradeState` drops `LAST_ACTIONS` entries keyed by a check row id, and entries whose action starts with `fix-` (a PR check's Fix).
  - `session.end` stops clearing removed atoms.
  - `upgraded()` deletes the dead keys.
- **Model-read:** A/B 1, both sides.
- **Owner:** confirm the `classic.Stop` reading (section 8) before committing.
- **Verify live:** a session where Claude runs `npm test | tail` runs it untouched; a reply claiming tests pass is not sent back; a PR with a failing check shows status and Open log.

### Step 2. Ledger groundwork

- **Goal:** the pure ledger functions later steps need.
- **Files:** `hooks/ledger.ts`, `types/index.d.ts`, `hooks/demo.ts`, `codex/src/demo.ts`, `tests/ledger.test.ts`.
- **Behavior:**
  - `closedRecord` keeps `item`.
  - New `closedFindings`, `closeFinding`, `reopenItem`, `reopenFinding`.
  - `closeByAgent` and `applyUpdate` move a closed finding into `closedFindings` with its `how` and `outcome` (section 7), instead of only deleting it.
  - `questionNumbers(ledger, promptTurn)` follows section 3's rule. It and `answerNote` share `answerableBatch` and `batchNumbers`; `answerNote` passes `ledger.turn`. `answerNote` does not call `questionNumbers`, because it also answers tasks by number.
  - Nothing draws these yet.
- **Tests:**
  - `reopenItem` puts `i2` back before `i10`, with its options.
  - A closed finding round-trips, and a finding closed with an answer records `answered`.
  - `questionNumbers` on a mixed batch of question, task, question, with no labels, gives the second question 3. With a numeric label on any item, unlabeled items get no number.
  - The existing `answerNote` cases pass unchanged.
  - `upgradeLedger` fills `closedFindings` on an old ledger.
- **Saved state:** `upgradeLedger`, so both hosts convert.
- **Model-read:** none. `answerNote`'s output is unchanged, and no text reads `closedFindings`.
- **Verify live:** none needed beyond the tests.

### Step 3. `hooks/view.ts` in the mod: order, count, handles, status

- **Goal:** one order, count and numbering for the band, pane, sidebar line and row navigation.
- **Files:** new `hooks/view.ts`; `hooks/register.tsx`; `hooks/presses.ts` (`isHandedOff` rename, still reading `isHandoff`; `stepsOf` from `itemSteps`); `codex/src/core.ts` (the import renamed to `isHandedOff`, so the Codex bundle still builds); the rebuilt Codex bundles; `hooks/demo.ts`.
- **Behavior:**
  - `needsYouCount`, `listedItems`, `tabRowIds`, the pane's `rows` and `tabCounts`, `publishStatus`'s filter, and the previous card's count read `inboxView`.
  - Needs you order and handles follow section 3.
  - "Tasks" replaces "Your tasks". `Nothing needs you.` replaces the two group lines.
  - Status words follow UI 2.6, through `perTurnStatus`.
  - Settled rows still come from `SETTLED` in this step. `inboxView`'s settled rule lands in step 10; until then the mod passes `settleWindowMs: 0`, so a close is never drawn twice.
- **Tests:** in `hooks.test.ts`, an older question stays open: it draws `?`, and the latest batch draws `1)` and `2)`. Typing "1 yes" gives a note naming the row drawn as `1)`. The band count equals the tab count.
- **Saved state:** none.
- **Model-read:** none.
- **Verify live:** answer by typing "1 yes" with an older question open; check the right question closes.

### Step 4. Codex reads `hooks/view.ts`

- **Goal:** the tab shows the same order, count, handles and empty text as the mod.
- **Files:** `codex/src/core.ts` (`viewOf` calls `inboxView`, and `perTurnStatus` with `isUpdating: presence.isUpdating || pending.length > 0`), `codex/src/tab.tsx` (draws `RowView`; drops its own grouping and handle code), `codex/tests/press.spec.ts`.
- **Behavior:** as step 3, in the tab.
- **Tests:** a `viewOf` spec for order, count and `?` handles, and one that reads `Updating…` while `pending` is not empty.
- **Saved state:** none.
- **Model-read:** none.
- **Verify live:** open the tab on a session with an older open question.

### Step 5. Press kinds and stored action ids

- **Goal:** every press declares a kind; feedback follows the kind.
- **Files:**
  - `types/index.d.ts`: `LastAction.kind`, `PressKind`, the `optionsShown` atom;
  - `hooks/presses.ts`: `actionId`; `isHandedOff` reads `kind`;
  - `hooks/view.ts`: `ActionView`, `Feedback`, `feedbackText`; question actions include steps;
  - `hooks/register.tsx`:
    - `Action.kind` replaces `done` and `handsOff`, and `withLastAction` reads the kind;
    - letters go only on the first 9 options and steps;
    - every option draws, with [All N options] past 5;
    - the recommended option keeps `variant: 'primary'` and drops ` (recommended)`;
    - `isThreadSent` in `handoffs()` reads `kind`;
  - `codex/src/state.ts` (shared `LastAction`), `codex/src/core.ts`, `codex/src/tab.tsx`;
  - `hooks/demo.ts`, `codex/src/demo.ts`;
  - AGENTS.md: the `Action.done` paragraph.
- **Behavior:**
  - Feedback reads `✓ Label`. "Address it" becomes "Address".
  - A question with 7 options shows 4 and [All 7 options]; pressing it shows all 7, and only the first 9 options and steps get letters.
  - A question's help steps draw after its options, in both hosts, as today.
  - The Codex tab draws the recommended option as primary.
- **Tests:**
  - A 7-option question, in the pane and in `viewOf`.
  - A question with a help step draws the step after its options and before Type an answer, in the pane and in `viewOf`.
  - An old `LastAction` with `isHandoff: true` still folds its task after `upgradeState`.
  - An old Codex file with "Explain sent" reads `✓ Explain`.
  - One old entry per row of the conversion table converts as listed, and running `upgradeState` twice changes nothing the second time. The same for `upgraded()`.
- **Saved state:** the LastAction conversion in section 7, in `upgradeState` and `upgraded()`. The shared `LastAction` keeps `tab`, `title` and `index` as optional fields until step 9 removes their readers, so the Codex type can be replaced now. `session.end` resets `OPTIONS_SHOWN`.
- **Model-read:** none.
- **Verify live:** Explain on a task reads `✓ Explain` and "Explain again" in both hosts.

### Step 6. The shared reducer, the press runners and drafts

- **Goal:** one press path per host, built on `applyPress`, for row and PR presses, with one draft store.
- **Files:**
  - `hooks/presses.ts`: `applyPress`, `RowPress`, `Effect`;
  - `hooks/register.tsx`:
    - `runPress`, `PrPress` and `applyPrPress`; the PR Buttons (thread Address, Draft reply, Discuss and Open; Resolve conflicts; Address all; Open PR; Open log) move onto `runPress`;
    - the `NOTES` and `DRAFTS` atoms, with `Input.onInput` writing `DRAFTS`;
    - delete `sendAnswer`, `actOnFinding`, `removeFinding`, the press use of `close`, and `useStep`;
  - `types/index.d.ts`: the `notes` and `drafts` atoms;
  - `codex/src/core.ts`: `press()` removed;
  - `codex/src/server.ts`: calls `applyPress`; writes `sent` itself; checks `thread`; returns the stale note in the reply;
  - `codex/src/tab.tsx`: sends `RowPress` and `thread`; shows the stale note from the reply;
  - tests.
- **Behavior:**
  - Unchanged from the person's view, except for two things. A press on a row or PR thread that left or changed reads `This changed before your press. Nothing was sent.` And an answer is sent by its text.
  - A stale typed press keeps the typed words in the field, in both hosts.
  - The draft is per row from here. [Send] and [Cancel] arrive in step 12.
  - Findings keep today's behavior in this step: Address, Discuss and a typed reply still remove the finding through the reducer. The mod's runner adds `tab`, `title` and `index` to that last action, as `withLastAction` does today, so the removed finding still settles in place. Step 9 changes all of this.
- **Tests:**
  - Rewrite `codex/tests/press.spec.ts` against `applyPress`: effects, stale results, Run step hand-off, Address, and a Run step on a question.
  - In `hooks.test.ts`, a press on a question Claude just closed shows the stale note and sends nothing. A typed answer to it keeps its words in `DRAFTS`.
  - Thread Address on a thread that left the PR shows the stale note.
  - Codex: a stale typed send keeps the field's text in the tab. An `inbox_press` whose `thread` differs from the call's session reads stale.
- **Saved state:** `NOTES` and `DRAFTS` default to `{}`; `session.end` resets both.
- **Model-read:** none. `messages.*`, `prompts.*` and every `by` are unchanged.
- **Verify live:** answer, Explain, Done, a Run step and thread Address in both hosts where they exist. Check the field keeps the cursor in place while typing with `onInput` redraws.

### Step 7. Local results on the row

- **Goal:** opens and copies show pending, then a result, with no toasts.
- **Files:** `hooks/register.tsx` (the effect performer writes one `result` per press; `openUrl`, `openPath` and help-step toasts go; Open, Open PR, Open log and thread Open are Local presses), `hooks/view.ts` (`feedbackText` wording per look; feedback order), `codex/src/server.ts` (second `updateState` for open results), `codex/src/tab.tsx` (copy notes), tests.
- **Behavior:**
  - `Opening x…`, then `✓ Opened x` or a red reason.
  - A copied command's note names where to run it, per surface. A step with several helps gives one note.
  - A success note clears after 5.12 s; a failure stays until the next press.
  - A Local press never changes a row's hand-off: it keeps `kind`, `turnsStarted`, `delivery` and `at`.
- **Tests:**
  - An Open step on a missing file shows the red note and no toast.
  - A copy step's note in the terminal; a mixed step's combined note.
  - A thread sent to Claude stays folded after its Open is pressed behind Details.
  - A handed-off task stays folded, and out of the count, after its Open or Copy step is pressed.
- **Saved state:** none new; `result` is part of step 5's `LastAction`.
- **Model-read:** none.
- **Verify live:** Open on a file, on a moved file, and Copy on a terminal step.

### Step 8. Demo on a copy

- **Goal:** UI 2.10 in both hosts.
- **Files:** `hooks/register.tsx` (`DEMO` atom replaces `IS_DEMO`; `runPress` applies presses to it; delete `DEMO_PRESSES`, the Button wrap and `showSample`; banner with [Hide demo] in the band and pane), `types/index.d.ts` (`demo` replaces `isDemo`), `hooks/demo.ts` (`DemoCopy`, with `turns`), `codex/src/server.ts` and `tab.tsx` (sample note, banner).
- **Behavior:** a sample press settles, folds or Undoes on the copy, sends nothing, and reads `Sample entry: nothing was sent.` [Hide demo] leaves the demo.
- **Tests:** extend the `/inbox demo` test: a sample Done settles, nothing is sent, the ledger in `$.store` is unchanged, [Hide demo] restores the real rows. Codex: a demo press leaves saved state alone.
- **Saved state:** `DEMO` atom default null; `session.end` resets it; `upgradeState` nulls an old-shaped `DEMO`.
- **Model-read:** none.
- **Verify live:** `/inbox demo`, press through, [Hide demo].

### Step 9. Findings under UI 6.1(b)

- **Goal:** Address and a typed reply hand a finding off; Discuss keeps it open; leaving findings go to a Closed fold.
- **Files:** `hooks/presses.ts`, `hooks/view.ts` (finding fold, Findings Closed fold), `hooks/register.tsx` (delete the `LAST_ACTIONS` settle path in `findingsView` and `followNewRows`), `types/index.d.ts` (drop `LastAction.tab`, `title`, `index`), `codex/src/core.ts` (drop `leaving`), `codex/src/tab.tsx`, `hooks/demo.ts`, `codex/src/demo.ts`.
- **Behavior:** Address folds the finding to `✓ Address · just now [Details]`, and it unfolds by the turn rule if Claude's reply leaves it open. Discuss shows `✓ Discuss` and stays open. A finding leaves only when Claude closes it or the person dismisses it, then shows under `▸ N Closed`. In this step a dismissed finding leaves at once; step 10 adds settling.
- **Tests:** in `hooks.test.ts` and `press.spec.ts`: Address folds, then unfolds after an applied turn that leaves it open; Discuss stays open; a `close` call moves it to the fold.
- **Saved state:** `upgradeState` and `upgraded()` drop the three `LastAction` fields.
- **Model-read:** A/B 2. Keep the step only if the counts hold.
- **Verify live:** Address a finding with a real reply, and Discuss one with "later".

### Step 10. Settled rows from the ledger, and Undo

- **Goal:** every close settles in place in both hosts, and Marks get Undo.
- **Files:** `hooks/view.ts` (settled rows), `hooks/presses.ts` (`undo`), `hooks/register.tsx`, `types/index.d.ts` (drop `settled`), `codex/src/core.ts` and `server.ts` (`undo`, `told`), `codex/src/tab.tsx` (delete `applyView` and `leftText`; first-sight settle timing; the fold rule; [Undo] selects the row), `hooks/demo.ts`, `codex/src/demo.ts`.
- **In `register.tsx`:**
  - Delete `SETTLED`, `settle`, `showSettled` and `expireSettled`. Pass `settleWindowMs: SETTLED_MS`.
  - The leave redraw stays. With `SETTLED` gone, it bumps `LAST_ACTIONS` with a spread (`a => ({ ...a })`), as `recordLastAction`'s loop does today.
  - `turnOn` re-arms it after a reload until the latest of these ends: each close's `at`, each closed finding's `closedAt`, each live Local `result.at` and each row note's `at`, each plus `SETTLED_MS`.
  - PR Dismiss and its Undo, per 4.5. Undone ids leave `told.closed`.
  - Undo selects the restored row.
- **Behavior:** Done or Dismiss on an item, a finding's Dismiss and a PR's Dismiss settle with [Undo]. Undo puts the row back where it was, open. A close by Claude or by the update settles with no Undo. A settled row is not also listed under Closed.
- **Tests:**
  - Dismiss then Undo restores the row with its options, open and selected, in both hosts.
  - A reload during the window still shows the settled row, and it is gone after the window ends.
  - Undo then a second close is reported in the next notes.
  - PR Dismiss then Undo brings the block back.
  - An `undo` on an answered or expired item reads stale.
  - In the Codex tab, a close the server still lists as settled after the tab's own 5.12 s shows in the Closed fold.
- **Saved state:** the `SETTLED` atom is no longer read.
- **Model-read:** A/B 3.
- **Verify live:** Dismiss and Undo in both hosts; let Claude close an item and watch it settle.

### Step 11. Delivery states

- **Goal:** Queued, then ✓, or Not sent, for every send: row presses and PR presses.
- **Do first (spike):** check whether `claude plugin test` raises `session.append` (door `prompt`, origin plugin `inbox`) for the mod's own `$.prompt.submit`. If it does, the tests drive arrival through it. If it does not, test arrival through the function the append hook calls, and say so in the commit.
- **Files:** `hooks/register.tsx` (`send` returns the submit result; the `session.append` hook sets arrived; the failure path: `reopenOnFailure`, and undoing `told`, `person`, `press` and `contextFor`; `publishStatus` after each), `hooks/presses.ts` (`reopenOnFailure`, `retryOf`; `isHandedOff` checks delivery), `codex/src/server.ts` (`queuedId`, failure state), `codex/src/core.ts` (`notePrompt` sets arrived), `codex/src/state.ts`, `codex/src/tab.tsx` (Sending…).
- **Behavior:** a press during a turn reads `Queued: X` until the prompt enters, then `✓ X`. A dropped or failed send undoes the press and shows `Not sent: <reason>` with [Try again]; a typed draft comes back. `isThreadSent` also ignores a thread whose send failed.
- **Tests:**
  - Mod: add a `world()` variable for the `prompt.submit` answer. Do not assume `submit` stays pending during a turn: it may resolve once the prompt is queued.
    - A press while a turn runs reads Queued until the append, then ✓.
    - A `{ drop }` answer reopens the answered question with the red note. The next exchange's `<person>` holds no unsent text.
    - Thread Address during a turn reads Queued. A dropped submit unfolds the thread with `Not sent`.
  - Codex: `fakeRunner` prints `Queued message q1`; a matching `UserPromptSubmit` gives ✓; a failed queue leaves the row with the failure.
- **Saved state:** `upgraded()` defaults `sent[].row` and `queuedId` to null.
- **Model-read:** none. The failure path keeps unsent text out of the next update's input.
- **Verify live:** press Explain during a long turn in both hosts.

### Step 12. Selection, the press guard and the new-row bar

- **Goal:** UI 6.3(a), the 0.4 s guard, [Send] and [Cancel] on the field, and UI 2.8's bar on every new row.
- **Files:** `hooks/register.tsx` (`selectedIndex`, the render-time default, `openPane`, `select`, `jumpTo`, `followNewRows`, Undo's selection, `Cursor.openedAt`, the +400 ms redraw, [Send] and [Cancel], `ARRIVAL` and `NEW_ROW_MS`), `types/index.d.ts` (`Cursor`, `arrival`), `codex/src/tab.tsx`.
- **Behavior:**
  - The top row opens with the pane. A tab never opened in this conversation draws its top or first row open.
  - No row opens after a press.
  - Buttons are dim and ignore clicks for 0.4 s after their row opens, while hotkeys work at once.
  - Every row `newRows()` reports gets the bar for 1.5 s, not only the row the pane jumped to. `followNewRows` records `{ ids, at }` in `ARRIVAL` and schedules one redraw at `at + NEW_ROW_MS`. `ARRIVAL_MS` is deleted. `turnOn` re-arms that redraw after a reload while the bar is live.
- **Tests:**
  - After Done settles and leaves, no row is selected.
  - A click 100 ms after a row opens does nothing, and at 500 ms works. A hotkey press at 100 ms works.
  - [Cancel] closes the field and keeps the draft; the draft survives selecting another row.
  - A row added by an update draws the bar without a tab jump, and not after 1.5 s.
  - The existing tests that mount the pane without `/inbox` and press `help-i1-0-key` or `next` still pass through the render-time default.
- **Saved state:** `upgradeState` fills `openedAt` and nulls an old-shaped `ARRIVAL`; `session.end` also resets `SELECTION`, `UNFOLDED`, `SHOWN_DETAILS`, and the item and finding last actions (section 7).
- **Model-read:** none.
- **Verify live:** double-click a closed row's title; check the second click does nothing.

### Step 13. The band, refused tools and an unreadable inbox

- **Goal:** UI 3.1's band, and the mod's UI 2.7 error states.
- **Files:** `hooks/register.tsx` (`bandState`, the band hook, `turnOn`, `loadConversation`, PR fetch [Retry]).
- **Behavior:**
  - Line 1 leads with [Open inbox], the count and the top row, then the finding count, the PR alert and settled hints. [Open inbox] opens the pane with the top row open.
  - The away layout gains the count line. Every state is cut to `maxRows`, keeping line 1.
  - A failed PR fetch shows [Retry].
  - **Refused tools.** `turnOn` catches each `$.tool.register` call on its own, so a refusal never stops `turnOn` before `loadConversation`. Today they share one `Promise.all`, and a rejection would stop the mod from loading. First confirm how a refusal surfaces: the result type is `{ tool }`, so a refusal is expected to reject. A caught failure sets `toolsRefused`, and the status line reads UI 2.7's red text.
  - **Unreadable.** `loadConversation` catches a failed `$.store.get` of the saved session. Needs you then shows `Could not read the inbox.` with [Try again], which runs the read again, instead of an empty list that reads as "all clear".
- **Tests:**
  - Band line 1 in the default, working and away states; a band with `maxRows` 3 keeps line 1.
  - [Open inbox] opens the pane on the top row.
  - A `tool.register` answer that rejects shows the red status, and the mod still loads the conversation.
  - A `$.store.get` that rejects shows `Could not read the inbox.`, and [Try again] with a working store shows the rows.
  - [Retry] fetches again.
- **Saved state:** `unreadable`, the conversation whose saved session the store could not read. A reload keeps it, so saves still skip that copy. `toolsRefused` is a module flag.
- **Model-read:** none. The band is not model-read.
- **Verify live:** the band in each state in a terminal session. Also run the "context skipped" check: in a session whose managed settings skip the mod's `prompt.compose`, check whether its hook has run by the first `turn.start`. Record the result for section 10.

### Step 14. The desktop drawing branch

- **Goal:** UI 3.2.
- **Files:** `hooks/register.tsx`, `tests/hooks.test.ts`.
- **Behavior:** the `look` table in 6.1.
- **Tests:** mount the pane with `surface: 'desktop'` (the harness passes it to `$.ui.mount`). Assert no key letters, no hidden hotkey Buttons, no Keys drawer or key hints, one Button per tab, no close Button of the mod's own, and closed rows at 36 columns without their age.
- **Saved state:** none.
- **Model-read:** none.
- **Verify live:** a desktop Code-mode session; resize the pane across 50 columns. Run live check 4. Each result has a set outcome:
  - `Input` does not paint: set `DESKTOP_TYPING` false.
  - A Button ignores `dimColor`: draw a guarded row's buttons as muted Text until the guard ends, so an ignored press still shows why.
  - A Button ignores `variant`: keep ` (recommended)` on desktop.
  - `Markdown` does not draw: draw review-thread bodies as plain Text.
  - Toasts do not draw: nothing changes, since no action reports only through a toast.
  - `/inbox demo` does not work as a typed command: add a [Show demo] Button to the desktop pane's footer.

### Step 15. The Codex tab's states and the `heard` record

- **Goal:** UI 3.4's remaining tab parts.
- **Files:** `codex/src/hook.ts` (records `startAt`, `promptAt`, `prompts`, `promptTurns`, `stopAt`, `stops`), `codex/src/server.ts` (a model tool call can set `promptMissedAt`), `codex/src/core.ts` (`heardState`), `codex/src/state.ts`, `codex/src/tab.tsx`.
- **Behavior:**
  - Status words at the right of the tab row.
  - **Not heard.** The text shows when no hook ran, when `promptMissedAt` is set, or when `prompts >= 2` and `stops === 0`. The partial line names the cost.
  - **`promptMissedAt` compares turns, not times.** A model tool call sets it only when the `turn_id` in its `x-codex-turn-metadata` is not among `promptTurns`. The time rule (`promptAt` null or older than `stopAt`) is only the fallback for a call with no turn id. Another plugin's Stop hook can send Codex back within the same turn, so a time comparison would wrongly mark a working session as not heard.
  - Loading, Unreadable with [Try again], No connection, Polls failing.
  - No key text in the footer. The first-sight new-row bar.
  - The empty-tab jump (6.2).
- **Tests:**
  - `hook.spec.ts`: each event updates `heard`, and an old file reads as heard.
  - `press.spec.ts`: `viewOf` reports not heard for each of the three rules. A tool call in a recorded turn after a Stop does not set `promptMissedAt`.
  - A tab spec: with Needs you empty, a poll that adds a finding switches to Findings.
- **Saved state:** `heard` defaults in `upgraded()`.
- **Model-read:** none.
- **Verify live:** a thread with the plugin's hooks untrusted shows the not-heard text.

### Step 16. Split the Codex `inbox` tool

- **Goal:** a model call no longer mounts the tab inline.
- **Files:** `codex/src/server.ts`, `codex/src/texts.ts`, `codex/tests/server.spec.ts`.
- **Behavior:** `inbox` returns text only. `inbox_view` carries the `resourceUri`, the `thread` entrypoint and `visibility: ['app']`, with a description saying it is for the tab only.
- **Tests:** the `tools/list` shapes; the text answer for a sample state.
- **Saved state:** none. The entrypoint's tool name changes; the commit flags it.
- **Model-read:** A/B 4.
- **Verify live:** live check 5: the tab opens from the side panel, and a model call to `inbox` shows text. If the tab does not open, use the `inbox_tab` fallback in 6.2.

## 10. Out of scope now, and what waits on the owner

**Out of scope.**
- Claude mode (UI 6.2(b)). Nothing is built: no `inbox-chat` server, record tools for questions and tasks, card, full view, chat key, or host adapter. Sections 5 and 6.3 keep its seams.
- The "context skipped" status (UI 2.7), until step 13's live check shows the mod can tell when `prompt.compose` did not run. If it can, building the red status is a follow-up to step 13. Until then an org-guarded session that skips the mod's context shows an inbox Claude cannot see, with no sign.
- A PRs tab in Codex (UI 3.4).
- Moving the pane's drawing out of `register.tsx`.

**Live checks that change a step.**
- Check 4 (desktop `Input`, `dimColor`, `variant`, `Markdown`, toasts, typed `/inbox demo`) sets the outcomes listed in step 14.
- Check 5 (Codex entrypoint on an app-only tool, queued message editing, queue ids, whether the tab stays open across threads) decides the fallback in step 16, and whether arrival can match by id instead of text.
- The "context skipped" check in step 13 decides whether that status is built.

**Waits on the owner.**
- **The `classic.Stop` reading**, before step 1 commits. The mod keeps the capture of replies other hooks blocked, and only the claim send-back goes (section 8). Removing the whole hook would be a model-read change.
- **`docs/plans/architecture.md`**, before step 1. The main checkout has uncommitted edits to it, so step 1's edit would conflict with them (step 0).
- **Codex keys under owner decision 3**, before step 12. UI 2.9 keeps them; owner decision 3 calls keys terminal-only. This plan keeps them per UI 2.9 (6.2).
- **The reopen wording.** If A/B 3 picks version A, the next carry text lists the reopened item but does not say "reopened", which departs from UI 2.3's wording. The owner may require the explicit line.
- **Terminal links stay Buttons**, departing from UI 3.2's `Link` (6.1).
- **A failing PR check always counts** in the band's PR alert once Fix is gone.
- **Wire and stored-name changes:** `isHandoff` to `kind`; `LastAction.action` values; the `ARRIVAL` atom's shape; `TabPress` to `RowPress` with the option as text and a `thread` field; the `thread` entrypoint's tool name; the removed Codex keys. Each has its conversion in section 7.
- **The UI 6 defaults** stay overridable. An override changes these steps: 6.1(a) or 6.1(c) changes step 9; 6.3(b) changes step 12; 6.4(a) adds answer buttons to step 13.
