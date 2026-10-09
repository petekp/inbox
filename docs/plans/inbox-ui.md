# Inbox UI plan for four clients

This plan sets what the inbox shows in each client and how the person acts on it. The view model, the press contract and the renderers come next, and they must follow from this plan. Section 7 lists what they must provide.

The facts behind it are in [docs/reference/](../reference/README.md), checked on 2026-10-08. Where `clients.md` disagrees with the reference, the reference wins.

Lines that depend on a decision in section 6 carry a tag, such as "(decision 3)". Section 6 states the default taken for each decision. If you pick differently, only the tagged lines change.

## Terms

- **Item**: a question Claude asked, or a task only the person can do.
- **Row**: one entry in a list. A row is an item, a finding, a PR, a PR check or a review thread.
- **Need you**: the rows the count in the band and the Needs you tab counts. Section 2.1 defines it.
- **Item source**: whatever adds and closes items. Today it is a Sonnet call after each reply, called the **per-turn update**. Later it may be Claude recording its own items with tools. That choice is open, so the UI must not depend on it.
- **Card goal and current step**: the per-turn update's one-line summary of the session: what it is for, and what Claude is doing now.
- **Mod**: the Claude Code plugin in `hooks/` that draws the band and pane.
- **Band**: the mod's lines above the prompt.
- **Pane**: the mod's `/inbox` view.
- **Surface**: the app that draws a session, `terminal` or `desktop`. The mod reads it from `e.surface` on each draw.
- **Carry text**: the inbox text the mod adds beside a prompt or at the start of the context, so Claude knows the open items and their ids.
- **Guard**: the built-in mod `cc-plugin-sec-default`. On Team or Enterprise sign-ins and managed machines it loads ahead of user mods and limits what they can change.
- **Hooks-worker**: the process that runs every mod's hooks. After three crashes it unloads every non-built-in mod until `/reload-plugins`.
- **MCP App view**: an HTML view an MCP tool names, which the host draws in an iframe. The Codex Inbox tab is one.
- **Card** and **full view**: the two layouts of the HTML view. A card sits inline in the transcript. A full view fills the tab or the screen.
- **Hand-off**: a press that gives the row's work to the agent, so it stops waiting on the person for now.
- **Settled row**: a row that just closed or was handed off, kept in place with a ✓ and its outcome for 5.12 s before it leaves.
- **Leave bar**: the thin line under a settled row that empties over those 5.12 s, so the person sees when the row will move. The 5.12 s is a value tuned by hand; it was cut from 6.4 s after use.
- **Details**: the button on a folded row that shows its body and actions again. Hide details folds it back.
- **Chat**, **Cowork** and **Unified Claude**: the desktop app's Claude mode. The public docs split it into Chat and Cowork, an agent mode that can run on the person's machine. A changelog says "Unified Claude ... combines Chat and Cowork".

## 1. Summary

The inbox has two renderers. The mod draws the terminal and desktop Code mode. One HTML view draws the Codex tab and Claude mode.

**Terminal.** The band leads with how many things need the person and the top one, and has an [Open inbox] button. The pane keeps its keys, and gains the shared fixes: feedback on the row, Undo, a Cancel button, every option drawn, question numbers that match what a typed number answers, and source-neutral status words.

**Desktop Code mode.** The same band and pane, drawn for clicks. Actions are plain labels with no key letters. Each tab is a native button, and the shown tab is the primary one. The app's own ✕ closes the pane. Nothing depends on a key.

**Claude mode.** Claude records items with the inbox's tools, because nothing else watches a chat. Claude ends a reply that leaves something open with an inline card: a count, up to three rows and [Open inbox]. The full view opens fullscreen with Needs you and Findings. It is not built now (decision 2). The seams stay open so it can be added.

**Codex.** The Inbox thread tab, with the same rows as the pane. A press shows Sending…, then Queued, then a check mark once the hooks see the message arrive. An empty tab tells "the inbox has not heard from this chat's hooks" apart from "nothing needs you". The model's `inbox` tool returns text only, so it no longer mounts the full tab inline.

Every action is a button in every client. Keys are an optional extra wherever they work.

## 2. Shared vocabulary

### 2.1 What comes first

The count of what needs the person and the top row come first. The card goal and current step come second. Every platform already shows which session waits on the person. The inbox adds the item itself.

One phrase names the count everywhere: "need you". The tab is "Needs you", the band says "2 need you", and the empty state says "Nothing needs you."

**What the count holds.** It is `needsYouCount`:

- open questions;
- open tasks not handed off.

It leaves out findings, PR rows, handed-off rows and the stop line. A queued send (2.3) counts as pressed: an answered question is closed and leaves, and a handed-off row leaves, while a row with a queued talk send stays in the count. Findings have their own count ("1 finding"). The PRs tab counts the open PRs that need the person: a merge conflict, a failing check, requested changes or a thread waiting on them.

**The order of the Needs you list.** The top row is the first row of this list. [Open inbox] opens the pane with it open.

1. Questions from Claude's latest reply, in the order Claude asked them.
2. Other open questions, newest first.
3. Tasks not handed off, oldest first.

The Herdr sidebar line names the latest reply's first question (`statusLine`, `hooks/ledger.ts:1020`). The band and pane lead with the same question: it is what Claude is waiting on, and question numbers then read 1, 2, 3 from the top.

### 2.2 Row types

A row has two forms:

- **Closed**: one line, with the handle, the title and the age.
- **Open**: the full title, the body and the row's actions.

| Row | Where | Closed form | Open form adds |
|---|---|---|---|
| Question | Needs you | `1) ask · 3m ago`, or `? ask · 3m ago` (see numbers below) | Full ask, one button per option with the recommended one styled primary, help steps |
| Task | Needs you | `• ask · 3m ago` | Help steps (open, copy, run, terminal, link), "Open PR #N" when the ask names a tracked PR |
| Finding | Findings | `• title · 3m ago` | Kind badge (▲ Issue or ✦ Opportunity), detail, "Relevant file: path" |
| PR block | PRs | Always open: `#12 title`, readiness, one line of facts | PR actions |
| PR check | PRs, inside the PR block | `✗ lint · failing check`. Status only, with no Fix. | Open log |
| Review thread | PRs | `◦ api.ts:40 latest comment · 2h ago` | Comments as Markdown |
| Review thread, sent | PRs | Folds to `✓ Address` and the latest comment's first line | Unfolds when a newer comment arrives |
| Review thread, lines changed | PRs | Folds with no ✓, noted `Lines changed since this comment · still open on GitHub` | Nothing says the change fixed it, so it gets no ✓ |
| Stop | Top of the band and pane | One red line: what stopped and what to do | Nothing |
| Settled | Where the row was | `✓ Done · just now` with the leave bar | [Undo], after a Mark |
| Closed fold | Under Questions and Tasks, and Findings (decision 1) | `▸ 3 Closed` | Up to 3 closed items, each `ask → outcome` |
| Card goal and step | Codex tab line 2 | `◆ goal · current step` | Nothing |

