import { expect, mock, test } from 'claude-code/testing'
import type { LinksProps } from '../hooks/links-client'
import type { TabsProps } from '../hooks/tabs-client'
import { demoView } from '../hooks/demo'
import { emptySession } from '../hooks/session-files'
import { checkActions, prBlockActions, threadActions } from '../hooks/pr-tab'
import { prCheckId, prThreadId, threadSentIn } from '../hooks/pr-rows'
import { failingChecks, waitingThreads } from '../hooks/prs'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { inboxView, perTurnStatus } from '../hooks/view'
import { statusPage } from '../hooks/status-page'
import { rowKeyPlan } from '../hooks/action-plan'
import { statusKeyPlan, statusKeyRows } from '../hooks/status-keys'
import { shownTabs } from '../hooks/tabs'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

const inOrder = (drawn: string[], plan: string[]) => {
  let at = 0
  for (const label of plan) {
    at = drawn.indexOf(label, at)
    if (at === -1) return false
    at++
  }
  return true
}

test('no two buttons on a row share a hotkey, for every row kind in the demo', async () => {
  const { ledger, lastActions, notes, turns, prViews } = demoView(1_000_000, 'Claude')
  const view = inboxView({
    ledger,
    lastActions,
    notes,
    turns,
    extraSteps: {},
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus({ isUpdating: false, isFailed: false, retries: true }),
    replies: {},
    discarded: {},
    shownSince: 1_000_000,
    lastTypedMessageAt: null,
    now: 1_000_000,
  })
  const itemRows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows].map(row => {
    const { keys, more } = rowKeyPlan(row, true)
    return {
      id: row.id,
      type: row.type,
      hotkeys: [...keys, ...more].flatMap(k => ('hotkey' in k && k.hotkey !== undefined ? [k.hotkey] : [])),
    }
  })
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now: 1_000_000 }
  const prRows = Object.values(prViews.views).flatMap(pr => [
    { id: `PR #${pr.number}`, actions: prBlockActions(pr, isSent, prViews.branchRef, presses) },
    ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), actions: threadActions(pr, t, presses) })),
    ...failingChecks(pr).map(c => ({ id: prCheckId(pr, c), actions: checkActions(pr, c, presses) })),
  ])
  const rows = [
    ...itemRows,
    ...prRows.map(r => ({ id: r.id, hotkeys: r.actions.flatMap(a => (a.hotkey ? [a.hotkey] : [])) })),
  ]
  expect(new Set(itemRows.map(r => r.type))).toEqual(new Set(['question', 'task', 'finding']))
  expect(prRows.length).toBeGreaterThan(1)
  for (const row of rows) expect(row.hotkeys, row.id).toEqual([...new Set(row.hotkeys)])
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, every row in the demo, on every tab, draws its plan’s buttons in the plan’s order in the terminal and desktop looks, under the build’s tabs`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.files = isNextBuild ? ['/.next-build'] : []
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'inbox', args: 'demo' } as never)

    const { ledger, lastActions, notes, turns, prViews } = demoView(1_000_000, 'Claude')
    const view = inboxView({
      ledger,
      lastActions,
      notes,
      turns,
      extraSteps: {},
      settleWindowMs: SETTLED_MS,
      status: perTurnStatus({ isUpdating: false, isFailed: false, retries: true }),
      now: 1_000_000,
      replies: {},
      discarded: {},
      shownSince: 1_000_000,
      lastTypedMessageAt: null,
    })
    const TITLE_START = 20
    const expectedLabels = (row: (typeof view.findings.rows)[number]) => {
      const { keys, more } = rowKeyPlan(row, true)
      return [...keys, ...more].flatMap(k => {
        if (k.slot === 'retry') return ['Try again']
        if (k.slot === 'allOptions') return []
        return [k.action.label]
      })
    }
    const tabs = [
      {
        id: 'needsYou',
        rows: [...view.needsYou.questions, ...view.needsYou.tasks].filter(r => r.state.is !== 'settled'),
      },
      { id: 'findings', rows: view.findings.rows.filter(r => r.state.is !== 'settled') },
    ] as const
    expect(tabs.map(t => t.rows.length > 0)).toEqual([true, true])

    for (const look of ['terminal', 'desktop'] as const) {
      const pane =
        look === 'terminal'
          ? await $.ui.mount(PANE)
          : await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
      const drawnTabs =
        look === 'terminal'
          ? (await pane.findAll({ type: 'Button' }))
              .filter(b => (b.key ?? '').startsWith('tab-key-'))
              .map(b => [(b.key ?? '').slice('tab-key-'.length), b.props.hotkey])
          : ((await pane.find({ key: 'tabs' }))?.props.props as TabsProps).tabs.map(t => [t.id, undefined])
      expect(drawnTabs, `${look} tabs`).toEqual(
        shownTabs(isNextBuild).map(t => [t.id, look === 'terminal' ? t.hotkey : undefined]),
      )
      const drawn = async () => {
        const links = (await pane.findAll({ type: 'Client' })).flatMap(
          c => (c.props.props as Partial<LinksProps>).links ?? [],
        )
        const clean = (label: string) =>
          label
            .replace(/^\p{L}: /u, '')
            .replace(/^[^\p{L}\p{N}]+/u, '')
            .replace(/ \(recommended\)$/, '')
            .trim()
        const buttons = (await pane.findAll({ type: 'Button' }))
          .filter(b => !(b.key ?? '').endsWith('-key'))
          .map(b => ({ key: b.key ?? '', label: clean(b.text) }))
        const controls = [...buttons.map(b => b.label), ...links.map(l => clean(l.label))]
        const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
        return { buttons, controls, texts }
      }
      for (const tab of tabs) {
        if (look === 'terminal') {
          if (await pane.find({ key: `tab-${tab.id}` })) await pane.press({ key: `tab-${tab.id}` })
        } else {
          const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
          const x = bar
            .slice(
              0,
              bar.findIndex(t => t.id === tab.id),
            )
            .reduce((sum, t) => sum + t.width + gap, 0)
          await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
        }
        await clock.settle()
        for (const row of tab.rows) {
          await clock.advance(PRESS_GUARD_MS)
          if (look === 'terminal' && (await pane.find({ key: `select-${row.id}` }))) {
            await pane.press({ key: `select-${row.id}` })
          } else if (look === 'terminal' && (await pane.find({ key: `title-${row.id}` }))) {
            await pane.press({ key: `title-${row.id}` })
          } else if (look === 'desktop' && (await pane.find({ key: `select-${row.id}` }))) {
            await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: `select-${row.id}` })
          }
          if (await pane.find({ key: `all-options-${row.id}` })) await pane.press({ key: `all-options-${row.id}` })
          await clock.settle()
          const { controls, texts } = await drawn()
          const isTitleDrawn = [...controls, ...texts].some(t =>
            t.includes(row.state.is === 'open' ? row.title : row.title.slice(0, TITLE_START)),
          )
          expect(isTitleDrawn, `${look} ${tab.id} row ${row.id} draws its title`).toBe(true)
          if (row.state.is !== 'open') continue
          expect(
            inOrder(controls, expectedLabels(row)),
            `${look} ${tab.id} row ${row.id}: ${controls.join(', ')}`,
          ).toBe(true)
        }
      }
      if (look === 'terminal') await pane.press({ key: 'tab-prs' })
      else {
        const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
        const x = bar
          .slice(
            0,
            bar.findIndex(t => t.id === 'prs'),
          )
          .reduce((sum, t) => sum + t.width + gap, 0)
        await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
      }
      await clock.settle()
      const prs = Object.values(prViews.views)
      const isSent = threadSentIn(lastActions)
      const presses = { lastActions, turns, now: 1_000_000 }
      for (const pr of prs) {
        const labels = prBlockActions(pr, isSent, prViews.branchRef, presses).map(a => a.label)
        const { buttons } = await drawn()
        expect(
          buttons.filter(b => b.key.endsWith(`-${pr.ref}`)).map(b => b.label),
          `${look} PR #${pr.number}`,
        ).toEqual(labels)
      }
      const prRows = prs.flatMap(pr => [
        ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), labels: threadActions(pr, t, presses) })),
        ...failingChecks(pr).map(c => ({ id: prCheckId(pr, c), labels: checkActions(pr, c, presses) })),
      ])
      let checked = 0
      for (const row of prRows) {
        await clock.advance(PRESS_GUARD_MS)
        const selectKey = look === 'terminal' ? `title-${row.id}` : `select-${row.id}`
        if (!(await pane.find({ key: selectKey }))) continue
        if (look === 'terminal') await pane.press({ key: selectKey })
        else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: selectKey })
        await clock.settle()
        const { controls } = await drawn()
        const labels = [...row.labels.filter(a => !a.isFollowUp), ...row.labels.filter(a => a.isFollowUp)].map(
          a => a.label,
        )
        expect(inOrder(controls, labels), `${look} ${row.id}: ${controls.join(', ')}`).toBe(true)
        checked++
      }
      expect(checked, `${look} PR rows checked`).toBeGreaterThan(1)
      if (!isNextBuild) continue

      if (look === 'terminal') await pane.press({ key: 'tab-overview' })
      else {
        const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
        const x = bar
          .slice(
            0,
            bar.findIndex(t => t.id === 'overview'),
          )
          .reduce((sum, t) => sum + t.width + gap, 0)
        await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
      }
      await clock.settle()
      const page = statusPage({ ledger, presence: emptySession().presence }, 1_000_000)
      const targets = statusKeyRows(page)
      const planned = targets.flatMap(t => t.keys.map(k => `${t.id} ${k.label}`))
      expect(planned, 'the demo’s Status has rows with buttons').not.toEqual([])
      const targetOf = new Map<string, string>(
        targets.flatMap(t => t.keys.map(k => [`${k.press.action}-${t.id}`, t.id])),
      )
      const statusButtons = (await drawn()).buttons
        .filter(b => targetOf.has(b.key))
        .map(b => `${targetOf.get(b.key)} ${b.label}`)
      expect(statusButtons, `${look} Status buttons`).toEqual(planned)
      await pane.press({ key: `show-ask-${page.rows.find(r => statusKeyPlan(r).length > 0)!.id}` })
      await clock.settle()
      expect(await pane.find({ key: 'status-head' }), `${look} View leaves the Status`).toBeUndefined()
      expect(await pane.find({ key: 'view-d17' }), `${look} View selects the oldest ask`).toBeDefined()
    }
  })
