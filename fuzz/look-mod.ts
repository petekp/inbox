import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import type { ModCase } from './mod-case'
import { recordArgs } from './gen'
import { type Rng, rngOf } from './rng'
import { knownIssueOf } from './known'
import { MOD_SEEDS } from './seeds-mod'
import { without } from './shrink'

type ModFailure = { rule: string; detail: string }

const ROOT = join(import.meta.dir, '..')
const SHRINK_TRIES = 12

function caseOf(rng: Rng): ModCase {
  return {
    look: rng.chance(0.5) ? 'terminal' : 'desktop',
    columns: rng.pick([30, 50, 80, 120]),
    records: Array.from({ length: rng.int(1, 6) }, () => recordArgs(rng)),
  }
}

/** Runs cases in the plugin test engine, as one fuzz file, and returns each case's failures by name. */
async function runCases(
  cases: { name: string; c: ModCase }[],
  dir: string,
  batch = 'cases',
): Promise<Map<string, ModFailure[]>> {
  const file = join(dir, `${batch}.fuzz.ts`)
  writeFileSync(file, `import { fuzzMod } from '../fuzz/mod-look'\n\nfuzzMod(${JSON.stringify(cases)})\n`)
  const run = await $`${join(ROOT, 'scripts', 'test-files.sh')} ${file}`.nothrow().quiet()
  const log = run.stdout.toString() + run.stderr.toString()
  writeFileSync(join(dir, `${batch}.log`), log)
  const found = new Map<string, ModFailure[]>()
  for (const line of log.split('\n')) {
    const m = line.match(/^FUZZ (\S+) (.*)$/)
    if (m?.[1] && m[2]) found.set(m[1], JSON.parse(m[2]) as ModFailure[])
  }
  for (const { name } of cases)
    if (!found.has(name)) found.set(name, [{ rule: 'no-run', detail: `the case logged no result; see ${batch}.log` }])
  return found
}

const issueOf = (f: ModFailure) => knownIssueOf({ ...f, look: 'mod' })

async function shrunkOf(c: ModCase, rule: string, dir: string): Promise<ModCase> {
  let best = c
  let tries = 0
  for (let isSmaller = true; isSmaller && tries < SHRINK_TRIES;) {
    isSmaller = false
    for (const records of without(best.records)) {
      if (++tries > SHRINK_TRIES || records.length === 0) break
      const next = { ...best, records }
      const failures = (await runCases([{ name: 'shrink', c: next }], dir, 'shrink')).get('shrink') ?? []
      if (failures.some(f => f.rule === rule && issueOf(f) === null)) {
        best = next
        isSmaller = true
        break
      }
    }
  }
  return best
}

/** Runs the mod's seeds and `runs` generated cases in its terminal and desktop looks, and returns summary lines. */
export async function runMod(seed: number, runs: number, out: string): Promise<{ lines: string[]; isBroken: boolean }> {
  const dir = join(out, 'mod')
  mkdirSync(dir, { recursive: true })
  const seeds = MOD_SEEDS.map((s, i) => ({ name: `seed-${i}`, c: s.case }))
  const generated = Array.from({ length: runs }, (_, n) => ({ name: `case-${n}`, c: caseOf(rngOf(seed, n)) }))
  const found = await runCases([...seeds, ...generated], dir)
  const seedLines = MOD_SEEDS.map((s, i) => {
    const failures = found.get(`seed-${i}`) ?? []
    const isAsIssueSays = failures.some(f => f.rule === s.rule && issueOf(f) === s.issue)
    const isFixedWhileOpen = failures.length === 0 && s.isOpen
    const verdict =
      failures.length === 0
        ? s.isOpen
          ? `passes, though its issue is open. Close #${s.issue} and mark the seed closed in fuzz/seeds-mod.ts in the same PR`
          : 'passes'
        : isAsIssueSays
          ? 'fails as its issue says'
          : `fails, but not as its issue says (${failures.map(f => f.rule).join(', ')})`
    return {
      line: `mod seed #${s.issue}, ${s.name}: ${verdict}`,
      isBroken: isFixedWhileOpen || (failures.length > 0 && !isAsIssueSays),
    }
  })
  const counts = new Map<string, { cases: number; issue: number | null }>()
  for (const { name, c } of generated) {
    const failures = found.get(name) ?? []
    for (const [kind, f] of new Map(failures.map(f => [`${f.rule} ${issueOf(f) ?? 'new'}`, f]))) {
      const count = counts.get(kind) ?? { cases: 0, issue: issueOf(f) }
      count.cases++
      counts.set(kind, count)
      if (count.issue !== null || count.cases !== 1) continue
      const shrunk = await shrunkOf(c, f.rule, dir)
      const again = (await runCases([{ name: 'shrunk', c: shrunk }], dir, 'shrunk')).get('shrunk') ?? []
      const shown = again.find(x => x.rule === f.rule) ?? f
      const path = join(out, `mod-${f.rule}.json`)
      writeFileSync(path, JSON.stringify(shrunk, null, 2))
      const report = [
        `# mod ${shrunk.look}: ${f.rule}`,
        '',
        shown.detail,
        '',
        `- Found by seed ${seed}, ${name}. Shrunk from ${c.records.length} records to ${shrunk.records.length}.`,
        `- ${shrunk.look}, ${shrunk.columns} columns.`,
        `- Replay: \`./scripts/fuzz.sh --replay ${path}\``,
        '',
        '## Records',
        '',
        ...shrunk.records.map((r, i) => `${i}. \`${JSON.stringify(r)}\``),
        '',
      ].join('\n')
      writeFileSync(join(out, `mod-${f.rule}.md`), report)
      console.log(`mod-${f.rule}: ${shown.detail}`)
    }
  }
  const lines = [...counts].map(([kind, c]) =>
    c.issue === null
      ? `mod ${kind.replace(/ new$/, '')}: ${c.cases} of ${runs} cases, new`
      : `mod ${kind.replace(/ \d+$/, '')}: ${c.cases} of ${runs} cases, known as #${c.issue}`,
  )
  const isNewFound = [...counts.values()].some(c => c.issue === null)
  return {
    lines: [...seedLines.map(s => s.line), `mod: ${runs} cases`, ...lines],
    isBroken: isNewFound || seedLines.some(s => s.isBroken),
  }
}

/** Runs one saved mod case again and prints its failures. */
export async function replayMod(path: string): Promise<number> {
  const c = JSON.parse(readFileSync(path, 'utf8')) as ModCase
  const dir = join(ROOT, 'fuzz', 'out', 'replay')
  mkdirSync(dir, { recursive: true })
  const failures = (await runCases([{ name: 'replay', c }], dir)).get('replay') ?? []
  for (const f of failures) console.log(`mod ${f.rule}: ${f.detail}`)
  console.log(failures.length === 0 ? 'passes' : `${failures.length} failures`)
  return failures.length
}
