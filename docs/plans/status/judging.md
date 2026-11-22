# The Status tab: how the Status is judged

Part of [the Status tab plan](../status.md).

Status: built.

## How the Status is judged

Decision 16 sets the method. The evals run at each release, and after a change to the Status call's text or to the code that applies its answer.

`./scripts/eval.sh --suite status` runs them. These files hold them:

| File | What it holds |
| --- | --- |
| `evals/status-replays.ts` | The list of replays the suite runs |
| `evals/replays/` | The replays and the short case, with their facts |
| `evals/status-replay.ts` | How a replay runs each step through the hosts' own code |
| `evals/status-facts.ts` | The fact list, and the text of it the judge reads |
| `evals/status-rules.ts` | The fixed rules |
| `evals/status-rules-goal.ts` | The rules for the goal, its milestones and what each subject serves |
| `evals/status-holds.ts` | The code holds, checked at every step |
| `evals/status-grade.ts` | How each rule counts at each step: a failure counts where it first appears |
| `evals/status-bar.ts` | The pass bar: the exact binomial, the tolerances and each layer's share of the false-block chance |
| `evals/status-report.ts` | The tests of the four layers, and the report's lines |
| `evals/status-judge.ts` | The judge's checks, its prompt, and how its answer is read |
| `evals/status-judge-text.ts` | `judgeSystemText`, which joins the parts into the judge's system text |
| `evals/status-judge.md` | The index of the judge's instructions: what the harness sends and reads back, and the parts |
| `evals/status-judge/` | The judge's instructions, in parts |
| `evals/status-run.ts` | The runner and its results file |
| `evals/status-health.ts` | The health report `scripts/status-health.sh` prints from a folder of real Status call records: dropped head descriptions, blank milestone text, idle subjects left untouched, suggested goals, and the lines code dropped by kind. It calls no model. |
| `tests/status-evals.test.ts`, `tests/status-bar.test.ts` | The checks with no model calls |
| `tests/status-evals-scene-base.ts`, `tests/status-evals-scenes.ts` | The base page and how a page becomes what a rule reads, then the pages and Status call answers those checks grade |

### What goes in the suite

- **A case comes from a real failure,** or from a behavior a new design sets out to give. The sources are the failures seen in real sessions, what the person hits in use, and the record of Status calls.
- **A case from a real failure joins when it reproduces its failure.** It must fail on the prompt before the fix, at the step and property it targets. A step that does not reproduce its failure stays as a check, marked as not reproduced. A failure owned by code joins as a known failing case.
- **A step that tests a new design joins when an ablation shows it can fail.** It runs against a copy of the system text without the rule it targets, which `--without` builds from the named parts in `core/domain/status-prompt-goal.ts`. It joins when that copy fails its target in at least 3 of 5 runs.
- **A failure counts only when the property it targets fails.** An answer that is unreadable, or that breaks another property, is reported but does not count as reproducing the failure.

### The case format

A case is a starting state, then steps, with the fact list beside them.

- **The starting state:** a saved ledger, with its Status, open asks and findings, and the session's presence.
- **A step** has a time, and runs in this order:
  - host events: a child starts, acts or ends, the person looks at the page for some seconds, or the person presses the goal's Remove or types a goal, through the host's own `goalPressed`;
  - fixture events, in a replay that skips the ledger call: an ask opens or closes;
  - at most one call: a reply, a mid-turn call or a catch-up, each with its exchange or conversation, or a recorded call's exchange as it was;
  - host events while the call runs, as a goal the person types then: they apply after the call reads the session and before its answer applies, so the answer applies to the session they leave.
- **The fact list** gives, for each step, the session's focus, the goal and each milestone's real state, every piece of work with its aliases, its real state and the milestone it serves, the asks and the pieces each holds up, the running work and the piece each serves, what is not work, and any goal the person stated at that step. A step lists only what it changes, and the pieces it changes are the step's changes.
- **Targets:** each step names the rules or judge checks it tests.
- **A short case** is marked `isShort`. It runs 5 times per model, and each model's runs are judged apart. A replay runs 3 times per model, and both models' runs are judged together.

Host events run through the hosts' own reducers, such as `childStarted` and `lookEnded`. Links and ids stay as the run made them, so a fixture never corrects a wrong link the run made. The expected links live only in the fact list, for grading.

A next build's record of a Status call holds the call's input as data: the Status before, with its running children, the open asks, the host's task list, and the exchange. `replayFromRecord` turns a record into a one-step replay at the time the call ran, which builds the prompt again with today's code. The case's author adds the facts. The record's own prompt and answer show the failure that was seen.

