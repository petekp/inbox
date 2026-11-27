import { createHash } from 'node:crypto'
import { isResumable, stopBanner, tabBarBanners } from '../../core/view/banners'
import { remoteRowDigest } from '../../core/remote/remote-commands'
import type { Session } from '../../types'
import type { ViewIdentity } from './row-view'
import type { AllowedAction } from './row-view'
import type { Result } from '../app.contract'

type Banner = Result<'loadInbox'>['banners'][number]
export async function projectBanners(
  state: Session,
  failure: string | null,
  binding: ViewIdentity,
  actions: readonly string[],
  versions: Map<string, string>,
  allowed: Map<string, AllowedAction>,
): Promise<Banner[]> {
  const host = state.stop ? [stopBanner(state.stop)] : []
  const shown = tabBarBanners(host, failure, null)
  const banners: Banner[] = shown.map(banner => ({
    id: banner.kind,
    title: banner.lead,
    body: banner.body ?? '',
    tone: banner.tone,
    key: '',
    label: '',
    disabled: true,
  }))
  if (state.stop && isResumable(state.stop)) {
    const banner = banners.find(row => row.id === 'stopped')!
    const previous = state.lastActions.session
    const sameStop = previous && previous.at >= state.stop.at && previous.turnsStarted === state.presence.turnsStarted
    const resuming = !!sameStop && previous.delivery?.state !== 'failed'
    if (sameStop && previous.delivery?.state === 'failed') banner.body += ` ${previous.delivery.reason}`
    if (actions.includes('resume')) {
      const version = await remoteRowDigest(state, 'session')
      const press = { action: 'resume', id: 'session' } as const
      banner.key = createHash('sha256')
        .update(JSON.stringify([binding, version, press]))
        .digest('hex')
      banner.label = resuming ? 'Resuming…' : 'Resume'
      banner.disabled = resuming || state.presence.isTurnRunning
      versions.set('session', version)
      allowed.set(banner.key, { press, disabled: banner.disabled })
    } else banner.body += ' Resume in the agent’s app.'
  }
  return banners
}
