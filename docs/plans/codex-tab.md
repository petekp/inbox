# The Codex Inbox tab

The Inbox tab is the Codex plugin's version of the mod's `/inbox` pane. It
sits beside a Codex conversation in the desktop app. This plan gives its
layout and the reason for each choice. The plugin's design is in
[codex-plugin.md](codex-plugin.md).

The tab follows the pane's behavior and wording, so a person who uses both
sees one inbox. It drops the pane's terminal drawing, which exists because a
terminal has only character cells.

## Layout

From the top:

1. **The header:** the session's goal, then what's happening now and up to
   three running items. These are the band's lines. Codex has no band, so the
   tab's header carries them. The waiting count is left out, because the tab
   counts show it.
2. **The tab bar:** "Needs you" and "Findings", each with its open count in
   its tone. At the right end, when the inbox last updated: "Updated 2m ago",
   "Updating…", or "update failed, retries after the next reply". These are
   the pane's tabs and status words.
3. **The selected tab's list.**
4. **A footer** listing the keys no row shows: `1 2` switch tabs, `j k`
   select a row.

### Needs you

Three groups, each a card with its title and open count:

- **Failing checks,** first, because they block the work. The group shows
  only while a check fails, or while a check that just passed stays in place.
- **Questions,** then **Your tasks.** Questions come first because each takes
  one key. An empty group says "No questions are waiting on you." or "No
  tasks are waiting on you."

Under a group's open rows, "▸ 3 Closed" folds its last three closed items.
Unfolded, each shows what was asked, then its outcome and age. The outcome is
bold when the person decided it, and muted when it lapsed: dismissed,
expired, or closed by Codex. This is the pane's Closed fold.

### Findings

Newest first. A finding's row shows its kind, "▲ Issue" or "✦ Opportunity",
its age, its detail and its file.

### Rows

- **Unselected,** a row is one line: its handle, then its title cut to fit,
  then its age in muted text. After an action, the row's last action takes
  the age's place, as "explain sent 1m ago". One line per row lets the
  person scan the list.
- **A click or a key selects a row.** The selected row shows its full title,
  its body, its last action and its actions. Showing actions on one row at a
  time keeps the list readable, as in the pane.
- **Each action shows its key** before its label, as "a Fix". The keys are the
  pane's: answers and steps on `a b c f g h i l m`, `d` Done, `t` type, `e`
  Explain or Discuss, `x` Dismiss, `v` Details.
- **A press shows at once.** Until the server answers, the row says
  "Sending…". Then it shows the action's last-action text, such as "Explain
  sent · just now". A second press of the same action reads "Explain again".
  The repo requires every action to show what it did.
- **A row handed to Codex folds.** A task whose step or reply went to Codex,
  and a check whose Fix was sent, show a green ✓. Selected, such a row shows
  its note and only Details. Details shows its body and actions again. The
  row no longer waits on the person, so it leaves the count.
- **A row that just closed stays in place.** For about five seconds it shows
  a ✓, what it was, and how it closed, over a bar that empties. Then it moves
  under Closed. A finding sent to Codex shows what was sent. A check that
  passed shows "Passed". The person sees where the row went.

### Keys

The keys work while the tab has focus. They are off while a text field has
focus, and while a modifier key is held, so typing and the app's shortcuts
work. `j` and `k`, or the arrow keys, move the selection. When the selected
row leaves, the row now in its place is selected.

## Web forms of terminal drawing

| Pane | Tab | Why |
| --- | --- | --- |
| A raised tab panel with a line of `▔` | An underline in the tab's tone | A web page draws a border directly. |
| A tree of `├─` and `└─` from each group's title | A card per group, rows divided by lines | The tree places rows in a grid of cells. A card groups them on a page. |
| A leave bar that loses half a cell per step | A bar whose width shrinks in a CSS transition | A page can animate width smoothly. |
| A drawer listing the keys | A footer line | The tab has room for one more line. |

## Left out of the first version

- **The PRs tab.** The plugin does not fetch pull requests yet.
- **The stop section.** Codex has no stop the plugin can see.
- **The demo.** The pane's `/inbox demo` has no Codex command to start it.

## Typed text survives polls

The tab polls the server every 3 seconds. The current tab rebuilds its whole
page on each poll, so half-typed text is lost. The new tab:

- draws with Preact, which updates only what changed;
- keeps each row's draft by row id, so a draft survives the row redrawing,
  being deselected, or its field closing;
- focuses a field only when it opens;
- polls again only after the last poll answered, so polls cannot overlap;
- numbers each view it asks for, and drops a view older than one already
  shown. Otherwise a poll that started before a press could bring back the
  row the press closed.

## Colors

The tab uses the host's CSS variables for its background, text, muted text
and borders, and falls back to its own values outside the app. The tones are
the pane's: amber for Needs you, purple for findings, green for done, red for
errors, in the pane's dark and light values. The host's real variable values
are not verified, so the tones' contrast holds for the fallbacks only.

## Build

- Preact 10.29.8 and esbuild bundle `src/tab.tsx` for the browser. The build
  inlines the script into `tab.html`, and the server bundle carries the page
  as text. A plugin install runs no build, so the page must be one file.
- The tab imports only types from the server code, and `ago` from the mod's
  `ledger.ts`, so it says ages the same way.

## Verify

A stand-in host page frames the tab, answers its handshake, and serves views
from `viewOf` on sample state. At 576 px wide, dark and light:

- type into a field, wait two polls, and see the text and focus kept;
- press an answer while a poll's reply is held back, and see the row stay
  closed;
- see a closed item stay in place, then move under Closed;
- press a hotkey letter in a text field, and see it typed.
