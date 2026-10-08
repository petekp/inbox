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
