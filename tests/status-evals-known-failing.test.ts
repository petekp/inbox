import { expect, test } from 'claude-code/testing'

import { statusPage } from '../hooks/status-page'
import type { SubjectStatus } from '../types'
import { minutes } from '../evals/status-replay'
import { subject, statusOf, sessionOf } from './status-evals-scenes'

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
