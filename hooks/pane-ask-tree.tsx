import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import type { KeyAction } from './pane-keys'
import type { RowView } from './rows'
import type { TreePos } from './terminal-text'

/** Cells the terminal's tree takes in front of a branch's text: the glyph, its dash and a space. */
const TREE_TEXT_INDENT = 3

/** `lead` draws muted before `label`, which then draws bold, as the earlier answer's line reads "You answered **Flick**". */
export type AskEntry = {
  key: string
  pos: TreePos | null
  lead?: string
  label: string
  rest: string
  /** An answer, drawn as its button in place of `label`. */
  option?: KeyAction
}

/**
 * An open question's or task's Holds up line, context, earlier answer and option lines, in that order. In the terminal
 * they hang from the row's ◆ on one connector: the Holds up line and each option on a branch, the context and earlier
 * answer beside it. `askEntries` gives desktop the same entries, which it draws on its own hairline pieces.
 */
export function paneAskTree(
  { look, Box, Text, pal }: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal'>,
  { branch }: Pick<PaneRowLines, 'branch'>,
  keyedButton: (rowId: string) => (action: KeyAction) => JSX.Element,
) {
  const entriesOf = (view: RowView, answers: KeyAction[]): AskEntry[] => {
    if (view.type === 'finding' || view.state.is !== 'open') return []
    const options = answers.flatMap((option, n): AskEntry[] => {
      return [
        { key: `option-${n}`, pos: 'mid', label: option.label, rest: '', option },
        ...(option.note ? [{ key: `reason-${n}`, pos: 'pass' as const, label: '', rest: option.note }] : []),
      ]
    })
    const holdsUp = view.state.is === 'open' && view.holdsUpLine ? view.holdsUpLine : null
    const context: AskEntry[] = view.contextLine
      ? [{ key: 'context', pos: null, label: '', rest: view.contextLine }]
      : []
    const earlier = view.earlierLine
    if (earlier)
      context.push({ key: 'earlier', pos: null, lead: earlier.lead, label: earlier.answer, rest: earlier.rest })
    const head = holdsUp ? [{ key: 'holds-up', pos: 'mid' as const, label: '', rest: holdsUp }] : []
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
    look === 'terminal' && entriesOf(view, answers).some(e => e.pos !== null)
  const askTree = (view: RowView, answers: KeyAction[]) => {
    const entries = entriesOf(view, answers)
    if (entries.length === 0) return null
    const isTree = entries.some(e => e.pos !== null)

    return (
      <Box flexDirection="column" marginLeft={isTree ? -TREE_TEXT_INDENT : 0}>
        {entries.map(e => (
          <Box key={e.key} flexDirection="row" position="relative" overflow="hidden">
            {e.pos ? branch(e.pos, 0, 0, pal.selectionLine ?? pal.line, 0, `tree-${e.key}`) : null}
            <Box flexShrink={1} paddingLeft={isTree ? TREE_TEXT_INDENT : 0}>
              {e.option ? (
                keyedButton(view.id)(e.option)
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
