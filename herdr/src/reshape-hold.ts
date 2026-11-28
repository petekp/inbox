import type { Block } from './blocks'

/** The blocks that hang in the Status tree: a line, a note such as "+ 2 more" under a subject's children, and a done fold. */
const isTreeKind = (b: Block): b is Extract<Block, { kind: 'status' | 'note' | 'fold' }> =>
  b.kind === 'status' || b.kind === 'note' || b.kind === 'fold'

/** Whether a block's place in the Status tree changes: its depth, its connectors or its path. */
export const isReshaped = (was: Block, b: Block): boolean =>
  isTreeKind(was) &&
  isTreeKind(b) &&
  was.kind === b.kind &&
  (was.depth !== b.depth || JSON.stringify([was.tree, was.path]) !== JSON.stringify([b.tree, b.path]))

/**
 * Whether a block in the Status tree keeps its last form, `was`, in this draw, in place of `b`: while a block that
 * leaves holds its space (`isHolding`), a block whose place in the tree changes waits, so its connectors move once the
 * leaving lines fade.
 */
export const holdsShape = (was: Block, b: Block, isHolding: boolean): boolean => isHolding && isReshaped(was, b)
