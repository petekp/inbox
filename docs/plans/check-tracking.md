# Check tracking

Superseded: session checks, `run_check`, the Bash refusal and the claim send-back were removed from the mod and the Codex plugin.

Status: done. `hooks/check-tracking.ts` owns the check results, how they
change, and what the band, the pane and the Stop hook read from them. Terms
follow `GLOSSARY.md`.

## The module

**What it holds.** The value in the `CHECKS` atom: the results, and the
session's repos. `register.tsx` keeps the atom and calls the module inside
`update($, CHECKS, …)`.

**What stays out.**

- Reading commands and output stays in `checks.ts`. That covers which checks a
  command ran, how each ended, its failure lines, its target, and which
  sentences of a reply claim success.
- I/O stays in `register.tsx`: git snapshots, `repoOf`, which folders still
  exist, and the clock. Their answers are passed in as values.
- Drawing stays in `register.tsx`. The module returns results, not text or
  rows.
- The engine's `stop_hook_active` still stops the Stop hook from sending
  Claude back twice in one stop.

**Interface.** Every function is pure. `root` is the session's folder. Results
run there are saved with no folder, so the stale rule, the temporary-copy rule
and the outside-git rule need it.

```ts
// Changes
recorded(checks, runs, at, root) // a Bash command's check runs ended
changed(checks, repo, paths, root) // files changed in a repo; null paths when git could not tell
addRepo(checks, repo) // the session started in this repo, or Claude or a subagent edited a file in it
pruned(checks, goneFolders) // these folders no longer exist
turnEnded(checks) // Claude's turn ended
dismissed(checks, check)
fixSent(checks, check, at)
claimAgainst(checks, reply, root) // returns { checks, claim }: the first contradicted claim, now marked sent back
upgradeChecks(saved, root, home) // converts state saved by older versions

// Views
needsYou(checks, root) // returns { rows, count }; the count leaves out results with a fix sent
bandLines(checks, root) // returns { failing, summary }
checkKey(check) // the one identity rule: name, folder and target
```

**One identity rule.** `checkKey` is the only place that decides whether two
results belong to the same check. Recording, Dismiss, Fix and the row id all
use it. Fix also matches the run's time, so a run recorded in the meantime
keeps its own state.

**One replacement rule.** `recorded` removes every result that its runs cover.
So every failure still recorded is one that no later run cleared, and the claim
rule reads only current results.

## The rules

| Rule                            | Now                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which results count             | Results in the session's repos count toward Needs you, the band and claims. The card gets all of them.                                                                                   |
| Session's repos                 | The repo the session started in, and each repo where Claude or a subagent wrote a file with Edit, Write or NotebookEdit.                                                                 |
| Results outside git             | Count when they ran in the session's folder or below it.                                                                                                                                 |
| Band lines                      | A red line for each failing result not dismissed, and one dim line for the rest. No result shows twice.                                                                                  |
| Dismiss                         | Hides the pane row and the band line until the check runs again.                                                                                                                         |
| Stale                           | After a change to a file in the check's folder. A change to Markdown alone leaves tests, types and builds current.                                                                       |
| Send-back                       | Once per result, for stale and failing results.                                                                                                                                          |
| Check identity                  | Name, folder and target.                                                                                                                                                                 |
| What replaces a result          | A pass or fail of the same or a broader target. A passing script that runs all the checks, such as `check.sh`, replaces every result in its folder. |
| Target                          | The files, folders and test-name filters a run named. Flags that only change output or speed don't narrow it. Any other argument does. `lint:css` and `lint` are different checks. Rows show the target. |
| Results that contradict a claim | Every failure still recorded, latest first, then the latest result of that kind if it is stale.                                                                                          |
| A check phrase in quotes        | Not a claim.                                                                                                                                                                             |
| A check run in a temporary copy | Not recorded.                                                                                                                                                                            |

## Tests

`tests/check-tracking.test.ts` tests each rule through the interface above.
`tests/checks.test.ts` tests reading: commands, targets, output and claims.
`tests/hooks.test.ts` drives the whole mod and checks the wiring.

Reading more command and output formats is separate work.
