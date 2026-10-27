// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/update-main.ts
import { homedir as homedir3 } from "node:os";
import { dirname as dirname3, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// src/cli.ts
function namedCli(env) {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null;
}
async function findCli(env, exec, parentPid) {
  const named = namedCli(env);
  if (named) return named;
  const r = await exec(["ps", "-o", "comm=", "-p", String(parentPid)], { cwd: "/", timeoutMs: 5e3 });
  const parent = r.stdout.trim();
  return r.code === 0 && /(^|\/)codex$/.test(parent) ? parent : "codex";
}

// src/data-dir.ts
import { homedir } from "node:os";
import { join } from "node:path";
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join(homedir(), ".codex", "inbox-dev");
}

// src/state.ts
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename, dirname, isAbsolute, join as join2, resolve } from "node:path";

// ../hooks/overview.ts
var NAME_WORDS = 3;
var TEXT_WORDS = 4;
var GOAL_WORDS = 8;
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 8;
var TEXT_KEPT = 12;
var GOAL_KEPT = 14;
var FINISHED_READ = 10;
var CHILD_KEPT_MS = 24 * 60 * 6e4;
var REWORD_OVERLAP = 0.5;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or",
  "is",
  "it",
  "its",
  "now",
  "be",
  "by",
  "at",
  "with"
]);
var NL = "\n";
var EMPTY_OVERVIEW = {
  role: "session",
  goal: "",
  subjects: [],
  children: [],
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  look: null
};
var OPEN_STATUSES = ["working", "queued", "waits-on-you", "waits-on-other", "problem"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
var CHILD_KINDS = ["subagent", "background", "workflow", "delegate"];
var LINE = /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|ROLE|GOAL|LINK)\s*(?::\s*(.*))?$/i;
function clipWords(text2, limit) {
  const words3 = text2.trim().split(/\s+/).filter(Boolean);
  return words3.length <= limit ? words3.join(" ") : `${words3.slice(0, limit).join(" ")}\u2026`;
}
function fields(value) {
  return value.split("|").map((f) => f.trim());
}
function openStatus(s) {
  return OPEN_STATUSES.find((o) => o === s?.toLowerCase()) ?? null;
}
function opOf(key, f) {
  if (key === "NOCHANGE" || key === "UNCHANGED") return { kind: "none" };
  if (key === "NEW") {
    const status = openStatus(f[0]);
    return status && f[1] ? { kind: "new", status, name: f[1], text: f[2] ?? "" } : null;
  }
  if (key === "SET") {
    const isDone = f[1]?.toLowerCase() === "done";
    if (f[0] && isDone) return { kind: "done", ref: f[0], text: f[2] ?? "" };
    const status = openStatus(f[1]);
    return f[0] && status ? { kind: "set", ref: f[0], status, text: f[2] ?? "" } : null;
  }
  if (key === "DONE") return f[0] ? { kind: "done", ref: f[0], text: f[1] ?? "" } : null;
  if (key === "DROP") {
    const into = (f[2] ?? "").replace(/^INTO\s+/i, "").trim();
    return f[0] ? { kind: "drop", ref: f[0], why: f[1] ?? "", into: into || null } : null;
  }
  if (key === "WAS") return f[0] && f[1] ? { kind: "was", ref: f[0], text: f[1] } : null;
  if (key === "ROLE") {
    const role = f[0]?.toLowerCase();
    return role === "coordinator" || role === "session" ? { kind: "role", role } : null;
  }
  if (key === "GOAL") return f[0] ? { kind: "goal", text: f[0] } : null;
  if (key === "LINK") return f[0] && f[1] ? { kind: "link", child: f[0], subject: f[1] } : null;
  return null;
}
function parseOverview(text2) {
  const ops = [];
  for (const raw of (text2 ?? "").split(NL)) {
    const line = raw.trim();
    if (line === "") continue;
    const m = LINE.exec(line);
    const op = m ? opOf(m[1].toUpperCase().replace(" ", ""), fields(m[2] ?? "")) : null;
    if (op === null) return null;
    ops.push(op);
  }
  if (ops.length === 0) return null;
  return ops.every((o) => o.kind === "none") ? { kind: "unchanged" } : { kind: "ops", ops };
}
function words(text2) {
  return new Set((text2.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w)));
}
function overlap(a, b) {
  const x = words(a);
  const y = words(b);
  const both = [...x].filter((w) => y.has(w)).length;
  const either = (/* @__PURE__ */ new Set([...x, ...y])).size;
  return either === 0 ? 1 : both / either;
}
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}
var OP_ORDER = {
  none: 0,
  role: 0,
  goal: 0,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  was: 1,
  link: 2
};
function applyOps(last, ops, now) {
  let o = {
    ...last ?? EMPTY_OVERVIEW,
    subjects: (last?.subjects ?? []).map((s) => ({ ...s })),
    children: (last?.children ?? []).map((c) => ({ ...c }))
  };
  const counts = { none: 0, new: 0, set: 0, done: 0, drop: 0, was: 0, role: 0, goal: 0, link: 0 };
  let newMerged = 0;
  let rewordsKept = 0;
  const unknownRefs = [];
  const changed = /* @__PURE__ */ new Set();
  const find = (ref) => {
    const key = nameKey(clipWords(ref, NAME_KEPT));
    return o.subjects.find((s) => s.id === ref) ?? o.subjects.find((s) => isOpen(s) && nameKey(s.name) === key) ?? null;
  };
  const touch = (s) => {
    s.changedAt = now;
    changed.add(s.id);
  };
  const forgetSeenWas = (s) => {
    const isSeen = o.lastLookAt !== null && s.changedAt <= o.lastLookAt;
    if (isSeen) s.was = null;
  };
  const set = (s, status, text2) => {
    if (s.status === status && overlap(s.text, text2) >= REWORD_OVERLAP) {
      rewordsKept++;
      return;
    }
    s.status = status;
    s.text = clipWords(text2, TEXT_KEPT);
    forgetSeenWas(s);
    touch(s);
  };
  const ordered = ops.map((op, n) => ({ op, n })).sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n);
  for (const { op } of ordered) {
    counts[op.kind]++;
    if (op.kind === "none") continue;
    if (op.kind === "role") o.role = op.role;
    else if (op.kind === "goal") o.goal = clipWords(op.text, GOAL_KEPT);
    else if (op.kind === "link") {
      const child = o.children.find((c) => c.id === op.child);
      const subject = find(op.subject);
      if (!child) unknownRefs.push(op.child);
      else if (!subject) unknownRefs.push(op.subject);
      else child.subjectId = subject.id;
    } else if (op.kind === "new") {
      const known = find(op.name);
      if (known && isOpen(known)) {
        newMerged++;
        set(known, op.status, op.text);
        continue;
      }
      const s = {
        id: `s${o.nextId}`,
        name: clipWords(op.name, NAME_KEPT),
        status: op.status,
        text: clipWords(op.text, TEXT_KEPT),
        was: null,
        createdAt: now,
        changedAt: now,
        closedAt: null,
        into: null
      };
      o = { ...o, nextId: o.nextId + 1, subjects: [...o.subjects, s] };
      changed.add(s.id);
    } else {
      const s = find(op.ref);
      if (!s) {
        unknownRefs.push(op.ref);
        continue;
      }
      if (op.kind === "set") set(s, op.status, op.text);
      else if (op.kind === "done") {
        s.status = "done";
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT);
        forgetSeenWas(s);
        s.closedAt = now;
        touch(s);
      } else if (op.kind === "drop") {
        const target = op.into ? find(op.into) : null;
        if (op.into && !target) unknownRefs.push(op.into);
        s.status = "dropped";
        s.text = clipWords(op.why, TEXT_KEPT);
        s.closedAt = now;
        s.into = target && target.id !== s.id ? target.id : null;
        touch(s);
        if (target && s.into) {
          target.was = target.was ?? `${s.name} folded in`;
          touch(target);
        }
      } else {
        const folded = o.subjects.find((x) => x.into === s.id && x.closedAt === now);
        s.was = folded ? `${folded.name} folded in; was: ${op.text}` : op.text;
        touch(s);
      }
    }
  }
  return { overview: o, counts, newMerged, rewordsKept, unknownRefs, changedIds: [...changed] };
}
function applyOverview(last, answer, now) {
  return answer.kind === "unchanged" ? last : applyOps(last, answer.ops, now).overview;
}
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function subjectsText(o) {
  const subjects = o?.subjects ?? [];
  const open2 = subjects.filter(isOpen).map((s) => `${s.id} | ${s.status} | ${s.name} | ${s.text || "-"}`);
  const finished = subjects.filter((s) => !isOpen(s)).slice(-FINISHED_READ).map((s) => `${s.id} | ${s.status} | ${s.name}`);
  return { open: open2.join(NL) || "(none yet)", finished: finished.join(NL) };
}
function runningText(o, now) {
  return (o?.children ?? []).filter((c) => isChildRunning(c, now)).map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? "-"}`).join(NL);
}
function text(value) {
  return typeof value === "string" ? value : "";
}
function time(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status);
  const changedAt = time(s?.changedAt);
  if (!s || typeof s.id !== "string" || typeof s.name !== "string" || !status || changedAt === null) return null;
  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    was: typeof s.was === "string" ? s.was : null,
    createdAt: time(s.createdAt) ?? changedAt,
    changedAt,
    closedAt: time(s.closedAt),
    into: typeof s.into === "string" ? s.into : null
  };
}
function childOf(saved) {
  const c = saved;
  const kind = CHILD_KINDS.find((k) => k === c?.kind);
  const startedAt = time(c?.startedAt);
  if (!c || typeof c.id !== "string" || typeof c.ref !== "string" || !kind || startedAt === null) return null;
  return {
    id: c.id,
    ref: c.ref,
    kind,
    name: text(c.name),
    subjectId: typeof c.subjectId === "string" ? c.subjectId : null,
    startedAt,
    endedAt: time(c.endedAt),
    lastActivityAt: time(c.lastActivityAt)
  };
}
var OLD_STATUS = {
  working: "working",
  queued: "queued",
  "waits-on-you": "waits-on-you",
  "waits-on-other": "waits-on-other",
  problem: "problem",
  unknown: "queued",
  done: null,
  "ruled-out": null
};
function fromLists(o) {
  const lastLookAt = time(o.lastLookAt);
  const items = lastLookAt === null ? [] : ["workstreams", "queue", "open"].flatMap((k) => Array.isArray(o[k]) ? o[k] : []);
  const subjects = items.flatMap((raw) => {
    const item = raw;
    const status = OLD_STATUS[String(item?.status)] ?? null;
    if (!status || typeof item?.text !== "string") return [];
    return [
      { status, name: clipWords(item.text, NAME_KEPT), text: typeof item.detail === "string" ? item.detail : "" }
    ];
  }).filter((s, n, all) => all.findIndex((t) => nameKey(t.name) === nameKey(s.name)) === n).slice(0, OPEN_SUBJECTS).map((s, n) => ({
    id: `s${n + 1}`,
    ...s,
    text: clipWords(s.text, TEXT_KEPT),
    was: null,
    createdAt: lastLookAt,
    changedAt: lastLookAt,
    closedAt: null,
    into: null
  }));
  return {
    ...EMPTY_OVERVIEW,
    role: o.isCoordinator === true ? "coordinator" : "session",
    goal: clipWords(text(o.headline), GOAL_KEPT),
    subjects,
    nextId: subjects.length + 1,
    lastLookAt
  };
}
function upgradeOverview(saved) {
  const o = saved;
  if (typeof o !== "object" || o === null) return null;
  if (typeof o.headline === "string") return fromLists(o);
  if (!Array.isArray(o.subjects)) return null;
  const subjects = o.subjects.map(subjectOf).filter((s) => s !== null);
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c) => c !== null) : [];
  const look = o.look;
  const lookAt = time(look?.startedAt);
  return {
    role: o.role === "coordinator" ? "coordinator" : "session",
    goal: text(o.goal),
    subjects,
    children,
    nextId: Math.max(time(o.nextId) ?? 1, subjects.length + 1),
    nextChildId: Math.max(time(o.nextChildId) ?? 1, children.length + 1),
    lastLookAt: time(o.lastLookAt),
    look: lookAt === null ? null : { startedAt: lookAt }
  };
}

// ../hooks/text.ts
var NL2 = "\n";
var FENCE = /```[^\n]*\n([\s\S]*?)```/g;
function codeBlocks(reply) {
  return [...reply.matchAll(FENCE)].map((m) => (m[1] ?? "").replace(/\n$/, ""));
}
function numberBlocks(reply) {
  let n = 0;
  return reply.replace(FENCE, (block) => `[block ${n += 1}]${NL2}${block}`);
}
function dash(value) {
  const v = (value ?? "").trim();
  return v === "" || v === "-" ? null : v;
}
function clip(text2, max) {
  return text2.length <= max ? text2 : text2.slice(0, max) + " \u2026[cut]";
}
function clipLabel(text2, max) {
  return text2.length > max ? `${text2.slice(0, max - 1)}\u2026` : text2;
}
function clipMiddle(text2, max, head) {
  if (text2.length <= max) return text2;
  return `${text2.slice(0, head)}${NL2}\u2026[cut]${NL2}${text2.slice(text2.length - (max - head))}`;
}
var graphemes = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var EMOJI = new RegExp("\\p{Emoji_Presentation}|\\uFE0F", "u");
function ago(ms) {
  const min = Math.round(ms / 6e4);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ../hooks/ledger.ts
var EMPTY = {
  overview: null,
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0,
  updates: 0
};
var NL3 = "\n";
var MAX_OPEN = 20;
var STALE_AFTER = 12;
var UNFOUNDED_MOOT = /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i;
var MAX_CLOSED = 12;
var EXPIRED = "expired, unanswered";
var MAX_HELPS = 3;
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const {
    notes,
    decided,
    milestones: _milestones,
    card,
    ...rest
  } = ledger;
  const updates = typeof rest.updates === "number" ? rest.updates : card ? 1 : 0;
  return {
    ...rest,
    updates,
    overview: upgradeOverview(rest.overview),
    findings: [...rest.findings ?? [], ...notes ?? []],
    // reopenFinding puts these back, so a conversion added for findings must run on them too.
    closedFindings: (rest.closedFindings ?? []).map(upgradeClosedFinding),
    items: rest.items.map(upgradeItem),
    closed: (rest.closed ?? decided ?? []).map((d) => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome),
      ...d.item ? { item: upgradeItem(d.item) } : {}
    }))
  };
}
var ASKED_AS = /^asked as (i\d+)$/;
function upgradeClosedFinding(f) {
  const asker = f.how === "update" ? ASKED_AS.exec(f.outcome)?.[1] : void 0;
  return asker && f.askedAs === void 0 ? { ...f, askedAs: asker } : f;
}
function upgradeItem(item) {
  return {
    ...item,
    kind: readKind(item.kind),
    at: item.at ?? null,
    rec: recommendedOption(item.options, item.rec),
    from: item.from ?? "update"
  };
}
function words2(text2) {
  return text2.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec) return null;
  const named = new Set(words2(rec));
  let best = null;
  for (const option of options) {
    const w = words2(option);
    if (w.length > words2(best ?? "").length && w.every((x) => named.has(x))) best = option;
  }
  const label = (text2) => text2.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase();
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase();
  return best ?? (byLabel ? options.find((o) => label(o) === byLabel) ?? null : null);
}
function howFromOutcome(outcome) {
  if (outcome === "dismissed") return "dismissed";
  if (outcome === EXPIRED) return "expired";
  if (outcome === "done" || outcome === "you ran it") return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return "claude";
  return "update";
}
var NEEDS_PERSON = /(?:^|[\s;&|])(?:login|logout|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen)(?=[\s:]|$)|\binit --interactive\b/i;
var PERSON_ONLY_REASON = /credential|password|passphrase|secret|\btoken|\b2fa\b|\bmfa\b|\bdevice\b|phone|android|tablet|account|sign(?:ed)?[- ]?in|log(?:ged)?[- ]?in|only you|you hold|your (?:mac|machine|laptop|computer|keychain)|\bsudo\b/i;
function readHelp(kind, value, name, blocks, source) {
  const isQuoted = (text2) => source === null || source.includes(text2);
  const block = value.match(/^block\s+(\d+)$/i);
  const quoted = block ? blocks[Number(block[1]) - 1] ?? "" : value.replace(/^`|`$/g, "");
  const isFromReply = (text2) => block !== null || isQuoted(text2);
  if (kind === "open") {
    const path = value.replace(/^`|`$/g, "");
    const isPath = /[/.~]/.test(path) && !/^[a-z]+:/i.test(path) && path.length <= 300;
    const standsAlone = (text2) => new RegExp(`(?<![\\w.~-])${escaped(path)}(?![\\w/-])`).test(text2);
    return isPath && (source === null || standsAlone(source)) ? { kind, path } : null;
  }
  if (kind === "copy") {
    return quoted.trim() !== "" && quoted.length <= 8e3 && isFromReply(quoted) ? { kind, text: quoted, name } : null;
  }
  if (kind === "run" || kind === "terminal") {
    const command = commandText(quoted);
    const isUsable = command !== "" && command.length <= 4e3 && isFromReply(command);
    const isTheirs = NEEDS_PERSON.test(command) || kind === "terminal" && (source === null || PERSON_ONLY_REASON.test(source));
    return isUsable ? { kind: isTheirs ? "terminal" : "run", command, name } : null;
  }
  if (kind === "link") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && isQuoted(value) ? { kind, url: url.href, name } : null;
    } catch {
      return null;
    }
  }
  return null;
}
function helpFields(tail, source) {
  const whole = tail.join("|").trim();
  if (tail.length <= 1 || source !== null && source.includes(commandText(whole.replace(/^`|`$/g, ""))))
    return { help: whole, name: null };
  return { help: tail.slice(0, -1).join("|").trim(), name: dash(tail.at(-1)) };
}
function escaped(text2) {
  return text2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function commandText(text2) {
  return text2.trim().replace(/^!\s*/, "");
}
function commandOf(help) {
  if (isCommand(help)) return help.command;
  if (help.kind === "copy") return commandText(help.text);
  return null;
}
function isCommand(help) {
  return help.kind === "run" || help.kind === "terminal";
}
function helpTarget(help) {
  if (help.kind === "open") return `open ${help.path}`;
  if (help.kind === "link") return `link ${help.url}`;
  return `command ${commandOf(help)}`;
}
function withHelp(helps, help) {
  const command = commandOf(help);
  const kept = isCommand(help) ? helps.filter((h) => h.kind !== "copy" || commandOf(h) !== command) : helps;
  const isCovered = kept.some((h) => helpTarget(h) === helpTarget(help));
  return isCovered || kept.length >= MAX_HELPS ? kept : [...kept, help];
}
var KEY_LINE = /^\s*[-*]?\s*(?:(NONE)(?::|\s|$)|(CLOSED|FIXED|ASKED|NEW|UPDATE|HELP|TODO)\s*:)\s*(.*)$/;
function keyOf(line) {
  const m = KEY_LINE.exec(line);
  return m ? { key: m[1] ?? m[2], value: m[3] ?? "" } : null;
}
function lastAnswerStart(lines) {
  let start = 0;
  let hasKeys = false;
  let isAfterProse = false;
  lines.forEach((line, i) => {
    if (keyOf(line)) {
      if (hasKeys && isAfterProse) start = i;
      hasKeys = true;
      isAfterProse = false;
    } else if (line.trim() !== "") isAfterProse = true;
  });
  return start;
}
function parseReply(text2, source = null) {
  const blocks = source === null ? [] : codeBlocks(source);
  const closed = [];
  const added = [];
  const helped = [];
  const updated = [];
  const helps = [];
  const asks = [];
  const todos = [];
  let seen = 0;
  const lines = text2.split(NL3);
  const newLines = [];
  for (const raw of lines.slice(lastAnswerStart(lines))) {
    const parsed = keyOf(raw);
    if (!parsed) continue;
    seen += 1;
    const key = parsed.key;
    const value = dash(parsed.value) ?? "";
    if (key === "NONE") continue;
    if (key === "CLOSED" || key === "FIXED") {
      const [id, outcome] = value.split("|").map((s) => s.trim());
      if (id && /^f\d/.test(id) === (key === "FIXED")) closed.push({ id, outcome: outcome ?? "" });
    } else if (key === "ASKED") {
      const [id, target] = value.split("|").map((s) => s.trim());
      if (id && /^f\d+$/.test(id) && target) asks.push({ id, target });
    } else if (key === "NEW") {
      const fields2 = value.split("|");
      const isLabelSkipped = !dash(fields2[2]) && /\s/.test((fields2[1] ?? "").trim());
      const [kind, label, ask, ...rest] = (isLabelSkipped ? [fields2[0], "-", ...fields2.slice(1)] : fields2).map(dash);
      const last = rest.at(-1);
      const isDesignField = rest.length > 2 && (last === null || /^design$/i.test(last ?? ""));
      if (isDesignField) rest.pop();
      const rec = rest.length > 1 ? rest.pop() : null;
      if (!ask) {
        newLines.push(void 0);
        continue;
      }
      const options = rest.flatMap((o) => o?.split(/\s+\/\s+/) ?? []).filter(Boolean);
      const isDesignChoice = isDesignField && last !== null && readKind(kind) === "question";
      const item = {
        kind: readKind(kind),
        label: label ?? null,
        ask,
        options,
        rec: recommendedOption(options, rec ?? null),
        helps: [],
        ...isDesignChoice ? { isDesignChoice } : {}
      };
      added.push(item);
      newLines.push(item);
    } else if (key === "TODO" && value && !isTakenUp(value, source)) {
      todos.push(value);
    } else if (key === "UPDATE") {
      const [target, options, rec] = value.split("|").map(dash);
      const id = target?.match(/\b(i\d+)\b/)?.[1];
      if (id)
        updated.push({ id, options: options ? options.split(/\s+\/\s+/).filter(Boolean) : null, rec: rec ?? null });
    } else if (key === "HELP") {
      const [target, kind, ...tail] = value.split("|");
      const { help, name } = helpFields(tail, source);
      const parsed2 = readHelp((kind ?? "").trim(), help, name, blocks, source);
      if (parsed2 && target) helps.push({ target: target.trim(), help: parsed2 });
    }
  }
  for (const { target, help } of helps) {
    const n = target.match(/\bnew\s*(\d+)\b/i);
    const id = target.match(/\b(i\d+)\b/)?.[1];
    const item = n ? newLines[Number(n[1]) - 1] : void 0;
    if (item) item.helps = withHelp(item.helps, help);
    else if (!n && id) helped.push({ id, help });
  }
  const asked = [];
  for (const { id, target } of asks) {
    const n = target.match(/\bnew\s*(\d+)\b/i);
    const item = n ? added.indexOf(newLines[Number(n[1]) - 1]) : target.match(/\b(i\d+)\b/)?.[1];
    if (item !== void 0 && item !== -1) asked.push({ id, item });
  }
  return seen === 0 ? null : { closed, added, helped, updated, asked, todos };
}
function isTakenUp(work, reply) {
  const key = [...keyWords(work)];
  const said = new Set(words2(reply ?? ""));
  return key.length > 0 && key.filter((w) => said.has(w)).length * 2 >= key.length;
}
function todoAsk(work) {
  return `Ready to start on ${work.replace(/[.?!\s]+$/, "")}?`;
}
var FILLER = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "use",
  "into",
  "from",
  "that",
  "this",
  "your",
  "you",
  "should",
  "make",
  "add",
  "all"
]);
function keyWords(text2) {
  return new Set(words2(text2).filter((w) => new RegExp("\\p{N}", "u").test(w) || w.length > 2 && !FILLER.has(w)));
}
function restates(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const fewer = Math.min(x.size, y.size);
  const shared = [...x].filter((w) => y.has(w)).length;
  const numbers = (words3) => [...words3].filter((w) => new RegExp("\\p{N}", "u").test(w)).sort().join(" ");
  if (numbers(x) !== "" && numbers(y) !== "" && numbers(x) !== numbers(y)) return false;
  return fewer >= 2 ? shared / fewer >= 0.7 : sameAsk(a, b);
}
function repeatsSubject(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const within = (inner, outer) => [...inner].every((w) => outer.has(w));
  return sameAsk(a, b) || restates(a, b) && (within(x, y) || within(y, x));
}
function sameAsk(a, b) {
  const norm = (s) => words2(s).join(" ");
  return norm(a) !== "" && norm(a) === norm(b);
}
function matchOpen(items, a, sameBatch = /* @__PURE__ */ new Set()) {
  return items.findIndex(
    (i) => i.id === a.label || sameAsk(i.ask, a.ask) || !sameBatch.has(i.id) && i.kind === a.kind && restates(i.ask, a.ask)
  );
}
function repeatsClosed(closed, a, since) {
  const recent = closed.filter((c) => c.at >= since && !isAskedForChoices(c));
  const settled = closed.filter((c) => c.at < since && c.how !== "expired");
  return matchOpen(recent, a) >= 0 || a.label !== null && recent.some((c) => c.label === a.label) || settled.some((c) => repeatsSettled(c, a));
}
var LIST_CHOICES = "List the choices";
function isAskedForChoices(c) {
  return c.how === "answered" && c.outcome.trim().toLowerCase() === LIST_CHOICES.toLowerCase();
}
function repeatsSettled(c, a) {
  if (isAskedForChoices(c)) return false;
  if (c.how === "answered") return c.id === a.label || sameAsk(c.ask, a.ask);
  return c.id === a.label || sameAsk(c.ask, a.ask) || c.kind === a.kind && repeatsSubject(c.ask, a.ask);
}
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now, askedAs) {
  return { ...finding, ...askedAs ? { askedAs } : {}, ...closing, closedAt: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function closeFinding(ledger, id, closing, now, askedAs) {
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) return ledger;
  return {
    ...ledger,
    findings: ledger.findings.filter((f) => f.id !== id),
    closedFindings: [...ledger.closedFindings, closedFindingRecord(finding, closing, now, askedAs)]
  };
}
var SHARED_TITLE_WORDS = 2;
var PUT_OFF = /\b(?:not (?:now|yet)|put off|for later|postpone|defer)/i;
function leavesWorkOpen(c) {
  return c.how !== "done" && (isLapsed(c) || PUT_OFF.test(c.outcome));
}
function reopenAskedFindings(ledger, closes) {
  return closes.filter(leavesWorkOpen).reduce((l, c) => {
    const record2 = l.closedFindings.findLast((f) => f.askedAs === c.id);
    if (!record2) return l;
    const reopened = reopenFinding(l, record2.id);
    return {
      ...reopened,
      findings: reopened.findings.map((f) => {
        const { askedAs: _askedAs, ...rest } = f;
        return f.id === record2.id ? rest : f;
      })
    };
  }, ledger);
}
function prNumbers(text2) {
  return new Set([...text2.matchAll(/(?:#|\bPR\s*#?|\/pull\/)(\d+)/gi)].map((m) => m[1]));
}
function asksAbout(item, finding, isClaimed = false) {
  if (item.label === finding.id) return true;
  if (restates(finding.title, item.ask) || restates(finding.detail, item.ask)) return true;
  if (isClaimed) {
    const known = keyWords(finding.title);
    if ([...keyWords(item.ask)].filter((w) => known.has(w)).length >= SHARED_TITLE_WORDS) return true;
  }
  const itemPrs = prNumbers(`${item.label ?? ""} ${item.ask}`);
  return [...prNumbers(`${finding.title} ${finding.detail}`)].some((n) => itemPrs.has(n));
}
function pruneClosed(ledger, keep) {
  const pruned = (records) => records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id));
  return { ...ledger, closed: pruned(ledger.closed), closedFindings: pruned(ledger.closedFindings) };
}
function idNumber(id) {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN);
}
function inIdOrder(open2, entry) {
  const at = open2.findIndex((x) => idNumber(x.id) > idNumber(entry.id));
  return at < 0 ? [...open2, entry] : [...open2.slice(0, at), entry, ...open2.slice(at)];
}
function reopenItem(ledger, id) {
  const item = ledger.closed.findLast((c) => c.id === id)?.item;
  if (!item || ledger.items.some((i) => i.id === id)) return ledger;
  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter((c) => c.id !== id) };
}
function reopenFinding(ledger, id) {
  const record2 = ledger.closedFindings.findLast((f) => f.id === id);
  if (!record2 || ledger.findings.some((f) => f.id === id)) return ledger;
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record2;
  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter((f) => f.id !== id)
  };
}
var SENT_PRESS_KINDS = {
  answer: "mark",
  explain: "talk",
  compare: "talk",
  run: "handoff",
  done: "mark"
};
function applyExchangeUpdate(ledger, update, exchange, now, promptAt) {
  const press = exchange.press;
  const talkedAboutId = press && SENT_PRESS_KINDS[press.action] === "talk" ? press.id : null;
  return applyUpdate(
    ledger,
    { ...update, closed: update.closed.filter((c) => c.id !== talkedAboutId) },
    now,
    exchange.turn,
    promptAt
  );
}
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");
function isPersonsAnswer(outcome) {
  return outcome.trim() !== "" && !NOT_AN_ANSWER.test(outcome);
}
function applyUpdate(ledger, u, now, turn, promptAt = now) {
  const stillAsked = new Set(u.updated.filter((c) => c.options || c.rec).map((c) => c.id));
  const closing = new Map(
    u.closed.filter((c) => !stillAsked.has(c.id) && !UNFOUNDED_MOOT.test(c.outcome)).map((c) => [c.id, c.outcome])
  );
  const closed = [...ledger.closed];
  const items = [];
  for (const item of ledger.items) {
    const outcome = closing.get(item.id);
    const helps = u.helped.filter((h) => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps);
    const isClosing = outcome !== void 0 && (item.from !== "record" || isPersonsAnswer(outcome));
    if (isClosing) closed.push(closedRecord(item, { outcome, how: "update" }, now));
    else items.push(withUpdate({ ...item, helps }, u.updated));
  }
  const recordedThisTurn = new Set(
    [...ledger.items, ...ledger.closed.flatMap((c) => c.item ?? [])].filter((i) => i.from === "record" && i.turn === turn).map((i) => i.kind)
  );
  let nextId = ledger.nextId;
  let added = 0;
  const addedIds = [];
  const created = /* @__PURE__ */ new Set();
  for (const a of u.added) {
    if (repeatsClosed(ledger.closed, a, promptAt)) {
      addedIds.push(null);
      continue;
    }
    const at = matchOpen(items, a, created);
    const restated = items[at];
    if (restated) {
      items[at] = {
        ...restated,
        helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps),
        ...a.isDesignChoice ? { isDesignChoice: true } : {}
      };
      addedIds.push(restated.id);
      continue;
    }
    if (recordedThisTurn.has(a.kind)) {
      addedIds.push(null);
      continue;
    }
    items.push({ ...a, id: `i${nextId}`, turn, at: now, from: "update" });
    addedIds.push(`i${nextId}`);
    created.add(`i${nextId}`);
    nextId += 1;
    added += 1;
  }
  for (const work of u.todos) {
    const todo = {
      kind: "question",
      label: null,
      ask: todoAsk(work),
      options: ["Proceed", "Not yet"],
      rec: null
    };
    const isKnown = items.some((i) => restates(i.ask, work)) || ledger.findings.some((f) => restates(f.title, work)) || repeatsClosed(ledger.closed, { ...todo, helps: [] }, promptAt);
    if (isKnown) continue;
    items.push({ ...todo, helps: [], id: `i${nextId}`, turn, at: now, from: "update" });
    nextId += 1;
    added += 1;
  }
  const kept = items.filter((i) => i.from === "record" || turn - i.turn <= STALE_AFTER).slice(-MAX_OPEN);
  for (const i of items) if (!kept.includes(i)) closed.push(closedRecord(i, { outcome: EXPIRED, how: "expired" }, now));
  const askedBy = /* @__PURE__ */ new Map();
  for (const a of u.asked) {
    const id = typeof a.item === "number" ? addedIds[a.item] : a.item;
    const asker = kept.find((i) => i.id === id);
    const finding = ledger.findings.find((f) => f.id === a.id);
    if (asker && finding && asksAbout(asker, finding, true)) askedBy.set(a.id, asker.id);
  }
  for (const i of kept.filter((i2) => created.has(i2.id)))
    for (const f of ledger.findings) if (!askedBy.has(f.id) && asksAbout(i, f)) askedBy.set(f.id, i.id);
  const { findings, closedFindings } = ledger.findings.reduce((l, f) => {
    const asker = askedBy.get(f.id);
    const outcome = closing.get(f.id);
    if (outcome !== void 0) return closeFinding(l, f.id, { outcome, how: "update" }, now);
    return asker ? closeFinding(l, f.id, { outcome: `asked as ${asker}`, how: "update" }, now, asker) : l;
  }, ledger);
  return reopenAskedFindings(
    {
      ...ledger,
      items: kept,
      closed,
      findings,
      closedFindings,
      nextId,
      batchTurn: added > 0 ? turn : ledger.batchTurn,
      updates: ledger.updates + 1
    },
    closed.slice(ledger.closed.length)
  );
}
function withUpdate(item, updated) {
  const change = updated.findLast((c) => c.id === item.id);
  if (!change || item.kind !== "question") return item;
  const options = change.options ?? item.options;
  return { ...item, options, rec: recommendedOption(options, change.rec ?? item.rec) };
}
function closedState(d) {
  if (d.how === "dismissed") return "dismissed";
  if (d.how === "expired") return "lapsed";
  const isOvertaken = OVERTAKEN.test(d.outcome);
  return (d.how === "claude" || d.how === "update") && isOvertaken ? "lapsed" : "handled";
}
function isLapsed(d) {
  return closedState(d) !== "handled";
}

// ../hooks/host-tasks.ts
var NL4 = "\n";
var TASKS_KEPT = 12;
var STATUSES2 = {
  pending: "pending",
  in_progress: "in-progress",
  "in-progress": "in-progress",
  completed: "done",
  done: "done",
  abandoned: "dropped",
  blocked: "blocked"
};
var recordOf = (raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
function upgradeHostTasks(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((raw) => {
    const t = recordOf(raw);
    const status = STATUSES2[String(t.status)];
    return typeof t.id === "string" && typeof t.text === "string" && t.text !== "" && status ? [{ id: t.id, text: t.text, status }] : [];
  });
}
function keptTasks(tasks) {
  let toCut = tasks.length - TASKS_KEPT;
  if (toCut <= 0) return tasks;
  const kept = tasks.filter((t) => {
    const isFinished = t.status === "done" || t.status === "dropped";
    if (!isFinished || toCut <= 0) return true;
    toCut -= 1;
    return false;
  });
  return kept.slice(-TASKS_KEPT);
}
function tasksText(tasks) {
  return keptTasks(tasks).map((t) => `TASK: ${t.status} | ${t.text}`).join(NL4);
}

// ../hooks/model-text.ts
var NL5 = "\n";
var MODEL_KIND = { question: "decide", task: "do" };
function systemText(host) {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : "";
  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec | design
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: the agent's final reply
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text. When nothing in the exchange changes the ledger, answer with the one line NONE.

NONE: nothing in the exchange changes the ledger. Write it alone.
CLOSED: <id> | the outcome, at most 8 words, in one of three forms. When the person answered in <person>, write their answer. Otherwise write "done: <what the agent did>" when the work is done, or "no longer applies: <what in the reply or <activity> made it moot>". An option the agent picked on its own, or an option the work made moot, is not the person's answer: write it in the "done:" or "no longer applies:" form. One line for each item in <open> the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers), or that the reply or <activity> shows is done or no longer applies. A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. An item that has nothing to do with this exchange stays open: being outside the current work, or not being mentioned, does not make it no longer apply.
FIXED: <id> | the change that fixed it, at most 8 words. One line for each finding in <findings> whose problem the reply, <activity> or <person> shows was fixed by a change to the work. Only a change fixes a finding. When the person puts a finding off, sets it aside or says it does not matter, write no FIXED line: it stays open until they dismiss it.
ASKED: <id> | <item>
  For a finding in <findings> that a NEW line or an item in <open> asks the person about. item: "new N" for the Nth NEW line in your answer, or an id from <open>. The item takes the finding's place, so the person sees it once.
NEW: <kind> | <label> | <ask> | <options> | <rec> | <design>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide or do something about it now; then also write an ASKED line for it. Also one line per dialog in <activity> that the person dismissed or left unanswered, with an ASKED line when the dialog asks about a finding. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means. Name an item or finding by what it says, never by its id: the person does not see ids.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  design: "design" for a "decide" item whose options are designs or approaches the agent could try and show side by side, such as two layouts or two ways to build a feature. Otherwise "-", as for a fact, an approval or a preference.
  Skip: rhetorical questions; offers to go on with the next step of the task the person already asked for ("Want me to start on the next file?"); FYIs; generic "let me know", though the agent holding an act that changes or publishes something (commit, push, edit a shared page) until the person agrees is a "decide" item ("Say when you want those committed"); invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
UPDATE: <id> | <options> | <rec>
  For a "decide" item in <open> when the reply now offers it different answers, or states a recommendation for it that <open> does not show. options: the answers the person can now pick, as in NEW, or "-" to keep them. rec: as in NEW, or "-" to keep it. Rewording the question is not a change.
HELP: <item> | <kind> | <value> | <name>
  A step that does part of an item's work in one press, when the reply or activity already spells it out: the file to edit, the text to paste, the command to run, the page to visit. Not background reading. Up to 3 per item, most useful first.
  item: "new N" for the Nth NEW line in your answer, or an id from <open>.
  kind and value:
    open | a file or folder the person needs to open or edit, the path as written
    copy | text for the person to paste into a file or form, never a command: "block N" for the code block marked [block N] in <reply>, or one line of text
    run | a shell command the reply asks the person to run or approve: "block N" or the command
    terminal | a shell command the reply says only the person can run, because it needs their credentials, password, device or account. The command a "do" item asks the person to run is always terminal: "block N" or the command
    link | an https URL the person needs to visit
  name: what a copy, command or link is, at most 3 words ("settings snippet", "removal command", "token page"), or "-".
  Use only paths, commands, text and URLs that appear in <reply> or <activity>. Never invent one.
TODO: <work>
  For a todo in <person>: work the person sets aside for later, as in "todo: X", and the reply leaves undone. work: at most 12 words, worded to follow "Ready to start on".

Write plainly. No jargon, no filler, no markdown.`;
}
var CATCH_UP = "The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>.";
function transcriptCatchUpPrompt(ledger, screen, transcript) {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<conversation>${NL5}${numberBlocks(transcript)}${NL5}</conversation>`,
    `<screen>${NL5}${screen}${NL5}</screen>`
  ].join(NL5);
}
var MAX_ACTIVITY = 40;
function addActivity(activity, line) {
  return !line || activity.length >= MAX_ACTIVITY || activity.includes(line) ? activity : [...activity, line];
}
function toolActivity(tool, input) {
  const text2 = (key) => typeof input[key] === "string" ? input[key] : "";
  switch (tool) {
    case "Bash":
      return `${input.run_in_background ? "started in background" : "ran"}: ${text2("command").slice(0, 140)}`;
    case "Edit":
    case "Write":
      return `edited ${text2("file_path")}`;
    case "Skill":
      return `used skill ${text2("skill")}`;
    case "Agent":
      return `started agent: ${text2("description")}`;
  }
  return tool.startsWith("mcp__") ? `called ${tool.slice(5)}` : null;
}
var DIALOG_QUESTIONS_SHOWN = 3;
var DIALOG_QUESTION_MAX = 200;
var DIALOG_OPTIONS_SHOWN = 6;
var DIALOG_OPTION_MAX = 60;
var DIALOG_ANSWER_MAX = 400;
var RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i;
function dialogQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => {
    const fields2 = q ?? {};
    const text2 = [fields2.question, fields2.title].find((v) => typeof v === "string" && v.trim() !== "");
    if (!text2) return [];
    const options = (Array.isArray(fields2.options) ? fields2.options : []).flatMap((o) => {
      const option = typeof o === "string" ? { label: o } : o ?? {};
      const label = typeof option.label === "string" ? option.label.trim() : "";
      const description = typeof option.description === "string" ? option.description.trim() : "";
      return label === "" ? [] : [{ label, description }];
    });
    return [
      {
        question: text2.trim(),
        options: options.map((o) => o.label),
        descriptions: Object.fromEntries(options.filter((o) => o.description !== "").map((o) => [o.label, o.description]))
      }
    ];
  });
}
function dialogQuestionText(q) {
  const shown = q.options.slice(0, DIALOG_OPTIONS_SHOWN).map((label) => {
    const plain = label.replace(RECOMMENDED_SUFFIX, "");
    const text2 = clip(plain, DIALOG_OPTION_MAX);
    return plain === label ? text2 : `${text2} (recommended)`;
  });
  const more = q.options.length > shown.length ? ` / and ${q.options.length - shown.length} more` : "";
  const options = shown.length > 0 ? ` (options: ${shown.join(" / ")}${more})` : "";
  return `"${clip(q.question.replaceAll('"', "'"), DIALOG_QUESTION_MAX)}"${options}`;
}
function dialogActivity(questions, outcome) {
  const shown = questions.slice(0, DIALOG_QUESTIONS_SHOWN).map(dialogQuestionText);
  const more = questions.length - shown.length;
  const asked = shown.length > 0 ? `: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}` : "";
  const head = `asked the user in a dialog${asked}`;
  switch (outcome.kind) {
    case "answered":
      return `${head}; answer: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`;
    case "timed-out":
      return `${head}; it timed out while the user was away, so the user did not answer; it went on with: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`;
    case "dismissed":
      return `${head}; the user dismissed it without answering`;
    case "open":
      return `${head}; still open, waiting on the user's answer`;
  }
}
function ledgerBlocks(ledger) {
  const open2 = ledger.items.map(
    (i) => `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? "-"} | ${i.ask} | ${i.options.join(" / ") || "-"} | ${i.rec ?? "-"} | ${i.isDesignChoice ? "design" : "-"}`
  ).join(NL5);
  const findings = ledger.findings.map((f) => `${f.id} | ${f.kind}: ${f.title}`).join(NL5);
  const closed = ledger.closed.filter((d) => d.how !== "expired" && !isAskedForChoices(d)).map((d) => `${d.ask} \u2192 ${outcomeText(d)}`).join(NL5);
  return [
    `<open>${NL5}${open2}${NL5}</open>`,
    `<findings>${NL5}${findings}${NL5}</findings>`,
    `<decided>${NL5}${closed}${NL5}</decided>`
  ];
}
function buildPrompt(ledger, ex) {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? "unknown"}.)`;
  return [
    ...ledgerBlocks(ledger),
    `<person>${NL5}${clipMiddle(person, 4e3, 1500)}${NL5}</person>`,
    `<activity>${NL5}${clipMiddle(ex.activity.join(NL5), 2500, 500)}${NL5}</activity>`,
    `<reply>${NL5}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL5}</reply>`,
    `<screen>${NL5}${ex.screen}${NL5}</screen>`
  ].join(NL5);
}
var OVERVIEW_SYSTEM = `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <goal>: the session's goal. Do not restate it.
- <subjects>: the open subjects, one per line: id | status | name | where it stands
- <finished>: subjects already done or dropped. Do not add them again.
- <running>: work running apart from the turn, such as a subagent, a background task, a workflow or a delegate session, one per line: id | kind | name | the subject it belongs to, or - when it has none yet
- <tasks>: the agent's own task list, when it keeps one. It is evidence, not the list: write each subject at the level of the feature. A pending task for another part of the product, one the person would name on its own, is a queued subject.
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: the agent's final reply

