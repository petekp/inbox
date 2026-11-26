/** A box's size in px. */
type Size = { width: number; height: number }

/** What follows a block's id in the id of the copy it leaves behind when it moves to another place, and the time it moved. */
const MOVED_FROM = '~from '

/** What follows a block's id in the id of its boxes at the new place it moved to, and the time it moved. */
export const MOVED_TO = '~to '

/** The id of the copy a block leaves in its old place, when it moves at `at` ms. */
export const copyIdOf = (id: string, at: number): string => `${id}${MOVED_FROM}${at}`

/** The key of the block a copy was made from, or the key itself. */
const originalKey = (key: string): string => key.replace(new RegExp(`${MOVED_FROM}\\d+$`), '')

/** The app's zoom from its `settings()`, 1 when unset. */
export function zoomOf(settings: Record<string, unknown>): number {
  const zoom = settings.zoom

  return typeof zoom === 'number' && zoom > 0 ? zoom : 1
}

/** The sizes the look last measured, by key: each box's height and width. */
export type Sizes = { get: (key: string) => number | undefined; widthOf: (key: string) => number | undefined }

/** No measured sizes, as before a look's first measure. */
export const NO_SIZES: Sizes = { get: () => undefined, widthOf: () => undefined }

/**
 * The size each list block and each row's panel last measured, by key, at zoom 1, the scale every size the look sets
 * is in. A block's box draws at its measured height so a change to its content glides from the old height to the new
 * one. A size stays after its block leaves, for when the block comes back at that size, since gpui-kit may not report
 * a size that did not change.
 */
export class Heights {
  private sizes = new Map<string, Size>()
  private resized = new Set<string>()
  private isChanged = false
  private formingSince: number | null = null
  private zoom: number | null = null

  /** A block's copy in its old place has no size of its own until it measures, and takes its original's until then. */
  get(key: string): number | undefined {
    return (this.sizes.get(key) ?? this.sizes.get(originalKey(key)))?.height
  }

  /** The width a box last measured, at zoom 1, or its original's for a copy that has not measured yet, as `get`. */
  widthOf(key: string): number | undefined {
    return (this.sizes.get(key) ?? this.sizes.get(originalKey(key)))?.width
  }

  /**
   * Saves a size gpui-kit's size callback reported at `zoom`. The callback reports a size the zoom has already scaled,
   * while a size set on an element, as `h`, is at zoom 1 and the app scales it, so the size is kept divided by the zoom.
   * True when its height changed, so the look draws again to move to it, or when the zoom changed, so the look draws
   * again with the sizes it reads from the zoom, as whether the pane is narrow. A box whose height changed with its
   * width, as when the pane is resized, takes its new height in the next draw instead of gliding to it, so its text
   * does not lag the pane. With `isWidthDrawn`, a change of width alone is also true, for a box whose width the look
   * reads to choose a form, as answer buttons' widths choose whether they sit side by side.
   */
  measure(key: string, reported: Size, zoom: number, isWidthDrawn = false): boolean {
    const size = { width: reported.width / zoom, height: reported.height / zoom }
    const isZoomChanged = this.zoom !== null && this.zoom !== zoom
    this.zoom = zoom
    const was = this.sizes.get(key)
    this.sizes.set(key, { width: size.width, height: size.height })
    const isRewrapped = was !== undefined && was.width !== size.width && was.height !== size.height
    if (isRewrapped) this.resized.add(key)
    if (was?.height !== size.height) this.isChanged = true

    return was?.height !== size.height || isZoomChanged || (isWidthDrawn && was?.width !== size.width)
  }

  /** The keys whose height changed with their width since the last draw. Each draws once at its own height. */
  takeResized(): ReadonlySet<string> {
    const resized = this.resized
    this.resized = new Set()

    return resized
  }

  /**
   * Whether the page drawn at `now` still forms. A newly shown page (`isFirst`) draws at once, and keeps taking its
   * heights at once while each draw brings new measures, as when its answers' measured widths stack them, so a row drawn
   * for the first time comes to rest at its measured height instead of springing to it under its buttons.
   */
  isForming(isFirst: boolean, now: number): boolean {
    const isChanged = this.isChanged
    this.isChanged = false
    const since = this.formingSince
    this.formingSince = isFirst ? now : since !== null && isChanged && now - since < PAGE_FORMS_MS ? since : null

    return this.formingSince !== null
  }

  clear() {
    this.sizes.clear()
    this.resized.clear()
  }
}

/** How long a newly shown page keeps taking its heights at once while its measures still change. */
const PAGE_FORMS_MS = 100

/** The key a row's title is measured under. */
export const titleId = (id: string): string => `title ${id}`

/** The key a row's lines under its title, with its panel, are measured under. */
export const restId = (id: string): string => `rest ${id}`

/** The key a PR block's title is measured under. */
export const prHeadId = (id: string): string => `head ${id}`

/** The keys a held line that lets go is measured under: its box as it shuts, and the line in it. */
export const aboveId = (id: string): string => `above ${id}`
export const aboveLineId = (id: string): string => `above line ${id}`

/** The key a row's panel is measured under, beside the row's own height. */
export const panelId = (id: string): string => `panel ${id}`
