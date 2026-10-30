# Looks

Status: current. Read this before you change the UI or a business rule.

The inbox has four looks: `terminal`, `desktop`, `codex` and `omp`. A look is one way the inbox is drawn, and `GLOSSARY.md` defines it with host, shared module, adapter and difference on purpose. The rule is that shared modules decide and adapters draw. If a rule decides what a row says, which action leads, when a tab counts as empty or what text appears, it lives in a shared module. An adapter decides only how its look draws that. The plan for finishing this split is `docs/plans/three-looks.md`.

## Files

Shared modules are in `hooks/`. Every host consumes them, directly or through a build. They import only shared modules and shared types. `scripts/check-structure.mjs` checks those boundaries, including type imports. Codex and omp type checking need no generated Claude engine types.

Every source file in `hooks/`, `codex/src` and `omp/src` needs a row in one of the four parts below. Put a file split out of another next to that file's row. The structure check reads the rows in every `docs/looks/files-*.md`.

- [Shared modules](looks/files-shared.md)
- [The mod](looks/files-mod.md)
- [Codex](looks/files-codex.md)
- [omp](looks/files-omp.md)

## Who owns each rule

Change a rule in its owner. Do not change it in a reader.

- [Tabs, lists, banners and the footer](looks/owners-tabs-and-lists.md)
- [Rows, presses and feedback](looks/owners-rows-and-feedback.md)
- [The Status page](looks/owners-status.md)
- [The ledger, sessions and model-read texts](looks/owners-ledger-and-sessions.md)
- [PRs](looks/owners-prs.md)
- [Rules still written in two places](looks/owners-written-twice.md)

## Differences on purpose

A difference is on purpose when a look cannot do something or the product decided it. Anything not listed here is drift.

A row that covers a host difference names its feature id in backticks in the first column. `hooks/clients.ts` is the parity record: it classifies every feature as `full`, `different` or `unsupported` for each host (`claude-code` for the terminal and desktop looks, `codex`, `omp`). `scripts/check-structure.mjs` fails when a feature that is not `full` has no row in the table that covers its host, and when a row names an id the record lacks. The main table covers `claude-code` and `codex`. The omp table covers `omp`.

The parts below hold the main table, split by subject. The omp table is in the parts under omp, whose file names start with `differences-omp`. The structure check tells the two tables apart by that name.

- [Keys, clicks and replies](looks/differences-input.md)
- [Rows, tabs, banners and motion](looks/differences-drawing.md)
- [The Status page and marks](looks/differences-status-and-marks.md)
- [How each host runs](looks/differences-hosts.md)
- [The agent and its turns](looks/differences-agent-and-turns.md)

### omp

omp draws the terminal's text and handles, with its own keys and a panel it owns. This table compares omp with the terminal look. The other columns of the table above do not apply to it.

- [The panel and its keys](looks/differences-omp-panel.md)
- [How omp runs](looks/differences-omp-host.md)

## Adding a host

[Adding a host](adding-a-host.md) says what a new host supplies, which shared functions it calls on each event, and where to register it.

## After you change X, check Y

- [After you change X, check Y](looks/after-a-change.md)

## Checks

[Checks](checks.md) says what `./scripts/check.sh` and the structure check cover, and what they leave to live checks.
