import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { $ } from 'bun'
import { CUT_OPACITY } from '../core/view/row-motion'
import { type CodexEv, type CodexSpec, type PageFailure, type PageRun, drive } from './codex-page'
import { type Rng, rngOf } from './rng'
import { CODEX_SEEDS, apartFrom, knownIssueOf, ownFailures } from './seeds'
import { without } from './shrink'

/** A Codex tab case: the page's theme, width and reduced motion, and what the person does. */
export type CodexCase = { look: 'codex'; theme: 'light' | 'dark'; width: number; isReduced: boolean; events: CodexEv[] }

const PORT = 4795
const SESSION = 'inbox-fuzz-codex'
const REST_MS = 1500
const SHRINK_TRIES = 12
const KEYS = [
  'j',
  'k',
  'ArrowDown',
  'ArrowUp',
  'Enter',
  'Escape',
  'z',
  'u',
  'w',
  '?',
  '1',
  '2',
  '3',
  '4',
  'x',
  'e',
  'r',
]
const GAPS = [0, 16, 50, 120, 300, 300, 800]

function eventOf(rng: Rng): CodexEv {
  const r = rng.next()
  if (r < 0.3) return { is: 'wait', ms: rng.pick(GAPS) }
  if (r < 0.5) return { is: 'click', on: 'row', n: rng.int(0, 9) }
  if (r < 0.7) return { is: 'click', on: 'button', n: rng.int(0, 7) }
  if (r < 0.77) return { is: 'click', on: 'tab', n: rng.int(0, 4) }
  if (r < 0.95) return { is: 'key', key: rng.pick(KEYS) }
  return { is: 'type', text: rng.pick(['ok', 'Ship it', 'नमस्ते', '😀 yes']) }
}

function caseOf(rng: Rng): CodexCase {
  return {
    look: 'codex',
    theme: rng.chance(0.5) ? 'light' : 'dark',
    width: rng.pick([360, 520, 800]),
    isReduced: rng.chance(0.25),
    events: [{ is: 'wait', ms: 300 }, ...Array.from({ length: rng.int(3, 14) }, () => eventOf(rng))],
  }
}

const browse = (...args: string[]) => $`agent-browser --session ${SESSION} ${args}`.nothrow().quiet()

let thread = 0
let server: ReturnType<typeof Bun.spawn> | null = null

