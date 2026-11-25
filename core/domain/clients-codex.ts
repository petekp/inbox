import type { Client } from './client-features'

export const CODEX: Client = {
  support: {
    'codex-desktop-companion': { kind: 'full' },
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
        "Codex's dialog tool returns at once and the answer arrives later as a user message, so a dialog is noted as open unless a reply in its form came later in the same turn, or, in a catch-up, anywhere later in the conversation.",
    },
    'dialog-answer': { kind: 'full' },
    'dialog-answer-closes-copy': {
      kind: 'different',
      reason:
        "Codex's dialog tool returns before the person answers, so the inbox sees no answer when the dialog ends. The copy stays open until the person's reply in the dialog's form arrives, and the agent closes it then.",
    },
    'dialog-descriptions': { kind: 'full' },
    'open-dialog-asks': {
      kind: 'unsupported',
      reason:
        'Codex runs no hook while its dialog or an approval waits, and its dialog tool returns before the person answers, so the inbox cannot tell that one is open.',
    },
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
    'title-tint': { kind: 'full' },
    'pending-answer-mark': { kind: 'full' },
    'tab-symbols': { kind: 'full' },
    'dim-pressed-button': { kind: 'full' },
    'herdr-sidebar': {
      kind: 'different',
      reason:
        "In a Herdr pane, only Codex's hooks and the update a hook starts report, so a record or close during a turn reaches the sidebar at the next hook. In a Herdr app terminal, the MCP server labels too. Codex finds no stops. Its SessionEnd hook clears a Herdr app terminal's labels, but a pane's tokens stay after the session ends.",
    },
    'herdr-look': {
      kind: 'different',
      reason:
        "Codex's MCP server cannot tell which session it serves, so the hooks save which session runs in the terminal. Codex runs SessionStart at a session's first prompt, so a session that ended without its SessionEnd hook stays in the look until then, and none of its presses apply.",
    },
    'herdr-open': {
      kind: 'unsupported',
      reason:
        'The Codex CLI has no action that opens the inbox. A Codex plugin adds skills, MCP servers and hooks but no slash command, and the Inbox tab shows only in the Codex app. A `$inbox` skill that has the model call an MCP tool could open the Herdr look, but only after a model turn, so the press could not show what it did at once. It is left as an option.',
    },
    'herdr-install': {
      kind: 'different',
      reason:
        "The Codex CLI shows no inbox where the install question could show: a Codex plugin adds no slash command, and the Inbox tab shows only in the Codex app. So the app's tab asks when the Herdr app's settings folder exists, and Codex has no `/inbox herdr`. At start, Codex updates an installed inbox build, installs after a saved yes, and logs a failure only.",
    },
    'status-children': {
      kind: 'different',
      reason:
        "Codex's hooks report subagents and shell commands, and nothing else that runs apart from the turn, so workflows do not show. The end of a wait on a Herdr delegate is read at Stop.",
    },
    'child-names': { kind: 'full' },
    'status-failed-warning': { kind: 'full' },
    'status-stale-line': { kind: 'full' },
    'asks-holds-up-line': { kind: 'full' },
    'asks-tree': { kind: 'full' },
    'answers-side-by-side': { kind: 'full' },
    'asks-context-line': { kind: 'full' },
    'earlier-answers': { kind: 'full' },
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
    'clear-merged-and-closed-prs': { kind: 'full' },
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
    'status-faint-text': { kind: 'full' },
    'status-parent-fold': {
      kind: 'different',
      reason:
        "A parent's fold takes a click, or Enter or Space on focus, with no hotkey: the Codex Status has no row selection.",
    },
    'seen-on-screen': { kind: 'full' },
    'status-idle-age': { kind: 'full' },
    'question-back-stays-open': {
      kind: 'different',
      reason:
        "A typed reply to a question linked to an open Codex dialog goes in the dialog's reply form, question or not, since that form is what closes the dialog. The close refusal and the update rule apply as everywhere.",
    },
    'collapse-rows': { kind: 'full' },
    'fold-all': { kind: 'full' },
    'suggested-goal': {
      kind: 'different',
      reason: 'Clicks only, as for the goal: the Codex Status has no row selection.',
    },
    'remote-typed-reply-admission': { kind: 'full' },
    'remote-draft-retention': { kind: 'full' },
    'show-explanation': {
      kind: 'unsupported',
      reason: 'Codex gives a plugin no call that scrolls its conversation.',
    },
    'done-press-age': { kind: 'full' },
    'delegate-asks': { kind: 'full' },
    'record-earlier-answers': { kind: 'full' },
    'named-pr-link': { kind: 'full' },
    'session-registry': {
      kind: 'different',
      reason:
        "Under the Codex app, every chat's hook and server run under the app server, so every chat's entry carries the app server's pid. A closed chat's entry reads as running until the app quits. A Codex CLI session gets its own process.",
    },
    'press-preconditions': { kind: 'full' },
    'task-results': { kind: 'full' },
  },
}
