# The Status tab

Status: built. The Status call runs after every reply in every build. In every build, its result reaches the carry text the agent reads and the focus line the inbox publishes to Herdr. Only next builds draw the Status tab. "Not built yet" lists the decided changes still to build. The evals that judge the tab are in "How the Status is judged".

## Summary

The Status is the inbox's first tab on a next build. It is about the session's work. Asks and Finds are about what the person has to do. As of the agent's last reply, it answers four questions:

- **What is this session's work?**
- **Where does each piece of it stand?**
- **Which pieces wait on me?**
- **What moved since I last looked?**

The page is one list of subjects. A subject is one piece of the work, such as a feature, a fix or a release. Each row shows a status mark, a short name and a few words on where the work stands. A Seen line marks where the person last looked. Every row above it changed since then. On each side of the line, rows run from what needs the person to what is finished. Within each status, the newest change comes first. The inbox model adds, updates and closes subjects. Code owns every time, the order, the Seen line, the folds and the rows of running work.

All four looks draw the same page from one shared view: the Claude Code terminal, the Claude desktop app's pane, the Codex tab and the omp panel. `docs/looks.md` says where they differ.

The page fails when it reads as a log, when it copies Asks or Finds, or when it says something the session has moved past.

## Decisions

1. **One list of subjects, with no sections. On each side of the Seen line, rows are ordered by status, then newest change first.** The order is: held by an open ask (◆), working (●), waits on something other than the person (◌), queued (○), then done (✓) and dropped (✗).
   - Reason: each piece of work shows once, with its change attached. The earlier six-section page showed one subject in up to six places. Each part reads from what needs the person to what is finished.
   - This replaces ordering each side of the line by last change alone. That put a queued row whose text had just changed above work that had finished, so the marks ran out of order down the page.
2. **The inbox model edits subjects by id. Code applies each edit.**
   - Reason: a model that rewrites the whole page from the last page drifts toward the newest exchange. In a replay of one real session, 33 of 35 replies rewrote the page.
3. **Code writes every time and the order. The model never writes a time.**
   - Reason: a time word in model text freezes when it is written, so "merged today" reads wrong the next day.
4. **Only a row that waits on the person says `waiting`, and rows show no times.** A row's stall word follows its name on the same line. A subject that an ask holds up reads `waiting` in the needs-you tone, and so does a Herdr delegate at a question or an approval. A finished delegate reads `finished` until the person has seen the Status. A row waiting on someone else shows no word: its ◌ mark and where it stands say what it waits on. Running work shows no word, since its moving mark says it runs. Among rows of the same status, a row's place follows when its work last changed, not when the page last checked it.
   - Reason: a person read a muted `waiting` as work waiting on them. The word now appears only when it is true for the person, and a time on a waiting row added words they did not need.
   - Reason: an age on every row was hard to read and said little. A row that rose because the page checked it would claim a change that did not happen.
5. **A changed state always reaches the page.** Code keeps the old text and place only when the new text has the same content words, in any order.
   - Reason: "manual merge ready" becoming "manual merge broken" is a change, though half the words match.
6. **◆ comes from a link between an open ask and the subjects it holds up.** The Status call writes the link. Code draws ◆ while the ask is open and clears it when the ask closes. One ask can hold up several subjects. There is no "waits on you" status and no "problem" status.
   - Reason: a ◆ set by the model could not see Asks, so it went stale and could disagree with Asks. A problem nobody is fixing is a to-do for the person, so it belongs in Asks, or in Finds when it is outside the task.
   - This replaces the rule that the Status call reads no inbox text. It now reads each open ask's id and first words, so it can link the ask. It never restates one.
7. **Work filed for later closes with a mark of its own, not ✓.**
   - Reason: filing a piece does not finish it. ✓ and the done count mean work that was delivered.
   - Until #137 builds the mark, the Status call closes a piece the person files out of the session's plan with DONE and the text "filed for later". A piece set aside to come back to in the session stays queued.
