import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Case, Look } from './case'
import type { Failure } from './failure'
import { caseOf } from './gen'
import { rngOf } from './rng'
import { shrink } from './shrink'
import { SEEDS } from './seeds'

const USAGE =
  'usage: fuzz.sh [--look omp|herdr|rows|all] [--seed N] [--runs N] [--case N] [--time S] [--shrinks N] [--replay <case.json>]'

function argsOf(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const look = get('look') ?? 'all'
  if (!['omp', 'herdr', 'rows', 'all'].includes(look)) throw new Error(USAGE)

  return {
    looks: (look === 'all' ? ['herdr', 'omp'] : look === 'rows' ? [] : [look]) as Look[],
    hasRows: look === 'rows' || look === 'all',
    seed: Number(get('seed') ?? Date.now() % 1_000_000),
    runs: Number(get('runs') ?? 100),
    seconds: Number(get('time') ?? Infinity),
    shrinks: Number(get('shrinks') ?? 2),
    only: get('case') === undefined ? null : Number(get('case')),
    replay: get('replay'),
  }
}

type Checked = { failures: Failure[]; notes: string[] }

async function checked(c: Case): Promise<Checked> {
  const input = JSON.stringify(c)
  if (c.look === 'herdr') {
    const [{ runHerdr }, { herdrFailures }] = await Promise.all([import('./look-herdr'), import('./rules-herdr')])
    const run = await runHerdr(c)
    return { failures: herdrFailures(run, input), notes: run.notes }
  }
  const [{ runOmp }, { ompFailures }] = await Promise.all([import('./look-omp'), import('./rules-omp')])
  const run = await runOmp(c)

  return { failures: ompFailures(run, input), notes: run.notes }
}

const failuresOf = async (c: Case) => (await checked(c)).failures

const failsWith = (rule: string) => async (c: Case) => (await failuresOf(c)).some(f => f.rule === rule)

function report(
  c: Case,
  f: Failure,
  notes: string[],
  from: { seed: number; n: number | string; events: number; tries: number; path: string },
): string {
  const event = (i: number) =>
    i >= 0 && i < c.events.length
      ? JSON.stringify(c.events[i])
      : i >= c.events.length
        ? 'after the last event, as the look comes to rest'
        : 'before the first event'
  return [
    `# ${f.look}: ${f.rule}`,
    '',
    f.detail,
    '',
    `- At ${f.at} ms into the case, after event ${f.after}: ${event(f.after)}.`,
    `- Found by seed ${from.seed}, case ${from.n}` +
      (from.tries > 0
        ? `. Shrunk from ${from.events} events to ${c.events.length} in ${from.tries} tries.`
        : ', not shrunk.'),
    `- The session starts with ${c.session.ledger.items.length} items, ${c.session.ledger.findings.length} findings, ${c.session.ledger.closed.length} closed rows and ${Object.keys(c.session.prViews.views).length} PRs.`,
    `- Replay: \`./scripts/fuzz.sh --replay ${from.path}\``,
    '',
    '## Events',
    '',
    ...c.events.map((e, i) => `${i}. \`${JSON.stringify(e)}\`${notes[i] ? `: ${notes[i]}` : ''}`),
    '',
    '## Seen',
    '',
    '```',
    typeof f.seen === 'string' ? f.seen : JSON.stringify(f.seen, null, 2),
    '```',
    '',
  ].join('\n')
}

