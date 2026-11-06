# The inbox model manages the goal

Status: built

## The change

Today the person owns the goal. The Status call can only propose one, the person presses Set as goal, Edit or Not now, and a milestone moves only when an exchange names it. So goals stall: a milestone stays "working" after all its work is done, and a met goal waits for the person to type the next one.

After this change the inbox model owns the goal. It sets the goal, the goal's milestones close as their work closes, it sets the next goal when one is met, and it replaces a goal the work has left. The person can still type a goal, and a typed goal wins.

Terms:

- **Goal**: one outcome with a finish line, such as "2.5 in the store", and 2 to 5 milestones.
- **Milestone**: an outcome the goal needs. Subjects are linked to it with SERVES.
- **Subject**: one piece of the session's work on the Status page.
- **Linked subject**: a subject whose SERVES link names a milestone of the goal.
- **Inferred goal**: a goal the Status call set.
- **Typed goal**: a goal the person typed in the goal's field.
- **Removed goal**: a goal the person removed. The call does not set it again.

## Life cycle

```
none ──GOAL──▶ set ──every milestone done──▶ met ──GOAL──▶ set (next goal)
 ▲              │
 │              ├─GOAL (work left it) ──▶ set (replaced)
 │              └─RETIRE (work left it, no next goal)──▶ none
 └──────────── the person presses Remove goal
```

- **None.** The call writes GOAL once the next goal can be reliably inferred (below). Until then the goal's section shows its heading, a line saying no goal is set yet, and New on the heading row.
- **Set.** The call moves milestones with SET, DONE, DROP, MILESTONE and SERVES, as today. A milestone closes when its linked work closes (below).
- **Met.** Code marks the goal met when every kept milestone is done, as today. The page shows "Goal met". The goal stays until the call or the person sets the next one. RETIRE does not apply to a met goal.
- **Next goal.** The call writes GOAL for the next goal when the session shows one. When it does not, it writes nothing and waits. The met goal keeps showing.
- **Work left the goal.** For an inferred goal that is not met, the call may write GOAL to replace it, or RETIRE to clear it, once no linked subject is open and the goal has not moved forward for 30 minutes. Code enforces that (below).

## When a goal counts as reliably inferred

The call writes GOAL only when all of these hold:

1. **It has a finish line**: someone could check it as met or not. "Make search faster" does not. This is today's `goal-finish-line` rule.
2. **The session's open work points to it.** The person may name the outcome, or the work may show it: the open subjects and the agent's plan for them lead to one outcome. A summary of work that already finished never counts.
3. **It has open work**: an open subject the current goal does not hold, once the answer's subject lines apply. Code enforces this, so a fix the same answer finished gets no goal. The goal's own plan of 2 to 5 milestones is the size check. Code does not count subjects, because the Status call often writes a plan's pieces as one subject, and a subject count then refused a goal the person had just named.
4. **It has 2 to 5 milestones**, each an outcome and not a subject's name. Code drops a GOAL line with fewer, as today.
5. **It is not the current goal or a removed goal**, in the same words or other words. Code drops one that restates either, by the key-word check that today drops a restated or declined proposal.

When any of these is in doubt, the call writes no GOAL. Signs it is not clear yet: the person gives a direction with no finish line, chats, asks for one small fix, or asks for unrelated small items, or the session is wrapping up the met goal.

## The lines the call writes

| Line | Today | After |
| --- | --- | --- |
| `GOAL: outcome \| status name; …` | Proposes. The person presses to apply it. | Sets the goal at once, with its milestones, when code allows it. The old goal's text becomes the was line. A GOAL that restates a typed goal waiting for its milestones gives that goal its milestones, as today. |
| `RETIRE: why` | — | New. Clears an inferred, unmet goal the work has left, when no next goal is clear. |
| `MILESTONE`, `SERVES`, `SET`, `DONE`, `DROP`, `WAS`, `LINK` | Move milestones and links | Unchanged |

`<milestones>` lines gain a mark: `no work linked`, on a milestone that is not done and has no linked subject. The rule: link work that moves it forward, write DONE if the exchange shows it done, or DROP it if the goal no longer needs it.

## How a milestone closes when its work closes

Code closes it. After an answer applies, `settleGoal` marks a milestone done when all of these hold:

- At least one subject is linked to it.
- Every linked subject is done or dropped, and at least one is done.
- A linked subject closed after the milestone last changed.

The last condition lets the model reopen a milestone. When the exchange shows part of it still has work no subject tracks, the call writes SET to open it again. That SET changes the milestone after its subjects closed, so code leaves it open until another linked subject closes.

