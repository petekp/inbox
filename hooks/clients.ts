/**
 * The parity record: how each host supports each feature. `full` means the host does what the shared flow
 * describes. `different` means the person gets the feature another way. `unsupported` means the person gets none of it.
 * `docs/looks.md` explains each feature that is not `full` in "Differences on purpose", in a row whose first column
 * names the feature id in backticks. `scripts/check-structure.mjs` fails when such a row is missing, and reads this file
 * with the TypeScript AST, so write each entry as an object literal.
 */

/** A host. Terminal and desktop share `claude-code`, since both run the mod. */
export type ClientId = 'claude-code' | 'codex' | 'omp'

export type FeatureId =
  | 'catch-up'
  | 'failed-update-recovery'
  | 'ledger-behind-state'
  | 'dialog-outcome'
  | 'dialog-answer'
  | 'dialog-descriptions'
  | 'tool-output-urls'
  | 'pr-link-from-output'
  | 'pr-arrivals'
  | 'prs-empty-hint'
  | 'link-open-rule'
  | 'fork-ledger'
  | 'band-and-stop-rows'
  | 'exchange-trigger'
  | 'settle-window'
  | 'version-label'
  | 'overview-tab'
  | 'turn-working'
  | 'host-task-list'
  | 'hooks-need-trust'
  | 'compare-in-background'
  | 'running-marks'

export type Support = { kind: 'full' } | { kind: 'different' | 'unsupported'; reason: string }

export type Client = { support: Record<FeatureId, Support> }

