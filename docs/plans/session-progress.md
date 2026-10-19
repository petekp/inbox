# Session progress

Status: building. The Map tab with Goal, Now and Milestones is built in all three looks. Planned steps are not built.

A person who comes back to a long session should see at a glance what it has done, what it is doing now, and what it plans next. This plan adds that view to the inbox. Two requests lead here:

- **Planned steps** ([issue #3](https://github.com/petekp/inbox/issues/3)). While the agent works through a plan with several steps, show the steps and keep them current, so the person can see how far along it is.
- **Milestones.** The outcomes the session has reached so far, such as "PR #12 opened" or "Chose the B layout", so the person can see where things stand without reading the transcript.

## Recommendation

Add a **Map** tab, beside Needs you, Findings and PRs. From top to bottom it shows:

1. **Goal.** What the session is for.
2. **Next.** The agent's planned steps, shown only when the agent stated them.
3. **Now.** Where the work stands, and what it waits on.
4. **Milestones.** Each outcome so far with its age, newest first.

Build milestones first. They already exist in the card, cost no new model call, and no host keeps them. Add planned steps second. They must update while the agent works, so they have to come from a tool the agent calls during its turn: the host's own plan tool where the host offers one, and an inbox tool where it does not.

## Terms

- **Card.** The summary the inbox model writes after each reply: `GOAL`, `NOW` and `RUNNING`, plus `done`, the newest 4 results. It lives in `Ledger.card`. The agent reads it at the start of a session and after compaction. The Map tab draws the goal, now and running.
- **Milestone.** One finished outcome, with the time it happened (or none, when unknown). A milestone comes from a `DONE` line, or from a ledger event: a question the person answered, or a finding fixed.
- **Planned step.** One step the agent says it will take. It is open, current or done.

## What exists today

- **The card kept only the last 4 outcomes.** The model rewrote the whole list each turn, so older outcomes dropped out and kept ones could be reworded. Milestones keep every outcome.
- **Progress lines were cut twice.** Commit `c26e222`, on 2026-10-08, dropped the Codex tab's header, because it repeated the thread's title and Codex's last reply. Commit `5e6bcdc`, on 2026-10-09, took the goal, the current step and the running commands out of the band. Both showed the current turn, all the time, beside a conversation that already showed it.
- **The hosts have plan tools, but not every setup offers them.** Claude Code has task tools and draws the list in the terminal. The Claude desktop app has plan and tasks panes and gives the agent an `update_plan` tool. Codex has `update_plan`, and some plugins turn it off for the sessions they start. In the author's setup, Claude Code sessions in the terminal are not offered the task tools at all. A plan view that reads only these tools would be empty there.
- **Agent view summarizes each session.** Claude Code's agent view shows whether each session is working or done, with a short summary per turn. It keeps no history of outcomes. The `[AV]` notes in `docs/reference/claude-code-mods.md` have the source.

## Why this is not the cut feature

The inbox shows what waits on the person, not a status display. `README.md` says it exists because a long session piles up more than a person can hold in their head. The cut lines did not help with that, because they repeated the screen. The Map tab differs in three ways:

- **It keeps history no host keeps.** The transcript holds the outcomes, buried in tool output. Nothing else lists them.
- **It opens on demand.** It sits in its own tab, never in the band or above Needs you, and it never counts toward the band.
- **It is for coming back.** It answers "where were we" after time away. Later it can answer that across sessions.

If the tab turns out to be noise, the cost is a tab nobody opens, which is easy to remove.

## Milestones (built)

**Data.** `Ledger.milestones` holds `{ id, source, text, detail, ref, at }`. `source` is `done`, `answered` or `fixed`. `at` is null when the time is unknown. The list is capped at 200; past that the oldest goes, one with no time first.

**Three sources.**
- `done`: a `DONE` line the inbox model writes. The rule asks for results finished in this exchange, past tense, at most 3 a reply. A PR the session opens is an ordinary result, such as "PR #31 opened".
- `answered`: a question the person answered. Code adds it when the question closes with an answer, and removes it when the close is undone. A bare "yes", a put-off, and the Proceed or Not yet question for a todo add none.
- `fixed`: a finding a `FIXED` line closes. Code removes it when the finding reopens.

**Why there is no PR source.** The mod can see `gh pr create` output, but Codex hooks run before a tool and see no output. A PR milestone would exist in one host only. As a `DONE` result it reads the same in both.

**Not repeating results.** `<listed>` in the inbox model's prompt holds the newest 8 milestone texts, newest first, and the rule says never to write one again, even reworded. Code drops a `DONE` line only when it matches a milestone's text apart from case, punctuation and spacing. Word overlap was tried and rejected: it merged "Fixed login redirect bug" and "Fixed signup redirect bug".

**Catch-up.** After a failed update, the next update reads the whole conversation. Its `<listed>` holds every milestone text. It writes at most 6 `DONE` lines, and every milestone it writes has no time, since the turns are past. The Map shows these with no age, below the timed ones. Codex has no catch-up: a second failed update drops its exchange.

**Order.** Timed milestones show newest first. The lines of one update get times one millisecond apart, so later lines sort above earlier ones. Milestones with no time follow, newest stored first. A catch-up can cover the latest turn, so one of these may be newer than a timed one; with no time, the Map cannot tell.

**Saved state.** `Card.done` stays, because older versions read it. Each update sets it to the newest 4 `done` milestone texts. `upgradeLedger` seeds `milestones` from an old `card.done`, with no time.

**Checks.** The `DONE` rule is text the inbox model reads. `evals/cases.json` has cases for it, and `evals/run.ts` checks the number and wording of new results.

## Planned steps

Issue #3 asks to see progress during a long run. A long run is often one turn, and the inbox model runs only after the reply. So the steps must come from something the agent does during its turn.

| Source | How | Updates during a turn | Weakness |
| --- | --- | --- | --- |
| The host's plan tool | The mod's `tool.call` handler in `hooks/register.tsx` sees every call. `codex/src/transcript.ts` already reads `function_call` rows. Capture the latest plan. | Yes | Not offered in every setup |
| An inbox `plan` tool | A third tool beside `record` and `close`, with guidance to call it for work of three or more steps, and again as each step finishes | Yes | Changes what Claude and Codex read on every turn. AGENTS.md records that a one-word change moved `record` behavior |
| The inbox model | New `NEXT:` lines in `systemText`, from steps the reply states | No, only after the reply | A model reading another model's reply, and stale for the whole turn |

**Recommendation:** capture the host's plan tool where the host offers one. Where it does not, offer the inbox `plan` tool. Do not add `NEXT:` lines: they cannot show progress during a turn, which is the point of the request.

The `plan` tool's description and guidance are text the agent reads. Run `./scripts/eval.sh --suite agent` with new cases in `evals/agent-cases.json`: a three-step task calls `plan` and updates it; a one-step task does not call it; `record` and `close` behave as before.

Two things need a probe before building:
- **Which setups offer a plan tool.** Check Claude Code in the terminal, Code mode in the desktop app, and Codex, each with default settings.
- **Whether a look redraws during a turn.** The terminal pane does. The desktop pane redraws only on events, and whether a tool call counts is unknown. The Codex tab polls every 3 s, so it would show a new plan within that time.

**Showing progress.** Show "Step 3 of 5" only when a full plan exists. Never estimate a percentage.

## Drawing it

The rule for every look, from `docs/looks.md`: shared modules decide, adapters draw.

- **Shared.** `mapView` in `hooks/view.ts` decides the sections, their order, when the tab counts as empty, and each line's text and age. The tab is empty when the session has no goal and no milestones.
- **Arrivals.** `hooks/arrivals.ts` moves a look from an empty tab to a tab where rows arrived. Milestones arrive every turn, so Map lines must never count as arrivals. Otherwise an empty Needs you would jump to Map after each reply.
- **Terminal and desktop.** `hooks/register.tsx` draws the tab. Lines are plain Text, so desktop needs no new Client. In the Claude app's narrowest pane, four framed tabs did not fit: their labels wrapped inside the frames. There, only the shown tab keeps its frame, and the counts drop, as they already did for three tabs.
- **Codex.** `codex/src/tab.tsx` draws the tab. Map lines do not animate: they are not rows, and the state machine in `codex/src/rows.ts` covers rows only.
- **Presses.** None at first. A milestone could later offer Explain, and a planned step could offer "Do this next". Each would need a `PressKind` and the press rules in AGENTS.md.

## Order of work

1. **Milestones.** Done. The `milestones` field, the `DONE` rule change with its eval cases, the upgrade, and the Map tab with Goal, Now and Milestones in all three looks.
2. **Planned steps.** The two probes, capturing the host's plan tool in both hosts, the inbox `plan` tool with its eval cases, and the Next section.
3. **Across sessions.** One Map line for each open session, as part of "Every open session in one view" in `ROADMAP.md`.

## Decided

- **Where the steps come from.** The host's plan tool where offered, and an inbox `plan` tool elsewhere. The cost is new text every agent reads. The alternative that avoids it, `NEXT:` lines from the inbox model, cannot update during a turn.
- **Where it is drawn.** A new tab named Map. The rejected alternative is a fold at the top of Needs you, which puts status above the work that waits on the person.
- **Milestones ship before planned steps**, because they need no new data source.