The Closed fold's outcomes are today's: the answer itself ("Yes, rename"), "Done", "You ran it", "Dismissed", "Expired", "Closed by Claude: <reason>", and the per-turn update's own outcome text.

The terminal and desktop do not show the card goal and step: the band shows only counts, and the pane only rows. Codex has no band, so its tab shows them on line 2. Claude mode has no per-turn update, so it has no goal line.

The group title "Your tasks" becomes "Tasks", to match "Questions".

**Question numbers.** Typing "1 yes" in the prompt answers a numbered question through `answerNote` (`hooks/ledger.ts:749-765`). Today the pane's numbers and a typed number do not line up:

- The pane numbers a question by its place among open questions (`hooks/register.tsx:2828`).
- `answerNote` maps a typed number to Claude's latest batch of questions: by Claude's own label when it gave one, else by position in the batch. It does this only when that batch came from the reply just before.

So when older questions stay open, or Claude labeled its questions differently, the pane's "1)" and a typed "1" name different questions. That sends an answer to the wrong question as the person.

The rule: a question's handle shows a number only when a typed number reaches it now, and shows the number `answerNote` would resolve. Every other open question shows `?`. Once the person sends any message, the batch is no longer "the reply just before", and every handle becomes `?` until Claude asks again. The Codex tab follows the same rule, since it uses `answerNote` through `promptNotes`. Claude mode has no prompt hook, so its rows have no numbers.

**Which row is open** (decision 3).

- When the pane or full view opens, the top row is open.
- A click on a closed row's title opens it. A click on an open row's title does nothing.
- After a press, the pressed row shows its result in place. No other row opens on its own.

**The press guard.** An action button ignores presses for 0.4 s after its row opens. During that time the row's buttons draw dim (`dimColor` on a mod `Button`, `disabled` in HTML), so an ignored press shows why. The guard is needed under either answer to decision 3. A double-click on a closed row's title opens the row with its first click, and the second click lands on a button that just drew under the pointer.

### 2.3 Five kinds of action

Every press is one of five kinds. The kind decides what the screen shows at once.

| Kind | What it does | What shows at once |
|---|---|---|
| **Talk** | Sends a message asking Claude to talk or draft. The row's work is not given away. | The row stays open and in the count. Its age becomes `✓ Explain · just now`. The button reads "Explain again". |
| **Hand-off** | Sends a message that gives the work to Claude. | The row leaves the count and folds to `✓ Address · just now [Details]`, until the re-entry rule below brings it back. One keeps today's behavior: a PR block, which is always open, records `✓ Resolve conflicts` on the block. |
| **Local** | Opens or copies on the person's machine. | A note on the row at once: `Opening settings.json…` or `Copying npm test…`. The result replaces it: `✓ Opened settings.json`, or in red, `Could not open settings.json: it was moved`. |
| **Mark** | Changes state only, and sends nothing. | The row settles in place with the Mark's own label, `✓ Done` or `✓ Dismissed`, and an [Undo] button, then leaves after 5.12 s. |
| **View** | Changes only what is on screen, or reloads it. | The change itself: a view opens or closes, a row unfolds, a tab switches, a status reads `Refreshing PRs`. |

The View kind covers [Open inbox], the tab buttons, Details and Hide details, [All 7 options], the Closed fold, Show demo and Hide demo, Reply in chat, Undo and Retry. [Try again] repeats a failed press, so it takes that press's kind.

**Answering a question** is a Mark and a send together. The row settles as `✓ Yes, rename`, and `Re "<ask>": <answer>` goes to Claude. It has no Undo, because the message is already on its way.

**A terminal help step** copies a command for the person to run. Its note names where to run it:

- Terminal: `✓ Copied gh auth login. Run it in a terminal, or type ! and paste.`
- Desktop and Claude mode: `✓ Copied gh auth login. Run it in Terminal.` Whether "type !" works in the desktop composer is not sourced, so desktop leaves it out.

A step with several helps of one kind gets one note: `✓ Opened 3 PRs`. A mixed step lists each part: `✓ Copied the key · Opened .env`.

**A send that has not arrived yet.** A send has arrived once the agent has the message as a turn's prompt. Until the client sees that:

- The row reads `Queued: Yes, rename` or `Queued: Explain`, with its age, in place of the ✓.
- The press otherwise counts as done. An answered question is closed and leaves the count. A hand-off folds. A talk send keeps the row open.
- When the client sees the message arrive, the row reads `✓ Yes, rename`.
- When the send fails, or the client sees it withdrawn, the press is undone. A closed question reopens, a folded row unfolds, and the row reads `Not sent: <reason>` in red with [Try again]. A typed draft is kept.
- When the client has no signal for arrival, the row stays `Queued` with its age growing. It never claims a ✓ it cannot back.

Each client's signal:

- **Mod**: the prompt's own row being stored (`session.append`). `send()` already waits for it to attach its context (`hooks/register.tsx:825-827`). When Claude is idle, `$.prompt.submit` starts a turn at once, so `Queued` shows only for a press during a turn.
- **Codex**: see 3.4.
- **Claude mode**: see 3.3.

**Undo.** These Marks get Undo, in every client: an item's Done and Dismiss, a finding's Dismiss, and a PR's Dismiss. Undo puts the row back where it was, open, in its state before the press. If the close already reached Claude in carry text, the next carry text reports the item reopened. The Codex and Claude-mode servers record Undo as they record the Mark.

**Re-entry after a hand-off.** A handed-off row waits on Claude until Claude has had one reply to act on it. Then, if the row still waits on the person, it unfolds.

- Tasks: this is today's rule, `isTaskHandedOff` in `hooks/presses.ts`. The row unfolds once the update for a turn started after the press has applied.
- Findings: the same turn rule (decision 1). Today Address and Discuss remove the finding on press (`actOnFinding`, `hooks/register.tsx:1104-1107`), so there is nothing to unfold.
- Review threads keep today's rule, because GitHub says when they change. A sent thread unfolds when a newer comment arrives.
- Claude mode has no turns. A row unfolds when Claude's next inbox tool call arrives after the hand-off reached Claude, with the item still open.

**Feedback lives on the row.** No action reports only through a toast. Toasts are unverified on desktop and do not exist in the HTML views.

- A success note clears with the same 5.12 s timer as a settled row.
- A failure note stays until the next press on that row. Where retrying makes sense it has a [Try again] button.
- A press on a row that changed or left reads `This changed before your press. Nothing was sent.` A typed draft is kept.

### 2.4 Actions per row

Actions keep one order on every row: the main action, then the action that finishes the row, then talk actions, then Dismiss where the row has one.

