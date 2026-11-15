import { homedir } from 'node:os'

import { memoizedFeedPath, resolveInboxFeedPath } from '../../hooks/feed-path'
import type { FeedPathSetting } from '../../hooks/feed-path'
import type { Run } from '../../hooks/gh'

export function runtimeFeedPath(setting: FeedPathSetting | undefined, paneId: string | null, run: Run) {
  const configured = typeof setting === 'string' ? setting : process.env.INBOX_FEED

  return memoizedFeedPath(
    typeof setting === 'function'
      ? setting
      : () =>
          resolveInboxFeedPath(
            configured,
            process.env.HOME || homedir(),
            { paneId: paneId ?? undefined, binPath: process.env.HERDR_BIN_PATH },
            run,
          ),
  )
}
