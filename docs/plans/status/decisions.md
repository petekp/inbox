# The Status tab: decisions

Part of [the Status tab plan](../status.md).

Status: built.

## Decisions

1. **One list of subjects, with no sections. Rows are ordered by status, then newest change first.** The order is: held by an open ask (◆), working (●), waits on something other than the person (◌), queued (○), then done (✓) and dropped (✗).
   - Reason: each piece of work shows once, with its change attached. The earlier six-section page showed one subject in up to six places. Each part reads from what needs the person to what is finished.
   - This replaces ordering each side of the line by last change alone. That put a queued row whose text had just changed above work that had finished, so the marks ran out of order down the page.
2. **The inbox model edits subjects by id. Code applies each edit.**
   - Reason: a model that rewrites the whole page from the last page drifts toward the newest exchange. In a replay of one real session, 33 of 35 replies rewrote the page.
3. **Code writes every time and the order. The model never writes a time.**
   - Reason: a time word in model text freezes when it is written, so "merged today" reads wrong the next day.
4. **A row that waits on the person shows the ◆ mark in the needs-you tone and no word, and the only time a row shows is how long it has been idle.** A row's stall word follows its name on the same line. A subject that an ask holds up, a milestone it holds up and a Herdr delegate at a question or an approval show ◆ with no stall word. A subject an ask holds up draws the ask's own words under its name, in the needs-you tone, with no prefix. A finished delegate shows its ✓ mark and no word until the person has seen the Status. An open subject with no change for a day or more, and no child of it running, reads how long it has been idle in whole days, muted, as `idle 2d`. Code writes it from when the subject last changed. A row waiting on someone else shows no other word: its ◌ mark and where it stands say what it waits on. Running work shows no word, since its moving mark says it runs. Among rows of the same status, a row's place follows when its work last changed, not when the page last checked it.
   - Reason: a person read a muted `waiting` as work waiting on them, and later found `waiting` and `waits on you:` redundant beside the ◆ mark and its color. The mark and color carry the state, so no word repeats it.
   - Reason: an age on every row was hard to read and said little. A row that rose because the page checked it would claim a change that did not happen.
   - Reason for the idle time: someone coming back cold cannot tell live work from work that stalled days ago, and principle 2 puts time on the page where it means something, such as how long something has stalled. A day keeps it off work that moves within a session, and code writes it, so it never freezes the way a model's time word does. A held row shows no idle time, since its ◆ mark matters more to the person. Code lists each working or waiting subject idle a day that nothing holds in the call's `<idle>` block. The call answers each with one line: DONE when its work finished, DROP when the work left it, or SET to keep it, working when the exchange works on it, or waiting with what it still waits on. An answer with no line for one is asked once more for those lines. Queued ones are left to the work. A waiting one kept with SET in the same words leaves the block for a day (`keptAt`), since a release in store review can wait for days, and asking about it at every call would cost a second call each time. Its idle time on the page still counts from its last change.
   - A milestone shows no word or time beside its name (removed 11-16: Pete never looked at it). Its mark says which one is current.
   - Reason: on the goal's path, how long the current step has run says whether the goal moves. An hour keeps it off a step at the normal pace of the work.
   - This replaces the rule that no row but an idle one shows a time.
5. **A changed state always reaches the page.** Code keeps the old text and place only when the new text has the same content words, in any order.
   - Reason: "manual merge ready" becoming "manual merge broken" is a change, though half the words match.
6. **◆ comes from a link between an open ask and the subjects it holds up.** The Status call writes the link. Code draws ◆ while the ask is open and clears it when the ask closes. One ask can hold up several subjects. There is no "waits on you" status and no "problem" status.
   - Reason: a ◆ set by the model could not see Asks, so it went stale and could disagree with Asks. A problem nobody is fixing is a to-do for the person, so it belongs in Asks, or in Finds when it is outside the task.
   - This replaces the rule that the Status call reads no inbox text. It now reads each open ask's id and first words, so it can link the ask. It never restates one.
