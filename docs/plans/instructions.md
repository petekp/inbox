# Inbox instructions: review and plan

Goal: each instruction the mod gives has one role, each rule is written in one
place, and findings reach the Findings tab at the right time and leave it with
a record.

## What each instruction is for

Claude reads nine kinds of text from the mod. The inbox model, the Sonnet call
that updates the inbox after each reply, reads two.

| Text | Read by | When | Role |
| --- | --- | --- | --- |
| `GUIDANCE`, the "# Inbox" system prompt section | Claude | Every turn | What the inbox shows; when to record a finding; the latest inbox line is the current state; when to close |
| `record_finding` description and fields | Claude | Every turn | What happens to a finding; the bar; the fields |
| `close` description and fields | Claude | Every turn | Where the id comes from; answer or reason |
| Inbox line (`inboxText`, `closedText`) | Claude | Beside a prompt, when the inbox changed | Open items and findings with ids; what closed since, with when to ask again |
| Answer line (`answerNote`) | Claude | Beside a prompt that answers numbered items | Which items the numbers mean |
| Start-of-context block (`carryText`) | Claude | At session start and after compaction | Goal, done, now, open items, findings, recently closed; a later inbox line replaces it |
| Previous-session text (`carryText`) | Claude | First prompt after "Continue from it" | Where the last session stood, its findings marked as that session's |
| Claim check (`claimMessage`) | Claude | Turn end, when a reply claims a check passes that failed or is stale | Run the check or say it is untested |
| Button messages | Claude, as your message | When you press | One action on one item, finding or PR row |
| `systemText` | Inbox model | After each reply | Card, new items, closing items and findings |
| `catchUpPrompt` | A fork of the conversation | After a failed update, or a mid-conversation load | Same as `systemText`, over the whole conversation |

## Done

- Each rule is written once. `GUIDANCE` holds when to record and when to
  close. The tool descriptions hold only what a call needs.
- The mention rule: a workaround or an untested part goes in the reply as well
  as in a finding. Other findings are mentioned only when they bear on what
  the user asked.
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
- The previous session's findings are labeled "Findings that session
  recorded", so Claude does not take them for its own.
- `record_finding` answers with the new finding's id, so Claude can close it
  in the same turn.

## Still open

1. **A finding leaves without a record.** Every way out deletes it: Claude's
   `close`, the inbox model's `CLOSED` line, and your Address it, Discuss,
   Type a reply and Dismiss. Items move to Closed with their outcome. Findings
   do not. You cannot see who closed a finding. Claude cannot tell a dismissed
   finding from one never recorded, so a dismissed finding can come back. And
   Address it and Discuss remove the finding when you press, so it is gone if
   the work stops partway.
2. **The inbox model closes findings nobody acted on.** Its rule closes a
   finding the person "dealt with or set aside". Measured with Sonnet: when
   the person wrote "don't worry about the README thing for now", it closed
   that finding in 3 of 3 runs. Rewording the rule kept the finding open, but
   also made the model re-add questions the person had dismissed: 5 of 23 runs
   across three rewordings, against 0 of 21 with the current text. So the fix
   is decision 3, not another rewording.
3. **Continuing from a previous session leaves its findings behind.** Claude
   sees them, without ids. They never reach this session's tab, and Claude
   cannot close them.
4. **The roadmap would replace Findings.** ROADMAP.md plans "Claude's calls
   replace Findings": the tab becomes a list of calls Claude made, shown as
   "question → choice, not alternative". That is a different purpose from the
   one agreed for Findings.
5. **Nothing measures misses.** A finding Claude never records leaves no
   trace.

The inbox model's input still calls closed items `<decided>`, "items the
person already settled". Renamed to `<closed>`, "items closed recently", the
model re-added a dismissed question in 4 of 5 runs.

## Proposed changes

1. Every way a finding leaves goes to Closed with its outcome: dismissed,
   fixed, or no longer applies. The inbox line tells Claude, as it does for
   items, so a dismissed finding is not recorded again.
2. Claude closes findings, and you close them from the tab. The inbox model
   does not.
3. Address it and Discuss keep the finding open, marked as sent, until Claude
   closes it.
4. "Continue from it" moves the previous session's open findings into this
   session's tab, with new ids.
5. Optional: at turn end, a reply that says it left something untested or
   unfixed, with no finding recorded that turn, is sent back once, as the claim
   check does for checks. It catches misses, at the cost of some false alarms.

## Decisions

1. Roadmap: drop "Claude's calls replace Findings", or keep it?
2. Address it and Discuss: keep the finding open until Claude closes it, or
   remove it on press as now?
3. Inbox model: stop it closing findings, or keep it as a backup closer?
4. Turn-end check for unrecorded findings: build it, or leave it out?