Answer with lines only. No other text, and no corrections: every line you write is applied. When the exchange changed nothing about where any subject stands, answer with the one line NO CHANGE. Most exchanges change nothing.

Otherwise write only the lines that apply:
NEW: status | name | where it stands
SET: id or name | status | where it stands
DONE: id or name | where it ended
DROP: id or name | why
DROP: id or name | why | INTO id or name
WAS: id or name | the plan it replaces
LINK: running id | subject id or name
ROLE: coordinator or session
GOAL: the goal in the person's words, at most ${GOAL_WORDS} words

A subject is one piece of the work that the person would name: a feature, a fix, a release, a problem, or a stream of work handed to another session. Keep at most ${OPEN_SUBJECTS} open. A fix, an option, a review or a question inside a larger piece of work belongs to that subject: change its text instead, as in "critique fixes: 4 of 9 done". A subject is never a command, a file, a commit, a test run or a tool call.

The name is at most ${NAME_WORDS} words, the handle the person would use. Where it stands is at most ${TEXT_WORDS} words: its state now, not what the agent did. Say what works or is fixed, not the step that got it there: never committed, pushed, rebuilt, restarted or tests passing. Never write a time, a date, or a word such as today, yesterday, ago or now. Code shows how long ago each subject changed.

Status is one of: working, queued, waits-on-you, waits-on-other, problem.
- working: being worked on now, in this session or in a session it handed the work to. When the work stopped, it is queued, waits on someone, or is done.
- queued: planned, not started.
- waits-on-you: the subject's work has stopped until the person acts. A question to the person is not a subject of its own.
- waits-on-other: it waits on something else, such as a build, a review or another session.
- problem: something broken or wrong that no one is fixing now.

