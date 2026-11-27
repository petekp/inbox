import type { Block } from './blocks'

/** Whether a Status line's place in the tree changes: its depth, its connectors or its path. */
const isReshaped = (was: Block, b: Block): boolean =>
  was.kind === 'status' &&
  b.kind === 'status' &&
  (was.depth !== b.depth || JSON.stringify([was.tree, was.path]) !== JSON.stringify([b.tree, b.path]))

/**
 * Whether a Status line keeps its last form, `was`, in this draw, in place of `b`: while a block that leaves holds its
 * space (`isHolding`), a line whose place in the tree changes waits, so its connectors move once the leaving lines fade.
 */
export const holdsShape = (was: Block, b: Block, isHolding: boolean): boolean => isHolding && isReshaped(was, b)
