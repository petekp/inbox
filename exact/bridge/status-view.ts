import { renderVersion } from './render-version'
import { createHash } from 'node:crypto'
import { toneColor } from './row-view'
import type { AllowedAction, ViewIdentity } from './row-view'
import type { RowPress } from '../../core/domain/presses'
import { HEAD_GAP_PT, LIST_GAP_PT, SECTION_GAP_PT } from '../../core/view/layout'
import {
  laterSpacePt,
  milestoneGroupPadBelow,
  milestonePadPt,
  milestoneRowPads,
  milestoneSpacePt,
  statusRowPads,
  underLaterPt,
} from '../../core/view/status-gaps'
import { isSpacedAbove, LATER_TEXT, workJoints } from '../../core/view/status-path'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones, suggestedGoalOffer } from '../../core/view/status-goal-page'
import { milestoneRows, unfoldedRows, hasTreeDown } from '../../core/view/status-folds'
import { goalKeyGroups, goalSubmitLabel, statusKeyRows, GOAL_FIELD } from '../../core/view/status-keys'
import type { StatusKey } from '../../core/view/status-keys'
import type { StatusPage, StatusRow } from '../../core/view/status-page'
import { mergedLine, textLevelOf } from '../../core/view/status-page-parts'
import { seenSubjectIds, WAS_PREFIX } from '../../core/view/status-page'
import type { Result } from '../app.contract'

type Inbox = Result<'loadInbox'>
type Line = Inbox['statusRows'][number]
export type StatusOptions = { folds: string[]; collapsed: string[] }
const noStatusOptions: StatusOptions = { folds: [], collapsed: [] }

const action = (
  { press, label, emphasis }: StatusKey,
  offer: (id: string) => string = () => '',
): Inbox['statusActions'][number] => ({
  collapse: press.action === 'toggle-collapse' ? offer(press.id) : '',
  key: '',
  action: press.action,
  target: 'askId' in press ? press.askId : 'foldId' in press ? press.foldId : 'id' in press ? press.id : '',
  text: 'text' in press ? press.text : '',
  label,
  emphasis,
  disabled: !['show-ask', 'toggle-fold', 'toggle-collapse'].includes(press.action),
})

