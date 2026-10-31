# The Status tab: the page

Part of [the Status tab plan](../status.md).

Status: built.

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
- **What it answers:** edits by id, one per line: add a subject, update one, finish one, drop one or drop it into another, write a was line, link an ask or a child, write the head. Or `UNCHANGED`. `hooks/status.ts` parses the answer, and `hooks/status-ops.ts` applies it.
- **What code does with it:**
  - A new subject whose name holds the same key words as an open one updates that one.
  - An update that keeps the status and has the same content words, in any order, keeps the old text and its place. A head that keeps its title, or that comes with finished work and none under way, keeps the old head.
  - An answer that holds any line that is not an edit is asked once more. If that fails too, the page stays as it was and the status line says so.
- **During a long turn.** The main agent's next tool call, once 10 minutes have passed since the turn began and since the last Status call, starts a Status call. That call reads the person's message and the turn's activity so far.
- **On a catch-up.** The call reads the whole conversation and edits the current subjects.

`hooks/status.ts` owns the parser, `hooks/status-ops.ts` how an answer applies, and `hooks/status-upgrade.ts` how a saved Status loads. `hooks/view.ts` owns the drawn page. `hooks/status-prompt.ts` owns the call's prompts. `docs/looks.md` names the owner of every other rule.
