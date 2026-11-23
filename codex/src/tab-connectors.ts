import { fadePseudoWith, isFadingIn } from './tab-glide'
import { root } from './tab-state'

/** The pseudo-element each entering class fades: a connector's column, or a work row's arm. */
const ENTERING: [cls: string, pseudo: string][] = [
  ['connector-entering', '::before'],
  ['arm-entering', '::after'],
]

const ENTERING_SELECTOR = ENTERING.map(([cls]) => `.${cls}`).join(', ')

const LEAVING = '.connector-leaving, .arm-leaving'

const connectorFades = new WeakMap<HTMLElement, Animation[]>()

/**
 * Fades in each connector that enters with its rows, on the fade of the first row after it that fades in: the first
 * row it joins. So a line waits with that row for the row's space to open, and never shows before what it joins. A
 * connector that starts to leave stops its fade in, and the leaving class fades it out.
 */
export function showConnectors() {
  const inOrder = [...root.querySelectorAll<HTMLElement>(`[data-motion], ${ENTERING_SELECTOR}`)]
  for (const [n, el] of inOrder.entries()) {
    if (!el.matches(ENTERING_SELECTOR) || connectorFades.has(el)) continue
    const row = inOrder.slice(n + 1).find(r => r.dataset.motion !== undefined && isFadingIn(r))
    const pseudos = ENTERING.filter(([cls]) => el.classList.contains(cls)).map(([, pseudo]) => pseudo)
    connectorFades.set(
      el,
      pseudos.map(pseudo => fadePseudoWith(el, pseudo, row)),
    )
  }
  for (const el of root.querySelectorAll<HTMLElement>(LEAVING)) {
    for (const a of connectorFades.get(el) ?? []) a.cancel()
    connectorFades.delete(el)
  }
}
