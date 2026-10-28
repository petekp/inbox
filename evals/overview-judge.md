# The Overview judge's instructions

The judge's author replaces the placeholder below the line. Everything below the line becomes the judge's system text. The author writes from `docs/plans/overview.md` alone, and never sees the judge's page sets.

## What the harness sends

The judge runs on Claude Opus. Its prompt is built by `judgePrompt` in `evals/overview-judge.ts`:

```text
<page>
The drawn Overview page as plain text, from `pageText` in `evals/overview-page-text.ts`.
</page>
<previous>
The page at the last checkpoint, or (none).
</previous>
<facts>
What really happened up to this point, from `factsText` in `evals/overview-facts.ts`.
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
```

`parseJudgeAnswer` ignores every other line. An answer that leaves out a check, or gives one check twice, cannot be read, and counts as a wrong verdict on every check.

---

PLACEHOLDER: the judge's author has not written these instructions yet. The harness refuses to run the judge while this line is here.
