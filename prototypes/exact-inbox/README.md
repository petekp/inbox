# Exact Inbox prototype

This prototype runs Inbox as a privately installed web and native iOS app. A local helper lists compatible Claude Code sessions under the configured Herdr Core. Both clients can browse their inboxes. It can follow the isolated demo or an explicitly selected existing Herdr session. The existing Inbox plugin owns the session's ledger, model updates and actions.

The prototype covers Asks, Finds and a read-only Status view. It uses the shared row and action plans. Replies stay attached to their session and row, and a delivery confirmation clears only the text that was sent. Browser and iOS clients connect to the same local helper over private Tailscale HTTPS.

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

## Connect an existing Claude session

The helper reads `.scratch/exact-prototype/session-connection.json` when it starts. This selects the Core to browse and the sole session permitted to accept commands. Catalog metadata is saved privately in `session-catalog.json` beside it to retain ended and disconnected identities across helper restarts. Without that file, it follows the isolated demo. To select an existing session, the file needs these fields:

- `session`: the terminal's current `inbox.session` label.
- `terminal`: its local Core address.
- `socket`: the absolute path of that Core server's socket.
- `appHome`: the absolute path of Herdr's settings folder, which contains `inbox/sessions`.

Use the running Claude terminal's metadata to obtain the session and terminal values. Restart the helper after changing the file. Removing it and restarting returns to the demo. The demo start and stop commands always address the isolated demo, even while the helper follows a real session.

Remote hosts are configured in the private `.scratch/exact-prototype/remote-hosts.json` array. Each entry names `name` (the configured Core machine), `id` (its verified Core machine identity), and `appHome` (its absolute Inbox publisher folder). Verify these on the remote host before enabling the entry; do not assume its folder matches this Mac. Restart the helper after changing configuration. Reads require the configured machine identity to be connected and the envelope to match its running agent and session. Remote actions remain disabled.

The helper checks the selected session, terminal and publisher before accepting a press. It does not follow Herdr's focused tab or a replacement conversation. Receipts keep their original connection, so changing the selected session cannot redirect an earlier reply or its confirmation. An ended session shows as disconnected and keeps local draft text.

Wide web uses a session rail; iOS and narrow web use a Sessions tab. Navigation and drafts are saved on each viewing device. Newly discovered sessions are read-only. Only the explicitly pinned trial session accepts replies. Remote discovery can read a configured host’s published Inbox through Core’s existing SSH file-read operation. Unconfigured or incompatible remote publishers remain labelled unavailable or unsupported. Remote draft holds and durable acknowledgments still need the work in the roadmap before the clients can replace the existing Inbox.

The shared hosts publish protocol capabilities and durable command receipts. Their shipped model prompts and existing renderers remain unchanged.

Set `INBOX_EXPERIMENTAL_PROTOCOL=2` only after acceptance of the matching host and clients. In that mode, compatible local Claude sessions can accept validated commands. Older publishers, remote hosts, and unsupported adapters remain read-only. Without the flag, the pinned trial behavior described above remains in effect.
