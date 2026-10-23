import type { Closed, Finding, Item, Ledger, Overview, Told } from '../types'

export type { Told } from '../types'
import type { Exchange } from './ledger'
import { isAskedForChoices, LIST_CHOICES } from './ledger'
import {
  DETAIL_WORDS,
  HEADLINE_WORDS,
  ITEM_WORDS,
  LIST_ITEMS,
  overviewText,
  SENTENCE_WORDS,
  sinceText,
} from './overview'
import { clip, clipMiddle, numberBlocks } from './text'

const NL = '\n'

const MODEL_KIND: Record<Item['kind'], 'decide' | 'do'> = { question: 'decide', task: 'do' }

export function systemText(host: Host): string {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : ''

  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <card>: the ledger before this exchange (may be empty)
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: the agent's final reply
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text.

GOAL: what this session is for, at most 12 words. Keep the previous goal unless the person clearly changed direction. "-" until the person has asked for something.
DONE: one finished outcome, at most 8 words. Up to 4 DONE lines, oldest first, keeping the most recent. Outcomes, not activity: "PR #12 opened", not "ran gh".
NOW: where the work stands at the end of this reply, at most 12 words. Name what it waits on, if anything. "-" when no work has started.
RUNNING: something still running that the person may open, as "name: URL or port". Dev servers, simulators, background jobs. Omit anything the agent stopped. Zero or more lines.
CLOSED: <id> | the outcome, at most 8 words, in one of three forms. When the person answered in <person>, write their answer. Otherwise write "done: <what the agent did>" when the work is done, or "no longer applies: <what in the reply or <activity> made it moot>". An option the agent picked on its own, or an option the work made moot, is not the person's answer: write it in the "done:" or "no longer applies:" form. One line for each item in <open> the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers), or that the reply or <activity> shows is done or no longer applies. A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. An item that has nothing to do with this exchange stays open: being outside the current work, or not being mentioned, does not make it no longer apply.
FIXED: <id> | the change that fixed it, at most 8 words. One line for each finding in <findings> whose problem the reply, <activity> or <person> shows was fixed by a change to the work. Only a change fixes a finding. When the person puts a finding off, sets it aside or says it does not matter, write no FIXED line: it stays open until they dismiss it.
ASKED: <id> | <item>
  For a finding in <findings> that a NEW line or an item in <open> asks the person about. item: "new N" for the Nth NEW line in your answer, or an id from <open>. The item takes the finding's place, so the person sees it once.
NEW: <kind> | <label> | <ask> | <options> | <rec>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide or do something about it now; then also write an ASKED line for it. Also one line per dialog in <activity> that the person dismissed or left unanswered, with an ASKED line when the dialog asks about a finding. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means. Name an item or finding by what it says, never by its id: the person does not see ids.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  Skip: rhetorical questions; offers to go on with the next step of the task the person already asked for ("Want me to start on the next file?"); FYIs; generic "let me know", though the agent holding an act that changes or publishes something (commit, push, edit a shared page) until the person agrees is a "decide" item ("Say when you want those committed"); invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
UPDATE: <id> | <options> | <rec>
  For a "decide" item in <open> when the reply now offers it different answers, or states a recommendation for it that <open> does not show. options: the answers the person can now pick, as in NEW, or "-" to keep them. rec: as in NEW, or "-" to keep it. Rewording the question is not a change.
HELP: <item> | <kind> | <value> | <name>
  A step that does part of an item's work in one press, when the reply or activity already spells it out: the file to edit, the text to paste, the command to run, the page to visit. Not background reading. Up to 3 per item, most useful first.
  item: "new N" for the Nth NEW line in your answer, or an id from <open>.
  kind and value:
    open | a file or folder the person needs to open or edit, the path as written
    copy | text for the person to paste into a file or form, never a command: "block N" for the code block marked [block N] in <reply>, or one line of text
    run | a shell command the reply asks the person to run or approve: "block N" or the command
    terminal | a shell command the reply says only the person can run, because it needs their credentials, password, device or account. The command a "do" item asks the person to run is always terminal: "block N" or the command
    link | an https URL the person needs to visit
  name: what a copy, command or link is, at most 3 words ("settings snippet", "removal command", "token page"), or "-".
  Use only paths, commands, text and URLs that appear in <reply> or <activity>. Never invent one.
TODO: <work>
  For a todo in <person>: work the person sets aside for later, as in "todo: X", and the reply leaves undone. work: at most 12 words, worded to follow "Ready to start on".

Write plainly. No jargon, no filler, no markdown.`
}

export function guidanceText(host: Host): string {
  return `# Inbox
${host.intro}

When you ask the user to decide something, say which option you recommend and why, in one clause ("I'd go with B: it keeps the old API"). If you cannot recommend one, say what would decide it.

Before you hand the user a step, take it yourself when your tools reach it, such as running a command, reloading or checking a page, or reading a log. When the step changes something other people see, such as marking a PR ready or pushing, ask for their OK as a question and take the step when they say yes. Record a task only for a step your tools cannot reach, and say in your reply why you cannot take it.

When you ask the user to do something, such as review a page, sign in or run a command, give them what they need in the same reply: the link, file path or command, what to do there, and how the result gets back to you. If the result would stay where you cannot read it, such as in their browser, give them a way to send it to you.

Ask in your reply as a direct question, and record the same ask in that turn with ${host.recordTool}, so it stays in the inbox after the conversation moves on. Record a decision, an approval or information you need as a question, with its options and the one you recommend. Record an act you hold until the user says so the same way. Record a step only the user can take as a task, with its steps. Record each one once. Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Check it once before you record it, by reading the code or running a quick command, so the finding says what is true. Record it with ${host.recordTool} as a finding, then go on with the task; fixing it waits until the user asks. Record one too when you work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them, and when part of your change cannot be checked from where you are. State those in your reply as well. Mention any other finding only when it bears on what the user asked.

These are not findings. Handle them in the task and your reply instead:
- A problem in your own change or inside the task: fix it.
- A check you could run yourself: run it, or say in your reply that you have not.
- Progress, status, or an approach you tried and dropped: say it.
- Something only the user can do or decide, such as an approval, a sign-in or a choice: ask it, and record it as a question or task.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as (close id: i35), and anything it does not list is closed. Check it before telling the user that something is open or waits on them. The ids are for the inbox tools only. The user never sees them, so never write one to the user, not even in parentheses: name an item or finding by what it says, as "the deploy task" or "the migration finding".

Close with ${host.closeTool}:
- When the user's message answers an open item, close it first, before other work, with their answer, and say in your reply what you took their answer to be.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`
}

