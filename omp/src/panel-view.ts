import { countCellsWith } from '../../core/domain/text'
import { fit } from './panel-text'

/**
 * What the panel uses from the pi-tui module the installed omp supplies. omp 18 has `parseKey` and
 * `extractPrintableText`, which read raw terminal input. omp 19.2 dropped both and has `jsx` and `signal`, which
 * build a node that gets decoded keys. `visibleWidth` is how omp counts a line's cells before it cuts a line wider
 * than the terminal.
 */
type TuiModule = {
  visibleWidth?: (line: string) => number
  parseKey?: (raw: string) => string | undefined
  extractPrintableText?: (raw: string) => string | undefined
  jsx?: (type: string, props: object) => unknown
  signal?: (value: number) => { (): number; set(value: number): void; peek(): number }
}

/** The first argument of a `ctx.ui.custom` factory: omp 18's `TUI`, or omp 19.2's UI host with `size()`. */
type UiHost = { requestRender(): void } & ({ size(): { rows: number } } | { terminal: { rows: number } })

/** A key as omp 19.2 decodes it. `id` names it as omp 18's `parseKey` does, such as `shift+tab` or `escape`. */
type KeyEvent = { id: string; text?: string; kind: 'press' | 'repeat' | 'release' }

type Panel = {
  render(width: number): string[]
  handleInput(key: string, text?: string): void
  dispose(): void
}

/**
 * Makes the panel and the band count cells as omp does, so omp never cuts the end of a line they fit to its width.
 * Returns a call that puts back the count it replaced.
 */
export function countCellsAsOmp(tui: TuiModule): () => void {
  return tui.visibleWidth ? countCellsWith(tui.visibleWidth) : () => {}
}

export const screenRows = (ui: UiHost): number => ('size' in ui ? ui.size().rows : ui.terminal.rows)

/**
 * The panel as the view `ctx.ui.custom` shows, and how to draw it again. omp 18 takes a rows object and gives it raw
 * input. omp 19.2 gives a rows object only the raw bytes, which the panel cannot read without `parseKey`, so it gets a
 * `canvas` node, which repaints when a signal it reads changes. A canvas row must not be wider than the view.
 */
export function panelView(
  tui: TuiModule,
  ui: UiHost,
  panel: Panel,
): { view: unknown; requestRender(): void; dispose(): void } {
  let isDisposed = false
  const dispose = () => {
    if (isDisposed) return
    isDisposed = true
    panel.dispose()
  }
  const paint = (width: number) => panel.render(width).map(line => fit(line, width))
  const { parseKey, extractPrintableText, jsx, signal } = tui
  if (parseKey && extractPrintableText) {
    const handleInput = (raw: string) => panel.handleInput(parseKey(raw) ?? '', extractPrintableText(raw))
    const view = { render: paint, handleInput, invalidate: () => {}, dispose }

    return { view, requestRender: () => ui.requestRender(), dispose }
  }
  if (!jsx || !signal) throw new Error("omp's pi-tui has neither parseKey nor jsx")
  const drawn = signal(0)
  const onKey = (key: KeyEvent) => {
    if (key.kind !== 'release') panel.handleInput(key.id, key.text)
    return true
  }
  const view = jsx('canvas', {
    paint: (width: number) => {
      drawn()
      return paint(width)
    },
    onKey,
    onPaste: (paste: { text: string }) => {
      panel.handleInput('', paste.text)
      return true
    },
  })

  return { view, requestRender: () => drawn.set(drawn.peek() + 1), dispose }
}