8. **No buttons that act on an ask or a finding.**
   - Reason: an Answer or Fix button on a row would make the Status a weaker copy of Asks and Finds, with less context.
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
16. **Evals are a cheap check that a failure seen in real use does not come back.** They run at each release, within about 200 Status calls. Fixed rules check what code can measure. A model judge checks what only reading can tell. The judge is first checked against hand-written good and bad pages that the author of its instructions never sees.
    - Reason: the person's daily use of next builds and reports from users are the main signal. The evals only keep a fixed failure fixed. The old Status cases passed 42 of 42 while a live Status kept a goal about a release that had shipped, and listed one piece of work under two names. Each case checked one rule of the Status prompt, most of them in a single exchange.
    - This reverses the decision to check the tab with fixed rules only.
17. **Only next builds draw the tab.**
    - Reason: it is not ready to release. A release build treats a saved Status tab as unknown and shows its first tab.
18. **The page has no identity line, and the Status call writes no role.**
    - Reason: the line takes space without telling sessions apart. Folder, branch and role are often the same across sessions, and each host already names the session in its own window, tab or title. Nothing else drew the role.
19. **The head is a title and a one-line description of what the session is focused on now.** The title is short, like a row's name. The page has no live line.
    - Reason: the head then reads like a row. The person scans the title, and reads the description for what the session is doing now. Each host already shows whether its agent is working, and a ● mark moves while a turn runs.
20. **By default, a row draws where it stands on its own line, under its name.**
    - Reason: the names line up down the page, so the person can scan them.
21. **A child row says in a few plain words what its work does, never an id.** A Herdr delegate shows what its own session's Status says it is focused on, which the inbox publishes to Herdr: its head's description, or its title when a head saved before descriptions has none. Without one, it shows its name turned into words. A subagent, background command or workflow run shows the description it was started with.
    - Reason: a name an agent made up for a delegate tells the person nothing about the work.
22. **The Status call writes the head, and checks it against the open and finished subjects at every call.** It writes a new head when the head is empty or has no description, when the person asks for work that is not part of what the head names, or when a working subject is not part of what the head names, as when the work the head names finished and the session started on other work. One piece finishing, the next starting, or the person asking for the next does not change the focus. It keeps the head while a working subject is part of what it names, and when the work it names is done and nothing else is working. Code holds a head that has a description in two cases. The first is when a new head keeps its title. The second is when the same answer finished work that was working or waiting before it, finished none that it added, and left none working or newly waiting. Code lets the description go when the same answer finished a subject the description names, by every word of its name, while other work goes on. A same-title head in that answer then replaces the description. Without one, code clears it, and the next call writes a new one.
    - Reason: the call reads one exchange at a time. A rule that moved the head only when an exchange switched tasks left it on finished work all day, because work that drifts over many small exchanges never looks like a switch. The subjects the call reads at every call show a head that fell behind, however many exchanges ago.
    - Reason for the two holds in code: in the replays, Sonnet at low effort rewrote the description to name each new piece of the same focus, and moved the head to queued work once the work it named finished. The prompt alone did not stop either.
    - Reason the second hold looks at what the answer closed: work that started and finished in one answer is the session's focus, so a head for it moves. A DONE whose id matches nothing changes no subject, so it holds nothing.
    - Reason code lets a stale description go: a head such as `2.5 release` over `Fixing the sync bug, then shipping 2.5` keeps its title when the sync bug is done, so the first hold kept the description naming finished work, on the page and in Herdr. Clearing it shows the title alone until the next call writes a description, which is true where the old one was not.
    - Code does not derive the head from the subjects. The head sits a level above the rows: `Offline sync` holds while its engine, conflicts and toggle rows take turns being worked, and `2.5 release` over `Fixing the sync bug, then shipping 2.5` spans two rows. A head taken from the working subject that changed last would flip between rows and repeat the top row.

## Terms

From `GLOSSARY.md`: SessionStatus, Head, Subject, Child, Stall words, Seen line, Look, Host and Catch-up. The new terms:

