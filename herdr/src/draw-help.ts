import { HELP_COPY, helpKeys, MARK_LEGEND } from '../../core/view/help'
import type { Block } from './blocks'

/**
 * The Help page, the same over every tab: the keys the look takes, then every mark with what it means. Which inbox
 * build the host runs, when the host says, sits at the right end of the Keys title. The look names its tabs in words
 * at every width, so it lists no tab symbols.
 */
export function helpBlocks(version: string | null): Block[] {
  const keys = helpKeys('herdr')
  const heading = (id: string, text: string, aside?: string): Block => ({
    kind: 'heading',
    id,
    text,
    count: null,
    mark: null,
    buttons: [],
    isLabel: false,
    ...(aside === undefined ? {} : { aside }),
  })

  return [
    heading('help keys', HELP_COPY.keys, version ?? undefined),
    ...keys.map((k): Block => ({
      kind: 'status',
      id: `key ${k.keys}`,
      depth: 0,
      mark: null,
      name: k.keys,
      isBold: true,
      isMuted: false,
      stall: null,
      does: k.does,
      under: [],
      buttons: [],
    })),
    heading('help indicators', HELP_COPY.indicators),
    ...MARK_LEGEND.map((m): Block => ({
      kind: 'status',
      id: `mark ${m.mark}`,
      depth: 0,
      mark: { text: m.mark, tone: m.tone, isRunning: m.isRunning },
      name: '',
      isBold: false,
      isMuted: false,
      stall: null,
      does: m.words,
      under: [],
      buttons: [],
    })),
  ]
}
