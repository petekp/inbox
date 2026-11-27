import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { SENDING } from '../../core/view/unshown-press'
import type { Block } from '../src/blocks'
import type { PressKind } from '../../types'

const { framesOf } = await import('./frames')
const { FRAME_MS } = await import('../../core/view/springs')
type Step = import('./frames').Step
const { tabBlocks } = await import('../src/draw')
const { AGENT, NOW, demoScreen, dismissedPr, dismissedSession, uiOn, withDismissedAsk } = await import('./fixtures')
const { demoSession } = await import('../../core/view/demo')
const { sessionView } = await import('../../core/view/session-view')
const { NO_HOLDS, SETTLED_MS } = await import('../../core/view/timing')
const { drawOuts } = await import('../src/out')
const { keyMove } = await import('../src/keys')

const goalFieldOpening = () =>
  framesOf(
    [
      [0, tabBlocks(demoScreen(), uiOn('overview'))],
      [0, tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' })), 'input'],
    ],
    900,
  )

test('opening the goal field shows its buttons only once its box is nearly open and never cuts them', () => {
  const { cuts, fading } = goalFieldOpening()
  const opened = fading.filter(f => f.id === 'box goal field' && f.at >= 0 && f.height > 0)
  const buttonCuts = cuts.filter(c => c.at >= 0 && !c.text.startsWith('text field'))
  expect({ buttonCuts, isShownOnceOpen: opened.every(f => f.opacity === 1) }).toEqual({
    buttonCuts: [],
    isShownOnceOpen: true,
  })
})

test('D1, the person’s own press cutting the panel it opens: opening the goal field cuts no text as its box grows', () => {
  expect(goalFieldOpening().cuts.filter(c => c.at >= 0)).toEqual([])
})

function emptyStatus(typing: 'goal' | null): Block[] {
  const screen = demoScreen()
  const statusPage = { ...screen.view.statusPage, goal: null, rows: [], isEmpty: true, suggestedGoal: null }

  return tabBlocks({ ...screen, view: { ...screen.view, statusPage } }, uiOn('overview', { typing }))
}

test('the empty Status page’s goal field opens and closes with no jump, and cuts no text', () => {
  for (const [from, to] of [
    [null, 'goal'],
    ['goal', null],
  ] as const) {
    const { jumps, cuts } = framesOf(
      [
        [0, emptyStatus(from)],
        [0, emptyStatus(to), 'input'],
      ],
      900,
    )
    expect({ to, jumps, cuts: cuts.filter(c => c.at >= 0) }).toEqual({ to, jumps: [], cuts: [] })
  }
})

test('a first draw with the empty Status page’s goal field already open shows Set and Cancel at once', () => {
  const buttons = framesOf([[0, emptyStatus('goal')]], 0).fading.filter(f => f.id === 'buttons goal')
  expect({ isDrawn: buttons.length > 0, hidden: buttons.filter(f => f.opacity < 1) }).toEqual({
    isDrawn: true,
    hidden: [],
  })
})

function outOn(open: Block[], rowId: string, action: string, label: string, kind: PressKind): Block[] {
  const out = { pressId: 'p5', uiPressId: 5, rowId, path: '/x', action, kind, label, pending: null, result: null }

  return drawOuts(open, [{ ...out, before: '', isWritten: true, waitingSince: NOW, isTaken: false }], {}, NOW)
}

const sendingOn = (open: Block[]) => outOn(open, 'd11', 'discuss', 'Discuss', 'talk')

test('closing the goal field while its buttons fade in never shows them more than if it had stayed open', () => {
  const closed = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  const closeAt = 300
  const shownAt = (steps: Step[]) => {
    const { fading } = framesOf(steps, 700)
    const of = (id: string, at: number) => fading.find(f => f.id === id && f.at === at)?.opacity ?? 1
    const ats = [...new Set(fading.filter(f => f.at >= closeAt && f.id === 'box goal field').map(f => f.at))]

    return new Map(ats.map(at => [at, of('buttons goal', at) * of('box goal field', at)]))
  }
  const stayed = shownAt([
    [0, closed],
    [0, typing, 'input'],
  ])
  const shut = shownAt([
    [0, closed],
    [0, typing, 'input'],
    [closeAt, closed, 'input'],
  ])
  const above = [...shut].filter(([at, o]) => o > (stayed.get(at) ?? 1) + 0.01).map(([at]) => at)
  expect(above).toEqual([])
})

test('a press’s status under a row’s buttons shows faint in the press’s own draw, and its growing box cuts it only while faint', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd11' }))
  const { cuts, shown } = framesOf(
    [
      [0, open],
      [0, sendingOn(open), 'input'],
    ],
    400,
  )
  const pressDrawAt = Math.min(...shown.filter(s => s.at >= 0).map(s => s.at))
  const pressDraw = shown.filter(s => s.at === pressDrawAt && s.text === SENDING)
  expect({
    isShownAtOnce: pressDraw.some(s => s.opacity > 0 && s.share > 0),
    cuts: cuts.filter(c => c.at >= 0),
  }).toEqual({ isShownAtOnce: true, cuts: [] })
})

