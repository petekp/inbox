# Inbox UI: the Codex tab

Part of [the inbox UI spec](../inbox-ui.md).

Status: built.

### 3.3 Codex

**Placement.** The Inbox thread tab, a full view that stays open beside the thread and polls every 3 s. There is no band and no inline card.

**How it opens.** The person opens Inbox from the thread's side panel, through the plugin's `thread` entrypoint. Every thread has its own instance. Whether the tab stays open when the person switches threads, or reopens with a thread, is not sourced. While the tab is closed, nothing in the inbox signals new items. Codex's Activity view shows only that the chat waits.

**The model's `inbox` tool.** It has no `resourceUri`. It returns text: the count, each open row on one line, and "Open the Inbox tab to act on these." A separate tool, `inbox_view`, carries the `resourceUri` and the `thread` entrypoint and is marked `visibility: ["app"]`. Entrypoints ignore visibility, so the tab still opens. Whether Codex hides an app-only tool from the model is not checked. If it does not, the model could still call it and mount the full view inline.

The tool is split because the tab is already where the person acts. Codex mounts every model-called MCP App inline first, and inline cards would add a second, stale copy of the list each time the model calls the tool.

**First thing seen.** The Asks tab with its top row open.

```
 [Asks 2] [Finds 1] [PRs]
 ──────────────────────────────────────────────────────
 Questions
 1) Use "inbox" or "attention" for the name?     2m ago
    [inbox] [attention]
    [Reply] [Explain] [Dismiss]
 Tasks
 • Add API key to .env · 5m ago
 ──────────────────────────────────────────────────────
 [Show demo]                                  Updating…
```

The footer holds the status at its right. [Show demo] at its left follows the build settings in section 2.10. A read error or a note takes its own line under the tabs, so the status never moves the tabs. Codex's Activity view already shows which chat waits.

**Tabs.** Asks, Finds and PRs. The PRs tab has the same PR blocks as the pane (2.4). The server runs gh in the session's folder and refetches a view when the last fetch is over 2 minutes old.

**Rows, groups and behavior.**

- Rows, groups and folds follow section 2.
- Rows that vanish between polls settle in place.
- An out-of-order poll is ignored.
- A draft per row, with Send and Cancel.
- A select-all text box on the row when the page cannot copy.
- The keys (1, 2 and 3 for tabs, j and k, row hotkeys, Esc in a field) work with no key text (2.9).

**How a press shows what it did.** A send goes through `codex queue`, which holds the message until the running turn ends.

1. The row shows `Sending…` while the server runs `codex queue`.
2. The server keeps the returned queue ID and a local delivery ID for the press. Its response uses the shared feedback in section 2.3. Queued appears after one second while arrival remains pending.
3. `UserPromptSubmit` provides the message text. `codex/src/core.ts:notePrompt` consumes the oldest matching saved send and uses its local delivery ID to update that press. Newer identical sends show Delivery unconfirmed immediately.
4. A matched arrival clears Queued or unconfirmed feedback. Explain and Discuss keep their working text until the reply; arrival alone does not complete them.

An absent callback leaves Queued visible. Older records without delivery identity remain unconfirmed after a matching arrival. The callback supplies no queue ID, and the server has no app-server connection to list or reconcile the queue. Missing events and edited messages therefore remain subject to the limits in section 2.3.

A failed `codex queue` shows `Not sent: <reason>` in red. Repeatable presses offer [Try again]; typed replies keep their drafts, as in section 2.3.

**Not hearing from this chat.** Codex runs a plugin's hooks only after the person trusts each hook definition, and skips a hook until its current definition is trusted. If hooks need review at startup, Codex prints a warning. Trust is per hook, so `SessionStart` can run while a changed `Stop` hook is skipped. The tab checks each hook it needs:

- No `SessionStart` record for this thread: no hook has run.
- An inbox tool call arrives for a turn that `UserPromptSubmit` never recorded: that hook is skipped.
- `UserPromptSubmit` has recorded two or more turns and `Stop` has recorded none: that hook is skipped, and the per-turn update never runs.

Asks then reads, above its rows or in place of the empty text:

```
Items from Codex's replies are missing.
The inbox has not heard from this chat's hooks.
```

When no hook has run yet, it reads `The inbox starts with your next message.` When Codex reports the hooks untrusted or stopped by an update, a line under the tab bar says so in every chat, on every tab, and names the hook icon, as "Hooks need trust" in `docs/looks.md` describes. Asks then leaves out its own hook text.

**States.**

| State | Text | Trigger |
|---|---|---|
| Loading | `Reading the inbox…` | Before the first view arrives |
| Unreadable | `Could not read the inbox. <reason>` and [Reload] | The first read fails, so there is no view to show |
| No connection | `Could not read the inbox. The inbox could not connect to Codex.` and [Reload] | The `ui/initialize` request fails |
| Polls failing | Muted `Last read 1m ago · retrying` at the footer's right, red after a minute | Two later polls fail while a view is shown |
| Demo | The notice from 2.10 | The demo is on |

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| A band | The tab labels' counts, and Codex's Activity view |
| Push updates | The 3 s poll |
| A trusted `ui/message` | `codex queue`, shown as Queued |
| Model context from `Stop` | Context at the next prompt |
| Hooks before trust | The "not heard" state |
| A stop line | None. Codex shows its own errors in the thread. |
| A signal for new items while the tab is closed | None |
