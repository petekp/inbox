# Evals for the inbox model managing the goal

Status: built

Part of [agent-managed-goal.md](agent-managed-goal.md).

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
