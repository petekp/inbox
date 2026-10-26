# Inbox in Claude mode

Status: proposed. Nothing in it is built.

This plan sets what the inbox would show in the desktop app's Claude mode and how the person would act on it. The built looks are in [inbox-ui.md](inbox-ui.md). Its section 2 sets the rows, actions and states that this plan reuses.

The facts behind it are in [docs/reference/](../reference/README.md), checked on 2026-10-08.

## Terms

- **Claude mode**, **Chat**, **Cowork** and **Unified Claude**: the desktop app's chat side. The public docs split it into Chat and Cowork, an agent mode that can run on the person's machine. A changelog says "Unified Claude ... combines Chat and Cowork".
- **MCP App view**: an HTML view an MCP tool names, which the host draws in an iframe.
- **Card** and **full view**: the two layouts of the HTML view. A card sits inline in the transcript. A full view fills the tab or the screen.
- **Item source**: whatever adds and closes items. In the built looks it is the per-turn update. In Claude mode, Claude would record its own items with tools.

## Where Claude mode differs from the built looks

Rows, actions and states follow inbox-ui.md section 2 except in these points:

- **Item source.** Claude records items with the inbox's tools, because nothing else watches a chat. There is no per-turn update, so there is no goal line.
- **Question numbers.** Claude mode has no prompt hook, so its rows have no numbers.
- **Queued sends.** The signal for a send's arrival is in the Presses part of the design section below.
- **Re-entry after a hand-off.** Claude mode has no turns. A row unfolds when Claude's next inbox tool call arrives after the hand-off reached Claude, with the item still open.
- **Undo.** The server records Undo as it records the Mark.
- **Terminal help steps.** The note reads `✓ Copied gh auth login. Run it in Terminal.`
- **Typing.** There is no text field. See the design section.
- **Not hearing from the chat.** Nothing to miss: the card exists only because Claude called the inbox. The `as of` age covers staleness.
- **Item source seam.** Claude-recorded questions and tasks go through the `record` and `close` tools in `hooks/tools.ts`, and write the same ledger through `hooks/ledger.ts`. The UI reads the same rows from either source.
- **Renderers.** One HTML view module would serve Codex and Claude mode, with a host adapter for three things: identity (thread id or chat key), the send route (`codex queue`, `ui/message` or `updateModelContext`), and the layout (tab, card or full view). The view declares `availableDisplayModes`. `scripts/check.sh` would cover the server's bundle.
- **Server checks.** HTML presses carry a server-checked target: the chat key and card sequence.
- **Mod guard.** The mod would gain a guard against the server's tools in Code mode.

## Design

Claude mode is the desktop app's chat side. It runs no hooks and no mods. The inbox reaches it only as a local MCP server with tools and MCP App views. How the server is installed, named, kept out of Code mode and scoped to one chat is in the Mechanism part below.

**Where items come from.** Nothing watches the chat, so Claude records items with the inbox's tools: record a question, record a task, record a finding, close one, and show the inbox. Rows, actions and states otherwise follow inbox-ui.md section 2.

**One list per chat.** The card lists only this chat's items, because a press can only send into the chat it sits in. The app's own session list shows which chat waits. If the inbox loses track of the chat, the card reads `New inbox for this chat`, so the split is visible.

**First thing seen: the inline card.** Claude calls show inbox at the end of a reply that leaves something open, and when the person asks what is waiting. The card follows Claude's inline guidance: a few data points and at most 2 actions.

```
┌───────────────────────────────────────────────┐
│ Asks 2 · Finds 1                 as of 2m ago │
│ Postgres or SQLite for the cache?             │
│ Add STRIPE_KEY to .env                        │
│ Retry loop never backs off                    │
│ [Open inbox]                                  │
└───────────────────────────────────────────────┘
```

- Rows are text, not buttons. The card has one action.
- The person answers the newest question in the composer, because Claude asked it in the reply just above.
- An empty card reads `Nothing needs you.` with no button.

**Older cards.** Each show call mounts a new card, and old ones stay in the transcript. A card draws from its tool result at once. While it is the newest card it polls and stays live. Once a newer card exists, it draws one muted line, `Moved to a newer card below`, with no buttons, and stops polling. A stored chat mounts its cards again when the person scrolls to them. Such a card draws collapsed until its first poll says whether it is still the newest, so it never flashes old counts.

**Full view.** [Open inbox] asks for fullscreen. The composer stays visible below it. The layout matches the Codex tab: Asks and Finds tabs, the same rows, one open row. There is no PRs tab, because a chat has no repo or branch.

