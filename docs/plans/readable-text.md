# Text the person reads in bulk

Status: proposed. Nothing in it is built. Two adversarial reviews checked the first draft, one against the code and the repo's rules, one against the article and real examples. "What the reviews changed" lists what moved.

The person reads the inbox by scanning lists: Asks, Finds, the Closed fold, the Overview, the PRs tab and Herdr's sidebar. Most of each row is text a model wrote: an ask, a finding's title, an outcome, a subject's name and where it stands. The agent writes through `record` and `close`. The inbox model writes in two calls: the ledger call, which reads `hooks/model-text.ts:systemText`, and the Overview call, which reads `hooks/model-text.ts:OVERVIEW_SYSTEM`. The code writes the words around them: labels, marks, banners and press results.

[Five Principles for Generating Readable AI Text in Bulk](https://fsdatalab.github.io/blog/agent-text-at-scale/) gives five rules for lists of model-written text. This plan applies them to every text the person reads in the inbox, in all four looks, and says where it leaves a text alone and why.

## The five principles

| # | Principle | What it means in the inbox |
| --- | --- | --- |
| 1 | Start each row with its subject or its verb, in the tense the reader expects. Drop the subject only when every row shares it. | A task's subject is always the person, so a task starts with its verb. An opportunity's subject is always the agent, so it starts with the change. Questions do not share one subject: some ask to do something, some ask what the person knows. Each keeps what tells it apart. An Overview row's subject is its name. |
| 2 | Put the words that tell a row apart first. Readers of a list often see only the first two words. | Every look cuts a long row at its end, so the first words are also the ones a narrow terminal, an omp panel or Herdr's sidebar keeps. Words many rows share, such as "Should I" or "Ready to start on", go last or go. |
| 3 | Give every row of a list one structure, and each concept one word. | Questions of one kind take one form. A concept the glossary names keeps that name on screen, in every look. |
| 4 | Vary only to show a difference that means something, and show the variable that matters for every row. | A row that differs from its neighbors in form, length or detail reads as a different kind of row. A count given on some rows and not others reads as news. |
| 5 | Pick verbs whose connotation fits the list's purpose. | An issue's verb says what goes wrong. On the Overview, a mark gives a subject's status but not whether the news is good, so the verb carries that. |

## What already follows them

These stay as they are, and the forms below are written to match them.

- The line under a `record` or `close` call starts with its kind: "Question: …", "Task: …", "Issue: …", "Opportunity: …", "Closed: …" (`hooks/tools.ts:recordItem`). That is principle 2, as in the article's order emails.
- The Overview head that decision 19 in `docs/plans/overview.md` sets is a title over a description in the continuous form: "Offline sync" over "Adding offline sync to the notes app" (principle 1).
- A press's last action reads in the continuous form while it is out, as "Explaining…", and in the past tense after, as "✓ Discussed" (principle 1).
- The glossary's _Avoid_ lists keep one word per concept (principle 3).
- The demo's questions mostly start with the act and name each alternative: "Track hands with the camera or the wristband?", "Commit the gesture and the anchor fix separately?". Its tasks start with their verb: "Calibrate eye tracking for the new lenses". Its issues say what goes wrong: "Snoozed glances come back after a restart" (`hooks/demo.ts:demoView`). No text the agent or the inbox model reads asks for these forms, so a real session's rows vary.

## The lists and their forms

### Asks

**Questions.** The agent writes `ask` in `RECORD_SCHEMA` (`hooks/tools.ts`): "at most 12 plain words, readable without your reply". The ledger call writes a NEW line's ask in `systemText`, with more rules: up to 16 words when 12 would lose meaning, every alternative the question names, no term the reply coined, and items named by what they say. Neither gives a form, so one list mixes "Which cache should the product API use?", "Should I commit these separately?" and "What should the wake word be for the agent?".

Two forms, by what the question asks:

- **An act question** asks to do something, or to choose between acts: an approval, a yes-or-no on the agent's next step, "squash or keep". Every such question shares its subject, the agent, so it starts with the act's verb and names each alternative: "Commit the gesture and the anchor fix separately?", "Squash the six commits, or keep them?", "Run the migration on staging first?".
- **A fact or value question** asks what only the person knows or sets. It starts with its topic, then asks in plain words, and keeps "you" where the person is the subject: "Session cookie lifetime: 1 day or 30?", "Wake word: what should the agent answer to?", "Staging migrations: do you run them first?". Without the topic first, "Do you run migrations on staging first?" would read like the act question above, and the person answers the two differently.

Neither form opens with words many questions share: "Should I", "Do you want", "Would you like", "Can you", "Please", or "Which". `hooks/ledger.ts:restates` finds a repeated ask by its key words and drops only its `FILLER` words, so a shared "Which" would make two different questions look alike: in review, "Which cache backend for staging?" restated "Which cache backend for production?", and without "Which" it did not. The rules the ledger call has today stay, including 16 words and every alternative.

**Tasks.** The same `ask` field, kind `task` or `do`. Every task's subject is the person, so it starts with its verb, as an instruction, with no question mark: "Sign in to npm", "Run the migration with your password". Not "You need to …", "Please …" or "Can you …?".

Two examples the models read show a question as an instruction: "say when you want those committed" in `recordDescription` (`hooks/tools.ts`) and "Say when you want those committed" in `systemText`'s Skip rule. They change with the forms, to an act question such as "Commit these now?".

**Questions from a todo.** `hooks/ledger.ts:todoAsk` writes "Ready to start on <work>?", so every such row opens with the same four words. It becomes "Start <work>?". The ledger call already writes the work to follow "start on", as in "caching the price list", so "Start caching the price list?" reads right and the `TODO:` rule in `systemText` keeps its words. The stored ask is in every later `<open>` block the ledger call reads, so it gets the todo cases of the ledger suite.

**Options are left alone.** They are two or three buttons on one row, not a list. Code also matches some exactly: "List the choices" in `hooks/ledger.ts:isAskedForChoices`, and "Not yet" in its `PUT_OFF` words. No form rule may reword them.

### Finds

**Issue titles.** The agent writes `title`, "what it is, in at most 12 plain words", for a finding whose `finding_kind` is issue, "something wrong or risky". The form: the thing, then a verb that says what goes wrong (principles 1 and 5). Leave out a leading "The". A risk that has not been seen to happen says "can", since the guidance asks that "the finding says what is true": "Export drops rows past 10,000", "Snoozed glances come back after a restart", "Two deploys at once can corrupt the lock file". Not a noun phrase ("Missing tests for the parser"), a hedge ("Possible race in sync") or a fix ("Add tests for the parser").

**Opportunity titles.** The one who would make the change is always the agent, so the title starts with the change as a verb: "Merge the two date parsers", "Cache node_modules in CI", "Re-sort glances only when one moves". The Opportunities group and its ✦ mark (`hooks/view.ts:FINDING_GROUPS`) already set it apart from issues, and its button, Do it, reads with it. The demo puts the thing first, as in "Glances could re-sort only when one moves". For most opportunities that form turns passive, as in "The legacy auth module could be deleted", the article's own bad case.

**Finding details are left alone.** The person reads a detail one row at a time, so a fixed order gains little in scanning for the eval runs it costs.

### Outcomes

A closed row says how it closed. This change is to what the view shows, and nothing else. The stored outcome keeps its words, and so do the inbox model's "done:" and "no longer applies:". `hooks/ledger.ts` reads those words in `closedState`, `isPersonsAnswer` and its `UNFOUNDED_MOOT` filter, in saved sessions and in each fresh answer. A model that wrote "fixed:" would close an agent's item as if the person had answered it.

`hooks/view.ts:outcomeLabel` capitalizes each outcome, and `heldLabel` labels a held row. What a closed or held row shows today, and what it would show:

| How it closed | Shown today | Shown after |
| --- | --- | --- |
| The person's answer | Wristband · Yes, fade it | The same |
| A Done press | Done | The same |
| The mod saw the person run its command | You ran it | Done: you ran it |
| A Dismiss press | Dismissed | The same |
| Expired | Expired, unanswered · List full | Expired: no answer · Expired: list full |
| The ledger call: done | Done: ran the migration | The same |
| The ledger call: no longer applies | No longer applies: … | A lead word no answer starts with, such as "Moot: …" |
| The ledger call's FIXED line, on a finding | The change, with no lead word | Fixed: the change |
| The agent's `close` | Closed by Claude: no longer applies: … · Closed by Claude: fixed, it now redraws … | The lead its state maps to, then the reason: "Moot: …" · "Done: fixed, it now redraws …" |
| A finding whose fix was sent | Fix · Do it, the button's own label | Handed off, as `DONE_LABELS` already says for the same press |
| The question a sent fix closes, if any path still reaches it | Fix sent for f12 | Handed off, with no id |
| A finding the ledger call turned into a question | Now a question in Asks | The same |
| A held row | Answered: … · Closed: done: ran the migration · Closed: asked as i37 | The closed row's own words: Answered: … · Done: ran the migration · Now a question in Asks |

So the person's answer shows as given, and every other outcome starts with a lead from one short set: Done, Fixed, Dismissed, Expired, Handed off, the moot word, or Now a question in Asks. The held row stops showing an id and two lead words in a row. "No longer applies" starts with "No", the first word of many answers, as "No, keep it solid", so its shown word changes. `docs/writing.md` settles the word.

Who closed it: the agent's close names the agent and the ledger call's close names no one, though neither is the person's (principle 4). Show it at the end, as "· Claude", for both, or for neither.

The view needs more than `outcomeLabel` gets today, which is only the outcome and `askedAs`. `how: 'update'` covers the person's answer as the ledger call relays it, "done:", "no longer applies:", a FIXED line, "asked as iN" and "fix sent for fN". `how: 'claude'` keeps the agent's name only in its words. So `outcomeLabel` and `heldLabel` also take `how` and whether the row is a finding, and read the words with `NOT_AN_ANSWER` and `OVERTAKEN` exported from `hooks/ledger.ts`, so one parser decides both. A test checks each shown lead word against those parsers. A FIXED close is a finding closed with `how: 'update'` and no `askedAs`, so "Fixed:" needs no prompt change.

### Overview

**Head.** Decision 19's title and continuous description already fit principle 1. No change beyond building #148.

**Subject names.** A short handle the person would say aloud. The name is the row's subject, so it stays a noun phrase. No change.

**Where it stands.** At most `hooks/overview.ts:TEXT_WORDS` words. A narrow rule, since property 6 and the fixed rules already shape it:

- It is a state of the work, never a bare fragment: "starts after export", not "after export" or "after pairing". A participle state such as "in review" or "cause found" stays, and so does a row that names its parts, as "Android works, iOS loses edits".
- A mark gives status, not whether the news is good. So bad news uses a verb that says what fails, as "loses edits on iOS", and good news says what works, as "works on web" (principle 5).
- A subject whose parts can be counted says how many are done, as the prompt's own example does: "critique fixes: 4 of 9 done" (principle 4). The fixed rule against a count of things run, such as tests or files, stays.
- No continuous or past tense of a process word. `evals/overview-rules.ts` already fails "running", "merged" and the like on every shown subject.
- The rule applies to new and changed text only. `OVERVIEW_SYSTEM` already says never to reword a subject that did not change, and a reworded subject moves on the page (decision 5).

A change here starts in property 6 of `docs/plans/overview.md`. The judge's instructions are written from that spec, and some of its Pass examples in `evals/overview-judge.md`, such as "after recovery codes", become failures.

**The demo's Overview breaks rules it should show.** "Glasses pairing: needs this Mac paired" restates the open pairing task, and "Flick option: waits on your pick" names the person's decision, both against property 9. "Glance hit test: finds the glance you look at" is 6 words, over the limit of 4.

**Children.** A subagent or background command shows the description its host gave it, as "Review the gesture code". A delegate shows its own session's goal (decision 21), which the head's rules already shape. Out of scope here.

### The comparison page

The agent writes the comparison as JSON and the page draws it (`hooks/compare-page.html`). The template's comment, which every agent reads, mixes forms in its two choice summaries: "One cache that all four instances share." is a noun phrase and "Each instance keeps its own cache." is a clause. An agent copies the example. The form: every choice's summary is a clause in the present tense whose subject is the choice or its parts, and every value of one measure is in one unit. No eval suite checks the data agents write, since the agent probe runs without file tools, so this step needs its own check.

### PR rows

A PR's block shows its status word and the reasons no row below it lists, after " · ": "Blocked · conflicts with main · changes requested", "Waiting · needs approval · 2 checks running" (`hooks/prs.ts:readiness`, its `head` and `unlisted`). Those mix a verb phrase, a participle and a count phrase, and only some carry a count. Give them one form. A ready PR shows "Ready to merge" alone, which is right.

`readiness` also returns `text`, a whole line no look draws, which names Claude for every agent ("1 thread sent to Claude"). Drop `text`, or give it the agent's name, before a look draws it.

### Stops and Herdr's sidebar

A stop shows one at a time under "Stopped", with `hooks/view.ts:stopText`: "sign-in expired", "billing problem", "usage limit reached", "the API is limiting requests", "the API is overloaded", "API error (…)". Herdr's sidebar lists stops across panes in its own words (`hooks/herdr.ts`): "! Signed out: /login", "! Billing problem", "! Limit: resets …". The sidebar is a list, so principles 2 and 3 apply there most. The stop words get one owner and one noun for each stop, with the sidebar's short form. A stop's words say no more than its kind knows: "Billing failed" would claim a failed charge. Check the `herdr-sidebar` row in "Differences on purpose" first. If it does not cover the wording, the two sets of words are drift.

The sidebar's status token leads with the first open ask, so the Asks forms decide what it shows.

### Press messages are left alone

A press sends a message the conversation shows as the person's own (`hooks/presses.ts:messages`, `hooks/prs.ts:prompts`). Their first words differ: `Re "…": …`, "Remind me what …", `For "…", run this:`, "Done: …", "Please address …". The person reads each one once, but the agent reads every word, and each press's reply depends on it. The gain does not pay for that risk.

## Words the code writes

An inventory of the fixed strings in all four looks found these besides the lists above. Before changing a pair that differs between looks, check "Differences on purpose" in `docs/looks.md`. Row age, the band and stop rows, the Herdr sidebar's reports, a reply while its send is out and the PRs empty hint are there, so their differences stay. The Codex tab's own group names are allowed in "Who owns each rule".

- **A label that names the button, not what happened** (principle 1). A finding whose fix was sent reads "Fix" or "Do it", as in Outcomes above.
- **One concept, two words** (principle 3). "Closed:" is the outcome on a held row and the item on the person's line, until the held row takes the outcome's own word. "Update" names the ledger update ("Last update failed.") and a new build ("Could not load the inbox update." in Codex). A failed PR refresh reads "Last refresh failed: x" on the PR block and "Could not refresh PRs: x" as a press result. Codex's "Not confirmed: the inbox did not answer." puts a reason after "Not confirmed:", where the shared form puts the press's label. The counts read "Asks 2 · Finds 1" on the band and "Asks 2, Finds 1" in omp's `/inbox` notice outside the panel.
- **Copies outside their owner.** Adapters write their own "Try again", "Could not read the inbox.", "Nothing needed", "Not sent: …", "Stopped", "Resume" and "Resuming…", "Hide demo" and "Undo" (`hooks/register.tsx`, `codex/src/tab.tsx`, `omp/src/panel.ts`), and omp writes its own "Your reply". `docs/looks.md` says shared modules own the words. Move each to its owner, so the next change reaches every look.
- **Small fixes.** omp's scroll hint says "line" or "lines" by count in one place and always "lines" in another (`omp/src/panel.ts`).

Some fixed words reach a model. `screenText` reads the tab names, and Codex's `inboxToolText` (`codex/src/texts.ts`) heads its lists "Questions:" and "Tasks:". Check `hooks/model-text.ts` and `codex/src/texts.ts` before treating a string as one no model reads.

## One home for the rules

The article asks for its checklist to reach the agents that write. The inbox has several writers, so each rule is written once and reaches each of them.

- **`docs/writing.md`, new.** The five principles, the form of each list above with good and bad examples, the shown outcome words, and the words for each concept, linked to `GLOSSARY.md`. Anyone who writes a string or a rule a model reads starts there. The "A word on screen" row of "After you change X, check Y" in `docs/looks.md` points to it. Today that row names a `refine-prose` skill this repo does not hold, so a contributor or an agent without it has no rules.
- **One form sentence for each form, in `hooks/model-text.ts`.** `RECORD_SCHEMA` and `systemText` both read it, so a question the agent records and one the ledger call adds take one form, and `restates` sees them as the repeat they are. The constant holds only the form. Each text keeps its own other rules, such as `systemText`'s 16 words and every alternative.
- **Field descriptions, not the guidance.** The forms go in the schema's field descriptions, beside the field they shape. Claude's `close` description carries `guidanceText` and measures 4,052 of `MAX_TOOL_DESCRIPTION`'s 4,096 characters, so the guidance has no room. Check whether Claude Code, Codex and omp cap field descriptions before relying on them.

## How to tell it worked

A check that a row takes its form shows that a model followed the rule, not that a list reads better. So the measures look at what the person sees first, and guard what a form must not cost.

- **First words, from saved sessions.** A local script reads the person's own saved ledgers and counts, for each list, how many rows take each form, and how many rows share their first two words with another row of the list. The second count is principle 2 itself. It needs no model call. Saved ledgers hold session content, so only the counts go in Git, as in `docs/plans/prompt-audit.md`. A session keeps at most 20 open and 12 closed records, so the counts after a step need weeks of real use.
- **A reader check.** Old and new forms of the same rows, from saved sessions, shown as their first two words. The person, or a judge, marks which rows need a yes and which are bad news. Run it on the first form of each list before building it, and keep the form only if it reads better.
- **Forms in the eval results.** A separate script reads the results files in `evals/results/`, which store each run's answer and calls, and reports each list's form and first-words rates. It stays out of the runners and out of a case's failures, so `baselines.json` keeps its meaning and `--with` still accepts earlier results. Its rules, such as a question ends with "?" and a task does not, each pass on a hand-written good text and fail on a bad one in `check.sh`, as the Overview's fixed rules do.
- **What a form must not cost.** Each ask keeps its meaning checks, the `new`, `waiting` and `notNew` patterns in `evals/cases.json`, with new cases where the reply names alternatives the ask must keep. The agent suite compares how many `record` calls each case makes before and after, since rules in a field the agent reads every turn could make it record less.
- **New cases.** The suites hold few cases for some lists. Of the agent suite's 29 cases, a few record a finding or a task and none records an opportunity. The ledger suite has two or three cases each for FIXED lines and todos. Each step adds cases for its forms, and for each behavior it sets out to fix, as `AGENTS.md` asks. Where a case's pattern assumes today's wording, the pattern changes to accept the new form and only that, in its own commit with the reason.

## Order of work

Each step is its own change. A step that changes text a model reads follows "Text a model reads" in `AGENTS.md`: compare the two versions' prompts on one sample exchange first, run the suite named for that text, rerun a failing case once at three times its runs with `--with`, and never rerun until it passes. A step that changes `hooks/` rebuilds the bundles with `npm --prefix codex run build` and `npm --prefix omp run build`, and every step runs `./scripts/check.sh`.

1. **Rules and counts.** Write `docs/writing.md` and point `docs/looks.md` at it. Add the saved-session counts, the results report and its rule tests, and record each list's counts today. Run the reader check on the proposed Asks and Finds forms. No text a model reads changes.
2. **Words only the view shows.** Outcomes and held rows, with the parser test and a test that a held finding the ledger call turned into a question shows no id. A test also tries to reach "fix sent for fN". If one fails, that is a product bug to file as a GitHub issue, as `AGENTS.md` asks. The fixes in "Words the code writes", PR reasons, stop words, and the demo's Overview rows that break property 9 or the word limit. No model reads these.
3. **Asks.** The question and task forms, as one form sentence in `hooks/model-text.ts`, read by `RECORD_SCHEMA` and `systemText`, and the two examples that show a question as an instruction. Then `todoAsk`, and `tests/ledger.test.ts`, which checks its words. Run `./scripts/eval.sh` and `./scripts/eval.sh --suite agent --agent all`. Then bring the demo's asks to the forms.
4. **Finding titles.** The issue and opportunity forms in `RECORD_SCHEMA`. Run `./scripts/eval.sh --suite agent --agent all`. Then the demo's findings.
5. **The comparison page.** The comment's form rule and its example, then build each agent's comparison for one sample question, and check that the data is valid and its summaries take one form. Rebuild both bundles, whose builds copy the template.
6. **The Overview's where it stands.** Property 6 in `docs/plans/overview.md`, then `OVERVIEW_SYSTEM`. A fresh author revises the judge's instructions from the spec, with new good and bad pages, through `--judge-pages` and `--judge-set 1` as that plan says. Add a replay step for each behavior. Run `./scripts/eval.sh --suite overview --judge`. Last, since it costs the most and gains the least.

A change to the demo also changes `omp/tests/panel.spec.ts`, which names demo asks and the outcome "Done", and the demo rows quoted in `docs/plans/launch-video.md`. The demo test in `tests/hooks.test.ts` reads its strings from `demoView`, so it follows. The demo's asks and findings change after their forms are measured, so they change once.

## Each look

Every step says, for each look, whether it applies and what was checked there, as `AGENTS.md` asks. What to watch in each:

- **Terminal and omp.** Each cuts a row at its cell width. Check each list at a narrow width, and that the words that tell rows apart survive the cut. Check omp in its light theme.
- **Desktop.** A Button is as small as its label, so a new label moves its neighbors. Check every state of a row whose label changes, and that the pane shows the new build before trusting a capture.
- **Codex.** The Overview's lines clamp with `-webkit-line-clamp`, and the tab bar switches to symbols with a container query. Check both at the widths where they switch, in both themes.
- **Herdr's sidebar.** Not a look, but the narrowest list the person scans. Check the status token after the Asks step.
- **All four.** Old rows keep the words they were saved with, so a list shows both forms until the old rows close. Check a saved session from the last build in each look.

## Risks

- **A small rewording changes what a model does.** A one-word edit to the findings rule once made the ledger call re-add questions the person had dismissed. One change per run, and the suites `AGENTS.md` names for each text.
- **Form can crowd out meaning.** The word limits are tight: 12 words for an agent's ask, 16 at most for the ledger call's, 8 for an outcome, 4 for where it stands. A rule that adds fixed words takes room from the content. Prefer rules that remove words, such as dropping "Should I", to rules that add them.
- **Fewer records.** A form rule in a field the agent reads every turn can make it record less. The agent suite's record counts guard this.
- **Repeats.** `restates` drops only `FILLER` words, and `GENERIC` applies only in `repeatsSubject`. A word that every row of a form shares, other than a `FILLER` word, makes different rows look alike. Add any such word to `FILLER` in the same step, with ledger tests and a ledger suite run.
- **Words the code parses.** Stored outcomes and the inbox model's "done:" and "no longer applies:" are read by `hooks/ledger.ts`. The options "List the choices" and "Not yet" are matched exactly. Change only what the view shows.
- **Mixed lists for a while.** Saved rows are not rewritten. They are what the agent recorded, and repeat checks compare against them. They leave as they close or expire.
- **Languages other than English.** The forms and openers are English. Nothing in the texts the models read sets the language of a row. Decide before step 3 whether a form rule says "in English" or "in the session's language".
- **Cost.** Steps 3 to 6 run model suites on Claude, Codex and omp, and step 6 also revises the judge.

## Not in this plan

- PR thread titles and comments, quoted from GitHub.
- Children's names, which their hosts write, and a delegate's goal, which the head's rules shape.
- Options and finding details, as above.
- Press messages, as above.
- The agent's own reply, beyond what `guidanceText` already asks of a question in it.
- Docs that only contributors read: `docs/plans/`, `AGENTS.md` and `docs/reference/`. The README's "Using it" names each list but quotes no rows, so it needs no change.

## What the reviews changed

- **Questions.** The first draft started every choice question with "Which" and dropped the subject of every yes-or-no. "Which" is a shared opener that `restates` counts as a key word, and it lost the alternatives a question names. Dropping the subject made a fact question read as a proposal. Questions now take an act form and a topic-first form.
- **Finding titles.** An issue may say "can" for a risk, since a plain present tense would claim a failure nobody saw. An opportunity starts with its change, not "the thing could …", which made most of them passive.
- **Outcomes.** The view cannot tell closes apart by `Closed.how` alone, and the inbox model's outcome words are parsed. Outcomes are now a view-only change that reads the stored words with the ledger's own parsers, and step 5 of the first draft, a prompt change, is gone. Held rows were missing, and one of them shows an id.
- **Two "product bugs" were not bugs.** "sent to Claude" is in a line no look draws. "fix sent for f12" needs an open finding that keeps `askedAs`, which a reopen strips. Both are now notes, not issues to file.
- **The Overview rule is narrower.** A verb first in every where it stands would have broken property 6's own examples and the 4-word limit, and changed the judge's Pass examples. It now bans bare fragments and asks the verb to carry good or bad news.
- **Measurement.** Form checks moved out of the runners, where they would have broken baselines and `--with`. Principle 2 is now measured directly, by shared first words, and a reader check and a record-count guard were added.
- **Dropped:** a form for options, a fixed order for finding details, a change to press messages, and README edits.
