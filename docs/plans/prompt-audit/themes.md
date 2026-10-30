# Prompt audit: themes

Part of [the prompt audit](../prompt-audit.md).

Status: building. The index says which themes are built, measured or proposed.

## Themes, most valuable first

### 1. The agent does not know its reply makes the items

- **Where:** `guidanceText` in `hooks/model-text.ts`. Five of the six reviewers found this one independently.
- **What is wrong:** the inbox model builds every question, its options, its recommendation and its one-press steps from the agent's reply. It may copy a recommendation only when the reply states one, and a command only when the reply contains it. The guidance never tells the agent any of this. A reply that asks "How should I handle X?" gives the inbox model little to work with, and the row ends with no recommendation and no step.
- **Proposed wording,** one paragraph after the first:

  > A question you put to the user in a reply becomes an item in their inbox, answered with one press. Name each choice. If you recommend one, say so in a clause ("I'd go with B: it keeps the old API"). Put any command they must run, or text to paste, in its own code block.

- **Left out on purpose:** "ask only when you cannot continue". It would change how often the agent asks, which is a separate experiment.
- **A/B:** one fixture exchange with a real fork between two fixes and a step only the user can run, about 10 runs per version through both models. Count:
  - the share of questions with a recommendation;
  - the share of tasks with a run or copy step;
  - items per reply.

  The guard checks are a reply that asks nothing, and the dismissed-question fixture from `docs/plans/instructions.md`.

### 2. An open item cannot change

- **Where:**
  - `applyUpdate` in `hooks/ledger.ts` and `ledgerBlocks` in `hooks/model-text.ts`;
  - the sentence in `systemText` that begins "When the reply restates, rewords or narrows an item";
  - `messages.explain` in `hooks/presses.ts`.
- **What is wrong:**
  - When a NEW line matches an open item, only its steps are merged. Its new ask, options and recommendation are dropped.
  - The inbox model sees each open item as id, kind, label and ask. It never sees the options or recommendation, so it cannot tell a reworded question from a changed one.
  - The Explain press asks why the question came up and what each choice means, but not which choice the agent would pick. So the reply most likely to carry a recommendation often carries none. When it does carry one, the merge in the first bullet drops it.
  - For a task, Explain asks about choices a task does not have.
- **The other direction:** an open item is matched only when its wording overlaps closely. A narrowed question in new words, such as "Staging only for now?" after "Deploy to staging or production?", is added as a second item instead, and the first stays open.
- **Proposed change:** this is a capability change, so it needs Pete's decision.
  - Add an output line `UPDATE: <id> | <options> | <rec>` for an open item whose choices or recommendation changed.
  - Show each open item's options and recommendation in `<open>`.
  - Have Explain ask "and which you would pick" for a question, and "what I need to do" for a task.
- **Risk:** the line about restated items is the one that keeps the model from adding a question twice. An earlier A/B kept restated items out of NEW in 10 of 10 runs, so that guard must stay at 10 of 10.

### 3. Dismissed findings vanish

- **Where:** `addFinding` in `hooks/ledger.ts`, `closedText` and `promptNotes` in `hooks/model-text.ts`, and `recordFinding` in `hooks/tools.ts`.
- **What is wrong:**
  - Closed findings are saved, but no text tells either model about them. When the person dismisses a finding, the agent sees it gone from the inbox line with no reason given.
  - `addFinding` checks a new finding only against open findings, and only by exact title. A reworded finding the person dismissed is recorded again, and `recordFinding` answers "Recorded as fN".
- **Proposed change:** this is Proposed change 1 in `docs/plans/instructions.md`, built through to the text the models read.
  - `closedText` lists closed findings the way it lists items: "dismissed by the user. Record it again only if the user brings it up."
  - `addFinding` also refuses a recent dismissed finding with the same meaning, matching the way items are matched.
  - `recordFinding` then says why it did not record.
- **A/B:** dismiss a finding, then give the agent a turn where the same issue shows up again. Count how often it is recorded again.

### 4. A closing line can invent a decision

- **Done.** `CLOSED` now asks for one of three forms. The person's answer when they gave one. Otherwise "done: <what the agent did>", or "no longer applies: <why>".
- **What was wrong:** `CLOSED` asked for "what was decided" in every case. When the agent picked an option on its own, the outcome read as the person's choice, and that reached the agent as the person's answer.
- **Why the wording names the case:** the first version only said "Never write a choice the person did not make". Sonnet still wrote the agent's pick as the outcome in 8 of 8 runs. The kept version says that an option the agent picked, or one the work made moot, is not the person's answer.
- The pane draws an outcome that starts "no longer applies" as lapsed.

### 5. Who closes a finding

- **What is wrong:** three texts state the rule, each with a different test:
  - the guidance tells the agent to close a finding that is "done or no longer applies";
  - `systemText` lets the inbox model close one the person "dealt with or set aside";
  - `CATCH_UP` closes one that is "no longer relevant".
- **This is already measured.** In `docs/plans/instructions.md`, the inbox model's rule closed a finding the person had only put off, in 3 of 3 runs, and rewording it caused regressions.
- **Proposed change:** none in wording. This adds evidence for the open Decision 3 in that plan: have the code ignore `CLOSED` lines for findings, then drop the finding half of the rule.

### 6. Ids go missing where the agent must close

- **Where:** `messages` in `hooks/presses.ts`, and `recordClose` in `hooks/tools.ts`.
- **What is wrong:**
  - Address, Discuss, a typed reply to a finding and Run leave the row open until the agent closes it. Their messages name the row by its title only.
  - The inbox line with the ids is repeated only when the inbox changed, and after one of these presses it usually has not.
  - When `close` gets an unknown id, it answers that the open ones are "listed beside the user's latest message", which is often false. That id may also have been closed already by a press.
- **How much this matters:** three skeptics refuted the press-message half. Each message quotes the row's title or ask exactly as the inbox line lists it, so the agent can match it to an id while that line is still in context. The real risk is after a compaction or in a long session.
- **Proposed change:**
  - When `close` fails, its answer lists what is open now and says when the id is already closed. This is a code change to a tool result, so a small A/B covers it.
  - Add the row's id to the note sent beside the press, not to the message itself. The message reads as the person's own words.

### 7. A finding asked as a question shows twice

- **Decided:** one thing shows in one list. When an item asks the person about a finding, the item takes its place, and the finding closes as "asked as iN".
- **Why the item wins:** an item has options and one-press steps, and it is what waits on the person now. A finding is for review later.
- **What was wrong:** the `NEW` rule let the inbox model add an item about a finding, but nothing closed the finding. A saved ledger shows the case: a finding to move a folder, and a task to say when the folder is free to move.
- **What changed:**
  - `systemText` has an `ASKED: <finding> | <item>` line, for "new N" or an open item's id.
  - The code also closes an open finding when a new item rewords its title.
  - `record` does not add a finding that rewords an open item. It answers with that item's id.

### 8. Codex reads the inbox in two shapes

- **Where:** `inboxToolText` in `codex/src/texts.ts`.
- **What is wrong:** the Codex `inbox` tool builds its own list with different group names. It also prints the pane's row handle, which means nothing to a model. The `inbox:` text and the tool can therefore drift apart.
- **Proposed change:** build the tool's text from `inboxText`. This is a code change, plus an A/B on Codex.