- **Status call:** the inbox model call after the ledger call. It reads the open subjects and the new exchange, and answers with edits.
- **Where it stands:** the few words on the line under a subject's name.
- **Was line:** a line under a subject that names the plan a change replaced, as "was: last-write-wins", or a piece merged into it, as "merged in: Banner on hover".
- **Link:** the Status call's tie from an open ask or a child to the subject it belongs to.
- **Fold:** one line that stands for several rows: "✓ 3 done" or "○ 2 more queued".
- **Last changed:** when a subject's status or meaning last changed. It sets which side of the Seen line a row sits on, and its place among rows of the same status.
- **Last checked:** when an Status call last read the work, whatever it answered.
- **Property:** something true of a good Status that a person can check by reading the page, knowing what happened in the session.
- **Fact list:** what really happened in an eval case, written by the case's author: each piece of work, its state at each step, the asks and the pieces each holds up, and what is not work.
- **Rule:** a check written in code, run on the saved Status, the drawn page and the fact list.
- **Judge:** a model that reads a drawn page and the fact list, and says whether each of its checks holds.
- **Replay:** an eval case of many steps, in which each answer is applied before the next step, as a host would.
- **Known failing case:** a check of a failure that code owns. It stays in the suite, marked as expected to fail, until the code is fixed.

## The page

From top to bottom:

| Part | What it shows | Who writes it |
| --- | --- | --- |
| Head | A title for what the session is focused on now, and a line under it on what the session is doing about it. The call is asked for a title of at most 3 words and a description of at most 8. Code clips them at 20 and 14. A head with no description yet shows its title alone until the next call writes one. | Model |
| Subject rows | A mark and a short name, with `waiting` after the name while it waits on the person, and a few words on where it stands on the line under the name. The call is asked for a name of at most 3 words and a text of at most 4. Code clips them at 20 and 12. | The model writes the status, name and text. Code draws the mark and the stall word, and orders the rows by status, then by last change. |
| Was line | The plan a change replaced, as "was: last-write-wins", or the pieces merged into this one, as "merged in: Banner on hover", until the person has seen it | The model writes it. Code shows it only until the person has looked. |
| Child rows | Running work under its subject, named by the first line of the name its host gives it. A delegate shows what Herdr shows: `◆ … · waiting` at a question or an approval, and `✓ … · finished` once it stops, until the person has seen the Status. Running work shows no word. | Code, from host events and from Herdr. The model writes the link. |
| Seen line | Where the person last looked. Rows above it changed since. It is left out when nothing changed. | Code |
| Folds | "○ N more queued" past 7 open rows. "✓ N done" for the done subjects not drawn as a row, or "✓ N more done" when a done row shows above it. | Code |
| Status line | "Last Status update failed. Changes from that reply may be missing." while the last call wrote nothing | Code |

A decided change to this table, in "Not built yet": decision 21 names each child row in plain words. A Herdr delegate's name is often an id today.

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

More rules of the drawn page, all in `hooks/view.ts:statusPage`:

- A subject's text wraps to at most 3 lines.
- On each side of the Seen line, rows run ◆, ●, ◌, ○, then ✓ and ✗ together, each group newest change first.
- At most 2 finished rows show, both changed since the last look. The rest fold into the count. Property 10 asks for more; see "Not built yet".
- Below the Seen line, an open row keeps where it stands, and drops its was line.
- At most 3 children show under one subject. The rest read "+ 2 more running".
- A child whose subject is not shown, or that has no link yet, sits at the top of the list.
- A held subject never folds into the queued count, and its mark does not move.
- The Asks row of a linked ask reads "Holds up" and the subject's name.

Before any work, the page reads: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."

### How it updates

- **After each reply.** The ledger call runs first, then the Status call. A failed ledger call skips it.
- **What the Status call reads:**
  - the head;
  - the open subjects, each with its id, status, name and text;
  - the names of the last 10 finished subjects, so it does not add one again;
  - each open ask's id, its first 30 words and its linked subject;
  - the running children;
  - the host's task list, where there is one;
  - the person's message, the agent's tool activity and the reply.
