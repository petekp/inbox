# Evals the release can trust: model calls that fail

Part of [Evals the release can trust](eval-trust.md), listed in its [follow-ups](eval-trust-follow-ups.md).

Status: building. Each item stays until the change that does it lands.

Each item names what it would catch. Remove an item when the change that does it lands.

- **A Codex call that hits a usage limit reads as "codex gave no answer".** In 0.8.0's release pass, the account got `429 Too Many Requests` on `gpt-6.1-sol`, and codex-cli retried with a wait of about 335 s. The ledger suite timed each call out at 120 s and recorded "codex gave no answer". The agent suite waited 300 s per call and logged "codex exited -1". Neither results file names the limit. Reading Codex's `--json` error events and recording "rate limited" would tell a usage limit from a hang, and could stop the run early.
- **A Status step whose call failed is graded on the page before it.** In 0.8.0's release pass at a4c9842a (`status-2026-11-25T06-39-15.837Z.json`), 216 of Codex's 281 steps had `isStatusFailed`, after 120 s calls the account's rate limit had held up. Each was graded on the unchanged page and counted against the rules, so 752 rule failures came from pages no answer had touched. The only sign was "Status calls: codex 263 of 340" at the end of the log. Treating a step with a failed call as not run, and exiting 2 when too few steps were graded, would keep an outage from reading as a regression.
- **Status results depend on how loaded the machine is.** The runner drops a Sonnet answer that comes back after the host's 45 s, as the host does. In 0.8.0's release pass, a full Sonnet run at a load average of about 300 had 54 of its first 124 Status calls come back late. Its single-task replay then failed steps 7 to 9 in 3 of 3 runs, though the same text had passed every run an hour before. A rerun at a load average of about 95 had no late calls in 275 and passed. The log does not say how many answers were dropped this way. Printing the late count per agent, and treating a run with late calls as not graded, would keep a busy machine from reading as a regression.
