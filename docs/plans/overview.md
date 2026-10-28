# The Overview tab

Status: built, on next builds only. Release builds leave the tab out. "Not built yet" lists the decided changes still to build. The evals that judge the tab are planned in "How the Overview is judged".

## Summary

The Overview is the inbox's first tab on a next build. It is about the session's work. Asks and Finds are about what the person has to do. As of the agent's last reply, it answers four questions:

- **What is this session's work?**
- **Where does each piece of it stand?**
- **Which pieces wait on me?**
- **What moved since I last looked?**

The page is one list of subjects, newest change first. A subject is one piece of the work, such as a feature, a fix or a release. Each row shows a status mark, a short name and a few words on where the work stands. A Seen line marks where the person last looked. Every row above it changed since then. The inbox model adds, updates and closes subjects. Code owns every time, the order, the Seen line, the folds and the rows of running work.

All four looks draw the same page from one shared view: the Claude Code terminal, the Claude desktop app's pane, the Codex tab and the omp panel. `docs/looks.md` says where they differ.

The page fails when it reads as a log, when it copies Asks or Finds, or when it says something the session has moved past.

## Decisions

1. **One list of subjects, newest change first, with no sections.**
   - Reason: each piece of work shows once, with its change attached, and the order reads down the page as a timeline. The earlier six-section page showed one subject in up to six places.
2. **The inbox model edits subjects by id. Code applies each edit.**
   - Reason: a model that rewrites the whole page from the last page drifts toward the newest exchange. In a replay of one real session, 33 of 35 replies rewrote the page.
3. **Code writes every time and the order. The model never writes a time.**
   - Reason: a time word in model text freezes when it is written, so "merged today" reads wrong the next day. How long work has stalled carries meaning, so the times must be true.
4. **Time shows only on work that has stalled. Rows have no age column.** A subject held by an ask, or waiting on something outside the session, reads how long it has waited on its second line, as `waiting 2h`, once that passes 15 minutes. A child with no activity for 15 minutes reads `quiet 40m`. A row's place follows when its work last changed, not when the page last checked it.
   - Reason: an age on every row was hard to read and said little. A time matters when work has stopped moving. A row that rose because the page checked it would claim a change that did not happen.
5. **A changed state always reaches the page.** Code keeps the old text and place only when the new text has the same content words, in any order.
   - Reason: "manual merge ready" becoming "manual merge broken" is a change, though half the words match.
6. **◆ comes from a link between an open ask and the subjects it holds up.** The Overview call writes the link. Code draws ◆ while the ask is open and clears it when the ask closes. One ask can hold up several subjects. There is no "waits on you" status and no "problem" status.
   - Reason: a ◆ set by the model could not see Asks, so it went stale and could disagree with Asks. A problem nobody is fixing is a to-do for the person, so it belongs in Asks, or in Finds when it is outside the task.
   - This replaces the rule that the Overview call reads no inbox text. It now reads each open ask's id and first words, so it can link the ask. It never restates one.
7. **Work filed for later closes with a mark of its own, not ✓.**
   - Reason: filing a piece does not finish it. ✓ and the done count mean work that was delivered.
8. **No buttons that act on an ask or a finding.**
   - Reason: an Answer or Fix button on a row would make the Overview a weaker copy of Asks and Finds, with less context.
9. **Code follows running work from host events, and draws each as a child row under its subject.** The model only links a child to a subject.
   - Reason: code knows when a subagent, background command, workflow run or delegate starts and ends. The person wants delegated work shown under the piece it serves.
   - This replaces the decision to have no subagent rows.
10. **The page updates after each reply, and during a long turn once 10 minutes have passed.**
    - Reason: between replies, a long turn left the rows hours old.
11. **A look counts once the tab has shown for 5 seconds, and it marks as seen only the rows that were on screen.**
    - Reason: a pass through the tab on the way to another one moved the Seen line past changes the person never read. A long page can hold rows the person never scrolled to.
12. **The model reads the work from the exchange.** A host's own task list is extra input.
    - Reason: Claude Code and Codex offer no task list by default, so work read only from a task list would be missing there. `docs/reference/task-lists.md` has the sources.
13. **No step tool.** The agent is not asked to report its steps.
    - Reason: the exchange and the host's task list already say the same, and a tool would add guidance text for every agent.
14. **One page for every session.** A coordinator's streams and a single task's pieces are both subjects.
    - Reason: one form keeps the page the same shape wherever the person opens it.
15. **The job is the four questions above.** The page shows no reason for a decision, and has no separate "next" part.
    - Reason: reasons need a line of prose under each decision, which brings back sections. ○ rows already say what comes next.
16. **Evals are a cheap check that a failure seen in real use does not come back.** They run at each release, within about 200 Overview calls. Fixed rules check what code can measure. A model judge checks what only reading can tell. The judge is first checked against hand-written good and bad pages that the author of its instructions never sees.
    - Reason: the person's daily use of next builds and reports from users are the main signal. The evals only keep a fixed failure fixed. The old Overview cases passed 42 of 42 while a live Overview kept a goal about a release that had shipped, and listed one piece of work under two names. Each case checked one rule of the Overview prompt, most of them in a single exchange.
    - This reverses the decision to check the tab with fixed rules only.
