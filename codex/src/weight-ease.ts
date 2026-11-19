/**
 * The weight transitions running on `el`, its descendants or its ancestors. The first read flushes style, which starts
 * an ease a class change has just caused.
 */
export function weightEasesOf(el: Element): Animation[] {
  el.getBoundingClientRect()

  return (el.ownerDocument.getAnimations?.() ?? []).filter(a => {
    const target = (a.effect as KeyframeEffect | null)?.target
    const isWeightEase = (a as Partial<CSSTransition>).transitionProperty === 'font-variation-settings'

    return isWeightEase && !!target && (el.contains(target) || target.contains(el))
  })
}

/**
 * Runs `measure` with every running weight transition on `el`, its descendants or its ancestors at its end, then puts each back. A title eases to a
 * heavier weight and may wrap there, so a height or line count read mid-ease would be for the wrong weight.
 */
export function atEndWeight<T>(el: Element, measure: () => T): T {
  const easing = weightEasesOf(el)
  const times = easing.map(a => a.currentTime)
  easing.forEach(a => (a.currentTime = a.effect?.getComputedTiming().endTime ?? 0))
  const result = measure()
  easing.forEach((a, i) => (a.currentTime = times[i] ?? 0))

  return result
}
