# Checks on the Codex row states

These are the checks run on the row states that [codex-row-states.md](codex-row-states.md) describes.

- Tests in `codex/tests/press-row-states.spec.ts`: every state reaches every target, a row drawing its panel never drops it except through `closing`, `settling` or `leaving`, a row turned around mid-move, and reduced motion. On the PRs tab of the real tab: a PR row closing with its panel, rows leaving from their places with their group and title, the press line growing in, a dismissed block settling under its settled line and growing back on Undo, Clear merged and closed settling two blocks while its buttons leave, a block leaving once the view drops it, and reduced motion.
- In the harness, each PR row's, group's and press line's height and position, frame by frame, in both themes and with reduced motion: switching rows, Fix, and Re-run with the cancelled rows leaving.
- In the harness, each PR block's and the tab's buttons' height and position, frame by frame, in both themes and with reduced motion: Dismiss and Undo, Clear merged and closed across two PRs and Undo on one, and Dismiss and Undo on a ranked PR.
- In the harness, each row's height, opacity and panel, frame by frame, on both tabs: Dismiss with a slow reply, an answer with an instant reply, Undo, a failing Undo, a settled row leaving, a row arriving, a row arriving open and closed while it grows in, switching rows, three quick presses of j and a press back mid-move, reopening a row mid-close, and the Closed fold.
- `./scripts/check.sh`.