7. **Work filed for later closes as done, with ✓.** The Status call closes a piece the person files out of the session's plan with DONE and the text "filed for later". A piece set aside to come back to in the session stays queued.
   - Reason: filed work left open sat as ○ beside the work still to do. Where it stands says it was filed, so the person can tell it from delivered work.
   - A mark of its own for filed work would be a new feature. [#137](https://github.com/petekp/inbox/issues/137) is closed as not planned.
8. **No buttons that act on an ask or a finding.**
   - Reason: an Answer or Fix button on a row would make the Status a weaker copy of Asks and Finds, with less context.
9. **Code follows running work from host events, and draws each as a child row under its subject.** A child is a subagent, a workflow run or a Herdr delegate. A background command or a Monitor task is not one. The model only links a child to a subject.
   - Reason: code knows when a subagent, workflow run or delegate starts and ends. The person wants delegated work shown under the piece it serves.
   - Reason a background command is not a child: it is how the agent watches work, not work. A coordinator's background commands are waits on its delegates, such as "Wait for either delegate to report next", and one session held 22 of them. The work they watch already shows as its own row, the delegate or subagent. A background command that does work, such as a test run, is a step of its subject, which where it stands covers.
   - This replaces the decision to have no subagent rows, and the child rows for background commands and Monitor tasks.
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
    - The goal's milestones now say which comes next. They draw as a path on one vertical line: done milestones by name, the current one reading "now", and the one the work takes up next reading "next", where the line ends. The rest sit under "Later". The Status call orders the queued milestones with a NEXT line. A NEXT line marks the milestone it moves as changed, but is no progress toward the goal, as a DROP is none.
    - Reason: on a goal with several queued milestones, ○ alone did not say which one the work takes up next, and the plan's order often went stale.
    - This replaces the goal's count of done milestones after its text, and the milestones drawn as a list of rows.
16. **Evals are a cheap check that a failure seen in real use does not come back.** They run at each release, within about 200 Status calls. Fixed rules check what code can measure. A model judge checks what only reading can tell. The judge is first checked against hand-written good and bad pages that the author of its instructions never sees.
    - Reason: the person's daily use of next builds and reports from users are the main signal. The evals only keep a fixed failure fixed. The old Status cases passed 42 of 42 while a live Status kept a goal about a release that had shipped, and listed one piece of work under two names. Each case checked one rule of the Status prompt, most of them in a single exchange.
    - This reverses the decision to check the tab with fixed rules only.
17. **Every build draws the tab.**
    - Reason: the tab is ready to release, from 0.4.0. Updating moves Asks to key 2 and puts the Status on key 1; which tab the inbox opens on does not change.
    - This reverses the decision to draw the tab on next builds only while it was not ready.
18. **The page has no identity line, and the Status call writes no role.**
    - Reason: the line takes space without telling sessions apart. Folder, branch and role are often the same across sessions, and each host already names the session in its own window, tab or title. Nothing else drew the role.
19. **The head is a title and a one-line description of what the session is focused on now.** The title is short, like a row's name. The page has no live line.
    - Reason: the head then reads like a row. The person scans the title, and reads the description for what the session is doing now. Each host already shows whether its agent is working, and a ● mark moves while a turn runs.
20. **By default, a row draws where it stands on its own line, under its name.**
    - Reason: the names line up down the page, so the person can scan them.
21. **A child row says in a few plain words what its work does, never an id.** A Herdr delegate shows what its own session's Status says it is focused on, which the inbox publishes to Herdr: its head's description, or its title when a head saved before descriptions has none. Without one, it shows its name turned into words. A subagent or workflow run shows the description it was started with.
    - Reason: a name an agent made up for a delegate tells the person nothing about the work.
Decisions 22 and later, on keeping what the page says right and current, are in [decisions on the page's accuracy](decisions-accuracy.md).