Rules:
- Change a subject by its id. Write NEW only when no subject in <subjects> covers it.
- When work started and finished in this exchange, write NEW for it, then DONE with its name.
- Write SET only when where a subject stands changed. Never reword a subject that did not change.
- Write DONE when a subject is finished, and DROP when it is abandoned or no longer true, with the reason.
- When the plan for a subject reverses, or another subject takes its work, write WAS with the plan it replaces. Use DROP with INTO when the work moved into another subject.
- The inbox shows each question and task for the person, with its options. Mark the subject waits-on-you, and say where its work stands or "needs your decision". Never name the choices.
- Write LINK for each item in <running> that has no subject yet, naming the subject whose work it does. Never write NEW for a running item, or its progress in its subject's text: code shows it under its subject while it runs and removes it when it ends. When its result comes back in the exchange, change its subject with SET or DONE if the result changed where the subject stands.
- Write ROLE coordinator when the session hands out work and reviews what comes back instead of doing the work itself. Write ROLE only when it changes.
- Write GOAL only when <goal> is empty, when the person states a new goal, or when the work moves to a different task.`;
function overviewBlocks(last, tasks, now) {
  const { open: open2, finished } = subjectsText(last);
  const running = runningText(last, now);
  const list = tasksText(tasks);
  return [
    `<goal>${NL5}${last?.goal || "(none yet)"}${NL5}</goal>`,
    `<subjects>${NL5}${open2}${NL5}</subjects>`,
    ...finished === "" ? [] : [`<finished>${NL5}${finished}${NL5}</finished>`],
    ...running === "" ? [] : [`<running>${NL5}${running}${NL5}</running>`],
    ...list === "" ? [] : [`<tasks>${NL5}${list}${NL5}</tasks>`]
  ];
}
function overviewPrompt(last, ex, tasks, now) {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? "unknown"}.)`;
  return [
    ...overviewBlocks(last, tasks, now),
    `<person>${NL5}${clipMiddle(person, 4e3, 1500)}${NL5}</person>`,
    `<activity>${NL5}${clipMiddle(ex.activity.join(NL5), 2500, 500)}${NL5}</activity>`,
    `<reply>${NL5}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL5}</reply>`
  ].join(NL5);
}
function overviewCatchUpPrompt(last, transcript, tasks, now) {
  return [
    "Treat the conversation in <conversation> as the exchange. Its start may be cut. Answer with the changes that bring the list to where the conversation ends.",
    ...overviewBlocks(last, tasks, now),
    `<conversation>${NL5}${numberBlocks(transcript)}${NL5}</conversation>`
  ].join(NL5);
}
function surfaceAtStart(host) {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1);
}
function screenText(host, isOpen2, tab) {
  if (!isOpen2) return `${surfaceAtStart(host)} is closed.`;
  if (tab?.isPage)
    return `${surfaceAtStart(host)} is open beside the conversation, on its ${tab.label} tab, which shows a guide to the session's work, not rows.`;
  return `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab.label} tab, ` : ""}listing every open item.`;
}
function latestBatch(ledger) {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => i.turn === ledger.batchTurn);
}
function numberOf(label) {
  const m = label?.match(/(?:^|[^A-Za-z\d])(?:[QqDd#]\s?)?(\d{1,2})(?!\d)/);
  return m ? Number(m[1]) : null;
}
function answerableBatch(ledger, promptTurn) {
  return ledger.batchTurn === promptTurn - 1 ? latestBatch(ledger) : [];
}
function batchNumbers(batch) {
  const hasLabels = batch.some((i) => numberOf(i.label) !== null);
  const byNumber = /* @__PURE__ */ new Map();
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1;
    if (n !== null && !byNumber.has(n)) byNumber.set(n, item);
  });
  return byNumber;
}
function questionNumbers(ledger, promptTurn) {
  const numbers = /* @__PURE__ */ new Map();
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === "question") numbers.set(item.id, n);
  return numbers;
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/dialogs.ts
function optionKey(option) {
  return option.replace(RECOMMENDED_SUFFIX, "").trim().toLowerCase();
}
function optionsKey(options) {
  return options.map(optionKey).sort().join("\n");
}
function hasSameOptions(item, q) {
  return item.options.length > 0 && optionsKey(item.options) === optionsKey(q.options);
}
function copyOf(q, items, questions) {
  const byOptions = items.filter((i) => hasSameOptions(i, q));
  const [only] = byOptions;
  if (only && byOptions.length === 1 && questions.filter((o) => hasSameOptions(only, o)).length === 1) return only;
  const pool = byOptions.length > 0 ? byOptions : items;
  const byAsk = pool.filter((i) => restates(i.ask, q.question));
  const [asked] = byAsk;
  if (!asked || byAsk.length !== 1) return null;
  const restated = questions.filter((o) => restates(asked.ask, o.question));
  return restated.length === 1 ? asked : null;
}
function descriptionsFor(options, descriptions) {
  const byKey = new Map(Object.entries(descriptions).map(([label, text2]) => [optionKey(label), text2]));
  const matched = options.flatMap((o) => {
    const text2 = byKey.get(optionKey(o));
    return text2 === void 0 ? [] : [[o, text2]];
  });
  return matched.length > 0 ? Object.fromEntries(matched) : null;
}
function asCopyOf(item, q) {
  const descriptions = descriptionsFor(item.options, q.descriptions);
  return {
    ...item,
    ...q.callId === null ? {} : { dialog: { callId: q.callId, index: q.index, question: q.question } },
    ...descriptions ? { optionDescriptions: descriptions } : {}
  };
}
function linkDialogs(s) {
  if (s.dialogQuestions.length === 0) return s;
  let items = s.ledger.items;
  const linked = new Set(s.dialogQuestions.flatMap((q) => q.itemId ?? []));
  const questions = s.dialogQuestions.map((q) => {
    if (q.itemId !== null) return q;
    const turnItems = items.filter((i) => i.kind === "question" && i.turn === q.turn);
    const copy = copyOf(
      q,
      turnItems,
      s.dialogQuestions.filter((o) => o.turn === q.turn)
    );
    if (!copy || copy.dialog || linked.has(copy.id)) return q;
    linked.add(copy.id);
    items = items.map((i) => i.id === copy.id ? asCopyOf(i, q) : i);
    return { ...q, itemId: copy.id };
  });
  const kept = questions.filter((q) => q.turn === s.ledger.turn || s.pending.some((p) => p.ex.turn === q.turn));
  return { ...s, ledger: { ...s.ledger, items }, dialogQuestions: kept };
}

// ../hooks/prs.ts
function namedPrs(text2, refs) {
  const numbers = new Set([...text2.matchAll(/#(\d+)\b/g)].map((m) => m[1]));
  const known = [...new Set(refs)];
  return [...numbers].flatMap((n) => {
    const named = known.filter((ref) => parseRef(ref).number === n);
    return named.length === 1 ? named : [];
  });
}
function parseRef(ref) {
  const [repo = "", number = ""] = ref.split("#");
  const [owner = "", name = ""] = repo.split("/");
  return { repo, owner, name, number };
}
function isKeptPr(pr) {
  return pr.isYours !== false && pr.wasSeenOpen;
}
function waitingThreads(pr) {
  return pr.threads.filter((t) => t.isWaiting);
}
function threadsOnYou(pr, isSent) {
  return waitingThreads(pr).filter((t) => !t.isLinesChanged && !isSent(pr, t));
}
function prNeedsYou(pr, isSent) {
  return pr.state === "OPEN" && (pr.mergeable === "CONFLICTING" || failingChecks(pr).length > 0 || pr.reviewDecision === "CHANGES_REQUESTED" || threadsOnYou(pr, isSent).length > 0);
}
function checkCounts(pr) {
  const counts = { pass: 0, fail: 0, pending: 0, skip: 0 };
  for (const c of pr.checks) counts[c.bucket] += 1;
  return counts;
}
function threadsWaiting(count) {
  return `${count} ${count === 1 ? "thread" : "threads"} waiting on you`;
}
function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}
function readiness(pr, isSent = () => false) {
  const result = (status, head, reasonList = [], joint = ": ") => {
    const reasons = reasonList.join(", ");
    const unlisted = status === "ready" ? [] : reasonList.filter((r) => !listed.includes(r));
    return { status, text: reasons ? `${head}${joint}${reasons}` : head, head, unlisted };
  };
  const listed = [];
  if (pr.state === "MERGED") return result("merged", "Merged");
  if (pr.state !== "OPEN") return result("closed", "Closed");
  const { fail: failing, pending } = checkCounts(pr);
  const waiting = waitingThreads(pr);
  const open2 = threadsOnYou(pr, isSent).length;
  const sent = waiting.filter((t) => isSent(pr, t)).length;
  const changed = waiting.filter((t) => t.isLinesChanged && !isSent(pr, t)).length;
  const isPresent = (b) => b !== null;
  const row = (r) => r === null ? r : (listed.push(r), r);
  const onYou = [
    pr.mergeable === "CONFLICTING" ? `conflicts with ${pr.base}` : null,
    row(failing > 0 ? plural(failing, "failing check", "failing checks") : null),
    pr.reviewDecision === "CHANGES_REQUESTED" ? "changes requested" : null,
    row(open2 > 0 ? threadsWaiting(open2) : null)
  ].filter(isPresent);
  const onOthers = [
    row(sent > 0 ? `${plural(sent, "thread", "threads")} sent to Claude` : null),
    row(changed > 0 ? `${plural(changed, "thread", "threads")} on changed lines` : null),
    pr.reviewDecision === "REVIEW_REQUIRED" ? "needs approval" : null,
    pending > 0 ? `${pending} ${pending === 1 ? "check" : "checks"} running` : null
  ].filter(isPresent);
  if (pr.isDraft) return result("draft", "Draft", [...onYou, ...onOthers]);
  if (onYou.length > 0) return result("blocked", "Blocked", onYou);
  if (onOthers.length > 0) return result("waiting", "Waiting", onOthers);
  const isApproved = pr.reviewDecision === "APPROVED";
  return result(
    "ready",
    "Ready to merge",
    [...isApproved ? ["approved"] : [], "checks pass", "no threads waiting on you"],
    isApproved ? ": " : ", "
  );
}
var STATUS_ORDER = { blocked: 0, ready: 1, draft: 2, waiting: 3, merged: 4, closed: 5 };
function inPrOrder(prs) {
  const rank = new Map(prs.map((pr) => [pr, STATUS_ORDER[readiness(pr).status]]));
  return [...prs].sort((a, b) => rank.get(a) - rank.get(b) || b.number - a.number || a.ref.localeCompare(b.ref));
}
function failingChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "fail");
}

// ../hooks/presses.ts
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}
function helpLabel(help) {
  const label = help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? help.command}` : help.kind === "terminal" ? `Copy ${help.name ?? help.command}` : `Open ${help.name ?? new URL(help.url).host}`;
  return clipLabel(label, 32);
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open2 = helps.find((h) => h.kind === "open");
  if (!copy || !open2 || copy.kind !== "copy" || open2.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map(
    (h) => h === open2 ? { label: clipLabel(`Copy ${copy.name ?? "snippet"} and open ${baseName(open2.path)}`, 48), step: [copy, open2] } : { label: helpLabel(h), step: [h] }
  );
}
function prSteps(item, tracked) {
  const urls = new Map(tracked.map((pr) => [pr.ref, pr.url]));
  const links = namedPrs(item.ask, [...urls.keys()]).map((ref) => {
    const { repo, number } = parseRef(ref);
    const url = urls.get(ref) ?? `https://github.com/${repo}/pull/${number}`;
    return { kind: "link", url, name: `PR #${number}` };
  }).filter((l) => !item.helps.some((h) => h.kind === "link" && h.url === l.url));
  return links.length === 0 ? [] : [{ label: links.length === 1 ? helpLabel(links[0]) : `Open ${links.length} PRs`, step: links }];
}
function stepsOf(item, extraSteps) {
  return [...steps(item.helps), ...extraSteps];
}
function isAwaitingReply(last, turns) {
  const pressed = last?.delivery?.state !== "failed" ? last?.turnsStarted : void 0;
  return pressed !== void 0 && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed;
}
function isHandedOff(last, turns) {
  return last?.kind === "handoff" && isAwaitingReply(last, turns);
}
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}
function isFoldingPress(id, last) {
  return !id.startsWith("pr:") && last?.kind === "handoff" && last.action !== "address";
}
function isFixSent(last) {
  return last?.action === "address" && !last.isKept && last.delivery?.state !== "failed";
}
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text2) {
  return text2.charAt(0).toUpperCase() + text2.slice(1);
}
function stepIconKind(step) {
  if (!step) return void 0;
  if (step.step.some((h) => h.kind === "run")) return "run";
  const first = step.step[0]?.kind;
  return first === "copy" || first === "terminal" ? "copy" : first === "open" || first === "link" ? "open" : void 0;
}
var HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/;
var PR_RENAMES = [
  [/^address-all-/, "pr-address-all"],
  [/^resolve-/, "pr-conflicts"]
];
var THREAD_RENAMES = [
  [/^address-/, "thread-address"],
  [/^draft-/, "thread-draft"],
  [/^discuss-/, "thread-discuss"]
];
var ROW_RENAMES = [
  [/^explain(-|$)/, "explain"],
  [/^(help-.+-|step-)\d+$/, (old) => `step-${old.split("-").pop()}`],
  [/^typed$/, "type"],
  [/^address(-|$)/, "address"],
  [/^discuss(-|$)/, "discuss"]
];
function upgradedLastAction(key, old) {
  const renames = key.startsWith("pr:") ? PR_RENAMES : key.includes(" thread ") ? THREAD_RENAMES : ROW_RENAMES;
  const found = renames.find(([pattern]) => pattern.test(old.action));
  const action = found ? typeof found[1] === "function" ? found[1](old.action) : found[1] : null;
  if (action === null) return null;
  const { isHandoff, ...kept } = old;
  const isHandedOff2 = isHandoff ?? HANDOFF_IDS.test(action);
  return {
    ...kept,
    kind: isHandedOff2 ? "handoff" : "talk",
    action,
    // Earlier builds saved "Explain sent" or "Sent to Claude to fix"; a last action is now the label pressed.
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? "Address" : old.text.replace(/ sent$/, "")
  };
}
function upgradeLastActions(saved) {
  return Object.fromEntries(
    Object.entries(saved).flatMap(([key, entry]) => {
      const {
        tab: _tab,
        title: _title,
        index: _index,
        ...last
      } = entry;
      if ("kind" in last && last.kind) return [[key, last]];
      const upgraded2 = upgradedLastAction(key, last);
      return upgraded2 ? [[key, upgraded2]] : [];
    })
  );
}
function isUndoable(c) {
  return (c.how === "done" || c.how === "dismissed") && !c.isSentToAgent;
}
var ISSUE_LABEL = "File issue";
function retryOf(id, last) {
  if (!/^[if]\d+$/.test(id)) return null;
  const step = /^step-(\d+)$/.exec(last.action);
  if (step) return { action: "step", id, step: Number(step[1]), label: last.text };
  switch (last.action) {
    case "answer":
      return { action: "answer", id, option: last.text };
    case "explain":
    case "compare":
    case "address":
    case "issue":
    case "discuss":
      return { action: last.action, id };
    default:
      return null;
  }
}
function isRepeatOf(last, action) {
  return last?.action === action && last.kind !== "local" && last.delivery?.state !== "failed";
}

