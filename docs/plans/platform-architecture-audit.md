# Platform architecture implementation

Status: built. The follow-ups under "Remaining limits and follow-ups" are open.

Shared modules decide row content, actions, navigation, PR help, delivery
feedback and update bookkeeping. Each look keeps its native controls,
fitting, focus and motion. [The look map](../looks.md) owns the current
module inventory and deliberate platform differences.

## Reliability pass

The pass covers accepted presses, durable state, concurrent updates and UI
recovery.

| Subsystem | Current behavior |
| --- | --- |
| Explicit Codex sends and Done notifications | The session lock covers an atomic checkpoint before queue invocation. The checkpoint includes the affected rows and an unconfirmed attempt. Accepted sends become queued. Ambiguous outcomes retain the attempt and draft. An unknown older attempt blocks acknowledgement of a newer identical message. No local effect runs if the initial press could not be saved. |
| Local effects and PR actions | Each new local press has its own result identity. Late results cannot replace newer ones, including equal-time presses. Thrown effects become visible failures. Address rejects a review thread that no longer waits; Discuss stays available. |
| Codex persistence and workers | Unreadable or newer-version files remain untouched and raise an error. Valid legacy state still upgrades. Update workers use the existing atomic owner-lock protocol. View reads reconcile abandoned activity under that lock without spending a retry. Contention inside an acquired callback propagates as an error. |
| Native conversation lifecycle | Resume results belong to one stop and conversation. Model responses and saved-session loads check their owner inside state updates. Old loads cannot overwrite a newer session. |
| Native saved sessions | A failed replacement keeps the previous stored copy. Saves use captured session keys and commit revisions. Same-session resume waits for pending commits. Pruning uses saved timestamps and preserves unreadable or unknown-age records. |
| Codex page recovery | A candidate starts against a detached root. The working page remains usable until the candidate connects and active presses finish. Failed candidates are disposed. Retry or a different page can try again. Host theme changes and current drafts survive activation. |
| Codex interaction state | A completed send cannot erase a newer draft. Older presses cannot clear newer feedback. Old demo responses and stale page metadata are ignored. Finding details preserve explicit line breaks. |

## Claude Done refusal recovery

A refused notification leaves the task Done and records why it was not sent.
Its Closed entry offers Undo. The saved notification ID prevents an old
refusal from changing a newer close, including one with the same timestamp.
Refused attempts do not send again on timers or resume.

A session switch before submission cancels the notification and restores
recovery in the original session. A refusal after submission updates that
session's saved ledger. Recovery shares the conversation-application queue
and invalidates saved snapshots read before it completes. Unrelated session
reads remain independent, so a slow old read cannot block a newer conversation.

Desktop reuses its existing Undo Client because a native Button's first click
only focuses it.

## Worker status and Done notification repair

Worker activity is reconciled through the existing owned update lock.
An abandoned active update becomes a failed update awaiting the next normal
trigger; its pending exchange and retry count stay intact. A live worker keeps
its activity flag. No model call starts from a view poll.

Done notifications use the explicit-send durability boundary. Inbox resolves
the queue command before dispatch, checkpoints the affected closes and one
unconfirmed delivery record, then invokes the queue once. A successful response
records acceptance; an ambiguous outcome or failed final write retains the
uncertain attempt. Polls and server restarts do not resend it. A failure before
dispatch leaves Undo available. Existing delivery feedback also covers Done
rows and their Closed-fold entries.

These runtime changes apply to Codex. Terminal and Claude desktop keep their
existing worker and submission paths.

## Owners and behavior

