# Text the person reads in bulk

Status: proposed. Nothing in it is built.

The person reads the inbox by scanning lists: Asks, Finds, the Closed fold, the Overview and the PRs tab. Most of each row is text a model wrote: an ask, a finding's title, an outcome, a subject's name and where it stands. The code writes the words around them: labels, marks, banners and press results. [Five Principles for Generating Readable AI Text in Bulk](https://fsdatalab.github.io/blog/agent-text-at-scale/) gives five rules for lists of model-written text. This plan applies them to every text the person reads in the inbox, in all four looks.

## The five principles

| # | Principle | What it means in the inbox |
| --- | --- | --- |
| 1 | Start each row with its subject or its verb, in the tense the reader expects. When every row shares a subject, drop it and start with the verb. | Each list has one subject its rows share or one it names. A task's subject is the person, so a task starts with its verb. An Overview row's subject is its name, so where it stands starts with a verb. Work in flight reads in the continuous form, finished work in the past tense, a state in the present. |
| 2 | Put the words that tell a row apart first. Readers of a list often see only the first two words. | Every look cuts a long row at its end, so the first words are also the ones a narrow terminal or omp panel keeps. Words every row shares, such as "Should I" or "Ready to start on", go last or go. |
| 3 | Give every row of a list one structure, and each concept one word. | Every question in the same form, every issue in the same form. A concept the glossary names keeps that name on screen. |
| 4 | Vary only to show a difference that means something. | A row that differs from its neighbors in form, length or detail reads as a different kind of row. Casing, end punctuation and how many details a row gives must not vary by chance. |
| 5 | Pick verbs whose connotation fits the list's purpose. | An issue's verb says what goes wrong. An opportunity says what could be better. |

## What already follows them

These stay as they are, and the rules below are written to match them.

- The line under a `record` or `close` call starts with its kind: "Question: …", "Task: …", "Issue: …", "Opportunity: …", "Closed: …" (`hooks/tools.ts:recordItem`). That is principle 2, as in the article's order emails.
- The Overview head that decision 19 in `docs/plans/overview.md` sets is a title over a description in the continuous form: "Offline sync" over "Adding offline sync to the notes app" (principle 1).
- A press's last action reads in the continuous form while it is out, as "Explaining…", and in the past tense after, as "✓ Discussed" (principle 1).
- The glossary's _Avoid_ lists keep one word per concept (principle 3).
- The demo's findings already take one form each. An issue says what goes wrong: "Snoozed glances come back after a restart". An opportunity says what could be better: "Glances could re-sort only when one moves" (`hooks/demo.ts:demoView`). No text the agent reads asks for these forms, so a real session's findings vary.

## The lists and their forms

Each row names a list, who writes it, where its rule lives, and the form it should take. "Agent" is Claude, Codex or omp through `record` and `close`. "Ledger model" is the call that reads `hooks/model-text.ts:systemText`. "Overview model" reads `hooks/model-text.ts:OVERVIEW_SYSTEM`.

### Asks

**Questions.** The agent writes `ask` (`hooks/tools.ts:RECORD_SCHEMA`), and the ledger model writes a NEW line's ask (`systemText`). Both say only "at most 12 plain words, readable without the reply". So a list mixes "Which cache should the product API use?", "Should I commit these separately?" and "What should the wake word be for the agent?".

The form:

- A choice between things starts with "Which" and the thing: "Which cache should the product API use?", "Which wake word should the agent answer to?".
- A yes-or-no starts with the verb of the act, with the subject dropped: "Commit the gesture and the anchor fix separately?", "Show glances while you are walking?".
- Any other question names its thing in its first three words.
- It never opens with words any question could share: "Should I", "Should we", "Do you want", "Would you like", "Can you", "Please".

This keeps both rules the ask has today: readable without the reply, and every alternative it names.

**Tasks.** The same `ask` field, kind `task` or `do`. The form: the verb first, as an instruction, with no question mark: "Sign in to npm", "Run the migration with your password". Not "You need to …", "Please …" or "Can you …?".

**Questions from a todo.** `hooks/ledger.ts:todoAsk` writes "Ready to start on <work>?", so every such row opens with the same four words. The form: "Start <work>?", as a yes-or-no question above. The `TODO:` rule in `systemText` says its work is "worded to follow 'Ready to start on'", so that rule changes with it.

**Options.** `record`'s `options` and a NEW line's options, at most 5 words each. The form: the options of one question share one form, all names ("Redis / In-memory") or all acts ("Approve / Not yet"). Principle 4: the recommended mark is the only thing that sets one option apart.

### Finds

**Issue titles.** The agent writes `title` with `finding_kind: issue`, "what it is, in at most 12 plain words". The form: the thing that goes wrong, then a verb in the present tense that says how: "Snoozed glances come back after a restart", "The export drops rows past 10,000". Not a noun phrase ("Missing tests for the parser"), a hedge ("Possible race in sync") or a fix ("Add tests for the parser"). The last two read as an opportunity or a task.

**Opportunity titles.** The form: the thing, then "could" and what would be better: "Pinch and flick could share one gesture handler". The fixed "could" sets opportunities apart from issues at a glance, and the Finds groups (`hooks/view.ts:FINDING_GROUPS`) already split them.

**Finding details.** `detail`, "why it matters and what you would do, in one or two sentences". The form: two sentences in a fixed order, what it costs first and what the agent would do second. A detail that adds a kind of fact the others lack, such as a version number, reads as significant (principle 4), so the agent gives that fact only when it is the point.

### Outcomes

A closed row says how it closed. Today the words come from four writers, each in its own form:

- the person's own answer, in their words, as "yes" or "Yes, fade it";
- the ledger model's CLOSED line, "done: <what the agent did>" or "no longer applies: <what made it moot>", and its FIXED line, "the change that fixed it";
- the agent's `close` call, an answer or a reason such as "no longer applies: Inbox kept";
- the code's labels for a press and a close by the agent.

`hooks/view.ts:outcomeLabel` capitalizes each one, so case is already even. Their shapes are not. One Closed fold can read:

| How it closed (`Closed.how`) | Shown today |
| --- | --- |
| The person's answer | Wristband · Yes, fade it |
| Done or Dismiss press | Done · Dismissed |
| The mod saw the person run its command | You ran it |
| Expired | Expired, unanswered · List full (a finding) |
| The agent's `close` | Closed by Claude: no longer applies: voice already takes over … · Closed by Claude: fixed, it now redraws … |
| The ledger model | Done: ran the migration · No longer applies: … · the change that fixed a finding, with no prefix |
| A finding's fix was sent | Fix · Do it, the button's own label |
| The question a sent fix closes | Fix sent for f12 |
| A finding the ledger model turned into a question | Now a question in Asks |

These mix a noun phrase, a participle, a clause and a bare button verb. An agent's close says who closed it, and the ledger model's close of the same kind does not (principle 4). "Closed by Claude: no longer applies:" puts two prefixes before the words that tell the row apart (principle 2).

The form:

- The person's answer stays as they gave it. It is the one outcome not drawn from a set, and the one they look for.
- Every other outcome starts with a past-tense word from one set, then the detail: "Done: ran the migration", "Fixed: redraws only the changed glance", "Dismissed", "Expired: no answer", "Expired: list full", "No longer applies: voice already takes over".
- Who closed it shows the same way for every close the person did not make, or for none. The code knows it from `Closed.how`, so it need not parse the words.
- No id, and no button label read as a result.

The stored outcome keeps its words. `hooks/ledger.ts:closedState` and `isPersonsAnswer` read "closed by …", "done:" and "no longer applies" from it, and saved sessions hold the old words. `outcomeLabel` maps stored words to shown words, so the change is in the view. The model's half, "done:" and "no longer applies:", already starts with its word, so only FIXED gains one.

### Overview

**Head.** Decision 19's title and continuous description already fit principle 1. No change beyond building #148.

**Subject names.** A short handle the person would say aloud (`OVERVIEW_SYSTEM`, at most `hooks/overview.ts:NAME_WORDS` words). The name is the row's subject, so it stays a noun phrase. No change.

**Where it stands.** At most `hooks/overview.ts:TEXT_WORDS` words, its state now. The spec's own good examples mix forms: "merge logic ready", "syncs on reconnect", "after export", "in review", "cause found", and the demo adds "pinch can be turned off". The form: where it stands finishes a sentence the name starts, with a verb in the present tense first: "Export button · works on web", "2.4 release · ships after export", "Sync engine · loses edits on iOS". The name is the subject, so the row reads subject, verb, object (principle 1). The rules against process steps, times and status words stay. A change here also changes property 6 in `docs/plans/overview.md` and its examples, which the judge's instructions are written from.

**Was and merged lines.** `hooks/view.ts:WAS_PREFIX` and the merged line's prefix start each with a fixed word, which suits principle 2. The plan after "was:" takes the same form as where it stands.

**Children.** A child's name is the description its host gave it, as "Review the gesture code", or a delegate's name. The inbox does not write it, and #149 covers a delegate named by an id. Out of scope here.

### Help steps

A step's name is at most 3 words, such as "settings snippet" or "removal command" (`systemText`, HELP). These are already one form, a noun phrase. No change.

### The comparison page

The agent writes the comparison as JSON and the page draws it (`hooks/compare-page.html`). The template's own example mixes forms in its two choice summaries: "One cache that all four instances share." is a noun phrase and "Each instance keeps its own cache." is a clause. An agent copies the example's form. The form: every choice's summary is a clause whose subject is the choice or its parts, in the present tense. Every value of one measure is in one unit. The comment at the top says so, and the example follows it.

### Press messages

A press sends a message the conversation shows as the person's own (`hooks/presses.ts:messages`, `hooks/prs.ts:prompts`). Its first words differ by press: `Re "…": …`, "Remind me what …", `For "…", run this:`, "Done: …", "Please address …", "Let's talk through …", "About this finding …". In a long conversation the person scans these too, but the agent's reply depends on each word of them. This plan leaves them alone unless a measured change keeps the agent suite's results. Then the first word names the press, as "Done:" already does.

## Words the code writes

An inventory of every fixed string the four looks draw found the items below. Before changing a pair that differs between looks, check "Differences on purpose" in `docs/looks.md`. Row age, the band and stop rows, the Herdr sidebar, a reply while its send is out and the PRs empty hint are listed there, so their differences stay.

**Two product bugs.** File each as a GitHub issue, as `AGENTS.md` asks, and fix it apart from this plan.

- A PR row reads "1 thread sent to Claude" in every look. `hooks/prs.ts:readiness` takes no agent name, so Codex and omp name the wrong agent.
- An Address press on a finding that a question asked about closes the question with "fix sent for f12" (`hooks/presses.ts:applyPress`). The Closed fold shows the id, which the person never sees anywhere else.

**One structure for each kind of text (principles 1 and 3).**

- Outcomes, as above.
- Stop reasons (`hooks/view.ts:stopText`): "sign-in expired", "billing problem", "usage limit reached", "the API is limiting requests", "the API is overloaded", "API error (…)". A noun phrase, a participle and a clause sit under one "Stopped" lead. The form: the thing, then what happened to it, as "Sign-in expired" and "Usage limit reached" already are: "Billing failed", "API rate limit reached", "API overloaded".
- A press that failed reads "Could not open x: it no longer exists". That form is good. Codex's "Not confirmed: the inbox did not answer." puts a reason after "Not confirmed:", where the shared form puts the press's label.
- A failed PR refresh reads "Last refresh failed: x" on the PR block and "Could not refresh PRs: x" as the press's result.
- A PR's reasons join in one line, as "conflicts with main, 2 failing checks, changes requested, needs approval": a verb phrase, two noun phrases and another verb phrase (`hooks/prs.ts:readiness`). Give them one form, all noun phrases or all verbs.

**One word for each concept (principle 3).**

- "Closed:" is the outcome on a held row ("Closed: <outcome>") and the item on the person's line ("Closed: <ask>").
- "Update" names the ledger update ("Last update failed.") and a new build ("Could not load the inbox update." in Codex).
- The counts read "Asks 2 · Finds 1" on the band and "Asks 2, Finds 1" in omp's `/inbox` notice outside the panel.
- Adapters write their own copy of strings a shared module owns: "Try again", "Could not read the inbox.", "Nothing needed", "Not sent: …", "Stopped", "Resume" and "Resuming…", "Hide demo" and "Undo" in `hooks/register.tsx`, `codex/src/tab.tsx` or `omp/src/panel.ts`; "Questions" and "Tasks" in `codex/src/tab.tsx`; "Your reply" in `omp/src/panel.ts`. `docs/looks.md` already says shared modules own the words. Move each to its owner, so a change reaches every look.

**The words that tell rows apart first (principle 2).** `hooks/ledger.ts:todoAsk`, as in Asks above. The banners, labels and results already lead with their own word.

**Small fixes.** omp's scroll hint says "line" or "lines" by count in one place and always "lines" in another (`omp/src/panel.ts`). The demo's Overview has a subject that "waits on your pick" (`hooks/demo.ts:demoView`), which the Overview's fixed rules forbid: a held subject's text names no decision.

## One home for the rules

The article asks for its checklist to reach the agents that write. The inbox has several writers, so each rule is written once and reaches each of them.

- **`docs/writing.md`, new.** The five principles, the form of each list above, and the words for each concept, linked to `GLOSSARY.md`. Anyone who writes a string or a model-read rule reads it first. The "A word on screen" row of "After you change X, check Y" in `docs/looks.md` points to it. Today that row names a `refine-prose` skill this repo does not hold, so a contributor or an agent without it has no rules to follow.
- **Shared form rules in `hooks/model-text.ts`.** One constant per form, such as the question form and the issue-title form. `RECORD_SCHEMA` in `hooks/tools.ts` and `systemText` both read it, so the agent and the ledger model write the same question in the same form. When the two writers differ, the same list gets two forms (principle 4), and a row the agent recorded and one the ledger model added read as different kinds.
- **Field descriptions, not the tool description.** The forms go in the schema's field descriptions, beside the field they shape. `hooks/model-text.ts:MAX_TOOL_DESCRIPTION` caps the tool description. Check whether it also caps field descriptions in Claude Code, Codex and omp before relying on that.

## How to tell it worked

**A baseline from real sessions.** A local script reads the person's own saved ledgers and counts, for each list, how many rows take each form. Saved ledgers hold session content, so only the counts go in Git, as in `docs/plans/prompt-audit.md`. It runs before the first prompt change and after each.

**Form rules.** `evals/prose-rules.ts`, new, holds what a regular expression can check: a question ends with "?", a task does not, no ask opens with a shared opener, an opportunity title holds "could" and an issue title does not, no title ends with a period, an outcome starts with a word from its set, and the word limits. Each rule runs on a hand-written good text and a bad one in `check.sh`, as the Overview's fixed rules do.

**Form on every case.** The ledger suite (`evals/run.ts`) and the agent suite (`evals/agent.ts`) run the form rules on every text a case adds, in every case, and report a pass rate for each list. The existing cases give a large sample without new ones. A case fails on form only once a list's rate is known and a bar is set from it.

**A judge for what rules cannot see.** Whether a row starts with its verb, whether the words that tell it apart come first, and whether a verb's connotation fits. It runs at a few checkpoints, like the Overview judge, and is checked the same way: hand-written good and bad texts in two sets, and an author who sees neither.

**The rules the suites already hold.** Each ask keeps its meaning checks (`new`, `waiting`, `notNew` patterns in `evals/cases.json`). A form change must keep them passing, since a form rule can push a model to drop an alternative or the thing an ask is about. Where a case's pattern assumes today's form, such as an opener, the pattern changes to accept the new form and only that, in its own commit with the reason.

## Order of work

Each step is its own change, with its own eval runs as `AGENTS.md` says.

1. **Rules and baseline.** Write `docs/writing.md` and point `docs/looks.md` at it. Add `evals/prose-rules.ts`, the form pass rate in both suites, and the local baseline script. Run both suites on today's texts to get each list's rate. Nothing a model reads changes.
2. **Words the code writes.** The changes in "Words the code writes", the comparison template's example, and the demo's texts, which show each form. Most of these no model reads. Check `hooks/model-text.ts` before treating a string as unread: the tab names reach the models through `screenText`, and the template's comment needs a check that the agent still writes valid data.
3. **Asks.** The question and task forms in `RECORD_SCHEMA` and `systemText`, then `todoAsk` and the `TODO:` rule. Run `./scripts/eval.sh` and `./scripts/eval.sh --suite agent`, with a case for each form.
4. **Finds.** The issue and opportunity title forms, and the detail's order, in `RECORD_SCHEMA`. Run the agent suite.
5. **Outcomes.** The model's half of the outcome form, in `systemText` and `CLOSE_SCHEMA`, with the code's half from step 2. Run both suites.
6. **Overview.** Property 6 in `docs/plans/overview.md` first, then `OVERVIEW_SYSTEM`. Revise the judge as that plan says. Run `./scripts/eval.sh --suite overview --judge`.
7. **Press messages.** Only if a version keeps the agent suite's results.

Each step also brings the demo (`hooks/demo.ts`) and the README's "Using it" examples to the new form, so the sample and the docs show it. The demo test in `tests/hooks.test.ts` checks the demo's titles in the terminal and desktop looks, so it changes in the same commit.

## Each look

Every step says, for each look, whether it applies and what was checked there, as `AGENTS.md` asks. What to watch in each:

- **Terminal and omp.** Each cuts a row at its cell width. Check each list at a narrow width, and that the words that tell rows apart survive the cut. Check omp in its light theme.
- **Desktop.** A Button is as small as its label, so a new label moves its neighbors. Check every state of a row whose label changes, and that the pane shows the new build before trusting a capture.
- **Codex.** The Overview's lines clamp with `-webkit-line-clamp`, and the tab bar switches to symbols with a container query. Check both at the widths where they switch, in both themes.
- **All four.** Old rows keep the words they were saved with. A list then shows both forms until the old rows close. Check a saved session from the last build in each look.

## Risks

- **A small rewording changes what a model does.** A one-word edit to the findings rule once made the ledger model re-add questions the person had dismissed. One change per run, and the suites `AGENTS.md` names for each text.
- **Form can crowd out meaning.** The word limits are tight: 12 for an ask, 8 for an outcome, 4 for where it stands. A rule that adds fixed words takes room from the content. Prefer rules that remove words, such as dropping "Should I", to rules that add them.
- **Repeats.** `hooks/ledger.ts:restates` finds a repeated ask by its key words. A word every row of a form shares must be in its `FILLER` or `GENERIC` set, or rows of that form look more alike than they are. "Which", "could" and "should" already are.
- **Mixed lists for a while.** Saved rows are not rewritten. They are what the agent recorded, and repeat checks compare against them. They leave as they close or expire.
- **Languages other than English.** The forms and openers are English. Nothing in the texts the models read sets the language of a row. A session in another language gets English rules about word order. Decide whether a form rule says "in English" or "in the session's language" before step 3.
- **Cost.** Steps 3 to 6 each run model suites on Claude, Codex and omp.

## Not in this plan

- PR thread titles and comments, quoted from GitHub.
- Children's names, which their hosts write.
- The agent's own reply, beyond what `guidanceText` already asks of a question in it.
- Docs that only contributors read: `docs/plans/`, `AGENTS.md` and `docs/reference/`.
