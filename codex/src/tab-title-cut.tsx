import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { cutForEllipsis, cutLine } from '../../core/domain/text'
import type { NewRow } from '../../core/view/arrivals'
import { COLLAPSED_TITLE_LINES } from '../../core/view/row-parts'
import { TitleTint } from './tab-title-tint'

/**
 * The title cut at a word to fit `el`'s clamped lines (`cutLine`), or null when it fits whole. A word cut that leaves
 * the last line empty stops before a word wider than a line, so the title is cut inside that word instead. It tries
 * each cut in a hidden copy of `el` beside it, at its width, so the copy takes the same rules, and drops the copy
 * after. The copy takes the first part's spacing, as `el` does. A word wider than a line overflows its line rather
 * than adding one, so a cut fits only when it overflows neither way.
 */
function cutTitleOf(el: HTMLElement, title: string): string | null {
  const copy = el.cloneNode(true) as HTMLElement
  const width = el.getBoundingClientRect().width
  copy.style.cssText = `position: absolute; visibility: hidden; margin-left: 0; padding-left: 0; text-indent: 0; width: ${width}px`
  const tint = copy.querySelector<HTMLElement>('.title-tint')
  el.after(copy)
  const show = (text: string) => {
    if (tint) tint.textContent = text
  }
  show(title)
  const lineHeight = copy.clientHeight / COLLAPSED_TITLE_LINES
  const fits = (text: string) => {
    show(text)

    return copy.scrollHeight <= copy.clientHeight + 0.5 && copy.scrollWidth <= copy.clientWidth + 0.5
  }
  const cut = cutLine(title, fits)
  show(cut)
  const isLastLineEmpty = cut !== title && copy.scrollHeight <= (COLLAPSED_TITLE_LINES - 1) * lineHeight + 0.5
  const result = isLastLineEmpty ? `${cutForEllipsis(title, fits)}…` : cut
  copy.remove()

  return result === title ? null : result
}

/**
 * A row's title part: its lead and its tinted title. Where `isClamped`, the closed row's form, a title longer than the
 * clamp's lines is cut at a word at the end of its last line, as every look cuts it, and cut again when the part's
 * width changes. Until the first measure, the clamp cuts it.
 */
export function TitlePart({
  lead,
  title,
  tint,
  isClamped,
}: {
  lead: string | undefined
  title: string
  tint: NewRow | undefined
  isClamped: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState<string | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !isClamped) return setCut(null)
    let width = -1
    const fit = () => {
      const now = el.getBoundingClientRect().width
      if (Math.abs(now - width) < 0.5) return
      width = now
      setCut(cutTitleOf(el, title))
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)

    return () => watch.disconnect()
  }, [title, isClamped])

  return (
    <span ref={ref} class="part title-part">
      {lead ? (
        <>
          <span class="lead">{lead}</span>{' '}
        </>
      ) : null}
      <TitleTint row={tint} tone="key">
        {isClamped && cut !== null ? cut : title}
      </TitleTint>
    </span>
  )
}
