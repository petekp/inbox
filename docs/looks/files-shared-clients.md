# Files: shared parity record

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `core/domain/client-features.ts` | Shared module. `FeatureId`, every feature the parity record in `core/domain/clients.ts` covers, and the record's `ClientId`, `Client`, `PublishedLookId` and `LookTable` types. |
| `core/domain/clients.ts` | Shared module. The parity record: `CLIENTS`, built from one support table per host, and `PUBLISHED_LOOKS`, one table per look that draws a published session. |
| `core/domain/clients-claude-code.ts` | Shared module. How the Claude Code mod host supports each feature, and why where it does not. |
| `core/domain/clients-codex.ts` | Shared module. How the Codex host supports each feature, and why where it does not. |
| `core/domain/clients-omp.ts` | Shared module. How the omp host supports each feature, and why where it does not. |
| `core/domain/clients-herdr.ts` | Shared module. How the Herdr look supports each feature, which features its publishing host does for it, and why where it differs. |
| `core/domain/clients-exact-web.ts` | Shared module. How the private Exact Web look supports each feature, which features its publishing host does for it, and why where it differs. |
| `core/domain/clients-exact-ios.ts` | Shared module. How the private Exact iOS look supports each feature, which features its publishing host does for it, and why where it differs. |
