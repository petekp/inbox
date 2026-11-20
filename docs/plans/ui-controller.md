# The shared UI controller

Status: building

The controller is built (PR 2.1). No look uses it yet. PRs 2.2 to 2.5 move the looks onto it, one look per PR.

Each look decides for itself which tab it shows, where its cursor goes, when a draft is deleted and when it redraws. The five looks have drifted apart on these rules. `hooks/ui-controller.ts` holds one copy of them as pure code. It does no IO, imports no host and sets no timers. [The files table](../looks/files-shared-controller.md) lists its files.

## How a host uses it

1. Before every event, the host builds the view: `sessionView(session, now, SETTLED_MS, holdsOf(ui, now), notesOf(ui))`.
2. It calls `reduceUi(ui, view, event, now)` and keeps the `ui` that comes back.
3. It runs each command: send a press, save a collapse, read the session, focus a field, scroll a row into view, record the shown tab, or send the demo's reply.
4. It sets one timer for `nextWakeAt` and sends `tick` when it fires. Work that comes due also runs on any other event, so a late or dropped timer loses nothing.

The events are the person's input, the look opening, closing or showing again, a read of the session, a press's answer, and `tick`. Pointer moves count as list input. So a resting pointer holds back a move only until `FOLD_QUIET_MS` has passed since it last moved.

`LookConfig` carries the three differences on purpose the controller reads: whether running marks need a wake per frame, how the look draws the title tint, and whether Undo is timed from the session's close or from the look's first read of the row.

## The rules

The press guard keeps a second press by the same input from landing on a row that input just opened. The owner tables name each rule and its function:

- Tabs and following: [Owners: tabs and lists](../looks/owners-tabs-and-lists.md).
- The cursor and the press guard: [Owners: row folds and keys](../looks/owners-rows-folds-and-keys.md).
- Drafts and presses that give up: [Owners: presses](../looks/owners-presses.md).

`tests/ui-controller-*.test.ts` checks each rule through `reduceUi`.

## Moving each look onto it

Each PR deletes the look's own copy of the rules, listed in [Owners: rules written twice](../looks/owners-written-twice.md). It updates the look's rows in Differences on purpose, such as "Reply while its send is out". It adds a `FeatureId` row where a change below is a feature.

### omp panel (PR 2.2, done)

The panel runs on the controller. It keeps its line layout, button focus and page scroll. Its per-session drafts become a map of the controller's state, saved through `OmpState` and converted in `upgraded` in `omp/src/state.ts`. Its `LookConfig`: running marks as frames, the title tint in steps, Undo from the session's close. What changes for the person:

- It opens on Asks only when a row waits there, and otherwise keeps the Status page.
- It does not follow rows that arrive while Help shows or while keys came within `FOLD_QUIET_MS`.
- Each tab keeps its own cursor, so switching back returns to the same row.
- A cursor whose row left lands on the first waiting row from its place, not from the top.
- A close by the agent moves the cursor too, once keys go quiet.
- After View opens an ask, the guard blocks only key presses on that row, for `PRESS_GUARD_MS`, not every key.
- A refused press's error shows on its row, not under the tabs.
- A refused or stale reply reopens its field when the person has not moved.
- A reply's draft stays until the reply arrives, not only until the press is confirmed.
- It wakes when something changes, instead of polling every 200 ms.

### Herdr look (PR 2.3)

The look keeps its press queue and per-row refusal. `left[sessionId]` stores the controller's state. Its `LookConfig`: running marks pulsed, the title tint in steps, Undo from the session's close. What changes:

