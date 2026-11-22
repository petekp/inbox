import type { Dialog } from '../../types'
import { dialogWaitText } from './band'
import type { RowView } from './rows'
import type { SessionView } from './session-view'

/**
 * The agent's own dialog that waits on the person, as a host knows it. `text` is null from a Herdr publisher that
 * names only the dialog's kind.
 */
export type OpenDialog = { kind: Dialog['kind']; text: string | null }

/**
 * The id of the dialog's row. Each dialog gets its own, so a fold of one dialog's row does not carry to the next. No
 * ledger item, finding or PR row id starts with `dialog:`.
 */
export function dialogRowId(dialog: OpenDialog): string {
  return `dialog:${dialog.kind}:${dialog.text ?? ''}`
}

/** What the dialog asks, in one line: "Allow npm test?" for a permission, else the question. */
export function dialogTitle(dialog: Pick<Dialog, 'kind' | 'text'>): string {
  return dialog.kind === 'permission' ? `Allow ${dialog.text}?` : dialog.text
}

/** Where the person answers the dialog, which the row's context line says. */
function answerPlace(agent: string, kind: Dialog['kind']): string {
  return kind === 'question' ? `Answer the question in ${agent}'s dialog.` : `Allow or deny it in ${agent}'s dialog.`
}

/**
 * The Asks row of the agent's own dialog: what it waits for, and on the row's context line where to answer it. It has
 * no presses, since the answer goes in the dialog and no host lets the inbox answer or focus it.
 */
function dialogRow(dialog: OpenDialog, agent: string): RowView {
  return {
    id: dialogRowId(dialog),
    type: 'dialog',
    number: null,
    title: dialog.text ? dialogTitle({ kind: dialog.kind, text: dialog.text }) : dialogWaitText(agent, dialog.kind),
    at: null,
    detail: null,
    fileName: null,
    replyKind: 'answer',
    item: null,
    finding: null,
    steps: [],
    state: { is: 'open' },
    feedback: null,
    actions: [],
    optionDescriptions: [],
    holdsUpLine: null,
    contextLine: answerPlace(agent, dialog.kind),
    earlierLine: null,
  }
}

/**
 * `view` with the agent's open dialog as the first row of the Asks tab's questions, since the agent is blocked on it.
 * It counts in no tab, group or band count: those count the inbox's own asks, and the band names the dialog itself.
 */
export function withDialogRow(view: SessionView, dialog: OpenDialog | null, agent: string): SessionView {
  if (!dialog) return view

  return { ...view, needsYou: { ...view.needsYou, questions: [dialogRow(dialog, agent), ...view.needsYou.questions] } }
}
