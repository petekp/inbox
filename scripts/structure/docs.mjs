import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { API, nameOf, propertiesOf, ts } from './ts.mjs'

const PLAN_STATUS = /^Status: (proposed|building|built|superseded by \S+)/m

export const read = (root, path) => readFileSync(join(root, path), 'utf8')
const exists = (root, path) => existsSync(join(root, path))

function docFiles(root) {
  const files = ['README.md', 'AGENTS.md', 'GLOSSARY.md', 'ROADMAP.md', 'codex/README.md'].filter(path =>
    exists(root, path),
  )
  const walk = dir => {
    for (const entry of readdirSync(join(root, dir))) {
      const path = `${dir}/${entry}`
      if (statSync(join(root, path)).isDirectory()) walk(path)
      else if (path.endsWith('.md')) files.push(path)
    }
  }
  walk('docs')

  return files
}

function isIgnored(root, path) {
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path])
    return true
  } catch {
    return false
  }
}

export function checkDocs(root, errors) {
  const topLevel = new Set(readdirSync(root).filter(entry => entry !== 'node_modules'))
  for (const doc of docFiles(root)) {
    const text = read(root, doc)
    if (doc.startsWith('docs/plans/') && !PLAN_STATUS.test(text))
      errors.push(`${doc} has no status line: "Status: proposed", "building", "built" or "superseded by <plan>".`)
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0]
      if (!target || /^[a-z]+:/.test(target)) continue
      if (!existsSync(join(root, dirname(doc), target))) errors.push(`${doc} links to ${target}, which does not exist.`)
    }
    const isUnbuilt = /^Status: (proposed|building)/m.test(text)
    if (doc.startsWith('docs/reference/') || (doc.startsWith('docs/plans/') && isUnbuilt)) continue
    for (const m of text.matchAll(/`([\w.-]+\/[\w./-]+\.[a-z]+)(?::[\w.]+)?`/g)) {
      const path = m[1]
      if (!topLevel.has(path.split('/')[0])) continue
      if (!exists(root, path) && !existsSync(join(root, dirname(doc), path)) && !isIgnored(root, path))
        errors.push(`${doc} names ${path}, which does not exist.`)
    }
  }
}

// Type shims declare a module's shape and hold no code, so they need no row.
const isMapped = path => /\.(?:ts|tsx|html)$/.test(path) && !path.endsWith('.d.ts')

const LOOK_MAP = 'docs/looks.md'
const LOOK_PARTS = 'docs/looks'

export function lookParts(root, prefix) {
  if (!exists(root, LOOK_PARTS)) return []
  return readdirSync(join(root, LOOK_PARTS))
    .filter(name => name.startsWith(prefix) && name.endsWith('.md'))
    .sort()
    .map(name => `${LOOK_PARTS}/${name}`)
}

export function checkLookMap(root, errors) {
  const fileParts = lookParts(root, 'files-')
  if (!fileParts.length) errors.push(`${LOOK_PARTS}/ has no files-*.md part to hold the Files rows.`)
  else {
    const rows = new Set(fileParts.flatMap(part => [...read(root, part).matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1])))
    for (const dir of ['hooks', 'codex/src', 'omp/src'].filter(dir => exists(root, dir)))
      for (const entry of readdirSync(join(root, dir))) {
        const path = `${dir}/${entry}`
        if (isMapped(path) && !rows.has(path)) errors.push(`${LOOK_PARTS}/files-*.md has no Files row for ${path}.`)
      }
  }
  const refs = [LOOK_MAP, ...lookParts(root, '')]
    .flatMap(map =>
      [...read(root, map).matchAll(/`([\w./-]+\.[cm]?[jt]sx?):([\w.]+)`/g)].map(([, path, symbol]) => ({
        map,
        path,
        symbol,
      })),
    )
    .filter(ref => exists(root, ref.path))
  const paths = [...new Set(refs.map(ref => ref.path))]
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({ openFiles: paths.map(path => join(root, path)) })
    const names = new Map(
      paths.map(path => {
        const absolute = join(root, path)
        const program = snapshot.getDefaultProjectForFile(absolute)?.program
        const source = program?.getSourceFile(absolute) ?? program?.getSourceFile(realpathSync(absolute))
        if (!source) throw new Error(`Cannot parse ${path}.`)
        return [path, namesIn(source)]
      }),
    )
    for (const { map, path, symbol } of refs) {
      const { declared, importedFrom } = names.get(path)
      if (declared.has(symbol)) continue
      const name = symbol.split('.')[0]
      errors.push(
        importedFrom.has(name)
          ? `${map} names ${path}:${symbol}, but ${path} imports ${name} from '${importedFrom.get(name)}'. Name the file that declares it.`
          : `${map} names ${path}:${symbol}, and ${path} declares no ${symbol}.`,
      )
    }
  } finally {
    api.close()
  }
}

const DECLARATIONS = new Set(
  [
    'FunctionDeclaration',
    'VariableDeclaration',
    'ClassDeclaration',
    'InterfaceDeclaration',
    'TypeAliasDeclaration',
    'EnumDeclaration',
    'ModuleDeclaration',
  ].map(kind => ts.SyntaxKind[kind]),
)

function namesIn(source) {
  const declared = new Set()
  const importedFrom = new Map()
  const visit = node => {
    const name = node.name ? nameOf(node.name) : null
    if (DECLARATIONS.has(node.kind) && name !== null) {
      declared.add(name)
      if (ts.isVariableDeclaration(node) && node.initializer)
        for (const property of propertiesOf(node.initializer)) declared.add(`${name}.${nameOf(property.name)}`)
    }
    if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || (ts.isImportClause(node) && node.name)) {
      let declaration = node.parent
      while (!ts.isImportDeclaration(declaration)) declaration = declaration.parent
      importedFrom.set(node.name.text, declaration.moduleSpecifier.text)
    }
    node.forEachChild(visit)
  }
  visit(source)

  return { declared, importedFrom }
}
