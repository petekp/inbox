# Developing the inbox

Read [AGENTS.md](../AGENTS.md) first. [docs/looks.md](looks.md) says which
file owns each rule and where the four looks differ on purpose.

Run the mod from a clone:

```sh
claude --plugin-dir /path/to/inbox
```

The session reloads the mod when you change one of its files.

The Codex plugin shares the rules in `hooks/` with the mod. Rebuild its
bundles after changing either:

```sh
npm --prefix codex ci         # once
npm --prefix codex run build
```

[codex/README.md](../codex/README.md) covers trying a build in Codex.

The omp extension in `omp/` shares the rules in `hooks/` too. It runs on Bun,
and omp installs it from a bundle, so rebuild the bundle after changing
`omp/src` or the shared modules:

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

`./scripts/check.sh` runs Prettier, a file-size check, `claude plugin validate`, a type check and
the tests, and checks the Codex bundles and the omp bundle are current. The type check needs the
types Claude Code writes to `.claude-plugin/types/` the first time it loads
the mod.