test('a row that comes back through Undo while its Undo’s status fades in cuts no text', () => {
  const on = (selected: string, collapsed: string[] = []) => {
    const screen = demoScreen()
    return tabBlocks({ ...screen, view: { ...screen.view, collapsed } }, uiOn('needsYou', { selected }))
  }
  const dismissedOn = (selected: string) => tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected }))
  const dismissed = dismissedOn('d13')
  const undo: Step = [0, outOn(dismissed, 'd13', 'undo', 'Undo', 'view'), 'input']
  const cases: [string, Step[]][] = [
    ...[32, 80, 300].map((at): [string, Step[]] => [`back open at ${at} ms`, [[at, on('d13')]]]),
    ['back collapsed', [[32, on('d13', ['d13'])]]],
    [
      'collapsed 16 ms after it comes back',
      [
        [32, on('d13')],
        [48, on('d13', ['d13']), 'input'],
      ],
    ],
    [
      'collapsed 64 ms after it comes back',
      [
        [32, on('d13')],
        [96, on('d13', ['d13']), 'input'],
      ],
    ],
    ...[32, 80].map((at): [string, Step[]] => [
      `the selection moves on before it comes back at ${at} ms`,
      [
        [16, outOn(dismissedOn('d15'), 'd13', 'undo', 'Undo', 'view'), 'input'],
        [at, on('d15')],
      ],
    ]),
  ]
  for (const [name, after] of cases) {
    const { cuts } = framesOf([[0, dismissed], undo, ...after], 1200)
    expect({ name, cuts: cuts.filter(c => c.at >= 0) }).toEqual({ name, cuts: [] })
  }
})

test('a status under a row’s buttons that no press brought fades in once the row’s box is nearly open, and fades out before its space closes', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd11' }))
  const endsAt = 700
  const { cuts, fading, heights } = framesOf(
    [
      [0, open],
      [0, sendingOn(open)],
      [endsAt, open],
    ],
    1400,
  )
  const status = fading.filter(f => f.id === 'status d11')
  const goneAt = status.at(-1)?.at ?? 0
  const heightAt = (at: number) => heights[Math.round((at + 500) / 16)] ?? NaN
  const whileFading = status.filter(f => f.at >= endsAt).map(f => heightAt(f.at))
  expect({
    cuts: cuts.filter(c => c.at >= 0),
    fadesOut: (status.at(-1)?.opacity ?? 1) < 0.05,
    holds: whileFading.every(h => h >= heightAt(endsAt) - 0.5),
    shrinks: heightAt(goneAt + 300) < heightAt(endsAt) - 1,
  }).toEqual({ cuts: [], fadesOut: true, holds: true, shrinks: true })
})

function heightsPast(all: number[], ms: number): number[] {
  const heights = all.slice(-Math.ceil(ms / FRAME_MS))
  const start = heights[0] ?? 0
  const end = heights.at(-1) ?? 0

  return heights.filter(h => h < Math.min(start, end) - 0.5 || h > Math.max(start, end) + 0.5)
}

test('dismissing the open row moves the list only toward its new height and cuts no text', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const dismissed = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' }))
  const frames = framesOf(
    [
      [0, open],
      [0, dismissed],
    ],
    900,
  )
  expect({ outside: heightsPast(frames.heights, 900), cuts: frames.cuts.filter(c => c.at >= 0) }).toEqual({
    outside: [],
    cuts: [],
  })
})

