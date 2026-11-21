import type { UiPressArgument } from 'claude-code'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowKeys } from './pane-row-keys'
import { paneState } from '../mod/mod-state'
import { DESKTOP_FIELD_PT, DESKTOP_REPLY_ROWS, fieldRows, REPLY_ROWS } from './pane-sizes'
import { desktopLines } from './desktop-metrics'
import { lineCount } from './terminal-text'
import { cellWidth } from '../../core/domain/text'
import type { Drawn } from './pane-status-tops'
import type { PaneStatusLines } from './pane-status-lines'
import { GOAL_FIELD, GOAL_KEYS_ID, goalSubmitLabel } from '../../core/view/status-keys'
import type { StatusPage } from '../../core/view/status-page'
import { ROW_COPY } from '../../core/view/rows'

/** An open field's height follows what is typed, so its lines are not counted. */
export const uncounted = (el: JSX.Element): Drawn => ({ el, lines: null })

/** The goal's text field and its Cancel, in the terminal and desktop looks. */
export function paneGoalField(
  {
    e,
    look,
    Box,
    Input,
    drafts,
    listColumns,
    statusMarkAt,
    keyRow,
  }: Pick<PaneBase, 'e' | 'look' | 'Box' | 'Input' | 'drafts' | 'listColumns'> &
    Pick<PaneStatusLines, 'statusMarkAt'> &
    Pick<PaneRowKeys, 'keyRow'>,
  { editDraft, closeField, sendTyped }: Pick<PaneHandlers, 'editDraft' | 'closeField' | 'sendTyped'>,
  muted: (key: string, text: string) => Drawn,
) {
  /** Closes the field and keeps its draft. A suggested goal the field was opened from shows again. */
  const cancel: KeyAction = {
    key: `cancel-${GOAL_KEYS_ID}`,
    label: 'Cancel',
    kind: 'view',
    onPress: () => void closeField(GOAL_KEYS_ID),
  }
  const submitLabel = (page: StatusPage) =>
    look === 'desktop' ? goalSubmitLabel(page) : goalSubmitLabel(page).toLowerCase()
  /** The terminal draws `⏎` and the submit label beside a field `inset` cells in from the head's column. */
  const terminalFieldColumns = (inset: number, label: string) =>
    listColumns - statusMarkAt - inset - cellWidth(`⏎ ${label}`) - 1
  /** A terminal field that passes one row takes all `REPLY_ROWS`, as the reply field does in `paneRows`. */
  const fieldRowCount = (text: string, inset: number, label: string) => {
    if (look === 'desktop')
      return fieldRows(text, line => desktopLines(line, DESKTOP_FIELD_PT).length, DESKTOP_REPLY_ROWS)
    const fitsOneRow = fieldRows(text, line => lineCount(line, terminalFieldColumns(inset, label)), REPLY_ROWS) === 1
    return fitsOneRow ? 1 : REPLY_ROWS
  }
  const goalInput = (Field: NonNullable<typeof Input>, inset: number, label: string) => (
    <Field
      key={fieldKey(GOAL_KEYS_ID)}
      placeholder={GOAL_FIELD.placeholder}
      {...(openFields.get(GOAL_KEYS_ID)?.seed ? { value: openFields.get(GOAL_KEYS_ID)?.seed } : {})}
      submitLabel={label}
      autoFocus
      rows={fieldRowCount(drafts[GOAL_KEYS_ID]?.text ?? openFields.get(GOAL_KEYS_ID)?.seed ?? '', inset, label)}
      onInput={(value: string) => void editDraft(GOAL_KEYS_ID, value)}
      onSubmit={(value: string, submit: { surface: UiPressArgument['surface'] }) =>
        sendTyped(GOAL_KEYS_ID, value, submit.surface)
      }
    />
  )
  /**
   * The goal's text field, as many rows tall as `fieldRowCount` gives. Submitting sets the typed goal. When the prompt
   * kept the keys, a line under it says to click it.
   */
  const fieldInput = (inset: number, page: StatusPage): Drawn[] =>
    Input === null
      ? []
      : [
          uncounted(
            look === 'terminal' ? (
              <Box key="goal-field" width={e.props.bodyColumns - inset} flexShrink={0}>
                {goalInput(Input, inset, submitLabel(page))}
              </Box>
            ) : (
              goalInput(Input, inset, submitLabel(page))
            ),
          ),
          ...(paneState.fieldWithoutKeys === GOAL_KEYS_ID ? [muted('goal-field-click', ROW_COPY.clickField)] : []),
        ]
  const fieldKeys = (): Drawn[] =>
    Input === null ? [] : [uncounted(<Box key="goal-field-keys">{keyRow(`${GOAL_KEYS_ID}-field`, [cancel])}</Box>)]
  /** The goal's field and its keys, `inset` cells in from the head's column: the mark column under a met goal. */
  const field = (inset: number, page: StatusPage) => [...fieldInput(inset, page), ...fieldKeys()]

  return { field }
}
