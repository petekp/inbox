# The Status tab: the page

Part of [the Status tab plan](../status.md).

Status: built.

## The page

From top to bottom:

| Part | What it shows | Who writes it |
| --- | --- | --- |
| Goal | The goal's heading, its text, its Prev line and its Now line, then its milestones as a path on one vertical line. Done milestones show their name. A milestone shows no word or time beside its name: its mark says whether it is done, under way or waiting. The one the work takes up next is the last on the line, and the rest sit under "Later". A done milestone the person has seen shrinks to its name, muted, with its rows folded behind a chevron after the name. The Now line is left out when it only names the current milestone. This replaces the count of done milestones after the goal's text. Once the goal is met, a ✓ in the done tone sits beside "Goal met", and the head becomes the heading of the list after the goal, in the place of "Other work". Once every milestone is done and no work under them is open, held or running, seen or not, the milestones fold into one line that names them, as "Fixes built, Announced ▸", which a press opens. So the fold never hides an ask, running work, or a milestone dropped since the last look. | The model writes the goal, the milestones and which comes next. Code orders the path and writes the words. |
| Head | A title for what the session is focused on now, and a line under it on what the session is doing about it. The call is asked for a title of at most 3 words and a description of at most 8. Code clips them at 20 and 14. A head with no description yet shows its title alone until the next call writes one. | Model |
| Subject rows | A mark and a short name, with how long it has been idle after the name, as `idle 2d`, once an open subject has had no change for a day and no child of it runs, and a few words on where it stands on the line under the name. The call is asked for a name of at most 3 words and a text of at most 4. Code clips them at 20 and 12. | The model writes the status, name and text. Code draws the mark and the stall word, and orders the rows by status, then by last change. |
| Prev line | The plan a change replaced, as "Prev: last-write-wins", or the pieces merged into this one, as "merged in: Banner on hover", until the person has seen it | The model writes it. Code shows it only until the person has looked. |
| Child rows | Running work under its subject. A subagent or workflow run shows the first line of the description it was started with. A Herdr delegate shows the focus its own session publishes to Herdr as `inbox-focus`, or else its Herdr name in words. A delegate shows what Herdr shows: `◆ …` at a question or an approval, and `✓ …` once it stops, until the person has seen the Status. Running work shows no word. | Code, from host events and from Herdr. The model writes the link. |
| Folds | "○ N more" for the open subjects past 6 that the page does not draw. Work that closed since the last look shows as at most 2 rows. The rest is named after the closed rows, in one fold for each status: "✓ Done: Sync merge, Search speed, +3 more" and "✗ Dropped: Flick option". Each fold shows the two newest names and counts the rest. "▸ N done" for the seen done subjects, or "▸ N more done" when a done row shows above it. The done fold has no mark, and a press lists its rows under it. | Code |
| Status line | "Last Status update failed. Changes from that reply may be missing." while the last call wrote nothing | Code |

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

More rules of the drawn page, all in `hooks/status-page.ts:statusPage`:

- A subject's text wraps to at most 3 lines.
- Rows run ◆, ●, ◌, ○, then ✓ and ✗ together, each group newest change first, whether or not the person has seen them.
- At most 2 finished rows show, both changed since the last look. The rest fold into the count. Property 10 asks for more; see "Not built yet".
- Once the person has seen an open row, it keeps where it stands and drops its Prev line.
- At most 3 children show under one subject. The rest read "+ 2 more running".
- A child whose subject is not shown, or that has no link yet, sits at the top of the list.
- At most 6 open rows show, the number the Status call is told to keep. The rest fold into "○ N more", taken from the rows the page would draw last: queued rows first, then rows that wait on others, then working rows.
- A held subject never folds, and its mark does not move. A subject that changed since the last look never folds either, and neither does one with a child row under it, so the child always shows under its subject. So more than 6 open rows can show, and a page the person has never looked at folds nothing.
- The fold's mark is always ○, whatever rows it holds. Every row in it is one the person has already seen, and none waits on them. ○, the mark of work set aside, says that.
- The Asks row of a linked ask reads "Holds up" and the subject's name.

Before any work, the page reads: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."

### How it updates

- **After each reply.** The ledger call runs first, then the Status call. A failed ledger call skips it.
- **What the Status call reads:**
  - the head;
  - the open subjects, each with its id, status, name, text and how long ago it last changed;
  - the names of the last 10 finished subjects, so it does not add one again;
  - each open ask's id, its first 30 words and its linked subject;
  - the running children, and each delegate that finished since the last applied Status call read the Status, while its subject is open, each marked running, blocked or finished;
  - the idle subjects: working ones with no change for a day or more, that no open ask holds up and no running child works for, each with how long it has gone without a change, so the call says whether each is done or dropped (`hooks/status-children.ts:idleSubjects`);
  - the host's task list, where there is one;
  - the person's message, the agent's tool activity and the reply.
- **What it answers:** edits by id, one per line: add a subject, update one, finish one, drop one or drop it into another, write a was line, link an ask or a child, write the head. Or `UNCHANGED`. `hooks/status.ts` parses the answer, and `hooks/status-ops.ts` applies it.
- **What code does with it:**
  - A new subject whose name holds the same key words as an open one updates that one. One that matches a subject finished since the person last looked reopens that subject, so the page shows the piece once.
  - A new subject or a head named only by a PR or issue number, such as "#3655" or "PR 3655", changes nothing: a number names no work, and the PRs tab shows the PR.
  - An update that keeps the status and has the same content words, in any order, keeps the old text and its place. An update that sets an idle subject working moves its time anyway, so the page shows it working again. A head that comes with finished work and none under way keeps the old title, and takes a new description only when the line keeps the title and the description names no queued subject. Otherwise a head that keeps its title keeps the old title and takes the new description.
  - A line that is not an edit is left out, and the answer's edits apply. An answer with no edit is asked once more. If that fails too, the page stays as it was and the status line says so. While no goal runs and none is suggested, the call reads a `<next-goal>` block that asks for the next goal. An answer with no GOAL or SUGGEST line is then asked once more, with its first answer, and the second answer applies when it parses. Code never writes a goal itself (`hooks/status-prompt.ts:nextGoalRetry`).
- **During a long turn.** The main agent's next tool call, once 10 minutes have passed since the turn began and since the last Status call, starts a Status call. That call reads the person's message and the turn's activity so far.
- **On a catch-up.** The call reads the whole conversation and edits the current subjects.

`hooks/status.ts` owns the parser, `hooks/status-ops.ts` how an answer applies, and `hooks/status-upgrade.ts` how a saved Status loads. `hooks/status-page.ts` owns the drawn page. `hooks/status-prompt.ts` owns the call's prompts. `docs/looks.md` names the owner of every other rule.