| Row | Action | Shows when | Kind |
|---|---|---|---|
| Question | each option | Always. With 5 or fewer options, all show. With more, the first 4 and [All 7 options]. | Mark and send |
| | Type an answer | A text field draws (2.5) | Mark and send |
| | Explain | Always | Talk |
| | Dismiss | Always | Mark |
| Task | each help step | One per step the item carries | Local; a Run step is a Hand-off |
| | Done | Always | Mark |
| | Type a reply | A text field draws | Hand-off |
| | Explain | Always | Talk |
| Finding | Address | Always | Hand-off (decision 1) |
| | Discuss | Always | Talk (decision 1) |
| | Type a reply | A text field draws | Hand-off (decision 1) |
| | Dismiss | Always | Mark |
| PR check | Open log | Always. It opens the PR page when the check has no log link. | Local |
| Review thread | Address | Always | Hand-off |
| | Draft reply | Always | Talk |
| | Open | Always | Local |
| | Discuss | Always | Talk |
| PR block | Resolve conflicts | The PR is open and conflicts with its base | Hand-off |
| | Address all N threads | More than one thread waits on the person | Hand-off |
| | Open PR | Always | Local |
| | Dismiss | Never on the current branch's PR (`hooks/register.tsx:3622`) | Mark |
| Band and pane controls | Open inbox, Close, tabs, Details, All N options, Closed fold, Retry, Show demo, Hide demo, Undo | Where each applies | View |

Three rows have no Dismiss:

- A task finishes with Done, so Dismiss would be a second word for the same press.
- A review thread and a PR check live on GitHub. They leave when GitHub changes, or with the PR's own Dismiss.

"Address it" on a finding becomes "Address", the same word as on a thread.

**PR readiness.** The block's status line is one of: `Ready to merge: approved, checks pass, no threads waiting on you`, `Blocked: <reasons>`, a draft (`Blocked: draft, …`, gray), `Merged` or `Closed`.

**Every option draws.** Today `CHOICE_KEYS` in `hooks/register.tsx:1549` cuts a question at 9 lettered options and steps. Under this plan every option has a button. In the terminal only the first 9 get letters.

### 2.5 Typing a reply

The field opens under the open row with [Send] and [Cancel]. Each row keeps its own draft, so opening another row does not throw the words away.

- **Type an answer** is on questions. Send closes the question with the typed words.
- **Type a reply** is on tasks and findings. Send hands the row off and keeps it. For findings this depends on decision 1; today a typed reply removes the finding (`sendTypedForFinding`).

The two labels differ because the presses differ: one closes the row and one does not.

Claude mode has no field. See 3.3.

### 2.6 Status, the same for either item source

The UI reads one status record for items and one for PRs. Either item source fills the first.

| Field | Shown as |
|---|---|
| `changedAt`, when the item list last changed | `Updated 3m ago`, or `Not updated yet` |
| `isUpdating`, optional | `Updating…`. Only a source with pending work sets it. |
| `error`, optional, with the source's own text | The text in red |
| PR `isFetching` | `Refreshing PRs` |
| PR `fetchedAt` | `PRs checked 3m ago` |

The PRs tab shows the PR status. The other tabs show the item status. This is today's split (`hooks/register.tsx:3203-3212`).

The UI never names the per-turn update or a tool. For the per-turn source the error reads `Last update failed. Items from that reply may be missing. It retries after your next message.` A source that does not retry leaves out the last sentence.

An expired item closes as `Expired`. The rule behind it, 12 prompts or more than 20 open, belongs to the source.

### 2.7 Empty, loading and error states

| State | Text |
|---|---|
| Needs you, empty | `Nothing needs you.` One line, replacing today's two group lines. |
| Findings, empty | `No findings yet` and `Claude flags issues and opportunities it spots beyond your task.` |
| PRs, empty | `No PRs` and `Your PRs show here when this session opens or links one, or when your branch has one.` |
| PRs, loading | `Checking for PRs…` |
| View loading | `Loading…`, in the HTML view only |
| PR refresh failed | `Last refresh failed: <reason>` and [Retry] |
| Inbox unreadable | `Could not read the inbox.` and [Try again] |
| Not hearing from the chat | Its own text per client, below. An empty list there must not read as "all clear". |

**Not hearing from the chat, per client.**

- **Terminal and desktop, tools refused.** The guard refuses the mod's `$.tool.register` call when managed settings set `allowedMcpServers`. The band still draws, so the status line is the only sign. It reads in red: `Claude cannot record or close items here: your organization's settings block the inbox's tools.`
- **Terminal and desktop, context skipped.** The guard can also skip the mod's `prompt.compose` and `prompt.context` hooks, so Claude gets no guidance or carry text. The mod may detect this when its `prompt.compose` hook has not run by the first `turn.start`; that needs a live check. If it can, the status reads `Claude does not see the inbox here: your organization's settings skip its context.`
- **A missing band** has no substitute inside the inbox. A worker crash, safe mode, an untrusted folder or an org policy unloads the mod, and it cannot report its own absence (reference fact 21).
- **Desktop before attach.** A Code-mode session starts with no surface and the app attaches about 0.1 s later. Nothing draws before then, so there is no state to design.
- **Claude mode.** Nothing to miss: the card exists only because Claude called the inbox. The `as of` age covers staleness (3.3).
- **Codex.** See 3.4.

### 2.8 New rows

- The counts change at once.
- A new row gets a colored bar for 1.5 s.
- The view jumps to another tab only when the tab on screen shows nothing but its empty text.
- The 200 ms tab draw-in stays in the terminal only. At desktop's 10 redraws a second it drops most of its frames.

### 2.9 Keys

Keys are an optional extra wherever they work. No action depends on them. Only the terminal shows key text, because keys are verified there. The Codex tab keeps its working keys with no key text. Desktop drops them, because a `Button`'s hotkey does nothing there.

### 2.10 Demo

`/inbox demo` in the mod, and [Show demo] in the HTML views, show sample entries. Every client shows the same banner at the top while the demo is on: `Showing sample entries. Presses here send nothing.` and a [Hide demo] button. A press on a sample action reads on the row: `Sample entry: nothing was sent.` Today the mod pane has no banner, and its toast says to run `/inbox demo` again to leave, which needs typing.

## 3. Each client

### 3.1 Terminal

**Placement.**

- The band above the prompt, up to 19 rows at a 49-row terminal.
- The `/inbox` pane. It docks beside the transcript in a fullscreen terminal from 110 columns, and is otherwise a framed region above the prompt.
- The Herdr sidebar line, unchanged. It stays the only place that names an open permission prompt or AskUserQuestion dialog.

**The band.** One line: the counts for Needs you and Findings, with [Open inbox] at the right end. The button opens the pane with the top row open. The line is the same while Claude works and when the person comes back after a break.

```
2 need you · 1 finding                                  [Open inbox]
Nothing needs you                                       [Open inbox]
Demo: 7 need you · 4 findings               [Hide demo] [Open inbox]
```

A count of zero drops out. Only "N need you" is amber; the rest is muted. During `/inbox demo` the line starts with "Demo:", so the sample counts do not pass for real ones.

A stop draws a second line under the counts, so [Open inbox] does not move. It starts with "Stopped 1m ago:" in red. An API error adds [Resume], which reads "Resuming…" under the same key while it sends. When the band has one row, the stop line drops.

```
2 need you · 1 finding                                  [Open inbox]
Stopped 1m ago: API error (overloaded). [Resume]
```

The band falls back to the engine default when the mod is off, a survey shows, or the session has no stop, card, items or findings. Unreadable saved items and blocked inbox tools show only in the pane.

**The pane.** It keeps today's layout and keys: raised tabs when docked, "a: Label" on each action, j and k, 1 2 3 for tabs, ctrl+x tab, Esc, and the Keys drawer. It gains the shared changes in section 2.

```
 Needs you 3 │ Findings 2 │ PRs 1             Updated 2m ago
 ─────────────────────────────────────────────────────────
 ! Stopped 3m ago: sign-in expired. Run /login, then send
   a message.
 Questions
 1) Use --dry-run or --preview for the flag?       2m ago
    Both work. --dry-run matches git.
    a: --dry-run   b: --preview
    t: Type an answer   e: Explain   x: Dismiss
 2) Merge now or wait for review? · 5m ago
 Tasks
 • Sign in to npm · ✓ Explain 1m ago
 ▸ 3 Closed
