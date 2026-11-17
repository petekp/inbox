# Exact Inbox roadmap

Status: building. Milestones 1 and 2 are implemented. Milestone 3 is in final acceptance; ordinary activation remains held. The clients are privately installed, with Codex Inbox as the visual and behavioral reference.

The destination is a session browser that opens a complete Inbox for any supported active Herdr session. A person can find the session that needs them, answer it, and return to another session without losing their place or draft. Each session retains its own Status, Asks, Finds and PRs.

## Starting point and scope

The prototype has demonstrated the full connection through Exact, a local helper, Herdr Core and private Tailscale HTTPS. A signed iPhone app is installed. Both clients have displayed an existing Claude session, and a web reply reached that session with an exact confirmation. The original task remained open. Earlier isolated checks exercised native replies and Undo; the existing-session phone check was read-only.

The helper currently pins one session. It validates the Core socket, terminal, session and publisher, and keeps receipts attached to their original connection. The clients show partial Asks and Finds, a simplified read-only Status, and locally saved drafts. This is a working trial, not a parity release.

| Area | Current state | Completion milestone |
| --- | --- | --- |
| Session navigation | One pinned Claude session | 2, then interactive use after 3 |
| Delivery and drafts | Exact confirmations and local drafts; missed acknowledgments and concurrent holds remain limited | 3 |
| Asks and Finds | Partial shared rows and actions; closed folds and restore controls missing | 4 |
| Links, files and copying | Local actions visible but unavailable | 4 |
| Status | Simplified read-only projection | 5 |
| PRs | No client view | 5 |
| Codex and omp sessions | Current binding accepts Claude only | 5 |
| Visual and interaction parity | Codex is the reference; the current look differs | Throughout, final gate in 6 |
| This Codex desktop chat | Still uses its existing Inbox | 6 |

The milestone 3 integration passed the full repository gate before its final launcher adjustments. Live acceptance is being repeated on the integrated host and the AppDrop-installed iPhone build. Physical touch and accessibility remain later acceptance requirements.

