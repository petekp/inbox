import type { Replay } from '../status-replay'
import { NO_FACTS, piece } from './builders'

/** A catch-up of a conversation the inbox never saw, from an empty page. */
export const catchUpFromEmpty: Replay = {
  name: 'catch-up-from-empty',
  about: 'A catch-up from an empty page marks finished work done, and links the question the last reply left open.',
  hasLedgerCalls: false,
  start: { ledger: {}, facts: NO_FACTS },
  steps: [
    {
      label: 'A catch-up reads a conversation that finished one piece and left a question open',
      at: 30,
      events: [{ askOpens: { id: 'i1', ask: 'Should PDFs open inside the app or in the system viewer?' } }],
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Let people attach images and PDFs to notes.',
          'Agent: Image attachments work: you can add a photo to a note, and it shows inline. Next are PDFs.',
          'Person: Good, go on.',
          'Agent: PDFs attach and show as a file row. Should PDFs open inside the app or in the system viewer?',
        ].join('\n\n'),
      },
      facts: {
        focus: 'attaching images and PDFs to notes',
        focusMatch: 'attach|image|pdf',
        pieces: [
          piece({
            id: 'attachments',
            names: ['Note attachments', 'Image attachments', 'PDF attachments'],
            match: 'attach|image|photo|pdf',
            state: 'working',
            stands: 'images show inline; PDFs attach as a file row',
            parts: { images: 'show inline', PDFs: 'attach as a file row; how they open is undecided' },
            alsoRight: ['done'],
          }),
        ],
        asks: [
          {
            match: 'pdf',
            text: 'Should PDFs open inside the app or in the system viewer?',
            holdsUp: ['attachments'],
          },
        ],
      },
      targets: ['asks-linked', 'piece-once', 'open-pieces-kept'],
    },
  ],
}
