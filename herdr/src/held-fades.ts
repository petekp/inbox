/** An opacity fade as the look hands it to gpui-kit: the opacity it goes to and how long it takes. */
type Handed = { opacity: number; ms: number }

type Held = { handed: Handed; waiting: (Handed & { at: number }) | null; drawnIn: number }

/**
 * The fades the look draws, by name, held so that gpui-kit never gets a delay. gpui-kit starts a fade whose target
 * changes during its delay from where the fade would be with no delay, so a fade taken back before it starts would
 * show near its target. So a fade with a delay keeps its former target until the delay ends, and then starts.
 */
export class HeldFades {
  private held = new Map<string, Held>()
  private draw = 0

  /** The fade to hand gpui-kit for `name` in the draw at `now`. Each element that shares a name gets the same fade. */
  fade(name: string, opacity: number, ms: number, delayMs: number, now: number): Handed {
    const next = nextHeld(this.held.get(name), { opacity, ms }, delayMs, now)
    this.held.set(name, { ...next, drawnIn: this.draw })

    return next.handed
  }

  /** Ends a draw. Forgets each fade it did not draw, and gives when the next held fade starts, or null. */
  drew(): number | null {
    for (const [name, h] of this.held) if (h.drawnIn !== this.draw) this.held.delete(name)
    this.draw += 1
    const starts = [...this.held.values()].flatMap(h => (h.waiting ? [h.waiting.at] : []))

    return starts.length === 0 ? null : Math.min(...starts)
  }
}

function nextHeld(was: Held | undefined, to: Handed, delayMs: number, now: number): Omit<Held, 'drawnIn'> {
  if (!was) return { handed: to, waiting: null }
  if (to.opacity === was.handed.opacity) return { handed: was.handed, waiting: null }
  const waiting = was.waiting
  if (waiting && to.opacity === waiting.opacity)
    return now >= waiting.at ? { handed: { opacity: waiting.opacity, ms: waiting.ms }, waiting: null } : was
  if (delayMs <= 0) return { handed: to, waiting: null }

  return { handed: was.handed, waiting: { ...to, at: now + delayMs } }
}
