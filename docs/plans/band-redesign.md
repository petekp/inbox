# Band redesign: the glance line

The band is the block the inbox draws above the prompt. This plan makes it one calm line that says whether anything needs you, with [Open inbox] in the same spot every time. It grows past one line only for a stop whose fix does not fit, the offer to continue the last session, or a short recap when you come back after 15 minutes. Everything else lives in the pane. Nothing here is built.

## What is wrong today

A desktop capture of the away state shows seven lines:

```
Showing sample entries. Presses here send nothing. [Hide demo]
[Open inbox] 7 need you: Show the Keys list in a footer, or under the tab bar? · 4
             findings · PR #31 CI failing
◆ Give the inbox pane keyboard shortcuts and a cleaner tab bar · last active 34m
ago
✓ Tabs switch with 1, 2 and 3 · Answer keys moved to letters · PR #31 opened
→ Waiting on where the Keys list goes and a gh sign-in
● live test session: tmux attach -t inbox-live
 Closed: Add a fourth Session tab? → dismissed · Draw the tabs on the pane's ow…
```

- It shows too many topics at once, and the eye has no single place to land.
- It uses six colors and five glyphs (◆ ✓ → ● !).
- Line 1 wraps on desktop. `wrap="truncate-end"` does not stop desktop text from wrapping.
- Indents differ from line to line, and they cannot line up under a native button in a proportional font.
- The closed list, the settled hints and the running commands repeat what the pane shows.

## The rules every state follows

- **Line 1 never wraps.** The mod cuts each line to fit before drawing it. Whole optional parts drop from the end first. Then the one clippable part (the top title, the goal or the stop reason) is cut with "…". A part under 12 characters drops instead of being cut.
- **The room is measured per surface.** In the terminal, a Button draws as `[ Label ]`. On desktop, about 1.25 characters fit per column, with a 0.9 safety margin, and a native button is about 2 columns wider than its label.
- **Two accent colors.** Amber colors only the words "N need you". Red colors only something broken: a stop, "Could not read saved items", "Inbox tools blocked". Everything else is the theme's text or muted color. The band uses the pane's palette, so it gets the same contrast-checked tones.
- **No glyph markers.** Muted labels carry the meaning: `Done:`, `Now:`, `Goal:`, `Last step:`. Lines 2 and on start at the left edge.
- **[Open inbox] leads line 1,** except in the previous-session state, where the pane has nothing yet and the choice to continue leads.
- **A pressed button stays drawn.** [Resume] and [Continue from it] keep their key and change their label, so the desktop app keeps the pane's focus (anthropics/claude-code#100874).

## Each state

Terminal mockups are 100 columns. On desktop, ⟦Label⟧ is a native button and ‹Label› a plain one, drawn without chrome.

**Standing: you are here and Claude is idle.** The resting view.

```
[ Open inbox ] 2 need you: Rename the table to accounts? · PR #12 CI failing · 1 finding
[ Open inbox ] Migrate auth to sessions · writing the migration test · 1 finding
[ Open inbox ] Nothing needs you · PR #12 CI failing
```

On desktop at 40 columns: `⟦Open inbox⟧ 2 need you: Rename the table to…`. When the line is narrow, the finding count drops first, then the PR alert, then the title is cut. A failing CI blocks work and runs out of time; a finding waits at no cost. When nothing needs you, the goal and step fill line 1, because they are the most useful thing left.

**Working: Claude is running a turn.** The same line 1 as standing, so the eye lands on the same text between turns.

**Away: you come back after 15 minutes.** At most three lines, down from seven.

```
[ Open inbox ] 7 need you: Show the Keys list in a footer, or under the tab bar? · 4 findings
Done: tabs switch with 1, 2 and 3 · answer keys moved to letters · PR #31 opened
Now: waiting on where the Keys list goes and a gh sign-in
```

Old done steps drop first when a line is cut. `Now:` draws only when Claude has set it.

**Stopped.** One line when the fix fits. [Resume] is reserved at the end of the line for an API error, so the text never pushes it off.

```
[ Open inbox ] Stopped 1m ago: the API is overloaded. [ Resume ]
[ Open inbox ] Stopped 1m ago: the API is overloaded. [ Resuming… ]
[ Open inbox ] Stopped 3m ago: sign-in expired. Run /login, then send a message to resume.
```

