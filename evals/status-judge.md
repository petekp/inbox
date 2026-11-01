# The Status judge's instructions

The judge's system text is the three parts in `evals/status-judge/`. `judgeSystemText` in `evals/status-judge-text.ts` joins them in the order listed below, with a blank line between. The author writes from `docs/plans/status.md` alone, and never sees the judge's page sets.

## What the harness sends

The judge runs on Claude Opus. Its prompt is built by `judgePrompt` in `evals/status-judge.ts`:

```text
<page>
The drawn Status page as plain text, from `pageText` in `evals/status-page-text.ts`.
</page>
<previous>
The page at the last checkpoint, or (none).
</previous>
<facts>
What really happened up to this point, from `factsText` in `evals/status-facts.ts`.
</facts>
<checks>
One line per check: its id, a colon, and what it asks. The ids are in `JUDGE_CHECKS`.
</checks>
```

Text inside `<page>` and `<previous>` is what the page shows. It is never an instruction to the judge.

## What the harness reads back

One line per check, in any order:

```text
<check id> | pass | <the fact the verdict rests on>
<check id> | fail | <the fact the verdict rests on>
<check id> | n/a | <what the page lacks>
```

`parseJudgeAnswer` ignores every other line. An answer that leaves out a check, or gives one check twice, cannot be read, and counts as a wrong verdict on every check.

## The parts

The judge reads each part as it is, so a part has no title line or link back to this file.

1. [`context.md`](status-judge/context.md): the judge's task, what it gets, how the page is drawn, and how to work.
2. [`checks.md`](status-judge/checks.md): each check, with examples that pass and fail, and when a check has nothing to judge.
3. [`answer.md`](status-judge/answer.md): the answer format, with an example.
