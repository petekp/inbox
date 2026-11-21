import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { countsText, countsUnits } from '../core/view/status-folds'
import Fold, { type FoldProps } from '../hooks/pane/fold-client'

type Node = { texts?: string[]; width?: number; children?: unknown }

function draw(props: FoldProps): unknown {
  const surface = {
    state: undefined,
    columns: 20,
    rows: 1,
    onPointer: () => undefined,
    setState: () => undefined,
    post: () => undefined,
    elements: {
      Box: (p: { width?: number; children?: unknown[] }) => ({ width: p.width, children: p.children }),
      Text: (p: { children: string }) => ({ texts: [p.children] }),
    },
  }

  return Fold(props, surface as never)
}

function collect(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collect)
  if (!node || typeof node !== 'object') return []
  const n = node as Node
  return [...(n.texts ?? []), ...collect(n.children)]
}

const textsOf = (props: FoldProps) => collect(draw(props))

function firstWidth(node: unknown): number | undefined {
  if (Array.isArray(node)) return node.map(firstWidth).find(w => w !== undefined)
  if (!node || typeof node !== 'object') return undefined
  const n = node as Node
  return n.width ?? firstWidth(n.children)
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

test('a counts fold wraps between units with the dot ending a line, never starting one', () => {
  const counts = [
    { mark: '●', text: '3 working', tone: null },
    { mark: '◌', text: '3 waiting', tone: null },
    { mark: '◐', text: '2 paused', tone: null },
  ] as never
  const units = countsUnits(counts)
  const texts = units.map(unit => unit.map(part => part.text).join(''))
  expect(texts.slice(1).every(t => !t.startsWith('·') && !t.startsWith(' '))).toBe(true)
  expect(texts.slice(1, -1).every(t => t.endsWith('\u00a0· '))).toBe(true)
  expect(texts.slice(1).every(t => !t.trimEnd().includes(' '))).toBe(true)
  expect(texts.at(-1)).not.toMatch(/·/)
  expect(texts.join('').replaceAll('\u00a0', ' ')).toBe(countsText(counts))
})

test('a fold on a Status line widens its mark column by a cell, as a Status row does, and draws the line’s mark there', () => {
  const plain = { ...BASE, label: 'Glances found by gaze', isUnfolded: false, chevron: '›' }
  expect(firstWidth(draw(plain))).toBe(BASE.markCells)
  expect(firstWidth(draw({ ...plain, status: { mark: null } }))).toBe(BASE.markCells + 1)
  const milestone = draw({ ...plain, status: { mark: { text: '✓', color: null } } })
  expect(firstWidth(milestone)).toBe(BASE.markCells + 1)
  expect(collect(milestone)[0]).toBe('✓')
})
