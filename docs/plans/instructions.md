# Inbox instructions: review and plan

Status: building. The decisions below are not settled.

Goal: each instruction the mod gives has one role, each rule is written in one
place, and findings reach the Finds tab at the right time and leave it with
a record.

## What each instruction is for

Claude reads seven kinds of text from the mod. The inbox model, the Sonnet call
that updates the inbox after each reply, reads two.

| Text | Read by | When | Role |
| --- | --- | --- | --- |
| `guidanceText`, the "# Inbox" system prompt section | Claude | Every turn | What the inbox shows; when to record a question, a task or a finding; the latest inbox line is the current state; when to close |
| `record` description and fields | Claude | Every turn | What each kind of item is; what happens to a finding; the bar; the fields |
| `close` description and fields | Claude | Every turn | Where the id comes from; answer or reason |
| Inbox line (`inboxText`, `closedText`) | Claude | Beside a prompt, when the inbox changed | Open items and findings with ids; what closed since, with when to ask again |
| Answer line (`answerNote`) | Claude | Beside a prompt that answers numbered items | Which items the numbers mean |
| Start-of-context block (`carryText`) | Claude | At session start and after compaction | Goal, done, now, open items, findings, recently closed; a later inbox line replaces it |
| Button messages | Claude, as your message | When you press | One action on one item, finding or PR row |
| `systemText` | Inbox model | After each reply | New items, closing items and findings |
| `catchUpPrompt` | A fork of the conversation | After a failed update, or a mid-conversation load | Same as `systemText`, over the whole conversation |

## Done

- Each rule is written once. `guidanceText` holds when to record and when to
  close. The tool descriptions hold only what a call needs.
- The mention rule: a workaround or a part Claude cannot check from where it
  is goes in the reply as well as in a finding. Other findings are mentioned
  only when they bear on what the user asked.
- The recording bar: Claude checks a finding once before recording it. A
  problem in its own change, a check it could run, progress, and anything only
  the user can do or decide are not findings. Claude fixes, runs, says or asks
  them instead, so a blocker reaches Asks as a question or task.
- The bar excludes "anything the user already decided", not "anything already
  discussed".
- Claude reads "Closed" everywhere: the inbox line and the start-of-context
  block. The inbox line says that anything it does not list is closed.
- An expired question is told to Claude as "expired before the user answered.
  Ask it again if it still matters", not as settled. The inbox model no longer
  sees expired items among the settled ones, so a question asked again shows
  again.
- A dismissed question carries "Ask it again only if the user brings it up" on
  its own line.
- `record` answers without an id, since replies repeated one to the user.
  The next inbox line lists every open id for `close`. It answers "Already
  open" for an ask an open item restates, and refuses one the person already answered or dismissed.
- Claude asks in its reply and records the same ask in that turn, as a
  question with options and a recommendation, or as a task with steps. It
  does not record rhetorical questions, offers to continue, FYIs or
  invitations to look at finished work. The tool stays loaded up front after
  `/resume`, and its description carries these rules for Codex, which skips
  the guidance on resume.
- Nothing is sent back to Claude at the end of a turn. The inbox model keeps
  adding the asks Claude did not record. An item Claude
  recorded is in `<open>`, so the model does not add the reply's same ask
  again. `evals/cases.json` has cases for it.
- Every way a finding leaves goes to Closed with its outcome. The code
  refuses a finding that restates one the person dismissed, and `record` answers
  why. A finding that expired or that Claude closed as fixed can be recorded
  again. The ledger keeps the newest 12 closed findings, so a dismissal older
  than that is forgotten.
- A question or task replaces a finding only when it asks about it: its label
  is the finding's id, its ask restates the finding's title or detail or both name the same pull
  request number. When the inbox model's `ASKED` line claims the link, an ask
  that shares two key words with the finding's title also passes. The inbox model's `ASKED` line for any
  other item is ignored and the finding stays open. The finding closes as
  "asked as iN" and keeps `askedAs`, the item's id.
- The finding reopens, without `askedAs`, when that item closes with the work
  undone: the person dismissed it, it expired, it no longer applies, or the
  person put it off ("not now", "not yet", "later"). An answer that decides it,
  or Done, leaves the finding closed. Fix on a finding that still has an open
  item with its `askedAs` closes that item.
- Fix, File issue, Discuss and Reply keep the finding open until Claude
  closes it. Dismiss closes it.
- The inbox model closes a finding only with a `FIXED` line, when the
  conversation shows a change fixed it. A `CLOSED` line no longer closes one.
  The measurements are in `docs/plans/prompt-audit.md`.

## Still open

1. **The roadmap would replace Finds.** ROADMAP.md plans "Claude's calls
   replace Finds": the tab becomes a list of calls Claude made, shown as
   "question → choice, not alternative". That is a different purpose from the
   one agreed for Finds.
2. **Nothing measures misses.** A finding Claude never records leaves no
   trace.

The inbox model's input still calls closed items `<decided>`, "items the
person already settled". Renamed to `<closed>`, "items closed recently", the
model re-added a dismissed question in 4 of 5 runs.

## Decisions

1. Roadmap: drop "Claude's calls replace Finds", or keep it?