| Concern | Current owner and behavior |
| --- | --- |
| Saved state locks | `codex/src/state.ts` publishes a prepared owner through an atomic symlink to a missing child. Recovery canonicalizes paths and checks process start and boot identity when available. Release and recovery claim a generation before unlinking it. Live writers retain ownership regardless of elapsed time. |
| Delivery | Both hosts keep sent-prompt records and a local delivery ID for each press. Shared reducers acknowledge every row of a bulk press. Late failures preserve newer actions and drafts. Concurrent mod presses retain the newer action by press order. |
| Delivery feedback | `hooks/view.ts` shows Queued after one second. Delivery unconfirmed appears immediately, including in settled rows and Closed folds, with no success mark. |
| PR-opening help | `hooks/pr-fetch.ts:itemPrSteps` supplies both view construction and press validation. |
| Failed updates | Codex separates an active update from a failed exchange awaiting its next retry trigger. A failure that will not retry makes no retry promise. |
| Row and action meaning | `RowView`, `ActionView` and view helpers own content, reply intent, marks, emphasis and icon kinds. `rowKeyPlan` owns order. Renderers style actions in that order. Native desktop keeps Help before Done. |
| Navigation | `firstWaiting`, `keptOpen`, `rowAfterClose`, `isTabEmpty` and `followTo` own selection and empty-tab decisions. Hosts supply drawn rows and blockers. New rows above the selected row remain closed. |
| Inline Undo | `hooks/register.tsx` advances selection and reveals the existing Undo control. On expiry it reveals the current selected row, including a new default selection. Manual scrolling cancels that tracking. |
| Terminal fitting | `hooks/register.tsx:listColumns` accounts for the inline tab column. `terminalTextLines` fits parsed display spans to the body budget and preserves planned breaks, styles, link addresses and explicit newlines. |
| Update bookkeeping | `applyExchangeUpdate` preserves the item being explained. `addActivity` owns the activity cap and duplicate filter. Press results identify actual reopens for closed-note acknowledgement cleanup. |
| Model text | `hooks/model-text.ts` owns prompts and inbox notes. `hooks/claude.ts` owns Claude transcript, command, dialog and stop helpers. `hooks/text.ts` owns formatting. Wording changes follow the model evaluation rules in `AGENTS.md`. |
| Dependency rules | The checker resolves imports and follows local dependencies from shared modules and Codex sources and tests. Shared restrictions apply through type bridges. Computed imports are restricted to the top-level runtime handler loader. |
| Codex reload ownership | `codex/src/tab-swap.ts:swapPage` replaces only the Inbox root, style and script. Each instance owns its timers, listeners and animations. Candidates initialize against a detached root. Replacement waits for active presses and preserves current UI state. A failed candidate leaves the working page usable. |
| Agent guidance | The entry point, glossary, look map and active plans name current owners and behavior. The built UI spec describes delayed Queued, immediate uncertainty, key-only Explain and recording demos. |

`registerInboxCommand` registers `/inbox` during `session.start`, before
`next(e)`, and retries when Inbox activates. Concurrent startup, attach and
command handlers wait for the same initialization promise. A cold command
can activate Inbox only when the engine identifies its origin as `composer`.
SDK and plugin commands keep a headless Inbox inactive.

## Terminal wrapping

The inline body keeps the line breaks it planned. `terminalTextLines` parses
inline spans before wrapping. It keeps styles and appended link addresses,
counts explicit newlines, and adds an ellipsis to the last clipped line. The
renderer inserts planned breaks after parsing, so those breaks cannot split
Markdown syntax. The helper remains local to the mod's inline terminal body
fitting. Desktop and Codex drawing are unchanged.

A PR comment returns full Markdown only when both its existing raw-text
estimate and the planned inline count fit. Clipped PR output uses the planned
styled lines.

## Remaining limits and follow-ups

