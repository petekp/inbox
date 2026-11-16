/**
 * Runs `measure` with every running weight transition under `el` at its end, then puts each back. A title eases to a
 * heavier weight and may wrap there, so a height or line count read mid-ease would be for the wrong weight.
 */
export function atEndWeight<T>(el: Element, measure: () => T): T {
  const easing = el
    .getAnimations({ subtree: true })
    .filter(a => (a as Partial<CSSTransition>).transitionProperty === 'font-variation-settings')
  const times = easing.map(a => a.currentTime)
  easing.forEach(a => (a.currentTime = a.effect?.getComputedTiming().endTime ?? 0))
  const result = measure()
  easing.forEach((a, i) => (a.currentTime = times[i] ?? 0))

  return result
}
