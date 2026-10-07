# Roadmap

Planned work. None of it is built yet.

- **Claude writes its own items.** One tool lets Claude record its
  questions, its tasks and its calls, and close them. It replaces `record_finding`.
  The per-turn Sonnet call stops creating items and writes only the card.
  At the end of a turn, a reply that asks you something no item records is
  sent back once, so Claude records it. The tool must stay loaded up front
  after `/resume`.
- **Claude's calls replace Findings.** A finding outside the task is a call
  Claude made: to leave it for now. The Findings tab becomes a list of calls
  you might make differently, shown as "question → choice, not
  alternative". Pressing the alternative switches it, and `e` explains it.
  A call leaves the list half a day after Claude made it.
- **Held actions.** Acts that cannot be undone, or that speak for you, wait
  in the Waiting tab with the exact command or text: force-pushes,
  discarding local work, deletions, and messages to people. One press runs
  it, and Claude keeps working meanwhile. A held discard runs only while the
  files are unchanged. Pushes, releases and deploys stay under Claude Code's
  permission rules.
- **Posting an approved PR reply with one press.** An approved draft
  becomes a held action.
- **Every open session in one view.** The inbox shows what each open
  session needs from you, not only the current one. The store already keeps
  each session's ledger under `s:<session id>`.
- **More PR actions.** Merge from the PRs tab, flag a description that no
  longer matches the diff, and buttons for a self-review and screenshots.
- **A choice of model.** The per-turn call always uses Sonnet. A
  `userConfig` option could make it switchable.
