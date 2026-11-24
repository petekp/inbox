import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type RowTarget, type RowTrack, drawsFormLeft, isMoving, moveMs, stepRow } from '../core/view/row-motion'
import type { Failure } from './failure'
import { type Rng, rngOf } from './rng'
import { without } from './shrink'

/** One draw of a row in the shared row stepper: the target the tab asks for, after `ms` since the last draw. */
type RowStep = { ms: number; target: RowTarget; isNew: boolean; isReduced: boolean }

const TARGETS: readonly RowTarget[] = ['closed', 'open', 'settled', 'undoing', 'gone']
const GAPS = [0, 1, 16, 16, 16, 50, 120, 200, 400, 1000]
const FRAME_MS = 16

function stepsOf(rng: Rng): RowStep[] {
  let isReduced = rng.chance(0.25)
  return Array.from({ length: rng.int(1, 30) }, (_, i) => {
    if (rng.chance(0.05)) isReduced = !isReduced
    return { ms: rng.pick(GAPS), target: rng.pick(TARGETS), isNew: i === 0 && rng.chance(0.5), isReduced }
  })
}

const formOfTarget = (t: RowTarget) => (t === 'undoing' ? 'settled' : t)

/** The rules a track breaks at one draw, as `[rule, detail]` pairs. */
function broken(track: RowTrack | null, step: RowStep, now: number): [string, string][] {
  const out: [string, string][] = []
  if (track === null) {
    if (step.target !== 'gone') out.push(['stepper-form', `asked for ${step.target}, the stepper dropped the row`])
    return out
  }
  const seen = JSON.stringify(track)
  if (!Number.isFinite(track.since)) out.push(['stepper-time', `since is ${track.since}: ${seen}`])
  if (track.since > now) out.push(['stepper-time', `since ${track.since} is after the draw at ${now}: ${seen}`])
  if (step.isReduced && isMoving(track.state))
    out.push(['stepper-reduced', `with reduced motion, asked for ${step.target} and got ${seen}`])
  if (drawsFormLeft(track, now) && !(isMoving(track.state) && now - track.since < moveMs(track)))
    out.push(['stepper-form-left', `draws the form it left outside its move: ${seen}`])
  if (!isMoving(track.state) && track.state !== formOfTarget(step.target) && track.state !== step.target)
    out.push(['stepper-form', `asked for ${step.target}, rests as ${track.state}`])
  if (isMoving(track.state)) {
    const end = track.since + moveMs(track) + FRAME_MS
    let later: RowTrack | null = track
    for (let t = now + FRAME_MS; later && isMoving(later.state) && t <= end + FRAME_MS; t += FRAME_MS)
      later = stepRow(later, step.target, t, false, step.isReduced)
    if (later && isMoving(later.state))
      out.push(['stepper-rest', `asked for ${step.target}, still ${later.state} past ${end} ms: ${seen}`])
  }
  return out
}

function failuresOf(steps: RowStep[]): Failure[] {
  let track: RowTrack | null | undefined
  let now = 0
  const failures: Failure[] = []
  for (const [i, step] of steps.entries()) {
    now += step.ms
    const next = stepRow(track ?? undefined, step.target, now, step.isNew, step.isReduced)
    for (const [rule, detail] of broken(next, step, now))
      failures.push({ look: 'rows', rule, at: now, after: i, detail, seen: steps.slice(0, i + 1) })
    if (next === null && step.target === 'gone') track = undefined
    else track = next
  }
  return failures
}

function shrunkOf(steps: RowStep[], rule: string): RowStep[] {
  const fails = (s: RowStep[]) => failuresOf(s).some(f => f.rule === rule)
  let best = steps
  for (let isSmaller = true; isSmaller;) {
    isSmaller = false
    for (const next of without(best))
      if (next.length > 0 && fails(next)) {
        best = next
        isSmaller = true
        break
      }
  }
  return best
}

/** Runs the shared row stepper over `runs` generated cases, writes one report per rule broken, and returns summary lines. */
export function runRows(seed: number, runs: number, out: string): { lines: string[]; isBroken: boolean } {
  const counts = new Map<string, number>()
  for (let n = 0; n < runs; n++) {
    const steps = stepsOf(rngOf(seed, n))
    for (const rule of new Set(failuresOf(steps).map(f => f.rule))) {
      counts.set(rule, (counts.get(rule) ?? 0) + 1)
      if (counts.get(rule) !== 1) continue
      const shrunk = shrunkOf(steps, rule)
      const f = failuresOf(shrunk).find(x => x.rule === rule)
      writeFileSync(
        join(out, `rows-${rule}.json`),
        JSON.stringify({ seed, case: n, steps: shrunk, failure: f }, null, 2),
      )
      console.log(`rows-${rule}: ${f?.detail}`)
    }
  }
  const lines = [...counts].map(([rule, c]) => `rows ${rule}: ${c} of ${runs} cases`)
  return { lines: [`rows: ${runs} stepper cases`, ...lines], isBroken: counts.size > 0 }
}
