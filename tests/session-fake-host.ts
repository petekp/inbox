import { emptySession } from '../hooks/session-files'
import type { Session } from '../types'
import type { MakeHost } from './session-script'
import { fakeHostWith } from './session-script'

export const fakeHost: MakeHost = ask => {
  let state: Session = emptySession()
  let isHeld = false

  return fakeHostWith<Session>({
    read: async () => state,
    update: async change => {
      state = await change(state)
      return state
    },
    exclusive: async fn => {
      if (isHeld) return { acquired: false }
      isHeld = true
      try {
        return { acquired: true, value: await fn() }
      } finally {
        isHeld = false
      }
    },
  })(ask)
}