// ../hooks/view.ts
var OPTIONS_FOLD_AT = 5;
var OPTION_LABEL_CHARS = 32;
var CHOICE_KEYS = [..."abcfghilm"];
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "\u25B2", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "\u2726", tone: "done" }
};
var SETTLED_MS = 5120;
var QUEUED_AFTER_MS = 1e3;
var COMPARE_LIMIT_MS = 30 * 6e4;
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - last.at >= QUEUED_AFTER_MS;
}
function pendingDeliveryAt(last, now) {
  if (last?.delivery?.state === "unconfirmed") return "unconfirmed";
  if (last?.delivery?.state !== "queued") return null;
  return isQueuedAt(last, now) ? "queued" : "sending";
}
var NO_HOLDS = { replies: {}, discarded: {} };
var ROW_COPY = {
  retry: "Try again",
  send: "Send",
  cancel: "Cancel",
  discard: "Discard",
  clickField: "Click the field to type",
  relevantFile: "Relevant file: ",
  allOptions: (count) => `All ${count} options`
};
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  if (!descriptions) return [];
  return actions.flatMap((a) => {
    if (a.press.action !== "answer" || !Object.hasOwn(descriptions, a.press.option)) return [];
    const description = descriptions[a.press.option];
    return [{ label: clipLabel(a.press.option, OPTION_LABEL_CHARS), description, isFolded: a.isFolded }];
  });
}
function isWaitingRow(row) {
  return row.state.is === "open";
}
function shortAgo(ms) {
  const age = ago(ms);
  return age === "just now" ? "now" : age.replace(/ ago$/, "");
}
var UPDATE_FAILED = "Last update failed. Items from that reply may be missing.";
var UPDATE_RETRIES = " It retries after your next message.";
function needsYouOrder(ledger) {
  const newestReplyFirst = (kind) => ledger.items.filter((i) => i.kind === kind).sort((a, b) => b.turn - a.turn);
  return { questions: newestReplyFirst("question"), tasks: newestReplyFirst("task") };
}
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function feedbackOf(id, last, note, turns, now, reportedAt) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS)) return { is: "local", result };
  if (!last || last.kind === "local") return null;
  const delivery = last.delivery;
  const pending = pendingDeliveryAt(last, now);
  if (pending === "queued" || pending === "unconfirmed") return { is: pending, label: last.text, at: last.at };
  if (delivery?.state === "failed") return { is: "notSent", reason: delivery.reason, retry: retryOf(id, last) };
  const isAwaiting = isAwaitingReply(last, turns);
  const isUnreported = last.action === "compare" && !(reportedAt !== void 0 && reportedAt >= last.at);
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS;
  const working = WORKING_LABELS[last.action];
  if (last.kind === "talk" && working && (isAwaiting || isUnreported && !isPastLimit))
    return { is: "working", label: working, at: last.at };
  if (pending === "sending") return { is: "sending", label: last.text, at: last.at };
  if (isUnreported) return { is: "noComparison", at: last.at };
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: "stillOpen", at: last.at };
  const isHandedStep = last.kind === "handoff" && last.action.startsWith("step-");
  return {
    is: "done",
    label: DONE_LABELS[last.action]?.(last.text) ?? last.text,
    at: last.at,
    ...isHandedStep ? { isHandedStep: true } : {},
    ...STILL_WAITING_AFTER.has(last.action) ? { isStillWaiting: true } : {}
  };
}
function feedbackIn(id, state, last, note, turns, now, reportedAt) {
  if (state.is === "settled") return null;
  const f = feedbackOf(id, last, note, turns, now, reportedAt);
  if (state.is !== "held") return f;
  const isFailedReply = f?.is === "notSent" && last?.action === "type" && last.at >= state.at;
  return f?.is === "note" || isFailedReply ? f : { is: "closed", label: state.label, at: state.at };
}
function pressFeedbackIn(id, state, last, turns, now, reportedAt) {
  return feedbackIn(id, state, last, void 0, turns, now, reportedAt);
}
var fixLabel = (f) => f.kind === "opportunity" ? "Do it" : "Fix";
var WORKING_LABELS = {
  explain: "Explaining\u2026",
  compare: "Comparing\u2026",
  discuss: "Discussing\u2026",
  "thread-discuss": "Discussing\u2026",
  "thread-draft": "Drafting a reply\u2026"
};
var DONE_LABELS = {
  address: () => "Handed off",
  issue: () => "Asked to file",
  discuss: () => "Discussed",
  explain: () => "Explained",
  compare: () => "Compared",
  dismiss: () => "Dismissed",
  type: () => "Replied",
  "thread-address": () => "Addressed",
  "thread-discuss": () => "Discussed",
  "thread-draft": () => "Drafted a reply",
  "pr-conflicts": () => "Asked to resolve conflicts",
  "pr-merge": () => "Asked to merge",
  "pr-address-all": (text2) => text2.replace(/^Address\b/, "Addressed"),
  "check-fix": () => "Asked to fix"
};
var STILL_WAITING_AFTER = /* @__PURE__ */ new Set(["check-fix"]);
function isPressOut(f) {
  return f?.is === "working" || f?.is === "sending" || f?.is === "queued" || f?.is === "unconfirmed" || f?.is === "local" && f.result.state === "pending";
}
function pressOutAction(last, f) {
  if (!isPressOut(f)) return null;
  return (f?.is === "local" ? f.result.action : last?.action) ?? null;
}
function outAction(last, f) {
  const action = f?.is === "unconfirmed" ? null : pressOutAction(last, f);
  return action === "type" ? null : action;
}
function isAgain(last, action, isOut) {
  return isRepeatOf(last, action) && (!isOut || last?.isRepeat === true);
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var TAB_NAMES = [
  { id: "overview", label: "Overview", symbol: "\u{1F9ED}" },
  { id: "needsYou", label: "Asks", symbol: "\u{1F64B}" },
  { id: "findings", label: "Finds", symbol: "\u{1F50D}" },
  { id: "prs", label: "PRs", symbol: "\u{1F500}" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var NEXT_BUILD_TABS = numbered(TAB_NAMES);
var RELEASE_TABS = numbered(TAB_NAMES.filter((t) => t.id !== "overview"));
function isListedTab(tab) {
  return tab === "needsYou" || tab === "findings";
}
function isRowTab(tab) {
  return tab !== "overview";
}
function isShownTab(raw) {
  return TAB_NAMES.some((t) => t.id === raw);
}
function screenTabOf(tab) {
  return { label: TAB_NAMES.find((t) => t.id === tab)?.label ?? tab, isPage: !isRowTab(tab) };
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));
var LISTED_TABS = TAB_NAMES.filter((t) => isListedTab(t.id));
var WORKING_TEXT = "Working\u2026";
var LOOK_TEXT = "you looked";
var OVERVIEW_TEXT_LINES = 3;
var CHILD_ROWS = 3;
var QUIET_MS = 15 * 6e4;
var NEW_CLOSED_ROWS = 2;
var OPEN_ROWS = 7;
var SUBJECT_MARKS = {
  working: { mark: "\u25CF", tone: null },
  queued: { mark: "\u25CB", tone: null },
  "waits-on-you": { mark: "\u25C6", tone: "needsYou" },
  "waits-on-other": { mark: "\u25CC", tone: null },
  problem: { mark: "!", tone: "issue" },
  done: { mark: "\u2713", tone: "done" },
  dropped: { mark: "\u2717", tone: null }
};
var RUNNING_FRAMES = ["\u25CF", "\u25C9", "\u25CE", "\u25C9"];
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;
function identityOf(place, role) {
  if (!place) return null;
  const folder = place.folder.split(/[\\/]/).filter(Boolean).pop() ?? place.folder;
  return [folder, place.branch, role === "coordinator" ? "coordinator" : null].filter(Boolean).join(" \xB7 ");
}
function liveOf(presence, now) {
  const { isTurnRunning, turnStartedAt, lastReplyAt } = presence;
  if (isTurnRunning) {
    const isPastAMinute = turnStartedAt !== null && now - turnStartedAt >= 6e4;
    return isPastAMinute ? `${WORKING_TEXT} for ${shortAgo(now - turnStartedAt)}` : WORKING_TEXT;
  }
  return lastReplyAt === null ? null : `Idle \xB7 last reply ${ago(now - lastReplyAt)}`;
}
function childRow(c, now, branch) {
  const idle = c.lastActivityAt === null ? null : now - c.lastActivityAt;
  const isQuiet = idle !== null && idle >= QUIET_MS;
  const age = shortAgo(idle ?? now - c.startedAt);
  return {
    kind: "child",
    id: c.id,
    name: c.name,
    age: isQuiet ? `quiet ${age}` : age,
    isQuiet,
    isLoose: branch === null,
    branch,
    maxLines: OVERVIEW_TEXT_LINES
  };
}
function overviewPage(s, now) {
  const o = s.ledger.overview;
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => look === null || x.changedAt > look;
  const newClosed = subjects.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0)).slice(0, NEW_CLOSED_ROWS);
  const open2 = subjects.filter(isOpen);
  const queuedOver = Math.max(0, open2.length - OPEN_ROWS);
  const hiddenQueued = new Set(
    open2.filter((x) => x.status === "queued").sort((x, y) => x.changedAt - y.changedAt).slice(0, queuedOver).map((x) => x.id)
  );
  const shown = [...open2.filter((x) => !hiddenQueued.has(x.id)), ...newClosed].sort((x, y) => y.changedAt - x.changedAt);
  const folded = subjects.filter((x) => x.status === "done" && !newClosed.includes(x));
  const running = (o?.children ?? []).filter((c) => isChildRunning(c, now)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const shownIds = new Set(shown.map((x) => x.id));
  const rows = running.filter((c) => c.subjectId === null || !shownIds.has(c.subjectId)).map((c) => childRow(c, now, null));
  const lookRow = look === null ? null : { kind: "look", id: "look", text: LOOK_TEXT, age: shortAgo(now - look) };
  let isLookDrawn = false;
  for (const [i, x] of shown.entries()) {
    if (lookRow && !isLookDrawn && !isNew(x)) {
      const hasNewAbove = i > 0;
      if (hasNewAbove) rows.push(lookRow);
      isLookDrawn = true;
    }
    const under = running.filter((c) => c.subjectId === x.id);
    const shownUnder = under.slice(0, CHILD_ROWS);
    const isMore = under.length > CHILD_ROWS;
    rows.push({
      kind: "subject",
      id: x.id,
      ...SUBJECT_MARKS[x.status],
      isRunning: x.status === "working" && (s.presence.isTurnRunning || under.length > 0),
      name: x.name,
      text: isNew(x) || isOpen(x) ? x.text || null : null,
      was: isNew(x) ? x.was : null,
      age: shortAgo(now - x.changedAt),
      maxLines: OVERVIEW_TEXT_LINES,
      hasChildren: under.length > 0
    });
    rows.push(...shownUnder.map((c, n) => childRow(c, now, n === shownUnder.length - 1 && !isMore ? "last" : "mid")));
    if (isMore)
      rows.push({
        kind: "more",
        id: `${x.id}-more`,
        text: `+ ${under.length - CHILD_ROWS} more running`,
        branch: "last"
      });
  }
  if (lookRow && !isLookDrawn && shown.length > 0) rows.push(lookRow);
  if (hiddenQueued.size > 0)
    rows.push({
      kind: "fold",
      id: "queued",
      mark: "\u25CB",
      tone: null,
      text: `${hiddenQueued.size} more queued`,
      age: null
    });
  if (folded.length > 0) {
    const newest = Math.max(...folded.map((x) => x.closedAt ?? x.changedAt));
    const isMore = newClosed.some((x) => x.status === "done");
    rows.push({
      kind: "fold",
      id: "done",
      mark: "\u2713",
      tone: "done",
      text: `${folded.length}${isMore ? " more" : ""} done`,
      age: shortAgo(now - newest)
    });
  }
  const goal = o?.goal || null;
  const role = o?.role ?? "session";
  const hasNews = o !== null && o.look === null && subjects.some(isNew);
  return {
    isEmpty: goal === null && rows.length === 0 && !s.presence.isTurnRunning,
    identity: identityOf(s.place ?? null, role),
    goal,
    live: liveOf(s.presence, now),
    rows,
    hasNews,
    empty: {
      title: "Overview",
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."
    }
  };
}
var FOLLOW_UPS = /* @__PURE__ */ new Set([
  "type",
  "explain",
  "compare",
  "discuss",
  "dismiss",
  "discard"
]);
var ACTION_KEYS = {
  done: "d",
  address: "a",
  issue: "i",
  type: "t",
  explain: "e",
  compare: "p",
  discuss: "d",
  dismiss: "x",
  discard: "x"
};
function actionsOf(row, last, state, feedback) {
  const { id, item, steps: steps2 } = row;
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const action = (press, label, kind, flags = {}) => {
    const pressAction = actionId(press);
    return {
      press,
      label: press.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press.action === "done" || press.action === "address" ? "primary" : press.action === "discuss" || press.action === "explain" || press.action === "compare" || press.action === "dismiss" || press.action === "discard" ? "quiet" : "normal",
      ...press.action === "done" ? { icon: "done" } : press.action === "step" && stepIconKind(steps2[press.step]) ? { icon: stepIconKind(steps2[press.step]) } : {},
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {},
      isOut: out === pressAction
    };
  };
  if (state.is === "settled") return state.canUndo ? [action({ action: "undo", id }, "Undo", "view")] : [];
  if (state.is === "held")
    return [
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "discard", id }, ROW_COPY.discard, "view")
    ];
  const stepActions = steps2.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
  if (!item)
    return [
      action({ action: "address", id }, row.finding ? fixLabel(row.finding) : "Fix", "handoff"),
      action({ action: "issue", id }, ISSUE_LABEL, "handoff"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "discuss", id }, "Discuss", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  if (item.kind === "task")
    return [
      ...stepActions,
      action({ action: "done", id }, "Done", "mark"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map(
      (option, n) => action({ action: "answer", id, option }, clipLabel(option, OPTION_LABEL_CHARS), "mark", {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })
    ),
    ...stepActions,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    action({ action: "explain", id }, "Explain", "talk"),
    ...showsCompare(item) ? [action({ action: "compare", id }, "Compare", "talk")] : [],
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}
function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  extraSteps,
  settleWindowMs,
  status,
  now,
  replies,
  discarded
}) {
  const isSettling = (at) => now - at < settleWindowMs;
  const isOpen2 = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const closedAt = (c) => "closedAt" in c ? c.closedAt : c.at;
  const replyAfter = (c) => {
    const last = lastActions[c.id];
    return last?.action === "type" && last.at >= closedAt(c) && last.delivery?.state !== "failed" && isSettling(last.at) ? last : null;
  };
  const isOwnClose = (c) => c.how === "done" || c.how === "dismissed" || c.how === "answered" && lastActions[c.id]?.kind === "mark" && lastActions[c.id]?.at === closedAt(c);
  const isHeld = (c) => {
    const since = replies[c.id];
    return since !== void 0 && since <= closedAt(c) && !isOwnClose(c);
  };
  const isDiscarded = (c) => (discarded[c.id] ?? -Infinity) >= closedAt(c);
  const isPlaced = (c) => replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isSettling(closedAt(c)));
  const placedItems = new Map(
    ledger.closed.filter((d) => d.item && !isOpen2(d.id) && isPlaced(d)).map((d) => [d.id, d])
  );
  const isFixSettled = (id) => {
    const last = lastActions[id];
    return isFixSent(last) && !isSettling(last.at);
  };
  const placedFindings = new Map(
    ledger.closedFindings.filter((f) => !isOpen2(f.id) && !isFixSettled(f.id) && isPlaced(f)).map((f) => [f.id, f])
  );
  const placed = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => {
    const closed2 = placedItems.get(id) ?? placedFindings.get(id);
    if (closed2) {
      const at = closedAt(closed2);
      const last2 = lastActions[id];
      const reply = replyAfter(closed2);
      if (reply)
        return {
          is: "settled",
          label: DONE_LABELS[reply.action]?.(reply.text) ?? reply.text,
          at: reply.at,
          canUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          isLapsed: false
        };
      if (isHeld(closed2)) return { is: "held", label: heldLabel(closed2), at };
      return {
        is: "settled",
        label: outcomeLabel(closed2),
        at,
        canUndo: isUndoable(closed2),
        isLapsed: isLapsed(closed2),
        delivery: "doneNotification" in closed2 && closed2.doneNotification?.error !== void 0 ? { error: closed2.doneNotification.error, canUndo: isUndoable(closed2) } : (closed2.how === "answered" || closed2.how === "done") && last2?.kind === "mark" && last2.at === at ? pendingDeliveryAt(last2, now) : null
      };
    }
    const last = lastActions[id];
    const sent = ledger.findings.find((f) => f.id === id);
    if (sent && isFixSent(last))
      return {
        is: "settled",
        label: fixLabel(sent),
        at: last.at,
        canUndo: true,
        delivery: pendingDeliveryAt(last, now),
        isLapsed: false
      };
    return isHandedOff(last, turns) ? { is: "handedOff" } : { is: "open" };
  };
  const rowOf = (row) => {
    const state = stateOf(row.id);
    const last = lastActions[row.id];
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt);
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt));
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions)
    };
  };
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    return rowOf({
      id: item.id,
      type: item.kind,
      handle: n === void 0 ? "\u2022" : `${n})`,
      title: item.ask,
      at: item.at,
      detail: null,
      fileName: null,
      replyKind: item.kind === "question" ? "answer" : "reply",
      item,
      finding: null,
      steps: stepsOf(item, extraSteps[item.id] ?? [])
    });
  };
  const questionRows = questions.map(itemRow);
  const taskRows = tasks.map(itemRow);
  const counted = [...questionRows, ...taskRows].filter(isWaitingRow);
  const kinds = Object.keys(FINDING_GROUPS);
  const byGroup = (a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind);
  const findingRows = [...placed.findings].filter((f) => !isFixSettled(f.id)).reverse().sort(byGroup).map(
    (finding) => rowOf({
      id: finding.id,
      type: "finding",
      handle: "\u2022",
      title: finding.title,
      at: finding.at,
      detail: finding.detail,
      fileName: finding.path ? baseName(finding.path) : null,
      replyKind: "reply",
      item: null,
      finding,
      steps: []
    })
  );
  const held = new Set([...questionRows, ...taskRows, ...findingRows].filter((r) => r.state.is === "held").map((r) => r.id));
  const closed = [...ledger.closed].filter((d) => !held.has(d.id)).reverse().map((d) => ({
    ...d,
    outcomeLabel: outcomeLabel(d),
    delivery: d.doneNotification?.error !== void 0 ? { error: d.doneNotification.error, canUndo: isUndoable(d) } : (d.how === "answered" || d.how === "done") && lastActions[d.id]?.kind === "mark" && lastActions[d.id]?.at === d.at ? pendingDeliveryAt(lastActions[d.id], now) : null
  }));
  const fixesSent = ledger.findings.filter((f) => isFixSent(lastActions[f.id])).map((f) => {
    const outcome = fixLabel(f);
    return {
      ...f,
      how: "answered",
      outcome,
      outcomeLabel: outcomeLabel({ ...f, outcome }),
      closedAt: lastActions[f.id].at,
      delivery: pendingDeliveryAt(lastActions[f.id], now)
    };
  });
  return {
    needsYou: {
      count: counted.length,
      questions: questionRows,
      tasks: taskRows,
      closed: { questions: closed.filter((d) => d.kind === "question"), tasks: closed.filter((d) => d.kind === "task") }
    },
    findings: {
      count: findingRows.filter(isWaitingRow).length,
      rows: findingRows,
      closed: [
        ...ledger.closedFindings.filter((f) => !held.has(f.id)).map((f) => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null })),
        ...fixesSent
      ].sort((a, b) => b.closedAt - a.closedAt)
    },
    status
  };
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(c.outcome);
}
function heldLabel(c) {
  if (c.how === "answered") return `Answered: ${c.outcome}`;
  return c.how === "claude" ? capitalized(c.outcome) : `Closed: ${c.outcome}`;
}
function perTurnStatus(update) {
  return {
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : "") : null
  };
}

