# Audit of the texts the models read

Status: building. Theme 2's `UPDATE` line, a stricter recommendation rule, the new Explain wording and theme 5's `FIXED` line are built and measured. Theme 1 was measured and not kept. The other themes are proposed.

## Verdict

The texts are careful about the rules they state: when to record a finding, when to close, and not answering for the user. The biggest gaps are in what they leave out.

1. The main agent is never told that the questions in its reply become inbox items. So it does not write them in a form the inbox model can turn into good items. An A/B run did not show the guidance paragraph improving items, so it was not kept. See Results.
2. Nothing can change an open item. When the agent sharpens a question or states a recommendation later, the row keeps its first ask, options and recommendation.
3. A finding the user dismissed disappears without a trace. Neither model hears it was dismissed, so the agent can record it again.

Fixing these three would do the most for Pete's goals: predictive items, each thing in one place, and every item current.

## How this was checked

Six reviewers each read every model-read text with one question:

- **Anticipation:** are items predictive and actionable?
- **Placement:** does each thing go to one place, without duplicates?
- **Lifecycle:** do items stay current?
- **Consistency:** do the texts and the two hosts agree?
- **Agent leverage:** do the texts teach the agent to use the inbox fully?
- **Prompt craft:** does each text suit the model that reads it?

A skeptic checked each of their 41 findings against the code, and against the measured results in `docs/plans/instructions.md`. 21 survived, and they group into the eight themes below. Where a theme also had a refuted finding, the theme says what that skeptic found. None has been A/B tested yet.

The real saved ledgers give a baseline, 23 sessions on the Claude side:

| Measure | Count |
| --- | --- |
| Questions with options | 21 of 21 |
| Questions with a recommended option | 7 of 21 |
| Tasks with a one-press step | 2 of 4 |
| Closed items marked answered, by a press or by the agent's `close` | 60 of 85 |
| Closed items closed by the inbox model | 5 of 85 |

The saved records do not say whether an answer came from a press or from the agent, so this baseline cannot show how often options are pressed. The A/B runs below measure the items directly instead.

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

## Pete's goals and what reaches them

| Goal | Themes | What wording cannot reach |
| --- | --- | --- |
| Predictive, anticipatory actions | 1, 2 | |
| Each thing in the right place, once | 3, 7, 8 | |
| Every item current | 2, 4, 5, 6 | |
| The right things at the right time | None | Items expire by turn count, not time. Nothing tells the agent what changed while the person was away. These need new behavior, not new wording. |
| Agents use the inbox to steer the project | 1 | The agent cannot add a question, a task or a card line directly, only through its reply. A tool for that is a design question for Pete. |

## What was read

| Text | Where | Reader | Result |
| --- | --- | --- | --- |
| The guidance | `hooks/model-text.ts:guidanceText` | Claude, Codex | Themes 1, 6, 7 |
| `record` and `close`, their fields and results | `hooks/tools.ts` | Claude, Codex | Themes 3, 6 |
| The inbox model's instructions and input | `hooks/model-text.ts:systemText`, `hooks/model-text.ts:buildPrompt` | Inbox model | Themes 2, 4, 5, 7 |
| The catch-up prompts | `hooks/model-text.ts:catchUpPrompt`, `hooks/model-text.ts:transcriptCatchUpPrompt` | Inbox model or a fork | Theme 5 |
| `inbox:` texts beside a prompt | `hooks/model-text.ts:inboxText`, `hooks/model-text.ts:closedText`, `hooks/model-text.ts:answerNote` | Claude, Codex | Themes 3, 6 |
| The start and compaction block | `hooks/model-text.ts:carryText` | Claude, Codex | No issue |
| Activity and screen lines | `toolActivity`, `dialogActivity` and `screenText` in `hooks/model-text.ts` | Inbox model | No issue |
| Row press messages | `hooks/presses.ts:messages` | Claude, Codex | Themes 2, 6 |
| PR press messages | `hooks/prs.ts:prompts` | Claude | Read, no issue found |
| Codex tool texts | `codex/src/texts.ts` | Codex | Theme 8 |
| Codex hook context | `codex/src/hook.ts` | Codex | No issue. It passes the shared texts through. |

