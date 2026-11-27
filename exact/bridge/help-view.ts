import { helpVersionText } from '../../core/view/help'
import { helpLegend } from '../tools/help-rules'
import { selectedBinding } from './catalog'
import { currentView } from './view'
import type { Result } from '../app.contract'

export async function helpView(session: string): Promise<Result<'loadHelp'>> {
  let version = ''
  if (session) {
    const binding = await selectedBinding(session).catch(() => null)
    const current = binding ? await currentView(0, binding).catch(() => null) : null
    if (current?.envelope.version)
      version = helpVersionText(current.envelope.version, current.envelope.isNextBuild === true)
  }
  return { ...helpLegend(), version }
}
