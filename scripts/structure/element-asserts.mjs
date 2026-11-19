import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { API, isFunction, nameOf, ts } from './ts.mjs'

const TEST_DIRS = ['codex/tests', 'herdr/tests']
const ASSERT_MODULES = new Set(['node:assert', 'node:assert/strict', 'assert', 'assert/strict'])
const COMPARES = new Set([
  'ok',
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
  'notEqual',
  'notStrictEqual',
  'notDeepEqual',
  'notDeepStrictEqual',
  'partialDeepStrictEqual',
])
const NODE_CALLS = new Set([
  'querySelector',
  'querySelectorAll',
  'closest',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'getElementsByName',
  'elementFromPoint',
  'elementsFromPoint',
  'createElement',
  'cloneNode',
  'getRootNode',
])
const NODE_PROPERTIES = new Set([
  'document',
  'body',
  'head',
  'documentElement',
  'activeElement',
  'parentElement',
  'parentNode',
  'offsetParent',
  'ownerDocument',
  'children',
  'childNodes',
  'firstChild',
  'firstElementChild',
  'lastChild',
  'lastElementChild',
  'nextSibling',
  'nextElementSibling',
  'previousSibling',
  'previousElementSibling',
  'shadowRoot',
  'target',
  'currentTarget',
  'relatedTarget',
])
const NODE_GLOBALS = new Set(['document', 'window'])
const KEEP_ITEMS = new Set(['find', 'findLast', 'at', 'filter', 'slice', 'reverse', 'toReversed', 'sort', 'toSorted'])
const ITEM_CALLBACKS = new Set(['forEach', 'map', 'flatMap', 'filter', 'find', 'findLast', 'some', 'every'])
const WHY =
  'A failing compare prints its values, and printing a DOM node walks the whole window graph, which grows the test run by many GB in seconds. Assert on a primitive, such as `el === null`, an id, a class or textContent.'

/** No node:assert compare in a test takes a DOM node, which a failure would print. */
export function checkElementAsserts(root, errors) {
  const files = TEST_DIRS.filter(dir => existsSync(join(root, dir))).flatMap(dir =>
    readdirSync(join(root, dir))
      .filter(name => /\.tsx?$/.test(name) && !name.endsWith('.d.ts'))
      .map(name => `${dir}/${name}`),
  )
  const asserting = files.filter(path => /from ['"](node:)?assert/.test(readFileSync(join(root, path), 'utf8')))
  if (!asserting.length) return
  withSources(root, files, sources => {
    for (const path of asserting) {
      const source = sources.get(path)
      for (const { node, argument } of elementCompares(source, sources, path))
        errors.push(`${path}:${lineOf(source, node)} compares ${argument} with node:assert. ${WHY}`)
    }
  })
}

function elementCompares(source, sources, path) {
  const names = assertNames(source)
  const found = []
  walk(source, node => {
    if (!ts.isCallExpression(node) || !isCompare(node.expression, names)) return
    const values = node.arguments.slice(0, isOkCall(node.expression, names) ? 1 : 2).flatMap(compared)
    const value = values.find(part => isNode(part, { source, sources, path, seen: new Set() }))
    if (value) found.push({ node, argument: value.getText(source) })
  })
  return found
}

function assertNames(source) {
  const names = { modules: new Set(), compares: new Map() }
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ASSERT_MODULES.has(statement.moduleSpecifier.text)) continue
    const clause = statement.importClause
    if (clause?.name) names.modules.add(clause.name.text)
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) names.modules.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text
        if (imported === 'strict') names.modules.add(element.name.text)
        else if (COMPARES.has(imported)) names.compares.set(element.name.text, imported)
      }
  }
  return names
}

function isCompare(callee, names) {
  if (ts.isIdentifier(callee)) return names.modules.has(callee.text) || names.compares.has(callee.text)
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    names.modules.has(callee.expression.text) &&
    COMPARES.has(callee.name.text)
  )
}

function isOkCall(callee, names) {
  if (ts.isIdentifier(callee)) return names.modules.has(callee.text) || names.compares.get(callee.text) === 'ok'
  return callee.name.text === 'ok'
}

/** The values an assert argument holds: the argument itself, and the items of an array or object literal in it. */
function compared(node) {
  node = unwrap(node)
  if (ts.isArrayLiteralExpression(node))
    return [node, ...node.elements.flatMap(e => compared(ts.isSpreadElement(e) ? e.expression : e))]
  if (ts.isObjectLiteralExpression(node))
    return [
      node,
      ...node.properties.flatMap(p =>
        ts.isPropertyAssignment(p) ? compared(p.initializer) : ts.isShorthandPropertyAssignment(p) ? [p.name] : [],
      ),
    ]
  return [node]
}

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAwaitExpression(node)
  )
    node = node.expression
  return node
}

