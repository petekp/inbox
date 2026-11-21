import { demoView } from './demo'
import { type DemoPressed, demoPressOn } from './mod-demo-press'
import { readUi } from './mod-drawn'
import { comparePagePath } from './mod-plugin-files'
import type { Mod } from './mod-ports'
import { findPrs } from './mod-prs'
import { cancelUndoScroll, paneState } from './mod-state'
import { CLAUDE_CODE } from './model-text'
import type { PrPress } from './pr-press'
import { demoReplied } from './press-effects'
import { isCompareInBackground } from './press-messages'
import type { RowPress } from './presses'
import type { Holds } from './timing'

type DemoCalls = Pick<
  Mod,
  | 'atoms'
  | 'clock'
  | 'pane'
  | 'saves'
  | 'history'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

export async function setDemo(m: DemoCalls, isShown: boolean, isRecording = false) {
  cancelUndoScroll()
  const now = await m.clock.now()
  await Promise.all([
    m.atoms.demo.update(() => (isShown ? demoView(now, CLAUDE_CODE.agent) : null)),
    m.atoms.demoRecording.update(() => isShown && isRecording),
  ])
  paneState.demoSends.clear()
  // The sample closes a row as it starts, at `now`, so its showing starts then too and the row stays in place. The
  // pane shows the sample or opens on it next.
  await m.sendUi(isShown ? [{ type: 'reset' }, { type: 'opened' }, 'read'] : [{ type: 'reset' }, 'read'])
  await m.syncLook(true)
  if ((await readUi(m)).tab === 'prs') await findPrs(m)
}

/** A press on the sample, which changes the sample copy. The stand-in agent answers a sent message when it is due. */
export async function runDemoPress(m: DemoCalls, pressId: number, p: RowPress | PrPress, holds: Holds, now: number) {
  const texts = {
    comparePage: comparePagePath(m.pluginRoot),
    compareInBackground: isCompareInBackground('claude-code'),
  }
  const pressed: { r: DemoPressed | null } = { r: null }
  await m.atoms.demo.update(d => {
    if (!d) return d
    pressed.r = demoPressOn(d, p, now, holds, texts)
    return pressed.r.demo
  })
  if (pressed.r?.sent) paneState.demoSends.set(pressId, pressed.r.sent)

  return pressed.r
}

export async function demoReply(m: DemoCalls, pressId: number) {
  const sent = paneState.demoSends.get(pressId)
  if (!sent) return
  paneState.demoSends.delete(pressId)
  await m.atoms.demo.update(d => d && { ...d, ...demoReplied(d, sent) })
}