On a narrow band, a fix that does not fit moves to line 2, muted, instead of being cut away.

**Previous session in this folder.** The one state that leads with another button.

```
[ Continue from it ] [ Dismiss ] Last session in this folder, 2h ago · 3 were waiting on you
Goal: Migrate auth to sessions
Last step: writing the migration test
```

After the press, the button reads `✓ Added to your next message` under the same key. On desktop ‹Dismiss› is plain, so one native button holds the eye.

**Unreadable inbox and blocked tools.** Both now show in the band. Today a person learns them only by opening the pane.

```
[ Open inbox ] Could not read saved items. Open the inbox to try again.
[ Open inbox ] Tools blocked · 2 need you: Rename the table to accounts?
```

"Could not read saved items" is red: nothing new is saved while it lasts. "Tools blocked" is a short red marker. The person cannot fix it and it lasts the session, so the pane holds the full sentence.

**Demo.** The banner folds into line 1 and costs no extra line.

```
[ Open inbox ] Demo · 7 need you: Show the Keys list in a footer, or under the… [ Hide demo ]
```

The pane keeps the full banner sentence, since presses there look like sends.

## What leaves the band, and where it goes

| Today in the band | Where it is instead |
|---|---|
| Goal and step, while something needs you | A new muted line under the pane's tabs: `Migrate auth to sessions · writing the migration test` |
| Running commands (`● npm test`) | The same pane line: `Running: npm test` |
| Settled hints (`✓ what → outcome`) | The pane's settled row, then its Closed fold |
| The away `Closed:` line | The pane's Closed fold |
| `last active 34m ago` | Dropped. The recap already says what happened. |
| The demo banner's own line | `Demo ·` on line 1. The pane keeps the sentence. |

## Also fixed

- A failing PR with no card, items or findings now shows in the band. Today it falls through to the engine's default band.
- When nothing needs you and a PR alert is the only thing to act on, [Open inbox] opens the PRs tab.
- The band redraws when the unreadable or blocked state changes. Today only the pane redraws, so a fixed problem could linger in the band.

## Alternatives the judges scored lower

- **Next step first** (37 and 34 of 50): line 1 names the next action and answers the top question in one click. It brings answer buttons back to the band, against your earlier default, and its line grows busy.
- **Briefing band** (35 and 37): a labeled briefing of goal, done, now and running whenever you are idle. It keeps the most, but it is the busiest at rest, which is today's problem.

## Your call

1. **Demo banner.** Should it shrink to `Demo ·` at the start of line 1? The UI plan says every client shows the full banner sentence at the top. The fallback is the full sentence on its own line, with [Hide demo] first.
2. **Goal, step and running commands.** While something needs you, they leave the band for a new line under the pane's tabs. Is that move right? The other option keeps one muted `goal · step` line under line 1 in the standing state, when the band has room.
3. **A real stop during the demo.** Should it show? Today the demo hides it.

## Build steps

1. `hooks/register.tsx`, band: one pure fitter, `fitLine(segments, room)`, where each segment has text, tone, whether it is required, and whether it may be cut. Add a room helper per surface and a desktop branch on `e.surface`. Rewrite each state's lines as segments.
2. `bandState`: add the unreadable and blocked heads, require no PR alert for `none`, drop the settled hints and the running lines.
3. Colors: the band reads the theme and uses the pane's palette tones.
4. Stable keys for [Resume] and [Continue from it].
5. Pane: the muted goal, step and running line under the tabs, in both surfaces.
6. Tests: update the band tests that expect the goal and settled hints in the band. Add a desktop mount at 40 columns that checks line 1 is no longer than its room, and tests for the unreadable and blocked heads.
7. Docs: `inbox-ui.md` sections 2.2, 2.7, 2.10, 3.1 and 3.2.

No saved state changes. No text a model reads changes, so no A/B is needed. Each new string goes through `refine-prose` before it ships.

**Risks to check live.** The 1.25 characters-per-column budget comes from one row of text; titles with wide letters may still wrap, so test long titles at 40 and 60 columns. [Dismiss] and [Hide demo] still leave the drawing when pressed; whether that loses a click in the band, as it did in the pane, is unchecked.