- **What it answers:** edits by id, one per line: add a subject, update one, finish one, drop one or drop it into another, write a was line, link an ask or a child, write the head. Or `UNCHANGED`. `hooks/status.ts` parses and applies the answer.
- **What code does with it:**
  - A new subject whose name holds the same key words as an open one updates that one.
  - An update that keeps the status and has the same content words, in any order, keeps the old text and its place. A head that keeps its title, or that comes with finished work and none under way, keeps the old head.
  - An answer that holds any line that is not an edit is asked once more. If that fails too, the page stays as it was and the status line says so.
- **During a long turn.** The main agent's next tool call, once 10 minutes have passed since the turn began and since the last Status call, starts a Status call. That call reads the person's message and the turn's activity so far.
- **On a catch-up.** The call reads the whole conversation and edits the current subjects.

`hooks/status.ts` owns the saved Status, the parser and how an answer applies. `hooks/view.ts` owns the drawn page. `hooks/model-text.ts` owns the call's prompts. `docs/looks.md` names the owner of every other rule.

## What a good Status is

Each property below says what the person needs from the page, and is tied to one of the four questions. A person who knows what happened in the session can check each one by reading the page. Evals check these properties. They do not check the wording of the Status prompt.

The numbers stay fixed, so references to them stay valid. Number 2 is unused.

The examples come from one sample session. It adds offline sync to a notes app. Its pieces are the sync conflicts, an export button and the 2.4 release. A delegate builds the export's PDF layout.

A good page after the person was away two hours, drawn as decided:

```text
Offline sync
Adding offline sync to the notes app

◆ Sync conflicts · waiting
  merge logic ready
● Export button
  works on web
  ├ ◆ Lay out the PDF export · waiting
  └ ✓ Check the print styles · finished
✓ Sync engine
  syncs on reconnect
── Last seen ─────────────────────────
◌ 2.4 release
  in store review
✓ 2 more done
```

The question "Which conflict rule ships?" waits in Asks, and its row there reads "Holds up Sync conflicts".

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
| 13. How current | When each Status call ran and whether it failed, when the activity happened, and which pieces and children wait |

### What is this session's work?

#### 1. The head says what the session is focused on now

The first words the person reads tell them what the session is focused on, in their own terms. The title names that focus in a few words, like a row's name. The line under it says what the session is doing about it. The head stays the same while the work goes on, and changes when the focus moves. When the work is done and nothing follows, the head still names it.

- **Good:** `Offline sync` over `Adding offline sync to the notes app`, unchanged through a lint fix, new tests and a question.
- **Good:** a coordinator that shipped 2.4 and now runs the sync fix and 2.5 reads `2.5 release` over `Fixing the sync bug, then shipping 2.5`.
- **Good:** `2.4 release` over `Shipping notes 2.4 to the store`, after 2.4 shipped, when the person asked for nothing more. Its row reads ✓.
- **Bad:** the same head two hours after 2.4 shipped, while the session works on the sync bug.
- **Bad:** a coordinator's head names one small stream, such as `Hooks release`, while most of its work is on sync and 2.5.
- **Bad:** `2.5 release` over `Shipping 2.5 to the stores`, after 2.5 shipped and the session picked up the export folder bug, with no one naming a new goal.
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
- **Bad:** `Lint check` or `Last-write-wins`. A PR check and an option are not pieces of work.
- **Bad:** `A chat whose archived history can't rebuild…`. That is a sentence, cut off.

#### 4. Each piece of work shows once

One row per piece, whatever words the conversation used for it. Finished work does not come back as new work under another name.

- **Good:** one row, `● Checkout total: fixed on web, iOS left`, after the person calls it "the cart rounding bug".
- **Bad:** `Checkout total` and `Cart rounding bug`, both open, for one fix.
- **Bad:** `● Export button` and a new `● Export PR` when its PR opens.

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
- **Bad:** `Export button: tests running`. That names the step that runs.
- **Bad:** `Export button: reviewer running`, when the reviewer shows as a child row. That repeats the child row.
- **Bad:** `Export button: export button merged`. That repeats the name.
- **Bad:** `Sync conflicts: discussed three options`. That is the conversation, not the work.

#### 7. Running work shows under the piece it serves, in plain words

