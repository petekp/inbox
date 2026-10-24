# Inbox UI in three looks

Status: built. It is the UI spec the code follows.

This spec sets what the inbox shows in its three looks and how the person acts on it. The looks are the terminal, the Claude desktop app and the Codex Inbox tab. The terminal and the desktop app are drawn by the mod's `hooks/register.tsx`. The Codex tab is drawn by `codex/src/tab.tsx`. Shared rules live in `hooks/view.ts`, `hooks/presses.ts`, `hooks/pr-tab.ts` and `hooks/layout.ts`. [looks.md](../looks.md) lists which file owns each rule.

Claude mode, an inline card in Claude chat, is a separate proposal and is not built: [claude-mode.md](claude-mode.md).

The facts behind it are in [docs/reference/](../reference/README.md), checked on 2026-10-08.

## Terms

- **Item**: a question the agent asked, or a task only the person can do.
- **Row**: one entry in a list. A row is an item, a finding, a PR, a PR check or a review thread.
- **Need you**: the rows the Needs you tab counts. Section 2.1 defines it.
- **Per-turn update**: a model call after each reply that adds and closes items. It adds the items the agent did not record with its `record` tool. The Overview call that follows writes the session's headline and status.
- **Headline and status**: the Overview call's one-line summary of the session: what it is for, and what the agent is doing now.
- **Mod**: the Claude Code plugin in `hooks/` that draws the band and pane.
- **Band**: the mod's lines above the prompt.
- **Pane**: the mod's `/inbox` view.
- **Surface**: the app that draws a session, `terminal` or `desktop`. The mod reads it from `e.surface` on each draw.
- **Carry text**: the inbox text the mod adds beside a prompt or at the start of the context, so the agent knows the open items and their ids.
- **Guard**: the built-in mod `cc-plugin-sec-default`. On Team or Enterprise sign-ins and managed machines it loads ahead of user mods and limits what they can change.
- **MCP App view**: an HTML view an MCP tool names, which the host draws in an iframe. The Codex Inbox tab is one.
- **Hand-off**: a press that gives the row's work to the agent, so it stops waiting on the person for now.
- **Settled row**: a row that just closed or was handed off, kept in place with a ✓ and its outcome for 5.12 s before it leaves.
- **Leave bar**: the thin line under a settled row that empties over those 5.12 s, so the person sees when the row will move.

## 1. Summary

The mod draws the terminal and desktop looks. One HTML view draws the Codex tab.

**Terminal.** The band leads with the tab counts and has an [Open inbox] button. The pane has keys: a letter on each action, j and k to move, and number keys for tabs.

**Desktop.** The same band and pane, drawn for clicks. Actions are native buttons with no key letters. A tab, a closed row and a Closed fold line each take a click anywhere on them. The shown tab is a rounded raised segment with a bold label. The app's own ✕ closes the pane. Nothing depends on a key.

**Codex.** The Inbox thread tab has the same rows as the pane and three tabs: Needs you, Findings and PRs. A send shows `Sending…` while the server accepts it, then the shared delivery feedback in section 2.3. An empty tab tells "the inbox has not heard from this chat's hooks" apart from "nothing needs you". The model's `inbox` tool returns text only, so it does not mount the full tab inline.

Each drawn action is clickable. Keys are an extra where the host supports them. Explain is key-only in terminal and Codex; desktop draws it because its action keys do nothing.

## 2. Shared vocabulary

### 2.1 What comes first

The count of what needs the person and the top row come first. The headline and status go to the agent, in the carry text. Every platform already shows which session waits on the person. The inbox adds the item itself.

The count is named by its tab, Needs you. The band reads tab names with counts, and an empty inbox reads "Nothing needs you".

**What the count holds.** Needs you counts:

- open questions;
- open tasks not handed off.

It leaves out findings, PR rows, handed-off rows and the stop line. A queued send (2.3) counts as pressed: an answered question is closed and leaves, and a handed-off row leaves, while a row with a queued talk send stays in the count. The Findings tab has its own count. The PRs tab counts the open PRs that need the person: a merge conflict, a failing check, requested changes or a thread waiting on them.

**The order of the Needs you list.** The top row is the first row of this list. [Open inbox] opens the pane with it open.

1. Questions from the agent's newest reply, in the order asked.
2. Questions from older replies, newest reply first and each reply in its original order.
3. Tasks not handed off, newest reply first and each reply in its original order.

