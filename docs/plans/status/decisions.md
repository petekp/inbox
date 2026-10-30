# The Status tab: decisions

Part of [the Status tab plan](../status.md).

Status: built.

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
