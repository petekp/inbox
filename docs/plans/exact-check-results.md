# Exact check results

Status: B chosen and built on the `run-check` branch. Not yet merged or
tried in a live session. Terms follow `GLOSSARY.md`.

## The problem

The mod reads about half of Claude's check runs as unknown. An unknown result
never shows in Needs you and never contradicts a claim. So a failure read as
unknown goes unseen.

The numbers come from one person's main-loop transcripts over 14 days. Each
Bash command that ran a check was read with the current reading code.

| How the check ran                     | Results | Unknown |
| ------------------------------------- | ------- | ------- |
| Several checks in one command         | 2,421   | 1,912   |
| One check, with an `echo` of `$?`     | 1,617   | 371     |
| One check, piped, no echo             | 1,363   | 669     |
| One check, then another command       | 105     | 30      |
| One check that is the whole command   | 123     | 0       |
| All                                   | 5,629   | 2,982   |

| Why the result is unknown                                      | Results |
| -------------------------------------------------------------- | ------- |
| Output piped, with no exit status printed                      | 1,754   |
| `$?` echoed without the word "exit", as in `echo "tsc=$?"`     | 795     |
| An exit line the mod could not match to its check              | 221     |
| The same check run twice in one command                        | 181     |
| Other                                                          | 31      |

Three things follow:

- The engine reports a check's exit status only when the check is the whole
  command. Claude ran a check that way for about 2% of results.
- The largest cause can't be fixed by reading. When a command pipes a check's
  output and prints no exit status, the status is gone before the mod sees the
  output.
- When a check's output goes to a log file, the mod sees only the exit line.
  The row then says "exit 1", and Fix sends Claude no output. Of the 252
  failing runs that echoed `$?`, 93 had failure lines.

## The options

**A. Keep reading Bash, and close the gaps reading can close.**

- Read `<label>=$?` echoes, for up to 795 of the unknown results.
- Read the file a check's output was redirected to, for failure lines.
- Piped runs with no exit status stay unknown, about 1,750 results.
- The reading code grows.

**B. A check tool, `run_check`.** Claude runs checks through a tool the mod
registers. The mod runs each check through the engine's Bash tool and reads
the exit status from the result. It saves the full output to a log file. It
returns pass or fail, the summary, up to three failure lines and the log's
path. A check command Claude sends to Bash on the main loop is refused, with a
message that names `run_check`.

- A result is unknown only when its run times out.
- Failure lines are always available, since the mod holds the full output.
- About 150 lines of `checks.ts` go: exit-line matching, results read from
  counts and failure words, following `cd` through a compound command, and the
  rules for a check run twice or in several folders. An estimated 80 lines come
  in: the tool, its refusals and the log file.
- Target reading, folder options such as `--prefix`, `checksIn`,
  `check-tracking.ts` and the git snapshots all stay.
- Claude changes how it runs nearly every check. Today about 98% of check
  results come from compound commands. Under B, each of those becomes a
  `run_check` call, or is refused first.

**Decision: B.** A can't fix the largest cause, so at least two in five
results would stay unknown. B makes every main-loop result exact, and the code
shrinks a little. The mod refuses check commands in Bash for everyone who
installs it, since without the refusal both paths stay. Agent rules that tell
Claude to send a check's output to a log file say to use `run_check` where it
exists.

## Plan for B

**What the engine does.** Checked in Claude Code 2.1.294, with a scratch mod
and a trial build of B.

- A mod's `$.tool.call` to Bash goes through the Bash permission check. In an
  interactive session it shows the normal dialog, labeled with the plugin's
  name, and runs only after approval. An allow rule such as `Bash(npm test:*)`
  covers it, as it covers Claude's own call. Without the rule, a `claude -p`
  session, which has no dialog, refuses it.
- A failing command resolves with `isError: true` and text starting with
  `Exit code N`. A passing one resolves with its output.
- The mod's own `tool.call` hook on Bash sees the call, with `next.origin`
  naming the mod. So the refusal lets the mod's own calls through.
- The nested call works inside a model turn. The transcript shows the
  `run_check` call, not the nested Bash call.
- The mod's own `tool.call` hook answers a call to its registered tool in place
  of the engine, so no permission check covers what that hook does itself.
  `$.process.run` has no permission check or sandbox. So the tool runs checks
  through `$.tool.call`, never `$.process.run`.

**What the trial showed.** Six `claude -p` turns on Opus, in a small project
with two failing tests and one test script. There were three tasks, two runs
each: fix the tests; run them and show the last lines; and run them with the
log-file rule added to the prompt. The sessions skipped user settings and
hooks, so the numbers describe that small project, not a real working session.

| Measure                               | Result   |
| ------------------------------------- | -------- |
| Check runs through `run_check`        | 12 of 12 |
| Checks Claude tried in Bash first     | 0        |
| Refusals                              | 2        |
| Turns where Claude could not read a log | 4 of 6 |

- Both refusals came after Claude could not read the log, when it tried
  `npm test 2>&1 | tail -n 15` instead.
- The logs went to `$TMPDIR`, outside the session's folders. Read asked for
  permission, and Bash's `tail`, `cat` and `grep` were blocked.
- `node --test` marks a failure with ✖, which the failure-line reader misses,
  so the results had no failure lines.

Not checked: how auto mode's classifier treats the nested call, and whether a
result reaches the band and Needs you. A `claude -p` session has no pane.

**Design.**

- **Input.** `run_check({ checks })`: one or more commands, each a single check
  with no pipes, redirects or other commands. Taking several keeps Claude's
  habit of running checks together in one call. The mod refuses anything else,
  and says why.
- **Folder.** The shell's current folder, from `$.session.cwd()`. To check
  another folder, Claude runs `cd` in Bash first. Reason: each check reaches the
  permission check exactly as written, so existing allow rules match it.
- **Runs.** One Bash call per check, in order, each with Bash's own timeout. A
  run that times out and moves to the background is unknown.
- **What Claude gets back.** Whether each check passed, its summary, the lines
  that name what failed, and for a failure the output's last 30 lines. Reason:
  in the trial Claude needed the output, and a log it can't read costs a turn.
- **The log.** Saved where Claude can read it without a prompt: in the repo's
  `.git` folder (`.git/inbox/checks/<session>/<command>.log`), which git does not
  track. Each session keeps the latest log of each command. In a linked worktree, the git folder is outside the worktree, so
  the log goes in the temporary folder, as it does outside git. In a `claude -p`
  trial, Claude read logs under `.git` with `grep` and `tail` without a prompt.
- **The refusal.** Main-loop Bash commands in which `checksIn` finds a check.
  Subagents' commands and commands sent to the background pass, and stay
  unrecorded as now. A subagent's `run_check` call is answered "Not run" and
  sent to Bash: the tool runs in the main conversation's shell, so in a trial a
  subagent in its own worktree had the main checkout tested.
- **Text the model reads.** The tool's description and both refusals are new.
  Per `AGENTS.md`, test them with a real model before shipping. The trial's
  wording is the starting point.
- **Tests.** The two `hooks.test.ts` tests that run checks through Bash move to
  `run_check`.

**Steps.**

1. Build B in the worktree: the log location and output tail above, ✖ in the
   failure-line reader, and the tests. Remove the replaced reading code and its
   tests in the same change.
2. Rerun the trial turns. Check the band, Needs you and a permission dialog in
   a live interactive session.
3. Update the README and `GLOSSARY.md`: what a check is, and how it runs.
