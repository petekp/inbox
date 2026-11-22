import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { delegate, goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

const layersDelegate = delegate('c1', 'Restructuring the sync code into layers', 's2', -40)

/** Text that says only what the delegate is doing, as its label does: "sorting sync files into layer folders". */
const SAYS_WHAT_CHILD_DOES =
  '\\b(sort|restructur|reorganiz|mov)ing\\b(?! (is )?(done|finished|complete|merged))|\\binto (the )?(layer|layered) folders?\\b'

/**
 * From a real Status call on 11-20: a subject said only what its running delegate was doing, which the delegate's
 * label already said, and the call kept it, since the rules said never to reword a subject that did not change. The
 * person had just taken the suggested goal, so the call also writes its milestones. Then a chat reply changes nothing.
 */
export const childLabelRepeat: Replay = {
  name: 'child-label-repeat',
  about:
    "A coordinator whose subject says only what its running delegate does, which the delegate's label already says. The person asks what is left in the plan, then how long its first stage takes.",
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 12,
      overview: overview({
        head: { title: 'Notes architecture', description: 'Layering the sync code' },
        subjects: [
          subject('s1', 'done', 'Sync engine', 'merged', -120),
          subject('s2', 'working', 'Sync layers', 'Sorting sync files into layer folders', -55),
        ],
        children: [layersDelegate],
        goal: { ...goal('Notes layering merged', -10), isAwaitingMilestones: true },
        milestones: [
          milestone('m1', 'done', 'Engine merged', 'merged', -120),
          milestone('m2', 'done', 'Engine documented', 'written', -100),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1' },
        lastLookAt: minutes(-30),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'layering the notes sync code',
      focusMatch: 'layer|sync|architecture',
      goal: { text: 'Notes layering merged', match: 'layer', milestones: [] },
      pieces: [
        piece({ id: 'engine', names: ['Sync engine'], match: 'engine', state: 'done', stands: 'merged' }),
        piece({
          id: 'layers',
          names: ['Sync layers'],
          match: 'sync layer|layer folder',
          state: 'working',
          stands: 'delegate moving the files into layer folders',
          restates: SAYS_WHAT_CHILD_DOES,
        }),
      ],
      children: [{ ref: layersDelegate.ref, does: 'moves the sync code into layer folders', serves: 'layers' }],
    },
  },
  steps: [
    {
      label: 'The person asks what is left in the plan, and the reply names its three stages',
      at: 0,
      call: {
        kind: 'reply',
        person: 'What is left in the layering plan?',
        activity: ['Read the layering plan', 'Read the layers delegate pane'],
        reply:
          'Three stages. The first is under way: the delegate is moving the sync code into layer folders, and that lands as one PR, which is not merged yet. Once it merges, the second stage splits the note data out of the sync layer. The third adds a check that each layer reads only its own state. Each stage is its own PR, and the goal is met when all three are merged.',
      },
      facts: {
        pieces: [{ id: 'layers', stands: 'one PR, not merged', serves: 'layered' }],
        goal: {
          text: 'Notes layering merged',
          match: 'layer',
          milestones: [
            {
              id: 'layered',
              name: 'Sync code layered',
              match: '^(?!.*(data|state|check|bound|enforc|rule|separat|owner)).*(layer|folder|structur)',
              state: 'working',
            },
            { id: 'data', name: 'Note data split', match: 'data|split|separat|owner', state: 'queued' },
            { id: 'check', name: 'Layer check added', match: 'check|state|bound|enforc|rule', state: 'queued' },
          ],
        },
      },
      targets: ['child-not-restated', 'milestones-true'],
    },
    {
      label: 'The person asks how long the first stage takes, and nothing changed',
      at: 5,
      call: {
        kind: 'reply',
        person: 'How long will the first stage take?',
        activity: ['Read the layers delegate pane'],
        reply: "I can't say exactly. The delegate is still moving files, and I review its PR once it opens.",
      },
      targets: ['no-news-no-move', 'child-not-restated'],
    },
  ],
}
