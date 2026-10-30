# Prompt audit: remaining gaps

Part of [the prompt audit](../prompt-audit.md).

Status: building. The text marks each item fixed or open.

## Remaining gaps

A second review read every raw model answer from the A/B runs, the parser, and the paths no A/B covers. A skeptic checked each finding against the code. These survived.

### The parser does the wrong thing

These are code fixes. None changes what a model reads. Items 1, 3, 4 and 6 are fixed, and so is item 2 for HELP commands. A `|` inside an ask still shifts its fields, because the parser also accepts options written with `|` between them. Item 5 is decided: a Run step on a task keeps handing the task to the agent. A command the reply says only the person can run now gets the HELP kind `terminal`, which draws a copy button. Sonnet, 8 runs per case, before → after: a production command needing the person's credentials 0 → 8 copy buttons, a check on the person's phone 0 → 7, a script the agent could run stays Run 5 → 8, a deploy the agent runs after approval stays Run 5 → 8. The Codex model, 5 runs each: 0 → 5, 0 → 5, 5 → 5, 5 → 5.

1. **A self-corrected answer is applied twice.** The inbox model sometimes writes an answer, then "Wait: corrected answer", then a second answer. It did this in 7 runs, all on Sonnet. Both drafts are applied, so DONE lines double and a NEW line the model struck still becomes an item. Fix: keep only the lines from the last `GOAL:` line on.
2. **A `|` inside a value shifts the fields.** A HELP command such as `npm test | tee out.log` runs as `npm test`. An ask with a `|` loses its tail into the options. Fix: split HELP and NEW from both ends, and keep the middle whole.
3. **Different questions merge as one.** `restates` drops words under 3 characters, so "Approve PR #41 merge?" and "Approve PR #42 merge?" count as the same question, and the second is dropped. Every non-Latin ask matches every other. Fix: keep numbers and tokens with digits, and never match an empty word set.
4. **A bare word passes as a path.** An open step needs its path to appear in the reply, but the check is a substring test. "migrations" became an Open button in 2 of 8 runs. Fix: require a path shape, or a file the agent edited.
5. **A command only the person can run gets a "Claude runs it" button.** Only a fixed word list, such as login and sudo, marks a command as the person's. Fix: a run step on a task, which is an action only the person can take, becomes a copy button.
6. **`UPDATE` and `CLOSED` on one question lose it.** This happened once in 128 runs. Fix: an `UPDATE` wins, since it says the question still waits.

### Items leave or linger at the wrong time

7. **A question re-asked after 12 prompts disappears at that moment.** A restatement merges into the old item and keeps its old turn, so it expires in the same update. Fix: a restatement refreshes the item's turn.
8. **Findings past 30 are deleted silently.** Nothing records them, and `record` still answers "Recorded". Fix: move them to Closed as "list full", and say so in the result.
9. **A typed reply that is itself a question closes the question.** The inbox model is then told never to add it again. This happened in this session: a question was closed with a follow-up question as its answer. It needs a fixture before a fix.
10. **The Herdr sidebar shows a stale NOW** for the whole next turn after the last question is answered.

### Model-read text

11. **Codex writes `FIXED` for a finding the person set aside,** in 3 of 5 runs, with "Dismissed" as the outcome. Fix: lead the `FIXED` rule with "only when the work was done", or have the code drop a `FIXED` line whose outcome says dismissed or declined. Either needs a Codex A/B.
12. **`CATCH_UP` still says to "close" findings.** Only `FIXED` closes them now, so a catch-up after a failed update can leave fixed findings open.
13. **A long reply loses its end.** The reply is clipped to its first 12000 characters, and the questions usually come last. Activity keeps its first lines, not its latest. Fix: keep the head and the tail. This is code.

### Codex

14. **A failed Codex update loses that reply for good.** It has no retry and no catch-up, so the reply's questions never show.
15. **The Codex agent can call `inbox_press`,** which acts as the person. Nothing refuses a model call. No failure has been seen.

### Safety

16. **PR buttons paste GitHub review comments into the agent's prompt as the person's own words.** They go in unfenced and unclipped, so an instruction inside a comment reads as the person's. Fix: fence each comment as quoted text, and clip it.

### Measurement

17. **No permanent test suite.** Today's harness lives in `.scratch`. A repo-safe suite would hold synthetic cases only, assert on the ledger after the update, and run on both models. With it, every prompt edit and model change would be measured the same way. The model alias `sonnet` changes under the mod with no check.
18. **Never run against a model:** the catch-up prompts, the `inbox:` texts the agent reads, the Skip rule with the pane open, and the Codex agent itself.

### Opportunity

19. **Show why an option is recommended.** The reason is in the reply but never reaches the row. This changes the saved state, and it carries the same risk of invented reasons, so it needs a strict A/B.
