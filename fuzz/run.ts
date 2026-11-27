import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Case, Look } from './case'
import type { Failure } from './failure'
import { caseOf } from './gen'
import { rngOf } from './rng'
import { shrink } from './shrink'
import { apartFrom, knownIssueOf, ownFailures, staleKnownIssues } from './known'
import { SEEDS } from './seeds'

const USAGE =
  'usage: fuzz.sh [--look omp|herdr|rows|codex|mod|all] [--seed N] [--runs N] [--case N] [--time S] [--shrinks N] [--known] [--replay <case.json>]'

function argsOf(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const look = get('look') ?? 'all'
  if (!['omp', 'herdr', 'rows', 'codex', 'mod', 'all'].includes(look)) throw new Error(USAGE)

  return {
    looks: (look === 'all' ? ['herdr', 'omp'] : ['rows', 'codex', 'mod'].includes(look) ? [] : [look]) as Look[],
    hasCodex: look === 'codex',
    hasMod: look === 'mod',
    hasRows: look === 'rows' || look === 'all',
    seed: Number(get('seed') ?? Date.now() % 1_000_000),
    runs: Number(get('runs') ?? 100),
    seconds: Number(get('time') ?? Infinity),
    shrinks: Number(get('shrinks') ?? 2),
    only: get('case') === undefined ? null : Number(get('case')),
    isKnownReported: argv.includes('--known'),
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

const failsWith = (rule: string, issue: number | null) => async (c: Case) =>
  (await failuresOf(c)).some(f => f.rule === rule && knownIssueOf(f) === issue)

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
    const saved = JSON.parse(readFileSync(args.replay, 'utf8')) as { look: string; records?: unknown }
    if (saved.records !== undefined)
      process.exit((await (await import('./look-mod')).replayMod(args.replay)) === 0 ? 0 : 1)
    if (saved.look === 'codex')
      process.exit(await (await import('./look-codex')).replayCodex(saved as never, args.replay))
    const c = saved as Case
    const failures = await failuresOf(c)
    for (const f of failures.slice(0, 20))
      console.log(`${f.look} ${f.rule} at ${f.at} ms after event ${f.after}: ${f.detail}`)
    console.log(failures.length === 0 ? 'passes' : `${failures.length} failures`)
    process.exit(failures.length === 0 ? 0 : 1)
  }
  const out = join(import.meta.dir, 'out', `${new Date().toISOString().replace(/[:.]/g, '-')}-seed${args.seed}`)
  mkdirSync(out, { recursive: true })
  const seen = new Set<string>()
  const counts = new Map<string, { cases: number; shrunk: number; reported: number; issue: number | null }>()
  const seedLines: string[] = []
  let isSeedBroken = false
  for (const s of SEEDS.filter(s => args.looks.includes(s.case.look))) {
    const { own: failures, others } = ownFailures(s.case.look, s.issue, await failuresOf(s.case), s)
    const rules = [...new Set(failures.map(f => f.rule))].join(', ')
    const isAsIssueSays = failures.some(
      f => f.rule === s.rule && (s.detail === undefined || f.detail.includes(s.detail)),
    )
    const verdict =
      failures.length === 0
        ? s.isOpen
          ? `passes, though its issue is open. Close #${s.issue} and mark the seed closed in fuzz/seeds.ts in the same PR`
          : 'passes'
        : !s.isOpen
          ? `fails again (${rules})`
          : isAsIssueSays
            ? `fails as its issue says (${rules})`
            : `fails, but not as its issue says (${rules})`
    const isFixedWhileOpen = failures.length === 0 && s.isOpen
    if (isFixedWhileOpen || (failures.length > 0 && !(s.isOpen && isAsIssueSays))) isSeedBroken = true
    seedLines.push(`seed #${s.issue}, ${s.name}: ${verdict}${apartFrom(others)}`)
  }
  for (const n of staleKnownIssues()) {
    isSeedBroken = true
    seedLines.push(
      `KNOWN in fuzz/known.ts names #${n}, which no open seed holds. Delete its entries in the PR that marks its seed closed`,
    )
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
  const codex = args.hasCodex ? await (await import('./look-codex')).runCodex(args.seed, args.runs, out) : null
  const mod = args.hasMod ? await (await import('./look-mod')).runMod(args.seed, args.runs, out) : null
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
    const kinds = new Map(run.failures.map(f => [`${f.rule} ${knownIssueOf(f) ?? 'new'}`, f]))
    for (const [kind, first] of kinds) {
      const { rule } = first
      const issue = knownIssueOf(first)
      const key = `${look} ${kind}`
      const count = counts.get(key) ?? { cases: 0, shrunk: 0, reported: 0, issue }
      count.cases++
      counts.set(key, count)
      if (issue !== null && !args.isKnownReported) continue
      const name = `${look}-${rule}${issue === null ? '' : `-${issue}`}`
      if (args.shrinks === 0 && count.cases === 1) {
        count.reported++
        write(`${name}-${count.reported}`, c, first, run.notes, { n, events: c.events.length, tries: 0 })
      }
      if (count.shrunk >= args.shrinks) continue
      count.shrunk++
      const { shrunk, tries } = await shrink(c, failsWith(rule, issue))
      const shrunkRun = await checked(shrunk)
      const shrunkFailure = shrunkRun.failures.find(f => f.rule === rule && knownIssueOf(f) === issue)
      const sig = `${key} ${JSON.stringify(shrunk)}`
      if (!shrunkFailure || seen.has(sig)) continue
      seen.add(sig)
      count.reported++
      write(`${name}-${count.reported}`, shrunk, shrunkFailure, shrunkRun.notes, {
        n,
        events: c.events.length,
        tries,
      })
    }
  }
  const lines = [...counts].map(([key, c]) =>
    c.issue === null
      ? `${key.replace(/ new$/, '')}: ${c.cases} of ${ran} cases, new, ${c.reported} reported`
      : `${key.replace(/ \d+$/, '')}: ${c.cases} of ${ran} cases, known as #${c.issue}`,
  )
  const isNewFound = [...counts.values()].some(c => c.issue === null)
  const summary = [
    ...seedLines,
    ...(args.looks.length > 0 ? [`seed ${args.seed}, ${ran} cases in ${Math.round((realNow() - t0) / 1000)} s`] : []),
    ...lines,
    ...(rows?.lines ?? []),
    ...(codex?.lines ?? []),
    ...(mod?.lines ?? []),
  ].join('\n')
  writeFileSync(join(out, 'summary.txt'), summary + '\n')
  console.log(summary)
  console.log(`reports: ${out}`)
  const isBroken = isNewFound || rows?.isBroken || codex?.isBroken || mod?.isBroken || isSeedBroken
  process.exit(isBroken ? 1 : (codex?.notRun ?? 0) > 0 ? 2 : 0)
}

await main()
