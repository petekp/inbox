import type { Closed, DialogQuestion, Finding, HostTask, Item, Ledger, SessionStatus, Session, Told } from '../types'

export type { Told } from '../types'
import type { Exchange } from './ledger'
import { isAskedForChoices, LIST_CHOICES } from './ledger'
import {
  asksText,
  DESCRIPTION_WORDS,
  isOpen,
  NAME_WORDS,
  OPEN_SUBJECTS,
  runningText,
  subjectsText,
  TEXT_WORDS,
} from './status'
import { tasksText } from './host-tasks'
import { clip, clipMiddle, numberBlocks } from './text'

const NL = '\n'

const MODEL_KIND: Record<Item['kind'], 'decide' | 'do'> = { question: 'decide', task: 'do' }

export function systemText(host: Host): string {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : ''

  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec | design
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: what the agent said this turn, in order
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text. When nothing in the exchange changes the ledger, answer with the one line NONE.

NONE: nothing in the exchange changes the ledger. Write it alone.
CLOSED: <id> | the outcome, at most 8 words, in one of three forms. When the person answered in <person>, write their answer. Otherwise write "done: <what the agent did>" when the work is done, or "no longer applies: <what in the reply or <activity> made it moot>". An option the agent picked on its own, or an option the work made moot, is not the person's answer: write it in the "done:" or "no longer applies:" form. One line for each item in <open> the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers), or that the reply or <activity> shows is done or no longer applies. A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. An item that has nothing to do with this exchange stays open: being outside the current work, or not being mentioned, does not make it no longer apply.
FIXED: <id> | the change that fixed it, at most 8 words. One line for each finding in <findings> whose problem the reply, <activity> or <person> shows was fixed by a change to the work. Only a change fixes a finding. When the person puts a finding off, sets it aside or says it does not matter, write no FIXED line: it stays open until they dismiss it.
ASKED: <id> | <item>
  For a finding in <findings> that a NEW line or an item in <open> asks the person about. item: "new N" for the Nth NEW line in your answer, or an id from <open>. The item takes the finding's place, so the person sees it once.
NEW: <kind> | <label> | <ask> | <options> | <rec> | <design>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide or do something about it now; then also write an ASKED line for it. Also one line per dialog in <activity> that the person dismissed or left unanswered, with an ASKED line when the dialog asks about a finding. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means. Name an item or finding by what it says, never by its id: the person does not see ids.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  design: "design" for a "decide" item whose options are designs or approaches the agent could try and show side by side, such as two layouts or two ways to build a feature. Otherwise "-", as for a fact, an approval or a preference.
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

export type { DialogQuestion }

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
export const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i

/**
 * The questions of a dialog tool's input. Claude's AskUserQuestion and omp's ask give `question` and options with a
 * `label` and an optional `description`. Codex's `request_user_input_async` gives `title` and plain option strings.
 */
export function dialogQuestions(raw: unknown): DialogQuestion[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((q: unknown) => {
    const fields = (q ?? {}) as Record<string, unknown>
    const text = [fields.question, fields.title].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    if (!text) return []
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o: unknown) => {
      const option = typeof o === 'string' ? { label: o } : ((o ?? {}) as { label?: unknown; description?: unknown })
      const label = typeof option.label === 'string' ? option.label.trim() : ''
      const description = typeof option.description === 'string' ? option.description.trim() : ''

      return label === '' ? [] : [{ label, description }]
    })

    return [
      {
        question: text.trim(),
        options: options.map(o => o.label),
        descriptions: Object.fromEntries(options.filter(o => o.description !== '').map(o => [o.label, o.description])),
      },
    ]
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
  const open = ledger.items
    .map(
      i =>
        `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? '-'} | ${i.ask} | ${i.options.join(' / ') || '-'} | ${i.rec ?? '-'} | ${i.isDesignChoice ? 'design' : '-'}`,
    )
    .join(NL)
  const findings = ledger.findings.map(f => `${f.id} | ${f.kind}: ${f.title}`).join(NL)
  const closed = ledger.closed
    .filter(d => d.how !== 'expired' && !isAskedForChoices(d))
    .map(d => `${d.ask} → ${outcomeText(d)}`)
    .join(NL)

  return [
    `<open>${NL}${open}${NL}</open>`,
    `<findings>${NL}${findings}${NL}</findings>`,
    `<decided>${NL}${closed}${NL}</decided>`,
  ]
}

export function buildPrompt(ledger: Ledger, ex: Exchange): string {
  const person = personText(ex.person, ex.trigger)

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
  /** Where the person sees their PRs. */
  prsIn: string
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
  findingsIn: 'the Finds tab of the /inbox pane',
  prsIn: 'the PRs tab of the /inbox pane',
  recordTool: 'mcp__inbox__record',
  closeTool: 'mcp__inbox__close',
  intro:
    "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox pane, and your findings, in the pane's Finds tab. A band above their prompt shows only two counts: one for your questions and their tasks together, and one for your findings.",
}

/** The system text of the call that changes the Status tab's list, apart from the ledger call. */
export const STATUS_SYSTEM = `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <head>: the top of the page, as title | description: what the session is focused on now. Never write it into a subject.
- <subjects>: the open subjects, one per line: id | status | name | where it stands
- <finished>: subjects already done or dropped. Do not add them again.
- <running>: work running apart from the turn, such as a subagent, a background task, a workflow or a delegate session, one per line: id | kind | name | the subject it belongs to, or - when it has none yet
- <asks>: the open questions and tasks the inbox shows the person, one per line: id | the ask | the subject it holds up, or - when it has none yet
- <tasks>: the agent's own task list, when it keeps one. It is evidence, not the list: write each subject at the level of the feature. A pending task for another part of the product, one the person would name on its own, is a queued subject.
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: what the agent said this turn, in order

Answer with lines only. No other text, and no corrections: every line you write is applied. When the exchange changed nothing about where any subject stands, and the head still holds, answer with the one line NO CHANGE. Most exchanges change nothing.

Otherwise write only the lines that apply:
NEW: status | name | where it stands
SET: id or name | status | where it stands
DONE: id or name | where it ended
DROP: id or name | why
DROP: id or name | why | INTO id or name
WAS: id or name | the plan it replaces
LINK: running or ask id | subject id or name
HEAD: title | description

A subject is one piece of the work that the person would name: a feature, a fix, a release, or a stream of work handed to another session. Keep at most ${OPEN_SUBJECTS} open. A fix, an option, a review or a question inside a larger piece of work belongs to that subject: change its text instead, as in "critique fixes: 4 of 9 done". A subject is never a command, a file, a commit, a test run or a tool call. A question to the person is never a subject of its own, and neither is a problem the agent noticed outside the work: the inbox shows those.

The name is a label of at most ${NAME_WORDS} words, the handle the person would use for the work, such as "Offline sync", "Sign-out bug" or "1.4.2 release". It names the work, never what to do about it or what was found: not a sentence, a question, a task or a finding. Write "Login provider", not "Choose which login provider ships first", and "Sign-out token bug", not "A cached token survives sign-out on the web app". The details go in where it stands. Where it stands is at most ${TEXT_WORDS} words: its state now, not what the agent did. Say what works or is fixed, not the step that got it there: never committed, pushed, rebuilt, restarted or tests passing. Never write a time, a date, or a word such as today, yesterday, ago or now. Code shows how long ago each subject changed.

The head says what the session is focused on now: the work the person would name if asked what this session is doing. It may cover several subjects. Its title is a label of at most ${NAME_WORDS} words, like a subject's name, such as "Offline sync" or "2.5 release". Its description is at most ${DESCRIPTION_WORDS} words on what the session is doing about that focus, such as "Adding offline sync to the notes app" or "Fixing the sync bug, then shipping 2.5". The description never repeats the title, and never says where one piece stands, such as "PR ready for review". The head follows the same rules on time words as where it stands.

Status is one of: working, queued, waits-on-other.
- working: being worked on now, in this session or in a session it handed the work to, or stopped until the person answers an ask. When the work stopped for another reason, it is queued, waits on something, or is done.
- queued: planned, not started.
- waits-on-other: it waits on something other than the person, such as a build, a review or another session.

Rules:
- Change a subject by its id. Write NEW only when no subject in <subjects> covers it.
- When work started and finished in this exchange, write NEW for it, then DONE with its name.
- Write SET only when where a subject stands changed. Never reword a subject that did not change.
- Write DONE when a subject is finished, and DROP when it is abandoned or no longer true, with the reason.
- When the person files a piece for later, out of this session's plan, as into an issue or a backlog, write DONE with "filed for later". A piece the person sets aside to come back to in this session stays queued.
- When the plan for a subject reverses, or another subject takes its work, write WAS with the plan it replaces. Use DROP with INTO when the work moved into another subject.
- Write LINK for each item in <asks> that has no subject yet, naming the subject whose work waits on it. An ask that holds up no subject gets no LINK. Never write an open ask or its options into a subject: code marks the subject while the ask is open, and the inbox shows the ask.
- Write LINK for each item in <running> that has no subject yet, naming the subject whose work it does. Never write NEW for a running item, or its progress in its subject's text: code shows it under its subject while it runs and removes it when it ends. When its result comes back in the exchange, change its subject with SET or DONE if the result changed where the subject stands.
- Check the head on every exchange against <subjects> and <finished>, not only against this exchange: work often moves on over many small exchanges with no one saying so. Write HEAD when <head> is empty or has no description, when the person asks for work that is not part of what the head names, or when a subject is working that is not part of what the head names, as when the work the head names finished and the session started on other work.
- The head names the whole focus, which often spans several subjects. One of them finishing, the next one starting, or the person asking for the next one does not change the focus, so never retitle the head to the piece being worked on. Keep the head while a working subject is part of what it names. When the work it names finished and no subject is working, keep it: queued work is not the focus until it starts. Never reword a head that still holds, and never add progress, the next step or queued work to it.`

/**
 * What the Status call reads besides the exchange: the Status before it, the open asks, the agent's task list, and
 * the time the running children are read at.
 */
export type StatusCallInput = { last: SessionStatus | null; asks: readonly Item[]; tasks: HostTask[]; now: number }

function headText(o: SessionStatus | null): string {
  if (!o?.head) return '(none yet)'

  return `${o.head.title} | ${o.head.description || '(no description yet)'}`
}

function statusBlocks({ last, asks, tasks, now }: StatusCallInput): string[] {
  const { open, finished } = subjectsText(last)
  const running = runningText(last, now)
  const held = asksText(last, asks)
  const list = tasksText(tasks)

  return [
    `<head>${NL}${headText(last)}${NL}</head>`,
    `<subjects>${NL}${open}${NL}</subjects>`,
    ...(finished === '' ? [] : [`<finished>${NL}${finished}${NL}</finished>`]),
    ...(running === '' ? [] : [`<running>${NL}${running}${NL}</running>`]),
    ...(held === '' ? [] : [`<asks>${NL}${held}${NL}</asks>`]),
    ...(list === '' ? [] : [`<tasks>${NL}${list}${NL}</tasks>`]),
  ]
}

function personText(person: string | null, trigger: string | null): string {
  return person ?? `(The person sent nothing. The turn was started by: ${trigger ?? 'unknown'}.)`
}

export function statusPrompt(input: StatusCallInput, ex: Exchange): string {
  const person = personText(ex.person, ex.trigger)

  return [
    ...statusBlocks(input),
    `<person>${NL}${clipMiddle(person, 4000, 1500)}${NL}</person>`,
    `<activity>${NL}${clipMiddle(ex.activity.join(NL), 2500, 500)}${NL}</activity>`,
    `<reply>${NL}${clipMiddle(numberBlocks(ex.reply), 12000, 4000)}${NL}</reply>`,
  ].join(NL)
}

/** The Status call for a turn that is still running: what the person sent, and the work so far. */
export function statusMidTurnPrompt(
  input: StatusCallInput,
  turn: Pick<Session['turn'], 'person' | 'trigger' | 'activity'>,
): string {
  return [
    'The turn is still running. Treat <person> and <activity> as the exchange so far: there is no reply yet. Answer with the changes the work so far makes.',
    ...statusBlocks(input),
    `<person>${NL}${clipMiddle(personText(turn.person, turn.trigger), 4000, 1500)}${NL}</person>`,
    `<activity>${NL}${clipMiddle(turn.activity.join(NL), 2500, 500)}${NL}</activity>`,
  ].join(NL)
}

export function statusCatchUpPrompt(input: StatusCallInput, transcript: string): string {
  return [
    'Treat the conversation in <conversation> as the exchange. Its start may be cut. Answer with the changes that bring the list to where the conversation ends.',
    ...statusBlocks(input),
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

/** What the Status says the session is doing and how it is going. */
function statusSummaryLines(ledger: Ledger): string[] {
  const head = ledger.overview?.head ?? null
  const focus = head ? [head.title, head.description].filter(Boolean).join(': ') : ''
  const open = (ledger.overview?.subjects ?? []).filter(isOpen)

  return [
    ...(focus ? [`Working on: ${focus}`] : []),
    ...(open.length > 0 ? ['Where it stands:', ...open.map(s => `- ${s.name}: ${s.text || '-'} (${s.status})`)] : []),
  ]
}

export const CARRY_TITLE =
  'inbox: where the work stood at the last reply. The "inbox:" text beside this prompt lists what waits on the user and what was closed.'

/** The mod's carry at a conversation's first prompt. The `inbox:` text beside that prompt already lists the open items and the closed ones. */
export function statusCarryText(ledger: Ledger): string | null {
  const lines = statusSummaryLines(ledger)

  return lines.length === 0 ? null : [CARRY_TITLE, ...lines].join(NL)
}

export function carryText(ledger: Ledger, title: string): string | null {
  const findings = ledger.findings
  const lines = statusSummaryLines(ledger)
  if (lines.length === 0 && ledger.items.length === 0 && findings.length === 0) return null
  const out = [title, ...lines]
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
