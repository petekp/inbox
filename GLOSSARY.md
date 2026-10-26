# Inbox

The inbox gathers what an agent session needs from the person, and what the
agent noticed along the way, into one place beside the conversation. The agent
runs in Claude Code, in Codex, or in omp.

## Language

### What waits on the person

**Asks**:
Everything that waits on the person: open questions, and their tasks.
Its tab's id is `needsYou`.
_Avoid_: Needs you, waiting

**Question**:
Something the agent asked that only the person can answer.
_Avoid_: decide, decision

**Design choice**:
A question whose options the agent could try and show side by side, such as
two layouts. The agent marks it when it records the question, and the inbox
model marks a question it adds. Only these show Compare.

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
toward Asks, and offers Reply and Discard. After its reply sends, it
shows its settled form, then folds into the Closed fold. After Discard, it
folds at once.

**Finding**:
An issue or opportunity the agent noticed outside the current task.
_Avoid_: note

### Surfaces

**Overview**:
The first tab, a guide to the session's work: what it is doing, how it is
going, what changed since the person last looked, and what is next. The inbox
model rewrites it after each reply, in a second call after the one that
updates the rows. It is not a list of events.

**Band**:
In Claude Code, the line above the prompt with the Asks and Findings
counts and [Open inbox]. When the session stops, a second line says why, with
[Resume] after an API error. Codex has no band. omp has a band with the same
counts and no button, which says `/inbox` opens the panel.

**Pane**:
The `/inbox` panel beside the conversation in Claude Code, with its Asks,
Findings, PRs and Overview tabs. Codex shows the same tabs in its Inbox tab. omp
shows them in an overlay that `/inbox` opens.

**Tab symbol**:
The emoji a tab shows in place of its words when the words don't fit,
followed by its count, as "🔍 4". `symbol` in `TABS` in `hooks/view.ts`.

**New row**:
A row a look lists for the first time since it last recorded its rows. A
look showing an empty tab can move to a tab where rows arrived. A row that
arrives above the open row stays closed. Codex animates its entry.

**Last action**:
What an item or PR in the inbox says after the person presses one of its
actions: a ✓ and the action in the past tense, as in "✓ Discussed · 1m ago".
Explain and Discuss read "Explaining…" or "Discussing…" until the agent
replies. Compare reads "Comparing…" until the agent records the question
again, which can be turns later when a background subagent does the work.
After 30 minutes with no report, it reads "No comparison came back". A row
handed to the agent that its reply left open reads "Still open". Each
keeps only its latest. The pressed button reads "… again", as in "Explain
again", once the press is no longer queued, unconfirmed or waiting on the
agent. Until then it keeps its label, so its width holds.

### Looks and hosts

**Look**:
One of the four ways the inbox is drawn: `terminal` in the Claude Code
terminal, `desktop` in the pane of the Claude desktop app's Code sessions,
`codex` in the Codex tab, and `omp` in omp's panel. `Look` in `hooks/view.ts`.
_Avoid_: client, surface

**Host**:
The program that runs the inbox code. Claude Code runs the mod, which draws
the terminal and desktop looks. Codex runs the plugin, which draws the Codex
tab. omp runs the extension in `omp/`, which draws the omp panel.

**Shared module**:
A file in `hooks/` that every host consumes, directly or through a build.
It imports only other shared modules and the shared types.

**Adapter**:
The code that draws the shared view in one look: `hooks/register.tsx` for the
terminal and desktop looks, `codex/src/tab.tsx` for the Codex tab,
`omp/src/panel.ts` for the omp panel.

**Difference on purpose**:
A behavior that differs between looks because one look cannot do something,
or because the product decided so. Any other difference is drift.

**Catch-up**:
Rebuilding the ledger from the whole conversation, instead of from one reply's
exchange. `runUpdates` does it when `needsCatchUp` says the ledger may have
missed a turn, and the host can read the conversation.

**Behind**:
The ledger state (`ledgerState: 'behind'`) for a session the inbox has recorded
nothing of, though it already has turns. The next update catches up. Only
`failed` shows a warning.

**Dropped reply**:
An exchange whose update failed twice, so its reply never reached the ledger.
`presence.hasDroppedReply` keeps the "may be missing" warning until a catch-up
covers it. A host that cannot read its conversation has no catch-up, so the
warning stays until a clear.

**Next build**:
A checkout that follows the `next` branch and holds `NEXT_BUILD_MARK`, a file
Git ignores, in each folder a host loads or installs. Each look's version label
adds "next" on one. `hooks/view.ts:versionLabel`.

**Parity record**:
`hooks/clients.ts`. It lists, for each host, whether each feature is `full`,
`different` or `unsupported`, with a reason for the last two. Each such entry
needs a row in "Differences on purpose" in `docs/looks.md`, and
`scripts/check-structure.mjs` fails when one is missing.

The engine has two terms of its own. Its `surface` is where Claude Code runs,
and includes `mobile` and `vscode`; `lookOf` in `hooks/register.tsx` maps it to
a look. Its `Client` is a drawn region that takes clicks over its whole shape,
as in `hooks/row-client.tsx`.
