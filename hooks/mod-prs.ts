import { fetchPrs as fetchSessionPrs, isPrPollDue } from './host-prs'
import { isPrsTabShown } from './mod-drawn'
import type { Mod } from './mod-ports'
import { isPrFetchBusy, queuePrFetch } from './mod-pr-queue'
import { commitLedger } from './mod-session-write'
import { currentOwner } from './mod-sessions'
import { mod } from './mod-state'
import type { FetchAsk } from './pr-fetch'
import { withNewPrRefs } from './session-turns'

type PrCalls = Pick<
  Mod,
  | 'atoms'
  | 'clock'
  | 'pane'
  | 'saves'
  | 'history'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

/**
 * Call it before the tab draws: it marks the fetch first, so the tab opens on
 * "Checking for PRs…" and not on "No PRs".
 */
export async function findPrs(m: PrCalls) {
  if (await m.atoms.demo.read()) return
  await markFetching(m, true)
  void m.fetchPrs(true)
}

export async function linkPrs(m: PrCalls, refs: string[]) {
  if (refs.length === 0) return
  const linked = (await m.atoms.session.read()).ledger.prs
  if (refs.every(r => linked.includes(r))) return
  await commitLedger(m, l => withNewPrRefs(l, refs))
  void m.fetchPrs(await isPrsTabShown(m))
}

/** Marks whether a PR fetch runs, which the PRs tab shows. */
function markFetching(m: PrCalls, isFetching: boolean) {
  return m.commit(currentOwner(), s =>
    s.prViews.isFetching === isFetching ? s : { ...s, prViews: { ...s.prViews, isFetching } },
  )
}

export function fetchPrs(m: PrCalls, findsBranchPr: boolean, isPress = false): Promise<void> {
  return queuePrFetch(findsBranchPr, isPress, ask => fetchPrsNow(m, ask))
}

async function fetchPrsNow(m: PrCalls, ask: FetchAsk) {
  const owner = currentOwner()
  try {
    await markFetching(m, true)
    await fetchSessionPrs(m.hostOf(owner), ask.findsBranchPr, ask.isPress)
  } finally {
    mod.prFetchEndedAt = await m.clock.now()
    // Fetches run one at a time across conversations, so the drawn session reads whether one still runs.
    await markFetching(m, mod.nextFetch !== null)
  }
  void m.sendUi(['read']).catch(() => undefined)
}

export async function pollPrs(m: PrCalls, remote = false) {
  const [away, session, isTabShown, now] = await Promise.all([
    m.atoms.away.read(),
    m.atoms.session.read(),
    isPrsTabShown(m),
    m.clock.now(),
  ])
  const poll = {
    lastFetchedAt: mod.prFetchEndedAt,
    now,
    isTabShown: isTabShown || remote,
    isAway: away.isAway && !remote,
  }
  const isFetching = isPrFetchBusy()
  if (isPrPollDue({ ...session, prViews: { ...session.prViews, isFetching } }, poll)) await m.fetchPrs(poll.isTabShown)
}
