import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The files in `evals/status-judge/`, in the order the judge reads them. `evals/status-judge.md` lists the same. */
const JUDGE_PARTS = ['context', 'checks', 'answer']

/** The judge's system text: the parts in `evals/status-judge/` of the repo at `root`, with a blank line between. */
export function judgeSystemText(root: string): string {
  const read = (part: string) => readFileSync(join(root, 'evals', 'status-judge', `${part}.md`), 'utf8').trim()

  return JUDGE_PARTS.map(read).join('\n\n')
}
