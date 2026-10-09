# Desktop look: the terminal's essence in the Claude app

## Status after the first probes

- **Rows and the Closed fold stay native Buttons.** The scroll wheel does nothing over a Client (probe 2), so a list of Client rows could not be scrolled. The row Client in component 9 and the fold Client in component 16 are dropped. Closed rows keep today's title Button, which takes clicks on its label only.
- **Native Buttons take clicks on their corners and edges** (probe 16). Single actions meet the whole-shape rule.
- **Focus is fixed in one place** (probe 1, rule 11). The pane tracks the Button a press focused. When a drawing leaves it out, the focus moves to the Button that took its place, else the open row's first action, else the first Button. Every click landed on the first try in a run of 19 presses.
- **The leave bar is gone on desktop** (component 14). While it redrew every 213 ms, clicks on the pane's Buttons did nothing. Desktop now redraws once, when the settled row leaves.
- The rest of this plan is unchanged and still waits on its probes.

## Summary

- **The goal is a pane that reads the same in both apps.** That means the same words, order, color roles, places and states. The chrome can differ. Key letters, tree lines, `─` rules and the 200 ms animations stay in the terminal.
- **The big decision: use a Client only where a control's click area must be bigger than its label.** That covers three things: the tab bar (already built), each closed row, and the "▸ N Closed" fold line. Every single action stays a native Button. Everything else is Box and Text.
  - Reason: your rule is that a control takes a click over its whole drawn shape. A native Button takes clicks on its own chrome; probe 16 checks its corners and edges. A Box takes no clicks. Only a Client can make a whole row clickable.
  - Cost: medium to high. It needs a new row module, a click handler that rebuilds the drawn view, and title clipping moved into the module. Closed rows likely also leave the app's native keyboard focus order and accessibility tree (F7).
  - Condition: the row Client waits on three probes: wheel scrolling over a Client, focus after a click on a row Client, and region sizing. A row's Client leaves the drawing when the row opens, which is the #100874 case, so the focus check runs on a throwaway row Client. If wheel scrolling or focus fails, rows keep today's title Button, which takes clicks on its label only. You then decide whether to accept that.
- **About half the components need no redesign.** They keep today's drawing and need only a probe. The real changes are:
  - tab colors, bold and sizing
  - the row Client
  - the Closed fold Client
  - action groups on two lines
  - Box backgrounds in place of stacked glyphs
  - one pane-wide fix for focus
