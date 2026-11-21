import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { stampedCode } from '../evals/code-stamp'

const reader = (files: Record<string, string>) => (path: string) => files[path] ?? null

const PARSE = `export function parse(text: string) {
  return text.split('|')
}`
const GRADE = `export function grade(text: string) {
  return parse(text).length > 2
}`

test('renaming a file, changing its import path and moving a function leave the code the same', () => {
  const before = stampedCode(
    ['evals/checks.ts'],
    reader({
      'evals/checks.ts': `import { grade } from '../hooks/grade'\n\nexport const MIN = 3`,
      'hooks/grade.ts': `import type { Ledger } from '../types'\nimport { parse } from './parse'\n\n${GRADE}`,
      'hooks/parse.ts': PARSE,
    }),
  )
  const after = stampedCode(
    ['evals/checks.ts'],
    reader({
      'evals/checks.ts': `import {\n  grade,\n} from '../core/domain/grade'\n\nexport const MIN = 3`,
      'core/domain/grade.ts': `${PARSE}\n\n${GRADE}`,
    }),
  )

  expect(after).toBe(before)
})

test('a change to code an entry imports at run time changes the code, and a type-only import is not followed', () => {
  const files = {
    'evals/checks.ts': `import { parse } from './parse'\nimport type { Shape } from './shape'\n\nexport const MIN = 3`,
    'evals/parse.ts': PARSE,
    'evals/shape.ts': 'export type Shape = { a: number }',
  }
  const changed = { ...files, 'evals/parse.ts': PARSE.replace("'|'", "';'") }

  expect(stampedCode(['evals/checks.ts'], reader(changed))).not.toBe(stampedCode(['evals/checks.ts'], reader(files)))
  expect(stampedCode(['evals/checks.ts'], reader(files))).not.toContain('Shape')
})

test('an import of a file that is not there throws', () => {
  expect(() => stampedCode(['evals/checks.ts'], reader({ 'evals/checks.ts': "import { x } from './gone'" }))).toThrow(
    'evals/checks.ts imports ./gone',
  )
})
