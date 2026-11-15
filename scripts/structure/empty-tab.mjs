import { readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { API, isFunction, nameOf, propertyOf, ts } from './ts.mjs'

const OWNER = 'hooks/empty-tab.ts'
const TITLES_HOME = 'hooks/banners.ts'
const LOOK_DIRS = ['hooks', 'codex/src', 'omp/src', 'herdr/src']
/** The empty texts, each with the source files besides the owner that may import it. Tests sit outside these folders. */
const OWNED_TEXTS = { EMPTY_TITLES: [], EMPTY_STATUS_TEXT: [], prsEmptyHint: [] }
const SHARED_TEXTS = { NOTHING_NEEDED_TEXT: [OWNER, 'hooks/band.ts'] }
/**
 * Each look's one empty drawer, the folder it lives in, and which call argument or JSX attribute takes the `emptyTab`
 * result. The check looks for each drawer only in its folder, since Codex and omp also name their empty session state
 * `emptyState`.
 */
const DRAWERS = [
  { name: 'emptyState', dir: 'hooks', argument: 0 },
  { name: 'EmptyState', dir: 'codex/src', attribute: 'empty' },
  { name: 'emptyEntries', dir: 'omp/src', argument: 0 },
  { name: 'emptyBlock', dir: 'herdr/src', argument: 1 },
]
const HERDR_EMPTY_HOME = 'herdr/src/blocks.ts'

function lookFiles(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return dir === 'hooks' ? [] : lookFiles(root, path)
    return /\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [path] : []
  })
}

function withSources(root, files, use) {
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(root, path)) })
    const sources = new Map(
      files.map(path => {
        const absolute = join(root, path)
        const program = snapshot.getDefaultProjectForFile(absolute)?.program
        const source = program?.getSourceFile(absolute) ?? program?.getSourceFile(realpathSync(absolute))
        if (!source) throw new Error(`Cannot parse ${path}.`)
        return [path, source]
      }),
    )
    use(sources)
  } finally {
    api.close()
  }
}

function walk(node, visit) {
  visit(node)
  node.forEachChild(child => walk(child, visit))
}

const isText = node => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)

function constText(source, name) {
  let text = null
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && nameOf(node.name) === name && node.initializer && isText(node.initializer))
      text = node.initializer.text
  })
  return text
}

/** The empty titles, as the owner holds them, with a title it takes from `banners.ts` resolved. */
function emptyTitles(sources, errors) {
  let titles = null
  walk(sources.get(OWNER), node => {
    if (!ts.isVariableDeclaration(node) || nameOf(node.name) !== 'EMPTY_TITLES') return
    let object = node.initializer
    while (object && !ts.isObjectLiteralExpression(object)) object = object.expression
    titles = object ? object.properties.map(p => p.initializer) : null
  })
  if (!titles) {
    errors.push(`${OWNER} holds no EMPTY_TITLES object, so the empty-tab check cannot read the titles.`)
    return []
  }

  return titles.flatMap(value => {
    const text = isText(value)
      ? value.text
      : ts.isIdentifier(value)
        ? (constText(sources.get(OWNER), value.text) ?? constText(sources.get(TITLES_HOME), value.text))
        : null
    if (text === null) errors.push(`${OWNER}: an EMPTY_TITLES value is neither text nor a constant the check can read.`)
    return text === null ? [] : [text]
  })
}

/** Whether `node` is an `emptyTab(...)` call, or names a constant bound to one in a function around it. */
function isEmptyTabResult(node) {
  if (ts.isCallExpression(node)) return ts.isIdentifier(node.expression) && node.expression.text === 'emptyTab'
  if (!ts.isIdentifier(node)) return false
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!isFunction(scope) && !ts.isSourceFile(scope)) continue
    let isBound = false
    walk(scope, n => {
      if (ts.isVariableDeclaration(n) && nameOf(n.name) === node.text && n.initializer)
        isBound ||= isEmptyTabResult(n.initializer)
    })
    if (isBound) return true
  }
  return false
}

const isDefinition = (node, name) =>
  (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
  (ts.isVariableDeclaration(node) && nameOf(node.name) === name && node.initializer && isFunction(node.initializer))

function checkDrawer(drawer, sources, errors) {
  const defined = []
  for (const [path, source] of sources) {
    if (!path.startsWith(`${drawer.dir}/`)) continue
    walk(source, node => {
      if (isDefinition(node, drawer.name)) defined.push(path)
      const line = () => source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      if (drawer.attribute !== undefined && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
        if (nameOf(node.tagName) !== drawer.name) return
        const given = node.attributes.properties.find(a => ts.isJsxAttribute(a) && nameOf(a.name) === drawer.attribute)
        const value = given?.initializer && ts.isJsxExpression(given.initializer) ? given.initializer.expression : null
        if (!value || !isEmptyTabResult(value))
          errors.push(`${path}:${line()}: <${drawer.name}> takes its ${drawer.attribute} from anything but emptyTab.`)
      } else if (drawer.argument !== undefined && ts.isCallExpression(node)) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== drawer.name) return
        const value = node.arguments[drawer.argument]
        if (!value || !isEmptyTabResult(value))
          errors.push(`${path}:${line()}: ${drawer.name}() draws anything but a result of emptyTab.`)
      }
    })
  }
  if (defined.length !== 1)
    errors.push(
      `${drawer.name}, the empty drawer of ${drawer.dir}, must be defined once there, and is defined in: ${defined.join(', ') || 'no file'}.`,
    )
}

/**
 * Each tab's empty state comes from `emptyTab` in `hooks/empty-tab.ts`, and each look draws it with one drawer. The
 * check fails when a look imports the empty texts, holds an empty title as literal text, defines a second drawer, or
 * gives a drawer anything but an `emptyTab` result. It cannot see a look that draws empty text as plain lines of its own.
 */
export function checkEmptyTab(root, errors) {
  withSources(
    root,
    LOOK_DIRS.flatMap(dir => lookFiles(root, dir)),
    sources => checkSources(sources, errors),
  )
}

function checkSources(sources, errors) {
  const titles = new Set(emptyTitles(sources, errors))
  const importable = { ...OWNED_TEXTS, ...SHARED_TEXTS }
  const kindEmpty = []

  for (const [path, source] of sources) {
    walk(source, node => {
      const line = () => source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      if (ts.isImportSpecifier(node)) {
        const name = (node.propertyName ?? node.name).text
        const allowed = importable[name]
        if (allowed && path !== OWNER && !allowed.includes(path))
          errors.push(`${path}:${line()}: imports ${name}. A look takes its empty text from emptyTab.`)
      }
      if (isText(node) && titles.has(node.text) && path !== OWNER && path !== TITLES_HOME)
        errors.push(`${path}:${line()}: holds the empty title "${node.text}". Take it from emptyTab.`)
      if (path.startsWith('herdr/src/') && ts.isObjectLiteralExpression(node)) {
        const kind = propertyOf(node, 'kind')
        if (kind && isText(kind) && kind.text === 'empty') kindEmpty.push(`${path}:${line()}`)
      }
    })
  }
  for (const drawer of DRAWERS) checkDrawer(drawer, sources, errors)
  const strayEmpty = kindEmpty.filter(at => !at.startsWith(`${HERDR_EMPTY_HOME}:`))
  if (kindEmpty.length !== 1 || strayEmpty.length > 0)
    errors.push(
      `A Herdr empty block is built only by emptyBlock in ${HERDR_EMPTY_HOME}, and is built at: ${kindEmpty.join(', ')}.`,
    )
}
