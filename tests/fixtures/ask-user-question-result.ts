// Claude Code 2.1.326 AskUserQuestion tool.call results, captured live against a stand-in Messages API server.
export const CAPTURED_DIALOGS = [
  {
    name: 'options',
    result: {
      questions: [
        {
          question: 'Which region?',
          header: 'Region',
          options: [
            {
              label: 'eu',
              description: 'Europe',
            },
            {
              label: 'us',
              description: 'United States',
            },
          ],
          multiSelect: false,
        },
        {
          question: 'Which size?',
          header: 'Size',
          options: [
            {
              label: 'small',
              description: 'Small',
            },
            {
              label: 'large',
              description: 'Large',
            },
          ],
          multiSelect: false,
        },
      ],
      answers: {
        'Which region?': 'eu',
        'Which size?': 'small',
      },
      annotations: {},
    },
    text: 'Your questions have been answered: "Which region?"="eu", "Which size?"="small". You can now continue with these answers in mind.',
  },
  {
    name: 'notes-and-typed',
    result: {
      questions: [
        {
          question: 'Which layout?',
          header: 'Layout',
          options: [
            {
              label: 'rail',
              description: 'Side rail',
              preview: 'RAIL\n|a|b|',
            },
            {
              label: 'tabs',
              description: 'Tabs',
              preview: 'TABS\n[a][b]',
            },
          ],
          multiSelect: false,
        },
        {
          question: 'Which size?',
          header: 'Size',
          options: [
            {
              label: 'small',
              description: 'Small',
            },
            {
              label: 'large',
              description: 'Large',
            },
          ],
          multiSelect: false,
        },
      ],
      answers: {
        'Which layout?': '(notes only)',
        'Which size?': 'medium "plus" notes: x',
      },
      annotations: {
        'Which layout?': {
          notes: 'prefer "quiet" look',
        },
      },
    },
    text: 'The user answered: "Which layout?"=(no option selected) notes: prefer "quiet" look, "Which size?"="medium "plus" notes: x". Read the answers carefully \u2014 they may request clarification, changes, or that you not proceed \u2014 and follow what they actually say.',
  },
  {
    name: 'preview',
    result: {
      questions: [
        {
          question: 'Which layout?',
          header: 'Layout',
          options: [
            {
              label: 'rail',
              description: 'Side rail',
              preview: 'RAIL\n|a|b|',
            },
            {
              label: 'tabs',
              description: 'Tabs',
              preview: 'TABS\n[a][b]',
            },
          ],
          multiSelect: false,
        },
        {
          question: 'Which size?',
          header: 'Size',
          options: [
            {
              label: 'small',
              description: 'Small',
            },
            {
              label: 'large',
              description: 'Large',
            },
          ],
          multiSelect: false,
        },
      ],
      answers: {
        'Which layout?': 'rail',
        'Which size?': 'small',
      },
      annotations: {
        'Which layout?': {
          preview: 'RAIL\n|a|b|',
        },
      },
    },
    text: 'Your questions have been answered: "Which layout?"="rail" selected preview:\nRAIL\n|a|b|, "Which size?"="small". You can now continue with these answers in mind.',
  },
]
