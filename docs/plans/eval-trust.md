# Evals the release can trust

Status: built. The follow-ups are under "Not in these steps".

Every release relies on the two eval suites in `./scripts/eval.sh` (AGENTS.md, "Text a model reads"). An audit of both, checked by two adversarial reviews, found that a green run shows only that nothing broke badly on these fixtures. It does not show that a wording change is safe. This plan makes a run's result mean what the release takes it to mean.

## What a run gets wrong now

| Problem | Effect |
| --- | --- |
| The model suite's Claude calls load the person's own `CLAUDE.md` | `claude -p` without `--setting-sources ''` read the runner's private rules: a probe asked for its instructions and got their first line. Results depend on whose machine ran them. |
| The Codex calls load the person's `~/.codex/AGENTS.md` | The agent suite links it into each run's `CODEX_HOME`. The model suite's call, the product's own `codexAsk`, reads it too, despite `--ignore-user-config` and `project_doc_max_bytes=0`. So does every user's inbox model in Codex. |
| The model suite runs Sonnet at the CLI's default effort | The product runs it at `effort: 'low'` (`hooks/claude-host.ts`). The eval is kinder than the product. |
| The model suite grades with `applyUpdate` | The product applies `applyExchangeUpdate`, which keeps an item the person asked to explain open. The eval is stricter than the product there. |
| `--agent omp` in the model suite runs Claude and labels it omp | `run.ts` casts any value to an agent. An unknown `--case` name is dropped, and a selection with no cases passes. |
| A run records no commit, date or model id, and writes results only with `--out` | No log can say what it tested. |
| A failed call counts as a behavior failure | A timeout reads the same as a wrong answer. |
| A red case is rerun until it is green | 0.2.10's `done-message-blocked-task` went 5 of 8, then 16 of 16 on a rerun, with no rule for which result counts. |
| The bar is 6 of 8 or 4 of 5 | The regression AGENTS.md cites kept dismissed questions closed in 78% of runs (87166b6). It passes 6 of 8 three times in four. |
| The code drops some regressions before the checks see them | `repeatsClosed`, `matchOpen` and `isTakenUp` drop a NEW line that restates a closed or open item. A prompt change that makes the model re-add a dismissed question can pass. Grading the raw answer instead would fail today's prompt: 5d508fd measured 73 of 104 before the code. |
| Some checks are too loose | `numbered-questions-all-kept` passes when five questions are merged into one. `narrowed-question-new-options` checks neither the count nor the recommendation. The id check also flags "F1". |
| 0.2.10's rule to say how the agent took an answer has no check | Reverting it would pass. |
| Four cases flip between runs | `device-command-is-terminal`, `dialog-about-finding-escaped`, `done-message-independent-task` and `done-message-blocked-task` caused every red run in the last seven full logs. `set-aside-finding-stays-open` keeps a stale `min.codex: 0.4`. |
| The agent suite may not test the guidance | The tool descriptions and the case prompts already say much of what the guidance says, and no run has measured the suite without it. Step 2 measured it: 14 of 15 cases pass without the guidance. |

## Steps

### 1. Fix the harness

No model calls, except one targeted run per changed check.

- The model suite runs Claude with `--setting-sources ''` and `--effort low`. The agent suite stops linking `AGENTS.md`.
- `codexAsk` runs the inbox model in its own `CODEX_HOME`, which holds only a link to the person's `auth.json`. This fixes the product too, so the model suite tests the product's own isolation.
- The model suite grades with `applyExchangeUpdate`, as the product does.
- Both runners reject an unknown agent, an unknown case and an empty selection.
- Every run writes its results, by default to `evals/results/`, which Git ignores. Each file records the commit, whether the tree had changes, the date, the CLI versions and the model each answer came from.
- A failed call is retried twice. A case whose calls keep failing is reported as not run, never as passed or failed.
- The model suite prints, for each case, how many NEW lines the code dropped. This is for reading only: it is not a check.
- The loose checks get exact counts. A check covers 0.2.10's answer rule. The id check matches only lowercase ids, of any length.
- A check pairs each `new` pattern with its own item, so one merged item cannot pass two.
- A session that can reach more than the stand-in inbox stops the whole run, with no retry. A runner that throws records the run as not graded. Results are written as each run lands, so a run cut short keeps them. A run with a case not graded exits 2, a stopped run 3.
- Each results file records a hash of every text the models read and of the cases file, and the diff when the tree had changes. `--with` judges a rerun together with the first run and refuses one that tested other text.
- The model suite records each call's time and output tokens, and notes runs past the mod's 45 s limit and 1600 tokens. Times are measured with six calls in parallel, so they run longer than the mod's one call. It lists the asks of NEW lines the code dropped.
- A baseline is set only from 20 or more runs that could all be graded, for the cases selected, and is compared only with runs on the same model. A run falls below it when its count would happen less than 1% of the time by chance.