test('a dismissed PR’s block glides between its open and dismissed forms in both directions, cuts no text, and the list moves only toward its new height', () => {
  const open = tabBlocks(demoScreen(), uiOn('prs'))
  const dismissed = dismissedPr('acme/visor#29').blocks
  for (const [name, from, to] of [
    ['dismiss', open, dismissed],
    ['undo', dismissed, open],
  ] as const) {
    const frames = framesOf(
      [
        [0, [...from]],
        [0, [...to]],
      ],
      900,
    )
    const jumps = frames.jumps.filter(j => j.at >= 0)
    const cuts = frames.cuts.filter(c => c.at >= 0)
    expect({ name, jumps, cuts, outside: heightsPast(frames.heights, 900) }).toEqual({
      name,
      jumps: [],
      cuts: [],
      outside: [],
    })
  }
})

test('D2, a press that grows the block it changes: a dismissed PR whose status line is hidden cuts no text as its block grows', () => {
  const unread = demoSession(NOW, AGENT)
  const frames = framesOf(
    [
      [0, tabBlocks(demoScreen(unread), uiOn('prs'))],
      [0, dismissedPr('acme/visor#29', NOW - 500, [], unread).blocks],
    ],
    900,
  )
  expect(frames.cuts.filter(c => c.at >= 0)).toEqual([])
})

test('a Dismiss whose reply lands 16, 100 or 300 ms after its press moves the list only toward its new height, on an open row and on a PR’s block', () => {
  const ref = 'acme/visor#29'
  const openRow = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const openPr = tabBlocks(demoScreen(), uiOn('prs'))
  const cases = [
    [
      'row',
      openRow,
      outOn(openRow, 'd13', 'dismiss', 'Dismiss', 'mark'),
      tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' })),
    ],
    ['pr', openPr, outOn(openPr, `pr:${ref}`, 'pr-dismiss', 'Dismiss', 'mark'), dismissedPr(ref).blocks],
  ] as const
  for (const [name, open, pressed, dismissed] of cases)
    for (const replyAt of [16, 100, 300]) {
      const frames = framesOf(
        [
          [0, open],
          [0, pressed, 'input'],
          [replyAt, dismissed],
        ],
        replyAt + 900,
      )
      expect({ name, replyAt, outside: heightsPast(frames.heights, replyAt + 900) }).toEqual({
        name,
        replyAt,
        outside: [],
      })
    }
})

test('a Dismiss out on a row the cursor leaves with j before its reply grows no status on the row it closes', () => {
  const pressedOn = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const move = keyMove('j', [], pressedOn, null)
  const next =
    move?.is === 'event' && move.event.type === 'step' ? move.event.ids[move.event.ids.indexOf('d13') + 1] : null
  const left = tabBlocks(demoScreen(), uiOn('needsYou', { selected: next ?? null }))
  const pressedThenLeft = outOn(left, 'd13', 'dismiss', 'Dismiss', 'mark')
  const statusOf = (blocks: Block[]) =>
    blocks.find((b): b is Extract<Block, { kind: 'row' }> => b.kind === 'row' && b.id === 'd13')?.feedback
  expect({ isMoved: next !== undefined && next !== null, status: statusOf(pressedThenLeft) }).toEqual({
    isMoved: true,
    status: statusOf(left),
  })
})

const POP_OPACITY = 0.3

function popsOf(steps: Step[], ids: string[]) {
  const { shown } = framesOf(steps, 900)
  const frames = new Map<number, Map<string, number>>()
  for (const s of shown) {
    const frame = frames.get(s.at) ?? new Map<string, number>()
    frames.set(s.at, frame)
    if (!s.isFormPart || !ids.includes(s.block)) continue
    const key = `${s.block} ${s.text}`
    frame.set(key, Math.max(frame.get(key) ?? 0, s.opacity * s.share))
  }
  const ats = [...frames.keys()].filter(at => at >= -16).sort((a, b) => a - b)

  return ats.slice(1).flatMap((at, i) => {
    const before = frames.get(ats[i] ?? at) ?? new Map<string, number>()
    const after = frames.get(at) ?? new Map<string, number>()
    const texts = new Set([...before.keys(), ...after.keys()])
    return [...texts]
      .map(text => ({ at, text, from: before.get(text) ?? 0, to: after.get(text) ?? 0 }))
      .filter(p => Math.abs(p.to - p.from) > POP_OPACITY)
  })
}

const discussed: import('../../types').LastAction = {
  kind: 'talk',
  action: 'discuss',
  text: 'Discuss',
  at: NOW - 1000,
  turnsStarted: 14,
}

