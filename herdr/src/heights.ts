/** A measured box's size, in logical px, as gpui-kit's size callback reports it. */
type Size = { width: number; height: number }

/**
 * The size each list block and each row's panel last measured, by key. A block's box draws at its measured height so
 * a change to its content glides from the old height to the new one. A size stays after its block leaves, for when the
 * block comes back at that size, since gpui-kit may not report a size that did not change.
 */
export class Heights {
  private sizes = new Map<string, Size>()
  private resized = new Set<string>()

  get(key: string): number | undefined {
    return this.sizes.get(key)?.height
  }

  /**
   * Saves a measured size. True when its height changed, so the look draws again to move to it. A box whose height
   * changed with its width, as when the pane is resized, takes its new height in the next draw instead of gliding to
   * it, so its text does not lag the pane.
   */
  measure(key: string, size: Size): boolean {
    const was = this.sizes.get(key)
    this.sizes.set(key, { width: size.width, height: size.height })
    const isRewrapped = was !== undefined && was.width !== size.width && was.height !== size.height
    if (isRewrapped) this.resized.add(key)

    return was?.height !== size.height
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
