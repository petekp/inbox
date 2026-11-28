import { ago } from '../../core/domain/text'
import { isResumable, isResumeRequested, stopBanner } from '../../core/view/banners'
import { DOT, resumeLabel } from '../../core/view/rows'
import type { ReadSession } from '../../core/remote/herdr-read'
import type { Stop } from '../../types'
import type { Block } from './blocks'
import { button } from './blocks'

/** The id the stop's banner shares with the Resume press, which every host keys to the session. */
const STOP_ID = 'session'

/**
 * The turn's stop, from the published file. `canResume` says the stop is one Resume continues past and the host takes
 * Resume from the look. `failure` is why the host could not send the last Resume for this stop.
 */
export type StopScreen = { stop: Stop; canResume: boolean; isResumeSent: boolean; failure: string | null }

export function stopScreenOf(read: Extract<ReadSession, { is: 'read' }>): StopScreen | null {
  const { session } = read
  const { stop } = session
  if (!stop) return null
  const last = session.lastActions[STOP_ID]
  const delivery = last && last.at >= stop.at ? last.delivery : undefined

  return {
    stop,
    canResume: isResumable(stop) && read.envelope.remoteActions?.includes('resume') === true,
    isResumeSent: isResumeRequested(session),
    failure: delivery?.state === 'failed' ? delivery.reason : null,
  }
}

/** The stop's banner at the top of Asks: "Stopped", how long ago, why, and Resume or the fix. */
export function stopBlocks(stop: StopScreen | null, now: number): Block[] {
  if (!stop) return []
  const resume = {
    ...button(STOP_ID, resumeLabel(stop.isResumeSent), 'primary', {
      is: 'press',
      press: { action: 'resume', id: STOP_ID },
      effects: [],
      kind: 'handoff',
    }),
    labels: [resumeLabel(false), resumeLabel(true)],
  }

  return [
    {
      kind: 'banner',
      id: STOP_ID,
      banner: stopBanner(stop.stop, stop.canResume),
      after: `${DOT}${ago(now - stop.stop.at)}`,
      buttons: stop.canResume ? [{ ...resume, isOut: stop.isResumeSent }] : [],
      feedback: stop.failure ? { text: `Not sent: ${stop.failure}`, tone: 'error' } : null,
    },
  ]
}