17. **Only next builds draw the tab.**
    - Reason: it is not ready to release. A release build treats a saved Overview tab as unknown and shows its first tab.
18. **The page has no identity line.**
    - Reason: the line takes space without telling sessions apart. Folder, branch and role are often the same across sessions, and each host already names the session in its own window, tab or title.
19. **The head is a title and a one-line description of what the session is focused on now.** The title is short, like a row's name. The page has no live line.
    - Reason: the head then reads like a row. The person scans the title, and reads the description for what the session is doing now. Each host already shows whether its agent is working, and a ● mark moves while a turn runs.
20. **By default, a row draws where it stands on its own line, under its name.**
    - Reason: the names line up down the page, so the person can scan them.
21. **A child row says in a few plain words what its work does, never an id.** A Herdr delegate shows what its own session's Overview says it is focused on, which the inbox publishes to Herdr: today its goal, and once decision 19 is built, its head's description. Without one, it shows its name turned into words. A subagent, background command or workflow run shows the description it was started with.
    - Reason: a name an agent made up for a delegate tells the person nothing about the work.

## Terms

From `GLOSSARY.md`: Overview, Goal, Subject, Child, Seen line, Look, Host and Catch-up. The new terms:

- **Overview call:** the inbox model call after the ledger call. It reads the open subjects and the new exchange, and answers with edits.
- **Head:** the top of the page. Today it is the goal and the live line. Decision 19 makes it a title and a one-line description, with no live line.
- **Live line:** today, the line under the goal that says what the agent does now: "Working…", "Working… for 25m", or "Idle · last reply 12m ago". Decision 19 removes it.
- **Stall time:** how long a piece of work has waited, or a child has done nothing, in words code writes, such as `waiting 2h` or `quiet 40m`.
- **Where it stands:** the few words after a subject's name.
- **Was line:** a line under a subject that names the plan a change replaced, as "was: last-write-wins", or a piece merged into it, as "merged in: Banner on hover".
- **Link:** the Overview call's tie from an open ask or a child to the subject it belongs to.
- **Fold:** one line that stands for several rows: "✓ 3 done" or "○ 2 more queued".
- **Last changed:** when a subject's status or meaning last changed. A row's place in the list follows it.
- **Last checked:** when an Overview call last read the work, whatever it answered.
- **Property:** something true of a good Overview that a person can check by reading the page, knowing what happened in the session.
- **Fact list:** what really happened in an eval case, written by the case's author: each piece of work, its state at each step, the asks and the pieces each holds up, and what is not work.
- **Rule:** a check written in code, run on the saved Overview, the drawn page and the fact list.
- **Judge:** a model that reads a drawn page and the fact list, and says whether each of its checks holds.
- **Replay:** an eval case of many steps, in which each answer is applied before the next step, as a host would.
- **Known failing case:** a check of a failure that code owns. It stays in the suite, marked as expected to fail, until the code is fixed.

## The page

From top to bottom:

| Part | What it shows | Who writes it |
| --- | --- | --- |
| Goal | What the session's work is for. The call is asked for at most 8 words, and code clips it at 14. | Model |
| Live line | "Working…", "Working… for 25m", or "Idle · last reply 12m ago" | Code |
| Subject rows | A mark, a short name, a few words on where it stands, and the age of the last change. The call is asked for a name of at most 3 words and a text of at most 4. Code clips them at 20 and 12. | The model writes the status, name and text. Code draws the mark and the age, and orders the rows by last change. |
| Was line | The plan a change replaced, or a piece merged into this one, until the person has seen it | The model writes it. Code shows it only until the person has looked. |
| Child rows | Running work under its subject, named by the first line of the name its host gives it, with how long since it last did anything. After 15 minutes with no activity it reads "quiet 40m". | Code, from host events. The model writes the link. |
| Seen line | Where the person last looked. Rows above it changed since. It is left out when nothing changed. | Code |
| Folds | "○ N more queued" past 7 open rows. "✓ N done" for the done subjects not drawn as a row, or "✓ N more done" when a done row shows above it. | Code |
| Status line | "Last Overview update failed. Changes from that reply may be missing." while the last call wrote nothing | Code |

Today the page also opens with an identity line, such as `notes-app · main · coordinator`. Decided changes to this table, all in "Not built yet":

- Decision 4 drops each row's age. Time shows only on stalled work.
- Decision 18 removes the identity line from every look.
- Decision 19 replaces the goal with a title and a one-line description, and removes the live line.
- Decision 20 moves where it stands to its own line, under the name.
- Decision 21 names each child row in plain words. A Herdr delegate's name is often an id today.

The marks:

| Mark | Meaning | Source |
| --- | --- | --- |
| ● | Work being done now in this session. It moves while the turn runs or a child under it works, and stays still between turns. | Model's status `working` |
| ○ | Work the session will do, not being worked on now: not started yet, or set aside | `queued` |
| ◌ | Work that waits on something outside the session, such as another team or a build | `waits-on-other` |
| ✓ | Delivered | `done` |
| ✗ | Dropped, with why | `dropped` |
| A mark of its own, proposed `→` | Filed for later. The session will not do it. | A new closed status, not built yet |
| ◆ | Held up by an open ask. It replaces the status's mark until the ask closes. | Code, from the link |

