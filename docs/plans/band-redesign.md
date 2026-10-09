# Band redesign: counts only

The band is the block the inbox draws above the prompt. This plan cuts it to one line: [Open inbox] and the counts for Needs you and Findings. A stop adds a second line with [Resume]. Everything else lives in the pane. Nothing here is built.

## What the band shows

```
[ Open inbox ] 2 need you · 4 findings
[ Open inbox ] 1 finding
[ Open inbox ] Nothing needs you
```

- **The same line in every state.** Standing, working and coming back after a break all draw it. The eye lands on the same place each time.
- **A count of zero drops.** When both are zero, the line reads "Nothing needs you".
- **Amber colors only "N need you".** The rest is the theme's muted text.
- **The band stays hidden when the session has no inbox content,** as today. The engine draws its own band then.

**Stopped.** The counts line stays first, so [Open inbox] does not move. The stop draws under it in red.

```
[ Open inbox ] 2 need you · 4 findings
Stopped 1m ago: the API is overloaded. [ Resume ]
Stopped 3m ago: sign-in expired. Run /login, then send a message to resume.
```

[Resume] shows only for an API error. After a press it reads "Resuming…" under the same key, so the desktop app keeps the pane's focus (anthropics/claude-code#100874).

**Demo.** Sample counts could pass for real ones, so the line says so and keeps [Hide demo].

```
[ Open inbox ] Demo: 7 need you · 4 findings [ Hide demo ]
```

## What leaves the band

| Leaves the band | Where it is instead |
|---|---|
| The top question's title | The pane's Needs you tab |
| PR alerts | The pane's PRs tab |
| Goal, step and running commands | The pane |
| Settled answers and the Closed line | The pane's settled rows and Closed fold |
| The recap after 15 minutes away | Dropped |
| The offer to continue the last session | Dropped, see below |

## The last-session offer is removed

When a new session started in a folder, the band offered the last session's card with [Continue from it] and [Dismiss]. The whole feature goes:

- the `PREVIOUS` atom, `bringBack()` and the `p:<folder>` store writes;
- the band's `previous` state and its two buttons;
- the note `notePrompt` adds to the next message when the card is brought in.

That note is text the model reads. Removing it removes the feature with it and changes no other wording, so no A/B is needed. Saved `p:<folder>` entries stay in the store, unread. Deleting them needs a way to list store keys; check whether `$.store` has one.

## The two rare warnings stay in the pane

"Could not read saved items" and "Inbox tools blocked" do not show in the band. Both last the session, and the person cannot fix "tools blocked". A band line for them would break the one-line rule.

## Build steps

1. `bandState` in `hooks/register.tsx`: keep `stopped`, `none` and one `counts` state. Remove `previous`, `working`, `away` and `standing`, and `BandHints` with them.
2. Band drawing: the counts line, the stop line under it, and the demo form. On desktop, cut text to fit before drawing, since `wrap="truncate-end"` still wraps there. Keep [Resume]'s key stable when its label changes.
3. Remove the last-session feature as listed above.
4. Tests in `tests/hooks.test.ts`: replace the band tests for goal, hints, away and previous with tests for the counts line, zero counts, the stop line and the demo line.
5. Docs: `inbox-ui.md` sections on the band, and `target-architecture.md` where it names the previous-session offer.

No saved shape changes. New strings go through `refine-prose` before they ship.