/** Whether an expression can hold a DOM node or a list of them, read from its syntax alone. */
function isNode(node, at) {
  node = unwrap(node)
  if (ts.isIdentifier(node)) return NODE_GLOBALS.has(node.text) || boundToNode(node, at)
  if (ts.isPropertyAccessExpression(node)) return NODE_PROPERTIES.has(node.name.text)
  if (ts.isElementAccessExpression(node)) return isNode(node.expression, at)
  if (ts.isArrayLiteralExpression(node))
    return node.elements.some(e => ts.isSpreadElement(e) && isNode(e.expression, at))
  if (ts.isConditionalExpression(node)) return isNode(node.whenTrue, at) || isNode(node.whenFalse, at)
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken)
      return isNode(node.left, at) || isNode(node.right, at)
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return isNode(node.right, at)
    return false
  }
  if (!ts.isCallExpression(node)) return false
  const callee = unwrap(node.expression)
  if (ts.isPropertyAccessExpression(callee)) {
    const method = callee.name.text
    if (NODE_CALLS.has(method)) return true
    if (KEEP_ITEMS.has(method)) return isNode(callee.expression, at)
    if (method === 'from' && ts.isIdentifier(callee.expression) && callee.expression.text === 'Array')
      return node.arguments.length > 0 && isNode(node.arguments[0], at)
    if (method === 'map' && node.arguments[0] && isFunction(node.arguments[0]))
      return returnsNode(node.arguments[0], at)
    const helper = functionNamed(at.source, method)
    return helper ? returnsNode(helper, at) : false
  }
  if (ts.isIdentifier(callee)) {
    const helper = helperOf(callee, at)
    return helper ? returnsNode(helper.fn, { ...at, ...helper.at }) : false
  }
  return isFunction(callee) && returnsNode(callee, at)
}

function returnsNode(fn, at) {
  if (at.seen.has(fn)) return false
  at.seen.add(fn)
  if (fn.body && !ts.isBlock(fn.body)) return isNode(fn.body, at)
  let found = false
  walk(fn.body, node => {
    if (found || (node !== fn.body && isFunction(node))) return false
    if (ts.isReturnStatement(node) && node.expression && isNode(node.expression, at)) found = true
  })
  return found
}

/** Whether a name is declared or assigned, in a scope around its use, from an expression that can hold a node. */
function boundToNode(name, at) {
  for (const value of valuesOf(name, at.source)) if (isNode(value, at)) return true
  return false
}

function valuesOf(name, source) {
  const values = []
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && nameOf(node.name) === name.text && inScope(node, name)) {
      if (node.initializer) values.push(node.initializer)
      else if (ts.isForOfStatement(node.parent.parent)) values.push(node.parent.parent.expression)
    }
    if (ts.isParameterDeclaration(node) && nameOf(node.name) === name.text && inScope(node, name)) {
      const list = itemListOf(node.parent)
      if (list) values.push(list)
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === name.text &&
      inScope(node, name)
    )
      values.push(node.right)
  })
  return values
}

/** The list a callback walks, as in `list.forEach(item => ...)`, so its first parameter is one of the list's items. */
function itemListOf(fn) {
  const call = fn.parent
  if (!call || !ts.isCallExpression(call) || call.arguments[0] !== fn || fn.parameters[0]?.name === undefined)
    return null
  const callee = unwrap(call.expression)
  return ts.isPropertyAccessExpression(callee) && ITEM_CALLBACKS.has(callee.name.text) ? callee.expression : null
}

function inScope(binding, use) {
  const scope = scopeOf(binding)
  for (let n = use; n; n = n.parent) if (n === scope) return true
  return false
}

function scopeOf(node) {
  for (let n = node.parent; n; n = n.parent) if (isFunction(n) || ts.isSourceFile(n)) return n
  return node.getSourceFile()
}

/** The function a call names: one declared in scope, or one imported from a sibling test file. */
function helperOf(callee, at) {
  const local = functionNamed(at.source, callee.text, callee)
  if (local) return { fn: local, at: {} }
  for (const statement of at.source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    const imported = bindings.elements.find(e => e.name.text === callee.text)
    if (!imported) continue
    const target = siblingPath(at.path, statement.moduleSpecifier.text)
    const source = target && at.sources.get(target)
    const fn = source && functionNamed(source, (imported.propertyName ?? imported.name).text)
    if (fn) return { fn, at: { source, path: target } }
  }
  return null
}

function functionNamed(source, name, use) {
  let found = null
  walk(source, node => {
    if (found) return
    const isNamed =
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableDeclaration(node) && nameOf(node.name) === name && node.initializer && isFunction(node.initializer))
    if (isNamed && (!use || inScope(node, use))) found = ts.isFunctionDeclaration(node) ? node : node.initializer
  })
  return found
}

function siblingPath(path, specifier) {
  if (!specifier.startsWith('./')) return null
  return `${path.slice(0, path.lastIndexOf('/'))}/${specifier.slice(2).replace(/\.tsx?$/, '')}.ts`
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

/** Visits a node and its descendants, skipping the descendants of a node whose visit returns false. */
function walk(node, visit) {
  if (visit(node) === false) return
  node.forEachChild(child => walk(child, visit))
}

function lineOf(source, node) {
  return source.text.slice(0, node.getStart(source)).split('\n').length
}