The Herdr sidebar line names the latest reply's first question through `hooks/claude.ts:statusLine`. The band shows counts. The pane orders questions by reply, and its terminal handles use the numbered-answer mapping below.

### 2.2 Row types

A row has two forms:

- **Closed**: one line, with the handle, the title and the age.
- **Open**: the full title, the body and the row's actions.

| Row | Where | Closed form | Open form adds |
|---|---|---|---|
| Question | Needs you | `ask · 3m ago`. The terminal adds `1)` or `•` before it (see numbers below) | Full ask, one button per option with the recommended one first, styled primary and labeled "(recommended)", help steps |
| Task | Needs you | `ask · 3m ago`. The terminal adds `•` before it | Help steps (open, copy, run, terminal, link), "Open PR #N" when the ask names a tracked PR |
| Finding | Findings, under Issues or Opportunities | The kind's mark as the handle (▲ for an issue, ✦ for an opportunity), the title and the age | Detail, and "Relevant file: " with the file's base name |
| PR block | PRs | Always open: `#12 title`, readiness, one line of facts | PR actions |
| PR check | PRs, inside the PR block | Two lines: `✗ Failing check`, then the check's name. | Fix, Open log |
| Review thread | PRs | Two lines: `◦ Review thread · 2h ago`, with the comment count and "outdated" when they apply, then `api.ts:40 latest comment` | Comments as Markdown, and the file:line as a link to the comment. Open comment opens the same page |
| Review thread, sent | PRs | Folds to `✓ Review thread · Addressed 4h ago`, then the latest comment's first line | Unfolds when a newer comment arrives |
| Review thread, lines changed | PRs | Folds with no ✓, noted `Lines changed since this comment · still open on GitHub` | Nothing says the change fixed it, so it gets no ✓ |
| Stop | Top of the band and pane | One red line: what stopped and what to do | Nothing |
| Settled | Where the row was | `✓ Done · just now` with the leave bar | [Undo], after a Mark |
| Closed fold | Under Questions, Tasks, Issues and Opportunities | `▸ 3 Closed` | Up to 3 closed items, each `ask → outcome` |

Findings are grouped under an Issues title and an Opportunities title. Each group has its own Closed fold, and a group with nothing open reads `No open issues` or `No open opportunities`. A finding handed to the agent shows ✓ in place of its mark.

The Codex tab draws its lists flat, with no tree lines, in the app's sans font. Questions and tasks draw no mark, and their titles keep the same column. A row handed to Codex shows ✓. Rows sit flush, with no dividers between them. A collapsed row fills gray on hover and takes a click anywhere on it.

The Closed fold's outcomes are the answer itself ("Yes, rename"), "Done", "You ran it", "Dismissed", "Expired", "Closed by Claude: <reason>", and the per-turn update's own outcome text. A finding that Fix handed off lists as "Fix" or "Do it".

Only the Overview tab shows the headline and status. The band shows only counts, and the other tabs only rows. The Codex tab has no band, and its tab labels carry the counts, so it draws no count or headline either.

**Question numbers.** Typing "1 yes" in the prompt answers a numbered question through `hooks/model-text.ts:answerNote`. That function maps a typed number to the agent's latest batch of questions: by the agent's own label when it gave one, else by position in the batch. It does this only when that batch came from the reply just before.

The rule, in the terminal: a question's handle shows a number only when a typed number reaches it now, and shows the number `answerNote` would resolve. Every other open question shows a task's bullet, `•`. The Claude app pane and the Codex tab draw no number or bullet: a question's own buttons answer it there, and the agent's reply already shows the numbers a typed answer uses. Once the person sends any message, the batch is no longer "the reply just before", and every handle becomes `•` until the agent asks again. The Codex tab follows the same rule, since it uses `answerNote` through `promptNotes`.

**Which row is open.**

- When the pane or tab opens, its first row that still waits on the person is open. A handed-off row stays closed until clicked, and a tab with no waiting row has none open. `firstWaiting` in `hooks/view.ts` picks the row for every look. Once a row is open that way, rows that arrive above it arrive closed and it stays open, so the row the person is reading does not close under them. `keptOpen` in `hooks/view.ts` picks it. When the pane or tab opens on a tab that shows only its empty text, it moves to the first other tab that lists rows, as it does when rows arrive there. `followTo` in `hooks/arrivals.ts` decides for both.
- A click on a closed row's title opens it. A click on an open row's title does nothing.
- After a press, the pressed row shows its result in place.
- When a press answers, closes or hands off the open row, the next row that still waits on the person opens, its buttons guarded. With none below it, the nearest one above opens. Rows already handed off are skipped. `rowAfterClose` in `hooks/view.ts` picks the row for every look.