// ../hooks/pr-tab.ts
var MAX_PRS = 12;
function itemPrSteps(item, prState, linked) {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked;
  return prSteps(
    item,
    refs.map((ref) => ({ ref, url: prState.views[ref]?.url ?? null }))
  );
}
function isLeftOut(prState, ref) {
  const view = prState.views[ref];
  return view !== void 0 && !isKeptPr(view);
}
function splitLinked(prState, linked) {
  const shown = linked.filter((ref) => !isLeftOut(prState, ref));
  return { tracked: shown.slice(-MAX_PRS), older: shown.slice(0, Math.max(0, shown.length - MAX_PRS)) };
}
function olderPrsText(prState, linked) {
  const { older } = splitLinked(prState, linked);
  if (older.length === 0) return null;
  const numbers = older.map((ref) => `#${parseRef(ref).number}`).reverse();
  return `${older.length} older ${older.length === 1 ? "PR" : "PRs"} not shown: ${numbers.join(", ")}`;
}
function prThreadId(pr, t) {
  return threadRowId(pr.ref, t.id);
}
function threadRowId(ref, thread) {
  return `${ref} thread ${thread}`;
}
function prMarkId(ref) {
  return `pr:${ref}`;
}
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}
function isTracked(prState, linked, ref) {
  return splitLinked(prState, linked).tracked.includes(ref) || prState.branchRef === ref;
}
function isDismissing(lastActions, ref, now) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" && now - mark.at < SETTLED_MS;
}
function drawnPrs(prState, linked, lastActions, now) {
  return inPrOrder(Object.values(prState.views)).flatMap(
    (pr) => isTracked(prState, linked, pr.ref) ? [{ pr, isSettled: false }] : isDismissing(lastActions, pr.ref, now) ? [{ pr, isSettled: true }] : []
  );
}

