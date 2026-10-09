# Architecture changes

Goal: move each concept whose rules were spread across `hooks/register.tsx`
into one module with a small interface, and fix the bugs found on the way.
Terms follow `GLOSSARY.md`.

## Done

1. **Renames.** The tab id `needsYou`, `Closed` and `ledger.closed`, and the
   item kinds `question` and `task` follow the glossary. Saved state converts
   on load. The inbox model's protocol keeps the words `decide` and `do`, so
   its prompt is unchanged.
2. **Check tracking.** See [check-tracking.md](check-tracking.md).
3. **Closing items during an update.** The per-turn update knows when its
   prompt was built, and drops a new item that repeats one the person closed
   since then. Every closed record is built by one helper.
4. **Replies Claude was sent back from.** When a Stop hook sends Claude back,
   the turn keeps that reply, and the per-turn update reads it with the final
   one. One function resets a turn's variables, for both the turn's end and
   `/clear`.
5. **The PR watcher.** A Dismiss or a linked PR that lands during a fetch
   stays. A failed `gh pr view` for the branch keeps the branch's PR, with the
   error, instead of dropping it.
6. **Needs you counts.** The band's "waiting on you" and the pane's Needs you
   tab read one count, which includes failing checks.

## Left for later

- **The working-tree change tracker.** Moving the git snapshot code out of
  `register.tsx` would make staleness testable end to end. It fixes no known
  bug, and check tracking already takes the changed paths as a value.
- **Ledger freshness.** The catch-up counters live in five places. They work,
  and a change there risks the reload and catch-up behavior for little gain.
- **A view model for the pane.** Rows, counts and the cursor are computed
  inside the pane's 950-line drawing function. Moving them into a pure
  function would make the cursor testable, but it is a large change to the
  drawing code with no known bug behind it.
- **The turn recorder.** Eight module variables still hold one turn's
  exchange. Step 4 fixed the bug in it and gave it one reset.

## Two hosts: Claude Code and Codex

The inbox now runs in two hosts. The Claude Code mod is `hooks/register.tsx`.
The Codex plugin is `codex/src`. Both use the plain modules in `hooks/`:
`ledger.ts`, `checks.ts`, `check-tracking.ts`, `git.ts`, `prs.ts` and
`demo.ts`. Those modules, and the Codex plugin's split into saved state,
hooks and a server, are sound and should stay as they are.

What is weak is everything between the plain modules and each host's
drawing. Each host keeps its own copy of the session logic, the press
messages, the working-tree snapshot code and the rules for drawing a row.
The copies match today, apart from how they reach git or the engine. Every
change to one now needs the same change by hand in the other, and the PRs tab
would add the largest copy yet.

In order:

1. **Fix two live risks.** Done.
   - The Codex plugin converts a saved ledger with `upgradeLedger` when it
     loads a session, as the mod does.
   - `codex/src/texts.ts` still changes the mod's model texts with
     `.replace()` on exact sentences. A test now fails when the Codex inbox
     line names the /inbox pane, so a reworded sentence no longer passes
     silently. Item 2 removes the patches.
2. **Name the host instead of patching its words.** Shared texts name
   Claude, the band and the /inbox pane, as in "closed by Claude" and "sent
   to Claude". A small host value, with the agent's name and the surface's
   name, passed to the text builders, replaces the patches. Requirement:
   both hosts read these texts, and patching fails silently. Rejected: more
   `.replace()` calls. Claude's texts must come out the same, character for
   character, on sample inputs, so the change needs no new measurement.
3. **One session engine.** Move the session logic that the Codex plugin
   already holds as plain functions on state into `hooks/`: prompts and
   presses noted, findings recorded, items closed, presses applied as data
   with their effects, the press messages, and the working-tree snapshot code
   with git passed in. `register.tsx` then calls the same functions through
   its engine. This covers the turn recorder and the working-tree tracker
   from "Left for later". Requirement: two hosts run the same rules.
   Rejected: keeping the copies in step by hand. `LastAction` becomes one type, and
   any change to a saved shape converts old state and needs approval.
4. **One view model, two renderers.** A plain function turns the state into
   tabs, groups and rows: each row's mark, tone, title, body, fold state and
   keys, with each key's letter, label, done text and press. The Ink pane
   and the Preact tab draw it. Widths, clipping and wrapping stay in each
   renderer. "Left for later" deferred this because no bug needed it. The
   reason now is a second renderer: the tab copies `CHOICE_KEYS`, the finding
   badges, the "again" rule, the empty-group texts and the lapsed-item rule,
   and the PRs tab would copy the PR rows. It also makes the cursor
   testable.
5. **Make the committed Codex bundles reproducible.** They are built from
   the working tree, so a commit can carry another session's unfinished
   shared code, as one did with `hooks/demo.ts`. Either build from `HEAD` in
   a worktree under `~/Code/worktrees/inbox/`, with `--check` comparing
   against the same sources, or build them in CI. A CI change needs
   approval.

After items 3 and 4, `register.tsx` keeps the engine wiring, the PR fetch
and the Ink drawing. That also cuts how often parallel sessions edit the same
file.

A small committed script that runs sample exchanges through both models
would make the required measurement of model text a single command instead
of a throwaway harness each time.

**How to do it.** Do the `register.tsx` work in a worktree at
`~/Code/worktrees/inbox/<name>`, after the other session's PR work lands,
one step per commit with `./scripts/check.sh` green, since sessions that
load this checkout would run half-done work. Shared code stays in `hooks/`, which both hosts already
import. Whether the mod's loader can import modules from other folders is
not verified.
