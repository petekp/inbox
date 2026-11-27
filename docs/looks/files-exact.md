# Files: the Exact Web and iOS looks (private)

Part of [the look map](../looks.md#files).

Exact Web (`exact-web`) and Exact iOS (`exact-ios`) share the Exact app under `exact/`, built with `.contract` views and a local TypeScript bridge (`exact/bridge/`). They are private looks (not yet publicly announced). `exact/tools/` holds client-bundled rules (`client-shared.js` via `exact/tools/prepare-client.ts`) and developer build/fixture helpers.

| File | Role |
| --- | --- |
| `exact/app.ts` | Exact client adapter. Implements the `answer` data-source handler and `grants` manifest for the Exact runtime: HTTP transport to the helper, durable press submission and recovery, local draft persistence, navigation state and cached snapshots. |
| `exact/client-cache.ts` | Exact client adapter. Reads and writes bounded per-origin offline snapshots of the directory and session views (`app:/data/views.json`). |
| `exact/client-navigation.ts` | Exact client adapter. Loads and stores per-session tabs, expanded rows, scroll positions and collapse preferences (`app:/data/navigation-v2.json`). |
| `exact/client-recovery.ts` | Exact client adapter. Manages device-side pending press journals (`app:/data/pending`), local drafts (`app:/data/drafts.json`), submission identity checks and reconnect reconciliation. |
| `exact/client-view.ts` | Exact client adapter. Runtime type guards (`isSnapshot`, `isReceipt`, `record`, `strings`) validating helper responses decoded on the client. |
| `exact/submission-id.ts` | Shared client/bridge helper. Computes deterministic SHA-256 submission identities (`submissionId`, `legacySubmissionId`) and defines `MAX_REPLY_LENGTH`. |
| `exact/view-limits.ts` | Shared client/bridge helper. Validates view request byte limits and entry counts (`viewLimitError`). |
| `exact/bridge/server.ts` | Exact helper host. Serves the built web assets and JSON API endpoints (`/api/sessions`, `/api/view`, `/api/press`, `/api/local`, `/api/viewer`, `/api/help`, `/api/artifact/`) over Tailscale-aware origin and identity checks. |
| `exact/bridge/core.ts` | Exact helper host. Connects to Herdr Core sockets via `hc` (`coreRequest`, `listTerminals`, `agentExec`) and manages isolated demo environment variables. |
| `exact/bridge/binding.ts` | Exact helper host. Resolves active local, remote SSH or desktop Codex session bindings and validates configured endpoints. |
| `exact/bridge/catalog.ts` | Exact helper host. Discovers eligible Claude, Codex, omp and desktop Codex sessions, tracks duplicate titles and persists the private session catalog. |
| `exact/bridge/desktop.ts` | Exact helper host. Speaks `core/remote/companion-protocol.ts` over a private Unix socket to read and act on opted-in Codex desktop chats without moving their state. |
| `exact/bridge/remote.ts` | Exact helper host. Reads configured remote SSH host settings and fetches published session envelopes over Core's `file.read`. |
| `exact/bridge/remote-clock.ts` | Exact helper host. Samples remote machine clocks and private file capabilities via `agentExec` for time-sensitive holds and Undo windows. |
| `exact/bridge/publication.ts` | Exact helper host. Validates and writes press files or version-2 remote commands to local or remote `<appHome>/inbox/presses/` and notifies the publishing host. |
| `exact/bridge/commands.ts` | Exact helper host. Admits, journals, deduplicates and reconciles row/PR/Status presses (`submitPress`, `readReceipt`) via `core/remote/herdr-press-write.ts` and version-2 commands. |
| `exact/bridge/local-actions.ts` | Exact helper host. Validates row/PR identity and prepares authorized copy effects and HTTPS or snapshot open effects for local execution (`prepareLocal`). |
| `exact/bridge/artifacts.ts` | Exact helper host. Captures bounded file and comparison-page snapshots served at `/api/artifact/` with CSP sandboxing (`artifactResponse`). |
| `exact/bridge/viewers.ts` | Exact helper host. Publishes viewer heartbeats (`heartbeat`) to keep per-viewer draft holds and seen-state accurate across concurrent devices. |
| `exact/bridge/view-request.ts` | Exact helper host. Parses and validates `POST /api/view` payloads, folds and collapse entries (`viewRequest`). |
| `exact/bridge/client-schema.ts` | Exact helper host. Projects `schema=2` view snapshots and preserves backward-compatible `schema=1` responses (`clientSnapshot`). |
| `exact/bridge/view.ts` | Exact helper host. Reads and verifies published envelopes via `core/remote/herdr-read.ts:readSession` (or Codex companion views) and runs `projectInbox`. |
| `exact/bridge/inbox-projection.ts` | Exact helper host. Calls `core/view/session-view.ts:sessionView` and `emptyTab`, computes row digests and assembles the full view snapshot (`projectInbox`). |
| `exact/bridge/collapse-view.ts` | Exact helper host. Normalizes saved collapse records through `settledCollapses` and captures pre-serialized collapse offers for toggling. |
| `exact/bridge/fold-view.ts` | Exact helper host. Builds `foldPlans` and collapse captures per tab from `tabFolds` (`projectFolds`). |
| `exact/bridge/banner-view.ts` | Exact helper host. Projects shared stop and failure banners plus authorized `Resume` actions (`projectBanners`). |
| `exact/bridge/row-view.ts` | Exact helper host. Projects Asks and Finds groups, inline spans, trees, option descriptions, settled rows and ordered `RowActions` (`projectRowGroups`). |
| `exact/bridge/status-view.ts` | Exact helper host. Projects the Status goal, milestones, subjects, children, spacing pads and connector joints (`projectStatus`). |
| `exact/bridge/pr-view.ts` | Exact helper host. Projects PR blocks, review threads, checks, order sections, readiness and PR actions (`projectPrs`). |
| `exact/bridge/help-view.ts` | Exact helper host. Serves the shared key legend, mark legend and host version label (`helpView`). |
| `exact/bridge/render-version.ts` | Exact helper host. Computes SHA-256 render digests over projected snapshots so motion and polling skip unchanged draws (`renderVersion`). |
