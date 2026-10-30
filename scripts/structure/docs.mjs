import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
  for (const map of [LOOK_MAP, ...lookParts(root, '')])
    for (const m of read(root, map).matchAll(/`([\w./-]+\.[a-z]+):([\w.]+)`/g)) {
      const [, path, symbol] = m
      if (!exists(root, path)) continue
      if (!new RegExp(`\\b${symbol.replaceAll('.', '\\.')}\\b`).test(read(root, path)))
        errors.push(`${map} names ${path}:${symbol}, and ${path} has no ${symbol}.`)
    }
}
