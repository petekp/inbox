import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import { optionBody, optionReasonLine, type RowView, shownOptionDescriptions } from './rows'
import type { TreePos } from './terminal-text'

/** Cells the terminal's tree takes in front of a branch's text: the glyph, its dash and a space. */
const TREE_TEXT_INDENT = 3

/** `lead` draws muted before `label`, which then draws bold, as the earlier answer's line reads "You answered **Flick**". */
export type AskEntry = { key: string; pos: TreePos | null; lead?: string; label: string; rest: string }

/**
 * An open question's or task's context, earlier answer, option lines and Holds up line. In the terminal they hang from
 * the row's ◆ on one connector: the context and earlier answer beside it, each option and the Holds up line, the last,
 * on a branch. `askEntries`
 * gives desktop the same entries, which it draws on its own hairline pieces.
 */
export function paneAskTree(
  {
    look,
    Box,
    Text,
    pal,
    optionsShown,
    blankLine,
  }: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'optionsShown' | 'blankLine'>,
  { branch }: Pick<PaneRowLines, 'branch'>,
) {
  const entriesOf = (view: RowView): AskEntry[] => {
    if (view.type === 'finding' || view.state.is !== 'open') return []
    const options = shownOptionDescriptions(view, optionsShown.includes(view.id)).flatMap((o, n): AskEntry[] => {
      const body = optionBody(o)
      const reason = optionReasonLine(o)
      const first: AskEntry = { key: `option-${n}`, pos: 'mid', label: o.label, rest: body === null ? '' : `: ${body}` }

      return [
        first,
        ...(reason === null ? [] : [{ key: `reason-${n}`, pos: 'pass' as const, label: '', rest: reason }]),
      ]
    })
    const holdsUp = view.state.is === 'open' && view.holdsUpLine ? view.holdsUpLine : null
    const context: AskEntry[] = view.contextLine
      ? [{ key: 'context', pos: null, label: '', rest: view.contextLine }]
      : []
    const earlier = view.earlierLine
    if (earlier)
      context.push({ key: 'earlier', pos: null, lead: earlier.lead, label: earlier.answer, rest: earlier.rest })
    const tail = holdsUp ? [{ key: 'holds-up', pos: 'mid' as const, label: '', rest: holdsUp }] : []
    const branches = [...options, ...tail]
    const hasTree = branches.some(b => b.pos === 'mid')

    return [...context, ...branches].map((b, n, all): AskEntry => {
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
  const hasTree = (view: RowView) => look === 'terminal' && entriesOf(view).some(e => e.pos !== null)
  /** `isBridged` leaves the gap above the tree to the caller, which draws the trunk through it. */
  const askTree = (view: RowView, isBridged = false) => {
    const entries = entriesOf(view)
    if (entries.length === 0) return null
    const isTree = entries.some(e => e.pos !== null)

    return (
      <Box flexDirection="column" marginTop={isBridged ? 0 : blankLine} marginLeft={isTree ? -TREE_TEXT_INDENT : 0}>
        {entries.map(e => (
          <Box key={e.key} flexDirection="row" position="relative" overflow="hidden">
            {e.pos ? branch(e.pos, 0, 0, pal.selectionLine ?? pal.line, 0, `tree-${e.key}`) : null}
            <Box flexShrink={1} paddingLeft={isTree ? TREE_TEXT_INDENT : 0}>
              <Text wrap="wrap">
                {e.lead ? <Text color={pal.muted}>{e.lead}</Text> : null}
                {e.label ? <Text bold={e.lead !== undefined}>{e.label}</Text> : null}
                <Text color={pal.muted}>{e.rest}</Text>
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  return { askTree, askEntries: entriesOf, hasTree, treeTextIndent: TREE_TEXT_INDENT }
}
