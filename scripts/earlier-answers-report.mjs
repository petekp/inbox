#!/usr/bin/env node
// Compares, in the question history, the share of matched questions answered with their earlier answer when the row
// drew the line and when it did not, as "What shows it works" in docs/plans/repeated-questions.md sets out. It counts
// questions asked in the history's first 21 days only. The interval resamples sessions.
// Run: node scripts/earlier-answers-report.mjs [history folder]
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RESAMPLES = 2000
const WORKS_RISE = 0.03
const FAILS_BELOW = 0.01
// ROW_MEASUREMENT_MS in hooks/question-history.ts: after it, the record answer lists earlier answers too.
const MEASURED_MS = 21 * 24 * 60 * 60_000

const folder =
  process.argv[2] ?? join(process.env.XDG_STATE_HOME?.trim() || join(homedir(), '.local/state'), 'inbox', 'questions')

const files = readdirSync(folder)
  .filter(name => name.endsWith('.json'))
  .flatMap(name => {
    try {
      const file = JSON.parse(readFileSync(join(folder, name), 'utf8'))
      return file.version === 1 && Array.isArray(file.questions) ? [file] : []
    } catch {
      return []
    }
  })

const historyStart = Math.min(...files.map(file => file.created).filter(Number.isFinite))
const matchedOf = file =>
  file.questions.filter(q => q.earlier && (q.askedAt ?? q.answeredAt) < historyStart + MEASURED_MS)

function shares(sessions) {
  const count = { shown: [0, 0], hidden: [0, 0] }
  for (const questions of sessions)
    for (const q of questions) {
      const group = count[q.earlier.isShown ? 'shown' : 'hidden']
      group[0] += q.isAnsweredWithEarlier ? 1 : 0
      group[1] += 1
    }
  const share = ([hits, all]) => (all > 0 ? hits / all : NaN)

  return {
    count,
    rise: share(count.shown) - share(count.hidden),
    shown: share(count.shown),
    hidden: share(count.hidden),
  }
}

const sessions = files.map(matchedOf).filter(questions => questions.length > 0)
const found = shares(sessions)
const rises = []
for (let n = 0; n < RESAMPLES; n++) {
  const drawn = sessions.map(() => sessions[Math.floor(Math.random() * sessions.length)])
  const { rise } = shares(drawn)
  if (Number.isFinite(rise)) rises.push(rise)
}
rises.sort((a, b) => a - b)
const low = rises[Math.floor(rises.length * 0.025)]
const high = rises[Math.ceil(rises.length * 0.975) - 1]

const percent = x => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'none')
const verdict =
  !Number.isFinite(found.rise) || low === undefined
    ? 'inconclusive: one group has no matched answers'
    : found.rise >= WORKS_RISE && low > 0
      ? 'works'
      : high < FAILS_BELOW
        ? 'fails: remove the line'
        : 'inconclusive: the owner says whether the line helps'

console.log(`Sessions with a matched answer: ${sessions.length} of ${files.length}`)
console.log(`Answered with the earlier answer, line shown: ${found.count.shown.join(' of ')}, ${percent(found.shown)}`)
console.log(`Answered with the earlier answer, no line: ${found.count.hidden.join(' of ')}, ${percent(found.hidden)}`)
console.log(`Rise: ${percent(found.rise)}, 95% interval ${percent(low)} to ${percent(high)}`)
console.log(`Verdict: ${verdict}`)
const byHow = how => sessions.flat().filter(q => q.earlier.isShown && q.isAnsweredWithEarlier && q.how === how).length
console.log(
  `Answered with the earlier answer, line shown, by how: ${byHow('answered')} answered, ${byHow('update')} update`,
)