**The press guard.** An action button ignores presses for 0.4 s after its row opens (`PRESS_GUARD_MS`). During that time the row's buttons draw dim (`dimColor` on a mod `Button`, `disabled` in HTML), so an ignored press shows why. A double-click on a closed row's title opens the row with its first click, and the second click lands on a button that just drew under the pointer.

### 2.3 Five kinds of action

Every press is one of five kinds. The kind decides what the screen shows at once.

| Kind | What it does | What shows at once |
|---|---|---|
| **Talk** | Sends a message asking the agent to talk or draft. The row's work is not given away. | The row stays open and in the count. Its top line reads `Explaining…` or `Discussing…` until the reply, then `✓ Explained · 1m ago` or `✓ Discussed · 1m ago`. Delivery feedback below can replace that text. The press adds no line. The button reads "Explain again" or "Discuss again". |
| **Hand-off** | Sends a message that gives the work to the agent. | The row closes to its one line, its handle a ✓, and leaves the count. Its age reads the press, as `Run load script · 1m ago`. Unconfirmed delivery replaces the feedback and removes the ✓. The next row that waits opens. It stays closed after the agent's reply, and the re-entry rule below says when it counts again. A PR block, which is always open, records `✓ Asked to resolve conflicts` on the block. |
| **Local** | Opens or copies on the person's machine. | A note on the row at once: `Opening settings.json…` or `Copying npm test…`. The result replaces it: `✓ Opened settings.json`, or in red, `Could not open settings.json: it was moved`. |
| **Mark** | Changes state, and sends nothing while it can be undone. | The row settles in place with the Mark's own label, `✓ Done` or `✓ Dismissed`, and an [Undo] button, then leaves after 5.12 s. The next row that waits opens. |
| **View** | Changes only what is on screen, or reloads it. | The change itself: a view opens or closes, a row unfolds, a tab switches, a status reads `Refreshing PRs`. |

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
- An ambiguous arrival shows `Delivery unconfirmed: <action>` immediately. Open rows, settled rows and Closed folds retain that status with no success mark.
- A failed send reopens a closed question or unfolds a handed-off row. It reads `Not sent: <reason>` in red. A repeatable press offers [Try again]; a typed reply keeps its draft for Reply.
- With no arrival event, Queued remains and its age grows. An ambiguous arrival remains unconfirmed until a later event can confirm its saved send.

Each host keeps a local delivery ID for the press, but its arrival callback supplies only message text. The callback consumes the oldest saved send with matching text. That record can update only its own press; newer identical sends become unconfirmed. Missing older send history also prevents confirmation. A lost arrival can therefore leave a later send unconfirmed. Exact reconciliation needs stronger host evidence, as [looks.md](../looks.md) describes.

Each host's arrival signal:

- **Mod**: the prompt's own row being stored in `session.append`. Inbox attaches the saved context when that row is stored. A prompt that arrives within the first second skips the Queued label.
- **Codex**: the `UserPromptSubmit` hook, described in section 3.3.

**Undo.** These Marks get Undo, in every look: an item's Done and Dismiss, a finding's Dismiss and Fix, and a PR's Dismiss. Undo puts the row back where it was, open, in its state before the press. If the close already reached the agent, Undo clears the saved closed-note acknowledgement so the next inbox note reports the open item again. The Codex server records Undo as it records the Mark.

**Re-entry after a hand-off.** A handed-off row waits on the agent until it has replied once. If the row still waits on the person then, it counts again and takes back its own handle. Its age reads `Still open · 3m ago`, timed from the press. It stays closed until the person opens it.

- Questions and tasks: the row waits until the update for a turn started after the press has applied (`hooks/presses.ts:isHandedOff`). An update that failed counts, since the reply has ended. A typed reply hands a question off as it does a task.
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

**Which PRs show.** The tab fetches and shows the branch's PR and the 12 PRs the conversation linked most recently (`hooks/pr-tab.ts:MAX_PRS`). A line under the blocks names the older linked PRs it leaves out, newest first: `2 older PRs not shown: #31, #29`. Linking one again brings it back. The Codex tab shows the same PR blocks.