### 2. Measure the guidance

The agent suite gets `--no-guidance`. One run of Claude on all 15 cases, at 5 runs each, is 75 sessions. A case that passes without the guidance tests the tool descriptions and the prompt, not the guidance.

Result, on 0195b98 with a clean tree (`evals/results/agent-no-guidance-2026-10-21T06-35-46.075Z.json`): 14 of the 15 cases pass without the guidance. Only `no-finding-user-only` fails, 2 of 5: Claude listed the options without asking a question. `record-question` passed 4 of 5 and missed the same way once. Every other case passed 5 of 5. With the guidance, `no-finding-user-only` passed 5 of 5 in the last two full agent runs before this one.

So on Claude, the agent suite shows it needs the guidance for one rule: that the agent asks in its reply as a direct question. The tool descriptions in `hooks/tools.ts` and the inbox text are enough for the other 14 cases. This is a control of 5 runs on one agent, with the whole guidance removed. It does not show how Codex or omp behave without the guidance, or what removing one rule would do. It does show that these cases cannot catch the loss of the whole guidance on Claude, so they cannot be counted on to catch the loss of one rule. Cases that fail without the guidance are follow-up work: see "Not in these steps".

### 3. Mutation tests

Each mutant is applied in a throwaway worktree and never committed. Predictions are written here before the runs:

| Mutant | Cases | Prediction |
| --- | --- | --- |
| M1: remove the sentence in `systemText` saying a reason is not a recommendation (2312d4f) | `reason-not-recommendation`, Sonnet, 8 runs | Below the bar. History measured 3 of 8 without it. |
| `<decided>` removed from the inbox model's prompt | `dismissed-question-stays-closed`, `old-dismissed-question-stays-closed`, Sonnet, 8 runs | The cases pass, while the raw answers re-add the dismissed question. That proves the code masks the regression. If the cases fail, the code is not masking it. |

Results, on 0195b98 with each mutant applied. The files are in `evals/results/`, named `mutant-m1-model-…` and `mutant-decided-model-…`:

| Mutant | Result |
| --- | --- |
| M1 | 5 of 8: below the bar, as predicted. The failures are the reason read as a recommendation. The margin is one run. |
| `<decided>` removed | 16 of 16 passed, as predicted. Every raw answer re-added the dismissed question, and the code dropped all 16. |

The dismissed cases now also check `{"dropped": 0}`: the code must drop no NEW line. Today's prompt passes it 32 of 32, on Sonnet and Codex (`model-2026-10-21T06-41-22.448Z.json`). With `<decided>` removed, Sonnet fails both cases 0 of 8, and Codex fails `old-dismissed-question-stays-closed` 0 of 8. Codex still passes `dismissed-question-stays-closed` 8 of 8 without the block, so that case does not test the rule on Codex.

M2, restoring the old rule for unrelated items, waits for step 4, since its cases flip now. M4, softening the id rule, is not run on Claude: step 2 showed the id cases pass there with no guidance at all, so removing the id rule cannot fail them. It stays open for Codex and omp, after a control run on each.

### 4. Settle the flipping cases and add baselines

- Read the failure lines of the four flipping cases, and fix the fixtures where they are ambiguous. A case that needs a rule change in model-read text is a separate change, with its own full rerun and approval.
- Drop the stale Codex override.
- Run the key cases 20 times to set a baseline. These are the dismissed cases, the four flipping cases, and the cases for 0.2.10's changed rules. The baseline is stored with its commit, date and model ids. The runner then reports a case as below its baseline when a one-sided binomial test says so, beside the fixed bar.

