import type { Closed, Exchange, Item, Ledger } from '../types'
import { isAskedForChoices, LIST_CHOICES } from './ask-match'
import type { Host } from './model-text'
import { clipMiddle, numberBlocks } from './text'

export const NL = '\n'

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

export function ledgerBlocks(ledger: Ledger): string[] {
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

export function personText(person: string | null, trigger: string | null): string {
  return person ?? `(The person sent nothing. The turn was started by: ${trigger ?? 'unknown'}.)`
}

export function outcomeText(d: Closed): string {
  if (d.how === 'dismissed') return 'dismissed by the user'
  if (d.how === 'expired') return 'expired before the user answered'

  return d.outcome
}
