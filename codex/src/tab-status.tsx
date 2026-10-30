import { RowActions } from './row-actions'
import { mergedLine, nameBeforeStall, STATUS_TEXT_LINES, statusKeyPlan, STALL_GAP, WAS_PREFIX } from '../../hooks/view'
import type { StatusPage, StatusRow, StatusStall } from '../../hooks/view'
import { tabState } from './tab-state'
import type { Key } from './tab-state'
import { revealSelected } from './tab-motion'
import { switchTab, open } from './tab-selection'
import { tabRows } from './tab-rows'
import { pulseInStep, markClassOf } from './tab-parts'

let measuring: CanvasRenderingContext2D | null | undefined

/** Writes a subject's merged line into `el`, cut at a phrase to the one line `el` has room for. */
function fitMergedLine(el: HTMLElement | null, merged: string) {
  if (!el) return
  measuring ??= document.createElement('canvas').getContext('2d')
  const measure = measuring
  if (measure) measure.font = getComputedStyle(el).font
  el.textContent = mergedLine(merged, text => !measure || measure.measureText(text).width <= el.clientWidth)
}

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
function NameLine({ name, stall }: { name: string; stall: StatusStall | null }) {
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

/** A Status row's View press: Asks shows with the ask selected and in view. */
function showAsk(askId: string) {
  switchTab('needsYou')
  const index = tabState.view ? tabRows(tabState.view, 'needsYou').findIndex(r => r.id === askId) : -1
  open('needsYou', askId, index < 0 ? undefined : index)
  tabState.draw()
  revealSelected()
}

function StatusLine({ row }: { row: StatusRow }) {
  if (row.kind === 'subject') {
    const merged = row.merged
    const keys = statusKeyPlan(row).map((k): Key => ({
      label: k.label,
      emphasis: 'normal',
      run: () => showAsk(k.press.askId),
    }))

    return (
      <div class={row.hasChildren ? 'row has-children' : 'row'}>
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          {row.mark}
        </span>
        <div class="content tight">
          <NameLine name={row.name} stall={row.stall} />
          {row.text ? (
            <div class="muted clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
              {row.text}
            </div>
          ) : null}
          {merged ? (
            <div
              class="outcome muted clamp"
              style={{ '--lines': STATUS_TEXT_LINES }}
              ref={el => fitMergedLine(el, merged)}
            />
          ) : null}
          {row.was ? (
            <div class="outcome muted clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
              {WAS_PREFIX}
              {row.was}
            </div>
          ) : null}
          {keys.length > 0 ? <RowActions keys={keys} more={[]} reply={null} isBlocked={() => false} /> : null}
        </div>
      </div>
    )
  }
  if (row.kind === 'child')
    return (
      <div class={row.branch ? `row child branch-${row.branch}` : 'row'}>
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          {row.mark}
        </span>
        <div class="content tight muted">
          <NameLine name={row.name} stall={row.stall} />
        </div>
      </div>
    )
  if (row.kind === 'more')
    return (
      <div class={`row child branch-${row.branch}`}>
        <span class="mark" />
        <div class="content tight muted">{row.text}</div>
      </div>
    )
  if (row.kind === 'look')
    return (
      <div class={`row look-line${row.isLast ? ' last' : ''}`}>
        <div class="look-rule">{row.text}</div>
      </div>
    )

  return (
    <div class="row">
      <span class={markClassOf(row.tone, false)}>{row.mark}</span>
      <div class="content tight muted">{row.text}</div>
    </div>
  )
}

export function StatusTab({ page }: { page: StatusPage }) {
  if (page.isEmpty)
    return (
      <div class="empty">
        <div class="title">{page.empty.title}</div>
        <div class="muted">{page.empty.hint}</div>
      </div>
    )

  return (
    <main class="status-page">
      {page.head ? (
        <section>
          <div class="status-head">
            <h1>{page.head.title}</h1>
            {page.head.description ? <p class="muted">{page.head.description}</p> : null}
          </div>
        </section>
      ) : null}
      {page.rows.length > 0 ? (
        <section>
          <div class="list">
            {page.rows.flatMap(r => [
              ...(r.isRuledAbove ? [<div key={`rule-${r.id}`} class="status-rule" />] : []),
              <StatusLine key={r.id} row={r} />,
            ])}
          </div>
        </section>
      ) : null}
    </main>
  )
}
