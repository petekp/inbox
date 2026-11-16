/**
 * The parity record: how each host supports each feature. `full` means the host does what the shared flow
 * describes. `different` means the person gets the feature another way. `unsupported` means the person gets none of it.
 * `docs/looks.md` explains each feature that is not `full` in "Differences on purpose", in a row whose first column
 * names the feature id in backticks. `scripts/check-structure.mjs` fails when such a row is missing, and reads this file
 * with the TypeScript AST, so write each entry as an object literal.
 */

import { CLIENTS } from './client-support'

/** A host. Terminal and desktop share `claude-code`, since both run the mod. */
export type ClientId = 'claude-code' | 'codex' | 'omp'

export type FeatureId =
  | 'catch-up'
  | 'failed-update-recovery'
  | 'ledger-behind-state'
  | 'recorded-items-only'
  | 'ask-history'
  | 'dialog-outcome'
  | 'dialog-answer'
  | 'dialog-answer-closes-copy'
  | 'dialog-descriptions'
  | 'tool-output-urls'
  | 'pr-link-from-output'
  | 'pr-arrivals'
  | 'account-pr-list'
  | 'feed-findings'
  | 'meta-active-items'
  | 'meta-default-feed'
  | 'untracked-work-warning'
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
  | 'asks-holds-up-line'
  | 'asks-rec-reason-line'
  | 'asks-context-line'
  | 'status-mid-turn-refresh'
  | 'ran-call-activity'
  | 'ran-call-delegates'
  | 'tool-result-line'
  | 'status-call-records'
  | 'model-instructions'
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
  | 'seen-on-screen'
  | 'status-idle-age'
  | 'question-back-stays-open'
  | 'markdown-item-links'
  | 'item-explanations'
  | 'finding-links'
  | 'option-links'
  | 'item-document'
  | 'document-preview'
  | 'record-link-guard'
  | 'task-pr-facts'
  | 'task-owner-facts'
  | 'task-reminder'
  | 'timeline'

type FeatureSupport = { kind: 'full' } | { kind: 'different' | 'unsupported'; reason: string }
export type ClientSupport = { support: Record<FeatureId, FeatureSupport> }

export { CLIENTS } from './client-support'

/** Whether a Compare press on `client` may hand its work to a background subagent, whose report reaches the chat. */
export function isCompareInBackground(client: ClientId): boolean {
  return CLIENTS[client].support['compare-in-background'].kind === 'full'
}