**Every option draws.** Every option has a button. In the terminal only the first 9 get letters.

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
| PR `isFetching` | `Refreshing PRs` |

The PRs tab shows the PR status. The other tabs show the item status. The mod picks between them where it draws the footer status. The Codex tab shows `Updating…` at the footer's right. While polls fail it shows `Last read 1m ago · retrying` there instead, muted, and red after a minute.

The UI names the result, not the model call or tool. The failure text is `Last update failed. Items from that reply may be missing.` A stopped worker shows that error. An active update shows `Updating…` and hides the prior error.

Every host with `canCatchUp` reads the whole conversation on its next update, so a failed ledger always retries and the failure text ends with `It retries after your next message.` A host that cannot read its conversation, a Codex thread without a `transcriptPath`, promises the retry only while an exchange is pending. A second failure drops the exchange and keeps the warning until a catch-up covers it. If a conversation that has a path cannot be read or parsed, nothing is pending and the ledger is failed, the promise is false: the run reports it unreadable and has nothing to retry. All hosts advance applied turns after a failed update, so a handed-off row can return to the count.

An expired item closes as `Expired`. The rule behind it, 12 prompts or more than 20 open, belongs to the per-turn update.

### 2.7 Empty, loading and error states

| State | Text |
|---|---|
| Needs you, empty | A title, `Nothing needs you.`, and a hint line: `Claude's questions and the tasks only you can do show up here.` (`Codex's` in the Codex tab) |
| Findings, empty | `No findings yet` and `Claude flags issues and opportunities it spots beyond your task.` |
| PRs, empty | `No PRs` and `Your PRs show here when this session opens or links one, or when your branch has one.` |
| PRs, loading | `Checking for PRs…` |
| View loading | `Loading…`, in the HTML view only |
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

The normal demo shows `DEMO_NOTICE` from `hooks/view.ts` at the top: `Sample entries. Presses send nothing.` with a [Hide demo] button. The band starts its counts with `Demo:` and also has [Hide demo]. A press on a sample action reads on the row: `Sample entry: nothing was sent.`

For a recording, `/inbox demo recording` hides those notices, the band's `Demo:` prefix, Hide demo and sample press notes. A Codex build made with `INBOX_DEMO_RECORDING=1` also hides the demo notice, Hide demo and sample press notes. Recording demos still use sample entries and send nothing.

## 3. Each look

### 3.1 Terminal

**Placement.**

- The band above the prompt, up to 19 rows at a 49-row terminal.
- The `/inbox` pane. It docks beside the transcript in a fullscreen terminal from 110 columns, and is otherwise a framed region above the prompt.
- The Herdr sidebar line. It is the only place that names an open permission prompt or AskUserQuestion dialog.

**The band.** One line: the counts for Needs you and Findings, with [Open inbox] at the right end. Each count reads as its tab does: the tab's name, muted, then the count in the tab's color. The button opens the pane with the top row open. The line is the same while Claude works and when the person comes back after a break.

```
Needs you 2 · Findings 1                                [Open inbox]
Nothing needs you                                       [Open inbox]
Demo: Needs you 7 · Findings 4              [Hide demo] [Open inbox]
```

A count of zero drops out. During `/inbox demo` the line starts with "Demo:", so the sample counts do not pass for real ones.

A stop draws a second line under the counts, so [Open inbox] does not move. It starts with "Stopped 1m ago:" in red. An API error adds [Resume], which reads "Resuming…" under the same key while it sends.

```
Needs you 2 · Findings 1                                [Open inbox]
Stopped 1m ago: API error (overloaded). [Resume]
```

The band falls back to the engine default when the mod is off, a survey shows, or the session has no stop, Overview, items or findings. Unreadable saved items and blocked inbox tools show only in the pane.

**The pane.** Raised tabs when docked, "a: Label" on each action, j and k, 1 2 3 for tabs, ctrl+x tab, Esc, and the Keys drawer.

```
 Needs you 3 │ Findings 2 │ PRs 1
 ─────────────────────────────────────────────────────────
 ! Stopped 3m ago: sign-in expired. Run /login, then send
   a message.
 Questions
 1) Use --dry-run or --preview for the flag?       2m ago
    Both work. --dry-run matches git.
    a: --dry-run   b: --preview
    t: Reply   e: Explain   x: Dismiss
 2) Merge now or wait for review? · 5m ago
 Tasks
 • Sign in to npm · ✓ Explain 1m ago
 ▸ 3 Closed
```

