import { HELP_COPY, helpKeys, MARK_LEGEND } from '../../hooks/help'
import type { Block } from './blocks'

/**
 * The Help page, the same over every tab: the keys the look takes, then every mark with what it means, then which
 * inbox build the host runs, when the host says. The look names its tabs in words at every width, so it lists no tab
 * symbols.
 */
export function helpBlocks(version: string | null): Block[] {
  const keys = helpKeys('herdr')
  const heading = (id: string, text: string): Block => ({
    kind: 'heading',
    id,
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
      does: k.does,
      under: [],
      buttons: [],
    })),
    heading('help marks', HELP_COPY.marks),
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
    ...(version === null
      ? []
      : [
          {
            kind: 'status',
            id: 'help version',
            depth: 0,
            mark: null,
            name: '',
            isBold: false,
            isMuted: true,
            stall: null,
            does: version,
            under: [],
            buttons: [],
          } satisfies Block,
        ]),
  ]
}
