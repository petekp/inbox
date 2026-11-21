import type { Session } from '../../types'

/**
 * What must still hold when a host applies a press, or it sends nothing: the row as the look drew it, the head commit
 * of the PR the look drew, the files of a work tree, or a time the press must run before.
 */
export type Precondition =
  | { kind: 'row-version'; row: string; version: string }
  | { kind: 'pr-head-sha'; ref: string; sha: string }
  | { kind: 'git-tree-hash'; cwd: string; hash: string }
  | { kind: 'expires-at'; at: number }

/** How long a press written for a host to apply later stays good: a Herdr look's press file or a companion's command. */
export const PRESS_LIFETIME_MS = 24 * 60 * 60_000

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** JSON with each object's keys sorted and undefined fields left out, so two copies of a row read alike. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(v => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  if (!isRecord(value)) return JSON.stringify(value) ?? 'null'
  const fields = Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)

  return `{${fields.join(',')}}`
}

/** cyrb53, a fast 53-bit string hash, as hex. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * A short hash of row `id` as the person sees it: its open item without the Codex dialog it copies, its finding, and
 * its newest closed record and closed finding. Its last press is left out, so a second press on the row acts. The
 * goal's row hashes only the goal's text, the removed goal and the suggested goal, since the Status call rewrites the
 * goal's other fields routinely.
 */
export function rowVersion(s: Pick<Session, 'ledger'>, id: string): string {
  const l = s.ledger
  if (id === 'goal') {
    const o = l.overview

    return hash(canonical([o?.goal?.text ?? null, o?.goalRemoved?.goal.text ?? null, o?.suggestedGoal ?? null]))
  }
  const item = l.items.find(row => row.id === id)

  return hash(
    canonical([
      item ? { ...item, dialog: undefined } : null,
      l.findings.find(row => row.id === id) ?? null,
      l.closed.findLast(row => row.id === id) ?? null,
      l.closedFindings.findLast(row => row.id === id) ?? null,
    ]),
  )
}

/**
 * Why a press must not run, as its row reads it, from the first of `when` that no longer holds on the saved session
 * `s` at `now`, or null when all hold. A PR head check passes while the saved view has no head. A work tree check
 * refuses unless `treeHash` reads the tree.
 */
export function refusal(
  s: Pick<Session, 'ledger' | 'prViews'>,
  when: readonly Precondition[] | undefined,
  now: number,
  treeHash?: (cwd: string) => string | null,
): string | null {
  for (const c of when ?? []) {
    if (c.kind === 'row-version' && rowVersion(s, c.row) !== c.version)
      return 'This changed before your press. Nothing was sent.'
    if (c.kind === 'pr-head-sha') {
      const pr = s.prViews.views[c.ref]
      if (pr?.headSha !== undefined && pr.headSha !== c.sha)
        return `PR #${pr.number} has new commits since you pressed. Nothing was sent.`
    }
    if (c.kind === 'expires-at' && now >= c.at) return 'This press is too old to run. Nothing was sent.'
    if (c.kind === 'git-tree-hash' && (treeHash?.(c.cwd) ?? null) !== c.hash)
      return 'Files changed since you pressed. Nothing was run.'
  }

  return null
}

const isText = (x: unknown) => typeof x === 'string' && x.length <= 1000

function isPrecondition(x: unknown): x is Precondition {
  if (!isRecord(x)) return false
  switch (x.kind) {
    case 'row-version':
      return isText(x.row) && isText(x.version)
    case 'pr-head-sha':
      return isText(x.ref) && isText(x.sha)
    case 'git-tree-hash':
      return isText(x.cwd) && isText(x.hash)
    case 'expires-at':
      return typeof x.at === 'number' && Number.isFinite(x.at)
    default:
      return false
  }
}

/** The checks a press carries, read from a file or a call: none when absent, null when they are not a list of known checks. */
export function preconditionsOf(raw: unknown): Precondition[] | null {
  if (raw === undefined) return []

  return Array.isArray(raw) && raw.length <= 16 && raw.every(isPrecondition) ? raw : null
}
