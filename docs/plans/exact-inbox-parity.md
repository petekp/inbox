# Exact Inbox parity inventory

Status: building. Updated 2026-11-17. Tracks the [roadmap](exact-inbox-roadmap.md). Full parity remains unverified.

The installed iPhone build and helper support session views; the web bundle is on milestone 3, and the desktop Codex connection is off. Isolated Codex replies and phone loading passed; phone reply, full host, accessibility and motion checks remain. This branch drops the demo control.

Navigation uses the chosen wide-web rail and iOS/narrow-web Sessions tab; see [the decision](exact-inbox-navigation.md).

## Feature families and acceptance

Compare complete owner outputs at the same state and clock. Pair success with failure or interruption. IDs refer to [host capabilities][clients].

<!-- prettier-ignore -->
| Family | Owners and Codex reference | Current web / iOS | Host requirement and acceptance check |
| --- | --- | --- | --- |
| Session discovery and navigation | Prototype [binding][binding], [Core reader][core-reader]; [Herdr following][following] | Both: directory, search, rail or Sessions tab, and saved per-session navigation. Milestone 2 is implemented. | Verify the owning Core, publisher, live agent and session. List duplicate names and unsupported hosts honestly. Switch without changing Herdr focus or another device; restore tab, selection, scroll and draft. An ended or unreachable session never becomes another session. |
| Tabs, badges and empty states | [Tabs][tabs], [empty-tab][empty], [band][band]; Codex [chrome][chrome], [groups][groups] | Both: all four Inbox tabs, shared counts and shared empty results. Responsive and failure-state acceptance remains. | Use shared names, order, counts and empty results. Check loading, populated, empty, retrying and unreadable states, including narrow-width symbols. No failed update may appear as “Nothing needed.” IDs: `tab-symbols`, `prs-empty-hint`. |
| Asks content | [Rows][rows], [view][view], [inline text][inline]; Codex [rows][codex-rows], [list][list] | Both: shared option descriptions, recommendation reason, Holds up, earlier answers, inline text and step labels are projected. | Preserve complete question/task data from the host. Check long titles, context placement, recommended-option reason, option descriptions, linked steps and formatting. IDs: `asks-context-line`, `asks-rec-reason-line`, `asks-holds-up-line`, `dialog-descriptions`. |
| Row actions and option folding | [Action plans][plans], [presses][presses]; Codex [row-actions][row-actions] | Both: shared folded/full action plans, option expansion and per-session preference. Device-local and agent actions have separate execution paths. | Compare every planned action, order, emphasis, retry and disabled state. Test each offered option separately, many options, stale presses and a question back. A typed question back must follow its host's existing semantics. ID: `question-back-stays-open`. |
| Selection, arrival and collapse | [Action plans][plans], [arrivals][arrivals], [collapse][collapse]; Codex [selection][selection], [read][read] | Both: shared arrival selection, snapshot-based collapse records and inline drafts. New row information clears a prior collapse. PR scroll has its own saved position. Broader arrival and interruption acceptance remains. | Arriving rows must not steal an active reply. Preserve explicit collapse, select the next waiting row after handling, restore after Undo, and follow the shared empty-tab rule. IDs: `pr-arrivals`, `collapse-rows`. |
| Replies, drafts and held rows | [Timing][timing], [session presses][session-presses]; Codex [press UI][press-ui], [row-actions][row-actions], [page swap][swap] | Both: durable recovery, viewer leases and remote holds. Confirmation clears only the unchanged submitted draft. Milestone 3 acceptance passed. | Include owning-host identity when sessions can span Cores. Keep edited and failed drafts through switching, closure, expiry, restart and update. Preserve a held closed row until shared rules release it. A different viewer cannot prune it. |
| Receipt and delivery states | [Host presses][host-press], [feedback][feedback], [session presses][session-presses]; Codex [rows][codex-rows] | Both: durable host outcomes, duplicate handling and restart recovery. Installed milestone 3 passed web and iPhone reply checks. | Distinguish accepted command, delivered message and the agent's reply. Check rejection, stale state, duplicate request, interrupted delivery and delayed acknowledgment. Talk remains working until answered; a hand-off confirms only what happened. IDs: `pending-answer-mark`, `dim-pressed-button`. |
| Settling, Undo and list activity | [Timing][timing], [held sends][held-sends], [row motion][row-motion]; Codex [settle][settle], [list input][list-input], [Undo key][undo-key] | Both: basic settled labels and Undo. Native isolated answer/Undo was exercised. Viewer activity, complete fold timing and motion remain partial. | Normalize host/device time. Preserve the Undo deadline and space; wait for active input or delivery before folding. Check late reads, clock skew, background expiry, a typed message and Undo during another press. IDs: `settle-window`, `fold-on-typed-message`, `fold-waits-for-list-use`. |
| Closed history and restoration | [Rows][rows], [ledger close][ledger-close], [plans][plans]; Codex [groups][groups] | Both: Closed and earlier folds, with Reopen only when the saved source supports restoration. Web fixture restoration passed. | Show outcomes and reasons using shared labels. Expand earlier entries, reopen a dismissed item, and retain draft-held closure without treating every closed item as reopenable. |
| Finds grouping | [Help marks][help], [plans][plans], [rows][rows]; Codex [groups][groups] | Both: shared Issues/Opportunities grouping, counts, tones and action plans. | Preserve groups, counts, tones and action plans. Check Fix, File issue, Discuss, Reply and Dismiss against the owning host. No finding duplicates an ask. |
| Open, copy and Compare | [Effects][effects], [open targets][open-targets], [Compare text][press-text]; Codex [press UI][press-ui] | Both: device copy, HTTPS opens, scoped private file snapshots and trusted-template comparisons. Browser opens remain unconfirmed when acknowledgment is unavailable. | Copy/open on the viewing device with row feedback. Serve only authorized host artifacts when needed. Verify unavailable files, rejected opens and Compare completion for each host. IDs: `link-open-rule`, `compare-page`, `compare-in-background`. |
| Status content and hierarchy | [Status page][status-page], [goal page][goal-page], [Status path][status-path]; Codex [Status UI][status-ui] | Both: shared goal, milestones, subjects, children, counts, prior text, merged text, idle ages and failures. Native simulator display checked. | Project shared hierarchy into Contract-compatible keyed rows without recomputing its decisions. Check goal/milestones, subjects, children, counts, was/merged lines, idle ages and failures. IDs: `status-tab`, `status-children`, `child-names`, `status-idle-age`, `status-failed-warning`, `turn-working`. |
| Status actions and seen-state | [Status keys][status-keys], [Status children][status-children], [session Status][session-status]; Codex [Status UI][status-ui], [shown rows][shown] | Both: goal editing/removal/Undo, ask navigation and folds. Visible lines report represented subjects. Goal changes passed web and simulator checks; full seen-state acceptance remains. | Execute every goal/milestone/subject plan. Report only visible rows after the shared viewing interval. Directory browsing must not mark sessions seen. Preserve changes another viewer has not seen. IDs: `status-view-ask`, `status-goal`, `status-done-fold`, `status-named-fold`, `seen-on-screen`. |
| PR data and display | [PR view][pr-views], [PR rows][pr-rows], [host PRs][host-prs]; Codex [PR UI][pr-ui] | Both: shared PR blocks, threads, failing/cancelled checks, ordering and notices. Native simulator display checked; failure variants need acceptance. | Keep credentials and fetches on the host. Report active PR-tab visibility so shared refresh cadence applies. Check tracked/branch PRs, thread/check groups, cancelled checks, partial fetch, missing gh, sign-in and rate limits. IDs: `gh-signed-out-notice`, `pr-fetch-notice`. |
| PR actions and agent order | [PR plans][pr-plans], [PR order][pr-order], [PR presses][pr-presses]; Codex [PR UI][pr-ui] | Both: shared PR plans use durable commands when the host advertises support. HTTPS opens stay local. Duplicate, stale and re-run checks use fixtures. | Render complete thread/check/block/tab plans. Check Fix, Draft, Discuss, Open, Merge hand-off, Re-run, Refresh, Rank again, dismiss/Undo and Clear finished. Re-fetch read-first actions; preserve ranking and changed-since-order state. Use fixtures or safe repositories. IDs: `pr-order`, `pr-rank-again`, `clear-merged-and-closed-prs`, `pr-check-rerun`. |
| Help, marks, version and demo | [Help][help], [marks][marks], [banners][banners]; Codex [chrome][chrome], [parts][parts] | Both: shared Help and key guidance, host version when available, running marks, and no user-facing demo. Help falls back to its bundled legend if the helper fails. | Match shared mark meaning, group placement, running/result marks, legend and applicable key guidance. Check version/build state. Recording/demo data stays in developer fixtures; the private clients omit the demo control intentionally. IDs: `help-page`, `version-label`, `running-marks`. |
| Banners, recovery and host waits | [Banners][banners], [view][view], [host differences][host-differences]; Codex [chrome][chrome], [trust][trust] | Both: connection, update failures, receipt errors, offline snapshots, hook-trust notices and shared stop banners. Resume is advertised only by capable Claude/omp hosts; Codex does not support it. Full host-wait acceptance remains. | Preserve error ordering, retry/reload actions and stale-read age. Claude/omp stops and supported Resume must not vanish because Codex lacks them. Permission waits must not invent a remote approval capability. ID: `band-and-stop-rows`; Codex-only `hooks-need-trust`. |
| Visuals, motion and input | [Layout][layout], [row motion][row-motion]; Codex [motion][motion], [parts][parts], [styles][styles] | Both: shared row motion and guarded actions, tab/row shortcuts, wraparound selection and input-field isolation. Web retains a draft across an immediate reload. Native simulator checks cover keyboard input and sampled collapse/reopen frames; full physical-device and accessibility acceptance remains. | Match reference density, hierarchy and emphasis at agreed widths. Check full hit areas, interruption/reversal, no jumping or vanishing content, focus, reduced motion, keyboard, safe areas, Dynamic Type and VoiceOver on real targets. |

