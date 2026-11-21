import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { ownCode, stampedCode } from '../evals/code-stamp'

const reader = (files: Record<string, string>) => (path: string) => files[path] ?? null

const PARSE = `export function parse(text: string) {
  return split(text)
}`
const SPLIT = `function split(text: string) {
  return text.split('|')
}`
const GRADE = `export function grade(text: string) {
  return parse(text).length > 2
}`

test('renaming a file, changing its import path, splitting a file and editing a comment leave the code the same', () => {
  const before = stampedCode(
    ['evals/checks.ts'],
    reader({
      'evals/checks.ts': `import { grade } from '../hooks/grade'\n\n/** The fewest parts. */\nexport const MIN = 3`,
      'hooks/grade.ts': `import type { Ledger } from '../types'\nimport { parse } from './parse'\n\n${GRADE}`,
      'hooks/parse.ts': `${SPLIT}\n\n${PARSE}`,
    }),
  )
  const after = stampedCode(
    ['evals/checks.ts'],
    reader({
      'evals/checks.ts': `import {\n  grade,\n} from '../core/domain/grade'\n\n// At least this many parts.\nexport const MIN = 3`,
      'core/domain/grade.ts': `import { split } from './split'\n\n${PARSE}\n\n${GRADE}`,
      'core/domain/split.ts': `export ${SPLIT}`,
    }),
  )

  expect(after).toBe(before)
})

test('a change to code an entry imports at run time changes the code, and a type-only import is not followed', () => {
  const files = {
    'evals/checks.ts': `import { parse } from './parse'\nimport type { Shape } from './shape'\nregister(parse)\n\nexport const MIN = 3`,
    'evals/parse.ts': PARSE + '\n\n' + SPLIT,
    'evals/shape.ts': 'export type Shape = { a: number }',
  }
  const changedImport = { ...files, 'evals/parse.ts': files['evals/parse.ts'].replace("'|'", "';'") }
  const changedCall = {
    ...files,
    'evals/checks.ts': files['evals/checks.ts'].replace('register(parse)', 'register(grade)'),
  }
  const code = (f: Record<string, string>) => stampedCode(['evals/checks.ts'], reader(f))

  expect(code(changedImport)).not.toBe(code(files))
  expect(code(changedCall)).not.toBe(code(files))
  expect(code(files)).not.toContain('Shape')
})

test('an import of a file that is not there, or a module loaded at run time, throws', () => {
  expect(() => stampedCode(['evals/checks.ts'], reader({ 'evals/checks.ts': "import { x } from './gone'" }))).toThrow(
    'evals/checks.ts imports ./gone',
  )
  expect(() =>
    stampedCode(['evals/checks.ts'], reader({ 'evals/checks.ts': "export const load = () => import('./late')" })),
  ).toThrow('evals/checks.ts loads a module at run time')
})

test('own code can keep only the statements that declare some names', () => {
  const source = `import { run } from './run'\n\nexport const MODEL = 'm'\n\n${SPLIT}\n\nexport function ask() {\n  return run(MODEL)\n}`

  expect(ownCode('a.ts', source, ['MODEL', 'ask'])).toBe(`const MODEL = 'm'\nfunction ask() {\n  return run(MODEL)\n}`)
})
