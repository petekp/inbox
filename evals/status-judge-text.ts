import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { JudgePage, JudgePageSet } from './status-judge'

/** The files in `evals/status-judge/`, in the order the judge reads them. `evals/status-judge.md` lists the same. */
const JUDGE_PARTS = ['context', 'checks', 'answer']

/** The judge's system text: the parts in `evals/status-judge/` of the repo at `root`, with a blank line between. */
export function judgeSystemText(root: string): string {
  const read = (part: string) => readFileSync(join(root, 'evals', 'status-judge', `${part}.md`), 'utf8').trim()

  return JUDGE_PARTS.map(read).join('\n\n')
}

/** The judge's hand-written pages in `folder`: each page of set n is a JSON file in `set-<n>/`, read in name order. */
export function readJudgePages(folder: string, sets: JudgePageSet['set'][]): JudgePageSet[] {
  return sets.map(set => {
    const dir = join(folder, `set-${set}`)
    const pages = readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .sort()
      .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')) as JudgePage)

    return { set, pages }
  })
}
