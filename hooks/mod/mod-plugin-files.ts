import { NEXT_BUILD_MARK } from '../../core/view/banners'
import { COMPARE_PAGE_FILE } from '../../core/domain/press-messages'

/** The page template for a comparison, as the mod in folder `root` ships it. */
export function comparePagePath(root: string): string {
  return `${root}/hooks/${COMPARE_PAGE_FILE}`
}

/** The next-build mark's path in the mod's folder `root`. */
export function nextBuildMarkPath(root: string): string {
  return `${root}/${NEXT_BUILD_MARK}`
}
