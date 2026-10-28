# The Overview tab

Status: built, on next builds only. Release builds leave the tab out. The evals that judge it are being rebuilt from "What a good Overview is" below.

## Summary

The Overview is the inbox's first tab on a next build. It is about the session's work. Asks and Finds are about what the person has to do. As of the agent's last reply, it answers four questions:

- **What is this session's work?**
- **Where does each piece of it stand?**
- **Which pieces wait on me?**
- **What moved since I last looked?**

The page is one list of subjects, newest change first. A subject is one piece of the work, such as a feature, a fix or a release. Each row shows a status mark, a short name, a few words on where the work stands, and how long ago it last changed. A Seen line marks where the person last looked. Every row above it changed since then. The inbox model adds, updates and closes subjects. Code owns every time, the order, the Seen line, the folds and the rows of running work.

All four looks draw the same page from one shared view: the Claude Code terminal, the Claude desktop app's pane, the Codex tab and the omp panel. `docs/looks.md` says where they differ.

The page fails when it reads as a log, when it copies Asks or Finds, or when it says something the session has moved past.

## Decisions

1. **One list of subjects, newest change first, with no sections.**
   - Reason: each piece of work shows once, with its change attached, and the ages read down the column as a timeline. The earlier six-section page showed one subject in up to six places.
2. **The inbox model edits subjects by id. Code applies each edit.**
   - Reason: a model that rewrites the whole page from the last page drifts toward the newest exchange. In a replay of one real session, 33 of 35 replies rewrote the page.
3. **Code writes every time and the order. The model never writes a time.**
   - Reason: a time word in model text freezes when it is written, so "merged today" reads wrong the next day. When things happened, and how far apart, carries meaning, so the ages must be true.
4. **◆ comes from a link between an open ask and the subject it holds up.** The Overview call writes the link. Code draws ◆ while the ask is open and clears it when the ask closes. There is no "waits on you" status and no "problem" status.
   - Reason: a ◆ set by the model could not see Asks, so it went stale and could disagree with Asks. A problem nobody is fixing is a to-do for the person, so it belongs in Asks, or in Finds when it is outside the task.
   - This replaces the rule that the Overview call reads no inbox text. It now reads each open ask's id and first words, so it can link the ask. It never restates one.
5. **No buttons that act on an ask or a finding.**
   - Reason: an Answer or Fix button on a row would make the Overview a weaker copy of Asks and Finds, with less context.
6. **Code follows running work from host events, and draws each as a child row under its subject.** The model only links a child to a subject.
   - Reason: code knows when a subagent, background command, workflow run or delegate starts and ends. The person wants delegated work shown under the piece it serves.
   - This replaces the decision to have no subagent rows.
7. **The page updates after each reply, and during a long turn once 10 minutes have passed.**
   - Reason: between replies, a long turn left the rows hours old.
8. **A look counts once the tab has shown for 5 seconds.**
   - Reason: a pass through the tab on the way to another one moved the Seen line past changes the person never read.
9. **The model reads the work from the exchange.** A host's own task list is extra input.
   - Reason: Claude Code and Codex offer no task list by default, so work read only from a task list would be missing there. `docs/reference/task-lists.md` has the sources.
10. **No step tool.** The agent is not asked to report its steps.
    - Reason: the exchange and the host's task list already say the same, and a tool would add guidance text for every agent.
11. **One page for every session.** A coordinator's streams and a single task's pieces are both subjects. The first line says "coordinator" for a session that hands out work.
    - Reason: one form keeps the page the same shape wherever the person opens it.
12. **The job is the four questions above.** The page shows no reason for a decision, and has no separate "next" part.
    - Reason: reasons need a line of prose under each decision, which brings back sections. ○ rows already say what comes next.
13. **Evals check the page with fixed rules and a model judge.** A fixed rule checks what code can measure, such as a name's length or a time word. The judge checks what only reading can tell, such as a stale goal or one piece of work under two names. The judge grades nothing until it agrees with pages the person has labeled good or bad.
    - Reason: the Overview cases passed 42 of 42 while a live Overview kept a goal about a release that had shipped, and listed the same work under two names. Each case checked one rule of the Overview prompt, most of them in one exchange, so the prompt was tested against itself.
    - This reverses the decision to check the tab with fixed rules only.
14. **Only next builds draw the tab.**
    - Reason: it is not ready to release. A release build treats a saved Overview tab as unknown and shows its first tab.

