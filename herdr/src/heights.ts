/** A box's size in px. */
type Size = { width: number; height: number }

/** The app's zoom from its `settings()`, 1 when unset. */
export function zoomOf(settings: Record<string, unknown>): number {
  const zoom = settings.zoom

  return typeof zoom === 'number' && zoom > 0 ? zoom : 1
}

/**
 * The size each list block and each row's panel last measured, by key, at zoom 1, the scale every size the look sets
 * is in. A block's box draws at its measured height so a change to its content glides from the old height to the new
 * one. A size stays after its block leaves, for when the block comes back at that size, since gpui-kit may not report
 * a size that did not change.
 */
export class Heights {
  private sizes = new Map<string, Size>()
  private resized = new Set<string>()
  private zoom: number | null = null

  get(key: string): number | undefined {
    return this.sizes.get(key)?.height
  }

  /**
   * Saves a size gpui-kit's size callback reported at `zoom`. The callback reports a size the zoom has already scaled,
   * while a size set on an element, as `h`, is at zoom 1 and the app scales it, so the size is kept divided by the zoom.
   * True when its height changed, so the look draws again to move to it, or when the zoom changed, so the look draws
   * again with the sizes it reads from the zoom, as whether the pane is narrow. A box whose height changed with its
   * width, as when the pane is resized, takes its new height in the next draw instead of gliding to it, so its text
   * does not lag the pane.
   */
  measure(key: string, reported: Size, zoom: number): boolean {
    const size = { width: reported.width / zoom, height: reported.height / zoom }
    const isZoomChanged = this.zoom !== null && this.zoom !== zoom
    this.zoom = zoom
    const was = this.sizes.get(key)
    this.sizes.set(key, { width: size.width, height: size.height })
    const isRewrapped = was !== undefined && was.width !== size.width && was.height !== size.height
    if (isRewrapped) this.resized.add(key)

    return was?.height !== size.height || isZoomChanged
  }

  /** The keys whose height changed with their width since the last draw. Each draws once at its own height. */
  takeResized(): ReadonlySet<string> {
    const resized = this.resized
    this.resized = new Set()

    return resized
  }

  clear() {
    this.sizes.clear()
    this.resized.clear()
  }
}
