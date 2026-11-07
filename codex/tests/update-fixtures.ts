import type { Exchange } from '../../types'

export const ex = (turn: number, reply: string): Exchange => ({
  person: 'go',
  trigger: null,
  activity: [],
  reply,
  turn,
  press: null,
  screen: 'The Inbox tab is closed.',
  tasks: [],
})

export const LEDGER_ANSWER = 'NEW: decide | - | Deploy now? | Yes / No | Yes'
