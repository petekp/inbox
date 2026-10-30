# Inbox UI in three looks

Status: built. It is the UI spec the code follows.

This spec sets what the inbox shows in its three looks and how the person acts on it. The looks are the terminal, the Claude desktop app and the Codex Inbox tab. The terminal and the desktop app are drawn by the mod's `hooks/register.tsx`. The Codex tab is drawn by `codex/src/tab.tsx`. Shared rules live in `hooks/view.ts`, `hooks/presses.ts`, `hooks/pr-tab.ts` and `hooks/layout.ts`. [looks.md](../looks.md) lists which file owns each rule.

Claude mode, an inline card in Claude chat, is a separate proposal and is not built: [claude-mode.md](claude-mode.md).

The facts behind it are in [docs/reference/](../reference/README.md), checked on 2026-10-08.

## Terms

- **Item**: a question the agent asked, or a task only the person can do.
- **Row**: one entry in a list. A row is an item, a finding, a PR, a PR check or a review thread.
- **Need you**: the rows the Asks tab counts. Section 2.1 defines it.
- **Per-turn update**: a model call after each reply that adds and closes items. It adds the items the agent did not record with its `record` tool. The Status call that follows writes the session's headline and status.
- **Headline and status**: the Status call's one-line summary of the session: what it is for, and what the agent is doing now.
- **Mod**: the Claude Code plugin in `hooks/` that draws the band and pane.
- **Band**: the mod's lines above the prompt.
- **Pane**: the mod's `/inbox` view.
- **Surface**: the app that draws a session, `terminal` or `desktop`. The mod reads it from `e.surface` on each draw.
- **Carry text**: the inbox text the mod adds beside a prompt or at the start of the context, so the agent knows the open items and their ids.
- **Guard**: the built-in mod `cc-plugin-sec-default`. On Team or Enterprise sign-ins and managed machines it loads ahead of user mods and limits what they can change.
- **MCP App view**: an HTML view an MCP tool names, which the host draws in an iframe. The Codex Inbox tab is one.
- **Hand-off**: a press that gives the row's work to the agent, so it stops waiting on the person for now.
- **Settled row**: a row that just closed or was handed off, kept in place with a ✓ and its outcome for 5.12 s before it leaves.
- **Leave bar**: the thin line under a settled row that empties over those 5.12 s, so the person sees when the row will move.

## 1. Summary

The mod draws the terminal and desktop looks. One HTML view draws the Codex tab.

**Terminal.** The band leads with the tab counts and has an [Open inbox] button. The pane has keys: a letter on each action, j and k to move, and number keys for tabs.

**Desktop.** The same band and pane, drawn for clicks. Actions are native buttons with no key letters. A tab, a closed row and a Closed fold line each take a click anywhere on them. The shown tab is a rounded raised segment with a bold label. The app's own ✕ closes the pane. Nothing depends on a key.

**Codex.** The Inbox thread tab has the same rows as the pane and three tabs: Asks, Finds and PRs. A send shows `Sending…` while the server accepts it, then the shared delivery feedback in section 2.3. An empty tab tells "the inbox has not heard from this chat's hooks" apart from "nothing needs you". The model's `inbox` tool returns text only, so it does not mount the full tab inline.

Each drawn action is clickable. Keys are an extra where the host supports them. Explain is key-only in terminal and Codex; desktop draws it because its action keys do nothing.

## Parts

- [Rows](inbox-ui/rows.md): Section 2.1 and 2.2: what comes first, and the row types.
- [Actions](inbox-ui/actions.md): Section 2.3 and 2.4: the five kinds of action, and the actions on each row.
- [Replies, states and keys](inbox-ui/replies-states-and-keys.md): Section 2.5 to 2.10: typing a reply, the Status, empty, loading and error states, new rows, keys and the demo.
- [The terminal and desktop looks](inbox-ui/terminal-and-desktop.md): Section 3.1 and 3.2.
- [The Codex tab](inbox-ui/codex-tab.md): Section 3.3.

## 4. Decisions

1. **A finding's Fix and Discuss.** Fix hands the finding off and moves it to its Closed fold with the outcome "Fix" or "Do it". The finding stays open for Claude to close. Discuss is a Talk, so the finding stays open after it, because talking a finding through does not resolve it. A typed reply folds the finding until Claude's reply leaves it open.
2. **A close opens the next waiting row.** The shared navigation skips handed-off rows and uses the nearest waiting row above when none is below. Its action buttons are guarded for 0.4 s, so a second click cannot immediately answer the next row.
3. **The band holds no answer buttons.** An answer sends at once and has no Undo, and the band shows no question body. [Open inbox] opens the pane with the top question open, next to its body and Explain.
4. **Claude mode is a separate proposal.** [claude-mode.md](claude-mode.md) holds its design. The built looks need nothing from it.

## 5. Not built

- A status line `Claude does not see the inbox here: your organization's settings skip its context.` The guard can skip the mod's `prompt.compose` and `prompt.context` hooks, so Claude gets no guidance or carry text. The mod would need to detect that its `prompt.compose` hook has not run by the first `turn.start`, and that needs a live check.
- Answer buttons in the band, as in decision 3.

## 6. Current-build live checks

Component and state tests do not establish native painting or focus. The checks below remain separate acceptance evidence.

On desktop:

- whether `Input` draws and Enter sends;
- whether toasts draw;
- whether `Markdown` draws, which the review thread body uses;
- whether a `Button` honors `dimColor`;
- whether `/inbox` and `/inbox demo` work as typed commands. The known desktop prompt queue waits for a running turn to end, even though the command is registered `immediate`.

In Codex:

- a tab press end to end;
- whether `codex queue` messages show above the composer and can be edited;
- whether `UserPromptSubmit` carries the queued id or `clientUserMessageId`;
- whether Codex hides an app-only tool from the model;
- whether the Inbox tab stays open across threads.
