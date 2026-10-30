# Files: omp

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `omp/src/host.ts` | omp host. The only file that imports omp's packages. Wires omp's events to the shared session modules, registers the `record` and `close` tools and the `/inbox` command, shows the band, and supplies omp's `SessionHost`. |
| `omp/src/tool-calls.ts` | omp host. What an omp tool call and its result say: the call's activity line, and how an `ask` dialog ended. It imports no omp package. |
| `omp/src/state.ts` | omp host. One JSON file per session under omp's agent folder, with a lock held in the process. `OmpState` extends the shared `Session`. |
| `omp/src/commands.ts` | omp host. Opens links and paths for omp's `SessionHost`. |
| `omp/src/theme.ts` | omp host. Maps the panel's styles onto omp's theme. |
| `omp/src/texts.ts` | omp host. The `OMP` host names the shared guidance uses. |
| `omp/src/panel.ts` | omp adapter. Draws the band and the `/inbox` panel from the shared view and plans, and maps keys to presses. It imports no omp package. |
| `omp/src/controller.ts` | omp adapter. The open panel: the cached screen, the person's ui state, the work a key starts, and the redraw timer. |
| `omp/src/demo.ts` | omp host. Turns the shared demo data into a panel source for `/inbox demo`. |
| `omp/build.ts` | omp host. Bundles `omp/src/host.ts` and the shared modules into `omp/dist/host.js`. `--check` fails when the bundle is stale. |
| `omp/dist/host.js` | omp host. The committed bundle, which `omp/package.json` lists under `omp.extensions`. |
| `omp/package.json` | omp host. The plugin's version, `omp.extensions`, and the build, check, test and type scripts. |
| `.omp-plugin/marketplace.json` | omp host. The omp marketplace, which points at `omp/`. omp reads it before `.claude-plugin/marketplace.json`, which Claude Code reads. |
