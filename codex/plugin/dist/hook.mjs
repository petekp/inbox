// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/hook-main.ts
import { dirname as dirname3, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/hook.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname as dirname2 } from "node:path";

// ../hooks/checks.ts
var PM_OPTIONS = String.raw`(?:-{1,2}[\w-]+(?:=\S+|\s+(?!-|(?:run|test|build|lint)\b)\S+)?\s+)*`;
var pm = (managers, script) => new RegExp(String.raw`\b(${managers})\s+${PM_OPTIONS}(?:run\s+)?(?:${script})(:[\w.:-]*\w)?\b`);
var CHECKS = [
  { kind: "tests", pattern: /\bclaude\s+plugin\s+test\b/, name: () => "plugin tests" },
  { kind: "validate", pattern: /\bclaude\s+plugin\s+validate\b/, name: () => "plugin validate" },
  { kind: "tests", pattern: pm("bun|npm|pnpm|yarn|deno", "test"), name: (m) => `${m[1]} test${m[2] ?? ""}` },
  { kind: "tests", pattern: /\bnode\s+(?:-{1,2}[\w-]+(?:=\S+)?\s+)*--test\b/, name: () => "node --test" },
  { kind: "tests", pattern: /\b(vitest|jest|pytest|rspec|mocha|phpunit|ava|tap)\b/, name: (m) => m[1] ?? "tests" },
  { kind: "tests", pattern: /\b(go|cargo|swift|mix|dotnet)\s+test\b/, name: (m) => `${m[1]} test` },
  { kind: "tests", pattern: /\bplaywright\s+test\b/, name: () => "playwright" },
  { kind: "tests", pattern: /\bxcodebuild\b[^|;&]*\btest\b/, name: () => "xcodebuild test" },
  { kind: "tests", pattern: /\bmake\s+(?:check|test)\b/, name: (m) => m[0] },
  { kind: "types", pattern: /\btsc\b/, name: () => "tsc" },
  { kind: "types", pattern: /\b(mypy|pyright)\b/, name: (m) => m[1] ?? "types" },
  {
    kind: "types",
    pattern: pm("bun|npm|pnpm|yarn", "typecheck|type-check|check-types"),
    name: (m) => `typecheck${m[2] ?? ""}`
  },
  { kind: "types", pattern: /\bcargo\s+check\b/, name: () => "cargo check" },
  {
    kind: "lint",
    pattern: /\b(eslint|biome|ruff|shellcheck|swiftlint|clippy|golangci-lint|stylelint)\b/,
    name: (m) => m[1] ?? "lint"
  },
  { kind: "lint", pattern: pm("bun|npm|pnpm|yarn", "lint"), name: (m) => `lint${m[2] ?? ""}` },
  { kind: "lint", pattern: /\bprettier\b[^|;&]*--check\b/, name: () => "prettier" },
  { kind: "build", pattern: pm("bun|npm|pnpm|yarn", "build"), name: (m) => `${m[1]} build${m[2] ?? ""}` },
  { kind: "build", pattern: /\b(cargo|go|swift)\s+build\b/, name: (m) => `${m[1]} build` },
  { kind: "build", pattern: /\bxcodebuild\b(?![^|;&]*\btest\b)/, name: () => "xcodebuild" },
  { kind: "build", pattern: /\b(?:next|vite)\s+build\b/, name: (m) => m[0] },
  {
    kind: "validate",
    pattern: /(?:^|\s)(?:\S*\/)?[\w.-]*(?:validate|doctor)[\w.-]*\.sh\b/,
    name: (m) => m[0].trim().replace(/^.*\//, "")
  },
  { kind: "all", pattern: /(?:^|\s)(?:\S*\/)?checks?\.sh\b/, name: (m) => m[0].trim().replace(/^.*\//, "") }
];
function segments(command, keepQuotes = false) {
  const quoted = [];
  const substituted = [];
  let masked = command.replace(/<<-?\s*(["']?)(\w+)\1[^\n]*\n[\s\S]*?\n\2\b/g, " ").replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, (q) => `\0${quoted.push(q) - 1}\0`).replace(/\\\n/g, " ");
  for (let before = ""; before !== masked; ) {
    before = masked;
    masked = masked.replace(/\$\([^()]*\)|`[^`]*`/g, (s) => `${substituted.push(s) - 1}`);
  }
  const unmask = (text) => {
    let out = text;
    while (/\x01\d+\x01/.test(out))
      out = out.replace(/\x01(\d+)\x01/g, (_, n) => keepQuotes ? substituted[Number(n)] ?? "" : '""');
    return out.replace(/\0(\d+)\0/g, (_, n) => keepQuotes ? quoted[Number(n)] ?? "" : '""');
  };
  const parts = masked.split(/(&&|\|\||;|\n|\|)/);
  const found = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = unmask(parts[i] ?? "").trim();
    if (text) found.push({ text, next: parts[i + 1] ?? "" });
  }
  return found;
}
function commandOf(segment) {
  return segment.replace(/^(?:[({]\s*|!\s+|(?:if|then|elif|else|do|while|until|time)\s+)+/, "");
}
var NOT_A_CHECK = /^(?:echo|printf|cat|grep|rg|tail|head|less|ls|cd|git|gh|brew|man|which|type|open|pgrep|pkill|killall|ps|lsof)\b/;
function checkIn(segment) {
  const command = commandOf(segment);
  if (NOT_A_CHECK.test(command)) return null;
  for (const c of CHECKS) {
    const m = command.match(c.pattern);
    if (m) {
      const [runner = "", ...used] = m[0].trim().split(/\s+/);
      return { call: { name: c.name(m), kind: c.kind }, runner, consumed: used.length };
    }
  }
  return null;
}
function checksIn(command) {
  const found = [];
  for (const segment of segments(command)) {
    const call = checkIn(segment.text)?.call;
    if (call && !found.some((f) => f.name === call.name)) found.push(call);
  }
  return found;
}
var FOLDER_OPTIONS = /* @__PURE__ */ new Set(["--prefix", "-C", "--cwd", "--dir", "--directory", "--package-path", "--manifest-path"]);
var TSC_FOLDER_OPTIONS = /* @__PURE__ */ new Set([...FOLDER_OPTIONS, "-p", "--project"]);
function wordsOf(segment) {
  return (segment.match(/(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s"']+)+/g) ?? []).map(
    (w) => w.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'/g, (_, double, single) => double ?? single ?? "")
  );
}
function resolvePath(from, path) {
  const parts = [];
  for (const part of `${path.startsWith("/") ? "" : from}/${path}`.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}
var OUTPUT_FLAGS = /* @__PURE__ */ new Set([
  "--reporter",
  "--verbose",
  "-v",
  "--silent",
  "--quiet",
  "-q",
  "--color",
  "--no-color",
  "--ci",
  "--bail",
  "-x",
  "--coverage",
  "--pretty",
  "--noEmit",
  "--passWithNoTests",
  "--tb",
  "--maxWorkers",
  "-j",
  "--run",
  "--no-coverage",
  "--runInBand",
  "--watch",
  "--watchAll",
  "--no-watch",
  "--forceExit",
  "--detectOpenHandles",
  "--no-cache",
  "--format",
  "--timeout",
  "--testTimeout",
  "-s",
  "-vv"
]);
var VALUE_FLAGS = /* @__PURE__ */ new Set(["--reporter", "--tb", "--maxWorkers", "-j", "--format", "--timeout", "--testTimeout"]);
var FILTER_FLAGS = /* @__PURE__ */ new Set(["-t", "--testNamePattern", "--grep", "-g", "-k", "--filter", "-run", "--testPathPattern"]);
var COMMAND_WORDS = {
  vitest: ["run"],
  "golangci-lint": ["run"],
  ruff: ["check"],
  biome: ["check", "lint", "ci"]
};
var REDIRECT = /^(?:\d*|&)[<>]|^&$/;
var isPath = (word) => word === "." || word.includes("/") || /\.[A-Za-z0-9]+$/.test(word);
function readTarget(words2, runner, folder, resolve) {
  const paths = [];
  const filters = [];
  const add = (list, item) => void (list.includes(item) || list.push(item));
  const rest = words2[0] === "--" ? words2.slice(1) : words2;
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i] ?? "";
    if (REDIRECT.test(word)) break;
    const isFlag = word.startsWith("-");
    const [flag = "", inline] = isFlag && word.includes("=") ? word.split(/=(.*)/s) : [word, void 0];
    if (OUTPUT_FLAGS.has(flag)) {
      if (inline === void 0 && VALUE_FLAGS.has(flag)) i++;
    } else if (FILTER_FLAGS.has(flag)) {
      const value = inline ?? rest[++i];
      add(filters, value === void 0 ? flag : `${flag}=${value}`);
    } else if (COMMAND_WORDS[runner]?.includes(word)) {
      continue;
    } else if (!isFlag && isPath(word)) {
      const path = folder === null ? null : resolve(word.replace(/\/\.\.\.$/, "") || ".");
      if (path === null) add(filters, word);
      else if (path !== folder) add(paths, path);
    } else {
      add(filters, word);
    }
  }
  return { paths, filters };
}
function checkRun(command, cwd, home) {
  const dir = resolvePath("/", cwd);
  const expand = (word) => {
    if (/\$\(|`/.test(word)) return null;
    const out = word.replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home);
    return out.includes("$") ? null : out;
  };
  const blank = segments(command);
  const kept = segments(command, true);
  for (const [i, { text: segment }] of kept.entries()) {
    const found = checkIn(blank[i]?.text ?? "");
    if (!found) continue;
    const { call, runner, consumed } = found;
    const words2 = wordsOf(commandOf(segment));
    const after = words2.slice(words2.findIndex((w) => w === runner || w.endsWith(`/${runner}`)) + 1);
    const options = runner === "tsc" ? TSC_FOLDER_OPTIONS : FOLDER_OPTIONS;
    const folderWords = /* @__PURE__ */ new Set();
    let named;
    if (runner === "claude") {
      const j = after.findIndex((w, k) => k >= 2 && !/^-|^\d*[<>&]/.test(w));
      if (j >= 0) {
        named = after[j];
        folderWords.add(j);
      }
    }
    after.forEach((w, j) => {
      const isInline = w.startsWith("--") && w.includes("=");
      const [option = "", value] = isInline ? w.split(/=(.*)/s) : [w, after[j + 1]];
      if (options.has(option) && value !== void 0) {
        named = value;
        folderWords.add(j);
        if (!isInline) folderWords.add(j + 1);
      }
    });
    if (named && /\.(?:json|toml)$/.test(named)) named = named.replace(/\/?[^/]*$/, "") || ".";
    let folder = dir;
    if (named !== void 0) {
      const path = expand(named);
      folder = path === null ? null : resolvePath(dir, path);
    }
    const resolve = (word) => {
      const path = expand(word);
      return path === null || folder === null ? null : resolvePath(folder, path);
    };
    const target = readTarget(
      after.filter((_, j) => j >= consumed && !folderWords.has(j)),
      runner,
      folder,
      resolve
    );
    return { call, target, command: segment, folder };
  }
  return null;
}
function isTemporary(folder) {
  return /^(?:\/private)?\/(?:tmp|var\/tmp|var\/folders)(?:\/|$)/.test(folder);
}
var SUMMARY = [
  /^.*\b\d+\s+(?:pass(?:ed|ing)?|fail(?:ed|ing)?)\b.*$/im,
  /^.*\bRan \d+ tests?\b.*$/im,
  /^.*\bTests?:\s+.*$/im,
  /^.*\bFound \d+ (?:errors?|problems?)\b.*$/im,
  /^.*\b\d+ (?:errors?|warnings?|problems?)\b.*$/im
];
var FAIL_MARK = String.raw`\(fail\)|FAIL(?:ED)?\b|✗|✖(?! failing tests:)|×|✘`;
var FAILURE_LINE = new RegExp(
  String.raw`^\s*(?:${FAIL_MARK})|\berror\s+TS\d+\b|^\s*(?:[A-Z]\w*Error|error)(?:\[\w+\])?:`
);
function failureLines(output) {
  return output.split("\n").filter((line) => FAILURE_LINE.test(line)).map((line) => line.trim().slice(0, 160)).filter((line, i, all) => all.indexOf(line) === i).slice(0, 3);
}
function counts(output) {
  const count = (word) => {
    const m = output.match(new RegExp(`^\\s*(\\d+)\\s+${word}\\s*$|^[\u2139#]\\s*${word}\\s+(\\d+)\\s*$`, "m"));
    return m ? Number(m[1] ?? m[2]) : null;
  };
  const pass = count("pass");
  const fail = count("fail");
  return pass === null || fail === null ? null : { pass, fail };
}
function readResult(output, isError) {
  const tally = counts(output);
  const summary = tally ? `${tally.pass} pass, ${tally.fail} fail` : summaryLine(output);
  return { result: isError ? "fail" : "pass", summary: summary || (isError ? "exited with an error" : "") };
}
function summaryLine(output) {
  for (const p of SUMMARY) {
    const m = output.match(p);
    if (m) return m[0].trim().slice(0, 120);
  }
  const firstError = output.split("\n").find((line) => /\berror\b/i.test(line));
  return (firstError ?? "").trim().slice(0, 120);
}
function checkMark(check) {
  return check.result === "pass" ? "\u2713" : "\u2717";
}
function checkDetail(check) {
  return `${check.summary ? `, ${check.summary}` : ""}${check.isStale ? ", before the last edit" : ""}`;
}
function targetText(check, root) {
  const base = check.folder ?? root;
  const paths = check.target.paths.map((p) => p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p);
  return [...paths, ...check.target.filters].join(" ");
}
function checkName(check, root) {
  const target = targetText(check, root);
  const name = target ? `${check.name} ${target}` : check.name;
  return check.folder ? `${name} in ${check.folder.replace(/^.*\//, "")}` : name;
}
function checkLine(check, root) {
  return `${checkMark(check)} ${checkName(check, root)}${checkDetail(check)}`;
}
function sentences(reply) {
  return reply.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").split(/\n+|(?<=[.!?])\s+/).map(
    (s) => s.replace(/^[\s>#*-]*(?:\d+[.)]\s*)?/, "").replace(/[*_]+/g, "").trim()
  ).filter(Boolean);
}
var CLAIMS = [
  {
    kind: "tests",
    pattern: /\b(?:all\s+)?(?:\d+\s+)?(?:the\s+|unit\s+)?tests?\s+(?:now\s+|all\s+|still\s+)*(?:pass(?:es|ed|ing)?|are passing|are green|succeed(?:s|ed)?)\b/i
  },
  {
    kind: "types",
    pattern: /\b(?:tsc|type[- ]?check(?:s|ing)?|types?)\s+(?:is\s+|are\s+|now\s+)*(?:pass(?:es|ed)?|clean|green|succeed(?:s|ed)?)\b|\bno type errors\b/i
  },
  { kind: "lint", pattern: /\blint(?:ing|er)?\s+(?:is\s+|now\s+)*(?:pass(?:es|ed)?|clean|green)\b/i },
  {
    kind: "build",
    pattern: /\bbuild\s+(?:is\s+|now\s+)*(?:pass(?:es|ed)?|succeed(?:s|ed)?|green|works)\b|\bbuilds cleanly\b/i
  }
];
var HEDGE = /\b(?:not|fail\w*|if|should|would|will|until|unless|once|might|may|expect\w*|untested)\b|n't\b/i;
var QUOTED = /"[^"]*"|“[^”]*”|`[^`]*`/g;
function claimsIn(reply) {
  return sentences(reply).flatMap((sentence) => {
    const said = sentence.replace(QUOTED, " ");
    return HEDGE.test(said) ? [] : CLAIMS.filter((c) => c.pattern.test(said)).map((c) => ({ sentence, kind: c.kind }));
  });
}
var LEADING_MARK = new RegExp(String.raw`^\s*(?:${FAIL_MARK}|❯)\s*`);
function claimMessage(c) {
  return `inbox: your reply says "${c.claim}", but ${c.problem}. Before you end your turn, run the check and report what it shows, or say plainly that the latest change is untested.`;
}

// ../hooks/check-tracking.ts
var NO_CHECKS = { results: [], repos: [] };
function checkKey(check) {
  const { paths, filters } = check.target;
  const key = `${check.folder ?? "."}:${check.name}`;
  return paths.length === 0 && filters.length === 0 ? key : `${key}:${JSON.stringify([[...paths].sort(), [...filters].sort()])}`;
}
var contains = (path, inner) => inner === path || inner.startsWith(`${path}/`);
function covers(run2, result) {
  if (run2.name !== result.name || run2.folder !== result.folder) return false;
  const a = run2.target;
  const b = result.target;
  const isSameFilters = a.filters.length === b.filters.length && a.filters.every((f) => b.filters.includes(f));
  const hasPaths = b.paths.length > 0 && b.paths.every((q) => a.paths.some((p) => contains(p, q)));
  return (a.filters.length === 0 || isSameFilters) && (a.paths.length === 0 || hasPaths);
}
function recordCheck(results, check) {
  const isAll = check.kind === "all" && check.result === "pass";
  return [...results.filter((c) => !(covers(check, c) || isAll && c.folder === check.folder)), check];
}
function recorded(checks, runs, at, root) {
  return {
    ...checks,
    results: runs.filter((r) => !(isTemporary(r.folder) && !isTemporary(root))).reduce(
      (all, r) => recordCheck(all, {
        name: r.name,
        kind: r.kind,
        target: r.target,
        folder: r.folder === root ? null : r.folder,
        result: r.result,
        summary: r.summary,
        ranAt: at,
        command: r.command,
        failures: r.failures,
        repo: r.repo,
        isStale: false,
        isLeftFailing: false,
        isDismissed: false,
        isSentBack: false,
        fixSentAt: null
      }),
      checks.results
    )
  };
}
function readsFile(kind, path) {
  return ["lint", "validate", "all"].includes(kind) || !/\.md$/i.test(path);
}
function changed(checks, repo, paths, root) {
  if (paths !== null && paths.length === 0) return checks;
  const isStaleBy = (c) => {
    if (paths === null) return true;
    const folder = c.folder ?? root;
    return paths.some((p) => {
      const path = `${repo}/${p}`;
      return readsFile(c.kind, p) && (path === folder || path.startsWith(`${folder}/`));
    });
  };
  return {
    ...checks,
    results: checks.results.map((c) => c.repo === repo && isStaleBy(c) ? { ...c, isStale: true } : c)
  };
}
function addRepo(checks, repo) {
  return checks.repos.includes(repo) ? checks : { ...checks, repos: [...checks.repos, repo] };
}
function pruned(checks, gone) {
  return { ...checks, results: checks.results.filter((c) => !c.folder || !gone.has(c.folder)) };
}
function turnEnded(checks) {
  return { ...checks, results: checks.results.map((c) => c.result === "fail" ? { ...c, isLeftFailing: true } : c) };
}
function counts2(checks, c, root) {
  if (c.repo !== null) return checks.repos.includes(c.repo);
  return c.folder === null || c.folder === root || c.folder.startsWith(`${root}/`);
}
function* contradictions(reply, checks, root) {
  for (const { sentence, kind } of claimsIn(reply)) {
    const ofKind = checks.results.filter((c) => c.kind === kind || c.kind === "all").sort((a, b) => b.ranAt - a.ranAt);
    for (const failed of ofKind.filter((c) => c.result === "fail"))
      yield {
        claim: sentence,
        problem: `${checkName(failed, root)} failed when it last ran${failed.summary ? ` (${failed.summary})` : ""}`,
        check: failed
      };
    const [latest] = ofKind;
    if (latest && latest.result !== "fail" && latest.isStale)
      yield { claim: sentence, problem: `the files changed after ${checkName(latest, root)} last ran`, check: latest };
  }
}
function claimAgainst(checks, reply, root) {
  const own = { ...checks, results: checks.results.filter((c) => counts2(checks, c, root)) };
  for (const { claim, problem, check } of contradictions(reply, own, root)) {
    if (check.isSentBack) continue;
    const key = checkKey(check);
    return {
      checks: {
        ...checks,
        results: checks.results.map(
          (c) => checkKey(c) === key && c.ranAt === check.ranAt ? { ...c, isSentBack: true } : c
        )
      },
      claim: { claim, problem }
    };
  }
  return { checks, claim: null };
}

// ../hooks/ledger.ts
var EMPTY = {
  card: null,
  items: [],
  closed: [],
  findings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0
};
var NL = "\n";
var EXPIRED = "expired, unanswered";
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const { notes, decided, ...rest } = ledger;
  return {
    ...rest,
    findings: [...rest.findings ?? [], ...notes ?? []],
    items: rest.items.map((i) => ({
      ...i,
      kind: readKind(i.kind),
      at: i.at ?? null,
      rec: recommendedOption(i.options, i.rec)
    })),
    closed: (rest.closed ?? decided ?? []).map((d) => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome)
    }))
  };
}
function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec) return null;
  const named = new Set(words(rec));
  let best = null;
  for (const option of options) {
    const w = words(option);
    if (w.length > words(best ?? "").length && w.every((x) => named.has(x))) best = option;
  }
  return best;
}
function howFromOutcome(outcome) {
  if (outcome === "dismissed") return "dismissed";
  if (outcome === EXPIRED) return "expired";
  if (outcome === "done" || outcome === "you ran it") return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return "claude";
  return "update";
}
function toolActivity(tool, input) {
  const text = (key) => typeof input[key] === "string" ? input[key] : "";
  switch (tool) {
    case "Bash":
      return `${input.run_in_background ? "started in background" : "ran"}: ${text("command").slice(0, 140)}`;
    case "Edit":
    case "Write":
      return `edited ${text("file_path")}`;
    case "Skill":
      return `used skill ${text("skill")}`;
    case "Agent":
      return `started agent: ${text("description")}`;
  }
  return tool.startsWith("mcp__") ? `called ${tool.slice(5)}` : null;
}
function surfaceAtStart(host) {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1);
}
function screenText(host, isOpen, tab) {
  return isOpen ? `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab} tab, ` : ""}listing every open item.` : `${surfaceAtStart(host)} is closed.`;
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function latestBatch(ledger) {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => i.turn === ledger.batchTurn);
}
function describe(item) {
  const parts = [`"${item.ask}"`];
  if (item.options.length > 0) parts.push(`options: ${item.options.join(" / ")}`);
  if (item.rec) parts.push(`recommended: ${item.rec}`);
  if (item.kind === "task") parts.push("an action for the user");
  return parts.join("; ");
}
function numberOf(label) {
  const m = label?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
var LINE_ANSWER = /(?:^|\n)\s*(?:[QqDd#]\s?)?(\d{1,2})\s*[.):\-–]\s*\S/g;
var INLINE_ANSWER = /\s(?:[QqDd#]\s?)?(\d{1,2})\s*[.)]\s+\S/g;
var ACCEPT_ALL = /^\s*(go|go ahead|yes|yep|yeah|sure|ok|okay|sgtm|lgtm|sounds good|do it|proceed|all good|ship it)\s*[.!]*\s*$/i;
var ACCEPT_RECS = /\b(all|both|everything|your)\b[^.\n]{0,40}\b(recommend\w*|recs?|suggest\w*|picks?|calls?)\b/i;
function answerNote(ledger, text) {
  const lines = [];
  const batch = ledger.batchTurn === ledger.turn - 1 ? latestBatch(ledger) : [];
  if (batch.length > 0) {
    const numbers = /* @__PURE__ */ new Set();
    for (const m of text.matchAll(LINE_ANSWER)) numbers.add(Number(m[1]));
    if (/^\s*(?:[QqDd#]\s?)?\d{1,2}\s*[.):\-–]\s/.test(text)) {
      for (const m of text.matchAll(INLINE_ANSWER)) numbers.add(Number(m[1]));
    }
    const hasLabels = batch.some((i) => numberOf(i.label) !== null);
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const item = hasLabels ? batch.find((i) => numberOf(i.label) === n) : batch[n - 1];
      if (item) lines.push(`- ${n} \u2192 ${describe(item)}`);
    }
    if (lines.length === 0 && (ACCEPT_ALL.test(text) || ACCEPT_RECS.test(text))) {
      const withRecs = batch.filter((i) => i.rec);
      if (withRecs.length > 0) {
        return [
          "inbox: if the user is accepting your recommendations, these are the open ones:",
          ...withRecs.map((i) => `- ${i.label ?? "\u2022"} \u2192 ${describe(i)}`)
        ].join(NL);
      }
    }
  }
  return lines.length === 0 ? null : ["inbox: the user's message answers these open items from your earlier replies:", ...lines].join(NL);
}
function itemLine(item, withId) {
  return `- ${withId ? `[${item.id}] ` : ""}${item.label ? `(${item.label}) ` : ""}${describe(item)}`;
}
function findingLine(finding, withId) {
  return `- ${withId ? `[${finding.id}] ` : ""}${finding.kind}: ${finding.title}`;
}
function carryText(ledger, title, isOwn = false) {
  const findings = ledger.findings;
  if (!ledger.card && ledger.items.length === 0 && findings.length === 0) return null;
  const out = [title];
  if (ledger.card) {
    if (ledger.card.goal) out.push(`Goal: ${ledger.card.goal}`);
    if (ledger.card.done.length > 0) out.push(`Done: ${ledger.card.done.join("; ")}`);
    if (ledger.card.now) out.push(`Now: ${ledger.card.now}`);
    if (ledger.card.running.length > 0) out.push(`Running: ${ledger.card.running.join("; ")}`);
  }
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item, isOwn));
  }
  if (findings.length > 0) {
    out.push(isOwn ? "Findings you recorded, still open:" : "Findings that session recorded, still open:");
    for (const f of findings) out.push(findingLine(f, isOwn));
  }
  if (ledger.closed.length > 0) {
    out.push("Recently closed:");
    for (const d of ledger.closed.slice(-6)) out.push(`- "${d.ask}" \u2192 ${outcomeText(d)}`);
  }
  return out.join(NL);
}
function inboxText(host, ledger, isOpen) {
  const out = ["inbox: what waits on the user, as of your last reply. Anything not listed here is closed."];
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item, true));
  } else {
    out.push("Nothing is waiting on the user.");
  }
  if (ledger.findings.length > 0) {
    out.push("Findings you recorded, still open:");
    for (const f of ledger.findings) out.push(findingLine(f, true));
  }
  out.push(isOpen ? `The user has ${host.surface} open beside the conversation.` : `${surfaceAtStart(host)} is closed.`);
  return out.join(NL);
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}
function closedText(closed) {
  if (closed.length === 0) return null;
  const advice = (d) => d.how === "dismissed" ? ". Ask it again only if the user brings it up." : d.how === "expired" ? ". Ask it again if it still matters." : "";
  return [
    "Closed since you last read the inbox:",
    ...closed.map((d) => `- "${d.ask}" \u2192 ${outcomeText(d)}${advice(d)}`)
  ].join(NL);
}
var TOLD_NOTHING = { inbox: null, closed: [] };
function promptNotes(host, ledger, prompt, told) {
  const notes = [];
  const answer = prompt.isPress ? null : answerNote(ledger, prompt.text);
  if (answer) notes.push(answer);
  const inbox = inboxText(host, ledger, prompt.isOpen);
  const toldClosed = new Set(told.closed);
  const closed = closedText(ledger.closed.filter((d) => !toldClosed.has(d.id)));
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0;
  if (!closed && (inbox === told.inbox || isEmpty && told.inbox === null)) return { notes, told };
  notes.push(closed ? `${inbox}${NL}${closed}` : inbox);
  return { notes, told: { inbox, closed: ledger.closed.map((d) => d.id) } };
}

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};
var GUIDANCE = `# Inbox
The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Record it with mcp__inbox__record_finding the moment you notice it, then go on with the task; fixing it waits until the user asks. Record one too at two moments that are easy to pass over while focused on the task:
- You work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them.
- Part of your change could not be tested or verified.
State those two in your reply as well. Mention any other finding only when it bears on what the user asked.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as [i35] or [f12], and anything it does not list is closed. Check it before telling the user that something is open or waits on them.

