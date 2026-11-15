import { feedbackOf, feedbackText } from '../hooks/feedback'
import { CLAUDE_CODE } from '../hooks/model-text'
import { checkRowId, prMarkId } from '../hooks/pr-rows'
import { withFetchedPrs } from '../hooks/session-presses'
import { applied, endTurn, notePrompt, turnEnded } from '../hooks/session-turns'
import type { PrView, Session } from '../types'
import { fakeHost } from './session-fake-host'
import { BLOCKED_PR, FIX_REF } from './session-helpers'

export async function blockedPrHost(refreshed: (pr: PrView, at: number) => PrView, start: PrView = BLOCKED_PR) {
  const { host, delivered } = fakeHost(async () => null)
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: start } },
  }))
  const shownWhileRefreshing: string[] = []
  const shownOn = async (rowId: string) => {
    const s = await host.read()
    const f = feedbackOf(rowId, s.lastActions[rowId], undefined, s.presence, await host.now())
    return f ? feedbackText(f, 'terminal') : null
  }
  host.refreshPrs = async () => {
    for (const id of [prMarkId(FIX_REF), checkRowId(FIX_REF, 'test')]) {
      const text = await shownOn(id)
      if (text) shownWhileRefreshing.push(text)
    }
    const at = await host.now()
    await host.update(s => withFetchedPrs(s, { [FIX_REF]: refreshed(s.prViews.views[FIX_REF]!, at) }, null, false, at))
  }

  return { host, delivered, shownWhileRefreshing, shownOn }
}

const NO_UPDATE = { closed: [], added: [], helped: [], updated: [], asked: [], todos: [] }

export function repliedTo(s: Session, text: string, now: number): Session {
  const ended = endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, text, false).state, 'Done.', false)

  return applied(turnEnded(ended, now), NO_UPDATE, now, now)
}
