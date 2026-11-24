# Earlier answers on question rows

Status: built. For the first week of the question history, the hosts record matches and draw nothing. Then the line shows. Once 21 days have passed since the history began, the `record` answer lists earlier answers to the agent too, as [repeated-questions-record.md](repeated-questions-record.md) says.

When a question reaches the person's inbox, its row shows the closest answer the person gave to a similar question before. The person can answer with it as with any answer, or ignore it. Nothing closes on its own.

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

The person's own later answers explain part of it. At least 10 of the 35 labelled repeats with an answer got a different answer from the earlier one. Whether an old answer still holds is often something only the person knows. A row that shows the answer and leaves the choice to them puts that judgment where it belongs.

A row also reaches more repeats. An agent's `record` call never saw the 75 repeats the inbox model added from replies. Every question reaches a row, however it was added.

## What the row shows

The owner picked the design from three mockups of the Codex tab's demo: one quiet line in the open row. When a question row opens, its ask tree shows one more muted line under the context, such as:

```
You answered Flick 3 days ago, in glasses-app, to "Which gesture should clear a notification card?"
```

The line shows only on the open row, as the context does today. A folded row looks as it does now, so the rows that carry an earlier answer add nothing to the list. The line names the earlier question as well as the answer, because about 9 in 10 answers are one to five words and mean little alone.

The option buttons stay as they are. When the earlier answer is one of the options, the person presses that option. When it is not, they answer with Reply, as with any answer the options miss. The line adds no button.

Ignoring it costs nothing beyond reading the line. A wrong match never acts on its own.

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

A raw floor assumes a full history. Raw BM25 scores grow with the history, so a fixed floor of 18 would show the line on fewer rows at first. The review of this plan found that a history started at build would show it on about 16% of rows, catching 40 repeats instead of 67. So the floor is relative: the top match's score divided by the best score the query could reach. That best score adds, for each of the query's terms the history holds, the term's weight times K1 + 1, which is what a match on that term alone can add. The build sets the floor, `RELATIVE_FLOOR` in `core/domain/earlier-answers.ts`, at 0.22. On the measurement it shows the line on 28% of question rows with the full history and 31% with a history started on 11-07. Its top match is the labelled earlier answer for 45% of repeats with the full history, and 60% with the younger one. About 22% of the rows that show a line are repeats with their earlier answer on top.

A match must also share a term that holds a letter. The best score counts only the query's terms the history holds, so a question whose other words are new to the history could match on a number alone, such as a PR number against a version's digits. On 1,118 questions of history on 11-24, this rule moved the line from 24.6% to 24.4% of rows.

Terms the history does not hold add nothing to the best score. So a question that shares one word with one earlier answer can reach the floor with that word alone. Counting each such term at the highest weight instead gives about the same repeats at the same share of rows. But the share of rows it shows moves more as the history grows.

## Where it runs

The search runs once, when a question is added to the ledger, whatever added it: an agent's `record` call, the ledger call's update after a reply, or a press. Each host runs one shared step, `historyStep` in `core/runtime/history-store.ts`, on every session it is about to save, before it prunes the session. The step finds the questions the change added, ranks the history for each with `core/domain/earlier-answers.ts`, and stores the top match on the item as `earlier`. When the change closed or reopened a question, it writes the session's history file. A change that does neither makes no file call. A failure leaves the session as it was changed, so the history never stops a save. The view never searches. It reads `earlier` from the item, so a row's line never changes under the person, and every look shows the same match.

| Host | Runs the step in | Reads and writes the history with |
| --- | --- | --- |
| The mod, for the terminal and desktop looks | `changeSession` in `hooks/mod/mod-session-write.ts`, through `withHistory` in `hooks/mod/mod-history.ts`, and so `changeSaved` too | `$.fs.list`, `$.fs.read` and `$.fs.write` |
| Codex | `updateState` in `codex/src/state.ts`, under the session lock, in its hook, update and MCP server processes | `node:fs`, from `codex/src/question-history.ts` |
| omp | `updateState` in `omp/src/state.ts` | `node:fs`, from `omp/src/question-history.ts` |

An entry point turns the history on. Codex's are `hook-main.ts`, `update-main.ts` and `createHandler`, and omp's is `createInbox`, through `HostDeps.questionHistory`. The mod finds the folder from `$.env` when it first saves. So tests, which build the state modules without an entry point or a `HOME`, neither read nor write a history.

