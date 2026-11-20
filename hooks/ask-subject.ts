/**
 * Marks that name a concrete thing on their own: a PR or issue number (`#687`, `PR 4280`), an issue key
 * (`PAD-3330`), a link, a path or file name (`./scripts/check.sh`, `tools.ts`), code in backticks, or a quoted name.
 */
const NAMED_THING =
  /#\d+|\b\d{2,}\b|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\/|[\w~.-]*\/[\w.-]+|\b[\w-]+\.[a-z]{1,5}\b|`[^`]+`|"[^"]+"|“[^”]+”/

/**
 * Words that name no particular thing: function words, yes and no, the acts a stop point asks about, such as merge,
 * push or run, and the nouns any session has, such as the branch, the PR or the change.
 */
const EMPTY_WORDS = new Set(
  `a about above after again ahead all already also an and any anything are as at back be been before being below both
but by can could did do does doing done each either else every everything first for from get go going had has have
here how i if in into is it its just last later lets let me more my need next no not now of ok okay on once one ones
only or other others our out over own rest same should so some something soon still such sure than that the their
them then there these they this those to today too until up us want was way we were what when where whether which who why
will with would yes yet you your
approve proceed continue start stop wait hold skip leave keep drop cancel finish resume restart retry redo
run merge push pull commit deploy ship publish open close post send file fix build make try test check
review mark ready use take add remove delete update change apply land rebase install copy move create write draft
edit set show see look pick choose decide answer reply tell say ask like prefer handle follow work
pr prs branch thing step plan design option variant version note rule issue item task question proposal idea
code problem stuff part green current new old latest previous mentioned proposed suggested remaining pending`.split(
    /\s+/,
  ),
)

/** `word` without a plural or tense ending, so "builds", "merged" and "pushing" read as "build", "merge" and "push". */
function stem(word: string): string {
  return word.replace(/(?:ies|es|s|ed|ing)$/, '')
}

/**
 * A single letter or digit names nothing on its own: "A, B or C" are the reply's labels, "I'll" splits into "i" and
 * "ll", and "problems 2 and 3" point into the reply.
 */
function isEmptyWord(word: string): boolean {
  if (word.length === 1 || word === 'll' || word === 're' || word === 've') return true

  return EMPTY_WORDS.has(word) || EMPTY_WORDS.has(stem(word)) || EMPTY_WORDS.has(`${stem(word)}e`)
}

/**
 * Whether an ask names what it is about: a thing `NAMED_THING` finds, or a word outside `EMPTY_WORDS`. "Merge #687?",
 * "Run check.sh on the bundle PR?" and "Can reps react on WhatsApp?" do. "Proceed?", "Merge it / Not yet" and "Push
 * the branch and open a draft PR?" do not, so the person could not tell which thing they would answer for.
 */
export function namesSubject(ask: string): boolean {
  if (NAMED_THING.test(ask)) return true

  return (ask.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some(w => !isEmptyWord(w))
}
