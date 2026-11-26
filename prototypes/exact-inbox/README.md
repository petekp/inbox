# Exact Inbox prototype

This prototype runs Inbox as a privately installed web and native iOS app. A local helper lists compatible agent sessions under the configured Herdr Core. Both clients can browse their inboxes. It can follow the isolated demo or an explicitly selected existing Herdr session. The existing Inbox plugin owns the session's ledger, model updates and actions.

The installed milestone 3 client covers Asks, Finds and a read-only Status view. The parity branch adds shared row content, history folds, Status controls and read-only PR display. Replies stay attached to their session and row, and a delivery confirmation clears only the text that was sent. Browser and iOS clients connect to the same local helper over private Tailscale HTTPS.

The Codex client is the reference for visual and feature parity. The chosen layout expands a question in the list, keeping the next ask visible. The [roadmap](../../docs/plans/exact-inbox-roadmap.md) covers session navigation, parity and the eventual handoff from the existing Codex chat.

## Run it

Build on a Mac with Bun, rustup and Xcode. The setup command installs the pinned framework prerequisites into the repository's ignored `.derived-data` folder. The framework revision is declared in [tools/paths.ts](tools/paths.ts). The setup and native build need substantial disk space and CPU time.

From this folder:

```sh
bun run setup
bun run agent:start
bun run agent:status
```

The demo agent uses a separate Claude configuration, workspace and Core socket under `.scratch/exact-prototype`. It asks about a fictional release note. Its model calls use the user's existing sign-in, and Inbox also runs its normal ledger and Status calls. The launcher limits the available tools for the demo. The tested session's asks came through the automatic ledger update, not direct `record` calls.

Start the local helper with the intended private HTTPS origin and the exact Tailscale user permitted to reach it:

```sh
INBOX_ORIGIN="$INBOX_PRIVATE_URL" INBOX_TAILSCALE_USER="$INBOX_OWNER_LOGIN" bun run start
```

It binds only to `127.0.0.1:8877`. Configure the same origin as `API_BASE_URL` in an untracked `.env.local`, then build both clients:

```sh
bun run build:web
bun run build:ios
```

`build:ios` produces a simulator app. For a paired iPhone, Exact needs an Apple Development identity and a provisioning profile covering the app and device:

```sh
DEVELOPMENT_TEAM="$INBOX_APPLE_TEAM" bun tools/exact.ts ios --device --phone "$INBOX_IPHONE_UDID" --json
```

The setup command installs both simulator and physical-device build libraries. When compiling on a separate Mac, `ios --device --unsigned --json` produces a device app for local signing. Sign its embedded libraries and app with the existing development identity, and embed the matching profile before installation. An unsigned build cannot run on an iPhone.