Results, on the 0.2.10 candidate:

- The full suites under the fixed harness found two red cases on Sonnet that earlier runs, at default effort and with the runner's own rules loaded, had hidden. `task-about-finding-replaces-it` went from 46 of 48 on 0.2.9's NEW rule to 16 of 32 after the dialog clause was added to it. Moving the clause after the finding sentences brought it to 16 of 20, with every dialog case still passing. `done-message-independent-task` passed 13 of 32: Sonnet closed an unrelated question with reasons such as "not related to this exchange". The update now ignores such a close, and the case passes 20 of 20.
- The model suite's baselines cover the dismissed cases, the four flipping cases, the cases for 0.2.10's changed rules, and the answered-question follow-up: 20 runs each on Sonnet and Codex (`model-2026-10-21T15-09-47.710Z.json`). The agent suite's cover `record-question`, `no-finding-user-only` and `close-answered-says-answer` on Claude, Codex and omp (`agent-2026-10-21T07-16-18.231Z.json`).
- `old-dismissed-question-stays-closed` passes 14 of 20 on Sonnet: in 6 runs the inbox model re-added the dismissed question, and the code dropped it, so the person never saw it. Its bar on Sonnet is 0.6, its measured rate, and its baseline catches a decline.

## The rerun rule

A red case is not rerun until it is green. It gets one rerun at three times its runs. The bar applies to the combined count, and every attempt stays in the results.

## Not in these steps

Each item names what it would catch. Remove an item when the change that does it lands.

