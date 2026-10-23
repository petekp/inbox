import { CLAUDE_CODE } from '../hooks/model-text'
import { endTurn, notePrompt, recorded, sessionView } from '../hooks/session'
import type { Session } from '../hooks/session'
import { orderedKeys, press, runUpdates } from '../hooks/session-host'
import type { Ask, SessionHost, UpdateHost } from '../hooks/session-host'
import type { Host } from '../hooks/model-text'
import { allRows, NO_HOLDS } from '../hooks/view'
import type { Effect } from '../hooks/presses'

export type ScriptedHost<S extends Session = Session> = {
  host: SessionHost<S> & Pick<UpdateHost<S>, 'inOrder'> & { names: Host }
  delivered: string[]
  performed: Exclude<Effect, { kind: 'send' }>[]
}

export type MakeHost<S extends Session = Session> = (ask: Ask) => ScriptedHost<S>

export function fakeHostWith<S extends Session>(
  storage: Pick<SessionHost<S>, 'read' | 'update' | 'exclusive'>,
): MakeHost<S> {
  return ask => {
    let clock = 1_000_000
    let ids = 0
    const order = orderedKeys()
    const delivered: string[] = []
    const performed: Exclude<Effect, { kind: 'send' }>[] = []
    const host: SessionHost<S> & Pick<UpdateHost<S>, 'inOrder'> & { names: Host } = {
      ...storage,
      names: CLAUDE_CODE,
      inOrder: fn => order.run('session', fn),
      now: () => (clock += 10),
      ask,
      deliver: async (_s, text) => {
        delivered.push(text)
        return { state: 'accepted', queuedId: null }
      },
      perform: async (_s, effect) => {
        performed.push(effect)
        return null
      },
      gh: {
        find: async () => null,
        forget: () => {},
        run: () => async () => ({ exitCode: 1, stdout: '', stderr: '' }),
        noteMissing: () => {},
      },
      settleWindowMs: 1000,
      newId: () => `id${++ids}`,
    }
    return { host, delivered, performed }
  }
}

export type Equal = (actual: unknown, expected: unknown, label: string) => void

const SETTLE_WINDOW_MS = 1000

const MODEL_ANSWER = ['NEW: decide | 1 | Use Node or Python? | Node / Python | Node'].join('\n')

export async function runSessionScript<S extends Session>(makeHost: MakeHost<S>, equal: Equal): Promise<void> {
  const { host, delivered, performed } = makeHost(async () => MODEL_ANSWER)
  const snapshot = async () => {
    const s = await host.read()
    const view = sessionView(s, await host.now(), SETTLE_WINDOW_MS, true)

    return {
      rows: allRows(view).map(r => `${r.title}: ${r.state.is}`),
      lastDeliveries: Object.fromEntries(
        Object.entries(view.lastActions).map(([id, last]) => [id, last.delivery?.state ?? null]),
      ),
      turns: view.turns,
      pending: s.pending.length,
      sent: s.sent.map(x => `${x.phase}: ${x.text}`),
      delivered,
      performed,
    }
  }
  const idOf = async (kind: 'question' | 'task') => (await host.read()).ledger.items.find(i => i.kind === kind)!.id
  const ANSWER = 'Re "Use Node or Python?": Node'
  const base = { lastDeliveries: {}, pending: 0, sent: [] as string[], delivered: [] as string[], performed: [] }

  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add a greeting CLI', false).state)
  equal(await snapshot(), { ...base, rows: [], turns: { turnsStarted: 1, turnsApplied: 0 } }, 'after the prompt')

  let toolAnswer = ''
  await host.update(async s => {
    const r = recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Try the CLI by hand' }, await host.now())
    toolAnswer = r.result
    return r.state
  })
  equal(toolAnswer, 'Recorded. The user sees it in the /inbox pane.', 'the record call answer')
  equal(
    await snapshot(),
    { ...base, rows: ['Try the CLI by hand: open'], turns: { turnsStarted: 1, turnsApplied: 0 } },
    'after the record call',
  )

  await host.update(s => endTurn(CLAUDE_CODE, s, 'Plan written. Which runtime?', false))
  equal(
    await snapshot(),
    { ...base, rows: ['Try the CLI by hand: open'], pending: 1, turns: { turnsStarted: 1, turnsApplied: 0 } },
    'after the turn ends',
  )

  await runUpdates(host)
  equal(
    await snapshot(),
    {
      ...base,
      rows: ['Use Node or Python?: open', 'Try the CLI by hand: open'],
      turns: { turnsStarted: 1, turnsApplied: 1 },
    },
    'after the inbox model answers',
  )

  const questionId = await idOf('question')
  const answered = await press(host, { action: 'answer', id: questionId, option: 'Node' }, false, NO_HOLDS)
  equal(
    answered,
    { copy: null, error: null, note: null, isUnconfirmed: false, isRowFailed: false, wakesForDone: false },
    'the answer press',
  )
  equal(
    await snapshot(),
    {
      ...base,
      rows: ['Use Node or Python?: settled', 'Try the CLI by hand: open'],
      lastDeliveries: { [questionId]: 'queued' },
      sent: [`accepted: ${ANSWER}`],
      delivered: [ANSWER],
      turns: { turnsStarted: 1, turnsApplied: 1 },
    },
    'after the press sends',
  )

  await host.update(s => notePrompt(CLAUDE_CODE, s, delivered[0]!, false).state)
  equal(
    await snapshot(),
    {
      ...base,
      rows: ['Use Node or Python?: settled', 'Try the CLI by hand: open'],
      lastDeliveries: { [questionId]: 'arrived' },
      delivered: [ANSWER],
      turns: { turnsStarted: 2, turnsApplied: 1 },
    },
    'after the message arrives',
  )

  const taskId = await idOf('task')
  const done = await press(host, { action: 'done', id: taskId }, false, NO_HOLDS)
  equal(done.wakesForDone, true, 'Done asks for a wake')
  const undone = await press(host, { action: 'undo', id: taskId }, false, NO_HOLDS)
  equal(undone.note, null, 'Undo on the task')
  equal((await snapshot()).rows, ['Use Node or Python?: settled', 'Try the CLI by hand: open'], 'after Undo')
  const undoneAnswer = await press(host, { action: 'undo', id: questionId }, false, NO_HOLDS)
  equal(undoneAnswer.note, 'stale', 'Undo on a row the agent already has')
  equal((await snapshot()).delivered, [ANSWER], 'Undo sends nothing')
}
