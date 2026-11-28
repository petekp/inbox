import type { Painted } from './gpui-stand-in'
import type { Box } from './layout'

const { easeOut } = await import('../src/panel-steps')

const STROKE = /^(stroke |space path |space column )/

type Fade = { shown: number; from: number; target: number; elapsed: number; duration: number }

export type StrokeShown = { at: number; id: string; opacity: number }

export class StrokeFades {
  private states = new Map<string, Fade>()
  private nodes = new Map<string, Painted>()

  declare(root: Painted) {
    const seen = new Set<string>()
    const walk = (n: Painted) => {
      if (n.id !== null && STROKE.test(n.id)) {
        seen.add(n.id)
        this.nodes.set(n.id, n)
        const to = n.style.opacity ?? 1
        const duration = n.transitions.get('opacity') ?? 0
        const state = this.states.get(n.id)
        if (!state || duration === 0)
          this.states.set(n.id, { shown: to, from: to, target: to, elapsed: duration, duration })
        else if (to !== state.target)
          this.states.set(n.id, { shown: state.shown, from: state.shown, target: to, elapsed: 0, duration })
      }
      n.kids.forEach(walk)
    }
    walk(root)
    for (const id of [...this.states.keys()]) if (!seen.has(id)) this.states.delete(id)
    for (const id of [...this.nodes.keys()]) if (!seen.has(id)) this.nodes.delete(id)
  }

  shownIn(placed: Map<Painted, Box>, at: number): StrokeShown[] {
    return [...this.states].flatMap(([id, s]) => {
      const node = this.nodes.get(id)
      const box = node?.parent ? placed.get(node.parent) : undefined
      if (!node || !box) return []
      const top = Number(node.style.top ?? 0)
      const height =
        node.style.h === undefined ? box.height - top - Number(node.style.bottom ?? 0) : Number(node.style.h)

      return height > 0 ? [{ at, id, opacity: s.shown }] : []
    })
  }

  step(ms: number) {
    for (const s of this.states.values()) {
      s.elapsed = Math.min(s.duration, s.elapsed + ms)
      const done = s.duration > 0 ? s.elapsed / s.duration : 1
      s.shown = s.from + (s.target - s.from) * easeOut(done)
    }
  }
}
