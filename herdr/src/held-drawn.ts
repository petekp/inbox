import type { Block } from './blocks'
import type { LinesAbove } from './held-line'
import type { RowMotion } from './motion'

/**
 * The lines to hold at the next draw, after `held` gave the lines and blocks for this draw from `last`, and motion
 * drew `moved`. A row that motion drew in its last form, as one that waits for a closing panel to open, keeps what it
 * held in that form. So does a closing row while its panel holds, as `titleLineEls` then draws the lines of the form it
 * closes from. So a line that lets go as the row's form changes starts to fade in the draw its new form shows.
 */
export function heldAsDrawn(
  held: { blocks: Block[]; held: LinesAbove },
  last: LinesAbove,
  moved: { blocks: Block[]; motion: ReadonlyMap<string, RowMotion> },
): LinesAbove {
  const given = new Map(held.blocks.map(b => [b.id, b]))
  const isClosingHeld = (m: RowMotion | undefined) => m !== undefined && m.closing !== null && !m.isPanelLeftOut
  const isKept = (b: Block) => given.get(b.id) !== b || isClosingHeld(moved.motion.get(b.id))
  const keys = moved.blocks.flatMap(b =>
    b.kind === 'row' && given.has(b.id) && isKept(b) ? [b.id, `settled ${b.id}`] : [],
  )
  if (keys.length === 0) return held.held
  const now = held.held
  const pick = <V>(to: ReadonlyMap<string, V>, from: ReadonlyMap<string, V>): Map<string, V> => {
    const out = new Map(to)
    for (const k of keys) {
      const v = from.get(k)
      if (v === undefined) out.delete(k)
      else out.set(k, v)
    }
    return out
  }
  const pickSet = (to: ReadonlySet<string>, from: ReadonlySet<string>): Set<string> => {
    const out = new Set(to)
    for (const k of keys)
      if (from.has(k)) out.add(k)
      else out.delete(k)
    return out
  }

  return {
    held: pick(now.held, last.held),
    lineless: pickSet(now.lineless, last.lineless),
    bare: pickSet(now.bare, last.bare),
    comes: pick(now.comes, last.comes),
    afterTitle: pick(now.afterTitle, last.afterTitle),
    goes: pick(now.goes, last.goes),
    bodies: pick(now.bodies, last.bodies),
    added: pick(now.added, last.added),
  }
}
