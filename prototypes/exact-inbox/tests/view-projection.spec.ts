import { describe, expect, expectTypeOf, test } from 'bun:test'
import { closeItem } from '../../../core/domain/ledger-close'
import { REMOTE_ACTIONS } from '../../../core/remote/remote-commands'
import { NEEDS_YOU_MARKS } from '../../../core/view/help'
import { feedbackTone } from '../../../core/view/feedback'
import { HEAD_GAP_PT, LIST_GAP_PT, SECTION_GAP_PT } from '../../../core/view/layout'
import { rowMark, settledTone } from '../../../core/view/rows'
import { sessionView } from '../../../core/view/session-view'
import { milestoneRowPads, statusRowPads } from '../../../core/view/status-gaps'
import { textLevelOf } from '../../../core/view/status-page-parts'
import { workJoints } from '../../../core/view/status-path'
import { NO_HOLDS } from '../../../core/view/timing'
import { toneColors } from '../../../core/view/tones'
import type { Result } from '../app.contract'
import { clientSnapshot } from '../bridge/client-schema'
import { NO_VIEW_PREFERENCES } from '../bridge/collapse-view'
import { projectInbox } from '../bridge/inbox-projection'
import { projectPrs } from '../bridge/pr-view'
import { projectRowGroups } from '../bridge/row-view'
import type { AllowedAction } from '../bridge/row-view'
import { projectStatus } from '../bridge/status-view'
import { isSnapshot } from '../client-view'
import { fixtureSession } from '../tools/fixture-state'

const binding = {
  source: 'demo' as const,
  socket: '/fixture/core.sock',
  appHome: '/fixture/app',
  session: 'fixture',
  terminal: 't1',
}

async function makeFullSnapshot(now: number) {
  const state = fixtureSession(now)
  const projected = await projectInbox(
    binding,
    state,
    {
      sessionId: binding.session,
      agent: 'Claude',
      name: 'Fixture',
      connected: true,
      waiting: true,
      writtenAt: now,
      fetching: false,
      reliable: true,
      canPublish: true,
      durable: true,
      actions: REMOTE_ACTIONS,
    },
    now,
    NO_HOLDS,
    NO_VIEW_PREFERENCES,
  )
  const full: Result<'loadInbox'> = {
    ...projected.snapshot,
    connectionState: 'connected',
    key: 'fixture-key',
    readOnly: false,
    rowVersion: 'v1',
  }
  return { state, projected, full }
}

