import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { lookParts, read } from './docs.mjs'
import { API, nameOf, propertiesOf, propertyOf, ts } from './ts.mjs'

const FEATURE_ID = /^[a-z]+(-[a-z]+)*$/
/** The Differences on purpose table each host's entries tie to. A published look ties to the table its own id names. */
const DIFFERENCE_TABLES = { 'claude-code': 'main', codex: 'main', omp: 'omp' }
const HOST_KINDS = ['full', 'different', 'unsupported']
const LOOK_KINDS = [...HOST_KINDS, 'host']

const RECORD_ENTRY = 'core/domain/clients.ts'

/** The record's files: `core/domain/clients.ts` and every local file it imports, followed through their own imports. */
function recordFiles(root) {
  const files = []
  const queue = [RECORD_ENTRY]
  while (queue.length > 0) {
    const path = queue.shift()
    if (files.includes(path) || !existsSync(join(root, path))) continue
    files.push(path)
    const text = readFileSync(join(root, path), 'utf8')
    for (const [, from] of text.matchAll(/^(?:import|export)\b[^'"]*?from\s+'(\.[^']+)'/gm))
      queue.push(relative(root, resolve(root, dirname(path), `${from}.ts`)))
  }
  return files
}

/**
 * `CLIENTS` names each host's table and `PUBLISHED_LOOKS` each published look's. A file the record imports may declare
 * a table, so tables are found by name across the record's files.
 */
function parityRecord(root) {
  if (!existsSync(join(root, RECORD_ENTRY))) return null
  const api = new API({ cwd: root })
  try {
    const paths = recordFiles(root)
    const absolutes = paths.map(path => join(root, path))
    const snapshot = api.updateSnapshot({ openFiles: absolutes })
    const record = { features: [], clients: new Map(), looks: new Set(), files: new Map() }
    const declared = new Map()
    let clientsNode = null
    let looksNode = null
    let path = RECORD_ENTRY
    const visit = node => {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === 'FeatureId') {
        const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type]
        record.features = members.flatMap(t =>
          ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? [t.literal.text] : [],
        )
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (node.name.text === 'CLIENTS') clientsNode = node.initializer
        else if (node.name.text === 'PUBLISHED_LOOKS') looksNode = node.initializer
        else declared.set(node.name.text, { initializer: node.initializer, path })
      }
      node.forEachChild(visit)
    }
    for (const [n, absolute] of absolutes.entries()) {
      const project = snapshot.getDefaultProjectForFile(absolute)
      const source = project?.program.getSourceFile(absolute) ?? project?.program.getSourceFile(realpathSync(absolute))
      if (!source) throw new Error(`Cannot parse ${paths[n]}.`)
      path = paths[n]
      visit(source)
    }
    const looks = looksNode ? propertiesOf(looksNode) : []
    for (const look of looks) record.looks.add(nameOf(look.name))
    for (const client of [...(clientsNode ? propertiesOf(clientsNode) : []), ...looks]) {
      const named = ts.isIdentifier(client.initializer) ? declared.get(client.initializer.text) : null
      const table = named ? named.initializer : client.initializer
      if (!table)
        throw new Error(
          `core/domain/clients.ts gives client '${nameOf(client.name)}' a table that no record file declares.`,
        )
      const support = new Map()
      for (const entry of propertiesOf(propertyOf(table, 'support') ?? table)) {
        const kind = propertyOf(entry.initializer, 'kind')
        const reason = propertyOf(entry.initializer, 'reason')
        support.set(nameOf(entry.name), {
          kind: kind && ts.isStringLiteral(kind) ? kind.text : null,
          reason: reason && ts.isStringLiteral(reason) ? reason.text : '',
        })
      }
      record.clients.set(nameOf(client.name), support)
      record.files.set(nameOf(client.name), named ? named.path : RECORD_ENTRY)
    }

    return record
  } finally {
    api.close()
  }
}

/**
 * The Differences on purpose tables: the main one, omp's, and one for each published look, each told apart by its
 * parts' names. A published look's parts are `docs/looks/differences-<look id>*.md`.
 */
function tableParts(looks) {
  return {
    main: 'docs/looks/differences-*.md',
    omp: 'docs/looks/differences-omp*.md',
    ...Object.fromEntries([...looks].map(look => [look, `docs/looks/differences-${look}*.md`])),
  }
}
const tableOf = (part, looks) =>
  part.startsWith('docs/looks/differences-omp')
    ? 'omp'
    : ([...looks].find(look => part.startsWith(`docs/looks/differences-${look}`)) ?? 'main')

function differenceRows(root, table, looks) {
  return lookParts(root, 'differences-')
    .filter(part => tableOf(part, looks) === table)
    .flatMap(part =>
      read(root, part)
        .split('\n')
        .filter(line => line.startsWith('|'))
        .map(line => line.split('|')[1] ?? '')
        .flatMap(cell => [...cell.matchAll(/`([a-z][a-z0-9-]*)`/g)].map(m => ({ id: m[1], part }))),
    )
}

export function checkClients(root, errors) {
  const record = parityRecord(root)
  if (!record) return void errors.push('core/domain/clients.ts is missing.')
  const known = new Set(record.features)
  for (const id of record.features)
    if (!FEATURE_ID.test(id))
      errors.push(`core/domain/client-features.ts has feature id '${id}'. Use lowercase words joined by hyphens.`)
  const tables = tableParts(record.looks)
  const named = {}
  for (const table of Object.keys(tables)) {
    const rows = differenceRows(root, table, record.looks)
    named[table] = new Set(rows.map(row => row.id))
    for (const { id, part } of rows)
      if (!known.has(id))
        errors.push(
          `${part} names '${id}' in a Differences on purpose row, and core/domain/client-features.ts has no such feature.`,
        )
  }
  for (const [client, support] of record.clients) {
    const isLook = record.looks.has(client)
    const table = isLook ? client : DIFFERENCE_TABLES[client]
    if (!table) errors.push(`scripts/structure/clients.mjs has no Differences on purpose table for client '${client}'.`)
    for (const id of record.features) {
      const entry = support.get(id)
      if (!entry || !(isLook ? LOOK_KINDS : HOST_KINDS).includes(entry.kind)) {
        errors.push(`${record.files.get(client)} has no valid support for '${id}' in client '${client}'.`)
        continue
      }
      if (entry.kind === 'full' || entry.kind === 'host') continue
      if (!entry.reason.trim())
        errors.push(`${record.files.get(client)} gives no reason for '${id}' in client '${client}'.`)
      if (table && !named[table].has(id))
        errors.push(
          `${tables[table]} has no Differences on purpose row naming \`${id}\`, which is ${entry.kind} in client '${client}'.`,
        )
    }
  }
}