## Terms

From `GLOSSARY.md`: Overview, Goal, Subject, Child, Seen line, News dot, Look, Host and Catch-up. The new terms:

- **Overview call:** the inbox model call after the ledger call. It reads the open subjects and the new exchange, and answers with edits.
- **Identity line:** the page's first line. It names the folder the session started in, its branch, and "coordinator" when it hands out work.
- **Live line:** the line under the goal that says what the agent does now: "Working…", "Working… for 25m", or "Idle · last reply 12m ago".
- **Where it stands:** the few words after a subject's name.
- **Was line:** a line under a subject that names the plan a change replaced, as "was: last-write-wins".
- **Link:** the Overview call's tie from an open ask or a child to the subject it belongs to.
- **Fold:** one line that stands for several rows: "✓ 3 done" or "○ 2 more queued".
- **Property:** something true of a good Overview that a person can check by reading the page, knowing what happened in the session.
- **Rule:** a check written in code, run on the saved Overview or the drawn page.
- **Judge:** a model that reads a drawn page and the session's facts, and says whether a property holds.

## The page

From top to bottom:

| Part | What it shows | Who writes it |
| --- | --- | --- |
| Identity line | The folder the session started in, its branch, and "coordinator" | Code. The model says whether the session is a coordinator. |
| Goal | What the session's work is for. The call is asked for at most 8 words, and code clips it at 14. | Model |
| Live line | "Working…", "Working… for 25m", or "Idle · last reply 12m ago" | Code |
| Subject rows | A mark, a short name, a few words on where it stands, and the age of the last change. The call is asked for a name of at most 3 words and a text of at most 4. Code clips them at 20 and 12. | The model writes the status, name and text. Code draws the mark and the age, and orders the rows by last change. |
| Was line | The plan a change replaced, until the person has seen it | The model writes it. Code shows it only until the person has looked. |
| Child rows | Running work under its subject, with how long since it last did anything. After 15 minutes with no activity it reads "quiet 40m". | Code, from host events. The model writes the link. |
| Seen line | Where the person last looked. Rows above it changed since. It is left out when nothing changed. | Code |
| Folds | "○ N more queued" past 7 open rows. "✓ N done" for the done subjects not drawn as a row, or "✓ N more done" when a done row shows above it. Dropped subjects that are not drawn leave the page. | Code |
| Status line | "Last Overview update failed. Changes from that reply may be missing." while the last call wrote nothing | Code |

The marks:

| Mark | Meaning | Source |
| --- | --- | --- |
| ● | Work in progress in this session. It moves while the turn runs or a child under it works. | Model's status `working` |
| ○ | Work planned in this session, not started | `queued` |
| ◌ | Work that waits on something outside the session, such as another team or a build | `waits-on-other` |
| ✓ | Finished | `done` |
| ✗ | Dropped, with why | `dropped` |
| ◆ | Held up by an open ask. It replaces the status's mark until the ask closes. | Code, from the link |

More rules of the drawn page, all in `hooks/view.ts:overviewPage`:

- A subject's text wraps to at most 3 lines.
- At most 2 finished rows show, both changed since the last look. The rest fold into the count.
- Below the Seen line, an open row keeps where it stands, and drops its was line.
- At most 3 children show under one subject. The rest read "+ 2 more running".
- A child whose subject is not shown, or that has no link yet, sits at the top of the list.
- A held subject never folds into the queued count, and its mark does not move.
- The tab's name gets a dot while the page holds a change the person has not seen.
- The Asks row of a linked ask reads "Holds up" and the subject's name.

Before any work, the page reads: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."

### How it updates

- **After each reply.** The ledger call runs first, then the Overview call. A failed ledger call skips it.
- **What the Overview call reads:**
  - the goal and the role;
  - the open subjects, each with its id, status, name and text;
  - the names of the last 10 finished subjects, so it does not add one again;
  - each open ask's id, its first 30 words and its linked subject;
  - the running children;
  - the host's task list, where there is one;
  - the person's message, the agent's tool activity and the reply.
- **What it answers:** edits by id, one per line: add a subject, update one, finish one, drop one or drop it into another, write a was line, link an ask or a child, set the goal or the role. Or `UNCHANGED`. `hooks/overview.ts` parses and applies the answer.
- **What code does with it:**
  - A new subject whose name holds the same key words as an open one updates that one.
  - An update that keeps the status and shares half its words with the old text keeps the old text and the old age.
  - An answer that holds any line that is not an edit is asked once more. If that fails too, the page stays as it was and the status line says so.