export const CLIENTS: Record<ClientId, Client> = {
  'claude-code': {
    support: {
      'catch-up': { kind: 'full' },
      'failed-update-recovery': { kind: 'full' },
      'ledger-behind-state': { kind: 'full' },
      'dialog-outcome': { kind: 'full' },
      'dialog-answer': {
        kind: 'different',
        reason:
          'The dialog blocks the turn, and the inbox copies a dialog only once it ended, so no open dialog is left for an inbox answer to close.',
      },
      'dialog-descriptions': { kind: 'full' },
      'tool-output-urls': { kind: 'full' },
      'pr-link-from-output': { kind: 'full' },
      'pr-arrivals': { kind: 'full' },
      'prs-empty-hint': { kind: 'full' },
      'link-open-rule': { kind: 'full' },
      'fork-ledger': { kind: 'full' },
      'band-and-stop-rows': { kind: 'full' },
      'exchange-trigger': { kind: 'full' },
      'settle-window': { kind: 'full' },
      'version-label': { kind: 'full' },
      'overview-tab': { kind: 'full' },
      'turn-working': { kind: 'full' },
      'host-task-list': { kind: 'full' },
      'hooks-need-trust': {
        kind: 'unsupported',
        reason: "Claude Code asks no one to trust a plugin's hooks, so no hook stops running for want of trust.",
      },
      'compare-in-background': { kind: 'full' },
      'running-marks': { kind: 'full' },
    },
  },
  codex: {
    support: {
      'catch-up': {
        kind: 'different',
        reason:
          'Codex runs no hook when a chat is opened. A resumed chat catches up when its Inbox tab opens, and at the hook its next message runs if the tab stays closed.',
      },
      'failed-update-recovery': { kind: 'full' },
      'ledger-behind-state': {
        kind: 'different',
        reason:
          'Codex runs no hook when a chat is opened. A resumed chat is marked behind when its Inbox tab opens, and at the hook its next message runs if the tab stays closed.',
      },
      'dialog-outcome': {
        kind: 'different',
        reason:
          "Codex's dialog tool returns at once and the answer arrives later as a user message, so a dialog is noted as open and its outcome is never recorded.",
      },
      'dialog-answer': { kind: 'full' },
      'dialog-descriptions': { kind: 'full' },
      'tool-output-urls': { kind: 'full' },
      'pr-link-from-output': {
        kind: 'different',
        reason:
          "Codex runs no hook for a long command's output, so the inbox reads the turn's shell commands from the rollout at Stop. A PR that `gh pr create` opened is linked when the turn ends, not when the command finishes.",
      },
      'pr-arrivals': { kind: 'full' },
      'prs-empty-hint': {
        kind: 'different',
        reason: 'The Codex app calls a conversation a chat, so its hint says chat where the mod says session.',
      },
      'link-open-rule': {
        kind: 'different',
        reason:
          'The maintainer chose to keep each host rule. The mod opens a link with any scheme. Codex opens only https links and treats anything else as a path.',
      },
      'fork-ledger': {
        kind: 'different',
        reason:
          "Codex runs no hook when a chat is opened. A fork takes its parent's ledger when its Inbox tab opens, and at the hook its first message runs if the tab stays closed.",
      },
      'band-and-stop-rows': {
        kind: 'unsupported',
        reason: 'Codex has no line above its prompt, and shows no stops.',
      },
      'exchange-trigger': {
        kind: 'different',
        reason:
          'A Codex hook names no source for a turn that has no prompt, so the exchange reads unknown. The mod reads the prompt origin.',
      },
      'settle-window': {
        kind: 'different',
        reason: 'The tab only learns of a close at its next poll, so the settle window adds two polls.',
      },
      'version-label': { kind: 'full' },
      'overview-tab': { kind: 'full' },
      'turn-working': {
        kind: 'different',
        reason:
          "Codex runs no hook when a chat is opened, and a turn whose app-server dies has no end row in the rollout. So after Codex's app-server dies during a turn, Working… stays and Done messages wait until the next message. Quitting the app, even with SIGKILL, ends the turn in the rollout.",
      },
      'host-task-list': {
        kind: 'different',
        reason:
          "Codex runs no hook for `update_plan`, and the inbox's tool matcher cannot be widened without every person trusting the hook again. So the plan is read from the rollout when the turn stops, and shows from the next Overview call. The tool is not offered by default in `codex exec`, and the app is not checked.",
      },
      'hooks-need-trust': { kind: 'full' },
      'compare-in-background': {
        kind: 'different',
        reason:
          "Codex's subagents are experimental and off by default, and no source says one can report after the agent's turn ends, so a comparison runs in the turn.",
      },
      'running-marks': { kind: 'full' },
    },
  },
  omp: {
    support: {
      'catch-up': { kind: 'full' },
      'failed-update-recovery': { kind: 'full' },
      'ledger-behind-state': { kind: 'full' },
      'dialog-outcome': { kind: 'full' },
      'dialog-answer': {
        kind: 'different',
        reason:
          'The ask dialog blocks the turn, and the inbox copies a dialog only once it ended, so no open dialog is left for an inbox answer to close.',
      },
      'dialog-descriptions': { kind: 'full' },
      'tool-output-urls': { kind: 'full' },
      'pr-link-from-output': { kind: 'full' },
      'pr-arrivals': { kind: 'full' },
      'prs-empty-hint': { kind: 'full' },
      'link-open-rule': {
        kind: 'different',
        reason:
          'The maintainer chose to keep each host rule. The mod opens a link with any scheme. omp opens only https links and treats anything else as a path.',
      },
      'fork-ledger': { kind: 'full' },
      'band-and-stop-rows': {
        kind: 'different',
        reason:
          "omp's band cannot take keys, so Resume is a button in the panel. omp classes a stop from the request's HTTP status and message, so it never names billing or a reset time.",
      },
      'exchange-trigger': {
        kind: 'different',
        reason:
          "omp's `before_agent_start` event carries only the prompt text, so every turn has words and none reads as started by something else.",
      },
      'settle-window': { kind: 'full' },
      'version-label': {
        kind: 'different',
        reason: "omp's panel footer ends with the inbox model's name, so the version follows it there.",
      },
      'overview-tab': { kind: 'full' },
      'turn-working': { kind: 'full' },
      'host-task-list': { kind: 'full' },
      'hooks-need-trust': {
        kind: 'unsupported',
        reason: "omp runs an installed extension's events without asking anyone to trust them.",
      },
      'compare-in-background': { kind: 'full' },
      'running-marks': { kind: 'full' },
    },
  },
}