A delegate, subagent, background command or workflow run shows under the subject it works on while it runs. It says in a few plain words what it does. A delegate shows the focus its own session's Status publishes, and other running work shows the description it was started with. A delegate says when it waits at a question or has finished. Other running work shows no word, since its moving mark says it runs.

Until decision 21 is built, a delegate shows its Herdr name, and a delegate whose name is an id fails this property. That is a known failing case for #149.

- **Good:** `● Export button` with `└ ● Lay out the PDF export` under it.
- **Good:** the same delegate, at an approval prompt, reads `◆ Lay out the PDF export · waiting`.
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

The Status shows the work. Asks and Finds show the person's to-dos. A row held up by an ask says where its work stands.

- **Good:** `◆ Sync conflicts: merge logic ready`.
- **Bad:** `◆ Sync conflicts: needs your decision`. ◆ and the band already say so.
- **Bad:** `◆ Sync conflicts: last-write-wins or manual merge?`. That is the question, copied.

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
- **Bad:** `Export button: works on web, iOS left` becomes `web done, iOS remaining`, and moves above the Seen line.

#### 12. A change of plan says what it replaced

When the session drops one approach for another, the person sees both until they have looked. When one piece merges into another, the row names the merged piece by its short name.

- **Good:** `● Sync conflicts: manual merge`, with `was: last-write-wins` under it.
- **Good:** `● Offline banner: option A built`, with `merged in: Banner on hover` under it.
- **Bad:** the text changes to "manual merge", and nothing says the plan changed.
- **Bad:** a was line on a row that only made progress.
- **Bad:** `merged in: Show the offline banner on hover and keep it open…`. The merged piece had a sentence for a name, and the line ends cut.

#### 13. The page is current, and says when it is not

The page covers the work up to the last reply, or up to about 10 minutes ago during a turn. When an update fails, the page says so. The page shows no times, so none goes stale. A row's place follows its status and when its work last changed, so on a current page a row that did not change stays where it was.

- **Good:** three hours into a turn, `● Sync conflicts: cause unknown` stays where it was, because the last update found nothing new.
- **Good:** `◌ 2.4 release: in store review`, while the build waits for review.
- **Good:** "Last Status update failed. Changes from that reply may be missing."
- **Bad:** the agent finished the conflicts work two hours into a three-hour turn, and the row still reads ●, since no update ran during the turn.
- **Bad:** `● Export button: works on web  2h`. No row shows a time.
- **Bad:** `2.4 release: goes out tomorrow`, read two days later.

## How the Status is judged

Decision 16 sets the method. The evals run at each release, and after a change to the Status call's text or to the code that applies its answer.

`./scripts/eval.sh --suite status` runs them. These files hold them:

| File | What it holds |
| --- | --- |
| `evals/status-replays.ts` | The replays and the short case, with their facts |
| `evals/status-replay.ts` | How a replay runs each step through the hosts' own code |
| `evals/status-facts.ts` | The fact list, and the text of it the judge reads |
| `evals/status-rules.ts` | The fixed rules |
| `evals/status-judge.ts` | The judge's checks, its prompt, and how its answer is read |
| `evals/status-judge.md` | The judge's instructions |
| `evals/status-run.ts` | The runner, its report and its results file |
| `tests/status-evals.test.ts` | The checks with no model calls |

### What goes in the suite

- **A case comes from a real failure.** The sources are the failures seen in real sessions, what the person hits in use, and the record of Status calls once a next build keeps one.
- **A case joins when it reproduces its failure.** A short case must fail on today's prompt at the step and property it targets. A replay targets a failure at each step, and joins when at least one step fails as targeted. A step that does not reproduce its failure stays as a check, marked as not reproduced. A failure owned by code joins as a known failing case.
- **A failure counts only when the property it targets fails.** An answer that is unreadable, or that breaks another property, is reported but does not count as reproducing the failure.

### The case format

A case is a starting state, then steps, with the fact list beside them.

- **The starting state:** a saved ledger, with its Status, open asks and findings, and the session's presence.
- **A step** has a time, and runs in this order:
  - host events: a child starts, acts or ends, or the person looks at the page for some seconds;
  - fixture events, in a replay that skips the ledger call: an ask opens or closes;
  - at most one call: a reply, a mid-turn call or a catch-up, each with its exchange or conversation, or a recorded call's exchange as it was.
