import { Icon, RowActions } from './row-actions'
import { mergedLine, seenSubjectIds, STATUS_TEXT_LINES, STALL_GAP, WAS_PREFIX } from '../../hooks/status-page'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan, statusKeyPlan } from '../../hooks/status-keys'
import type { MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT } from '../../hooks/status-goal-page'
import { ROW_COPY } from '../../hooks/rows'
import type { StatusKey } from '../../hooks/status-keys'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { emptyTab } from '../../hooks/empty-tab'
import { isSpacedAbove, LATER_TEXT } from '../../hooks/status-path'
import type { TabView as View } from './core'
import { closingFolds, drafts, errors, sending, statusUnfolded, tabState } from './tab-state'
import type { Key } from './tab-state'
import { act } from './tab-rows'
import { NameLine } from './tab-status-name'
import { SUBJECTS_ATTRIBUTE } from './tab-shown'
import { revealSelected, toggleFold } from './tab-motion'
import { switchTab, open } from './tab-selection'
import { tabRows } from './tab-rows'
import { pulseInStep, markClassOf, MarkGlyph, EmptyState } from './tab-parts'
import { goalHeadMotion, goalLineMotion, statusRowMotion } from './tab-status-steps'
import { lineMotion } from './tab-line-steps'
import type { DrawnStatus } from './tab-status-steps'

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