`earlier` is a new optional field on `Item`, so saved state needs no upgrade. It goes in `types/parts/items.d.ts`, and `node scripts/build-types.mjs` rebuilds the types. Closed records copy the item, and the mod keeps every session's records in one store capped at 4 MB, so `earlier` caps each text it holds at 200 characters. No text a model reads includes it today: `inboxText`, `buildPrompt` and the Status prompt each read named item fields and never a whole item. Codex's `inbox` tool, which its model calls, writes each row's title, options and recommendation, and leaves the new line out. A unit test checks that no text a model reads contains the earlier answer.

## Each look

`core/view/view.ts` adds the line to `RowView`, on open rows only, as it does `contextLine`. Each look draws the line where it draws an open question's context today, in its ask tree.

| Look | Draws the line in |
| --- | --- |
| Terminal and desktop | `hooks/pane/pane-ask-tree.tsx` |
| Codex tab | `codex/src/tab-ask-tree.tsx` |
| omp panel | `omp/src/panel-ask-tree.ts` |
| Herdr | `herdr/src/draw.ts`, from the rows a host publishes |

The feature has the `FeatureId` `earlier-answers` in `core/domain/clients.ts`, marked `full` for `claude-code`, `codex` and `omp`. The `FeatureId` union moved to `core/domain/client-features.ts` to keep `core/domain/clients.ts` under its limit. Herdr draws the line in one muted tone, since gpui-kit has no inline text span to draw the answer bold. The demo in `core/view/demo.ts` gets a question with an earlier answer, so each look's demo shows the line.

## What it searches

### The question history

Today no store reaches far enough. Each session keeps its 12 newest closed items (`MAX_CLOSED` in `core/domain/ledger-close.ts`). Each host keeps its 40 newest sessions (`KEPT_SESSIONS` in `core/domain/ledger.ts`). The three hosts keep their stores in three places, and the mod's store is the engine's own file.

So the plan adds one folder all three hosts share, `$XDG_STATE_HOME/inbox/questions/`, defaulting to `~/.local/state/inbox/questions/`. It holds one file per session, named by host and session id. Only that session's host writes it, so the files need no lock. The mod can write whole files but not append, and one file per session needs neither.

Each file holds a version number, the session's repository name, the time the host first wrote it, the time it was saved, and its questions. The repository name comes from the session folder's Git common directory, so worktrees of one repository share a name. For each question the file keeps the ask, the options, the time it was asked, and the answer and its time. It also keeps the earlier answer its row showed, and whether the person answered with it. "What shows it works" reads those.

Only answers the person gave count as earlier answers. Today's closes do not mark that cleanly:

- An answer press closes the item with `how: 'answered'`.
- A typed reply leaves the item open. The inbox model closes it later with `how: 'update'`, and its outcome holds the answer. An update close can also mean the question no longer applies.
- An agent's `close` with an answer is also stored as `answered`. The guidance tells agents to pass the person's answer, but a coordinator may pass its own decision.

So the history keeps answered and update closes, and stores each one's `how`, with a mark when the close followed a typed reply. The ledger prompt has the inbox model write a close that is not an answer as "done: …" or "no longer applies: …", so update closes in those forms are left out, as the measurement's extract left them out. So are the other overtaken forms `core/domain/ledger-close.ts` knows, "replaced", "superseded" and "moot", and "fix sent for …", which closes a question when the person presses Fix on the finding it asked about. Done, dismissed, expired and agent closes with a reason are left out too. The measurement did not record `how`, so how much this set differs from the measured answers is unknown. "What shows it works" splits its counts by `how`, so a later change can drop a kind that misleads.

A shared function, `questionHistory(previous, session)`, merges the ledger's closed questions into the session's file. Each host calls it whenever a save changes the ledger's closed list, and drops an answer whose question was reopened. Codex writes session state from both its MCP server and its update process, so it writes the history under the same session lock. On its first step in a process, a host that has no files in the folder yet seeds it from the sessions it already keeps, so the history starts with up to 12 answers from each of 40 sessions.

The history keeps answers for 180 days. 15 of the 163 repeats matched an answer more than 14 days old, so older answers still matter. Nothing measured beyond 5.7 weeks. A file of an older version is read through an upgrade function, as session state is today.

### Privacy

The repo is public. The history lives only under the person's home folder, as each host's store does today. Tests and the demo use invented questions. No real question, answer or path goes into code, fixtures or docs.

The owner decided that earlier answers may cross sessions, projects and hosts. The row design narrows what crosses. An earlier answer is drawn on the person's own row and reaches no model. It reaches an agent only when the person gives the same answer to that agent's question.

