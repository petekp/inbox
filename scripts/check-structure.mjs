import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SHARED = [
  'arrivals',
  'children',
  'clients',
  'conversation',
  'demo',
  'dialogs',
  'gh',
  'herdr',
  'inline',
  'layout',
  'ledger',
  'host-tasks',
  'status',
  'model-text',
  'pr-tab',
  'presses',
  'prs',
  'session',
  'session-host',
  'text',
  'tones',
  'tools',
  'view',
]
const PLAN_STATUS = /^Status: (proposed|building|built|superseded by \S+)/m

const errors = []
const read = path => readFileSync(join(ROOT, path), 'utf8')
const exists = path => existsSync(join(ROOT, path))

const require = createRequire(join(ROOT, 'codex/package.json'))
const { API } = await import(pathToFileURL(require.resolve('typescript/unstable/sync')).href)
const ts = await import(pathToFileURL(require.resolve('typescript/unstable/ast')).href)

function importsOf(source) {
  const found = []
  const add = (node, dynamicFunction = null) => {
    if (node)
      found.push({
        from: ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null,
        node,
        dynamicFunction,
      })
  }
  const visit = (node, functionName = null) => {
    const isFunction =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    const enclosingFunction = isFunction
      ? ts.isFunctionDeclaration(node) && node.parent === source && node.name?.text === 'load'
        ? 'topLevelLoad'
        : null
      : functionName
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier)
    } else if (ts.isImportTypeNode(node)) {
      add(node.argument.literal)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? enclosingFunction : null)
    }
    node.forEachChild(child => visit(child, enclosingFunction))
  }
  visit(source)

  return found
}

function sourceFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(entry.name) ? [path] : []
  })
}

