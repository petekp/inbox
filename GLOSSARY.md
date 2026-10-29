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

**Comparison page**:
The page an agent makes after every Compare press. The agent writes the
comparison as JSON and appends it to a copy of the template
`hooks/compare-page.html`. The page draws the pick first, then the choices with
their measures, then the previews. The agent's reply has no table: it gives the
pick, the reason, anything unexpected and the page's path.

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
becomes a settled row. After Discard, it folds at once.

**Settled row**:
A row drawn in place with its result after the person pressed it or the agent
closed it, such as "Done" or "Closed by Claude: fixed". It stays until the
person sends a message they typed, switches tab or closes the inbox, then
folds into the Closed fold or leaves the list. A message a press sent does not
fold it. Where its press allows Undo, it offers Undo for `SETTLED_MS` after
the close, and stays through a typed message until Undo ends.

**Finding**:
An issue or opportunity the agent noticed outside the current task.
_Avoid_: note

**Finds**:
The tab that lists the findings. Its id is `findings`.
_Avoid_: Findings, as the tab's name. A find, for one finding.

### Surfaces

**Overview**:
The first tab on a next build: what the session's work is for, and where each
part of it stands, from what needs the person to what is finished. A release
build does not draw it. The inbox model updates it after each reply, in a
second call after the one that updates the rows. It is not a list of events.

**Head**:
The top of the Overview: a title of a few words, like a subject's name, for
what the session is focused on now, and one line under it on what the session
is doing about it. The inbox model writes it, and checks it at each update
against the open and finished subjects, so it moves on when the work does,
even across many small exchanges. When the work it names is done and nothing
else is working, it stays.

**Subject**:
One part of the session's work on the Overview, such as a feature, a fix or a
release. It has a name, a status, a few words on where it stands, and the time
it last changed. The statuses are working, queued, waits on others, done and
dropped. The inbox model adds and changes subjects by id, and code keeps their
times. The inbox model also links an open question or task to the subject it
holds up. While that item is open, the subject's mark reads ◆ in place of its
status's mark, and the item's Asks row reads "Holds up" and the subject's name.
The subject's row then offers Answer, which opens Asks with the oldest of those
items selected.
_Avoid_: workstream, stream, item (an item is a question or task)

**Child**:
Work that runs apart from the session's turn: a subagent, a background command
or task, a workflow run, or a Herdr delegate. It shows under its subject while
it runs, and leaves when it ends. A delegate that finished stays, reading
"finished", until the person has seen the Overview. Code follows it from the
host's events and from Herdr. The inbox model only links it to a subject.
_Avoid_: subitem, job

**Stall words**:
The word after an Overview row's name when its work waits on the person or has
finished. A subject held by an open question or task reads "waiting", in the
needs-you tone, and so does a delegate while Herdr shows it at a question or an
approval. A finished delegate reads "finished". A row waiting on someone else
and a row whose work moves show no word. No row shows a time. The code calls
them `stall`.
_Avoid_: age

**Seen line**:
The rule labeled "Last seen" on the Overview, at the time the person last left the
page after it showed for at least five seconds. A shorter pass through the tab
leaves the line where it was. A row above it changed since then. Every open row
shows where it stands, above or below the line. A row below it leaves out its
merged and was lines, and a finished row below it shows only its mark and name. When no row
changed since then, the page draws no line. The code calls it the look line,
after `lastLookAt`.
_Avoid_: "you looked" line

**Band**:
In Claude Code, the line above the prompt with the Asks and Finds
counts and [Open inbox]. When the session stops, a second line says why, with
[Resume] after an API error. Codex has no band. omp has a band with the same
counts and no button, which says `/inbox` opens the panel.

**Banner**:
A tinted, rounded box in the pane about the inbox's own state or the turn's
stop, such as "Last update failed." or "Could not read the inbox.". Its first
sentence is its lead, drawn in bold. Its tone says what it means: error, the
inbox cannot do its job until something changes; warning, part of it is
missing or out of date; notice, a fact. A row's own result is not a banner.
`BannerView` in `hooks/view.ts`.
_Avoid_: alert, error strip, status line

**Person's line**:
The line the conversation shows under the agent's `record` or `close` call,
written for the person, such as "Question: Which cache should the API use?". A
call that changed nothing shows none. The agent reads its own answer to the
call, which Codex shows in place of the line. `personLine` in
`hooks/tools.ts:ToolAnswer`.

**Pane**:
The `/inbox` panel beside the conversation in Claude Code, with its Asks,
Finds and PRs tabs, and an Overview tab before them on a next build. Codex shows the same tabs in its Inbox tab. omp
shows them in an overlay that `/inbox` opens.

**Tab symbol**:
The emoji a tab shows in place of its words when the words don't fit,
followed by its count, as "🔍 4". `symbol` in `TAB_NAMES` in `hooks/view.ts`.

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
adds "next" on one, and only a next build draws the Overview tab.
`hooks/view.ts:versionLabel`, `hooks/view.ts:shownTabs`.

**Parity record**:
`hooks/clients.ts`. It lists, for each host, whether each feature is `full`,
`different` or `unsupported`, with a reason for the last two. Each such entry
needs a row in "Differences on purpose" in `docs/looks.md`, and
`scripts/check-structure.mjs` fails when one is missing.

The engine has two terms of its own. Its `surface` is where Claude Code runs,
and includes `mobile` and `vscode`; `lookOf` in `hooks/register.tsx` maps it to
a look. Its `Client` is a drawn region that takes clicks over its whole shape,
as in `hooks/row-client.tsx`.
