import type { AnswerRow } from '../../core/view/action-plan'
import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import type { KeyAction } from './pane-keys'
import { terminalLabelCells } from './pane-row-keys'
import type { RowPart } from '../../core/view/row-parts'
import type { RowView } from '../../core/view/rows'
import type { TreePos } from './terminal-text'

/** Cells the terminal's tree takes in front of a branch's text: the glyph, its dash and a space. */
const TREE_TEXT_INDENT = 3

/** `lead` draws muted before `label`, which then draws bold, as the earlier answer's line reads "You answered **Flick**". */
export type AskEntry = {
  key: string
  part: Extract<RowPart, 'holdsUp' | 'context' | 'earlier' | 'answer' | 'note' | 'answers' | 'reason'>
  pos: TreePos | null
  lead?: string
  label: string
  rest: string
  /** An answer, drawn as its button in place of `label`. */
  option?: KeyAction
  /** The answers side by side, drawn as their buttons on one line in place of `label`. */
  options?: KeyAction[]
  /** The answer this line is the note of, which it nests under at the answer's label. */
  noteOf?: KeyAction
}

/**
 * An open question's or task's Holds up line, context, earlier answer and option lines, in that order. In the terminal
 * they hang from the row's ◆ or □ on one connector: the Holds up line and each option on a branch, the context and earlier
 * answer beside it. Answers that `answerRow` lets sit side by side and that fit `width` share one branch, with the
 * recommendation's reason under them. `askEntries` gives desktop the same entries, which it draws on its own hairline
 * pieces.
 */
export function paneAskTree(
  { look, Box, Text, pal, space }: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'space'>,
  { branch }: Pick<PaneRowLines, 'branch'>,
  keyedButton: (rowId: string, isFollowUp?: boolean, width?: number) => (action: KeyAction) => JSX.Element,
  answersFit: (answers: KeyAction[], width: number) => boolean,
) {
  const sideBySide = (answers: KeyAction[], recLine: string | null): AskEntry[] => [
    { key: 'options', part: 'answers', pos: 'mid', label: '', rest: '', options: answers },
    ...(recLine
      ? [
          {
            key: 'reason-options',
            part: 'reason' as const,
            pos: 'pass' as const,
            label: '',
            rest: recLine,
            noteOf: answers[0]!,
          },
        ]
      : []),
  ]
  const stacked = (answers: KeyAction[]) =>
    answers.flatMap((option, n): AskEntry[] => [
      { key: `option-${n}`, part: 'answer', pos: 'mid', label: option.label, rest: '', option },
      ...(option.note
        ? [
            {
              key: `reason-${n}`,
              part: 'note' as const,
              pos: 'pass' as const,
              label: '',
              rest: option.note,
              noteOf: option,
            },
          ]
        : []),
    ])
  const entriesOf = (view: RowView, answers: KeyAction[], answerRow: AnswerRow | null, width: number): AskEntry[] => {
    if (view.type === 'finding' || view.state.is !== 'open') return []
    const options = answerRow && answersFit(answers, width) ? sideBySide(answers, answerRow.recLine) : stacked(answers)
    const holdsUp = view.state.is === 'open' && view.holdsUpLine ? view.holdsUpLine : null
    const context: AskEntry[] = view.contextLine
      ? [{ key: 'context', part: 'context', pos: null, label: '', rest: view.contextLine }]
      : []
    const earlier = view.earlierLine
    if (earlier)
      context.push({
        key: 'earlier',
        part: 'earlier',
        pos: null,
        lead: earlier.lead,
        label: earlier.answer,
        rest: earlier.rest,
      })
    const head = holdsUp
      ? [{ key: 'holds-up', part: 'holdsUp' as const, pos: 'mid' as const, label: '', rest: holdsUp }]
      : []
    const hasTree = [...head, ...options].some(b => b.pos === 'mid')

    return [...head, ...context, ...options].map((b, n, all): AskEntry => {
      if (!hasTree) return { ...b, pos: null }
      const isLast = all.findLastIndex(x => x.pos === 'mid') === n
      const isAfterLast = n > all.findLastIndex(x => x.pos === 'mid')

      return b.pos === 'mid' && isLast
        ? { ...b, pos: 'last' }
        : isAfterLast
          ? { ...b, pos: null }
          : b.pos === null
            ? { ...b, pos: 'pass' }
            : b
    })
  }
  const hasTree = (view: RowView, answers: KeyAction[]) =>
    look === 'terminal' && entriesOf(view, answers, null, Infinity).some(e => e.pos !== null)
  /**
   * Draws `entries` from `entriesOf`, each `partSpace` under the part above it, the first under the title. `width` is the
   * cells of the row's text column, which an answer's label wraps to.
   */
  const askTree = (
    viewId: string,
    entries: AskEntry[],
    width: number,
    partSpace: (above: RowPart, below: AskEntry['part']) => number,
  ) => {
    if (entries.length === 0) return null
    const isTree = entries.some(e => e.pos !== null)

    return (
      <Box flexDirection="column" marginLeft={isTree ? -TREE_TEXT_INDENT : 0}>
        {entries.map((e, n) => (
          <Box
            key={e.key}
            flexDirection="row"
            position="relative"
            overflow="hidden"
            marginTop={partSpace(entries[n - 1]?.part ?? 'title', e.part)}
          >
            {e.pos ? branch(e.pos, 0, 0, pal.selectionLine ?? pal.line, 0, `tree-${e.key}`) : null}
            <Box
              flexShrink={1}
              paddingLeft={(isTree ? TREE_TEXT_INDENT : 0) + (e.noteOf ? terminalLabelCells(e.noteOf) : 0)}
            >
              {e.options ? (
                <Box flexDirection="row" columnGap={space.buttonGap}>
                  {e.options.map(keyedButton(viewId, false, width))}
                </Box>
              ) : e.option ? (
                keyedButton(viewId, false, width)(e.option)
              ) : (
                <Text wrap="wrap">
                  {e.lead ? <Text color={pal.muted}>{e.lead}</Text> : null}
                  {e.label ? <Text bold={e.lead !== undefined}>{e.label}</Text> : null}
                  <Text color={pal.muted}>{e.rest}</Text>
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  return { askTree, askEntries: entriesOf, hasTree, treeTextIndent: TREE_TEXT_INDENT }
}
