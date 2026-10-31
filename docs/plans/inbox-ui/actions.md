# Inbox UI: actions

Part of [the inbox UI spec](../inbox-ui.md).

Status: built.

### 2.3 Five kinds of action

Every press is one of five kinds. The kind decides what the screen shows at once.

| Kind | What it does | What shows at once |
|---|---|---|
| **Talk** | Sends a message asking the agent to talk or draft. The row's work is not given away. | The row stays open and in the count. Its top line reads `Explaining…` or `Discussing…` until the reply, then `✓ Explained · 1m ago` or `✓ Discussed · 1m ago`. Delivery feedback below can replace that text. The press adds no line. The button reads "Explain again" or "Discuss again". |
| **Hand-off** | Sends a message that gives the work to the agent. | The row closes to its one line, its handle a ✓, and leaves the count. Its age reads the press, as `Run load script · 1m ago`. Unconfirmed delivery replaces the feedback and removes the ✓. The next row that waits opens. It stays closed after the agent's reply, and the re-entry rule below says when it counts again. A PR block, which is always open, records `✓ Asked to resolve conflicts` on the block. |
| **Local** | Opens or copies on the person's machine. | A note on the row at once: `Opening settings.json…` or `Copying npm test…`. The result replaces it: `✓ Opened settings.json`, or in red, `Could not open settings.json: it was moved`. |
| **Mark** | Changes state, and sends nothing while it can be undone. | The row settles in place with the Mark's own label, `✓ Done` or `✓ Dismissed`, and an [Undo] button, then leaves after 5.12 s. The next row that waits opens. |
| **View** | Changes only what is on screen, or reloads it. | The change itself: a view opens or closes, a row unfolds, a tab switches, a status reads `Refreshing PRs…`. |

The View kind covers [Open inbox], the tab buttons, [All 7 options], the Closed fold, Show demo and Hide demo, Undo and Retry. [Try again] repeats a failed press, so it takes that press's kind.

**A finding's Fix** is a Hand-off that settles the row in place as `✓ Fix` or `✓ Do it`, with Undo. The finding then moves to its Closed fold. It stays open in the ledger until the agent closes it. **A finding's Discuss** is a Talk, so the finding stays open after it. A finding's Reply is a Hand-off that folds the row, and the re-entry rule below applies.

**Done on a task** can tell the agent after its Undo ends. When the agent is idle and waits on the task, one message goes out once the row leaves: `Done: <ask>`. Done presses on several tasks in a row go as one message.

**Answering a question** is a Mark and a send together. The row settles as `✓ Yes, rename`, and `Re "<ask>": <answer>` goes to the agent. It has no Undo, because the message is already on its way.

**A terminal help step** copies a command for the person to run. Its note names where to run it:

- Terminal: `✓ Copied gh auth login. Run it in a terminal, or type ! and paste.`
- Desktop: `✓ Copied gh auth login. Run it in Terminal.` Whether "type !" works in the desktop composer is not sourced, so desktop leaves it out.

A step with several helps of one kind gets one note: `✓ Opened 3 PRs`. A mixed step lists each part: `✓ Copied the key · Opened .env`.

**Delivery feedback.** A send arrives when its message enters the agent's turn. Each host records the press immediately and tracks the message separately.

- Queued feedback appears after one second while arrival is pending, as `Queued: Yes, rename` or `Queued: Explain`. During that first second, the row shows its normal press feedback.
- An answered question closes and leaves the count. A hand-off folds. A Talk send keeps the row open.
- A matched arrival clears Queued. An answered question then reads `✓ Yes, rename`. Explain and Discuss keep their working text until the agent's reply.
- An ambiguous arrival shows `Not confirmed: <action>` immediately. Open rows, settled rows and Closed folds retain that status with no success mark.
- A failed send reopens a closed question or unfolds a handed-off row. It reads `Not sent: <reason>` in red. A repeatable press offers [Try again]; a typed reply keeps its draft for Reply.
- With no arrival event, Queued remains and its age grows. An ambiguous arrival remains unconfirmed until a later event can confirm its saved send.

Each host keeps a local delivery ID for the press, but its arrival callback supplies only message text. The callback consumes the oldest saved send with matching text. That record can update only its own press; newer identical sends become unconfirmed. Missing older send history also prevents confirmation. A lost arrival can therefore leave a later send unconfirmed. Exact reconciliation needs stronger host evidence, as [looks.md](../../looks.md) describes.

Each host's arrival signal:

