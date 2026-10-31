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

## Parts

- [Themes](prompt-audit/themes.md): The eight themes, most valuable first.
- [Results](prompt-audit/results.md): The A/B runs for each case.
- [Remaining gaps](prompt-audit/remaining-gaps.md): What a second review found after the runs.

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
| Row press messages | `hooks/press-messages.ts:messages` | Claude, Codex | Themes 2, 6 |
| PR press messages | `hooks/prs.ts:prompts` | Claude | Read, no issue found |
| Codex tool texts | `codex/src/texts.ts` | Codex | Theme 8 |
| Codex hook context | `codex/src/hook.ts` | Codex | No issue. It passes the shared texts through. |

## Checked and not a problem

The skeptics refuted 20 findings, for these reasons:

- **Already handled.** After a compaction, `carryText` keeps the ids and the recently closed items. The no-recommendation case is the agent's to fix, not the inbox model's to guess.
- **Re-proposed a measured change.** Three proposed rewording the finding-closing rule, which `docs/plans/instructions.md` measured and rejected.
- **Unproven.** A missing example of the line format, the catch-up prompt's order, and the card's list rules. No failure was shown for any of them.

## Proposed order

1. Theme 4 is done.
2. Theme 3 and theme 6's close result. These are code changes with small model-read edits.
3. Theme 8. Theme 7 is done.

Themes 2 and 5 are built. Theme 2 includes the stricter recommendation rule that f181 called for. Theme 1 was measured and not kept. Theme 4 is not started.
