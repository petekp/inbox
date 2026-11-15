import { Icon, RowActions } from './row-actions'
import { mergedLine, seenSubjectIds, STATUS_TEXT_LINES, STALL_GAP, WAS_PREFIX } from '../../hooks/status-page'
import { GOAL_KEYS_ID, statusKeyPlan } from '../../hooks/status-keys'
import type { StatusKey } from '../../hooks/status-keys'
import type { StatusRow } from '../../hooks/status-page'
import { closingFolds, drafts, sending, statusUnfolded, tabState } from './tab-state'
import type { Key } from './tab-state'
import { act } from './tab-rows'
import { NameLine } from './tab-status-name'
import { SUBJECTS_ATTRIBUTE } from './tab-shown'
import { revealSelected, toggleFold } from './tab-motion'
import { switchTab, open } from './tab-selection'
import { tabRows } from './tab-rows'
import { pulseInStep, markClassOf, MarkGlyph } from './tab-parts'
import { lineMotion } from './tab-line-steps'

let measuring: CanvasRenderingContext2D | null | undefined

/** Writes a subject's merged line into `el`, cut at a phrase to the one line `el` has room for. */
function fitMergedLine(el: HTMLElement | null, merged: string) {
  if (!el) return
  measuring ??= document.createElement('canvas').getContext('2d')
  const measure = measuring
  if (measure) measure.font = getComputedStyle(el).font
  el.textContent = mergedLine(merged, text => !measure || measure.measureText(text).width <= el.clientWidth)
}

/** A Status row's View press: Asks shows with the ask selected and in view. */
function showAsk(askId: string) {
  switchTab('needsYou')
  const index = tabState.view ? tabRows(tabState.view, 'needsYou').findIndex(r => r.id === askId) : -1
  open('needsYou', askId, index < 0 ? undefined : index)
  tabState.draw()
  revealSelected()
}

/** Opens the goal's field with `text` in it, as a fresh draft. */
function openGoalField(text: string) {
  drafts.set(GOAL_KEYS_ID, { text, since: tabState.view?.at ?? Date.now() })
  tabState.typing = GOAL_KEYS_ID
  tabState.focusTyping = true
  tabState.draw()
}

/** A Status key as a tab key. Remove goal draws out while the goal's press is on its way. */
function statusKey({ press, label, emphasis }: StatusKey): Key {
  if (press.action === 'show-ask') return { label, emphasis, run: () => showAsk(press.askId) }
  if (press.action === 'toggle-fold') return { label, emphasis, run: () => toggleStatusFold(press.foldId) }
  if (press.action === 'type-goal') return { label, emphasis, run: () => openGoalField(press.text) }

  return {
    label,
    emphasis,
    ...(sending.has(GOAL_KEYS_ID) ? { isOut: true } : {}),
    run: () => void act(GOAL_KEYS_ID, { action: press.action, id: GOAL_KEYS_ID }),
  }
}

/** The motion key of a done fold's list, apart from the Asks groups' Closed lists. */
export const foldMotion = (id: string) => `status-${id}`

export function toggleStatusFold(id: string) {
  toggleFold(id, statusUnfolded, foldMotion(id))
}

/** A row's depth, which the Status CSS reads to step the row in and to place its tree line. */
const depthStyle = (row: StatusRow) => ({ '--depth': row.depth })

export function StatusLine({ row, motion }: { row: StatusRow; motion?: string }) {
  if (row.kind === 'subject') {
    const merged = row.merged
    const keys = statusKeyPlan(row).map(statusKey)

    return (
      <div
        class={row.hasChildren ? 'row has-children' : 'row'}
        style={depthStyle(row)}
        {...{ [SUBJECTS_ATTRIBUTE]: row.id }}
        {...lineMotion(motion)}
      >
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          <MarkGlyph text={row.mark} />
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
      <div
        class={row.branch ? `row child branch-${row.branch}` : 'row'}
        style={depthStyle(row)}
        {...lineMotion(motion)}
      >
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          <MarkGlyph text={row.mark} />
        </span>
        <div class="content tight muted">
          <NameLine name={row.name} stall={row.stall} />
        </div>
      </div>
    )
  if (row.kind === 'more')
    return (
      <div class={`row child branch-${row.branch}`} style={depthStyle(row)} {...lineMotion(motion)}>
        <span class="mark" />
        <div class="content tight muted">{row.text}</div>
      </div>
    )
  if (row.kind === 'done-fold') {
    const isUnfolded = statusUnfolded.has(row.id)
    const fold = foldMotion(row.id)

    return (
      <>
        <div class="row fold-row" style={depthStyle(row)} {...lineMotion(motion)}>
          <button type="button" class="fold" data-fold={fold} onClick={() => toggleStatusFold(row.id)}>
            <Icon name={isUnfolded ? 'down' : 'right'} />
            {row.text}
          </button>
        </div>
        {isUnfolded || closingFolds.has(fold) ? (
          <div class="fold-rows" data-motion={`closed-${fold}`}>
            {row.rows.map(r => (
              <StatusLine key={r.id} row={r} />
            ))}
          </div>
        ) : null}
      </>
    )
  }
  if (row.kind === 'part')
    return (
      <div class="row part-line" {...lineMotion(motion)}>
        <div class="part-rule">{row.text}</div>
      </div>
    )
  if (row.kind === 'counts')
    return (
      <div class="row" style={depthStyle(row)} {...lineMotion(motion)}>
        <span class="mark" />
        <div class="content tight">
          <div>
            {row.counts.map((c, n) => (
              <span key={n}>
                {n > 0 ? <span class="muted">{STALL_GAP}</span> : null}
                <span class={markClassOf(c.tone, false)}>
                  <MarkGlyph text={c.mark} />
                </span>
                <span class="muted"> {c.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    )

  const subjects = seenSubjectIds(row)

  return (
    <div
      class="row"
      style={depthStyle(row)}
      {...(subjects.length > 0 ? { [SUBJECTS_ATTRIBUTE]: subjects.join(' ') } : {})}
      {...lineMotion(motion)}
    >
      <span class={markClassOf(row.tone, false)}>
        <MarkGlyph text={row.mark} />
      </span>
      <div class="content tight muted">{row.text}</div>
    </div>
  )
}

export function Keys({ keys }: { keys: StatusKey[] }) {
  return keys.length > 0 ? (
    <RowActions keys={keys.map(statusKey)} more={[]} reply={null} isBlocked={() => false} />
  ) : null
}