// ../hooks/session.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_TURN = { person: null, trigger: null, activity: [], press: null };
function emptySession() {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: {
      turnsStarted: 0,
      turnsApplied: 0,
      ledgerState: "current",
      hasDroppedReply: false,
      isUpdating: false,
      isTurnRunning: false,
      turnStartedAt: null,
      lastReplyAt: null
    },
    place: null,
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    prViews: NO_PRS,
    stop: null,
    hostTasks: [],
    dialogQuestions: []
  };
}
var SESSION_ID = /^[\w-]{1,100}$/;
function sessionFile(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return `${sessionId}.json`;
}
function missingAsNull(err) {
  if (err.code === "ENOENT") return null;
  throw err;
}
var PRESS_TIMEOUT_MS = 6e4;
function withoutStatedStep(presence) {
  const { statedStep: _statedStep, ...rest } = presence ?? {};
  return rest;
}
function upgradeSession(saved) {
  const base = emptySession();
  const views = saved.prViews?.views ?? {};
  return {
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...withoutStatedStep(saved.presence) },
    place: saved.place ?? null,
    pending: (saved.pending ?? []).map((p) => ({ ...p, ex: { ...p.ex, tasks: p.ex.tasks ?? [] } })),
    sent: (saved.sent ?? []).map((x) => ({
      ...x,
      row: x.row ?? null,
      queuedId: x.queuedId ?? null,
      pressedAt: x.pressedAt ?? null,
      deliveryId: x.deliveryId ?? null,
      phase: x.phase ?? "accepted"
    })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
    heldRows: saved.heldRows ?? [],
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      // Views saved before `isYours` and `wasSeenOpen`, and threads saved before their times and `isLinesChanged` existed.
      views: Object.fromEntries(
        Object.entries(views).map(([ref, pr]) => [
          ref,
          {
            ...pr,
            isYours: pr.isYours ?? null,
            wasSeenOpen: pr.wasSeenOpen ?? pr.state === "OPEN",
            threads: pr.threads.map((t) => ({
              ...t,
              isLinesChanged: t.isLinesChanged ?? false,
              at: t.at ?? null,
              reply: t.reply && { ...t.reply, at: t.reply.at ?? null }
            }))
          }
        ])
      ),
      isFetching: false
    },
    stop: saved.stop ?? null,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map((q) => ({ ...q, descriptions: q.descriptions ?? {} }))
  };
}
function parsedReply(ex, reply) {
  return reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join("\n"));
}
function applied(s, parsed, now, promptAt) {
  const next = s.pending[0];
  if (!next) return s;
  const { ex } = next;
  if (!parsed && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: "failed" }
    };
  const ledger = parsed ? applyExchangeUpdate(s.ledger, parsed, ex, now, promptAt) : s.ledger;
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed;
  return linkDialogs({
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: hasDroppedReply ? "failed" : "current",
      hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted)
    }
  });
}
function appliedOverview(s, answer, appliedAfter, now) {
  if (s.presence.turnsApplied < appliedAfter) return s;
  return { ...s, ledger: { ...s.ledger, overview: applyOverview(s.ledger.overview, answer, now) } };
}
function needsCatchUp(s) {
  const { presence } = s;
  const hasUnappliedTurn = s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied;
  return presence.ledgerState !== "current" || hasUnappliedTurn;
}
var pendingKey = (p) => `${p.turnsStarted}:${p.ex.turn}`;
function appliedCatchUp(s, begun, parsed, now) {
  const covered = new Set(begun.pending.map(pendingKey));
  return linkDialogs({
    ...s,
    ledger: parsed ? applyUpdate(s.ledger, parsed, now, s.ledger.turn, now) : s.ledger,
    pending: s.pending.filter((p) => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed ? "current" : "failed",
      hasDroppedReply: parsed ? false : s.presence.hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted)
    }
  });
}
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at <= PRESS_TIMEOUT_MS) return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
function sessionView(s, now, settleWindowMs, canCatchUp, holds = NO_HOLDS, notes = {}) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const update = {
    isUpdating: s.presence.isUpdating,
    isFailed: s.presence.ledgerState === "failed",
    retries: canCatchUp || s.pending.length > 0
  };
  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map((item) => [item.id, itemPrSteps(item, s.prViews, l.prs)])),
    settleWindowMs,
    status: perTurnStatus(update),
    now,
    ...holds
  });
  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now),
    overviewPage: overviewPage(s, now)
  };
}
function prTabOf(s, lastActions, now) {
  const drawn = drawnPrs(s.prViews, s.ledger.prs, lastActions, now);
  const isSent = threadSentIn(lastActions);
  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => !d.isSettled && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger.prs)
  };
}

