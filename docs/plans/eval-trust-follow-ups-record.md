# Evals the release can trust: agent case grading follow-ups

Part of [Evals the release can trust](eval-trust.md), split from [eval-trust-follow-ups.md](eval-trust-follow-ups.md). These are gaps in how the agent suite grades a case's `record` calls and reply.

Status: building. Each item stays until the change that does it lands.

Each item names what it would catch. Remove an item when the change that does it lands.

- **A record that updates the open question counts as a second question.** `record-fact-question-not-design-choice` wants one `record` call. The first call's answer says the question has no `option_notes` and no `rec`, and asks the agent to record it again. In 2 of 5 Codex runs at 889ce236 (`agent-2026-11-23T03-37-50.044Z.json`), Codex did. The answer read "Already open, so this record updated it", so the inbox showed one question, but the case counted two calls and failed. Its rerun passed 17 of 20 with the first run (`agent-2026-11-23T04-21-38.805Z.json`). Counting a call whose answer reads "Already open" as an update of the first would make the case fail only on a real second question.
- **omp's reply to `close-already-closed` can leave out that the question was settled.** In 2 of 5 omp runs at 889ce236 the reply did not say the database was already chosen, and the case failed. Its rerun passed 17 of 20 with the first run (`agent-2026-11-23T04-22-13.003Z.json`). The case has no omp baseline. A 20-run `--set-baseline` on omp would tell a drop in this reply from noise.
