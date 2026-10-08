# Row actions and the failing check row

Status: built. Terms follow `GLOSSARY.md`.

## Actions

**Before.**

- `d` means two things: Done on a task, Discuss on a finding and a PR thread.
- Explain (questions, tasks) and Discuss (findings, PR threads) are close.
  Both ask Claude to talk without acting. Explain asks what the item is about
  and what each choice would mean. Discuss asks Claude to talk the finding or
  comment through before changing anything.
- Acting on a row and talking about it share one line at equal weight. On a
  task, `Open settings.json` and `Done` act on it, and `Type a reply` and
  `Explain` talk to Claude. Nothing shows that split.

**Rules.**

- An action is a verb that names what happens: `Open settings.json`, `Fix`,
  `Address`, `Done`.
- One action has one word and one key on every row.
- `a` is the row's main action. Answers and a task's steps take `a`, `b`, `c` in
  order. Fixed actions take their own letter.
- Order follows the work: the main action, then the one that finishes the row,
  then talking about it, then dropping it.
- A muted `·` separates the talking and dropping actions from the rest. They
  take a line of their own when the row is too narrow for both groups, as
  before. Both groups draw at full strength: Claude Code's dim gray falls under
  AA on the selected row (3.4:1 in Dark, 3.8:1 in Light).

**Changes.**

- Discuss moves to `e`, so `d` is free for Done. Each row keeps its own
  message to Claude, and Discuss keeps its name.
- `d` is only Done.
- Type a reply, Explain, Discuss and Dismiss follow the `·`.

**Before and after.**

| Row | Before | After |
|---|---|---|
| Task | `a: Open settings.json  d: Done  t: Type a reply  e: Explain` | `a: Open settings.json  d: Done  · t: Type a reply  e: Explain` |
| Question | `a: Footer  b: Under the tab bar` then `t: Type an answer  e: Explain  x: Dismiss` | the same |
| Finding | `a: Address it  d: Discuss  t: Type a reply  x: Dismiss` | `a: Address it  · t: Type a reply  e: Discuss  x: Dismiss` |
| PR thread | `a: Address  r: Draft reply  d: Discuss  o: Open` | `a: Address  r: Draft reply  o: Open  · e: Discuss` |
| Failing check | `a: Fix  x: Dismiss` | `a: Fix  · x: Dismiss` |

## The failing check row

**Before.**

```
✗ check.sh in run-check · 27m ago, before the last edit

174 pass, 2 fail
▸ Details

a: Fix  x: Dismiss
```

- The summary says how many tests failed, not which. Their names sit behind
  Details. In this example the names were missing altogether: `node --test`
  marks a failure with `✖`, which the mod did not read.
- "before the last edit" means the failure may already be fixed. It sits at the
  end of the title, after the age, where it reads as a detail.
- `▸ Details` sits under the summary with no gap, so it reads as part of the
  result.

**After.**

```
✗ check.sh in run-check · 2 of 176 failed
27m ago, before the last edit

✖ sum adds every value
✖ average divides the sum by the count
$ ./scripts/check.sh

a: Fix  x: Dismiss
```

- The title says what ran and how it ended. Without pass and fail counts, it
  shows the output's summary line, such as `1 failed | 11 passed`, unless the
  summary repeats a failure line. Then it says "failed".
- The line under it says when it ran, and whether files changed since, in the
  needs-you color.
- The body lists up to three failures, one line each, with the file and line
  first when the output names them. A line that repeats an earlier one's
  text, as vitest's FAIL line repeats its × line, adds only its file. The
  command follows, muted.
- The Details fold goes. The mod keeps three failure lines, and the body now
  shows all of them, so the fold would hold only the command.
- The row without selection reads `✗ check.sh in run-check · 2 failed · 27m ago`.
  Without counts, it names the file instead, as in `tsc · register.tsx:2310`.