// src/state.ts
var NOTHING_HEARD = {
  startAt: null,
  promptAt: null,
  prompts: 0,
  promptTurns: [],
  stopAt: null,
  stops: 0,
  promptMissedAt: null
};
function emptyState(sessionId) {
  return {
    version: 1,
    sessionId,
    root: "",
    transcriptPath: null,
    home: homedir2(),
    cliPath: null,
    lastModelFailure: null,
    ...emptySession(),
    tabSeenAt: 0,
    shownTab: "needsYou",
    heard: NOTHING_HEARD,
    coveredTurn: null
  };
}
function statePath(dir, sessionId) {
  return join2(dir, "sessions", sessionFile(sessionId));
}
function upgraded(saved, sessionId) {
  if (saved.version !== void 0 && saved.version !== 1)
    throw new Error(`Unsupported inbox state version: ${saved.version}`);
  const base = emptyState(sessionId);
  const {
    checks: _checks,
    snapshots: _snapshots,
    recordedRuns: _runs,
    top: _top,
    subagents: _subagents,
    ...kept
  } = saved;
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {};
  const heard = saved.heard ? { ...NOTHING_HEARD, ...saved.heard } : {
    ...NOTHING_HEARD,
    startAt: 0,
    promptAt: 0,
    prompts: saved.presence?.turnsStarted ?? 0,
    stops: saved.presence?.turnsStarted ?? 0
  };
  return {
    ...base,
    ...kept,
    ...upgradeSession({
      ...kept,
      turn,
      pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex }))
    }),
    shownTab: isShownTab(saved.shownTab) ? saved.shownTab : base.shownTab,
    heard,
    coveredTurn: saved.coveredTurn !== void 0 ? saved.coveredTurn : coveredBefore(heard, turn.person ?? null)
  };
}
function coveredBefore(heard, person) {
  return heard.promptTurns.at(person === null ? -1 : -2) ?? null;
}
async function readSaved(dir, sessionId) {
  const saved = await readFile(statePath(dir, sessionId), "utf8").catch(missingAsNull);
  return saved === null ? { state: emptyState(sessionId), isSaved: false } : { state: upgraded(JSON.parse(saved), sessionId), isSaved: true };
}
async function readState(dir, sessionId) {
  return (await readSaved(dir, sessionId)).state;
}
var LOCK_WAIT_MS = 1e4;
var LOCK_CHILD = "held";
var sleep = (ms) => new Promise((resolve3) => setTimeout(resolve3, ms));
var LockBusyError = class extends Error {
};
var bootSession = null;
var ownIdentity = null;
function lockOwner(suffix) {
  const match = /^(\d+)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?:-([a-f\d]{32}))?$/.exec(suffix);
  const pid = Number(match?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? { pid, identity: match?.[2] ?? null } : null;
}
function processIdentity(pid) {
  if (pid === process.pid && ownIdentity) return ownIdentity;
  try {
    const options = {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      stdio: "pipe",
      timeout: 1e3
    };
    const boot = bootSession ?? execFileSync("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], options).trim();
    const started = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], options).trim();
    if (!boot || !started) return null;
    bootSession = boot;
    const identity = createHash("sha256").update(boot).update("\0").update(started).digest("hex").slice(0, 32);
    if (pid === process.pid) ownIdentity = identity;
    return identity;
  } catch {
    return null;
  }
}
function isLive(owner, generation, observedLiveAt) {
  try {
    process.kill(owner.pid, 0);
  } catch (err) {
    return err.code !== "ESRCH";
  }
  if (owner.identity === null) return true;
  const checkedAt = observedLiveAt.get(generation);
  if (checkedAt !== void 0 && Date.now() - checkedAt < 250) return true;
  const identity = processIdentity(owner.pid);
  if (identity !== null && identity !== owner.identity) return false;
  observedLiveAt.set(generation, Date.now());
  return true;
}
async function lockTarget(path) {
  return readlink(path).catch((err) => {
    if (err.code === "ENOENT" || err.code === "EINVAL") return null;
    throw err;
  });
}
async function removeOwnedLock(path, target, owner, source) {
  const identity = processIdentity(process.pid);
  const claimed = `${owner}.recover-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ""}`;
  const isDirectory = await lstat(source).then(
    (s) => s.isDirectory(),
    (err) => {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  );
  if (!isDirectory) return false;
  try {
    await rename(source, claimed);
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
  if (await lockTarget(path) === target) await unlink(path);
  await rmdir(claimed);
  return true;
}
async function recoverLock(path, observedLiveAt) {
  const target = await lockTarget(path);
  if (!target || !isAbsolute(target)) return false;
  const owner = basename(target) === LOCK_CHILD ? dirname(target) : target;
  if (target !== owner && target !== join2(owner, LOCK_CHILD)) return false;
  const prefix = `${basename(path)}.owner-`;
  if (!basename(owner).startsWith(prefix)) return false;
  if (await realpath(dirname(owner)).catch(() => null) !== dirname(path)) return false;
  const holder = lockOwner(basename(owner).slice(prefix.length));
  if (!holder || isLive(holder, owner, observedLiveAt)) return false;
  if (await removeOwnedLock(path, target, owner, owner)) return true;
  const recoverPrefix = `${basename(owner)}.recover-`;
  const entries = await readdir(dirname(path));
  for (const entry of entries) {
    if (!entry.startsWith(recoverPrefix)) continue;
    const recovering = lockOwner(entry.slice(recoverPrefix.length));
    if (!recovering || isLive(recovering, entry, observedLiveAt)) continue;
    if (await removeOwnedLock(path, target, owner, join2(dirname(path), entry))) return true;
  }
  return false;
}
async function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
  path = resolve(path);
  await mkdir(dirname(path), { recursive: true });
  path = join2(await realpath(dirname(path)), basename(path));
  const identity = processIdentity(process.pid);
  const owner = `${path}.owner-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ""}`;
  const target = join2(owner, LOCK_CHILD);
  await mkdir(owner);
  const until = Date.now() + waitMs;
  const observedLiveAt = /* @__PURE__ */ new Map();
  try {
    for (; ; ) {
      try {
        await symlink(target, path);
        break;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
        if (await recoverLock(path, observedLiveAt)) continue;
        if (Date.now() > until) throw new LockBusyError(`Timed out waiting for ${path}`);
        await sleep(15);
      }
    }
    return await fn();
  } finally {
    await removeOwnedLock(path, target, owner, owner);
  }
}
async function tryWithLock(path, fn) {
  let acquired = false;
  try {
    return {
      acquired: true,
      value: await withLock(
        path,
        () => {
          acquired = true;
          return fn();
        },
        0
      )
    };
  } catch (err) {
    if (!acquired && err instanceof LockBusyError) return { acquired: false };
    throw err;
  }
}
async function updateState(dir, sessionId, change) {
  const path = statePath(dir, sessionId);
  return withLock(`${path}.lock`, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId);
    const changed = await change(current);
    if (isSaved && changed === current) return current;
    const next = { ...changed, ledger: pruneClosed(changed.ledger, new Set(changed.heldRows)) };
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, path);
    return next;
  });
}

// src/settle.ts
var POLL_MS = 3e3;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Finds section of the Inbox tab",
  recordTool: "mcp__inbox__record",
  closeTool: "mcp__inbox__close",
  intro: "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation."
};

// src/core.ts
var TAB_OPEN_MS = 15e3;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
}
function activityOf(tool, input) {
  return toolActivity(tool, input);
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}
function heardState(h) {
  if (h.startAt === null && h.promptAt === null && h.stopAt === null) return "none";
  const isMissed = h.promptMissedAt !== null && (h.promptAt === null || h.promptMissedAt >= h.promptAt);
  const turns = h.promptTurns.length > 0 ? h.promptTurns.length : h.prompts;
  return h.startAt === null || isMissed || turns >= 2 && h.stops === 0 ? "partial" : "heard";
}
function viewOf(s, now, holds = NO_HOLDS) {
  const canCatchUp = s.transcriptPath !== null;
  return { ...sessionView(s, now, SETTLE_WINDOW_MS, canCatchUp, holds), heard: heardState(s.heard), at: now };
}

