# Looks

Status: current. Read this before you change the UI or a business rule.

The inbox has three looks: `terminal`, `desktop` and `codex`. A look is one way the inbox is drawn, and `GLOSSARY.md` defines it with host, shared module, adapter and difference on purpose. The rule is that shared modules decide and adapters draw. If a rule decides what a row says, which action leads, when a tab counts as empty or what text appears, it lives in a shared module. An adapter decides only how its look draws that. The plan for finishing this split is `docs/plans/three-looks.md`.

## Files

Shared modules are in `hooks/`. Both hosts consume them, directly or through the build. They import only shared modules and shared types. `scripts/check-structure.mjs` checks those boundaries, including type imports. Codex type checking needs no generated Claude engine types.

| File | Role |
| --- | --- |
| `hooks/view.ts` | Shared module. The inbox view: Needs you order and count, handles, row state, feedback, done labels, action order, key plan, timing constants. |
| `hooks/presses.ts` | Shared module. The press reducer, its effects, and the saved last-action shape. |
| `hooks/arrivals.ts` | Shared module. Which rows are new, and where a look moves for them. |
| `hooks/ledger.ts` | Shared module. Saved ledger, upgrades, reply parsing and ledger writes. |
| `hooks/model-text.ts` | Shared module. Guidance, prompts, inbox notes, question numbers and the `Host` and `Told` types. |
| `hooks/text.ts` | Shared module. Clipping, code-block formatting and relative ages. |
| `hooks/claude.ts` | Mod only. Claude transcript, command, dialog, stop and sidebar helpers. |
| `hooks/prs.ts` | Shared module. PR parsing, readiness and prompts. |
| `hooks/pr-tab.ts` | Shared module. The PRs tab's rules: fetching each tracked PR through a host's gh runner, which PRs the tab draws, its row ids, and what each PR press does. |
| `hooks/tools.ts` | Shared module. The record and close tools. |
| `hooks/demo.ts` | Shared module. Sample data for `/inbox demo` and the Codex demo. |
| `hooks/layout.ts` | Shared module. Sizes the desktop look and the Codex tab share. |
| `hooks/tones.ts` | Shared module. Status colors for native marks and terminal palettes. The Codex build writes them into CSS. |
| `hooks/inline.ts` | Shared module. Inline markdown in the agent's text, as spans each look draws. |
| `hooks/register.tsx` | Mod adapter. Draws the terminal and desktop looks, and also runs the band, the PRs tab, the per-reply update and the press runner. |
| `hooks/tabs-client.tsx` | Mod only. A Client region for the desktop tab bar, so each tab takes clicks over its whole shape. |
| `hooks/row-client.tsx` | Mod only. A Client region for a closed row in the desktop pane. |
| `hooks/fold-client.tsx` | Mod only. A Client region for the desktop "N Closed" line. |
| `hooks/links-client.tsx` | Mod only. A Client region for an open row's follow-ups on desktop. |
| `hooks/undo-client.tsx` | Mod only. A Client region for Undo on desktop, whose fill drains while Undo lasts. |
| `codex/src/tab.tsx` | Codex adapter. Draws the tab and runs page code: polling, selection, keys and clipboard. |
| `codex/src/row-actions.tsx` | Codex adapter. Maps shared actions to buttons and draws reply fields. Its production components have mounted tests. |
| `codex/src/tab.html` | Codex adapter. The tab's styles and page shell. |
| `codex/src/rows.ts` | Codex adapter. The motion state machine for rows. |
| `codex/src/arrivals.ts` | Codex adapter. The tab's rows, tabs and empty-tab rule, built on `hooks/arrivals.ts`. |
| `codex/src/settle.ts` | Codex adapter. Polling and settle-window timing for the tab. |
| `codex/src/texts.ts` | Codex adapter. Texts only Codex reads, and the `CODEX` host. |
| `codex/src/core.ts` | Codex host. Session logic as pure functions on the session state. |
| `codex/src/state.ts` | Codex host. One JSON state file per session, under a lock. |
| `codex/src/server.ts` | Codex host. The MCP server: tools, presses, open, queue, and the background fetch of the session's PRs. |
| `codex/src/gh.ts` | Codex host. Finds a gh the server can start, and runs it for the shared PR fetch. |
| `codex/src/server-main.ts` | Codex host. The loader that Codex starts once per app launch. |
| `codex/src/server-handler.ts` | Codex host. The request handler the loader reloads. |
| `codex/src/update.ts` | Codex host. The per-reply update through `codex exec`. |
| `codex/src/update-main.ts` | Codex host. Entry point for the update process. |
| `codex/src/hook.ts` | Codex host. The hook logic that changes session state. |
| `codex/src/hook-main.ts` | Codex host. Entry point for the hooks. |
| `codex/src/demo.ts` | Codex host. Turns the shared demo data into a session. |
| `codex/src/transcript.ts` | Codex host. Reads the Codex session transcript. |
| `codex/src/run.ts` | Codex host. Runs a command with Node. |