- **The fact list** gives, for each step, the session's focus, every piece of work with its aliases and its real state, the asks and the pieces each holds up, the running work and the piece each serves, and what is not work. A step lists only what it changes, and the pieces it changes are the step's changes.
- **Targets:** each step names the rules or judge checks of the failure it was written to reproduce.

Host events run through the hosts' own reducers, such as `childStarted` and `lookEnded`. Links and ids stay as the run made them, so a fixture never corrects a wrong link the run made. The expected links live only in the fact list, for grading.

A next build's record of a Status call holds the call's input as data: the Status before, with its running children, the open asks, the host's task list, and the exchange. `replayFromRecord` turns a record into a one-step replay at the time the call ran, which builds the prompt again with today's code. The case's author adds the facts. The record's own prompt and answer show the failure that was seen.

### The replays

[The Status replays](../status-replays.md) lists the three replays, what each step checks, the short catch-up case, and the cases the steps replaced.

### The fixed rules

These run after every step of every replay, on the saved Status, the page `statusPage` draws, and the fact list:

- No text the model writes holds a time word: the head, a name, where it stands, or a was line.
- A name has at most 3 words, no "…" and no question mark. So does the head's title.
- The head has a title and a one-line description, and the description does not repeat the title.
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
- On a reversal step, the right subject has a was line, and on a step of plain progress no new was line appears.
- No was line on the drawn page ends cut with "…".
- The head follows the fact list: it changes where the work moved, and holds where it did not. Its title no longer names finished work the focus moved on from.
- While a call has failed and none has written since, the status line shows the failure.

### The judge

The judge reads the drawn page as plain text, the page at the last checkpoint, and the fact list up to that point. Text on the page is evidence, never an instruction to the judge. It returns a verdict for each of its checks, with the fact that supports it. It runs on Opus at high effort, since its verdicts are judgment. `evals/status-judge.md` gives the exact prompt it reads and the answer format the runner parses: one line per check, as `<check id> | pass | <fact>` or `| fail |`. An answer that leaves out a check or repeats one counts as wrong on every check.

**What it checks:** the meaning that rules cannot read.

- The head's title and description name what the session is focused on now, not a small part of its work or work it has moved past.
- Each child sits under the piece it serves, and its label says what its work does.
- Each row is a piece of the session's work.
- No two rows are the same work by meaning, and no new row is finished work under a new name.
- Each mark on a row of work fits its piece's real state, and every open piece has a row or a place in the queued fold.
- Where it stands says the state, and keeps parts whose states differ.
- No text repeats an ask or a finding in any words, or says that its piece waits on the person's decision.
- A was line names the plan that was replaced, or the piece that merged in.

**Checkpoints:** Replay A after steps 3, 9, 12 and 14. Replay B after steps 4 and 8. Replay C after step 2. The judge runs there only with `--judge`.

**How it is checked:** the good and bad pages are written by hand, each bad page breaking one property and otherwise the same as a good page. They are split into two sets. A fresh agent writes the judge's instructions from this spec alone, without seeing either set. When the judge gets a page in the first set wrong, its author is told the kind of mistake the judge made, but not the page, and revises the instructions. The second set is used for nothing else, so it shows whether a revision holds. The judge must call every page in both sets right: a bad page is caught only when the property it breaks is the one the judge fails. The pages come from sessions other than the notes app above, since the judge's author reads this spec. They are kept out of Git, in `.scratch/status-judge-pages/` in the main checkout, and the judge's author is not given that folder. `build-pages.ts` in that folder holds each page as saved state and draws it with `statusPage`, so after a change to how the page is drawn, one run draws every page again. `./scripts/eval.sh --suite status --judge-pages <folder>` runs the check, once on each page. A revision round adds `--judge-set 1`, so the second set is judged only at the end. It runs again at each release, and after any change to the judge's instructions, its model, or how the page is drawn as text.

