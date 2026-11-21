import type { Session } from '../../types'
import { emptySession } from './session-files'

const SESSION_FIELDS = Object.keys(emptySession()).filter(
  field =>
    field !== 'remoteCommands' &&
    field !== 'remoteViewers' &&
    field !== 'remoteCommandFloor' &&
    field !== 'lastAnswers',
)

export function presentedSession(
  session: Session,
): Omit<Session, 'remoteCommands' | 'remoteViewers' | 'remoteCommandFloor' | 'lastAnswers'> {
  return Object.fromEntries(SESSION_FIELDS.map(field => [field, session[field as keyof Session]])) as Omit<
    Session,
    'remoteCommands' | 'remoteViewers' | 'remoteCommandFloor' | 'lastAnswers'
  >
}
