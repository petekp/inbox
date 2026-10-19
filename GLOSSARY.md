# Inbox

The inbox gathers what an agent session needs from the person, and what the
agent noticed along the way, into one place beside the conversation. The agent
is Claude, in Claude Code, or Codex.

## Language

### What waits on the person

**Needs you**:
Everything that waits on the person: open questions, and their tasks.
_Avoid_: waiting

**Question**:
Something the agent asked that only the person can answer.
_Avoid_: decide, decision

**Task**:
Something only the person can do, such as signing in.
_Avoid_: do, todo

**Closed item**:
A question or task that is no longer open: answered, done, dismissed, expired,
or closed by the agent.
_Avoid_: decided

**Held row**:
A closed item or finding that stays in place while the person replies to it.
A row is held when its reply field is open or its draft holds unsent words,
and the reply began before the close. It shows why it closed, does not count
toward Needs you, and offers Reply and Discard. After its reply sends, it
shows its settled form, then folds into the Closed fold. After Discard, it
folds at once.

**Finding**:
An issue or opportunity the agent noticed outside the current task.
_Avoid_: note

### Surfaces

**Band**:
In Claude Code, the line above the prompt with the Needs you and Findings
counts and [Open inbox]. When the session stops, a second line says why, with
[Resume] after an API error. Codex has no band.

**Pane**:
The `/inbox` panel beside the conversation in Claude Code, with its Needs
you, Findings, PRs and Map tabs. Codex shows the same tabs in its Inbox tab.

**Card**:
The short summary of where the session stands: its goal, what's happening
now, what runs, and the newest 4 results as `done`. The inbox model writes it.
The Map tab draws the goal, now and running. The agent reads all of it in the
text the inbox adds at the start of a session and after compaction. `done`
stays in saved state because older versions read it. Each update sets it to
the newest 4 milestones from DONE lines.

**Milestone**:
One result the session reached: something the agent finished (a DONE line,
which includes a PR the session opened), a question the person answered, or a
finding fixed. The Map tab lists them, newest first, with their ages. One with
no known time shows no age and sits below the timed ones.

**Map**:
A tab that shows a page instead of rows: the session's goal, where it stands,
what runs and its milestones. It has no count and no presses. While the main
agent's turn runs, its Now line reads "Working…" in place of the card's.

**New row**:
A row a look lists for the first time since it last recorded its rows. A
look showing an empty tab can move to a tab where rows arrived. A row that
arrives above the open row stays closed. Codex animates its entry.

**Last action**:
What an item or PR in the inbox says after the person presses one of its
actions: a ✓ and the action in the past tense, as in "✓ Discussed · 1m ago".
Explain and Discuss read "Explaining…" or "Discussing…" until the agent
replies. A row handed to the agent that its reply left open reads "Still
open". Each keeps only its latest.

### Looks and hosts

**Look**:
One of the three ways the inbox is drawn: `terminal` in the Claude Code
terminal, `desktop` in the pane of the Claude desktop app's Code sessions, and
`codex` in the Codex tab. `Look` in `hooks/view.ts`.
_Avoid_: client, surface

**Host**:
The program that runs the inbox code. Claude Code runs the mod, which draws
the terminal and desktop looks. Codex runs the plugin, which draws the Codex
tab.

**Shared module**:
A file in `hooks/` that both hosts consume, directly or through the build.
It imports only other shared modules and the shared types.

**Adapter**:
The code that draws the shared view in one look: `hooks/register.tsx` for the
terminal and desktop looks, `codex/src/tab.tsx` for the Codex tab.

**Difference on purpose**:
A behavior that differs between looks because one look cannot do something,
or because the product decided so. Any other difference is drift.

The engine has two terms of its own. Its `surface` is where Claude Code runs,
and includes `mobile` and `vscode`; `lookOf` in `hooks/register.tsx` maps it to
a look. Its `Client` is a drawn region that takes clicks over its whole shape,
as in `hooks/row-client.tsx`.