function StatusLine({ row, motion }: { row: StatusRow; motion?: string }) {
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

/** The boxes of the text under `el`, one per line of each text node, without the boxes of the elements that hold it. */
function textRects(el: Element): DOMRect[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const rects: DOMRect[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const range = document.createRange()
    range.selectNodeContents(n)
    rects.push(...range.getClientRects())
  }

  return rects
}

function placePathWord(word: HTMLElement, name: Element, box: Element) {
  const rects = textRects(name)
  const firstTop = Math.min(...rects.map(r => r.top))
  const firstRight = Math.max(...rects.filter(r => Math.abs(r.top - firstTop) < 2).map(r => r.right))
  word.hidden = false
  word.hidden = firstRight + PATH_WORD_GAP_PX + word.offsetWidth > box.getBoundingClientRect().right
}
const PATH_WORD_GAP_PX = 12
const fittedWords = new WeakSet<HTMLElement>()

/** Shows a milestone's word only where it fits at the right of its name's first line, again whenever the name's box resizes. */
function fitPathWord(word: HTMLElement | null) {
  const name = word?.previousElementSibling
  const box = word?.parentElement
  if (!word || !name || !box) return
  placePathWord(word, name, box)
  if (fittedWords.has(word)) return
  fittedWords.add(word)
  new ResizeObserver(() => placePathWord(word, name, box)).observe(box)
}

function MilestoneLine({ m, motion }: { m: MilestoneRow; motion: string }) {
  const fold = m.foldId
  const nameClass = [m.isChanged ? 'changed' : '', m.isMuted ? 'muted' : ''].filter(Boolean).join(' ')

  return (
    <div class="row milestone" {...lineMotion(motion)}>
      <span class={markClassOf(m.tone, false)}>
        <MarkGlyph text={m.mark} />
      </span>
      <div class="content tight">
        {fold === null ? (
          <div class="milestone-name">
            <div class={nameClass}>
              <NameLine name={m.name} stall={m.stall} />
            </div>
            {m.word ? (
              <span class="path-word muted" ref={fitPathWord}>
                {m.word}
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            class="fold milestone-fold"
            data-fold={foldMotion(fold)}
            onClick={() => toggleStatusFold(fold)}
          >
            {m.name}
            <Icon name={statusUnfolded.has(fold) ? 'down' : 'right'} />
          </button>
        )}
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
        {fold === null ? <Keys keys={milestoneKeyPlan(m)} /> : null}
      </div>
    </div>
  )
}

/** A milestone and the rows drawn under it, as `stepStatus` steps them, with rows still leaving in their places. */
type MilestoneGroupLines = { m: MilestoneRow; rows: StatusRow[] }

function milestoneGroups(lines: DrawnStatus['goal']): MilestoneGroupLines[] {
  const groups: MilestoneGroupLines[] = []
  for (const l of lines) {
    if ('milestone' in l) groups.push({ m: l.milestone, rows: [] })
    else groups.at(-1)?.rows.push(l.row)
  }

  return groups
}

/**
 * A milestone and its rows. A milestone the path's line leaves from draws the line down to the next milestone's mark.
 * A done milestone folded to its name keeps its rows in a fold, as a done fold of subjects does.
 */
function MilestoneGroup({
  group: { m, rows },
  isSpaced,
  isGapUnder,
}: {
  group: MilestoneGroupLines
  isSpaced: boolean
  isGapUnder: boolean
}) {
  const fold = m.foldId
  const motion = fold === null ? null : foldMotion(fold)
  const isFoldShown = motion !== null && fold !== null && (statusUnfolded.has(fold) || closingFolds.has(motion))
  const classes = [
    'milestone-group',
    isSpaced ? 'spaced' : '',
    m.line ? `path-${m.line}` : '',
    m.line && isGapUnder ? 'gap-under' : '',
  ]

  return (
    <div class={classes.filter(Boolean).join(' ')}>
      <MilestoneLine m={m} motion={goalLineMotion(m.id)} />
      {motion === null ? (
        rows.map(r => <StatusLine key={r.id} row={r} motion={goalLineMotion(r.id)} />)
      ) : isFoldShown ? (
        <div class="fold-rows" data-motion={`closed-${motion}`}>
          {m.rows.map(r => (
            <StatusLine key={r.id} row={r} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MilestoneList({ lines }: { lines: DrawnStatus['goal'] }) {
  const isUnfolded = (id: string) => statusUnfolded.has(id)
  const groups = milestoneGroups(lines)
  const milestones = groups.map(g => g.m)

  return (
    <div class="list">
      {groups.flatMap((group, n) => [
        ...(group.m.startsLater
          ? [
              <div key="later" class="row part-line">
                <div class="part-rule">{LATER_TEXT}</div>
              </div>,
            ]
          : []),
        <MilestoneGroup
          key={group.m.id}
          group={group}
          isSpaced={n > 0 && !group.m.startsLater && isSpacedAbove(milestones, n, isUnfolded)}
          isGapUnder={isSpacedAbove(milestones, n + 1, isUnfolded) && n + 1 < milestones.length}
        />,
      ])}
    </div>
  )
}

/**
 * The goal's section, first on every page that is not empty: its heading row, the title, a rule and the goal's buttons at
 * the right edge, then the goal's text with its was, Now and awaiting lines, or the line that says no goal is set, then
 * the milestones, each after a blank line's space and with that space between it and its rows. While the person types a
 * goal, the field takes the text's place and the buttons leave the heading.
 * The buttons wrap under the rule, still at the right, when they do not fit beside the title.
 */
function GoalSection({
  page,
  head,
  lines,
}: {
  page: StatusPage
  head: DrawnStatus['head']
  lines: DrawnStatus['goal']
}) {
  const g = page.goal
  const isTyping = tabState.typing === GOAL_KEYS_ID
  const text = g ? <h1>{g.text}</h1> : <p class="muted">{NO_GOAL_TEXT}</p>

  return (
    <section>
      <div class="goal-heading" data-motion="goal-heading">
        <span class="goal-title">{g?.label ?? GOAL_HEADING}</span>
        <span class="goal-rule" />
        {isTyping ? null : (
          <span class="goal-actions">
            {goalKeyPlan(page).flatMap((k, n) => [
              ...(n > 0 ? [<span class="muted">·</span>] : []),
              <Keys key={k.label} keys={[k]} />,
            ])}
          </span>
        )}
      </div>
      <div class="status-head goal" data-motion="goal-head">
        <div class="goal-text" data-motion="goal-text">
          {isTyping ? <GoalField /> : text}
        </div>
        {head.map(l => (
          <p key={l.id} class="muted" {...lineMotion(goalHeadMotion(l.id))}>
            {l.text}
          </p>
        ))}
        <GoalError />
      </div>
      {lines.length > 0 ? <MilestoneList lines={lines} /> : null}
    </section>
  )
}

/** New, or the field it opened, under the empty page's centred text. */
function SetGoal({ keys, isFieldOpen }: { keys: StatusKey[]; isFieldOpen: boolean }) {
  return (
    <div class="status-head">
      {isFieldOpen ? <GoalField /> : <Keys keys={keys} />}
      <GoalError />
    </div>
  )
}

/** Why the last goal press failed, drawn in the goal's section, or under New on the empty page. */
function GoalError() {
  const error = errors.get(GOAL_KEYS_ID)

  return error ? <p class="tone-error">{error}</p> : null
}

export function StatusTab({ v, drawn }: { v: View; drawn: DrawnStatus }) {
  const page = v.statusPage
  const empty = emptyTab(v, { tab: 'overview', isGoalFieldOpen: tabState.typing === GOAL_KEYS_ID })
  if (empty)
    return <EmptyState empty={empty}>{empty.under?.is === 'set-goal' ? <SetGoal {...empty.under} /> : null}</EmptyState>
  const head =
    page.goal === null && page.head ? (
      <div class="status-head">
        <h1>{page.head.title}</h1>
        {page.head.description ? <p class="muted">{page.head.description}</p> : null}
      </div>
    ) : null
  // The list after a goal draws no line between sections: Other work's own rule sets it apart while the goal shows
  // milestones, and nothing does while it shows none.
  const isUnruledAfterGoal = page.goal !== null

  return (
    <main class="status-page">
      <GoalSection page={page} head={drawn.head} lines={drawn.goal} />
      {head ? <section>{head}</section> : null}
      {drawn.rows.length > 0 ? (
        <section class={isUnruledAfterGoal ? 'unruled' : undefined}>
          <div class="list">
            {drawn.rows.map(r => (
              <StatusLine key={r.id} row={r} motion={statusRowMotion(r.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