```

**Typing.** As in 2.5. Enter sends. Cancel is new. Today the only ways out are Esc, which closes the whole pane, or opening another row.

**States.** As in 2.6 and 2.7.

**Cannot do.** A Remote Control or phone viewer sees no band or pane. There is no substitute in the inbox. The platform's own session list covers that viewer.

### 3.2 Desktop Code mode

**Placement.** The same band, with `maxRows` 12, and the same pane, docked. The person resizes the pane; its body went from 36 to 69 columns in one session. Only clicks reach the mod.

The mod picks the desktop drawing on each draw from `e.surface === 'desktop'`, not once per session, because each surface's render is its own evaluation (engine types, `RenderSurface`).

**The band.** The same states as the terminal. [Open inbox] sits at the right end of line 1. The counts shrink first, so a narrow band never pushes it off the line. It is a native button.

**The pane at 36 columns.**

```
Needs you 3  [Findings 2]  [PRs]
Updated 3m ago
Questions
1) Rename the table to accou…
   Rename the users table to
   accounts before the
   migration runs?
   [Yes, rename] [No, keep users]
   [Type an answer] [Explain]
   [Dismiss]
? Keep the old endpoint for…
Tasks
• Add STRIPE_KEY to .env
```

Below 50 columns, a closed row drops its age; the open form still shows it. At 50 columns or more, closed rows show their age, the status moves onto the tab line, and buttons share lines where they fit.

**After [Explain] is pressed**, the row stays open and records the press:

```
1) Rename the table to accou…
   ✓ Explain · just now
   [Yes, rename] [No, keep users]
   [Type an answer] [Explain again]
   [Dismiss]
