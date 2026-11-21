/**
 * The text of the code that runs from some entry files, for a hash that changes when that code changes and only then.
 * It holds the top-level statements of the entry files and of every repo file they import at run time, without the
 * import and re-export statements, sorted. So renaming a file, changing an import path, splitting a file or moving a
 * statement to another file in the set leaves the text the same.
 */

/** A top-level statement starts at a line with no indent that begins with one of these. Prettier puts every one there. */
const STATEMENT_START =
  /^(import\s|export\s|const\s|let\s|var\s|function\s|async\s+function\s|class\s|abstract\s|type\s|interface\s|enum\s|declare\s|\/\*\*|\/\/)/

const MODULE_PATH = /from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/

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
    if (STATEMENT_START.test(line) || out.length === 0) out.push(line)
    else out[out.length - 1] += `\n${line}`
  }

  return out.map(s => s.trimEnd()).filter(s => s !== '')
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
 * Throws when a relative import names no file, so a missed file cannot drop code from the hash.
 */
export function stampedCode(entries: string[], read: (path: string) => string | null): string {
  const seen = new Set<string>()
  const kept: string[] = []
  const visit = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    const source = read(path)
    if (source === null) throw new Error(`${path} is not a file`)
    for (const statement of statements(source)) {
      const link = moduleLink(statement)
      if (link === null) {
        kept.push(statement)
        continue
      }
      if (link.isTypeOnly || !link.path.startsWith('.')) continue
      const base = joinPath(folderOf(path), link.path)
      const found = CANDIDATES.map(suffix => base + suffix).find(p => read(p) !== null)
      if (found === undefined) throw new Error(`${path} imports ${link.path}, which is not a file`)
      if (!found.endsWith('.d.ts')) visit(found)
    }
  }
  for (const entry of entries) visit(entry)

  return kept.sort().join('\n')
}
