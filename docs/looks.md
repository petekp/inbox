# Looks

Status: current. Read this before you change the UI or a business rule.

The inbox has five looks: `terminal`, `desktop`, `codex`, `omp` and `herdr`. A look is one way the inbox is drawn, and `GLOSSARY-LOOKS.md` defines it with host, shared module, adapter and difference on purpose. The rule is that shared modules decide and adapters draw. If a rule decides what a row says, which action leads, when a tab counts as empty or what text appears, it lives in a shared module. An adapter decides only how its look draws that. The plan for finishing this split is `docs/plans/three-looks.md`.

## Files

Shared modules are in `core/`. Every host consumes them, directly or through a build. Each one sits in the folder of its layer. A layer loads code only from its own folder and the layers listed above it:

- `core/domain/`: the ledger, the Status, PRs, presses and their messages, the model's prompts and the parsers of its answers, and the client record. It draws nothing and runs no effects.
- `core/view/`: what the looks draw and the code that decides it: rows, tabs, banners, the Status page, PR blocks, the shared UI controller, timing and motion. The press reducer, the demo session and the saved session's form sit here too, because they read rows and PR blocks.
- `core/runtime/`: what a host runs through its `SessionHost`: turns, presses, PR fetches, the agent's tools, the Status call records, the question history store, a session's command log, and its viewer leases. The command log holds each remote command a host admitted for the session, by id, with its outcome. Each host keeps it in a file outside the saved session: the mod under the question history's state folder, Codex and omp beside the session's state. A viewer lease is a Herdr look's or companion's report of what it shows a session, renewed by each heartbeat. Each host keeps the leases out of the saved session, so a heartbeat never rewrites it: the mod and omp in process memory, Codex in a file beside the session's state. The session registry holds one file per running session, `<host>-<id>.json` in `registry/` under the question history's state folder, so another program can find each session without asking its host.
- `core/remote/`: publishing a session to the Herdr look, the remote commands it delivers, and starting and finding Herdr terminals.

A type-only import may name a type from any layer, since it loads no code. Code in `core/` imports only `core/` and `types/`, type imports included. The Claude Code mod is in `hooks/`: `hooks/register.tsx` wires the engine's events, `hooks/mod/` holds the mod's runtime, and `hooks/pane/` draws the terminal and desktop looks. Codex, omp and the Herdr look never import `hooks/`, and the mod never imports their code. `scripts/structure/imports.mjs` checks these rules. Codex and omp type checking need no generated Claude engine types.

Every source file in `core/`, `hooks/`, `codex/src`, `omp/src` and `herdr/src` needs a row in one of the parts below. Put a file split out of another next to that file's row. The structure check reads the rows in every `docs/looks/files-*.md`.

- [Shared modules](looks/files-shared.md)
- [Shared modules for the Status](looks/files-shared-status.md)
- [Shared modules for Herdr](looks/files-shared-herdr.md)
- [Shared modules for a question's body and previews](looks/files-shared-questions.md)
- [Shared modules for the band, sync state and press checks](looks/files-shared-sync.md)
- [The shared UI controller](looks/files-shared-controller.md)
- [The mod](looks/files-mod.md)
- [The mod's saves, logs and sessions](looks/files-mod-storage.md)
- [Codex](looks/files-codex.md)
- [omp](looks/files-omp.md)
- [The Herdr look](looks/files-herdr.md)

## Who owns each rule

Change a rule in its owner. Do not change it in a reader.

- [Tabs, lists, banners and the footer](looks/owners-tabs-and-lists.md)
- [Rows, presses and feedback](looks/owners-rows-and-feedback.md)
- [A question's parts on its row](looks/owners-question-rows.md)
- [Rows: folds, keys and marks](looks/owners-rows-folds-and-keys.md)
- [Presses: their messages, status and reducer](looks/owners-presses.md)
- [The Status page](looks/owners-status.md)
- [The Status goal and Other work](looks/owners-status-goal.md)
- [The Status call](looks/owners-status-call.md)
- [The ledger, sessions and model-read texts](looks/owners-ledger-and-sessions.md)
- [PRs](looks/owners-prs.md)
- [The PR order and Rank again](looks/owners-pr-order.md)
- [Rules still written in two places](looks/owners-written-twice.md)

## Differences on purpose

A difference is on purpose when a look cannot do something or the product decided it. Anything not listed here is drift.

A row that covers a host difference names its feature id in backticks in the first column. `core/domain/clients.ts` is the parity record. `CLIENTS` classifies every feature as `full`, `different` or `unsupported` for each host (`claude-code` for the terminal and desktop looks, `codex`, `omp`). `PUBLISHED_LOOKS` does the same for each look that draws a session a host publishes, today only `herdr`. A published look's entry can also be `host`: the publishing host does all of the feature, so the host's own entry says what the person gets. `scripts/check-structure.mjs` fails when a feature that is not `full` or `host` has no row in the table that covers its host or look, and when a row names an id the record lacks. The main table covers `claude-code` and `codex`. The omp table covers `omp`. Each published look has its own table, in the parts named `differences-<look id>`.

A published look gets its own list, apart from `CLIENTS`, because a `ClientId` names the host that publishes a session: the Herdr publish code, the Status call's hosts and the press messages all read it that way. Exact's web and iOS clients will join `PUBLISHED_LOOKS` as `exact-web` and `exact-ios`, each with its own `core/domain/clients-<id>.ts` and `differences-<id>` parts.

Each look's contract test also fails when the look leaves out a field of the shared row or Status page. `tests/view-contract.ts` gives every field's rule, and a new `RowView` or `StatusPage` field fails the type check until it has one. A field a look leaves out on purpose goes in `LOOK_GAPS` in `tests/view-contract.ts`, with a feature that is not `full` or `host` for that look.

The parts below hold the main table, split by subject. The omp table is in the parts under omp, whose file names start with `differences-omp`. The structure check tells the two tables apart by that name.

- [Keys, clicks and replies](looks/differences-input.md)
- [The Status goal's buttons and field](looks/differences-input-goal.md)
- [Rows, tabs, banners and motion](looks/differences-drawing.md)
- [The Status page and marks](looks/differences-status-and-marks.md)
- [Text levels](looks/differences-status-text.md)
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
