import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { API, nameOf, ts } from './ts.mjs'

const CODEX_SRC = 'codex/src'
const CODEX_CSS = 'codex/src/tab-css'
/** The types whose members are the tone words that classes carry. */
const TONE_TYPES = [
  { name: 'ToneName', file: 'core/view/tones.ts' },
  { name: 'StatusTone', file: 'core/view/help.ts' },
]

function walk(node, visit) {
  visit(node)
  node.forEachChild(child => walk(child, visit))
}

const isText = node => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
const isEmpty = node =>
  node.kind === ts.SyntaxKind.NullKeyword ||
  node.kind === ts.SyntaxKind.FalseKeyword ||
  (ts.isIdentifier(node) && node.text === 'undefined')

/** The initializer of a `const` the file declares at this name, or null. */
function constInitializer(source, name) {
  let found = null
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && node.initializer && nameOf(node.name) === name) found = node.initializer
  })
  return found
}

/** Whether a function takes this name as its own `class` prop, as in `{ class: className }`. Each caller's value is checked where the caller writes it. */
function isClassProp(source, name) {
  let found = false
  walk(source, node => {
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.propertyName &&
      ['class', 'className'].includes(nameOf(node.propertyName))
    )
      found = true
  })
  return found
}

const unwrapped = node =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
    ? unwrapped(node.expression)
    : node
const isLiteralMap = node =>
  ts.isObjectLiteralExpression(node) && node.properties.every(p => ts.isPropertyAssignment(p) && isText(p.initializer))

/**
 * What in a class expression names a class the file does not spell out. A class comes from a string, from a condition
 * between strings, from a lookup in an object of strings, or from a template whose variable part follows a prefix ending
 * in `-`, such as `tint-${tone}`. Any other variable part could produce a word that a rule elsewhere already styles.
 */
function openParts(source, expr, seen = new Set()) {
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return openParts(source, expr.expression, seen)
  if (isText(expr) || isEmpty(expr)) return []
  if (ts.isConditionalExpression(expr))
    return [...openParts(source, expr.whenTrue, seen), ...openParts(source, expr.whenFalse, seen)]
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return openParts(source, expr.right, seen)
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken)
      return [...openParts(source, expr.left, seen), ...openParts(source, expr.right, seen)]
  }
  if (ts.isTemplateExpression(expr)) {
    const open = []
    let before = expr.head.text
    for (const span of expr.templateSpans) {
      const inner = openParts(source, span.expression, seen)
      if (inner.length > 0 && !before.endsWith('-')) open.push(...inner)
      before = span.literal.text
    }
    return open
  }
  if (ts.isArrayLiteralExpression(expr)) return expr.elements.flatMap(e => openParts(source, e, seen))
  if (ts.isElementAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const map = constInitializer(source, expr.expression.text)
    if (map && isLiteralMap(unwrapped(map))) return []
  }
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression
    const isListStep = ts.isPropertyAccessExpression(callee) && ['filter', 'join'].includes(callee.name.text)
    if (isListStep) return openParts(source, callee.expression, seen)
    return []
  }
  if (ts.isIdentifier(expr) && isClassProp(source, expr.text)) return []
  if (ts.isIdentifier(expr) && !seen.has(expr.text)) {
    const initializer = constInitializer(source, expr.text)
    if (initializer) return openParts(source, initializer, new Set([...seen, expr.text]))
  }

  return [expr]
}

const isClassAttribute = node =>
  ts.isJsxAttribute(node) && ['class', 'className'].includes(nameOf(node.name)) && node.initializer
const isSpaceJoin = node =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === 'join' &&
  node.arguments.length === 1 &&
  isText(node.arguments[0]) &&
  node.arguments[0].text === ' '