function localTarget(path) {
  if (existsSync(path) && statSync(path).isFile()) return realpathSync(path)
  const extension = path.match(/\.(?:[cm]?js|jsx)$/)?.[0]
  const base = extension ? path.slice(0, -extension.length) : path
  const candidates = extension
    ? [`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, path]
    : [
        path,
        ...['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.mjs', '.cjs'].map(ext => `${path}${ext}`),
        join(path, 'index.ts'),
        join(path, 'index.tsx'),
        join(path, 'index.d.ts'),
      ]
  const target = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
  return target ? realpathSync(target) : null
}

function importTarget(project, path, dependency) {
  if (dependency.from === null) return null
  if (dependency.from.startsWith('.')) {
    const target = localTarget(resolve(dirname(join(ROOT, path)), dependency.from))
    if (target) return target
  }
  for (const [alias, targets] of Object.entries(project.compilerOptions.paths ?? {})) {
    const [before, after = ''] = alias.split('*')
    const matches = alias.includes('*')
      ? dependency.from.startsWith(before) && dependency.from.endsWith(after)
      : dependency.from === alias
    if (!matches) continue
    const part = dependency.from.slice(before.length, dependency.from.length - after.length)
    for (const target of targets) {
      const resolved = localTarget(resolve(dirname(project.configFileName), target.replace('*', part)))
      if (resolved) return resolved
    }
  }
  const symbol = project.checker.getSymbolAtLocation(dependency.node)
  const declaration = symbol?.declarations.find(node => node.kind === ts.SyntaxKind.SourceFile)
  return declaration
    ? realpathSync(project.program.getSourceFile(declaration.path)?.fileName ?? declaration.path)
    : null
}

// Hot reload selects installed or dev handler URLs at runtime; see docs/looks.md.
function isHandlerReload(path, dependency) {
  return (
    path === 'codex/src/server-main.ts' &&
    dependency.dynamicFunction === 'topLevelLoad' &&
    ts.isIdentifier(dependency.node) &&
    dependency.node.text === 'url'
  )
}

function checkImports() {
  const sharedFiles = SHARED.map(name => `hooks/${name}.ts`)
  const sharedTargets = new Set(sharedFiles.map(path => realpathSync(join(ROOT, path))))
  const hooks = `${realpathSync(join(ROOT, 'hooks'))}${sep}`
  const types = `${realpathSync(join(ROOT, 'types'))}${sep}`
  const codex = `${realpathSync(join(ROOT, 'codex'))}${sep}`
  const sharedTests = `${realpathSync(ROOT)}${sep}tests${sep}`
  const ompFiles = exists('omp') ? [...sourceFiles('omp/src'), ...sourceFiles('omp/tests')] : []
  const files = [...sharedFiles, ...sourceFiles('codex/src'), ...sourceFiles('codex/tests'), ...ompFiles]
  const api = new API({ cwd: ROOT })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(ROOT, path)) })
    const rootDir = `${realpathSync(ROOT)}${sep}`
    const sourceByPath = new Map()
    const sourceFor = (project, path) => {
      const canonical = realpathSync(path)
      if (sourceByPath.has(canonical)) return sourceByPath.get(canonical)
      const source = project?.program.getSourceFile(path) ?? project?.program.getSourceFile(canonical)
      if (source) sourceByPath.set(canonical, source)
      return source
    }
    const modeOf = path => (sharedFiles.includes(path) ? 'shared' : ompFiles.includes(path) ? 'omp' : 'codex')
    const queue = files.map(path => ({ path, mode: modeOf(path) }))
    const visited = new Set()
    while (queue.length) {
      const { path, mode } = queue.shift()
      const absolute = join(ROOT, path)
      const project = snapshot.getDefaultProjectForFile(absolute)
      const source = sourceFor(project, absolute)
      if (!source) throw new Error(`Cannot parse ${path}.`)
      const canonical = realpathSync(source.fileName)
      const relative = canonical.startsWith(rootDir) ? canonical.slice(rootDir.length) : path
      const visitKey = `${mode}:${canonical}`
      if (visited.has(visitKey)) continue
      visited.add(visitKey)

      for (const dependency of importsOf(source)) {
        const { from } = dependency
        if (from === null) {
          if (!isHandlerReload(relative, dependency))
            errors.push(`${relative} imports a computed module outside the runtime hot-reload loader.`)
          continue
        }
        const target = importTarget(project, relative, dependency)
        if (mode === 'shared') {
          if (!sharedTargets.has(target) && !target?.startsWith(types))
            errors.push(
              `${relative} imports '${from}'. A shared dependency imports only other shared modules and types/.`,
            )
        } else if (mode === 'omp') {
          if (target?.startsWith(hooks) && !sharedTargets.has(target))
            errors.push(`${relative} imports '${from}', which is not a shared module. omp can only use shared modules.`)
          if (target?.startsWith(codex)) errors.push(`${relative} imports '${from}'. omp does not import from codex/.`)
          if (target?.startsWith(sharedTests) && !relative.startsWith('omp/tests/'))
            errors.push(`${relative} imports '${from}'. Only omp's tests import the shared session test.`)
          if (from.startsWith('@oh-my-pi/') && relative !== 'omp/src/host.ts')
            errors.push(`${relative} imports '${from}'. Only omp/src/host.ts imports omp's packages.`)
        } else if (target?.startsWith(hooks) && !sharedTargets.has(target)) {
          errors.push(
            `${relative} imports '${from}', which is not a shared module. Codex can only bundle shared modules.`,
          )
        }

        if (!target?.startsWith(rootDir) || target.split(sep).includes('node_modules')) continue
        const targetSource = sourceFor(project, target)
        if (!targetSource) continue
        const targetPath = realpathSync(targetSource.fileName)
        queue.push({ path: targetPath.slice(rootDir.length), mode })
      }
    }
  } finally {
    api.close()
  }
}

