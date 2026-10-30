// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/update-main.ts
import { existsSync } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname4, join as join5 } from "node:path";
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

// ../hooks/status.ts
var NAME_WORDS = 3;
var TEXT_WORDS = 4;
var DESCRIPTION_WORDS = 8;
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var ASK_READ_WORDS = 30;
var FINISHED_READ = 10;
var CHILD_KEPT_MS = 24 * 60 * 6e4;
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
var EMPTY_SESSION_STATUS = {
  head: null,
  subjects: [],
  children: [],
  askSubjects: {},
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  look: null
};
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
var CHILD_KINDS = ["subagent", "background", "workflow", "delegate"];
var DELEGATE_STATES = ["working", "blocked", "finished"];
var LINE = /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK)\s*(?::\s*(.*))?$/i;
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
  if (key === "HEAD") return f[0] ? { kind: "head", title: f[0], description: f[1] ?? "" } : null;
  if (key === "LINK") return f[0] && f[1] ? { kind: "link", ref: f[0], subject: f[1] } : null;
  return null;
}
function parseStatus(text2) {
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
async function askStatus(ask) {
  const first = await ask();
  const holdsProse = first.text !== null && parseStatus(first.text) === null;
  return { first, last: holdsProse ? await ask() : first };
}
function words(text2) {
  return new Set((text2.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w)));
}
function hasSameWords(a, b) {
  const x = words(a);
  const y = words(b);
  return x.size === y.size && [...x].every((w) => y.has(w));
}
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}
function isUnderWay(s) {
  return s.status === "working" || s.status === "waits-on-other";
}
function answerWork(before, o, now) {
  const was = new Map(before.map((s) => [s.id, s]));
  const closed = o.subjects.filter((s) => {
    const earlier = was.get(s.id);
    return !isOpen(s) && s.closedAt === now && (earlier === void 0 || isOpen(earlier));
  });
  const isClosedWorkNew = closed.some((s) => !was.has(s.id));
  const isUnderWayWorkClosed = closed.some((s) => {
    const earlier = was.get(s.id);
    return earlier !== void 0 && isUnderWay(earlier);
  });
  return {
    isEarlierWorkFinished: isUnderWayWorkClosed && !isClosedWorkNew,
    isWorkUnderWay: o.subjects.some(
      (s) => s.status === "working" || s.status === "waits-on-other" && s.changedAt === now
    ),
    namesClosed: (description) => {
      const said = words(description);
      return closed.some((s) => {
        const name = [...words(s.name)];
        return name.length > 0 && name.every((w) => said.has(w));
      });
    }
  };
}
function isDescriptionStale(head, work) {
  return head !== null && head.description !== "" && work.isWorkUnderWay && work.namesClosed(head.description);
}
function headAfter(last, op, work) {
  const isComplete = last !== null && last.description !== "";
  const isSameTitle = last !== null && hasSameWords(last.title, op.title);
  const isStale = isDescriptionStale(last, work);
  const isHeld = isComplete && (isSameTitle && !isStale || work.isEarlierWorkFinished && !work.isWorkUnderWay);
  return isHeld ? last : { title: clipWords(op.title, NAME_KEPT), description: clipWords(op.description, DESCRIPTION_KEPT) };
}
var OP_ORDER = {
  none: 0,
  head: 1,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  was: 1,
  link: 2
};
function applyOps(last, ops, now, askIds) {
  let o = {
    ...last ?? EMPTY_SESSION_STATUS,
    subjects: (last?.subjects ?? []).map((s) => ({ ...s })),
    children: (last?.children ?? []).map((c) => ({ ...c })),
    askSubjects: Object.fromEntries(Object.entries(last?.askSubjects ?? {}).filter(([ask]) => askIds.has(ask)))
  };
  const find = (ref) => {
    const key = nameKey(clipWords(ref, NAME_KEPT));
    return o.subjects.find((s) => s.id === ref) ?? o.subjects.find((s) => isOpen(s) && nameKey(s.name) === key) ?? null;
  };
  const forgetSeenWas = (s) => {
    const isSeen = o.lastLookAt !== null && s.changedAt <= o.lastLookAt;
    if (isSeen) {
      s.was = null;
      s.merged = null;
    }
  };
  const set = (s, status, text2) => {
    const isReworded = s.status === status && hasSameWords(s.text, text2);
    if (isReworded) return;
    s.status = status;
    s.text = clipWords(text2, TEXT_KEPT);
    forgetSeenWas(s);
    s.changedAt = now;
  };
  const ordered = ops.map((op, n) => ({ op, n })).sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n);
  for (const { op } of ordered) {
    if (op.kind === "none") continue;
    if (op.kind === "head") o.head = headAfter(o.head, op, answerWork(last?.subjects ?? [], o, now));
    else if (op.kind === "link") {
      const child = o.children.find((c) => c.id === op.ref);
      const subject = find(op.subject);
      if (child && subject) child.subjectId = subject.id;
      else if (subject && askIds.has(op.ref)) o.askSubjects[op.ref] = subject.id;
    } else if (op.kind === "new") {
      const known = find(op.name);
      if (known && isOpen(known)) {
        set(known, op.status, op.text);
        continue;
      }
      const s = {
        id: `s${o.nextId}`,
        name: clipWords(op.name, NAME_KEPT),
        status: op.status,
        text: clipWords(op.text, TEXT_KEPT),
        was: null,
        merged: null,
        createdAt: now,
        changedAt: now,
        closedAt: null,
        into: null
      };
      o = { ...o, nextId: o.nextId + 1, subjects: [...o.subjects, s] };
    } else {
      const s = find(op.ref);
      if (!s) continue;
      if (op.kind === "set") set(s, op.status, op.text);
      else if (op.kind === "done") {
        s.status = "done";
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT);
        forgetSeenWas(s);
        s.closedAt = now;
        s.changedAt = now;
      } else if (op.kind === "drop") {
        const target = op.into ? find(op.into) : null;
        s.status = "dropped";
        s.text = clipWords(op.why, TEXT_KEPT);
        s.closedAt = now;
        s.into = target && target.id !== s.id ? target.id : null;
        s.changedAt = now;
        if (target && s.into) {
          forgetSeenWas(target);
          target.merged = target.merged ? `${target.merged}, ${s.name}` : s.name;
          target.changedAt = now;
          for (const [ask, id] of Object.entries(o.askSubjects)) if (id === s.id) o.askSubjects[ask] = target.id;
        }
      } else {
        forgetSeenWas(s);
        s.was = op.text;
        s.changedAt = now;
      }
    }
  }
  const isHeadKept = o.head === (last?.head ?? null);
  if (isHeadKept && o.head && isDescriptionStale(o.head, answerWork(last?.subjects ?? [], o, now)))
    o = { ...o, head: { ...o.head, description: "" } };
  return o;
}
function applyStatus(last, answer, now, askIds) {
  return answer.kind === "unchanged" ? last : applyOps(last, answer.ops, now, askIds);
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
function asksText(o, asks) {
  return asks.map((a) => `${a.id} | ${clipWords(a.ask, ASK_READ_WORDS)} | ${o?.askSubjects[a.id] ?? "-"}`).join(NL);
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
var DROPPED_STATUSES = { "waits-on-you": "queued", problem: "queued" };
var OLD_MERGE = /^(.+?) folded in(?:; was: (.*))?$/s;
function wasAndMerged(was, merged) {
  const old = typeof was === "string" && typeof merged !== "string" ? OLD_MERGE.exec(was) : null;
  if (old) return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time(s?.changedAt);
  if (!s || typeof s.id !== "string" || typeof s.name !== "string" || !status || changedAt === null) return null;
  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    ...wasAndMerged(s.was, s.merged),
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
    lastActivityAt: time(c.lastActivityAt),
    delegateState: DELEGATE_STATES.find((state) => state === c.delegateState) ?? null
  };
}
var OLD_STATUS = {
  working: "working",
  queued: "queued",
  "waits-on-you": "queued",
  "waits-on-other": "waits-on-other",
  problem: "queued",
  unknown: "queued",
  done: null,
  "ruled-out": null
};
function headOfGoal(goal) {
  const title = clipWords(text(goal), DESCRIPTION_KEPT);
  return title === "" ? null : { title, description: "" };
}
function headOf(saved) {
  const h = saved;
  const title = text(h?.title);
  return title === "" ? null : { title, description: text(h?.description) };
}
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
    merged: null,
    createdAt: lastLookAt,
    changedAt: lastLookAt,
    closedAt: null,
    into: null
  }));
  return {
    ...EMPTY_SESSION_STATUS,
    head: headOfGoal(o.headline),
    subjects,
    nextId: subjects.length + 1,
    lastLookAt
  };
}
function upgradeStatus(saved) {
  const o = saved;
  if (typeof o !== "object" || o === null) return null;
  if (typeof o.headline === "string") return fromLists(o);
  if (!Array.isArray(o.subjects)) return null;
  const subjects = o.subjects.map(subjectOf).filter((s) => s !== null);
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c) => c !== null) : [];
  const savedLinks = typeof o.askSubjects === "object" && o.askSubjects !== null ? Object.entries(o.askSubjects) : [];
  const askSubjects = Object.fromEntries(savedLinks.filter((e) => typeof e[1] === "string"));
  const look = o.look;
  const lookAt = time(look?.startedAt);
  return {
    head: "head" in o ? headOf(o.head) : headOfGoal(o.goal),
    subjects,
    children,
    askSubjects,
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
  prOrder: null,
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
    prOrder: rest.prOrder ? { ...rest.prOrder, why: rest.prOrder.why ?? null, statuses: rest.prOrder.statuses ?? null } : null,
    updates,
    overview: upgradeStatus(rest.overview),
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
function restatedRec(options, old, stated) {
  return recommendedOption(options, stated) ?? recommendedOption(options, old);
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
var GENERIC = /* @__PURE__ */ new Set([
  "which",
  "what",
  "how",
  "when",
  "where",
  "whether",
  "why",
  "who",
  "pick",
  "choose",
  "select",
  "prefer",
  "want",
  "decide",
  "need",
  "like",
  "are",
  "was",
  "were",
  "been",
  "being",
  "can",
  "could",
  "would",
  "will",
  "shall",
  "might",
  "must",
  "does",
  "did",
  "has",
  "have",
  "had",
  "new",
  "current",
  "existing",
  "its",
  "our",
  "their",
  "now",
  "still",
  "also",
  "just",
  "again",
  "already",
  "instead",
  "yet"
]);
function repeatsSubject(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const within = (inner, outer) => [...inner].every((w) => GENERIC.has(w) || outer.has(w));
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
  const pruned2 = (records) => records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id));
  return { ...ledger, closed: pruned2(ledger.closed), closedFindings: pruned2(ledger.closedFindings) };
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
        rec: restatedRec(restated.options, restated.rec, a.rec),
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
  return { ...item, options, rec: restatedRec(options, item.rec, change.rec) };
}
function closedState(d) {
  if (d.how === "dismissed") return "dismissed";
  if (d.how === "expired") return "lapsed";
  const isOvertaken = OVERTAKEN.test(d.outcome);
  return (d.how === "claude" || d.how === "update") && isOvertaken ? "lapsed" : "handled";
}
function closedAt(c) {
  return "closedAt" in c ? c.closedAt : c.at;
}
function isLapsed(d) {
  return closedState(d) !== "handled";
}