/** Claude Code sends only this many characters of a tool's description when the tool is not behind tool search. */
export const MAX_TOOL_DESCRIPTION = 4096

/** `record`'s own description leaves too little room under `MAX_TOOL_DESCRIPTION` for the guidance, so `close` carries it. */
export function guidedCloseDescription(host: Host, description: string): string {
  return `${description}\n\n${guidanceText(host)}`
}

export const START_TITLE =
  'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.'

const CATCH_UP =
  'The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>.'

export function catchUpPrompt(host: Host, ledger: Ledger, screen: string): string {
  return [
    'Pause the task. Do not use tools. Instead, act as the ledger keeper described below, over this whole conversation.',
    `Treat the whole conversation as the exchange. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<screen>${NL}${screen}${NL}</screen>`,
    'Code blocks here carry no [block N] marker, so a copy HELP must be one line of text.',
    '',
    systemText(host),
  ].join(NL)
}

export function transcriptCatchUpPrompt(ledger: Ledger, screen: string, transcript: string): string {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<conversation>${NL}${numberBlocks(transcript)}${NL}</conversation>`,
    `<screen>${NL}${screen}${NL}</screen>`,
  ].join(NL)
}

const MAX_ACTIVITY = 40

export function addActivity(activity: string[], line: string | null): string[] {
  return !line || activity.length >= MAX_ACTIVITY || activity.includes(line) ? activity : [...activity, line]
}

export function toolActivity(tool: string, input: Record<string, unknown>): string | null {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  switch (tool) {
    case 'Bash':
      return `${input.run_in_background ? 'started in background' : 'ran'}: ${text('command').slice(0, 140)}`
    case 'Edit':
    case 'Write':
      return `edited ${text('file_path')}`
    case 'Skill':
      return `used skill ${text('skill')}`
    case 'Agent':
      return `started agent: ${text('description')}`
  }

  return tool.startsWith('mcp__') ? `called ${tool.slice(5)}` : null
}

export type DialogQuestion = { question: string; options: string[] }

export type DialogOutcome =
  | { kind: 'answered'; answer: string }
  | { kind: 'timed-out'; answer: string }
  | { kind: 'dismissed' }
  | { kind: 'open' }

const DIALOG_QUESTIONS_SHOWN = 3
const DIALOG_QUESTION_MAX = 200
const DIALOG_OPTIONS_SHOWN = 6
const DIALOG_OPTION_MAX = 60
const DIALOG_ANSWER_MAX = 400
const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i

/**
 * The questions of a dialog tool's input. Claude's AskUserQuestion gives `question` and options with a `label`.
 * Codex's `request_user_input_async` gives `title` and plain option strings.
 */
export function dialogQuestions(raw: unknown): DialogQuestion[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((q: unknown) => {
    const fields = (q ?? {}) as Record<string, unknown>
    const text = [fields.question, fields.title].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    if (!text) return []
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o: unknown) => {
      const label = typeof o === 'string' ? o : (o as { label?: unknown } | null)?.label

      return typeof label === 'string' && label.trim() !== '' ? [label.trim()] : []
    })

    return [{ question: text.trim(), options }]
  })
}

function dialogQuestionText(q: DialogQuestion): string {
  const shown = q.options.slice(0, DIALOG_OPTIONS_SHOWN).map(label => {
    const plain = label.replace(RECOMMENDED_SUFFIX, '')
    const text = clip(plain, DIALOG_OPTION_MAX)

    return plain === label ? text : `${text} (recommended)`
  })
  const more = q.options.length > shown.length ? ` / and ${q.options.length - shown.length} more` : ''
  const options = shown.length > 0 ? ` (options: ${shown.join(' / ')}${more})` : ''

  return `"${clip(q.question.replaceAll('"', "'"), DIALOG_QUESTION_MAX)}"${options}`
}

/** The activity line for a dialog the agent put to the person, with the questions and how it ended. */
export function dialogActivity(questions: DialogQuestion[], outcome: DialogOutcome): string {
  const shown = questions.slice(0, DIALOG_QUESTIONS_SHOWN).map(dialogQuestionText)
  const more = questions.length - shown.length
  const asked = shown.length > 0 ? `: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}` : ''
  const head = `asked the user in a dialog${asked}`
  switch (outcome.kind) {
    case 'answered':
      return `${head}; answer: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`
    case 'timed-out':
      return `${head}; it timed out while the user was away, so the user did not answer; it went on with: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`
    case 'dismissed':
      return `${head}; the user dismissed it without answering`
    case 'open':
      return `${head}; still open, waiting on the user's answer`
  }
}