- **Mod**: the prompt's own row being stored in `session.append`. Inbox attaches the saved context when that row is stored. A prompt that arrives within the first second skips the Queued label.
- **Codex**: the `UserPromptSubmit` hook, described in section 3.3.

**Undo.** These Marks get Undo, in every look: an item's Done and Dismiss, a finding's Dismiss and Fix, and a PR's Dismiss. Undo puts the row back where it was, open, in its state before the press. If the close already reached the agent, Undo clears the saved closed-note acknowledgement so the next inbox note reports the open item again. The Codex server records Undo as it records the Mark.

**Re-entry after a hand-off.** A handed-off row waits on the agent until it has replied once. If the row still waits on the person then, it counts again and takes back its own handle. Its age reads `Still open · 3m ago`, timed from the press. It stays closed until the person opens it.

- Questions and tasks: the row waits until the update for a turn started after the press has applied (`hooks/last-actions.ts:isHandedOff`). An update that failed counts, since the reply has ended. A typed reply hands a question off as it does a task.
- Findings: the same turn rule, for a typed reply.
- Review threads wait on GitHub, which says when they change. A sent thread unfolds when a newer comment arrives.

**Feedback lives on the row.** No action reports only through a toast. Toasts are unverified on desktop and do not exist in the HTML view.

- A success note clears with the same 5.12 s timer as a settled row.
- A failure note stays until the next press on that row. Where retrying makes sense it has a [Try again] button.
- A press on a row that changed or left reads `This changed before your press. Nothing was sent.` A typed draft is kept.

### 2.4 Actions per row

The shared `rowKeyPlan` puts retry first, then options or help steps, then Done or Fix, then the follow-ups. Within each group, `actionsOf` sets the order. Primary emphasis changes appearance without promoting an action ahead of retry or help.

| Row | Action | Shows when | Kind |
|---|---|---|---|
| Question | each option | Always. With 5 or fewer options, all show. With more, the first 4 and [All 7 options]. | Mark and send |
| | Reply | A text field draws (2.5) | Hand-off |
| | Explain | Always | Talk |
| | Dismiss | Always | Mark |
| Task | each help step | One per step the item carries | Local; a Run step is a Hand-off |
| | Done | Always | Mark |
| | Reply | A text field draws | Hand-off |
| | Explain | Always | Talk |
| Finding | Fix for an issue, Do it for an opportunity | Always | Hand-off |
| | File issue | Always | Hand-off |
| | Discuss | Always | Talk |
| | Reply | A text field draws | Hand-off |
| | Dismiss | Always | Mark |
| PR check | Open log | Always. It opens the PR page when the check has no log link. | Local |
| Review thread | Address | Always | Hand-off |
| | Draft reply | Always | Talk |
| | Open | Always | Local |
| | Discuss | Always | Talk |
| PR block | Merge | The PR reads Ready to merge. It asks Claude to check the PR is still mergeable and merge it with the repo's usual method, and to stop if merging needs a bypass or a force | Hand-off |
| | Resolve conflicts | The PR is open and conflicts with its base | Hand-off |
| | Address all N threads | More than one thread waits on the person | Hand-off |
| | Open PR | Always | Local |
| | Dismiss | Never on the current branch's PR | Mark |
| Band and pane controls | Open inbox, Close, tabs, All N options, Closed fold, Retry, Show demo, Hide demo, Undo | Where each applies | View |

Three rows have no Dismiss:

- A task finishes with Done, so Dismiss would be a second word for the same press.
- A review thread and a PR check live on GitHub. They leave when GitHub changes, or with the PR's own Dismiss.

A finding's done label after Fix is "Handed off". "Address" names only the press on a review thread.

**PR readiness.** The block's status follows its title on the same line, in its color, with no mark. It is one of: `Ready to merge: approved, checks pass, no threads waiting on you`, `Blocked: <reasons>`, a draft (`Blocked: draft, …`, gray), `Waiting: <reasons>` (gray), `Merged` or `Closed`. `Blocked` names only what waits on the person: a draft, conflicts, failing checks, requested changes and threads waiting on them. The rows under the block list each check and thread. `Waiting` shows once none of those is left, and names what waits on others: threads sent to Claude or on changed lines, a needed approval, running checks.

**Which PRs show.** The tab fetches and shows the branch's PR and the 12 PRs the conversation linked most recently (`hooks/pr-fetch.ts:MAX_PRS`). A line under the blocks names the older linked PRs it leaves out, newest first: `2 older PRs not shown: #31, #29`. Linking one again brings it back. The Codex tab shows the same PR blocks.

**Every option draws.** Every option has a button. In the terminal only the first 9 get letters.