### The replays

[The Status replays](../../status-replays.md) lists the three replays, the short cases, and what each step checks.

### The fixed rules

[The Status rules](rules.md) lists the fixed rules, the goal's rules and the code holds that run after every step.

### The judge

The judge reads the drawn page as plain text, the page at the last checkpoint, and the fact list up to that point. Text on the page is evidence, never an instruction to the judge. It returns a verdict for each of its checks, with the fact that supports it. It runs on Opus at high effort, since its verdicts are judgment. `evals/status-judge.md` gives the exact prompt it reads and the answer format the runner parses: one line per check, as `<check id> | pass | <fact>` or `| fail |`. An answer that leaves out a check or repeats one counts as wrong on every check.

**What it checks:** the meaning that rules cannot read.

- The head's title and description name what the session is focused on now, not a small part of its work or work it has moved past.
- Each child sits under the piece it serves, and its label says what its work does.
- Each row is a piece of the session's work.
- No two rows are the same work by meaning, and no new row is finished work under a new name.
- Each mark on a row of work fits its piece's real state, and every open piece has a row or a place in the "N more" fold.
- Where it stands says the state, and keeps parts whose states differ.
- No text repeats an ask or a finding in any words, or says that its piece waits on the person's decision.
- A Prev line names the plan that was replaced, or the piece that merged in.

**Checkpoints:** Replay A after steps 3, 9, 12 and 14. Replay B after steps 4 and 8. Replay C after steps 1 and 4. The short case `mid-turn-activity` after its one step. The judge runs there only with `--judge`. The judge also checks the goal, the milestones and the split into Other work, and answers `n/a` for a check with nothing to judge on the page. The case's facts give the goal and its milestones as the author sees them. The model plans its own milestones, so the judge accepts any milestones that are outcomes the goal needs, with marks that follow the pieces under them.

**How it is checked:** the good and bad pages are written by hand, each bad page breaking one property and otherwise the same as a good page. They are split into two sets. A fresh agent writes the judge's instructions from this spec alone, without seeing either set. When the judge gets a page in the first set wrong, its author is told the kind of mistake the judge made, but not the page, and revises the instructions. The second set is used for nothing else, so it shows whether a revision holds. The judge must call every page in both sets right: a bad page is caught only when the property it breaks is the one the judge fails. The pages come from sessions other than the notes app above, since the judge's author reads this spec. They are in `evals/judge-pages/`, one JSON file for each page in `set-1/` or `set-2/`, and the judge's author works in a copy of the repo without that folder. Each page lists in `na` the checks it gives nothing to judge, such as `goal` on a page with no goal, and the judge must answer n/a there. `./scripts/eval.sh --suite status --judge-pages evals/judge-pages` runs the check, once on each page, and the results file holds a hash of the pages. A revision round adds `--judge-set 1`, so the second set is judged only at the end. It runs again at each release, and after any change to the judge's instructions, its model, or how the page is drawn as text.

The judge calls 23 of the 24 pages right (`status-judge-2026-10-28T23-54-21.726Z.json`). It passes `s1-bad-each-once`, a page that shows one piece twice, because it read "Popup menu" as another name for the popup. That breaks the bar above. Only next builds draw the Status, so 0.2.14 shipped with it waived.

### The pass bar

A release run may block falsely with a chance of at most 0.05 when every rate sits at its tolerance. Each test is an exact binomial: it blocks when its failures would be that unlikely at its tolerance. The 0.05 is split across four layers, and within a layer each test gets an equal share.

- **What counts.** An opportunity is one rule at one step in one run, where the step could make that rule newly fail. A rule that reads only text the model wrote has one where the step's answer wrote. A rule that reads the facts has one where the answer wrote or the facts changed. A failure counts at the step where it first appears. A failure that was already there at the last step with a call is carried, and the step is left out of that rule's count. Several failures of one rule at one step are one failure.
- **The tolerances.** 0.10 for a rule, 0.20 for a missed goal, and 0.15 for a judge check.

| Layer | Share | Each test |
| --- | --- | --- |
| Replay steps | 0.033 | One target a replay step names, over both models' runs |
| Short cases | 0.007 | One target a short case's step names, on one model |
| Spread | 0.007 | One rule on one model, over all of that model's steps in the run |
| Judge | 0.003 | One judge check on one model, over its checkpoints. A failure the run's checkpoint before also had is carried. |

