/** What the judge checks on a page, each tied to a property of a good Status in `docs/plans/status.md`. */
export const JUDGE_CHECKS = [
  {
    id: 'head',
    property: 1,
    text: 'The head names what the session is focused on now, not a small part of its work or work it has moved past.',
  },
  { id: 'rows-are-work', property: 3, text: "Each row is a piece of the session's work." },
  {
    id: 'each-once',
    property: 4,
    text: 'No two rows are the same work by meaning, and no new row is finished work under a new name.',
  },
  {
    id: 'marks',
    property: 5,
    text: 'Each mark on a row of work fits its piece\'s real state, and every open piece has a row or a place in the "N more" fold.',
  },
  {
    id: 'where-it-stands',
    property: 6,
    text: 'Where it stands says the state of the work, and keeps parts whose states differ.',
  },
  {
    id: 'child-labels',
    property: 7,
    text: 'Each row of running work sits under the piece it serves, and says in plain words what the work does.',
  },
  {
    id: 'no-restating',
    property: 9,
    text: "No text repeats an open ask or a finding in any words, or says that its piece waits on the person's decision.",
  },
  { id: 'was-lines', property: 12, text: 'A was line names the plan that was replaced, or the piece that merged in.' },
] as const

export type JudgeCheckId = (typeof JUDGE_CHECKS)[number]['id']

export type Verdict = 'pass' | 'fail'

/** What the judge reads at one checkpoint. */
export type JudgeInput = {
  /** The drawn page as plain text. */
  page: string
  /** The page at the last checkpoint, or null at the first. */
  previous: string | null
  /** The facts up to this point, as `factsText` writes them. */
  facts: string
}

/** The prompt the judge reads. Its system text comes from `judgeSystemText`. */
export function judgePrompt(input: JudgeInput): string {
  return [
    '<page>',
    input.page,
    '</page>',
    '<previous>',
    input.previous ?? '(none)',
    '</previous>',
    '<facts>',
    input.facts,
    '</facts>',
    '<checks>',
    ...JUDGE_CHECKS.map(c => `${c.id}: ${c.text}`),
    '</checks>',
  ].join('\n')
}

export type JudgeVerdict = { check: JudgeCheckId; verdict: Verdict; fact: string }

const ANSWER_LINE = /^\s*([a-z-]+)\s*\|\s*(pass|fail)\s*\|\s*(.+?)\s*$/i

/**
 * Reads the judge's answer: one line per check, `<check id> | pass | <the fact it rests on>` or `| fail |`. Other
 * lines are ignored. Null unless every check has exactly one verdict.
 */
export function parseJudgeAnswer(text: string | null): JudgeVerdict[] | null {
  if (text === null) return null
  const verdicts = new Map<string, JudgeVerdict>()
  for (const line of text.split('\n')) {
    const m = ANSWER_LINE.exec(line)
    if (!m) continue
    const check = JUDGE_CHECKS.find(c => c.id === m[1]!.toLowerCase())
    if (!check) continue
    if (verdicts.has(check.id)) return null
    verdicts.set(check.id, { check: check.id, verdict: m[2]!.toLowerCase() as Verdict, fact: m[3]! })
  }

  return verdicts.size === JUDGE_CHECKS.length ? JUDGE_CHECKS.map(c => verdicts.get(c.id)!) : null
}

/** A hand-written page in one of the judge's two page sets. */
export type JudgePage = JudgeInput & {
  id: string
  /** A bad page breaks one check and is otherwise the same as a good page. Null for a good page. */
  breaks: JudgeCheckId | null
  /** Why the page is good or bad, for the person reading a wrong verdict. */
  note: string
}

export type JudgePageSet = { set: 1 | 2; pages: JudgePage[] }

/**
 * What the judge got wrong on `page`: a check it failed on a good page, or on a bad page any verdict but a fail on
 * the check the page breaks and a pass on the rest. Empty when it called the page right.
 */
export function pageMistakes(page: JudgePage, verdicts: JudgeVerdict[] | null): string[] {
  if (verdicts === null) return ['no answer the harness can read']

  return verdicts.flatMap(v => {
    const expected: Verdict = v.check === page.breaks ? 'fail' : 'pass'
    return v.verdict === expected ? [] : [`${v.check}: ${v.verdict}, expected ${expected}`]
  })
}

/** The kind of mistake, without the page, for the judge's author: which check, and which way it was wrong. */
export function mistakeKind(page: JudgePage, mistake: string): string {
  const check = mistake.split(':')[0]
  const isFalsePass = mistake.includes('pass, expected fail')

  return isFalsePass
    ? `${check}: passed a page that breaks it`
    : `${check}: failed a page that ${page.breaks === null ? 'is good' : `breaks only ${page.breaks}`}`
}
