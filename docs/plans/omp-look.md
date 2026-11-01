# A shared session core, then omp as the third host

Status: built. Merged to main in #5.

omp ([omp.sh](https://omp.sh/)) is a terminal coding agent forked from pi. It loads TypeScript extensions in its own Bun process. A throwaway extension showed that the shared modules in `hooks/` load in omp unchanged, and that omp can draw the band above the prompt and an `/inbox` panel and take its keys. That extension drew the shared demo data only. It never ran a real session.

A host does more than draw. It reacts to the prompt, tool-call and turn-end events, keeps each session's state, runs the inbox model after each reply, runs a press's sends, opens and copies, and runs gh. That work is written twice today: in the mod's `hooks/register.tsx`, and in the Codex host's `codex/src/core.ts`, `hook.ts`, `server.ts` and `update.ts`. omp would make a third copy, and each later feature would be wired three times. So the shared part of that work moves into `hooks/` first, and omp is built on it.

## Order

1. Move the Codex host's session logic into shared modules. Codex runs on them with no change in behavior.
2. Build omp as a host and a look on those modules.
3. Add omp to the repo's checks, docs and release steps, and write down what a new host supplies.
4. Move the mod onto the shared session modules.

Each step passes `./scripts/check.sh` and leaves the shipped hosts working, so the steps can ship one at a time.

## Parts

- [Step 1, the shared session modules](omp-look/step-1-shared-modules.md): the session modules and `hooks/session-host.ts`.
- [Step 2, the omp host and look](omp-look/step-2-omp-host.md): omp's events, the look, and the choices made.
- [Step 4, the mod on the shared session modules](omp-look/step-4-mod-on-shared-modules.md): The gap list, how the mod saves its session, what people will notice, and the build order.

## Step 3: omp in the repo

Built. It adds omp to the repo's checks, docs and release steps, and to omp's own marketplace.

- `Look` in `hooks/view.ts` gained `omp` in step 2.
- `docs/looks.md` lists omp's files, owners and differences on purpose, and has a section on adding a host. `GLOSSARY.md` names omp under Look, Host and Adapter. `AGENTS.md`, `README.md` and `docs/release.md` cover omp.
- `omp/tests/panel.spec.ts` checks the omp panel's button order against `rowKeyPlan`. The demo test in `tests/hooks.test.ts` stays on the terminal and desktop looks.
- `scripts/check-structure.mjs` checks `omp/` imports, and `scripts/check.sh` runs omp's bundle check, types and tests.
- `.omp-plugin/marketplace.json` lists the omp plugin. omp reads `.omp-plugin/marketplace.json` before `.claude-plugin/marketplace.json`, so the omp catalog sits where Claude Code never reads it, and `.claude-plugin/` is untouched. The plugin's source is `./omp`, and omp copies only that folder when it installs. `../hooks` is not in the copy, so `omp/build.ts` bundles the extension and its shared modules into `omp/dist/host.js`. The bundle is committed, since an install runs no build. omp's own packages stay external, because omp supplies them.
- `docs/release.md` lists `version` in `omp/package.json` and the omp bundle build.

omp installs the plugin from a local checkout with `omp plugin marketplace add <path>` and `omp plugin install inbox@inbox-omp`, with no `-e` flag. The band showed and `/inbox` opened the panel, also with only the bundle left in the installed copy. The install from GitHub and the update commands are untested.