The parity branch recognizes Claude, Codex and omp publishers in Herdr Core. Acceptance covers local and remote Claude plus an opt-in isolated Codex adapter across web and the iOS simulator; this original chat stays disabled.

<!-- prettier-ignore -->
| Host family | Existing responsibility and evidence | Acceptance before enabling Exact writes |
| --- | --- | --- |
| Agent updates and history | [Session host][session-host], [turns][turns], [session Status][session-status]; each host owns its events and model calls. | Preserve `catch-up`, `failed-update-recovery`, `ledger-behind-state`, `fork-ledger`, `exchange-trigger`, `status-mid-turn-refresh`, `host-task-list`, `status-call-records`. Use each host's real event wiring; do not run another updater in Exact. |
| Tools, dialogs and activity | [Tools][tools], [dialogs][dialogs], [host differences][turn-differences]; Codex [dialogs][codex-dialogs]. | Preserve `dialog-outcome`, `dialog-answer`, `dialog-answer-closes-copy`, `tool-result-line`, `ran-call-activity`, `ran-call-delegates`, `tool-output-urls`, `pr-link-from-output`. Exercise allowed/refused calls and the host's dialog-answer format. A generic reply is not automatically a permission approval. |
| Herdr publication and presentation | [Herdr publication][herdr-publish], [Herdr integration][herdr]; current Exact [binding][binding] requires a matching live supported publisher. | Preserve `herdr-sidebar`, `herdr-look`, `herdr-open`, `herdr-install` in existing hosts. These do not require a web button that opens a Herdr pane. Verify publication and command capabilities independently of desktop presentation; document each applicable difference. |
| Upgrade and coexistence | [Host differences][host-differences], Codex [state][state] and [page swap][swap]. | Version new command/viewer contracts and upgrade saved state. Keep pending actions, drafts and existing viewers through update/rollback. Reject incompatible publishers before allowing writes. Preserve the return path to the old client. |