```

**How the desktop drawing differs from the terminal.**

| Element | Terminal | Desktop | Reason |
|---|---|---|---|
| Action labels | `a: Explain`: a Text letter beside a ": Label" Button | `[Explain]` | Hotkeys do nothing on desktop. "a" beside a native ": Explain" button is noise. |
| Hidden hotkey Box | Drawn | Not drawn | It does nothing there, and might draw as visible native buttons. |
| Tabs | Raised panel; 5 plain Buttons per unselected tab | The same panel of plain Buttons for every tab, the shown one in the selection color, with each count in its tab's color | The app takes the focus off the pane when the pressed element leaves, so the next click only brings it back. Drawing the shown tab's name as a Button keeps it. A plain Button draws without chrome, so the panel can be large and its count colored. |
| Closed row | Handle Button and title Button, two when the title wraps | Handle as Text. The title is one button, cut to one line with "…". | Halves the native buttons in the list. |
| Keys drawer, "1 2 3", "j k", "ctrl+x tab" | Shown | Not drawn | Nothing to press. |
| Tab draw-in | Kept | Not drawn | It drops most frames at 10 redraws a second. The 1.5 s new-row bar and the leave bar stay. |
| Closing the pane | Esc | The app's own ✕ on the pane's title bar | The app draws it, so a [Close] in the pane would be a second close. |
| Tree lines and dividers | `│ ├─ └─` and a `─` rule between rows | None. A blank line sets rows apart. | Desktop text is proportional and its lines differ in height, so stacked glyphs break into bars and a rule sized in columns wraps. |
| Title cut | By columns | By about 1.25 characters per column | A column of `bodyColumns` holds more than one character of desktop text. |
| Links | `Link` | `Link` for https. A button that runs `open` for local files and folders. | `Link` is live only for https. `$.process` works on desktop. |

**Typing.** The engine types list `Input` for desktop, so `$.ui.resolve(e)` returns it there. Whether the app paints it, and whether Enter sends, is live check 4. The mod cannot see at runtime that a resolved element failed to paint. So if the check fails, the desktop drawing branch on `e.surface` drops the `typekey-` actions itself. Today's rule, which hides them only when `Input` does not resolve (`hooks/register.tsx:2885`), would not catch it. The person then types in the composer, and Claude already holds the item through carry text. The inbox cannot prefill the composer, because `$.prompt.fill` does nothing in a headless session.

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

### 3.3 Claude mode

Claude mode is the desktop app's chat side. It runs no hooks and no mods. The inbox reaches it only as a local MCP server with tools and MCP App views. It is not built now (decision 2): this section is the design, and nothing for it is built. How the server is installed, named, kept out of Code mode and scoped to one chat is in section 7.

**Where items come from.** Nothing watches the chat, so Claude records items with the inbox's tools: record a question, record a task, record a finding, close one, and show the inbox. Rows, actions and states otherwise follow section 2.

**One list per chat.** The card lists only this chat's items, because a press can only send into the chat it sits in. The app's own session list shows which chat waits. If the inbox loses track of the chat, the card reads `New inbox for this chat`, so the split is visible.

**First thing seen: the inline card.** Claude calls show inbox at the end of a reply that leaves something open, and when the person asks what is waiting. The card follows Claude's inline guidance: a few data points and at most 2 actions.

```
┌───────────────────────────────────────────────┐
│ 2 need you · 1 finding           as of 2m ago │
│ Postgres or SQLite for the cache?             │
│ Add STRIPE_KEY to .env                        │
│ Retry loop never backs off                    │
│ [Open inbox]                                  │
└───────────────────────────────────────────────┘
```

- Rows are text, not buttons. The card has one action.
- The person answers the newest question in the composer, because Claude asked it in the reply just above.
- An empty card reads `Nothing needs you.` with no button.

**Older cards.** Each show call mounts a new card, and old ones stay in the transcript. A card draws from its tool result at once. While it is the newest card it polls and stays live. Once a newer card exists, it draws one muted line, `Moved to a newer card below`, with no buttons, and stops polling. A stored chat mounts its cards again when the person scrolls to them. Such a card draws collapsed until its first poll says whether it is still the newest, so it never flashes old counts.

**Full view.** [Open inbox] asks for fullscreen. The composer stays visible below it. The layout matches the Codex tab: Needs you and Findings tabs, the same rows, one open row. There is no PRs tab, because a chat has no repo or branch.

If the host does not grant fullscreen, the card stays a summary with no [Open inbox]. Answers, Done and Dismiss then go through the composer, and Claude closes items with its tools. An expanded card with clickable rows would break the inline guidance: at most 2 actions, no drill-ins, no nested scrolling.

**Presses.** What `ui/message` and `updateModelContext` do in Claude is unknown (reference open question 4). The view can read which methods the host declares in its `ui/initialize` result, but not whether Claude treats a `ui/message` as the person's own words. So the send route is fixed per host after live check 2, not chosen per press.

- **If `ui/message` arrives as the person's message:** sends work as in the other clients. The row reads `Queued: Explain` until the host answers the request, then `✓ Explain · just now`. A refusal reads `Not sent: <reason>`.
- **If only `updateModelContext` works:**
  - An answer or Address reads `Queued for your next message: Postgres`. It counts as a queued send (2.3): the question leaves the count.
  - It reads `✓ Postgres` once Claude closes the item or makes its next inbox call.
  - Explain and Discuss are hidden. They only make sense as a message sent now.
- **If neither works:** Claude mode shows items and keeps Done, Dismiss and opens. Answers and talk go through the composer.

Done and Dismiss are Marks, recorded by the server, with Undo as in 2.3. Claude learns of them in its next inbox tool result. There is no Run step in Claude mode, because a chat has no shell.

**Opens and copies.** A link goes through `ui/open-link`, which shows Claude's confirmation dialog; that dialog shows the press. A local file opens through the server, only for paths the inbox itself listed, and the row reads `✓ Opened`. Copy uses `clipboardWrite` where granted, with the notes from 2.3. Otherwise a select-all text box appears on the row with [Close], as in Codex today.

**Typing.** No text field. "Type an answer" and "Type a reply" become **Reply in chat**. It closes the full view so the composer has focus. Claude's guidance puts free text in chat.

**Stale items.** An item answered in the composer stays open until Claude closes it. So every row shows its age, the card shows `as of 2m ago`, and the full view always has the row's own close: Dismiss on a question or finding, Done on a task.

**States.**

| State | Text |
|---|---|
| Empty | `Nothing needs you.` In the full view a muted second line: `Claude adds items here when it records them.` |
| Loading | None. A new card draws from its tool result at once. |
| Server gone, card already mounted | `The inbox server is not running. Restart Claude to bring it back.` Rows stay muted, with no buttons. |
| Lost track of the chat | `New inbox for this chat` |
| Superseded | `Moved to a newer card below` |
| Status | `Updated 3m ago` from Claude's last recorded change. `Updating…` never shows. |

**If the view does not render.** The person sees only the tool's text content. It lists the count and each open row on one line.

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| A per-turn update | Claude records items; the card shows "as of" |
| A view beside the chat | The card at the end of replies, plus fullscreen |
| Push updates | The newest card polls while visible |
| `ui/message` as the person, unknown | `updateModelContext` with a queued state, or the composer |
| Fullscreen, unknown | The card stays a summary; the composer does the rest |
| Many live cards | Older cards collapse and take no presses |
| A text field | The composer |
| PRs, stop, goal line, previous session | Left out. Nothing produces them in a chat. |

### 3.4 Codex

**Placement.** The Inbox thread tab, a full view that stays open beside the thread and polls every 3 s. There is no band and no inline card.

**How it opens.** The person opens Inbox from the thread's side panel, through the plugin's `thread` entrypoint. Every thread has its own instance. Whether the tab stays open when the person switches threads, or reopens with a thread, is not sourced (live check 5). While the tab is closed, nothing in the inbox signals new items. Codex's Activity view shows only that the chat waits.

**The model's `inbox` tool.** Today it carries `_meta.ui.resourceUri` (`codex/src/server.ts:38`), and Codex shows every model-called MCP App inline first. So a model call mounts the full three-tab view in the transcript, against Codex's inline guidance (at most two actions, no multiple views). The plan splits the tool:

- The model-facing `inbox` tool has no `resourceUri`. It returns text: the count, each open row on one line, and "Open the Inbox tab to act on these."
- A separate tool carries the `resourceUri` and the `thread` entrypoint, marked `visibility: ["app"]`. Entrypoints ignore visibility, so the tab still opens.
- Whether Codex hides an app-only tool from the model is open (reference open question 6). If it does not, the model could still call it and mount the full view inline, so its description says it is for the tab only.

The split is chosen over a compact inline layout because the tab is already where the person acts. Inline cards would add a second, stale copy of the list each time the model calls the tool.

**First thing seen.** The Needs you tab with its top row open.

```
 2 need you · 1 finding                    Updated 3m ago
 ◆ Rename the inbox · writing the README
 [Needs you 2] [Findings 1]
 ──────────────────────────────────────────────────────
 Questions
 1) Use "inbox" or "attention" for the name?     2m ago
    [inbox] [attention]
    [Type an answer] [Explain] [Dismiss]
 Tasks
 • Add API key to .env · 5m ago
 ──────────────────────────────────────────────────────
 [Show demo]