- It moves to another tab when the shown tab is empty and rows arrive (#675).
- Opening the look, or switching to another session, shows Asks when a row waits there.
- Each tab keeps its own cursor, and new rows can open with no row picked.
- A click that opens a row guards that row's buttons from a second click for `PRESS_GUARD_MS`.
- A close by the agent waits while the list was used within `FOLD_QUIET_MS`.
- A refused or stale reply reopens its field only when the person has not moved. Today the field stays open on a refusal whatever the person did.
- Drafts follow the shared rule, which differs from `herdr/src/out.ts:isSentConfirmed` in six ways:
  - It reads the last action's `at` instead of waiting for `lastPress` to name the press.
  - It compares `at`, not the whole last action as JSON.
  - It checks that the reply is the sent text.
  - It waits while the delivery is `held`, not only `queued`.
  - It keeps one sent reply per row, which a new reply replaces.
  - When the last action vanishes, it deletes the draft only after a confirmed press.

### Codex tab (PR 2.4)

Row motion and the leaving-row wait stay in the look. `Kept` goes to version 3 and saves `restoredUi(ui)` across a page swap. An older page reads only version 1, so the page writes version 3 with the version 1 fields and reads all three. Its `LookConfig`: running marks pulsed, the title tint animated by the page, Undo from the first read. What changes:

- It opens on Asks only when a row waits there, on page load or when the page shows again, and otherwise keeps the Status page.
- A page shown again only reconsiders Asks. Its fold timing and new-row tint go on.
- It does not follow rows that arrive while Help shows or while the list is in use.
- A resting pointer holds folds, arrivals and an agent's close only until `FOLD_QUIET_MS` after it last moved.
- New PR rows can open when no PR row is picked.
- It wakes on its own when a send turns Queued, a Compare times out or a PR read is due, not at the next 3-second poll.
- When the agent closes the cursor's row, the cursor goes to the next waiting row from that place, not the row now at its index.
- A key no longer starts the press guard. The one exception is View opening an ask by key, which guards that row's key presses.
- A stale reply reopens its field only when the person has not moved.
- A reply's draft stays until the reply arrives.
- After a page swap, Undo keeps its time and a refused press's text stays.

### Terminal and desktop (PR 2.5)

`PluginState.inbox` saves the controller's state in place of the mod's tab, page, selection, Status selection, typing, drafts, discards, shown time, notes, folds, Help and shown options. `upgradeState` in `hooks/register.tsx` converts the old fields once. One timer replaces the Undo-end, fold, timed-change, guard and Queued timers. Its `LookConfig`: the terminal draws running marks as frames and the title tint in steps, desktop pulses the marks and draws the tint once at its end, and both time Undo from the session's close. What changes:

- `/inbox` shows Asks when a row waits there. The band's Open inbox no longer leaves the Status page.
- When the cursor's row leaves or stops waiting, including a close by the agent, the cursor goes to the next waiting row from that place, never to a handled row.
- The guard is unchanged for Buttons. The engine does not say whether a Button was clicked or pressed by its hotkey, so the mod sends every Button press as a click. The pane's own keys, such as `j` and `k`, no longer start the guard.
- New PR rows can open when no PR row is picked.
- A reply's draft stays through its send and until the reply arrives. Reply pressed meanwhile opens with the sent words. A reply queued mid-turn keeps its words if it is refused at the turn's end, since a press does not give up while its message is held or queued.
- A refused or stale reply reopens its field when the person has not moved.
- Drafts survive loading another conversation and coming back.
- Arrivals and an agent's close wait while the pane was used within `FOLD_QUIET_MS`.

### Exact web and iOS

The private Exact clients are one TypeScript app, built for web and for iOS. When their Milestones 4–5 UI starts, they call `reduceUi` directly, with their own `LookConfig`. They take the reserved `exact-web` and `exact-ios` parity slots, which join `PUBLISHED_LOOKS` in `hooks/clients.ts` as [the look map](../looks.md) describes. Their first step is to check that the iOS build can bundle an import from `hooks/`.

## Other sessions' state

A host keeps another session's state only while it holds a draft or a sent reply, and at most the 20 most recently shown (`keptUiStates`). Every other session starts from `freshUi`. omp saves a session's state in that session's own file, and only while it holds a draft or a sent reply (`isUiWorthKeeping`). `omp/src/state.ts:pruneSessions` keeps at most `KEPT_SESSIONS` session files, so what omp saves stays bounded too. After a reload, `restoredUi` drops the presses still out, the demo's replies, and the arrivals and closes held while the list was in use, since no answer or timer survives a reload.
