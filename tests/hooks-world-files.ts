const answer = (exitCode: number, stderr = '') => ({
  exitCode,
  stdout: '',
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

export function fileCommand(argv: readonly string[], written: Record<string, string>, isMoveFailing: boolean) {
  if (argv[0] === 'chmod') {
    const operands = argv[1] === '--' ? argv.slice(3) : argv.slice(2)
    const missing = operands.find(path => !(path in written))
    return missing === undefined ? answer(0) : answer(1, `chmod: ${missing}: No such file or directory\n`)
  }
  const paths = argv.slice(argv.indexOf('--') + 1)
  const [from = '', to = ''] = paths
  if (argv[0] === 'mv' && isMoveFailing) return answer(1, 'mv: rename failed')
  if (argv[0] === 'mv') written[to] = written[from] ?? ''
  for (const path of argv[0] === 'mv' ? [from] : paths) delete written[path]

  return answer(0)
}
