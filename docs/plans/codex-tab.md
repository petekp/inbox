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

1. **The tab bar:** "Needs you" and "Findings", each with its open count in
   its tone. At the right end, when the inbox last updated: "Updated 2m ago",
   "Updating…", or "update failed, retries after the next reply". These are
   the pane's tabs and status words.
2. **The selected tab's list.**
3. **A footer** listing the keys no row shows: `1 2` switch tabs, `j k`
   select a row.

The tab has no header with the session's goal. The conversation sits beside
the tab: the thread's title names the goal, and Codex's last reply says
where the work stands.

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

## Look

The tab keeps the pane's structure and redraws its character art as the
page's own lines, so it reads as the same inbox at a finer grain.

| Pane | Tab | Why |
| --- | --- | --- |
| A tree of `├─` and `└─` hanging from each group's title | The same tree in hairlines, with a rounded last elbow | The tree is what makes the pane recognizable. Hairlines keep it light beside proportional text. |
| A raised tab panel with a line of `▔` in the tab's tone | A raised tab with a 2 px edge in its tone, drawn in from the left on a switch | Same shape and meaning. The draw-in answers the switch, as the pane's does after a jump. |
| Keys drawn as text, as `a: Fix` | The same text, with a light fill under the pointer | Text keys keep a row quiet. Boxed buttons made every row look like a form. |
| A divider from the text column to the edge | A hairline from the text column | The tree passes through it, as in the pane. |
| A leave bar that loses half a cell per step | A bar whose width shrinks smoothly | A page can animate width. |
| A drawer listing the keys | A footer line | The tab has room for one more line. |

**Surfaces.** The page, a group's card, the raised tab and the selected row
are mixed from the host's own background and text colors, so the tab sits
inside Codex's theme. The selected row adds a little blue, as the pane's
blue-gray selection does. Nothing has a shadow or a border.

**Type.** Words use the host's sans. Only what the terminal drew as
structure uses the host's mono: the tree, the row marks, the key letters and
check output.

**Color means state.** Amber waits on you, purple is a finding, green is
done, red is failing, and periwinkle marks a key. Nothing else is colored.

**Motion** only answers a press: the tab edge drawing in, and the leave bar.
Both stop when the system asks for reduced motion.

## Demo

"Show demo" in the footer swaps the tab's entries for the samples the pane's
`/inbox demo` shows, from `hooks/demo.ts`, so both demos match. Codex gives a
plugin no slash command, so the tab is where the demo starts. A banner above
the tabs says the entries are samples, with Hide demo to leave.

The server keeps the demo in memory for each conversation, and it starts
over when the server restarts. A press in the demo runs the same press logic
on that copy, so rows fold, settle and read "again" as they would for real.
It sends, opens and copies nothing, and leaves the conversation's saved inbox
alone. A press that would send, open or copy reads "Sample entry: nothing
was sent." on its row.

## Left out of the first version

- **The PRs tab.** The plugin does not fetch pull requests yet.
- **The stop section.** Codex has no stop the plugin can see.

## Typed text survives polls

The tab polls the server every 3 seconds. So that half-typed text survives a
poll, the tab:

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
errors, in the pane's dark and light values.

On the fallback backgrounds, every text color has at least 5.1:1 contrast on
the page, a group's card, the raised tab and a selected row, in dark and
light. The ✗ mark has 4.4:1 at its lowest, and a mark needs 3:1. The host's own
variable values are not measured yet.

## Build

- Preact 10.29.8 and esbuild bundle `src/tab.tsx` for the browser. The build
  inlines the script into `tab.html`, and the server bundle carries the page
  as text. A plugin install runs no build, so the page must be one file.
- The tab imports only types from the server code, and `ago` from the mod's
  `ledger.ts`, so it says ages the same way.

## Verify

A stand-in host page framed the tab, answered its handshake, and passed its
calls to the real server code on sample state. At 576 px wide, in dark and
light:

- Text typed into a field, and the field's focus, outlasted two polls.
- A poll whose reply was held back past an answer did not bring the
  answered question back.
- A closed item stayed in place for five seconds, then moved under Closed.
- Letters typed into a field stayed in the field and pressed no action.