function ledgerBlocks(ledger: Ledger): string[] {
  const card = ledger.card
    ? [
        `GOAL: ${ledger.card.goal}`,
        ...ledger.card.done.map(d => `DONE: ${d}`),
        `NOW: ${ledger.card.now}`,
        ...ledger.card.running.map(r => `RUNNING: ${r}`),
      ].join(NL)
    : ''
  const open = ledger.items
    .map(
      i =>
        `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? '-'} | ${i.ask} | ${i.options.join(' / ') || '-'} | ${i.rec ?? '-'}`,
    )
    .join(NL)
  const findings = ledger.findings.map(f => `${f.id} | ${f.kind}: ${f.title}`).join(NL)
  const closed = ledger.closed
    .filter(d => d.how !== 'expired' && !isAskedForChoices(d))
    .map(d => `${d.ask} → ${outcomeText(d)}`)
    .join(NL)

  return [
    `<card>${NL}${card}${NL}</card>`,
    `<open>${NL}${open}${NL}</open>`,
    `<findings>${NL}${findings}${NL}</findings>`,
    `<decided>${NL}${closed}${NL}</decided>`,
  ]
}

export function buildPrompt(ledger: Ledger, ex: Exchange): string {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? 'unknown'}.)`

  return [
    ...ledgerBlocks(ledger),
    `<person>${NL}${clipMiddle(person, 4000, 1500)}${NL}</person>`,
    `<activity>${NL}${clipMiddle(ex.activity.join(NL), 2500, 500)}${NL}</activity>`,
    `<reply>${NL}${clipMiddle(numberBlocks(ex.reply), 12000, 4000)}${NL}</reply>`,
    `<screen>${NL}${ex.screen}${NL}</screen>`,
  ].join(NL)
}

export type Host = {
  agent: string
  surface: string
  /** Where the person always sees how many items and findings are open, besides the surface; null when only the surface shows them. */
  band: string | null
  findingsIn: string
  /** The names the agent calls the inbox tools by. */
  recordTool: string
  closeTool: string
  /** The first paragraph of `guidanceText`: what the inbox shows the person, and where. */
  intro: string
}

export const CLAUDE_CODE: Host = {
  agent: 'Claude',
  surface: 'the /inbox pane',
  band: 'a band above their prompt',
  findingsIn: 'the Findings tab of the /inbox pane',
  recordTool: 'mcp__inbox__record',
  closeTool: 'mcp__inbox__close',
  intro:
    "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox pane, and your findings, in the pane's Findings tab. A band above their prompt shows only two counts: one for your questions and their tasks together, and one for your findings.",
}

/** The system text of the call that writes the Overview page, apart from the ledger call. */
export const OVERVIEW_SYSTEM = `You keep a one-page guide to a coding session, for the person who works with the agent. They read it when they come back, to see what the work is, how it is going and what comes next. You read the guide as it was and one exchange, and write the guide as it should be now.

