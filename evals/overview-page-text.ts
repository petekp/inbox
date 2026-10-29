import { LOOK_TEXT, mergedLine, STALL_GAP, WAS_PREFIX } from '../hooks/view'
import type { OverviewPage, OverviewRow } from '../hooks/view'

/** A row's second line: where it stands, then its stall words. */
function secondLine(text: string | null, stall: string | null): string | null {
  const parts = [text, stall].filter((p): p is string => p !== null)

  return parts.length > 0 ? parts.join(STALL_GAP) : null
}

/**
 * A child linked to no row on the page is indented with no branch, so the judge can tell it from a subject row. The
 * looks draw it at a subject's depth.
 */
function rowText(r: OverviewRow): string[] {
  switch (r.kind) {
    case 'subject': {
      const second = secondLine(r.text, r.stall)
      return [
        `${r.mark} ${r.name}`,
        ...(second ? [`  ${second}`] : []),
        ...(r.merged ? [`  ${mergedLine(r.merged, () => true)}`] : []),
        ...(r.was ? [`  ${WAS_PREFIX}${r.was}`] : []),
      ]
    }
    case 'child': {
      const branch = r.branch === null ? '  ' : r.branch === 'last' ? '  └ ' : '  ├ '
      const under = r.branch === null ? '    ' : '      '
      return [`${branch}${r.mark} ${r.name}`, ...(r.stall ? [`${under}${r.stall}`] : [])]
    }
    case 'more':
      return [`  └ ${r.text}`]
    case 'look':
      return [`── ${LOOK_TEXT}`]
    case 'fold':
      return [`${r.mark} ${r.text}`]
  }
}

/** The Overview page as plain text, in the order every look draws it, with no styling. */
export function pageText(page: OverviewPage): string {
  if (page.isEmpty) return `${page.empty.title}\n${page.empty.hint}`

  return [
    ...(page.head ? [page.head.title, ...(page.head.description ? [page.head.description] : [])] : []),
    '',
    ...page.rows.flatMap(rowText),
    ...(page.error ? ['', page.error] : []),
  ].join('\n')
}
