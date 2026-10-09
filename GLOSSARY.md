# Inbox

The inbox gathers what a Claude Code session needs from the person, and what
Claude noticed along the way, into one place beside the conversation.

## Language

### What waits on the person

**Needs you**:
Everything that waits on the person: open questions, and their tasks.
_Avoid_: waiting

**Question**:
Something Claude asked that only the person can answer.
_Avoid_: decide, decision

**Task**:
Something only the person can do, such as signing in.
_Avoid_: do, todo

**Closed item**:
A question or task that is no longer open: answered, done, dismissed, expired,
or closed by Claude.
_Avoid_: decided

**Finding**:
An issue or opportunity Claude noticed outside the current task.
_Avoid_: note

### Surfaces

**Band**:
The line above the prompt with the Needs you and Findings counts and [Open
inbox]. When the session stops, a second line says why, with [Resume] after
an API error.

**Pane**:
The `/inbox` panel beside the conversation, with its Needs you, Findings and
PRs tabs.

**Card**:
The short summary of where the session stands: its goal, what's done, and
what's happening now.

**Last action**:
What an item or PR in the pane says after the person presses one of its
actions: a ✓ and the action's label, as in "✓ Discuss · 1m ago". Each keeps
only its latest.