If the host does not grant fullscreen, the card stays a summary with no [Open inbox]. Answers, Done and Dismiss then go through the composer, and Claude closes items with its tools. An expanded card with clickable rows would break the inline guidance: at most 2 actions, no drill-ins, no nested scrolling.

**Presses.** What `ui/message` and `updateModelContext` do in Claude is unknown (reference open question 4). The view can read which methods the host declares in its `ui/initialize` result, but not whether Claude treats a `ui/message` as the person's own words. So the send route is fixed per host after live check 2, not chosen per press.

- **If `ui/message` arrives as the person's message:** sends work as in the other looks. The row reads `Queued: Explain` until the host answers the request, then `✓ Explain · just now`. A refusal reads `Not sent: <reason>`.
- **If only `updateModelContext` works:**
  - An answer or Fix reads `Queued for your next message: Postgres`. It counts as a queued send: the question leaves the count.
  - It reads `✓ Postgres` once Claude closes the item or makes its next inbox call.
  - Explain and Discuss are hidden. They only make sense as a message sent now.
- **If neither works:** Claude mode shows items and keeps Done, Dismiss and opens. Answers and talk go through the composer.

Done and Dismiss are Marks, recorded by the server, with Undo. Claude learns of them in its next inbox tool result. There is no Run step in Claude mode, because a chat has no shell.

**Opens and copies.** A link goes through `ui/open-link`, which shows Claude's confirmation dialog; that dialog shows the press. A local file opens through the server, only for paths the inbox itself listed, and the row reads `✓ Opened`. Copy uses `clipboardWrite` where granted, with the notes from inbox-ui.md section 2.3. Otherwise a select-all text box appears on the row with [Close], as in Codex.

**Typing.** No text field. "Reply" becomes **Reply in chat**. It closes the full view so the composer has focus. Claude's guidance puts free text in chat.

**Stale items.** An item answered in the composer stays open until Claude closes it. So every row shows its age, the card shows `as of 2m ago`, and the full view always has the row's own close: Dismiss on a question or finding, Done on a task.

**States.**

| State | Text |
|---|---|
| Empty | `Nothing needs you.` In the full view a muted second line: `Claude adds items here when it records them.` |
| Loading | None. A new card draws from its tool result at once. |
| Server gone, card already mounted | `The inbox server is not running. Restart Claude to bring it back.` Rows stay muted, with no buttons. |
| Lost track of the chat | `New inbox for this chat` |
| Superseded | `Moved to a newer card below` |
| Status | None. `Updating…` never shows. |

**If the view does not render.** The person sees only the tool's text content. It lists the count and each open row on one line.

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| A per-turn update | Claude records items; the card shows "as of" |
| A view beside the chat | The card at the end of replies, plus fullscreen |
| Push updates | The newest card polls while visible |
| `ui/message` as the person, unknown | `updateModelContext` with a queued state, or the composer |
| Fullscreen, unknown | The card stays a summary; the composer does the rest |
| Many live cards | Older cards collapse and take no presses |
| A text field | The composer |
| PRs, stop, goal line, previous session | Left out. Nothing produces them in a chat. |

## The biggest unknown

Two questions are open (reference open question 1):

- Does desktop Code mode render MCP App views?
- Does Claude mode run mod modules? The question is asked of Cowork. If Unified Claude merges Chat and Cowork, it applies to Claude mode as a whole.

**The plan assumes no to both.** That is the conservative reading, not the likelier one for Code mode. The MCP Apps quickstart says Claude Code "doesn't render the UI", but that line is about the CLI. A third-party desktop changelog says the Code tab gained "interactive MCP app widgets", and the Code tab allowlists the MCP App content domain (`docs/reference/mcp-apps.md`).

**The plan holds if Code mode renders MCP Apps.** The mod stays the Code-mode renderer. Its pane stays beside the transcript, gets pushed redraws, and sends presses as the person through `$.prompt.submit`. No MCP App mode stays beside the conversation, and nothing pushes into a view. What changes: the Claude-mode server's card could draw in Code-mode transcripts. The Mechanism part keeps Claude from calling that server there. If a call slips through, its items show in a card rather than only as tool text. The HTML view still serves only Claude mode and Codex.

**If Claude mode runs mod modules:**

- If Chat stays separate, Chat stays as designed above. If Unified Claude merges the two, all of Claude mode follows the points below.
- The mod's hooks could run there, so the per-turn update could fill items.
- Whether that client draws a mod's band or pane is unknown. Reference fact 1 names "the terminal and the Desktop app" with no exception for Cowork, and no source says Cowork draws one. If it draws them, it gets the Code-mode drawing. If not, it keeps the card and full view.
- Presses from the card reach the MCP server process, not the mod. No channel from the server to the mod's `$.prompt.submit` is known, and Cowork may run the engine in a VM apart from a host-side server (`claude-code-vm`). So the queued state stays until such a channel is found.

