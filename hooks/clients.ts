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
  | 'status-children'
  | 'child-names'
  | 'status-look-line'
  | 'status-row-rules'
  | 'status-failed-warning'
  | 'asks-holds-up-line'
  | 'asks-rec-reason-line'
  | 'status-mid-turn-refresh'
  | 'ran-call-activity'
  | 'ran-call-delegates'
  | 'tool-result-line'
  | 'status-call-records'
  | 'pr-order'
  | 'pr-rank-again'
  | 'pr-check-rerun'
  | 'pr-fetch-notice'
  | 'help-page'
  | 'status-view-ask'
  | 'status-goal'
  | 'status-done-fold'
  | 'status-named-fold'
  | 'seen-on-screen'
  | 'status-idle-age'

type Support = { kind: 'full' } | { kind: 'different' | 'unsupported'; reason: string }

type Client = { support: Record<FeatureId, Support> }

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
      'gh-signed-out-notice': { kind: 'full' },
      'link-open-rule': { kind: 'full' },
      'fork-ledger': { kind: 'full' },
      'band-and-stop-rows': { kind: 'full' },
      'exchange-trigger': { kind: 'full' },
      'settle-window': { kind: 'full' },
      'fold-on-typed-message': { kind: 'full' },
      'fold-waits-for-list-use': {
        kind: 'different',
        reason:
          'The terminal reports no pointer, so a row due to fold waits only on presses, keys and scrolls. On desktop a settled row is drawn as text, which reports no pointer, so a row waits on presses and on pointer moves over open rows.',
      },
      'version-label': { kind: 'full' },
      'status-tab': { kind: 'full' },
      'turn-working': { kind: 'full' },
      'host-task-list': { kind: 'full' },
      'hooks-need-trust': {
        kind: 'unsupported',
        reason: "Claude Code asks no one to trust a plugin's hooks, so no hook stops running for want of trust.",
      },
      'compare-in-background': { kind: 'full' },
      'compare-page': { kind: 'full' },
      'running-marks': { kind: 'full' },
      'pending-answer-mark': { kind: 'full' },
      'tab-symbols': { kind: 'full' },
      'dim-pressed-button': {
        kind: 'different',
        reason:
          "The desktop app's Button has no disabled state. `dimColor` fades only its label, and a click still shows the native press highlight before the shared press path ignores it.",
      },
      'herdr-sidebar': { kind: 'full' },
      'herdr-look': { kind: 'full' },
      'herdr-open': { kind: 'full' },
      'status-children': { kind: 'full' },
      'child-names': { kind: 'full' },
      'status-look-line': { kind: 'full' },
      'status-row-rules': { kind: 'full' },
      'status-failed-warning': { kind: 'full' },
      'asks-holds-up-line': { kind: 'full' },
      'asks-rec-reason-line': { kind: 'full' },
      'status-mid-turn-refresh': { kind: 'full' },
      'ran-call-activity': { kind: 'full' },
      'ran-call-delegates': { kind: 'full' },
      'tool-result-line': { kind: 'full' },
      'status-call-records': { kind: 'full' },
      'pr-order': { kind: 'full' },
      'pr-rank-again': { kind: 'full' },
      'pr-check-rerun': { kind: 'full' },
      'pr-fetch-notice': { kind: 'full' },
      'help-page': {
        kind: 'different',
        reason:
          "The engine binds only a digit or a lowercase letter as a Button's hotkey, so no key opens the terminal's Help. The desktop pane takes no keys, so its Help lists only the marks.",
      },
      'status-view-ask': { kind: 'full' },
      'status-goal': { kind: 'full' },
      'status-done-fold': { kind: 'full' },
      'status-named-fold': { kind: 'full' },
      'seen-on-screen': { kind: 'full' },
      'status-idle-age': { kind: 'full' },
    },
  },
  codex: {
    support: {
      'catch-up': {
        kind: 'different',
        reason:
          'Codex runs no hook when a chat is opened. A resumed chat catches up when its Inbox tab opens, and at the hook its next message runs if the tab stays closed. A chat whose ledger failed or fell behind, such as an archived chat that runs no hooks, also catches up when its tab opens, once until the ledger or the chat moves on.',
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
      'gh-signed-out-notice': { kind: 'full' },
      'link-open-rule': { kind: 'full' },
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
        reason: 'The tab only learns of a close at its next poll, so the server offers Undo for two polls longer.',
      },
      'fold-on-typed-message': { kind: 'full' },
      'fold-waits-for-list-use': { kind: 'full' },
      'version-label': { kind: 'full' },
      'status-tab': { kind: 'full' },
      'turn-working': {
        kind: 'different',
        reason:
          "Codex runs no hook when a chat is opened, and a turn whose app-server dies has no end row in the rollout. So after Codex's app-server dies during a turn, Working… stays and Done messages wait until the next message. Quitting the app, even with SIGKILL, ends the turn in the rollout.",
      },
      'host-task-list': {
        kind: 'different',
        reason:
          "Codex runs no hook for `update_plan`, and the inbox's tool matcher cannot be widened without every person trusting the hook again. So the plan is read from the rollout when the turn stops, and shows from the next Status call. The tool is not offered by default in `codex exec`, and the app is not checked.",
      },
      'hooks-need-trust': { kind: 'full' },
      'compare-in-background': {
        kind: 'different',
        reason:
          "When a Codex subagent ends, Codex queues its result for the main agent and starts no turn for it. So a result that arrives after the agent's turn has ended does not reach the chat on its own, and the Compare message asks for the comparison in the agent's own turn.",
      },
      'compare-page': { kind: 'full' },
      'running-marks': { kind: 'full' },
      'pending-answer-mark': { kind: 'full' },
      'tab-symbols': { kind: 'full' },
      'dim-pressed-button': { kind: 'full' },
      'herdr-sidebar': {
        kind: 'different',
        reason:
          "In a Herdr pane, only Codex's hooks and the update a hook starts report, so a record or close during a turn reaches the sidebar at the next hook. In a Herdr app terminal, the MCP server labels too. Codex finds no stops, and runs no hook when a session ends, so its tokens or labels stay.",
      },
      'herdr-look': {
        kind: 'different',
        reason: 'Codex runs no hook when a session ends, so its published file stays.',
      },
      'herdr-open': {
        kind: 'unsupported',
        reason:
          'The Codex CLI has no action that opens the inbox. A Codex plugin adds skills, MCP servers and hooks but no slash command, and the Inbox tab shows only in the Codex app.',
      },
      'status-children': {
        kind: 'different',
        reason:
          "Codex's hooks report subagents and shell commands, and nothing else that runs apart from the turn, so workflows do not show. The end of a wait on a Herdr delegate is read at Stop.",
      },
      'child-names': { kind: 'full' },
      'status-look-line': { kind: 'full' },
      'status-row-rules': { kind: 'full' },
      'status-failed-warning': { kind: 'full' },
      'asks-holds-up-line': { kind: 'full' },
      'asks-rec-reason-line': { kind: 'full' },
      'status-mid-turn-refresh': { kind: 'full' },
      'ran-call-activity': {
        kind: 'different',
        reason:
          "Codex runs PreToolUse before a call is approved, so a call's line shows from then. Stop, and the tool call that claims a Status call during the turn, take back the lines of calls the rollout shows were declined or blocked. In a code-mode script that ends on a declined command, the error does not name the command, so the declined one is the only command with no row while the script ran. When more than one has none, as when another still runs, every line stays. A declined MCP call keeps its line, and so does a call whose block a code-mode script catches.",
      },
      'ran-call-delegates': {
        kind: 'different',
        reason:
          "Codex runs PreToolUse before a call is approved, so a herdr command's delegate rows show from then. Stop, and the tool call that claims a Status call during the turn, take back the rows of each command the rollout shows was declined or blocked. In a code-mode script that ends on a declined command, that is the only command with no row while the script ran. When more than one has none, every row stays. A code-mode call whose script catches the block keeps its rows.",
      },
      'tool-result-line': {
        kind: 'unsupported',
        reason:
          "Codex draws an MCP tool call's result from its content, which is the text the model reads. structuredContent reaches the model too, and _meta reaches only an MCP App view, so a result has no field for the person alone.",
      },
      'status-call-records': { kind: 'full' },
      'pr-order': { kind: 'full' },
      'pr-rank-again': { kind: 'full' },
      'pr-check-rerun': { kind: 'full' },
      'pr-fetch-notice': { kind: 'full' },
      'help-page': { kind: 'full' },
      'status-view-ask': {
        kind: 'different',
        reason:
          "Pete's choice: View takes clicks only, with no key. The Codex Status has no row selection and is used by clicking.",
      },
      'status-goal': {
        kind: 'different',
        reason:
          "The goal's buttons take clicks only, as View does: the Codex Status has no row selection and is used by clicking.",
      },
      'status-done-fold': {
        kind: 'different',
        reason:
          'A done fold takes clicks only, as View does: the Codex Status has no row selection and is used by clicking.',
      },
      'status-named-fold': { kind: 'full' },
      'seen-on-screen': { kind: 'full' },
      'status-idle-age': { kind: 'full' },
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
      'gh-signed-out-notice': { kind: 'full' },
      'link-open-rule': { kind: 'full' },
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
      'fold-on-typed-message': { kind: 'full' },
      'fold-waits-for-list-use': {
        kind: 'different',
        reason: "omp's panel takes keys only, so a row due to fold waits on keys.",
      },
      'version-label': {
        kind: 'different',
        reason: "omp's panel footer ends with the inbox model's name, so the version follows it there.",
      },
      'status-tab': { kind: 'full' },
      'turn-working': { kind: 'full' },
      'host-task-list': { kind: 'full' },
      'hooks-need-trust': {
        kind: 'unsupported',
        reason: "omp runs an installed extension's events without asking anyone to trust them.",
      },
      'compare-in-background': { kind: 'full' },
      'compare-page': { kind: 'full' },
      'running-marks': { kind: 'full' },
      'pending-answer-mark': { kind: 'full' },
      'tab-symbols': { kind: 'full' },
      'dim-pressed-button': {
        kind: 'different',
        reason:
          'The panel already draws a follow-up such as Discuss dim, and has no dimmer style, so an out follow-up looks as it does at rest until it is focused. Its key still does nothing.',
      },
      'herdr-sidebar': { kind: 'full' },
      'herdr-look': { kind: 'full' },
      'herdr-open': { kind: 'full' },
      'status-children': {
        kind: 'different',
        reason:
          "omp's extension events report subagents and bash calls. omp's reference names no event for a workflow run, so those do not show.",
      },
      'child-names': { kind: 'full' },
      'status-look-line': { kind: 'full' },
      'status-row-rules': { kind: 'full' },
      'status-failed-warning': { kind: 'full' },
      'asks-holds-up-line': { kind: 'full' },
      'asks-rec-reason-line': { kind: 'full' },
      'status-mid-turn-refresh': { kind: 'full' },
      'ran-call-activity': { kind: 'full' },
      'ran-call-delegates': { kind: 'full' },
      'tool-result-line': { kind: 'full' },
      'status-call-records': { kind: 'full' },
      'pr-order': { kind: 'full' },
      'pr-rank-again': { kind: 'full' },
      'pr-check-rerun': { kind: 'full' },
      'pr-fetch-notice': { kind: 'full' },
      'help-page': {
        kind: 'different',
        reason: 'The panel takes keys only, so `?` opens Help, and no button does.',
      },
      'status-view-ask': { kind: 'full' },
      'status-goal': { kind: 'full' },
      'status-done-fold': { kind: 'full' },
      'status-named-fold': { kind: 'full' },
      'seen-on-screen': { kind: 'full' },
      'status-idle-age': { kind: 'full' },
    },
  },
}

/** Whether a Compare press on `client` may hand its work to a background subagent, whose report reaches the chat. */
export function isCompareInBackground(client: ClientId): boolean {
  return CLIENTS[client].support['compare-in-background'].kind === 'full'
}
