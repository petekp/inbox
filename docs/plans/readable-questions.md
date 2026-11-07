# Readable questions

Status: building. Change 2's record fields, storage and notes on what is missing are built, and so is change 3. The context line's drawing waits on Pete's pick of placement.

A question in the inbox should be answerable from its row alone. Three changes make the inbox hold the agent to that. Pete chose this shape on 2026-11-07 over refusing a bare record: the inbox records what the agent gives, draws it, and nags for what is missing. It refuses only a close whose answer is a question.

## Why not refuse a bare record

- A refused record can drop the question from the inbox. The per-reply update skips NEW lines of a kind the agent recorded that turn (`applyUpdate` in `hooks/ledger-update.ts`), so a second, refused question is lost. Wrongly empty is worse than none (principle 9).
- A body check on every record breaks Compare. Its re-record carries only the ask, the options and the page path (`compareRequest` in `hooks/press-messages.ts`).
- The per-call nag, such as "It has no why: record it again with why", is not the written rule that failed. Nothing has measured it yet.

## Change 1: a question back keeps the question open

A question back is an answer that ends with a question mark and starts with a question word or names no option. "Why not Redis?" is one. "Redis?" picks Redis.

- `isQuestionBack` in `hooks/ask-match.ts` is the one rule.
- The `close` tool refuses a question back: "Not closed: the user asked a question back, so it stays open. Answer them in your reply, and close it when they decide."
- A CLOSED line whose outcome is a question back is skipped in `applyUpdate`, for every question, whoever recorded it.
- A typed reply that is a question back goes to the agent as "About this question you asked me: …", with the ask and options quoted, instead of `Re "ask": …`. The agent then reads it as a question, not an answer, in every host. A Codex question linked to an open dialog still sends its typed reply in the dialog's form (`question-back-stays-open` in Differences on purpose).

Shipped in PR 1.

## Change 2: the body

`record` gains, for a question, `context` (why it came up, at most 20 words) and `option_notes` (one per option, in option order, what picking it does, at most 12 words each). `rec` and `why` stay as they are.

- Stored as `Item.context` (new) and `Item.optionDescriptions`, which exists and today comes only from dismissed Claude Code and omp dialogs. A record of an open question stores both too, so a re-record with a body enriches the item. In `hooks/dialogs.ts`, a dialog's descriptions fill in under a record's notes, so the record's win.
- Nag through `missingText`: no context gives "It has no context: record it again with why it came up"; an option without a note gives "… a note on each option, what picking it does".
- Drawing: option notes already draw on the selected row in all four looks. The context draws on the selected row too, after "Holds up" and "Why", whole. Collapsed rows do not change. Mock two or three placements for Pete before building the drawing. Feature id `asks-context-line`, full on every client.

## Change 3: an approval with nothing to look at

An approval-shaped question (the ask starts with approve, OK to, go ahead, ship or sign off, or the options are yes and no) with no link or file in `steps` gets a nag: "The user can't approve what they can't see: when there is something to look at, record it again with a screenshot, page or file in steps." No list of visual nouns, which misfires on "page-size PR" and this repo's "look" and "page". No refusal, because a link check cannot prove the link shows the design.

## Evidence and its limits

- Remind-me presses: 38 over 977 questions before the coordinator's change, 51 over 892 after. Rate ratio 1.47, 95% interval 0.97 to 2.24, so it includes no change. The count includes Explain presses on tasks and findings. The cause is unproven.
- "Closed at least 8 times in pdk-ios" comes from transcript reads in the assessment and was not re-counted.
- Re-measure a week after shipping, counting question presses only.

## Checks

- `hooks/tools.ts` is at its size cap. Changes 2 and 3 split it: the schemas into a module of their own, and the question checks into another.
- The guidance text cannot grow: the close tool's description is 4,081 of 4,096 characters. Only schema field descriptions and tool answers change.
- Each tool-answer change gets an agent eval case and a run of `./scripts/eval.sh --suite agent`, as AGENTS.md asks. PR 1 adds `question-back-stays-open` to `evals/agent-cases/close.json`.
