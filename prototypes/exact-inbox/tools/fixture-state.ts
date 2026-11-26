import { demoSession } from '../../../core/view/demo'
import type { Session } from '../../../types'

export function fixtureSession(now: number): Session {
  const sample = demoSession(now, 'Claude')
  const findings = new Set([...sample.ledger.findings, ...sample.ledger.closedFindings].map(row => row.id))
  const state: Session = JSON.parse(
    JSON.stringify(sample).replace(/"d(\d+)"/g, (_match, number: string) =>
      JSON.stringify(`${findings.has(`d${number}`) ? 'f' : 'i'}${number}`),
    ),
  )
  const question = state.ledger.items.find(item => item.kind === 'question')!
  question.options = ['Pinch', 'Flick', 'Tap', 'Voice', 'Gaze', 'Automatic']
  question.optionDescriptions = {
    ...question.optionDescriptions,
    Tap: 'Tap the frame.',
    Voice: 'Say **dismiss**.',
    Gaze: 'Look away.',
    Automatic: 'Wait for the glance to expire.',
  }
  const task = state.ledger.items.find(item => item.id === 'i14')!
  task.helps.push({ kind: 'link', url: 'https://example.com/inbox-check', name: 'pairing guide' })
  for (const view of Object.values(state.prViews.views)) view.fetchedAt ??= now
  return state
}
