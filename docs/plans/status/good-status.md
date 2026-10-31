# The Status tab: what a good Status is

Part of [the Status tab plan](../status.md).

Status: built.

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

The person can trust a mark at a glance. A piece that is delivered, dropped or filed for later closes, with its own mark. Every piece still open is on the page, as a row or in the "N more" fold, however many there are and however old. The page gets shorter by closing what is done, dropped, filed or listed twice, never by losing open work.

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
