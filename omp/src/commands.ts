import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

import type { Run } from '../../hooks/gh'
import { openTarget as openWith } from '../../hooks/open-targets'

/** Opens a link, or a path as `openCommands` decides. Returns why it could not, or null. */
export function openTarget(run: Run, target: string, root: string, home: string): Promise<string | null> {
  return openWith(
    run,
    {
      stat: path => stat(path).catch(() => null),
      isExecutable: path =>
        access(path, constants.X_OK).then(
          () => true,
          () => false,
        ),
    },
    target,
    root,
    home,
  )
}
