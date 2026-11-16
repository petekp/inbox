# Earlier answers on question rows

Status: proposed. Nothing is built. Building it needs the owner's yes.

When a question reaches the person's inbox, its row shows the closest answer the person gave to a similar question before. The person can answer with that earlier answer in one press, or ignore it. The agent never sees the earlier answer, and nothing closes on its own.

The check needs no model call. It is a keyword search (BM25) over local files, run once when the question is added.

## Why

A measurement of one person's sessions, from 11-07 to 11-16 01:03 UTC, found that 8% to 17% of 2,076 inbox questions repeated one the person had already answered. The figure depends on the labeller. The first labeller found 163 repeats, 7.9% (6.4% to 9.4%). A second labeller's calls give 16.9% (11.4% to 24.4%). A full search of 60 random questions found 12.

BM25 over earlier questions and answers ranked the earlier answer first for 82 of the first labeller's 163 repeats, and in its top three for 117. 110 of the 163 matched an answer from another session, and 71 of those 110 matched one more than a day old. 104 were "covered" repeats, where an earlier answer set a rule for a different case, such as "decide the order yourself".

The measurement's limits apply here:

- It left out chat questions, dialogs and Codex sessions. Their effect on the rate is unknown.
- It left out answers typed in chat and backlog decisions. That lowers the rate.
- The labellers agree only weakly, mostly on covered repeats: a kappa of 0.28, weighted to the population.
- Keyword search ran over answers back to early October. A new history holds less, so it matches less at first.

Intervals resample sessions. The measurement and its scripts stay outside this repo, because they hold the person's questions.

## Why the person judges, not the agent

An earlier draft had the agent read the earlier answers and close the question itself. A private test on 80 real questions failed its bar. Opus, given the shipped guidance as its whole prompt and no tools, closed 2 of 40 repeats, against a bar of at least 20. It closed 1 of 40 near misses, and that close was wrong: the person later answered the question the other way. The bar of 20 also needed closes on covered repeats, which the draft wording told the agent not to make.

The person's own later answers explain part of it. At least 10 of the 35 labelled repeats with an answer got a different answer from the earlier one. Whether an old answer still holds is often something only the person knows. A row that shows the answer and lets them press it puts that judgment where it belongs.

A row also reaches more repeats. An agent's `record` call never saw the 75 repeats the inbox model added from replies. Every question reaches a row, however it was added.

## What the row shows

The owner picked the design from three mockups of the Codex tab's demo: one quiet line in the open row. When a question row opens, its ask tree shows one more muted line under the context, such as:

```
You answered Flick 3 days ago, in glasses-app, to "Which gesture should clear a notification card?"
```

The line shows only on the open row, as the context does today. A folded row looks as it does now, so the rows that carry an earlier answer add nothing to the list. The line names the earlier question as well as the answer, because about 9 in 10 answers are one to five words and mean little alone.

The option buttons stay as they are. When the earlier answer is one of the new question's options, pressing that option answers with it, and the row adds no button. When it is not, the row adds one answer button labelled with the earlier answer, after the agent's options. It sends the agent the same message an option press sends, with the earlier answer as the text.

Today's code refuses that press, so the build changes three places:

- `pressed` in `hooks/pressed.ts` accepts an answer only when it is one of the item's options. It also accepts the item's `earlier` answer.
- `actionsOf` in `hooks/action-plan.ts` adds the button after the options, with the next choice key. The "All N options" count and the option descriptions count only the agent's options.
- Undo of that press reopens the question as any answer's Undo does, and the history drops the answer.

Ignoring it costs nothing beyond reading the line. A wrong match never acts unless the person presses it, and a press shows its feedback and closes as any answer does.

### Which rows show one

A line on every question would be noise. In the measurement, every question had some earlier answer, so every row would show one. Only about 1 in 25 would show the earlier answer to a repeat, and about 2 in 3 would relate to nothing. A floor on the top match's BM25 score keeps the line to rows where it is more likely to help:

| Floor | Question rows that show a line | Shown rows that are repeats, top match | Shown rows with a related answer |
| --- | --- | --- | --- |
| None | 2,076, all | 82 | 34% |
| 15 | 1,225, 59% | 73 | 44% |
| 18 | 777, 37% | 67 | 52% |
| 20 | 511, 25% | 52 | 57% |
| 25 | 207, 10% | 23 | 67% |

A related answer is a repeat, a follow-up or a changed question, as labelled. A follow-up builds on an earlier answer. A changed question asks again because the earlier answer put it off or the situation moved. For those, the earlier answer is useful context even when it does not settle the question. The related share counts a labelled match anywhere in the candidates, not only the top one, so it is an upper bound.

A raw floor assumes a full history. Raw BM25 scores grow with the history, so a fixed floor of 18 would show the line on fewer rows at first. The review of this plan found that a history started at build would show it on about 16% of rows, catching 40 repeats instead of 67. So the floor is relative: the top match's score divided by the best score the query could reach. The review found that a relative floor of 0.20 shows the line on 26% to 29% of rows as the history grows, with about the same share of repeats. The build checks that figure on the measurement before it sets the floor.