/** The class expressions in a file: each `class` attribute's value, and each space-joined list that is built from an array literal. */
function classExpressions(source) {
  const found = []
  walk(source, node => {
    if (isClassAttribute(node)) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (value) found.push(value)
    } else if (isSpaceJoin(node)) {
      let list = node.expression.expression
      while (
        ts.isCallExpression(list) &&
        ts.isPropertyAccessExpression(list.expression) &&
        list.expression.name.text === 'filter'
      )
        list = list.expression.expression
      if (ts.isIdentifier(list)) list = constInitializer(source, list.text) ?? list
      if (ts.isArrayLiteralExpression(list)) found.push(list)
    }
  })
  return found
}

function codexFiles(root) {
  return readdirSync(join(root, CODEX_SRC))
    .filter(name => /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name))
    .map(name => `${CODEX_SRC}/${name}`)
}

function parsedSources(root, files, use) {
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(path => join(root, path)) })
    use(
      files.map(path => {
        const absolute = join(root, path)
        const program = snapshot.getDefaultProjectForFile(absolute)?.program
        const source = program?.getSourceFile(absolute) ?? program?.getSourceFile(realpathSync(absolute))
        if (!source) throw new Error(`Cannot parse ${path}.`)
        return { path, source }
      }),
    )
  } finally {
    api.close()
  }
}

function lineOf(source, node) {
  return source.text.slice(0, node.getStart(source)).split('\n').length
}

/** The words a union type lists, such as 'a' | 'b'. */
function unionWords(source, typeName) {
  const words = []
  walk(source, node => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== typeName) return
    walk(node.type, member => {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) words.push(member.literal.text)
    })
  })
  return words
}

/** The bare class names the CSS selects: a compound selector that is one class and nothing else but pseudo-classes. */
function bareSelectors(css) {
  const bare = new Set()
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, prelude] of text.matchAll(/([^{}]+)\{/g)) {
    if (prelude.trim().startsWith('@')) continue
    for (const selector of prelude.split(',')) {
      for (const compound of selector.trim().split(/\s*[\s>+~]\s*/)) {
        const match = /^\.([\w-]+)(?::{1,2}[\w-]+(?:\([^)]*\))?)*$/.exec(compound)
        if (match) bare.add(match[1])
      }
    }
  }
  return bare
}

/**
 * Codex builds some class names from variables. A name built that way can equal a word another rule already styles: a
 * tone `key` once matched the global `.key` rule of the action buttons and drew each new row's title as a button. This
 * check fails on a class built from a variable with no prefix ending in `-`, and on a CSS rule that selects a tone word
 * with no other class beside it.
 */
export function checkClassNames(root, errors) {
  if (!existsSync(join(root, CODEX_CSS))) return
  parsedSources(root, [...codexFiles(root), ...TONE_TYPES.map(t => t.file)], parsed => {
    for (const { path, source } of parsed.filter(p => p.path.startsWith(`${CODEX_SRC}/`)))
      for (const expr of classExpressions(source))
        for (const part of new Set(openParts(source, expr)))
          errors.push(
            `${path}:${lineOf(source, part)} builds a class from \`${part.getText(source)}\`, which another rule may already style. Put a prefix ending in "-" before it, as in \`tint-\${tone}\`, or look it up in an object of strings.`,
          )

    const tones = new Set(
      TONE_TYPES.flatMap(({ name, file }) => {
        const words = unionWords(parsed.find(p => p.path === file).source, name)
        if (words.length === 0)
          errors.push(`${file} no longer lists the tone words of ${name}, which class-names.mjs reads.`)
        return words
      }),
    )
    for (const name of readdirSync(join(root, CODEX_CSS)).filter(n => n.endsWith('.css')))
      for (const word of bareSelectors(readFileSync(join(root, CODEX_CSS, name), 'utf8')))
        if (tones.has(word))
          errors.push(
            `${CODEX_CSS}/${name} selects \`.${word}\` alone, but ${word} is a tone word that a class can carry. Select it with its own class, as in \`.mark.${word}\`.`,
          )
  })
}