**Desktop command warning and Reply focus.** Startup dispatch works, but the
host can still show the stale unknown-command warning tracked in
[issue 99691](https://github.com/anthropics/claude-code/issues/99691).
The first Reply click draws the field while typing stays in the composer.
Clicking the field enables typing and preserves the composer draft.
[The desktop reference](../reference/claude-desktop-app.md) records successful
focus API results and failed native focus transfer. A host fix remains
necessary, tracked in
[issue 100966](https://github.com/anthropics/claude-code/issues/100966).
The supported Input remains in use.

**Shared-session scrolling.** Simultaneous terminal and desktop use of one
session remains unverified. The host's scroll and close events omit the
surface, so either attached surface can cancel terminal scroll tracking.
The individual terminal path has live coverage.

Inline terminal Undo keeps priority until it expires when Undo and the next
row's actions cannot both fit. Expiry reveals the current selected row,
including a new default row. Selecting another row releases the Undo position
and follows that row after expiry. Changing tabs, opening a Closed fold or
scrolling manually ends this tracking. Desktop, docked terminal and Codex
retain their own scrolling policies.

**Exact delivery reconciliation.** The host callbacks Inbox uses expose no
verified link between an arrival and its press. A synthetic check through
the real Codex press and state paths sends identical text twice and omits the
first arrival event. Reporting the second leaves the latest press unconfirmed
with its receipt saved. A later same-text callback can mark it arrived.
Simulated queue responses establish Inbox behavior, not live host delivery.

The host APIs were checked on 2026-10-14:

| Host | Verified contract | Missing evidence |
| --- | --- | --- |
| Claude terminal and desktop | Claude Code 2.1.299's generated `PromptSubmitArgs` accepts no correlation ID. `PromptSubmitResult` returns text or a drop reason. `SessionAppendInput` exposes a row UUID, including for queue records. | No documented link connects the submit call, queue record and delivered row. `session.messages()` omits UUIDs and queue records and returns at most 4,096 messages. The public mod API exposes no submission-status lookup. |
| Codex | Bundled CLI 0.162.0-alpha.17.2 returns a queue ID. Its queue command has no list or status operation. The [documented prompt hook](https://developers.openai.com/codex/hooks#userpromptsubmit) supplies prompt text and turn ID. | The hook supplies no matching queue ID or origin. A person's identical prompt can consume a saved Inbox receipt. |
| Codex experimental app-server | Generated experimental bindings expose `thread/queue/add` with `clientUserMessageId`, a pending queue list, and persisted user-message items with `clientId`. Queue updates preserve the submission ID. | The relationship between those client IDs has not been verified. Inbox has no connection to the active app-server. Pending-list absence does not distinguish delivery from deletion. [Item pagination](https://developers.openai.com/codex/app-server) also depends on the thread store. |

A host fix needs a stable identity linking an accepted submission to its
arrival. A caller-supplied identity would let Inbox save the link before an
immediate arrival. Rewrites and queue edits must preserve it. Matching must
use that identity even when delivered text changes.

Recovering an unobserved arrival also needs durable evidence of the
submission's outcome: delivered, canceled, rejected or still pending.
A query by identity or retained delivery records can provide this.
A pending-only list cannot distinguish those outcomes.

With that contract, hosts can pass verified arrivals to the shared reducer
and retire completed receipts. Unresolved deliveries must remain unconfirmed.
Bounded retention must prevent late events from matching a newer press by
text. Legacy receipts still need conservative handling.

Acceptance for that future change must cover identical presses with a lost
event, duplicate and out-of-order events, queue edits, cancellation, reload,
a matching prompt typed by the person, and late arrival after cleanup.
Verify the contract in both hosts and feedback in all three looks.
Unmatched records remain saved under the current contract.

**Older locks.** An empty lock directory from an older build has no owner
identity. The new code retains it and times out. Safe removal requires
confirming that old writers have stopped. Current-format crashes recover
when the owner is known to have stopped. Update workers now use this protocol
too; an ownerless `.updating` directory left by an older worker remains held
because its owner cannot be established safely. When process metadata is unavailable,
recovery uses PID liveness conservatively. Older PID-only records remain
readable.

**Subagent prompts.** Synthetic input with `agent_id` reaches parent
bookkeeping, but actual host delivery has not been established. Verify that
event before changing admission policy. The release's verified
background-thread exclusion remains in place.

Further renderer separation remains proposed in
[three-looks.md](three-looks.md). It uses explicit row inputs and preserves
focus keys, press guards, redraw timing and retained panel content.
[Claude mode](claude-mode.md) remains a separate proposal with its own chat
identity, send acknowledgement and display-capability probes.
