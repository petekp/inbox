import type { Exchange, HostTask, Item, Session, SessionStatus } from '../types'
import { tasksText } from './host-tasks'
import { NL, personText } from './ledger-prompt'
import { asksText, runningText, subjectsText } from './status-children'
import { DESCRIPTION_WORDS, NAME_WORDS, OPEN_SUBJECTS, TEXT_WORDS } from './status-limits'
import { GOAL_INPUT, GOAL_LINES, goalBlocks, goalRules } from './status-prompt-goal'
import type { GoalPartId } from './status-prompt-goal'
import { clipMiddle, numberBlocks } from './text'

/**
 * The system text of the call that changes the Status tab's list, apart from the ledger call, leaving out the goal's
 * rules in `without`.
 */
export function statusSystem(without: readonly GoalPartId[] = []): string {
  return `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <head>: the top of the page, as title | description: what the session is focused on now. Never write it into a subject.
- <subjects>: the open subjects, one per line: id | status | name | where it stands
- <finished>: subjects already done or dropped. Do not add them again.
- <running>: work running apart from the turn, such as a subagent, a background task, a workflow or a delegate session, one per line: id | kind | name | the subject it belongs to, or - when it has none yet
- <asks>: the open questions and tasks the inbox shows the person, one per line: id | the ask | the subject it holds up, or - when it has none yet
- <tasks>: the agent's own task list, when it keeps one. It is evidence, not the list: write each subject at the level of the feature. A pending task for another part of the product, one the person would name on its own, is a queued subject.
${GOAL_INPUT}
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
${GOAL_LINES}

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
- The head names the whole focus, which often spans several subjects. One of them finishing, the next one starting, or the person asking for the next one does not change the focus, so never retitle the head to the piece being worked on. Keep the head while a working subject is part of what it names. When the work it names finished and no subject is working, keep it: queued work is not the focus until it starts. Never reword a head that still holds, and never add progress, the next step or queued work to it.

Goal:
${goalRules(without)}`
}

export const STATUS_SYSTEM = statusSystem()

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
    ...goalBlocks(last),
    `<head>${NL}${headText(last)}${NL}</head>`,
    `<subjects>${NL}${open}${NL}</subjects>`,
    ...(finished === '' ? [] : [`<finished>${NL}${finished}${NL}</finished>`]),
    ...(running === '' ? [] : [`<running>${NL}${running}${NL}</running>`]),
    ...(held === '' ? [] : [`<asks>${NL}${held}${NL}</asks>`]),
    ...(list === '' ? [] : [`<tasks>${NL}${list}${NL}</tasks>`]),
  ]
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
