import { HELP_COPY, helpKeys, markLegend } from '../../hooks/help'
import type { ShownTab } from '../../hooks/tabs'
import type { ToneName } from '../../hooks/tones'
import type { Block, Tone } from './blocks'

const TONES: Record<ToneName, Tone> = {
  needsYou: 'needsYou',
  issue: 'issue',
  findings: 'warning',
  prs: 'running',
  done: 'done',
  error: 'error',
}

/**
 * The Help page for the tab it opened over: the keys the look takes, then every mark with what it means. The look
 * names its tabs in words at every width, so it lists no tab symbols.
 */
export function helpBlocks(isNextBuild: boolean, tab: ShownTab, hasStatusButtons: boolean): Block[] {
  const keys = helpKeys('herdr', isNextBuild, tab, hasStatusButtons)
  const heading = (id: string, text: string): Block => ({
    kind: 'heading',
    id,
    text,
    count: null,
    mark: null,
    buttons: [],
  })

  return [
    heading('help keys', HELP_COPY.keys),
    ...keys.map((k): Block => ({
      kind: 'status',
      id: `key ${k.keys}`,
      depth: 0,
      mark: null,
      name: k.keys,
      isBold: true,
      stall: null,
      under: [k.does],
      buttons: [],
    })),
    heading('help marks', HELP_COPY.marks),
    ...markLegend(isNextBuild).map((m): Block => ({
      kind: 'status',
      id: `mark ${m.mark}`,
      depth: 0,
      mark: { text: m.mark, tone: m.tone ? TONES[m.tone] : null, isRunning: m.isRunning },
      name: m.words,
      isBold: false,
      stall: null,
      under: [],
      buttons: [],
    })),
  ]
}
