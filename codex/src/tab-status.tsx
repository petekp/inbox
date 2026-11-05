import { Icon, RowActions } from './row-actions'
import { mergedLine, STATUS_TEXT_LINES, STALL_GAP, WAS_PREFIX } from '../../hooks/status-page'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan, statusKeyPlan } from '../../hooks/status-keys'
import type { MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT } from '../../hooks/status-goal-page'
import { ROW_COPY } from '../../hooks/rows'
import type { StatusKey } from '../../hooks/status-keys'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { closingFolds, drafts, errors, sending, statusUnfolded, tabState } from './tab-state'
import type { Key } from './tab-state'
import { act } from './tab-rows'
import { NameLine } from './tab-status-name'
import { SUBJECT_ATTRIBUTE } from './tab-shown'
import { revealSelected, toggleFold } from './tab-motion'
import { switchTab, open } from './tab-selection'
import { tabRows } from './tab-rows'
import { pulseInStep, markClassOf, MarkGlyph } from './tab-parts'

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
const foldMotion = (id: string) => `status-${id}`

function toggleStatusFold(id: string) {
  toggleFold(id, statusUnfolded, foldMotion(id))
}

/** A row's depth, which the Status CSS reads to step the row in and to place its tree line. */
const depthStyle = (row: StatusRow) => ({ '--depth': row.depth })