// ../hooks/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null])
);
var HERDR_TIMEOUT_MS = 5e3;
function stopLine(stop) {
  switch (stop.kind) {
    case "sign-in":
      return "! Signed out: /login";
    case "billing":
      return "! Billing problem";
    case "usage-limit":
      return stop.resets ? `! Limit: resets ${stop.resets}` : "! Usage limit reached";
    default:
      return "! API error: resume";
  }
}
function dialogText(dialog) {
  return dialog.kind === "permission" ? `Allow ${dialog.text}?` : dialog.text;
}
function statusLine(stop, dialogs, input) {
  if (stop) return stopLine(stop);
  const dialog = dialogs[0];
  if (dialog) return dialogText(dialog);
  const { firstAsk, asks, findings, goal } = input;
  if (firstAsk !== null) return asks > 1 ? `${asks} \xB7 ${firstAsk}` : firstAsk;
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? "" : "s"}`;
  return [goal, findingsText].filter(Boolean).join(" \xB7 ");
}
function herdrTokens(ledger, stop, view, dialogs) {
  const input = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    goal: ledger.overview?.goal || null
  };
  const counts = ROW_TABS.map((t) => {
    const count = view[t.id].count;
    return [COUNT_TOKENS[t.id], stop || count === 0 ? null : String(count)];
  });
  return {
    [STATUS_TOKEN]: statusLine(stop, dialogs, input) || null,
    [STOP_TOKEN]: stop ? stopLine(stop) : null,
    ...Object.fromEntries(counts)
  };
}
function herdrReport(pane, tokens, seq) {
  return [
    "herdr",
    "pane",
    "report-metadata",
    pane,
    "--source",
    "inbox",
    ...Object.entries(tokens).flatMap(
      ([name, value]) => value === null ? ["--clear-token", name] : ["--token", `${name}=${value}`]
    ),
    ...seq === void 0 ? [] : ["--seq", String(seq)]
  ];
}
function herdrReportKey(pane, tokens) {
  return herdrReport(pane, tokens).join("\n");
}
function herdrReporter() {
  let sent = null;
  let sending = Promise.resolve();
  return (send, report) => {
    sending = sending.then(async () => {
      const r = await report();
      if (!r) return;
      const key = herdrReportKey(r.pane, r.tokens);
      if (key === sent) return;
      sent = key;
      await send(herdrReport(r.pane, r.tokens, r.seq));
    }).catch(() => void 0);
    return sending;
  };
}

// src/host.ts
function codexStore(dir, sessionId, now, onWrite = async () => {
}) {
  return {
    now,
    read: () => readState(dir, sessionId),
    update: async (change) => {
      const s = await updateState(dir, sessionId, change);
      await onWrite(s);
      return s;
    },
    exclusive: (fn) => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn)
  };
}
function herdrOnWrite(env, run2, dir, now) {
  const pane = env.HERDR_PANE_ID;
  const report = herdrReporter();
  return async (s) => {
    if (!pane) return;
    const seq = now();
    const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, seq), []);
    const key = herdrReportKey(pane, tokens);
    if (key === s.herdrReport?.key) return;
    await report(
      (args) => run2(args, { cwd: dir, timeoutMs: HERDR_TIMEOUT_MS }),
      async () => ({ pane, tokens, seq })
    );
    await updateState(
      dir,
      s.sessionId,
      (saved) => saved.herdrReport && saved.herdrReport.seq >= seq ? saved : { ...saved, herdrReport: { key, seq } }
    );
  };
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env }) => new Promise((resolve3) => {
  const [file = "", ...rest] = args;
  const child = execFile(
    file,
    rest,
    { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
    (err, stdout, stderr) => {
      const code = err ? typeof err.code === "number" ? err.code : -1 : 0;
      resolve3({ code, stdout: String(stdout), stderr: String(stderr) });
    }
  );
  child.stdin?.end();
});

// src/update.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import {
  access,
  copyFile,
  lstat as lstat2,
  mkdir as mkdir2,
  readFile as readFile2,
  readlink as readlink2,
  rename as rename2,
  rm,
  stat as stat2,
  symlink as symlink2,
  writeFile as writeFile2
} from "node:fs/promises";
import { join as join4 } from "node:path";

// ../hooks/session-host.ts
function orderedKeys() {
  const tails = /* @__PURE__ */ new Map();
  return {
    run: (key, fn) => {
      const result = (tails.get(key) ?? Promise.resolve()).then(fn);
      const tail = result.catch(() => void 0);
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    }
  };
}
async function askOverConversation(ask, names, s, screen, conversation) {
  if (!conversation) return { kind: "unreadable" };
  const text2 = await ask(transcriptCatchUpPrompt(s.ledger, screen, conversation), systemText(names)).catch(() => null);
  return text2 === null ? { kind: "failed" } : {
    kind: "reply",
    text: text2,
    source: conversation,
    overview: (last, tasks, now) => ask(overviewCatchUpPrompt(last, conversation, tasks, now), OVERVIEW_SYSTEM)
  };
}
async function runUpdates(host) {
  let canCatchUp = host.catchUp !== void 0;
  const wantsCatchUp = (s) => canCatchUp && needsCatchUp(s);
  const hasWork = (s) => s.pending.length > 0 || wantsCatchUp(s);
  const writing = [];
  const writeOverview = async (after, ask, tasks) => host.inOrder(async () => {
    const { ledger } = await host.read();
    const at = await host.now();
    const asked = () => ask(ledger.overview, tasks, at).catch(() => null);
    const first = await asked();
    if (first === null) return;
    const answer = parseOverview(first) ?? parseOverview(await asked());
    if (answer === null) return;
    const now = await host.now();
    await host.update((x) => appliedOverview(x, answer, after.presence.turnsApplied, now));
  });
  const followUp = (run2) => {
    const settled = run2.catch(() => void 0);
    if (host.background) host.background(settled);
    else writing.push(settled);
  };
  try {
    while (hasWork(await host.read())) {
      const held = await host.exclusive(async () => {
        try {
          for (; ; ) {
            const s = await host.update((x) => ({ ...x, presence: { ...x.presence, isUpdating: hasWork(x) } }));
            if (!hasWork(s)) break;
            if (wantsCatchUp(s)) {
              const reply2 = await host.catchUp(s).catch(() => ({ kind: "failed" }));
              if (reply2.kind === "unreadable") {
                canCatchUp = false;
                continue;
              }
              const parsed2 = reply2.kind === "reply" ? parseReply(reply2.text, reply2.source) : null;
              const at = await host.now();
              const after2 = await host.update((x) => appliedCatchUp(x, s, parsed2, at));
              if (!parsed2) return "stop";
              if (reply2.kind === "reply") followUp(writeOverview(after2, reply2.overview, s.hostTasks));
              continue;
            }
            const next = s.pending[0];
            const promptAt = await host.now();
            const reply = await host.ask(buildPrompt(s.ledger, next.ex), systemText(host.names)).catch(() => null);
            const parsed = parsedReply(next.ex, reply);
            let isApplied = false;
            const after = await host.update(async (x) => {
              isApplied = false;
              if (x.pending[0]?.turnsStarted !== next.turnsStarted || x.pending[0].ex.turn !== next.ex.turn) return x;
              isApplied = parsed !== null;
              return applied(x, parsed, await host.now(), promptAt);
            });
            if (isApplied)
              followUp(
                writeOverview(
                  after,
                  (last, tasks, now) => host.ask(overviewPrompt(last, next.ex, tasks, now), OVERVIEW_SYSTEM),
                  next.ex.tasks
                )
              );
            if (after.pending[0]?.failed && !next.failed) return "stop";
          }
        } finally {
          await host.update((x) => ({ ...x, presence: { ...x.presence, isUpdating: false } }));
        }
      });
      if (!held.acquired || held.value === "stop") return;
    }
  } finally {
    await Promise.all(writing);
  }
}

// src/transcript.ts
import { open, readdir as readdir2 } from "node:fs/promises";
import { dirname as dirname2, join as join3, resolve as resolve2 } from "node:path";

// ../hooks/conversation.ts
var NL6 = "\n";
var TRANSCRIPT_MAX = 8e4;
var MESSAGE_MAX = 6e3;
function flattenConversation(turns) {
  const lines = [];
  for (const turn of turns) {
    const text2 = turn.text.trim();
    const shown = turn.isVerbatim ? text2 : clip(text2, MESSAGE_MAX);
    if (turn.role === "person") {
      if (text2 && !text2.startsWith("inbox:")) lines.push(`Person: ${shown}`);
      continue;
    }
    if (text2) lines.push(`Agent: ${shown}`);
    for (const line of turn.activity) lines.push(`Agent ${line}`);
  }
  const kept = [];
  let size = 0;
  for (const line of lines.reverse()) {
    size += line.length + 1;
    if (size > TRANSCRIPT_MAX) {
      kept.push("(earlier conversation left out)");
      break;
    }
    kept.push(line);
  }
  return kept.reverse().join(NL6);
}

// src/transcript.ts
async function readSessionMeta(path) {
  try {
    const file = await open(path, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(buf, 0, buf.length, 0);
      const first = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0] ?? "";
      const meta = JSON.parse(first);
      return meta.type === "session_meta" ? meta : null;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
async function namesIn(dir, pattern) {
  const names = await readdir2(dir).catch(() => []);
  return names.filter((n) => pattern.test(n)).sort().reverse();
}
async function newestRollout(sessions, isWanted) {
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join3(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join3(sessions, year, month), /^\d{2}$/)) {
        const folder = join3(sessions, year, month, day);
        const [name] = (await namesIn(folder, /^rollout-.+\.jsonl$/)).filter(isWanted);
        if (name !== void 0) return join3(folder, name);
      }
  return null;
}
async function historyBase(path) {
  const base = (await readSessionMeta(path))?.payload?.history_base;
  const id = base?.thread_id;
  const end = base?.end_byte_offset;
  if (typeof id !== "string" || id === "" || typeof end !== "number" || end <= 0) return null;
  const sessions = dirname2(dirname2(dirname2(dirname2(path))));
  const basePath = await newestRollout(sessions, (name) => name.endsWith(`-${id}.jsonl`) || name.endsWith(`_${id}.jsonl`));
  return basePath === null ? null : { path: basePath, end };
}
var DIALOG_TOOL = "request_user_input_async";
var TAIL_BYTES = 4 * 1024 * 1024;
var SHELL_CALLS = /* @__PURE__ */ new Set(["shell", "shell_command", "exec_command", "container.exec"]);
var isText = (v) => typeof v === "string";
function commandText2(command) {
  if (isText(command)) return command;
  if (!Array.isArray(command)) return "";
  const argv = command.filter(isText);
  const [, flag, script] = argv;
  return argv.length === 3 && flag?.startsWith("-") && flag.endsWith("c") && script !== void 0 ? script : argv.join(" ");
}
function callCommand(p) {
  if (p.type === "local_shell_call") return commandText2(p.action?.command);
  if (p.type !== "function_call" || !p.name || !SHELL_CALLS.has(p.name) || !isText(p.arguments)) return "";
  try {
    const args = JSON.parse(p.arguments);
    return commandText2(args.command ?? args.cmd);
  } catch {
    return "";
  }
}
async function linesBefore(path, bytes, end = Infinity) {
  const file = await open(path, "r");
  try {
    const stop = Math.min(end, (await file.stat()).size);
    const start = Math.max(0, stop - bytes);
    const buf = Buffer.alloc(stop - start);
    const { bytesRead } = await file.read(buf, 0, buf.length, start);
    const lines = buf.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return { lines, start, read: bytesRead };
  } finally {
    await file.close();
  }
}
var TURN_ROW_BYTES = 64 * 1024;
async function historyLines(path, bytes) {
  const first = await linesBefore(path, bytes);
  const parts = [first.lines];
  const seen = /* @__PURE__ */ new Set([path]);
  let budget = bytes - first.read;
  let isWhole = first.start === 0;
  let current = path;
  while (isWhole && budget > 0) {
    const base = await historyBase(current).catch(() => null);
    if (base === null || seen.has(base.path)) break;
    seen.add(base.path);
    const part = await linesBefore(base.path, budget, base.end).catch(() => null);
    if (part === null) break;
    parts.unshift(part.lines);
    budget -= part.read;
    isWhole = part.start === 0;
    current = base.path;
  }
  return parts.flat();
}
var ROLLOUT_BYTES = 8 * 1024 * 1024;
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var textOf = (v) => isText(v) ? v : "";
var contentText = (content) => (Array.isArray(content) ? content : []).map((part) => textOf(record(part).text)).filter(Boolean).join("\n").trim();
var jsonRecord = (raw) => {
  try {
    return record(JSON.parse(textOf(raw)));
  } catch {
    return {};
  }
};
var literalValue = (literal) => {
  if (literal === void 0) return null;
  try {
    return textOf(JSON.parse(literal));
  } catch {
    return null;
  }
};
var PATCH_ARGUMENT = /tools\.apply_patch\(\s*("(?:[^"\\]|\\.)*")/;
var COMMAND_ARGUMENT = /\bcmd:\s*("(?:[^"\\]|\\.)*")/;
var shellLines = (command) => {
  const line = command === "" ? null : activityOf("Bash", { command });
  return line ? [line] : [];
};
var editLines = (patch, cwd) => patchFiles(patch).map((file) => `edited ${resolve2(cwd || "/", file)}`);
function callLines(p, hasCommandRows, cwd) {
  const name = textOf(p.name);
  if (p.type === "local_shell_call") return hasCommandRows ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = literalValue(COMMAND_ARGUMENT.exec(input)?.[1]);
    return [...patch ? editLines(patch, cwd) : [], ...command && !hasCommandRows ? shellLines(command) : []];
  }
  if (p.type !== "function_call") return [];
  if (SHELL_CALLS.has(name)) return hasCommandRows ? [] : shellLines(callCommand(p));
  const args = jsonRecord(p.arguments);
  if (name === "apply_patch") return editLines(textOf(args.input ?? args.patch ?? args.command), cwd);
  if (name === "spawn_agent") {
    const line2 = activityOf("Agent", { description: textOf(args.task_name) });
    return line2 ? [line2] : [];
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: "open" })];
  const line = activityOf(textOf(p.namespace).startsWith("mcp__") ? textOf(p.namespace) + name : name, {});
  return line ? [line] : [];
}
var isItem = (row, ...kinds) => row.type === "event_msg" && record(row.payload).type === "item_completed" && kinds.includes(textOf(record(record(row.payload).item).type));
function turnsOf(rows, cwd) {
  const hasMessageRows = rows.some((row) => isItem(row, "UserMessage", "AgentMessage"));
  const hasCommandRows = rows.some((row) => isItem(row, "CommandExecution"));
  const turns = [];
  const agentTurn = () => {
    const last = turns.at(-1);
    if (last?.role === "agent") return last;
    const turn = { role: "agent", text: "", activity: [] };
    turns.push(turn);
    return turn;
  };
  const person = (text2) => {
    if (text2 && !text2.startsWith("<")) turns.push({ role: "person", text: text2, activity: [] });
  };
  const act = (lines) => {
    if (lines.length === 0) return;
    const turn = agentTurn();
    turn.activity = lines.reduce((all, line) => addActivity(all, line), turn.activity);
  };
  for (const row of rows) {
    const p = record(row.payload);
    const item = record(p.item);
    if (isItem(row, "UserMessage")) person(contentText(item.content));
    else if (isItem(row, "AgentMessage")) turns.push({ role: "agent", text: contentText(item.content), activity: [] });
    else if (isItem(row, "CommandExecution")) act(shellLines(commandText2(item.command)));
    else if (row.type === "response_item") {
      if (p.type === "message" && !hasMessageRows && p.role === "user") person(contentText(p.content));
      else if (p.type === "message" && !hasMessageRows && p.role === "assistant")
        turns.push({ role: "agent", text: contentText(p.content), activity: [] });
      else act(callLines(p, hasCommandRows, cwd));
    }
  }
  return turns;
}
function rolloutTurns(lines, cwd) {
  const groups = [];
  for (const line of lines) {
    let row;
    try {
      row = record(JSON.parse(line));
    } catch {
      continue;
    }
    const p = record(row.payload);
    if (row.type === "event_msg" && p.type === "task_started") {
      groups.push({ id: textOf(p.turn_id) || textOf(record(p.turn_attribution).turn_id), isComplete: false, rows: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ id: "", isComplete: false, rows: [] });
    const group = groups.at(-1);
    if (row.type === "event_msg" && p.type === "task_complete") group.isComplete = true;
    else group.rows.push(row);
  }
  return groups.map((g) => ({ id: g.id, isComplete: g.isComplete, turns: turnsOf(g.rows, cwd) }));
}
async function readRollout(path, cwd, currentTurnId) {
  if (path === null) return null;
  try {
    const turns = rolloutTurns(await historyLines(path, ROLLOUT_BYTES), cwd);
    const earlier = turns.filter(
      (t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person"))
    );
    return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
  } catch {
    return null;
  }
}

// src/update.ts
var MODEL = "gpt-6.1-sol";
var TIMEOUT_MS = 12e4;
var RESULTS_WAIT_MS = 4 * TIMEOUT_MS;
var resultsOrder = orderedKeys();
var OFF = [
  "shell_tool",
  "unified_exec",
  "code_mode_host",
  "apps",
  "plugins",
  "memories",
  "multi_agent",
  "image_generation",
  "browser_use",
  "computer_use",
  "tool_suggest",
  "skill_search",
  "view_image",
  "goals",
  "sleep_tool",
  "personality"
];
async function modelHome(dir, personHome) {
  const auth = join4(personHome, "auth.json");
  const hasSignInFile = await access(auth).then(
    () => true,
    () => false
  );
  if (!hasSignInFile) return null;
  const home = join4(dir, "model-home");
  const link = join4(home, "auth.json");
  try {
    await mkdir2(home, { recursive: true });
    const isLinked = await readlink2(link).catch(() => null) === auth;
    if (isLinked) return home;
    await keepNewerSignIn(link, auth);
    const made = `${link}.${randomUUID2()}`;
    await symlink2(auth, made);
    await rename2(made, link);
    return home;
  } catch {
    return null;
  }
}
async function keepNewerSignIn(link, auth) {
  const saved = await lstat2(link).catch(() => null);
  if (!saved?.isFile()) return;
  const theirs = await stat2(auth);
  if (saved.mtimeMs > theirs.mtimeMs) await copyFile(link, auth);
}
var FAILURE_TAIL_CHARS = 2e3;
function codexAsk(exec, cli, dir, personHome, onFailure = async () => {
}) {
  return async (prompt, instructions) => {
    const work = join4(dir, "exec");
    const system = join4(dir, `inbox-system-${createHash2("sha256").update(instructions).digest("hex").slice(0, 12)}.md`);
    const out = join4(work, `reply-${randomUUID2()}.txt`);
    await mkdir2(work, { recursive: true });
    const home = await modelHome(dir, personHome);
    if (await readFile2(system, "utf8").catch(() => "") !== instructions) await writeFile2(system, instructions);
    let off = [...OFF];
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm(out, { force: true });
      const r = await exec(
        [
          cli,
          "exec",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "-s",
          "read-only",
          "-C",
          work,
          "-m",
          MODEL,
          "-c",
          'model_reasoning_effort="low"',
          "-c",
          `model_instructions_file=${JSON.stringify(system)}`,
          "-c",
          "project_doc_max_bytes=0",
          ...home ? ["-c", 'cli_auth_credentials_store="file"'] : [],
          ...off.flatMap((f) => ["--disable", f]),
          "-o",
          out,
          prompt
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS, env: home ? { CODEX_HOME: home } : {} }
      );
      const unknown = r.stderr.match(/Unknown feature flag: (\S+)/)?.[1];
      if (r.code !== 0 && unknown && off.includes(unknown)) {
        off = off.filter((f) => f !== unknown);
        continue;
      }
      const text2 = r.code === 0 ? await readFile2(out, "utf8").catch(() => null) : null;
      await rm(out, { force: true });
      if (text2 === null) await onFailure({ cli, code: r.code, stderr: r.stderr.slice(-FAILURE_TAIL_CHARS) });
      return text2;
    }
    return null;
  };
}
var recordModelFailure = (dir, sessionId, now) => async (failure) => {
  await updateState(dir, sessionId, (s) => ({ ...s, lastModelFailure: { ...failure, at: now() } }));
};
var runUpdates2 = (dir, sessionId, ask, now, onWrite) => runUpdates({
  ...codexStore(dir, sessionId, now, onWrite),
  ask,
  names: CODEX,
  inOrder: (fn) => resultsOrder.run(
    statePath(dir, sessionId),
    () => withLock(`${statePath(dir, sessionId)}.results`, fn, RESULTS_WAIT_MS)
  ),
  catchUp: async (s) => askOverConversation(
    ask,
    CODEX,
    s,
    screenText(CODEX, isTabOpen(s, now()), screenTabOf(s.shownTab)),
    (await readRollout(s.transcriptPath, s.root))?.conversation ?? null
  )
});

// src/update-main.ts
async function main() {
  const sessionId = process.argv[2] ?? "";
  const dir = dataDir(process.env, dirname3(dirname3(fileURLToPath(import.meta.url))));
  const { cliPath } = await readState(dir, sessionId);
  const cli = cliPath ?? await findCli(process.env, run, process.ppid);
  const personHome = process.env.CODEX_HOME || join5(homedir3(), ".codex");
  const ask = codexAsk(run, cli, dir, personHome, recordModelFailure(dir, sessionId, Date.now));
  await runUpdates2(dir, sessionId, ask, Date.now, herdrOnWrite(process.env, run, dir, Date.now));
}
main().catch(() => process.exit(0));