// ../hooks/session-version.ts
var SESSION_VERSION = 1;
function checkVersion(saved) {
  const version = saved.version ?? 1;
  if (version !== SESSION_VERSION) throw new Error(`Unsupported inbox state version: ${version}`);
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
function rankOf(pr, ranked) {
  const at = ranked.indexOf(pr.ref);
  return at === -1 || pr.state !== "OPEN" ? null : at;
}
function inPrOrder(prs, ranked = []) {
  const place = (pr) => rankOf(pr, ranked) ?? Infinity;
  const status = new Map(prs.map((pr) => [pr, STATUS_ORDER[readiness(pr).status]]));
  const byPlace = (a, b) => {
    const [x, y] = [place(a), place(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  };
  return [...prs].sort(
    (a, b) => byPlace(a, b) || status.get(a) - status.get(b) || b.number - a.number || a.ref.localeCompare(b.ref)
  );
}
function failingChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "fail");
}

// ../hooks/gh.ts
var GH_TIMEOUT_MS = 2e4;
var UNSTARTABLE_CODE = -1;
var TIMED_OUT_CODE = -2;

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
function offersUndo(c) {
  return c.how === "done" || c.how === "dismissed";
}
function isUndoable(c) {
  return offersUndo(c) && !c.isSentToAgent;
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
var STATUS_SYSTEM = `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <head>: the top of the page, as title | description: what the session is focused on now. Never write it into a subject.
- <subjects>: the open subjects, one per line: id | status | name | where it stands
- <finished>: subjects already done or dropped. Do not add them again.
- <running>: work running apart from the turn, such as a subagent, a background task, a workflow or a delegate session, one per line: id | kind | name | the subject it belongs to, or - when it has none yet
- <asks>: the open questions and tasks the inbox shows the person, one per line: id | the ask | the subject it holds up, or - when it has none yet
- <tasks>: the agent's own task list, when it keeps one. It is evidence, not the list: write each subject at the level of the feature. A pending task for another part of the product, one the person would name on its own, is a queued subject.
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: the agent's final reply

Answer with lines only. No other text, and no corrections: every line you write is applied. When the exchange changed nothing about where any subject stands, and the head still holds, answer with the one line NO CHANGE. Most exchanges change nothing.

Otherwise write only the lines that apply:
NEW: status | name | where it stands
SET: id or name | status | where it stands
DONE: id or name | where it ended
DROP: id or name | why
DROP: id or name | why | INTO id or name
WAS: id or name | the plan it replaces
LINK: running or ask id | subject id or name
HEAD: title | description

A subject is one piece of the work that the person would name: a feature, a fix, a release, or a stream of work handed to another session. Keep at most ${OPEN_SUBJECTS} open. A fix, an option, a review or a question inside a larger piece of work belongs to that subject: change its text instead, as in "critique fixes: 4 of 9 done". A subject is never a command, a file, a commit, a test run or a tool call. A question to the person is never a subject of its own, and neither is a problem the agent noticed outside the work: the inbox shows those.

The name is a label of at most ${NAME_WORDS} words, the handle the person would use for the work, such as "Offline sync", "Sign-out bug" or "1.4.2 release". It names the work, never what to do about it or what was found: not a sentence, a question, a task or a finding. Write "Login provider", not "Choose which login provider ships first", and "Sign-out token bug", not "A cached token survives sign-out on the web app". The details go in where it stands. Where it stands is at most ${TEXT_WORDS} words: its state now, not what the agent did. Say what works or is fixed, not the step that got it there: never committed, pushed, rebuilt, restarted or tests passing. Never write a time, a date, or a word such as today, yesterday, ago or now. Code shows how long ago each subject changed.

The head says what the session is focused on now: the work the person would name if asked what this session is doing. It may cover several subjects. Its title is a label of at most ${NAME_WORDS} words, like a subject's name, such as "Offline sync" or "2.5 release". Its description is at most ${DESCRIPTION_WORDS} words on what the session is doing about that focus, such as "Adding offline sync to the notes app" or "Fixing the sync bug, then shipping 2.5". The description never repeats the title, and never says where one piece stands, such as "PR ready for review". The head follows the same rules on time words as where it stands.

Status is one of: working, queued, waits-on-other.
- working: being worked on now, in this session or in a session it handed the work to, or stopped until the person answers an ask. When the work stopped for another reason, it is queued, waits on something, or is done.
- queued: planned, not started.
- waits-on-other: it waits on something other than the person, such as a build, a review or another session.

Rules:
- Change a subject by its id. Write NEW only when no subject in <subjects> covers it.
- When work started and finished in this exchange, write NEW for it, then DONE with its name.
- Write SET only when where a subject stands changed. Never reword a subject that did not change.
- Write DONE when a subject is finished, and DROP when it is abandoned or no longer true, with the reason.
- When the person files a piece for later, out of this session's plan, as into an issue or a backlog, write DONE with "filed for later". A piece the person sets aside to come back to in this session stays queued.
- When the plan for a subject reverses, or another subject takes its work, write WAS with the plan it replaces. Use DROP with INTO when the work moved into another subject.
- Write LINK for each item in <asks> that has no subject yet, naming the subject whose work waits on it. An ask that holds up no subject gets no LINK. Never write an open ask or its options into a subject: code marks the subject while the ask is open, and the inbox shows the ask.
- Write LINK for each item in <running> that has no subject yet, naming the subject whose work it does. Never write NEW for a running item, or its progress in its subject's text: code shows it under its subject while it runs and removes it when it ends. When its result comes back in the exchange, change its subject with SET or DONE if the result changed where the subject stands.
- Check the head on every exchange against <subjects> and <finished>, not only against this exchange: work often moves on over many small exchanges with no one saying so. Write HEAD when <head> is empty or has no description, when the person asks for work that is not part of what the head names, or when a subject is working that is not part of what the head names, as when the work the head names finished and the session started on other work.
- The head names the whole focus, which often spans several subjects. One of them finishing, the next one starting, or the person asking for the next one does not change the focus, so never retitle the head to the piece being worked on. Keep the head while a working subject is part of what it names. When the work it names finished and no subject is working, keep it: queued work is not the focus until it starts. Never reword a head that still holds, and never add progress, the next step or queued work to it.`;
function headText(o) {
  if (!o?.head) return "(none yet)";
  return `${o.head.title} | ${o.head.description || "(no description yet)"}`;
}
function statusBlocks({ last, asks, tasks, now }) {
  const { open: open2, finished } = subjectsText(last);
  const running = runningText(last, now);
  const held = asksText(last, asks);
  const list = tasksText(tasks);
  return [
    `<head>${NL5}${headText(last)}${NL5}</head>`,
    `<subjects>${NL5}${open2}${NL5}</subjects>`,
    ...finished === "" ? [] : [`<finished>${NL5}${finished}${NL5}</finished>`],
    ...running === "" ? [] : [`<running>${NL5}${running}${NL5}</running>`],
    ...held === "" ? [] : [`<asks>${NL5}${held}${NL5}</asks>`],
    ...list === "" ? [] : [`<tasks>${NL5}${list}${NL5}</tasks>`]
  ];
}
function personText(person, trigger) {
  return person ?? `(The person sent nothing. The turn was started by: ${trigger ?? "unknown"}.)`;
}
function statusPrompt(input, ex) {
  const person = personText(ex.person, ex.trigger);
  return [
    ...statusBlocks(input),
    `<person>${NL5}${clipMiddle(person, 4e3, 1500)}${NL5}</person>`,
    `<activity>${NL5}${clipMiddle(ex.activity.join(NL5), 2500, 500)}${NL5}</activity>`,
    `<reply>${NL5}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL5}</reply>`
  ].join(NL5);
}
function statusMidTurnPrompt(input, turn) {
  return [
    "The turn is still running. Treat <person> and <activity> as the exchange so far: there is no reply yet. Answer with the changes the work so far makes.",
    ...statusBlocks(input),
    `<person>${NL5}${clipMiddle(personText(turn.person, turn.trigger), 4e3, 1500)}${NL5}</person>`,
    `<activity>${NL5}${clipMiddle(turn.activity.join(NL5), 2500, 500)}${NL5}</activity>`
  ].join(NL5);
}
function statusCatchUpPrompt(input, transcript) {
  return [
    "Treat the conversation in <conversation> as the exchange. Its start may be cut. Answer with the changes that bring the list to where the conversation ends.",
    ...statusBlocks(input),
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

// ../hooks/view.ts
var OPTIONS_FOLD_AT = 5;
var OPTION_LABEL_CHARS = 32;
var CHOICE_KEYS = [..."abcfghilm"];
var DOT = "\u2007\xB7\u2002";
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "\u25B2", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "\u2726", tone: "done" }
};
var SUBJECT_MARKS = {
  working: { mark: "\u25CF", tone: null },
  queued: { mark: "\u25CB", tone: null },
  "waits-on-other": { mark: "\u25CC", tone: null },
  done: { mark: "\u2713", tone: "done" },
  dropped: { mark: "\u2717", tone: null }
};
var HELD_MARK = { mark: "\u25C6", tone: "needsYou" };
var RUNNING_FRAMES = ["\u25CF", "\u25C9", "\u25CE", "\u25C9"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "\u2715",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" }
};
var MARK_LEGEND = [
  {
    mark: RUNNING_MARK,
    tone: null,
    isRunning: true,
    words: "Working. It moves while the work runs or your message is on its way."
  },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: "Queued: not started yet" },
  {
    mark: SUBJECT_MARKS["waits-on-other"].mark,
    tone: null,
    isRunning: false,
    words: "Waits on something other than you, such as a build or a review"
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on you" },
  { mark: SUBJECT_MARKS.done.mark, tone: "done", isRunning: false, words: "Done, or handed to the agent" },
  { mark: SUBJECT_MARKS.dropped.mark, tone: null, isRunning: false, words: "Dropped before it was done" },
  { mark: CLOSED_MARKS.dismissed, tone: null, isRunning: false, words: "Dismissed by you" },
  {
    mark: FINDING_GROUPS.issue.mark,
    tone: FINDING_GROUPS.issue.tone,
    isRunning: false,
    words: "Something is wrong: an issue or a failing check"
  },
  {
    mark: FINDING_GROUPS.opportunity.mark,
    tone: FINDING_GROUPS.opportunity.tone,
    isRunning: false,
    words: "Opportunity: something that could be better"
  }
];
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
var NO_HOLDS = { replies: {}, discarded: {}, shownSince: null };
function isShownSince(at, shownSince) {
  return shownSince !== null && at >= shownSince;
}
function isSettledInPlace(state, { shownSince, lastTypedMessageAt }) {
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at;
  return isShownSince(state.at, shownSince) && (state.canUndo || !isTypedSince);
}
function isUndoLeft(at, now, settleWindowMs) {
  return now - at < settleWindowMs;
}
function canUndoClose(closed, at, now, settleWindowMs) {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs);
}
function closedRowState(closed, at, now, settleWindowMs, delivery) {
  return {
    is: "settled",
    label: outcomeLabel(closed),
    at,
    canUndo: canUndoClose(closed, at, now, settleWindowMs),
    offersUndo: offersUndo(closed),
    closedAs: closedState(closed),
    delivery
  };
}
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
var RUNNING_RESULT = { text: RUNNING_MARK, isRunning: true };
function isSendMoving(delivery) {
  return delivery === "sending" || delivery === "queued";
}
var NEXT_BUILD_MARK = ".next-build";
var UPDATE_FAILED = "Last update failed. Items from that reply may be missing.";
var HOLDS_UP_TEXT = "Holds up";
var STATUS_FAILED = "Last Status update failed. Changes from that reply may be missing.";
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
  "thread-draft": "Drafting a reply\u2026",
  "pr-rank-again": "Ranking\u2026"
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
  "check-fix": () => "Asked to fix",
  "pr-rank-again": () => "Ranked"
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
function closedMark(state, delivery) {
  if (isSendMoving(delivery)) return RUNNING_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\u{1F9ED}" },
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
var LOOK_TEXT = "Last seen";
var CHILD_ROWS = 3;
var NEW_CLOSED_ROWS = 2;
var OPEN_ROWS = 7;
var CHILD_MARK = { mark: SUBJECT_MARKS.working.mark, tone: null };
var STATUS_PLACES = ["held", "working", "waits-on-other", "queued", "closed"];
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;
function isItemAfterItem(row, prev) {
  const isUnderSubject = row.kind === "more" || row.kind === "child" && row.branch !== null;
  return prev !== void 0 && prev.kind !== "look" && row.kind !== "look" && !isUnderSubject;
}
function isFinishedUnseen(c, lastLookAt) {
  return c.delegateState === "finished" && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt);
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
function childStall(c) {
  if (c.delegateState === "finished") return { text: "finished", tone: "done" };
  if (c.delegateState === "blocked") return { text: "waiting", tone: "needsYou" };
  return null;
}
function childRow(c, branch) {
  const marks = c.delegateState === "finished" ? SUBJECT_MARKS.done : c.delegateState === "blocked" ? HELD_MARK : CHILD_MARK;
  return {
    kind: "child",
    id: c.id,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch
  };
}
function statusPage(s, now) {
  const o = s.ledger.overview;
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => look === null || x.changedAt > look;
  const heldIds = new Set(s.ledger.items.flatMap((i) => o?.askSubjects[i.id] ?? []));
  const isHeld = (x) => isOpen(x) && heldIds.has(x.id);
  const oldestAskOf = (x) => {
    if (!isHeld(x)) return null;
    const oldest = s.ledger.items.filter((i) => o?.askSubjects[i.id] === x.id).sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
    return oldest ? { id: oldest.id, kind: oldest.kind } : null;
  };
  const placeOf = (x) => isHeld(x) ? "held" : x.status === "done" || x.status === "dropped" ? "closed" : x.status;
  const pageOrder = (x, y) => Number(isNew(y)) - Number(isNew(x)) || STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt;
  const stallOf = (x) => isHeld(x) ? { text: "waiting", tone: "needsYou" } : null;
  const newClosed = subjects.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0)).slice(0, NEW_CLOSED_ROWS);
  const open2 = subjects.filter(isOpen);
  const queuedOver = Math.max(0, open2.length - OPEN_ROWS);
  const hiddenQueued = new Set(
    open2.filter((x) => placeOf(x) === "queued").sort((x, y) => x.changedAt - y.changedAt).slice(0, queuedOver).map((x) => x.id)
  );
  const shown = [...open2.filter((x) => !hiddenQueued.has(x.id)), ...newClosed].sort(pageOrder);
  const folded = subjects.filter((x) => x.status === "done" && !newClosed.includes(x));
  const running = (o?.children ?? []).filter((c) => isChildRunning(c, now) || isFinishedUnseen(c, look)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const shownIds = new Set(shown.map((x) => x.id));
  const rows = running.filter((c) => c.subjectId === null || !shownIds.has(c.subjectId)).map((c) => childRow(c, null));
  const lookRow = look === null ? null : { kind: "look", id: "look", text: LOOK_TEXT };
  const firstSeen = shown.findIndex((x) => !isNew(x));
  for (const [i, x] of shown.entries()) {
    const hasNewAbove = i > 0;
    if (lookRow && i === firstSeen && hasNewAbove) rows.push(lookRow);
    const under = running.filter((c) => c.subjectId === x.id);
    const shownUnder = under.slice(0, CHILD_ROWS);
    const isMore = under.length > CHILD_ROWS;
    rows.push({
      kind: "subject",
      id: x.id,
      ...isHeld(x) ? HELD_MARK : SUBJECT_MARKS[x.status],
      isRunning: x.status === "working" && !isHeld(x) && (s.presence.isTurnRunning || under.some(isChildWorking)),
      name: x.name,
      text: isNew(x) || isOpen(x) ? x.text || null : null,
      stall: stallOf(x),
      merged: isNew(x) ? x.merged : null,
      was: isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: oldestAskOf(x)
    });
    rows.push(...shownUnder.map((c, n) => childRow(c, n === shownUnder.length - 1 && !isMore ? "last" : "mid")));
    const hidden = under.slice(CHILD_ROWS);
    const isEveryHiddenRunning = hidden.every((c) => c.delegateState !== "finished");
    if (isMore)
      rows.push({
        kind: "more",
        id: `${x.id}-more`,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? " running" : ""}`,
        branch: "last"
      });
  }
  const isEveryShownNew = firstSeen === -1;
  if (lookRow && isEveryShownNew && shown.length > 0) rows.push(lookRow);
  if (hiddenQueued.size > 0)
    rows.push({
      kind: "fold",
      id: "queued",
      mark: SUBJECT_MARKS.queued.mark,
      tone: null,
      text: `${hiddenQueued.size} more queued`
    });
  if (folded.length > 0) {
    const isMore = newClosed.some((x) => x.status === "done");
    rows.push({
      kind: "fold",
      id: "done",
      mark: SUBJECT_MARKS.done.mark,
      tone: "done",
      text: `${folded.length}${isMore ? " more" : ""} done`
    });
  }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null;
  return {
    isEmpty: head === null && rows.length === 0,
    head,
    rows: rows.map((r, n) => ({ ...r, isRuledAbove: isItemAfterItem(r, rows[n - 1]), isLast: n === rows.length - 1 })),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: "Status",
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
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
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
function heldSubjectOf(o, askId) {
  const subjectId = o?.askSubjects[askId];
  return o?.subjects.find((s) => s.id === subjectId && isOpen(s)) ?? null;
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
  discarded,
  shownSince,
  lastTypedMessageAt
}) {
  const isInPlace = (at, canUndo) => isSettledInPlace({ at, canUndo }, { shownSince, lastTypedMessageAt });
  const isOpen2 = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const replyAfter = (c) => {
    const last = lastActions[c.id];
    return last?.action === "type" && last.at >= closedAt(c) && last.delivery?.state !== "failed" && isInPlace(last.at, false) ? last : null;
  };
  const isOwnClose = (c) => c.how === "done" || c.how === "dismissed" || c.how === "answered" && lastActions[c.id]?.kind === "mark" && lastActions[c.id]?.at === closedAt(c);
  const isHeld = (c) => {
    const since = replies[c.id];
    return since !== void 0 && since <= closedAt(c) && !isOwnClose(c);
  };
  const isDiscarded = (c) => (discarded[c.id] ?? -Infinity) >= closedAt(c);
  const isPlaced = (c) => {
    const at = closedAt(c);
    return replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isInPlace(at, canUndoClose(c, at, now, settleWindowMs)));
  };
  const placedItems = new Map(
    ledger.closed.filter((d) => d.item && !isOpen2(d.id) && isPlaced(d)).map((d) => [d.id, d])
  );
  const isFixSettled = (id) => {
    const last = lastActions[id];
    return isFixSent(last) && !isInPlace(last.at, isUndoLeft(last.at, now, settleWindowMs));
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
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed2)
        };
      if (isHeld(closed2)) return { is: "held", label: heldLabel(closed2), at };
      return closedRowState(
        closed2,
        at,
        now,
        settleWindowMs,
        "doneNotification" in closed2 && closed2.doneNotification?.error !== void 0 ? { error: closed2.doneNotification.error, canUndo: isUndoable(closed2) } : (closed2.how === "answered" || closed2.how === "done") && last2?.kind === "mark" && last2.at === at ? pendingDeliveryAt(last2, now) : null
      );
    }
    const last = lastActions[id];
    const sent = ledger.findings.find((f) => f.id === id);
    if (sent && isFixSent(last))
      return {
        is: "settled",
        label: fixLabel(sent),
        at: last.at,
        canUndo: isUndoLeft(last.at, now, settleWindowMs),
        offersUndo: true,
        delivery: pendingDeliveryAt(last, now),
        closedAs: "handled"
      };
    return isHandedOff(last, turns) ? { is: "handedOff" } : { is: "open" };
  };
  const rowOf = (row) => {
    const state = stateOf(row.id);
    const last = lastActions[row.id];
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt);
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt));
    const heldSubject = state.is === "open" ? heldSubjectOf(ledger.overview, row.id) : null;
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: heldSubject ? `${HOLDS_UP_TEXT} ${heldSubject.name}` : null
    };
  };
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    return rowOf({
      id: item.id,
      type: item.kind,
      number: n ?? null,
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
      number: null,
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
  const closed = [...ledger.closed].filter((d) => !held.has(d.id)).reverse().map((d) => {
    const delivery = d.doneNotification?.error !== void 0 ? { error: d.doneNotification.error, canUndo: isUndoable(d) } : (d.how === "answered" || d.how === "done") && lastActions[d.id]?.kind === "mark" && lastActions[d.id]?.at === d.at ? pendingDeliveryAt(lastActions[d.id], now) : null;
    return { ...d, outcomeLabel: outcomeLabel(d), delivery, mark: closedMark(closedState(d), delivery) };
  });
  const fixesSent = ledger.findings.filter((f) => isFixSent(lastActions[f.id])).map((f) => {
    const outcome = fixLabel(f);
    const delivery = pendingDeliveryAt(lastActions[f.id], now);
    return {
      ...f,
      how: "answered",
      outcome,
      outcomeLabel: outcomeLabel({ ...f, outcome }),
      closedAt: lastActions[f.id].at,
      delivery,
      mark: closedMark(closedState({ how: "answered", outcome }), delivery)
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
        ...ledger.closedFindings.filter((f) => !held.has(f.id)).map((f) => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null, mark: closedMark(closedState(f), null) })),
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
var MAX_ORDERED_PRS = 30;
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
function splitLinked(prState, links) {
  const ranked = new Set(links.prOrder?.refs ?? []);
  const shown = links.prs.filter((ref) => !isLeftOut(prState, ref));
  const unranked = shown.filter((ref) => !ranked.has(ref));
  const older = unranked.slice(0, Math.max(0, unranked.length - MAX_PRS));
  return { tracked: shown.filter((ref) => !older.includes(ref)), older };
}
function olderPrsText(prState, links) {
  const { older } = splitLinked(prState, links);
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
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1e3} seconds`;
var PR_DISMISSED_LABEL = "Dismissed";
var DISMISS_MERGED_LABEL = "Dismiss merged";
var RANK_AGAIN_LABEL = "Rank again";
var RANK_AGAIN_ID = "pr:order";
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}
function isTracked(prState, links, ref) {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref;
}
function keepsView(prState, links, ref) {
  return isTracked(prState, links, ref) || links.prs.includes(ref) && isLeftOut(prState, ref);
}
function dismissedAt(lastActions, ref) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" ? mark.at : null;
}
function isViewKept(prState, links, lastActions, ref, shownSince) {
  const at = dismissedAt(lastActions, ref);
  return keepsView(prState, links, ref) || at !== null && isShownSince(at, shownSince);
}
function openPrViews(drawn) {
  return drawn.filter((d) => d.state.is === "open").map((d) => d.pr);
}
var DISMISSED_PR = { how: "dismissed", outcome: PR_DISMISSED_LABEL };
function drawnPrs(prState, links, lastActions, now, settleWindowMs, placing) {
  const ranked = links.prOrder?.refs ?? [];
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr) => {
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: "open" } }];
    const at = dismissedAt(lastActions, pr.ref);
    if (at === null) return [];
    const state = closedRowState(DISMISSED_PR, at, now, settleWindowMs, null);
    return isSettledInPlace(state, placing) ? [{ pr, state }] : [];
  });
  let rank = 0;
  return drawn.map((d) => ({ ...d, rank: rankOf(d.pr, ranked) === null ? null : ++rank }));
}
function prOrderText(order, drawn, now) {
  const isRanking = drawn.some((d) => d.rank !== null);
  if (!order || !isRanking) return null;
  return `${order.label ?? "Order"}${DOT}set by ${order.by} ${ago(now - order.at)}`;
}
function rankedStatusOf(pr) {
  return {
    status: readiness(pr).status,
    threads: waitingThreads(pr).map((t) => t.id),
    failing: failingChecks(pr).map((c) => c.name)
  };
}
function hasChanged(was, is) {
  return is.status !== was.status || is.threads.some((id) => !was.threads.includes(id)) || is.failing.some((name) => !was.failing.includes(name));
}
function changedRankedPrs(order, prs) {
  const statuses = order.statuses ?? {};
  return inPrOrder(prs, order.refs).filter((pr) => {
    const was = statuses[pr.ref];
    return rankOf(pr, order.refs) !== null && was !== void 0 && hasChanged(was, rankedStatusOf(pr));
  });
}
function prOrderView(order, drawn, presses, shownSince) {
  const title = prOrderText(order, drawn, presses.now);
  if (!order || title === null) return null;
  const count = changedRankedPrs(order, openPrViews(drawn)).length;
  const row = lastPressOf(presses, RANK_AGAIN_ID);
  const last = row.last;
  const isPressShownHere = last !== void 0 && (row.pressing !== null || isShownSince(last.at, shownSince));
  const isForThisOrder = last !== void 0 && last.at >= order.at;
  const showsPress = row.pressing !== null || isForThisOrder || isPressShownHere && count === 0;
  const isChangedShown = count > 0 || isPressShownHere;
  return {
    title,
    why: order.why,
    changed: isChangedShown ? {
      text: count > 0 ? `${count} ${count === 1 ? "PR" : "PRs"} changed since` : null,
      actions: count > 0 ? prOrderActions(row) : [],
      showsPress
    } : null
  };
}
function prOrderActions(row) {
  return withOut(row, [
    {
      press: { action: "pr-rank-again" },
      label: RANK_AGAIN_LABEL,
      kind: "talk",
      emphasis: "normal",
      hotkey: "g"
    }
  ]);
}
function lastPressOf(presses, rowId) {
  const last = presses.lastActions[rowId];
  const feedback = pressFeedbackIn(rowId, { is: "open" }, last, presses.turns, presses.now);
  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) };
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}
function isDismissedByMerged(pr, branchRef) {
  return pr.state === "MERGED" && pr.ref !== branchRef;
}
function prTabActions(drawn, branchRef) {
  const hasMerged = drawn.some((d) => d.state.is === "open" && isDismissedByMerged(d.pr, branchRef));
  return hasMerged ? [
    {
      press: { action: "pr-dismiss-merged" },
      label: DISMISS_MERGED_LABEL,
      kind: "mark",
      emphasis: "normal",
      hotkey: "m",
      isOut: false
    }
  ] : [];
}