The judge calls 23 of the 24 pages right (`status-judge-2026-10-28T23-54-21.726Z.json`). It passes `s1-bad-each-once`, a page that shows one piece twice, because it read "Popup menu" as another name for the popup. That breaks the bar above. Only next builds draw the Status, so 0.2.14 shipped with it waived.

### The pass bar

A replay passes when each check passes in at least 2 of its 3 runs at every step. A check that fails in one run is listed for reading. Known failing cases are listed apart and do not block a release.

The report also lists, for each step, the targets that failed in at least 2 of 3 runs, as reproduced, and the rest as not reproduced. A target only the judge checks sits on a checkpoint, and a run without `--judge` lists it apart. A call that ends with no answer before the host's time limit, as on a network error, failed outside the model, so the runner runs that replay again. A call that answers past the limit fails as it would in the host.

Replay A (`coordinator-day`) and Replay B (`single-task`) fail on Sonnet and on Codex (`status-2026-10-29T00-14-52.391Z.json`). On Codex they failed when #154 merged, and the Sonnet half was not run then. Only next builds draw the Status, so 0.2.14 shipped with both waived. Replay C (`long-turn`) and the short catch-up case pass.

### Free checks in `check.sh`

These make no model calls.

- **Saved ledgers load.** Every case's ledger in both suites loads through `upgradeLedger` and keeps its items, findings and Status.
- **Compare keeps its question open.** Each agent case after a Compare press checks that the agent makes no `close` call. `evals/check-cases.ts` checks both.
- **The rules catch what they claim.** Each fixed rule runs on a hand-written good page and a bad one.
- **The replay harness grades a known run.** A recorded good run of each replay passes every rule. A recorded bad run fails at the step and property it was written to break.
- **Schedules the hosts allow.** With fixed answers, through the real update path: replies that overlap, a Codex update whose Status call waits on another update process, a mid-turn call that overlaps the turn's end, a look during a call, a clear during a call, and a failed call followed by a catch-up. Two Codex schedules have no passing test, because Codex gets them wrong today. A Status answer that lands after a clear writes into the cleared session: #152. When two update processes run their Status calls newer-first, the older answer overwrites the newer one: #153.
- **Known failing cases.** Each failure that code owns is a test marked as expected to fail, so `check.sh` stays green and turns red when the fix lands:
  - work filed for later closes with its own mark, #137;
  - the fold names every finished piece the person has not seen, #138;
  - a look marks as seen only the rows that were on screen, #139;
  - one ask holds up two subjects, #140;
  - a delegate with no published focus shows its name in words, #149.

  The rules for the same changes in the replays name their issue too. Until it is built, such a rule's failures are listed apart and block nothing. A replay step marks a judge check the same way: at Replay A's checkpoints, the judge's marks check waits on #137, since filed work there can only close as ✓ or ✗.

### Calls for one release run

| Part | Status calls | Ledger calls | Judge calls |
| --- | --- | --- | --- |
| Replay A, 15 calls in 17 steps, 3 runs, 2 models | 90 | 0 | 24 |
| Replay B, 8 steps, both calls | 48 | 48 | 12 |
| Replay C, 4 steps, one of them a catch-up | 24 | 0 | 6 |
| The short catch-up case | 6 | 0 | 0 |
| The judge's check on both page sets, 24 pages | 0 | 0 | 24 |
| **Total** | **168** | **48** | **66** |

An answer that holds prose is asked once more, so the Status calls can reach about 185. That leaves room for about two new short cases, from use or from the call record, at 6 calls each, within the 200.

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
- A child row says in plain words what its work does: #149.
- In Codex, a Status answer from before a clear stays out of the cleared session: #152.
- An older Status answer never overwrites a newer one: #153.
- The judge's instructions, in `evals/status-judge.md`.

## Left out

- Opening a delegate's session from its child row.
- Where a delegate's work stands, reported by the delegate and drawn on its child row in the coordinator.
- A coordinator showing ◆ when a delegate's own ask waits on the person.
- A name for each session that sets it apart from its siblings.
- Showing which waiting piece matters most.
- A reason under a decision, shown on demand.
