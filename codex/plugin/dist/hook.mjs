// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/hook-main.ts
import { dirname as dirname3, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";

// src/detached-update.ts
import { spawn } from "node:child_process";
var OVERVIEW_REFRESH = "overview-refresh";
function detachedUpdate(dir, env, script) {
  return (sessionId, mode) => {
    const child = spawn(process.execPath, [script, sessionId, ...mode ? [mode] : []], {
      detached: true,
      stdio: "ignore",
      env: { ...env, INBOX_DATA: dir }
    });
    child.unref();
  };
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
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

// ../hooks/overview.ts
var NAME_WORDS = 3;
var TEXT_WORDS = 4;
var GOAL_WORDS = 8;
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var GOAL_KEPT = 14;
var CHILD_KEPT_MS = 24 * 60 * 6e4;
var CHILDREN_KEPT = 50;
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
var EMPTY_OVERVIEW = {
  role: "session",
  goal: "",
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
function clipWords(text2, limit) {
  const words3 = text2.trim().split(/\s+/).filter(Boolean);
  return words3.length <= limit ? words3.join(" ") : `${words3.slice(0, limit).join(" ")}\u2026`;
}
function words(text2) {
  return new Set((text2.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w)));
}
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function withChild(last, c, now) {
  const o = last ?? EMPTY_OVERVIEW;
  const kept = o.children.filter((x) => x.ref === c.ref || x.endedAt === null || now - x.endedAt < CHILD_KEPT_MS);
  const known = kept.find((x) => x.ref === c.ref);
  if (known) return { ...o, children: kept.map((x) => x === known ? { ...x, ...c } : x) };
  return {
    ...o,
    nextChildId: o.nextChildId + 1,
    children: [...kept, { ...c, id: `c${o.nextChildId}`, subjectId: null }].slice(-CHILDREN_KEPT)
  };
}
function changedChild(o, ref, change) {
  const known = o?.children.find((c) => c.ref === ref);
  if (!o || !known) return o;
  return { ...o, children: o.children.map((c) => c === known ? { ...c, ...change(c) } : c) };
}
function childEnded(o, ref, at) {
  return changedChild(o, ref, (c) => ({ endedAt: c.endedAt ?? at }));
}
function childActive(o, ref, at) {
  return changedChild(o, ref, (c) => ({ lastActivityAt: Math.max(c.lastActivityAt ?? at, at) }));
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
    lastActivityAt: time(c.lastActivityAt)
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
  const savedLinks = typeof o.askSubjects === "object" && o.askSubjects !== null ? Object.entries(o.askSubjects) : [];
  const askSubjects = Object.fromEntries(savedLinks.filter((e) => typeof e[1] === "string"));
  const look = o.look;
  const lookAt = time(look?.startedAt);
  return {
    role: o.role === "coordinator" ? "coordinator" : "session",
    goal: text(o.goal),
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
function clip(text2, max) {
  return text2.length <= max ? text2 : text2.slice(0, max) + " \u2026[cut]";
}
function clipLabel(text2, max) {
  return text2.length > max ? `${text2.slice(0, max - 1)}\u2026` : text2;
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
function isBlankLedger(ledger) {
  const isOverviewBlank = !ledger.overview || ledger.overview.goal === "" && ledger.overview.subjects.length === 0;
  return ledger.updates === 0 && isOverviewBlank && ledger.items.length === 0 && ledger.findings.length === 0;
}
var MAX_CLOSED = 12;
var EXPIRED = "expired, unanswered";
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
function sameAsk(a, b) {
  const norm = (s) => words2(s).join(" ");
  return norm(a) !== "" && norm(a) === norm(b);
}
var CLOSED_BY_CLAUDE = "closed by Claude";
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
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");
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

// ../hooks/host-tasks.ts
var STATUSES2 = {
  pending: "pending",
  in_progress: "in-progress",
  "in-progress": "in-progress",
  completed: "done",
  done: "done",
  abandoned: "dropped",
  blocked: "blocked"
};
var statusOf = (raw) => STATUSES2[String(raw)] ?? "pending";
var textOf = (raw) => typeof raw === "string" ? raw.trim() : "";
var recordOf = (raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
function numberedTasks(rows, textKey) {
  return rows.map(recordOf).map((row, n) => ({ id: String(n + 1), text: textOf(row[textKey]), status: statusOf(row.status) })).filter((t) => t.text !== "");
}
function codexPlanOf(args) {
  const parsed = typeof args === "string" ? safeJson(args) : args;
  const plan = recordOf(parsed).plan;
  if (!Array.isArray(plan)) return null;
  return numberedTasks(plan, "step");
}
function safeJson(text2) {
  try {
    return JSON.parse(text2);
  } catch {
    return null;
  }
}
function upgradeHostTasks(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((raw) => {
    const t = recordOf(raw);
    const status = STATUSES2[String(t.status)];
    return typeof t.id === "string" && typeof t.text === "string" && t.text !== "" && status ? [{ id: t.id, text: t.text, status }] : [];
  });
}

// ../hooks/model-text.ts
var NL = "\n";
function guidanceText(host) {
  return `# Inbox
${host.intro}

When you ask the user to decide something, say which option you recommend and why, in one clause ("I'd go with B: it keeps the old API"). If you cannot recommend one, say what would decide it.

Before you hand the user a step, take it yourself when your tools reach it, such as running a command, reloading or checking a page, or reading a log. When the step changes something other people see, such as marking a PR ready or pushing, ask for their OK as a question and take the step when they say yes. Record a task only for a step your tools cannot reach, and say in your reply why you cannot take it.

When you ask the user to do something, such as review a page, sign in or run a command, give them what they need in the same reply: the link, file path or command, what to do there, and how the result gets back to you. If the result would stay where you cannot read it, such as in their browser, give them a way to send it to you.

Ask in your reply as a direct question, and record the same ask in that turn with ${host.recordTool}, so it stays in the inbox after the conversation moves on. Record a decision, an approval or information you need as a question, with its options and the one you recommend. Record an act you hold until the user says so the same way. Record a step only the user can take as a task, with its steps. Record each one once. Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Check it once before you record it, by reading the code or running a quick command, so the finding says what is true. Record it with ${host.recordTool} as a finding, then go on with the task; fixing it waits until the user asks. Record one too when you work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them, and when part of your change cannot be checked from where you are. State those in your reply as well. Mention any other finding only when it bears on what the user asked.

These are not findings. Handle them in the task and your reply instead:
- A problem in your own change or inside the task: fix it.
- A check you could run yourself: run it, or say in your reply that you have not.
- Progress, status, or an approach you tried and dropped: say it.
- Something only the user can do or decide, such as an approval, a sign-in or a choice: ask it, and record it as a question or task.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as (close id: i35), and anything it does not list is closed. Check it before telling the user that something is open or waits on them. The ids are for the inbox tools only. The user never sees them, so never write one to the user, not even in parentheses: name an item or finding by what it says, as "the deploy task" or "the migration finding".

Close with ${host.closeTool}:
- When the user's message answers an open item, close it first, before other work, with their answer, and say in your reply what you took their answer to be.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`;
}
var START_TITLE = 'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.';
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
    const fields = q ?? {};
    const text2 = [fields.question, fields.title].find((v) => typeof v === "string" && v.trim() !== "");
    if (!text2) return [];
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o) => {
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
var OVERVIEW_SYSTEM = `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <goal>: the session's goal. Do not restate it.
- <subjects>: the open subjects, one per line: id | status | name | where it stands
- <finished>: subjects already done or dropped. Do not add them again.
- <running>: work running apart from the turn, such as a subagent, a background task, a workflow or a delegate session, one per line: id | kind | name | the subject it belongs to, or - when it has none yet
- <asks>: the open questions and tasks the inbox shows the person, one per line: id | the ask | the subject it holds up, or - when it has none yet
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
LINK: running or ask id | subject id or name
ROLE: coordinator or session
GOAL: the goal in the person's words, at most ${GOAL_WORDS} words

A subject is one piece of the work that the person would name: a feature, a fix, a release, or a stream of work handed to another session. Keep at most ${OPEN_SUBJECTS} open. A fix, an option, a review or a question inside a larger piece of work belongs to that subject: change its text instead, as in "critique fixes: 4 of 9 done". A subject is never a command, a file, a commit, a test run or a tool call. A question to the person is never a subject of its own, and neither is a problem the agent noticed outside the work: the inbox shows those.

The name is a label of at most ${NAME_WORDS} words, the handle the person would use for the work, such as "Offline sync", "Sign-out bug" or "1.4.2 release". It names the work, never what to do about it or what was found: not a sentence, a question, a task or a finding. Write "Login provider", not "Choose which login provider ships first", and "Sign-out token bug", not "A cached token survives sign-out on the web app". The details go in where it stands. Where it stands is at most ${TEXT_WORDS} words: its state now, not what the agent did. Say what works or is fixed, not the step that got it there: never committed, pushed, rebuilt, restarted or tests passing. Never write a time, a date, or a word such as today, yesterday, ago or now. Code shows how long ago each subject changed.

Status is one of: working, queued, waits-on-other.
- working: being worked on now, in this session or in a session it handed the work to, or stopped until the person answers an ask. When the work stopped for another reason, it is queued, waits on something, or is done.
- queued: planned, not started.
- waits-on-other: it waits on something other than the person, such as a build, a review or another session.

Rules:
- Change a subject by its id. Write NEW only when no subject in <subjects> covers it.
- When work started and finished in this exchange, write NEW for it, then DONE with its name.
- Write SET only when where a subject stands changed. Never reword a subject that did not change.
- Write DONE when a subject is finished, and DROP when it is abandoned or no longer true, with the reason.
- When the plan for a subject reverses, or another subject takes its work, write WAS with the plan it replaces. Use DROP with INTO when the work moved into another subject.
- Write LINK for each item in <asks> that has no subject yet, naming the subject whose work waits on it. An ask that holds up no subject gets no LINK. Never write an open ask or its options into a subject: code marks the subject while the ask is open, and the inbox shows the ask.
- Write LINK for each item in <running> that has no subject yet, naming the subject whose work it does. Never write NEW for a running item, or its progress in its subject's text: code shows it under its subject while it runs and removes it when it ends. When its result comes back in the exchange, change its subject with SET or DONE if the result changed where the subject stands.
- Write ROLE coordinator when the session hands out work and reviews what comes back instead of doing the work itself. Write ROLE only when it changes.
- Write GOAL only when <goal> is empty, when the person states a new goal, or when the work moves to a different task.`;
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
function describe(item) {
  const parts = [`"${item.ask}"`];
  if (item.options.length > 0) parts.push(`options: ${item.options.join(" / ")}`);
  if (item.rec) parts.push(`recommended: ${item.rec}`);
  if (item.kind === "task") parts.push("an action for the user");
  return parts.join("; ");
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
var LINE_ANSWER = /(?:^|\n)\s*(?:[QqDd#]\s?)?(\d{1,2})\s*[.):\-–]\s*\S/g;
var INLINE_ANSWER = /\s(?:[QqDd#]\s?)?(\d{1,2})\s*[.)]\s+\S/g;
var ACCEPT_ALL = /^\s*(go|go ahead|yes|yep|yeah|sure|ok|okay|sgtm|lgtm|sounds good|do it|proceed|all good|ship it)\s*[.!]*\s*$/i;
var ACCEPT_RECS = /\b(all|both|everything|your)\b[^.\n]{0,40}\b(recommend\w*|recs?|suggest\w*|picks?|calls?)\b/i;
function answerNote(ledger, text2) {
  const lines = [];
  const batch = answerableBatch(ledger, ledger.turn);
  if (batch.length > 0) {
    const numbers = /* @__PURE__ */ new Set();
    for (const m of text2.matchAll(LINE_ANSWER)) numbers.add(Number(m[1]));
    if (/^\s*(?:[QqDd#]\s?)?\d{1,2}\s*[.):\-–]\s/.test(text2)) {
      for (const m of text2.matchAll(INLINE_ANSWER)) numbers.add(Number(m[1]));
    }
    const byNumber = batchNumbers(batch);
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const item = byNumber.get(n);
      if (item) lines.push(`- ${n} \u2192 ${describe(item)}`);
    }
    if (lines.length === 0 && (ACCEPT_ALL.test(text2) || ACCEPT_RECS.test(text2))) {
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
function itemLine(item) {
  return `- ${item.label ? `(${item.label}) ` : ""}${describe(item)} (close id: ${item.id})`;
}
function findingLine(finding) {
  return `- ${finding.kind}: ${finding.title} (close id: ${finding.id})`;
}
function overviewLines(ledger) {
  const goal = ledger.overview?.goal ?? "";
  const open2 = (ledger.overview?.subjects ?? []).filter(isOpen);
  return [
    ...goal ? [`Working on: ${goal}`] : [],
    ...open2.length > 0 ? ["Where it stands:", ...open2.map((s) => `- ${s.name}: ${s.text || "-"} (${s.status})`)] : []
  ];
}
function carryText(ledger, title) {
  const findings = ledger.findings;
  const lines = overviewLines(ledger);
  if (lines.length === 0 && ledger.items.length === 0 && findings.length === 0) return null;
  const out = [title, ...lines];
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item));
  }
  if (findings.length > 0) {
    out.push("Findings you recorded, still open:");
    for (const f of findings) out.push(findingLine(f));
  }
  if (ledger.closed.length > 0) {
    out.push("Recently closed:");
    for (const d of ledger.closed) out.push(`- "${d.ask}" \u2192 ${outcomeText(d)}`);
  }
  return out.join(NL);
}
var CLOSE_ID_RULE = "A close id is only for the close tool. Never write one in a reply.";
function inboxText(host, ledger, isOpen2) {
  const out = [
    `inbox: what waits on the user, as of your last reply. Anything not listed here is closed. ${CLOSE_ID_RULE}`
  ];
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item));
  } else {
    out.push("Nothing is waiting on the user.");
  }
  if (ledger.findings.length > 0) {
    out.push("Findings you recorded, still open:");
    for (const f of ledger.findings) out.push(findingLine(f));
  }
  out.push(isOpen2 ? `The user has ${host.surface} open beside the conversation.` : `${surfaceAtStart(host)} is closed.`);
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
function noteDialog(s, callId, questions) {
  const isNoted = (index) => callId !== null && s.dialogQuestions.some((q) => q.callId === callId && q.index === index);
  const added = questions.flatMap(
    (q, index) => isNoted(index) ? [] : [{ ...q, callId, index, turn: s.ledger.turn, itemId: null }]
  );
  if (added.length === 0) return s;
  return linkDialogs({ ...s, dialogQuestions: [...s.dialogQuestions, ...added] });
}

// ../hooks/gh.ts
var GIT_TIMEOUT_MS = 5e3;
async function branchIn(run2, folder) {
  const r = await run2(["git", "branch", "--show-current"], { cwd: folder, timeoutMs: GIT_TIMEOUT_MS });
  return r.code === 0 ? r.stdout.trim() || null : null;
}

// ../hooks/prs.ts
var PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
function prRefs(text2) {
  return [...new Set([...text2.matchAll(PR_URL)].map((m) => `${m[1]}#${m[2]}`))];
}
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
function offersUndo(c) {
  return c.how === "done" || c.how === "dismissed";
}
function isUndoable(c) {
  return offersUndo(c) && !c.isSentToAgent;
}
function withArrival(lastActions, message, pressedAt, deliveryId) {
  const isWaiting = (a) => (a.delivery?.state === "queued" || a.delivery?.state === "unconfirmed") && a.delivery.message === message;
  const waiting = Object.values(lastActions).filter(
    (a) => isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === void 0)
  );
  if (waiting.length === 0) return lastActions;
  const at = pressedAt ?? Math.min(...waiting.map((a) => a.at));
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => [
      id,
      isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === void 0 && a.at === at) ? { ...a, delivery: { state: "arrived" } } : a
    ])
  );
}
function withUnconfirmed(lastActions, message, pressedAt, deliveryId) {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, action]) => [
      id,
      action.delivery?.state === "queued" && action.delivery.message === message && (deliveryId ? action.delivery.id === deliveryId : pressedAt === void 0 || action.delivery.id === void 0 && action.at === pressedAt) ? { ...action, delivery: { ...action.delivery, state: "unconfirmed" } } : action
    ])
  );
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
    isLapsed: isLapsed(closed),
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
function shortAgo(ms) {
  const age = ago(ms);
  return age === "just now" ? "now" : age.replace(/ ago$/, "");
}
var UPDATE_FAILED = "Last update failed. Items from that reply may be missing.";
var HOLDS_UP_TEXT = "Holds up";
var OVERVIEW_FAILED = "Last Overview update failed. Changes from that reply may be missing.";
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
var LOOK_TEXT = "Last seen";
var CHILD_ROWS = 3;
var STALL_MS = 15 * 6e4;
var NEW_CLOSED_ROWS = 2;
var OPEN_ROWS = 7;
var SUBJECT_MARKS = {
  working: { mark: "\u25CF", tone: null },
  queued: { mark: "\u25CB", tone: null },
  "waits-on-other": { mark: "\u25CC", tone: null },
  done: { mark: "\u2713", tone: "done" },
  dropped: { mark: "\u2717", tone: null }
};
var HELD_MARK = { mark: "\u25C6", tone: "needsYou" };
var RUNNING_FRAMES = ["\u25CF", "\u25C9", "\u25CE", "\u25C9"];
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;
function isItemAfterItem(row, prev) {
  const isUnderSubject = row.kind === "more" || row.kind === "child" && row.branch !== null;
  return prev !== void 0 && prev.kind !== "look" && row.kind !== "look" && !isUnderSubject;
}
function idleOf(c, now) {
  return c.lastActivityAt === null ? null : now - c.lastActivityAt;
}
function isQuiet(c, now) {
  const idle = idleOf(c, now);
  return idle !== null && idle >= STALL_MS;
}
function isChildWorking(c, now) {
  return now - (c.lastActivityAt ?? c.startedAt) < STALL_MS;
}
function childRow(c, now, branch) {
  const idle = idleOf(c, now);
  return {
    kind: "child",
    id: c.id,
    mark: "\u25CF",
    isRunning: isChildWorking(c, now),
    name: c.name,
    stall: idle !== null && isQuiet(c, now) ? `quiet ${shortAgo(idle)}` : null,
    branch
  };
}
function overviewPage(s, now) {
  const o = s.ledger.overview;
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => look === null || x.changedAt > look;
  const heldIds = new Set(s.ledger.items.flatMap((i) => o?.askSubjects[i.id] ?? []));
  const isHeld = (x) => isOpen(x) && heldIds.has(x.id);
  const waitingSince = (x) => {
    const asked = s.ledger.items.filter((i) => o?.askSubjects[i.id] === x.id).flatMap((i) => i.at ?? []);
    return asked.length > 0 ? Math.min(...asked) : x.changedAt;
  };
  const stallOf = (x) => {
    const isWaiting = isHeld(x) || isOpen(x) && x.status === "waits-on-other";
    const waited = now - waitingSince(x);
    return isWaiting && waited >= STALL_MS ? `waiting ${shortAgo(waited)}` : null;
  };
  const newClosed = subjects.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0)).slice(0, NEW_CLOSED_ROWS);
  const open2 = subjects.filter(isOpen);
  const queuedOver = Math.max(0, open2.length - OPEN_ROWS);
  const hiddenQueued = new Set(
    open2.filter((x) => x.status === "queued" && !isHeld(x)).sort((x, y) => x.changedAt - y.changedAt).slice(0, queuedOver).map((x) => x.id)
  );
  const shown = [...open2.filter((x) => !hiddenQueued.has(x.id)), ...newClosed].sort((x, y) => y.changedAt - x.changedAt);
  const folded = subjects.filter((x) => x.status === "done" && !newClosed.includes(x));
  const running = (o?.children ?? []).filter((c) => isChildRunning(c, now)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const shownIds = new Set(shown.map((x) => x.id));
  const rows = running.filter((c) => c.subjectId === null || !shownIds.has(c.subjectId)).map((c) => childRow(c, now, null));
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
      isRunning: x.status === "working" && !isHeld(x) && (s.presence.isTurnRunning || under.some((c) => isChildWorking(c, now))),
      name: x.name,
      text: isNew(x) || isOpen(x) ? x.text || null : null,
      stall: stallOf(x),
      merged: isNew(x) ? x.merged : null,
      was: isNew(x) ? x.was : null,
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
  const isEveryShownNew = firstSeen === -1;
  if (lookRow && isEveryShownNew && shown.length > 0) rows.push(lookRow);
  if (hiddenQueued.size > 0)
    rows.push({
      kind: "fold",
      id: "queued",
      mark: "\u25CB",
      tone: null,
      text: `${hiddenQueued.size} more queued`
    });
  if (folded.length > 0) {
    const isMore = newClosed.some((x) => x.status === "done");
    rows.push({
      kind: "fold",
      id: "done",
      mark: "\u2713",
      tone: "done",
      text: `${folded.length}${isMore ? " more" : ""} done`
    });
  }
  const goal = o?.goal || null;
  return {
    isEmpty: goal === null && rows.length === 0,
    goal,
    rows: rows.map((r, n) => ({ ...r, isRuledAbove: isItemAfterItem(r, rows[n - 1]) })),
    error: s.overviewFailure ? OVERVIEW_FAILED : null,
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
  const placed2 = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed2);
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
          isLapsed: false
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
        isLapsed: false
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
  const findingRows = [...placed2.findings].filter((f) => !isFixSettled(f.id)).reverse().sort(byGroup).map(
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
function linkedPrs(prs, refs) {
  return [...prs.filter((r) => !refs.includes(r)), ...refs];
}
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
var PR_DISMISSED_LABEL = "Dismissed";
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}
function isTracked(prState, linked, ref) {
  return splitLinked(prState, linked).tracked.includes(ref) || prState.branchRef === ref;
}
function keepsView(prState, linked, ref) {
  return isTracked(prState, linked, ref) || linked.includes(ref) && isLeftOut(prState, ref);
}
function dismissedAt(lastActions, ref) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" ? mark.at : null;
}
function isViewKept(prState, linked, lastActions, ref, shownSince) {
  const at = dismissedAt(lastActions, ref);
  return keepsView(prState, linked, ref) || at !== null && isShownSince(at, shownSince);
}
var DISMISSED_PR = { how: "dismissed", outcome: PR_DISMISSED_LABEL };
function drawnPrs(prState, linked, lastActions, now, settleWindowMs, placing) {
  return inPrOrder(Object.values(prState.views)).flatMap((pr) => {
    if (isTracked(prState, linked, pr.ref)) return [{ pr, state: { is: "open" } }];
    const at = dismissedAt(lastActions, pr.ref);
    if (at === null) return [];
    const state = closedRowState(DISMISSED_PR, at, now, settleWindowMs, null);
    return isSettledInPlace(state, placing) ? [{ pr, state }] : [];
  });
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
function startContext(host, s, source) {
  const carried = carryText(s.ledger, START_TITLE);
  const parts = [source === "resume" ? null : guidanceText(host), carried].filter((x) => x !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
function cleared(s) {
  return {
    ...s,
    hostTasks: [],
    ledger: EMPTY,
    turn: NO_TURN,
    told: { inbox: null, closed: [] },
    pending: [],
    presence: {
      ...s.presence,
      ledgerState: "current",
      hasDroppedReply: false,
      turnsApplied: s.presence.turnsStarted,
      isTurnRunning: false
    },
    lastActions: {},
    stop: null,
    overviewFailure: null,
    lastOverviewCallAt: null
  };
}
function notePrompt(host, s, text2, isOpen2) {
  const matched = matchSent(s, text2);
  return { ...recordPrompt(host, startTurn(matched.state), text2, isOpen2, matched.sentBy), sentBy: matched.sentBy };
}
function matchSent(s, text2) {
  const matchingAt = s.sent.findIndex((x) => x.text === text2);
  const matching = matchingAt >= 0 ? s.sent[matchingAt] : void 0;
  const isMatchable = matching !== void 0 && (matching.phase === void 0 || matching.phase === "accepted" || matching.phase === "attempting" && matching.deliveryId !== null);
  const sentAt = isMatchable ? matchingAt : -1;
  const sent = sentAt >= 0 ? s.sent[sentAt] : void 0;
  const eligible = sent?.deliveryId === null ? Object.fromEntries(
    Object.entries(s.lastActions).filter(
      ([_id, last]) => (last.delivery?.state === "queued" || last.delivery?.state === "unconfirmed") && last.delivery.id === void 0
    )
  ) : s.lastActions;
  const arrived = sent && sent.row !== null ? {
    ...s.lastActions,
    ...sent.deliveryId === null ? withUnconfirmed(eligible, text2) : withArrival(eligible, text2, sent.pressedAt ?? void 0, sent.deliveryId)
  } : s.lastActions;
  const lastActions = s.sent.slice(matchingAt + 1).reduce(
    (actions, later) => later.text === text2 && later.row !== null ? withUnconfirmed(actions, text2, later.pressedAt ?? void 0, later.deliveryId) : actions,
    arrived
  );
  return {
    state: { ...s, lastActions, sent: sent ? s.sent.filter((_x, i) => i !== sentAt) : s.sent },
    sentBy: sent ? { press: sent.press } : null
  };
}
function turnStarted(s, at) {
  const startedAt = s.presence.isTurnRunning ? s.presence.turnStartedAt ?? at : at;
  return { ...s, presence: { ...s.presence, isTurnRunning: true, turnStartedAt: startedAt } };
}
function turnEnded(s, at) {
  const lastReplyAt = at ?? s.presence.lastReplyAt;
  return { ...s, presence: { ...s.presence, isTurnRunning: false, turnStartedAt: null, lastReplyAt } };
}
function messageTyped(s, at) {
  return { ...s, presence: { ...s.presence, lastTypedMessageAt: at } };
}
function placed(s, folder, branch) {
  const place = { folder: s.place?.folder || folder, branch: branch === "HEAD" ? null : branch };
  const isSame = s.place?.folder === place.folder && s.place.branch === place.branch;
  return isSame ? s : { ...s, place };
}
function startTurn(s) {
  return { ...s, presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 }, stop: null };
}
function recordPrompt(host, s, text2, isOpen2, sentBy) {
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 };
  const r = promptNotes(host, ledger, { text: text2, isPress: sentBy !== null, isOpen: isOpen2 }, s.told);
  const person = s.turn.person === null ? text2 : `${s.turn.person}

${text2}`;
  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      turn: { ...s.turn, person, trigger: null, press: sentBy?.press ?? s.turn.press }
    },
    notes: r.notes
  };
}
function noteActivity(s, line) {
  const activity = addActivity(s.turn.activity, line);
  if (activity === s.turn.activity) return s;
  return { ...s, turn: { ...s.turn, activity } };
}
var LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[\w.-]+\.localhost)(?::\d+)?[^\s"'`)\]]*/g;
var PR_CREATE = /\bgh\s+pr\s+create\b/;
function commandFindings(command, output) {
  return {
    lines: [...new Set(output.match(LOCAL_URL) ?? [])].map((url) => `URL in output: ${url}`),
    prRefs: PR_CREATE.test(command) ? prRefs(output) : []
  };
}
function withNewPrRefs(ledger, refs) {
  const fresh = refs.filter((ref) => !ledger.prs.includes(ref));
  return fresh.length === 0 ? ledger : { ...ledger, prs: linkedPrs(ledger.prs, fresh) };
}
function noteCommandOutput(s, command, output) {
  const found = commandFindings(command, output);
  const noted = found.lines.reduce((x, line) => noteActivity(x, line), s);
  const ledger = withNewPrRefs(noted.ledger, found.prRefs);
  return ledger === noted.ledger ? noted : { ...noted, ledger };
}
function endTurn(host, s, reply, isOpen2, { tab = null, queuesEmptyReply = false } = {}) {
  const refs = prRefs(reply);
  const base = {
    ...s,
    ledger: refs.length > 0 ? { ...s.ledger, prs: linkedPrs(s.ledger.prs, refs) } : s.ledger,
    turn: NO_TURN
  };
  if (reply.trim() === "" && !queuesEmptyReply) return base;
  const ex = {
    person: s.turn.person,
    trigger: s.turn.person === null ? s.turn.trigger ?? "unknown" : null,
    activity: s.turn.activity,
    reply,
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(host, isOpen2, tab),
    tasks: s.hostTasks
  };
  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] };
}
var OVERVIEW_REFRESH_MS = 10 * 6e4;
function claimedOverviewRefresh(s, now) {
  const { isTurnRunning, turnStartedAt } = s.presence;
  const times = [s.lastOverviewCallAt, turnStartedAt].filter((t) => t !== null);
  const isDue = isTurnRunning && times.length > 0 && now - Math.max(...times) >= OVERVIEW_REFRESH_MS;
  return isDue ? { ...s, lastOverviewCallAt: now } : s;
}
function needsUpdate(s) {
  return s.pending.length > 0 || s.presence.ledgerState !== "current";
}
function overviewChanged(s, change) {
  const overview = change(s.ledger.overview);
  return overview === s.ledger.overview ? s : { ...s, ledger: { ...s.ledger, overview } };
}
function hasLedger(s) {
  return !isBlankLedger(s.ledger);
}
function forkedFrom(child, parent) {
  if (!isBlankLedger(child.ledger)) return child;
  return { ...child, ledger: parent.ledger, hostTasks: parent.hostTasks };
}
function isUnseen(s) {
  const { ledger } = s;
  return s.presence.turnsStarted === 0 && s.presence.ledgerState === "current" && s.pending.length === 0 && isBlankLedger(ledger);
}
function pruned(s) {
  const inPlace = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map((c) => ({ id: c.id, at: closedAt(c) }))
  ].flatMap((x) => isShownSince(x.at, s.shownSince) ? [x.id] : []);
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(
      ([ref]) => isViewKept(s.prViews, s.ledger.prs, s.lastActions, ref, s.shownSince)
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
    overviewPage: overviewPage(s, now)
  };
}
function prTabOf(s, lastActions, now, shownSince, settleWindowMs) {
  const drawn = drawnPrs(s.prViews, s.ledger.prs, lastActions, now, settleWindowMs, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt
  });
  const isSent = threadSentIn(lastActions);
  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => d.state.is === "open" && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger.prs),
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
    version: 1,
    sessionId,
    root: "",
    transcriptPath: null,
    home: homedir(),
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
  return join(dir, "sessions", sessionFile(sessionId));
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
var sleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
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
  if (target !== owner && target !== join(owner, LOCK_CHILD)) return false;
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
    if (await removeOwnedLock(path, target, owner, join(dirname(path), entry))) return true;
  }
  return false;
}
async function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
  path = resolve(path);
  await mkdir(dirname(path), { recursive: true });
  path = join(await realpath(dirname(path)), basename(path));
  const identity = processIdentity(process.pid);
  const owner = `${path}.owner-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ""}`;
  const target = join(owner, LOCK_CHILD);
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
  recordTool: "mcp__inbox__record",
  closeTool: "mcp__inbox__close",
  intro: "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation."
};

