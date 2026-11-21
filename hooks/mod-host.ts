import type { UiPressArgument } from 'claude-code'

import type { Session } from '../types'
import { scrollFailure } from './explanation-reply'
import { ghIn } from './gh'
import { callReport, MODEL } from './inbox-model'
import { isGhUnstartable, pathProbe, runOf, sessionFolder } from './mod-commands'
import { settleRewrite, stored } from './mod-delivery'
import { comparePagePath } from './mod-plugin-files'
import type { Mod } from './mod-ports'
import { prSharedStore } from './mod-pr-shared'
import { readDurableSession, readSettledSession } from './mod-saves'
import { changeSession } from './mod-session-write'
import { isCurrent, type Owner, updating } from './mod-sessions'
import { openTarget } from './open-targets'
import { COPY_FAILURES } from './pane-keys'
import { isCompareInBackground } from './press-messages'
import type { Effect } from './press-reducer'
import { upgradeSession } from './session-files'
import type { Ask, SessionHost } from './session-host'
import type { SendOutcome } from './session-presses'
import { SETTLED_MS } from './timing'

type HostCalls = Pick<
  Mod,
  | 'atoms'
  | 'writeSession'
  | 'clock'
  | 'pane'
  | 'conversation'
  | 'model'
  | 'saves'
  | 'history'
  | 'commands'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'fetchPrs'
>

/** Calls the inbox model, reports the call, and returns the answer. */
export async function askInboxModel(
  m: HostCalls,
  prompt: string,
  system: string,
  timeoutMs: number,
  report: Parameters<Ask>[3],
): Promise<string | null> {
  const r = await m.model.complete({
    model: MODEL,
    system: [{ text: system, cache: true }],
    prompt,
    maxTokens: 1600,
    effort: 'low',
    timeoutMs,
  })
  report?.(callReport(r, MODEL))
  return r.isAnswered ? r.text : null
}

async function perform(
  m: HostCalls,
  effect: Extract<Effect, { kind: 'open' | 'copy' | 'scroll' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (effect.kind === 'scroll') {
      const r = await m.pane.scrollConversation(effect.requestId)
      return r.deny === undefined ? null : scrollFailure(r.deny)
    }
    if (effect.kind === 'open') {
      const calls = m.commands
      const [home, folder] = await Promise.all([calls.home(), sessionFolder(calls)])
      return await openTarget(runOf(calls), pathProbe(calls), effect.target, folder ?? '', home ?? '')
    }
    const r = await m.pane.copy(effect.text, surface)
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Sends a message as the person's own prompt. Claude Code may store its row before `$.prompt.submit` returns, as
 * the mod's `session.append` handler sees, and another plugin may rewrite it.
 */
export async function deliver(m: HostCalls, owner: Owner, text: string, deliveryId: string): Promise<SendOutcome> {
  if (!isCurrent(owner)) return { state: 'rejected', reason: 'the conversation changed first' }
  const since = stored.count
  type Submitted = { entered: string } | { notSent: string }
  const sent = await m.conversation.submit(text).then(
    (r): Submitted => (r.drop === undefined ? { entered: r.text } : { notSent: r.drop }),
    (err: unknown): Submitted =>
      (stored.at.get(text) ?? 0) > since
        ? { entered: text }
        : { notSent: (err instanceof Error ? err.message : String(err)) || 'the session refused it' },
  )
  if ('notSent' in sent) return { state: 'rejected', reason: sent.notSent }
  const entered = sent.entered
  if (entered === text) return { state: 'accepted', queuedId: null }
  let outcome: SendOutcome = { state: 'accepted', queuedId: null, entered }
  const { heldRows } = await m.atoms.session.read()
  await changeSession(
    m,
    owner,
    s => {
      const settled = settleRewrite(s, deliveryId, text, entered, since)
      outcome = settled?.outcome ?? { state: 'accepted', queuedId: null, entered }
      return settled?.state ?? s
    },
    new Set(heldRows),
  )

  return outcome
}

/** The mod's SessionHost for the conversation `owner`, with copies going to `surface`. */
function sessionHost(
  m: HostCalls,
  owner: Owner,
  opts: {
    /** Changes the session, with what the drawing does after each write. */
    update: SessionHost<Session>['update']
    surface?: UiPressArgument['surface']
    settleWindowMs: number
    onGhMissing: (isMissing: boolean) => void
    /** Fetches the session's PRs, and resolves once that fetch ends. */
    refreshPrs: () => Promise<void>
  },
): SessionHost<Session> {
  // gh is taken to start until a run fails. Then `find` asks it for its version, which only an unstartable gh refuses.
  let ghFound: string | null | undefined = 'gh'

  return {
    now: () => m.clock.now(),
    read: async () => {
      if (isCurrent(owner)) return upgradeSession(await m.atoms.session.read())
      return readSettledSession(m.saves, owner.id)
    },
    readDurable: () => readDurableSession(m.saves, owner.id),
    update: opts.update,
    exclusive: fn => updating.run(owner.id, fn),
    ask: (prompt, system, _kind, report) => askInboxModel(m, prompt, system, 45_000, report),
    deliver: (_s, text, deliveryId) => deliver(m, owner, text, deliveryId),
    isDeliveryHeldUntilRun: true,
    perform: async (_s, effect) => (opts.surface ? perform(m, effect, opts.surface) : COPY_FAILURES['no-surface']),
    refreshPrs: opts.refreshPrs,
    gh: {
      shared: prSharedStore(m.saves),
      find: async () => {
        if (ghFound === undefined) ghFound = (await isGhUnstartable(m.commands)) ? null : 'gh'
        return ghFound
      },
      forget: () => {
        ghFound = undefined
      },
      run: (_s, _bin, onUnstartable) => async args =>
        ghIn(runOf(m.commands), 'gh', (await sessionFolder(m.commands)) ?? '', onUnstartable)(args),
      noteMissing: opts.onGhMissing,
    },
    settleWindowMs: opts.settleWindowMs,
    comparePage: comparePagePath(m.pluginRoot),
    compareInBackground: isCompareInBackground('claude-code'),
    newId: () => crypto.randomUUID(),
  }
}

/** The mod's SessionHost for `owner`'s conversation. A press passes its surface, which copies go to. */
export function hostOf(m: HostCalls, owner: Owner, surface?: UiPressArgument['surface']): SessionHost<Session> {
  return sessionHost(m, owner, {
    update: change => m.commit(owner, change),
    surface,
    settleWindowMs: SETTLED_MS,
    onGhMissing: isGhMissing =>
      void m
        .commit(owner, s =>
          s.prViews.isGhMissing === isGhMissing ? s : { ...s, prViews: { ...s.prViews, isGhMissing } },
        )
        .catch(() => undefined),
    refreshPrs: () => m.fetchPrs(true, true),
  })
}
