import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { CLAUDE_CODE } from '../hooks/model-text'
import { recordItem } from '../hooks/tools'
import { linkLabel } from '../hooks/inline'

test('finding title and detail caps count visible text, and a field whose cut would drop a link is refused', () => {
  const link = '[release notes](https://example.com/release)'
  const title = `${'x'.repeat(106)} ${link}`
  const detail = `${'y'.repeat(586)} ${link}`
  const result = recordItem(CLAUDE_CODE, EMPTY, { kind: 'finding', title, detail }, 1000)
  const finding = result.ledger.findings[0]!

  expect(linkLabel(finding.title)).toHaveLength(120)
  expect(linkLabel(finding.detail)).toHaveLength(600)
  expect(finding.title).toContain(link)
  expect(finding.detail).toContain(link)
  expect(recordItem(CLAUDE_CODE, EMPTY, { kind: 'finding', title: `x${title}`, detail }, 1000).result).toStartWith(
    'Not recorded: title is over its limit of 120 characters',
  )
})
