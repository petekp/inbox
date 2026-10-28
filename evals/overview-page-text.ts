import { LOOK_RULE_LABEL, WAS_PREFIX } from '../hooks/view'
import type { OverviewPage, OverviewRow } from '../hooks/view'

function rowText(r: OverviewRow): string[] {
  switch (r.kind) {
    case 'subject':
      return [
        `${r.mark} ${r.name}${r.text ? `: ${r.text}` : ''}  ${r.age}`,
        ...(r.was ? [`    ${WAS_PREFIX}${r.was}`] : []),
      ]
    case 'child': {
      const branch = r.branch === null ? '' : r.branch === 'last' ? '  └ ' : '  ├ '
      return [`${branch}${r.mark} ${r.name}  ${r.age}`]
    }
    case 'more':
      return [`  └ ${r.text}`]
    case 'look':
      return [LOOK_RULE_LABEL.trimEnd()]
    case 'fold':
      return [`${r.mark} ${r.text}${r.age ? `  ${r.age}` : ''}`]
  }
}

/** The Overview page as plain text, in the order every look draws it, with no styling. */
export function pageText(page: OverviewPage): string {
  if (page.isEmpty) return `${page.empty.title}\n${page.empty.hint}`
  const head = [page.identity, page.goal, page.live].filter((line): line is string => line !== null)

  return [...head, '', ...page.rows.flatMap(rowText), ...(page.error ? ['', page.error] : [])].join('\n')
}
