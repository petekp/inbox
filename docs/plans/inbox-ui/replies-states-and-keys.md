# Inbox UI: replies, states and keys

Part of [the inbox UI spec](../inbox-ui.md).

Status: built.

### 2.5 Typing a reply

The field replaces every other row action and its keys with [Send] and [Cancel]. Each row keeps its own draft. Cancel restores the actions and keeps the words for the next Reply.

- **Reply** on a question uses the hint `Your answer`. Send hands the words to the agent. The question remains open until the agent or inbox model establishes that the words answer it. A question back does not close it.
- **Reply** on a task or finding uses `Your reply to Claude` or `Your reply to Codex`. Send hands the row off and keeps its ledger record.

### 2.6 Status

The UI reads one status record for items and one for PRs. The status shows only work under way and errors, at the right end of the footer line. When the list last changed is not shown: it would not change what the person does.

| Field | Shown as |
|---|---|
| `isUpdating`, optional | `Updating…` |
| `error`, optional, with the source's own text | The text in red, under the tabs |
| PR `isFetching` | `Refreshing PRs…` |

The PRs tab shows the PR status. The other tabs show the item status. `hooks/view.ts:footerStatus` picks between them for every look. The Codex tab shows its status at the footer's right. While polls fail it shows `Last read 1m ago · retrying` there instead, muted, and red after a minute.

The UI names the result, not the model call or tool. The failure text is `Last update failed. Items from that reply may be missing.` A stopped worker shows that error. An active update shows `Updating…` and hides the prior error.

Every host with `canCatchUp` reads the whole conversation on its next update, so a failed ledger always retries and the failure text ends with `It retries after your next message.` A host that cannot read its conversation, a Codex thread without a `transcriptPath`, promises the retry only while an exchange is pending. A second failure drops the exchange and keeps the warning until a catch-up covers it. If a conversation that has a path cannot be read or parsed, nothing is pending and the ledger is failed, the promise is false: the run reports it unreadable and has nothing to retry. All hosts advance applied turns after a failed update, so a handed-off row can return to the count.

An expired item closes as `Expired`. The rule behind it, 12 prompts or more than 20 open, belongs to the per-turn update.

### 2.7 Empty, loading and error states

| State | Text |
|---|---|
| Asks, empty | A title, `Nothing needs you.`, and a hint line: `Claude's questions and the tasks only you can do show up here.` (`Codex's` in the Codex tab) |
| Finds, empty | `No findings yet` and `Claude flags issues and opportunities it spots beyond your task.` |
| PRs, empty | `No PRs` and `Your PRs show here when this session opens or links one, or when your branch has one.` |
| PRs, loading | `Checking for PRs…` |
| View loading | `Reading the inbox…` |
| PR refresh failed | `Last refresh failed: <reason>` and [Retry] |
| Inbox unreadable, mod | `Could not read the inbox.` and [Try again] |
| Inbox unreadable, Codex | `Could not read the inbox. <reason>` and [Reload] |
| Not hearing from the chat | Its own text per look, below. An empty list there must not read as "all clear". |

**Not hearing from the chat, per look.**

- **Terminal and desktop, tools refused.** The guard refuses the mod's `$.tool.register` call when managed settings set `allowedMcpServers`. The band still draws, so the status line is the only sign. It reads in red: `Claude cannot record or close items here: your organization's settings block the inbox's tools.`
- **A missing band** has no substitute inside the inbox. A worker crash, safe mode, an untrusted folder or an org policy unloads the mod, and it cannot report its own absence (reference fact 21).
- **Desktop before attach.** A session starts with no surface and the app attaches about 0.1 s later. Nothing draws before then, so there is no state to design.
- **Codex.** See 3.3.

### 2.8 New rows

- The counts change at once.
- A new row arrives with no mark of its own. In the Codex tab it grows in. A row arriving above the open one arrives closed.
- The view jumps to another tab only when the tab on screen shows nothing but its empty text.

### 2.9 Keys

Keys supplement clickable actions, except Explain: it is key-only in terminal and Codex. Only the terminal shows key text. The Codex tab keeps its working keys with no key text. Desktop shows Explain as a clickable follow-up because a `Button`'s hotkey does nothing there.

### 2.10 Demo

`/inbox demo` in the mod shows sample entries. The Codex tab offers [Show demo] in dev builds and builds made with `INBOX_DEMO_BUTTON=1` or `INBOX_DEMO_RECORDING=1`.

The normal demo shows `DEMO_NOTICE` from `hooks/view.ts` at the top: `Sample entries. Buttons here send nothing.` with a [Hide demo] button. The band starts its counts with `Demo:` and also has [Hide demo]. A press on a sample action shows on its row what a real press shows, such as "✓ Explained" or "✓ Copied x", and sends nothing.

For a recording, `/inbox demo recording` hides those notices, the band's `Demo:` prefix and Hide demo. A Codex build made with `INBOX_DEMO_RECORDING=1` also hides the demo notice and Hide demo. Recording demos still use sample entries and send nothing.
