# Owners: the Status page

Part of [the look map](../looks.md#who-owns-each-rule).

| Rule | Owner | Read by |
| --- | --- | --- |
| Status reads the task tree as facts. It can update the head, goal and links from open asks or live Children to existing task ids. It never creates, closes, renames or relinks a task. Legacy subject and milestone reply lines are ignored. | `hooks/status-prompt.ts`, `hooks/status.ts`, `hooks/status-ops.ts`. | Claude Code, Codex and omp Status calls. |
| The Status work rows are top-level tasks, grouped into one row per stream when they share a stream id. Each row shows the weighted completed-work percentage derived from task facts. | `hooks/status-page.ts:statusPage`, `hooks/task-tree.ts:weightedTaskProgress`. | The shared Status view model, before each look draws it. |
| Task freshness follows task facts. The view compares each task's `updatedAt` with the last Status look and any rows missed during that look. | `hooks/status-page.ts:statusPage`. | All four looks. |
| The page keeps the head, goal, Now line and live Children. A goal is met when every task linked by `goalId` is done or dropped. Goal controls, Undo and refusal state remain; legacy saved subject and milestone fields remain until their migration is removed. | `hooks/status-goal-page.ts:goalPage`, `hooks/status-goal-gate.ts:isGoalMet`, `hooks/status-goal-ops.ts:settleGoal`, `hooks/status-keys.ts:goalKeyPlan`. | All four looks. |
| An open ask links to task ids. The Status row shows the ask-held mark, and Asks names the linked open tasks. | `hooks/status-ops.ts:applyOps`, `hooks/status-page.ts:statusPage`, `hooks/view.ts:inboxView`. | All four looks. |
| The shared page model chooses rows, their order, marks, folds and action plans. A look draws those rows and actions in the shared order. | `hooks/status-page.ts`, `hooks/status-page-parts.ts`, `hooks/action-plan.ts`. | Terminal, Claude desktop pane, Codex tab and omp panel. |
