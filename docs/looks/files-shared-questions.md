# Files: shared modules for a question's body and previews

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `core/domain/question-checks.ts` | Shared module. A recorded question's body: its context, a note on each option and each option's preview, and how a record of the open question replaces them. What a recorded question or task lacks, which the record tool's answer names so the agent can record it again, including an approval with nothing to look at. It names only fields the agent's record tool has. |
| `core/domain/option-previews.ts` | Shared module. Reads the record tool's `previews`, one absolute file path or https link for each option. Builds the previews page's data for the comparison page template, with the recommended option first, and the open that Open previews runs. |
| `core/runtime/preview-pages.ts` | Shared module. Where a session's previews pages go, `previews/<host>-<session>-<item>.html` under the inbox's state folder. `withPreviewPages` names each open question's page on its item, and `writePreviewPages` writes those pages from the comparison page template and removes the session's others. Each host supplies the file calls and runs both after each agent tool call. |
