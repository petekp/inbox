import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { localTarget } from './imports.mjs'
import { API, nameOf, ts } from './ts.mjs'

/** Build output, and types/parts, which scripts/build-types.mjs joins into types/index.d.ts instead of importing. */
const SKIPPED_DIRS = new Set(['codex/plugin/dist', 'codex/test-dist', 'omp/dist', 'types/parts', 'videos/out'])

/**
 * Exports whose consumer is outside the repo's imports: a host or a tool loads the file, or a script reads it as text.
 * `names` lists the exports that consumer takes, or `'*'` for all of them.
 */
const ENTRY_POINTS = {
  'codex/src/server-handler.ts': { names: '*', why: 'codex/src/server-main.ts loads the built handler by URL.' },
  'codex/src/tab.tsx': { names: '*', why: 'codex/build.mjs bundles it as the tab page script.' },
  'evals/omp-probe.ts': { names: ['default'], why: 'The agent suite loads it into omp with -e.' },
  'hooks/clients.ts': { names: ['CLIENTS', 'FeatureId'], why: 'scripts/structure/clients.mjs reads them.' },
  'hooks/tones.ts': { names: ['DARK_TONES', 'LIGHT_TONES'], why: 'codex/build.mjs reads them for the tab colors.' },
  'omp/src/host.ts': { names: ['default'], why: 'omp loads the built bundle and calls its default export.' },
  'types/index.d.ts': { names: '*', why: 'scripts/build-types.mjs builds it from types/parts for the mod.' },
  'videos/remotion.config.ts': { names: '*', why: 'Remotion loads it by name.' },
  'videos/src/videos.ts': { names: ['TIMELINES'], why: 'videos/record/drive.py imports it from the built bundle.' },
}

function sourceFiles(root, dir = '.') {
  const entries = readdirSync(join(root, dir), { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))
  return entries.flatMap(entry => {
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`
    if (entry.isDirectory())
      return entry.name.startsWith('.') || entry.name === 'node_modules' || SKIPPED_DIRS.has(path)
        ? []
        : sourceFiles(root, path)
    return /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(entry.name) ? [path] : []
  })
}

const isExported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
const isDefault = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap(element => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)))
}

/** The names a file exports itself, and each module it takes names from: `'*'` for every name. */
function scan(source) {
  const exported = []
  const uses = []
  const use = (specifier, names) => {
    if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)))
      uses.push({ from: specifier.text, names })
  }
  for (const statement of source.statements) {
    if (ts.isModuleDeclaration(statement)) continue
    if (ts.isExportAssignment(statement)) exported.push('default')
    else if (ts.isExportDeclaration(statement)) {
      const specifiers =
        statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : null
      if (statement.moduleSpecifier)
        use(statement.moduleSpecifier, specifiers ? specifiers.map(s => nameOf(s.propertyName ?? s.name)) : ['*'])
      if (specifiers) exported.push(...specifiers.map(s => nameOf(s.name)))
    } else if (isExported(statement)) {
      if (ts.isVariableStatement(statement))
        exported.push(...statement.declarationList.declarations.flatMap(d => bindingNames(d.name)))
      else exported.push(isDefault(statement) ? 'default' : statement.name.text)
    }
  }
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const names = []
      if (clause?.name) names.push('default')
      if (bindings && ts.isNamespaceImport(bindings)) names.push('*')
      else if (bindings) names.push(...bindings.elements.map(s => nameOf(s.propertyName ?? s.name)))
      use(node.moduleSpecifier, names)
    } else if (ts.isImportTypeNode(node)) {
      const qualifier = node.qualifier
      let first = qualifier
      while (first && ts.isQualifiedName(first)) first = first.left
      use(node.argument.literal, [first ? first.text : '*'])
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      use(node.arguments[0], ['*'])
    } else if (ts.isJsxAttribute(node) && nameOf(node.name) === 'module' && node.initializer) {
      use(node.initializer, ['default'])
    }
    node.forEachChild(visit)
  }
  visit(source)

  return { exported, uses }
}

/** The mod's hooks modules, as hooks/hooks.json names them. The engine calls their exports. */
function hooksModules(root) {
  const path = join(root, 'hooks/hooks.json')
  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
  return (config?.modules ?? []).map(path => relative(root, resolve(root, 'hooks', path)))
}

export function checkExports(root, errors) {
  const rootDir = realpathSync(root)
  const files = sourceFiles(rootDir)
  const used = new Map(files.map(path => [path, new Set()]))
  const exportsOf = new Map()
  const api = new API({ cwd: rootDir })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(rootDir, path)) })
    for (const path of files) {
      const absolute = join(rootDir, path)
      const source = snapshot.getDefaultProjectForFile(absolute)?.program.getSourceFile(absolute)
      if (!source) throw new Error(`Cannot parse ${path}.`)
      const { exported, uses } = scan(source)
      exportsOf.set(path, exported)
      for (const { from, names } of uses) {
        if (!from.startsWith('.')) continue
        const target = localTarget(resolve(dirname(absolute), from))
        const targetPath = target && relative(rootDir, target)
        for (const name of names) used.get(targetPath)?.add(name)
      }
    }
  } finally {
    api.close()
  }
  for (const path of hooksModules(rootDir)) used.get(path)?.add('*')
  for (const [path, { names }] of Object.entries(ENTRY_POINTS))
    for (const name of [names].flat()) used.get(path)?.add(name)
  for (const [path, exported] of exportsOf) {
    const names = used.get(path)
    for (const name of exported)
      if (!names.has(name) && !names.has('*'))
        errors.push(
          `${path} exports ${name}, which nothing imports. Drop the export, or list a real entry point in scripts/structure/exports.mjs.`,
        )
  }
}
