# Looks

Status: current. Read this before you change the UI or a business rule.

The inbox has five looks: `terminal`, `desktop`, `codex`, `omp` and `herdr`. A look is one way the inbox is drawn, and `GLOSSARY.md` defines it with host, shared module, adapter and difference on purpose. The rule is that shared modules decide and adapters draw. If a rule decides what a row says, which action leads, when a tab counts as empty or what text appears, it lives in a shared module. An adapter decides only how its look draws that. The plan for finishing this split is `docs/plans/three-looks.md`.

## Files

Shared modules are in `hooks/`. Every host consumes them, directly or through a build. They import only shared modules and shared types. `scripts/check-structure.mjs` checks those boundaries, including type imports. Codex and omp type checking need no generated Claude engine types.

Every source file in `hooks/`, `codex/src`, `omp/src` and `herdr/src` needs a row in one of the parts below. Put a file split out of another next to that file's row. The structure check reads the rows in every `docs/looks/files-*.md`.

- [Shared modules](looks/files-shared.md)
- [Shared modules for the Status](looks/files-shared-status.md)
- [Shared modules for Herdr](looks/files-shared-herdr.md)
- [The shared UI controller](looks/files-shared-controller.md)
- [The mod](looks/files-mod.md)
- [Codex](looks/files-codex.md)
- [omp](looks/files-omp.md)
- [The Herdr look](looks/files-herdr.md)

## Who owns each rule

Change a rule in its owner. Do not change it in a reader.

- [Tabs, lists, banners and the footer](looks/owners-tabs-and-lists.md)
- [Rows, presses and feedback](looks/owners-rows-and-feedback.md)
- [Rows: folds, keys and marks](looks/owners-rows-folds-and-keys.md)
- [Presses: their messages, status and reducer](looks/owners-presses.md)
- [The Status page](looks/owners-status.md)
- [The Status goal and Other work](looks/owners-status-goal.md)
- [The Status call](looks/owners-status-call.md)
- [The ledger, sessions and model-read texts](looks/owners-ledger-and-sessions.md)
- [PRs](looks/owners-prs.md)
- [Rules still written in two places](looks/owners-written-twice.md)

## Differences on purpose

A difference is on purpose when a look cannot do something or the product decided it. Anything not listed here is drift.

A row that covers a host difference names its feature id in backticks in the first column. `hooks/clients.ts` is the parity record. `CLIENTS` classifies every feature as `full`, `different` or `unsupported` for each host (`claude-code` for the terminal and desktop looks, `codex`, `omp`). `PUBLISHED_LOOKS` does the same for each look that draws a session a host publishes, today only `herdr`. A published look's entry can also be `host`: the publishing host does all of the feature, so the host's own entry says what the person gets. `scripts/check-structure.mjs` fails when a feature that is not `full` or `host` has no row in the table that covers its host or look, and when a row names an id the record lacks. The main table covers `claude-code` and `codex`. The omp table covers `omp`. Each published look has its own table, in the parts named `differences-<look id>`.

A published look gets its own list, apart from `CLIENTS`, because a `ClientId` names the host that publishes a session: the Herdr publish code, the Status call's hosts and the press messages all read it that way. Exact's web and iOS clients will join `PUBLISHED_LOOKS` as `exact-web` and `exact-ios`, each with its own `hooks/clients-<id>.ts` and `differences-<id>` parts.

Each look's contract test also fails when the look leaves out a field of the shared row or Status page. `tests/view-contract.ts` gives every field's rule, and a new `RowView` or `StatusPage` field fails the type check until it has one. A field a look leaves out on purpose goes in `LOOK_GAPS` in `tests/view-contract.ts`, with a feature that is not `full` or `host` for that look.

The parts below hold the main table, split by subject. The omp table is in the parts under omp, whose file names start with `differences-omp`. The structure check tells the two tables apart by that name.

- [Keys, clicks and replies](looks/differences-input.md)
- [Rows, tabs, banners and motion](looks/differences-drawing.md)
- [The Status page and marks](looks/differences-status-and-marks.md)
- [Spacing](looks/differences-spacing.md)
- [How each host runs](looks/differences-hosts.md)
- [How each host runs in Herdr](looks/differences-hosts-herdr.md)
- [The agent and its turns](looks/differences-agent-and-turns.md)

### omp

omp draws the terminal's text and handles, with its own keys and a panel it owns. This table compares omp with the terminal look. The other columns of the table above do not apply to it.

- [The panel and its keys](looks/differences-omp-panel.md)
- [How omp runs](looks/differences-omp-host.md)

### Herdr

The Herdr look is a Herdr app mod that draws the session a host publishes. This table compares it with the Codex tab. The structure check reads the parts whose file names start with `differences-herdr` as this table.

- [The Herdr look](looks/differences-herdr.md)
- [The Herdr look's Status page](looks/differences-herdr-status.md)
- [The Herdr look's motion](looks/differences-herdr-motion.md)
- [The Herdr look's questions](looks/differences-herdr-questions.md)
- [The Herdr look's row buttons](looks/differences-herdr-buttons.md)
- [The Herdr look's open gaps](looks/differences-herdr-gaps.md)

## Adding a host

[Adding a host](adding-a-host.md) says what a new host supplies, which shared functions it calls on each event, and where to register it.

## After you change X, check Y

- [After you change X, check Y](looks/after-a-change.md)

## Checks

[Checks](checks.md) says what `./scripts/check.sh` and the structure check cover, and what they leave to live checks.
