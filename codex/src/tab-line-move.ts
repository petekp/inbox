import { lineMoveShare } from '../../core/view/row-motion'
import { otherListKey } from './tab-motion-keys'
import { drawnRows, tabState } from './tab-state'

/** Rows whose move is under way. */
const moving = new WeakSet<HTMLElement>()

const depthOf = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--depth')) || 0

/**
 * Moves each Status row that enters in this draw while the row for the same line in the other list leaves, such as a
 * subject Remove on the goal takes out of the goal's milestones, to its place from the leaving row's box. The two rows
 * read as one line. A copy of the entering row is drawn over the page at the leaving row's box and moves to the
 * entering row's own box on the height spring, its depth moving with it, so its mark, text and tree lines travel
 * together. The rows themselves stay hidden until it arrives. A row that enters by itself is not moved.
 */
export function moveLines(els: HTMLElement[], changed: ReadonlySet<string>) {
  for (const el of els) {
    const key = el.dataset.motion
    const otherKey = key === undefined ? null : otherListKey(key)
    if (key === undefined || otherKey === null || !changed.has(key) || moving.has(el)) continue
    if (drawnRows.get(key)?.track.state !== 'entering' || drawnRows.get(otherKey)?.track.state !== 'leaving') continue
    const from = els.find(other => other.dataset.motion === otherKey)
    if (from) moveLine(el, from)
  }
}

function moveLine(to: HTMLElement, from: HTMLElement) {
  moving.add(to)
  const fromDepth = depthOf(from)
  const toDepth = depthOf(to)
  const copy = to.cloneNode(true) as HTMLElement
  copy.removeAttribute('data-motion')
  copy.setAttribute('inert', '')
  copy.setAttribute('aria-hidden', 'true')
  copy.style.cssText += ';position:absolute;left:0;margin:0;opacity:1;pointer-events:none;transform:none;height:auto'
  const list = document.createElement('div')
  list.className = 'list line-move-list'
  list.appendChild(copy)
  const layer = document.createElement('div')
  layer.className = 'status-page line-move'
  layer.appendChild(list)
  document.body.appendChild(layer)
  to.style.visibility = 'hidden'
  from.style.visibility = 'hidden'
  const startedAt = Date.now()
  let last = from.getBoundingClientRect()

  const end = () => {
    layer.remove()
    to.style.visibility = ''
  }
  const frame = () => {
    const share = lineMoveShare(Date.now() - startedAt)
    if (tabState.isDisposed || !to.isConnected || share >= 1) return end()
    if (from.isConnected) last = from.getBoundingClientRect()
    const box = to.getBoundingClientRect()
    list.style.left = `${box.left}px`
    list.style.width = `${box.width}px`
    copy.style.top = `${last.top + (box.top - last.top) * share}px`
    copy.style.setProperty('--depth', String(fromDepth + (toDepth - fromDepth) * share))
    requestAnimationFrame(frame)
  }
  frame()
}
