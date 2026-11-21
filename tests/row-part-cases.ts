import type { Feedback } from '../core/view/feedback'
import type { RowView } from '../core/view/rows'

export type RowKind = 'question' | 'task' | 'finding'
type FeedbackPlace = 'none' | 'above' | 'under'

export type RowCase = {
  kind: RowKind
  isWide: boolean
  holdsUp: boolean
  context: boolean
  earlier: boolean
  notes: boolean
  reason: boolean
  file: boolean
  typing: boolean
  feedback: FeedbackPlace
}

const BOTH = [false, true] as const
const PLACES: FeedbackPlace[] = ['none', 'above', 'under']

const OPTIONAL: Record<RowKind, (keyof RowCase)[]> = {
  question: ['holdsUp', 'context', 'earlier', 'notes', 'reason', 'typing'],
  task: ['holdsUp', 'context', 'typing'],
  finding: ['file', 'typing'],
}

const OFF = { holdsUp: false, context: false, earlier: false, notes: false, reason: false, file: false, typing: false }

export function rowCases(kinds: RowKind[] = ['question', 'task', 'finding']): RowCase[] {
  return kinds.flatMap(kind => {
    const flagSets = OPTIONAL[kind].reduce<Record<string, boolean>[]>(
      (sets, flag) => sets.flatMap(s => BOTH.map(on => ({ ...s, [flag]: on }))),
      [{}],
    )

    return BOTH.flatMap(isWide =>
      flagSets.flatMap(flags => PLACES.map(feedback => ({ kind, isWide, ...OFF, ...flags, feedback }) as RowCase)),
    )
  })
}

export const caseName = (c: RowCase): string =>
  [
    c.kind,
    c.isWide ? 'wide' : 'narrow',
    ...(['holdsUp', 'context', 'earlier', 'notes', 'reason', 'file', 'typing'] as const).filter(f => c[f]),
    c.feedback === 'none' ? null : `feedback ${c.feedback}`,
  ]
    .filter(Boolean)
    .join(', ')

const feedbackOf = (place: FeedbackPlace, now: number): Feedback | null =>
  place === 'above'
    ? { is: 'note', note: 'stale', at: now - 1000 }
    : place === 'under'
      ? { is: 'working', label: 'Discuss', at: now - 1000 }
      : null

export function caseRow(c: RowCase, base: RowView, now: number): RowView {
  const answers = base.actions.flatMap(a => (a.press.action === 'answer' ? [a.press.option] : []))
  const options = answers.map((option, n) => ({
    option,
    description: c.notes ? `What picking ${option} does.` : null,
    reason: c.reason && n === 0 ? 'it keeps the old API' : null,
    isFolded: false,
  }))

  return {
    ...base,
    holdsUpLine: c.holdsUp ? 'Holds up Pinch to dismiss' : null,
    contextLine: c.context ? 'Testers asked whether a glance they cleared should come back.' : null,
    earlierLine: c.earlier ? { lead: 'You answered ', answer: 'Keep it', rest: ' on Nov 3' } : null,
    detail: c.kind === 'finding' ? (base.detail ?? 'The retry loop never backs off.') : null,
    fileName: c.file ? 'retry.ts' : null,
    finding: base.finding && { ...base.finding, path: c.file ? 'hooks/retry.ts' : null },
    optionDescriptions: c.kind === 'question' ? options : base.optionDescriptions,
    feedback: feedbackOf(c.feedback, now),
  }
}