- **Agent cases that fail without the guidance,** one for each of its rules, so a change to `guidanceText` is tested.
- **`no-task-for-own-step` separates weakly on Claude.** Without the guidance it passed 3 of 5 on one run and 1 of 5 on another, so a run of 5 does not reliably tell guided from unguided. A case where the unguided agent fails every run would catch the loss of the "take the step yourself" rule.
- **A second agent case that separates guided from unguided runs on Claude.** With the guidance in `close`'s description, the control (`--no-guidance`, 5 runs) failed one case of 16, `no-finding-user-only` at 3 of 5. If the guidance's other rules were cut, garbled or truncated past the 4096-character cap, the other 15 cases would still pass. A case for each rule that fails without it would catch that.
- **The direct-question rule under realistic replies.** `no-finding-user-only` passes 5 of 5, but in 0.2.10's live pass the agent missed the rule three times. Opus ended replies with "let me know which you prefer" and "I recommend no". Haiku ended one with "my recommendation: accept both". Cases where the reply ends with a recommendation or a list of options would catch it.
- **The agent suite on Haiku and Sonnet.** A past id leak (30e03f0) showed only on Haiku, and the desktop app in the release VM runs Haiku.
- **No-guidance controls on Codex and omp,** as step 2 ran on Claude, before M4 is run there.
- **M2, restoring the old rule for unrelated items.** Step 4 settled its cases, so it can run now.
- **A harder positional-answer case.** `close-answered-says-answer` passes, but in a live pass Codex saved "the second one" as the answer. A case with more options, or the answer in a longer message, would catch it.
- **A false "done:" close.** In 0.2.10's live pass, the inbox model closed a question the agent had just asked. Its reason was "done: sleep ran in foreground, so the question is moot", but the command had been blocked. The guard in `applyUpdate` catches only "no longer applies" reasons with no grounds. A model case would measure how often it happens.
- **`task-about-finding-replaces-it` back to its 0.2.9 rate.** It passes 16 of 20 on Sonnet, against 46 of 48 on 0.2.9's NEW rule. The live pass saw the miss: the inbox model added the question but wrote no ASKED line, so the finding stayed open.
- **The two dismissed-question cases swing too much on Sonnet to judge a text change.** On `main` at 67f1c82, with the same text and model, they passed 13 and 21 of 32 in one run and 89 and 78 of 96 in the next. Most failures are not misses. `old-dismissed-question-stays-closed` fails on its `dropped: 0` check when the code has already dropped the repeated question, so nothing reaches the person. `dismissed-question-stays-closed` counts "Merge PR #41 now, without a feature flag?" as the dismissed question, because its `notNew` pattern matches any "flag". Passing a repeat the code dropped, and matching only the dismissed question, would let a run of these cases show what a text change did.
- **Check patterns that miss a correct wording.** `answered-question-follow-up-added` matched only "size", so Codex failed 2 of 8 runs that added the follow-up as "Should the product API cache use 64 MB or 256 MB?" (`model-2026-10-26T06-30-33.393Z.json`). Its pattern now also takes a size in MB. A pass over the other `new` and `notNew` patterns, against the wordings in past results, would catch a case that fails a correct answer or passes a wrong one. The agent suite's `reply` patterns need the same pass: `no-finding-progress` looks for "memoiz", and failed 2 of 5 Claude replies that described the per-request cache in plain words (`agent-2026-10-26T19-39-22.773Z.json`).
- **Two versions compared in separate runs.** The low run above ran beside two other eval runs, and the cause of its drop is not known. Running both versions in the same hour, one after the other, at 96 runs each, would keep load or a model change from reading as an effect of the text.
- **omp's inbox model,** and its fallback to omp's `@smol` model.
- **Repeats between open and finished subjects on the Overview.** `subjectsNotRepeated` compares open subjects only. A check that also compares each new subject with the finished ones would catch a NEW that starts finished work again under another name.
- **Repeats under different names.** `subjectsNotRepeated` now compares names only: two subjects repeat when every key word of one name is in the other. It used to compare names with texts, and three delegated parts that all read "awaiting review" counted as one. It now misses the same work under two names where neither holds all the other's key words, such as "Coupon total" and "Checkout total". A check that also compares the texts, and ignores status words such as "awaiting review" or "underway", would catch that.
- **Overview cases over many exchanges.** `overview-long-session` is one exchange against 12 subjects. Replays of real sessions found failures that build up over 30 or more exchanges: a LINK repeated for a child already linked, and a child linked to the wrong subject and moved later. A case that applies each answer before the next exchange would catch drift that one exchange cannot.
- **Process steps in a subject's text.** `featureLevel` catches commands, files, hashes and counts, but not text that narrates the session's own process, such as "review agents running" or "waiting on the build". A check for that would catch a subject whose text restates its children instead of where the work stands.
- **Agent cases showing the closed, carried-over and answer notes,** and Codex's guidance delivered as the plugin delivers it, at session start.
- **Agent cases that send the press messages.** Every agent reads the texts in `messages` in `hooks/presses.ts`, but agent cases hold a fixed prompt, so no suite runs those texts. A case whose prompt is built from `messages.explain` or `messages.finding` would catch an Explain text that makes the agent rename a question's options, act on the item, or answer at length. With a draft of the short Explain text, 8 of 10 Claude replies did not use both listed names for "Redis / In-memory", and one called them "Shared store / Each its own".
- **An agent case that sends the Compare message.** `messages.compare` asks for a lot: work outside tracked files, a background subagent where one can run, a page built from the template with measures ranked by what the person would notice, a reply with no table, and a closing `record` of the question. A case whose prompt is `messages.compare` on a small repo would catch an agent that edits a tracked file, ranks the choices by how much code each takes, writes data the page cannot draw, or never records the question again. That last miss leaves the row reading "Comparing…" until the person presses Compare again or dismisses it. `record-repeat-adds-step` and `compare-page-step-is-built-page` cover only the closing reply and `record`, from a fixed prompt, since an agent case cannot build the page.
- **The Compare cases do not check that the question stays open.** After its closing `record`, Claude sometimes closes the open question and records it again, then says it closed it by mistake. The row gets a new id, and the old one moves to Closed. `record-repeat-changes-rec` did this in 2 of 5 Claude runs (`rec-update-agent.json`). `compare-page-step-is-built-page` did it in 1 of 5 on the 0.2.13 candidate, before the record answer named a changed recommendation (`agent-2026-10-27T21-44-22.432Z.json`). A `close` check with `count: 0` in the Compare cases would catch it.
- **A reply that changes its recommendation and still leaves the old one showing.** `changed-recommendation-reaches-agent-question` passes 8 of 8 on Sonnet and on Codex, and every answer is a correct `UPDATE` line (`rec-update-ledger.json`). A live reply that changed its recommendation still left the old one showing. Its ledger answer was not looked at, so the cause is not known. A case built from that reply's wording would catch the miss.