The guide is about the work. It is not a log of what the agent did, and it is not a list of what waits on the person: the inbox lists that. Write at the level of the feature or the fix. Never write a command, a file name, a commit, a test run, a tool call or a ticket number, and leave out a number, an id or a time unless the person needs it to find the work again.

Input:
- <last>: the guide as it was, in the same lines you write
- <unseen>: the changes the person has not yet looked at, as SINCE lines
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: the agent's final reply

Answer with lines only. No other text. If the exchange changed nothing about the work, answer with the one line UNCHANGED.

Otherwise write every line below that applies, in this order:
KIND: session, or coordinator when the session hands out work and reviews what comes back instead of doing the work itself
TOPIC: same, or new when the work moved to a different task. Write new only for a different task, not for the next step of the same one.
STATE: on-track, stuck or finished
HEADLINE: one plain sentence naming what the session is doing, at most ${HEADLINE_WORDS} words. "-" when no work has started.
STATUS: how it is going, in one or two plain sentences, at most ${SENTENCE_WORDS} words. Say what it waits on, if anything.
COURSE: only in the reply where the approach changed, in one or two sentences, at most ${SENTENCE_WORDS} words: what changed and why. A new step is not a change. Leave the line out otherwise: the page keeps the last one until the person looks.
FOLDED: only when TOPIC is new, one line saying what the old topic was and where it was left.
Then lists, one item per line, each as KEY: status | text | detail, with the key on every line. The detail is optional. Text is at most ${ITEM_WORDS} words and detail at most ${DETAIL_WORDS}. At most ${LIST_ITEMS} items in a list.
QUEUE: the work now: what is under way, what is queued behind it, what waits, and what just finished
WORKS: what holds now: what works, what exists
OPEN: risks, problems and unknowns
NEXT: what comes next
SINCE: what changed since the person last looked. Start from <unseen>, merge this exchange into it, and keep it short.
STREAM: only in a coordinator session, in the same form as the other lists: one line for each stream of work, saying what it is for and where it stands. Put the work handed out in STREAM, and use QUEUE only for the coordinator's own steps.

Status is one of: working, queued, waits-on-you, waits-on-other, done, ruled-out, problem, unknown. Use waits-on-you when the agent cannot go on until the person acts, and waits-on-other for something else, such as a build. Use ruled-out for an approach tried or considered and dropped, and put the reason in the detail.

Rules:
- Keep an item until it is done, ruled out or no longer true. Do not reword an item that has not changed. The next rule wins over this one: when the guide as it was already repeats a fact in two lists, remove the repeat.
- Do not write a question or task the agent put to the person, and do not say what the choice is. Say only that the work waits on the person, and stop.
- Leave out that something was committed, pushed, merged or tested, in every line. Say what now works or is fixed.
- Say each fact once, in the list that fits it best. Work that finished stays in QUEUE as done. WORKS holds only what works that QUEUE does not already name. What a stream is doing, and what it finished, stays on its STREAM line and is not written again in QUEUE, WORKS or OPEN. NEXT holds only what the queue does not already name. SINCE may repeat the other lists, since it says what changed.
- Leave a list out when it has nothing worth saying. Do not fill a list to fill it.`

function overviewBlocks(last: Overview | null): string[] {
  return [`<last>${NL}${overviewText(last)}${NL}</last>`, `<unseen>${NL}${sinceText(last)}${NL}</unseen>`]
}

/** `last` is the Overview before the exchange. */
export function overviewPrompt(last: Overview | null, ex: Exchange): string {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? 'unknown'}.)`

  return [
    ...overviewBlocks(last),
    `<person>${NL}${clipMiddle(person, 4000, 1500)}${NL}</person>`,
    `<activity>${NL}${clipMiddle(ex.activity.join(NL), 2500, 500)}${NL}</activity>`,
    `<reply>${NL}${clipMiddle(numberBlocks(ex.reply), 12000, 4000)}${NL}</reply>`,
  ].join(NL)
}