More rules of the drawn page, all in `hooks/view.ts:overviewPage`:

- A subject's text wraps to at most 3 lines.
- At most 2 finished rows show, both changed since the last look. The rest fold into the count. Property 10 asks for more; see "Not built yet".
- Below the Seen line, an open row keeps where it stands, and drops its was line.
- At most 3 children show under one subject. The rest read "+ 2 more running".
- A child whose subject is not shown, or that has no link yet, sits at the top of the list.
- A held subject never folds into the queued count, and its mark does not move.
- The Asks row of a linked ask reads "Holds up" and the subject's name.

Before any work, the page reads: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."

### How it updates

- **After each reply.** The ledger call runs first, then the Overview call. A failed ledger call skips it.
- **What the Overview call reads:**
  - the goal;
  - the open subjects, each with its id, status, name and text;
  - the names of the last 10 finished subjects, so it does not add one again;
  - each open ask's id, its first 30 words and its linked subject;
  - the running children;
  - the host's task list, where there is one;
  - the person's message, the agent's tool activity and the reply.
- **What it answers:** edits by id, one per line: add a subject, update one, finish one, drop one or drop it into another, write a was line, link an ask or a child, set the goal. Or `UNCHANGED`. `hooks/overview.ts` parses and applies the answer.
- **What code does with it:**
  - A new subject whose name holds the same key words as an open one updates that one.
  - An update that keeps the status and has the same content words, in any order, keeps the old text and its place.
  - An answer that holds any line that is not an edit is asked once more. If that fails too, the page stays as it was and the status line says so.
- **During a long turn.** The main agent's next tool call, once 10 minutes have passed since the turn began and since the last Overview call, starts an Overview call. That call reads the person's message and the turn's activity so far.
- **On a catch-up.** The call reads the whole conversation and edits the current subjects.

`hooks/overview.ts` owns the saved Overview, the parser and how an answer applies. `hooks/view.ts` owns the drawn page. `hooks/model-text.ts` owns the call's prompts. `docs/looks.md` names the owner of every other rule.

## What a good Overview is

Each property below says what the person needs from the page, and is tied to one of the four questions. A person who knows what happened in the session can check each one by reading the page. Evals check these properties. They do not check the wording of the Overview prompt.

The numbers stay fixed, so references to them stay valid. Number 2 is unused.

The examples come from one sample session. It adds offline sync to a notes app. Its pieces are the sync conflicts, an export button and the 2.4 release. A delegate builds the export's PDF layout.

A good page after the person was away two hours, drawn as decided:

```text
Offline sync
Adding offline sync to the notes app

◆ Sync conflicts
  merge logic ready · waiting 40m
✓ Sync engine
  syncs on reconnect
── Seen ──────────────────────────────
● Export button
  works on web
  └ ● Lay out the PDF export  quiet 40m
○ 2.4 release
  after export
✓ 2 more done
```

The question "Which conflict rule ships?" has waited in Asks for 40 minutes, and its row there reads "Holds up Sync conflicts".

To keep them short, the examples below write a row on one line, as `Name: where it stands`.

### What each property is judged against

A judge or a rule judges a page against the facts up to that point in the session, never later ones. A reply's claims are evidence of what the agent said, not of what is true. If a publish failed, a reply that says "published" does not make ✓ right. In an eval, the fact list holds these facts.

| Property | Judged against |
| --- | --- |
| 1. The head | The person's requests so far, and which pieces are open or finished |
| 3. Each row is work | Each piece of work, and each thing that is not work: asks, findings, tasks for the person, standing rules |
| 4. Each piece once | Each piece with every name the conversation used for it, and the pieces closed earlier |
| 5. Marks and closing | Each piece's real state: being done, set aside, waiting on something outside, delivered, dropped or filed for later |
| 6. Where it stands | The same states, part by part where the parts differ |
| 7. Running work | The host's events for each child, what each child was started to do, and the piece it serves |
| 8. ◆ | The open asks, and the pieces each one holds up |
| 9. No repeats of Asks | The text of the open asks and findings |
| 10. Changes shown | What was on screen at the last look, and which pieces changed since |
| 11. Nothing moves | The page before the exchange, and whether the exchange changed any piece |
| 12. Changes of plan | The plan before and after, and which pieces merged into which |
| 13. How current | When each Overview call ran and whether it failed, when the activity happened, and how long each held or waiting piece and each quiet child has waited |

### What is this session's work?

#### 1. The head says what the session is focused on now

The first words the person reads tell them what the session is focused on, in their own terms. The title names that focus in a few words, like a row's name. The line under it says what the session is doing about it. The head stays the same while the work goes on, and changes when the focus moves. When the work is done and nothing follows, the head still names it.

Until decision 19 is built, the head is one goal line. A page then fails the check for a title and a description, which is a known failing case for #148, and the other checks read the goal.

