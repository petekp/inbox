import { nameBeforeStall, STATUS_TEXT_LINES, STALL_GAP } from '../../hooks/status-page'
import type { StatusStall } from '../../hooks/status-page'

const STALL_CLASS: Record<StatusStall['tone'], string> = {
  needsYou: 'tone-needsYou',
  done: 'tone-done',
}

/** A name's words before its last, with the space after them, and its last word, which stays with the stall word. */
function nameParts(name: string): { head: string; last: string } {
  const at = name.lastIndexOf(' ')

  return at < 0 ? { head: '', last: name } : { head: name.slice(0, at + 1), last: name.slice(at + 1) }
}

/** Writes into a name line the name `nameBeforeStall` cuts so the line takes at most `STATUS_TEXT_LINES` lines. */
function fitNameLine(el: HTMLElement | null, name: string) {
  const flowEl = el?.querySelector<HTMLElement>('.flow')
  const headEl = el?.querySelector<HTMLElement>('.head')
  const lastEl = el?.querySelector<HTMLElement>('.last')
  if (!flowEl || !headEl || !lastEl) return
  const write = (shown: string) => {
    const { head, last } = nameParts(shown)
    headEl.textContent = head
    lastEl.textContent = last
  }
  const range = document.createRange()
  range.selectNodeContents(flowEl)
  const lineCount = () => new Set([...range.getClientRects()].map(r => Math.round(r.top))).size
  write(
    nameBeforeStall(name, shown => {
      write(shown)
      return lineCount() <= STATUS_TEXT_LINES
    }),
  )
}

/**
 * A row's name with its stall word after `STALL_GAP` in the stall's tone, on the line of the name's last word, which a
 * wrap never splits from them.
 */
export function NameLine({ name, stall }: { name: string; stall: StatusStall | null }) {
  if (!stall)
    return (
      <div class="clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
        {name}
      </div>
    )
  const { head, last } = nameParts(name)

  return (
    <div ref={el => fitNameLine(el, name)}>
      <span class="flow">
        <span class="head">{head}</span>
        <span class="unbroken">
          <span class="last">{last}</span>
          <span class="muted">{STALL_GAP}</span>
          <span class={STALL_CLASS[stall.tone]}>{stall.text}</span>
        </span>
      </span>
    </div>
  )
}
