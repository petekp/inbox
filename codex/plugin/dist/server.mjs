// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/server-main.ts
import { readdir, stat } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

// src/data-dir.ts
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
function dataDir(env, pluginRoot2) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot2.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join(homedir(), ".codex", "inbox-dev");
}
async function devBuild(dir2) {
  try {
    const d = JSON.parse(await readFile(join(dir2, "dev.json"), "utf8"));
    if (typeof d.pid !== "number") return null;
    process.kill(d.pid, 0);
    return d;
  } catch {
    return null;
  }
}

// src/detached-update.ts
import { spawn } from "node:child_process";
function detachedUpdate(dir2, env, script) {
  return (sessionId, mode) => {
    const child = spawn(process.execPath, [script, sessionId, ...mode ? [mode] : []], {
      detached: true,
      stdio: "ignore",
      env: { ...env, INBOX_DATA: dir2 }
    });
    child.unref();
  };
}

// src/server-main.ts
var here = dirname(fileURLToPath(import.meta.url));
var pluginRoot = dirname(here);
var dir = dataDir(process.env, pluginRoot);
var BUNDLE = join2("dist", "server-handler.mjs");
var exists = (path) => stat(path).then(
  () => true,
  () => false
);
var versionParts = (version) => version.split(".").map((n) => Number.parseInt(n, 10) || 0);
function compareVersions(a, b) {
  const [pa, pb] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
async function installedBundle() {
  const own = join2(pluginRoot, BUNDLE);
  if (await exists(own)) return own;
  const versions = (await readdir(dirname(pluginRoot)).catch(() => [])).filter((name) => /^\d/.test(name));
  for (const version of versions.sort(compareVersions).reverse()) {
    const bundle = join2(dirname(pluginRoot), version, BUNDLE);
    if (await exists(bundle)) return bundle;
  }
  return null;
}
async function handlerPath() {
  const server = (await devBuild(dir))?.server;
  if (server && await exists(server)) return server;
  return installedBundle();
}
var current = null;
var lastLoaded = null;
var loadError = null;
var isPluginFolderGone = false;
function load(url, path) {
  const handle = import(url).then(
    (m) => m.createHandler(
      dir,
      () => loadError,
      () => isPluginFolderGone,
      detachedUpdate(dir, process.env, join2(here, "update.mjs"))
    )
  );
  handle.then(
    (h) => {
      lastLoaded = h;
      loadError = null;
    },
    (err) => {
      loadError = `${path}: ${err instanceof Error ? err.message : String(err)}`;
      process.stderr.write(`inbox: could not load ${loadError}
`);
    }
  );
  return handle;
}
async function currentHandler() {
  const path = await handlerPath();
  isPluginFolderGone = path === null;
  if (path === null) {
    if (lastLoaded) return lastLoaded;
    throw new Error(`no ${BUNDLE} in ${dirname(pluginRoot)}`);
  }
  const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: -1 }));
  const key = `${pathToFileURL(path).href}?v=${mtimeMs}`;
  if (current?.key !== key) current = { key, handle: load(key, path) };
  const { handle } = current;
  try {
    return await handle;
  } catch (err) {
    if (lastLoaded) return lastLoaded;
    throw err;
  }
}
var reply = (r) => process.stdout.write(`${JSON.stringify(r)}
`);
var ready = Promise.resolve();
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const handler = ready.then(currentHandler);
  ready = handler.catch(() => void 0);
  void handler.then(
    (handle) => handle(message).then((r) => {
      if (r) reply(r);
    }),
    (err) => {
      if (message.id === void 0) return;
      const why = err instanceof Error ? err.message : String(err);
      reply({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: `The inbox server could not load: ${why}` }
      });
    }
  );
});