/** Starts the tab page on its own port, with demo data, and the browser session that draws it. */
async function open(): Promise<void> {
  server = Bun.spawn(['sh', join(import.meta.dir, '..', 'codex', 'scripts', 'tab-page.sh'), String(PORT)], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/`).catch(() => null)
    if (r?.ok) return
    await Bun.sleep(100)
  }
  throw new Error(`the tab page did not start on port ${PORT}`)
}

async function close(): Promise<void> {
  await browse('close')
  if (!server) return
  await Bun.$`pkill -TERM -P ${server.pid}`.nothrow().quiet()
  server.kill()
  await server.exited
}

/** What a case found, or why it could not run, as when the tab page did not load. */
type CaseRun = PageRun | { notRun: string }

const isNotRun = (r: CaseRun): r is { notRun: string } => 'notRun' in r

/** Runs one case in a fresh demo, a new thread id, and returns what the page found. */
async function runCase(c: CodexCase, freezeOn?: string): Promise<CaseRun> {
  await browse('set', 'viewport', String(c.width), '900')
  await browse('set', 'media', c.theme, ...(c.isReduced ? ['reduced-motion'] : []))
  await browse('open', `http://127.0.0.1:${PORT}/?theme=${c.theme}&thread=fuzz-${Date.now()}-${thread++}`)
  for (let i = 0; i < 25; i++) {
    const n = await browse(
      'eval',
      "document.getElementById('tab')?.contentDocument?.querySelectorAll('[data-motion]').length ?? 0",
    )
    if (Number(n.stdout.toString().trim()) > 0) break
    await Bun.sleep(300)
  }
  await Bun.sleep(600)
  const spec: CodexSpec = {
    events: c.events,
    isReduced: c.isReduced,
    restMs: REST_MS,
    cutOpacity: CUT_OPACITY,
    freezeOn,
  }
  const out = await browse('eval', `(${drive.toString()})(${JSON.stringify(spec)})`)
  try {
    return JSON.parse(out.stdout.toString()) as PageRun
  } catch {
    const why = (out.stderr.toString() || out.stdout.toString()).trim().split('\n')[0] ?? ''
    return { notRun: why.slice(0, 200) || 'the page gave no answer' }
  }
}

const issueOf = (f: PageFailure) => knownIssueOf({ ...f, look: 'codex' })

/** The kind of box a failure is in, with ids left out, such as `thread` or `d` for a list row. */
function boxKindOf(detail: string): string {
  const box = detail.match(/in its box (.*)$/)?.[1] ?? detail.match(/^(\S+) (?:grew|shrank|moved)/)?.[1] ?? ''
  return box.split(/[\s:]/).find(t => t !== '' && !/\d/.test(t)) ?? box.replace(/[^a-z-]/gi, '')
}

const kindOf = (f: PageFailure) => `${f.rule} ${issueOf(f) ?? `new ${boxKindOf(f.detail)}`}`

const failuresOf = (r: CaseRun): PageFailure[] => (isNotRun(r) ? [] : r.failures)

const failsWith = async (c: CodexCase, kind: string) => failuresOf(await runCase(c)).some(f => kindOf(f) === kind)

async function shrunkOf(c: CodexCase, kind: string): Promise<CodexCase> {
  let best = c
  let tries = 0
  for (let isSmaller = true; isSmaller && tries < SHRINK_TRIES;) {
    isSmaller = false
    for (const events of without(best.events)) {
      if (++tries > SHRINK_TRIES) break
      const next = { ...best, events }
      if (await failsWith(next, kind)) {
        best = next
        isSmaller = true
        break
      }
    }
  }
  return best
}

function report(c: CodexCase, f: PageFailure, run: PageRun, from: string, again: number): string {
  return [
    `# codex: ${f.rule}`,
    '',
    f.detail,
    '',
    `- At ${f.at} ms into the case, after event ${f.after}.`,
    `- ${from}. The shrunk case failed ${again} of 3 runs, since the page runs on real time.`,
    `- ${c.theme} theme, ${c.width} px wide${c.isReduced ? ', reduced motion' : ''}.`,
    '',
    '## Events',
    '',
    ...c.events.map((e, i) => `${i}. \`${JSON.stringify(e)}\`${run.notes[i] ? `: ${run.notes[i]}` : ''}`),
    '',
    '## Failures',
    '',
    ...run.failures.slice(0, 40).map(x => `- ${x.rule} at ${x.at} ms: ${x.detail}`),
    '',
  ].join('\n')
}

/**
 * Runs the seeds, then `runs` generated cases; writes one report per new rule broken, and returns summary lines.
 * `notRun` counts the cases that could not run, which are judged neither passed nor failed.
 */
export async function runCodex(
  seed: number,
  runs: number,
  out: string,
): Promise<{ lines: string[]; isBroken: boolean; notRun: number }> {
  await open()
  const counts = new Map<string, { cases: number; issue: number | null }>()
  const seedLines: string[] = []
  const notRunLines: string[] = []
  let isSeedBroken = false
  try {
    for (const s of CODEX_SEEDS) {
      const seedRun = await runCase(s.case)
      if (isNotRun(seedRun)) {
        notRunLines.push(`codex seed #${s.issue}, ${s.name}: could not run: ${seedRun.notRun}`)
        continue
      }
      const { own: failures, others } = ownFailures('codex', s.issue, seedRun.failures)
      const isAsIssueSays = failures.some(
        f => f.rule === s.rule && (s.detail === undefined || f.detail.includes(s.detail)),
      )
      const rules = [...new Set(failures.map(f => f.rule))].join(', ')
      const verdict =
        failures.length === 0
          ? s.isOpen
            ? `passes, though its issue is open. Close #${s.issue} and mark the seed closed in fuzz/seeds.ts in the same PR`
            : 'passes'
          : s.isOpen && isAsIssueSays
            ? `fails as its issue says (${rules})`
            : `fails, but not as its issue says (${rules})`
      const isFixedWhileOpen = failures.length === 0 && s.isOpen
      if (isFixedWhileOpen || (failures.length > 0 && !(s.isOpen && isAsIssueSays))) isSeedBroken = true
      seedLines.push(`codex seed #${s.issue}, ${s.name}: ${verdict}${apartFrom(others)}`)
    }
    for (let n = 0; n < runs; n++) {
      const c = caseOf(rngOf(seed, n))
      const run = await runCase(c)
      if (isNotRun(run)) {
        notRunLines.push(`codex case ${n}: could not run: ${run.notRun}`)
        continue
      }
      const kinds = new Map(run.failures.map(f => [kindOf(f), f]))
      for (const [kind, first] of kinds) {
        const count = counts.get(kind) ?? { cases: 0, issue: issueOf(first) }
        count.cases++
        counts.set(kind, count)
        if (count.issue !== null || count.cases !== 1) continue
        const { rule } = first
        const name = `codex-${kind.replace(/ new ?/, '-').replace(/[^a-z-]/gi, '')}`
        const shrunk = await shrunkOf(c, kind)
        const runs3 = [await runCase(shrunk), await runCase(shrunk), await runCase(shrunk)]
        const isNew = (r: CaseRun): r is PageRun => failuresOf(r).some(f => kindOf(f) === kind)
        const again = runs3.filter(isNew).length
        const kept = again > 0 ? shrunk : c
        const shown = runs3.find(isNew) ?? run
        const f = shown.failures.find(x => kindOf(x) === kind) ?? first
        const from =
          again > 0
            ? `Found by seed ${seed}, case ${n}. Shrunk from ${c.events.length} events to ${shrunk.events.length}`
            : `Found by seed ${seed}, case ${n}, shown as found. Shrunk to ${shrunk.events.length} events, it did not fail again`
        writeFileSync(join(out, `${name}.json`), JSON.stringify(kept, null, 2))
        const frozen = await runCase(kept, rule)
        const isFrozen = !isNotRun(frozen) && frozen.isFrozen === true
        if (isFrozen) await browse('screenshot', join(out, `${name}.png`))
        const replay = join('fuzz', 'out', basename(out), `${name}.json`)
        const frame = isFrozen
          ? `\n## Frame\n\n\`${name}.png\` shows the page paused at the first ${rule} failure of another run.\n`
          : ''
        const text = report(kept, f, shown, from, again)
        writeFileSync(join(out, `${name}.md`), `${text}\nReplay: \`./scripts/fuzz.sh --replay ${replay}\`\n${frame}`)
        console.log(`${name}: ${f.detail}`)
      }
    }
  } finally {
    await close()
  }
  const lines = [...counts].map(([kind, c]) =>
    c.issue === null
      ? `codex ${kind.replace(/ new$/, '')}: ${c.cases} of ${runs} cases, new`
      : `codex ${kind.replace(/ \d+$/, '')}: ${c.cases} of ${runs} cases, known as #${c.issue}`,
  )
  const isNewFound = [...counts.values()].some(c => c.issue === null)
  const ranLine = `codex: ${runs - notRunLines.filter(l => l.startsWith('codex case')).length} of ${runs} cases ran`

  return {
    lines: [...seedLines, ranLine, ...lines, ...notRunLines],
    isBroken: isNewFound || isSeedBroken,
    notRun: notRunLines.length,
  }
}

/**
 * Runs one saved Codex case again, prints what the page found, and captures its first failing frame beside the case.
 * Returns the exit status: 0 when it passes, 1 when it fails and 2 when it could not run.
 */
export async function replayCodex(c: CodexCase, path: string): Promise<number> {
  await open()
  try {
    const run = await runCase(c)
    if (isNotRun(run)) {
      console.log(`could not run: ${run.notRun}`)
      return 2
    }
    const first = run.failures[0]
    const frozen = first ? await runCase(c, first.rule) : null
    if (frozen && !isNotRun(frozen) && frozen.isFrozen) {
      await browse('screenshot', path.replace(/\.json$/, '.png'))
      console.log(`frame: ${path.replace(/\.json$/, '.png')}`)
    }
    for (const f of run.failures.slice(0, 20))
      console.log(`codex ${f.rule} at ${f.at} ms after event ${f.after}: ${f.detail}`)
    console.log(run.failures.length === 0 ? 'passes' : `${run.failures.length} failures`)
    return run.failures.length === 0 ? 0 : 1
  } finally {
    await close()
  }
}
