import type { LookTable } from './client-features'

export const HERDR: LookTable = {
  support: {
    'codex-desktop-companion': { kind: 'host' },
    'remote-typed-reply-admission': { kind: 'host' },
    'remote-draft-retention': { kind: 'host' },
    'catch-up': { kind: 'host' },
    'failed-update-recovery': { kind: 'host' },
    'ledger-behind-state': { kind: 'host' },
    'dialog-outcome': { kind: 'host' },
    'dialog-answer': { kind: 'host' },
    'dialog-answer-closes-copy': { kind: 'host' },
    'dialog-descriptions': { kind: 'host' },
    'tool-output-urls': { kind: 'host' },
    'pr-link-from-output': { kind: 'host' },
    'pr-arrivals': { kind: 'full' },
    'prs-empty-hint': { kind: 'full' },
    'gh-signed-out-notice': { kind: 'full' },
    'link-open-rule': { kind: 'full' },
    'fork-ledger': { kind: 'host' },
    'band-and-stop-rows': {
      kind: 'unsupported',
      reason:
        'The look draws no stop row and no Resume, though the published session carries the stop. Only the Herdr sidebar shows it. No reason is recorded: issue #674.',
    },
    'exchange-trigger': { kind: 'host' },
    'settle-window': { kind: 'full' },
    'fold-on-typed-message': { kind: 'full' },
    'fold-waits-for-list-use': { kind: 'full' },
    'version-label': { kind: 'full' },
    'status-tab': { kind: 'full' },
    'turn-working': { kind: 'host' },
    'host-task-list': { kind: 'host' },
    'hooks-need-trust': {
      kind: 'unsupported',
      reason:
        'The session Codex publishes carries no hook-trust state, so the look shows no banner when Codex is not running the hooks. No reason is recorded: issue #681.',
    },
    'compare-in-background': { kind: 'host' },
    'compare-page': { kind: 'host' },
    'running-marks': {
      kind: 'different',
      reason: 'A running mark always fades, since the Herdr app tells a mod no reduced-motion setting.',
    },
    'title-tint': {
      kind: 'different',
      reason: 'Steps the fade in `NEW_STEPS` opaque colors, since GPUI glides no text color.',
    },
    'pending-answer-mark': { kind: 'full' },
    'tab-symbols': {
      kind: 'different',
      reason:
        'The tab row wraps its words onto a second line and never switches to symbols. No reason is recorded: issue #672.',
    },
    'dim-pressed-button': {
      kind: 'different',
      reason:
        'An out button loses its fill and border and draws its label muted, since a filled button at 40% opacity drew the eye away from the buttons that still work.',
    },
    'herdr-sidebar': { kind: 'host' },
    'herdr-look': { kind: 'host' },
    'herdr-open': { kind: 'host' },
    'herdr-install': { kind: 'host' },
    'status-children': { kind: 'host' },
    'child-names': { kind: 'host' },
    'status-failed-warning': { kind: 'full' },
    'status-stale-line': { kind: 'full' },
    'asks-holds-up-line': {
      kind: 'different',
      reason: 'Drawn only on the open row, since a collapsed row stays one line high so its height can glide.',
    },
    'asks-tree': { kind: 'full' },
    'answers-side-by-side': {
      kind: 'different',
      reason:
        'Answers that may fit draw side by side until each button reports its width, since gpui-kit reports a size only after a draw.',
    },
    'asks-context-line': { kind: 'full' },
    'earlier-answers': {
      kind: 'different',
      reason: 'The earlier answer draws in one muted tone, since gpui-kit has no inline text span to weight one word.',
    },
    'status-mid-turn-refresh': { kind: 'host' },
    'ran-call-activity': { kind: 'host' },
    'ran-call-delegates': { kind: 'host' },
    'tool-result-line': { kind: 'host' },
    'status-call-records': { kind: 'host' },
    'pr-order': { kind: 'full' },
    'pr-rank-again': { kind: 'full' },
    'clear-merged-and-closed-prs': { kind: 'full' },
    'pr-check-rerun': { kind: 'full' },
    'pr-fetch-notice': { kind: 'full' },
    'help-page': { kind: 'full' },
    'status-view-ask': {
      kind: 'different',
      reason: 'View takes clicks only, with no key, since the Status page selects no row.',
    },
    'status-goal': {
      kind: 'different',
      reason: "The goal's buttons take clicks only, since the Status page selects no row.",
    },
    'status-done-fold': {
      kind: 'different',
      reason: 'A done fold takes clicks only, since the Status page selects no row.',
    },
    'status-named-fold': { kind: 'full' },
    'status-parent-fold': {
      kind: 'different',
      reason:
        "A parent's fold takes a click across its whole line, since the look paints each line as one block, and no key folds it.",
    },
    'seen-on-screen': {
      kind: 'different',
      reason:
        'A row counts as seen only when it would show at every scroll position, since gpui-kit does not say how far a list has scrolled.',
    },
    'status-idle-age': { kind: 'full' },
    'question-back-stays-open': { kind: 'host' },
    'collapse-rows': { kind: 'full' },
    'fold-all': { kind: 'full' },
    'suggested-goal': {
      kind: 'different',
      reason:
        'The offer is one centred line above its buttons, which take clicks only, since the empty Status has one text slot and selects no row.',
    },
    'show-explanation': {
      kind: 'unsupported',
      reason: 'The Herdr app runs apart from the Claude Code terminal, so it cannot scroll that conversation.',
    },
    'done-press-age': {
      kind: 'different',
      reason: 'A row whose press finished keeps showing when it arrived. No reason is recorded: issue #677.',
    },
    'delegate-asks': { kind: 'host' },
  },
}