export function overviewCatchUpPrompt(last: Overview | null, transcript: string): string {
  return [
    'Treat the conversation in <conversation> as the exchange. Its start may be cut. Write the guide as it stands at the end of the conversation.',
    ...overviewBlocks(last),
    `<conversation>${NL}${numberBlocks(transcript)}${NL}</conversation>`,
  ].join(NL)
}

function surfaceAtStart(host: Host): string {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1)
}

/** The tab the inbox shows: its label, and whether it shows a page instead of rows. */
export type ScreenTab = { label: string; isPage: boolean }

export function screenText(host: Host, isOpen: boolean, tab: ScreenTab | null): string {
  if (!isOpen) return `${surfaceAtStart(host)} is closed.`
  if (tab?.isPage)
    return `${surfaceAtStart(host)} is open beside the conversation, on its ${tab.label} tab, which shows a guide to the session's work, not rows.`

  return `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab.label} tab, ` : ''}listing every open item.`
}

export function latestBatch(ledger: Ledger): Item[] {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter(i => i.turn === ledger.batchTurn)
}

function describe(item: Item): string {
  const parts = [`"${item.ask}"`]
  if (item.options.length > 0) parts.push(`options: ${item.options.join(' / ')}`)
  if (item.rec) parts.push(`recommended: ${item.rec}`)
  if (item.kind === 'task') parts.push('an action for the user')

  return parts.join('; ')
}

function numberOf(label: string | null): number | null {
  const m = label?.match(/(?:^|[^A-Za-z\d])(?:[QqDd#]\s?)?(\d{1,2})(?!\d)/)

  return m ? Number(m[1]) : null
}

function answerableBatch(ledger: Ledger, promptTurn: number): Item[] {
  return ledger.batchTurn === promptTurn - 1 ? latestBatch(ledger) : []
}

function batchNumbers(batch: Item[]): Map<number, Item> {
  const hasLabels = batch.some(i => numberOf(i.label) !== null)
  const byNumber = new Map<number, Item>()
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1
    if (n !== null && !byNumber.has(n)) byNumber.set(n, item)
  })

  return byNumber
}

export function questionNumbers(ledger: Ledger, promptTurn: number): Map<string, number> {
  const numbers = new Map<string, number>()
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === 'question') numbers.set(item.id, n)

  return numbers
}

const LINE_ANSWER = /(?:^|\n)\s*(?:[QqDd#]\s?)?(\d{1,2})\s*[.):\-–]\s*\S/g

const INLINE_ANSWER = /\s(?:[QqDd#]\s?)?(\d{1,2})\s*[.)]\s+\S/g

const ACCEPT_ALL =
  /^\s*(go|go ahead|yes|yep|yeah|sure|ok|okay|sgtm|lgtm|sounds good|do it|proceed|all good|ship it)\s*[.!]*\s*$/i

const ACCEPT_RECS = /\b(all|both|everything|your)\b[^.\n]{0,40}\b(recommend\w*|recs?|suggest\w*|picks?|calls?)\b/i

export function answerNote(ledger: Ledger, text: string): string | null {
  const lines: string[] = []
  const batch = answerableBatch(ledger, ledger.turn)

  if (batch.length > 0) {
    const numbers = new Set<number>()
    for (const m of text.matchAll(LINE_ANSWER)) numbers.add(Number(m[1]))
    if (/^\s*(?:[QqDd#]\s?)?\d{1,2}\s*[.):\-–]\s/.test(text)) {
      for (const m of text.matchAll(INLINE_ANSWER)) numbers.add(Number(m[1]))
    }
    const byNumber = batchNumbers(batch)
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const item = byNumber.get(n)
      if (item) lines.push(`- ${n} → ${describe(item)}`)
    }
    if (lines.length === 0 && (ACCEPT_ALL.test(text) || ACCEPT_RECS.test(text))) {
      const withRecs = batch.filter(i => i.rec)
      if (withRecs.length > 0) {
        return [
          'inbox: if the user is accepting your recommendations, these are the open ones:',
          ...withRecs.map(i => `- ${i.label ?? '•'} → ${describe(i)}`),
        ].join(NL)
      }
    }
  }

  return lines.length === 0
    ? null
    : ["inbox: the user's message answers these open items from your earlier replies:", ...lines].join(NL)
}

function itemLine(item: Item): string {
  return `- ${item.label ? `(${item.label}) ` : ''}${describe(item)} (close id: ${item.id})`
}

function findingLine(finding: Finding): string {
  return `- ${finding.kind}: ${finding.title} (close id: ${finding.id})`
}

function cardLines(ledger: Ledger): string[] {
  const card = ledger.card
  if (!card) return []
  const out: string[] = []
  if (card.goal) out.push(`Goal: ${card.goal}`)
  if (card.done.length > 0) out.push(`Done: ${card.done.join('; ')}`)
  if (card.now) out.push(`Now: ${card.now}`)
  if (card.running.length > 0) out.push(`Running: ${card.running.join('; ')}`)

  return out
}

export const CARD_TITLE =
  'inbox: where the work stood at the last reply. The "inbox:" text beside this prompt lists what waits on the user and what was closed.'

/** The mod's carry at a conversation's first prompt. The `inbox:` text beside that prompt already lists the open items and the closed ones. */
export function cardCarryText(ledger: Ledger): string | null {
  const lines = cardLines(ledger)

  return lines.length === 0 ? null : [CARD_TITLE, ...lines].join(NL)
}

export function carryText(ledger: Ledger, title: string): string | null {
  const findings = ledger.findings
  if (!ledger.card && ledger.items.length === 0 && findings.length === 0) return null
  const out = [title, ...cardLines(ledger)]
  if (ledger.items.length > 0) {
    out.push('Waiting on the user:')
    for (const item of ledger.items) out.push(itemLine(item))
  }
  if (findings.length > 0) {
    out.push('Findings you recorded, still open:')
    for (const f of findings) out.push(findingLine(f))
  }
  if (ledger.closed.length > 0) {
    out.push('Recently closed:')
    for (const d of ledger.closed) out.push(`- "${d.ask}" → ${outcomeText(d)}`)
  }

  return out.join(NL)
}

export const CLOSE_ID_RULE = 'A close id is only for the close tool. Never write one in a reply.'

export function inboxText(host: Host, ledger: Ledger, isOpen: boolean): string {
  const out = [
    `inbox: what waits on the user, as of your last reply. Anything not listed here is closed. ${CLOSE_ID_RULE}`,
  ]
  if (ledger.items.length > 0) {
    out.push('Waiting on the user:')
    for (const item of ledger.items) out.push(itemLine(item))
  } else {
    out.push('Nothing is waiting on the user.')
  }
  if (ledger.findings.length > 0) {
    out.push('Findings you recorded, still open:')
    for (const f of ledger.findings) out.push(findingLine(f))
  }
  out.push(isOpen ? `The user has ${host.surface} open beside the conversation.` : `${surfaceAtStart(host)} is closed.`)

  return out.join(NL)
}

function outcomeText(d: Closed): string {
  if (d.how === 'dismissed') return 'dismissed by the user'
  if (d.how === 'expired') return 'expired before the user answered'

  return d.outcome
}

export function closedText(closed: Closed[]): string | null {
  if (closed.length === 0) return null
  const advice = (d: Closed) =>
    d.how === 'dismissed'
      ? '. Ask it again only if the user brings it up.'
      : d.how === 'expired'
        ? '. Ask it again if it still matters.'
        : ''

  return [
    'Closed since you last read the inbox:',
    ...closed.map(d => `- "${d.ask}" → ${outcomeText(d)}${advice(d)}`),
  ].join(NL)
}

export const TOLD_NOTHING: Told = { inbox: null, closed: [] }

export function promptNotes(
  host: Host,
  ledger: Ledger,
  prompt: { text: string; isPress: boolean; isOpen: boolean },
  told: Told,
): { notes: string[]; told: Told } {
  const notes: string[] = []
  const answer = prompt.isPress ? null : answerNote(ledger, prompt.text)
  if (answer) notes.push(answer)
  const inbox = inboxText(host, ledger, prompt.isOpen)
  const toldClosed = new Set(told.closed)
  const closed = closedText(ledger.closed.filter(d => !toldClosed.has(d.id)))
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0
  if (!closed && (inbox === told.inbox || (isEmpty && told.inbox === null))) return { notes, told }
  notes.push(closed ? `${inbox}${NL}${closed}` : inbox)

  return { notes, told: { inbox, closed: ledger.closed.map(d => d.id) } }
}
