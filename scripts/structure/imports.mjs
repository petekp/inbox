import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { SHARED } from '../shared-modules.mjs'
import { API, isFunction, ts } from './ts.mjs'

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
    const enclosingFunction = isFunction(node)
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

function sourceFiles(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory()
      ? sourceFiles(root, path)
      : /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(entry.name)
        ? [path]
        : []
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

function importTarget(root, project, path, dependency) {
  if (dependency.from === null) return null
  if (dependency.from.startsWith('.')) {
    const target = localTarget(resolve(dirname(join(root, path)), dependency.from))
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

// Hot reload selects installed or dev handler URLs at runtime; see docs/looks/differences-hosts.md.
function isHandlerReload(path, dependency) {
  return (
    path === 'codex/src/server-main.ts' &&
    dependency.dynamicFunction === 'topLevelLoad' &&
    ts.isIdentifier(dependency.node) &&
    dependency.node.text === 'url'
  )
}

export function checkImports(root, errors) {
  const sharedFiles = SHARED.map(name => `hooks/${name}.ts`)
  const sharedTargets = new Set(sharedFiles.map(path => realpathSync(join(root, path))))
  const hooks = `${realpathSync(join(root, 'hooks'))}${sep}`
  const types = `${realpathSync(join(root, 'types'))}${sep}`
  const codex = `${realpathSync(join(root, 'codex'))}${sep}`
  const sharedTests = `${realpathSync(root)}${sep}tests${sep}`
  const ompFiles = existsSync(join(root, 'omp'))
    ? [...sourceFiles(root, 'omp/src'), ...sourceFiles(root, 'omp/tests')]
    : []
  const files = [...sharedFiles, ...sourceFiles(root, 'codex/src'), ...sourceFiles(root, 'codex/tests'), ...ompFiles]
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(root, path)) })
    const rootDir = `${realpathSync(root)}${sep}`
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
      const absolute = join(root, path)
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
        const target = importTarget(root, project, relative, dependency)
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