The reference is the current Codex implementation and shared rules, not a screenshot alone. Start from [the look map](../looks.md), [Codex's file map](../looks/files-codex.md), [the feature record](../../hooks/clients.ts), and [the prototype](../../prototypes/exact-inbox/README.md). The inspected repository base is `3701e97c14f6dfe571a42121d49749f2e8793cdb`; the prototype is working-copy code. Refresh the reference when implementation starts and track subsequent changes explicitly.

Private installation remains a product constraint. Agent state, model credentials and GitHub credentials stay on their owning computer. Tailscale supplies private connectivity. The helper exposes Inbox operations, not Core's unrestricted terminal API.

A combined feed of every session's rows, agent launching, terminal control, public hosting and push notifications are outside this parity milestone. Navigating between session inboxes is in scope. Bringing this existing Codex desktop chat into the web app is a later adoption gate within this roadmap, because it needs a host adapter beyond the current Herdr terminal connection.

## Delivery milestones

### 1. Define parity and choose the session-browser layout

Build an executable acceptance inventory from the Codex adapter and shared owners. For every feature, record its owner, web and iOS status, host prerequisites, verification evidence and any justified platform difference. The existing feature record is a starting point; it does not enumerate every row control or transition.

Separate host behavior from renderer behavior. Catch-up, dialog handling, ledger updates and PR fetching remain host responsibilities. Exact must expose their resulting states and controls without creating a second ledger or model-update loop.

Inventory host-only states too: stops, sign-in failures, permission waits and Resume where the owning host supports them. Codex omits some of these. Its renderer alone cannot define coverage for Claude and omp.

Check the existing Codex desktop chat's state and delivery interfaces read-only during this milestone. Establish a supported adapter path before depending on the final handoff. Keep implementation and migration in milestone 6; record any host limit now.

The [navigation decision](exact-inbox-navigation.md) uses a persistent session rail on wide web and a dedicated Sessions tab on iOS and narrow web. The tab opens a full session-list view. Preserve the approved inline question expansion. The [parity inventory](exact-inbox-parity.md) records feature coverage and the desktop adapter feasibility findings.

Use Codex's typography, density, hierarchy, action placement and theme treatment from the first implementation. Adapt touch targets and native navigation for iOS. Physical layout can differ; labels, actions and outcomes should agree.

Exit condition: a reviewed parity inventory and a chosen web/iOS navigation treatment. Any unsupported Exact primitive gets a small feasibility probe before committing to the design. This gate chooses presentation; it does not require another visual redesign of Inbox's contents.

### 2. Navigate active Herdr inboxes

Discover eligible sessions from live Core terminals and their published Inbox envelopes. A live terminal alone is insufficient: a kept shell may still carry an old session label. Verify the running agent, publisher compatibility and exact session identity.

The session browser should provide the session title, project and host identity, working/waiting state, and shared counts of what needs the person. Distinguish sessions with duplicate titles. Keep ordering stable while counts update. Support finding a session by title or project; choose grouping and sorting in milestone 1 rather than inventing another priority model.

Opening a session selects it on that viewing device. It must not follow Herdr focus, change another device's selection or send a message. Remember each session's tab, expanded rows, scroll position and draft. Browser Back should return through navigation meaningfully; iOS should provide the corresponding native back behavior.

When a selected session ends, retain its identity and unsent text with an explicit ended state. Never substitute the next session. A disconnected host means its activity is unknown, not that all its sessions ended. Keep unsupported publishers distinguishable from empty inboxes.

Start discovery on the configured local Core. For sessions on another configured Core host, discover their owning helper and published state there. An address returned by Core does not establish that its Inbox files are locally readable. Verify host identity and private reachability before enabling that session. No public relay is required.

Exit condition: web and iPhone can browse eligible sessions and return to the same place in each. Exercise duplicate names, busy and waiting agents, a replaced conversation, a shell with stale labels, a disconnected host and reconnect. Until milestone 3 passes, newly browsed sessions remain read-only; the existing pinned trial retains its bounded behavior.

### 3. Make replies reliable across sessions and devices

Carry an immutable host/session identity through reads, commands, receipts and drafts. Keep it distinct from the terminal address and human-readable name. Validate the current item and action again when applying a command. A click rendered for an old conversation must never become a command for its replacement.

Replace the single latest-press acknowledgment with command-specific outcomes that can be recovered after reconnect or helper restart. Journal acceptance before effects, deduplicate retries at the host boundary, and reconcile delivery with the owning host. Do not infer success from matching text alone. When the host cannot establish delivery, retain an explicit uncertain result and the draft rather than automatically sending again.

Keep command acceptance, message delivery and the agent's reply as separate states. A delivered Explain request remains in progress until its answer arrives; accepting the command alone cannot show completion.

Give each viewer its own draft holds and viewing state. Aggregate active holds at the host before pruning rows; define expiry and explicit release. A stale viewer must not retain everything forever, and another viewer must not remove a row still being edited. Keep unsent draft text across app restarts, including after its row closes or the session ends. Reopening a closed row must use the shared action rules.

Define which timestamps come from the host and how device viewing times are reconciled with them. Track each viewer's active tab, visible rows and recent list activity, with expiry when it backgrounds or disconnects. Preserve the shared Undo window, folding rules, Status seen-state and PR refresh cadence despite clock differences and network delay.

Older publishers must fail safely. Add capability/version checks, saved-state upgrades and an installation sequence before enabling new commands. Shared host changes must preserve terminal, desktop, Codex, omp and Herdr behavior.

Exit condition: exercise simultaneous viewers, competing answers, an edited draft during confirmation, identical item IDs across sessions, switching during delivery, host restart, lost acknowledgments and offline recovery. A repeated accepted command does not run its effects again; an uncertain command remains visibly uncertain. Include clock skew, delayed reads and viewer background expiry. An isolated host test precedes a deliberate live reply on web and on a physical iPhone.

### 4. Complete Asks, Finds and local actions

Render the shared row descriptions and complete action plans in their prescribed order. Include question context, option notes, recommendations, “Holds up,” task instructions, finding groups, all options, replies, follow-ups and disabled states. Preserve the shared distinction between a reply, an answer and a new question.

Add settled rows, delivery feedback, Undo, Closed folds, earlier entries, dismissed-row reopening and draft-held closed rows. Preserve arrival selection, collapse behavior, empty states and the rule that a failed read cannot appear as “Nothing needed.” Keyboard actions and clicks must produce the same result.

Run HTTPS opening and copying on the viewing device. Resolve host files, generated Compare pages and host-only effects through an explicit scoped capability. A local path on the agent's Mac is not an iPhone path. Keep file access limited to the requested artifact; retain the existing routing rules on the agent computer for host-side opens. Show immediate row feedback and an honest failure when an action cannot run.

Exit condition: compare the complete shared row/action outputs and representative transitions with Codex on the same fixtures. Verify choice, reply, discuss/explain, dismiss, undo, reopen, compare, copy and open paths on both targets. There must be no unlisted missing action.

### 5. Complete Status, PRs and supported hosts

Restore the full Status hierarchy, goal and milestone presentation, goal editing/removal, ask navigation, named and done folds, child-session state, idle ages and failure handling. Report only Status rows actually visible on that viewer. Browsing the session directory must not mark every session's Status as seen.

Implement the complete PR view from the shared PR plans: groups, review threads, checks, agent ordering, changed-since-order state, rank again, refresh, clear finished PRs, settling and Undo. Preserve sign-in, rate-limit and partial-fetch notices. Keep GitHub operations on the owning host and show their result on the relevant row.

Complete Help, marks, key guidance, version information, banners and applicable diagnostics. Register the supported Exact looks in the parity documentation and enforce justified differences mechanically. Do not equate Codex-only hook mechanics with requirements for a Claude host; preserve each host's documented semantics.

Remove the current Claude-only connection assumption through explicit adapters for compatible Codex and omp sessions in Herdr. Verify each host's publisher, action delivery, dialogs, recovery and update triggers before enabling its commands. Unsupported hosts remain labelled until their adapter passes; deferral is not a permanent parity exception.

Exit condition: the parity inventory has evidence for every supported feature on web and iOS, or a documented host/platform limit. PR effects use fixtures or safe test repositories for verification. Supporting a Codex session in Herdr does not yet prove access to this Codex desktop chat outside Herdr.

### 6. Prove daily use and enable the Codex-chat handoff

Complete visual and interaction checks throughout the milestones, then run the final comparison at matching widths, themes and representative states. Check mid-transition frames, interrupted/reversed motion, reduced motion, keyboard focus, touch targets, software keyboard, safe areas, Dynamic Type and VoiceOver. Share the behavior of Codex's row-motion state machine; verify how Exact's native renderer realizes it rather than assuming CSS motion transfers unchanged.

Exercise app background/foreground, Mac sleep, Tailscale loss, helper restart and app update with drafts present. Define private setup, startup, upgrade and rollback for the helper and signed iOS app. Keep build and simulator work on the other MacBook. Any shared infrastructure or credential changes require their own concrete approval.

Run focused checks as work lands. Run the required repository/release checks with approval for full suites and separately budgeted model evals where prompts or model-read contracts change. Resolve or explicitly account for the existing check failures. Physical touch and accessibility checks remain required; the earlier simulator framework failure is not a permanent waiver.

Add the adapter for this existing Codex desktop chat without transferring ownership of its state or running duplicate updates. Prove that session identity, item IDs, history, decisions and drafts survive, and that replies reach the original chat. Keep the existing Codex Inbox available as a return path.

Exit condition: use real work across supported active Herdr sessions from web and iPhone without losing drafts, misrouting replies or concealing stale data. Complete the parity inventory and the controlled Codex-chat handoff before treating the new client as the primary Inbox.

## Delivery order and completion rule

Milestones 1 and 2 establish navigation. Milestone 3 gates interactive use across sessions. Milestones 4 and 5 complete the Codex experience on that foundation. Milestone 6 gates adoption. Discovery and rendering work can proceed while command reliability is being improved; broad live writes cannot.

Keep visual verification and accessibility in each milestone, not only the final pass. Update this roadmap and its parity inventory as evidence changes. Schedule estimates should follow the navigation choice and the acknowledgment/hold feasibility work; the earlier single-session estimate does not price this roadmap.

Completion means that each supported session exposes the same applicable information, actions, order and outcomes as Codex, with recorded native differences. The session browser adds navigation without blending sessions' ledgers or decisions. The installed clients remain private and usable through the user's own hosts.