**Typing.** As in 2.5. Enter sends. Cancel closes the field. Esc closes the whole pane.

**States.** As in 2.6 and 2.7.

**Cannot do.** A Remote Control or phone viewer sees no band or pane. There is no substitute in the inbox. The platform's own session list covers that viewer.

### 3.2 Desktop

**Placement.** The same band, with `maxRows` 12, and the same pane, docked. The person resizes the pane; its body went from 36 to 69 columns in one session. Only clicks reach the mod.

The mod picks the desktop drawing on each draw from `e.surface === 'desktop'`, not once per session, because each surface's render is its own evaluation (engine types, `RenderSurface`).

**The band.** The same states as the terminal. [Open inbox] sits at the right end of line 1. The counts shrink first, so a narrow band never pushes it off the line. It is a native button.

**The pane at 36 columns.**

```
Needs you 3  [Findings 2]  [PRs]
Questions
1) Rename the table to accou…
   Rename the users table to
   accounts before the
   migration runs?
   [Yes, rename (recommended)]
   [No, keep users] [Reply]
   [Explain] [Dismiss]
? Keep the old endpoint for…
Tasks
• Add STRIPE_KEY to .env
```

A desktop row Client reserves a side column for the age at narrow widths too. The status is in the footer. An open row's actions wrap in the shared order: retry, options or help, Done or Fix, then follow-ups. The recommended option, Done, Fix or Do it has primary emphasis. The shared action's icon kind maps to the native glyph.

**After [Explain] is pressed**, the row stays open and records the press:

```
1) Rename the table to accou…
   ✓ Explain · just now
   [Yes, rename (recommended)]
   [No, keep users] [Reply]
   [Explain again] [Dismiss]
```

**How the desktop drawing differs from the terminal.**

| Element | Terminal | Desktop | Reason |
|---|---|---|---|
| Action labels | `a: Explain`: a Text letter beside a ": Label" Button | `[Explain]` | Hotkeys do nothing on desktop. "a" beside a native ": Explain" button is noise. |
| Hidden hotkey Box | Drawn | Not drawn | It does nothing there, and might draw as visible native buttons. |
| Tabs | Raised panel; 5 plain Buttons per unselected tab | One Client draws the three tabs. A click anywhere on a tab shows it. Only the shown tab has a fill: raised, rounded and bold. A hovered tab takes the tab gray. Other labels and every count are muted. | A Button takes a click only on its label. A Client takes one over its whole region. The selection color means the open row, so the shown tab does not use it. |
| Reply | A labeled action with its key | A follow-up in a Client region | Native Buttons fill and pad only their labels. The Client preserves follow-up hit areas and spacing. The shared action retains normal emphasis and order. |
| Closed row | Handle Button and title Button, two when the title wraps | One Client per row. A click anywhere on it opens the row. The title is cut to one line with "…". | A Button takes a click only on its label. |
| Keys drawer, "1 2 3", "j k", "ctrl+x tab" | Shown | Not drawn | Nothing to press. |
| Closing the pane | Esc | The app's own ✕ on the pane's title bar | The app draws it, so a [Close] in the pane would be a second close. |
| Tree lines and dividers | `│ ├─ └─` and a `─` rule between rows | None. Closed rows sit flush, each padded a quarter line above and below. A PR's status block starts at the title's column, so only its check and thread rows are indented. | Desktop text is proportional and its lines differ in height, so stacked glyphs break into bars and a rule sized in columns wraps. A rail drawn as a Box is a full cell wide and makes the separator too heavy. |
| Title cut | By columns | By a measured characters-per-column estimate, `DESKTOP_CLIP_CHARS_PER_CELL` | A column of `bodyColumns` holds more than one character of desktop text. |
| Links | `Link` | `Link` for https. A button that runs `open` for local files and folders. | `Link` is live only for https. `$.process` works on desktop. |

**Typing.** The engine types list `Input` for desktop, so `$.ui.resolve(e)` returns it there. The pane drops the Reply field's key when `Input` does not resolve. Typing, Enter and focus need current-build native verification. The person can then type in the composer, and Claude already holds the item through carry text. The inbox cannot prefill the composer, because `$.prompt.fill` does nothing in a headless session.

