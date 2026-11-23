import { Icon } from './row-actions'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../core/view/status-page'
import { STALL_GAP } from '../../core/view/status-page-parts'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyGroups, goalSubmitLabel, milestoneKeyPlan } from '../../core/view/status-keys'
import type { MilestoneRow } from '../../core/view/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT, suggestedGoalOffer } from '../../core/view/status-goal-page'
import { ROW_COPY } from '../../core/view/rows'
import type { StatusKey } from '../../core/view/status-keys'
import type { StatusPage, StatusRow } from '../../core/view/status-page'
import { emptyTab } from '../../core/view/empty-tab'
import { unfoldedRows } from '../../core/view/status-folds'
import { isSpacedAbove, LATER_TEXT, workJoints } from '../../core/view/status-path'
import type { WorkJoint } from '../../core/view/status-path'
import type { TabView as View } from './core'
import { closingFolds, entering, tabState } from './tab-state'
import { clickFold, foldMotion, toggleStatusFold } from './tab-fold-all'
import { dispatch, errorOf, pressRow } from './tab-ui'
import { outOn } from './tab-press'
import { NameLine } from './tab-status-name'
import { chevronOf, isParentFolded, ParentName } from './tab-status-fold'
import { markClassOf, MarkGlyph, EmptyState, pulseInStep } from './tab-parts'
import { SUBJECTS_ATTRIBUTE } from './tab-shown'
import { goalHeadMotion, goalLineMotion, metFoldMotion, statusRowMotion } from './tab-status-steps'
import { connectorClass, connectorMotion, lineMotion } from './tab-line-steps'
import type { ConnectorMotion } from './tab-line-steps'
import type { DrawnStatus } from './tab-status-steps'
import { fitMergedLine, Keys, rowPads, StatusLine } from './tab-status-line'
import type { RowPad } from './tab-status-line'
import {
  isOneLineMilestone,
  milestoneGroupPadBelow,
  milestonePadPt,
  milestoneRowPads,
  milestoneSpacePt,
} from '../../core/view/status-gaps'

/** The goal's text field, with its submit button and Cancel. Its draft stays until the goal arrives. */
function GoalField({ page }: { page: StatusPage }) {
  const draft = () => tabState.ui.drafts[GOAL_KEYS_ID]?.text ?? ''
  const isOut = outOn(GOAL_KEYS_ID) !== null

  return (
    <div class="actions">
      <form
        class="goal-field"
        onSubmit={e => {
          e.preventDefault()
          const text = draft().trim()
          if (text && !isOut) pressRow({ action: 'type', id: GOAL_KEYS_ID, text }, 'key')
        }}
      >
        <input
          id={`type-${GOAL_KEYS_ID}`}
          value={draft()}
          placeholder={GOAL_FIELD.placeholder}
          aria-label={GOAL_FIELD.placeholder}
          onInput={e =>
            dispatch([{ type: 'edit-draft', id: GOAL_KEYS_ID, text: e.currentTarget.value }], { isDrawn: false })
          }
        />
        <span class="field-keys">
          <button type="submit" class={isOut ? 'key primary out' : 'key primary'} disabled={isOut}>
            {goalSubmitLabel(page)}
          </button>
          <button
            type="button"
            class={isOut ? 'key ghost out' : 'key ghost'}
            disabled={isOut}
            onClick={() => dispatch([{ type: 'close-field', id: GOAL_KEYS_ID, isDiscard: false }])}
          >
            {ROW_COPY.cancel}
          </button>
        </span>
      </form>
    </div>
  )
}

/** The goal the Status call offers, as the goal's text is drawn, where "No goal yet" draws, with its buttons inline after it. */
function Offer({ text, keys }: { text: string; keys: StatusKey[] }) {
  return (
    <div class="goal-offer">
      <h1>{suggestedGoalOffer(text)}</h1>
      <span class="offer-actions">
        {keys.flatMap((k, n) => [
          ...(n > 0 ? [<span class="muted">{STALL_GAP}</span>] : []),
          <Keys key={k.label} keys={[k]} />,
        ])}
      </span>
    </div>
  )
}

