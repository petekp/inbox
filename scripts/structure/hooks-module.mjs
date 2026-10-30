import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { API, isFunction, nameOf, propertyOf, ts } from './ts.mjs'

// The plugin directory scans each commit on main with rules for the hooks module that `claude plugin validate` does
// not apply. docs/plans/directory-submission.md lists each block it reported and the fix.
const PERMISSION_HOOKS = {
  'tool.check': {
    fixedVerdicts: ['deny', 'ask'],
    fixedAnswers: "`decision: 'deny'` or `decision: 'ask'`",
    verdictElsewhere:
      ' To act on the verdict, get it from a $.tool.check query outside the hook, as waitForPermission does.',
  },
  'classic.PermissionRequest': {
    fixedVerdicts: ['deny'],
    fixedAnswers: "`decision: { behavior: 'deny' }`",
    verdictElsewhere: '',
  },
}
const PLAIN_USE =
  "The directory allows `$` only as an argument to a function declared at the top level of this file, or to `read` and `update` from 'claude-code'."

function hooksModules(root) {
  const manifest = 'hooks/hooks.json'
  if (!existsSync(join(root, manifest))) return []
  const { modules = [] } = JSON.parse(readFileSync(join(root, manifest), 'utf8'))

  return modules.map(path => join(dirname(manifest), path))
}

const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1
const unwrapped = node =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node)
    ? unwrapped(node.expression)
    : node
const isApiArgument = node => ts.isIdentifier(unwrapped(node)) && unwrapped(node).text === '$'
const parameterNames = fn => fn.parameters.map(p => (ts.isIdentifier(p.name) ? p.name.text : null))

function snippet(node) {
  const text = node.getText().replace(/\s+/g, ' ')
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

function ancestor(node, test) {
  while (node && !test(node)) node = node.parent
  return node
}

function boundNames(node) {
  const namesOf = name =>
    !name
      ? []
      : ts.isIdentifier(name)
        ? [name]
        : ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)
          ? [...name.elements].flatMap(element => (ts.isBindingElement(element) ? namesOf(element.name) : []))
          : []
  const declaresName =
    ts.isVariableDeclaration(node) ||
    ts.isParameterDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isImportClause(node) ||
    ts.isImportSpecifier(node) ||
    ts.isNamespaceImport(node) ||
    ts.isImportEqualsDeclaration(node)

  return declaresName ? namesOf(node.name) : []
}

function hookOf(node) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'on') return null
  const [event] = node.arguments

  return {
    event: event && ts.isStringLiteral(event) ? event.text : null,
    hook: node.arguments[node.arguments.length - 1],
    registration: node,
  }
}

function refusedReceiver(project, source, callee) {
  if (!ts.isIdentifier(callee))
    return `passes \`$\` to \`${snippet(callee)}\`, a method or expression rather than a function's name.`
  const name = callee.text
  const declarations = (project.checker.getSymbolAtLocation(callee)?.declarations ?? [])
    .map(declaration => declaration.resolve(project))
    .filter(Boolean)
  const [declaration] = declarations
  if (!declaration) return `passes \`$\` to \`${name}\`, and the check cannot find where \`${name}\` is declared.`
  const isInThisFile = node => realpathSync(node.getSourceFile().fileName) === realpathSync(source.fileName)
  const isTopLevelFunction = node =>
    ts.isFunctionDeclaration(node) && ts.isSourceFile(node.parent) && isInThisFile(node)
  if (declarations.every(isTopLevelFunction)) return null
  const importDeclaration = ancestor(declaration, ts.isImportDeclaration)
  if (importDeclaration) {
    const from = importDeclaration.moduleSpecifier.text
    const imported = ts.isImportSpecifier(declaration) ? (declaration.propertyName ?? declaration.name).text : null
    if (from === 'claude-code' && ['read', 'update'].includes(imported)) return null
    return `passes \`$\` to \`${name}\`, imported from '${from}'. Move \`${name}\` into this file as a top-level function declaration.`
  }
  if (ts.isFunctionDeclaration(declaration))
    return `passes \`$\` to \`${name}\`, which is declared inside another function. Move it to the top level.`
  if (ts.isVariableDeclaration(declaration))
    return `passes \`$\` to \`${name}\`, which is a variable. Declare it as \`function ${name}\` at the top level.`

  return `passes \`$\` to \`${name}\`, which is not a top-level function declaration.`
}

const isFunctionExpression = node => ts.isArrowFunction(node) || ts.isFunctionExpression(node)

/**
 * The function expression around `node` that a `return` statement returns. Whether the directory also refuses a
 * function that an arrow returns as its body, as in `(p) => (press) => runPress($, p, press.surface)`, is not known.
 */
function returnedFunctionOf(node) {
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) {
    if (!isFunctionExpression(at)) continue
    if (parameterNames(at).includes('$')) return null
    let outer = at.parent
    while (outer && unwrapped(outer) !== outer) outer = outer.parent
    if (ts.isReturnStatement(outer)) return at
  }

  return null
}

function answersOf(hook) {
  if (!ts.isBlock(hook.body)) return [{ at: hook.body, value: hook.body }]
  const found = []
  const visit = node => {
    if (isFunction(node)) return
    if (ts.isReturnStatement(node)) found.push({ at: node, value: node.expression })
    else node.forEachChild(visit)
  }
  hook.body.forEachChild(visit)

  return found
}

function isPassedOn(hook, value) {
  const [, event, next] = parameterNames(hook)
  const call = value && unwrapped(value)
  if (!event || !next || !call || !ts.isCallExpression(call)) return false
  const [argument] = call.arguments

  return (
    ts.isIdentifier(call.expression) &&
    call.expression.text === next &&
    call.arguments.length === 1 &&
    ts.isIdentifier(argument) &&
    argument.text === event
  )
}

