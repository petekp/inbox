import type { Finding, Item } from '../types'

function findingBody(finding: Finding): string[] {
  return [
    `${finding.kind === 'issue' ? 'Issue' : 'Opportunity'}: ${finding.title}`,
    finding.detail,
    ...(finding.path ? [`File: ${finding.path}`] : []),
  ]
}

const EXPLAIN_REPLY_FORM =
  'Keep it under 80 words of plain language, not counting a diagram: no jargon, and name each thing by what it does. Call each choice by its name as listed. When a small ASCII diagram would show it faster than words, such as steps in order or a before-and-after, put one in a code block in your reply.'

/** The message an answer to a question sends. A host whose agent reads answers in its own form supplies its own. */
export type AnswerMessage = (item: Item, answer: string) => string

/** What a host adds to the messages its presses send. */
export type PressTexts = {
  answerMessage?: AnswerMessage
  /** The absolute path of the page template for a comparison, in the host's own folder. */
  comparePage: string
}

/** The file name of the page template for a comparison, which each host ships in its own folder. */
export const COMPARE_PAGE_FILE = 'compare-page.html'

const compareRequest = (comparePage: string) =>
  [
    'Compare the choices in this question you asked me by trying them against the code, not from memory. If you can run a subagent in the background, hand it this work and tell me in one line that it started, so we can keep talking. Otherwise do it now.',
    "For each choice, find out what it would change: read the code it touches, and where it is cheap, prototype it and run the tests or a small script. Work only in a folder Git ignores or a temporary folder. Leave every tracked file as it was, and never commit or push. Ask me before you call another model, or before you read my files or another session's data outside this repo.",
    `Then make a page from the inbox's comparison template. Write the comparison as JSON in the shape the comment at the top of the template shows, with the few measures that tell the choices apart. Put first the measures I would notice when using it, and judge the choices by those, not by how much code each takes. Build the page with: cat "${comparePage}" <your JSON file> > <your page>.html`,
    "When the comparison is done, reply without a table, since the page holds the measures. Give your pick and say whether it changed, your reason in one line, one line on anything you did not expect, and the page's absolute path.",
    "Also call the inbox's record tool yourself with this question's ask and options as listed below, and the page's absolute path in steps. That marks it compared. Call each choice by its name as listed.",
  ].join('\n\n')

/** A question or task as a message quotes it: its ask, then its options when it has some. */
function quotedAsk(item: Item): string {
  return `"${item.ask}"${item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''}`
}

export const messages = {
  answer: (item: Item, answer: string) => `Re "${item.ask}": ${answer}`,
  explain: (item: Item) => {
    const what =
      item.kind === 'task'
        ? 'this task you left for me is about: why it came up, and what doing it involves'
        : 'this question you asked me is about: why it came up, what each choice would do, and which you would pick'

    return `Remind me what ${what}. ${EXPLAIN_REPLY_FORM} Don't act on it yet.\n${quotedAsk(item)}`
  },
  compare: (item: Item, comparePage: string) => `${compareRequest(comparePage)}\n${quotedAsk(item)}`,
  run: (item: Item, command: string) => `For "${item.ask}", run this:\n\`\`\`\n${command}\n\`\`\``,
  taskReply: (item: Item, words: string) => `Re the task you left for me, "${item.ask}": ${words}`,
  done: (asks: string[]) => (asks.length === 1 ? `Done: ${asks[0]}` : `Done:\n${asks.map(a => `- ${a}`).join('\n')}`),
  /**
   * A close reason is cut at 80 characters, so filing asks for the issue's key there.
   */
  finding: (finding: Finding, how: 'address' | 'issue' | 'explain' | 'discuss' | 'typed', words = '') => {
    const opening =
      how === 'address'
        ? 'Please address this finding you recorded:'
        : how === 'issue'
          ? "Please file an issue for this finding you recorded, in the issue tracker you have tools for. First check whether one already exists, and if it does, use it instead of filing a duplicate. Then close the finding with the issue's key or number as the reason, and give me its link. If you have no tools for an issue tracker, say so and leave the finding open."
          : how === 'explain'
            ? `Remind me what this finding you recorded is about: why it matters, what fixing it would involve, and whether you would fix it now. ${EXPLAIN_REPLY_FORM} Don't act on it yet.`
            : how === 'discuss'
              ? "Let's talk through this finding you recorded before changing anything:"
              : 'About this finding you recorded:'

    return [opening, ...findingBody(finding), ...(how === 'typed' ? ['', words] : [])].join('\n')
  },
}
