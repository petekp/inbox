# Earlier answers in the record answer

This extends [repeated-questions.md](repeated-questions.md), which shows the person's earlier answer on a question's row.

Status: built. The `record` answer lists earlier answers once 21 days have passed since the question history began.

Decided by the owner on 11-19 and 11-20: when an agent records a question, the `record` answer also lists the person's up to 3 earlier answers most like it. The agent can then close the question with the reason "answered before: …" and act on that answer, instead of asking again. This starts once 21 days have passed since the history began, after the row's measurement, so agents' closes do not change the weeks `scripts/earlier-answers-report.mjs` compares. The report counts only questions asked in those 21 days.

The question is always recorded first, and the answer then adds its id and the matches:

```
Recorded. The user sees it in the /inbox pane. Its id is i35.
The user answered similar questions before. If one settles this exact question, close i35 with the reason "answered before: <their answer>" and act on that answer. If it answers an earlier step or a different case, or put the decision off, leave i35 open.
- 3 days ago, in shop-api: "Which cache should the product API use?" They answered "In-memory".
```

Holding the question until the agent confirms it is new would lose a real ask whenever the agent misjudges a near miss, unseen. A recorded question the agent closes stays reachable as a closed row. Only questions get matches, since the history holds only answers to questions. A record that updates an open item lists none.

The search is the row's: `rankedEarlier` in `core/domain/earlier-answers.ts` over the same history, with the same `RELATIVE_FLOOR`. Its query is the ask and options as the call gives them. The row's query uses them as recorded, which cuts a long ask or option, so the two differ only for long text. Each host searches before it applies the call, through `recordMatches` in `core/runtime/history-store.ts`, and passes the matches to `toolAnswer`. `core/domain/record-matches.ts` writes the lines. The feature has the `FeatureId` `record-earlier-answers`.

## The floor

The record answer uses the row's floor, 0.22. On the measurement's 1,081 questions from `record` calls, the floor gives the following. Repeats are the 85 questions an earlier answer settles. Changed questions are the 24 whose earlier answer the person changed or put off. Follow-ups are the 325 whose earlier answer settled an earlier step. A close on a changed question or a follow-up would be wrong.

| Floor | Records listing any | Repeats caught | Changed questions listing a line | Follow-ups listing a line |
| --- | --- | --- | --- | --- |
| None | 100% | 63 | 24 | 325 |
| 0.15 | 53% | 48 | 21 | 188 |
| 0.22 | 17% | 20 | 11 | 70 |
| 0.30 | 5% | 12 | 3 | 18 |

At 0.22 the record answer catches 20 of the 85 repeats, 15.8% to 33.6% at 95%. The labeller saw only questions the keyword search found, so these recall figures are likely high. The results hold for any history older than about two weeks, and the lines start at 21 days. Adding the question's context to the query lowers recall at the same listing rate.

The best floor depends on two rates: how often an agent closes a repeat it is shown, and how often it closes a near miss wrongly. A wrong close likely costs more than a repeated question. The person sees the closed row once, and may not notice that the agent acted on the wrong answer. So the floor goes no lower than the point where the extra wrong closes stay well under the extra right ones.

The measurement also found 120 questions asked while an equivalent one was open in another session. The inbox model added all 120 from replies, so none came through `record`. A `record` answer that listed open questions would have reached none of them, so it lists none.

## Checks

Before the 11-16 row design, a private test gave Opus an earlier draft of this text. It closed 2 of 40 repeats, against a bar of 20 that the draft's wording could not reach, and closed 1 of 40 near misses wrongly. The private test ran again on 11-20, on the text above. Opus closed 3 of 40 labelled repeats and wrongly closed 0 of 40 near misses. Its bar of 20 could not be met. 28 of the 40 repeats apply an earlier rule to another case, which the text tells the agent to leave open. The test's prompt also left out each question's context, which pushed toward keeping. So the floor stays at 0.22. `evals/agent-cases/earlier-answers.json` holds four cases: the same question, which the agent closes, and three it leaves open: a question an earlier rule covers, a follow-up, and a decision put off until an event that has passed.