## Where it runs

The search runs once, when a question is added to the ledger: from an agent's `record` call or from the ledger call's update after a reply. Both paths already pass through shared code that every host calls: `recorded` in `hooks/session-presses.ts`, and `applied` in `hooks/session-turns.ts`, which calls `applyExchangeUpdate`.

Each host reads the history before that step and passes it in. A new shared module, `hooks/earlier-answers.ts`, ranks the history for each question the step added, and stores the top match on the item as `earlier`. The view never searches. It reads `earlier` from the item, so a row's line never changes under the person, and every look shows the same match.

| Host | Reads the history with |
| --- | --- |
| The mod, for the terminal and desktop looks | `$.fs.list` and `$.fs.read` |
| Codex | `node:fs`, in its MCP server and its update process |
| omp | `node:fs` |

`earlier` is a new optional field on `Item`, so saved state needs no upgrade. It goes in `types/parts/items.d.ts`, and `node scripts/build-types.mjs` rebuilds the types. Closed records copy the item, and the mod keeps every session's records in one store capped at 4 MB, so `earlier` caps each text it holds at 200 characters. No text a model reads includes it today: `inboxText`, `buildPrompt` and the Status prompt each read named item fields and never a whole item. Codex's `inbox` tool, which its model calls, reads `RowView`, so its answer must leave the new line out. A unit test checks that no text a model reads contains the earlier answer.

## Each look

`hooks/view.ts` adds the line to `RowView`, on open rows only, as it does `contextLine`. The added answer button comes from the row's actions in `hooks/action-plan.ts`, so `rowKeyPlan` places it and every look draws the same words and order. Each look draws the line where it draws an open question's context today, in its ask tree.

| Look | Draws the line in | Draws the added answer as |
| --- | --- | --- |
| Terminal | `hooks/pane-ask-tree.tsx` | A choice key, after the agent's options |
| Desktop | `hooks/pane-ask-tree.tsx` | A native Button. Hotkeys do nothing there, so the button is the only way |
| Codex tab | `codex/src/tab-ask-tree.tsx` | A button |
| omp panel | `omp/src/panel-ask-tree.ts` | A choice key, handled in `omp/src/panel-keys.ts` |
| Herdr | `herdr/src/draw.ts` | A button. Herdr draws the rows a host publishes, and its presses go back to that host |

The feature gets a `FeatureId` in `hooks/clients.ts`, marked `full` for `claude-code`, `codex` and `omp`. That file is near its 5,000-token limit, so the entries may need a split. The demo in `hooks/demo.ts` gets a question with an earlier answer, so each look's demo shows the line and the press.

## What it searches

### The question history

Today no store reaches far enough. Each session keeps its 12 newest closed items (`MAX_CLOSED` in `hooks/ledger-close.ts`). Each host keeps its 40 newest sessions (`KEPT_SESSIONS` in `hooks/ledger.ts`). The three hosts keep their stores in three places, and the mod's store is the engine's own file.

So the plan adds one folder all three hosts share, `$XDG_STATE_HOME/inbox/questions/`, defaulting to `~/.local/state/inbox/questions/`. It holds one file per session, named by host and session id. Only that session's host writes it, so the files need no lock. The mod can write whole files but not append, and one file per session needs neither.

Each file holds a version number, the session's repository name, the time it was saved, and its questions. The repository name comes from the session folder's Git common directory, so worktrees of one repository share a name. For each question the file keeps the ask, the options, the time it was asked, and the answer and its time. It also keeps the earlier answer its row showed, and whether the person answered with it. "What shows it works" reads those.

Only answers the person gave count as earlier answers. Today's closes do not mark that cleanly:

- An answer press closes the item with `how: 'answered'`.
- A typed reply leaves the item open. The inbox model closes it later with `how: 'update'`, and its outcome holds the answer. An update close can also mean the question no longer applies.
- An agent's `close` with an answer is also stored as `answered`. The guidance tells agents to pass the person's answer, but a coordinator may pass its own decision.

So the history keeps answered and update closes, and stores each one's `how`, with a mark when the close followed a typed reply. The ledger prompt has the inbox model write a close that is not an answer as "done: …" or "no longer applies: …", so update closes in those two forms are left out, as the measurement's extract left them out. Done, dismissed, expired and agent closes with a reason are left out too. The measurement did not record `how`, so how much this set differs from the measured answers is unknown. "What shows it works" splits its counts by `how`, so a later change can drop a kind that misleads.

A shared function, `questionHistory(previous, session)`, merges the ledger's closed questions into the session's file. Each host calls it whenever a save changes the ledger's closed list, and drops an answer whose question was reopened. Codex writes session state from both its MCP server and its update process, so it writes the history under the same session lock. On its first run, each host seeds the folder from the sessions it already keeps, so the history starts with up to 12 answers from each of 40 sessions.

The history keeps answers for 180 days. 15 of the 163 repeats matched an answer more than 14 days old, so older answers still matter. Nothing measured beyond 5.7 weeks. A file of an older version is read through an upgrade function, as session state is today.

### Privacy