- **Good:** `Offline sync` over `Adding offline sync to the notes app`, unchanged through a lint fix, new tests and a question.
- **Good:** a coordinator that shipped 2.4 and now runs the sync fix and 2.5 reads `2.5 release` over `Fixing the sync bug, then shipping 2.5`.
- **Good:** `2.4 release` over `Shipping notes 2.4 to the store`, after 2.4 shipped, when the person asked for nothing more. Its row reads ✓.
- **Bad:** the same head two hours after 2.4 shipped, while the session works on the sync bug.
- **Bad:** a coordinator's head names one small stream, such as `Hooks release`, while most of its work is on sync and 2.5.
- **Bad:** `Lint error` over `Fixing the lint error`, after one step on the way.
- **Bad:** `Offline sync` over `PR ready for review`. That is where one piece stands, not the session's focus.
- **Bad:** `Offline sync` over `Offline sync`. The description only repeats the title.
- **Bad:** the title `Add offline sync so notes save without a connection`. That is a sentence.

### Where does each piece of it stand?

#### 3. Each row is one piece of this session's work, named the way the person would name it

A row is something the session builds, fixes, ships or hands to a delegate. Its name is a short handle the person could say aloud.

- **Good:** `Sync conflicts`, `Export button`, `2.4 release`.
- **Bad:** `Choose the conflict rule`. That is a question, and it belongs in Asks.
- **Bad:** `Restart the app to load the build`. That is a task for the person.
- **Bad:** `Settings page warning`, a problem outside the task. It belongs in Finds.
- **Bad:** `Merge freeze`. That is a standing rule, not work.
- **Bad:** `A chat whose archived history can't rebuild…`. That is a sentence, cut off.

#### 4. Each piece of work shows once

One row per piece, whatever words the conversation used for it. Finished work does not come back as new work under another name.

- **Good:** one row, `● Checkout total: fixed on web, iOS left`, after the person calls it "the cart rounding bug".
- **Bad:** `Checkout total` and `Cart rounding bug`, both open, for one fix.
- **Bad:** `✓ Export button` when its PR opens, and a new `● Export PR`.

#### 5. Each mark is true, and every open piece stays on the page

The person can trust a mark at a glance. A piece that is delivered, dropped or filed for later closes, with its own mark. Every piece still open is on the page, as a row or in the queued fold, however many there are and however old. The page gets shorter by closing what is done, dropped, filed or listed twice, never by losing open work.

- **Good:** `✓ 2.4 release: live in the store`, with a separate `● Sync bug: cause found`.
- **Good:** a piece set aside for a day keeps its row: `○ Export button: works on web`.
- **Good:** `→ Dark mode toggle: filed for later`, then folded apart from the done count.
- **Bad:** `● 2.4 release: published, sync bug next`. The release is over.
- **Bad:** ten `○` rows that read "filed for later", all evening.
- **Bad:** `✓ Dark mode toggle: filed for later`, counted with delivered work in "✓ 4 done".
- **Bad:** nine pieces are open, and the page shows six, with no fold and no ✓ or ✗ for the other three.

#### 6. Where it stands says the state of the work

A few words on what works, what is left or what it waits on, in the work's own terms. It does not name the step that ran, the tool that runs now, an id, or what was said in the conversation. A row that covers several parts keeps every part whose state differs. When those parts do not fit in a few words, each gets its own row.

- **Good:** `Export button: works on web and iOS`.
- **Good:** `2.5 release: in review`, for a coordinator's stream.
- **Good:** `Sync engine: Android works, iOS loses edits`, or a row for each.
- **Bad:** `Sync engine: mobile unfinished`, when Android works and iOS loses edits.
- **Bad:** `Export button: tests running`, or `PR open, reviewer running` when the reviewer already shows as a child row.
- **Bad:** `Export button: export button merged`.
- **Bad:** `Sync conflicts: discussed three options`.

#### 7. Running work shows under the piece it serves, in plain words

A delegate, subagent, background command or workflow run shows under the subject it works on while it runs. It says in a few plain words what it does. A delegate shows the focus its own session's Overview publishes, and other running work shows the description it was started with. After 15 minutes with no activity, it says how long it has been quiet.

Until decision 21 is built, a delegate shows its Herdr name, and a delegate whose name is an id fails this property. That is a known failing case for #149.

- **Good:** `● Export button` with `└ ● Lay out the PDF export` under it.
- **Good:** the same delegate, idle for 40 minutes, reads `quiet 40m`.
- **Good:** a review subagent started as "Review the sync engine diff" reads `Review the sync engine diff`.
- **Bad:** `└ ● pdfx2`. An agent made up that name, and it says nothing about the work.
- **Bad:** the PDF layout delegate under `Sync conflicts`.

### Which pieces wait on me?

#### 8. ◆ marks every piece an open ask holds up, and only those

From the page alone, the person sees which pieces cannot move until they act. The ◆ goes when they answer.

- **Good:** the open question "Which conflict rule ships?" puts ◆ on `Sync conflicts`.
- **Good:** one open task, "Sign in to the app store", puts ◆ on both `2.4 release` and `Hotfix release`.
- **Bad:** ◆ on `Export button` for the conflict question.
- **Bad:** `● Sync conflicts` while the work cannot move until the answer.

#### 9. The page points to Asks and never repeats them

The Overview shows the work. Asks and Finds show the person's to-dos. A row held up by an ask says where its work stands.

