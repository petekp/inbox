import type { Help, Item, Ledger } from '../types'
import { keyWords, recommendedOption, words } from './ask-match'
import { codeBlocks, dash } from './text'

const NL = '\n'
const MAX_HELPS = 3

/** Reads a kind the model wrote or an older version saved; anything but a task is a question. */
export function readKind(kind: string | null | undefined): Item['kind'] {
  return kind === 'task' || kind === 'do' ? 'task' : 'question'
}

/**
 * Commands that sign in or ask for a password. They need the person's own
 * terminal, so their button copies them instead of asking Claude to run them.
 * Each word counts only as a command or subcommand, as in `gh auth login`, so a
 * path or URL holding it, as in `curl https://x/login`, stays the agent's to run.
 */
const NEEDS_PERSON =
  /(?:^|[\s;&|])(?:login|logout|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen)(?=[\s:]|$)|\binit --interactive\b/i

/**
 * Words a reply uses when only the person can run a command: their credentials, device or account. The inbox
 * model sometimes marks a command the reply merely asks the person to run as theirs, so a terminal step in a
 * reply with none of these words is the agent's to run.
 */
const PERSON_ONLY_REASON =
  /credential|password|passphrase|secret|\btoken|\b2fa\b|\bmfa\b|\bdevice\b|phone|android|tablet|account|sign(?:ed)?[- ]?in|log(?:ged)?[- ]?in|only you|you hold|your (?:mac|machine|laptop|computer|keychain)|\bsudo\b/i

export type Update = {
  closed: { id: string; outcome: string }[]
  added: (Omit<Item, 'id' | 'turn' | 'at' | 'helps' | 'from'> & { helps: Help[] })[]
  helped: { id: string; help: Help }[]
  /** New options or a new recommendation for open questions. Null keeps what the question has. */
  updated: { id: string; options: string[] | null; rec: string | null }[]
  /** Findings an item now asks about: an open item's id, or the place of a NEW item in `added`. */
  asked: { id: string; item: string | number }[]
  todos: string[]
}

function readHelp(
  kind: string,
  value: string,
  name: string | null,
  blocks: string[],
  source: string | null,
): Help | null {
  const isQuoted = (text: string) => source === null || source.includes(text)
  const block = value.match(/^block\s+(\d+)$/i)
  const quoted = block ? (blocks[Number(block[1]) - 1] ?? '') : value.replace(/^`|`$/g, '')
  const isFromReply = (text: string) => block !== null || isQuoted(text)
  if (kind === 'open') {
    const path = value.replace(/^`|`$/g, '')
    const isPath = /[/.~]/.test(path) && !/^[a-z]+:/i.test(path) && path.length <= 300
    const standsAlone = (text: string) => new RegExp(`(?<![\\w.~-])${escaped(path)}(?![\\w/-])`).test(text)
    return isPath && (source === null || standsAlone(source)) ? { kind, path } : null
  }
  if (kind === 'copy') {
    return quoted.trim() !== '' && quoted.length <= 8000 && isFromReply(quoted) ? { kind, text: quoted, name } : null
  }
  if (kind === 'run' || kind === 'terminal') {
    const command = commandText(quoted)
    const isUsable = command !== '' && command.length <= 4000 && isFromReply(command)
    const isTheirs =
      NEEDS_PERSON.test(command) || (kind === 'terminal' && (source === null || PERSON_ONLY_REASON.test(source)))
    return isUsable ? { kind: isTheirs ? 'terminal' : 'run', command, name } : null
  }
  if (kind === 'link') {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && isQuoted(value) ? { kind, url: url.href, name } : null
    } catch {
      return null
    }
  }

  return null
}

