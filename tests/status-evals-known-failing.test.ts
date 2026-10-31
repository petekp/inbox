import { expect, test } from 'claude-code/testing'

import { childStarted } from '../hooks/children'
import { parseStatus } from '../hooks/status'
import type { Op } from '../hooks/status'
import { lookEnded, lookStarted } from '../hooks/status-children'
import { applyOps } from '../hooks/status-ops'
import { statusPage } from '../hooks/view'
import type { SessionStatus, SubjectStatus } from '../types'
import { minutes } from '../evals/status-replay'
import { subject, statusOf, sessionOf, ask } from './status-evals-scenes'

function knownFailing(name: string, until: string, body: () => void) {
  test(`${name}, which fails until ${until} is built`, () => {
    let error: unknown = null
    try {
      body()
    } catch (e) {
      error = e
    }
    if (error === null) throw new Error(`This passes now. ${until} is built, so make it a plain test.`)
  })
}

const opsOf = (text: string): Op[] => {
  const answer = parseStatus(text)
  return answer?.kind === 'ops' ? answer.ops : []
}

knownFailing('#137: work filed for later draws its own mark and folds apart from the done count', '#137', () => {
  const o = statusOf([subject('s1', 'filed' as SubjectStatus, 'Dark mode', 'filed for later', 10)], {
    lastLookAt: minutes(0),
  })
  const row = statusPage(sessionOf(o, [], 10), minutes(10)).rows.find(r => r.kind === 'subject')

  expect(row?.kind === 'subject' && row.mark).toBeTruthy()
  expect(['✓', '✗', '●', '○', '◌']).not.toContain(row?.kind === 'subject' ? row.mark : '✓')
})

knownFailing('#138: every piece finished since the last look is drawn as a row', '#138', () => {
  const done = ['Login timeout', 'Crash on launch', 'Backup restore', '2.4 release', 'Sync merge', 'Search speed']
  const o = statusOf(
    done.map((name, n) => subject(`s${n + 1}`, 'done', name, 'finished', 10 + n)),
    { lastLookAt: minutes(0) },
  )
  const drawn = statusPage(sessionOf(o, [], 30), minutes(30)).rows.filter(r => r.kind === 'subject')

  expect(drawn.length).toBe(6)
})

knownFailing('#139: a look marks as seen only the rows that were on screen', '#139', () => {
  const o = statusOf([
    subject('s1', 'working', 'Sync engine', 'syncs', 10),
    subject('s2', 'working', 'Search speed', 'faster', 10),
  ])
  const endLook = lookEnded as (o: SessionStatus | null, at: number, shown: string[]) => SessionStatus | null
  const looked = endLook(lookStarted(o, minutes(20)), minutes(21), ['s1'])
  const page = statusPage(sessionOf(looked!, [], 22), minutes(22))
  const names = page.rows.map(r => (r.kind === 'subject' ? r.name : r.kind))

  expect(names.indexOf('Search speed')).toBeLessThan(names.indexOf('look'))
})

knownFailing('#140: one ask holds up two subjects, and both show ◆', '#140', () => {
  const o = applyOps(
    statusOf([
      subject('s1', 'working', '2.4 release', 'build signed', 0),
      subject('s2', 'working', 'Hotfix release', 'build signed', 0),
    ]),
    opsOf('LINK: i1 | 2.4 release\nLINK: i1 | Hotfix release'),
    minutes(5),
    new Set(['i1']),
  )
  const marks = statusPage(sessionOf(o, [ask('i1', 'Sign in to the app store')], 5), minutes(5)).rows.flatMap(r =>
    r.kind === 'subject' ? [r.mark] : [],
  )

  expect(marks).toEqual(['◆', '◆'])
})

knownFailing('#149: a delegate with no published focus shows its name in words', '#149', () => {
  const o = childStarted(statusOf([]), { ref: 'herdr:pdf-layout', kind: 'delegate', name: 'pdf-layout' }, minutes(1))
  const row = statusPage(sessionOf(o, [], 2), minutes(2)).rows.find(r => r.kind === 'child')

  expect(row?.kind === 'child' ? row.name : '').toMatch(/^pdf layout$/i)
})
