import { Icon } from './row-actions'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../hooks/status-page'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyGroups, goalSubmitLabel, milestoneKeyPlan } from '../../hooks/status-keys'
import type { MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT, suggestedGoalOffer } from '../../hooks/status-goal-page'
import { ROW_COPY } from '../../hooks/rows'
import type { StatusKey } from '../../hooks/status-keys'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { emptyTab } from '../../hooks/empty-tab'
import { unfoldedRows } from '../../hooks/status-folds'
import { isSpacedAbove, LATER_TEXT, workJoints } from '../../hooks/status-path'
import type { WorkJoint } from '../../hooks/status-path'
import type { TabView as View } from './core'
import { closingFolds, drafts, errors, sending, statusUnfolded, tabState } from './tab-state'
import { clickFold } from './tab-fold-all'
import { act } from './tab-rows'
import { NameLine } from './tab-status-name'
import { chevronOf, isParentFolded, ParentName } from './tab-status-fold'
import { markClassOf, MarkGlyph, EmptyState } from './tab-parts'
import { goalHeadMotion, goalLineMotion, metFoldMotion, statusRowMotion } from './tab-status-steps'
import { connectorClass, connectorMotion, lineMotion } from './tab-line-steps'
import type { DrawnStatus } from './tab-status-steps'
import { foldMotion, Keys, StatusLine, toggleStatusFold } from './tab-status-line'

/** The goal's text field, with its submit button and Cancel. It stays open, its buttons out, until the server confirms the goal. */
function GoalField({ page }: { page: StatusPage }) {
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
            {goalSubmitLabel(page)}
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

/** The goal the Status call offers, as a muted line where "No goal yet" draws, with its buttons inline after it. */
function Offer({ text, keys }: { text: string; keys: StatusKey[] }) {
  return (
    <div class="goal-offer">
      <p class="muted">{suggestedGoalOffer(text)}</p>
      <span class="offer-actions">
        {keys.flatMap((k, n) => [...(n > 0 ? [<span class="muted">·</span>] : []), <Keys key={k.label} keys={[k]} />])}
      </span>
    </div>
  )
}

function MilestoneLine({ m, motion, connector }: { m: MilestoneRow; motion: string; connector: string | null }) {
  const fold = m.foldId
  const classes = ['row milestone', connector === null ? '' : 'connector-down', connector ?? '']
  const nameClass = [m.isChanged ? 'changed' : '', m.isMuted ? 'muted' : ''].filter(Boolean).join(' ')

  return (
    <div class={classes.filter(Boolean).join(' ')} {...lineMotion(motion)}>
      <span class={markClassOf(m.tone, false)}>
        <MarkGlyph text={m.mark} />
      </span>
      <div class="content tight">
        {fold === null ? (
          <div class="milestone-name">
            <ParentName id={m.id} foldCount={m.foldCount} class={nameClass}>
              <NameLine name={m.name} stall={null} chevron={chevronOf(m)} />
            </ParentName>
          </div>
        ) : (
          <button
            type="button"
            class="fold milestone-fold"
            data-fold={foldMotion(fold)}
            onClick={e => clickFold(e, statusUnfolded.has(fold), () => toggleStatusFold(fold))}
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

/** A work row in its joint with the column under its milestone's mark, as `workJoints` places it. */
function JointedLine({
  row,
  joint,
  motion,
  under,
  column,
}: {
  row: StatusRow
  joint: WorkJoint | undefined
  motion?: string
  under?: string[]
  column?: 'leaving' | null
}) {
  const line = <StatusLine row={row} motion={motion} under={under} />
  if (!joint) return line
  const own = motion ? connectorMotion([motion]) : null
  const columnMotion = joint.arm === 'elbow' ? own : joint.beside === 'connector' ? (column ?? null) : null
  const classes = [
    'work-joint',
    own ? 'arm-leaving' : '',
    connectorClass(columnMotion),
    joint.arm ? `arm-${joint.arm}` : '',
    joint.beside === 'connector' ? 'beside-connector' : '',
  ]

  return <div class={classes.filter(Boolean).join(' ')}>{line}</div>
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

/** How the connector under a done milestone moves while its fold shuts, as its list fades with it. */
function foldConnectorMotion(fold: string | null, motion: string): 'leaving' | null {
  if (fold === null || statusUnfolded.has(fold)) return null

  return closingFolds.has(motion) ? 'leaving' : null
}

/**
 * A milestone and its rows. A milestone the path's line leaves from draws the line down to the next milestone's mark.
 * One the line does not leave from draws the nesting connector down to its last work row. A done milestone folded to its
 * name keeps its rows in a fold, as a done fold of subjects does.
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
  const shown = motion === null ? rows : isFoldShown ? unfoldedRows(m.rows, () => false, isParentFolded) : []
  const joints = workJoints(shown, m.line)
  const connectorState =
    motion === null ? connectorMotion(rows.map(r => goalLineMotion(r.id))) : foldConnectorMotion(fold, motion)
  const classes = [
    'milestone-group',
    isSpaced ? 'spaced' : '',
    m.line ? `path-${m.line}` : '',
    m.line && isGapUnder ? 'gap-under' : '',
  ]

  return (
    <div class={classes.filter(Boolean).join(' ')}>
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
            column={connectorState}
          />
        ))
      ) : isFoldShown ? (
        <div class="fold-rows" data-motion={`closed-${motion}`}>
          {shown.map((r, n) => (
            <JointedLine key={r.id} row={r} joint={joints[n]} />
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
          isSpaced={n > 0 && !group.m.startsLater && isSpacedAbove(milestones, n, isUnfolded, isParentFolded)}
          isGapUnder={isSpacedAbove(milestones, n + 1, isUnfolded, isParentFolded) && n + 1 < milestones.length}
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
        onClick={e => clickFold(e, statusUnfolded.has(fold.id), () => toggleStatusFold(fold.id))}
      >
        {fold.text}
        <Icon name={statusUnfolded.has(fold.id) ? 'down' : 'right'} />
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
  const isTyping = tabState.typing === GOAL_KEYS_ID
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

  return (
    <section>
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

/** New, the suggested goal's offer, or the field New opened, under the empty page's centred text. */
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
    <div class="status-head">
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
  const error = errors.get(GOAL_KEYS_ID)

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
  const empty = emptyTab(v, { tab: 'overview', isGoalFieldOpen: tabState.typing === GOAL_KEYS_ID })
  if (empty)
    return (
      <EmptyState empty={empty}>
        {empty.under?.is === 'set-goal' ? <SetGoal page={page} {...empty.under} /> : null}
      </EmptyState>
    )
  // The list after a goal draws no line between sections: its heading's own rule sets it apart while the goal shows
  // milestones or the list starts with one, and nothing does while the goal shows none.
  const isUnruledAfterGoal = page.goal !== null || page.rows[0]?.kind === 'part'

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
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