function docFiles() {
  const files = ['README.md', 'AGENTS.md', 'GLOSSARY.md', 'ROADMAP.md', 'codex/README.md'].filter(exists)
  const walk = dir => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${entry}`
      if (statSync(join(ROOT, path)).isDirectory()) walk(path)
      else if (path.endsWith('.md')) files.push(path)
    }
  }
  walk('docs')

  return files
}

const TOP_LEVEL = new Set(readdirSync(ROOT).filter(entry => entry !== 'node_modules'))

function isIgnored(path) {
  try {
    execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', '--no-index', path])
    return true
  } catch {
    return false
  }
}

function checkDocs() {
  for (const doc of docFiles()) {
    const text = read(doc)
    if (doc.startsWith('docs/plans/') && !PLAN_STATUS.test(text))
      errors.push(`${doc} has no status line: "Status: proposed", "building", "built" or "superseded by <plan>".`)
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0]
      if (!target || /^[a-z]+:/.test(target)) continue
      if (!existsSync(join(ROOT, dirname(doc), target))) errors.push(`${doc} links to ${target}, which does not exist.`)
    }
    const isUnbuilt = /^Status: (proposed|building)/m.test(text)
    if (doc.startsWith('docs/reference/') || (doc.startsWith('docs/plans/') && isUnbuilt)) continue
    for (const m of text.matchAll(/`([\w.-]+\/[\w./-]+\.[a-z]+)(?::[\w.]+)?`/g)) {
      const path = m[1]
      if (!TOP_LEVEL.has(path.split('/')[0])) continue
      if (!exists(path) && !existsSync(join(ROOT, dirname(doc), path)) && !isIgnored(path))
        errors.push(`${doc} names ${path}, which does not exist.`)
    }
  }
}

// Type shims declare a module's shape and hold no code, so they need no row.
const isMapped = path => /\.(?:ts|tsx|html)$/.test(path) && !path.endsWith('.d.ts')

function checkLookMap() {
  const map = 'docs/looks.md'
  const rows = new Set([...read(map).matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1]))
  for (const dir of ['hooks', 'codex/src', 'omp/src'].filter(exists))
    for (const entry of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${entry}`
      if (isMapped(path) && !rows.has(path)) errors.push(`${map} has no Files row for ${path}.`)
    }
  for (const m of read(map).matchAll(/`([\w./-]+\.[a-z]+):([\w.]+)`/g)) {
    const [, path, symbol] = m
    if (!exists(path)) continue
    if (!new RegExp(`\\b${symbol.replaceAll('.', '\\.')}\\b`).test(read(path)))
      errors.push(`${map} names ${path}:${symbol}, and ${path} has no ${symbol}.`)
  }
}

const FEATURE_ID = /^[a-z]+(-[a-z]+)*$/
const DIFFERENCE_TABLES = { 'claude-code': 'main', codex: 'main', omp: 'omp' }

const nameOf = node => (ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null)
const propertiesOf = node =>
  ts.isObjectLiteralExpression(node)
    ? node.properties.filter(p => ts.isPropertyAssignment(p) && nameOf(p.name) !== null)
    : []
const propertyOf = (node, name) => propertiesOf(node).find(p => nameOf(p.name) === name)?.initializer

function parityRecord() {
  const path = 'hooks/clients.ts'
  if (!exists(path)) return null
  const api = new API({ cwd: ROOT })
  try {
    const absolute = join(ROOT, path)
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

function differenceRows(table) {
  const text = read('docs/looks.md')
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

function checkClients() {
  const record = parityRecord()
  if (!record) return void errors.push('hooks/clients.ts is missing.')
  const known = new Set(record.features)
  for (const id of record.features)
    if (!FEATURE_ID.test(id))
      errors.push(`hooks/clients.ts has feature id '${id}'. Use lowercase words joined by hyphens.`)
  const named = {}
  for (const table of new Set(Object.values(DIFFERENCE_TABLES))) {
    named[table] = new Set(differenceRows(table))
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

checkImports()
checkDocs()
checkLookMap()
checkClients()

for (const e of errors) console.log(`  x ${e}`)
process.exit(errors.length ? 1 : 0)
