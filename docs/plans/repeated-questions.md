# Earlier answers at ask time

Status: proposed. Nothing is built. Building it needs the owner's yes.

When an agent records a question, the inbox searches the person's earlier answers in every session and host. It adds the three closest answers, and the new question's close id, to the `record` tool's answer. The agent reads them and decides. If an earlier answer settles the question, the agent closes it with that answer as its reason and goes on. Otherwise it asks as usual.

The check needs no model call. It is a keyword search (BM25) over local files.

The question is always recorded first, so the check never refuses an ask. A wrong close does hide one, though. Most earlier answers shown will be near misses, and an agent that closes on one loses a question the person needed. That is the main risk, and the plan tests for it before anything ships.

## Why

A measurement of one person's sessions, from 11-07 to 11-16 01:03 UTC, found that 8% to 17% of 2,076 inbox questions repeated one the person had already answered. The figure depends on the labeller. The first labeller found 163 repeats, 7.9% (6.4% to 9.4%). A second labeller's calls give 16.9% (11.4% to 24.4%). A full search of 60 random questions found 12. Every rate clears the 2% floor set before the run.

BM25 over earlier questions and answers ranked the earlier answer in its top three for 117 of the first labeller's 163 repeats, 71.8% (64.9% to 79.3%). That is an upper bound, since the full search found repeats the labeller never saw. On the second labeller's repeats it was 84.5% (64.0% to 93.7%), and on the full search's, 7 of 12. The inbox's own test, `restates` in `hooks/ask-match.ts`, caught 6.1% (2.8% to 10.0%). It flagged 5.6% of questions that were not repeats.

110 of the 163 repeats matched an answer from another session. 71 of them matched an answer more than a day old. 104 of the 163 were "covered" repeats, where an earlier answer set a rule for a different case, such as "decide the order yourself". A fixed rule catches none of those, and an agent reading the earlier answer can.

The measurement's limits apply here:

- It left out chat questions, dialogs and Codex sessions. Their effect on the rate is unknown.
- It left out answers typed in chat and backlog decisions. That lowers the rate.
- The labellers disagree, mostly on covered repeats. Their agreement, weighted to the population, is a kappa of 0.28.
- Keyword search ran over answers back to early October. A new history holds less, so recall starts lower.

Intervals resample sessions unless marked Wilson. The measurement and its scripts stay outside this repo, because they hold the person's questions.

## What a record-time check can reach

88 of the 163 repeats came through an agent's `record` call. The other 75 had no `record` call of their own. The inbox model most likely added them from the agent's reply. A check on `record` never sees those.

BM25 ranked the earlier answer in its top three for 61 of the 88. That is 69.3% of record-call repeats (59.0% to 78.0%, Wilson) and 37.4% of all repeats (30.4% to 45.1%, Wilson). It assumes the agent acts on every match shown, so it is an upper bound. Wilson intervals ignore clustering by session, so the true intervals are wider.

The same search shows near misses far more often. Of the 1,081 questions agents recorded, the first labeller called 325 follow-ups and 24 "changed". A follow-up builds on an earlier answer and asks the next step. A changed question asks again because the earlier answer deferred it or the situation moved. The earlier answer ranked in the top three for 225 of the follow-ups and 17 of the changed questions. So for every 61 shown repeats the agent should close, it sees 242 shown answers it should not close on. A BM25 score floor does not separate the two groups, so the plan sets none. Every record shows three answers.

The measurement also found 120 questions asked while an equivalent one was open, 119 in another session. Every one came from a reply, not a `record` call. A record-time check reaches none of them, so they belong to the next step below.

## Where it runs

All three hosts already answer `record` through `recorded` in `hooks/session-presses.ts`, which calls `toolAnswer` in `hooks/tools.ts`. The check goes there, so every host gets the same text.

| Host | Calls `recorded` from | Reads the history |
| --- | --- | --- |
| The mod (terminal and desktop looks) | `hooks/mod-sessions.ts` | `$.fs.list` and `$.fs.read` |
| Codex | `codex/src/server.ts`, in the MCP server | `node:fs` |
| omp | `omp/src/host.ts` | `node:fs` |

`toolAnswer` stays pure. Each host reads the history before it takes the session lock, then passes the earlier answers into `recorded`. A new shared module, `hooks/earlier-answers.ts`, ranks them and writes the lines the agent reads. `recordItem` adds those lines, and the new item's id, after "Recorded.". Today the record answer gives no id, and `close` needs one. The id otherwise reaches the agent only in the `inbox:` text beside the person's next prompt. The eval stand-ins, `evals/probe.ts` and `evals/omp-probe.ts`, pass a case's invented history the same way.

The feature gets a `FeatureId` in `hooks/clients.ts`, marked `full` for `claude-code`, `codex` and `omp`. That file is near its 5,000-token limit, so the entries may need a split. No look draws anything new. The Herdr look draws a session a host publishes, so it changes only as that host's rows change.

## What it searches

### The question history

Today no store reaches far enough. Each session keeps its 12 newest closed items (`MAX_CLOSED` in `hooks/ledger-close.ts`). Each host keeps its 40 newest sessions (`KEPT_SESSIONS` in `hooks/ledger.ts`). The three hosts keep their stores in three places, and the mod's store is the engine's own file.