After reviewing the machine's existing Serve configuration, a separate private listener can expose the helper:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8877
```

The installed Tailscale client carries requests from the browser and iOS device. The helper checks forwarded identity and browser origins. It exposes Inbox reads and validated presses; Core's unrestricted API stays local.

The current installation can also keep its origin, owner login and port in `.scratch/exact-prototype/private-connection.json`. Environment variables take precedence. This file and `.env.local` contain installation details and remain outside Git.

Use the wrapper for Exact commands so builds keep their scoped caches, disable framework feedback and keep the simulator window hidden:

```sh
bun tools/exact.ts agent ios --sim "$INBOX_SIMULATOR_ID" "clock data" "clock +10" tree
```

The wrapper keeps the simulator window hidden. The simulator itself is managed by macOS and must be shut down and removed separately when disposable verification ends. An iOS Simulator build does not establish signing or installation on a physical iPhone.

To stop the demo agent, run `bun run agent:stop`. Stop the helper by its process ID. Remove only this prototype's Serve listener with `tailscale serve --https=8443 off` when it is no longer needed.

## Connect an existing agent session

The helper reads `.scratch/exact-prototype/session-connection.json` when it starts. This selects the Core to browse and the default session. Protocol 2 permits commands to compatible local sessions. Catalog metadata is saved privately in `session-catalog.json` beside it to retain ended and disconnected identities across helper restarts. Without that file, it follows the isolated demo. To select an existing session, the file needs these fields:

- `session`: the terminal's current `inbox.session` label.
- `terminal`: its local Core address.
- `socket`: the absolute path of that Core server's socket.
- `appHome`: the absolute path of Herdr's settings folder, which contains `inbox/sessions`.

Use the running agent terminal's metadata to obtain the session and terminal values. Restart the helper after changing the file. Removing it and restarting returns to the demo. The demo start and stop commands always address the isolated demo, even while the helper follows a real session.

Remote hosts are configured in the private `.scratch/exact-prototype/remote-hosts.json` array. Each entry names `name` (the configured Core machine), `id` (its verified Core machine identity), and `appHome` (its absolute Inbox publisher folder). Verify these on the remote host before enabling the entry; do not assume its folder matches this Mac. Restart the helper after changing configuration. Reads require the configured machine identity to be connected and the envelope to match its running agent and session. Remote actions remain disabled.

The helper checks the selected session, terminal and publisher before accepting a press. It does not follow Herdr's focused tab or a replacement conversation. Receipts keep their original connection, so changing the selected session cannot redirect an earlier reply or its confirmation. An ended session shows as disconnected and keeps local draft text.

Wide web uses a session rail; iOS and narrow web use a Sessions tab. Navigation and drafts are saved on each viewing device. Without protocol 2, newly discovered sessions are read-only and only the pinned trial accepts replies. Remote discovery can read a configured host’s published Inbox through Core’s existing SSH file-read operation. Unconfigured or incompatible remote publishers remain labelled unavailable or unsupported. Compatible configured remote hosts accept protocol 2 commands and publish durable acknowledgments and viewer holds.

The shared hosts publish protocol capabilities and durable command receipts. Their shipped model prompts remain unchanged. The shared closed-history repair also updates restoration controls in the existing renderers.

Set `INBOX_EXPERIMENTAL_PROTOCOL=2` only after acceptance of the matching host and clients. In that mode, compatible local Claude, Codex and omp sessions can accept validated commands. Older publishers and unsupported adapters remain read-only. Without the flag, the pinned trial behavior described above remains in effect.

## Client compatibility

The installed first-generation client requests `/api/view` without a schema. The helper returns that client's exact fields, including nested rows and actions. New clients request `schema=2` for grouped rows, Status controls and PR display. Exact's native decoder rejects unknown fields, so adding fields to an existing response shape requires a new schema.

The parity build enables the shared PR controls only when the host advertises them. File actions capture the exact file offered by the current row as a bounded private snapshot. A browser reports that it requested an opening; it does not claim the new tab opened.


## Connect a desktop Codex chat

The desktop connection is optional. It uses the installed Codex Inbox host, preserving its ledger, update loop and original tab. It does not create a Herdr terminal or copy a chat into another host.

In the Codex plugin's data directory, create `companion.json` with mode `0600`:

```json
{
  "enabled": true,
  "sessions": [{ "id": "<existing-chat-id>", "name": "<chat-name>" }]
}
```

Only listed chats with an existing saved Inbox can be opened. An unreadable saved Inbox stays unavailable; removing its entry withdraws access. The original Codex tab keeps its own drafts and viewing state. Drafts are not transferred from the original tab.

In the helper's private runtime directory, create `desktop-hosts.json` with mode `0600`:

```json
[
  {
    "socket": "<codex-data-directory>/companion/bridge.sock",
    "profile": "<sha256-of-canonical-codex-data-directory>",
    "name": "<computer-name>"
  }
]
```

The profile is the SHA-256 of the UTF-8 canonical data-directory path. The helper verifies it against the socket's response. Both configuration files and the socket must belong to the current user and be private. The loader creates its socket directory with mode `0700`.

A first installation of the companion loader requires restarting Codex. Later handler updates reload through that loader on the next request. The connection is disabled when `companion.json` is absent or not enabled. Removing access takes effect on the next request; it does not cancel an already admitted command.

Catalog reads start no model work. Opening a chat uses the host's existing guarded recovery. Replies and viewer updates use the same durable host operations as the other private clients. This connection does not remotely approve host permission dialogs.

## Offline use

Each device retains bounded recent views and its own drafts. Unavailable hosts show the last loaded view as read-only. Explicit access refusals are not treated as network outages. Cached views do not make the web app's HTML available when its host is unreachable; an already loaded web app and the installed native app can retain their data.

The installed web and iOS clients have no sample-inbox control. Shared sample data remains in developer fixtures for testing. Upgrades discard saved demo navigation and return to the previous real session.

## Updating the private clients

Install the matching helper before the web and iOS clients. The newer clients use a POST view request and explicit recovery requests. Keep the previous helper and client artifacts together for rollback. A 404, 405 or 415 view response from an older helper leaves an existing snapshot read-only with an update message. An access refusal still hides it.

Recovery reconciles a saved operation; it does not create a new send. If the helper has no receipt for that operation, it records a final not-sent result and leaves the text as a draft. A deliberate Send creates a new operation. Older requests without an operation identity may explicitly retry a known refusal, stale result or failure; recovery never reopens those results.

The client sends viewer activity at the beginning of an input burst and on its periodic schedule. An in-flight heartbeat coalesces later activity into one update using the latest session and view state.
