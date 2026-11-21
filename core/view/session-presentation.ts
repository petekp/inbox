import type { Session } from '../../types'
import { emptySession } from './session-files'

type Presented = Omit<Session, 'remoteCommands' | 'remoteCommandFloor' | 'lastAnswers'>

const SESSION_FIELDS = Object.keys(emptySession()).filter(
  field => field !== 'remoteCommands' && field !== 'remoteCommandFloor' && field !== 'lastAnswers',
)

export function presentedSession(session: Session): Presented {
  return Object.fromEntries(SESSION_FIELDS.map(field => [field, session[field as keyof Session]])) as Presented
}
