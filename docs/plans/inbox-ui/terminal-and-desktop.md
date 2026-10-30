# Inbox UI: the terminal and desktop looks

Part of [the inbox UI spec](../inbox-ui.md).

Status: built.

## 3. Each look

### 3.1 Terminal

**Placement.**

- The band above the prompt, up to 19 rows at a 49-row terminal.
- The `/inbox` pane. It docks beside the transcript in a fullscreen terminal from 110 columns, and is otherwise a framed region above the prompt.
- The Herdr sidebar line. It is the only place that names an open permission prompt or AskUserQuestion dialog.

**The band.** One line: the counts for Asks and Finds, with [Open inbox] at the right end. Each count reads as its tab does: the tab's name, muted, then the count in the tab's color. The button opens the pane with the top row open. The line is the same while Claude works and when the person comes back after a break.

```
Asks 2 · Finds 1                                        [Open inbox]
Nothing needs you                                       [Open inbox]
Demo: Asks 7 · Finds 4                      [Hide demo] [Open inbox]
```

A count of zero drops out. During `/inbox demo` the line starts with "Demo:", so the sample counts do not pass for real ones.

A stop draws a second line under the counts, so [Open inbox] does not move. It starts with "Stopped 1m ago:" in red. An API error adds [Resume], which reads "Resuming…" under the same key while it sends.

```
Asks 2 · Finds 1                                        [Open inbox]
Stopped 1m ago: API error (overloaded). [Resume]
```

The band falls back to the engine default when the mod is off, a survey shows, or the session has no stop, Status, items or findings. Unreadable saved items and blocked inbox tools show only in the pane.

**The pane.** Raised tabs when docked, "a: Label" on each action, j and k, 1 2 3 for tabs, ctrl+x tab, Esc, and the Keys drawer.

```
 Asks 3 │ Finds 2 │ PRs 1
 ─────────────────────────────────────────────────────────
 ! Stopped 3m ago: sign-in expired. Run /login, then send
   a message.
 Questions
 1) Use --dry-run or --preview for the flag?       2m ago
    Both work. --dry-run matches git.
    a: --dry-run   b: --preview
    t: Reply   e: Explain   x: Dismiss
 2) Merge now or wait for review? · 5m ago
 Tasks
 • Sign in to npm · ✓ Explain 1m ago
 ▸ 3 Closed
```

**Typing.** As in 2.5. Enter sends. Cancel closes the field. Esc closes the whole pane.

**States.** As in 2.6 and 2.7.

**Cannot do.** A Remote Control or phone viewer sees no band or pane. There is no substitute in the inbox. The platform's own session list covers that viewer.

### 3.2 Desktop

**Placement.** The same band, with `maxRows` 12, and the same pane, docked. The person resizes the pane; its body went from 36 to 69 columns in one session. Only clicks reach the mod.

The mod picks the desktop drawing on each draw from `e.surface === 'desktop'`, not once per session, because each surface's render is its own evaluation (engine types, `RenderSurface`).

**The band.** The same states as the terminal. [Open inbox] sits at the right end of line 1. The counts shrink first, so a narrow band never pushes it off the line. It is a native button.

**The pane at 36 columns.**

```
Asks 3  [Finds 2]  [PRs]
Questions
1) Rename the table to accou…
   Rename the users table to
   accounts before the
   migration runs?
   [Yes, rename (recommended)]
   [No, keep users] [Reply]
   [Explain] [Dismiss]
? Keep the old endpoint for…
Tasks
• Add STRIPE_KEY to .env
```

A desktop row Client reserves a side column for the age at narrow widths too. The status is in the footer. An open row's actions wrap in the shared order: retry, options or help, Done or Fix, then follow-ups. The recommended option, Done, Fix or Do it has primary emphasis. The shared action's icon kind maps to the native glyph.

**After [Explain] is pressed**, the row stays open and records the press:

```
1) Rename the table to accou…
   ✓ Explain · just now
   [Yes, rename (recommended)]
   [No, keep users] [Reply]
   [Explain again] [Dismiss]
```

**How the desktop drawing differs from the terminal.**

| Element | Terminal | Desktop | Reason |
|---|---|---|---|
| Action labels | `a: Explain`: a Text letter beside a ": Label" Button | `[Explain]` | Hotkeys do nothing on desktop. "a" beside a native ": Explain" button is noise. |
| Hidden hotkey Box | Drawn | Not drawn | It does nothing there, and might draw as visible native buttons. |
| Tabs | Raised panel; 5 plain Buttons per unselected tab | One Client draws the three tabs. A click anywhere on a tab shows it. Only the shown tab has a fill: raised, rounded and bold. A hovered tab takes the tab gray. Other labels and every count are muted. | A Button takes a click only on its label. A Client takes one over its whole region. The selection color means the open row, so the shown tab does not use it. |
| Reply | A labeled action with its key | A follow-up in a Client region | Native Buttons fill and pad only their labels. The Client preserves follow-up hit areas and spacing. The shared action retains normal emphasis and order. |
| Closed row | Handle Button and title Button, two when the title wraps | One Client per row. A click anywhere on it opens the row. The title is cut to one line with "…". | A Button takes a click only on its label. |
| Keys drawer, "1 2 3", "j k", "ctrl+x tab" | Shown | Not drawn | Nothing to press. |
| Closing the pane | Esc | The app's own ✕ on the pane's title bar | The app draws it, so a [Close] in the pane would be a second close. |
| Tree lines and dividers | `│ ├─ └─` and a `─` rule between rows | None. Closed rows sit flush, each padded a quarter line above and below. A PR's status block starts at the title's column, so only its check and thread rows are indented. | Desktop text is proportional and its lines differ in height, so stacked glyphs break into bars and a rule sized in columns wraps. A rail drawn as a Box is a full cell wide and makes the separator too heavy. |
| Title cut | By columns | By a measured characters-per-column estimate, `DESKTOP_CLIP_CHARS_PER_CELL` | A column of `bodyColumns` holds more than one character of desktop text. |
| Links | `Link` | `Link` for https. A button that runs `open` for local files and folders. | `Link` is live only for https. `$.process` works on desktop. |

**Typing.** The engine types list `Input` for desktop, so `$.ui.resolve(e)` returns it there. The pane drops the Reply field's key when `Input` does not resolve. Typing, Enter and focus need current-build native verification. The person can then type in the composer, and Claude already holds the item through carry text. The inbox cannot prefill the composer, because `$.prompt.fill` does nothing in a headless session.

**PRs.** The PR tab stays. Desktop shows a CI status bar and a Code review card. The PR block adds what those lack: threads that wait on the person, and Address all. It shows CI as status with Open log.

**States.** The same as the terminal. A failed PR fetch shows [Retry], since there is no key to retry and the next poll is 2 minutes away.

**Cannot do, and the substitute.**

| Cannot | Substitute |
|---|---|
| Hotkeys, Esc, j and k | Every action is a button. A click on a title opens that row. |
| Toasts, unverified | Notes on the row |
| Prefill the composer | The in-pane field. Without `Input`, the composer plus carry text. |
| `Link` to non-https targets | A button that runs `open` |
| `ToolProgress`, `InfoNotice`, `Raster`, `Image` | Not used |
| The Herdr sidebar line | None on desktop. The app shows its own permission dialog. |