So the plan adds one folder all three hosts share, `$XDG_STATE_HOME/inbox/questions/`, defaulting to `~/.local/state/inbox/questions/`. It holds one file per session, named by host and session id. Only that session's host writes it, so the files need no lock. The mod can write whole files but not append, and one file per session needs neither.

Each file holds a version number, the session's repository name, the time it was saved, and its questions. The repository name comes from the session folder's Git common directory, so worktrees of one repository share a name. For each question the file keeps the ask, the options, the time it was asked, and the answer and its time. It also records which earlier answers each record was shown, and whether the agent closed the question as answered before. "Shows it works" below reads those.

Only questions the person answered count as earlier answers: closed items with `how: 'answered'`. A question closed by an agent, the inbox model, Done, a dismissal or expiry is left out, so an agent's own decision never passes as the person's answer. Dismissed questions stay with today's per-session rule, `repeatsSettled`.

A shared function, `questionHistory(previous, session)`, merges the ledger's answered questions into the session's file. Each host calls it whenever a save changes the ledger's closed list: the mod in its saves, Codex and omp in `updateState`. A question the inbox model added from a reply goes in too, so later searches find its answer. On its first run, each host seeds the folder from the sessions it already keeps, so the history starts with up to 12 answers from each of 40 sessions.

The history keeps answers for 180 days. The measurement's pool spans 5.7 weeks, and 15 of the 163 repeats matched an answer more than 14 days old, so older answers still matter. Nothing measured beyond 5.7 weeks. A file of an older version is read through an upgrade function, as session state is today.

### Privacy

The repo is public. The history lives only under the person's home folder, as each host's store does today. Tests and eval cases use invented questions. No real question, answer or path goes into code, fixtures or docs.

This changes a settled tradeoff. `docs/principles.md` says each session has its own inbox and views across sessions come later. Today every `inbox:` text an agent reads comes from its own session. With this check, a record answer carries answers from other sessions, other projects and other hosts. An answer given in a Claude Code session can then reach Codex's model or omp's provider. The owner decides whether that is acceptable; see "Decisions".

Limiting the search to one repository keeps projects apart. Limiting it to one project folder caught 76 of the 163 repeats instead of 117, because many sessions run in worktrees. Limiting it to one repository falls between those figures and was not measured.

### The search

The search is BM25 over each earlier question's ask and answer, as measured. The query is the new question's ask and options. It shows the top three. Each earlier answer counts once, so two copies of one answer never take two places.

`restates` stays as it is. Within a session, `matchOpen` and `repeatsSettled` still merge or refuse a repeat before the search runs. The search covers what they let through.

## What the agent sees

The lines follow "Recorded. The user sees it in …". This is a draft. The tests below decide the final wording before anything ships.

```
Its close id is i35. The user answered similar questions before. Close i35 only when one of these answers this exact question. Use the reason "answered before: <their answer>", act on that answer, and leave the question out of your reply. An answer to an earlier step, a related case, or one the user put off does not settle it: ask as usual.
- 3 days ago, in shop-api: "Which cache should the product API use?" Answer: "In-memory"
- 11 days ago, in shop-api: "Which cache size should the product API use?" Answer: "64 MB"
- 2 hours ago, in inbox: "Decide the queue order yourself?" Answer: "Yes, decide it yourself"
```

The text leans hard toward asking, because near misses outnumber repeats four to one. The id rule in the guidance, which keeps ids out of replies, still applies.

The agent's close uses `reason`, not `answer`, so the person's row says why it closed. It never reads as an answer the person gave to this question. `close` cuts a reason to 80 characters, which fits a short answer. The row shows for a moment and folds as closed rows do, and the person can reopen it.

The shipped guidance says to close a question "with their answer, or once it no longer applies, and never with an answer of your own". A close that cites an earlier answer is a new kind of close. If the tests show agents refusing it, that sentence changes too, which is a change to `guidanceText`.

Every record adds about 150 tokens to the agent's context. That is no extra model call.

## Cost

| Item | Cost |
| --- | --- |
| Model calls in use | None. |
| Agent context | About 150 tokens per record. |
| Search | Measured on the measurement's pool of 8,791 answers: 11 ms to read, 25 ms to index, about 1 ms per search. |
| Reading files | Measured on 10,000 small files: 12 ms to list them, 100 ms to read them all. Each host caches the index and rereads only files that changed. |
| Storage | 1.2 MB for 5.7 weeks of answers, about 1,580 a week. 180 days is about 6 MB. |

The file timings come from Bun on one Mac, with the files in memory. The mod reads through the engine's `$.fs`, which was not timed. If reading grows too slow, files of sessions idle for a week can merge into one file per month, under a lock. Build that only if the timing calls for it.

## Checking it before release

The check makes no model call. The tests below do, and each run needs the owner's yes first.

### The near-miss test

This test runs first, because it measures the main risk on real questions. It runs privately, outside the repo, like the measurement. It takes 40 recorded repeats and 40 recorded follow-up or changed questions, drawn at random from the measurement. Each gets its real top three. Claude Code reads each one with the draft text, once, and the test counts its closes.

