# Principles

This doc says what the inbox is for and how to decide how it should behave. Read it before you design a feature, write text a model reads, or ask the person a question. When a choice follows from these principles, make it and say what you chose. Ask only when a choice goes beyond them or against what the person has said. This covers product and design choices. Merges, releases, messages sent for the person and spending on model calls still need the person's yes.

## What the inbox is

People now run many agent sessions at once, in the terminal, the Claude app, Codex and omp. Each session is a long, noisy thread. The important parts are easy to miss: a question the agent asked an hour ago, a risk it noticed in passing, a PR waiting on review, how far along the work is. The person can't hold all of it in their head.

The inbox holds it for them. Next to each session it shows what waits on the person, what the agent noticed that deserves their attention, and where the work stands against its goal. The agent keeps it current. The person glances at it, acts in one press when something needs them, and goes back to their other work.

Four sentences sum it up:

- Inbox brings out the key information that's easy to miss in a long, noisy thread.
- Inbox anticipates the action you want to take on each item.
- Inbox catches issues and opportunities that would otherwise slip through the cracks.
- Your agent manages Inbox, so it's always up to date.

## Who it's for

Picture someone who runs several sessions at once and switches between them all day. They come back to a session after an hour, or the next morning, having lost the thread. They are short on time and scanning, not reading.

In a few seconds they want to know:

- what this session is for, and how far along it is
- what needs them now, and what one press would move it forward
- what the agent is already handling, so they can stop worrying about it

They do not want to learn a tool or maintain one, and they never need its hotkeys. They want "Nothing needed" to be true when it says so.

## Principles

### 1. Agents do the upkeep

The person never maintains the inbox. The agent and the inbox model keep every row, the Status page, the goal and its milestones current, without being asked. When work finishes, what it was for moves on: a milestone closes, a met goal makes way for the next one.

A state that moves only when the person acts is a bug. So is a task that hands the person work the agent could do itself, such as marking a PR ready or reloading a browser tab. The inbox shows only what truly needs the person.

### 2. Orient someone coming back cold

The Status page is a guide to where the session has been, where it is and where it's going. It is not a log. Write at the level of the feature: what the work is, how far along it is, what it waits on, what comes next. Use few words.

Balance the long arc with what happened recently. The latest turn must not crowd out the session's direction.

Time belongs on the page where it carries meaning: when the last thing happened, how long something has stalled, how far apart things were. Leave out times that only record events. Code, not the model, can write these times, such as how long a row has been idle. A coordinator session that runs other sessions shows a higher-level view. Its children's asks show in its inbox as its own, and their work rolls up into its Status page.

### 3. Anticipate the next action

Every row anticipates what the person needs to act on it.

- A question carries the options and the one the agent recommends, with the reason.
- A task carries what the person needs to do it: the link, the file, or the command to copy, when one exists. Otherwise it says exactly what to do and how the agent will learn it is done.
- A row that waits on the person offers the press that moves it forward, not just a status word.
- A row that asks the person to check or do something says how the result gets back to the agent.

Don't let work stall silently. When the person's input would unblock something, the inbox offers that input as an action.

### 4. Bring out what's easy to miss, once

The inbox catches problems and opportunities: a bug, a risk, missing tests, a better way to do something. Each thing shows in one place. A finding never repeats an ask, and a row in one list never shows up in another. The inbox is not a dashboard of everything GitHub or the session knows. It shows what deserves the person's attention.

### 5. Handled things settle, and stay reachable

When something is handled, it collapses. It keeps a short record of what was chosen and when, with Undo where that makes sense. A review thread that was addressed folds away. Nothing is left hanging after the person acts, and nothing they might need is lost: what folds away can be opened again. A dismissed row can be reopened for the rest of the session, and recent closed rows stay in view.

### 6. Every press answers at once, and honestly

Every press shows that it registered, as soon as it is pressed. Without that, people press again and again. The feedback is small and stays on the row; it does not add a new line of text. It is also honest about timing. A press that asks the agent to explain or discuss reads "Explaining…" while the agent works, and shows a ✓ only once the agent has answered. A press that hands work to the agent shows a ✓ when the hand-off is made, since that is what the press did. A working mark keeps moving while the work runs.