describe('schema=2 view projections', () => {
  test('projectRowGroups populates rowMark, hasTree, feedbackTone, button emphasis/out, and closed rows', async () => {
    const now = 1_700_000_000_000
    const base = fixtureSession(now)
    const questionWithTree = base.ledger.items.find(item => item.id === 'i11')!
    const questionWithoutTree = base.ledger.items.find(item => item.id === 'i15')!
    questionWithoutTree.context = undefined
    questionWithoutTree.earlier = undefined
    const settledTask = base.ledger.items.find(item => item.kind === 'task')!
    const settledQuestion = base.ledger.items.find(item => item.id === 'i12')!
    let ledger = closeItem(base.ledger, settledTask.id, { how: 'done', outcome: 'done' }, now - 5_000)
    ledger = closeItem(ledger, settledQuestion.id, { how: 'done', outcome: 'Pinch' }, now - 4_000)
    ledger = {
      ...ledger,
      closed: ledger.closed.map(c =>
        c.id === settledQuestion.id
          ? { ...c, doneNotification: { error: 'Host refused delivery', at: now - 3_500 } }
          : c.id === 'i6'
            ? { ...c, doneNotification: { error: 'Rejected', at: now - 120_000 } }
            : c,
      ),
    }
    const state = {
      ...base,
      ledger,
      presence: { ...base.presence, isTurnRunning: true, turnsStarted: base.presence.turnsStarted + 1 },
      lastActions: {
        ...base.lastActions,
        i13: {
          kind: 'talk' as const,
          action: 'explain',
          text: 'Explain',
          at: now - 1_000,
          turnsStarted: base.presence.turnsStarted + 1,
        },
      },
    }
    const view = sessionView(state, now, 60_000, { ...NO_HOLDS, shownSince: now - 60_000 })
    const allowed = new Map<string, AllowedAction>()
    const groups = projectRowGroups(binding, view, new Map(), allowed, REMOTE_ACTIONS, now)

    const askRows = groups.askGroups.flatMap(g => g.rows)
    const qTree = askRows.find(r => r.id === questionWithTree.id)!
    const qBare = askRows.find(r => r.id === questionWithoutTree.id)!
    const settledOk = askRows.find(r => r.id === settledTask.id)!
    const settledErr = askRows.find(r => r.id === settledQuestion.id)!
    const discussed = askRows.find(r => r.id === 'i13')!
    const openFinding = groups.findingGroups.flatMap(g => g.rows)[0]!

    const qTreeSource = view.needsYou.questions.find(r => r.id === questionWithTree.id)!
    const qBareSource = view.needsYou.questions.find(r => r.id === questionWithoutTree.id)!
    const openTask = askRows.find(r => r.kind === 'task' && r.state === 'open')!
    expect(groups.askGroups[0]!.mark).toBe(NEEDS_YOU_MARKS.question.mark)
    expect(qTree.mark).toBe(rowMark(qTreeSource)!.text)
    expect(qTree.mark).toBe('◆')
    expect(qTree.hasTree).toBe(true)
    expect(openTask.mark).toBe('□')
    expect(openTask.markTone).toBe('tasks')
    expect(qBare.mark).toBe(rowMark(qBareSource)!.text)
    expect(qBare.hasTree).toBe(false)
    expect(openFinding.mark).toBe('')
    expect(openFinding.hasTree).toBe(false)

    expect(settledOk.hasTree).toBe(false)
    expect(settledOk.feedbackTone).toBe(
      settledTone(view.needsYou.tasks.find(r => r.id === settledTask.id)!.state as never),
    )
    expect(settledOk.mark).toBe('✓')

    expect(settledErr.feedbackTone).toBe('error')
    expect(settledErr.markTone).toBe('errorMark')
    expect(settledErr.markColor).toContain(toneColors('errorMark').dark)

    const discussedSource = view.needsYou.questions.find(r => r.id === 'i13')!
    expect(discussed.feedbackTone).toBe(feedbackTone(discussedSource.feedback))
    const explainBtn = discussed.shownActions.find(b => b.label.startsWith('Explain'))!
    expect(explainBtn.out).toBe(true)
    expect(explainBtn.disabled).toBe(true)

    const pinches = qTree.options.find(o => o.label === 'Pinch')!
    expect(pinches.button.emphasis).toBe('primary')
    expect(pinches.button.primary).toBe(true)
    expect(pinches.button.out).toBe(false)
    const normalOption = qTree.options.find(o => o.label === 'Flick')!
    expect(normalOption.button.emphasis).toBe('normal')
    expect(normalOption.button.primary).toBe(false)
    expect(qTree.shownActions.find(b => b.label === 'Dismiss')?.emphasis).toBe('quiet')

    const reopenClosed = groups.askGroups.flatMap(g => g.closedAll).find(c => c.actions.length > 0)!
    expect(reopenClosed.mark).toBe('✕')
    expect(reopenClosed.tone).toBe('')
    expect(reopenClosed.color).toBe('-exact-secondary-label')
    expect(reopenClosed.actions[0]).toMatchObject({ emphasis: 'quiet', out: false, label: 'Reopen' })

    const doneClosed = groups.askGroups.flatMap(g => g.closedAll).find(c => c.id === 'i5')!
    expect(doneClosed.mark).toBe('✓')
    expect(doneClosed.tone).toBe('')
    expect(doneClosed.color).toBe('-exact-secondary-label')

    const errorClosed = groups.askGroups.flatMap(g => g.closedAll).find(c => c.id === 'i6')!
    expect(errorClosed.mark).toBe('')
    expect(errorClosed.tone).toBe('')
    expect(errorClosed.outcome).toContain('Not sent: Rejected')
  })

  test('projectStatus populates goal fields, pads, workJoints, fold state, and collapse transitions', () => {
    const now = 1_700_000_000_000
    const state = fixtureSession(now)
    const view = sessionView(state, now, 60_000)

    const open = projectStatus(view.statusPage, { folds: [], collapsed: [] })
    expect(open.statusHasGoal).toBe(true)
    expect(open.statusIsMet).toBe(false)
    expect(open.statusMark).toBe('')
    expect(open.statusHeadingActions.length).toBeGreaterThan(0)
    expect(open.statusOfferActions).toEqual([])
    expect(open.statusActions).toEqual([...open.statusHeadingActions, ...open.statusOfferActions])
    expect(open.statusHeadingActions.every(a => ['primary', 'normal', 'quiet'].includes(a.emphasis))).toBe(true)

    const metState = structuredClone(state)
    metState.ledger.overview!.goal!.metAt = now - 1_000
    metState.ledger.overview!.suggestedGoal = 'Ship beta tomorrow'
    const metView = sessionView(metState, now, 60_000)
    const met = projectStatus(metView.statusPage, { folds: [], collapsed: [] })
    expect(met.statusHasGoal).toBe(true)
    expect(met.statusIsMet).toBe(true)
    expect(met.statusMark).toBe(metView.statusPage.goal!.mark!.mark)
    expect(met.statusMarkColor).toContain(toneColors(metView.statusPage.goal!.mark!.tone).dark)
    expect(met.statusOffer).toContain('Ship beta tomorrow')
    expect(met.statusOfferActions.length).toBeGreaterThan(0)
    expect(met.statusActions).toEqual([...met.statusHeadingActions, ...met.statusOfferActions])

    const noGoalState = structuredClone(state)
    noGoalState.ledger.overview!.goal = null
    const noGoalView = sessionView(noGoalState, now, 60_000)
    const noGoal = projectStatus(noGoalView.statusPage, { folds: [], collapsed: [] })
    expect(noGoal.statusHasGoal).toBe(false)
    const headPart = noGoal.statusRows.find(r => r.kind === 'part' && r.isPartTitle)
    expect(headPart).toBeDefined()
    expect(headPart!.padTop).toBe(0)
    expect(headPart!.padBottom).toBeLessThanOrEqual(HEAD_GAP_PT)
    expect(headPart!.spaceAbove).toBe(0)

    const laterPart = open.statusRows.find(r => r.kind === 'part')!
    expect(laterPart.spaceAbove).toBeGreaterThanOrEqual(0)
    expect(laterPart.spaceAbove).toBeLessThanOrEqual(SECTION_GAP_PT)

    const parent = open.statusRows.find(r => r.kind === 'subject' && r.hasChildren)!
    const sourceParent = [
      ...view.statusPage.rows,
      ...(view.statusPage.goal?.milestones.flatMap(m => m.rows) ?? []),
    ].find(r => r.kind === 'subject' && r.id === parent.id)!
    expect(parent.foldCount).toBeGreaterThan(0)
    expect(parent.foldOpen).toBe(true)
    expect(parent.level).toBe(textLevelOf(sourceParent as never))

    const m2 = open.statusRows.find(r => r.kind === 'milestone' && r.id === 'm2')!
    expect(m2.pathLine).not.toBe('')
    expect(m2.isMutedName).toBe(false)
    const doneMilestone = view.statusPage.goal!.milestones.find(m => m.id === 'm2')!
    const expectedJoints = workJoints(doneMilestone.rows, doneMilestone.line)
    const m2Child = open.statusRows.find(r => r.kind === 'subject' && r.id === 's1')!
    const mPads = milestoneRowPads(doneMilestone, doneMilestone.rows)
    expect(m2Child.padTop).toBe(mPads[0]?.above ?? LIST_GAP_PT / 2)
    expect(m2Child.jointArm).toBe(expectedJoints[0]?.arm ?? '')
    expect(m2Child.jointBeside).toBe(expectedJoints[0]?.beside ?? '')

    const partList = view.statusPage.rows
    const listPads = statusRowPads(partList)
    expect(listPads.length).toBe(partList.length)

    const collapsed = projectStatus(view.statusPage, { folds: [], collapsed: [parent.id] })
    const collapsedParent = collapsed.statusRows.find(r => r.id === parent.id)!
    expect(collapsedParent.hasChildren).toBe(false)
    expect(collapsedParent.foldOpen).toBe(false)
    expect(collapsedParent.foldCount).toBe(parent.foldCount)
  })

  test('projectPrs sets number, isFirstBlock, and control emphasis/out including settled Undo', async () => {
    const now = 1_700_000_000_000
    const base = fixtureSession(now)
    const firstPr = base.prViews.views['acme/visor#33']!
    const state = {
      ...base,
      ledger: {
        ...base.ledger,
        prs: base.ledger.prs.filter(ref => ref !== firstPr.ref),
        items: base.ledger.items.map(i => ({ ...i, ask: i.ask.replace(/#33/g, ''), helps: [] })),
      },
      lastActions: {
        ...base.lastActions,
        [`pr:${firstPr.ref}`]: {
          kind: 'mark' as const,
          action: 'pr-dismiss',
          text: 'Dismissed',
          at: now - 2_000,
          turnsStarted: base.presence.turnsStarted,
        },
      },
    }
    const view = sessionView(state, now, 60_000, { ...NO_HOLDS, shownSince: now - 60_000 })
    const allowed = new Map<string, AllowedAction>()
    const pr = projectPrs(view, state.prViews, 'Claude', now, () => '', {
      binding,
      version: 'v1',
      versions: new Map(),
      allowed,
      actions: REMOTE_ACTIONS,
    })

    const blocks = pr.prLines.filter(line => line.kind === 'block')
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks[0]!.number).toBe(`#${view.prs.drawn[0]!.pr.number}`)
    expect(blocks[0]!.isFirstBlock).toBe(true)
    expect(blocks[1]!.isFirstBlock).toBe(false)
    expect(blocks[1]!.number).toBe(`#${view.prs.drawn[1]!.pr.number}`)

    const settledBlock = blocks.find(b => b.id === `pr:${firstPr.ref}`)!
    expect(settledBlock.controls).toHaveLength(1)
    expect(settledBlock.controls[0]).toMatchObject({ label: 'Undo', emphasis: 'normal', out: false })

    const heldExpiredState = {
      ...state,
      lastActions: {
        ...state.lastActions,
        'acme/visor#31 thread DT1': {
          kind: 'talk' as const,
          action: 'thread-discuss',
          text: 'Discuss',
          at: now - 3_000,
          turnsStarted: base.presence.turnsStarted,
        },
      },
    }
    const expiredPr = projectPrs(
      sessionView(heldExpiredState, now, 500, { ...NO_HOLDS, shownSince: now - 60_000 }),
      state.prViews,
      'Claude',
      now,
      () => '',
      {
        binding,
        version: 'v1',
        versions: new Map(),
        allowed: new Map(),
        actions: REMOTE_ACTIONS,
      },
    )
    const expiredBlock = expiredPr.prLines.find(b => b.id === `pr:${firstPr.ref}`)!
    expect(expiredBlock.controls[0]).toMatchObject({ label: 'Undo', emphasis: 'normal', out: true, disabled: true })

    const activePr = blocks[0]!
    expect(activePr.controls.every(c => ['primary', 'normal', 'quiet'].includes(c.emphasis))).toBe(true)
    const fixButton = pr.prLines.flatMap(l => l.controls).find(c => c.emphasis === 'primary')
    expect(fixButton).toBeDefined()
    expect(fixButton!.primary).toBe(true)
    expect(fixButton!.out).toBe(false)
  })

  test('clientSnapshot preserves schema=2 fields and strips them for schema=1 or null while isSnapshot accepts schema=2', async () => {
    const now = 1_700_000_000_000
    const { full } = await makeFullSnapshot(now)

    expect(isSnapshot(full)).toBe(true)
    expectTypeOf(full).toEqualTypeOf<Result<'loadInbox'>>()

    const v2 = clientSnapshot(full, '2')
    expect(v2).toBe(full)

    const v1 = clientSnapshot(full, '1') as Record<string, unknown>
    const legacy = clientSnapshot(full, null) as Record<string, unknown>
    expect(v1).toEqual(legacy)

    expect('askGroups' in v1).toBe(false)
    expect('findingGroups' in v1).toBe(false)
    expect('prLines' in v1).toBe(false)
    expect('statusHeadingActions' in v1).toBe(false)
    expect('statusOfferActions' in v1).toBe(false)
    expect('statusActions' in v1).toBe(false)

    const v1Asks = v1.asks as Record<string, unknown>[]
    expect(v1Asks.length).toBeGreaterThan(0)
    expect('hasTree' in v1Asks[0]!).toBe(false)
    expect('feedbackTone' in v1Asks[0]!).toBe(false)
    const v1Buttons = v1Asks[0]!.actions as Record<string, unknown>[]
    expect(v1Buttons.length).toBeGreaterThan(0)
    expect('emphasis' in v1Buttons[0]!).toBe(false)
    expect('out' in v1Buttons[0]!).toBe(false)
    expect('primary' in v1Buttons[0]!).toBe(true)

    const v1StatusRows = v1.statusRows as Record<string, unknown>[]
    expect(v1StatusRows.length).toBeGreaterThan(0)
    expect(Object.keys(v1StatusRows[0]!).sort()).toEqual(['depth', 'detail', 'id', 'mark', 'title'])
    expect(v1.questionCount).toBe(full.questionCount)
    expect(v1.taskCount).toBe(full.taskCount)
  })
})
