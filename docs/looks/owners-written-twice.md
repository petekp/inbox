# Owners: rules still written in two places

Part of [the look map](../looks.md#who-owns-each-rule).

Some content and host bookkeeping still have two copies. These are remaining work in `docs/plans/three-looks.md`.

| Rule | Where it is written | Remaining work |
| --- | --- | --- |
| PR block and row composition | `hooks/register.tsx`, `codex/src/tab-prs.tsx` and `codex/src/tab-rows.tsx` | Both use shared PR rules and button plans, but compose their own content. |
| Host notices and some closed-row composition | `hooks/register.tsx`, `codex/src/tab-chrome.tsx` and `codex/src/tab-groups.tsx` | Share identical decisions while keeping native fitting and decoration local. |
| Local effects and demo presses | `hooks/open-targets.ts:openTarget`, `hooks/press-effects.ts:demoAfterPress`, `hooks/press-effects.ts:demoReplied`, `hooks/register.tsx:runDemoPress`, `hooks/host-press.ts:press`, `codex/src/server-host.ts:open`, `codex/src/server-demo.ts:onDemoPress`, `omp/src/demo.ts:demoSource` | Every host opens files and links through `openTarget`, and computes a demo press with `demoAfterPress`. `SETTLED_MS` after a press that sent, each host's own timer applies `demoReplied`, the demo's stand-in for the agent's reply. It answers that press and leaves the sample's own hand-offs waiting. |
| The cursor, tab moves, fields and presses a look handles itself | The mod in `hooks/pane-open-row.ts` (`titlePress`, `collapseKeyPress`, `cursorRow`, `pinnedOn`, `arrivedSelection`, `leftRowsSelection`, `closeMove`) and `hooks/pane-selection.ts:selectedIndex`, the Codex tab in `codex/src/tab-selection.ts` and `codex/src/tab-read.ts`, omp in `omp/src/panel-tabs.ts`, and the Herdr panel in `herdr/src/keys.ts` | `hooks/ui-controller.ts:reduceUi` holds one copy of these rules. Each look moves onto it in its own PR, as `docs/plans/ui-controller.md` lists, and deletes its copy. |
| Spotting that a sent reply arrived | The mod and Codex through `hooks/press-reducer.ts:isPressConfirmed`, and the Herdr panel in `herdr/src/out.ts` (`lastActionKey`, `isSentConfirmed`) and `herdr/src/keys.ts:withoutConfirmed`, which waits for the last press to name the sent one | `hooks/ui-controller-reply.ts:releasedDrafts` compares the last action's `at` and its reply with the sent text. Each look moves onto it. |
| When a spent Undo's row may fold | `herdr/src/draw.ts:undoPlaceEndsAt` | `hooks/ui-controller-clock.ts:nextWakeAt` wakes each look when it ends. |

A `deliveryId` identifies one local press. Each host keeps a sent-prompt record
before an arrival can change its rows. Arrival events provide message text but
no matching delivery ID, so they consume the oldest matching record. A press whose host holds its delivery until the message runs, as the mod does in the terminal and the desktop app, reads “Queued” from the moment it is sent. Codex and omp deliver at once, so their press reads unconfirmed until the delivery is saved. Queued feedback appears only after the message has waited one second since it was sent, which for an answer or Fix held for Undo is when Undo ends (`Delivery.sentAt`). Until then the press shows its plain label and no ✓.
Unconfirmed feedback has no delay and is for a delivery in doubt: a delivery that failed to report, a message another plugin changed, or a restart that lost it. A newer
identical press reads “Not confirmed” until a later arrival can confirm
its record. Open rows, settled rows and Closed folds preserve that status
without a success mark.

The mod keeps sent-prompt records in its live plugin state across reloads.
A saved session brought back into a new process starts with none. Its pending
messages may never arrive, and their rows already read unconfirmed. A kept
record would take the arrival of the same text sent again.
Older state can lack the history needed to distinguish identical messages;
those message texts remain unconfirmed in that session. Within one process,
unmatched records are retained because discarding one could make its late
arrival acknowledge a newer press. Exact reconciliation and bounded retention need host queue identity or
queue status that the current arrival APIs do not provide.