- **Good:** `◆ Sync conflicts: merge logic ready`.
- **Bad:** `◆ Sync conflicts: needs your decision`. ◆ and the band already say so.
- **Bad:** `◆ Sync conflicts: last-write-wins or manual merge?`. That is the question, copied.
- **Bad:** a row for a finding, a PR check or an option.

### What moved since I last looked?

#### 10. Every real change shows above the Seen line, on its piece of work

Back after a break, the person learns from the rows above the Seen line what finished, started, stalled or changed course, without reading the conversation. Each change sits on the row of the piece it changed. Every piece that finished since the person last saw it is named. A row counts as seen only once it was on screen.

- **Good:** the sample page above. The conflicts work and the sync engine changed since the look, and the export did not.
- **Bad:** 2.4 shipped, but `2.4 release` still sits below the Seen line with its old text.
- **Bad:** six pieces finished while the person was away. The page names two and folds the release into "✓ 4 more done".
- **Bad:** forty pieces finished. The person saw the first six rows and left, and the page now treats all forty as seen.

#### 11. Nothing moves that did not change

A reply that changed nothing about the work leaves every row and the Seen line where they were. So a row above the line always means a change. A choice the person makes is a change.

- **Good:** the agent explains how export picks a file name, and nothing is decided. The page stays as it was.
- **Good:** the person picks "Save as PDF" as the export button's label. The export row says so, and moves above the Seen line.
- **Bad:** `Export button: works on web, iOS left` becomes `web done, iOS remaining`, and moves to the top, above the Seen line.

#### 12. A change of plan says what it replaced

When the session drops one approach for another, the person sees both until they have looked. When one piece merges into another, the row names the merged piece by its short name.

- **Good:** `● Sync conflicts: manual merge`, with `was: last-write-wins` under it.
- **Good:** `● Offline banner: option A built`, with `merged in: Banner on hover` under it.
- **Bad:** the text changes to "manual merge", and nothing says the plan changed.
- **Bad:** a was line on a row that only made progress.
- **Bad:** `merged in: Show the offline banner on hover and keep it open…`. The merged piece had a sentence for a name, and the line ends cut.

#### 13. The page is current, and says when it is not

The page covers the work up to the last reply, or up to about 10 minutes ago during a turn. When an update fails, the page says so. The only times on the page are stall times, and code writes each one. A row's place follows when its work last changed, so on a current page a row that did not change stays where it was.

Until decision 4 is built, every row shows an age. That is a known failing case for #150.

- **Good:** three hours into a turn, `● Sync conflicts: cause unknown` stays where it was, because the last update found nothing new.
- **Good:** `◌ 2.4 release: in store review · waiting 2h`, two hours after the build went to review.
- **Good:** "Last Overview update failed. Changes from that reply may be missing."
- **Bad:** the agent finished the conflicts work two hours into a three-hour turn, and the row still reads ●, since no update ran during the turn.
- **Bad:** `● Export button: works on web  2h`. The export has not stalled, so it shows no time.
- **Bad:** `2.4 release: goes out tomorrow`, read two days later.

## How the Overview is judged

Decision 16 sets the method. The evals run at each release, and after a change to the Overview call's text or to the code that applies its answer.

`./scripts/eval.sh --suite overview` runs them. These files hold them:

| File | What it holds |
| --- | --- |
| `evals/overview-replays.ts` | The replays and the short case, with their facts |
| `evals/overview-replay.ts` | How a replay runs each step through the hosts' own code |
| `evals/overview-facts.ts` | The fact list, and the text of it the judge reads |
| `evals/overview-rules.ts` | The fixed rules |
| `evals/overview-judge.ts` | The judge's checks, its prompt, and how its answer is read |
| `evals/overview-judge.md` | The judge's instructions |
| `evals/overview-run.ts` | The runner, its report and its results file |
| `tests/overview-evals.test.ts` | The checks with no model calls |

### What goes in the suite

- **A case comes from a real failure.** The sources are the failures seen in real sessions, what the person hits in use, and the record of Overview calls once a next build keeps one.
- **A case joins when it reproduces its failure.** A short case must fail on today's prompt at the step and property it targets. A replay targets a failure at each step, and joins when at least one step fails as targeted. A step that does not reproduce its failure stays as a check, marked as not reproduced. A failure owned by code joins as a known failing case.
- **A failure counts only when the property it targets fails.** An answer that is unreadable, or that breaks another property, is reported but does not count as reproducing the failure.

### The case format

A case is a starting state, then steps, with the fact list beside them.

- **The starting state:** a saved ledger, with its Overview, open asks and findings, and the session's presence.
- **A step** has a time, and runs in this order:
  - host events: a child starts, acts or ends, or the person looks at the page for some seconds;
  - fixture events, in a replay that skips the ledger call: an ask opens or closes;
  - at most one call: a reply, a mid-turn call or a catch-up, each with its exchange or conversation, or a recorded call's exchange as it was.
- **The fact list** gives, for each step, the session's focus, every piece of work with its aliases and its real state, the asks and the pieces each holds up, the running work and the piece each serves, and what is not work. A step lists only what it changes, and the pieces it changes are the step's changes.
- **Targets:** each step names the rules or judge checks of the failure it was written to reproduce.