The repo is public. The history lives only under the person's home folder, as each host's store does today. Tests and the demo use invented questions. No real question, answer or path goes into code, fixtures or docs.

The owner decided that earlier answers may cross sessions, projects and hosts. The row design narrows what crosses. An earlier answer is drawn on the person's own row and reaches no model. It reaches an agent only when the person presses it, as their answer to that agent's question.

This still changes a settled tradeoff. `docs/principles.md` says each session has its own inbox and views across sessions come later. A row that shows an answer from another session is the first such view. The principles doc gets a line saying so.

### The search

The search is BM25 over each earlier question's ask and answer, as measured. The query is the new question's ask and options. Each earlier answer counts once. An answer to the same item never counts.

`restates`, `matchOpen` and `repeatsSettled` in `hooks/ask-match.ts` stay as they are. Within a session, they still merge or refuse a repeat before the search runs.

## Cost

| Item | Cost |
| --- | --- |
| Model calls in use | None. |
| Agent context | None. |
| Search | Measured on the measurement's pool of 8,791 answers: 11 ms to read, 25 ms to index, about 1 ms per search. |
| Reading files | Measured on 10,000 small files: 12 ms to list them, 100 ms to read them all. Each host caches the index and rereads only files that changed. |
| Storage | About 2 MB for 5.7 weeks of answers, about 1,580 a week. 180 days is about 9 MB. |

The file timings come from Bun on one Mac, with the files in memory. The mod reads through the engine's `$.fs`, which was not timed. If reading grows too slow, files of sessions idle for a week can merge into one file per month, under a lock. Build that only if the timing calls for it.

## Checking it before release

No text a model reads changes, so `AGENTS.md` calls for no run of the agent suite, the ledger suite or the Status suite. The owner decided to run the agent suite at build time when the plan changed the `record` answer. This plan leaves that answer alone, so it proposes skipping the run; see "Decisions". The checks below make no model call.

- Unit tests cover the ranking, the floor, the merge into the history, the row's line and the press's place in `rowKeyPlan`, with invented questions. `./scripts/check.sh` runs them.
- The demo test in `tests/hooks.test.ts` and `omp/tests/panel.spec.ts` check the press's order in the terminal, desktop and omp looks.
- Each look gets a live check of the demo question: the line, the press, the press's feedback and the row closing. Any session that loads the mod under test gets its own `XDG_STATE_HOME`, so it neither reads nor writes the real history. `AGENTS.md` gets that line under "Tests and live checks".

## What shows it works

People already give the same answer as the top match on some rows with no line at all. The review of this plan found that on about 6.5% of the rows a floor would show. So a raw count of matching answers would pass any low bar by chance. The check compares against a baseline instead.

The build ships in two stages:

1. For the first week, the hosts search and record matches but draw nothing. That week gives the baseline, and it fills the history.
2. Then the line shows for two weeks.

The history records, for each question row, the match it found, whether the line was drawn, and the person's answer. A script compares the share of matched rows answered with the matched answer, with the line and without it. It resamples sessions for the interval. No model call runs. The baseline week runs on a younger history than the weeks after it. The relative floor keeps the share of rows with a match about steady as the history grows, so this drift stays small.

These bars are set before any data:

- It works if the share rises by at least 3 points over the baseline, and the interval's lower end is above zero.
- It fails if the interval's upper end is under 1 point of rise. Then remove the line, since it costs a glance on about a quarter of rows and helps almost none.
- Anything between is inconclusive. Then the owner says whether the line helps when it shows.

The script also counts presses of the added button, which only the line offers, split by the history's `how`. A young history shows the line on fewer rows. The review of this plan put two weeks at about 500 to 700 rows with a line, so a rise of a few points may stay inconclusive.

## The simpler alternatives

- Let the agent close the question with the earlier answer. The test above failed, and the person's own answers show why.
- Search only the session's own closed items, which need no new storage. By the labels, 52 of the 163 repeats had an earlier answer in their own session, and only 39 of those were among the 12 closed items a session keeps.
- Show the line on every question. About 2 in 3 shown answers would relate to nothing.
- Make a model call per question to judge the match. The person judges it in one glance, and the call adds cost to every question.
- Search each host's existing stores, which need no shared folder. They keep about 480 answers per host, against 8,791 in the measurement, and reach no other host. 15 of the 163 repeats matched an answer more than 14 days old.
- Put the earlier answer into the Reply field, ready to edit. That needs a press to open Reply and another to send, where the added button takes one.

Open questions in other sessions that ask the same thing are left out. The measurement found 120, but showing one question in two places goes against the principles. It needs its own design.

## Decisions

Decided by the owner on 11-16:

- Let earlier answers cross sessions, projects and hosts: yes, across every repository. Every repository catches 117 of the 163 repeats in the top three, and one project folder catches 76.
- Show the earlier answer on the person's row instead of letting the agent close the question.
- The row design: A, one quiet line in the open row, with the option buttons unchanged. The other two mockups marked the matching button, or added a line to the folded row.

Still open:

- Build this, as written, with the week that draws nothing first.
- Skip the agent suite at build time, since no text a model reads changes. The earlier decision to run it covered a change to the `record` answer, which this plan drops.
