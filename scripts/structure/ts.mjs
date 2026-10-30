import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../../codex/package.json', import.meta.url))
export const { API } = await import(pathToFileURL(require.resolve('typescript/unstable/sync')).href)
export const ts = await import(pathToFileURL(require.resolve('typescript/unstable/ast')).href)

export const isFunction = node =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node)

export const nameOf = node => (ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null)
export const propertiesOf = node =>
  ts.isObjectLiteralExpression(node)
    ? node.properties.filter(p => ts.isPropertyAssignment(p) && nameOf(p.name) !== null)
    : []
export const propertyOf = (node, name) => propertiesOf(node).find(p => nameOf(p.name) === name)?.initializer
