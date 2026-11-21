import type { Hook } from 'claude-code'

import { setDemo } from './mod-demo'
import { readUi } from './mod-drawn'
import { askHerdrModAgain, openInHerdr } from './mod-herdr'
import { ensureOn } from './mod-lifecycle'
import { showInbox } from './mod-pane-open'
import type { Mod } from './mod-ports'
import { findPrs } from './mod-prs'
import { mod } from './mod-state'

type CommandRunEvent = Parameters<Hook<'command.run'>>[1]

/** Runs `/inbox`: opens the pane, or with `demo` shows or hides the sample, or with `herdr` asks about the Herdr mod again. */
export async function inboxCommand(m: Mod, e: CommandRunEvent): Promise<{ text?: string }> {
  if (!mod.isOn && !mod.turningOn && e.origin.kind !== 'composer') return {}
  await ensureOn(m)
  const isShown = (await m.atoms.demo.read()) !== null
  const args = e.args.trim().split(/\s+/).join(' ')
  if (args === 'herdr') return { text: await askHerdrModAgain(m.herdr, () => showInbox(m, null)) }
  if (args === 'demo' || args === 'demo recording') await setDemo(m, !isShown, args === 'demo recording')
  else if ((await readUi(m)).tab === 'prs') await findPrs(m)
  const [isDemo, isDemoRecording] = await Promise.all([
    m.atoms.demo.read().then(d => d !== null),
    m.atoms.demoRecording.read(),
  ])
  const note = await showInbox(m, args || isDemo ? null : openInHerdr(m.herdr))

  return {
    text: !isDemo
      ? (note ?? 'Opened the inbox.')
      : isDemoRecording
        ? 'Showing sample entries without their notices, for a recording. Run /inbox demo to go back.'
        : 'Showing sample entries in the inbox. Run /inbox demo again to go back.',
  }
}
