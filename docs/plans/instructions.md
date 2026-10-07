# Inbox instructions: review and plan

Goal: each instruction the mod gives has one role, each rule is written in one
place, and findings reach the Findings tab at the right time and leave it with
a record.

## What each instruction is for

Claude reads nine kinds of text from the mod. The inbox model, the Sonnet call
that updates the inbox after each reply, reads two.

| Text | Read by | When | Role now |
| --- | --- | --- | --- |
| `GUIDANCE`, the "# Inbox" system prompt section | Claude | Every turn | When to record a finding; the inbox line is the truth; when to close |
| `record_finding` description and fields | Claude | Every turn | When to record a finding (again); the bar; the fields |
| `close` description and fields | Claude | Every turn | When to close (again); answer or reason |
| Inbox line (`inboxText`, `closedText`) | Claude | Beside a prompt, when the inbox changed | Open items and findings with ids; what closed since |
| Answer line (`answerNote`) | Claude | Beside a prompt that answers numbered items | Which items the numbers mean |
| Start-of-context block (`carryText`) | Claude | At session start and after compaction | Goal, done, now, open items, findings, recently closed |
| Previous-session text (`carryText`) | Claude | First prompt after "Continue from it" | Where the last session stood |
| Claim check (`claimMessage`) | Claude | Turn end, when a reply claims a check passes that failed or is stale | Run the check or say it is untested |
| Button messages | Claude, as your message | When you press | One action on one item, finding or PR row |
| `SYSTEM` | Inbox model | After each reply | Card, new items, closing items and findings |
| `catchUpPrompt` | A fork of the conversation | After a failed update, or a mid-conversation load | Same as `SYSTEM`, over the whole conversation |

## Problems, most serious first

1. **A finding leaves without a record.** Every way out deletes it: Claude's
   `close`, the inbox model's `CLOSED` line, and your Address it, Discuss,
   Type a reply and Dismiss. Items move to Closed with their outcome. Findings
   do not. So:
   - You cannot see that a finding closed, or who closed it. A finding can
     disappear from the tab with nothing to show how.
   - Claude cannot tell a dismissed finding from one never recorded. The
     duplicate check compares only open findings, so a dismissed finding can
     come back.
   - Address it and Discuss remove the finding when you press. If the work
     stops partway, the finding is gone.
2. **Two closers with different rules.** Claude closes a finding "when it is
   done or no longer applies". The inbox model closes one when the reply
   shows it "was fixed, or that the person dealt with or set aside". The inbox
   model sees only the title, and Claude's reply often mentions the finding it
   just recorded. A mention can read as "dealt with", which closes a finding
   nobody acted on.
3. **The mention rule conflicts.** The tool says "You do not need to mention
   the finding in your reply." The guidance says "you may still mention the
   finding briefly." Neither covers the two in-task triggers. A part that could
   not be tested, or a workaround, belongs in the reply too. A finding does not
   replace reporting it.
4. **Rules are written twice.** When to record is in the guidance and in the
   tool, nearly word for word. When to close is in the guidance and in the
   `close` tool, nearly word for word. The copies already differ: the bar
   ("what a careful senior engineer would flag") is only in the tool.
5. **One concept has four names.** A closed item is "Closed" in the pane and
   the `close` tool, "Recently decided" in the start-of-context block,
   "Settled since you last read the inbox" in the inbox line, and `decided` in
   the inbox model's input. "Items" sometimes includes findings: "Only the
   items listed here are open" sits above both lists.
6. **Continuing from a previous session loses its findings.** "Continue from
   it" tells Claude the previous session's open findings, without ids, as
   "Findings you recorded". They never appear in this session's tab, and
   Claude cannot close them.
7. **"Anything already discussed" excludes too much.** Something you and
   Claude discussed and put off is what the tab should keep.
8. **The roadmap would replace Findings.** ROADMAP.md plans "Claude's calls
   replace Findings": the tab becomes a list of calls Claude made, shown as
   "question → choice, not alternative". That is a different purpose from the
   one agreed for Findings. Settle it before rewriting the instructions.
9. **Nothing measures misses.** The timing rule, "when you notice it", is
   right. But a finding Claude never records leaves no trace.

## Proposed changes

**One role per instruction.**

- Guidance: what the inbox holds, that the latest inbox line is the truth,
  who closes what, and when to record a finding. No call details.
- Tool descriptions: what a call needs, read at the moment of calling.
  `record_finding` holds the bar and the fields. `close` holds answer versus
  reason. Neither repeats the guidance.
- Inbox line and start-of-context block: state only. The block says the latest
  inbox line replaces it.
- Inbox model: the card and items. It stops closing findings.

**Findings.**

1. Every way a finding leaves goes to Closed with its outcome: dismissed,
   fixed, or no longer applies. The inbox line tells Claude, as it does for
   items, so a dismissed finding is not recorded again.
2. Claude closes findings, and you close them from the tab. The inbox model
   does not.
3. Address it and Discuss keep the finding open, marked as sent, until Claude
   closes it.
4. A finding about the current work, such as an untested part or a
   workaround, is also stated in the reply. A finding outside the task needs no
   mention.
5. "Anything already discussed" becomes "anything the user already decided".
6. "Continue from it" moves the previous session's open findings into this
   session's tab, with new ids.
7. Optional: at turn end, a reply that says it left something untested or
   unfixed, with no finding recorded that turn, is sent back once, as the claim
   check does for checks. It catches misses, at the cost of some false alarms.

**One name per concept.** "Closed" everywhere Claude reads it. "Items" means
questions and tasks, and "findings" is always named on its own.

## Decisions

1. Roadmap: drop "Claude's calls replace Findings", or keep it?
2. Address it and Discuss: keep the finding open until Claude closes it, or
   remove it on press as now?
3. Inbox model: stop it closing findings, or keep it as a backup closer?
4. Turn-end check for unrecorded findings: build it, or leave it out?