/** A milestone's line. A subject drawn in its place adds what a subject's row draws. */
function MilestoneLine({ m, motion, connector }: { m: MilestoneRow; motion: string; connector: string | null }) {
  const fold = m.foldId
  const x = m.subject
  const isRunning = x?.isRunning ?? false
  const merged = x?.merged ?? null
  const classes = [
    'row milestone',
    isOneLineMilestone(m) ? '' : 'long',
    connector === null ? '' : 'connector-down',
    connector ?? '',
  ]
  const nameClass = [m.isBold ? 'bold' : '', m.isMuted ? 'muted' : ''].filter(Boolean).join(' ')

  return (
    <div
      class={classes.filter(Boolean).join(' ')}
      {...(x ? { [SUBJECTS_ATTRIBUTE]: x.id } : {})}
      {...lineMotion(motion)}
    >
      <span class={markClassOf(m.tone, isRunning)} ref={isRunning ? pulseInStep : undefined}>
        <MarkGlyph text={m.mark} />
      </span>
      <div class="content tight">
        {fold === null ? (
          <div class="milestone-name">
            <ParentName id={m.id} foldCount={m.foldCount} class={nameClass}>
              <NameLine name={m.name} stall={x?.stall ?? null} chevron={chevronOf(m)} />
            </ParentName>
          </div>
        ) : (
          <button
            type="button"
            class="fold milestone-fold"
            data-fold={foldMotion(fold)}
            onClick={e => clickFold(e, tabState.ui.statusUnfolded.includes(fold), () => toggleStatusFold(fold))}
          >
            {m.name}
            <Icon name={tabState.ui.statusUnfolded.includes(fold) ? 'down' : 'right'} />
          </button>
        )}
        {x?.waitsOn ? (
          <div class="tone-needsYou clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
            {x.waitsOn}
          </div>
        ) : null}
        {m.text ? (
          <div class="muted clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
            {m.text}
          </div>
        ) : null}
        {merged ? (
          <div
            class="outcome muted clamp"
            style={{ '--lines': STATUS_TEXT_LINES }}
            ref={el => fitMergedLine(el, merged)}
          />
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

/**
 * How the column beside a work row moves: `above` the row's arm, or along the whole row where it has none, and `below`
 * a tee's arm, where the column runs on to the rows after it.
 */
type ColumnMotion = { above: ConnectorMotion; below: ConnectorMotion }

/**
 * How the column beside each work row moves. A part of the column joins the arms of the rows after it, so it enters or
 * leaves only when all of those rows do, and a part between two rows that stay never fades.
 */
function columnMotions(rows: StatusRow[], joints: (WorkJoint | undefined)[]): ColumnMotion[] {
  const armsFrom = (n: number) => rows.flatMap((r, k) => (k >= n && joints[k]?.arm ? [goalLineMotion(r.id)] : []))

  return rows.map((_, n) => {
    const below = connectorMotion(armsFrom(n + 1))

    return { above: joints[n]?.arm ? connectorMotion(armsFrom(n)) : below, below }
  })
}

/**
 * A work row in its joint with the column under its milestone's mark, as `workJoints` places it. A tee draws the column
 * below its arm on its own, so that part can fade with the rows after it while the part above stays.
 */
function JointedLine({
  row,
  joint,
  motion,
  under,
  column,
  pad,
}: {
  row: StatusRow
  joint: WorkJoint | undefined
  motion?: string
  under?: string[]
  column?: ColumnMotion
  pad: RowPad | undefined
}) {
  const line = <StatusLine row={row} motion={motion} under={under} pad={pad} />
  if (!joint) return line
  const own = motion ? connectorMotion([motion]) : null
  const isTee = joint.arm === 'tee' && joint.beside === 'connector'
  const columnMotion = joint.arm === 'elbow' ? own : joint.beside === 'connector' ? (column?.above ?? null) : null
  const classes = [
    'work-joint',
    own ? `arm-${own}` : '',
    connectorClass(columnMotion),
    joint.arm ? `arm-${joint.arm}` : '',
    joint.beside === 'connector' ? 'beside-connector' : '',
  ]

  return (
    <div class={classes.filter(Boolean).join(' ')} style={pad}>
      {line}
      {isTee ? <span class={['joint-below', connectorClass(column?.below ?? null)].filter(Boolean).join(' ')} /> : null}
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

/** How the connector under a done milestone moves while its fold opens or shuts, as its list fades with it. */
function foldConnectorMotion(fold: string | null, motion: string): ConnectorMotion {
  if (fold === null) return null
  if (tabState.ui.statusUnfolded.includes(fold)) return entering.has(`closed-${motion}`) ? 'entering' : null

  return closingFolds.has(motion) ? 'leaving' : null
}

/**
 * A milestone and its rows. A milestone the path's line leaves from draws the line down to the next milestone's mark.
 * One the line does not leave from draws the nesting connector down to its last work row. A done milestone folded to its
 * name keeps its rows in a fold, as a done fold of subjects does.
 */
/** The rows a milestone's group draws: its work, or a done milestone's work while its fold is open or closing. */
function shownRows({ m, rows }: MilestoneGroupLines) {
  const fold = m.foldId
  const motion = fold === null ? null : foldMotion(fold)
  const isFoldShown =
    motion !== null && fold !== null && (tabState.ui.statusUnfolded.includes(fold) || closingFolds.has(motion))
  const shown = motion === null ? rows : isFoldShown ? unfoldedRows(m.rows, () => false, isParentFolded) : []

  return { fold, motion, isFoldShown, shown }
}

/** A group's inline spacing: its space above when it stands apart, and the next group's, which its path line crosses. */
function groupStyle(next: MilestoneRow | undefined, space: number | null, nextSpace: number | null) {
  return {
    ...(next ? { '--next-row-pad': `${milestonePadPt(next)}px` } : {}),
    ...(space === null ? {} : { '--space-size': `${space}px` }),
    ...(nextSpace === null ? {} : { '--next-space': `${nextSpace}px` }),
  }
}

function MilestoneGroup({
  group,
  next,
  isSpaced,
  isGapUnder,
  space,
  nextSpace,
}: {
  group: MilestoneGroupLines
  next: MilestoneRow | undefined
  isSpaced: boolean
  isGapUnder: boolean
  space: number | null
  nextSpace: number | null
}) {
  const { m, rows } = group
  const { fold, motion, isFoldShown, shown } = shownRows(group)
  const joints = workJoints(shown, m.line)
  const columns = columnMotions(rows, joints)
  const pads = rowPads(shown, milestoneRowPads(m, shown))
  const connectorState =
    motion === null ? connectorMotion(rows.map(r => goalLineMotion(r.id))) : foldConnectorMotion(fold, motion)
  const classes = [
    'milestone-group',
    isOneLineMilestone(m) ? '' : 'long',
    isSpaced ? 'spaced' : '',
    m.line ? `path-${m.line}` : '',
    m.line && isGapUnder ? 'gap-under' : '',
  ]

  return (
    <div class={classes.filter(Boolean).join(' ')} style={groupStyle(next, space, nextSpace)}>
      <MilestoneLine
        m={m}
        motion={goalLineMotion(m.id)}
        connector={shown.length > 0 && m.line === null ? connectorClass(connectorState) : null}
      />
      {motion === null ? (
        rows.map((r, n) => (
          <JointedLine
            key={r.id}
            row={r}
            joint={joints[n]}
            motion={goalLineMotion(r.id)}
            under={rowsUnder(rows, n, goalLineMotion)}
            column={columns[n]}
            pad={pads[n]}
          />
        ))
      ) : isFoldShown ? (
        <div class="fold-rows" data-motion={`closed-${motion}`}>
          {shown.map((r, n) => (
            <JointedLine key={r.id} row={r} joint={joints[n]} pad={pads[n]} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The Later label's inline spacing: the padding of the group above it and of the milestone under it. */
function laterStyle(above: MilestoneGroupLines | undefined, m: MilestoneRow) {
  return {
    '--row-below-pad': `${milestonePadPt(m)}px`,
    ...(above ? { '--row-above-pad': `${milestoneGroupPadBelow(above.m, shownRows(above).shown)}px` } : {}),
  }
}

function MilestoneList({ lines }: { lines: DrawnStatus['goal'] }) {
  const isUnfolded = (id: string) => tabState.ui.statusUnfolded.includes(id)
  const groups = milestoneGroups(lines)
  const milestones = groups.map(g => g.m)
  const spaces = groups.map((g, n) => {
    const above = groups[n - 1]
    return above ? milestoneSpacePt(milestoneGroupPadBelow(above.m, shownRows(above).shown), g.m) : null
  })

  return (
    <div class="list">
      {groups.flatMap((group, n) => [
        ...(group.m.startsLater
          ? [
              <div key="later" class="row part-line" style={laterStyle(groups[n - 1], group.m)}>
                <div class="part-rule">{LATER_TEXT}</div>
              </div>,
            ]
          : []),
        <MilestoneGroup
          key={group.m.id}
          group={group}
          next={milestones[n + 1]}
          isSpaced={n > 0 && !group.m.startsLater && isSpacedAbove(milestones, n, isUnfolded, isParentFolded)}
          isGapUnder={isSpacedAbove(milestones, n + 1, isUnfolded, isParentFolded) && n + 1 < milestones.length}
          space={spaces[n] ?? null}
          nextSpace={spaces[n + 1] ?? null}
        />,
      ])}
    </div>
  )
}

/**
 * The line a met goal's milestones fold into, at the text column, as a done milestone folded to its name draws. The
 * milestones it opens to draw in the goal's list, each growing in and leaving as a stepped line does.
 */
function MilestonesFold({ line: { id, fold } }: { line: DrawnStatus['fold'][number] }) {
  return (
    <div class="milestones-fold" {...lineMotion(metFoldMotion(id))}>
      <button
        type="button"
        class="fold milestone-fold"
        onClick={e => clickFold(e, tabState.ui.statusUnfolded.includes(fold.id), () => toggleStatusFold(fold.id))}
      >
        {fold.text}
        <Icon name={tabState.ui.statusUnfolded.includes(fold.id) ? 'down' : 'right'} />
      </button>
    </div>
  )
}

/**
 * The goal's section, first on every page that is not empty: its heading row, the title, a rule and the goal's buttons at
 * the right edge, then the goal's text with its was, Now and awaiting lines, or the line that says no goal is set, then
 * the milestones, each with its rows on the lines under it. A met goal's heading hangs its ✓ in the mark column, its
 * lines start at the text column, and its milestones fold into one line. While the person types a
 * goal, the field takes the text's place and the buttons leave the heading.
 * The buttons wrap under the rule, still at the right, when they do not fit beside the title.
 */
function GoalSection({
  page,
  head,
  fold,
  lines,
}: {
  page: StatusPage
  head: DrawnStatus['head']
  fold: DrawnStatus['fold']
  lines: DrawnStatus['goal']
}) {
  const g = page.goal
  const isTyping = tabState.ui.typing === GOAL_KEYS_ID
  const groups = goalKeyGroups(page)
  const text =
    page.suggestedGoal !== null ? (
      <Offer text={page.suggestedGoal} keys={groups.offer} />
    ) : g ? (
      <h1>{g.text}</h1>
    ) : (
      <p class="muted">{NO_GOAL_TEXT}</p>
    )
  const mark = g?.mark ?? null
  const last = milestoneGroups(lines).at(-1)
  const sectionStyle = last ? { '--last-row-pad': `${milestoneGroupPadBelow(last.m, shownRows(last).shown)}px` } : {}

  return (
    <section style={sectionStyle}>
      <div class={mark ? 'goal-heading marked' : 'goal-heading'} data-motion="goal-heading">
        {mark ? (
          <span class={`${markClassOf(mark.tone, false)} goal-mark`}>
            <MarkGlyph text={mark.mark} />
          </span>
        ) : null}
        <span class={mark?.tone ? `goal-title tone-${mark.tone}` : 'goal-title'}>{g?.label ?? GOAL_HEADING}</span>
        <span class="goal-rule" />
        {isTyping || groups.heading.length === 0 ? null : (
          <span class="goal-actions">
            {groups.heading.flatMap((k, n) => [
              ...(n > 0 ? [<span class="muted">·</span>] : []),
              <Keys key={k.label} keys={[k]} />,
            ])}
          </span>
        )}
      </div>
      <div class={mark ? 'status-head goal marked' : 'status-head goal'} data-motion="goal-head">
        <div class="goal-text" data-motion="goal-text">
          {isTyping ? <GoalField page={page} /> : text}
        </div>
        {head.map(l => (
          <p key={l.id} class="muted" {...lineMotion(goalHeadMotion(l.id))}>
            {l.text}
          </p>
        ))}
        <GoalError />
      </div>
      {fold.map(l => (
        <MilestonesFold key={l.id} line={l} />
      ))}
      {lines.length > 0 ? <MilestoneList lines={lines} /> : null}
    </section>
  )
}

/**
 * New, the suggested goal's offer, or the field New opened, under the empty page's centred text. Its height glides as
 * the field opens or closes, so the centred text moves with it.
 */
function SetGoal({
  page,
  keys,
  offerKeys,
  isFieldOpen,
  suggestion,
}: {
  page: StatusPage
  keys: StatusKey[]
  offerKeys: StatusKey[]
  isFieldOpen: boolean
  suggestion: string | null
}) {
  return (
    <div class="status-head" data-motion="empty-goal">
      {isFieldOpen ? (
        <GoalField page={page} />
      ) : (
        <>
          {suggestion === null ? null : <Offer text={suggestion} keys={offerKeys} />}
          <Keys keys={keys} />
        </>
      )}
      <GoalError />
    </div>
  )
}

/** Why the last goal press failed, drawn in the goal's section, or under New on the empty page. */
function GoalError() {
  const error = errorOf(GOAL_KEYS_ID)

  return error ? <p class="tone-error">{error}</p> : null
}

/** The motion keys of the rows drawn under the row at `n`: the rows after it that sit deeper, leaving rows too. */
function rowsUnder(rows: StatusRow[], n: number, motion: (id: string) => string): string[] {
  const depth = rows[n]?.depth ?? 0
  const under: string[] = []
  for (const r of rows.slice(n + 1)) {
    if (r.depth <= depth) break
    under.push(motion(r.id))
  }

  return under
}

export function StatusTab({ v, drawn }: { v: View; drawn: DrawnStatus }) {
  const page = v.statusPage
  const empty = emptyTab(v, { tab: 'overview', isGoalFieldOpen: tabState.ui.typing === GOAL_KEYS_ID })
  if (empty)
    return (
      <EmptyState empty={empty}>
        {empty.under?.is === 'set-goal' ? <SetGoal page={page} {...empty.under} /> : null}
      </EmptyState>
    )
  // The list after a goal draws no line between sections: its heading's own rule sets it apart while the goal shows
  // milestones or the list starts with one, and nothing does while the goal shows none.
  const isUnruledAfterGoal = page.goal !== null || page.rows[0]?.kind === 'part'
  const pads = rowPads(drawn.rows)

  return (
    <main class="status-page">
      <GoalSection page={page} head={drawn.head} fold={drawn.fold} lines={drawn.goal} />
      {drawn.rows.length > 0 ? (
        <section class={isUnruledAfterGoal ? 'unruled' : undefined}>
          <div class="list">
            {drawn.rows.map((r, n) => (
              <StatusLine
                key={r.id}
                row={r}
                motion={statusRowMotion(r.id)}
                under={rowsUnder(drawn.rows, n, statusRowMotion)}
                pad={pads[n]}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