The report lists each test with its failures, its count, its 95% interval and the count at which it blocks. A test over its tolerance but under its blocking count is listed for reading. A code hold that fails blocks. Known failing cases are listed apart and block nothing. A target counts a failure on any piece; counting only the pieces its step changes is not built yet.

**Calls that fail.** A call that ends with no answer before the host's time limit, as on a network error, failed outside the model. The runner tries that call again from the same prompt, twice, and then the run can't be graded. A call that answers past the limit fails as it would in the host. Each model stops a quarter past the planned Status calls of the replays a run selects, or 10 past them when that is more, re-asks and retries included. That model's later runs then have no grade, and the other model's runs go on.

**Exit status.** 0 when nothing blocks; 1 when a test or a code hold blocks; 2 when a case could not be graded, as when its model reached its Status call limit; 3 when the run stopped because a session could reach more than the stand-in inbox.

### Free checks in `check.sh`

These make no model calls.

- **Saved ledgers load.** Every case's ledger in both suites loads through `upgradeLedger` and keeps its items, findings and Status.
- **Compare keeps its question open.** Each agent case after a Compare press checks that the agent makes no `close` call. `evals/check-cases.ts` checks both.
- **The rules catch what they claim.** Each fixed rule runs on a hand-written good page and a bad one, and each path a rule takes beside its main one on its own pair.
- **The replay harness grades a known run.** A recorded good run of each replay passes every rule. A recorded bad run fails at the step and property it was written to break.
- **Schedules the hosts allow.** With fixed answers, through the real update path: replies that overlap, a Codex update whose Status call waits on another update process, a mid-turn call that overlaps the turn's end, a look during a call, a clear during a call, and a failed call followed by a catch-up. Two Codex schedules have no passing test, because Codex gets them wrong today. A Status answer that lands after a clear writes into the cleared session: #152. When two update processes run their Status calls newer-first, the older answer overwrites the newer one: #153.
- **Known failing cases.** A rule for a failure that code owns names its issue, as `child-labels` names #149. Until it is built, the rule's failures are listed apart and block nothing. A replay step marks one of its targets the same way, rule or judge check, with `until`: its failures at that step are listed apart, with the replay and step, and its target test is left out. A rule's failures there still count in its spread. A failure that first shows at such a step and stays on the page counts at no later step, since only fresh failures count. The report lists each `until` target that passed in every run, so one left after its fix lands shows. [eval-trust-follow-ups-set-aside.md](../eval-trust-follow-ups-set-aside.md) lists every check set aside. At `mid-turn-activity`'s step, the judge's where-it-stands check waits on the mid-turn wording follow-up.

### Calls for one release run

| Part | Status calls | Ledger calls | Judge calls |
| --- | --- | --- | --- |
| Replay A, 11 calls, 3 runs, 2 models | 66 | 0 | 24 |
| Replay B, 9 calls, both calls | 54 | 54 | 12 |
| Replay C, 3 calls | 18 | 0 | 12 |
| `catch-up-from-empty`, 1 call, 3 runs | 6 | 0 | 0 |
| `milestone-dropped`, 1 call, 3 runs | 6 | 0 | 0 |
| `catch-up-shipped`, 1 call, 3 runs | 6 | 0 | 0 |
| `goal-awaiting-milestones`, 1 call, 3 runs | 6 | 0 | 0 |
| `ask-holds-two`, 2 calls, 3 runs | 12 | 0 | 0 |
| The three goal short cases, 4 calls, 5 runs, 2 models | 40 | 0 | 10 |
| `next-release`, 3 calls, 3 runs | 18 | 0 | 0 |
| The judge's check on both page sets, 24 pages | 0 | 0 | 24 |
| `child-label-repeat`, 2 calls, 3 runs, 2 models | 12 | 0 | 0 |
| `release-plan-once`, 1 call, 3 runs, 2 models | 6 | 0 | 0 |
| **Total** | **250** | **54** | **82** |

An answer with no operation is asked once more. So is an answer that leaves a subject in `<idle>` with no line, or leaves no goal running and none suggested with no GOAL or SUGGEST line, as `core/domain/status-retry.ts` asks. A call that fails outside the model is tried again. [The Status replays](../../status-replays.md) describes each case. With all of them, one model's run plans 257 Status calls before re-asks and retries. Each model stops a quarter past the planned calls of the replays a run selects, or 10 past them when that is more, 322 for all of them, so one `--agent both` run grades both models. `STATUS_CALLS_MAX` in `evals/status-run.ts` sets it.