## Who owns each rule

Change a rule in its owner. Do not change it in a reader.

| Rule | Owner | Read by |
| --- | --- | --- |
| Needs you order and count | `hooks/view.ts:needsYouOrder`, `hooks/view.ts:inboxView` | All three looks, the band and the status line |
| Question handles | `hooks/model-text.ts:questionNumbers`, read by `hooks/view.ts:inboxView` | The terminal look only. It draws `1)` or `•`. Desktop and Codex draw no handle on a question. |
| Finding groups and handles | `hooks/view.ts:FINDING_GROUPS`, `hooks/view.ts:drawnLists` | All three looks. Each lists findings under an Issues and an Opportunities title and draws the kind's mark as the handle. A handed-off finding draws ✓ instead. |
| Row state | `hooks/view.ts:RowState`, `hooks/presses.ts:isHandedOff` | All three looks |
| Which row opens: by default, when rows arrive above it, and after a press closes the open row | `hooks/view.ts:firstWaiting`, `hooks/view.ts:keptOpen`, `hooks/view.ts:rowAfterClose` | All three looks |
| Held rows: which closed rows stay in place while the person replies, what their reply sends, and which closed records a prune keeps | `hooks/view.ts:heldReplies`, `hooks/view.ts:inboxView`, `hooks/view.ts:fieldExit`, `hooks/presses.ts:applyPress`, `hooks/ledger.ts:pruneClosed` | All three looks. The mod passes its open field, drafts and discarded replies, and prunes in `hooks/register.tsx:commitLedger`. The Codex tab sends its replies and discarded replies with each view and press. The Codex server saves those replies' rows as `heldRows`, and `codex/src/state.ts:updateState` keeps their closed records when it prunes each write. Each view or press replaces `heldRows`, since Codex shows one tab per thread, as `tabSeenAt` also assumes. |
| Feedback text | `hooks/view.ts:feedbackText`, `hooks/view.ts:feedbackOf` | Terminal and desktop through the pane, Codex through the tab |
| Done labels | `hooks/view.ts:DONE_LABELS` | All three looks |
| Row content and reply intent | `hooks/view.ts:RowView`, `hooks/view.ts:rowMark`, `hooks/view.ts:replyHint`, `hooks/view.ts:rowFeedbackText` | All three looks |
| Action order, emphasis and icon kind | `hooks/view.ts:ActionView`, `hooks/view.ts:actionsOf`, `hooks/view.ts:rowKeyPlan` | All three looks |
| Shared labels and fold counts | `hooks/view.ts:ROW_COPY`, `hooks/view.ts:actionLabel`, `hooks/view.ts:foldLabel`, `hooks/view.ts:earlierLabel`, `hooks/view.ts:groupEmptyText`, `hooks/view.ts:DEMO_NOTICE` | All three looks |
| Key plan | `hooks/view.ts:rowKeyPlan` | All three looks take the order. Terminal draws the key letters. Desktop and Codex draw labels only, and Codex still binds the letters. |
| Press reducer and effects | `hooks/presses.ts:applyPress`, `hooks/presses.ts:runLocalEffects`, `hooks/presses.ts:runSends` | The mod and the Codex server |
| Settle window | `hooks/view.ts:SETTLED_MS`, `hooks/view.ts:settleWindowMs` | The mod passes `SETTLED_MS`. Codex passes `codex/src/settle.ts:SETTLE_WINDOW_MS`. |
| Closed fold size | `hooks/view.ts:CLOSED_SHOWN`, `hooks/view.ts:closedShown` | All three looks |
| Options fold size | `hooks/view.ts:OPTIONS_FOLD_AT` | All three looks through `actionsOf` |
| New rows, empty tabs and where a look moves | `hooks/arrivals.ts:recordRows`, `hooks/arrivals.ts:isTabEmpty`, `hooks/arrivals.ts:followTo` | The pane and the Codex tab |
| Press guard | `hooks/view.ts:PRESS_GUARD_MS` | All three looks |
| Row padding | `hooks/layout.ts:ROW_PAD_PT` | Desktop and Codex |
| Map tab: sections, order, text, marks, tones, ages, emptiness, "Working…" and subagent rows | `hooks/view.ts:mapView`, `hooks/view.ts:subagentStep` | All three looks. Each host sets `isTurnRunning` in its presence: the mod from the main agent's `turn.start` to its `turn.complete`, Codex from a main-agent `UserPromptSubmit` to `Stop` or `Interrupt`. Each host keeps the main agent's `progress` text beside that flag and clears it with the flag. The `progress` tool's texts are in `hooks/tools.ts`. Each host adds `progressRule` to the start of each subagent the main agent starts: the mod to the `agent.spawn` prompt, Codex as SubagentStart context. The Map is a page, not a list: `ShownTab` in `types/index.d.ts` adds `map` to the list tabs, `isListTab` tells them apart, and a Map change never moves a look or counts as an arrival. |
| Milestones: who writes and removes them, the cap, and `card.done` | `hooks/ledger.ts:addMilestone`, `hooks/ledger.ts:removeMilestone`, `hooks/ledger.ts:doneTexts` | Both hosts. A done milestone comes from the inbox model's DONE lines (a PR the session opens is one of them), an answered one from `closeItem` and the CLOSED line, a fixed one from the FIXED line. `Card.done` stays in saved state as the newest 4 done texts, because older versions read it. |
| Demo data | `hooks/demo.ts:demoView` | The mod's `/inbox demo` and `codex/src/demo.ts:demoState` |
| Model-read texts | `hooks/model-text.ts:guidanceText`, `hooks/model-text.ts:systemText`, `hooks/model-text.ts:inboxText`, `hooks/model-text.ts:promptNotes`, `hooks/tools.ts:recordDescription` | The mod and Codex, each through its `Host` |
| Saved state shapes and upgrades | `types/index.d.ts:PluginState`, `hooks/ledger.ts:upgradeLedger`, `hooks/presses.ts:upgradeLastActions` | The mod also uses `hooks/register.tsx:upgradeState`. Codex uses `codex/src/state.ts:upgraded`, which gives a state saved without `heldRows` an empty list. |
| PR readiness and prompts | `hooks/prs.ts:readiness`, `hooks/prs.ts:prompts` | The mod and the Codex tab |
| Tracked-PR help steps | `hooks/pr-tab.ts:itemPrSteps` | Both hosts, in views and press validation |
| Exchange application and activity | `hooks/ledger.ts:applyExchangeUpdate`, `hooks/model-text.ts:addActivity` | Both hosts; retry scheduling remains with the host |
| Codex worker activity | `codex/src/update.ts:reconcileUpdateStatus`, `codex/src/core.ts:endTurn` | The Codex server checks ownership before clearing abandoned activity. Pending exchanges alone do not imply an active worker. |
| Claude Done notifications | `hooks/register.tsx:wakeForDone`, `hooks/register.tsx:recordDoneRefusal`, `hooks/presses.ts:refuseDoneNotification` | Persist the notification identity before submission. An explicit refusal keeps the task Done, records the reason and restores Undo. Session switches preserve the result in its original session. Refused attempts are not sent again automatically. |
| Codex Done notifications | `codex/src/server.ts:wakeForDone`, shared delivery reducers in `hooks/presses.ts` | Checkpoint each batch before queue submission. Unknown outcomes remain unconfirmed in settled rows and Closed folds, without an automatic resend. |
| Undo result | `hooks/presses.ts:applyPress`, `hooks/pr-tab.ts:applyPrPress` | Both hosts clear their closed-note acknowledgement when the result names an actual reopen |
| Arrival acknowledgement | `hooks/presses.ts:withArrival` | Both hosts; one bulk press can affect several rows |
| PR presses, which PRs the tab draws, and how a PR is fetched | `hooks/pr-tab.ts:applyPrPress`, `hooks/pr-tab.ts:drawnPrs`, `hooks/pr-tab.ts:fetchTracked` | The mod and the Codex server |
| Missing-gh notice text | `hooks/pr-tab.ts:GH_MISSING_TEXT` | All three looks. The mod sets `PrViews.isGhMissing` when `gh --version` cannot start after a failed fetch. The Codex server sets its own flag from `codex/src/gh.ts:ghFinder`, and looks for gh again after a fetch where a gh run ended with code -1. |
| PR button order, labels, emphasis and icon kind | `hooks/pr-tab.ts:threadActions`, `hooks/pr-tab.ts:checkActions`, `hooks/pr-tab.ts:prBlockActions` | All three looks |

