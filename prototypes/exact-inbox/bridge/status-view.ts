import { renderVersion } from './render-version'
import { createHash } from 'node:crypto'
import type { ViewIdentity } from './row-view'
import type { AllowedAction } from './row-view'
import type { RowPress } from '../../../core/domain/presses'
import { toneColors } from '../../../core/view/tones'
import type { ToneName } from '../../../core/view/tones'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones, suggestedGoalOffer } from '../../../core/view/status-goal-page'
import { milestoneRows, unfoldedRows } from '../../../core/view/status-folds'
import { goalKeyGroups, goalSubmitLabel, statusKeyRows, GOAL_FIELD } from '../../../core/view/status-keys'
import type { StatusKey } from '../../../core/view/status-keys'
import type { StatusPage, StatusRow } from '../../../core/view/status-page'
import { mergedLine } from '../../../core/view/status-page-parts'
import { seenSubjectIds, WAS_PREFIX } from '../../../core/view/status-page'
import type { Result } from '../app.contract'

type Inbox = Result<'loadInbox'>
type Line = Inbox['statusRows'][number]
export type StatusOptions = { folds: string[]; collapsed: string[] }
const noStatusOptions: StatusOptions = { folds: [], collapsed: [] }

const color = (tone?: ToneName | null) => {
  if (!tone) return '-exact-secondary-label'
  const value = toneColors(tone)
  return `light-dark(${value.light}, ${value.dark})`
}
const action = (
  { press, label }: StatusKey,
  offer: (id: string) => string = () => '',
): Inbox['statusActions'][number] => ({
  collapse: press.action === 'toggle-collapse' ? offer(press.id) : '',
  key: '',
  action: press.action,
  target: 'askId' in press ? press.askId : 'foldId' in press ? press.foldId : 'id' in press ? press.id : '',
  text: 'text' in press ? press.text : '',
  label,
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
    color: color(),
    bold: false,
    running: false,
    waitsOn: '',
    was: '',
    merged: '',
    actions: plans.get(id) ?? [],
    ...values,
  })
  const row = (r: StatusRow): Line => {
    if (r.kind === 'subject')
      return line(r.id, r.name, {
        kind: r.kind,
        seen: seenSubjectIds(r),
        depth: r.depth,
        mark: r.mark,
        color: color(r.tone),
        bold: true,
        detail: [r.text, r.stall?.text].filter(Boolean).join(' · '),
        running: r.isRunning,
        waitsOn: r.waitsOn ?? '',
        was: r.was ? WAS_PREFIX + r.was : '',
        merged: r.merged ? mergedLine(r.merged, () => true) : '',
      })
    if (r.kind === 'child')
      return line(r.id, r.name, {
        kind: r.kind,
        seen: seenSubjectIds(r),
        depth: r.depth,
        mark: r.mark,
        color: color(r.tone),
        running: r.isRunning,
      })
    if (r.kind === 'counts')
      return line(r.id, r.counts.map(c => `${c.mark} ${c.text}`).join(' · '), { kind: r.kind, depth: r.depth })
    return line(r.id, r.text ?? '', {
      kind: r.kind,
      seen: seenSubjectIds(r),
      depth: r.depth,
      mark: 'mark' in r ? r.mark : '',
      color: color('tone' in r ? r.tone : undefined),
      bold: r.kind === 'part',
      detail: r.kind === 'part' ? (r.description ?? '') : '',
    })
  }
  const goal = page.goal
  const fold = goal?.milestonesFold
  const rows: Line[] = fold ? [line(fold.id, fold.text, { kind: 'done-fold' })] : []
  for (const m of shownMilestones(goal, unfolded)) {
    if (m.startsLater) rows.push(line(`later-${m.id}`, 'Later', { kind: 'part' }))
    rows.push(
      line(m.id, m.name, {
        kind: 'milestone',
        mark: m.mark,
        color: color(m.tone),
        bold: m.isBold,
        detail: m.text ?? '',
        was: m.was ? WAS_PREFIX + m.was : '',
      }),
    )
    rows.push(...milestoneRows(m, unfolded, collapsed).map(row))
  }
  rows.push(...unfoldedRows(page.rows, unfolded, collapsed).map(row))
  const keys = goalKeyGroups(page)
  const actions = [...keys.heading, ...keys.offer].map(key => {
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
  })
  const projection = {
    statusGoalHint: GOAL_FIELD.placeholder,
    statusGoalKey: actions.find(a => a.action === 'type-goal' && !a.disabled)?.key ?? '',
    statusSubmitLabel: goalSubmitLabel(page),
    statusLabel: goal?.label ?? GOAL_HEADING,
    statusTitle: goal?.text ?? NO_GOAL_TEXT,
    statusDetail: goal?.awaiting ?? '',
    statusWas: goal?.was ? WAS_PREFIX + goal.was : '',
    statusNow: goal?.now ?? '',
    statusOffer: page.suggestedGoal ? suggestedGoalOffer(page.suggestedGoal) : '',
    statusActions: actions,
    statusRows: rows,
  }
  return { ...projection, statusVersion: renderVersion(projection) }
}
