/**
 * The text of the code that runs from some entry files, for a hash that changes when that code changes and only then.
 * It holds the top-level statements of the entry files and of every repo file they import at run time, without
 * comments, import and re-export statements or `export` keywords, sorted. So renaming a file, changing an import path,
 * splitting a file, moving a statement to another file in the set or editing a comment leaves the text the same.
 */

/** Prettier starts every top-level statement at column 0, and only a closing bracket continues one there. */
const CONTINUES = /^(\s|\}|\)|\]|$)/

const MODULE_PATH = /from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/

const DYNAMIC_LOAD = /\bimport\(|\brequire\(/

/** Statements of a module that only wire it to others. A type-only one changes no behavior. */
function moduleLink(statement: string): { path: string; isTypeOnly: boolean } | null {
  const isImport = /^import\s/.test(statement)
  const isReexport = /^export\s+(type\s+)?(\*|\{)/.test(statement) && MODULE_PATH.test(statement)
  if (!isImport && !isReexport) return null
  const match = MODULE_PATH.exec(statement)
  if (!match) return null

  return { path: match[1] ?? match[2] ?? '', isTypeOnly: /^(import|export)\s+type\s/.test(statement) }
}

function statements(source: string): string[] {
  const out: string[] = []
  for (const line of source.split('\n')) {
    const last = out[out.length - 1]
    const lastIsWholeLink = last !== undefined && moduleLink(last) !== null
    if (last === undefined || lastIsWholeLink || !CONTINUES.test(line)) out.push(line)
    else out[out.length - 1] = `${last}\n${line}`
  }

  return out.map(s => s.trimEnd()).filter(s => s !== '')
}

const isComment = (statement: string): boolean => /^(\/\*|\/\/)/.test(statement)

const isLocalExportList = (statement: string): boolean => /^export\s+(type\s+)?\{[^}]*\}\s*;?$/.test(statement)

/** A statement as it runs, so adding `export` to move it to another file leaves it the same. */
const behavior = (statement: string): string => statement.replace(/^export\s+(default\s+)?/, '')

const DECLARED_NAME = /^(?:const|let|var|async\s+function|function|class|abstract\s+class|type|interface|enum)\s+(\w+)/

/**
 * One file's own top-level statements, as `stampedCode` keeps them, without following its imports. `names`, when
 * given, keeps only the statements that declare one of them.
 */
export function ownCode(path: string, source: string, names?: string[]): string {
  return ownStatements(path, source, names).sort().join('\n')
}

function ownStatements(path: string, source: string, names?: string[]): string[] {
  if (DYNAMIC_LOAD.test(source)) throw new Error(`${path} loads a module at run time, which the stamp cannot follow`)

  return statements(source)
    .filter(s => !isComment(s) && moduleLink(s) === null && !isLocalExportList(s))
    .map(behavior)
    .filter(s => names === undefined || names.includes(DECLARED_NAME.exec(s)?.[1] ?? ''))
}

function folderOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

function joinPath(folder: string, relative: string): string {
  const parts: string[] = folder === '' ? [] : folder.split('/')
  for (const part of relative.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }

  return parts.join('/')
}

const CANDIDATES = ['.ts', '.tsx', '', '/index.ts', '/index.tsx', '.d.ts', '/index.d.ts']

/**
 * `entries` and `read`'s paths are from the repo's root. `read` gives a file's text, or null when there is none.
 * Throws when a relative import names no file, or a file loads a module at run time, so a missed file cannot drop code
 * from the hash.
 */
export function stampedCode(entries: string[], read: (path: string) => string | null): string {
  const seen = new Set<string>()
  const kept: string[] = []
  const visit = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    const source = read(path)
    if (source === null) throw new Error(`${path} is not a file`)
    kept.push(...ownStatements(path, source))
    for (const statement of statements(source)) {
      const link = moduleLink(statement)
      if (link === null || link.isTypeOnly || !link.path.startsWith('.')) continue
      const base = joinPath(folderOf(path), link.path)
      const found = CANDIDATES.map(suffix => base + suffix).find(p => read(p) !== null)
      if (found === undefined) throw new Error(`${path} imports ${link.path}, which is not a file`)
      if (!found.endsWith('.d.ts')) visit(found)
    }
  }
  for (const entry of entries) visit(entry)

  return kept.sort().join('\n')
}