Close with mcp__inbox__close:
- When the user's message answers an open item, close it first, before other work, with their answer.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`;
var CHECK_REFUSAL = "Not run. Run each check on its own, with no pipe, redirect or other command, so its exit status is the check's.";
var START_TITLE = 'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.';

// src/core.ts
var TAB_OPEN_MS = 15e3;
var MAX_ACTIVITY = 40;
var MAX_RECORDED_RUNS = 400;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
}
function startContext(s, source) {
  const carried = carryText(s.ledger, START_TITLE, true);
  const parts = [source === "resume" ? null : GUIDANCE, carried].filter((x) => x !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
function cleared(s) {
  return {
    ...s,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null, sentBack: [] },
    told: { inbox: null, closed: [] },
    pending: [],
    lastActions: {}
  };
}
function notePrompt(s, text, now) {
  const sentAt = s.sent.findIndex((x) => x.text === text);
  const sentBy = sentAt >= 0 ? s.sent[sentAt]?.press ?? null : null;
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 };
  const r = promptNotes(CODEX, ledger, { text, isPress: sentAt >= 0, isOpen: isTabOpen(s, now) }, s.told);
  const person = s.turn.person === null ? text : `${s.turn.person}

${text}`;
  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      sent: sentAt >= 0 ? s.sent.filter((_x, i) => i !== sentAt) : s.sent,
      turn: { ...s.turn, person, press: sentBy ?? s.turn.press },
      presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 }
    },
    notes: r.notes
  };
}
function noteActivity(s, line) {
  const activity = s.turn.activity;
  if (!line || activity.length >= MAX_ACTIVITY || activity.includes(line)) return s;
  return { ...s, turn: { ...s.turn, activity: [...activity, line] } };
}
var SHELL_SYNTAX = /[|;&<>`]|\$\(/;
function isCompoundCheck(command) {
  const calls = checksIn(command);
  return calls.length > 0 && !(calls.length === 1 && !SHELL_SYNTAX.test(command));
}
function activityOf(tool, input) {
  return toolActivity(tool === "Bash" ? "Bash" : tool, input);
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}
function checkFromRun(end, s) {
  if (end.exitCode === null || isCompoundCheck(end.command)) return null;
  const run2 = checkRun(end.command, end.cwd || s.root, s.home);
  if (!run2) return null;
  const isFailed = end.exitCode !== 0;
  const { result, summary } = readResult(end.output, isFailed);
  return {
    run: run2,
    // A folder the command hides is taken as the session's.
    folder: run2.folder ?? s.root,
    result,
    summary,
    failures: result === "fail" ? failureLines(end.output) : []
  };
}
function recordRun(s, id, c, repo, at) {
  const checks = recorded(
    s.checks,
    [
      {
        name: c.run.call.name,
        kind: c.run.call.kind,
        folder: c.folder,
        result: c.result,
        summary: c.summary,
        command: c.run.command,
        failures: c.failures,
        repo,
        target: c.run.target
      }
    ],
    at,
    s.root
  );
  return { ...s, checks, recordedRuns: [...s.recordedRuns, id].slice(-MAX_RECORDED_RUNS) };
}
function claimCheck(s, reply) {
  if (s.checks.results.length === 0) return { state: s, block: null };
  const found = claimAgainst(s.checks, reply, s.root);
  if (!found.claim) return { state: s, block: null };
  return {
    state: { ...s, checks: found.checks, turn: { ...s.turn, sentBack: [...s.turn.sentBack, reply] } },
    block: claimMessage(found.claim)
  };
}
function endTurn(s, reply, now) {
  const checks = turnEnded(s.checks);
  const base = { ...s, checks, turn: { person: null, activity: [], press: null, sentBack: [] } };
  if (reply.trim() === "") return base;
  const ex = {
    person: s.turn.person,
    trigger: s.turn.person === null ? "unknown" : null,
    activity: s.turn.activity,
    reply: [...s.turn.sentBack, reply].join("\n\n"),
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(CODEX, isTabOpen(s, now), null),
    checks: checks.results.map((c) => checkLine(c, s.root))
  };
  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] };
}

// src/state.ts
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function emptyState(sessionId) {
  return {
    version: 1,
    sessionId,
    root: "",
    top: null,
    home: homedir(),
    cliPath: null,
    ledger: EMPTY,
    checks: NO_CHECKS,
    snapshots: {},
    turn: { person: null, activity: [], press: null, sentBack: [] },
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: "current", isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    recordedRuns: [],
    tabSeenAt: 0
  };
}
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join(homedir(), ".codex", "inbox-dev");
}
function fileName(sessionId) {
  if (!/^[\w-]{1,100}$/.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return sessionId;
}
function statePath(dir, sessionId) {
  return join(dir, "sessions", `${fileName(sessionId)}.json`);
}
function upgraded(saved, sessionId) {
  const base = emptyState(sessionId);
  return {
    ...base,
    ...saved,
    // The ledger's shape is the mod's, so a saved one converts the way the mod's does. It converts
    // before the defaults fill in, since an empty `closed` would hide an old `decided`.
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    snapshots: upgradeSnapshots(saved.snapshots ?? base.snapshots)
  };
}
function upgradeSnapshots(snapshots) {
  return Object.fromEntries(
    Object.entries(snapshots).map(([repo, s]) => [
      repo,
      {
        ...s,
        dirty: Object.fromEntries(Object.entries(s.dirty).map(([p, id]) => [p, id === "directory" ? "dir" : id]))
      }
    ])
  );
}
async function readState(dir, sessionId) {
  try {
    return upgraded(JSON.parse(await readFile(statePath(dir, sessionId), "utf8")), sessionId);
  } catch {
    return emptyState(sessionId);
  }
}
var LOCK_WAIT_MS = 1e4;
var LOCK_STALE_MS = 15e3;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
  await mkdir(dirname(path), { recursive: true });
  const until = Date.now() + waitMs;
  for (; ; ) {
    try {
      await mkdir(path);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const age = await stat(path).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0
      );
      if (age > LOCK_STALE_MS) await rmdir(path).catch(() => void 0);
      else if (Date.now() > until) throw new Error(`Timed out waiting for ${path}`);
      else await sleep(15);
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(path).catch(() => void 0);
  }
}
async function updateState(dir, sessionId, change) {
  const path = statePath(dir, sessionId);
  return withLock(`${path}.lock`, async () => {
    const next = await change(await readState(dir, sessionId));
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, path);
    return next;
  });
}

// src/transcript.ts
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
async function isExecRun(path) {
  if (!path) return false;
  try {
    const file = await open(path, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(buf, 0, buf.length, 0);
      const first = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0] ?? "";
      const meta = JSON.parse(first);
      return meta.type === "session_meta" && (meta.payload?.originator === "codex_exec" || meta.payload?.source === "exec");
    } finally {
      await file.close();
    }
  } catch {
    return false;
  }
}
function folderOf(cwd) {
  if (typeof cwd !== "string") return "";
  try {
    return cwd.startsWith("file://") ? fileURLToPath(cwd) : cwd;
  } catch {
    return "";
  }
}
function shellCommand(argv) {
  if (typeof argv === "string") return argv;
  if (!Array.isArray(argv)) return "";
  const words2 = argv.filter((w) => typeof w === "string");
  const i = words2.findIndex((w) => /^-\w*c$/.test(w));
  if (i >= 1 && /(^|\/)(ba|z|da|k)?sh$/.test(words2[0] ?? "")) return words2[i + 1] ?? "";
  return words2.join(" ");
}
async function commandEnds(path, turnId) {
  const ends = [];
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"CommandExecution"') || !line.includes(turnId)) continue;
    try {
      const row = JSON.parse(line);
      const item = row.payload?.item;
      if (row.payload?.type !== "item_completed" || row.payload.turn_id !== turnId || item?.type !== "CommandExecution")
        continue;
      const output = typeof item.aggregated_output === "string" ? item.aggregated_output : "";
      ends.push({
        id: String(item.id ?? ""),
        command: shellCommand(item.command),
        cwd: folderOf(item.cwd),
        exitCode: typeof item.exit_code === "number" ? item.exit_code : null,
        output
      });
    } catch {
      continue;
    }
  }
  return ends;
}

// src/tree.ts
import { execFile } from "node:child_process";
import { stat as stat2 } from "node:fs/promises";

// ../hooks/git.ts
function readChanged(stdout) {
  const fields = stdout.split("\0");
  const changed2 = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? "";
    if (field === "") continue;
    const x = field[0];
    const y = field[1];
    changed2.push({ path: field.slice(3), isDeleted: y === "D" || x === "D" && y === " " });
    if (x === "R" || x === "C") {
      i++;
      const source = fields[i];
      if (x === "R" && source) changed2.push({ path: source, isDeleted: true });
    }
  }
  return changed2;
}
function readLsTree(stdout) {
  const ids = {};
  for (const entry of stdout.split("\0")) {
    const tab = entry.indexOf("	");
    if (tab < 0) continue;
    const id = entry.slice(0, tab).split(" ")[2];
    if (id) ids[entry.slice(tab + 1)] = id;
  }
  return ids;
}
function sameSnapshot(a, b) {
  const keys = Object.keys(a.dirty);
  return a.head === b.head && keys.length === Object.keys(b.dirty).length && keys.every((k) => b.dirty[k] === a.dirty[k]);
}
function candidates(a, b, committed) {
  return [.../* @__PURE__ */ new Set([...Object.keys(a.dirty), ...Object.keys(b.dirty), ...committed])];
}
function changedPaths(a, b, paths, before, after) {
  return paths.filter((p) => (a.dirty[p] ?? before[p] ?? "") !== (b.dirty[p] ?? after[p] ?? ""));
}

// ../hooks/tree.ts
var SNAPSHOT_MAX = 2e3;
function git(io, repo, args, stdin) {
  return io.run(["git", "--no-optional-locks", ...args], {
    cwd: repo,
    timeoutMs: 15e3,
    ...stdin === void 0 ? {} : { stdin }
  });
}
async function hashFiles(io, repo, paths) {
  const out = await git(io, repo, ["hash-object", "--stdin-paths"], `${paths.join("\n")}
`);
  if (out !== null) return out.split("\n");
  const kinds = await Promise.all(paths.map((p) => io.kindOf(`${repo}/${p}`)));
  const files = paths.filter((_p, i) => kinds[i] === "file");
  const hashed = files.length > 0 ? await git(io, repo, ["hash-object", "--stdin-paths"], `${files.join("\n")}
`) : "";
  if (hashed === null) return null;
  const ids = hashed.split("\n");
  return paths.map((p, i) => kinds[i] === "file" ? ids[files.indexOf(p)] ?? "" : `${kinds[i]}`);
}
async function readSnapshot(io, repo) {
  const [out, headOut] = await Promise.all([
    git(io, repo, ["status", "--porcelain=v1", "-z", "-uall"]),
    git(io, repo, ["rev-parse", "--verify", "-q", "HEAD"])
  ]);
  if (out === null) return null;
  const head = headOut?.trim() || null;
  const changes = readChanged(out).slice(0, SNAPSHOT_MAX);
  const dirty = {};
  for (const c of changes) if (c.isDeleted) dirty[c.path] = "";
  const present = changes.filter((c) => !c.isDeleted && !c.path.includes("\n")).map((c) => c.path);
  if (present.length > 0) {
    const ids = await hashFiles(io, repo, present);
    if (!ids) return null;
    present.forEach((path, i) => {
      dirty[path] = ids[i] ?? "";
    });
  }
  return { head, dirty };
}
async function lsTree(io, repo, head, paths) {
  const ids = {};
  for (let i = 0; i < paths.length; i += 200) {
    const out = await git(io, repo, ["ls-tree", "-z", "--full-tree", head, "--", ...paths.slice(i, i + 200)]);
    if (out === null) return null;
    Object.assign(ids, readLsTree(out));
  }
  return ids;
}
async function contentChanges(io, repo, a, b) {
  if (a.head !== b.head && !b.head) return null;
  let committed = [];
  if (a.head && b.head && a.head !== b.head) {
    const out = await git(io, repo, ["diff", "--name-only", "-z", "--no-renames", a.head, b.head]);
    if (out === null) return null;
    committed = out.split("\0").filter(Boolean);
  }
  const paths = candidates(a, b, committed);
  if (paths.length === 0) return [];
  const none = Promise.resolve({});
  const reading = a.head ? lsTree(io, repo, a.head, paths) : none;
  const [before, after] = await Promise.all([
    reading,
    b.head === a.head ? reading : b.head ? lsTree(io, repo, b.head, paths) : none
  ]);
  if (!before || !after) return null;
  return changedPaths(a, b, paths, before, after);
}
async function readRepo(io, repo, last) {
  const snapshot = await readSnapshot(io, repo);
  if (!snapshot || last && sameSnapshot(last, snapshot)) return null;
  return { snapshot, changes: last ? await contentChanges(io, repo, last, snapshot) : [] };
}

// src/tree.ts
var run = (args, { cwd, stdin, timeoutMs }) => new Promise((resolve) => {
  const [file = "", ...rest] = args;
  const child = execFile(
    file,
    rest,
    { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
    (err, stdout, stderr) => {
      const code = err ? typeof err.code === "number" ? err.code : -1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    }
  );
  if (stdin !== void 0) child.stdin?.end(stdin);
  else child.stdin?.end();
});
async function repoOf(exec, folder) {
  const r = await exec(["git", "rev-parse", "--show-toplevel"], { cwd: folder, timeoutMs: 5e3 });
  return r.code === 0 ? r.stdout.trim() || null : null;
}
async function kindOf(path) {
  return stat2(path).then(
    (s) => s.isFile() ? "file" : s.isDirectory() ? "dir" : "other",
    () => "other"
  );
}
function treeIO(exec) {
  return { run: (args, opts) => exec(args, opts).then((r) => r.code === 0 ? r.stdout : null), kindOf };
}
async function refreshTree(exec, state, repos) {
  const folders = [...new Set(state.checks.results.flatMap((c) => c.folder ? [c.folder] : []))];
  const found = await Promise.all(folders.map((f) => kindOf(f).then((k) => k !== "other")));
  const gone = new Set(folders.filter((_f, i) => !found[i]));
  let checks = gone.size > 0 ? pruned(state.checks, gone) : state.checks;
  const snapshots = { ...state.snapshots };
  const checked = repos ?? checks.results.flatMap((c) => c.repo ? [c.repo] : []);
  for (const repo of new Set(checked)) {
    const reading = await readRepo(treeIO(exec), repo, snapshots[repo]);
    if (!reading) continue;
    const { snapshot, changes } = reading;
    snapshots[repo] = snapshot;
    if (changes !== null && changes.length === 0) continue;
    checks = changed(checks, repo, changes, state.root);
  }
  return { checks, snapshots };
}

// src/hook.ts
async function handleHook(input, deps) {
  const id = input.session_id;
  const { dir, env, now } = deps;
  if (!id || !env.INBOX_IN_EXEC && await isExecRun(input.transcript_path)) return null;
  const cliPath = env.CODEX_CLI_PATH || null;
  const withCli = (s) => cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s;
  switch (input.hook_event_name) {
    case "SessionStart": {
      const root = input.cwd ?? "";
      const top = root ? await repoOf(deps.exec, root) : null;
      const s = await updateState(dir, id, (s2) => {
        const base = input.source === "clear" ? cleared(s2) : s2;
        const checks = top ? addRepo(base.checks, top) : base.checks;
        return withCli({ ...base, root, top, checks });
      });
      const context = startContext(s, input.source);
      return context ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } } : null;
    }
    case "UserPromptSubmit": {
      let notes = [];
      await updateState(dir, id, (s) => {
        const r = notePrompt(withCli(s), input.prompt ?? "", now());
        notes = r.notes;
        return r.state;
      });
      return notes.length === 0 ? null : { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: notes.join("\n\n") } };
    }
    case "PreToolUse": {
      const tool = input.tool_name ?? "";
      const toolInput = input.tool_input ?? {};
      const command = typeof toolInput.command === "string" ? toolInput.command : "";
      if (tool === "Bash" && isCompoundCheck(command))
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: CHECK_REFUSAL
          }
        };
      if (tool === "apply_patch") {
        const cwd = input.cwd ?? "";
        const files = patchFiles(command).map((f) => resolvePath(cwd || "/", f));
        const repos = await Promise.all(
          [...new Set(files.map((f) => dirname2(f)))].map((d) => repoOf(deps.exec, existingFolder(d)))
        );
        await updateState(
          dir,
          id,
          (s) => files.reduce((x, f) => noteActivity(x, `edited ${f}`), {
            ...s,
            checks: repos.reduce((c, r) => r ? addRepo(c, r) : c, s.checks)
          })
        );
        return null;
      }
      const line = activityOf(tool, toolInput);
      if (line) await updateState(dir, id, (s) => noteActivity(s, line));
      return null;
    }
    case "Stop":
      return stop(input, deps, withCli);
  }
  return null;
}
function existingFolder(folder) {
  let f = folder;
  while (f !== dirname2(f) && !existsSync(f)) f = dirname2(f);
  return f;
}
async function stop(input, deps, withCli) {
  const { dir, now } = deps;
  const id = input.session_id;
  const reply = input.last_assistant_message ?? "";
  const before = await readState(dir, id);
  const ends = input.transcript_path && input.turn_id ? await commandEnds(input.transcript_path, input.turn_id) : [];
  const done = new Set(before.recordedRuns);
  const runs = ends.flatMap((end) => {
    const c = done.has(end.id) ? null : checkFromRun(end, before);
    return c ? [{ end, c }] : [];
  });
  const repos = await Promise.all(runs.map((r) => repoOf(deps.exec, r.c.folder)));
  let s = before;
  for (const [i, r] of runs.entries()) {
    const repo = repos[i] ?? null;
    const tree2 = await refreshTree(deps.exec, s, repo ? [repo] : []);
    s = recordRun({ ...s, ...tree2 }, r.end.id, r.c, repo, now());
  }
  const tree = await refreshTree(deps.exec, s);
  const gathered = { checks: tree.checks, snapshots: tree.snapshots, recordedRuns: s.recordedRuns };
  let block = null;
  const written = await updateState(dir, id, (current) => {
    const merged = withCli({ ...current, ...gathered });
    if (!input.stop_hook_active && reply.trim()) {
      const claim = claimCheck(merged, reply);
      block = claim.block;
      if (block) return claim.state;
    }
    return endTurn(merged, reply, now());
  });
  if (block) return { decision: "block", reason: block };
  if (written.pending.length > 0) deps.startUpdate(id);
  return null;
}
function detachedUpdate(dir, env, script) {
  return (sessionId) => {
    const child = spawn(process.execPath, [script, sessionId], {
      detached: true,
      stdio: "ignore",
      env: { ...env, INBOX_DATA: dir }
    });
    child.unref();
  };
}

// src/hook-main.ts
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const dist = dirname3(fileURLToPath2(import.meta.url));
  const dir = dataDir(process.env, dirname3(dist));
  const out = await handleHook(JSON.parse(raw), {
    dir,
    env: process.env,
    now: Date.now,
    exec: run,
    startUpdate: detachedUpdate(dir, process.env, join2(dist, "update.mjs"))
  });
  if (out) process.stdout.write(JSON.stringify(out));
}
main().catch(() => process.exit(0));
