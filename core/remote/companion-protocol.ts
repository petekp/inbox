import type { Session } from '../../types'
import type { RemoteCommand } from './remote-commands'
import type { RemoteViewerUpdate } from '../runtime/remote-viewers'
import type { remoteReceipts } from '../runtime/remote-command-state'
import type { remoteViewerReceipts } from '../runtime/remote-viewers'

export type CompanionSession = { id: string; name: string }
export type CompanionRequest =
  | { version: 1; operation: 'list' }
  | { version: 1; operation: 'view'; session: string; opened: boolean }
  | { version: 1; operation: 'apply'; session: string; file: RemoteCommand | RemoteViewerUpdate }

export type CompanionView = {
  sessionId: string
  name: string
  projectFolder: string
  writtenAt: number
  serverNow: number
  version: string
  isFetchingPrs: boolean
  remoteActions: readonly string[]
  remoteHistoryAfter: number
  receipts: ReturnType<typeof remoteReceipts>
  viewers: ReturnType<typeof remoteViewerReceipts>
  session: Session
  warnings: string[]
}

export type CompanionHandler = (request: CompanionRequest, sessions: CompanionSession[]) => Promise<unknown>
