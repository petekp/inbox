# The Status tab: how the Status is judged

Part of [the Status tab plan](../status.md).

Status: built.

## How the Status is judged

Decision 16 sets the method. The evals run at each release, and after a change to the Status call's text or to the code that applies its answer.

`./scripts/eval.sh --suite status` runs them. These files hold them:

| File | What it holds |
| --- | --- |
| `evals/status-replays.ts` | The replays and the short case, with their facts |
| `evals/status-replay.ts` | How a replay runs each step through the hosts' own code |
| `evals/status-facts.ts` | The fact list, and the text of it the judge reads |
| `evals/status-rules.ts` | The fixed rules |
| `evals/status-judge.ts` | The judge's checks, its prompt, and how its answer is read |
| `evals/status-judge.md` | The judge's instructions |
| `evals/status-run.ts` | The runner, its report and its results file |
| `tests/status-evals.test.ts` | The checks with no model calls |

### What goes in the suite

- **A case comes from a real failure.** The sources are the failures seen in real sessions, what the person hits in use, and the record of Status calls once a next build keeps one.
- **A case joins when it reproduces its failure.** A short case must fail on today's prompt at the step and property it targets. A replay targets a failure at each step, and joins when at least one step fails as targeted. A step that does not reproduce its failure stays as a check, marked as not reproduced. A failure owned by code joins as a known failing case.
- **A failure counts only when the property it targets fails.** An answer that is unreadable, or that breaks another property, is reported but does not count as reproducing the failure.

### The case format

A case is a starting state, then steps, with the fact list beside them.

- **The starting state:** a saved ledger, with its Status, open asks and findings, and the session's presence.
- **A step** has a time, and runs in this order:
  - host events: a child starts, acts or ends, or the person looks at the page for some seconds;
  - fixture events, in a replay that skips the ledger call: an ask opens or closes;
  - at most one call: a reply, a mid-turn call or a catch-up, each with its exchange or conversation, or a recorded call's exchange as it was.
- **The fact list** gives, for each step, the session's focus, every piece of work with its aliases and its real state, the asks and the pieces each holds up, the running work and the piece each serves, and what is not work. A step lists only what it changes, and the pieces it changes are the step's changes.
- **Targets:** each step names the rules or judge checks of the failure it was written to reproduce.

Host events run through the hosts' own reducers, such as `childStarted` and `lookEnded`. Links and ids stay as the run made them, so a fixture never corrects a wrong link the run made. The expected links live only in the fact list, for grading.

A next build's record of a Status call holds the call's input as data: the Status before, with its running children, the open asks, the host's task list, and the exchange. `replayFromRecord` turns a record into a one-step replay at the time the call ran, which builds the prompt again with today's code. The case's author adds the facts. The record's own prompt and answer show the failure that was seen.

### The replays

[The Status replays](../../status-replays.md) lists the three replays, what each step checks, the short catch-up case, and the cases the steps replaced.

### The fixed rules

These run after every step of every replay, on the saved Status, the page `statusPage` draws, and the fact list:

- No text the model writes holds a time word: the head, a name, where it stands, or a was line.
- A name has at most 3 words, no "…" and no question mark. So does the head's title.
- The head has a title and a one-line description, and the description does not repeat the title.
- A text names no command, file, hash, ticket or PR number, count, or process step, such as "running", "started", "in progress" or "checks".
- The head holds no status word, such as "ready", "merged", "passes" or "waiting".
- No two open subjects share every key word of a name, numbers included, or the same issue or PR number. So "2.4 release" and "2.5 release" are two pieces.
- No open subject's text says the work is over: "published", "merged", "shipped", "released" or "done".
- Every open piece in the fact list matches a row or is in the queued fold.
- Each piece's mark matches its state in the fact list. Where two marks are both right, as for work just set aside, the fact list allows both.
- No subject matches an ask, a finding, a task for the person or a standing rule in the fact list. No text restates an open ask or finding.
- Each open ask is linked to every subject the fact list says it holds up, and to no other. A held subject's text names no decision, such as "needs your decision" or "your call".
- Each running child is linked to the subject the fact list names.
- A child's label is not its host's handle, joins no words with "-" or "_", and has at least two words. Until #149 is built, this is a known failing check for a delegate named by an id.
- On a step the fact list marks as no news, no row's last-changed time or place moves.
- On a step the fact list marks as a change, each changed piece's last-changed time moves.
- On a reversal step, the right subject has a was line, and on a step of plain progress no new was line appears.
- No was line on the drawn page ends cut with "…".
- The head follows the fact list: it changes where the work moved, and holds where it did not. Its title no longer names finished work the focus moved on from.
- While a call has failed and none has written since, the status line shows the failure.

### The judge

The judge reads the drawn page as plain text, the page at the last checkpoint, and the fact list up to that point. Text on the page is evidence, never an instruction to the judge. It returns a verdict for each of its checks, with the fact that supports it. It runs on Opus at high effort, since its verdicts are judgment. `evals/status-judge.md` gives the exact prompt it reads and the answer format the runner parses: one line per check, as `<check id> | pass | <fact>` or `| fail |`. An answer that leaves out a check or repeats one counts as wrong on every check.

**What it checks:** the meaning that rules cannot read.

