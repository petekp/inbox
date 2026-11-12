import { HELP_COPY, helpKeys, markLegend } from '../../hooks/help'
import type { ShownTab } from '../../hooks/tabs'
import type { Block } from './blocks'

/**
 * The Help page for the tab it opened over: the keys the look takes, then every mark with what it means. The look
 * names its tabs in words at every width, so it lists no tab symbols.
 */
export function helpBlocks(isNextBuild: boolean, tab: ShownTab, hasStatusButtons: boolean): Block[] {
  const keys = helpKeys('herdr', isNextBuild, tab, hasStatusButtons)
  const heading = (id: string, text: string): Block => ({
    kind: 'heading',
    id,
    depth: 0,
    text,
    count: null,
    mark: null,
    buttons: [],
    isLabel: false,
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
      isMuted: false,
      stall: null,
      under: [k.does],
      buttons: [],
    })),
    heading('help marks', HELP_COPY.marks),
    ...markLegend(isNextBuild).map((m): Block => ({
      kind: 'status',
      id: `mark ${m.mark}`,
      depth: 0,
      mark: { text: m.mark, tone: m.tone, isRunning: m.isRunning },
      name: m.words,
      isBold: false,
      isMuted: false,
      stall: null,
      under: [],
      buttons: [],
    })),
  ]
}