```

Line 1 is the count and the status. Line 2 is the card goal and step, since Codex has no band. Codex's Activity view already shows which chat waits.

**Kept from today's tab.**

- Rows, groups, folds and Details.
- Rows that vanish between polls settle in place.
- The out-of-order poll guard.
- A draft per row, with Send and Cancel.
- The clipboard fallback box.
- The demo toggle.
- The keys (1 and 2 for tabs, j and k, row hotkeys, Esc in a field), as an optional extra with no key text (2.9).

**How a press shows what it did.** A send goes through `codex queue`, which holds the message until the running turn ends.

1. `Sending…` while the server runs `codex queue`.
2. `Queued: Explain` once `codex queue` prints `Queued message {id}`. The server keeps that id.
3. `✓ Explain · 1m ago` when the `UserPromptSubmit` hook fires with the exact text the server queued. The server matches this today through its `sent` list (`codex/src/core.ts:70`).
4. Otherwise the row stays `Queued: Explain · 2m ago`, with its age growing. This covers an untrusted `UserPromptSubmit` hook. It also covers a queued message the person edited, if Codex lets them. The docs say queued messages can be edited above the composer. Whether `codex queue` messages show there is an open question.

A text match is the only signal proven live. Once a channel that carries the queued id or its `clientUserMessageId` is verified, the server matches by id instead. There is no "removed from the queue" state: the server holds no app-server connection, so it cannot list the queue. That state waits for a queue-listing channel that is built and verified.

A failed `codex queue` shows `Not sent: <reason>` in red with [Try again]. The press is undone, as in 2.3.

**Not hearing from this chat.** Codex runs a plugin's hooks only after the person trusts each hook definition, and skips a hook until its current definition is trusted. If hooks need review at startup, Codex prints a warning. Trust is per hook, so `SessionStart` can run while a changed `Stop` hook is skipped. The tab checks each hook it needs:

- No `SessionStart` record for this thread: no hook has run.
- An inbox tool call arrives for a turn that `UserPromptSubmit` never recorded: that hook is skipped.
- `UserPromptSubmit` has recorded two or more turns and `Stop` has recorded none: that hook is skipped, and the per-turn update never runs.

Needs you then reads, in place of the empty text:

```
The inbox has not heard from this chat's hooks.
Codex runs a plugin's hooks only after you trust them.
```

When only some hooks are missing, the second line names the cost: `Items from Codex's replies are missing.` The text names no place to approve hooks, because no source or live check shows one in the desktop app.

**States.**

| State | Text | Trigger |
|---|---|---|
| Loading | `Loading…` | Before the first view arrives |
| Unreadable | `Could not read the inbox.` and [Try again] | The first `inbox_view` read fails, so there is no view to show |
| No connection | `The inbox could not connect to Codex.` | The `ui/initialize` request fails |
| Polls failing | Muted `Last read 1m ago · retrying`, red after a minute | Two later polls fail while a view is shown |
| Demo | The banner from 2.10 | The demo is on |

**No PRs tab for now.** Codex has its own PR review panel, and the PR fetch lives in the mod, tied to `$.process` (`hooks/register.tsx` around 1284-1420). Add PRs once that code is shared, if threads that wait on the person prove worth showing there.

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| A band | The tab's first two lines, and Codex's Activity view |
| Push updates | The 3 s poll |
| A trusted `ui/message` | `codex queue`, shown as Queued |
| Model context from `Stop` | Context at the next prompt |
| Hooks before trust | The "not heard" state |
| A stop line | None. Codex shows its own errors in the thread. |
| A signal for new items while the tab is closed | None |

## 4. The biggest unknown

Two questions are open (reference open question 1):

- Does desktop Code mode render MCP App views?
- Does Claude mode run mod modules? The question is asked of Cowork. If Unified Claude merges Chat and Cowork, it applies to Claude mode as a whole.

**The plan assumes no to both.** That is the conservative reading, not the likelier one for Code mode. The MCP Apps quickstart says Claude Code "doesn't render the UI", but that line is about the CLI. A third-party desktop changelog says the Code tab gained "interactive MCP app widgets", and the Code tab allowlists the MCP App content domain (`docs/reference/mcp-apps.md:431`, `:491`).

**The plan holds if Code mode renders MCP Apps.** The mod stays the Code-mode renderer. Its pane stays beside the transcript, gets pushed redraws, and sends presses as the person through `$.prompt.submit`. No MCP App mode stays beside the conversation, and nothing pushes into a view. What changes: the Claude-mode server's card could draw in Code-mode transcripts. Section 7 keeps Claude from calling that server there. If a call slips through, its items show in a card rather than only as tool text. The HTML view still serves only Claude mode and Codex.

**If Claude mode runs mod modules:**

- If Chat stays separate, Chat stays as designed in 3.3. If Unified Claude merges the two, all of Claude mode follows the points below.
- The mod's hooks could run there, so the per-turn update could fill items.
- Whether that client draws a mod's band or pane is unknown. Reference fact 1 names "the terminal and the Desktop app" with no exception for Cowork, and no source says Cowork draws one. If it draws them, it gets the Code-mode drawing. If not, it keeps the card and full view.
- Presses from the card reach the MCP server process, not the mod. No channel from the server to the mod's `$.prompt.submit` is known, and Cowork may run the engine in a VM apart from a host-side server (`claude-code-vm`). So the queued state from 3.3 stays until such a channel is found.

Row types, action kinds and states are the same under every answer.

**The five-minute check.**

1. Add a small MCP App test server to a project's `.mcp.json`. Open a local Code-mode session in that folder and ask Claude to call its tool. Look for an Allow prompt, a drawn widget, and requests to `*.claudemcpcontent.com` (`docs/reference/mcp-apps.md:526`).
2. Install a test plugin through Customize, with a hooks module that logs on `session.start` and draws a one-line band. Start a Cowork or Unified Claude session. Look for the log line and the band.

## 5. What changes from today

Section 2 applies to every client. The tables list where each change lands in today's code.

### Mod, in the terminal and on desktop

