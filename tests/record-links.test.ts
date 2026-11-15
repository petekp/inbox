import { describe, expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { CLAUDE_CODE } from '../hooks/model-text'
import { recordLinksAnswer, unlinkedRefs, unlinkedRefsAnswer } from '../hooks/record-links'
import { emptySession } from '../hooks/session-files'
import { recorded } from '../hooks/session-presses'
import { TOOL_FIELDS } from '../hooks/tool-schemas'
import { recordItem } from '../hooks/tools'

const flagged = (detail: string) => unlinkedRefs({ detail: [detail] }).map(r => r.text)

describe('unlinkedRefs finds', () => {
  for (const [text, ref] of [
    ['Merge PR 123 first.', 'PR 123'],
    ['Merge PR #123 first.', 'PR #123'],
    ['Merge PR#123 first.', 'PR#123'],
    ['PRs 12 and 13 wait.', 'PRs 12'],
    ['See pull request 123.', 'pull request 123'],
    ['See Pull Request #123.', 'Pull Request #123'],
    ['See issue 123.', 'issue 123'],
    ['See issue #123.', 'issue #123'],
    ['Fixed in #123.', '#123'],
    ['Fixed in (#123).', '#123'],
    ['Fixed in acme/app#123.', 'acme/app#123'],
    ['Fixed in app#123.', 'app#123'],
    ['PR 45 のレビューを待っています。', 'PR 45'],
    ['修正はPR 46に入れます。', 'PR 46'],
    ['#47 の設計を先に決めます。', '#47'],
    ['プルリクエスト 12 を見てください。', 'プルリクエスト 12'],
    ['イシュー 12 に書きました。', 'イシュー 12'],
    ['Fixed in ＃12.', '＃12'],
    ['Merge PR １２ first.', 'PR １２'],
    ['Merge PR ＃12 first.', 'PR ＃12'],
    ['イシュー＃12 に書きました。', 'イシュー＃12'],
    ['See ISSUE 12.', 'ISSUE 12'],
    ['See Issue #12.', 'Issue #12'],
    ['See PULL REQUEST 12.', 'PULL REQUEST 12'],
    ['See Pull request #12.', 'Pull request #12'],
  ] as [string, string][])
    test(text, () => {
      expect(flagged(text)).toEqual([ref])
    })

  test('each reference in a range or list that has its own mark', () => {
    expect(flagged('Merged #3-#5 and #9.')).toEqual(['#3', '#5', '#9'])
  })

  test('a reference that ends inside one character’s NFKC form, quoted with that whole character', () => {
    expect(flagged('#⒈ x')).toEqual(['#⒈'])
  })

  test('a Markdown link to a non-https URL, which does not open', () => {
    expect(flagged('See [PR 12](http://example.com/acme/app/pull/12).')).toEqual(['PR 12'])
  })
})

describe('unlinkedRefs leaves out', () => {
  for (const [name, text] of [
    ['a code span', 'Run `gh pr view #12` now.'],
    ['a code fence', 'Run:\n```\ngit log PR 12\n```'],
    ['a link label', 'See [acme/app#12](https://github.com/acme/app/pull/12).'],
    ['a link URL', 'See [the fix](https://github.com/acme/app/issues/12#issuecomment-34).'],
    ['a bare URL', 'See https://github.com/acme/app/pull/12 now.'],
    ['an autolink', 'See <https://github.com/acme/app/pull/12#discussion_r5>.'],
    ['a line anchor', 'See main.ts#L12 there.'],
    ['a hex colour', 'Use #12ab34 or #fff for the border.'],
    ['a number with a leading zero', 'Build #012 failed.'],
    ['a Japanese count', 'PR 2 件と PR 4 本をまとめて見ます。'],
    ['an HTML entity', 'Write &#123; for the brace.'],
    ['a number without a mark', 'Step 2 of 3 is done.'],
    ['a name that holds pr and a number', 'The build-pr21 and test-PR 22 jobs ran.'],
    ['a lower-case pr', 'The pr 12 and Pr 13 labels stay.'],
    ['a full-width Japanese count', 'PR ２ 件をまとめて見ます。'],
  ] as [string, string][])
    test(name, () => {
      expect(flagged(text)).toEqual([])
    })

  test('a later mention of a reference the record links once', () => {
    expect(flagged('[PR 31](https://github.com/acme/app/pull/31) waits. PR 31 stays as is.')).toEqual([])
  })

  test('a reference that another field links', () => {
    const fields = {
      ask: ['Reply on PR 32?'],
      detail: ['[acme/app#32](https://github.com/acme/app/pull/32)'],
    }
    expect(unlinkedRefs(fields)).toEqual([])
  })

  test('a reference that a link step opens', () => {
    expect(unlinkedRefs({ ask: ['Approve #33?'] }, ['https://github.com/acme/app/pull/33'])).toEqual([])
  })
})

describe('options', () => {
  test('need their reference linked outside options, since an option shows only the label', () => {
    expect(unlinkedRefs({ options: ['[Comment on #34](https://github.com/acme/app/issues/34)'] })).toEqual([
      { field: 'options', text: '#34' },
    ])
    expect(
      unlinkedRefs({ detail: ['[#34](https://github.com/acme/app/issues/34)'], options: ['Comment on #34'] }),
    ).toEqual([])
  })

  test('skip code spans', () => {
    expect(unlinkedRefs({ options: ['Use `#333`'] })).toEqual([])
  })
})

test('the answer names each field and text, shows a link and offers a way out', () => {
  const answer = unlinkedRefsAnswer(unlinkedRefs({ title: ['Fix #51'], detail: ['PR 52 and #53 and #54 wait'] }))
  expect(answer).toBe(
    'Not recorded: title names "#51", detail names "PR 52" and "#53", and 1 more, without a link. Write each PR or issue as a Markdown link at its first mention, such as [owner/repo#123](https://github.com/owner/repo/pull/123); later mentions in the same record need none. Only https links count, and a link with a title or inside italics is not read as a link. If it is not a PR or issue, write it without "#", or put code in backticks.',
  )
  expect(unlinkedRefsAnswer(unlinkedRefs({ options: ['Comment on #34'] }))).toContain(
    "An option shows only a link's label, so link what an option names in detail or steps.",
  )
})

describe('record', () => {
  const question = { kind: 'question', ask: 'Merge PR 12?', options: ['Merge', 'Wait'] }

  test('refuses a question, task or finding that names an unlinked reference and changes nothing', () => {
    for (const input of [
      question,
      { kind: 'task', ask: 'Approve #61 on GitHub' },
      { kind: 'finding', title: 'Config link broken', detail: 'The fix in #62 renamed the file.' },
    ]) {
      const r = recordItem(CLAUDE_CODE, EMPTY, input, 1000)
      expect(r.result).toStartWith('Not recorded: ')
      expect(r.ledger).toBe(EMPTY)
      expect(r.personLine).toBeNull()
    }
  })

  test('refuses an update to an open item that adds an unlinked reference', () => {
    const open = recordItem(CLAUDE_CODE, EMPTY, { ...question, ask: 'Merge it?' }, 1000).ledger
    const r = recordItem(CLAUDE_CODE, open, { ...question, ask: 'Merge it?', detail: 'It waits on #11.' }, 1100)
    expect(r.result).toStartWith('Not recorded: detail names "#11"')
    expect(r.ledger).toBe(open)
  })

  test('records the same question once its reference is a link', () => {
    const r = recordItem(
      CLAUDE_CODE,
      EMPTY,
      { ...question, ask: 'Merge [PR 12](https://github.com/acme/app/pull/12)?' },
      1000,
    )
    expect(r.result).toStartWith('Recorded. The user sees it in the /inbox pane.')
  })

  const link = '[PR 12](https://github.com/acme/app/pull/12)'
  const overLimit = (field: string, max: number) =>
    `Not recorded: ${field} is over its limit of ${max} characters, so cutting it would drop its links. Shorten it so its links survive; a link counts as its label.`

  test('refuses a field over its limit whose cut would drop its links, instead of calling them unlinked', () => {
    for (const [input, answer] of [
      [{ kind: 'task', ask: 'Sign in', detail: `${link} ${'x'.repeat(1250)}` }, overLimit('detail', 1200)],
      [{ kind: 'finding', title: 'Broken link', detail: `${link} ${'x'.repeat(650)}` }, overLimit('detail', 600)],
      [{ ...question, ask: `${link} ${'x'.repeat(250)}` }, overLimit('ask', 200)],
    ] as [Record<string, unknown>, string][]) {
      const r = recordItem(CLAUDE_CODE, EMPTY, input, 1000)
      expect(r.result).toBe(answer)
      expect(r.ledger).toBe(EMPTY)
    }
  })

  test('still cuts a field over its limit that holds no link', () => {
    const r = recordItem(CLAUDE_CODE, EMPTY, { kind: 'task', ask: 'Sign in', detail: 'x'.repeat(1250) }, 1000)
    expect(r.result).toStartWith('Recorded. The user sees it in the /inbox pane.')
    expect(r.ledger.items[0]?.detail).toHaveLength(1200)
  })

  test('reads each field before its cut', () => {
    expect(recordLinksAnswer([{ field: 'detail', text: link, max: 7 }])).toBeNull()
    expect(recordLinksAnswer([{ field: 'detail', text: `${link} x`, max: 6 }])).toBe(overLimit('detail', 6))
  })

  test('ignores an option past the eighth, which the record drops anyway', () => {
    const options = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Wait for #12']
    const r = recordItem(CLAUDE_CODE, EMPTY, { kind: 'question', ask: 'Pick one?', options }, 1000)
    expect(r.result).toStartWith('Recorded. The user sees it in the /inbox pane.')
    expect(r.ledger.items[0]?.options).toHaveLength(8)
  })

  test("every host's call path refuses it", () => {
    const r = recorded(CLAUDE_CODE, emptySession(), 'record', question, 1000, TOOL_FIELDS)
    expect(r.result).toStartWith('Not recorded: ask names "PR 12"')
    expect(r.state.ledger.items).toEqual([])
  })
})