Navigation keeps ledgers separate; selecting a session sends no message.

## Desktop Codex adapter

The adapter uses a private Unix socket, an explicit chat allowlist and the existing host. Discovery is passive. The original desktop chat remains unchanged.

<!-- prettier-ignore -->
| Interface proved by source | Owning code | Implication for the adapter |
| --- | --- | --- |
| A session has saved JSON state, upgrades and locked updates. | [state.ts][state], [codexStore][codex-host], [dataDir][data-dir] | Resolve the installed data root and explicit thread. Retain the existing ledger. A missing file yields empty state, so first establish that the session exists. |
| The shared view derives from saved state. | [core.ts][codex-core], [session view][session-view] | Read state and construct a pure view. Select display fields; host state and `lastActions` contain additional data. |
| Routing comes from MCP call metadata. | [server-tools.ts][server-tools]: `sessionOf` | `x-codex-turn-metadata.session_id`, `thread_id` or `threadId` selects the session. The `inbox_press` argument `thread` is a stale-view guard, not the routing authority. A network caller must not supply arbitrary trusted metadata. |
| `inbox_view` and `inbox_press` run the host's interaction flow. | [server.ts][server], [server-host.ts][server-host] | `inbox_view` can release held sends, write viewing state, fetch PRs and start catch-up. Reuse these operations deliberately; they are not read-only directory probes. |
| Delivery calls `codex queue --thread … --message …`. | [server-host.ts][server-host], [cli.ts][cli] | Reuse CLI discovery and `--resume` detection. Success means accepted/queued. Failures can be unconfirmed; there is no caller-supplied queue idempotency key. |
| Presses synchronize turn state and link running dialogs before applying shared actions. | [server-host.ts][server-host], [codex dialogs][codex-dialogs] | Do not reduce a row action to raw queue text. Keep stale checks, dialog formatting, Undo release, local effects and response reconciliation. |
| Views perform hook-trust and history recovery. | [server-trust.ts][trust], [server-catch-up.ts][catch-up], [history.ts][history] | Retain diagnostics and guarded recovery. Do not add another model-update loop or show untrusted hooks as an empty inbox. |
| The Herdr file consumer requires a Herdr terminal environment. | [server-herdr.ts][server-herdr], [codexStore/publication][codex-host] | Existing desktop chats outside Herdr have no proved publication path through that consumer. Do not invent a terminal label or move the chat merely to reuse it. |
| Current viewing fields assume one tab per thread. | [server.ts][server], [core.ts][codex-core], [session presses][session-presses] | `tabSeenAt`, `shownTab`, `lookRows`, `heldRows` and `shownSince` still describe the local MCP view. Reuse the existing remote viewer leases and shared aggregation for concurrent desktop/web/phone use. |
| Draft text is kept by the renderer. | [tab-state.ts][tab-state], [page swap][swap] | Draft text is in the tab map/sessionStorage; host holds contain identities/times. State-file access cannot migrate drafts. Define a transfer or retain the original tab. |