`docs/principles.md` says each session has its own inbox, and names this row as the first view across sessions.

### The search

The search is BM25 over each earlier question's ask and answer, as measured. The query is the new question's ask and options. Each earlier answer counts once. An answer to the same item never counts.

`restates`, `matchOpen` and `repeatsSettled` in `core/domain/ask-match.ts` stay as they are. Within a session, they still merge or refuse a repeat before the search runs.

## Cost

| Item | Cost |
| --- | --- |
| Model calls in use | None. |
| Agent context | None. |
| Search | Measured on the measurement's pool of 8,791 answers: 11 ms to read, 25 ms to index, about 1 ms per search. |
| Reading files | Measured on 10,000 small files: 12 ms to list them, 100 ms to read them all. Each host caches the index and rereads only files that changed. |
| Storage | About 2 MB for 5.7 weeks of answers, about 1,580 a week. 180 days is about 9 MB. |

The file timings come from Bun on one Mac, with the files in memory. The mod's `$.fs` was not timed. If reading grows too slow, files of sessions idle for a week can merge into one file per month, under a lock.

## Checking it before release

No text a model reads changes, so `AGENTS.md` calls for no run of the agent suite, the ledger suite or the Status suite, and the owner decided to skip the agent suite. The checks below make no model call.

- Unit tests cover the ranking, the floor, the merge into the history and the row's line, with invented questions. `./scripts/check.sh` runs them.
- The demo tests in `tests/hooks-row-drawing.test.ts`, `omp/tests/panel.spec.ts`, `herdr/tests/draw.spec.ts` and `codex/tests/tab-ask-tree.spec.ts` check where each look draws the line.
- Each look gets a live check of the demo question's line. A session that loads the build under test gets its own `XDG_STATE_HOME`, as `AGENTS.md` says.

## What shows it works

People already give the top match's answer on about 6.5% of the rows a floor would show, with no line at all. So a raw count of matching answers would pass any low bar by chance. The check compares against a baseline instead.

The build ships in two stages:

1. For the first week, the hosts search and record matches but draw nothing. That week gives the baseline, and it fills the history. The week starts when the history began, the `created` time of its oldest file. A match stores whether its row draws it, as `earlier.isShown`, so a row keeps its form after the week ends.
2. Then the line shows for two weeks.

The history records, for each answered question, the match it found, whether the line was drawn, and the person's answer. Questions never answered are not in it. `scripts/earlier-answers-report.mjs` compares the share of matched rows answered with the matched answer, with the line and without it. It resamples sessions for the interval. The baseline week runs on a younger history, but the relative floor keeps the share of rows with a match about steady.

These bars are set before any data:

- It works if the share rises by at least 3 points over the baseline, and the interval's lower end is above zero.
- It fails if the interval's upper end is under 1 point of rise. Then remove the line, since it costs a glance on about a quarter of rows and helps almost none.
- Anything between is inconclusive. Then the owner says whether the line helps when it shows.

The script also splits the answers given with the line by the history's `how`. A young history shows the line on fewer rows. The review of this plan put two weeks at about 500 to 700 rows with a line, so a rise of a few points may stay inconclusive.

## The simpler alternatives

- Let the agent close the question with the earlier answer. The test above failed, and the person's own answers show why.
- Search only the session's own closed items, which need no new storage. By the labels, 52 of the 163 repeats had an earlier answer in their own session, and only 39 of those were among the 12 closed items a session keeps.
- Show the line on every question. About 2 in 3 shown answers would relate to nothing.
- Make a model call per question to judge the match. The person judges it in one glance, and the call adds cost to every question.
- Search each host's existing stores, which need no shared folder. They keep about 480 answers per host, against 8,791 in the measurement, and reach no other host.
- Add an answer button for an earlier answer that is none of the options. The owner chose the line alone.

Open questions in other sessions that ask the same thing are left out. The measurement found 120, but showing one question in two places needs its own design.

## Decisions

Decided by the owner on 11-16:

- Let earlier answers cross sessions, projects and hosts: yes, across every repository. Every repository catches 117 of the 163 repeats in the top three, and one project folder catches 76.
- Show the earlier answer on the person's row instead of letting the agent close the question.
- The row design: A, one quiet line in the open row, with the option buttons unchanged and no added button. The other two mockups marked the matching button, or added a line to the folded row.

- Build this, as written, with the week that draws nothing first.
- Skip the agent suite at build time, since no text a model reads changes.
