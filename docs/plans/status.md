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

## Parts

- [Decisions](status/decisions.md): What was decided, and why.
- [The page](status/page.md): What the page draws, and how it updates.
- [What a good Status is](status/good-status.md): The properties a Status is checked against.
- [How the Status is judged](status/judging.md): The eval suite, its rules, the judge and the pass bar.

## Terms

From `GLOSSARY.md`: SessionStatus, Head, Subject, Child, Stall words, Seen line, Look, Host and Catch-up. The new terms:

- **Status call:** the inbox model call after the ledger call. It reads the open subjects and the new exchange, and answers with edits.
- **Where it stands:** the few words on the line under a subject's name.
- **Was line:** a line under a subject that names the plan a change replaced, as "was: last-write-wins", or a piece merged into it, as "merged in: Banner on hover".
- **Link:** the Status call's tie from an open ask or a child to the subject it belongs to.
- **Fold:** one line that stands for several rows: "✓ 3 done" or "○ 2 more".
- **Last changed:** when a subject's status or meaning last changed. It sets which side of the Seen line a row sits on, and its place among rows of the same status.
- **Last checked:** when an Status call last read the work, whatever it answered.
- **Property:** something true of a good Status that a person can check by reading the page, knowing what happened in the session.
- **Fact list:** what really happened in an eval case, written by the case's author: each piece of work, its state at each step, the asks and the pieces each holds up, and what is not work.
- **Rule:** a check written in code, run on the saved Status, the drawn page and the fact list.
- **Judge:** a model that reads a drawn page and the fact list, and says whether each of its checks holds.
- **Replay:** an eval case of many steps, in which each answer is applied before the next step, as a host would.
- **Known failing case:** a check of a failure that code owns. It stays in the suite, marked as expected to fail, until the code is fixed.

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
