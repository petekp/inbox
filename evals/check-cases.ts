import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { EMPTY, upgradeLedger } from '../hooks/ledger'
import type { Ledger } from '../types'

/**
 * Checks the eval case files with no model calls: every saved ledger loads through `upgradeLedger` with its items,
 * findings and Overview, and every agent case after a Compare press checks that the agent closes nothing. Prints each
 * problem and exits 1 when there is one.
 */
const root = process.argv[2] ?? process.cwd()
const read = (name: string) => JSON.parse(readFileSync(join(root, 'evals', name), 'utf8')) as Record<string, any>[]
const problems: string[] = []

function checkLedger(where: string, saved: Partial<Ledger> | undefined) {
  if (saved === undefined) return
  const loaded = upgradeLedger({ ...EMPTY, ...saved } as Ledger)
  const lost = [
    loaded.items.length !== (saved.items?.length ?? 0) ? 'items' : null,
    loaded.findings.length !== (saved.findings?.length ?? 0) ? 'findings' : null,
    (saved.overview ?? null) !== null && loaded.overview === null ? 'Overview' : null,
    Array.isArray(saved.overview?.subjects) && loaded.overview?.subjects.length !== saved.overview.subjects.length
      ? 'Overview subjects'
      : null,
  ].filter(Boolean)
  if (lost.length > 0) problems.push(`${where}: loading its ledger changed its ${lost.join(', ')}`)
}

for (const c of read('cases.json')) checkLedger(`cases.json ${c.name}`, c.ledger)
for (const c of read('agent-cases.json')) {
  checkLedger(`agent-cases.json ${c.name}`, c.ledger)
  checkLedger(`agent-cases.json ${c.name} toolLedger`, c.toolLedger)
  const isAfterCompare = /\bpressed Compare\b/.test(c.prompt)
  const checksNoClose = (c.checks as Record<string, unknown>[]).some(k => k.calls === 'close' && k.count === 0)
  if (isAfterCompare && !checksNoClose)
    problems.push(`agent-cases.json ${c.name}: a Compare case must check that the agent makes no close call`)
}

for (const p of problems) console.log(p)
process.exit(problems.length > 0 ? 1 : 0)