Row types, action kinds and states are the same under every answer.

**The five-minute check.**

1. Add a small MCP App test server to a project's `.mcp.json`. Open a local Code-mode session in that folder and ask Claude to call its tool. Look for an Allow prompt, a drawn widget, and requests to `*.claudemcpcontent.com` (`docs/reference/mcp-apps.md`).
2. Install a test plugin through Customize, with a hooks module that logs on `session.start` and draws a one-line band. Start a Cowork or Unified Claude session. Look for the log line and the band.

## Decision: when to build Claude mode

Claude mode needs Claude to record its own questions and tasks. That is a second item source.

- (a) Build it now, with record tools that write the same ledger through the one seam.
- (b) Build it after live checks 1 and 2 below.

Recommendation: (b). The terminal, desktop and Codex looks need neither answer. Building the source for one client first would lock the source choice by default. Nothing for Claude mode is built.

## Mechanism

What the design needs underneath.

- *Install route.* Two documented routes reach the chat side, and neither is checked live for this use. A server in `claude_desktop_config.json` reaches Chat; the support article says such servers "aren't available in Cowork or claude.ai". A `.mcpb` extension runs "on your computer in the Claude desktop app"; whether it reaches Cowork or Code-mode sessions is not sourced. Cowork loads a plugin's local MCP server when the session runs on the person's machine, so covering Cowork may need the plugin route instead.
- *Name.* The server is `inbox-chat`, so it never shadows the mod's `mcp__inbox__*` tools.
- *Keeping out of Code mode.* A `claude_desktop_config.json` server also reaches local Code-mode sessions. Without a guard, Claude there sees two sets of inbox tools, and the `inbox-chat` descriptions tell it to call show inbox after most replies.
  - If `tool.describe` fires for these MCP tools, the mod rewrites each `mcp__inbox-chat__*` description to say the tool does not apply in this session. The reference says `tool.describe` fires once per tool when its description is first sent to Claude, but not that it fires for MCP tools; that is a live check.
  - The mod also denies calls to `mcp__inbox-chat__*` through `tool.call`, which fires for MCP calls and which the guard passes untouched (`docs/reference/claude-code-mods.md`). This is the backstop. If the descriptions cannot change, each reply that leaves something open costs one denied call.
  - When the mod is not running in a Code-mode session, for example after a hooks-worker crash, the server's tools work there. The plan assumes Code mode draws no MCP App views. Then items recorded there show only as tool text the person may never open, which makes a second inbox that is close to silent. So the server refuses record calls from a Code-mode session, if live check 4 finds a connect-time field that tells the clients apart. The refusal tells Claude to use the mod's tools. If Code mode does draw MCP Apps, the card shows those items instead.
- *Chat key.* Claude gives the server no conversation id. The server mints a chat key on the first inbox call in a chat and returns it. Every record, close and show call takes that key as a required argument. A call with no key mints a new one, and the card reads `New inbox for this chat`. A call with an unknown key fails with a message that tells Claude to call show inbox without a key. The key works whether one server process serves every chat or each chat gets its own, which is unknown.
- *Card freshness.* The server stamps each show call with a sequence number and its time. Each poll returns whether that card is still the newest. A card whose result is more than 10 s old when it mounts came from a stored chat, so it draws collapsed until that first poll. The 10 s is a starting value, not a measured one. The server rejects presses from a card that is not the newest. Mount order cannot decide this, because stored chats mount views lazily.
- *Queued presses under `updateModelContext`.* The newest card sends one payload holding every queued press on each new press, because each update replaces the last. The server also returns queued presses in every tool result, so Claude sees them on its next inbox call either way.

**Text a model reads, to test before keeping.** Per AGENTS.md, each of these needs sample runs:

- the tool descriptions and the chat-key argument;
- any guidance that names `inbox-chat`;
- the rewritten `inbox-chat` descriptions in Code mode.

**Live checks this plan depends on.**

1. Code mode and MCP Apps; Cowork or Unified Claude and mod modules; and whether that client draws a mod's band or pane.
2. In Claude mode: `ui/message`, `updateModelContext` and fullscreen, and which methods the host declares in `ui/initialize`.
3. Which install route reaches Chat and Cowork, and whether `.mcpb` reaches Code mode.
4. In Code mode: whether `tool.describe` fires for `claude_desktop_config.json` MCP tools, and what each client sends when it connects to an MCP server.
