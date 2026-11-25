# Codex row states on the PRs tab

Status: built.

The PRs tab's rows and blocks move through the row states in [codex-row-states.md](codex-row-states.md). These rules hold there as well as the ones in that file.

- **A settling PR block's body keeps its place.** When a PR block settles, the body it drew open stays at the top it had, so its buttons do not jump up while the height shrinks over them.
- **A PR row moves as an item row does.** `stepPrs` in `codex/src/tab-pr-steps.ts` steps each PR row on the PRs tab through `stepRow`, the same as `stepLists` does for the other tabs. A row the view no longer lists, such as a cancelled check after Re-run, leaves from its place in its group.
- **A PR group leaves with its last row.** A group's title and rows share one element with its own track. Its title counts only the rows the view lists. When the view lists none, the group leaves on the height spring while its rows collapse inside it, so the title stays drawn until its last row has left.
- **A PR block moves as a row does.** `stepPrs` steps each block through `stepRow` on its own track: `open` while the view lists it open, `settled` or `undoing` once it is dismissed, and `gone` once the view no longer lists it. Dismiss, Clear merged and closed and a ranked PR's Dismiss all go through it, so each block settles on its own. A settling block draws its settled line over the body it last drew open, inert, in the place it had, while its height shrinks to the settled line's. The body stays the same element, so a row still closing, opening or leaving in it finishes its move. That block fades over 200 ms, since the settled block's padding would otherwise still show its top. Undo opens the block again, its height growing from the settled line's. A block the view no longer lists leaves from its place in its last form.
- **A block's padding is inside the element that animates,** so the block's height is its content's height and its end height measures right.
- **The PRs tab's own buttons leave with the last merged or closed PR.** "Clear merged and closed" has its own track. It leaves when the view no longer offers it, drawn inert, and grows in when Undo brings a merged or closed PR back.
- **A PR block's press line grows in.** The line under a block's buttons, such as "✓ Started a re-run of CI", has its own track. It enters when it first shows on a block the last draw drew, and leaves with its last text.