// src/core.ts
var TAB_OPEN_MS = 15e3;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
}
function notePrompt2(s, text2, now) {
  return notePrompt(CODEX, s, text2, isTabOpen(s, now));
}
function activityOf(tool, input) {
  return toolActivity(tool, input);
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}
function endTurn2(s, reply, now) {
  return endTurn(CODEX, s, reply, isTabOpen(s, now), { tab: screenTabOf(s.shownTab) });
}
var MAX_PROMPT_TURNS = 10;
function noteHook(s, hook, now, turnId) {
  const h = s.heard;
  const heard = hook === "start" ? { ...h, startAt: now } : hook === "prompt" ? {
    ...h,
    promptAt: now,
    prompts: h.prompts + 1,
    promptTurns: turnId ? [...h.promptTurns.filter((t) => t !== turnId), turnId].slice(-MAX_PROMPT_TURNS) : h.promptTurns
  } : { ...h, stopAt: now, stops: h.stops + 1 };
  return { ...s, heard };
}
function isPromptMissed(h, turnId) {
  if (turnId !== null && (h.promptTurns.length > 0 || h.promptAt === null)) return !h.promptTurns.includes(turnId);
  return h.promptAt === null || h.stopAt !== null && h.promptAt < h.stopAt;
}
function isTurnHeard(s, turnId) {
  return turnId === s.coveredTurn || !isPromptMissed(s.heard, turnId);
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

// ../hooks/children.ts
var ACTIVITY_SAVE_MS = 3e4;
var NAME_CHARS = 80;
function childStarted(o, { ref, kind, name }, at, { reportsActivity = true } = {}) {
  const line = name.trim().split("\n")[0] ?? "";
  const lastActivityAt = reportsActivity ? at : null;
  return withChild(
    o,
    { ref, kind, name: clipLabel(line, NAME_CHARS), startedAt: at, endedAt: null, lastActivityAt },
    at
  );
}
function childWorked(o, ref, at) {
  const saved = o?.children.find((c) => c.ref === ref)?.lastActivityAt ?? null;
  const isSavedRecently = saved !== null && at - saved < ACTIVITY_SAVE_MS;
  return isSavedRecently ? o : childActive(o, ref, at);
}
function childrenEnded(o, isEnded, at) {
  const isEnding = (c) => c.endedAt === null && isEnded(c);
  if (!o?.children.some(isEnding)) return o;
  return { ...o, children: o.children.map((c) => isEnding(c) ? { ...c, endedAt: at } : c) };
}
var HERDR = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g;
function delegateSteps(command) {
  return [...command.matchAll(HERDR)].map(([, verb, name, args]) => ({
    name,
    isWaitForEnd: verb === "wait" && !/--until working/.test(args ?? "")
  }));
}
var delegateRef = (name) => `herdr:${name}`;
function delegateRunning(o, name, at) {
  const ref = delegateRef(name);
  const known = o?.children.find((c) => c.ref === ref);
  const isRunning = known !== void 0 && known.endedAt === null;
  return isRunning ? childActive(o, ref, at) : childStarted(o, { ref, kind: "delegate", name }, at);
}
function delegatesStarted(o, command, at) {
  return delegateSteps(command).reduce((x, step) => delegateRunning(x, step.name, at), o);
}
function delegateWaitsEnded(o, command, at) {
  return delegateSteps(command).filter((step) => step.isWaitForEnd).reduce((x, step) => childEnded(x, delegateRef(step.name), at), o);
}
var HERDR_PROMPT_SETTLE_MS = 15e3;
function hasRunningDelegate(o) {
  return o?.children.some((c) => c.kind === "delegate" && c.endedAt === null) ?? false;
}
function delegatesSettled(o, running, at) {
  const refs = new Set([...running].map(delegateRef));
  const isGone = (c) => c.kind === "delegate" && !refs.has(c.ref) && at - (c.lastActivityAt ?? c.startedAt) >= HERDR_PROMPT_SETTLE_MS;
  return childrenEnded(o, isGone, at);
}
function childrenCutOff(o, at) {
  return childrenEnded(o, (c) => c.kind !== "delegate", at);
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
var HERDR_AGENT_LIST = ["herdr", "agent", "list"];
var HERDR_RUNNING = /* @__PURE__ */ new Set(["working", "unknown"]);
async function delegatesInHerdr(o, run2) {
  if (!hasRunningDelegate(o)) return null;
  const r = await run2(HERDR_AGENT_LIST, { cwd: "/", timeoutMs: HERDR_TIMEOUT_MS });
  return r.code === 0 ? herdrRunning(r.stdout) : null;
}
function herdrRunning(stdout) {
  try {
    const agents = JSON.parse(stdout)?.result?.agents;
    if (!Array.isArray(agents)) return null;
    return new Set(
      agents.filter((a) => typeof a?.name === "string" && HERDR_RUNNING.has(a?.agent_status)).map((a) => a.name)
    );
  } catch {
    return null;
  }
}
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

// src/hook.ts
import { resolve as resolve3 } from "node:path";

// src/cli.ts
function namedCli(env) {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null;
}

// src/dialogs.ts
function noteDialogs(s, dialogs) {
  return dialogs.reduce((x, d) => d.callId === null ? x : noteDialog(x, d.callId, d.questions), s);
}

// src/history.ts
async function withForkedLedger(s, { dir, reads }) {
  const parentId = await reads.forkedFromId();
  const parent = parentId === null ? null : await readState(dir, parentId).catch(() => null);
  return parent !== null && hasLedger(parent) ? forkedFrom(s, parent) : s;
}
function newestEndedTurn(rows, currentTurnId) {
  return rows?.findLast((t) => t.hasEnded && t.id !== currentTurnId)?.id ?? null;
}
var holdsEndedTurn = (currentTurnId) => (rows) => newestEndedTurn(rows, currentTurnId) !== null;
async function withEarlierHistory(s, history) {
  if (heardState(s.heard) !== "none") return { state: s, isBehind: false };
  const forked = await withForkedLedger(s, history);
  const { reads, cwd, currentTurnId, canMarkBehind = true } = history;
  if (!canMarkBehind) return { state: forked, isBehind: false };
  const rollout = isUnseen(forked) ? await reads.rollout(cwd, currentTurnId) : null;
  const coveredTurn = newestEndedTurn(await reads.turns(holdsEndedTurn(currentTurnId)), currentTurnId);
  const covered = coveredTurn === forked.coveredTurn ? forked : { ...forked, coveredTurn };
  if ((rollout?.earlierTurns ?? 0) === 0) return { state: covered, isBehind: false };
  return { state: { ...covered, presence: { ...covered.presence, ledgerState: "behind" } }, isBehind: true };
}
async function withMissedTurns(s, { reads, currentTurnId, canMarkBehind = true, isCleared = false }) {
  const unchanged = { state: s, isBehind: false };
  const isTurnChecked = currentTurnId !== void 0 && isTurnHeard(s, currentTurnId);
  if (!canMarkBehind || isTurnChecked) return unchanged;
  const rows = await reads.turns(
    isCleared ? holdsEndedTurn(currentTurnId) : (turns) => turns.some((t) => t.id === s.coveredTurn)
  );
  if (rows === null) return unchanged;
  if (isCleared) return { state: { ...s, coveredTurn: newestEndedTurn(rows, currentTurnId) }, isBehind: false };
  const coveredAt = rows.findLastIndex((t) => t.id === s.coveredTurn);
  const missed = rows.slice(coveredAt + 1).filter((t) => t.hasEnded && t.id !== currentTurnId);
  const newest = missed.at(-1);
  if (newest === void 0) return unchanged;
  const promptTurn = s.heard.promptTurns.at(-1);
  const isRecordedTurnMissed = s.turn.person !== null && missed.some((t) => t.id === promptTurn);
  const { ledgerState } = s.presence;
  return {
    state: {
      ...s,
      coveredTurn: newest.id,
      turn: isRecordedTurnMissed ? NO_TURN : s.turn,
      presence: { ...s.presence, ledgerState: ledgerState === "current" ? "behind" : ledgerState }
    },
    isBehind: true
  };
}

// src/transcript.ts
import { open, readdir as readdir2 } from "node:fs/promises";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";

// ../hooks/conversation.ts
var NL2 = "\n";
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
  return kept.reverse().join(NL2);
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
async function rolloutMeta(path) {
  if (path === null) return { isNonInteractive: true, folder: null };
  const meta = await readSessionMeta(path);
  const cwd = meta?.payload?.cwd;
  return { isNonInteractive: isExecMeta(meta), folder: typeof cwd === "string" && cwd !== "" ? cwd : null };
}
function isExecMeta(meta) {
  return meta?.payload?.originator === "codex_exec" || meta?.payload?.source === "exec";
}
async function forkedFromId(path) {
  const id = (await readSessionMeta(path))?.payload?.forked_from_id;
  return typeof id === "string" && id !== "" ? id : null;
}
async function namesIn(dir, pattern) {
  const names = await readdir2(dir).catch(() => []);
  return names.filter((n) => pattern.test(n)).sort().reverse();
}
async function newestRollout(sessions, isWanted) {
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join2(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join2(sessions, year, month), /^\d{2}$/)) {
        const folder = join2(sessions, year, month, day);
        const [name] = (await namesIn(folder, /^rollout-.+\.jsonl$/)).filter(isWanted);
        if (name !== void 0) return join2(folder, name);
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
var PLAN_TOOL = "update_plan";
var MARKERS = ['"task_started"', DIALOG_TOOL, '"CommandExecution"', '"function_call', '"local_shell_call'];
var isText = (v) => typeof v === "string";
function commandText(command) {
  if (isText(command)) return command;
  if (!Array.isArray(command)) return "";
  const argv = command.filter(isText);
  const [, flag, script] = argv;
  return argv.length === 3 && flag?.startsWith("-") && flag.endsWith("c") && script !== void 0 ? script : argv.join(" ");
}
function outputText(output) {
  if (!isText(output)) return "";
  try {
    const parsed = JSON.parse(output);
    return isText(parsed.output) ? parsed.output : output;
  } catch {
    return output;
  }
}
function callCommand(p) {
  if (p.type === "local_shell_call") return commandText(p.action?.command);
  if (p.type !== "function_call" || !p.name || !SHELL_CALLS.has(p.name) || !isText(p.arguments)) return "";
  try {
    const args = JSON.parse(p.arguments);
    return commandText(args.command ?? args.cmd);
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
  const kind = row.type === "event_msg" ? TURN_EVENT_KINDS.get(textOf2(p.type)) : void 0;
  return kind === void 0 ? null : { id: textOf2(p.turn_id) || textOf2(record(p.turn_attribution).turn_id), kind };
}
function turnEventOf(line) {
  if (!line.includes('"task_') && !line.includes('"turn_aborted"')) return null;
  try {
    return turnEventOfRow(record(JSON.parse(line)));
  } catch {
    return null;
  }
}
async function tailLines(path, bytes) {
  return (await linesBefore(path, bytes)).lines;
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
async function rolloutTail(path) {
  return path === null ? [] : tailLines(path, TAIL_BYTES).catch(() => []);
}
function turnOf(lines, turnId) {
  const none = { dialogs: [], commands: [], plan: null };
  try {
    const byTurn = /* @__PURE__ */ new Map();
    const newTurn = () => ({ dialogs: [], executions: [], calls: /* @__PURE__ */ new Map(), called: [], plan: null });
    let current = "";
    let newest = "";
    for (const line of lines) {
      if (!MARKERS.some((m) => line.includes(m))) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const p = row.payload;
      if (!p) continue;
      if (row.type === "event_msg" && p.type === "task_started" && p.turn_id) {
        current = p.turn_id;
        newest = current;
        if (!byTurn.has(current)) byTurn.set(current, newTurn());
        continue;
      }
      const turn2 = byTurn.get(current) ?? newTurn();
      byTurn.set(current, turn2);
      if (row.type === "event_msg" && p.type === "item_completed" && p.item?.type === "CommandExecution") {
        const output = p.item.aggregated_output;
        turn2.executions.push({ command: commandText(p.item.command), output: isText(output) ? output : "" });
      } else if (row.type === "response_item" && p.type === "function_call" && p.name === PLAN_TOOL) {
        turn2.plan = codexPlanOf(p.arguments) ?? turn2.plan;
      } else if (row.type === "response_item" && p.type === "function_call" && p.name === DIALOG_TOOL) {
        let args;
        try {
          args = JSON.parse(isText(p.arguments) ? p.arguments : "");
        } catch {
          continue;
        }
        turn2.dialogs.push({ callId: p.call_id ?? null, questions: dialogQuestions(args.questions) });
      } else if (row.type === "response_item" && (p.type === "function_call" || p.type === "local_shell_call")) {
        const command = callCommand(p);
        if (command !== "" && p.call_id) turn2.calls.set(p.call_id, { command, output: "" });
      } else if (row.type === "response_item" && p.type === "function_call_output" && p.call_id) {
        const call = turn2.calls.get(p.call_id);
        if (call) turn2.called.push({ command: call.command, output: outputText(p.output) });
      }
    }
    const wanted = newest === "" ? "" : turnId ?? newest;
    const turn = byTurn.get(wanted);
    if (!turn) return none;
    return {
      dialogs: turn.dialogs.filter((d) => d.questions.length > 0),
      commands: turn.executions.length > 0 ? turn.executions : turn.called,
      plan: turn.plan
    };
  } catch {
    return none;
  }
}
var ROLLOUT_BYTES = 8 * 1024 * 1024;
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var textOf2 = (v) => isText(v) ? v : "";
var contentText = (content) => (Array.isArray(content) ? content : []).map((part) => textOf2(record(part).text)).filter(Boolean).join("\n").trim();
var jsonRecord = (raw) => {
  try {
    return record(JSON.parse(textOf2(raw)));
  } catch {
    return {};
  }
};
var literalValue = (literal) => {
  if (literal === void 0) return null;
  try {
    return textOf2(JSON.parse(literal));
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
  const name = textOf2(p.name);
  if (p.type === "local_shell_call") return hasCommandRows ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf2(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = literalValue(COMMAND_ARGUMENT.exec(input)?.[1]);
    return [...patch ? editLines(patch, cwd) : [], ...command && !hasCommandRows ? shellLines(command) : []];
  }
  if (p.type !== "function_call") return [];
  if (SHELL_CALLS.has(name)) return hasCommandRows ? [] : shellLines(callCommand(p));
  const args = jsonRecord(p.arguments);
  if (name === "apply_patch") return editLines(textOf2(args.input ?? args.patch ?? args.command), cwd);
  if (name === "spawn_agent") {
    const line2 = activityOf("Agent", { description: textOf2(args.task_name) });
    return line2 ? [line2] : [];
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: "open" })];
  const line = activityOf(textOf2(p.namespace).startsWith("mcp__") ? textOf2(p.namespace) + name : name, {});
  return line ? [line] : [];
}
var isItem = (row, ...kinds) => row.type === "event_msg" && record(row.payload).type === "item_completed" && kinds.includes(textOf2(record(record(row.payload).item).type));
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
    else if (isItem(row, "CommandExecution")) act(shellLines(commandText(item.command)));
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
function turnRowsOf(lines, isWindow) {
  const rows = [];
  for (const line of lines) {
    const event = turnEventOf(line);
    if (event === null || isWindow && rows.length === 0 && event.kind !== "started") continue;
    if (event.kind === "started") {
      rows.push({ id: event.id, hasEnded: false });
      continue;
    }
    const started = rows.findLast((t) => t.id === event.id) ?? (event.id === "" ? rows.at(-1) : void 0);
    if (started) started.hasEnded = true;
    else rows.push({ id: event.id, hasEnded: true });
  }
  return rows;
}
var TURN_WINDOW_BYTES = [TURN_ROW_BYTES, 512 * 1024, TAIL_BYTES];
function rolloutReads(path, tail) {
  let history = null;
  let read = null;
  const rollouts = /* @__PURE__ */ new Map();
  let forkedFrom2 = null;
  const wholeHistory = () => history ??= historyLines(path, ROLLOUT_BYTES);
  async function windowTurns(isEnough) {
    if (tail !== void 0) {
      const turns = turnRowsOf(tail, true);
      return isEnough(turns) ? turns : null;
    }
    for (const bytes of TURN_WINDOW_BYTES) {
      const { lines, start } = await linesBefore(path, bytes);
      const turns = turnRowsOf(lines, true);
      if (isEnough(turns)) return turns;
      if (start === 0) break;
    }
    return null;
  }
  return {
    async turns(isEnough) {
      try {
        if (read === null || !(read.isWhole || isEnough(read.turns))) {
          const window = history === null ? await windowTurns(isEnough) : null;
          read = window === null ? { turns: turnRowsOf(await wholeHistory(), false), isWhole: true } : { turns: window, isWhole: false };
        }
        return read.turns;
      } catch {
        return null;
      }
    },
    rollout(cwd, currentTurnId) {
      const key = JSON.stringify([cwd, currentTurnId ?? null]);
      const known = rollouts.get(key);
      if (known !== void 0) return known;
      const rollout = wholeHistory().then((lines) => rolloutOfLines(lines, cwd, currentTurnId)).catch(() => null);
      rollouts.set(key, rollout);
      return rollout;
    },
    forkedFromId() {
      return forkedFrom2 ??= forkedFromId(path);
    }
  };
}
function rolloutOfLines(lines, cwd, currentTurnId) {
  const turns = rolloutTurns(lines, cwd);
  const earlier = turns.filter((t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person")));
  return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
}

// src/hook.ts
async function handleHook(input, deps) {
  const id = input.session_id;
  const { dir, env, now } = deps;
  if (!id) return null;
  const meta = await rolloutMeta(input.transcript_path);
  if (!env.INBOX_IN_EXEC && meta.isNonInteractive) return null;
  const { update: write, read } = codexStore(dir, id, now, deps.onWrite);
  const cliPath = namedCli(env);
  const withCli = (s) => cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s;
  const rolloutPath = input.agent_id ? null : input.transcript_path;
  const withRollout = (s) => rolloutPath !== null && s.transcriptPath !== rolloutPath ? { ...s, transcriptPath: rolloutPath } : s;
  const withHost = (s) => withRollout(withCli(s));
  let isMarkedBehind = false;
  const readHistoryAhead = async (readBefore, tail) => {
    if (rolloutPath === null) return async (s) => s;
    const reads = rolloutReads(rolloutPath, tail);
    const check = (s) => {
      const history = {
        dir,
        reads,
        cwd: input.cwd ?? s.root,
        currentTurnId: input.turn_id,
        canMarkBehind: input.source !== "compact",
        isCleared: input.source === "clear"
      };
      return heardState(s.heard) === "none" ? withEarlierHistory(s, history) : withMissedTurns(s, history);
    };
    await check(await readBefore());
    return async (s) => {
      const r = await check(s);
      isMarkedBehind = r.isBehind;
      return r.state;
    };
  };
  const withCoveredTurn = (s) => rolloutPath !== null && input.turn_id ? { ...s, coveredTurn: input.turn_id } : s;
  switch (input.hook_event_name) {
    case "SessionStart": {
      const root = input.cwd ?? "";
      const endsTurn = (s2) => input.source === "compact" ? s2 : overviewChanged(turnEnded(s2, null), (o) => childrenCutOff(o, now()));
      const folder = rolloutPath === null ? null : meta.folder;
      const [branch, withHistory] = await Promise.all([
        folder === null ? null : branchIn(deps.run, folder),
        readHistoryAhead(read)
      ]);
      const withPlace = (s2) => folder === null ? s2 : placed(s2, folder, branch);
      const s = await write(
        async (s2) => noteHook(
          withHost(await withHistory(endsTurn(withPlace({ ...input.source === "clear" ? cleared(s2) : s2, root })))),
          "start",
          now()
        )
      );
      if (isMarkedBehind) deps.startUpdate(id);
      const context = startContext(CODEX, s, input.source);
      return context ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } } : null;
    }
    case "UserPromptSubmit": {
      let notes = [];
      const withHistory = await readHistoryAhead(read);
      await write(async (s) => {
        const r = notePrompt2(withHost(await withHistory(s)), input.prompt ?? "", now());
        notes = r.notes;
        if (input.agent_id) return r.state;
        const started = noteHook(turnStarted(r.state, now()), "prompt", now(), input.turn_id);
        const isTyped = r.sentBy === null;
        return isTyped ? messageTyped(started, now()) : started;
      });
      if (isMarkedBehind) deps.startUpdate(id);
      return notes.length === 0 ? null : { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: notes.join("\n\n") } };
    }
    case "PreToolUse": {
      const tool = input.tool_name ?? "";
      const toolInput = input.tool_input ?? {};
      const command = typeof toolInput.command === "string" ? toolInput.command : "";
      if (tool === "apply_patch") {
        const files = patchFiles(command).map((f) => resolve3(input.cwd || "/", f));
        await write((s) => files.reduce((x, f) => noteActivity(x, `edited ${f}`), withRollout(s)));
        return null;
      }
      const line = activityOf(tool, toolInput);
      const agentId = input.agent_id;
      const isDelegateCommand = agentId === void 0 && delegateSteps(command).length > 0;
      const withWork = (s) => overviewChanged(s, (o) => agentId ? childWorked(o, agentId, now()) : delegatesStarted(o, command, now()));
      const hasWork = line !== null || agentId !== void 0 || isDelegateCommand;
      const isMainActivity = line !== null && agentId === void 0;
      let isClaimed = false;
      if (hasWork)
        await write((s) => {
          const worked = withWork(line ? noteActivity(withRollout(s), line) : withRollout(s));
          const claimed = isMainActivity ? claimedOverviewRefresh(worked, now()) : worked;
          isClaimed = claimed !== worked;
          return claimed;
        });
      if (isClaimed) deps.startOverviewRefresh(id);
      return null;
    }
    case "SubagentStart": {
      const ref = input.agent_id;
      if (!ref) return null;
      const name = input.agent_type || "subagent";
      await write((s) => overviewChanged(s, (o) => childStarted(o, { ref, kind: "subagent", name }, now())));
      return null;
    }
    case "SubagentStop": {
      const ref = input.agent_id;
      if (ref) await write((s) => overviewChanged(s, (o) => childEnded(o, ref, now())));
      return null;
    }
    case "Stop": {
      const reply = input.last_assistant_message ?? "";
      const folder = input.cwd;
      const before = read();
      const [tail, branch, inHerdr] = await Promise.all([
        rolloutTail(input.transcript_path),
        folder ? branchIn(deps.run, folder) : null,
        before.then(
          (s) => delegatesInHerdr(s.ledger.overview, deps.run),
          () => null
        )
      ]);
      const { dialogs, commands, plan } = turnOf(tail, input.turn_id);
      const withHistory = await readHistoryAhead(() => before, tail);
      const lines = dialogs.map((d) => dialogActivity(d.questions, { kind: "open" }));
      const written = await write(async (s) => {
        const withLines = lines.reduce(
          (x, line) => noteActivity(x, line),
          noteDialogs(withHost(await withHistory(s)), dialogs)
        );
        const withOutput = commands.reduce((x, c) => noteCommandOutput(x, c.command, c.output), withLines);
        const waited = overviewChanged(
          withOutput,
          (o) => commands.reduce((x, c) => delegateWaitsEnded(x, c.command, now()), o)
        );
        const withDelegates = inHerdr ? overviewChanged(waited, (o) => delegatesSettled(o, inHerdr, now())) : waited;
        const withPlace = folder ? placed(withDelegates, folder, branch) : withDelegates;
        const ended = withCoveredTurn(noteHook(turnEnded(endTurn2(withPlace, reply, now()), now()), "stop", now()));
        return plan === null ? ended : { ...ended, hostTasks: plan };
      });
      if (needsUpdate(written)) deps.startUpdate(id);
      return null;
    }
  }
  return null;
}

// src/data-dir.ts
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join3(homedir2(), ".codex", "inbox-dev");
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env, input }) => new Promise((resolve4) => {
  const [file = "", ...rest] = args;
  try {
    const child = execFile(
      file,
      rest,
      { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        const code = err ? typeof err.code === "number" ? err.code : -1 : 0;
        resolve4({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
    child.stdin?.on("error", () => {
    });
    child.stdin?.end(input);
  } catch (err) {
    resolve4({ code: -1, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
  }
});

// src/hook-main.ts
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const dist = dirname3(fileURLToPath(import.meta.url));
  const dir = dataDir(process.env, dirname3(dist));
  const startUpdate = detachedUpdate(dir, process.env, join4(dist, "update.mjs"));
  const out = await handleHook(JSON.parse(raw), {
    dir,
    env: process.env,
    now: Date.now,
    startUpdate: (id) => startUpdate(id),
    startOverviewRefresh: (id) => startUpdate(id, OVERVIEW_REFRESH),
    onWrite: herdrOnWrite(process.env, run, dir, Date.now),
    run
  });
  if (out) process.stdout.write(JSON.stringify(out));
}
main().catch(() => process.exit(0));
