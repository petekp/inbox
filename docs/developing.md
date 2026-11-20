# Developing the inbox

Read [AGENTS.md](../AGENTS.md) first. [docs/looks.md](looks.md) says which
file owns each rule and where the four looks differ on purpose.

Run the mod from a clone:

```sh
claude --plugin-dir /path/to/inbox
```

The session reloads the mod when you change one of its files.

The Codex plugin shares the rules in `hooks/` with the mod. To try a change
to either in Codex, rebuild its bundles:

```sh
npm --prefix codex ci         # once
npm --prefix codex run build
```

[codex/README.md](../codex/README.md) covers trying a build in Codex.

The omp extension in `omp/` shares the rules in `hooks/` too. It runs on Bun,
and omp installs it from a bundle, so to try a change to `omp/src` or the
shared modules in omp, rebuild the bundle:

```sh
bun install --cwd omp --frozen-lockfile --ignore-scripts   # once
npm --prefix omp run build
```

Bun's bundler writes different output in different Bun versions. So the build
runs the Bun version that `omp/package.json` pins, whichever Bun starts it, and
the install above puts that Bun in `omp/node_modules`. The pin covers macOS on
Apple silicon only. On another platform, add the matching `@oven/bun-*` package
at the same version to the `devDependencies` in `omp/package.json`, or build
with that Bun version installed.

Try a build in omp with a fresh `HOME`, so it cannot touch your own omp
settings or inbox: `env HOME=/path/to/empty/folder omp -e omp/src/host.ts`.

## Built bundles

An install runs no build, so `next` and `main` commit the built bundles: `codex/plugin/dist`,
`omp/dist` and `herdr/mod/inbox`. A pull request carries source only. Its CI fails when its
commits change a bundle, and still fails when a bundle does not build. After each push to
`next`, `.github/workflows/bundles.yml` rebuilds the bundles and commits any change to `next`
as "Rebuild bundles for <short sha>". A release fast-forwards `main` to `next`, and CI on `main`
fails when a committed bundle does not match its sources.

`./scripts/bundles.sh build` builds every bundle into your working tree, so you can try it.
Leave those changes out of your commits: stage files by name, and run
`./scripts/bundles.sh restore` to put the bundles back to your branch's copies.
`./scripts/merge-next.sh` takes next's bundles when it merges, and `check.sh` fails when your
branch's commits change one.

## Checks

`./scripts/check.sh` runs Prettier, a file-size check, `claude plugin validate`, a type check and
the tests, and builds the Codex, omp and Herdr bundles. The type check needs the
types Claude Code writes to `.claude-plugin/types/` the first time it loads
the mod. It takes Prettier, TypeScript and esbuild from the root `package.json`, so install
those once:

```sh
npm ci --ignore-scripts
```

Every pull request and push to `next` or `main` runs the checks in
`.github/workflows/checks.yml` on GitHub. They are the checks in `check.sh` that need no sign-in
and no Herdr app. CI leaves out the root type check, since only a signed-in session writes the
engine types, and the Herdr look's type check and `herdr-app check`, which need the Herdr app.
`check.sh` is still the full check, so run it before you ask for a merge. A new check that
needs neither goes in both.