Some content and host bookkeeping still have two copies. These are remaining work in `docs/plans/three-looks.md`.

| Rule | Where it is written | Remaining work |
| --- | --- | --- |
| PR block and row composition | `hooks/register.tsx` and `codex/src/tab.tsx` | Both use shared PR rules and button plans, but compose their own content. |
| Host notices and some closed-row composition | `hooks/register.tsx` and `codex/src/tab.tsx` | Share identical decisions while keeping native fitting and decoration local. |
| Local effects and demo presses | `hooks/register.tsx:openPath`, `hooks/register.tsx:runDemoPress`, `codex/src/server.ts:makeServer` | Shared effect descriptions still have host execution and demo wiring. |

A `deliveryId` identifies one local press. Each host keeps a sent-prompt record
before an arrival can change its rows. Arrival events provide message text but
no matching delivery ID, so they consume the oldest matching record. Queued feedback appears only after the message has waited one second.
Unconfirmed feedback has no delay. A newer
identical press reads “Delivery unconfirmed” until a later arrival can confirm
its record. Open rows, settled rows and Closed folds preserve that status
without a success mark.

The mod keeps sent-prompt records in its live plugin state across reloads.
Older state can lack the history needed to distinguish identical messages;
those message texts remain unconfirmed in that session. Unmatched records are
retained because discarding one could make its late arrival acknowledge a newer
press. Exact reconciliation and bounded retention need host queue identity or
queue status that the current arrival APIs do not provide.

