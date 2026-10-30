import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const JUDGE_SEPARATOR = '\n---\n'

/** The judge's system text: what `evals/status-judge.md` in the repo at `root` holds below its `---` line. */
export function judgeSystemText(root: string): string {
  const judgeFile = readFileSync(join(root, 'evals', 'status-judge.md'), 'utf8')
  const separatorAt = judgeFile.indexOf(JUDGE_SEPARATOR)

  return separatorAt === -1 ? '' : judgeFile.slice(separatorAt + JUDGE_SEPARATOR.length).trim()
}
