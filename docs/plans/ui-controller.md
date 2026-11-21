# The shared UI controller

Status: building

The controller is built (PR 2.1). PRs 2.2 to 2.5 move the looks onto it, one look per PR. omp, Herdr and the Codex tab run on it, and PR 2.5 moves the terminal and desktop onto it.

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

- It opens on the tab it was last on. A row tab gives way to Asks when a row waits there. The Status page stays even then.
- It does not follow rows that arrive while Help shows or while keys came within `FOLD_QUIET_MS`.
- Each tab keeps its own cursor, so switching back returns to the same row.
- A cursor whose row left lands on the first waiting row from its place, not from the top.
- A close by the agent moves the cursor too, once keys go quiet.
- After View opens an ask, the guard blocks only key presses on that row, for `PRESS_GUARD_MS`, not every key.
- A refused press's error shows on its row, not under the tabs.
- A refused or stale reply reopens its field when the person has not moved.
- A reply's draft stays until the reply arrives, not only until the press is confirmed.
- It wakes when something changes, instead of polling every 200 ms.

### Herdr look (PR 2.3, done)

The look runs on the controller. It keeps its press queue and per-row refusal, its drawing, motion and springs. `left[sessionId]` keeps the controller's state of each session the look left, in memory only, as the look kept its state before. Its `LookConfig`: running marks pulsed, the title tint in steps, Undo from the session's close. What changes for the person:

- It moves to another tab when the shown tab is empty and rows arrive ([#675](https://github.com/petekp/inbox/issues/675)).
- Opening the look, or switching to another session, shows Asks when a row waits there.
- Each tab keeps its own cursor, and new rows can open with no row picked.
- A click that opens a row guards that row's buttons from a second click for `PRESS_GUARD_MS`.
- A close by the agent waits while the list was used within `FOLD_QUIET_MS`.
- A pointer moving or a wheel scrolling over the list counts as list use, so it holds a due fold, an arrival and an agent's close ([#673](https://github.com/petekp/inbox/issues/673)).
- A refused or stale reply reopens its field only when the person has not moved. A refused goal reopens its field on the Status page too, in the looks that run on the controller, omp and Herdr.
- While Help shows, a row's keys do nothing, as the shared Help rule says, so `u` no longer sends Undo there. A row that arrives under Help starts its title tint when Help closes.
- A session the look left keeps its press queue while a press is out or an ended press has not reached the controller, so a second switch loses no press's end.
- A key press, a click or an answer to a press lets the rows it moves glide at once. A read, a tick, a pointer move or typing leaves the keys where the person put them.
- A reply's draft stays until the reply arrives, by the shared rule.
- New rows get their title tint in every tab, not only the tab the look shows.
- A host older than 0.5.0 saves no collapses, so a collapse there lasts `COLLAPSE_WAIT_MS`.

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
- After the person's reply stops a row waiting, the cursor leaves that row, as in omp and Herdr.
- A second press of the same action on a row is refused while the first is out.
- A new press on a row clears that row's old error and note.
- The goal field closes when its goal is sent, and its draft stays until the goal arrives.
- Alt-click on the open row's title folds every row in the tab, as the fold-all key does.
- Each collapse is saved at once in its own request, instead of waiting for the save before it to finish.
- Rows that arrive are followed only when they wait on the person, so a PR is followed only for a waiting thread or a failing check.

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
- An open on an empty Asks tab moves to a tab with open rows, such as Finds, as in the other looks.
- Rows that arrive are followed only when they wait on the person, so a PR is followed only for a waiting thread or a failing check.
- The pane's first frame after an open draws the tab the open moves to, so it never shows the old tab first.
- A refused reply's field stays closed once the person pressed something after it, even in the same millisecond.
- Arrivals while the pane is closed leave the cursor unpicked, so the first waiting row opens when the pane shows.
- A click that closes a row guards the row the cursor moves to, and a clicked Undo guards the row it brings back.
- The cursor leaves a row the agent closed even when the row holds a draft. The draft stays.
- The sample starts the pane's showing, so its rows settle and fold as real rows do.
- Running marks keep moving in the terminal while desktop draws beside it, and a frame redraws only the terminal. A frame waits until the last one has drawn. A timer another mod refuses starts again at the terminal's next render.
- The end of a title tint reads the view again and redraws both looks.
- On the Status tab, `j` and `k` step from the row the pane draws selected, picked or not.

### Exact web and iOS

The private Exact clients are one TypeScript app, built for web and for iOS. When their Milestones 4–5 UI starts, they call `reduceUi` directly, with their own `LookConfig`. They take the reserved `exact-web` and `exact-ios` parity slots, which join `PUBLISHED_LOOKS` in `hooks/clients.ts` as [the look map](../looks.md) describes. Their first step is to check that the iOS build can bundle an import from `hooks/`.

## Other sessions' state

A host keeps another session's state only while it holds a draft or a sent reply, and at most the 20 most recently shown (`keptUiStates`). Every other session starts from `freshUi`. omp saves a session's state in that session's own file, and only while it holds a draft or a sent reply (`isUiWorthKeeping`). `omp/src/state.ts:pruneSessions` keeps at most `KEPT_SESSIONS` session files, so what omp saves stays bounded too. The mod keeps other conversations' states in process memory (`paneState.keptUi`), because Claude Code keeps plugin state per session and `/clear` or `/resume` starts a new one. They survive moving between conversations in one Claude Code process, but not a restart. After a reload, `restoredUi` drops the presses still out, the demo's replies, and the arrivals and closes held while the list was in use, since no answer or timer survives a reload.