| Change | Where today | Reason |
|---|---|---|
| The band is the counts and [Open inbox]; a stop adds a line under them | The band render in `hooks/register.tsx` | The band showed up to seven lines on too many topics. The pane holds the rows. |
| The last-session offer is removed | `PREVIOUS`, `bringBack` and the `p:<folder>` store key | The owner chose to drop it |
| Needs you order: questions, then tasks | Group order in the pane, `hooks/register.tsx:2836` | Claude's latest questions come first and read 1, 2, 3 |
| A question's number is the one `answerNote` resolves, else `?` | `itemRow` numbers by place among open questions, `hooks/register.tsx:2828` | A typed number must answer the question the pane numbers |
| No row opens on its own after a press (decision 3) | Selection fallback, `hooks/register.tsx:1132-1153` | A row opening under the pointer catches a second click |
| 0.4 s press guard, with dim buttons | New | A double-click on a title lands on a button that just drew |
| Each press declares one of the five kinds in 2.3, and its feedback follows the kind | `Action.kind`, a `PressKind`, in `hooks/register.tsx` | One rule a new action cannot get wrong |
| Local presses show a pending note, then the result. Open and Open log now record too. | `runPress()` in `hooks/register.tsx` records the pending note, and `withResult()` in `hooks/presses.ts` replaces it with the result | A slow `open` or `gh` call must show the press at once |
| Sends during a turn read `Queued` until the prompt's row is stored | `send()`, `hooks/register.tsx:823-829` | A ✓ before Claude has the message is not true |
| Undo on settled Marks, including finding and PR Dismiss | Settled rows, `hooks/register.tsx:3394-3408` | Catches a misclicked Done or Dismiss |
| Feedback on the row instead of toasts, including terminal help steps | `hooks/register.tsx:885-921`, `1421`, `2512` | Toasts are unverified on desktop |
| Demo banner with [Hide demo]; sample presses say `Sample entry: nothing was sent.` on the row | `hooks/register.tsx:174-176`, `2512-2518` | The demo had no visible marker, and leaving it needed typing |
| Cancel on the text field; a draft per row | `hooks/register.tsx:3120-3142`, `1134` | Esc closes the whole pane; opening another row threw the draft away |
| Every option draws | `CHOICE_KEYS`, `hooks/register.tsx:1549`, `1557-1559` | The key-letter cap hid click targets |
| `Nothing needs you.` replaces two group lines | `hooks/register.tsx:399-402`, `3462-3472` | Two empty lines read as two things to check |
| "Your tasks" becomes "Tasks" | `hooks/register.tsx:401` | Matches "Questions" |
| Status words from 2.6 | `hooks/register.tsx:3203-3213`, `3315-3317` | The UI must not depend on the item source |
| Status line names refused tools | `$.tool.register`, `hooks/register.tsx:1882-1888` | The band draws normally while Claude cannot record or close |
| "Address it" becomes "Address" | Finding keys | One word per concept |
| Findings fold on Address and stay open on Discuss, and re-enter by the turn rule (decision 1) | `actOnFinding`, `hooks/register.tsx:1104-1107` | A discussion that ends in "later" keeps the finding |
| Desktop drawing branch on `e.surface` | Row keys `2856-2871`, tabs `3296-3308`, hidden hotkey Box `3728-3731`, draw-in `170-172` | Desktop draws native buttons and ignores keys |
| [Retry] after a failed PR fetch | `hooks/register.tsx:3656-3660` | No key to retry on desktop |

### Codex tab

Every shared change in section 2 applies to the tab in full. That includes the five kinds, Undo, the queued-send rule, question numbers, the Needs you order, `Nothing needs you.`, the demo banner, the stale-press note, the 1.5 s new-row bar, the 0.4 s press guard and no row opening on its own. The rows below are specific to Codex or name its code.

| Change | Where today | Reason |
|---|---|---|
| Split the `inbox` tool: text-only for the model, entrypoint-only for the tab | `codex/src/server.ts:31-39` | A model call mounts the full tab inline |
| Every option draws | Options cut at `CHOICE_KEYS`, `codex/src/tab.tsx:245` | Same as the mod |
| "Address it" becomes "Address" | `codex/src/tab.tsx:352` | Same as the mod |
| Recommended option as primary button | `codex/src/tab.tsx:236` | Matches the mod |
| `✓ Label` wording | `codex/src/core.ts:254-339`, `codex/src/tab.tsx:491-497` | One phrase per action in every client |
| Sending, Queued, ✓, or Not sent | `codex/src/tab.tsx:530-538`, `codex/src/server.ts:87-94` | A queued message has not reached Codex yet |
| Per-hook "not heard" state | Group empty text, `codex/src/tab.tsx:616-620`, `:667` | Skipped hooks look like an empty inbox |
| "Your tasks" becomes "Tasks" | `codex/src/tab.tsx:667` | Same as the mod |
| Goal and step on line 2 | Not drawn; `goal` is already in the view (`codex/src/core.ts:461`) | Codex has no band |
| Key text removed from the footer; keys kept | Footer `codex/src/tab.tsx:818-826`; keydown handler `851-884` stays | Keys are an optional extra; the text is noise where they are unverified |
| Status words from 2.6; failing-poll state | `codex/src/tab.tsx:750-783` | Same as the mod |
| Each press declares its kind, as in the mod | `press()` in `codex/src/core.ts:243-349` | Same as the mod |

### Claude mode

All new, and not built now (decision 2): the Claude-mode server, its record tools for questions and tasks, the card, the full view, and the parts in section 7. The mod gains a guard against that server's tools in Code mode.

## 6. Decisions for you

**1. Address and Discuss on a finding.** This is decision 2 in [instructions.md](instructions.md), which asks whether Address and Discuss keep a finding open until Claude closes it. Its proposal 3 says yes, and its proposal 1 sends every finding that leaves to Closed with its outcome. Today both presses remove the finding (`actOnFinding`, `hooks/register.tsx:1104-1107`), so a discussion that ends in "later" loses it.

- (a) Keep today's behavior.
- (b) Address hands off: the finding folds, and unfolds by the re-entry rule in 2.3 if Claude's reply leaves it open. Discuss is a talk send: the finding stays open with `✓ Discuss`. Either way the finding leaves only when Claude closes it or you dismiss it. A finding that leaves goes to a `▸ Closed` fold at the bottom of the Findings tab, with its outcome, as items do.
- (c) Only Discuss keeps the finding.

Recommendation: (b). It matches proposals 1 and 3, and talking a finding through does not resolve it. It changes text Claude and the inbox model read, so it needs the sample runs AGENTS.md describes before it is kept.

Default taken while the owner was away: (b). Override it to change the tagged lines.

**2. When to build Claude mode.** Claude mode needs Claude to record its own questions and tasks. That is the second item source, while the choice of source is still open.

- (a) Build it now, with record tools that write the same ledger through the one seam.
- (b) Build it after the item-source decision and after live checks 1 and 2 below.

Recommendation: (b). The terminal, desktop and Codex changes need neither answer. Building the source for one client first would lock the source choice by default.

Default taken while the owner was away: (b). Override it to change the tagged lines. Nothing for Claude mode is built now. The seams in section 7 stay so it can be added.

**3. After a press, open the next row or not.**

- (a) No row opens on its own. One more click per item, and no misclicks onto the next item.
- (b) The next row opens. One click fewer per item; a slow second click after the 0.4 s guard can still land on the next item.

Recommendation: (a). A wrong answer sent as you costs more than a click.

Default taken while the owner was away: (a). Override it to change the tagged lines.

**4. Answer buttons in the band.** When Claude is idle and the top question has at most 3 options of at most 12 characters, the band could show them as buttons.

- (a) Yes. The most common act on desktop takes one click and no pane.
- (b) No. [Open inbox] opens the pane with that question open, next to its body and Explain.

Recommendation: (b) for now. An answer sends at once and has no Undo, and the band shows no body. Revisit after desktop use shows how often people open the pane only to answer.

Default taken while the owner was away: (b). Override it to change the tagged lines.

## 7. What the next step must provide

**View model.** One shape that the band, the pane, the Codex tab and the Claude-mode view all read.