// ../hooks/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

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

// ../hooks/tools.ts
var ORDER_SCHEMA = {
  type: "object",
  properties: {
    repo: { type: "string", description: "The repository, as owner/name." },
    numbers: {
      type: "array",
      items: { type: "integer" },
      description: `The PR numbers, first to last, at most ${MAX_ORDERED_PRS}. Give an empty list to clear the order.`
    },
    label: {
      type: "string",
      description: 'What the user does with the order, in at most 4 words, such as "Merge in this order" or "Review in this order". Required to set an order.'
    },
    why: {
      type: "string",
      description: "The reason for this order, in one sentence, such as a PR that waits on another. Not a summary of each PR. Required to set an order."
    }
  },
  required: ["numbers"]
};

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
      lastReplyAt: null,
      lastTypedMessageAt: null
    },
    place: null,
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    lastOverviewCallAt: null,
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
    shownSince: saved.shownSince ?? null,
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
    overviewFailure: saved.overviewFailure ?? null,
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
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
function appliedStatus(s, answer, appliedAfter, now) {
  if (s.presence.turnsApplied < appliedAfter) return s;
  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: applyStatus(s.ledger.overview, answer, now, new Set(s.ledger.items.map((i) => i.id)))
    },
    overviewFailure: null,
    lastOverviewCallAt: now
  };
}
var REFUSED_ANSWER_CHARS = 500;
function failedStatus(s, text2, appliedAfter, now) {
  if (s.presence.turnsApplied < appliedAfter) return s;
  const failure = text2 === null ? { at: now, cause: "no-answer", answer: null } : { at: now, cause: "refused", answer: text2.slice(0, REFUSED_ANSWER_CHARS) };
  return { ...s, overviewFailure: failure, lastOverviewCallAt: now };
}
var STATUS_REFRESH_MS = 10 * 6e4;
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
function pruned(s) {
  const inPlace = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map((c) => ({ id: c.id, at: closedAt(c) }))
  ].flatMap((x) => isShownSince(x.at, s.shownSince) ? [x.id] : []);
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(
      ([ref]) => isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince)
    )
  );
  const isViewDropped = Object.keys(views).length < Object.keys(s.prViews.views).length;
  return {
    ...s,
    ledger: pruneClosed(s.ledger, /* @__PURE__ */ new Set([...s.heldRows, ...inPlace])),
    prViews: isViewDropped ? { ...s.prViews, views } : s.prViews
  };
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
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt
  });
  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds.shownSince, settleWindowMs),
    statusPage: statusPage(s, now)
  };
}
function prTabOf(s, lastActions, now, shownSince, settleWindowMs) {
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, now, settleWindowMs, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt
  });
  const isSent = threadSentIn(lastActions);
  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => d.state.is === "open" && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger),
    order: prOrderView(
      s.ledger.prOrder,
      drawn,
      { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now },
      shownSince
    ),
    tabActions: prTabActions(drawn, s.prViews.branchRef),
    isGhSignedOut: s.prViews.isGhSignedOut === true
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
    version: SESSION_VERSION,
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
  checkVersion(saved);
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
    const next = pruned(changed);
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
  prsIn: "the PRs section of the Inbox tab",
  recordTool: "mcp__inbox__record",
  closeTool: "mcp__inbox__close",
  intro: "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation."
};

