import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { API, isFunction, ts } from './ts.mjs'

const isTypeOnlyClause = clause =>
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

function importsOf(source) {
  const found = []
  const add = (node, dynamicFunction = null, isTypeOnly = false) => {
    if (node)
      found.push({
        from: ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null,
        node,
        dynamicFunction,
        isTypeOnly,
      })
  }
  const visit = (node, functionName = null) => {
    const enclosingFunction = isFunction(node)
      ? ts.isFunctionDeclaration(node) && node.parent === source && node.name?.text === 'load'
        ? 'topLevelLoad'
        : null
      : functionName
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, null, Boolean(node.importClause && isTypeOnlyClause(node.importClause)))
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, null, isTypeOnlyExport(node))
    } else if (ts.isImportTypeNode(node)) {
      add(node.argument.literal, null, true)
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

/** Every file under `dir`, in any folder depth, as a path from `root`. */
export function filesUnder(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? filesUnder(root, path) : [path]
  })
}

const sourceFiles = (root, dir) => filesUnder(root, dir).filter(path => /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(path))

export function localTarget(path) {
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

export function importTarget(root, project, path, dependency) {
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

/** The modules the Herdr app supplies to a mod. */
const HERDR_APP_MODULES = ['gpui-kit', 'gpui-base', 'herdr']
/** The Herdr app's modules that only draw. Painting does not fit one file under the size limit. */
const HERDR_DRAWING_MODULES = ['gpui-kit', 'gpui-base']
const isHerdrPaintFile = path => path === 'herdr/src/main.ts' || /^herdr\/src\/paint-[^/]+\.ts$/.test(path)

/**
 * The layers of the code every host shares, lowest first. A file loads code only from its own layer and the layers
 * before it. A type-only import may name a type in any layer, since it loads nothing.
 */
const CORE_LAYERS = ['core/domain', 'core/view', 'core/runtime', 'core/remote']
const LAYER_ORDER = CORE_LAYERS.map(dir => dir.slice('core/'.length)).join(', ')
const layerOf = path => CORE_LAYERS.findIndex(dir => path.startsWith(`${dir}/`))

export function checkImports(root, errors) {
  const rootDir = `${realpathSync(root)}${sep}`
  const coreFiles = existsSync(join(root, 'core')) ? sourceFiles(root, 'core') : []
  for (const path of coreFiles)
    if (layerOf(path) === -1)
      errors.push(`${path} is in no layer. Put it in the folder of its layer: ${CORE_LAYERS.join(', ')}.`)
  const modFiles = sourceFiles(root, 'hooks')
  const core = `${rootDir}core${sep}`
  const hooks = `${rootDir}hooks${sep}`
  const types = `${realpathSync(join(root, 'types'))}${sep}`
  const codex = `${realpathSync(join(root, 'codex'))}${sep}`
  const omp = `${rootDir}omp${sep}`
  const herdr = `${rootDir}herdr${sep}`
  const sharedTests = `${rootDir}tests${sep}`
  const ompFiles = existsSync(join(root, 'omp'))
    ? [...sourceFiles(root, 'omp/src'), ...sourceFiles(root, 'omp/tests')]
    : []
  const herdrFiles = existsSync(join(root, 'herdr'))
    ? [...sourceFiles(root, 'herdr/src'), ...sourceFiles(root, 'herdr/tests')]
    : []
  const files = [
    ...coreFiles,
    ...modFiles,
    ...sourceFiles(root, 'codex/src'),
    ...sourceFiles(root, 'codex/tests'),
    ...ompFiles,
    ...herdrFiles,
  ]
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(root, path)) })
    const sourceByPath = new Map()
    const sourceFor = (project, path) => {
      const canonical = realpathSync(path)
      if (sourceByPath.has(canonical)) return sourceByPath.get(canonical)
      const source = project?.program.getSourceFile(path) ?? project?.program.getSourceFile(canonical)
      if (source) sourceByPath.set(canonical, source)
      return source
    }
    const modeOf = path =>
      coreFiles.includes(path)
        ? 'core'
        : modFiles.includes(path)
          ? 'mod'
          : ompFiles.includes(path)
            ? 'omp'
            : herdrFiles.includes(path)
              ? 'herdr'
              : 'codex'
    const queue = files.map(path => ({ path, mode: modeOf(path), layer: layerOf(path) }))
    const visited = new Set()
    while (queue.length) {
      const { path, mode, layer } = queue.shift()
      const absolute = join(root, path)
      const project = snapshot.getDefaultProjectForFile(absolute)
      const source = sourceFor(project, absolute)
      if (!source) throw new Error(`Cannot parse ${path}.`)
      const canonical = realpathSync(source.fileName)
      const relative = canonical.startsWith(rootDir) ? canonical.slice(rootDir.length) : path
      const visitKey = `${mode}:${layer}:${canonical}`
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
        const targetPath = target?.startsWith(rootDir) ? target.slice(rootDir.length) : null
        if (mode === 'core') {
          if (!target?.startsWith(core) && !target?.startsWith(types))
            errors.push(`${relative} imports '${from}'. Code in core/ imports only core/ and types/.`)
          const toLayer = targetPath ? layerOf(targetPath) : -1
          const loadedFor = layerOf(relative) === -1 ? `, which ${CORE_LAYERS[layer]} loads,` : ''
          if (!dependency.isTypeOnly && layer !== -1 && toLayer > layer)
            errors.push(
              `${relative}${loadedFor} loads '${from}' from ${CORE_LAYERS[toLayer]}. A core file loads code only from its own layer and the layers before it: ${LAYER_ORDER}.`,
            )
        } else if (mode === 'mod') {
          if (target?.startsWith(codex) || target?.startsWith(omp) || target?.startsWith(herdr))
            errors.push(
              `${relative} imports '${from}'. The mod imports only core/, hooks/ and types/ of the inbox's code.`,
            )
        } else if (mode === 'omp') {
          if (target?.startsWith(hooks))
            errors.push(`${relative} imports '${from}', which is the mod's own code. omp can only use core/.`)
          if (target?.startsWith(codex)) errors.push(`${relative} imports '${from}'. omp does not import from codex/.`)
          if (target?.startsWith(sharedTests) && !relative.startsWith('omp/tests/'))
            errors.push(`${relative} imports '${from}'. Only omp's tests import the shared session test.`)
          if (from.startsWith('@oh-my-pi/') && relative !== 'omp/src/host.ts')
            errors.push(`${relative} imports '${from}'. Only omp/src/host.ts imports omp's packages.`)
        } else if (mode === 'herdr') {
          if (target?.startsWith(hooks))
            errors.push(
              `${relative} imports '${from}', which is the mod's own code. The Herdr look can only use core/.`,
            )
          if (target?.startsWith(codex) || target?.startsWith(omp))
            errors.push(`${relative} imports '${from}'. The Herdr look does not import from codex/ or omp/.`)
          if (from === 'herdr' && relative !== 'herdr/src/main.ts')
            errors.push(
              `${relative} imports 'herdr'. Only herdr/src/main.ts imports the Herdr app's state and effects.`,
            )
          if (HERDR_DRAWING_MODULES.includes(from) && !isHerdrPaintFile(relative))
            errors.push(
              `${relative} imports '${from}'. Only herdr/src/main.ts and herdr/src/paint-*.ts draw with the Herdr app's modules.`,
            )
        } else if (target?.startsWith(hooks)) {
          errors.push(`${relative} imports '${from}', which is the mod's own code. Codex can only bundle core/.`)
        }

        const isHerdrAppModule = mode === 'herdr' && HERDR_APP_MODULES.includes(from)
        const isOwnFile =
          mode === 'mod' ? target?.startsWith(hooks) || target?.startsWith(core) : target?.startsWith(core)
        if (!targetPath || target.split(sep).includes('node_modules') || isHerdrAppModule || isOwnFile) continue
        const targetSource = sourceFor(project, target)
        if (!targetSource) continue
        const loadsCode = mode === 'core' && !dependency.isTypeOnly
        queue.push({
          path: realpathSync(targetSource.fileName).slice(rootDir.length),
          mode,
          layer: loadsCode ? layer : -1,
        })
      }
    }
  } finally {
    api.close()
  }
}
