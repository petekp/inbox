import { tabFolds } from '../../../core/view/fold-all'
import { shownTabs } from '../../../core/view/tabs'
import type { SessionView } from '../../../core/view/session-view'
import type { Result } from '../app.contract'

export function projectFolds(view: SessionView, capture: (id: string) => string): Result<'loadInbox'>['foldPlans'] {
  return shownTabs().map(tab => {
    const targets = tabFolds(view, tab.id)
    return {
      ...targets,
      tab: tab.id === 'overview' ? 'status' : tab.id === 'needsYou' ? 'asks' : tab.id,
      records: [...new Set([...targets.parents, ...targets.rows])].map(id => ({ id, value: capture(id) })),
    }
  })
}