## Checked and not a problem

The skeptics refuted 20 findings, for these reasons:

- **Already handled.** After a compaction, `carryText` keeps the ids and the recently closed items. The no-recommendation case is the agent's to fix, not the inbox model's to guess.
- **Re-proposed a measured change.** Three proposed rewording the finding-closing rule, which `docs/plans/instructions.md` measured and rejected.
- **Unproven.** A missing example of the line format, the catch-up prompt's order, and the card's list rules. No failure was shown for any of them.

## Results

Each run used synthetic fixture exchanges, except one real reply that drew the f181 finding. The inbox model ran 8 times per case on Sonnet and 5 times on the Codex model. "Before" is the committed prompt. "After" adds the `UPDATE` line, shows each open item's options and recommendation in `<open>`, and adds one sentence to the `rec` rule: "A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer."

| Case | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| An Explain reply's pick reaches the row | 0 of 8 | 8 of 8 | 0 of 5 | 5 of 5 |
| A narrowed question shows its new options and pick | 6 of 8 | 7 of 8 | not run | not run |
| A reworded question stays unchanged | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| Unrelated progress changes no open question | 8 of 8 | 8 of 8 | not run | not run |
| A dismissed question asked again stays closed | 5 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A stated recommendation is kept | 8 of 8 | 8 of 8 | not run | not run |
| A reason is not taken as a recommendation | 0 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| The real reply behind f181 gets no invented recommendation | 0 of 8 | 7 of 8 | 5 of 5 | 5 of 5 |

The `UPDATE` line without the stricter sentence fixed the Explain case too, but still invented a recommendation in 5 of 8 runs on the reason-only case.

Theme 5 was measured the same way, with its own fixtures. Rewording the finding half of `CLOSED` was not enough on Sonnet. The version kept gives findings their own `FIXED` line, and the code ignores a `CLOSED` line for a finding.

| Case | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| A finding the person put off stays open | 0 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A finding the person set aside stays open | 0 of 8 | 7 of 8 | 0 of 5 | 2 of 5 |
| A finding the agent fixed closes | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A finding the person fixed closes | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A dismissed question stays closed | 18 of 24 | 24 of 24 | 5 of 5 | 5 of 5 |

A finding the person sets aside still closes in 3 of 5 Codex runs. The person can dismiss it from the tab either way.

A later rule asks the agent to recommend whenever it asks the user to decide: "When you ask the user to decide something, say which option you recommend and why, in one clause. If you cannot recommend one, say what would decide it." It is in `guidanceText`, after the first paragraph. Claude wrote 10 replies per scenario, Codex 6.

| Scenario | Claude reply names its pick, before → after | Claude questions with a recommendation, before → after | Codex questions with a recommendation, before → after |
| --- | --- | --- | --- |
| A product choice | 6 of 10 → 10 of 10 | 10 of 11 → 10 of 11 | 6 of 6 → 6 of 6 |
| A tradeoff the agent could leave open | 1 of 10 → 10 of 10 | 8 of 8 → 10 of 10 | 6 of 6 → 6 of 6 |
| A fact only the user has | 0 of 10 → 0 of 10 | 0 of 10 → 0 of 10 | 0 of 6 → 0 of 6 |

Before the rule, most recommendations came from a reply that took a position and asked "Want me to start?", not from a stated pick. With the rule, Claude also said what would decide the fact-only question in 3 of 10 replies. An approval scenario was dropped, because both agents took "go on" as the approval itself. The runs also found that a pick written as a letter, such as "A", was dropped when the option read "A: Cancel button". The parser now matches a letter or number to its option.

- **Explain wording:** ten Sonnet agent replies to each Explain message, about a cache question. Asking "and which you would pick" made the agent name a pick in 9 of 10 replies, against 1 of 10. Only the question wording changed. The task wording was not tested and stays.
- **Theme 1 not kept:** ten Sonnet agent replies per version, in two scenarios. With the paragraph, the agent put commands in code blocks. But the items gained nothing. In the fork scenario, both versions gave a recommendation and a one-press step in 10 of 10 replies. In the migration scenario, the paragraph added approval questions, and slightly fewer tasks got a step: 8 of 18, against 11 of 20.
- **Limits:** the agent runs used a short preamble in place of Claude Code's full system prompt. The Codex agent was not run.

