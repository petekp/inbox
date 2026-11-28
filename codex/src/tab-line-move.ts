import { lineMoveShare, LINE_MOVE_MS } from '../../core/view/row-motion'
import { otherListKey } from './tab-motion-keys'
import { drawnRows, tabState } from './tab-state'
import { later } from './tab-host'

/** A move under way: the keys of its two rows, and what ends it. */
type Move = { toKey: string; fromKey: string; end: () => void }

const moves = new Set<Move>()

const depthOf = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--depth')) || 0

/**
 * Moves each Status row that enters in this draw while the row for the same line in the other list leaves, such as a
 * subject Remove on the goal takes out of the goal's milestones, to its place from the leaving row's box. The two rows
 * read as one line. A copy of the entering row is drawn over the page at the leaving row's box and, after `waitMs`, the
 * wait of a block that leaves, moves to the entering row's own box on the height spring, its depth moving with it, so
 * its mark, text and tree lines travel together. The rows themselves stay hidden until it arrives. A row that enters
 * by itself is not moved. A draw that changes either row of a move under way ends that move, so a line turned back
 * never stays hidden and never draws two copies.
 */
export function moveLines(els: HTMLElement[], changed: ReadonlySet<string>, waitMs: number) {
  for (const move of moves) if (changed.has(move.toKey) || changed.has(move.fromKey)) move.end()
  for (const el of els) {
    const key = el.dataset.motion
    const fromKey = key === undefined ? null : otherListKey(key)
    if (key === undefined || fromKey === null || !changed.has(key)) continue
    if (drawnRows.get(key)?.track.state !== 'entering' || drawnRows.get(fromKey)?.track.state !== 'leaving') continue
    const from = els.find(other => other.dataset.motion === fromKey)
    if (from) moveLine({ el, key }, { el: from, key: fromKey }, waitMs)
  }
}

type End = { el: HTMLElement; key: string }

function moveLine(to: End, from: End, waitMs: number) {
  const fromDepth = depthOf(from.el)
  const toDepth = depthOf(to.el)
  const copy = to.el.cloneNode(true) as HTMLElement
  copy.removeAttribute('data-motion')
  copy.setAttribute('inert', '')
  copy.setAttribute('aria-hidden', 'true')
  copy.style.cssText += ';position:absolute;margin:0;opacity:1;pointer-events:none;transform:none;height:auto'
  const list = document.createElement('div')
  list.className = 'list'
  list.style.cssText = 'position:absolute;inset:0'
  list.appendChild(copy)
  const layer = document.createElement('div')
  layer.className = 'status-page'
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;padding:0;margin:0;background:none'
  layer.appendChild(list)
  document.body.appendChild(layer)
  to.el.style.visibility = 'hidden'
  from.el.style.visibility = 'hidden'
  const startedAt = Date.now() + waitMs
  let last = from.el.getBoundingClientRect()
  let isEnded = false

  const move: Move = {
    toKey: to.key,
    fromKey: from.key,
    end: () => {
      if (isEnded) return
      isEnded = true
      moves.delete(move)
      layer.remove()
      to.el.style.visibility = ''
      from.el.style.visibility = ''
    },
  }
  moves.add(move)
  later(move.end, waitMs + LINE_MOVE_MS + 100)
  const frame = () => {
    if (isEnded) return
    const share = lineMoveShare(Date.now() - startedAt)
    if (tabState.isDisposed || !to.el.isConnected || share >= 1) return move.end()
    if (from.el.isConnected) last = from.el.getBoundingClientRect()
    const box = to.el.getBoundingClientRect()
    copy.style.left = `${box.left}px`
    copy.style.width = `${box.width}px`
    copy.style.top = `${last.top + (box.top - last.top) * share}px`
    copy.style.setProperty('--depth', String(fromDepth + (toDepth - fromDepth) * share))
    requestAnimationFrame(frame)
  }
  frame()
}
