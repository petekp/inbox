# Prompt audit: results

Part of [the prompt audit](../prompt-audit.md).

Status: building. The index says which themes are built, measured or proposed.

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
