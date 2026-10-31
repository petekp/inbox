# One owner per question

Status: built.

The agent and the inbox model both write to the same open items. The agent records and closes with `record` and `close`. After each reply, the inbox model reads the reply and adds, closes and updates items with its `NEW:`, `CLOSED:` and `UPDATE:` lines. When the two disagree, the model's reading of the reply wins. In one long session that produced four kinds of mistake.

| What the person saw | Where it comes from |
| --- | --- |
| A second copy of a question the agent had just recorded, worded differently. | A `NEW:` line that `matchOpen` did not match to the agent's item. |
| An unanswered question closed as "no longer applies": once because the reply only reminded the person it was open, once with an answer inferred from an earlier message. | A `CLOSED:` line on an agent-recorded item (`hooks/model-text.ts`, the CLOSED rule). |
| A recommendation the agent never gave, on a question the model added from the reply. | The `rec` of a `NEW:` line, despite the rule that `rec` copies only a stated recommendation. |
| The agent closed a question to record it again with its own recommendation, and `record` refused: "the user already closed this". | `addAgentItem` blocks on any matching closed item except an expired one (`hooks/ledger-update.ts`), and `tools.ts` words every refusal as the user's close. |

Each item saves what added it in `from`: `'record'` for the agent's `record` call, and `'update'` for a `NEW:` or `TODO:` line. `label` cannot tell them apart, because a `NEW:` line with the label "-" saves `label: null`, as the agent's records do. An item saved before `from` existed reads as `'update'` and keeps the model's rules. A close by the agent has `how: 'claude'`, and a close by the model has `how: 'update'`.

## Changes

### 1. The agent owns what it records

- For an item with `from: 'record'`, apply a model `CLOSED:` line only when its outcome is the person's answer. Drop "done:" and "no longer applies:" closes of agent-recorded items. The agent closes those itself with `close`, which its guidance already asks for.
- Skip a `NEW:` line in a turn where the agent recorded an item of the same kind, so the model fills only gaps the agent left. A turn here is the person-prompt count, which the item saves as `turn`. A `NEW:` line that restates an open item still adds its `HELP:` steps to that item.
- Keep `UPDATE:` for agent-recorded items. It is how a recommendation the agent states in a later reply reaches the item, and it works today.
- Items from `NEW:` lines keep today's rules.

### 2. A record the agent closed can come back

- In `addAgentItem`, let a record through when the matching closed item has `how: 'claude'`. The agent closed it, so the agent may ask it again.
- Word the refusal by who closed the item. "The user already closed this" is right only for `answered` and `dismissed`.

### 3. Today's mistakes become eval cases

Add one case per row of the table above to `evals/cases/`, and to `evals/agent-cases/` where the agent's calls are what is checked:

- A reply that only says an item is still open leaves it open.
- A reply that asks a question and states no recommendation gives `rec` "-".
- A turn where the agent recorded a question adds no second copy.
- An agent close followed by a record of the same ask adds the item.

## Decisions for the owner

- **Stale questions (decided).** An item open for more than 12 turns expires (`STALE_AFTER` in `hooks/ledger-update.ts`), and a long session can keep a real decision open longer than that. Agent-recorded items (`from: 'record'`) are exempt from `STALE_AFTER`. Items from `NEW:` lines still expire after 12 turns. The `MAX_OPEN` cap of 20 still applies to every item.
- **Missed closes (decided).** With change 1, a question the work has made moot stays open until the agent or the person closes it. An occasional extra open row is accepted as the cost of never losing an unanswered decision.

## Checks

- Change 1 changes how the model's lines are applied, not the text it reads, so `systemText` can stay as it is. If the rule is moved into `systemText` instead, run `./scripts/eval.sh` as `AGENTS.md` requires.
- Change 2 changes a tool answer, so run `./scripts/eval.sh --suite agent`.
- Both are shared behavior. Rebuild the Codex and omp bundles, run `./scripts/check.sh`, and say for each look whether the change applies.
