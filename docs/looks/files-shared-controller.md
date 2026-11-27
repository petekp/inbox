# Files: the shared UI controller

Part of [the look map](../looks.md#files).

The UI controller decides how a look's tabs, cursor, fields and presses change. It is pure: it does no IO and sets no timers. A host builds the view, sends each event to `reduceUi`, runs the commands it returns and wakes it at `nextWakeAt`. No look calls it yet. `docs/plans/ui-controller.md` says how each look moves onto it.

| File | Role |
| --- | --- |
| `core/view/ui-controller.ts` | Shared module. `reduceUi` takes a look's state, the view, an event and the time, and returns the new state, the commands the host runs and when to wake it. `restoredUi` is the state to go on from after a reload. `rowErrorOf` and `noticeOf` give a refused press's text while it shows, and `keptUiStates` picks the other sessions' states a host keeps. |
| `core/view/ui-controller-types.ts` | Shared module. The controller's state, events and commands, `LookConfig` for the differences on purpose it reads, and `freshUi`. |
| `core/view/ui-controller-tabs.ts` | Shared module. The tab a look shows: the move an open makes, following rows that arrive while the shown tab is empty, holding them while the list is in use, and the records of new and closed rows for the title tint. |
| `core/view/ui-controller-selection.ts` | Shared module. Each row tab's cursor: the row it is on, how it moves when its row closes or rows arrive, the press guard, title presses, collapses, folds and the row a confirmed Undo brings back. |
| `core/view/ui-controller-reply.ts` | Shared module. Fields, drafts and presses: the holds a host passes with the view and a press, which presses are dropped, what a press's answer does, when a press gives up, and when a sent reply's draft is deleted. |
| `core/view/unshown-press.ts` | Shared module. A press the controller has out that the view does not show yet, from the row's last action when it was pressed (`PressOut.atBefore`), and what its row reads meanwhile: "Opening x…" for an open or copy, else "Sending…", and nothing new for a Mark press. A look that runs presses after the key's draw, as omp does, draws it. |
| `core/view/ui-controller-clock.ts` | Shared module. `nextWakeAt`, the next time something drawn changes on the clock or the controller has work due. Also the first-read Undo clock, the ends of notes, errors and the notice, and the demo's replies. |
