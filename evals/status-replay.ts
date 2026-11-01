import { childStarted, childWorked } from '../hooks/children'
import { EMPTY, upgradeLedger } from '../hooks/ledger'
import { applyExchangeUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { buildPrompt, systemText } from '../hooks/ledger-prompt'
import { CLAUDE_CODE } from '../hooks/model-text'
import { STATUS_SYSTEM } from '../hooks/status-prompt'
import { screenText } from '../hooks/inbox-text'
import type { StatusCallInput } from '../hooks/status-prompt'
import { askStatus, parseStatus } from '../hooks/status'
import { childEnded, lookEnded, lookStarted } from '../hooks/status-children'
import { emptySession } from '../hooks/session-files'
import { appliedStatus, failedStatus } from '../hooks/session-status'
import { statusCallPrompt } from '../hooks/status-records'
import type { StatusExchange, StatusRecord } from '../hooks/status-records'
import { statusPage } from '../hooks/status-page'
import { goalPressed } from '../hooks/goal-press'
import { GOAL_KEYS_ID } from '../hooks/status-keys'
import type { RowPress } from '../hooks/presses'
import type { StatusPage } from '../hooks/status-page'
import { CODEX } from '../codex/src/texts'
import type { ChildKind, Exchange, HostTask, Item, Ledger, Place, Session } from '../types'
import { factsAfter } from './status-facts'
import type { Facts, FactsChange } from './status-facts'
import type { JudgeCheckId } from './status-judge'
import { pageText } from './status-page-text'

/** Something a host reports between calls, which the replay runs through the host's own reducers. */
export type HostEvent =
  | { child: 'start'; ref: string; kind: ChildKind; name: string; reportsActivity?: boolean }
  | { child: 'act'; ref: string }
  | { child: 'end'; ref: string }
  /** The person shows the Status tab for this many seconds. */
  | { look: number }
  /** An ask opens or closes, in a replay that runs no ledger call. */
  | { askOpens: { id: string; ask: string; kind?: Item['kind']; options?: string[] } }
  | { askCloses: string }
  /** The person presses Set as goal or Not now on the proposal, or types a goal, through the host's own press. */
  | { press: 'use-goal' | 'decline-goal' }
  | { press: 'type'; text: string }

/** The Status call a step runs, and what it reads. */
export type StepCall =
  | { kind: 'reply'; person: string | null; activity: string[]; reply: string; tasks?: HostTask[] }
  /** A call during a turn that started `turnStartedAt` minutes into the replay. */
  | { kind: 'mid-turn'; person: string | null; activity: string[]; turnStartedAt: number; tasks?: HostTask[] }
  | { kind: 'catch-up'; conversation: string }
  /** A recorded call's exchange and task list, read as they were. */
  | { kind: 'recorded'; read: StatusExchange; tasks: HostTask[] }

export type Step = {
  label: string
  /** Minutes since the replay started. Each step is later than the one before. */
  at: number
  /** The step's exact time, in place of `at`, for a step from a call record. */
  time?: number
  /** Host events, run at `at` before the call. */
  events?: HostEvent[]
  call?: StepCall
  facts?: FactsChange
  /** The judge reads the page after this step. */
  checkpoint?: boolean
  /** The rule or judge check ids of the failure this step was written to reproduce. */
  targets?: string[]
  /** Judge checks this step fails until an issue is built, as a rule's `until` does for a rule. */
  judgeUntil?: Partial<Record<JudgeCheckId, string>>
}

export type Replay = {
  name: string
  about: string
  /** Each reply runs the ledger call, then the Status call, as the product does. Else the steps open and close asks. */
  hasLedgerCalls: boolean
  /** A short case: it runs 5 times per model, and each model's runs are judged apart. Else 3 runs, judged together. */
  isShort?: true
  start: { ledger: Partial<Ledger>; facts: Facts; place?: Place }
  steps: Step[]
}

export type Agent = 'claude' | 'codex'

export type CallAnswer = { text: string | null; model?: string | null; outputTokens?: number | null }

/** One model call with `system` as its system text. `kind` says which of the inbox model's calls it is. */
export type ModelCall = (prompt: string, system: string, kind: CallLog['kind']) => Promise<CallAnswer>

/** A host's limits on an inbox model call. An answer past them is dropped, as the host drops it. */
export type Limits = { ms: number; outputTokens: number | null }

export const LIMITS: Record<Agent, Limits> = {
  claude: { ms: 45_000, outputTokens: 1600 },
  codex: { ms: 120_000, outputTokens: null },
}

export type ReplayDeps = {
  agent: Agent
  ask: ModelCall
  clock?: () => number
  /** The Status call's system text in place of `STATUS_SYSTEM`, as for a copy without one of the goal's rules. */
  system?: string
}

/** What one model call of a step did. */
export type CallLog = {
  kind: 'ledger' | 'status'
  answers: (string | null)[]
  model: string | null
  ms: number
  outputTokens: number | null
  /** Why the host would have dropped the answer, when it would. */
  overLimit: string | null
}

export type StepResult = {
  index: number
  label: string
  now: number
  session: Session
  page: StatusPage
  text: string
  facts: Facts
  calls: CallLog[]
  /** The Status call wrote nothing at this step. */
  isStatusFailed: boolean
}

/** When every replay starts. A fixed time, so a replay's prompts are the same from run to run. */
export const REPLAY_START = Date.UTC(2026, 9, 1, 9, 0)

export const minutes = (m: number) => REPLAY_START + m * 60_000

function itemOf(e: Extract<HostEvent, { askOpens: unknown }>['askOpens'], turn: number, at: number): Item {
  return {
    id: e.id,
    kind: e.kind ?? 'question',
    label: null,
    ask: e.ask,
    options: e.options ?? [],
    rec: null,
    helps: [],
    turn,
    at,
    from: 'record',
  }
}

function withEvent(s: Session, e: HostEvent, now: number): Session {
  const o = s.ledger.overview
  const withStatus = (overview: Ledger['overview']) => ({ ...s, ledger: { ...s.ledger, overview } })
  if ('child' in e) {
    if (e.child === 'start') return withStatus(childStarted(o, e, now, { reportsActivity: e.reportsActivity ?? true }))
    return withStatus(e.child === 'act' ? childWorked(o, e.ref, now) : childEnded(o, e.ref, now))
  }
  if ('look' in e) return withStatus(lookEnded(lookStarted(o, now), now + e.look * 1000))
  if ('press' in e) {
    const press: RowPress =
      e.press === 'type' ? { action: 'type', id: GOAL_KEYS_ID, text: e.text } : { action: e.press, id: GOAL_KEYS_ID }
    const r = goalPressed(s.ledger, press, kind => ({ kind, action: GOAL_KEYS_ID, text: e.press, at: now }), now)
    // A press on a proposal the model did not write finds nothing, as in the product; the step's rules report the miss.
    return 'stale' in r ? s : { ...s, ledger: r.ledger }
  }
  if ('askOpens' in e)
    return { ...s, ledger: { ...s.ledger, items: [...s.ledger.items, itemOf(e.askOpens, s.ledger.turn, now)] } }

  return { ...s, ledger: { ...s.ledger, items: s.ledger.items.filter(i => i.id !== e.askCloses) } }
}

async function timed(
  deps: ReplayDeps,
  kind: CallLog['kind'],
  prompt: string,
  system: string,
): Promise<CallAnswer & { log: CallLog }> {
  const clock = deps.clock ?? Date.now
  const started = clock()
  const answer = await deps.ask(prompt, system, kind)
  const ms = clock() - started
  const limits = LIMITS[deps.agent]
  const tokens = answer.outputTokens ?? null
  const overLimit =
    ms > limits.ms
      ? `took ${Math.round(ms / 1000)} s, past the host's ${limits.ms / 1000} s`
      : limits.outputTokens !== null && tokens !== null && tokens > limits.outputTokens
        ? `wrote ${tokens} tokens, past the host's ${limits.outputTokens}`
        : null
  const text = overLimit === null ? answer.text : null
  const log = { kind, answers: [answer.text], model: answer.model ?? null, ms, outputTokens: tokens, overLimit }

  return { ...answer, text, log }
}

/** Runs the Status call on `read`, and applies its answer or saves that it wrote nothing, as a host does. */
async function statusCall(
  deps: ReplayDeps,
  s: Session,
  read: StatusExchange,
  tasks: HostTask[],
  now: number,
): Promise<{ session: Session; log: CallLog; isFailed: boolean }> {
  const input: StatusCallInput = { last: s.ledger.overview, asks: s.ledger.items, tasks, now }
  const prompt = statusCallPrompt(input, read)
  const logs: CallLog[] = []
  const { last } = await askStatus(async () => {
    const answer = await timed(deps, 'status', prompt, deps.system ?? STATUS_SYSTEM)
    logs.push(answer.log)
    return answer
  })
  const log = {
    ...logs[logs.length - 1]!,
    answers: logs.flatMap(l => l.answers),
    ms: logs.reduce((n, l) => n + l.ms, 0),
  }
  const answer = last.text === null ? null : parseStatus(last.text)
  const turns = s.presence.turnsApplied
  const session =
    answer === null
      ? failedStatus(s, last.text, turns, now)
      : appliedStatus(s, answer, turns, now, input.last?.goal?.setAt ?? null)

  return { session, log, isFailed: answer === null }
}

function exchangeOf(call: Extract<StepCall, { kind: 'reply' }>, agent: Agent, turn: number): Exchange {
  return {
    person: call.person,
    trigger: null,
    activity: call.activity,
    reply: call.reply,
    turn,
    press: null,
    screen: screenText(agent === 'codex' ? CODEX : CLAUDE_CODE, false, null),
    tasks: call.tasks ?? [],
  }
}

/** The session a replay starts from. */
export function startSession(replay: Pick<Replay, 'start'>): Session {
  const base = emptySession()

  return {
    ...base,
    ledger: upgradeLedger({ ...EMPTY, ...replay.start.ledger } as Ledger),
    place: replay.start.place ?? null,
  }
}

/**
 * Runs one step: its host events, then its calls, then the page as it would draw at the step's time. A reply's ledger
 * call that gives no usable answer skips the Status call, as in the product.
 */
async function runStep(
  replay: Replay,
  deps: ReplayDeps,
  s: Session,
  step: Step,
  index: number,
  facts: Facts,
): Promise<StepResult> {
  const now = step.time ?? minutes(step.at)
  let session = (step.events ?? []).reduce((x, e) => withEvent(x, e, now), s)
  const calls: CallLog[] = []
  let isStatusFailed = false
  const call = step.call
  if (call?.kind === 'reply') {
    const turn = session.ledger.turn + 1
    const ex = exchangeOf(call, deps.agent, turn)
    let isLedgerApplied = true
    if (replay.hasLedgerCalls) {
      const host = deps.agent === 'codex' ? CODEX : CLAUDE_CODE
      const ledgerAnswer = await timed(deps, 'ledger', buildPrompt(session.ledger, ex), systemText(host))
      calls.push(ledgerAnswer.log)
      const parsed =
        ledgerAnswer.text === null ? null : parseReply(ledgerAnswer.text, `${ex.reply}\n${ex.activity.join('\n')}`)
      isLedgerApplied = parsed !== null
      if (parsed !== null) session = { ...session, ledger: applyExchangeUpdate(session.ledger, parsed, ex, now, now) }
    } else session = { ...session, ledger: { ...session.ledger, turn } }
    session = {
      ...session,
      presence: { ...session.presence, isTurnRunning: false, turnStartedAt: null, lastReplyAt: now },
    }
    if (isLedgerApplied) {
      const r = await statusCall(deps, session, { kind: 'reply', exchange: ex }, ex.tasks, now)
      ;({ session, isFailed: isStatusFailed } = r)
      calls.push(r.log)
    }
  } else if (call?.kind === 'mid-turn') {
    session = {
      ...session,
      presence: { ...session.presence, isTurnRunning: true, turnStartedAt: minutes(call.turnStartedAt) },
    }
    const turn = { person: call.person, trigger: null, activity: call.activity }
    const r = await statusCall(deps, session, { kind: 'mid-turn', turn }, call.tasks ?? [], now)
    ;({ session, isFailed: isStatusFailed } = r)
    calls.push(r.log)
  } else if (call?.kind === 'catch-up') {
    session = {
      ...session,
      presence: { ...session.presence, isTurnRunning: false, turnStartedAt: null, lastReplyAt: now },
    }
    const r = await statusCall(deps, session, { kind: 'catch-up', conversation: call.conversation }, [], now)
    ;({ session, isFailed: isStatusFailed } = r)
    calls.push(r.log)
  } else if (call?.kind === 'recorded') {
    const isTurnRunning = call.read.kind === 'mid-turn'
    session = { ...session, presence: { ...session.presence, isTurnRunning, lastReplyAt: isTurnRunning ? null : now } }
    const r = await statusCall(deps, session, call.read, call.tasks, now)
    ;({ session, isFailed: isStatusFailed } = r)
    calls.push(r.log)
  }
  const page = statusPage(session, now)

  return {
    index,
    label: step.label,
    now,
    session,
    page,
    text: pageText(page),
    facts: factsAfter(facts, step.facts),
    calls,
    isStatusFailed,
  }
}

/** Runs every step of `replay` in order, each on the session the step before left. */
export async function runReplay(replay: Replay, deps: ReplayDeps): Promise<StepResult[]> {
  const results: StepResult[] = []
  let session = startSession(replay)
  let facts: Facts = { ...replay.start.facts, changed: [] }
  for (const [index, step] of replay.steps.entries()) {
    const r = await runStep(replay, deps, session, step, index, facts)
    results.push(r)
    session = r.session
    facts = r.facts
  }

  return results
}

/**
 * A one-step replay that starts from a call record: the Status and asks the call read, and the exchange it read, at
 * the time it ran. Its facts are the author's, since a record holds only what the call saw.
 */
export function replayFromRecord(
  record: Pick<StatusRecord, 'input' | 'exchange'>,
  name: string,
  facts: { before: Facts; after: FactsChange },
): Replay {
  const { input, exchange } = record

  return {
    name,
    about: `Starts from a recorded ${exchange.kind} call.`,
    hasLedgerCalls: false,
    start: { ledger: { overview: input.last, items: [...input.asks] }, facts: facts.before },
    steps: [
      {
        label: 'the recorded call',
        at: (input.now - REPLAY_START) / 60_000,
        time: input.now,
        call: { kind: 'recorded', read: exchange, tasks: [...input.tasks] },
        facts: facts.after,
      },
    ],
  }
}
