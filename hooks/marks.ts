const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"'

/**
 * The marks the desktop pane draws as Svg shapes in an 8-point box, since its Svg cannot load the app's own font and
 * the system font draws ✓ as a thin "v". `midY` is the box's middle on the line.
 */
export function markShape(mark: string, midY: number): string | null {
  const t = midY - 4
  switch (mark) {
    case '✓':
      return `<polyline points="0.6,${t + 4.4} 3,${t + 6.8} 7.4,${t + 1.4}" ${STROKE} stroke-width="1.4"/>`
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

/**
 * A cancelled row's ✗ in the desktop pane and the Codex tab, in the same 8-point box. The system font draws ✗ the
 * same as ✕, so this draws the ballot X a monospace font draws: a long, heavy upstroke crossed by a shorter stroke.
 */
export function cancelledMarkShape(midY: number): string {
  const t = midY - 4

  return (
    `<path d="M1.2,${t + 8.2} Q3.4,${t + 4.4} 7.4,${t - 0.2}" ${STROKE} stroke-width="1.9"/>` +
    `<path d="M2.2,${t + 1.4} Q3.8,${t + 4.4} 5.6,${t + 7.4}" ${STROKE} stroke-width="1.6"/>`
  )
}
