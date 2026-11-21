import type { Cursor, Ledger, Session, Tab } from '../../types'
import { isDemoCopy } from '../../core/view/demo'
import { EMPTY } from '../../core/domain/ledger'
import { withLostSendsUncertain } from './mod-delivery'
import { NO_OLD_PR_VIEWS, NO_OLD_PRESENCE, sessionFromOldFields } from './mod-old-fields'
import type { Mod, OldFields, OldKey } from './mod-ports'
import type { ModSession } from './mod-sessions'
import { paneState } from './mod-state'
import { lookConfigOf, type OldPaneFields, uiFromOldFields } from './mod-ui'
import { type SavedSession, upgradeSession } from '../../core/view/session-files'

type UpgradeCalls = Pick<Mod, 'atoms' | 'writeSession' | 'clock' | 'conversation'>

/** What each key an older build kept read as while that build wrote nothing there. */
const OLD_INITIAL: OldFields = {
  ledger: EMPTY,
  presence: NO_OLD_PRESENCE,
  prViews: NO_OLD_PR_VIEWS,
  stop: null,
  lastActions: {},
  sent: [],
  untrackedSent: [],
  tab: 'needsYou',
  page: null,
  selection: {} as Record<Tab, Cursor>,
  statusSelection: null,
  typing: null,
  drafts: {},
  discarded: {},
  shown: null,
  notes: {},
  unfolded: [],
  closedAll: [],
  statusUnfolded: [],
  optionsShown: [],
  isHelpShown: false,
}

async function readOld<K extends OldKey>(m: UpgradeCalls, key: K): Promise<OldFields[K]> {
  const { value } = await m.atoms.old[key]()

  return value === undefined ? OLD_INITIAL[key] : value
}

/** The session as an older build left it in its separate fields, for a hot reload into this build. */
async function fromOldFields(m: UpgradeCalls): Promise<Session> {
  const [id, ledger, presence, prViews, stop, lastActions, sent, untracked] = await Promise.all([
    m.conversation.id(),
    readOld(m, 'ledger'),
    readOld(m, 'presence'),
    readOld(m, 'prViews'),
    readOld(m, 'stop'),
    readOld(m, 'lastActions'),
    readOld(m, 'sent'),
    readOld(m, 'untrackedSent'),
  ])
  await m.atoms.away.update(() => ({
    lastActiveAt: presence.lastActiveAt,
    isAway: presence.isAway,
    minute: presence.minute,
  }))

  return sessionFromOldFields(id, { ledger, presence, prViews, stop, lastActions, sent, untracked })
}

/** Brings the drawn session to the current shape. */
async function upgradeDrawn(m: UpgradeCalls): Promise<ModSession> {
  const written = await m.atoms.writtenSession()
  const base = written === undefined ? await fromOldFields(m) : upgradeSession(written as SavedSession)

  return m.writeSession(cur => {
    const s = written === undefined ? base : upgradeSession(cur as SavedSession)

    return { ...withLostSendsUncertain(s), revision: (cur.revision ?? 0) + 1 }
  })
}

/** Moves the pane's state from the separate fields of a build before the shared controller into `UI`, once. */
async function upgradePane(m: UpgradeCalls) {
  if ((await m.atoms.ui.read()) !== null) return
  const [
    tab,
    page,
    selection,
    statusSelection,
    typing,
    drafts,
    discarded,
    shown,
    notes,
    unfolded,
    closedAll,
    statusUnfolded,
    optionsShown,
    isHelpShown,
    now,
  ] = await Promise.all([
    readOld(m, 'tab'),
    readOld(m, 'page'),
    readOld(m, 'selection'),
    readOld(m, 'statusSelection'),
    readOld(m, 'typing'),
    readOld(m, 'drafts'),
    readOld(m, 'discarded'),
    readOld(m, 'shown'),
    readOld(m, 'notes'),
    readOld(m, 'unfolded'),
    readOld(m, 'closedAll'),
    readOld(m, 'statusUnfolded'),
    readOld(m, 'optionsShown'),
    readOld(m, 'isHelpShown'),
    m.clock.now(),
  ])
  const old: OldPaneFields = {
    tab,
    page,
    selection,
    statusSelection,
    typing,
    drafts,
    discarded,
    shown,
    notes,
    unfolded,
    closedAll,
    statusUnfolded,
    optionsShown,
    isHelpShown,
  }
  await m.atoms.ui.update(ui => ui ?? uiFromOldFields(old, lookConfigOf(paneState.paneLook), now))
}

/** A reload keeps $.state, so a running session can still hold its parts in the separate fields of an older build. */
export async function upgradeState(m: UpgradeCalls): Promise<Ledger> {
  const [session] = await Promise.all([
    upgradeDrawn(m),
    upgradePane(m),
    // A demo an earlier build seeded may lack a field this one draws, so it ends; /inbox demo seeds a new one.
    m.atoms.demo.update(d => (d === null || isDemoCopy(d) ? d : null)),
  ])

  return session.ledger
}
