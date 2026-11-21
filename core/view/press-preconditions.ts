import type { PrView, Session } from '../../types'
import { rowVersion, type Precondition } from '../domain/preconditions'
import type { RowPress } from '../domain/presses'
import { isPrPress, type PrPress } from './pr-press'

/** What a press from a view is checked against: each drawn row's version by row id, and each drawn PR's head commit by ref. */
export type DrawnVersions = { rows: Record<string, string>; prHeads: Record<string, string> }

/** The versions of rows `rowIds` in session `s`, and the head commits of `prs` that have one. */
export function drawnVersions(
  s: Pick<Session, 'ledger'>,
  rowIds: readonly string[],
  prs: readonly PrView[],
): DrawnVersions {
  return {
    rows: Object.fromEntries(rowIds.map(id => [id, rowVersion(s, id)])),
    prHeads: Object.fromEntries(prs.flatMap(pr => (pr.headSha === undefined ? [] : [[pr.ref, pr.headSha]]))),
  }
}

/**
 * What a press checks when the host applies it, from the view the person pressed it in: a row press, that its row is
 * as drawn, and Merge, that the PR's head is the one drawn. Other PR presses check nothing.
 */
export function drawnPreconditions(view: { drawnVersions: DrawnVersions }, p: RowPress | PrPress): Precondition[] {
  if (isPrPress(p)) {
    const sha = 'ref' in p && p.action === 'pr-merge' ? view.drawnVersions.prHeads[p.ref] : undefined

    return 'ref' in p && sha !== undefined ? [{ kind: 'pr-head-sha', ref: p.ref, sha }] : []
  }
  const version = view.drawnVersions.rows[p.id]

  return version === undefined ? [] : [{ kind: 'row-version', row: p.id, version }]
}