Theme 7 was measured with its own fixtures. A case counts when the finding and the item show once, in one list.

| Case | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| The reply asks the person to do something about a finding | 0 of 8 | 7 of 8 | 0 of 5 | 5 of 5 |
| The reply asks the person to decide on a finding | 0 of 8 | 8 of 8 | 0 of 5 | 5 of 5 |
| The agent records a finding for an open question | 0 of 8 | 8 of 8 | 0 of 5 | 5 of 5 |
| A finding the reply only mentions stays open | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| An unrelated question leaves the findings open | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A finding the person put off stays open | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |

In the mention-only case, Sonnet wrote an `ASKED` line with no item in 5 of 8 runs. The code ignores an `ASKED` line that names no open item, so the finding stayed open.

Theme 4 was measured with its own fixtures. A case counts when the outcome takes the form its case calls for. The guard counts runs that do not ask a dismissed question again.

| Case | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| The agent picked an option on its own | 0 of 8 | 8 of 8 | 0 of 5 | 5 of 5 |
| The work made the question moot | 0 of 8 | 8 of 8 | 0 of 5 | 5 of 5 |
| The person answered | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |
| A dismissed question stays closed | 8 of 8 | 8 of 8 | 5 of 5 | 5 of 5 |

The first version asked the dismissed question again in up to 4 of 8 Sonnet runs. The kept version did not.

**A todo the person mentions is a question, not a finding.** Two changes:

- **The finding part of the `record` description** now leaves out "todos or ideas the user mentioned". The agent was measured with a stand-in server, 6 runs per case.
- **The inbox model has a `TODO:` line.** It names the work. Code turns that into the question "Ready to start on <work>?" with the options Proceed / Not yet. Sonnet sometimes writes a `TODO:` line for a finding the person puts off, so code drops a todo that rewords an open item or finding.

| Case | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| The agent records the person's todo as a finding | 6 of 6 | 0 of 6 | 1 of 6 | 1 of 6 |
| The agent still records its own finding | 6 of 6 | 6 of 6 | 6 of 6 | 5 of 6 |
| A todo becomes a question (inbox model) | 1 of 10 | 10 of 10 | 0 of 10 | 10 of 10 |
| A todo the reply took up adds nothing | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |

Two other wordings were dropped:

- **Telling the agent to ask "Ready to start on <todo>. Proceed?"** It made Sonnet ask about its own findings too, in 5 or 6 of 6 runs against 0 of 6 before.
- **A `NEW`-line rule for todos.** It made Sonnet close or ask about findings in other cases. The separate `TODO:` line, with the code check, did not.

The first `TODO:` rule also made Sonnet ask a dismissed question again: 9 of 10 runs kept it closed without the rule, 2 to 4 of 10 with it. A shorter rule kept it closed in 10 of 10. Sonnet then wrote `TODO:` lines for work the reply had just done, so code drops a todo whose key words the reply mostly names.

**A finding the person sets aside stays open.** `FIXED` now asks for the change that fixed the finding, and says that a person setting it aside is not a fix.

| Case, 10 runs | Sonnet before | Sonnet after | Codex before | Codex after |
| --- | --- | --- | --- | --- |
| A finding the person set aside stays open | 7 | 10 | 4 | 10 |
| A finding the person put off stays open | 10 | 10 | 10 | 10 |
| A finding the person or agent fixed closes | 20 of 20 | 20 of 20 | 20 of 20 | 20 of 20 |

**An unrelated question stays open.** Sonnet closed an open question as "no longer applies: not part of this work" in up to 8 of 10 runs of `done-message-independent-task`. The `CLOSED` rule now says an item outside the current work still applies, and that case kept the question in 9 of 10. Sonnet still varies here: 1 of 3 in a later full run.

## Proposed order

1. Theme 4 is done.
2. Theme 3 and theme 6's close result. These are code changes with small model-read edits.
3. Theme 8. Theme 7 is done.

Themes 2 and 5 are built. Theme 2 includes the stricter recommendation rule that f181 called for. Theme 1 was measured and not kept. Theme 4 is not started.

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