Host events run through the hosts' own reducers, such as `childStarted` and `lookEnded`. Links and ids stay as the run made them, so a fixture never corrects a wrong link the run made. The expected links live only in the fact list, for grading.

A next build's record of an Overview call holds the call's input as data: the Overview before, with its running children, the open asks, the host's task list, and the exchange. `replayFromRecord` turns a record into a one-step replay at the time the call ran, which builds the prompt again with today's code. The case's author adds the facts. The record's own prompt and answer show the failure that was seen.

### The replays

Three replays, each run 3 times on Sonnet and on Codex. Fixed rules check the page after every step. The judge reads a few checkpoints. Each call has its host's limits: 45 seconds and 1600 output tokens for Claude, 120 seconds for Codex. A call past its limit fails, as it would in the host: the page stays as it was, and the status line says so.

**Replay A: a coordinator's day.** Overview calls only. The fixture opens and closes the asks. It starts from a busy page: a head about shipping notes 2.4, seven open pieces, three done, two running delegates and one open ask, last seen two hours earlier. One delegate's Herdr name is an id, and its session publishes a goal.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A delegate reports the sync merge done, and the coordinator merges it | The piece closes as ✓. Its text names no step. |
| 2 | The coordinator publishes 2.4. The reply is full of times. | The release closes. No time word reaches the page. |
| 3 | The person asks to file dark mode and widgets for later, fix the vanishing-notes bug, and ship 2.5. A delegate starts on the bug. | The head leaves 2.4. Both filed pieces leave the open rows, with the filed mark once it is built. The delegate sits under the bug, in plain words. |
| 4 | The delegate calls it "the archive bug", and the person asks for a long, sentence-like extra on the same fix | One piece, not two. If the extra merges into the fix, the line naming it is readable. |
| 5 | The coordinator asks whether 2.5 waits for the fix. The ask opens. | ◆ on 2.5 only. Its text does not restate the question. |
| 6 | The person answers, and the ask closes | ◆ clears. The row shows the choice. |
| Look | The person reads the page | The Seen line moves to this point |
| 7 | A reply that only explains how releases work | Nothing moves |
| 8 | The coordinator records a flaky test elsewhere as a finding | No subject for it |
| 9 | The fix's PR opens, and a reviewer subagent starts | Checkpoint. No new "PR" piece. The text says the state of the fix. The reviewer sits under the fix. |
| 10 | The PR merges, and 2.5 prep starts | The fix closes as ✓ under its own name. 2.5 is ●. |
| 11 | The person asks why export sometimes picks the wrong default folder on one platform | The new piece gets a short name |
| Return | Three hours pass | Only the held, waiting and quiet work shows a time. |
| 12 | 2.5 is published, and nothing follows | The head names the finished push. The export piece, set aside since the start, is still ○. |

At every step, the pieces set aside or waiting on a vendor stay on the page.

**Replay B: one task, with both calls.** Each reply runs the ledger call, then the Overview call, as the product does. So an ask is born, answered and dismissed by the ledger, and the Overview sees each change. It starts empty.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | The person asks for offline sync. The agent plans the engine, conflicts and a settings toggle, and starts the engine. | The head names the aim. Three pieces. |
| 2 | The engine works. On the way the agent fixes a lint error and runs two review subagents. It asks "last-write-wins or manual merge?" | The head holds. The subagents sit under the engine, each named by the description it was started with. ◆ on conflicts, from the ledger's new ask. |
| 3 | The person answers "manual merge" | The ask closes, ◆ clears, and the conflicts row shows the choice |
| 4 | The person reverses: last-write-wins with a backup copy | A was line on conflicts, and no new piece |
| 5 | Conflicts progress. The person sets the toggle aside and asks for an offline banner first. | The toggle is ○ and stays. The banner is ●. No new was line. |
| 6 | The person asks how the backup copy is named and why the plan changed, and the agent explains both. Nothing is decided. | Nothing moves |
| 7 | The banner shows on phones, and the agent asks whether it shows on web too | ◆ on the banner, from the ledger's new ask |
| 8 | The person dismisses the question and asks for device tests. Android syncs, and iOS loses edits after a crash. | The ask closes as dismissed, and ◆ clears. The banner closes as ✓. The engine row keeps both states, or splits. |

**Replay C: a long turn and a catch-up.** Overview calls only.

| Step | What happens | What it checks |
| --- | --- | --- |
| 1 | A mid-turn call at 12 minutes. The activity finishes one piece and starts another. The host's task list holds file and test steps beside the features. | The finished piece closes, and the next is ●. No file name or test step becomes a row. |
| 2 | A mid-turn call at 25 minutes. The activity shows more investigation and nothing new. | `UNCHANGED` is right, and no row moves |
| 3 | The reply ends the turn | |
| 4 | Two replies were dropped, and a catch-up reads the whole conversation | Finished work is not ●. The missed change reaches the page. |

**One short case** stays outside the replays: a catch-up of a conversation the inbox never saw, from an empty page. It links the question the last reply left open to its subject. Finished work marked ● after a catch-up was a real failure, and Replay C's catch-up starts from a page that already holds the work.

