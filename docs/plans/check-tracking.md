# Check tracking

Goal: one module, `hooks/check-tracking.ts`, owns the check results, how they
change, and what the band, the pane and the Stop hook read from them. Then the
check rules change as listed below. Terms follow `GLOSSARY.md`.

Today these rules are spread over 13 places. `hooks/checks.ts` has
`recordCheck`, `markStale` and `contradictedClaim`. `hooks/register.tsx`
changes or filters results in ten more:

- the Dismiss and Fix handlers
- the pruning of gone folders
- `recordChecks`
- the turn end
- the Stop hook
- the band
- the Needs you list and its count
- the saved-state conversion

A rule change means finding each of them. A rule can be tested only by driving
the whole mod.

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
addRepo(checks, repo) // the session started in this repo, or Claude edited a file in it
pruned(checks, goneFolders) // these folders no longer exist
turnEnded(checks) // Claude's turn ended
dismissed(checks, check)
fixSent(checks, check, at)
sentBack(checks, reply, root) // returns { checks, claim }: the first contradicted claim, now marked
upgradeChecks(saved) // converts state saved by older versions

// Views
needsYou(checks, root) // returns { rows, count }; the count leaves out results with a fix sent
bandLines(checks, root) // returns { failing, others }
sameCheck(a, b) // whether two results are the same check
```

**One identity rule.** `sameCheck` is the only place that decides whether two
results belong to the same check: same name, folder and target. Recording,
Dismiss, Fix and the row id all use it. Fix also matches the run's time, so a
run recorded in the meantime keeps its own state.

**One replacement rule.** `recorded` removes every result that its runs cover.
So every failure still recorded is one that no later run cleared, and the claim
rule reads only current results.

**Callers after the move.**

| Today in `register.tsx`                    | Calls                                            |
| ------------------------------------------ | ------------------------------------------------ |
| `recordChecks`                             | `recorded`                                       |
| `refreshTree`                              | `changed`                                        |
| `dropGoneFolders`                          | `pruned`                                         |
| `dismissCheck`, `sendFix`                  | `dismissed`, `fixSent`                           |
| `turn.complete`                            | `turnEnded`                                      |
| the Stop hook                              | `sentBack`                                       |
| the band                                   | `bandLines`                                      |
| the pane's Needs you tab and count         | `needsYou`                                       |
| `upgradeState`                             | `upgradeChecks`                                  |
| `session.start`, Edit, Write, NotebookEdit | `addRepo`                                        |
| the per-turn update                        | none: the card gets every result, as `checkLine` |

## Rules it changes

| Rule                                 | Today                                                    | After                                                                                                               |
| ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Which results count                  | All                                                      | Results in the session's repos count toward Needs you, the band and claims. The card gets all of them.              |
| Session's repos                      | None                                                     | The repo the session started in, and each repo where Claude wrote a file with Edit, Write or NotebookEdit.          |
| Results outside git                  | Count                                                    | Count when they ran in the session's folder or below it. |
| Band lines                           | Each failure on a red line, then every result on one dim line | A red line for each failing result not dismissed, and one dim line for the rest. No result shows twice.        |
| Dismiss                              | Hides the pane row                                       | Hides the pane row and the band line until the check runs again.                                                    |
| Stale                                | After any change in the repo                             | After a change to a file in the check's folder. A change to Markdown alone still leaves tests, types and builds current. |
| Send-back                            | Every turn                                               | Once per result, for stale and failing results.                                                                     |
| Check identity                       | Name and folder                                          | Name, folder and target.                                                                                            |
| What replaces a result               | Any later run with the same name                         | A pass or fail of the same or a broader target. An unknown never replaces a pass or fail.                           |
| Target                               | None                                                     | The files, folders and test-name filters a run named. An argument the inbox can't read narrows it. `lint:css` and `lint` are different checks. Rows show the target. |
| Results that contradict a claim      | The latest result of that kind                           | Any failure still recorded, and the latest result of that kind if it is stale.                                      |
| A check phrase in quotes             | A claim                                                  | Not a claim.                                                                                                        |

These stay as they are: a passing script that runs all the checks, such as
`check.sh`, replaces every result in its folder. A check run in a temporary
copy of the repo is not recorded.

## Work order

Each step keeps `./scripts/check.sh` green and is its own commit, made after
Pete approves it.

1. **Renames.** The tab id `waiting`, `decided`, and the `Item.kind` values
   `decide` and `do` take the glossary's names. Saved state is converted.
2. **Move.** Create `check-tracking.ts` with the interface above, except
   `addRepo` and `sentBack`, keeping today's behavior. `recordCheck`,
   `markStale` and `contradictedClaim` move there with their signatures, and
   the new functions call them. Tests change only their import paths.
3. **Rules,** one commit each. Each adds a table test in
   `tests/check-tracking.test.ts` that goes through the interface.
   1. Session's repos: `addRepo`, the `repos` field, and the filters.
   2. Band lines.
   3. Dismiss hides the band line. This flips the assertion at
      `tests/hooks.test.ts:644`.
   4. Stale inside the folder, and send back once: `sentBack` and an
      `isSentBack` field on each result.
   5. Targets: reading them in `checks.ts`, `sameCheck`, and coverage in
      `recorded`. Saved results get their target from their saved `command`.
   6. Claims read every failure still recorded.
   7. A check phrase in quotes is not a claim.
4. **Test rewrite.** The `recordCheck` and `markStale` tests become table tests
   at the new interface, and the two functions stop being exported.

Each commit that adds a saved field also adds its conversion to
`upgradeChecks`. A rule commit may change a `hooks.test.ts` setup that relied
on the old rule, and its message says which.

Reading more command and output formats is separate work.
