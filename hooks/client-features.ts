/**
 * Every feature `hooks/clients.ts` records each host's support for. `scripts/structure/clients.mjs` reads this union
 * with the TypeScript AST, so write each member as a string literal.
 */
export type FeatureId =
  | 'codex-desktop-companion'
  | 'remote-typed-reply-admission'
  | 'remote-draft-retention'
  | 'catch-up'
  | 'failed-update-recovery'
  | 'ledger-behind-state'
  | 'dialog-outcome'
  | 'dialog-answer'
  | 'dialog-answer-closes-copy'
  | 'dialog-descriptions'
  | 'tool-output-urls'
  | 'pr-link-from-output'
  | 'pr-arrivals'
  | 'prs-empty-hint'
  | 'gh-signed-out-notice'
  | 'link-open-rule'
  | 'fork-ledger'
  | 'band-and-stop-rows'
  | 'exchange-trigger'
  | 'settle-window'
  | 'fold-on-typed-message'
  | 'fold-waits-for-list-use'
  | 'version-label'
  | 'status-tab'
  | 'turn-working'
  | 'host-task-list'
  | 'hooks-need-trust'
  | 'compare-in-background'
  | 'compare-page'
  | 'running-marks'
  | 'title-tint'
  | 'pending-answer-mark'
  | 'tab-symbols'
  | 'dim-pressed-button'
  | 'herdr-sidebar'
  | 'herdr-look'
  | 'herdr-open'
  | 'herdr-install'
  | 'status-children'
  | 'child-names'
  | 'status-failed-warning'
  | 'status-stale-line'
  | 'asks-holds-up-line'
  | 'asks-tree'
  | 'answers-side-by-side'
  | 'asks-context-line'
  | 'earlier-answers'
  | 'status-mid-turn-refresh'
  | 'ran-call-activity'
  | 'ran-call-delegates'
  | 'tool-result-line'
  | 'status-call-records'
  | 'pr-order'
  | 'pr-rank-again'
  | 'clear-merged-and-closed-prs'
  | 'pr-check-rerun'
  | 'pr-fetch-notice'
  | 'help-page'
  | 'status-view-ask'
  | 'status-goal'
  | 'status-done-fold'
  | 'status-named-fold'
  | 'status-parent-fold'
  | 'seen-on-screen'
  | 'status-idle-age'
  | 'question-back-stays-open'
  | 'collapse-rows'
  | 'fold-all'
  | 'suggested-goal'
  | 'show-explanation'
  | 'done-press-age'

/** A host. Terminal and desktop share `claude-code`, since both run the mod. */
export type ClientId = 'claude-code' | 'codex' | 'omp'

/**
 * The parity record: how each host supports each feature. `full` means the host does what the shared flow
 * describes. `different` means the person gets the feature another way. `unsupported` means the person gets none of it.
 */
type Support = { kind: 'full' } | { kind: 'different' | 'unsupported'; reason: string }

/**
 * One host's table, declared in `hooks/clients-<host>.ts` and named in `CLIENTS` in `hooks/clients.ts`. Write each entry
 * as an object literal with a string-literal `kind` and `reason`, because `scripts/structure/clients.mjs` reads the files
 * with the TypeScript AST. A feature that is not `full` also needs a row in "Differences on purpose" in `docs/looks.md`,
 * whose first column names the feature id in backticks. The check fails when the row is missing.
 */
export type Client = { support: Record<FeatureId, Support> }

/**
 * A look with no host of its own: it draws the session a host publishes, so a host's id never names it. Exact's web and
 * iOS clients join this list as `exact-web` and `exact-ios` once they ship, each with its own table and Differences on
 * purpose parts named `differences-<id>`.
 */
export type PublishedLookId = 'herdr'

/**
 * How a published look supports a feature. `host` means the publishing host does all of it and the look has no part,
 * so the host's own entry in `CLIENTS` says what the person gets. The other kinds mean what they mean for a host.
 */
type LookSupport = Support | { kind: 'host' }

/**
 * One published look's table, declared in `hooks/clients-<look>.ts` and named in `PUBLISHED_LOOKS` in
 * `hooks/clients.ts`, written as a host's table is. Its Differences on purpose rows compare it with the Codex tab.
 */
export type LookTable = { support: Record<FeatureId, LookSupport> }