**PRs.** The PR tab stays. Desktop shows a CI status bar and a Code review card. The PR block adds what those lack: threads that wait on the person, and Address all. It shows CI as status with Open log.

**States.** The same as the terminal. A failed PR fetch shows [Retry], since there is no key to retry and the next poll is 2 minutes away.

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| Hotkeys, Esc, j and k | Every action is a button. A click on a title opens that row. |
| Toasts, unverified | Notes on the row |
| Prefill the composer | The in-pane field. Without `Input`, the composer plus carry text. |
| `Link` to non-https targets | A button that runs `open` |
| `ToolProgress`, `InfoNotice`, `Raster`, `Image` | Not used |
| The Herdr sidebar line | None on desktop. The app shows its own permission dialog. |

### 3.3 Codex

**Placement.** The Inbox thread tab, a full view that stays open beside the thread and polls every 3 s. There is no band and no inline card.

**How it opens.** The person opens Inbox from the thread's side panel, through the plugin's `thread` entrypoint. Every thread has its own instance. Whether the tab stays open when the person switches threads, or reopens with a thread, is not sourced. While the tab is closed, nothing in the inbox signals new items. Codex's Activity view shows only that the chat waits.

**The model's `inbox` tool.** It has no `resourceUri`. It returns text: the count, each open row on one line, and "Open the Inbox tab to act on these." A separate tool, `inbox_view`, carries the `resourceUri` and the `thread` entrypoint and is marked `visibility: ["app"]`. Entrypoints ignore visibility, so the tab still opens. Whether Codex hides an app-only tool from the model is not checked. If it does not, the model could still call it and mount the full view inline.

The tool is split because the tab is already where the person acts. Codex mounts every model-called MCP App inline first, and inline cards would add a second, stale copy of the list each time the model calls the tool.

**First thing seen.** The Needs you tab with its top row open.

```
 [Needs you 2] [Findings 1] [PRs]
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

**Tabs.** Needs you, Findings and PRs. The PRs tab has the same PR blocks as the pane (2.4). The server runs gh in the session's folder and refetches a view when the last fetch is over 2 minutes old.

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

Needs you then reads, above its rows or in place of the empty text:

```
The inbox has not heard from this chat's hooks.
Codex runs a plugin's hooks only after you trust them.
```

When only some hooks are missing, the second line names the cost: `Items from Codex's replies are missing.` The text names no place to approve hooks, because no source or live check shows one in the desktop app.

**States.**

| State | Text | Trigger |
|---|---|---|
| Loading | `Loading…` | Before the first view arrives |
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

## 4. Decisions

1. **A finding's Fix and Discuss.** Fix hands the finding off and moves it to its Closed fold with the outcome "Fix" or "Do it". The finding stays open for Claude to close. Discuss is a Talk, so the finding stays open after it, because talking a finding through does not resolve it. A typed reply folds the finding until Claude's reply leaves it open.
2. **A close opens the next waiting row.** The shared navigation skips handed-off rows and uses the nearest waiting row above when none is below. Its action buttons are guarded for 0.4 s, so a second click cannot immediately answer the next row.
3. **The band holds no answer buttons.** An answer sends at once and has no Undo, and the band shows no question body. [Open inbox] opens the pane with the top question open, next to its body and Explain.
4. **Claude mode is a separate proposal.** [claude-mode.md](claude-mode.md) holds its design. The built looks need nothing from it.

## 5. Not built

- A status line `Claude does not see the inbox here: your organization's settings skip its context.` The guard can skip the mod's `prompt.compose` and `prompt.context` hooks, so Claude gets no guidance or carry text. The mod would need to detect that its `prompt.compose` hook has not run by the first `turn.start`, and that needs a live check.
- Answer buttons in the band, as in decision 3.

## 6. Current-build live checks

Component and state tests do not establish native painting or focus. The checks below remain separate acceptance evidence.

On desktop:

- whether `Input` draws and Enter sends;
- whether toasts draw;
- whether `Markdown` draws, which the review thread body uses;
- whether a `Button` honors `dimColor`;
- whether `/inbox` and `/inbox demo` work as typed commands. The known desktop prompt queue waits for a running turn to end, even though the command is registered `immediate`.

In Codex:

- a tab press end to end;
- whether `codex queue` messages show above the composer and can be edited;
- whether `UserPromptSubmit` carries the queued id or `clientUserMessageId`;
- whether Codex hides an app-only tool from the model;
- whether the Inbox tab stays open across threads.
