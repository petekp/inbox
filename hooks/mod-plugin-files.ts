import type { EngineInterface } from 'claude-code'

import { NEXT_BUILD_MARK } from './banners'
import { COMPARE_PAGE_FILE } from './press-messages'

/** The page template for a comparison, as the mod ships it. */
export function comparePagePath($: EngineInterface): string {
  return `${$.plugin.root}/hooks/${COMPARE_PAGE_FILE}`
}

export function readIsNextBuild($: EngineInterface): Promise<boolean> {
  return $.fs.exists(`${$.plugin.root}/${NEXT_BUILD_MARK}`).catch(() => false)
}