Resolve data-root/thread mapping, CLI capability, hook state and compatibility read-only with no private details in public notes. Build around existing host ops, verify an isolated Codex session first, and preserve identities, decisions, history and drafts alongside the current Inbox.

[clients]: ../../core/domain/clients.ts
[binding]: ../../prototypes/exact-inbox/bridge/binding.ts
[core-reader]: ../../prototypes/exact-inbox/bridge/core.ts
[following]: ../../herdr/src/follow.ts
[tabs]: ../../core/view/tabs.ts
[empty]: ../../core/view/empty-tab.ts
[band]: ../../core/view/band.ts
[chrome]: ../../codex/src/tab-chrome.tsx
[groups]: ../../codex/src/tab-groups.tsx
[rows]: ../../core/view/rows.ts
[view]: ../../core/view/view.ts
[inline]: ../../core/view/inline.ts
[codex-rows]: ../../codex/src/tab-rows.tsx
[list]: ../../codex/src/tab-list.tsx
[plans]: ../../core/view/action-plan.ts
[presses]: ../../core/domain/presses.ts
[row-actions]: ../../codex/src/row-actions.tsx
[arrivals]: ../../core/view/arrivals.ts
[collapse]: ../../core/view/collapse.ts
[selection]: ../../codex/src/tab-selection.ts
[read]: ../../codex/src/tab-read.ts
[timing]: ../../core/view/timing.ts
[session-presses]: ../../core/runtime/session-presses.ts
[press-ui]: ../../codex/src/tab-press.ts
[swap]: ../../codex/src/tab-swap.ts
[host-press]: ../../core/runtime/host-press.ts
[feedback]: ../../core/view/feedback.ts
[held-sends]: ../../core/runtime/held-sends.ts
[row-motion]: ../../core/view/row-motion.ts
[settle]: ../../codex/src/settle.ts
[list-input]: ../../codex/src/list-input.ts
[undo-key]: ../../codex/src/undo-key.ts
[ledger-close]: ../../core/domain/ledger-close.ts
[help]: ../../core/view/help.ts
[effects]: ../../core/runtime/press-effects.ts
[open-targets]: ../../core/domain/open-targets.ts
[press-text]: ../../core/domain/press-messages.ts
[status-page]: ../../core/view/status-page.ts
[goal-page]: ../../core/view/status-goal-page.ts
[status-path]: ../../core/view/status-path.ts
[status-ui]: ../../codex/src/tab-status.tsx
[status-keys]: ../../core/view/status-keys.ts
[status-children]: ../../core/domain/status-children.ts
[session-status]: ../../core/runtime/session-status.ts
[shown]: ../../codex/src/tab-shown.ts
[pr-views]: ../../core/view/pr-views.ts
[pr-rows]: ../../core/view/pr-rows.ts
[host-prs]: ../../core/runtime/host-prs.ts
[pr-ui]: ../../codex/src/tab-prs.tsx
[pr-plans]: ../../core/view/pr-tab.ts
[pr-order]: ../../core/view/pr-order.ts
[pr-presses]: ../../core/view/pr-press.ts
[marks]: ../../core/view/marks.ts
[banners]: ../../core/view/banners.ts
[parts]: ../../codex/src/tab-parts.tsx
[host-differences]: ../looks/differences-hosts.md
[turn-differences]: ../looks/differences-agent-and-turns.md
[layout]: ../../core/view/layout.ts
[motion]: ../../codex/src/tab-motion.ts
[styles]: ../../codex/src/tab-css/
[session-host]: ../../core/runtime/session-host.ts
[turns]: ../../core/runtime/session-turns.ts
[tools]: ../../core/runtime/tools.ts
[dialogs]: ../../core/domain/dialogs.ts
[codex-dialogs]: ../../codex/src/dialogs.ts
[herdr-publish]: ../../core/remote/herdr-app.ts
[herdr]: ../../core/remote/herdr.ts
[state]: ../../codex/src/state.ts
[codex-host]: ../../codex/src/host.ts
[data-dir]: ../../codex/src/data-dir.ts
[codex-core]: ../../codex/src/core.ts
[session-view]: ../../core/view/session-view.ts
[server-tools]: ../../codex/src/server-tools.ts
[server]: ../../codex/src/server.ts
[server-host]: ../../codex/src/server-host.ts
[cli]: ../../codex/src/cli.ts
[trust]: ../../codex/src/server-trust.ts
[catch-up]: ../../codex/src/server-catch-up.ts
[history]: ../../codex/src/history.ts
[server-herdr]: ../../codex/src/server-herdr.ts
[tab-state]: ../../codex/src/tab-state.ts