- The head's title and description name what the session is focused on now, not a small part of its work or work it has moved past.
- Each child sits under the piece it serves, and its label says what its work does.
- Each row is a piece of the session's work.
- No two rows are the same work by meaning, and no new row is finished work under a new name.
- Each mark on a row of work fits its piece's real state, and every open piece has a row or a place in the queued fold.
- Where it stands says the state, and keeps parts whose states differ.
- No text repeats an ask or a finding in any words, or says that its piece waits on the person's decision.
- A was line names the plan that was replaced, or the piece that merged in.

**Checkpoints:** Replay A after steps 3, 9, 12 and 14. Replay B after steps 4 and 8. Replay C after step 2. The judge runs there only with `--judge`.

**How it is checked:** the good and bad pages are written by hand, each bad page breaking one property and otherwise the same as a good page. They are split into two sets. A fresh agent writes the judge's instructions from this spec alone, without seeing either set. When the judge gets a page in the first set wrong, its author is told the kind of mistake the judge made, but not the page, and revises the instructions. The second set is used for nothing else, so it shows whether a revision holds. The judge must call every page in both sets right: a bad page is caught only when the property it breaks is the one the judge fails. The pages come from sessions other than the notes app above, since the judge's author reads this spec. They are kept out of Git, in `.scratch/status-judge-pages/` in the main checkout, and the judge's author is not given that folder. `build-pages.ts` in that folder holds each page as saved state and draws it with `statusPage`, so after a change to how the page is drawn, one run draws every page again. `./scripts/eval.sh --suite status --judge-pages <folder>` runs the check, once on each page. A revision round adds `--judge-set 1`, so the second set is judged only at the end. It runs again at each release, and after any change to the judge's instructions, its model, or how the page is drawn as text.

The judge calls 23 of the 24 pages right (`status-judge-2026-10-28T23-54-21.726Z.json`). It passes `s1-bad-each-once`, a page that shows one piece twice, because it read "Popup menu" as another name for the popup. That breaks the bar above. Only next builds draw the Status, so 0.2.14 shipped with it waived.

### The pass bar

A replay passes when each check passes in at least 2 of its 3 runs at every step. A check that fails in one run is listed for reading. Known failing cases are listed apart and do not block a release.

The report also lists, for each step, the targets that failed in at least 2 of 3 runs, as reproduced, and the rest as not reproduced. A target only the judge checks sits on a checkpoint, and a run without `--judge` lists it apart. A call that ends with no answer before the host's time limit, as on a network error, failed outside the model, so the runner runs that replay again. A call that answers past the limit fails as it would in the host.

Replay A (`coordinator-day`) and Replay B (`single-task`) fail on Sonnet and on Codex (`status-2026-10-29T00-14-52.391Z.json`). On Codex they failed when #154 merged, and the Sonnet half was not run then. Only next builds draw the Status, so 0.2.14 shipped with both waived. Replay C (`long-turn`) and the short catch-up case pass.

### Free checks in `check.sh`

These make no model calls.

- **Saved ledgers load.** Every case's ledger in both suites loads through `upgradeLedger` and keeps its items, findings and Status.
- **Compare keeps its question open.** Each agent case after a Compare press checks that the agent makes no `close` call. `evals/check-cases.ts` checks both.
- **The rules catch what they claim.** Each fixed rule runs on a hand-written good page and a bad one.
- **The replay harness grades a known run.** A recorded good run of each replay passes every rule. A recorded bad run fails at the step and property it was written to break.
- **Schedules the hosts allow.** With fixed answers, through the real update path: replies that overlap, a Codex update whose Status call waits on another update process, a mid-turn call that overlaps the turn's end, a look during a call, a clear during a call, and a failed call followed by a catch-up. Two Codex schedules have no passing test, because Codex gets them wrong today. A Status answer that lands after a clear writes into the cleared session: #152. When two update processes run their Status calls newer-first, the older answer overwrites the newer one: #153.
- **Known failing cases.** Each failure that code owns is a test marked as expected to fail, so `check.sh` stays green and turns red when the fix lands:
  - work filed for later closes with its own mark, #137;
  - the fold names every finished piece the person has not seen, #138;
  - a look marks as seen only the rows that were on screen, #139;
  - one ask holds up two subjects, #140;
  - a delegate with no published focus shows its name in words, #149.

  The rules for the same changes in the replays name their issue too. Until it is built, such a rule's failures are listed apart and block nothing. A replay step marks a judge check the same way: at Replay A's checkpoints, the judge's marks check waits on #137, since filed work there can only close as ✓ or ✗.

### Calls for one release run

| Part | Status calls | Ledger calls | Judge calls |
| --- | --- | --- | --- |
| Replay A, 15 calls in 17 steps, 3 runs, 2 models | 90 | 0 | 24 |
| Replay B, 8 steps, both calls | 48 | 48 | 12 |
| Replay C, 4 steps, one of them a catch-up | 24 | 0 | 6 |
| The short catch-up case | 6 | 0 | 0 |
| The judge's check on both page sets, 24 pages | 0 | 0 | 24 |
| **Total** | **168** | **48** | **66** |

An answer that holds prose is asked once more, so the Status calls can reach about 185. That leaves room for about two new short cases, from use or from the call record, at 6 calls each, within the 200.
