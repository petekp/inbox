import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { read } from './docs.mjs'
import { API, nameOf, propertiesOf, propertyOf, ts } from './ts.mjs'

const FEATURE_ID = /^[a-z]+(-[a-z]+)*$/
const DIFFERENCE_TABLES = { 'claude-code': 'main', codex: 'main', omp: 'omp' }

function parityRecord(root) {
  const path = 'hooks/clients.ts'
  if (!existsSync(join(root, path))) return null
  const api = new API({ cwd: root })
  try {
    const absolute = join(root, path)
    const project = api.updateSnapshot({ openFiles: [absolute] }).getDefaultProjectForFile(absolute)
    const source = project?.program.getSourceFile(absolute) ?? project?.program.getSourceFile(realpathSync(absolute))
    if (!source) throw new Error(`Cannot parse ${path}.`)
    const record = { features: [], clients: new Map() }
    const visit = node => {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === 'FeatureId') {
        const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type]
        record.features = members.flatMap(t =>
          ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? [t.literal.text] : [],
        )
      } else if (ts.isVariableDeclaration(node) && node.name.text === 'CLIENTS' && node.initializer) {
        for (const client of propertiesOf(node.initializer)) {
          const support = new Map()
          for (const entry of propertiesOf(propertyOf(client.initializer, 'support') ?? client.initializer)) {
            const kind = propertyOf(entry.initializer, 'kind')
            const reason = propertyOf(entry.initializer, 'reason')
            support.set(nameOf(entry.name), {
              kind: kind && ts.isStringLiteral(kind) ? kind.text : null,
              reason: reason && ts.isStringLiteral(reason) ? reason.text : '',
            })
          }
          record.clients.set(nameOf(client.name), support)
        }
      }
      node.forEachChild(visit)
    }
    visit(source)

    return record
  } finally {
    api.close()
  }
}

function differenceRows(root, table) {
  const text = read(root, 'docs/looks.md')
  const start = text.indexOf('## Differences on purpose')
  const omp = text.indexOf('### omp', start)
  const end = text.indexOf('\n## ', omp === -1 ? start + 1 : omp)
  const section =
    start === -1
      ? ''
      : table === 'omp'
        ? omp === -1
          ? ''
          : text.slice(omp, end === -1 ? undefined : end)
        : text.slice(start, omp === -1 ? undefined : omp)

  return section
    .split('\n')
    .filter(line => line.startsWith('|'))
    .map(line => line.split('|')[1] ?? '')
    .flatMap(cell => [...cell.matchAll(/`([a-z][a-z0-9-]*)`/g)].map(m => m[1]))
}

export function checkClients(root, errors) {
  const record = parityRecord(root)
  if (!record) return void errors.push('hooks/clients.ts is missing.')
  const known = new Set(record.features)
  for (const id of record.features)
    if (!FEATURE_ID.test(id))
      errors.push(`hooks/clients.ts has feature id '${id}'. Use lowercase words joined by hyphens.`)
  const named = {}
  for (const table of new Set(Object.values(DIFFERENCE_TABLES))) {
    named[table] = new Set(differenceRows(root, table))
    for (const id of named[table])
      if (!known.has(id))
        errors.push(
          `docs/looks.md names '${id}' in a Differences on purpose row, and hooks/clients.ts has no such feature.`,
        )
  }
  for (const [client, support] of record.clients) {
    const table = DIFFERENCE_TABLES[client]
    if (!table) errors.push(`scripts/check-structure.mjs has no Differences on purpose table for client '${client}'.`)
    for (const id of record.features) {
      const entry = support.get(id)
      if (!entry || !['full', 'different', 'unsupported'].includes(entry.kind)) {
        errors.push(`hooks/clients.ts has no valid support for '${id}' in client '${client}'.`)
        continue
      }
      if (entry.kind === 'full') continue
      if (!entry.reason.trim()) errors.push(`hooks/clients.ts gives no reason for '${id}' in client '${client}'.`)
      if (table && !named[table].has(id))
        errors.push(
          `docs/looks.md has no Differences on purpose row naming \`${id}\`, which is ${entry.kind} in client '${client}'.`,
        )
    }
  }
}