The 20 single-exchange Overview cases left `evals/cases.json`. Each one's scenario is a step above, and their checks run at every step. `overview-shown-records-question` checks only the ledger, so it stays in the ledger suite. `catch-up-records-open-question-and-result` keeps its ledger check, and the short case above checks its Overview.

| Case | Replay step |
| --- | --- |
| `overview-feature-level` | A 9, and the text rule at every step |
| `overview-direction-change` | B 4 |
| `overview-plain-progress-no-course` | B 2 |
| `overview-coordinator` | A 3, for the delegate's link |
| `overview-single-task-not-coordinator` | B 2, for a piece that finishes in one exchange |
| `overview-coordinator-update` | A 1 and A 10 |
| `overview-ask-not-restated` | B 2 |
| `overview-ask-links-right-subject` | A 5 |
| `overview-problem-outside-task-not-subject` | A 8 |
| `overview-long-name` | A 11 |
| `overview-mid-turn-moves-on` | C 1 |
| `overview-new-goal` | A 3 |
| `overview-nothing-changes` | A 7 |
| `overview-reversal-then-progress` | B 5 |
| `overview-reversal-explained-again` | B 6 |
| `overview-host-tasks` | C 1 |
| `overview-long-session` | A, from its busy start |
| `overview-child-linked` | A 9 |
| `overview-reword-only` | A 7 |
| `overview-no-time-words` | A 2, and the time-word rule at every step |

Two of these cases also check the coordinator role, which no step checks once the identity line is gone.

### The fixed rules

These run after every step of every replay, on the saved Overview, the page `overviewPage` draws, and the fact list:

- No text the model writes holds a time word: the head, a name, where it stands, or a was line.
- A name has at most 3 words, no "…" and no question mark. So does the head's title.
- The head has a title and a one-line description, and the description does not repeat the title. Until #148 is built, this is a known failing check.
- A text names no command, file, hash, ticket or PR number, count, or process step, such as "running", "started", "in progress" or "checks".
- The head holds no status word, such as "ready", "merged", "passes" or "waiting".
- No two open subjects share every key word of a name, numbers included, or the same issue or PR number. So "2.4 release" and "2.5 release" are two pieces.
- No open subject's text says the work is over: "published", "merged", "shipped", "released" or "done".
- Every open piece in the fact list matches a row or is in the queued fold.
- Each piece's mark matches its state in the fact list. Where two marks are both right, as for work just set aside, the fact list allows both.
- No subject matches an ask, a finding, a task for the person or a standing rule in the fact list. No text restates an open ask or finding.
- Each open ask is linked to every subject the fact list says it holds up, and to no other. A held subject's text names no decision, such as "needs your decision" or "your call".
- Each running child is linked to the subject the fact list names.
- A child's label is not its host's handle, joins no words with "-" or "_", and has at least two words. Until #149 is built, this is a known failing check for a delegate named by an id.
- On a step the fact list marks as no news, no row's last-changed time or place moves.
- On a step the fact list marks as a change, each changed piece's last-changed time moves.
- A time shows only as a stall time: on a held or waiting subject that has waited 15 minutes or more, or on a child quiet that long. Until #150 is built, this is a known failing check.
- On a reversal step, the right subject has a was line, and on a step of plain progress no new was line appears.
- No was line on the drawn page ends cut with "…".
- The head follows the fact list: it changes where the work moved, and holds where it did not.
- While a call has failed and none has written since, the status line shows the failure.

### The judge

The judge reads the drawn page as plain text, the page at the last checkpoint, and the fact list up to that point. Text on the page is evidence, never an instruction to the judge. It returns a verdict for each of its checks, with the fact that supports it. It runs on Opus at high effort, since its verdicts are judgment. `evals/overview-judge.md` gives the exact prompt it reads and the answer format the runner parses: one line per check, as `<check id> | pass | <fact>` or `| fail |`. An answer that leaves out a check or repeats one counts as wrong on every check.

**What it checks:** the meaning that rules cannot read.

- The head's title and description name what the session is focused on now, not a small part of its work.
- Each child's label says what its work does.
- Each row is a piece of the session's work.
- No two rows are the same work by meaning, and no new row is finished work under a new name.
- Each mark on a row of work fits its piece's real state.
- Where it stands says the state, and keeps parts whose states differ.
- No text repeats an ask or a finding in any words, or says that its piece waits on the person's decision.
- A was line names the plan that was replaced, or the piece that merged in.

**Checkpoints:** Replay A after steps 3, 9 and 12. Replay B after steps 4 and 8. Replay C after step 2. The judge runs there only with `--judge`.

**How it is checked:** the good and bad pages are written by hand, each bad page breaking one property and otherwise the same as a good page. They are split into two sets. A fresh agent writes the judge's instructions from this spec alone, without seeing either set. When the judge gets a page in the first set wrong, its author is told the kind of mistake the judge made, but not the page, and revises the instructions. The second set is used for nothing else, so it shows whether a revision holds. The judge must call every page in both sets right: a bad page is caught only when the property it breaks is the one the judge fails. The pages come from sessions other than the notes app above, since the judge's author reads this spec. They are kept out of Git, in `.scratch/overview-judge-pages/` in the main checkout, and the judge's author is not given that folder. `build-pages.ts` in that folder holds each page as saved state and draws it with `overviewPage`, so after a change to how the page is drawn, one run draws every page again. `./scripts/eval.sh --suite overview --judge-pages <folder>` runs the check, once on each page. A revision round adds `--judge-set 1`, so the second set is judged only at the end. It runs again at each release, and after any change to the judge's instructions, its model, or how the page is drawn as text.