// src/core.ts
var TAB_OPEN_MS = 15e3;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
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
  const { firstAsk, asks, findings, focus } = input;
  if (firstAsk !== null) return asks > 1 ? `${asks} \xB7 ${firstAsk}` : firstAsk;
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? "" : "s"}`;
  return [focus, findingsText].filter(Boolean).join(" \xB7 ");
}
function focusOf(head) {
  return head ? head.description || head.title : null;
}
function herdrTokens(ledger, stop, view, dialogs) {
  const input = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    focus: focusOf(ledger.overview?.head ?? null)
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
  return (run2, report) => {
    sending = sending.then(async () => {
      const r = await report();
      if (!r) return;
      const key = herdrReportKey(r.pane, r.tokens);
      if (key === sent) return;
      sent = key;
      await run2(herdrReport(r.pane, r.tokens, r.seq), { cwd: "/", timeoutMs: HERDR_TIMEOUT_MS });
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
    await report(run2, async () => ({ pane, tokens, seq }));
    await updateState(
      dir,
      s.sessionId,
      (saved) => saved.herdrReport && saved.herdrReport.seq >= seq ? saved : { ...saved, herdrReport: { key, seq } }
    );
  };
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env, input }) => new Promise((resolve3) => {
  const [file = "", ...rest] = args;
  try {
    const child = execFile(
      file,
      rest,
      { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        resolve3({ code: exitCodeOf(err), stdout: String(stdout), stderr: String(stderr) });
      }
    );
    child.stdin?.on("error", () => {
    });
    child.stdin?.end(input);
  } catch (err) {
    resolve3({ code: UNSTARTABLE_CODE, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
  }
});
function exitCodeOf(err) {
  if (!err) return 0;
  if (err.killed) return TIMED_OUT_CODE;
  return typeof err.code === "number" ? err.code : UNSTARTABLE_CODE;
}

// src/update.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import {
  access,
  copyFile,
  lstat as lstat2,
  mkdir as mkdir2,
  readdir as readdir3,
  readFile as readFile2,
  readlink as readlink2,
  rename as rename2,
  rm,
  rmdir as rmdir2,
  stat as stat2,
  symlink as symlink2,
  writeFile as writeFile2
} from "node:fs/promises";
import { dirname as dirname3, join as join4 } from "node:path";

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
function statusCallPrompt(input, read) {
  switch (read.kind) {
    case "reply":
      return statusPrompt(input, read.exchange);
    case "mid-turn":
      return statusMidTurnPrompt(input, read.turn);
    case "catch-up":
      return statusCatchUpPrompt(input, read.conversation);
  }
}
var STATUS_RECORD_VERSION = 1;
var RECORDS_PER_SESSION = 100;
var RECORDS_KEPT_MS = 14 * 24 * 60 * 6e4;
var RECORDS_SWEEP_MS = 60 * 6e4;
var RECORD_NAME = /^(\d{13})-[a-z-]+\.jsonl$/;
var sweptAt = /* @__PURE__ */ new Map();
function recordsFolderName(session) {
  return session.replace(/[^A-Za-z0-9_-]/g, "_") || "_";
}
function recordFileName(at, kind) {
  return `${String(at).padStart(13, "0")}-${kind}.jsonl`;
}
async function writeStatusRecord(records, record2) {
  const { files, folder } = records;
  const own = `${folder}/${recordsFolderName(records.session)}`;
  await files.write(`${own}/${recordFileName(record2.at, record2.exchange.kind)}`, `${JSON.stringify(record2)}