async function main() {
  const args = argsOf(Bun.argv.slice(2))
  if (args.replay) {
    const c = JSON.parse(readFileSync(args.replay, 'utf8')) as Case
    const failures = await failuresOf(c)
    for (const f of failures.slice(0, 20))
      console.log(`${f.look} ${f.rule} at ${f.at} ms after event ${f.after}: ${f.detail}`)
    console.log(failures.length === 0 ? 'passes' : `${failures.length} failures`)
    process.exit(failures.length === 0 ? 0 : 1)
  }
  const out = join(import.meta.dir, 'out', `${new Date().toISOString().replace(/[:.]/g, '-')}-seed${args.seed}`)
  mkdirSync(out, { recursive: true })
  const seen = new Set<string>()
  const counts = new Map<string, { cases: number; shrunk: number; reported: number }>()
  const seedLines: string[] = []
  let isSeedBroken = false
  for (const s of SEEDS.filter(s => args.looks.includes(s.case.look))) {
    const failures = await failuresOf(s.case)
    const rules = [...new Set(failures.map(f => f.rule))].join(', ')
    const isAsIssueSays = failures.some(
      f => f.rule === s.rule && (s.detail === undefined || f.detail.includes(s.detail)),
    )
    const verdict =
      failures.length === 0
        ? s.isOpen
          ? 'passes, though its issue is open: the issue is fixed or the harness misses it'
          : 'passes'
        : !s.isOpen
          ? `fails again (${rules})`
          : isAsIssueSays
            ? `fails as its issue says (${rules})`
            : `fails, but not as its issue says (${rules})`
    if (failures.length > 0 && !(s.isOpen && isAsIssueSays)) isSeedBroken = true
    seedLines.push(`seed #${s.issue}, ${s.name}: ${verdict}`)
  }
  const write = (
    name: string,
    c: Case,
    f: Failure,
    notes: string[],
    from: { n: number; events: number; tries: number },
  ) => {
    const path = join('fuzz', 'out', basename(out), `${name}.json`)
    writeFileSync(join(out, `${name}.json`), JSON.stringify(c, null, 2))
    writeFileSync(join(out, `${name}.md`), report(c, f, notes, { ...from, seed: args.seed, path }))
    console.log(`${name}: ${f.detail}`)
  }
  const rows = args.hasRows ? (await import('./look-rows')).runRows(args.seed, args.runs * 50, out) : null
  let ran = 0
  const realNow = performance.now.bind(performance)
  const t0 = realNow()
  for (let i = 0; args.looks.length > 0 && ran < args.runs && (realNow() - t0) / 1000 < args.seconds; i++) {
    const n = args.only ?? Math.floor(i / args.looks.length)
    const look = args.looks[i % args.looks.length] ?? 'herdr'
    if (args.only !== null && i >= args.looks.length) break
    const c = caseOf(rngOf(args.seed, n), look)
    ran++
    const run = await checked(c)
    for (const rule of new Set(run.failures.map(f => f.rule))) {
      const key = `${look} ${rule}`
      const count = counts.get(key) ?? { cases: 0, shrunk: 0, reported: 0 }
      count.cases++
      counts.set(key, count)
      const first = run.failures.find(f => f.rule === rule)
      if (args.shrinks === 0 && count.cases === 1 && first) {
        count.reported++
        write(`${look}-${rule}-${count.reported}`, c, first, run.notes, { n, events: c.events.length, tries: 0 })
      }
      if (count.shrunk >= args.shrinks) continue
      count.shrunk++
      const { shrunk, tries } = await shrink(c, failsWith(rule))
      const shrunkRun = await checked(shrunk)
      const shrunkFailure = shrunkRun.failures.find(f => f.rule === rule)
      const sig = `${key} ${JSON.stringify(shrunk)}`
      if (!shrunkFailure || seen.has(sig)) continue
      seen.add(sig)
      count.reported++
      write(`${look}-${rule}-${count.reported}`, shrunk, shrunkFailure, shrunkRun.notes, {
        n,
        events: c.events.length,
        tries,
      })
    }
  }
  const lines = [...counts].map(([key, c]) => `${key}: ${c.cases} of ${ran} cases, ${c.reported} reported`)
  const summary = [
    ...seedLines,
    `seed ${args.seed}, ${ran} cases in ${Math.round((realNow() - t0) / 1000)} s`,
    ...lines,
    ...(rows?.lines ?? []),
  ].join('\n')
  writeFileSync(join(out, 'summary.txt'), summary + '\n')
  console.log(summary)
  console.log(`reports: ${out}`)
  process.exit(counts.size === 0 && !rows?.isBroken && !isSeedBroken ? 0 : 1)
}

await main()