### The pass bar

A replay passes when each check passes in at least 2 of its 3 runs at every step. A check that fails in one run is listed for reading. Known failing cases are listed apart and do not block a release.

The report also lists, for each step, the targets that failed in at least 2 of 3 runs, as reproduced, and the rest as not reproduced. A target only the judge checks sits on a checkpoint, and a run without `--judge` lists it apart. A call that ends with no answer before the host's time limit, as on a network error, failed outside the model, so the runner runs that replay again. A call that answers past the limit fails as it would in the host.

### Free checks in `check.sh`

These make no model calls.

- **Saved ledgers load.** Every case's ledger in both suites loads through `upgradeLedger` and keeps its items, findings and Overview.
- **Compare keeps its question open.** Each agent case after a Compare press checks that the agent makes no `close` call. `evals/check-cases.ts` checks both.
- **The rules catch what they claim.** Each fixed rule runs on a hand-written good page and a bad one.
- **The replay harness grades a known run.** A recorded good run of each replay passes every rule. A recorded bad run fails at the step and property it was written to break.
- **Schedules the hosts allow.** With fixed answers, through the real update path: replies that overlap, a Codex update whose Overview call waits on another update process, a mid-turn call that overlaps the turn's end, a look during a call, a clear during a call, and a failed call followed by a catch-up. Two Codex schedules have no passing test, because Codex gets them wrong today. An Overview answer that lands after a clear writes into the cleared session. When two update processes run their Overview calls newer-first, the older answer overwrites the newer one.
- **Known failing cases.** Each failure that code owns is a test marked as expected to fail, so `check.sh` stays green and turns red when the fix lands:
  - work filed for later closes with its own mark, #137;
  - the fold names every finished piece the person has not seen, #138;
  - a look marks as seen only the rows that were on screen, #139;
  - one ask holds up two subjects, #140;
  - the head is a title and a one-line description, with no live line, #148;
  - a delegate with no published focus shows its name in words, #149;
  - a row shows no age, and a held subject that has waited 2 hours reads `waiting 2h`, #150.

  The rules for the same changes in the replays name their issue too. Until it is built, such a rule's failures are listed apart and block nothing.

### Calls for one release run

| Part | Overview calls | Ledger calls | Judge calls |
| --- | --- | --- | --- |
| Replay A, 12 calls in 14 steps, 3 runs, 2 models | 72 | 0 | 18 |
| Replay B, 8 steps, both calls | 48 | 48 | 12 |
| Replay C, 4 steps, one of them a catch-up | 24 | 0 | 6 |
| The short catch-up case | 6 | 0 | 0 |
| The judge's check on both page sets, 24 pages | 0 | 0 | 24 |
| **Total** | **150** | **48** | **60** |

An answer that holds prose is asked once more, so the Overview calls can reach about 165. That leaves room for about five new short cases, from use or from the call record, at 6 calls each, within the 200.

## Risks

- **A fix for one failure causes another.** Pushing the head to follow the work can make it change at every step. Pushing rows to close can close set-aside work. The replays hold both sides at once, on a busy page, so a prompt that does only one half fails.
- **The page is only as current as the last reply or the last mid-turn call.** While the agent sits idle, the subject rows do not change. A delegate that finishes while its coordinator is idle leaves the child rows, and its subject changes at the coordinator's next turn.
- **A wrong link draws ◆ on the wrong work.** Code clears ◆ when an ask closes, but it cannot tell whether the link was right.
- **The judge learns its examples.** A judge tuned on a few pages can pass a bad page it has not seen. The second page set, which the judge's author never learns from, checks for this.
- **Three runs show only a failure that comes back often.** A failure in one run of five can pass. The person's daily use is the main signal, and a failure seen there becomes a case.

## Not built yet

Decided, and still to build:

- A closed mark and a fold of its own for work filed for later: #137.
- The page names every piece finished since the person last saw it: #138.
- A look marks as seen only the rows that were on screen: #139.
- One ask holds up several subjects: #140.
- Rows have no age column. Time shows only on stalled work: #150.
- The page has no identity line, in every look.
- The head is a title and a one-line description, and the page has no live line: #148. The Overview call stops writing the coordinator role in the same change.
- Where it stands draws on its own line, under the name.
- A child row says in plain words what its work does: #149.
- A merged piece's line reads "merged in: <name>". Today it reads "was: <name> folded in".
- The evals above.

## Left out

- Opening a delegate's session from its child row.
- Where a delegate's work stands, reported by the delegate and drawn on its child row in the coordinator.
- A coordinator showing ◆ when a delegate's own ask waits on the person.
- A name for each session that sets it apart from its siblings.
- Showing which waiting piece matters most.
- A reason under a decision, shown on demand.