## Differences on purpose

A difference is on purpose when a look cannot do something or the product decided it. Anything not listed here is drift.

| Topic | Terminal | Desktop | Codex | Why | Where |
| --- | --- | --- | --- | --- | --- |
| Keys | Button hotkeys work. The key letter is drawn before the label. | Clicks only. Button hotkeys do nothing, and no letter is drawn. | A page `keydown` handler takes the letters. No key text is drawn. | The desktop pane takes no key input. A browser page can, but keys are an extra there. | `hooks/register.tsx:keyedButton`, `codex/src/tab.tsx:KeyButton` |
| Hit areas | Character cells. | A Button takes a click only over its label. A Client region takes clicks over a whole shape. | Normal page hit areas. | The engine draws desktop Buttons label-sized. | `hooks/row-client.tsx:RowProps`, `hooks/tabs-client.tsx:TabsProps` |
| Motion and bars | Undo's fill drains by cells until the row leaves. A just-closed row without Undo shows a bar that shrinks by half cells. New rows have no bar. No animation. | Undo's fill drains while it lasts. No leave bar and no animation. New rows have no bar. | Rows enter, move and exit. New rows have no bar. | The pane has no opacity, transform or CSS. | `hooks/register.tsx:leaveBar`, `hooks/undo-client.tsx`, `codex/src/rows.ts:stepRow` |
| Scroll after a close with Undo | Inline panes reveal Undo beside the next selected row. If both do not fit, Undo takes priority until it expires. Manual scrolling cancels the expiry reveal. Selecting another row redirects it to that row. Docked panes retain their normal scroll. | Reveals the selected row with the least scrolling. | Reveals the selected row with the least scrolling, then checks again after its animation. | An inline terminal pane has a short window and a time-limited recovery action. | `hooks/register.tsx:openAfterClose`, `codex/src/tab.tsx:revealSelected` |
| Redraw and polling | Redraws in steps while a row leaves. | Redraws once when a row leaves. A timer redraw loop made clicks fail. | The tab polls the server every 3 seconds. | Only the mod gets pushed events. | `hooks/register.tsx:redrawWhileLeaving`, `codex/src/settle.ts:POLL_MS` |
| Hot reload | Mod handlers reload. | Same as terminal. | The handler reloads. The tab stages a candidate before replacing its root, style and script. Failed startup keeps the working page; successful replacement waits for active presses. The loader needs Codex restarted. | Each instance owns its timers, listeners and animations. Staging preserves the working UI and host state until the candidate can take over. | `codex/src/server-main.ts:load`, `codex/src/server-handler.ts:createHandler`, `codex/src/tab.tsx:swapPage`, `codex/src/tab.tsx:dispose` |
| Storage | Engine atoms hold the live session. The engine store keeps a saved ledger per session. | Same as terminal. | One JSON file per session, under a lock. | Codex has no engine store. Its hooks run as separate short-lived processes beside the server. | `hooks/register.tsx:save`, `codex/src/state.ts:withLock` |
| How a press sends, opens and copies | Sends with the engine's prompt submit. Opens and copies in process. | Same as terminal. | Sends with `codex queue` from the server. Opens in the server. The tab copies. | Codex's server cannot reach the page's clipboard. | `hooks/presses.ts:EffectHost`, `codex/src/server.ts:makeServer` |
| Band, stop and dialog rows | Yes. | Yes. | No. | Codex has no line above its prompt. | `hooks/view.ts:TABS`, `hooks/view.ts:ROW_TABS` |
| PR data | The mod runs gh through the engine, on a timer while the person is around. | Same as terminal. | The server runs gh through `deps.exec` in the session's folder, and refetches on a view when the last fetch is over 2 minutes old. It tries `gh`, then the Homebrew folders. | The ChatGPT app may start the Codex server without Homebrew on its PATH. A Claude Code session, in the terminal or the Claude app, gets the login shell's PATH. | `hooks/register.tsx:fetchPrsNow`, `codex/src/server.ts:fetchPrs`, `codex/src/gh.ts:ghFinder` |
| Settle window | A row stays in place for `SETTLED_MS` from the close. | Same as terminal. | The server lists a row as settled for `SETTLED_MS` plus two polls from the close. The tab draws it in place for `SETTLED_MS` from the first poll that lists it. | The tab only learns of a close at its next poll. | `codex/src/settle.ts:SETTLE_WINDOW_MS`, `codex/src/settle.ts:drawnSettled` |
| Failed per-reply update | Shows failure after work stops, advances applied turns and catches up after the next message. | Same as terminal. | Retains the first failed exchange for the next Stop. An active retry shows Updating. A second failure drops the exchange. | Both hosts end hand-offs after a reply. Their recovery events and retry schedules differ. | `hooks/register.tsx:queueUpdate`, `codex/src/update.ts:runUpdates`, `codex/src/core.ts:endTurn` |
| Tab bar fit | Four tabs must stay on one row. The inline tab gap shrinks from 3 columns to 2 or 1. The docked framed tabs keep their full padding and gap while the row fits. Narrower, the padding shrinks, then the gap, then the right margin, then the padding and gap go. | Tab padding and gaps shrink, then counts drop, then only the shown tab keeps its rounded frame. A frame insets its label about 13 pt on each side, so four framed tabs do not fit the narrowest pane. | Tabs keep their size. | The panes have fixed columns. The page does not. | `hooks/register.tsx:FRAMED_TAB_LAYOUTS`, `hooks/register.tsx:desktopTabSizes` |
| Subagent rows on the Map | A row's task is the Agent call's description. A step from a command is the command's own description. Only the main agent's own subagents get rows. Rows that go unlisted by Claude Code's agent list leave at the next main turn. | Same as terminal. | A row's task is the spawn call's task name, as "Find export code". A step from a command is the command line. A running row whose SubagentStop never comes stays until the session starts again. | Codex hands a subagent its task encrypted, its command calls carry no description, and it has no agent list to check against. | `hooks/register.tsx:pruneSubagents`, `codex/src/core.ts:noteSpawn`, `hooks/view.ts:subagentStep` |
| Screen text on the Map tab | The inbox model reads that the person sees the Map tab: the goal, where the session stands and its results. | Same as terminal. | The inbox model reads only whether the Inbox tab is open. | The Codex server does not learn which tab the page shows. | `hooks/model-text.ts:screenText`, `codex/src/core.ts:endTurn` |
| Primary buttons | None. A plain terminal Button ignores `variant`. The recommended option ends "(recommended)". | The recommended option, Done, Fix or Do it. On the PRs tab, Address, Fix, or a PR's first move. | Same as desktop. | `docs/plans/inbox-ui.md` says the desktop pane makes the recommended option, or else Done, Fix or Do it, the primary button. | `hooks/register.tsx:keyedButton`, `codex/src/tab.tsx:KeyButton` |
| Reply control | A labeled action with its key. | A follow-up in a Client region. | A normal button. | Desktop native Buttons fill and pad only their labels. The Client keeps the follow-up's hit area and spacing with the other links. The shared action keeps normal emphasis and its place in the order. | `hooks/links-client.tsx:LinksProps`, `codex/src/row-actions.tsx:ActionButton` |
| Reply focus | The reply field receives typing. | On desktop 2.42304.0 with engine 2.1.299, the first Reply click leaves typing in the chat composer even when it is empty. Clicking the field enables typing and preserves the composer draft. | The reply field receives typing after Reply. Built-page and native MCP-panel checks pass. | The desktop host reports successful `ui.focus` without transferring typing to its Input. See the verified limits in `docs/reference/claude-desktop-app.md`. | `hooks/register.tsx:focusField`, `codex/src/tab.tsx:draw` |
| Finding path display | The file name, in Claude Code's inline-code color. | Same as terminal. The pane has no font props. | The file name in the mono font, on a soft chip. The full path shows on hover. | The full path is long and shows a private folder. | `hooks/register.tsx:findingRow`, `codex/src/tab.tsx:findingRow` |
| Clipping | Inline bodies fit parsed display spans to a line budget. They retain their planned breaks, inline styles, link addresses and explicit newlines. | The adapter clips with a measured characters-per-cell estimate. | CSS wraps and truncates. | Shared text is never pre-shortened. Each adapter fits content to its own drawing. | `hooks/register.tsx:terminalTextLines`, `hooks/register.tsx:rowClientProps`, `hooks/register.tsx:DESKTOP_CLIP_CHARS_PER_CELL` |
| Long button labels | The host's Button draws a label on one line and cuts it with an ellipsis when it does not fit. | Same as terminal, inside the pill. | The label wraps inside the button, which becomes a rounded rectangle. | Terminal and desktop Buttons are drawn by the host on one line. The Codex tab can wrap, so the whole answer stays readable. | `hooks/register.tsx:keyedButton`, `codex/src/row-actions.tsx:ActionButton` |
| Row age | Side column. | A reserved side column keeps the age at narrow widths too. | Side column, at least as wide as "Sending…", which shows there while a press is out. | Each native drawing fits the same age in its own row. Codex reserves the width so a press does not wrap the title. | `hooks/register.tsx:rowClientProps`, `hooks/register.tsx:sideAge` |
| Row feedback while collapsed | Stays on the title line, after the title. | Same as terminal. | Feedback that has an age moves to the side column, before the age, cut at 11em. The full text shows when the row opens. | A collapsed Codex row stays one line, so the list scans fast. | `hooks/register.tsx:pressedAge`, `hooks/register.tsx:listRow`, `codex/src/tab.tsx:ListRow`, `codex/src/tab.html:.side-label` |
| Colors | Host palette with shared status tones. | Native theme keys and shared SVG status tones. | Host style variables and shared status tones in CSS. | Each look uses its host's theme and drawing primitives. | `hooks/register.tsx:paletteFor`, `hooks/tones.ts:toneColors`, `codex/src/tab.tsx:applyHost` |
| `/inbox` at startup | Registers before the first prompt. | The first `/inbox demo` opens the sample pane without an agent turn. The host can still show a stale unknown-command warning. | No command. The Inbox tab opens at any time. | Registration runs during `session.start`; a command waits for Inbox initialization. The remaining warning belongs to the desktop host. | `hooks/register.tsx:registerInboxCommand`, `hooks/register.tsx:ensureOn` |
| `/inbox` during a turn | Runs at once. | Waits until the turn ends. | No command. The Inbox tab opens at any time. | The command is registered `immediate`. The desktop app sends a typed command through Claude Code's prompt queue, which holds it until the turn ends whatever `immediate` says, as checked in Claude Code 2.1.296. | `hooks/register.tsx:registerInboxCommand` |
| Tab placement | Inline when the pane body is at least 80 columns wide, a column at the pane's left beside the rows. Docked or narrower, a row above them. | A row above the rows. | A row above the rows. | Inline, a row of tabs lines up with the group titles under it and reads as one more title. Docked tabs have their own fill and line. A pane body narrower than 80 columns leaves the rows too little room beside a tab column. | `hooks/register.tsx:INLINE_RAIL_AT` |
| Tab counts | Always drawn. Tabs that don't fit wrap to a second line. | Dropped when the tabs with counts don't fit on one line, below about 38 columns. | Always drawn. | The desktop tabs are one Client region of fixed height, so they cannot wrap. | `hooks/register.tsx:desktopTabSizes` |
| Demo for a recording | `/inbox demo recording` shows the demo without its notice line, its "Demo:" prefix, Hide demo and its sample notes. | Same as terminal. | A build made with `INBOX_DEMO_RECORDING=1` shows Show demo, and its demo leaves out the notice line and the sample notes. | Codex has no command, and its demo is reachable only from Show demo, which a release build leaves out. | `hooks/register.tsx:setDemo`, `codex/build.mjs:isDemoRecording` |
| Look for mobile and VS Code | Used. | Not used. | Not used. | The engine's `surface` can be `mobile` or `vscode`, which nobody has checked. They get the terminal look. | `hooks/register.tsx:lookOf` |

