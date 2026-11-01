import { parseStatus } from '../hooks/status'
import { CLAUDE_CODE } from '../hooks/model-text'
import { endTurn, notePrompt } from '../hooks/session-turns'
import type { PrView, Session } from '../types'

export const LEDGER_REPLY = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'

export const finishTurn = (s: Session, reply: string) =>
  endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, 'go', false).state, reply, false)

export const answer = parseStatus(
  'HEAD: Work offline | Letting the app work without a connection\nNEW: working | Offline mode | queue built',
)!

export const FIX_REF = 'acme/app#12'

export const BLOCKED_PR: PrView = {
  ref: FIX_REF,
  number: 12,
  title: 'Add a CLI',
  url: 'https://github.com/acme/app/pull/12',
  isDraft: false,
  state: 'OPEN',
  base: 'main',
  mergeable: 'CONFLICTING',
  reviewDecision: '',
  checks: [{ name: 'test', bucket: 'fail', url: null }],
  threads: [],
  isYours: true,
  wasSeenOpen: true,
  error: null,
  fetchedAt: 1,
}
