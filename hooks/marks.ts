/**
 * Marks drawn as shapes in an 8-point box: every mark here in a desktop Svg, and ✗ in the Codex tab. Neither can
 * choose a font that draws them well: the desktop pane's Svg cannot load the app's own font, and the system font draws
 * ✓ as a thin "v" and ✗ the same as ✕. `midY` is the box's middle on the line.
 */
export function markShape(mark: string, midY: number): string | null {
  const t = midY - 4
  const stroke = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"'
  switch (mark) {
    case '✓':
      return `<polyline points="0.6,${t + 4.4} 3,${t + 6.8} 7.4,${t + 1.4}" ${stroke} stroke-width="1.4"/>`
    case '✕':
      return `<path d="M1,${t + 1} L7,${t + 7} M7,${t + 1} L1,${t + 7}" ${stroke} stroke-width="1.4"/>`
    case '✗':
      // The ballot X a monospace font draws: a long, heavy upstroke crossed by a shorter downstroke.
      return (
        `<path d="M1.2,${t + 8.2} Q3.4,${t + 4.4} 7.4,${t - 0.2}" ${stroke} stroke-width="1.9"/>` +
        `<path d="M2.2,${t + 1.4} Q3.8,${t + 4.4} 5.6,${t + 7.4}" ${stroke} stroke-width="1.6"/>`
      )
    case '▲':
      return `<polygon points="4,${t + 0.6} 7.8,${t + 7.4} 0.2,${t + 7.4}" fill="currentColor"/>`
    case '✦':
      return (
        `<path d="M4,${t} Q4.6,${t + 3.4} 8,${t + 4} Q4.6,${t + 4.6} 4,${t + 8} ` +
        `Q3.4,${t + 4.6} 0,${t + 4} Q3.4,${t + 3.4} 4,${t} Z" fill="currentColor"/>`
      )
    default:
      return null
  }
}