function helpFields(tail: string[], source: string | null): { help: string; name: string | null } {
  const whole = tail.join('|').trim()
  if (tail.length <= 1 || (source !== null && source.includes(commandText(whole.replace(/^`|`$/g, '')))))
    return { help: whole, name: null }

  return { help: tail.slice(0, -1).join('|').trim(), name: dash(tail.at(-1)) }
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandText(text: string): string {
  return text.trim().replace(/^!\s*/, '')
}

function commandOf(help: Help): string | null {
  if (isCommand(help)) return help.command
  if (help.kind === 'copy') return commandText(help.text)

  return null
}

function isCommand(help: Help): help is Extract<Help, { kind: 'run' | 'terminal' }> {
  return help.kind === 'run' || help.kind === 'terminal'
}

function helpTarget(help: Help): string {
  if (help.kind === 'open') return `open ${help.path}`
  if (help.kind === 'link') return `link ${help.url}`

  return `command ${commandOf(help)}`
}

export function withHelp(helps: Help[], help: Help): Help[] {
  const command = commandOf(help)
  const kept = isCommand(help) ? helps.filter(h => h.kind !== 'copy' || commandOf(h) !== command) : helps
  const isCovered = kept.some(h => helpTarget(h) === helpTarget(help))

  return isCovered || kept.length >= MAX_HELPS ? kept : [...kept, help]
}

/**
 * The open tasks a shell command the person ran completes: those whose run or
 * sign-in step is that exact command, so nothing closes on a guess.
 */
export function tasksRunBy(ledger: Ledger, command: string): Item[] {
  const typed = squash(command)

  return ledger.items.filter(i => i.kind === 'task' && i.helps.some(h => isCommand(h) && squash(h.command) === typed))
}

function squash(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

const KEY_LINE = /^\s*[-*]?\s*(?:(NONE)(?::|\s|$)|(CLOSED|FIXED|ASKED|NEW|UPDATE|HELP|TODO)\s*:)\s*(.*)$/

function keyOf(line: string): { key: string; value: string } | null {
  const m = KEY_LINE.exec(line)

  return m ? { key: (m[1] ?? m[2])!, value: m[3] ?? '' } : null
}

/**
 * The model sometimes writes an answer, then a prose line that corrects it, and a whole second answer. The answer
 * it settled on is the last run of key lines that follows a prose line after an earlier run.
 */
function lastAnswerStart(lines: string[]): number {
  let start = 0
  let hasKeys = false
  let isAfterProse = false
  lines.forEach((line, i) => {
    if (keyOf(line)) {
      if (hasKeys && isAfterProse) start = i
      hasKeys = true
      isAfterProse = false
    } else if (line.trim() !== '') isAfterProse = true
  })

  return start
}

/**
 * Reads the model's line format; null when no known key appears. `source` is
 * the reply followed by the activity: HELP values must appear in it, and
 * "copy | block N" names its code blocks. Null skips both, so block copies drop.
 */
export function parseReply(text: string, source: string | null = null): Update | null {
  const blocks = source === null ? [] : codeBlocks(source)
  const closed: Update['closed'] = []
  const added: Update['added'] = []
  const helped: Update['helped'] = []
  const updated: Update['updated'] = []
  const helps: { target: string; help: Help }[] = []
  const asks: { id: string; target: string }[] = []
  const todos: string[] = []
  let seen = 0
  const lines = text.split(NL)
  const newLines: (Update['added'][number] | undefined)[] = []

  for (const raw of lines.slice(lastAnswerStart(lines))) {
    const parsed = keyOf(raw)
    if (!parsed) continue
    seen += 1
    const key = parsed.key
    const value = dash(parsed.value) ?? ''
    if (key === 'NONE') continue
    if (key === 'CLOSED' || key === 'FIXED') {
      const [id, outcome] = value.split('|').map(s => s.trim())
      if (id && /^f\d/.test(id) === (key === 'FIXED')) closed.push({ id, outcome: outcome ?? '' })
    } else if (key === 'ASKED') {
      const [id, target] = value.split('|').map(s => s.trim())
      if (id && /^f\d+$/.test(id) && target) asks.push({ id, target })
    } else if (key === 'NEW') {
      const fields = value.split('|')
      const isLabelSkipped = !dash(fields[2]) && /\s/.test((fields[1] ?? '').trim())
      const [kind, label, ask, ...rest] = (isLabelSkipped ? [fields[0], '-', ...fields.slice(1)] : fields).map(dash)
      // A sixth field is the design mark only when it reads "design" or "-", so an answer written after a stray "|"
      // in an older five-field line stays an answer.
      const last = rest.at(-1)
      const isDesignField = rest.length > 2 && (last === null || /^design$/i.test(last ?? ''))
      if (isDesignField) rest.pop()
      const rec = rest.length > 1 ? rest.pop() : null
      if (!ask) {
        newLines.push(undefined)
        continue
      }
      const options = rest.flatMap(o => o?.split(/\s+\/\s+/) ?? []).filter(Boolean)
      const isDesignChoice = isDesignField && last !== null && readKind(kind) === 'question'
      const item = {
        kind: readKind(kind),
        label: label ?? null,
        ask,
        options,
        rec: recommendedOption(options, rec ?? null),
        helps: [],
        ...(isDesignChoice ? { isDesignChoice } : {}),
      }
      added.push(item)
      newLines.push(item)
    } else if (key === 'TODO' && value && !isTakenUp(value, source)) {
      todos.push(value)
    } else if (key === 'UPDATE') {
      const [target, options, rec] = value.split('|').map(dash)
      const id = target?.match(/\b(i\d+)\b/)?.[1]
      if (id)
        updated.push({ id, options: options ? options.split(/\s+\/\s+/).filter(Boolean) : null, rec: rec ?? null })
    } else if (key === 'HELP') {
      const [target, kind, ...tail] = value.split('|')
      const { help, name } = helpFields(tail, source)
      const parsed = readHelp((kind ?? '').trim(), help, name, blocks, source)
      if (parsed && target) helps.push({ target: target.trim(), help: parsed })
    }
  }
  for (const { target, help } of helps) {
    // Lenient about extra words: the model sometimes writes "open i9" for "i9".
    const n = target.match(/\bnew\s*(\d+)\b/i)
    const id = target.match(/\b(i\d+)\b/)?.[1]
    const item = n ? newLines[Number(n[1]) - 1] : undefined
    if (item) item.helps = withHelp(item.helps, help)
    else if (!n && id) helped.push({ id, help })
  }
  const asked: Update['asked'] = []
  for (const { id, target } of asks) {
    const n = target.match(/\bnew\s*(\d+)\b/i)
    const item = n ? added.indexOf(newLines[Number(n[1]) - 1]!) : target.match(/\b(i\d+)\b/)?.[1]
    if (item !== undefined && item !== -1) asked.push({ id, item })
  }

  return seen === 0 ? null : { closed, added, helped, updated, asked, todos }
}

function isTakenUp(work: string, reply: string | null): boolean {
  const key = [...keyWords(work)]
  const said = new Set(words(reply ?? ''))

  return key.length > 0 && key.filter(w => said.has(w)).length * 2 >= key.length
}

export function todoAsk(work: string): string {
  return `Ready to start on ${work.replace(/[.?!\s]+$/, '')}?`
}

/** A step for a task: a link, a file or a command. Anything else is not usable and returns null. */
export function stepHelp(step: string): Help | null {
  const value = step.trim()
  if (/^https?:\/\//i.test(value)) return readHelp('link', value, null, [], null)
  if (/^(?:\/|~\/|\.{1,2}\/)\S*$/.test(value)) return readHelp('open', value, null, [], null)

  const isSentence = /^[A-Z][a-z]+\s+[a-z]/.test(value) || /[.!?]$/.test(value)

  return value !== '' && !isSentence ? readHelp('terminal', value, null, [], null) : null
}
