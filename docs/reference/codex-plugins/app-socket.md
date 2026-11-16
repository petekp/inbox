# The ChatGPT app's IPC socket

The ChatGPT desktop app's main process runs a message router on a Unix socket. The app's own windows use it to pass
requests about a chat to the window that owns the chat. The inbox uses one of its requests,
`thread-follower-steer-turn`, to put a press's message into a running turn (`codex/src/app-steer.ts`). The socket and
its messages are internal to the app. No OpenAI doc describes them, and any app release may change them.

Sources: ChatGPT.app `app.asar`, read on the development Mac (26.1106.51428, Codex CLI 0.167.0-alpha.4.1) and in the
inbox-ui VM (26.1111.21308, Codex CLI 0.169.0-alpha.11.1). Live checks: the inbox-ui VM on 2026-11-16, with a scratch
client and then the inbox's server.

## The socket

- **Path.** `<codex home>/ipc/ipc.sock`, where the Codex home is `CODEX_HOME` or `~/.codex`. When that path is over 103
  bytes (107 on Linux), the app links `/tmp/codex-ipc-<uid>/<sha256 of the real ipc folder>` to the folder and listens through the link.
  On Windows it is the pipe `\\.\pipe\codex-ipc`. [source]
- **When the app is closed** the socket file stays, and connecting fails at once with `ECONNREFUSED`. [live]
- **Frames.** Each message is a 4-byte little-endian length, then that many bytes of UTF-8 JSON. The largest frame is
  `0x10000000` bytes. [source]

## Messages

A client first says who it is:

```json
{"type":"request","requestId":"<uuid>","sourceClientId":"initializing-client","version":0,
 "method":"initialize","params":{"clientType":"inbox"}}
```

The router answers `{"type":"response","requestId":"…","resultType":"success","method":"initialize","result":{"clientId":"<uuid>"}}`.
Later requests carry that `clientId` as `sourceClientId`. [live]

For every other client's request, the router asks each client whether it can handle it with
`{"type":"client-discovery-request","requestId","request"}`. A client that handles nothing answers
`{"type":"client-discovery-response","requestId","response":{"canHandle":false}}`. [source, live]

The steer request:

```json
{"type":"request","requestId":"<uuid>","sourceClientId":"<clientId>","version":1,"timeoutMs":70000,
 "method":"thread-follower-steer-turn",
 "params":{"conversationId":"<thread id>","clientUserMessageId":"<uuid>",
  "input":[{"type":"text","text":"<text>","text_elements":[]}],
  "restoreMessage":{"id":"<same uuid>","text":"<text>","cwd":"<cwd>","createdAt":<ms>,
   "context":{"prompt":"<text>","addedFiles":[],"fileAttachments":[],"ideContext":null,"imageAttachments":[],"commentAttachments":[]}},
  "serviceTier":null,"attachments":[],"additionalContext":null,"toolOutput":null}}
```

- The window that owns the chat calls the app-server's `turn/steer` with the turn it runs as `expectedTurnId`. It answers
  `{"type":"response","resultType":"success","method":"thread-follower-steer-turn","result":{"result":{"turnId":"<turn id>"}}}`.
  [source, live]
- `restoreMessage` must be an object: the window reads `context.commentAttachments` from it. The fields above are the
  app's own smallest form. [source]
- Both app versions use version 1 for this method. A window answers a request of another version with
  `request-version-mismatch`. [source]

## What a steer does [live]

- The message joins the running turn. In the VM the answer came 5 ms after the request, and the rollout saved the message
  in that turn 8 ms after it. The app drew it as a plain user message with no queue entry, and the turn's reply followed
  it.
- It works while the app's window shows another chat.
- Steered text in the dialog's reply form, `<send_user_message_question_reply>…</send_user_message_question_reply>`,
  answers an open `request_user_input_async` dialog. The dialog and the chat's "Needs input" badge went at once, the app
  drew the answer card, and the same turn replied with the answer. The form is in "The dialog's reply" in
  [exec-and-transcripts.md](exec-and-transcripts.md).
- Codex runs `UserPromptSubmit` for steered input as for any prompt (`core/src/hook_runtime.rs:inspect_pending_input`,
  openai/codex `main`, read 2026-11-16). [source]

`thread-follower-submit-user-input` takes `{conversationId, requestId, response}` and answers a pending server request
for user input. Only the blocking `request_user_input` tool makes one, and Codex offers that tool only in Plan mode. The
`request_user_input_async` dialog makes no request, so this method cannot answer it, and the inbox does not use it.
[source]

## Errors

The router's own errors are strings in `error`, with `resultType: "error"`. [source]

| Error | When | Did the message reach the chat? |
| --- | --- | --- |
| A window's message, as `Cannot steer conversation <id> because its active turn already ended` | The turn ended (2 ms, live) | No |
| A window's message, as `Conversation <id> is not being streamed` or `Cannot steer conversation <id> without an active turn id` | The window does not stream the chat, or the turn got no id within 30 s | No |
| A window's message after its own `turn/steer` call timed out (30 s) | The app-server did not answer the window | Unknown |
| `no-client-found` | No window claimed the chat (10 s, live, for an unknown id) | No |
| `request-version-mismatch`, `no-handler-for-request` | The window does not know the request | No |
| `request-timeout` | The window did not answer within `timeoutMs` (default 10 s) | Unknown |
| `client-disconnected`, `server-closed` | The window or the router went away with the request out | Unknown |

## How the inbox uses it

`codex/src/server-host.ts:sendMessage` steers only when the chat's turn runs and the rollout's `session_meta.originator`
is `Codex Desktop`, so a chat in a terminal never waits on the router. A steer that reached the chat reads arrived at
once (`SendOutcome.isInTurn`). Every other case queues with `codex queue`, as before:

- The window waits up to 30 s for the turn's id, then up to 30 s for the app-server's `turn/steer`. The inbox gives the
  router a `timeoutMs` of 70 s and stops waiting at 75 s, so the answer is almost always the window's own. [source]
- A steer that failed in any way queues only when the rollout holds no user message with the same text saved since the
  press. A message that lands after that check would arrive twice.
- A change to the protocol shows as one of the errors above, so presses fall back to the queue.
- When no window owns a chat the app started, the router answers `no-client-found` after its discovery wait, so the
  press reads "Sending" for about 10 s, then queues. Which chats this reaches is unverified.
- A chat whose hooks Codex skips has no saved rollout path, so the inbox sees no running turn and queues.

Live in the inbox-ui VM on 2026-11-16 (26.1111.21308): during one running turn, an answer pressed on a dialog's inbox
copy steered the reply form. The dialog and "Needs input" closed, and the app drew the answer card. A second answer
steered as a plain user message with no queue entry. Both rows read arrived, and the turn's one reply gave both answers.
Codex's `UserPromptSubmit` for each steered message counted it as a turn start (`presence.turnsStarted` went 1 → 3), and
the update after the turn applied all three.
