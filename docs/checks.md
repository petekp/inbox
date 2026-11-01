# Checks

What the repo's automated checks cover. [The look map](looks.md) lists owners and differences.

`scripts/check-structure.mjs` checks the parity record in `hooks/clients.ts` against "Differences on purpose", as described there. It also parses imports and resolves their targets. It follows local import chains, including type bridges. Shared modules retain their shared-only restriction through those chains, and Codex cannot reach nonshared hooks through another local module. It includes build-shared tones and type imports. Shared modules and Codex reject computed targets. The only exception is a direct `import(url)` in the top-level `codex/src/server-main.ts:load` function. Nested functions do not inherit that exception. That function selects installed or dev handler URLs for hot reload.

The script also checks that omp's files import only shared modules, and that only `omp/src/host.ts` imports omp's packages. It checks plan status lines, file references and links. Its owner-symbol check only verifies that a word occurs in the referenced file. It does not establish a definition or semantic freshness.

`codex/tests/structure.spec.ts` checks the command against disposable fixtures. Mounted row-action tests check Codex controls and outcomes. The mod demo test checks terminal and desktop titles and actions, with settled rows and PRs outside that test. Full-page behavior, native painting, clipboard, focus and measured motion still need their own checks.

`omp/tests/session.spec.ts` runs the shared session script from `tests/session-script.ts` against omp's `SessionHost`. `omp/tests/panel.spec.ts` checks that the panel draws buttons in the shared plan order, in place of the demo test in `tests/hooks.test.ts`.

`scripts/check-versions.mjs` checks that `.claude-plugin/plugin.json`, `codex/plugin/.codex-plugin/plugin.json` and `omp/package.json` give the same version. `codex/tests/versions.spec.ts` checks it against disposable manifests.

`scripts/check-sizes.mjs` fails on a tracked file over 5,000 tokens, counted as bytes / 4. `.token-ceilings` lists the files allowed over that limit, one `path ceiling` entry per line, and the check fails on a listed file past its ceiling. It skips the files the token-limit pre-commit hook skips: lockfiles, built and generated files, binaries, and files marked `linguist-generated` in `.gitattributes`. Where that hook is installed, the check also runs the hook's `--scan` and fails when the two find different files.

`./scripts/check.sh` runs formatting, file sizes, plugin validation, structure, the version check, the type checks, the test suites, and that the Codex bundles and `omp/dist/host.js` match their sources. Run it after every change. Model evaluations run separately when model-facing text changes.
