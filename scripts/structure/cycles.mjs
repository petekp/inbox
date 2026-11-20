import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'

import { importTarget } from './imports.mjs'
import { API, ts } from './ts.mjs'

const DIRS = ['hooks', 'codex/src', 'omp/src', 'herdr/src']

function sourceFiles(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(root, path)
    return /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

const isTypeOnlyImport = clause =>
  clause.isTypeOnly ||
  (!clause.name &&
    clause.namedBindings &&
    ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every(element => element.isTypeOnly))

const isTypeOnlyExport = statement =>
  statement.isTypeOnly ||
  (statement.exportClause &&
    ts.isNamedExports(statement.exportClause) &&
    statement.exportClause.elements.length > 0 &&
    statement.exportClause.elements.every(element => element.isTypeOnly))

/**
 * The modules a file loads when it loads: static imports and re-exports that bring a value. A type-only import is
 * erased, and an `import()` call loads its module later, so neither can make a module read another before it is set up.
 */
function valueImportsOf(source) {
  const found = []
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.importClause || !isTypeOnlyImport(statement.importClause)) found.push(statement.moduleSpecifier)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (!isTypeOnlyExport(statement)) found.push(statement.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      found.push(statement.moduleReference.expression)
    }
  }

  return found.filter(node => ts.isStringLiteral(node)).map(node => ({ from: node.text, node }))
}

/** Tarjan's strongly connected components, each with more than one module or a module that imports itself. */
function cyclesIn(graph) {
  const index = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  let next = 0
  const visit = node => {
    index.set(node, next)
    low.set(node, next)
    next++
    stack.push(node)
    onStack.add(node)
    for (const target of graph.get(node)) {
      if (!index.has(target)) {
        visit(target)
        low.set(node, Math.min(low.get(node), low.get(target)))
      } else if (onStack.has(target)) low.set(node, Math.min(low.get(node), index.get(target)))
    }
    if (low.get(node) !== index.get(node)) return
    const component = []
    let member
    do {
      member = stack.pop()
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length > 1 || graph.get(node).has(node)) components.push(component.sort())
  }
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node)

  return components
}

/** The shortest path from a component's first module back to itself, through the component. */
function loopThrough(graph, component) {
  const members = new Set(component)
  const start = component[0]
  const previous = new Map()
  const queue = [start]
  while (queue.length) {
    const node = queue.shift()
    for (const target of graph.get(node)) {
      if (!members.has(target)) continue
      if (target === start) {
        const path = [node]
        while (path[0] !== start) path.unshift(previous.get(path[0]))
        return [...path, start]
      }
      if (!previous.has(target)) {
        previous.set(target, node)
        queue.push(target)
      }
    }
  }

  return [start, start]
}

export function checkCycles(root, errors) {
  const rootDir = realpathSync(root)
  const files = DIRS.filter(dir => existsSync(join(rootDir, dir))).flatMap(dir => sourceFiles(rootDir, dir))
  const graph = new Map(files.map(path => [path, new Set()]))
  const api = new API({ cwd: rootDir })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(rootDir, path)) })
    for (const path of files) {
      const absolute = join(rootDir, path)
      const project = snapshot.getDefaultProjectForFile(absolute)
      const source = project?.program.getSourceFile(absolute)
      if (!source) throw new Error(`Cannot parse ${path}.`)
      for (const dependency of valueImportsOf(source)) {
        const target = importTarget(rootDir, project, path, dependency)
        const targetPath = target && relative(rootDir, target)
        if (graph.has(targetPath)) graph.get(path).add(targetPath)
      }
    }
  } finally {
    api.close()
  }
  for (const component of cyclesIn(graph))
    errors.push(
      `Value imports form a cycle: ${loopThrough(graph, component).join(' -> ')}` +
        (component.length > 2 ? `, among ${component.join(', ')}` : '') +
        '. If an import brings only types, write it as `import type`. Otherwise move the shared piece into the module that owns it, as docs/looks.md names, so the imports run one way.',
    )
}
