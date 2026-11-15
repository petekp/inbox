import { expect, test } from 'claude-code/testing'

import { DOCUMENT_LIMIT, documentBytes, documentExcerpt, readDocument, withDocumentPreview } from '../hooks/document'

test('reads only the resolved regular Markdown target and falls back to replacement characters for invalid UTF-8', async () => {
  const reads: string[] = []
  const result = await readDocument('/reports/current.md', {
    stat: async () => ({ path: '/archive/current.md', isFile: true, size: 1 }),
    read: async path => {
      reads.push(path)
      return new Uint8Array([0xff])
    },
  })

  expect(reads).toEqual(['/archive/current.md'])
  expect(result).toEqual({ text: '�' })
})

test('rejects a target that is not a regular .md file or exceeds the size cap before reading it', async () => {
  let reads = 0
  const file = {
    stat: async (path: string) => ({
      path,
      isFile: path.endsWith('.md') && !path.includes('directory'),
      size: DOCUMENT_LIMIT + 1,
    }),
    read: async () => {
      reads++
      return new Uint8Array()
    },
  }

  expect(await readDocument('/reports/report.txt', file)).toEqual({
    error: 'The document must resolve to a regular .md file.',
  })
  expect(await readDocument('/reports/directory.md', file)).toEqual({
    error: 'The document must resolve to a regular .md file.',
  })
  expect(await readDocument('/reports/large.md', file)).toEqual({
    error: 'The document is larger than the 64 KiB limit.',
  })
  expect(reads).toBe(0)
})

test('checks the bytes read, reports missing files, and makes a short plain-text excerpt', async () => {
  expect(
    await readDocument('/reports/race.md', {
      stat: async path => ({ path, isFile: true, size: 1 }),
      read: async () => new Uint8Array(DOCUMENT_LIMIT + 1),
    }),
  ).toEqual({ error: 'The document is larger than the 64 KiB limit.' })
  expect(
    await readDocument('/reports/missing.md', {
      stat: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      },
      read: async () => new Uint8Array(),
    }),
  ).toEqual({ error: 'The document file is missing.' })
  expect(documentExcerpt('# Weekly\n\nA report')).toBe('# Weekly A report')
  expect(documentExcerpt('x'.repeat(181))).toBe(`${'x'.repeat(180)}…`)
  expect(new TextDecoder().decode(documentBytes(btoa('report'), DOCUMENT_LIMIT))).toBe('report')
})

test('normalizes line endings and removes ANSI sequences and control characters from the excerpt and body', async () => {
  const result = await readDocument('/reports/report.md', {
    stat: async path => ({ path, isFile: true, size: 1 }),
    read: async () => new TextEncoder().encode('Before\r\n\u001b[31mred\u001b[0m\0\ttext\u0001'),
  })

  expect(result).toEqual({ text: 'Before\nred\ttext' })
  expect('text' in result && documentExcerpt(result.text)).toBe('Before red text')
})

test('generates the preview from the validated file and drops a path that cannot be read', async () => {
  let stats = 0
  const relative = await withDocumentPreview(
    { document: 'reports/report.md' },
    {
      stat: async path => {
        stats++
        return { path, isFile: true, size: 1 }
      },
      read: async () => new Uint8Array(),
    },
  )
  const valid = await withDocumentPreview(
    { document: '/outside/report.md', document_preview: 'untrusted preview' },
    {
      stat: async path => ({ path, isFile: true, size: 4 }),
      read: async () => new TextEncoder().encode('# A report'),
    },
  )
  const invalid = await withDocumentPreview(
    { document: '/outside/report.md' },
    {
      stat: async () => ({ path: '/outside/report.html', isFile: true, size: 0 }),
      read: async () => new Uint8Array(),
    },
  )

  expect(relative).toMatchObject({ document: undefined, document_error: 'The document path must be absolute.' })
  expect(stats).toBe(0)
  expect(valid).toMatchObject({ document: '/outside/report.md', document_preview: '# A report' })
  expect(invalid).toMatchObject({
    document: undefined,
    document_error: 'The document must resolve to a regular .md file.',
  })
})