- One function that builds the ordered Needs you list and its count, as 2.1 defines them. It replaces `needsYouCount` in `hooks/register.tsx` and the row grouping in `viewOf` in `codex/src/core.ts`.
- Each row's kind, handle (with the question number rule from 2.2), title, body, age, options with the recommended one, steps, and state: open, handed off, queued, settled or closed with an outcome.
- Each row's last action, with a pending, result or error state for Local presses and a delivery state for sends.
- The item status and the PR status from 2.6.
- A hand-off re-entry rule per item source: turns for the per-turn update, the next inbox tool call for Claude mode.

**Press contract.**

- Each press declares its kind: Talk, Hand-off, Local, Mark or View. The kind decides the feedback in 2.3. The kind replaced the `done` and `handsOff` pair.
- A Local press records its pending note at once, and then its result or error. `runPress()` records both.
- A send records its delivery state: queued, arrived, or failed with a reason. A failed or withdrawn send undoes its press.
- `LastAction` gains the result and delivery fields. It is saved state in two places, and both must convert old records:
  - the mod: `LastAction` in `types/index.d.ts`, converted in `upgradeState`;
  - the Codex plugin: its own `LastAction` in `codex/src/state.ts:15`, saved in one JSON file per session, converted in `upgraded()` (`codex/src/state.ts:117`).
  The five kinds replace `isHandoff` in both. Row drafts and notes live in UI state.
- The Codex state records when each hook event last ran for the thread, for the per-hook check in 3.4. Today nothing records that `Stop` ran. `upgraded()` fills the field for old state.
- Undo while a row is settled needs:
  - a reopen for items in `hooks/ledger.ts`;
  - a restore for a dismissed finding. Under decision 1 (a) the finding is deleted (`removeFinding`, `hooks/register.tsx:1057`; the Codex tab drops it without a trace, `codex/src/tab.tsx:125`), so it must be kept until its row leaves. Under (b) it is in Closed, and restore is a reopen;
  - an un-dismiss for a PR.
  A close already reported to Claude in carry text must be reported as reopened.
- Presses on sample entries change a copy, never saved state.
- HTML presses carry a server-checked target: the chat key and card sequence in Claude mode, the thread id in Codex.
- The 0.4 s press guard after a row opens.

**Item source seam.** Claude-recorded questions and tasks, when built, go in `hooks/tools.ts` beside `record_finding` and `close`, and write the same ledger through `hooks/ledger.ts`. The UI reads the same rows from either source.

**Claude-mode mechanism** (decision 2: design only, not built now). What 3.3 needs underneath.

- *Install route.* Two documented routes reach the chat side, and neither is checked live for this use. A server in `claude_desktop_config.json` reaches Chat; the support article says such servers "aren't available in Cowork or claude.ai". A `.mcpb` extension runs "on your computer in the Claude desktop app"; whether it reaches Cowork or Code-mode sessions is not sourced. Cowork loads a plugin's local MCP server when the session runs on the person's machine, so covering Cowork may need the plugin route instead.
- *Name.* The server is `inbox-chat`, so it never shadows the mod's `mcp__inbox__*` tools.
- *Keeping out of Code mode.* A `claude_desktop_config.json` server also reaches local Code-mode sessions. Without a guard, Claude there sees two sets of inbox tools, and the `inbox-chat` descriptions tell it to call show inbox after most replies.
  - If `tool.describe` fires for these MCP tools, the mod rewrites each `mcp__inbox-chat__*` description to say the tool does not apply in this session. The reference says `tool.describe` fires once per tool when its description is first sent to Claude, but not that it fires for MCP tools; that is a live check.
  - The mod also denies calls to `mcp__inbox-chat__*` through `tool.call`, which fires for MCP calls and which the guard passes untouched (`docs/reference/claude-code-mods.md:448`, `:852`). This is the backstop. If the descriptions cannot change, each reply that leaves something open costs one denied call.
  - When the mod is not running in a Code-mode session, for example after a hooks-worker crash, the server's tools work there. The plan assumes Code mode draws no MCP App views. Then items recorded there show only as tool text the person may never open, which makes a second inbox that is close to silent. So the server refuses record calls from a Code-mode session, if live check 6 finds a connect-time field that tells the clients apart. The refusal tells Claude to use the mod's tools. If Code mode does draw MCP Apps, the card shows those items instead.
- *Chat key.* Claude gives the server no conversation id. The server mints a chat key on the first inbox call in a chat and returns it. Every record, close and show call takes that key as a required argument. A call with no key mints a new one, and the card reads `New inbox for this chat`. A call with an unknown key fails with a message that tells Claude to call show inbox without a key. The key works whether one server process serves every chat or each chat gets its own, which is unknown.
- *Card freshness.* The server stamps each show call with a sequence number and its time. Each poll returns whether that card is still the newest. A card whose result is more than 10 s old when it mounts came from a stored chat, so it draws collapsed until that first poll. The 10 s is a starting value, not a measured one. The server rejects presses from a card that is not the newest. Mount order cannot decide this, because stored chats mount views lazily.
- *Queued presses under `updateModelContext`.* The newest card sends one payload holding every queued press on each new press, because each update replaces the last. The server also returns queued presses in every tool result, so Claude sees them on its next inbox call either way.

**Renderers.**

- The mod branches per draw on `e.surface`. `claude plugin test` can mount the desktop drawing.
- One HTML view module serves Codex and Claude mode, with a host adapter for three things: identity (thread id or chat key), the send route (`codex queue`, `ui/message` or `updateModelContext`), and the layout (tab, card or full view). The view declares `availableDisplayModes`.
- When the Claude-mode server is built (decision 2), `scripts/check.sh` covers its bundle.

**Text a model reads, to test before keeping.** Per AGENTS.md, each of these needs sample runs:

- the Claude-mode tool descriptions and the chat-key argument;
- any guidance that names `inbox-chat`;
- the rewritten `inbox-chat` descriptions in Code mode;
- the split Codex `inbox` tool and its text answer;
- the finding change in decision 1.

**Live checks this plan depends on.**

1. Code mode and MCP Apps; Cowork or Unified Claude and mod modules; and whether that client draws a mod's band or pane (section 4).
2. In Claude mode: `ui/message`, `updateModelContext` and fullscreen, and which methods the host declares in `ui/initialize`.
3. Which install route reaches Chat and Cowork, and whether `.mcpb` reaches Code mode.
4. On desktop:
   - whether `Input` draws and Enter sends;
   - whether toasts draw;
   - whether `Markdown` draws, which the review thread body uses;
   - whether a `Button` honors `dimColor`;
   - whether `/inbox` and `/inbox demo` work as typed commands.
5. In Codex:
   - a tab press end to end;
   - whether `codex queue` messages show above the composer and can be edited;
   - whether `UserPromptSubmit` carries the queued id or `clientUserMessageId`;
   - whether Codex hides an app-only tool from the model;
   - whether the Inbox tab stays open across threads.
6. In Code mode: whether `tool.describe` fires for `claude_desktop_config.json` MCP tools, and what each client sends when it connects to an MCP server.