export function projectStatus(
  page: StatusPage,
  options: StatusOptions = noStatusOptions,
  command?: {
    binding: ViewIdentity
    version: string
    allowed: Map<string, AllowedAction>
    actions: readonly string[]
  },
  offer: (id: string) => string = () => '',
) {
  const unfolded = (id: string) => options.folds.includes(id)
  const collapsed = (id: string) => options.collapsed.includes(id)
  const plans = new Map(
    statusKeyRows(page, unfolded, collapsed).map(p => [p.id, p.keys.map(key => action(key, offer))]),
  )
  const line = (id: string, title: string, values: Partial<Line> = {}): Line => ({
    seen: [],
    id,
    title,
    detail: '',
    depth: 0,
    mark: '',
    kind: 'text',
    color: toneColor(),
    bold: false,
    running: false,
    waitsOn: '',
    waitsOnColor: toneColor('needsYou'),
    was: '',
    merged: '',
    stall: '',
    level: 'muted',
    isMutedName: false,
    isPartTitle: false,
    padTop: LIST_GAP_PT / 2,
    padBottom: LIST_GAP_PT / 2,
    spaceAbove: 0,
    hasChildren: false,
    branch: '',
    pathLine: '',
    jointArm: '',
    jointBeside: '',
    foldOpen: false,
    foldCount: 0,
    actions: plans.get(id) ?? [],
    ...values,
  })
  const row = (r: StatusRow, extras: Partial<Line> = {}): Line => {
    if (r.kind === 'subject')
      return line(r.id, r.name, {
        kind: r.kind,
        seen: seenSubjectIds(r),
        depth: r.depth,
        mark: r.mark,
        color: toneColor(r.tone),
        bold: true,
        detail: r.text ?? '',
        stall: r.stall?.text ?? '',
        level: textLevelOf(r),
        running: r.isRunning,
        was: r.was ? WAS_PREFIX + r.was : '',
        merged: r.merged ? mergedLine(r.merged, () => true) : '',
        hasChildren: hasTreeDown(r, collapsed),
        foldCount: r.foldCount,
        foldOpen: r.foldCount > 0 && !collapsed(r.id),
        ...extras,
      })
    if (r.kind === 'ask')
      return line(r.id, r.text, {
        kind: r.kind,
        depth: r.depth,
        mark: r.mark,
        color: toneColor(r.tone),
        branch: r.branch ?? '',
        ...extras,
      })
    if (r.kind === 'child')
      return line(r.id, r.name, {
        kind: r.kind,
        seen: seenSubjectIds(r),
        depth: r.depth,
        mark: r.mark,
        color: toneColor(r.tone),
        detail: r.text ?? '',
        level: textLevelOf(r),
        running: r.isRunning,
        branch: r.branch ?? '',
        ...extras,
      })
    if (r.kind === 'counts')
      return line(r.id, r.counts.map(c => `${c.mark} ${c.text}`).join(' · '), {
        kind: r.kind,
        depth: r.depth,
        foldOpen: unfolded(r.id),
        ...extras,
      })
    if (r.kind === 'done-fold')
      return line(r.id, r.text, { kind: r.kind, depth: r.depth, foldOpen: unfolded(r.id), ...extras })
    if (r.kind === 'more')
      return line(r.id, r.text, { kind: r.kind, depth: r.depth, branch: r.branch ?? '', ...extras })
    return line(r.id, r.text ?? '', {
      kind: r.kind,
      seen: seenSubjectIds(r),
      depth: r.depth,
      mark: 'mark' in r ? r.mark : '',
      color: toneColor('tone' in r ? r.tone : undefined),
      bold: r.kind === 'part' && r.isTitle,
      isPartTitle: r.kind === 'part' && r.isTitle,
      detail: r.kind === 'part' ? (r.description ?? '') : '',
      ...extras,
    })
  }
  const goal = page.goal
  const fold = goal?.milestonesFold
  const rows: Line[] = fold ? [line(fold.id, fold.text, { kind: 'done-fold', foldOpen: unfolded(fold.id) })] : []
  const shown = shownMilestones(goal, unfolded)
  let prevBelow = 0
  for (const [mIndex, m] of shown.entries()) {
    const mRows = milestoneRows(m, unfolded, collapsed)
    const mPads = milestoneRowPads(m, mRows)
    const joints = workJoints(mRows, m.line)
    const mPad = milestonePadPt(m)
    if (m.startsLater) {
      rows.push(
        line(`later-${m.id}`, LATER_TEXT, {
          kind: 'part',
          spaceAbove: mIndex > 0 ? laterSpacePt(prevBelow) : 0,
          padTop: LIST_GAP_PT / 2,
          padBottom: LIST_GAP_PT / 2 + underLaterPt(m),
        }),
      )
    }
    const spaceAbove =
      mIndex > 0 && !m.startsLater && isSpacedAbove(shown, mIndex, unfolded, collapsed)
        ? milestoneSpacePt(prevBelow, m)
        : 0
    const x = m.subject
    rows.push(
      line(m.id, m.name, {
        kind: 'milestone',
        seen: x ? seenSubjectIds(x) : [],
        mark: m.mark,
        color: toneColor(m.tone),
        bold: m.isBold,
        isMutedName: m.isMuted,
        level: textLevelOf(m),
        detail: m.text ?? '',
        stall: x?.stall?.text ?? '',
        merged: x?.merged ? mergedLine(x.merged, () => true) : '',
        running: x?.isRunning ?? false,
        was: m.was ? WAS_PREFIX + m.was : '',
        padTop: mPad,
        padBottom: mPad,
        spaceAbove,
        pathLine: m.line ?? '',
        hasChildren: mRows.length > 0 && m.line === null,
        foldCount: m.foldId !== null ? 0 : m.foldCount,
        foldOpen: m.foldId !== null ? unfolded(m.foldId) : m.foldCount > 0 && !collapsed(m.id),
      }),
    )
    for (const [rIndex, r] of mRows.entries()) {
      rows.push(
        row(r, {
          padTop: mPads[rIndex]!.above,
          padBottom: mPads[rIndex]!.below,
          jointArm: joints[rIndex]?.arm ?? '',
          jointBeside: joints[rIndex]?.beside ?? '',
        }),
      )
    }
    prevBelow = milestoneGroupPadBelow(m, mRows)
  }
  const list = unfoldedRows(page.rows, unfolded, collapsed)
  const listPads = statusRowPads(list)
  for (const [index, r] of list.entries()) {
    if (r.kind === 'part') {
      const aboveBelow = index === 0 ? prevBelow : listPads[index - 1]!.below
      const nextAbove = listPads[index + 1]?.above ?? LIST_GAP_PT / 2
      const needsSectionGap = index > 0 || shown.length > 0 || !!fold
      rows.push(
        row(r, {
          padTop: 0,
          padBottom: Math.max(0, HEAD_GAP_PT - nextAbove),
          spaceAbove: needsSectionGap ? Math.max(0, SECTION_GAP_PT - aboveBelow) : 0,
        }),
      )
    } else {
      rows.push(row(r, { padTop: listPads[index]!.above, padBottom: listPads[index]!.below }))
    }
  }
  const keys = goalKeyGroups(page)
  const mapGoalKey = (key: StatusKey) => {
    const result = action(key)
    const press: RowPress | null =
      key.press.action === 'type-goal'
        ? { action: 'type', id: 'goal', text: '' }
        : ['remove-goal', 'restore-goal', 'take-goal'].includes(key.press.action)
          ? { action: key.press.action as 'remove-goal' | 'restore-goal' | 'take-goal', id: 'goal' }
          : null
    if (!command || !press) return result
    const supported = command.actions.includes(press.action) && command.actions.includes('remove-goal')
    const token = createHash('sha256')
      .update(JSON.stringify([command.binding, command.version, press]))
      .digest('hex')
    command.allowed.set(token, { press, disabled: !supported })
    return { ...result, key: token, disabled: !supported }
  }
  const statusHeadingActions = keys.heading.map(mapGoalKey)
  const statusOfferActions = keys.offer.map(mapGoalKey)
  const projection = {
    statusGoalHint: GOAL_FIELD.placeholder,
    statusGoalKey:
      [...statusHeadingActions, ...statusOfferActions].find(a => a.action === 'type-goal' && !a.disabled)?.key ?? '',
    statusSubmitLabel: goalSubmitLabel(page),
    statusLabel: goal?.label ?? GOAL_HEADING,
    statusMark: goal?.mark?.mark ?? '',
    statusMarkColor: goal?.mark ? toneColor(goal.mark.tone) : toneColor(),
    statusHasGoal: goal !== null,
    statusIsMet: goal?.isMet ?? false,
    statusTitle: goal?.text ?? NO_GOAL_TEXT,
    statusDetail: goal?.awaiting ?? '',
    statusWas: goal?.was ? WAS_PREFIX + goal.was : '',
    statusNow: goal?.now ?? '',
    statusOffer: page.suggestedGoal ? suggestedGoalOffer(page.suggestedGoal) : '',
    statusHeadingActions,
    statusOfferActions,
    statusActions: [...statusHeadingActions, ...statusOfferActions],
    statusRows: rows,
  }
  return { ...projection, statusVersion: renderVersion(projection) }
}