function StatusLine({ row }: { row: StatusRow }) {
  if (row.kind === 'subject') {
    const merged = row.merged
    const keys = statusKeyPlan(row).map(statusKey)

    return (
      <div
        class={row.hasChildren ? 'row has-children' : 'row'}
        style={depthStyle(row)}
        {...{ [SUBJECT_ATTRIBUTE]: row.id }}
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
      <div class={row.branch ? `row child branch-${row.branch}` : 'row'} style={depthStyle(row)}>
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
      <div class={`row child branch-${row.branch}`} style={depthStyle(row)}>
        <span class="mark" />
        <div class="content tight muted">{row.text}</div>
      </div>
    )
  if (row.kind === 'done-fold') {
    const isUnfolded = statusUnfolded.has(row.id)
    const motion = foldMotion(row.id)

    return (
      <>
        <div class="row fold-row" style={depthStyle(row)}>
          <button type="button" class="fold" data-fold={motion} onClick={() => toggleStatusFold(row.id)}>
            <Icon name={isUnfolded ? 'down' : 'right'} />
            {row.text}
          </button>
        </div>
        {isUnfolded || closingFolds.has(motion) ? (
          <div class="fold-rows" data-motion={`closed-${motion}`}>
            {row.rows.map(r => (
              <StatusLine key={r.id} row={r} />
            ))}
          </div>
        ) : null}
      </>
    )
  }
  if (row.kind === 'look')
    return (
      <div class={`row look-line${row.isLast ? ' last' : ''}`} style={depthStyle(row)}>
        <div class="look-rule">{row.text}</div>
      </div>
    )
  if (row.kind === 'part')
    return (
      <div class="row part-line">
        <div class="part-rule">{row.text}</div>
      </div>
    )
  if (row.kind === 'counts')
    return (
      <div class="row" style={depthStyle(row)}>
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

  return (
    <div class="row" style={depthStyle(row)}>
      <span class={markClassOf(row.tone, false)}>
        <MarkGlyph text={row.mark} />
      </span>
      <div class="content tight muted">{row.text}</div>
    </div>
  )
}

/** The goal's text field, with Save and Cancel. It stays open, its buttons out, until the server confirms the goal. */
function GoalField() {
  const draft = () => drafts.get(GOAL_KEYS_ID)?.text ?? ''
  const isOut = sending.has(GOAL_KEYS_ID)

  return (
    <div class="actions">
      <form
        class="goal-field"
        onSubmit={e => {
          e.preventDefault()
          const text = draft().trim()
          if (!text || isOut) return
          const sent = drafts.get(GOAL_KEYS_ID)
          void act(GOAL_KEYS_ID, { action: 'type', id: GOAL_KEYS_ID, text }, () => {
            if (tabState.typing === GOAL_KEYS_ID) tabState.typing = null
            if (drafts.get(GOAL_KEYS_ID) === sent) drafts.delete(GOAL_KEYS_ID)
          })
        }}
      >
        <input
          id={`type-${GOAL_KEYS_ID}`}
          value={draft()}
          placeholder={GOAL_FIELD.placeholder}
          aria-label={GOAL_FIELD.placeholder}
          onInput={e =>
            drafts.set(GOAL_KEYS_ID, {
              text: e.currentTarget.value,
              since: drafts.get(GOAL_KEYS_ID)?.since ?? tabState.view?.at ?? Date.now(),
            })
          }
        />
        <span class="field-keys">
          <button type="submit" class={isOut ? 'key primary out' : 'key primary'} disabled={isOut}>
            {GOAL_FIELD.submit}
          </button>
          <button
            type="button"
            class={isOut ? 'key ghost out' : 'key ghost'}
            disabled={isOut}
            onClick={() => {
              tabState.typing = null
              tabState.draw()
            }}
          >
            {ROW_COPY.cancel}
          </button>
        </span>
      </form>
    </div>
  )
}

function Keys({ keys }: { keys: StatusKey[] }) {
  return keys.length > 0 ? (
    <RowActions keys={keys.map(statusKey)} more={[]} reply={null} isBlocked={() => false} />
  ) : null
}

function MilestoneLine({ m }: { m: MilestoneRow }) {
  return (
    <div class="row">
      <span class={markClassOf(m.tone, false)}>
        <MarkGlyph text={m.mark} />
      </span>
      <div class={m.isChanged ? 'content tight changed' : 'content tight'}>
        <NameLine name={m.name} stall={m.stall} />
        {m.text ? (
          <div class="muted clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
            {m.text}
          </div>
        ) : null}
        {m.was ? (
          <div class="outcome muted clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
            {WAS_PREFIX}
            {m.was}
          </div>
        ) : null}
        <Keys keys={milestoneKeyPlan(m)} />
      </div>
    </div>
  )
}

/**
 * The goal's section, first on every page that is not empty: its heading row, the title, a rule and the goal's buttons at
 * the right edge, then the goal's text with its was, Now and awaiting lines, or the line that says no goal is set, then
 * the milestones. While the person types a goal, the field takes the text's place and the buttons leave the heading.
 * The buttons wrap under the rule, still at the right, when they do not fit beside the title.
 */
function GoalSection({ page }: { page: StatusPage }) {
  const g = page.goal
  const isTyping = tabState.typing === GOAL_KEYS_ID
  const text = g ? (
    <h1>
      {g.text}
      {g.count ? (
        <span class="muted count">
          {STALL_GAP}
          {g.count}
        </span>
      ) : null}
    </h1>
  ) : (
    <p class="muted">{NO_GOAL_TEXT}</p>
  )

  return (
    <section>
      <div class="goal-heading">
        <span class="goal-title">{g?.label ?? GOAL_HEADING}</span>
        <span class="goal-rule" />
        {isTyping ? null : <Keys keys={goalKeyPlan(page)} />}
      </div>
      <div class="status-head goal">
        {isTyping ? <GoalField /> : text}
        {g?.was ? (
          <p class="muted">
            {WAS_PREFIX}
            {g.was}
          </p>
        ) : null}
        {g?.now ? <p class="muted">{g.now}</p> : null}
        {g?.awaiting ? <p class="muted">{g.awaiting}</p> : null}
        <GoalError />
      </div>
      {g && g.milestones.length > 0 ? (
        <div class="list">
          {g.milestones.flatMap(m => [
            <MilestoneLine key={m.id} m={m} />,
            ...m.rows.map(r => <StatusLine key={r.id} row={r} />),
          ])}
        </div>
      ) : null}
    </section>
  )
}

/** New, or the field it opened, under the empty page's centred text. */
function SetGoal({ page }: { page: StatusPage }) {
  return (
    <div class="status-head">
      {tabState.typing === GOAL_KEYS_ID ? <GoalField /> : <Keys keys={goalKeyPlan(page)} />}
      <GoalError />
    </div>
  )
}

/** Why the last goal press failed, drawn in the goal's section, or under New on the empty page. */
function GoalError() {
  const error = errors.get(GOAL_KEYS_ID)

  return error ? <p class="tone-error">{error}</p> : null
}

export function StatusTab({ page }: { page: StatusPage }) {
  if (page.isEmpty)
    return (
      <div class="empty">
        <div class="title">{page.empty.title}</div>
        <div class="muted">{page.empty.hint}</div>
        <SetGoal page={page} />
      </div>
    )
  const head =
    page.goal === null && page.head ? (
      <div class="status-head">
        <h1>{page.head.title}</h1>
        {page.head.description ? <p class="muted">{page.head.description}</p> : null}
      </div>
    ) : null

  return (
    <main class="status-page">
      <GoalSection page={page} />
      {head ? <section>{head}</section> : null}
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
