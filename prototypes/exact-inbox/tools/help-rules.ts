import { HELP_COPY, MARK_LEGEND, helpKeys } from '../../../core/view/help'
import { toneColors } from '../../../core/view/tones'
import type { Result } from '../app.contract'

export function helpLegend(): Result<'loadHelp'> {
  return {
    keysHeading: HELP_COPY.keys,
    keys: helpKeys('codex'),
    heading: HELP_COPY.indicators,
    version: '',
    rows: MARK_LEGEND.map((row, index) => {
      const color = row.tone ? toneColors(row.tone) : null
      return {
        id: String(index),
        mark: row.mark,
        words: row.words,
        running: row.isRunning,
        color: color ? `light-dark(${color.light}, ${color.dark})` : '-exact-secondary-label',
      }
    }),
  }
}