A refused Done notification stays visible in its task's Closed entry as
"Done · Not sent: …", with Undo. The shared view decides whether recovery is
available. Terminal and Codex use buttons; desktop reuses its Undo Client
without a countdown so the first click reaches the action. The optional
`Closed.doneNotification` field records the attempt ID and refusal reason.
Both hosts' existing ledger upgrades preserve it; old records need no default.

Finding details preserve explicit newlines in all three looks. The Codex
adapter uses `pre-line` whitespace for the detail paragraph; its ordinary
spacing and inline formatting stay intact.

## After you change X, check Y

State in your change, for each look, whether it applies and what you checked.

| Change | Edit | Then check |
| --- | --- | --- |
| A row action | `hooks/view.ts:actionsOf`, `hooks/presses.ts:applyPress`, and `hooks/view.ts:DONE_LABELS` for its label | The action appears in terminal, desktop and the Codex tab. Check Undo, failure and key letters. Add the case to `tests/hooks.test.ts` and `codex/tests/press.spec.ts` when the repo's coverage expects it. |
| A row field | `hooks/view.ts:inboxView` and the `RowView` type, then `itemRow` and `findingRow` in both adapters | Both adapters draw the shared field. Check resting, reply, handed-off, settled and failed forms that use it. |
| A word on screen | The shared string in `hooks/view.ts` or `hooks/presses.ts`, else both adapters | Run the change through the `refine-prose` skill. Check each look for clipping. |
| Model-read text | `hooks/model-text.ts` or `hooks/tools.ts`. The guidance and every `inbox:` text reach both agents. | A/B test it as `AGENTS.md` says, with Sonnet for Claude and with `codex exec` and the model in `codex/src/update.ts:MODEL` for Codex. |
| A saved field | `types/index.d.ts:PluginState`, then `hooks/ledger.ts:upgradeLedger` or `hooks/register.tsx:upgradeState`, and `codex/src/state.ts:upgraded` | Load a state saved by the old build in the mod and in Codex. |
| A size or timing | `hooks/view.ts` constants or `hooks/layout.ts:ROW_PAD_PT` when both looks share it, else the adapter's own constant | Measure in the terminal, desktop and Codex tab. Add a row to Differences on purpose when the values differ. |
| A tab | `hooks/view.ts:TABS` and `hooks/view.ts:ROW_TABS` | The mod pane, the Codex tab, `codex/src/arrivals.ts:TAB_IDS` and the empty text in `hooks/view.ts:emptyText`. |
| A PR feature | `hooks/prs.ts` and `hooks/pr-tab.ts:applyPrPress` | All three looks. Check PR-opening help, bulk arrival and the PRs tab in each, and add the case to `codex/tests/server.spec.ts` when the repo's coverage expects it. |
| Anything in `hooks/` that Codex imports | The shared module | Run `npm --prefix codex run build` to rebuild the Codex bundles. `./scripts/check.sh` fails until you do. |
| `codex/src/server-main.ts` | The loader | Quit and reopen Codex. A change to `codex/src/server-handler.ts` or anything it imports reloads without a restart. |

## Checks

`scripts/check-structure.mjs` parses imports and resolves their targets. It follows local import chains, including type bridges. Shared modules retain their shared-only restriction through those chains, and Codex cannot reach nonshared hooks through another local module. It includes build-shared tones and type imports. Shared modules and Codex reject computed targets. The only exception is a direct `import(url)` in the top-level `codex/src/server-main.ts:load` function. Nested functions do not inherit that exception. That function selects installed or dev handler URLs for hot reload.

The script also checks plan status lines, file references and links. Its owner-symbol check only verifies that a word occurs in the referenced file. It does not establish a definition or semantic freshness.

`codex/tests/structure.spec.ts` checks the command against disposable fixtures. Mounted row-action tests check Codex controls and outcomes. The mod demo test checks terminal and desktop titles and actions, with settled rows and PRs outside that test. Full-page behavior, native painting, clipboard, focus and measured motion still need their own checks.

`./scripts/check.sh` runs formatting, plugin validation, structure, both type checks, both test suites and Codex bundle consistency. Run it after every change. Model evaluations run separately when model-facing text changes.