- **During a long turn.** The main agent's next tool call, once 10 minutes have passed since the turn began and since the last Overview call, starts an Overview call. That call reads the person's message and the turn's activity so far.
- **On a catch-up.** The call reads the whole conversation and edits the current subjects.

`hooks/overview.ts` owns the saved Overview, the parser and how an answer applies. `hooks/view.ts` owns the drawn page. `hooks/model-text.ts` owns the call's prompts. `docs/looks.md` names the owner of every other rule.

## What a good Overview is

Each property below says what the person needs from the page, and is tied to one of the four questions. A person who knows what happened in the session can check each one by reading the page. Evals check these properties. They do not check the wording of the Overview prompt.

The examples come from one sample session. It adds offline sync to a notes app. Its pieces are the sync conflicts, an export button and the 2.4 release. A delegate builds the export's PDF layout.

A good page after the person was away two hours:

```text
notes-app · offline-sync
Add offline sync to the notes app
Idle · last reply 12m ago

◆ Sync conflicts: merge logic ready     12m
✓ Sync engine: syncs on reconnect       40m
── Seen ─────────────────────────────────
● Export button: works on web            2h
  └ ● pdf-layout delegate         quiet 40m
○ 2.4 release: after export              3h
✓ 2 more done                            2h
```

The question "Which conflict rule ships?" waits in Asks, and its row there reads "Holds up Sync conflicts".

### What is this session's work?

#### 1. The goal says what the session is working toward now

The first words the person reads tell them what the session is for, in their own terms. The goal stays the same while the work goes on, and changes when the session takes up different work.

- **Good:** "Add offline sync to the notes app", unchanged through a lint fix, new tests and a question.
- **Good:** a coordinator that shipped 2.4 and now runs the sync fix and 2.5 reads "Fix sync and ship 2.5".
- **Bad:** "Ship the 2.4 release", two hours after 2.4 shipped.
- **Bad:** "Fix the lint error", after one step on the way.
- **Bad:** "Offline sync PR ready for review". That is where one piece stands, not what the session is for.

#### 2. The first line tells this session from its siblings

When several sessions work in one project, the person can tell which one this is.

- **Good:** `notes-app · offline-sync`. A session that hands out work and reviews it reads `notes-app · main · coordinator`.
- **Bad:** `notes-app · offline-sync · coordinator` on a session that only ran two review subagents of its own.

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

#### 5. Each mark is true, and a row closes when its work does

The person can trust a mark at a glance. Work that is finished, dropped or filed for later leaves the open rows. Work that is still open stays, however old. So the open rows stay few, and each is work the session will still do.

- **Good:** `✓ 2.4 release: live in the store`, with a separate `● Sync bug: cause found`.
- **Good:** a piece paused for a day keeps its row: `○ Export button: works on web`.
- **Bad:** `● 2.4 release: published, sync bug next`. The release is over.
- **Bad:** ten `○` rows that read "filed for later", all evening.
- **Bad:** `Export button` disappears with no ✓ or ✗ while its iOS half is not done.

#### 6. Where it stands says the state of the work

A few words on what works, what is left or what it waits on, in the work's own terms. Not the step that ran, the tool that runs now, an id, or what was said in the conversation.

- **Good:** `Export button: works on web and iOS`.
- **Good:** `2.5 release: in review`, for a coordinator's stream.
- **Bad:** `Export button: tests running`, or `PR open, reviewer running` when the reviewer already shows as a child row.
- **Bad:** `Export button: export button merged`.
- **Bad:** `Sync conflicts: discussed three options`.

#### 7. Running work shows under the piece it serves

A delegate, subagent, background command or workflow run shows under the subject it works on while it runs, with how long since it last did anything.

- **Good:** `● Export button` with `└ ● pdf-layout delegate  2m` under it.
- **Good:** the same delegate, idle for 40 minutes, reads `quiet 40m`.
- **Bad:** the PDF layout delegate under `Sync conflicts`.

### Which pieces wait on me?

#### 8. ◆ marks exactly the work an open ask holds up

From the page alone, the person sees which pieces cannot move until they act. The ◆ goes when they answer.

- **Good:** the open question "Which conflict rule ships?" puts ◆ on `Sync conflicts`.
- **Bad:** ◆ on `Export button` for that question.
- **Bad:** `● Sync conflicts` while the work cannot move until the answer.