The rule the call reads: "Code closes a milestone once all its linked work is done. When part of it still has work left, write SET to open it again, and NEW for the work."

## What code does

`OP_ORDER` in `hooks/status-ops.ts` sorts an answer's lines before applying them. Today GOAL, MILESTONE and the subject lines share the first rank, so a GOAL line can apply before the DONE lines that close the old goal's work. The build ranks them:

1. Subject lines: NEW, SET, DONE, DROP.
2. GOAL and RETIRE, with the guard below reading the subjects as these lines left them.
3. MILESTONE.
4. HEAD and WAS, as today.
5. SERVES and LINK.

`applyGoalOp` in `hooks/status-goal-ops.ts` applies GOAL directly, in place of setting `proposedGoal`. It applies a GOAL or RETIRE line only when one of these holds:

- No goal is set (GOAL only).
- The goal is met (GOAL only). RETIRE never clears a met goal: it stays until the next one is set.
- The goal is inferred, no subject under an open milestone is open, and the goal has not moved forward for `GOAL_LEFT_MS`, 30 minutes. It moves forward when it is set, when a milestone that is not dropped changes, and when a linked subject is done. Dropped work is not progress. A done milestone holds nothing, and an open subject under it keeps its link.

Otherwise it drops the line and saves which line and why in `goalRefused`, which the next call reads as a second line in `<goal>`. The person does not see it: the page is not stale, and Remove and Edit are already there. Queued work counts, so parking the goal's work for a side fix keeps the goal. The 30 minutes keep a goal between milestones: when one milestone's work is done and the next has none yet, the goal stays while other work runs for a while. They also keep a goal just set, so a GOAL and a RETIRE in one answer leave the new goal. A GOAL line that restates the goal's was line, the goal it replaced, is dropped too, so two goals cannot take turns. When the old goal's linked work is stale, the prompt tells the call to close it with DONE or DROP in the same answer. The ranking applies those lines before the guard reads them.

A typed goal that is not met is never replaced or cleared by the call, as `docs/principles.md` principle 8 says.

A GOAL that applies saves its milestones as `useProposedGoal` does today: new milestone ids, and every old link cleared. It is not "just set", since its milestones come with it. SERVES lines in the same answer link to the new milestones by name, through `linkableMilestone`. The prompt says: "With GOAL, write SERVES for every open subject against the new milestones, by name." A subject the answer leaves unlinked shows ? on the next call.

`withRestatedGoalAsMilestones` stays. It turns a GOAL line that restates a typed goal waiting for its milestones into MILESTONE lines for that goal.

`StatusGoal` gains `source: 'inferred' | 'typed'`.

## Links marked "-"

Today's `serves-every-subject` says "change a link only when what the work is for changed", so a subject wrongly linked to Other work (`-`) stays there. The rule gains: "When a milestone is marked no work linked, or a goal was just set, check each subject marked - and link it when its work moves a milestone forward."

## A typed goal

The goal's field works as today: New with no goal, Edit while one is set, New once one is met. The buttons sit on the Goal heading row, so their labels leave out "goal", and the field's submit reads Save. Typing a goal replaces any goal at once, inferred or typed, met or not. `setTypedGoal` keeps today's behavior without its proposal branches. A rewording of a goal that is not met keeps the milestones. A new goal, or a met goal typed again, waits for its milestones from the next call (`isAwaitingMilestones`, `milestones-for-new-goal`).

Every typed goal is saved with `source: 'typed'`, a rewording of an inferred goal included, so an edit makes the goal the person's.

`<goal>` shows `(typed)` after a typed goal. The rule: a typed goal is the person's. Never reword, replace or retire it before it is met. Move its milestones as any goal's.

A typed goal can stall when a milestone has no linked work. The `no work linked` mark asks the call to link, close or drop that milestone, so the goal can still be met. When its work stops altogether, it stays until its milestones are done or the person edits or removes it.

## A removed goal

The person removes a goal with a new Remove button beside Edit. The goal and its milestones go, every link goes, and the goal's key words join `removedGoals`, the last 10. `<removed>` lists them, and code drops a GOAL that restates one. The call may still infer a different goal later.

Remove offers Undo in its place, beside New. Undo brings back the goal, its milestones and their links, and takes the goal out of `removedGoals`. `goalRemoved` holds them until a goal is set or the answer of a Status call that did not read the removed goal applies. Row Undos last a few seconds. This one lasts until the call moves on, so no look needs a timer, and a slip of the `r` key is never final before the person sees it.