function isFixedAnswer(event, value) {
  const answer = value && unwrapped(value)
  if (!answer || !ts.isObjectLiteralExpression(answer)) return false
  const properties = [...answer.properties]
  const at = properties.findLastIndex(p => ts.isPropertyAssignment(p) && nameOf(p.name) === 'decision')
  if (at === -1 || properties.slice(at + 1).some(p => ts.isSpreadAssignment(p))) return false
  const decision = unwrapped(properties[at].initializer)
  const verdict = event === 'tool.check' ? decision : propertyOf(decision, 'behavior')
  const text = verdict && ts.isStringLiteral(unwrapped(verdict)) ? unwrapped(verdict).text : null

  return PERMISSION_HOOKS[event].fixedVerdicts.includes(text)
}

export function checkHooksModules(root, errors) {
  const modules = hooksModules(root)
  if (!modules.length) return
  const api = new API({ cwd: root })
  try {
    for (const path of modules) {
      const absolute = join(root, path)
      const project = api.updateSnapshot({ openFiles: [absolute] }).getDefaultProjectForFile(absolute)
      const source = project?.program.getSourceFile(absolute) ?? project?.program.getSourceFile(realpathSync(absolute))
      if (!source) throw new Error(`Cannot parse ${path}.`)
      const report = (node, code, text) => errors.push(`${path}:${lineOf(source, node)} ${code}: ${text}`)
      const registrations = []
      const apiArguments = []
      const bindings = []
      const visit = node => {
        const registration = hookOf(node)
        if (registration) registrations.push(registration)
        if (ts.isCallExpression(node) || ts.isNewExpression(node))
          for (const argument of node.arguments ?? [])
            if (isApiArgument(argument)) apiArguments.push({ node, argument })
        bindings.push(...boundNames(node))
        node.forEachChild(visit)
      }
      visit(source)

      const topLevelFunctionNames = new Set(
        source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name).map(node => node.name),
      )
      const isTopLevelFunctionName = text => [...topLevelFunctionNames].some(name => name.text === text)
      for (const { node, argument } of apiArguments) {
        const callee = unwrapped(node.expression)
        const refusal = refusedReceiver(project, source, callee)
        if (refusal) report(argument, 'MOD_CAPABILITY_USE_NOT_PLAIN', `${refusal} ${PLAIN_USE}`)
        const rebinding =
          !refusal && ts.isIdentifier(callee) && isTopLevelFunctionName(callee.text)
            ? bindings.find(name => name.text === callee.text && !topLevelFunctionNames.has(name))
            : null
        if (rebinding)
          report(
            argument,
            'MOD_CAPABILITY_USE_NOT_PLAIN',
            `passes \`$\` to \`${callee.text}\`, and line ${lineOf(source, rebinding)} binds \`${callee.text}\` again. The directory reads the names in a file without scopes, so it cannot tell which \`${callee.text}\` this is. Rename that binding.`,
          )
        const returned = returnedFunctionOf(argument)
        if (returned)
          report(
            argument,
            'MOD_CAPABILITY_USE_NOT_PLAIN',
            `passes \`$\` along inside the function that line ${lineOf(source, returned)} returns. The directory refuses that, and allows a returned function only plain \`$.ns.method(...)\` calls. Write the function where it is used, or return it in an object literal.`,
          )
      }

      const hookParameters = new Set()
      const permissionNames = new Map()
      for (const { event, hook, registration } of registrations) {
        const isInline = hook && isFunctionExpression(hook)
        if (isInline) for (const p of hook.parameters) hookParameters.add(p.name.getStart())
        if (!Object.hasOwn(PERMISSION_HOOKS, event)) continue
        if (!isInline) {
          report(
            registration,
            'MOD_PERMISSION_ANSWER_UNREAD',
            `the ${event} hook is not a function written in the on() call, so the check cannot read what it returns. Write it there.`,
          )
          continue
        }
        const [, eventName, nextName] = parameterNames(hook)
        const passOn = `${nextName ?? 'next'}(${eventName ?? 'e'})`
        const { fixedAnswers, verdictElsewhere } = PERMISSION_HOOKS[event]
        const line = lineOf(source, registration)
        if (eventName && !permissionNames.has(eventName))
          permissionNames.set(eventName, `which the ${event} hook at line ${line} names its event`)
        if (nextName && !permissionNames.has(nextName))
          permissionNames.set(nextName, `which the ${event} hook at line ${line} names the rest of the chain`)
        for (const { at, value } of answersOf(hook))
          if (!isPassedOn(hook, value) && !isFixedAnswer(event, value))
            report(
              at,
              'MOD_PERMISSION_ANSWER_UNREAD',
              `the ${event} hook returns ${value ? `\`${snippet(value)}\`` : 'nothing'}. The directory accepts only \`${passOn}\` as written, or an object with ${fixedAnswers}.${verdictElsewhere}`,
            )
      }

      for (const name of bindings) {
        const role = permissionNames.get(name.text)
        if (role && !hookParameters.has(name.getStart()))
          report(
            name,
            'MOD_PERMISSION_ANSWER_UNREAD',
            `binds \`${name.text}\`, ${role}. The directory needs that name bound nowhere else in the file except as a hook's parameter. Rename this binding.`,
          )
        if (name.text === 'h' && path.endsWith('.tsx'))
          report(
            name,
            'MOD_CAPABILITY_USE_NOT_PLAIN',
            'binds `h`. The directory reads `h` in a .tsx file as the function that elements compile to. Rename this binding.',
          )
      }
    }
  } finally {
    api.close()
  }
}