- **One risk touches almost every component: focus.** A press that removes its own Button probably makes the next click only refocus the pane (#100874). keepPaneFocus is gone. One probe decides one shared fix.

**Terms used below**

- **Look**: which app draws the pane, `terminal` or `desktop`. In code it is `look === 'desktop'`.
- **Client**: an engine element. Its own module draws Box and Text in a region and gets pointer events over every cell of that region. The tab bar (`hooks/tabs-client.tsx`) is one.
- **Native Button**: the app's own button. It has rounded chrome, is sized to its label, is taller than a text line, and takes a click on its chrome. Whether its corners and edges take one is probe 16.
- **Cell**: one layout unit. Desktop text is proportional and fits about 1.1 to 1.4 characters per cell. How tall a cell draws differs inside and outside a Client (rule 6).
- **pal**: the palette the mod picks from Claude Code's `theme` setting. `pal.card`, `pal.raised`, `pal.selection`, `pal.muted`, `pal.tone.*` and `pal.mark.*` are its color roles.
- **#100874**: anthropics/claude-code#100874. If the focused Button is missing from the next drawing, the app takes focus off the pane. The next click then only refocuses it.
- **keepPaneFocus**: a removed workaround. It focused the shown tab's Button before a press redrew. It went away when the tabs moved into the Client, because `$.ui.focus` cannot focus a Client.

## Shared rules

These rules keep the components consistent. Where a component's own design disagreed with them, the component changed. Each such section says so.

### 1. What carries over

- These carry over: words, order, color roles, place and states.
- These do not: key letters, tree glyphs, `─` rules, the tab draw-in animation, the engine's `[-]`, and the Keys footer.

### 2. Which element draws what

| Need | Element | Reason |
|---|---|---|
| A click area bigger than a label (tab, closed row, Closed fold) | Client | It is the only element that takes clicks over a whole drawn region. |
| One action | Native Button, default variant | It takes clicks on its own chrome (probe 16 checks the edges) and has the app's hover and focus. |
| The recommended answer option | Native Button, `variant="primary"`, label ends "(recommended)" | Primary means only "recommended". |
| Text, cards, bars, status | Box and Text | None of them takes a click. |

- Never use `role="dismiss"`. The types say it replaces the word "Dismiss" with a native ✕ at the trailing edge. That is stated, not seen live, and the rule holds either way.
- Never use a Client for a single action.

### 3. Color roles

- **Selection blue (`pal.selection`)**: the open row only, plus the pressed flash on a row Client.
- **Raised gray (`pal.raised`)**: the shown tab, and hover on any Client. Text on raised uses `pal.raisedText` where the palette sets one. The ANSI palettes raise to white or black, so text without it would vanish. On the tab bar, shown and hover then share a color, as they do in the terminal. The shown tab's bold label and its tone line tell them apart (component 4).
- **Card (`pal.card`)**: section cards.
- **Red (`pal.tone.error`)**: stopped or failed. "Stopped", "Not sent", "Could not…", a failing check.
- **Green (`pal.mark.done`, `pal.tone.done`)**: done or handed to Claude.
- **The tab's tone (amber, violet, teal)**: that tab's count and its new-row bar.
- **Muted**: context. Ages, paths, queued presses, notes.
- **Color is only an extra cue.** The ANSI, Auto and custom palettes set no tones. The words must carry every state alone.

### 4. Glyphs

- **These draw on desktop as single inline glyphs, as `desk-probe-seen` shows:** ✓, ✗ (it draws as a thin ✕), ◦, ◇, ·, …. `?` is plain ASCII.
- **These are unverified:** •, ▲, ✦, ▸, ▾. Probe 13 checks them.
- **These do not survive:**
  - stacked glyph columns: the `│ ├─ └─` tree and `▌` bars
  - runs of `─`, which wrap
  - `╴`
- **Replacements:** a bar becomes a Box with `backgroundColor`. `▔` appears only if probe 8 passes.

### 5. Text width

- Desktop text never truncates. `wrap="truncate-end"` still wraps. Any line that must stay one line is clipped in code with `clipLabel`.
- Use two constants:
  - `DESKTOP_CHARS_PER_CELL` (1.25 today) where a wrap does no harm, such as the empty-state line budget.
  - A new, conservative `DESKTOP_CLIP_CHARS_PER_CELL` (about 1.1) where a wrap breaks the shape: tab labels, row titles, the settled row's ask, the fold line.
- Both numbers are inferred, and the captures disagree. Tab labels measured about 1.1. Empty-state text measured about 1.4. No bold text has been measured, and the tabs will size their labels as bold. Probe 7 sets both.
- Where fixed strings decide a fit, as in the status line's placement, count 1 cell per character. That overcounts, so the layout falls back to the safer arrangement too early rather than overflowing.

### 6. Spacing

- Measured in `desk-probe-seen` at 2x, in the hooks tree:
  - A text line repeats every 38 px.
  - A Box padding or gap of 1 draws about 19 px, half a line. The section card's top padding shows it.
  - A blank Text row draws a full line.
- Inside a Client, a cell is a full line. In `desk-ctabs1` the tab panels, `paddingY` 1 around one text line, are 114 px tall: 3 × 38 px. Pointer rows are whole lines too.
  - So the row Client puts no padding inside itself. Spacing between rows stays in the hooks tree.
  - The tabs Client has no `height` prop (`register.tsx:3437`) and still drew 3 rows from its content. That is partial evidence for sizing a row Client by its content. It covers only content that does not wrap; probe 3 checks content that wraps.
- On desktop, space things with Box padding and gaps in the hooks tree, not blank Text rows. Probe 10 checks whether an empty `height={1}` Box draws at 19 px.
- A native Button's chrome is about 48 px tall, about 1.25 text lines (Hide demo and Resolve conflicts again in `desk-probe-seen`). A line holding a Button is button-tall. That is normal on desktop, so accept it.

### 7. Row shape

- **Closed row.** One line, or two for a question. It holds the handle column, the muted `before`, the title, and `after` (the age or the last action). No background at rest. Raised on hover. Selection blue while pressed. The click area spans the full row, the same span the open row's selection fills.
- **Open row.** Selection blue over the full row. The context line sits directly on the bold title. A gap then separates the body, the status lines, the actions and the field.
- **Between rows.** A blank gap Box, with no rule.
- **New-row bar.** A 1-cell bar at the row's left edge in the tab's mark color. On an open row it is an absolute Box at `left={0}`, painted over the row. On a closed row the row Client draws it itself (component 19).

### 8. Action buttons

- On desktop the two action groups always take separate lines.
  - The main group: Try again, the options, All N options, help steps, Done or Address.
  - Then the talk and Dismiss group.
- Each group is a `flexWrap` row with `columnGap 2` and `rowGap 1`. Put `marginTop 2` between the groups, so the gap between groups is clearly bigger than the gap inside one.
- No `·` Text between the groups. A Text among taller native buttons sits at their top edge.
- No key letters. Hotkeys do nothing on desktop.

### 9. Hover and pressed

- Only Clients draw hover: `pal.raised` with `pal.raisedText`.
  - Call `setState` only when hover changes.
  - Count a move as inside only within `surface.columns` by `surface.rows`.
- A row Client draws selection blue the moment the pointer goes down. The press then shows before the round trip through the hooks module.
- Native Buttons keep the app's own hover and press.
- Nothing that takes no click gets a hover.

### 10. Clients in the pane

- **Keys:** `tabs`, `select-<id>`, `fold-<kind>`.
  - A row's Client cannot take `row-<id>`. That key is already the row's outer Box (`register.tsx:3236`), and tests find rows by it. `select-<id>` names what the Client does, selecting the row. It is the terminal's handle Button key for the same job, and desktop draws no such Button.
- **The `ui.message` hook:**
  - It checks `e.requestId === PANE` and the key prefix.
  - It reads a row's id from `e.element`, which the engine writes. It never takes a row id or index from `data`.
  - Data that names a choice, such as the tabs' `tab` or the fold's target state, is checked against a fixed set before use, as the tabs hook checks `TABS` (`register.tsx:2560-2564`).
  - It finds the row in the drawn view through a function shared with `ui.render`.
  - It does nothing if the row is gone. That is the spec's stale-press rule.
- **Posting:** post on a left-button down. The hook ignores a row post that arrives within `PRESS_GUARD_MS` (0.4 s) of a select. The list reflows under the pointer after a row opens, so a quick second click would land on a different row.
- **Fallback:** each Client keeps a path for when `'Client' in elements` is false. That path draws today's Buttons.

### 11. Focus

- **A Button that changes its label keeps its key.** This is verified to keep focus. Use it everywhere it fits:
  - Resume becoming Resuming…
  - Explain becoming Explain again
  - Details becoming Hide details
  - [Retry] during a fetch
  - the unreadable card's Try again while reading
- **A press that removes its own Button probably drops focus.** The verified #100874 rule predicts it. Probe 1 runs every such sequence.
- **If any sequence fails, fix it in one shared place.** Try these in order:
  1. If `$.ui.focus` is honored right after a pointer press, the press path focuses one Button that survives the redraw, chosen once for the pane. Whether it is honored is unknown, and `register.tsx:1067` suggests a click leaves the keys with the prompt. A drawing may hold no Button that survives, such as an empty tab now that the tabs are a Client. There, use option 2.
  2. Otherwise, the pressed key passes to the Button that replaces it. For example, Undo takes Done's key. A `PRESS_GUARD_MS` guard stops a double-click from undoing.
  3. Otherwise, accept the lost click and record it as a known desktop difference.
- **A Client click takes key focus.** The types state it: `onKey` is "reached while a click has given it the focus". It is unverified on desktop. A row's Client leaves the drawing when the row opens, so a row click is the #100874 case. Probe 1 checks it on a throwaway row Client.
- **Two cases are accepted without a fix.** Each costs at most one click after a rare event:
  - the band after a resume clears the stop
  - the unreadable card after Try again succeeds

### 12. Theme

- The palette follows Claude Code's `theme` setting, not the app's light or dark appearance. Probe 6 checks whether they match.
- Auto and custom themes use theme-key colors. Whether desktop paints those is unknown. Several Box backgrounds below depend on it (probe 5).

## Component by component

Each section gives four things:

- **Carries over**: what must match the terminal.
- **Desktop**: what desktop draws.
- **Why**: the reason.
- **Status**: ready, or which probe comes first.

"A#" marks an item on the approval list and "F#" one on the findings list. Both lists come after the components.

### 1. Band count line

- **Carries over:**
  - "Demo:" dim
  - "N need you" amber
  - " · N findings" dim
  - "Nothing needs you" when there are no counts
  - [Hide demo], then [Open inbox] at the right end
  - A zero count drops out.
  - The band falls back to the engine default when there is nothing to show.
- **Desktop:** today's `countLine` (`register.tsx:2590-2605`). Native default Buttons. No Client, no card drawn by the mod, no imitation `[-]`. Accept wrapping, because the words matter more than one line.
- **Why:**
  - Two separate actions are what native buttons are for.
  - The app already draws the band as a card.
  - `─` wraps.
- **Known differences:**
  - If desktop draws no `[-]`, the band cannot be collapsed there.
  - The band and the pane share the key `hide-demo`, so one press ends the demo in both.
- **Status:** probe 17 first. No capture shows today's order: `desk-band1` shows an older one, with [Open inbox] before the counts. Expect no code change.

### 2. Band stop line

- **Carries over:**
  - "Stopped 1m ago: " in red, then the stop text, then the fix
  - [Resume] for an API error only, becoming "Resuming…" under the same key
  - "Not sent: why" after a refused resume
  - The line drops when the band has 1 row, and clears when a turn starts.
- **Desktop:** today's row, with one desktop-only change. When a resume is refused and the band has more than 2 rows, "Not sent: why" moves to its own third row.
- **Why:** in this flex row, any wrapped text pushes [Resume] to the right edge, under [Open inbox]. The refusal is the only state with both a button and a long tail.
- **Changed to fit shared rules:** "Not sent" turns red, matching the pane and row feedback (A1). After a successful resume the band may lose focus. Accept that cost.
- **Status:** the third row is ready. The color waits on A1.

### 3. Demo banner

- **Carries over:**
  - "Showing sample entries. Presses here send nothing." in bold amber
  - then [Hide demo]
  - first in the pane, then a gap before the tabs
- **Desktop:** keep today's `flexWrap` row. [Hide demo] drops under the sentence when the two do not fit, as it does in the terminal at narrow widths.
  - Only if probe 20 shows [Hide demo] dropping at a width where the sentence and the button measure as fitting on one line, wrap the Text in a Box with `flexShrink={1} minWidth={0}`. No `flexGrow`. The row then gets `alignItems="flex-start"` and no `flexWrap`.
- **Why:** captures show the button genuinely does not fit at the captured width, and the terminal drops it there too, so today's drop matches. A drop at a width where both fit would be a desktop layout error, not a design.
- **Cost of the conditional fix:** at narrow widths the sentence then wraps beside the button instead of the button dropping, which differs from the terminal.
- **Status:** probe 20 first. No cost if it passes.

### 4. Tab bar

- **Carries over:**
  - "Needs you", "Findings", "PRs", in that order
  - Counts in the tab's tone, hidden at 0
  - Three-row panels with a 1-cell gap between them
  - Unshown tabs gray. The shown tab raised and bold, marked by a line in its tone, resting on a rule.
  - A click anywhere on a panel switches to it.
- **Desktop:**
  - **Shown tab is `pal.raised`, not `pal.selection`.** Selection blue means the open row. A blue tab reads as a selected item.
  - **The shown label is bold.** `tabs-client.tsx` draws no bold today. Add it in the same change. Today the shown tab differs from a hovered one by its blue. Once both are raised, bold and the tone line are the only cues.
  - **Hover is `pal.raised` with `pal.raisedText`.** `tabs-client.tsx` currently leaves out `raisedText`. Fix that in the same change.
  - **The hit test checks y as well as x.** Only the three tab rows inside a tab's columns count as a hit.
  - **The hooks module keeps the sizing**, as it does today, and passes each width in the props.
    - One width function computes the widths from `bodyColumns`, sizing every label as bold with the clip constant plus 1 slack cell.
    - While the tabs do not fit, it steps down: padding 2, then padding 1, then gap 0, then no counts.
    - Reason: the status placement (component 5) needs the same widths. Whether a surface module can share runtime code with the hooks module is unverified.
  - **Layout:**
    - Narrow pane: `width="100%"` in a parent that stretches.
    - Wide pane: `flexGrow={1}`, with the status at the right of the same row.
  - **Tone line, only if probe 8 passes:** `▔` in `pal.mark[tab]` along the shown tab's top row, inside a `height={1} overflow="hidden"` Box.
  - **Rule, only if probe 8 passes:** drawn in the hooks tree after the tabs Box, not inside the Client.
  - **If the tone line fails:** hover needs a shade between tab gray and raised. Without it, bold alone would separate hover from shown. No palette has such a shade, so it is a new palette field with contrast checks in every theme. That is your decision.
- **Docs:** update `inbox-ui.md:37`, `:368` and `:613`.
- **Status:**
  - Ready now: the hit test and `raisedText` on hover.
  - After probe 8: the shown tab's color and bold label, the tone line and the rule, or the hover shade.
  - After probe 7: the sizing.

### 5. Status line

- **Carries over:**
  - "Updated 3m ago", "Updating…", "Not updated yet", "PRs checked 1m ago", "Refreshing PRs", all dim
  - The error and the tools-refused text in red, and the stale-press note muted
  - Placed at the right end of the tab row, or under the tabs when it does not fit
- **Desktop:**
  - **Placement uses one fixed constant.** It assumes worst-case tabs (two-digit counts) plus "PRs checked just now" counted at 1 cell per character. That comes to about 63 columns.
    - Derive it from the tab bar's width function in the hooks module (component 4), not from separate numbers.
    - The status then never moves when a count, an age or the tab changes.
  - **Extra lines.** The error, the refused text and the note each take a full-width line under the tab row.
  - **Gap under the tabs.** When the status sits under the tabs, add a 1-cell gap above it, so it does not read as the first tab's caption.
  - **Fallback.** Without a Client, placement keeps `DESKTOP_WIDE_AT` (50).
- **Status:** probe 9 first. It is the only evidence that today's 50-column rule misplaces the status.

### 6. Pane stop block

- **Carries over:**
  - "Stopped" in bold red, then " · 1m ago" muted, kept on one line
  - The stop text, then Resume or "Resuming…"
  - "Not sent: why" in red
  - For other stops, the fix
- **Desktop:** today's card, with one change. [Resume] stays drawn under key `resume` while sending, and only its label changes. This replaces the Text swap at `register.tsx:3791-3797`. Add `if (resuming?.is === 'sending') return` at the top of `resume()`. That also stops the band from sending "Continue" twice (A2).
- **Known cost:** if a send succeeds but no turn starts, both buttons read "Resuming…" and do nothing until the person types.
- **Status:** waits on A2.

### 7. Group title and section card

- **Carries over:**
  - "Questions 4" and "Tasks 3": the name bold, the count muted
  - each group on its own card, with one gap between cards
- **Desktop:** keep `groupTitle` and `section`. One change: on desktop, draw `titleGap` as an empty `height={1}` Box, not a Text row. The gap under a title then matches the card's padding. Do the same for `closedGap` only if the capture shows the same imbalance.
- **Known difference:** Auto, custom and ANSI palettes draw no card. In those themes, only the bold title and the gap separate the groups. Probe 5 shows whether that is enough.
- **Status:** probe 10 first.

### 8. Tree guides and row dividers

- **Carries over:**
  - rows hang from their title
  - a PR's status block is not one of its child rows
  - rows are set apart from each other
  - closed items hang one level deeper
- **Desktop today:** the card background, the indent and the blank gap already do all of this except one thing. The PR status block reads as a peer of its child rows.
- **Plan:**
  - Probe 12 compares two rails, both spanning only the child rows:
    - (A) an absolute 1-cell Box in `pal.line` at `left={2}`
    - (B) a zero-width bordered Box
  - Neither rail passes the status block. That departs from the terminal: with no elbows, how far the line runs is the only cue left.
  - The probe also tests a hairline divider and a half-scrolled group, because of the scroll-clip bug anthropics/claude-code#100030.
- **Fallback, with no probe needed:** draw the PR status block at the title's text column, so only the children are indented.
- **Status:** lowest priority, medium cost, probe first.

### 9. Closed row (also PR check and review-thread rows)

- **Carries over:**
  - The handle and its tone: `1)`, `?`, `•`, `◦`, `✗` red, `✓` green
  - The muted `before`, then the title, then `after`
  - No background at rest
  - A question can take two lines.
  - The new-row bar
  - Below 50 columns the age drops.
  - A click opens the row in place.
- **Desktop:** one Client per row. Module `hooks/row-client.tsx`, key `select-<id>` (rule 10), `width="100%"`, no height.
  - **What it draws.** The whole row: the tree indent, a 3-cell handle column, and one Text holding `before` (muted), the title and `after` (in its tone). No padding inside the region, since a Client cell draws a full line (rule 6).
  - **Clipping happens in the module.** room = `floor((columns − inset − 3) × clip constant × maxLines) − before.length − after.length − 1`.
    - Cut at a space and add "…".
    - The title keeps at least 12 characters. If the line still does not fit, cut `after`.
    - Before the first layout, use a `fallbackRoom` computed by the same formula from `bodyColumns`.
  - **Line count.** `maxLines` is 2 for a question and 1 for everything else, because the terminal draws questions on two lines.
  - **States.** Hover and pressed follow rule 9. Clicks follow rule 10.
  - **New-row bar.** The module draws it from an `isNew` prop and the tab's mark color: a 1-cell Box with `backgroundColor` at the region's left edge. A bar painted over the Client from outside would take that cell's clicks off the row for 1.5 s, because the pointer on an absolute Box counts as on its parent, a Box that takes no clicks.
  - **Stated differences from the terminal:**
    - A thread row that overflows wraps under its path.
    - A question's age follows the end of its second line.
  - **Fallback without a Client.** Today's handle Text and title Button, with corrected room math: count `before` in characters, not cells. Keep `buttonFrame`, since the fallback still draws the title as a native Button.
- **Why:**
  - A Box takes no clicks, and a Button covers only its label. A Client is the only way the handle, title and age all take the click.
  - Text also removes the native button's frame from the title math.
- **Changed to fit shared rules:**
  - The PR check and thread rows take this same design and key scheme. The closed-row and PR-row proposals disagreed on keys, region width and how the click is posted. This section settles all three.
  - A pressed flash was added so the press shows at once.
  - The new-row bar moved inside the Client, so every cell of the row takes the click.
- **Cost:**
  - Rows likely leave the app's native focus order and accessibility tree (F7).
  - The new module, the handler and the moved clipping.
- **Status:** blocked on probes 2, 1 (its row Client part) and 3, then probe 4.

### 10. Open row

- **Carries over:**
  - The handle column, then the context line ("▲ Issue 30m ago", "Failing check")
  - The bold title. A question or task adds a muted " · 12m ago". A finding's age stays on its badge line. A check has none.
  - The body, then "Relevant file:" muted and the path as Text
  - The status lines, the actions, and the typing field
- **Desktop:** today's selected branch of `listRow`.
  - No gap between the context line and the title, matching the terminal.
  - Actions follow rule 8.
  - The open thread adds:
    - the "Review thread" meta
    - the Markdown body (probe 13)
    - the fold line and the "Lines changed" note
    - [Try again] when a send failed, then Address, Draft reply, Open, then Discuss, each reading "… again" when it was the last action
  - **Palettes with no selection color.** If probe 5 shows theme keys paint, the existing `view-<id>` Box gets `backgroundColor={pal.key}` on desktop in place of the `▌` Text. If they do not paint, that becomes a palette decision for you.
- **Changed to fit shared rules:**
  - The reason "selection matches the shown tab" is dropped. The shown tab is raised gray now.
  - The `·` between groups and the `alignItems="center"` fix are dropped.
  - The focus fix moved to rule 11.
- **Status:** spacing and actions are ready. The selection bar waits on probe 5. Probe 13 captures confirm the rest.

### 11. Option and action buttons

- **Carries over:**
  - The words and their order, in two groups
  - Exactly one option marked recommended
  - Presses ignored for 0.4 s after a row opens
  - "Explain again" after an Explain press, under the same key
- **Desktop:**
  - Native default Buttons with no key letters.
  - The recommended option is primary, and `shownLabel` adds " (recommended)" in every look. That is the terminal's own mark.
  - Two lines always (rule 8). Stop using `keysWidth` and `buttonFrame` on desktop, and take the split branch at `register.tsx:3281`.
  - Keep `unlessGuarded` as it is. `dimColor` is a best-effort hint (probe 15).
- **Docs:**
  - the comments at `register.tsx:2956-2957` and `:2999-3002`
  - `inbox-ui.md:77` and `:350`
  - Note that the Codex tab still marks the option with primary alone.
- **Test:** the desktop test at `tests/hooks.test.ts:1930-1932` expects the label "Node" with "no words added". Update it to the new label.
- **Status:** ready. Focus follows rule 11.

### 12. Row feedback

- **Carries over:**
  - "✓ label", "Queued: label", "Not sent: reason", the Local notes, "Sample entry: nothing was sent."
  - Green only when the row's own mark is ✓. Queued is muted. Failures are red.
  - How long each kind lasts:
    - A press result ("✓ label", "Queued: label") stays, with its age, until the next press.
    - A note or a Local success clears after 5.12 s.
    - A failure stays until the next press, and "Not sent" puts [Try again] first.
- **Desktop:**
  - **Closed row.** The feedback stays in the age slot, and the row Client clips the whole line. The title gives up room first, down to 12 characters, then the feedback is cut. The place, words and cut match the terminal.
  - **Open row.** The status block stays as it is today.
  - **Copied command.** Ends "Run it in Terminal.", because the desktop composer is not known to accept "!".
- **Changed to fit shared rules:**
  - The proposal to give long feedback its own line is dropped. Those lines vanish after 5.12 s and move the rows under the pointer.
  - The timing rule is corrected: press results do not clear after 5.12 s.
  - The no-Client fallback clips `after` with `clipLabel`.
- **For you to decide (both looks):**
  - A PR block's feedback sits under its buttons, while a row's sits above them.
  - A Local "✓ …" on a row whose mark is ✓ shows two ✓.
- **Status:** ships with the row Client.

### 13. Folded row and Details

- **Carries over:**
  - **Closed:** a green ✓ with the green last action, or ◦ with a muted "· lines changed".
  - **Opened:** the meta, the title, the muted fold line, the note, the status, then [Details].
  - Details brings back the body and the full actions, with Hide details last.
- **Desktop:**
  - A native default Button keyed `fold-details-<id>` whose label changes.
  - No Details on the closed row.
  - **Change 1: clip the fold line in both looks.** Clip the whole "@author: line" string with the clip constant, using 1 character per cell in the terminal. Desktop ignores truncate-end, and one code path gives the same result in both.
  - **Change 2: the fold note is muted in both looks** (A3). It says the thread is still open, so it is context, not "done".
- **Focus:** the toggle moves from the main group to the end of the talk group, and probe 1 covers that move. If focus is lost, keep the toggle on its own line, last, in both states.
- **Docs:** `inbox-ui.md:120` should read "`✓ Address · just now`; opened, it offers [Details]".
- **Status:** the clip is ready. The note color waits on A3. Focus waits on probe 1.

### 14. Settled row and Undo

- **Carries over:**
  - ✓ in the marker column, or a blank marker while queued
  - the ask, muted, on one line
  - the outcome in green with [Undo], or a muted "Queued: …" with no Undo
  - a bar that empties over 5.12 s
  - A dismissed PR settles the same way.
- **Desktop:**
  - **Undo** is a native default Button. Keep today's `undo-…` key by default.
    - Key reuse (A6) happens only if probe 1 shows the next click is lost.
    - If it does, add a `how` field to the settled state, a `PRESS_GUARD_MS` guard on Undo, and write `openedAt` in the same write as the ledger.
  - **The ask** is clipped with the clip constant.
  - **The leave bar** becomes `<Box height={1} width={ceil(halves/2)} backgroundColor={pal.mark.done} />`. The terminal keeps its `─`/`╴` run.
    - If an empty Box paints nothing, put one non-breaking space inside.
    - If the bar looks too heavy, probe an Svg bar, which is unverified on desktop.
- **Why:** reusing the key makes Done and Undo the same control. A double-click on Done would then close and reopen the row.
- **Status:** the ask clip is ready. The bar waits on probe 11. The key waits on probe 1.

### 15. Typed-answer field

- **Carries over:**
  - "Type an answer" and "Type a reply"
  - the placeholders "Your answer" and "Your reply to Claude"
  - the field under the actions, then [Send] [Cancel]
  - Enter sends a non-blank draft.
  - Cancel keeps the draft, and each row keeps its own draft.
- **Desktop:** a native Input with native default Send and Cancel. Send is not primary. `startTyping` logs the `$.ui.focus` result instead of swallowing it.
- **Known defect (A5):** a blank Enter closes the field silently, and a blank Send does nothing. Both should keep the field open and focus it.
- **Fallback if the Input fails:**
  - Set `DESKTOP_TYPING` to false.
  - Questions can still be answered with typed option numbers.
  - "Type a reply" has no desktop substitute.
  - Before ruling out the spec's composer route, probe `$.prompt.fill` once (probe 14).
- **Status:** probe 14 first.

### 16. Closed fold

- **Carries over:**
  - "▸ 3 Closed", and "▾ 3 Closed" when unfolded, muted, last in its section
  - Closed items one level deeper:
    - ◇
    - the ask, muted
    - the outcome bold, or muted when it lapsed
    - " · age", muted
  - Newest first. The fold state is shared by both looks.
- **Desktop:** a Client, `fold-client.tsx`, key `fold-<kind>`, `width="100%"`.
  - It replaces the whole fold row. It does not sit inside `treeRow`, whose spacer would push the arrow to cell 8.
  - The arrow flips at once from local pending state. The post carries the target state computed from the drawn props (`!props.isUnfolded`), not from the pending flip. A second click before the redraw then posts the same target, so a double-click ends unfolded. A 1 s timeout clears a lost post.
  - Hover follows rule 9. At rest the background is `pal.card ?? null`.
  - The closed items stay Box and Text.
- **Why a separate module from the tabs:** the tab bar maps x to one of several tabs. The fold is one target with two states.
- **Status:** after probes 1 and 2. The ▸ and ▾ glyphs are in probe 13.

### 17. PR block

- **Carries over:**
  - The card
  - "#N" bold in the PRs tone, then the bold title
  - The readiness line in its status tone, then the muted facts
  - The actions in spec order, and the last action under them
  - The check and thread rows inside the card
- **Desktop:** keep today's drawing, with one change (A4) in both looks.
  - The failed-refresh state becomes a column: the red "Last refresh failed: reason", then [Retry] under it.
  - While fetching, a muted "Refreshing…" shows under the red line, and [Retry] stays drawn under the same key.
- **Changed to fit shared rules:**
  - The actions follow rule 8.
  - The Undo key decision moved to component 14 and rule 11.
- **Known difference:** the taller native buttons absorb the blank line before them.
- **Status:** waits on A4, then probe 19.

### 18. Empty and unreadable states

- **Carries over:**
  - the exact words
  - a bold title over muted lines, centered
  - a one-line card instead, when closed items or a stop still show
  - "Could not read the inbox." with Try again, and "Reading the inbox…"
- **Desktop:**
  - **Line budget:** `Math.min(46, Math.floor((bodyColumns - 6) * DESKTOP_CHARS_PER_CELL))`. Desktop then breaks the text into the same number of lines as the terminal.
  - **Unreadable card:** keep the one `flexWrap` row, which matches the band stop line. Try again stays drawn under `read-again` while reading (A7).
- **Status:**
  - The budget is ready.
  - The reading state waits on A7.

### 19. New-row bar

- **Carries over:**
  - a solid stripe on the row's left edge, in the tab's mark color
  - full row height, for 1.5 s, with no fade
  - no clicks, and it never replaces the selection background
- **Desktop:**
  - **Closed row:** the row Client draws the bar as a 1-cell Box with `backgroundColor={pal.mark[tab]}` at its left edge, from an `isNew` prop (component 9). The hooks module's redraw after `NEW_ROW_MS` clears the prop.
  - **Open row, and the no-Client fallback:** `<Box position="absolute" top={0} bottom={0} left={0} width={1} backgroundColor={pal.mark[tab]} />` with no Text. Nothing there takes a click, so the overlay costs no click area.
  - The terminal keeps `▌`.
- **Accepted difference:** a full cell is about 7 pt, heavier than the terminal's half cell.
- **Status:** probes 11 and 5. The closed-row bar ships with the row Client.

### 20. Keys footer and hidden hotkeys

- **Desktop:** draw nothing. That is already true at `register.tsx:4044-4051`.
- **Why:** every key has a click path:
  - 1, 2, 3: the tabs
  - j, k: a row
  - row letters: the native buttons
  - ctrl+x tab: a click on the pane
- **Revisit when:** a later engine logs a Button hotkey press on desktop. Then show each key on its own Button, not in a footer.
- **Status:** done.

### Needs your approval

These change the terminal or shared code.

- **A1.** The band's "Not sent: why" changes from dim to red.
- **A2.** The pane's [Resume] keeps its key while sending, plus the `resume()` guard.
- **A3.** The fold note changes to muted.
- **A4.** The PR failed-refresh state becomes a column and shows "Refreshing…", in both looks.
- **A5.** A blank Send or Enter keeps the field open and focuses it.
- **A6.** Undo reuses the pressed key, only if probe 1 fails.
- **A7.** The unreadable card's Try again stays drawn while reading.
- **A8.** The fold-line clip also runs in the terminal. The output is nearly identical.

### Findings, not in this build

- **F3.** The billing fix says "then resume", but billing stops have no button. Proposed wording: "then send a message to resume."
- **F4.** `inbox-ui.md:291` says the whole stop line is red. Only the prefix is.
- **F5.** Check that `/login` exists in a desktop session, and that running it clears a sign-in stop.
- **F6.** `docs/plans/inbox-ui.md:600` and `:691`, and `docs/plans/action-feedback.md:86` and `:95`, cite `withLastAction`, which does not exist in the revamp worktree. The revamp `AGENTS.md` already names `runPress` and `applyPress`.
- **F7.** Screen readers likely cannot reach the Client tabs, or the rows once they are Clients.

## Probes before building

**How to run them, and the gaps in that:**

- Use a desktop Code-mode session with `/inbox demo` and hot reload. Patch the revamp worktree temporarily, then revert.
- **The store risk.** The plugin store is keyed by the mod's name, so patched code writes your real inbox state. Demo presses send nothing.
- **Where `live.sh` doesn't help.** `mods/scripts/live.sh` starts a terminal session, not a desktop one. How to give a desktop session its own `CLAUDE_CONFIG_DIR` is unknown.
- **Failures can't come from the demo.** Demo presses cannot fail. A probe that needs a real failed send or a failed `gh` call needs a real session.
- Capture at about 36 and 69 columns unless a probe says otherwise. Crop with PIL at 2x.

| # | Check | What it decides | How |
|---|---|---|---|
| 1 | Focus after a press | The rule 11 fix, the Undo key, and whether row and fold Clients can ship | Click each, then click once and log whether the press fires:<br>- a title, then an action<br>- Done, then Undo<br>- Dismiss on an item, a finding and a PR, then Undo<br>- [All N options], then an option<br>- Hide demo (with one real finding, so the band survives), then [Open inbox]<br>- a tab, then a Button<br>- Resume<br>- Send, Enter and Cancel<br>- Details, then Hide details<br>Also double-click Done and Undo, and press Enter or Space on a focused Undo.<br>Row Client part, in session 2: on the throwaway row Client from probe 2, click a row, then click one of its actions. The row's Client leaves the drawing when the row opens. Also press a row, hold, then release: the next click must land, and no transcript selection may start. A Client holds the pointer from down to up, and this one is gone before the up. If that fails, post on up instead (rule 10).<br>Demo presses still settle, fold and undo rows on the demo copy (`runDemoPress`, `register.tsx:1885-1889`), so every sequence runs under `/inbox demo`. |
| 2 | Wheel scrolling over a Client | Whether rows and the fold can be Clients at all | Cheap first check: scroll with the pointer over the tab bar while the pane is long. Settling check: a throwaway row Client in the PRs tab. Use both wheel and trackpad. |
| 3 | Row Client sizing | The region width and line-count approach | Log `surface.columns` and `surface.rows` for a one-line task and a wrapping question at 40 and 70 columns. Pass: 1 row and 2 rows, no blank hover line, age never clipped. Also check that each Client row draws a full 38 px line. |
| 4 | Many Clients, scrolled pane, pointer hold | Load and pointer accuracy | Show the largest demo list. Sweep the pointer and log redraws. Scroll, then hover and click. Press a tab, drag into the list and release, then check list Buttons, transcript selection and tab hover. |
| 5 | Theme-key colors | Box bars and the selection bar on Auto, custom and ANSI themes; whether those themes need cards | Set `theme` to Auto, open a row, screenshot. Also check `subtle` and `userMessageBackground`. |
| 6 | Theme against the app's appearance | Whether the colors can disagree with the app | Read `theme`, then switch the app between light and dark. |
| 7 | Text width and tab fit | The two chars-per-cell constants and the tab sizing steps | Show each tab in turn (bold) with demo counts and a two-digit count. Measure label pixels against cells. |
| 8 | Tab tone line and rule | Whether `▔` ships, and with it the shown tab's color | Draw `▔` in clipped Boxes in dark, light and Auto. Pass: thin, at the top edge, no gaps, no wrap. |
| 9 | Status line today | Whether the new constant is needed | Capture 50 to 62 columns with demo counts, before any change. |
| 10 | Spacing | The `titleGap` Box | Measure card padding, the title gap and the gap between cards. Then capture with an empty `height={1}` Box and compare. |
| 11 | Box fills | The new-row bar, leave bar and selection bar | Force `isNew` true for the first row, hot reload, and capture a closed row and an open one. Check it paints, is as tall as the row, and does not run into the next row. Raise `NEW_ROW_MS` to 10 s and watch the bar clear. Capture today's `▌` column as the before image. |
| 12 | Tree rails | The rail or the indent fallback | A throwaway mod with its own name. Rails A and B beside a status block, wrapped children and a selected row. Plus the hairline divider and a half-scrolled group. |
| 13 | Open-row captures | Action layout, Markdown, glyphs | A question with more than 5 options, an open finding, an open thread. Click a Markdown link and log `onLinkPress`. Check • ▲ ✦ ▸ ▾. |
| 14 | Typing | Whether the Type actions stay on desktop | Type fast, paste, type non-ASCII, press Enter. Type then click Send at once. Check that drafts come back. Press Esc twice. Log the `ui.focus` result. Call `$.prompt.fill` once and look at the composer. |
| 15 | Button `dimColor` | Whether the guard shows anything | Draw one dimmed Button next to an undimmed one. |
| 16 | Button edges | Your click-area rule, and with it whether single actions stay native Buttons | Click the corners and edges of a native button and log each press. |
| 17 | Band | Component 1 | Close the pane and click [Open inbox], then repeat while the pane shows PRs. Capture the current demo band in dark and light. Narrowest band. Overflow the band past its rows to look for `[-]`. |
| 18 | Stop path | F5 | Try `/login` in a desktop session with a sign-in stop. |
| 19 | PR refresh failure | Component 17 | Patch one demo PR with `error: 'gh: HTTP 502'`, short and long. Capture today's row, the column, and "Refreshing…". |
| 20 | Demo banner | Component 3 | Capture the banner at about 69 columns. Measure whether the sentence and [Hide demo] would fit on one line. |

## Build order

The probes come first, because probes 1, 2 and 16 decide whether the Client and native-Button plan holds, and probe 8 decides the tab colors. Run `./scripts/check.sh` after every code step. Each step can be tested on its own.

1. **Probe session 1: today's code, with logging patches only, reverted after.** The patches log presses and `onLinkPress` and draw one dimmed Button. Run the probes that can change the plan first: 1 (all but its row Client part), 16, and 2 (the cheap check). Then 5, 6, 9, 13, 15, 17, 18, 20.
2. **Probe session 2: temporary patches, reverted after.** First 2 (the settling check, with a throwaway row Client), probe 1's row Client part on that same Client, and 3. Then 8, 7, 4, 10, 11, 12, 14, 19.
3. **Decisions for you:** whether the row and fold Clients ship (probes 1 and 2), and the tab hover shade if probe 8 failed.
4. **Tabs, desktop only:**
   - the hit test checks y
   - hover text uses `raisedText`
   - the shown tab uses `pal.raised` with a bold label
   - the tone line and rule if probe 8 passed, or the hover shade if you approved one
   - Check: click every tab row and a gap cell.
5. **Band refusal row, desktop only.** "Not sent" moves to its own row. Check: patch a refusal and capture it.
6. **Empty-state line budget.** Check: capture Findings and PRs at 36 and 69 columns.
7. **Action buttons, desktop:**
   - "(recommended)" on the option, with the test update at `tests/hooks.test.ts:1930-1932`
   - two-line groups with no dot
   - no gap between the context line and the title
   - the doc and comment edits
   - Check: rerun probe 13's captures.
8. **The shared focus fix, chosen by probe 1.** Check: rerun probe 1.
9. **Tab sizing in the hooks module's width function**, set by probe 7.
10. **The status-line constant and the gap under the tabs.**
11. **Box fills** for the new-row bar on open rows, the leave bar and the selection bar. Each waits on probes 5 and 11.
12. **`titleGap` as an empty Box**, and the settled ask clip.
13. **The row Client**, if step 3 approved it:
    - the module, the handler, clipping in the module, the new-row bar in the module, the corrected fallback
    - check and thread rows included
    - row feedback clipped in the age slot
    - Extend the existing desktop test in `tests/hooks.test.ts` (around line 1952): send a pointer down with `in: 'select-<id>'`, and update its `select-i2` and `title-i2` checks.
14. **The fold Client.** Extend the same test: two posts with the same target, and the fold state does not change on the second.
15. **Approved shared changes**, one at a time: A1 to A8.
16. **The tree rail, or the indent fallback.**
17. **Spec pass:** update `inbox-ui.md` to match what shipped.

## Not doing

- **A Client for any single action.** A native Button already takes clicks on its own chrome (probe 16 checks the edges) and keeps the app's focus.
- **A Client for the open row.** Its height comes from wrapping text, and it holds Markdown and an Input.
- **A Client for the band.** Clients are verified only in the pane, and the band holds two simple actions.
- **Key letters on desktop.** Hotkeys do nothing there, and a letter would promise a key that fails.
- **A Keys footer or a "click to act" hint.** Everything is already a button.
- **An imitation `[-]`.** It would not collapse the engine's band.
- **`role="dismiss"`.** The types say it replaces the word Dismiss with a ✕ at the trailing edge.
- **Primary for Send, Resume, Hide demo or the shown tab.** Primary means only the recommended option.
- **Selection blue for the shown tab.** Blue means the open row.
- **The tree or `─` rules from glyphs.** Stacked glyphs break apart and runs of `─` wrap.
- **The 200 ms tab draw-in.** Desktop allows about 10 redraws a second.
- **A fade on the new-row bar.** The terminal has none either.
- **Long feedback on its own line.** It shifts rows under the pointer 5.12 s later.
- **A shorter desktop banner wording.** The spec shares the banner text across clients.
- **Shortening band words to stop wrapping.** The words matter more than one line.
- **Hover on the PR card or the open row.** Neither takes a click.
- **A "Reply in chat" button,** unless probe 14 shows `$.prompt.fill` works.
- **A shared tabs and fold module.** One maps x to several tabs. The other is one target with two states.
- **Percent-size bars thinner than a cell.** The engine sizes everything in whole cells.
