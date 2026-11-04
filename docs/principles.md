# Principles

The inbox is for a person running many agent sessions at once. It exists to take things off their mind. Use these principles to decide any question about how the inbox should behave. When a choice follows from them, make it and say what you chose. Ask the person only when a choice goes beyond what they have said.

## Agents do the upkeep

The person never maintains the inbox. Agents and the inbox model keep every row, the Status page, the goal and its milestones current, without being asked. A state that moves only when the person acts is a bug. When work finishes, what it was for moves forward on its own: a milestone closes, a met goal is followed by the next one.

## Orient someone coming back cold

A person returns to a session after hours on other work. At a glance they should see what the work is for, where it stands against that, and what needs them. Write at the level of the feature, never as a log of events. Show time where it carries meaning, such as when something last happened. Fold away what is handled, and keep it reachable.

## Don't let work stall silently

Wherever the person's input would move work forward, offer the action for it, not a status word. A row that asks them to check or do something carries the link, file or command, and how the result gets back to the agent. Only rows that wait on the person say they are waiting.

## A correctable guess beats a question

Every question costs the person attention. When the inbox or an agent can infer something reliably from the work, it acts and lets the person correct it. When it cannot infer reliably yet, it waits rather than guess wildly, and it never asks the person to do the inferring.

## The person's explicit choices win

Something the person set or dismissed stays that way. A goal they typed is not replaced before it is met. A question they dismissed does not come back in other words. Text the inbox sends an agent does not override policy the person sets elsewhere, such as whether to reply to review comments.

## Better experience over lower cost

Between two behaviors, pick the one that serves the person better, even when it costs more model calls or code. Prefer the one that loses less of their information.

## Every host, the same behavior

The terminal, the desktop app, Codex and omp give the same behavior, each in its host's native look. A host is left out only for a real host limit, written down in [docs/looks.md](looks.md) "Differences on purpose" with its reason.