`);
  const names = (await files.list(own)).filter((n) => RECORD_NAME.test(n)).sort();
  const past = names.slice(0, Math.max(0, names.length - RECORDS_PER_SESSION));
  if (past.length > 0) await files.removeFiles(past.map((n) => `${own}/${n}`));
  if (record2.at - (sweptAt.get(folder) ?? -Infinity) < RECORDS_SWEEP_MS) return;
  sweptAt.set(folder, record2.at);
  for (const session of await files.list(folder)) {
    const theirs = `${folder}/${session}`;
    if (theirs === own) continue;
    const kept = (await files.list(theirs)).filter((n) => RECORD_NAME.test(n));
    const lastAt = Math.max(...kept.map((n) => Number(RECORD_NAME.exec(n)[1])));
    if (record2.at - lastAt < RECORDS_KEPT_MS) continue;
    if (kept.length > 0) await files.removeFiles(kept.map((n) => `${theirs}/${n}`));
    await files.removeFolder(theirs).catch(() => void 0);
  }
}
async function attempt(host, ask, prompt) {
  const heard = {};
  const startedAt = await host.now();
  const text2 = await ask(prompt, STATUS_SYSTEM, (r) => heard.report = r).catch((err) => {
    heard.thrown = err instanceof Error ? err.message : String(err);
    return null;
  });
  return {
    text: text2,
    model: heard.report?.model ?? null,
    answeredBy: heard.report?.answeredBy ?? null,
    answer: text2,
    error: text2 === null ? heard.thrown ?? heard.report?.error ?? "no answer, and the host gave no reason" : null,
    ms: await host.now() - startedAt
  };
}
async function askAndWriteStatus(host, s, call, tasks, appliedAfter) {
  const input = { last: s.ledger.overview, asks: s.ledger.items, tasks, now: await host.now() };
  const prompt = statusCallPrompt(input, call.exchange);
  const attempts = [];
  const { last } = await askStatus(async () => {
    const { text: text2, ...made } = await attempt(host, call.ask, prompt);
    attempts.push(made);
    return { text: text2 };
  });
  const answer = last.text === null ? null : parseStatus(last.text);
  const now = await host.now();
  let before = null;
  let isWritten = false;
  const after = await host.update((x) => {
    before = x.ledger.overview;
    isWritten = x.presence.turnsApplied >= appliedAfter;
    return answer === null ? failedStatus(x, last.text, appliedAfter, now) : appliedStatus(x, answer, appliedAfter, now);
  });
  if (!host.records) return;
  const record2 = {
    version: STATUS_RECORD_VERSION,
    host: host.records.host,
    session: host.records.session,
    at: input.now,
    system: STATUS_SYSTEM,
    prompt,
    input,
    exchange: call.exchange,
    attempts,
    isParsed: answer !== null,
    isWritten,
    before,
    after: after.ledger.overview
  };
  void writeStatusRecord(host.records, record2).catch(() => void 0);
}
function refreshStatus(host) {
  return host.inOrder(async () => {
    const s = await host.read();
    if (!s.presence.isTurnRunning) return;
    const { person, trigger, activity } = s.turn;
    const call = { exchange: { kind: "mid-turn", turn: { person, trigger, activity } }, ask: host.ask };
    await askAndWriteStatus(host, s, call, s.hostTasks, s.presence.turnsApplied);
  });
}
async function askOverConversation(ask, names, s, screen, conversation) {
  if (!conversation) return { kind: "unreadable" };
  const text2 = await ask(transcriptCatchUpPrompt(s.ledger, screen, conversation), systemText(names)).catch(() => null);
  return text2 === null ? { kind: "failed" } : {
    kind: "reply",
    text: text2,
    source: conversation,
    statusCall: { exchange: { kind: "catch-up", conversation }, ask }
  };
}
async function runUpdates(host) {
  let canCatchUp = host.catchUp !== void 0;
  const wantsCatchUp = (s) => canCatchUp && needsCatchUp(s);
  const hasWork = (s) => s.pending.length > 0 || wantsCatchUp(s);
  const writing = [];
  const writeStatus = (after, call, tasks) => host.inOrder(async () => askAndWriteStatus(host, await host.read(), call, tasks, after.presence.turnsApplied));
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
              if (reply2.kind === "reply" && reply2.statusCall)
                followUp(writeStatus(after2, reply2.statusCall, s.hostTasks));
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
                writeStatus(after, { exchange: { kind: "reply", exchange: next.ex }, ask: host.ask }, next.ex.tasks)
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
var TURN_EVENT_KINDS = /* @__PURE__ */ new Map([
  ["task_started", "started"],
  ["task_complete", "completed"],
  ["turn_aborted", "aborted"]
]);
function turnEventOfRow(row) {
  const p = record(row.payload);
  const kind = row.type === "event_msg" ? TURN_EVENT_KINDS.get(textOf(p.type)) : void 0;
  return kind === void 0 ? null : { id: textOf(p.turn_id) || textOf(record(p.turn_attribution).turn_id), kind };
}
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
  const line = command === "" ? null : toolActivity("Bash", { command });
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
    const line2 = toolActivity("Agent", { description: textOf(args.task_name) });
    return line2 ? [line2] : [];
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: "open" })];
  const line = toolActivity(textOf(p.namespace).startsWith("mcp__") ? textOf(p.namespace) + name : name, {});
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
    const event = turnEventOfRow(row);
    if (event?.kind === "started") {
      groups.push({ id: event.id, isComplete: false, rows: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ id: "", isComplete: false, rows: [] });
    const group = groups.at(-1);
    if (event?.kind === "completed") group.isComplete = true;
    else group.rows.push(row);
  }
  return groups.map((g) => ({ id: g.id, isComplete: g.isComplete, turns: turnsOf(g.rows, cwd) }));
}
var TURN_WINDOW_BYTES = [TURN_ROW_BYTES, 512 * 1024, TAIL_BYTES];
function rolloutOfLines(lines, cwd, currentTurnId) {
  const turns = rolloutTurns(lines, cwd);
  const earlier = turns.filter((t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person")));
  return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
}
async function readRollout(path, cwd, currentTurnId) {
  if (path === null) return null;
  try {
    return rolloutOfLines(await historyLines(path, ROLLOUT_BYTES), cwd, currentTurnId);
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
  return async (prompt, instructions, report) => {
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
          "-"
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS, env: home ? { CODEX_HOME: home } : {}, input: prompt }
      );
      const unknown = r.stderr.match(/Unknown feature flag: (\S+)/)?.[1];
      if (r.code !== 0 && unknown && off.includes(unknown)) {
        off = off.filter((f) => f !== unknown);
        continue;
      }
      const text2 = r.code === 0 ? await readFile2(out, "utf8").catch(() => null) : null;
      await rm(out, { force: true });
      const stderr = r.stderr.slice(-FAILURE_TAIL_CHARS);
      report?.({ model: MODEL, ...text2 === null ? { error: `codex exec exited ${r.code}: ${stderr.trim()}` } : {} });
      if (text2 === null) await onFailure({ cli, code: r.code, stderr });
      return text2;
    }
    report?.({ model: MODEL, error: "codex exec refused every feature flag the inbox turns off" });
    return null;
  };
}
var recordModelFailure = (dir, sessionId, now) => async (failure) => {
  await updateState(dir, sessionId, (s) => ({ ...s, lastModelFailure: { ...failure, at: now() } }));
};
var inOrderFor = (dir, sessionId) => (fn) => resultsOrder.run(
  statePath(dir, sessionId),
  () => withLock(`${statePath(dir, sessionId)}.results`, fn, RESULTS_WAIT_MS)
);
var recordFiles = {
  write: async (path, text2) => {
    await mkdir2(dirname3(path), { recursive: true });
    await writeFile2(path, text2);
  },
  list: (folder) => readdir3(folder).catch(() => []),
  removeFiles: async (paths) => void await Promise.all(paths.map((p) => rm(p, { force: true }))),
  removeFolder: (path) => rmdir2(path)
};
var statusRecords = (dir, sessionId) => ({
  host: "codex",
  folder: join4(dir, "overview-calls"),
  session: sessionId,
  files: recordFiles
});
var refreshStatus2 = (dir, sessionId, ask, now, onWrite, records) => refreshStatus({
  ...codexStore(dir, sessionId, now, onWrite),
  ask,
  inOrder: inOrderFor(dir, sessionId),
  records
});
var runUpdates2 = (dir, sessionId, ask, now, onWrite, records) => runUpdates({
  ...codexStore(dir, sessionId, now, onWrite),
  ask,
  names: CODEX,
  inOrder: inOrderFor(dir, sessionId),
  records,
  catchUp: async (s) => askOverConversation(
    ask,
    CODEX,
    s,
    screenText(CODEX, isTabOpen(s, now()), screenTabOf(s.shownTab)),
    (await readRollout(s.transcriptPath, s.root))?.conversation ?? null
  )
});

// src/detached-update.ts
var STATUS_REFRESH = "status-refresh";

// src/update-main.ts
async function main() {
  const sessionId = process.argv[2] ?? "";
  const isStatusRefresh = process.argv[3] === STATUS_REFRESH;
  const pluginRoot = dirname4(dirname4(fileURLToPath(import.meta.url)));
  const dir = dataDir(process.env, pluginRoot);
  const { cliPath } = await readState(dir, sessionId);
  const cli = cliPath ?? await findCli(process.env, run, process.ppid);
  const personHome = process.env.CODEX_HOME || join5(homedir3(), ".codex");
  const ask = codexAsk(run, cli, dir, personHome, recordModelFailure(dir, sessionId, Date.now));
  const onWrite = herdrOnWrite(process.env, run, dir, Date.now);
  const records = existsSync(join5(pluginRoot, NEXT_BUILD_MARK)) ? statusRecords(dir, sessionId) : void 0;
  if (isStatusRefresh) await refreshStatus2(dir, sessionId, ask, Date.now, onWrite, records);
  else await runUpdates2(dir, sessionId, ask, Date.now, onWrite, records);
}
main().catch(() => process.exit(0));