The bar is set now. The text passes if the agent closes at least 20 of the 40 repeats and at most 1 of the 40 near misses. One wrong close in 40 is about 3%. That rate keeps wrong closes under 1 in 10 of all closes at the measured ratio of 61 repeats to 242 near misses. If the text fails, reword it and run the test once more. A second failure stops the build.

It costs about 80 runs and 150 model calls, about $3 at the measured $0.036 a run.

### The agent suite

Unit tests cover the ranking, the merge into the history and the answer text, using invented questions. `./scripts/check.sh` runs them, with no model call.

Four new cases go in `evals/agent-cases/earlier-answers.json`. Each seeds an invented history in the stand-in inbox.

| Case | The history holds | The agent should |
| --- | --- | --- |
| Same question | The same question, answered. | Close it as answered before, act on the answer, and not ask. |
| Covered by a rule | An answer that set a rule, such as "decide the order yourself". | Close it and decide. |
| Follow-up | An answer to the step before. | Keep it open and ask. |
| Deferred | An answer of "not yet, after the release", with the release still ahead. | Keep it open and ask. |

The suite passes a case at 75% of its runs (`MIN` in `evals/agent.ts`). A follow-up case that wrongly closes 1 run in 5 would pass. So the follow-up and deferred cases get their own bar of no wrong close. Adding a per-case bar to the suite is part of the build.

The run counts below assume about 1.9 model calls per run. That is the average of 435 past Claude Code runs of the agent suite, which cost $0.036 each on average. Codex and omp runs bill to their sign-ins, which record no dollar figure.

| Run | Runs | Model calls | Claude Code dollars |
| --- | --- | --- | --- |
| The near-miss test, on Claude Code | 80 | About 150 | About $3 |
| The four new cases, 5 runs each, on Claude Code, Codex and omp | 60 | About 110 | About $0.70 |
| The whole agent suite, 46 cases, as `AGENTS.md` requires after a tool-answer change and before a release | 690 | About 1,290 | About $8.30 |
| One rerun of a failing case at three times its runs, on one agent | 15 | About 28 | About $0.54 |

The ledger suite and the Status suite do not apply, because neither `systemText` nor any Status text changes.

Any session that loads the mod under test needs its own `XDG_STATE_HOME`, so it neither reads nor writes the real history. That covers live checks with their own `CLAUDE_CONFIG_DIR` and `claude -p` trials on a copy of the mod. `AGENTS.md` gets that line under "Tests and live checks".

## What shows it works

After two weeks of use, the owner labels every question an agent closed as answered before: right or wrong. A script lists them from the history, with the earlier answer shown and the person's later reply, if any. No model call runs. Counting reopens would miss wrong closes the person never noticed, so the plan uses labels instead.

The expected count is small. In the measured 9 days, 61 shown repeats came through `record`, about 7 a day. The history starts from seeded sessions, so expect at most about 95 closes in two weeks, and likely far fewer.

These bars are set before any data:

- It works if at most 1 in 10 labelled closes is wrong.
- It fails if more than 1 in 5 is wrong. Then turn it off, because a wrong close loses a question the person needed.
- Anything between is inconclusive. Then label two more weeks.

Each share gets a Wilson interval. With about 30 closes, the interval spans about 15 points either way, so a two-week result may stay inconclusive.

The script also counts records that showed an earlier answer, were asked anyway, and got the same answer from the person. Those are likely missed repeats. Short answers such as "Yes" match by chance, which raises the count. Covered repeats get new words, which lowers it. So this count is a rough guide and sets no bar.

## The simpler alternatives

Four simpler designs fall short.

- Search only the session's own closed items, which need no new storage. 110 of the 163 repeats came from another session, so this reaches at most 48.
- Widen `restates` to answered questions in every session and refuse matches. It caught 6.1% and flagged 5.6% of questions that were not repeats. Refusing also blocks the ask.
- Add guidance alone, such as "check whether the user already answered". The agent cannot see other sessions.
- Make a model call per record to judge the matches. The asking agent already reads them, so a second judge adds cost without new information.

## Next step, decided apart

Questions the inbox model adds from a reply make up 75 of the 163 repeats and all 120 questions asked while an equivalent one was open. The same search can run when such a question is added. It can search open questions in other sessions too. The person's row would then show the closest earlier answer, or the open copy, with a press that answers both at once. That changes the rows in five looks, so it needs its own mockups and its own yes.

## Decisions

- Run the near-miss test first, about 150 model calls and $3? Recommended: yes. It measures the main risk on real questions before any build.
- Build this, as written, if the near-miss test passes? Recommended: yes. It needs no model call in use, and it reaches up to 37% of repeats. It also builds the history the next step needs.
- Let answers cross sessions, projects and hosts, including to Codex's and omp's model providers? Recommended: yes, across every repository. Every repository catches 117 of the 163 repeats; one project folder catches 76. The alternative is one repository only.
- Run the agent suite priced above: about 110 model calls for the new cases, then about 1,290 for the whole suite.