Saving the field empty does not work as a removal. In every look an empty field refuses to submit today: `sendTyped` in `hooks/register.tsx` (terminal and desktop) refocuses the field, the Codex tab's form returns, and `handleKey` in `omp/src/panel-keys.ts` ignores enter. Changing that in four looks also makes an accidental empty enter delete the goal.

A goal the call retires does not join `removedGoals`: the work left it, the person did not reject it.

## Today's rules and what each becomes

| Today | After |
| --- | --- |
| `goal-from-person`: GOAL only from the person's words | Deleted. Condition 2 of `goal-when-clear` lets the work show the goal too. Condition 3, which code enforces, and the `no-goal-yet` replay guard against over-inference. |
| `goal-finish-line` | Kept, as condition 1 of `goal-when-clear` |
| `goal-not-again`: never propose the goal, a proposal or a declined goal again | Becomes: never write the goal in <goal> or a goal in <removed> again, in the same or other words |
| `goal-belongs-to-person`: GOAL only proposes | Deleted. Replaced by `goal-typed-kept`: never replace or retire a typed goal before it is met |
| `milestones-are-outcomes` | Kept. Adds: never name a milestone after a subject |
| `milestones-for-new-goal` | Kept, for a typed goal |
| `serves-every-subject` | Kept, with the check of `-` links above |
| — | New `goal-wait`: when the next goal is not clear, write no GOAL and wait. `goal-when-clear` covers a met goal's next one |
| — | New `goal-work-left`: when the session's work no longer moves an inferred goal forward, close its stale linked subjects, then replace it with GOAL, or write RETIRE when no next goal is clear |
| — | `milestones-are-outcomes` adds: code closes a milestone when its work closes, and the call reopens it with SET when work is left. New `milestone-no-work` for the mark. |
| — | New `serves-in-outcome`: a subject serves a milestone only when finishing it is part of the milestone's named outcome. A broad name such as "Cleanup done" is not a home for later work, which gets `-`. `milestone-no-work` and `serves-every-subject` say "part of its outcome" too. |
| — | New `goal-outcome-happened`: when the exchange shows the goal's outcome happened, write DONE for each open milestone, so the goal is met. Prompt only: code cannot read the exchange. |
| `goal-work-left` | Kept. `<goal>` says `(no work for 55m)` once `goalLeftFor` finds the work has left the goal, the same test that lets GOAL or RETIRE apply, and the rule tells the call to write one of them for a goal so marked. |
| `proposedGoal`, `<proposed>`, Set as goal, Not now, the proposal's Edit, `ProposalBlock`, `useProposedGoal` (its milestone-saving part moves into `applyGoalOp`), `declineProposedGoal` | Deleted |
| `withRestatedGoalAsMilestones` | Kept |
| `declinedGoals`, `<declined>` | Renamed `removedGoals`, `<removed>` |

Each new rule is its own `GOAL_PARTS` entry, so the ablation can run without it.

## Saved state from older versions

The goal lives in the shared `SessionStatus`. Every host loads it through `upgradeSession` in `hooks/session-files.ts`, which runs `upgradeLedger` and `hooks/status-upgrade-goal.ts`. On load:

- A saved `proposedGoal` is dropped. If the goal is still clear, the next call sets it.
- `declinedGoals` moves into `removedGoals`. A declined proposal is the closest old thing to a removed goal.
- A saved goal with `isAwaitingMilestones` true loads as `typed`: only a typed goal waits for its milestones.
- Any other saved goal with no `source` loads as `inferred`. Old state does not say whether the person typed it or pressed Set as goal on a proposal, and most came from proposals. Loading them as inferred lets the call manage goals that are stuck today. The cost: a goal the person typed in an older version can be replaced once its work closes.

## Each look

All four looks draw the goal from `goalPage` in `hooks/status-goal-page.ts` and its buttons from `goalKeyPlan` and `proposalKeyPlan` in `hooks/status-keys.ts`. The change is in those shared owners: `proposalKeyPlan` goes, and `goalKeyPlan` adds Remove goal. Each look then deletes its proposal drawing and draws the new button:

- **Claude Code terminal and Claude desktop pane** (`hooks/pane-status-goal.tsx`, `hooks/pane-status.tsx`): delete the proposal block and `answerProposal`.
- **Codex tab** (`codex/src/tab-status.tsx`): delete the proposal block and its keys. Rebuild the bundle.
- **omp panel** (`omp/src/panel-goal.ts`, `omp/src/panel-keys.ts`): delete the proposal entries and the s and x keys. Rebuild the bundle.