#### 9. The page points to Asks and never repeats them

The Overview shows the work. Asks and Finds show the person's to-dos. A row held up by an ask says where its work stands.

- **Good:** `◆ Sync conflicts: merge logic ready`.
- **Bad:** `◆ Sync conflicts: needs your decision`. ◆ and the band already say so.
- **Bad:** `◆ Sync conflicts: last-write-wins or manual merge?`. That is the question, copied.
- **Bad:** a row for a finding, a PR check or an option.

### What moved since I last looked?

#### 10. Every real change shows above the Seen line, on its piece of work

Back after a break, the person learns from the rows above the Seen line what finished, started, stalled or changed course, without reading the conversation. Each change sits on the row of the piece it changed.

- **Good:** the sample page above. The conflicts work and the sync engine changed since the look, and the export did not.
- **Bad:** 2.4 shipped, but `2.4 release` still sits below the Seen line with its old text.
- **Bad:** six pieces finished while the person was away. The page names two and folds the release into "✓ 4 more done".

#### 11. Nothing moves that did not change

A reply that changed nothing about the work leaves every row, age and the Seen line where they were. So a row above the line always means a change.

- **Good:** the person asks what the export button's label should say. The agent answers, and the page stays as it was.
- **Bad:** `Export button: works on web, iOS left` becomes `web done, iOS remaining`, moves above the Seen line, and its age reads "now".

#### 12. A change of plan says what it replaced

When the session drops one approach for another, the person sees both until they have looked.

- **Good:** `● Sync conflicts: manual merge`, with `was: last-write-wins` under it.
- **Bad:** the text changes to "manual merge", and nothing says the plan changed.
- **Bad:** a was line on a row that only made progress.

#### 13. The page says how current it is

The person can tell how far to trust the page. The live line says whether the agent is working, or when it last replied. A failed update says so. A long turn does not leave the rows hours behind. Every time on the page comes from code.

- **Good:** `Working… for 25m`, with rows that changed 4 minutes ago.
- **Good:** "Last Overview update failed. Changes from that reply may be missing."
- **Bad:** the agent has worked for three hours, and every row is three hours old.
- **Bad:** `2.4 release: goes out tomorrow`, read two days later.

## How the Overview is judged

Decision 13 sets the method: fixed rules where code can measure a property, and a judge where only reading can tell. The work runs in four phases:

1. **The spec.** "What a good Overview is" above, and a private catalog of failures seen in real sessions. Each failure names the property it breaks.
2. **The design.** Cases, checks and the harness. Long sessions are replayed exchange by exchange, with each answer applied before the next, since most failures build up over a session.
3. **Review.** Fresh reviewers attack the design. They look for bad pages that pass, good pages that fail, and prompt changes for the worse that no case catches.
4. **The build.** A case joins the suite only after it fails on the real failure, fails on a deliberately broken prompt, and passes a good page written by hand.

The judge reads the drawn page, not the model's answer, since the person reads the page. It grades nothing until its verdicts agree with pages the person has labeled.

Every check holds both sides of its property. A case for a goal that went stale runs beside a case for a goal that must not change. A case that open rows close runs beside one where paused work stays open. A case that a reply with no news changes nothing runs beside one where a real change must reach the page. A prompt that does only one half fails one case of the pair.

## Risks

- **A fix for one failure causes its pair.** Pushing the goal to follow the work can make it change at every step. Pushing rows to close can close paused work. The paired cases above are the guard.
- **The page is only as current as the last reply.** While the agent sits idle, the subject rows do not change. A delegate that finishes while its coordinator is idle leaves the child rows, and its subject changes at the coordinator's next turn. The live line dates the page.
- **A wrong link draws ◆ on the wrong work.** Code clears ◆ when an ask closes, but it cannot tell whether the link was right.
- **The judge agrees with itself.** A judge written from these properties can pass pages the person would call bad. Checking it against the person's labels first is the guard.
- **The fold can hide a change.** After a long absence, only 2 finished rows show above the Seen line. A finished release can fall into "✓ 4 more done", which breaks property 10.

## Not built

- Opening a delegate's session from its child row, in every look.
- A one-line status that each delegate reports, drawn on its child row in the coordinator.
- A coordinator showing ◆ when a delegate's own ask waits on the person.
- A reason under a decision, shown on demand.