function rowsWith(session: ReturnType<typeof demoSession>, selected: string | null): Block[] {
  const s = {
    ...session,
    lastActions: { ...session.lastActions, d13: discussed },
    presence: { ...session.presence, turnsStarted: 14, turnsApplied: 15 },
  }
  const view = sessionView(s, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - 1000 })

  return tabBlocks({ ...demoScreen(), view, shownSince: NOW - 1000 }, uiOn('needsYou', { selected }))
}

function settleCases(): [string, Step[]][] {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const closed = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd15' }))
  const dismissed = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd15' }))
  const dismissedOpen = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' }))
  const discussedOpen = rowsWith(demoSession(NOW, AGENT), 'd13')
  const discussedDismissed = rowsWith(dismissedSession('d13', NOW), 'd15')
  const treeOpen = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd11' }))
  const treeDismissed = tabBlocks(withDismissedAsk('d11', NOW), uiOn('needsYou', { selected: 'd12' }))
  const cases: [string, Step[]][] = [
    ['settle', [[0, dismissed]]],
    ['settle from closed', [[0, dismissed]]],
    [
      'settle 40 ms into an open',
      [
        [0, open, 'input'],
        [40, dismissedOpen],
      ],
    ],
    [
      'settle 200 ms into an open',
      [
        [0, open, 'input'],
        [200, dismissedOpen],
      ],
    ],
    [
      'settle from closed, undone 170 ms later',
      [
        [0, dismissed],
        [170, closed],
      ],
    ],
    [
      'settle from closed, undone 260 ms later',
      [
        [0, dismissed],
        [260, closed],
      ],
    ],
    ['undo to open', [[0, open]]],
    ['undo to closed', [[0, closed]]],
    [
      'undo to closed, then opened',
      [
        [0, closed],
        [32, open, 'input'],
      ],
    ],
    [
      'undo to open, then closed',
      [
        [0, open],
        [32, closed, 'input'],
      ],
    ],
    [
      'settle turned back to open',
      [
        [0, dismissed],
        [32, open],
      ],
    ],
    [
      'settle turned back to closed',
      [
        [0, dismissed],
        [80, closed],
      ],
    ],
    ['settle from ✓ Discussed', [[0, discussedDismissed]]],
    ['settle with Holds up and context', [[0, treeDismissed]]],
    ['undo to Holds up and context', [[0, treeOpen]]],
  ]
  const startOf = (name: string) =>
    name.includes('from closed') || name.includes('into an open')
      ? closed
      : name.startsWith('undo to Holds')
        ? treeDismissed
        : name.startsWith('undo')
          ? dismissed
          : name.includes('✓')
            ? discussedOpen
            : name.includes('Holds up')
              ? treeOpen
              : open

  return cases.map(([name, moves]) => [name, [[0, [...startOf(name)]], ...moves]])
}

for (const [name, steps] of settleCases())
  test(`a row that settles or comes back through Undo swaps its mark with no fade and fades every line under its title out and in, so none pops or is cut: ${name}`, () => {
    const rows = steps.flatMap(([, blocks]) => blocks.flatMap(b => (b.kind === 'row' ? [b.id] : [])))
    const marksOf = (id: string) =>
      new Set(
        steps.flatMap(([, blocks]) =>
          blocks.flatMap(b => (b.kind === 'row' && b.id === id && b.mark ? [b.mark.text] : [])),
        ),
      )
    const isMarkSwap = (key: string) => {
      const [id = '', ...text] = key.split(' ')
      const marks = marksOf(id)
      return marks.size > 1 && marks.has(text.join(' '))
    }
    const cuts = framesOf(steps, 900).cuts.filter(c => c.at >= 0)
    const pops = popsOf(steps, [...new Set(rows)]).filter(p => !isMarkSwap(p.text))
    expect({ pops, cuts }).toEqual({ pops: [], cuts: [] })
  })

test('a row that settles while its new form reports its height a frame late shows no line under its title until its box has room for it', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const closed = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd15' }))
  const dismissed = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd15' }))
  const dismissedOpen = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' }))
  const cases: [string, Step[]][] = [
    [
      'from closed',
      [
        [0, closed],
        [0, dismissed],
      ],
    ],
    [
      '40 ms into an open',
      [
        [0, closed],
        [0, open, 'input'],
        [40, dismissedOpen],
      ],
    ],
  ]
  for (const [name, steps] of cases) {
    const cuts = framesOf(steps, 900, FRAME_MS).cuts.filter(c => c.at >= 0)
    expect({ name, cuts }).toEqual({ name, cuts: [] })
  }
})
