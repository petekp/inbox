import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import Fold, { type FoldProps } from '../hooks/fold-client'

type Node = { texts?: string[]; children?: unknown }

function textsOf(props: FoldProps): string[] {
  const surface = {
    state: undefined,
    columns: 20,
    rows: 1,
    onPointer: () => undefined,
    setState: () => undefined,
    post: () => undefined,
    elements: {
      Box: (p: { children?: unknown[] }) => ({ children: p.children }),
      Text: (p: { children: string }) => ({ texts: [p.children] }),
    },
  }
  const collect = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(collect)
    if (!node || typeof node !== 'object') return []
    const n = node as Node
    return [...(n.texts ?? []), ...collect(n.children)]
  }

  return collect(Fold(props, surface as never))
}

const BASE = { markCells: 2, padY: 0, colors: { rest: null, text: null, hoverText: null } }

test('a fold draws its chevron after a no-break space, so a narrow pane wraps the chevron with the word before it', () => {
  const done = textsOf({ ...BASE, label: '107 done', isUnfolded: false, chevron: '›' })
  expect(done.join('')).toBe('107 done ›')
  const counts = textsOf({
    ...BASE,
    label: '',
    isUnfolded: true,
    chevron: 'v',
    units: [[{ text: '● 3 working', color: null }], [{ text: '◌ 3 waiting', color: null }]],
  })
  expect(counts.at(-1)).toBe(' v')
  expect(counts.join('')).not.toMatch(/ [›v]/)
})
