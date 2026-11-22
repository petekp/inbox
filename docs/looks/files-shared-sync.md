# Files: shared modules for the band, sync state and press checks

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `core/view/band.ts` | Shared module. The band's counts, whether the rows may be missing some, and what the band reads with no counts: "Nothing needed", with a running mark while the ledger's sync state is checking, or "May be out of date" while it is stale or unavailable. While the agent's own dialog waits, it reads that the agent is waiting, in the words the empty Asks tab takes as its title. |
| `core/view/sync-state.ts` | Shared module. `viewSync` derives the sync state of each source the view draws from: the ledger, the Status page, each PR's view and the turn. `SyncInputs` carries what only the host knows: a read that failed, a PR fetch that runs, a turn it could not read, and the demo. `PR_FRESH_MS` is how old a PR's view may be and still count as fresh. |
| `core/domain/stops.ts` | Shared module. `withApiError` gives a stop its `apiError`, read from `detail` for a stop an older build saved. |
| `core/domain/preconditions.ts` | Shared module. A press check, `Precondition`, is what must still hold when a host applies a press. `rowVersion` hashes a row's content. `refusal` gives the text of the first check that fails, or null. `PRESS_LIFETIME_MS` is how old a Herdr press or remote command may be. `preconditionsOf` reads checks from a file. |
| `core/view/press-preconditions.ts` | Shared module. `drawnVersions` gives the version of each row a view draws and each drawn PR's head commit. `drawnPreconditions` gives the checks a press carries from the view it was pressed in. |