### 7. A correctable guess beats a question

Every question costs the person attention. When the inbox or an agent can infer something reliably from the work, it acts and lets the person correct it. A goal is inferred from the work itself, not only from what the person typed. When there isn't enough to go on yet, it waits rather than guess wildly, and it never hands the inferring back to the person.

The inbox is an intelligent surface, not a rigid form. Design for judgment: rules that tell the model what matters, and code checks that stop the obvious mistakes, such as setting a goal for one small fix.

### 8. The person's explicit choices win

What the person set or dismissed stays that way. The person can dismiss any row with one press, and need not deal with it. A goal they typed is not replaced before it is met. A question they dismissed does not come back in other words. The model closes a finding when it is fixed, never because the person said it can wait.

The inbox also stays in its lane. Text it sends an agent says what a press means and nothing more. It may state the limits of the press's own act, such as "don't post it" on a drafted reply, but never the person's general workflow, such as whether to ask before pushing. Examples in the guidance agents read use steps people rarely hand to an agent, such as merging or messaging someone. It does not set policy the person decides elsewhere, such as whether to reply to review comments. Where another tool already does a job well, such as routing links to a browser, the inbox leaves it to that tool.

### 9. Trust is the product

An inbox that is stale, or wrongly empty, is worse than none: the person stops believing it and goes back to reading every thread. When the page says nothing is needed, nothing is. When the Status page is out of date, that is a bug. Fix it at its cause, whether that is code, the prompt, or what the model is given. A failed update says so on the page instead of showing old content as current.

### 10. Native to each host, the same everywhere

Each look feels native to its host app: the terminal, the Claude app's pane, the Codex tab, omp's panel. Each uses its host's own controls. Under the look, the behavior is the same: the same words, the same actions in the same order, the same states. A host with no buttons, such as omp's key-driven panel, offers the same actions as keys. Switching between hosts should feel natural. A difference not written down in [looks.md](looks.md) "Differences on purpose", with a real host limit as its reason, is drift.

Design every feature for every host from the start. Doing a host later is not a reason to leave it out.

### 11. Details are the product

The whole drawn shape of a control takes the click, not only its label. Nothing jumps, flickers or vanishes before its space closes. The desktop app is click-first; keys are a convenience, never the only way. Aim for the best result the platform allows, not the smallest change. When a limit seems to block that, check whether the limit is real before designing around it.

### 12. Plain words

Write every label, row, question and explanation in plain, short, spoken words, for someone who wasn't in the session. Name each thing by what it is. No ids, no jargon, no words coined in the session, no mannered prose. An explanation uses whatever helps the person understand fastest, such as a small diagram, and stays in the conversation rather than in a separate file.

## Tradeoffs we have settled

- **Better experience over lower cost.** Between two behaviors, pick the one that serves the person better, even when it costs more model calls or code. Prefer the one that loses less of their information. Thrift belongs in how we verify, not in what the person gets.
- **Collapse over show-everything.** Fold what's handled, keep it reachable.
- **Native look, shared behavior.** The host owns the look; the inbox owns the words, order and states.
- **Agent first, person when needed.** The agent does what it can. The person sees only what only they can do or decide, with a recommendation. Don't be overly cautious: when the agent is allowed to run a step, it runs it instead of making a task.
- **Agent-managed, person in control.** The agent keeps the goal current. The person can always set it, and their choice wins.
- **One session at a time.** Each session has its own inbox. A coordinator shows its children's asks as its own and rolls up their work. Views across sessions come later.

## What we reject

- A page that lists events in order, or shows times and counts that mean nothing to the person.
- Rows that hang around, stall, or wait on the person with nothing to press.
- Tasks for work the agent could do.
- Indicators whose meaning the person has to guess, and decoration that adds noise, such as emojis. Marks and colors are welcome when a legend or the context makes them clear.
- The same thing shown in two places.
- Jumpy or jarring motion.
- Jargon, ids and dry or mannered copy.
- Text that sets policy for the person's agent.
- Building for one host now and the others "later".