Remove goal is a visual change. Each look gets a mock in `.scratch/demo/`, which the coordinator shows Pete before the merge.

What stays the same in every look: the goal line, "Goal met", the count, the was line, the milestones, and the goal's Edit button. A goal the call replaced shows the old one as its was line until the person looks. That is the only sign the goal changed, and it already exists.

Checks per look: an inferred goal appearing, a met goal, a replaced goal with its was line, a typed goal, a typed goal waiting for milestones, and Remove goal.

## Evals

Replays to add, each with synthetic content:

| Replay | Steps | Checks |
| --- | --- | --- |
| `milestone-work-done` | 1. A milestone whose two subjects are done, still working. A second with one done and one working subject. A subject wrongly under Other work that serves the second. An exchange that names neither milestone. | The first milestone is done. The second is not. The stray subject links to the second. |
| `goal-met-next` | 1. The last milestone's work finishes. 2. The person asks for the next release, with a finish line and several pieces. | Step 1: goal met. Step 2: a new goal is set, with no press, and the old one is its was line. |
| `goal-from-work` | 1. No goal. The person says "keep going". The agent's reply plans three pieces toward one outcome with a finish line, and starts the first. | A goal is set from the work, with no words from the person naming it. |
| `goal-wait` | 1. A met goal. The person asks for two small unrelated fixes. | No new goal. The met goal stays. |
| `no-goal-yet` | From no goal: 1. One small bug fix. 2. Chit-chat about the code. 3. A coordinator's unrelated items. | No goal at any step. |
| `goal-work-left` | 1. An inferred goal A whose work is all done. The person starts work B with a finish line. 2. Parked: a goal B with queued work, and the person asks for a side fix. 3. The person resumes B. | Step 1: B replaces A. Step 2: B stays. Step 3: B stays, with its milestone ids and links. |
| `typed-goal-kept` | 1. A typed goal with its work queued. The person starts different work with a finish line. | The typed goal stays. |

Replays to change, since what they expect changes:

- `declined-goal` becomes `removed-goal`: the person presses Remove goal, then asks for the same outcome in other words. No goal.
- `coordinator-day` (Replay A): step 3 sets 2.5 at once, so its Press step goes. Step 13 sets nothing. Step 14 stays a typed goal.
- `single-task` (Replay B): step 1 sets the goal, so its Press step goes.
- `long-turn` (Replay C): step 4 sets the goal.
- `goal-awaiting-milestones` stays as it is. It checks that `withRestatedGoalAsMilestones` still works.

Eval rules: `proposal-only-when-stated` and `proposal-when-stated` become `goal-only-when-clear` and `goal-when-clear`. A new `typed-goal-kept` rule checks a typed goal survives. Every step that sets a goal targets `milestones-shape`, and a new rule fails a milestone named the same as a subject. That is where a GOAL with SERVES in one answer tempts the model.

Docs to update with the build: `GLOSSARY.md` gains goal, milestone, linked subject, inferred goal, typed goal and removed goal. `docs/plans/status/judging.md` and `docs/status-replays.md` gain the new rules and replays.

Pass bar, written before the run: every new replay passes on Sonnet and Codex. Each rule that both builds share, such as `milestones-true`, `serves-linked`, `milestones-shape` and `answer-readable`, does no worse than on a baseline run of `origin/next` beyond its noise. The changed replays' new expectations have no baseline, so they are judged by the bar alone.

## Decisions

The coordinator decided these from the project's principles: agents manage the goal so the person does not have to, and the better experience wins over the simpler build.

1. Code closes a milestone when its linked work closes, and the model can reopen it.
2. Old saved goals load as inferred, except one waiting for milestones, which loads as typed.
3. A Remove goal button in every look.
4. No label on an inferred goal.
5. A stalled typed goal gets the `no work linked` mark. The coordinator also allowed retiring it after 2 hours with none of its work open. `docs/principles.md` principle 8, merged later, says a typed goal is not replaced before it is met, so the build follows the principle and leaves that out.
6. A met goal stays until the next one is set.
7. Goals may be inferred from the work. Code needs an open subject outside the current goal, and the GOAL line's plan of 2 to 5 milestones. The `goal-wait` rule keeps a goal off one small fix, chat or unrelated small asks, and `no-goal-yet` tests it. A gate of two subjects outside the current goal refused the new goal in `goal-work-left` on Sonnet in 3 of 3 runs, because Sonnet wrote the plan's two pieces as one subject (`status-2026-11-05T00-14-34.920Z.json`).
