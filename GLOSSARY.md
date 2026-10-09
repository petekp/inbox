# Inbox

The inbox gathers what a Claude Code session needs from the person, and what
Claude noticed along the way, into one place beside the conversation.

## Language

### What waits on the person

**Needs you**:
Everything that waits on the person: open questions, their tasks, and checks
in the session's repos still failing when Claude stopped.
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

### Checks

**Check**:
A test, type check, lint, build or validation command Claude ran, known by its
name, the folder it ran in, and its target.
_Avoid_: test run, job

**Target**:
The part of a check's suite one run covered: the files and folders it named,
and any test-name filter. A run that names none covers the whole suite, and a
folder covers the files inside it.

**Check result**:
How a check's latest run ended: pass or fail. A later result of the same or a
broader target replaces it.

**Check tracking**:
Keeping each check's latest result and its state: stale, left failing,
dismissed, fix sent.

**Session's repos**:
The repo the session started in, and each repo where Claude edited a file
with its file-editing tools. Only their check results count toward Needs you
and toward contradicted claims. A result from outside any repo counts when it
ran in the session's folder or below it.

**Stale**:
Describes a check result from before a change to a file in the check's
folder. Files git ignores don't count.
_Avoid_: outdated

**Left failing**:
Describes a check that was failing when Claude's turn ended.

**Dismissed**:
Describes a failing check result the person hid from the band and the pane.
It stays hidden until the check runs again.

**Fix sent**:
Describes a failing check whose run the person asked Claude to fix. The pane
stops listing it until the check runs again.

**Contradicted claim**:
A sentence in Claude's reply that says a check passes when the check's result
failed or is stale. A phrase in quotes is not a claim. The inbox sends Claude
back once per result, to run the check or say so.
_Avoid_: nag

### Surfaces

**Band**:
The line above the prompt that says where the session stands.

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
