// Built by herdr/build.ts with Bun 1.4.4 from herdr/src and hooks/. Do not edit.
// Built at 2026-11-14T17:40:45.838Z. 205417 characters follow.

// src/main.ts
import { View, div as div5 } from "gpui-kit";
import { InputState, Scrollbar, v_flex as v_flex3 } from "gpui-base";
import {
  appHome,
  exec,
  focused,
  hc,
  home,
  panes,
  props,
  readTextFile,
  run,
  terminals,
  theme,
  watchFolder,
  writeTextFile
} from "herdr";

// ../hooks/press-labels.ts
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
var ISSUE_LABEL = "File issue";

// ../hooks/banners.ts
function groupEmptyText(title) {
  return `No open ${title.toLowerCase()}`;
}
var BANNER_TONES = {
  demo: "notice",
  "update-failed": "warning",
  "tools-refused": "error",
  "read-failed": "error",
  stopped: "error",
  "gh-missing": "warning",
  "gh-signed-out": "warning",
  "gh-limited": "warning",
  "gh-failed": "warning",
  "press-note": "notice",
  "press-failed": "error",
  "hooks-trust": "error",
  "server-gone": "error",
  "server-load-failed": "error",
  "server-builds-differ": "warning",
  "tab-update-failed": "warning",
  "herdr-mod-failed": "warning",
  "herdr-mod-ask": "ask"
};
function bannerOf(kind, text) {
  const end = text.indexOf(". ");
  const lead = end < 0 ? text : text.slice(0, end + 1);
  const body = end < 0 ? null : text.slice(end + 2);
  return { kind, tone: BANNER_TONES[kind], lead, body };
}
function tabBarBanners(host, statusError, pressNote) {
  return [
    ...host,
    ...statusError ? [bannerOf("update-failed", statusError)] : [],
    ...pressNote ? [bannerOf(pressNote.isError ? "press-failed" : "press-note", pressNote.text)] : []
  ];
}
var READING_TEXT = "Reading the inbox…";
var NEXT_BUILD_MARK = ".next-build";
var MAYBE_STALE_TEXT = "May be out of date";
function emptyText(tab, agent, isStale = false) {
  const text = tab === "needsYou" ? { title: "Nothing needed", hint: `${agent}'s questions and the tasks only you can do show up here.` } : { title: "No findings yet", hint: `${agent} flags issues and opportunities it spots beyond your task.` };
  return isStale ? { ...text, title: MAYBE_STALE_TEXT } : text;
}

// ../hooks/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\uD83E\uDDED" },
  { id: "needsYou", label: "Asks", symbol: "\uD83D\uDE4B" },
  { id: "findings", label: "Finds", symbol: "\uD83D\uDD0D" },
  { id: "prs", label: "PRs", symbol: "\uD83D\uDD00" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var NEXT_BUILD_TABS = numbered(TAB_NAMES);
var RELEASE_TABS = numbered(TAB_NAMES.filter((t) => t.id !== "overview"));
function shownTabs(isNextBuild) {
  return isNextBuild ? NEXT_BUILD_TABS : RELEASE_TABS;
}
function tabBadge(id, counts) {
  return isRowTab(id) && counts[id] > 0 ? String(counts[id]) : null;
}
function isListedTab(tab) {
  return tab === "needsYou" || tab === "findings";
}
function isRowTab(tab) {
  return tab !== "overview";
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));
var LISTED_TABS = TAB_NAMES.filter((t) => isListedTab(t.id));

// ../hooks/band.ts
function isMaybeStale(view, isReadFailed = false) {
  return isReadFailed || view.status.error !== null || view.status.isRetrying;
}

// ../hooks/status-limits.ts
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var GOAL_LEFT_MS = 30 * 60000;
var REMOVED_KEPT = 10;
var IDLE_AFTER_MS = 24 * 60 * 60000;
var CHILD_KEPT_MS = 24 * 60 * 60000;
var STOP_WORDS = new Set([
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
var EMPTY_SESSION_STATUS = {
  head: null,
  subjects: [],
  children: [],
  askSubjects: {},
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  missedInLastLook: {},
  look: null,
  goal: null,
  removedGoals: [],
  goalRemoved: null,
  milestones: [],
  nextMilestoneId: 1,
  serves: {},
  goalRefused: null
};
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
function clipWords(text, limit) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? words.join(" ") : `${words.slice(0, limit).join(" ")}…`;
}
function words(text) {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? [];
  return new Set(matches.map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w !== "" && !STOP_WORDS.has(w)));
}
var NUMBER_KINDS = new Set(["pr", "prs", "pull", "request", "issue", "issues", "ticket", "gh"]);
var VERSION = /^v?\d+(\.\d+)+$/;
function namesOtherVersion(name, other) {
  const versions = (text) => [...words(text)].filter((w) => VERSION.test(w)).map((w) => w.replace(/^v/, ""));
  const mine = versions(name);
  const theirs = new Set(versions(other));
  return mine.length > 0 && theirs.size > 0 && !mine.some((v) => theirs.has(v));
}
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
var SUFFIXES = ["ing", "ed", "es", "s"];
function stem(word) {
  if (/\d/.test(word))
    return word;
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 3) ?? "";
  const cut = word.slice(0, word.length - suffix.length);
  const base = cut.length > 3 && cut.endsWith("e") ? cut.slice(0, -1) : cut;
  return base.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}

// ../hooks/text.ts
function clipLabel(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
var PHRASE_END = /[,;](?=\s)|\s(?=and\s)/g;
function cutAtPhrase(text, fits) {
  if (fits(text))
    return text;
  const heads = [...text.matchAll(PHRASE_END)].map((m) => `${text.slice(0, m.index).replace(/[\s.,;:]+$/, "")}…`);
  return heads.findLast(fits) ?? heads[0] ?? text;
}
var segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
var LEADING_JAMO = String.raw`[\u1100-\u115F\uA960-\uA97C]`;
var VOWEL_JAMO = String.raw`[\u1160-\u11A7\uD7B0-\uD7C6]`;
var TRAILING_JAMO = String.raw`[\u11A8-\u11FF\uD7CB-\uD7FB]`;
var SYLLABLE = String.raw`[\uAC00-\uD7A3]`;
var OPEN_SYLLABLE = `[${Array.from({ length: 19 * 21 }, (_, i) => String.fromCharCode(44032 + i * 28)).join("")}]`;
var HANGUL = `(?:${LEADING_JAMO}*(?:${VOWEL_JAMO}+|${OPEN_SYLLABLE}${VOWEL_JAMO}*|${SYLLABLE})${TRAILING_JAMO}*|${LEADING_JAMO}+|${TRAILING_JAMO}+)`;
var FLAG = String.raw`[\u{1F1E6}-\u{1F1FF}]{2}`;
var EXTEND = String.raw`\p{M}\p{Emoji_Modifier}\u{E0020}-\u{E007F}‌ﾞﾟำຳ`;
var GRAPHEME = new RegExp(String.raw`[${EXTEND}\u200D]+|(?:${FLAG}|${HANGUL}|[^${EXTEND}\u200D])(?:[${EXTEND}]|\u200D[^${EXTEND}\u200D]?)*`, "gu");
function graphemesOf(text) {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : text.match(GRAPHEME) ?? [];
}
var ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cc}\p{Cf}]+$/u;
var EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;
var WIDE = /^[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;
function cellWidth(text) {
  let cells = 0;
  for (const segment of graphemesOf(text))
    cells += graphemeCells(segment);
  return cells;
}
function graphemeCells(grapheme) {
  if (ZERO_WIDTH.test(grapheme))
    return 0;
  return EMOJI.test(grapheme) || WIDE.test(grapheme) ? 2 : 1;
}
function duration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60)
    return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48)
    return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function ago(ms) {
  return Math.round(ms / 60000) < 1 ? "just now" : `${duration(ms)} ago`;
}
function clockTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ../hooks/status-children.ts
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function subjectSeenAt(o, id) {
  return id in o.missedInLastLook ? o.missedInLastLook[id] ?? null : o.lastLookAt;
}
function isSubjectSeen(o, s) {
  const seenAt = subjectSeenAt(o, s.id);
  return seenAt !== null && s.changedAt <= seenAt;
}

// ../hooks/children.ts
var ENDED = new Set(["completed", "failed", "killed", "stopped"]);

// ../hooks/ask-match.ts
function words2(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec)
    return null;
  const named = new Set(words2(rec));
  let best = null;
  for (const option of options) {
    const w = words2(option);
    if (w.length > words2(best ?? "").length && w.every((x) => named.has(x)))
      best = option;
  }
  const label = (text) => text.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase();
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase();
  return best ?? (byLabel ? options.find((o) => label(o) === byLabel) ?? null : null);
}
var QUESTION_WORD = /^\s*(?:what|why|how|which|where|who)\b/i;
function isQuestionBack(answer, options) {
  const text = answer.trim();
  return text.endsWith("?") && (QUESTION_WORD.test(text) || recommendedOption(options, text) === null);
}
var FILLER = new Set([
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
var GENERIC = new Set([
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
var STATES = new Set(["new", "current", "existing", "old", "previous"]);
var QUESTIONS = new Set(["how", "when", "where", "why", "who", "whether"]);
var PAST = new Set(["was", "were", "did", "had"]);
var FUTURE = new Set(["will", "shall"]);
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));

// ../hooks/ledger-close.ts
function idNumber(id) {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN);
}
function inIdOrder(open, entry) {
  const at = open.findIndex((x) => idNumber(x.id) > idNumber(entry.id));
  return at < 0 ? [...open, entry] : [...open.slice(0, at), entry, ...open.slice(at)];
}
function reopenItem(ledger, id) {
  const item = ledger.closed.findLast((c) => c.id === id)?.item;
  if (!item || ledger.items.some((i) => i.id === id))
    return ledger;
  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter((c) => c.id !== id) };
}
function reopenFinding(ledger, id) {
  const record = ledger.closedFindings.findLast((f) => f.id === id);
  if (!record || ledger.findings.some((f) => f.id === id))
    return ledger;
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record;
  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter((f) => f.id !== id)
  };
}
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");
function closedState(d) {
  if (d.how === "dismissed")
    return "dismissed";
  if (d.how === "expired")
    return "lapsed";
  const isOvertaken = OVERTAKEN.test(d.outcome);
  return (d.how === "claude" || d.how === "update") && isOvertaken ? "lapsed" : "handled";
}
function closedAt(c) {
  return "closedAt" in c ? c.closedAt : c.at;
}

// ../hooks/reply-parse.ts
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}

// ../hooks/ledger-update.ts
var EXPIRED = "expired, unanswered";
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

// ../hooks/status-upgrade-goal.ts
var REFUSAL_LINES = ["goal", "retire"];
var REFUSAL_WHYS = [
  "typed",
  "met",
  "work-open",
  "moved",
  "no-work",
  "restates",
  "few-milestones"
];
function goalRefusedOf(saved) {
  const r = saved;
  const line = REFUSAL_LINES.find((x) => x === r?.line);
  const why = REFUSAL_WHYS.find((x) => x === r?.why);
  return line && why ? { line, why } : null;
}
function time(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function goalOf(saved) {
  const g = saved;
  const text = nonEmpty(g?.text);
  const setAt = time(g?.setAt);
  if (typeof saved !== "object" || text === null || setAt === null)
    return null;
  const isAwaitingMilestones = g?.isAwaitingMilestones === true;
  const isTyped = g?.source === "typed" || g?.source !== "inferred" && isAwaitingMilestones;
  return {
    text,
    setAt,
    metAt: time(g?.metAt),
    was: nonEmpty(g?.was),
    isAwaitingMilestones,
    source: isTyped ? "typed" : "inferred"
  };
}
function milestoneOf(saved) {
  const m = saved;
  const status = STATUSES.find((x) => x === m?.status);
  const changedAt = time(m?.changedAt);
  if (!m || typeof m.id !== "string" || typeof m.name !== "string" || !status || changedAt === null)
    return null;
  return {
    id: m.id,
    name: m.name,
    status,
    text: typeof m.text === "string" ? m.text : "",
    was: nonEmpty(m.was),
    changedAt,
    closedAt: time(m.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null)
  };
}
function milestonesOf(saved) {
  return (Array.isArray(saved) ? saved : []).map(milestoneOf).filter((m) => m !== null);
}
var isStringRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function goalRemovedOf(saved) {
  const r = saved;
  const goal = goalOf(r?.goal);
  if (goal === null || !isStringRecord(r?.serves) || !isStringRecord(r?.askSubjects))
    return null;
  const serves = Object.entries(r.serves).filter((e) => typeof e[1] === "string");
  const asks = Object.entries(r.askSubjects).filter((e) => Array.isArray(e[1]) && e[1].every((x) => typeof x === "string"));
  return {
    goal,
    milestones: milestonesOf(r.milestones),
    serves: Object.fromEntries(serves),
    askSubjects: Object.fromEntries(asks)
  };
}
function droppedMilestoneIds(milestones) {
  return new Set(milestones.filter((m) => m.status === "dropped").map((m) => m.id));
}
function goalFields(o, subjects) {
  const milestones = milestonesOf(o.milestones);
  const dropped = droppedMilestoneIds(milestones);
  const live = new Map(milestones.filter((m) => !dropped.has(m.id)).map((m) => [m.id, m]));
  const names = new Map(subjects.map((s) => [s.id, s.name]));
  const savedServes = typeof o.serves === "object" && o.serves !== null ? Object.entries(o.serves) : [];
  const serves = Object.fromEntries(savedServes.filter((e) => names.has(e[0]) && typeof e[1] === "string" && (e[1] === "none" || live.has(e[1]))).map(([id, to]) => {
    const milestone = live.get(to);
    return [id, milestone && namesOtherVersion(names.get(id), milestone.name) ? "none" : to];
  }));
  const saved = [
    ...Array.isArray(o.declinedGoals) ? o.declinedGoals : [],
    ...Array.isArray(o.removedGoals) ? o.removedGoals : []
  ];
  const keys = saved.flatMap((d) => typeof d === "string" ? [nameKey(d)] : []);
  const removed = [...new Set(keys)].filter((key) => key !== "");
  return {
    goal: goalOf(o.goal),
    removedGoals: removed.slice(-REMOVED_KEPT),
    goalRemoved: goalRemovedOf(o.goalRemoved),
    milestones,
    nextMilestoneId: Math.max(time(o.nextMilestoneId) ?? 1, milestones.length + 1),
    serves,
    goalRefused: goalRefusedOf(o.goalRefused)
  };
}

// ../hooks/status-upgrade.ts
var CHILD_KINDS = ["subagent", "workflow", "delegate"];
var DELEGATE_STATES = ["working", "blocked", "finished"];
function text(value) {
  return typeof value === "string" ? value : "";
}
function time2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
var DROPPED_STATUSES = { "waits-on-you": "queued", problem: "queued" };
var OLD_MERGE = /^(.+?) folded in(?:; was: (.*))?$/s;
function wasAndMerged(was, merged) {
  const old = typeof was === "string" && typeof merged !== "string" ? OLD_MERGE.exec(was) : null;
  if (old)
    return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time2(s?.changedAt);
  if (!s || typeof s.id !== "string" || typeof s.name !== "string" || !status || changedAt === null)
    return null;
  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    ...wasAndMerged(s.was, s.merged),
    createdAt: time2(s.createdAt) ?? changedAt,
    changedAt,
    closedAt: time2(s.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null),
    into: typeof s.into === "string" ? s.into : null
  };
}
function childOf(saved) {
  const c = saved;
  const kind = CHILD_KINDS.find((k) => k === c?.kind);
  const startedAt = time2(c?.startedAt);
  if (!c || typeof c.id !== "string" || typeof c.ref !== "string" || !kind || startedAt === null)
    return null;
  return {
    id: c.id,
    ref: c.ref,
    kind,
    name: text(c.name),
    subjectId: typeof c.subjectId === "string" ? c.subjectId : null,
    startedAt,
    endedAt: time2(c.endedAt),
    lastActivityAt: time2(c.lastActivityAt),
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
  const lastLookAt = time2(o.lastLookAt);
  const items = lastLookAt === null ? [] : ["workstreams", "queue", "open"].flatMap((k) => Array.isArray(o[k]) ? o[k] : []);
  const subjects = items.flatMap((raw) => {
    const item = raw;
    const status = OLD_STATUS[String(item?.status)] ?? null;
    if (!status || typeof item?.text !== "string")
      return [];
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
function missedOf(saved, ids) {
  const entries = typeof saved === "object" && saved !== null ? Object.entries(saved) : [];
  return Object.fromEntries(entries.filter(([id, at]) => ids.has(id) && (at === null || time2(at) !== null)));
}
function upgradeStatus(saved) {
  const o = saved;
  if (typeof o !== "object" || o === null)
    return null;
  if (typeof o.headline === "string")
    return fromLists(o);
  if (!Array.isArray(o.subjects))
    return null;
  const subjects = o.subjects.map(subjectOf).filter((s) => s !== null);
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c) => c !== null) : [];
  const savedLinks = typeof o.askSubjects === "object" && o.askSubjects !== null ? Object.entries(o.askSubjects) : [];
  const goal = goalFields(o, subjects);
  const dropped = droppedMilestoneIds(goal.milestones);
  const askLinks = savedLinks.map(([ask, to]) => [
    ask,
    [to].flat().filter((id) => typeof id === "string" && !dropped.has(id))
  ]);
  const askSubjects = Object.fromEntries(askLinks.filter(([, ids]) => ids.length > 0));
  const look = o.look;
  const lookAt = time2(look?.startedAt);
  return {
    head: "head" in o ? headOf(o.head) : headOfGoal(o.goal),
    subjects,
    children,
    askSubjects,
    nextId: Math.max(time2(o.nextId) ?? 1, subjects.length + 1),
    nextChildId: Math.max(time2(o.nextChildId) ?? 1, children.length + 1),
    lastLookAt: time2(o.lastLookAt),
    missedInLastLook: missedOf(o.missedInLastLook, new Set(subjects.map((s) => s.id))),
    look: lookAt === null ? null : { startedAt: lookAt },
    ...goal
  };
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
    prOrder: rest.prOrder ? upgradePrOrder(rest.prOrder, rest.prs) : null,
    updates,
    overview: upgradeStatus(rest.overview),
    findings: [...rest.findings ?? [], ...notes ?? []],
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
function upgradePrOrder(order, prs) {
  return {
    ...order,
    why: order.why ?? null,
    statuses: order.statuses ?? null,
    dismissed: order.dismissed ?? order.refs.filter((ref) => !prs.includes(ref))
  };
}
var ASKED_AS = /^asked as (i\d+)$/;
function upgradeClosedFinding(f) {
  const asker = f.how === "update" ? ASKED_AS.exec(f.outcome)?.[1] : undefined;
  return asker && f.askedAs === undefined ? { ...f, askedAs: asker } : f;
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
function howFromOutcome(outcome) {
  if (outcome === "dismissed")
    return "dismissed";
  if (outcome === EXPIRED)
    return "expired";
  if (outcome === "done" || outcome === "you ran it")
    return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE))
    return "claude";
  return "update";
}
var CLOSED_BY_CLAUDE = "closed by Claude";

// ../hooks/inbox-text.ts
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
  const byNumber = new Map;
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1;
    if (n !== null && !byNumber.has(n))
      byNumber.set(n, item);
  });
  return byNumber;
}
function questionNumbers(ledger, promptTurn) {
  const numbers = new Map;
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === "question")
      numbers.set(item.id, n);
  return numbers;
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/last-actions.ts
function isAwaitingReply(last, turns) {
  const pressed = last?.delivery?.state !== "failed" ? last?.turnsStarted : undefined;
  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed;
}
function isHandedOff(last, turns) {
  return last?.kind === "handoff" && isAwaitingReply(last, turns);
}
function isFoldingPress(id, last) {
  return !id.startsWith("pr:") && last?.kind === "handoff" && last.action !== "address";
}
function isFixSent(last) {
  return last?.action === "address" && !last.isKept && last.delivery?.state !== "failed";
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
  if (action === null)
    return null;
  const { isHandoff, ...kept } = old;
  const isHandedOff = isHandoff ?? HANDOFF_IDS.test(action);
  return {
    ...kept,
    kind: isHandedOff ? "handoff" : "talk",
    action,
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? "Address" : old.text.replace(/ sent$/, "")
  };
}
function upgradeLastActions(saved) {
  return Object.fromEntries(Object.entries(saved).flatMap(([key, entry]) => {
    const {
      tab: _tab,
      title: _title,
      index: _index,
      ...last
    } = entry;
    if ("kind" in last && last.kind)
      return [[key, last]];
    const upgraded = upgradedLastAction(key, last);
    return upgraded ? [[key, upgraded]] : [];
  }));
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
var recordOf = (raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
function upgradeHostTasks(saved) {
  if (!Array.isArray(saved))
    return [];
  return saved.flatMap((raw) => {
    const t = recordOf(raw);
    const status = STATUSES2[String(t.status)];
    return typeof t.id === "string" && typeof t.text === "string" && t.text !== "" && status ? [{ id: t.id, text: t.text, status }] : [];
  });
}

// ../hooks/pr-checks.ts
function failingChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "fail");
}
function cancelledChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "cancelled");
}
var ACTIONS_RUN_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)/;
function runOf(c) {
  const m = ACTIONS_RUN_URL.exec(c.url ?? "");
  return m ? { repo: m[1], run: m[2] } : null;
}
function isSameRun(a, b) {
  return b !== null && a.repo === b.repo && a.run === b.run;
}
function failedSibling(pr, c) {
  const run = c.bucket === "cancelled" ? runOf(c) : null;
  return run ? pr.checks.find((f) => f.bucket === "fail" && isSameRun(run, runOf(f))) ?? null : null;
}
function blockingChecks(pr) {
  return [...failingChecks(pr), ...cancelledChecks(pr).filter((c) => !failedSibling(pr, c))];
}

// ../hooks/prs.ts
function namedPrs(text, refs) {
  const numbers = new Set([...text.matchAll(/#(\d+)\b/g)].map((m) => m[1]));
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
function checkKey(c) {
  return c.workflow ? `${c.workflow} / ${c.name}` : c.name;
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
  return pr.state === "OPEN" && (pr.mergeable === "CONFLICTING" || blockingChecks(pr).length > 0 || threadsOnYou(pr, isSent).length > 0);
}
function checkCounts(pr) {
  const counts = { pass: 0, fail: 0, cancelled: 0, pending: 0, skip: 0 };
  for (const c of pr.checks)
    counts[c.bucket] += 1;
  return counts;
}
function threadsWaiting(count) {
  return `${count} ${count === 1 ? "thread" : "threads"} waiting on you`;
}
function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}
function readiness(pr, isSent = () => false, agent = "Claude") {
  const result = (status, head, reasonList = [], joint = ": ") => {
    const reasons = reasonList.join(", ");
    const unlisted = status === "ready" ? [] : reasonList.filter((r) => !listed.includes(r));
    return { status, text: reasons ? `${head}${joint}${reasons}` : head, head, unlisted };
  };
  const listed = [];
  if (pr.state === "MERGED")
    return result("merged", "Merged");
  if (pr.state !== "OPEN")
    return result("closed", "Closed");
  const { pass: passing, fail: failing, pending } = checkCounts(pr);
  const cancelled = blockingChecks(pr).length - failing;
  const waiting = waitingThreads(pr);
  const open = threadsOnYou(pr, isSent).length;
  const sent = waiting.filter((t) => isSent(pr, t)).length;
  const changed = waiting.filter((t) => t.isLinesChanged && !isSent(pr, t)).length;
  const isPresent = (b) => b !== null;
  const row = (r) => r === null ? r : (listed.push(r), r);
  const checksAndConflicts = [
    pr.mergeable === "CONFLICTING" ? `conflicts with ${pr.base}` : null,
    row(failing > 0 ? plural(failing, "failing check", "failing checks") : null),
    row(cancelled > 0 ? plural(cancelled, "cancelled check", "cancelled checks") : null)
  ];
  const threadsOnPerson = row(open > 0 ? threadsWaiting(open) : null);
  const isChangesRequested = pr.reviewDecision === "CHANGES_REQUESTED";
  const isAnythingOnPerson = [...checksAndConflicts, threadsOnPerson].some(isPresent);
  const changes = isChangesRequested ? "changes requested" : null;
  const onYou = isAnythingOnPerson ? [...checksAndConflicts, changes, threadsOnPerson].filter(isPresent) : [];
  const onOthers = [
    row(sent > 0 ? `${plural(sent, "thread", "threads")} sent to ${agent}` : null),
    row(changed > 0 ? `${plural(changed, "thread", "threads")} on changed lines` : null),
    pr.reviewDecision === "REVIEW_REQUIRED" ? "needs approval" : null,
    pending > 0 ? `${pending} ${pending === 1 ? "check" : "checks"} running` : null,
    pr.mergeable === "UNKNOWN" ? "GitHub is still checking for conflicts" : null
  ].filter(isPresent);
  if (pr.isDraft)
    return result("draft", "Draft", [...isAnythingOnPerson ? onYou : [changes].filter(isPresent), ...onOthers]);
  if (onYou.length > 0)
    return result("blocked", "Blocked", onYou);
  if (isChangesRequested)
    return result("waiting", "Waiting on the reviewer", ["changes requested", ...onOthers]);
  if (onOthers.length > 0)
    return result("waiting", "Waiting", onOthers);
  const isApproved = pr.reviewDecision === "APPROVED";
  return result("ready", "Ready to merge", [...isApproved ? ["approved"] : [], passing > 0 ? "checks pass" : "no checks ran", "no threads waiting on you"], isApproved ? ": " : ", ");
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
  return [...prs].sort((a, b) => byPlace(a, b) || status.get(a) - status.get(b) || b.number - a.number || a.ref.localeCompare(b.ref));
}
var HTML_TAG = /<\/?(?:a|b|br|code|details|div|em|h[1-6]|hr|i|img|kbd|li|ol|p|pre|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|ul)\b[^>]*>/g;
function readableComment(body) {
  return body.replace(/<!--[\s\S]*?-->/g, "").replace(HTML_TAG, "").replace(/^[^\S\n]*Useful\?[^\S\n]+React[^\S\n]+with[^\S\n]+👍[^\S\n]*\/[^\S\n]*👎\.?[^\S\n]*$/gmu, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt.replace(/\s*badge$/i, "")).trim();
}
function commentLine(body) {
  return readableComment(body).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*(?:#{1,6}|>)\s*/gm, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ");
}
var THREAD_TITLE_CHARS = 120;
function commentParts(body) {
  const text = readableComment(body);
  const [first = "", ...more] = text.split(`
`);
  const head = commentLine(first).trim();
  return { head, rest: head.length > THREAD_TITLE_CHARS ? text : more.join(`
`).trim() };
}
function threadWhere(t, path = t.path) {
  return `${path}${t.line ? `:${t.line}` : ""}`;
}
function took(ms) {
  const secs = Math.max(0, Math.round(ms / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ../hooks/presses.ts
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}

// ../hooks/open-targets.ts
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}
function localPath(raw, root, home) {
  if (raw.startsWith("~/"))
    return home + raw.slice(1);
  if (raw.startsWith("/"))
    return raw;
  return `${root.replace(/\/$/, "")}/${raw.replace(/^\.\//, "")}`;
}
var LAUNCHES = /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i;
function openCommands(path, isFile, isExecutable) {
  if (!isFile || isExecutable || LAUNCHES.test(path))
    return { argv: ["open", "-R", path], fallback: null };
  return { argv: ["open", path], fallback: ["open", "-t", path] };
}
var OPEN_TIMEOUT_MS = 1e4;
async function openTarget(run, probe, target, root, home) {
  const open = (argv) => run(argv, { cwd: "/", timeoutMs: OPEN_TIMEOUT_MS });
  const failure = (r) => r.stderr.trim() || `open exited ${r.code}`;
  if (/^https?:\/\//.test(target)) {
    const r = await open(["open", target]);
    return r.code === 0 ? null : failure(r);
  }
  const path = localPath(target, root || "/", home);
  const info = await probe.stat(path);
  if (!info)
    return "it no longer exists";
  const isFile = info.isFile();
  const isExecutable = isFile && await probe.isExecutable(path);
  const { argv, fallback } = openCommands(path, isFile, isExecutable);
  const r = await open(argv);
  const retry = r.code !== 0 && fallback ? await open(fallback) : r;
  return retry.code === 0 ? null : failure(retry);
}

// ../hooks/press-messages.ts
function findingBody(finding) {
  return [
    `${finding.kind === "issue" ? "Issue" : "Opportunity"}: ${finding.title}`,
    finding.detail,
    ...finding.path ? [`File: ${finding.path}`] : []
  ];
}
var EXPLAIN_REPLY_FORM = "Keep it under 80 words of plain language, not counting a diagram: no jargon, and name each thing by what it does. Call each choice by its name as listed. When a small ASCII diagram would show it faster than words, such as steps in order or a before-and-after, put one in a code block in your reply.";
var COMPARE_IN_BACKGROUND = "Compare the choices in this question you asked me by trying them against the code, not from memory. If you can run a subagent in the background, hand it this work and tell me in one line that it started, so we can keep talking. Otherwise do it now.";
var COMPARE_IN_TURN = "Compare the choices in this question you asked me by trying them against the code, not from memory. Do it now, and reply with the result before this turn ends, because a background subagent's report after your turn ends may not reach this chat.";
var compareRequest = (texts) => [
  texts.compareInBackground ? COMPARE_IN_BACKGROUND : COMPARE_IN_TURN,
  "For each choice, find out what it would change: read the code it touches, and where it is cheap, prototype it and run the tests or a small script. Work only in a folder Git ignores or a temporary folder. Leave every tracked file as it was, and never commit or push. Ask me before you call another model, or before you read my files or another session's data outside this repo.",
  `Then make a page from the inbox's comparison template. Write the comparison as JSON in the shape the comment at the top of the template shows, with the few measures that tell the choices apart. Put first the measures I would notice when using it, and judge the choices by those, not by how much code each takes. Build the page with: cat "${texts.comparePage}" <your JSON file> > <your page>.html`,
  "When the comparison is done, reply without a table, since the page holds the measures. Give your pick and say whether it changed, your reason in one line, one line on anything you did not expect, and the page's absolute path.",
  "Also call the inbox's record tool yourself with this question's ask and options as listed below, and the page's absolute path in steps. That updates the open question and marks it compared. It stays open, so do not close it. Call each choice by its name as listed."
].join(`

`);
function quotedAsk(item) {
  return `"${item.ask}"${item.options.length > 0 ? `
Options: ${item.options.join(" / ")}` : ""}`;
}
var messages = {
  answer: (item, answer) => isQuestionBack(answer, item.options) ? `About this question you asked me: ${answer}
${quotedAsk(item)}` : `Re "${item.ask}": ${answer}`,
  explain: (item) => {
    const what = item.kind === "task" ? "this task you left for me is about: why it came up, and what doing it involves" : "this question you asked me is about: why it came up, what each choice would do, and which you would pick";
    return `Remind me what ${what}. ${EXPLAIN_REPLY_FORM} Don't act on it yet.
${quotedAsk(item)}`;
  },
  compare: (item, texts) => `${compareRequest(texts)}
${quotedAsk(item)}`,
  run: (item, command) => `For "${item.ask}", run this:
\`\`\`
${command}
\`\`\``,
  taskReply: (item, words) => `Re the task you left for me, "${item.ask}": ${words}`,
  done: (asks) => asks.length === 1 ? `Done: ${asks[0]}` : `Done:
${asks.map((a) => `- ${a}`).join(`
`)}`,
  finding: (finding, how, words = "") => {
    const opening = how === "address" ? "Please address this finding you recorded:" : how === "issue" ? "Please file an issue for this finding you recorded, in the issue tracker you have tools for. First check whether one already exists, and if it does, use it instead of filing a duplicate. Then close the finding with the issue's key or number as the reason, and give me its link. If you have no tools for an issue tracker, say so and leave the finding open." : how === "explain" ? `Remind me what this finding you recorded is about: why it matters, what fixing it would involve, and whether you would fix it now. ${EXPLAIN_REPLY_FORM} Don't act on it yet.` : how === "discuss" ? "Let's talk through this finding you recorded before changing anything:" : "About this finding you recorded:";
    return [opening, ...findingBody(finding), ...how === "typed" ? ["", words] : []].join(`
`);
  }
};

// ../hooks/help-steps.ts
function helpLabel(help) {
  const label = help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? help.command}` : help.kind === "terminal" ? `Copy ${help.name ?? help.command}` : `Open ${help.name ?? new URL(help.url).host}`;
  return clipLabel(label, 32);
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open = helps.find((h) => h.kind === "open");
  if (!copy || !open || copy.kind !== "copy" || open.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map((h) => h === open ? { label: clipLabel(`Copy ${copy.name ?? "snippet"} and open ${baseName(open.path)}`, 48), step: [copy, open] } : { label: helpLabel(h), step: [h] });
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
function stepIconKind(step) {
  if (!step)
    return;
  if (step.step.some((h) => h.kind === "run"))
    return "run";
  const first = step.step[0]?.kind;
  return first === "copy" || first === "terminal" ? "copy" : first === "open" || first === "link" ? "open" : undefined;
}
function helpEffect(item, help) {
  switch (help.kind) {
    case "run":
      return { kind: "send", text: messages.run(item, help.command), by: { id: item.id, action: "run" } };
    case "open":
      return { kind: "open", target: help.path, name: baseName(help.path) };
    case "link":
      return { kind: "open", target: help.url, name: help.name ?? help.url };
    case "copy":
      return { kind: "copy", text: help.text, name: help.name ?? "snippet", isCommand: false };
    case "terminal":
      return { kind: "copy", text: help.command, name: help.name ?? clipLabel(help.command, 32), isCommand: true };
  }
}
function stepEffects(item, step) {
  return step.step.map((h) => helpEffect(item, h));
}

// ../hooks/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "▲", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "✦", tone: "done" }
};
var SUBJECT_MARKS = {
  working: { mark: "●", tone: null },
  queued: { mark: "○", tone: null },
  "waits-on-other": { mark: "◌", tone: null },
  done: { mark: "✓", tone: "done" },
  dropped: { mark: "✗", tone: null }
};
var HELD_MARK = { mark: "◆", tone: "needsYou" };
var RUNNING_FRAMES = ["●", "◉", "◎", "◉"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var IDLE_MARK = { mark: "◐", tone: null };
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "✕",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" },
  cancelled: { text: "⊘", tone: null }
};
var stoppedWords = (what) => `Stopped before it finished: ${what}`;
var MARK_LEGEND = [
  {
    mark: RUNNING_MARK,
    tone: null,
    isRunning: true,
    words: "Working. It moves while the work runs or your message is on its way."
  },
  { mark: IDLE_MARK.mark, tone: null, isRunning: false, words: "Working, with nothing running right now" },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: "Queued: not started yet" },
  {
    mark: SUBJECT_MARKS["waits-on-other"].mark,
    tone: null,
    isRunning: false,
    words: "Waits on something other than you, such as a build or a review"
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on you" },
  { mark: SUBJECT_MARKS.done.mark, tone: "done", isRunning: false, words: "Done, or handed to the agent" },
  { mark: SUBJECT_MARKS.dropped.mark, tone: null, isRunning: false, words: stoppedWords("dropped work") },
  { mark: CLOSED_MARKS.dismissed, tone: null, isRunning: false, words: "Dismissed by you" },
  {
    mark: FINDING_GROUPS.issue.mark,
    tone: FINDING_GROUPS.issue.tone,
    isRunning: false,
    words: "Something is wrong: an issue or a failing check"
  },
  {
    mark: PR_MARKS.cancelled.text,
    tone: PR_MARKS.cancelled.tone,
    isRunning: false,
    words: stoppedWords("a cancelled check, which needs another run")
  },
  {
    mark: FINDING_GROUPS.opportunity.mark,
    tone: FINDING_GROUPS.opportunity.tone,
    isRunning: false,
    words: "Opportunity: something that could be better"
  }
];
var STATUS_ONLY_MARKS = new Set([IDLE_MARK.mark, SUBJECT_MARKS.queued.mark, SUBJECT_MARKS["waits-on-other"].mark]);
function markLegend(isNextBuild) {
  return isNextBuild ? MARK_LEGEND : MARK_LEGEND.filter((m) => !STATUS_ONLY_MARKS.has(m.mark));
}
var HELP_COPY = { open: "Help", close: "✕ Close help", keys: "Keys", marks: "Marks", tabs: "Tabs" };
var UNDO_KEY = "u";
var PR_TAB_HELP_KEYS = [
  { keys: "g", does: "Rank the PRs again, once a ranked PR changed" },
  { keys: "m", does: "Clear the merged and closed PRs" }
];
function helpKeys(look, isNextBuild, tab, hasStatusButtons) {
  const tabKeys = shownTabs(isNextBuild).map((t) => t.hotkey).join(" ");
  const hasRows = isRowTab(tab);
  const selectsStatusRows = tab === "overview" && hasStatusButtons;
  const switchTabs = { keys: tabKeys, does: "Switch tabs" };
  const prTabKeys = tab === "prs" ? PR_TAB_HELP_KEYS : [];
  const undoKey = { keys: UNDO_KEY, does: "Undo the last close" };
  switch (look) {
    case "desktop":
      return [];
    case "terminal":
      return [
        switchTabs,
        ...hasRows || selectsStatusRows ? [{ keys: "j k", does: "Select the next or previous row" }] : [],
        ...hasRows ? [undoKey] : [],
        ...prTabKeys,
        { keys: "ctrl+x tab", does: "Move focus to the line above the prompt, then the pane, then the prompt" }
      ];
    case "codex":
      return [
        switchTabs,
        ...hasRows ? [{ keys: "j k ↑ ↓", does: "Select the next or previous row" }, undoKey] : [],
        ...prTabKeys,
        { keys: "?", does: "Open or close help" },
        { keys: "esc", does: "Close help, or leave a reply field" }
      ];
    case "omp":
      return [
        { keys: `tab ${tabKeys}`, does: "Switch tabs" },
        ...hasRows ? [
          { keys: "↑ ↓ j k", does: "Move between rows" },
          { keys: "← →", does: "Pick a button" },
          { keys: "↵", does: "Press the picked button" },
          { keys: "t", does: "Reply to the selected row" },
          undoKey,
          ...prTabKeys
        ] : [
          ...selectsStatusRows ? [
            { keys: "j k", does: "Select the next or previous row with a button" },
            { keys: "← →", does: "Pick a button" },
            { keys: "↵", does: "Press the picked button" }
          ] : [],
          { keys: "↑ ↓", does: "Scroll the page" }
        ],
        { keys: "?", does: "Open or close help" },
        { keys: "esc", does: "Close help, then the panel" }
      ];
    case "herdr":
      return [
        { keys: "← →", does: "Switch tabs" },
        ...hasRows ? [{ keys: "j k", does: "Select the next or previous row" }, undoKey] : [],
        ...prTabKeys,
        { keys: "esc", does: "Move focus back to the agent's terminal" }
      ];
  }
}

// ../hooks/status-keys.ts
var GOAL_KEYS_ID = "goal";
var VIEW_ASK_LABELS = { question: "View question", task: "View task" };
function viewAsk(ask) {
  return {
    press: { action: "show-ask", askId: ask.id },
    label: VIEW_ASK_LABELS[ask.kind],
    hotkey: "v",
    kind: "view",
    emphasis: "normal"
  };
}
function statusKeyPlan(row) {
  if (row.kind === "done-fold")
    return [
      {
        press: { action: "toggle-fold", foldId: row.id },
        label: row.text,
        hotkey: "f",
        kind: "view",
        emphasis: "quiet"
      }
    ];
  return row.kind === "subject" && row.ask !== null ? [viewAsk(row.ask)] : [];
}
function milestoneKeyPlan(m) {
  return m.ask === null ? [] : [viewAsk(m.ask)];
}
var REMOVE_GOAL = {
  press: { action: "remove-goal" },
  label: "Remove",
  hotkey: "r",
  kind: "mark",
  emphasis: "quiet"
};
var RESTORE_GOAL = {
  press: { action: "restore-goal" },
  label: "Undo",
  hotkey: UNDO_KEY,
  kind: "mark",
  emphasis: "normal"
};
var newGoal = (emphasis) => ({
  press: { action: "type-goal", text: "" },
  label: "New",
  hotkey: "n",
  kind: "view",
  emphasis
});
function goalKeyPlan(page) {
  const g = page.goal;
  if (g === null)
    return [...page.canRestoreGoal ? [RESTORE_GOAL] : [], newGoal("quiet")];
  if (g.isMet)
    return [newGoal("normal"), REMOVE_GOAL];
  return [
    { press: { action: "type-goal", text: g.text }, label: "Edit", hotkey: "e", kind: "view", emphasis: "quiet" },
    REMOVE_GOAL
  ];
}
var GOAL_FIELD = { placeholder: "An outcome to work toward", submit: "Save" };

// ../hooks/pressed.ts
function offersUndo(c) {
  return c.how === "done" || c.how === "dismissed";
}
function isUndoable(c) {
  return offersUndo(c) && !c.isSentToAgent;
}
function pendingResult(effects, at, pressId) {
  return {
    state: "pending",
    parts: effects.flatMap((e) => e.kind === "send" ? [] : [{ kind: e.kind, name: e.name, isCommand: e.kind === "copy" && e.isCommand, error: null }]),
    at,
    ...pressId ? { pressId } : {}
  };
}
function retryOf(id, last) {
  if (!/^[if]\d+$/.test(id))
    return null;
  const step = /^step-(\d+)$/.exec(last.action);
  if (step)
    return { action: "step", id, step: Number(step[1]), label: last.text };
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
function isHeldSend(last) {
  return last?.delivery?.state === "held";
}

// ../hooks/press-reducer.ts
var STALE_TEXT = "This changed before your press. Nothing was sent.";
function noteText() {
  return STALE_TEXT;
}
function isPressConfirmed(outcome) {
  return outcome.error === null && outcome.note === null && !outcome.isUnconfirmed;
}

// ../hooks/status-goal-page.ts
var AWAITING_TEXT = "Milestones after the next reply";
var GOAL_HEADING = "Goal";
var NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed.";
function oldestAsk(items, links, id) {
  const oldest = items.filter((i) => links[i.id]?.includes(id)).sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return oldest ? { id: oldest.id, kind: oldest.kind } : null;
}
function milestoneRow(m, o, items) {
  const isOpen = m.status !== "done" && m.status !== "dropped";
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => to === m.id ? [id] : []));
  const holds = items.filter((i) => {
    const to = o.askSubjects[i.id] ?? [];
    return to.some((id) => id === m.id || servingIds.has(id));
  });
  const isHeld = isOpen && holds.length > 0;
  const isChanged = o.lastLookAt !== null && m.changedAt > o.lastLookAt && m.changedAt > (o.goal?.setAt ?? 0);
  const direct = oldestAsk(items, o.askSubjects, m.id);
  const viaSubject = holds.sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return {
    id: m.id,
    ...isHeld ? HELD_MARK : SUBJECT_MARKS[m.status],
    name: m.name,
    text: m.text || null,
    stall: isHeld ? { text: "waiting", tone: "needsYou" } : null,
    was: isChanged ? m.was : null,
    ask: !isHeld ? null : direct ?? (viaSubject ? { id: viaSubject.id, kind: viaSubject.kind } : null),
    rows: []
  };
}
function goalPage(o, items) {
  const g = o?.goal ?? null;
  if (o === null || g === null)
    return { goal: null, canRestoreGoal: o?.goalRemoved != null };
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt);
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const shown = o.milestones.filter((m) => m.status !== "dropped" || o.lastLookAt !== null && m.changedAt > o.lastLookAt);
  const done = kept.filter((m) => m.status === "done").length;
  const isMet = g.metAt !== null;
  const isAwaiting = g.isAwaitingMilestones || kept.length === 0;
  const head = o.head;
  return {
    goal: {
      label: isMet ? "Goal met" : GOAL_HEADING,
      text: g.text,
      count: isMet || isAwaiting ? null : `${done} of ${kept.length} done`,
      isMet,
      was: isWasShown ? g.was : null,
      now: head ? `Now: ${head.description || head.title}` : null,
      awaiting: isAwaiting ? AWAITING_TEXT : null,
      milestones: g.isAwaitingMilestones ? [] : shown.map((m) => milestoneRow(m, o, items))
    },
    canRestoreGoal: false
  };
}

// ../hooks/status-page-parts.ts
var CHILD_ROWS = 3;
var CHILD_MARK = { mark: SUBJECT_MARKS.working.mark, tone: null };
var COUNT_WORDS = {
  working: "working",
  "waits-on-other": "waiting"
};
function countsByMark(folded) {
  return ["working", "waits-on-other"].flatMap((status) => {
    const n = folded.filter((x) => x.status === status).length;
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }];
  });
}
function isFinishedUnseen(c, lastLookAt) {
  return c.delegateState === "finished" && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt);
}
var DAY_MS = 24 * 60 * 60000;
function subjectStall(x, isHeld, isWorkRunning, now) {
  if (isHeld)
    return { text: "waiting", tone: "needsYou" };
  const idleMs = now - x.changedAt;
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS;
  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: "muted" } : null;
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
function childStall(c) {
  if (c.delegateState === "finished")
    return { text: "finished", tone: "done" };
  if (c.delegateState === "blocked")
    return { text: "waiting", tone: "needsYou" };
  return null;
}
function childRow(c, branch, depth) {
  const marks = c.delegateState === "finished" ? SUBJECT_MARKS.done : c.delegateState === "blocked" ? HELD_MARK : CHILD_MARK;
  return {
    kind: "child",
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch
  };
}
function partRows(shown, c, depth, afterOpen = [], afterClosed = []) {
  const rows = [];
  const firstClosed = shown.findIndex((x) => !isOpen(x));
  for (const [i, x] of shown.entries()) {
    if (i === firstClosed)
      rows.push(...afterOpen);
    const under = c.running.filter((ch) => ch.subjectId === x.id);
    const shownUnder = under.slice(0, CHILD_ROWS);
    const isMore = under.length > CHILD_ROWS;
    const isRunning = x.status === "working" && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking));
    const isIdle = x.status === "working" && !isRunning;
    const isWorkRunning = isRunning || under.some((ch) => ch.endedAt === null);
    rows.push({
      kind: "subject",
      id: x.id,
      depth,
      ...c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status],
      isRunning,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? x.text || null : null,
      stall: subjectStall(x, c.isHeld(x), isWorkRunning, c.now),
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: c.oldestAskOf(x)
    });
    rows.push(...shownUnder.map((ch, n) => childRow(ch, n === shownUnder.length - 1 && !isMore ? "last" : "mid", depth + 1)));
    const hidden = under.slice(CHILD_ROWS);
    const isEveryHiddenRunning = hidden.every((ch) => ch.delegateState !== "finished");
    if (isMore)
      rows.push({
        kind: "more",
        id: `${x.id}-more`,
        depth: depth + 1,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? " running" : ""}`,
        branch: "last"
      });
  }
  if (firstClosed === -1)
    rows.push(...afterOpen);
  rows.push(...afterClosed);
  return rows;
}
function unfoldedRows(rows, isUnfolded) {
  return rows.flatMap((r) => r.kind === "done-fold" && isUnfolded(r.id) ? [r, ...r.rows] : [r]);
}

// ../hooks/status-page.ts
var STATUS_FAILED = "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply.";
var OTHER_WORK = "Other work";
var WAS_PREFIX = "was: ";
var MERGED_PREFIX = "merged in: ";
var STALL_GAP = " · ";
var NEW_CLOSED_ROWS = 2;
var NAMED_FOLD_TEXT = { done: "Also done: ", dropped: "Also dropped: " };
var NAMED_FOLD_NAMES = 2;
var IS_FOLD_MORE_SEEN = true;
var namedFoldMore = (n) => `+${n} more`;
var STATUS_PLACES = ["held", "working", "waits-on-other", "queued", "closed"];
function mergedLine(merged, fits) {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, (names) => fits(`${MERGED_PREFIX}${names}`))}`;
}
function statusPage(s, now) {
  const o = s.ledger.overview;
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => o === null || !isSubjectSeen(o, x);
  const heldIds = new Set(s.ledger.items.flatMap((i) => o?.askSubjects[i.id] ?? []));
  const isHeld = (x) => isOpen(x) && heldIds.has(x.id);
  const oldestAskOf = (x) => isHeld(x) ? oldestAsk(s.ledger.items, o?.askSubjects ?? {}, x.id) : null;
  const placeOf = (x) => isHeld(x) ? "held" : x.status === "done" || x.status === "dropped" ? "closed" : x.status;
  const pageOrder = (x, y) => STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt;
  const goalParts = goalPage(o, s.ledger.items);
  const milestoneIds = new Set((goalParts.goal?.milestones ?? []).map((m) => m.id));
  const servedBy = (x) => o?.goal ? o.serves[x.id] : undefined;
  const milestoneOf = (x) => {
    const to = servedBy(x);
    return to !== undefined && milestoneIds.has(to) ? to : null;
  };
  const hasMilestones = milestoneIds.size > 0;
  const isUnneeded = (x) => servedBy(x) === "none";
  const isOther = (x) => isUnneeded(x) || hasMilestones && milestoneOf(x) === null;
  const running = (o?.children ?? []).filter((c) => isChildRunning(c, now) || isFinishedUnseen(c, look)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const hasChildRow = (x) => running.some((c) => c.subjectId === x.id);
  const unseenClosedOf = (part) => part.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0));
  const needed = subjects.filter((x) => !isUnneeded(x));
  const main = needed.filter((x) => !isOther(x));
  const other = subjects.filter(isOther);
  const open = needed.filter(isOpen).sort(pageOrder);
  const foldable = open.filter((x) => !isHeld(x) && !isNew(x) && !hasChildRow(x));
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)));
  const split = (part) => {
    const unseenClosed = unseenClosedOf(part);
    const newClosed = unseenClosed.slice(0, NEW_CLOSED_ROWS);
    return {
      shown: [...part.filter((x) => isOpen(x) && !folded.includes(x)), ...newClosed].sort(pageOrder),
      newClosed,
      named: unseenClosed.slice(NEW_CLOSED_ROWS),
      foldedOpen: part.filter((x) => folded.includes(x)),
      foldedDone: part.filter((x) => x.status === "done" && !isNew(x))
    };
  };
  const top = split(main.filter((x) => milestoneOf(x) === null));
  const underMilestones = (goalParts.goal?.milestones ?? []).map((m) => split(main.filter((x) => milestoneOf(x) === m.id)));
  const otherUnseenClosed = unseenClosedOf(other);
  const otherNewClosed = otherUnseenClosed.slice(0, NEW_CLOSED_ROWS);
  const isOtherFolded = (x) => !isOpen(x) ? x.status === "done" && !isNew(x) : isUnneeded(x) ? !isHeld(x) && !isNew(x) && !hasChildRow(x) : folded.includes(x);
  const otherFolded = other.filter(isOtherFolded);
  const otherShown = [...other.filter((x) => isOpen(x) && !otherFolded.includes(x)), ...otherNewClosed].sort(pageOrder);
  const shownIds = new Set([...top.shown, ...underMilestones.flatMap((p) => p.shown), ...otherShown].map((x) => x.id));
  const ctx = {
    isNew,
    isHeld,
    oldestAskOf,
    running,
    isTurnRunning: s.presence.isTurnRunning,
    now
  };
  const foldCtx = { ...ctx, running: [] };
  const namedFolds = (prefix, named, depth) => ["done", "dropped"].flatMap((status) => {
    const closed = named.filter((x) => x.status === status);
    const names = closed.map((x) => x.name);
    const hidden = names.length - NAMED_FOLD_NAMES;
    const shown = [...names.slice(0, NAMED_FOLD_NAMES), ...hidden > 0 ? [namedFoldMore(hidden)] : []];
    return names.length === 0 ? [] : [
      {
        kind: "fold",
        id: `${prefix}also-${status}`,
        depth,
        ...SUBJECT_MARKS[status],
        text: `${NAMED_FOLD_TEXT[status]}${shown.join(", ")}`,
        subjectIds: (IS_FOLD_MORE_SEEN ? closed : closed.slice(0, NAMED_FOLD_NAMES)).map((x) => x.id)
      }
    ];
  });
  const openFold = (prefix, foldedOpen, depth) => foldedOpen.length === 0 ? [] : [
    {
      kind: "fold",
      id: `${prefix}open`,
      depth,
      ...SUBJECT_MARKS.queued,
      text: `${foldedOpen.length} more`,
      subjectIds: []
    }
  ];
  const doneFold = (prefix, done, newClosed, depth) => done.length === 0 ? [] : [
    {
      kind: "done-fold",
      id: `${prefix}done`,
      depth,
      text: `${done.length}${newClosed.some((x) => x.status === "done") ? " more" : ""} done`,
      rows: partRows([...done].sort(pageOrder), foldCtx, depth + 1)
    }
  ];
  const foldedPart = (prefix, p, depth) => [
    ...partRows(p.shown, ctx, depth, openFold(prefix, p.foldedOpen, depth), namedFolds(prefix, p.named, depth)),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth)
  ];
  const loose = running.filter((c) => c.subjectId === null || !shownIds.has(c.subjectId)).map((c) => {
    const x = subjects.find((y) => y.id === c.subjectId);
    return { child: c, milestoneId: x === undefined ? null : milestoneOf(x) };
  });
  const looseRows = (milestoneId, depth) => loose.filter((l) => l.milestoneId === milestoneId).map((l) => childRow(l.child, null, depth));
  const otherCounts = countsByMark(otherFolded.filter((x) => isOpen(x) && isUnneeded(x)));
  const afterOtherOpen = [
    ...openFold("other-", otherFolded.filter((x) => isOpen(x) && !isUnneeded(x)), 0),
    ...otherCounts.length === 0 ? [] : [{ kind: "counts", id: "other-counts", depth: 0, counts: otherCounts }]
  ];
  const otherRows = [
    ...hasMilestones ? looseRows(null, 0) : [],
    ...partRows(otherShown, ctx, 0, afterOtherOpen, namedFolds("other-", otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0)),
    ...doneFold("other-", otherFolded.filter((x) => x.status === "done"), otherNewClosed, 0)
  ];
  const rows = [
    ...hasMilestones ? [] : looseRows(null, 0),
    ...foldedPart("", top, 0),
    ...otherRows.length > 0 ? [{ kind: "part", id: "other", depth: 0, text: OTHER_WORK }, ...otherRows] : []
  ];
  const milestoneRows = (id, p) => [...looseRows(id, 1), ...foldedPart(`${id}-`, p, 1)];
  const g = goalParts.goal;
  const goal = g && {
    ...g,
    milestones: g.milestones.map((m, n) => ({ ...m, rows: milestoneRows(m.id, underMilestones[n]) }))
  };
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null;
  return {
    isEmpty: head === null && rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    goal,
    rows,
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: "Status",
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."
    }
  };
}

// ../hooks/timing.ts
var SETTLED_MS = 5120;
var QUEUED_AFTER_MS = 1000;
var COMPARE_LIMIT_MS = 30 * 60000;
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - last.at >= QUEUED_AFTER_MS;
}
function pendingDeliveryAt(last, now) {
  if (last?.delivery?.state === "held")
    return "held";
  if (last?.delivery?.state === "unconfirmed")
    return "unconfirmed";
  if (last?.delivery?.state !== "queued")
    return null;
  return isQueuedAt(last, now) ? "queued" : "sending";
}
var FOLD_QUIET_MS = 1000;
function withListInput(input, at) {
  const isSameRun = input !== null && at - input.last < FOLD_QUIET_MS;
  return isSameRun ? { since: input.since, last: Math.max(at, input.last) } : { since: at, last: at };
}
function isListInUseSince(input, at, now) {
  return input !== null && now - input.last < FOLD_QUIET_MS && input.since <= at;
}
var NO_HOLDS = { replies: {}, discarded: {}, shownSince: null, listInput: null };
function isShownSince(at, shownSince) {
  return shownSince !== null && at >= shownSince;
}
function foldDueAt(state, lastTypedMessageAt, settleWindowMs) {
  const windowEndsAt = state.at + settleWindowMs;
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at;
  return isTypedSince && !state.canUndo ? Math.min(lastTypedMessageAt, windowEndsAt) : windowEndsAt;
}
function isPressOutSince(pressOutSince, at) {
  return pressOutSince !== null && pressOutSince <= at;
}
function earliestOf(times) {
  const known = times.filter((t) => t !== null);
  return known.length > 0 ? Math.min(...known) : null;
}
function isSendOnItsWay(delivery) {
  return delivery === "held" || delivery === "sending" || delivery === "queued";
}
function isSettledInPlace(state, { shownSince, lastTypedMessageAt, listInput, now, settleWindowMs, undoShown, pressOutSince }, id) {
  const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs);
  const isUndoShown = id !== undefined && (undoShown ?? []).includes(id);
  const isWaiting = now < dueAt || isUndoShown || isSendOnItsWay(state.delivery) || isPressOutSince(pressOutSince, dueAt) || isListInUseSince(listInput, dueAt, now);
  return isShownSince(state.at, shownSince) && isWaiting;
}
function nextFoldAt(settled, {
  lastTypedMessageAt,
  listInput,
  now,
  settleWindowMs
}) {
  const times = settled.flatMap((state) => {
    const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs);
    if (dueAt > now)
      return [dueAt];
    const quietAt = listInput === null ? null : listInput.last + FOLD_QUIET_MS;
    const isQuietLater = quietAt !== null && quietAt > now;
    return !isSendOnItsWay(state.delivery) && isQuietLater ? [quietAt] : [];
  });
  return times.length > 0 ? Math.min(...times) : null;
}
function isDrawnInPlace(row, shownSince) {
  return row.state.is !== "settled" || isShownSince(row.state.at, shownSince);
}
function keptDiscards(discarded, shownSince) {
  return Object.fromEntries(Object.entries(discarded).filter(([, at]) => isShownSince(at, shownSince)));
}
function heldReplies(typing, drafts) {
  return Object.fromEntries(Object.entries(drafts).flatMap(([id, d]) => id === typing || d.text.trim() !== "" ? [[id, d.since]] : []));
}
function isUndoLeft(at, now, settleWindowMs) {
  return now - at < settleWindowMs;
}
function canUndoClose(closed, at, now, settleWindowMs) {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs);
}
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;

// ../hooks/rows.ts
var OPTIONS_FOLD_AT = 5;
var OPTION_LABEL_CHARS = 32;
var DOT = " · ";
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions" },
  { kind: "task", title: "Tasks", list: "tasks" }
];
var CLOSED_SHOWN = 3;
function closedRowState(closed, at, now, settleWindowMs, delivery, isPressedAnswer = false) {
  const canUndoAnswer = isPressedAnswer && delivery === "held" && isUndoLeft(at, now, settleWindowMs);
  return {
    is: "settled",
    label: outcomeLabel(closed),
    at,
    canUndo: canUndoAnswer || canUndoClose(closed, at, now, settleWindowMs),
    offersUndo: isPressedAnswer || offersUndo(closed),
    closedAs: closedState(closed),
    delivery
  };
}
var isTerminalLike = (look) => look === "terminal" || look === "omp";
var ROW_COPY = {
  retry: "Try again",
  send: "Send",
  cancel: "Cancel",
  discard: "Discard",
  clickField: "Click the field to type",
  relevantFile: "Relevant file: ",
  allOptions: (count) => `All ${count} options`,
  undo: "Undo",
  reopen: "Reopen"
};
function closedLineAction(d) {
  if (canUndoRefused(d.delivery))
    return { label: ROW_COPY.undo, press: { id: d.id, action: "undo" } };
  return d.how === "dismissed" ? { label: ROW_COPY.reopen, press: { id: d.id, action: "undo" } } : null;
}
function recLineOf(item) {
  return item?.rec && item.recReason ? `Why ${item.rec}: ${item.recReason}` : null;
}
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  if (!descriptions)
    return [];
  return actions.flatMap((a) => {
    if (a.press.action !== "answer" || !Object.hasOwn(descriptions, a.press.option))
      return [];
    const description = descriptions[a.press.option];
    return [{ label: clipLabel(a.press.option, OPTION_LABEL_CHARS), description, isFolded: a.isFolded }];
  });
}
function shownOptionDescriptions(row, isShowingAll) {
  return row.optionDescriptions.filter((o) => isShowingAll || !o.isFolded);
}
function rowHandle(row) {
  return row.number === null ? "•" : `${row.number})`;
}
function rowTitle(row, look) {
  return isTerminalLike(look) && row.number !== null ? `${rowHandle(row)} ${row.title}` : row.title;
}
function replyHint(row, agent) {
  return row.replyKind === "answer" ? "Your answer" : `Your reply to ${agent}`;
}
function actionLabel(action, fits) {
  if (!action.isPrimary)
    return action.label;
  const marked = `${action.label} (recommended)`;
  return fits && !fits(marked) ? action.label : marked;
}
function fieldExit(row) {
  return row.state.is === "held" ? "discard" : "cancel";
}
function isWaitingRow(row) {
  return row.state.is === "open";
}
function waitingCount(rows) {
  return rows.filter((r) => r !== undefined && isWaitingRow(r)).length;
}
function isHandedOffDone(row) {
  const f = row.feedback;
  return row.state.is === "handedOff" && (f?.is === "done" || f?.is === "local" && f.result.state === "done");
}
var RUNNING_RESULT = { text: RUNNING_MARK, isRunning: true };
function rowResultMark(row) {
  if (row.state.is === "settled")
    return settledMark(row.state);
  const f = row.feedback;
  if (row.state.is === "open" && f?.is === "working")
    return RUNNING_RESULT;
  if (row.state.is !== "handedOff" || !f)
    return null;
  if (f.is === "sending" || f.is === "queued")
    return RUNNING_RESULT;
  return isHandedOffDone(row) ? { text: SUBJECT_MARKS.done.mark, isRunning: false, tone: "done" } : { text: "", isRunning: false };
}
function isSendMoving(delivery) {
  return delivery === "sending" || delivery === "queued";
}
function closedShown(closed, drawnSettled, isAllShown = false) {
  const listed = closed.filter((d) => !drawnSettled.has(d.id));
  return isAllShown ? listed : listed.slice(0, CLOSED_SHOWN);
}
function closedTotal(closed, drawnSettled) {
  return closed.filter((d) => !drawnSettled.has(d.id)).length;
}
function foldLabel(total) {
  return `${total} closed`;
}
function earlierLabel(total, shown) {
  return total > shown ? `Show ${total - shown} earlier` : null;
}
function shortAgo(ms) {
  const age = ago(ms);
  return age === "just now" ? "now" : age.replace(/ ago$/, "");
}
function sendStepOf(delivery) {
  return delivery === "queued" || delivery === "unconfirmed" ? delivery : delivery === "sending" ? "sending" : "arrived";
}
function replyLine(words) {
  return words.replace(/\s+/g, " ").trim();
}
function deliveryLabel(step, label, reply) {
  if (reply !== undefined) {
    const words = replyLine(reply);
    switch (step) {
      case "sending":
        return `Sending reply: ${words}`;
      case "queued":
        return `Queued reply: ${words}`;
      case "unconfirmed":
        return `Reply not confirmed: ${words}`;
      case "arrived":
        return `Replied: ${words}`;
    }
  }
  switch (step) {
    case "queued":
      return `Queued: ${label}`;
    case "unconfirmed":
      return `Not confirmed: ${label}`;
    default:
      return label;
  }
}
function settledMark(state) {
  return closedMark(state.closedAs, state.delivery);
}
function closedMark(state, delivery) {
  if (isSendMoving(delivery))
    return RUNNING_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function canUndoRefused(delivery) {
  return delivery !== null && typeof delivery === "object" && delivery.canUndo;
}
function settledTone(state) {
  return state.delivery === null && state.closedAs === "handled" ? "done" : "muted";
}
function settledLabel(label, delivery, reply) {
  if (delivery && typeof delivery === "object")
    return `${label} · Not sent: ${delivery.error}`;
  return deliveryLabel(sendStepOf(delivery), label, reply);
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(c.outcome);
}

// ../hooks/feedback.ts
function markedFeedbackText(f, isMarkDone, look) {
  return f.is === "done" && isMarkDone ? f.label : feedbackText(f, look);
}
function rowFeedbackText(row, look) {
  const f = row.feedback;
  if (!f)
    return null;
  if (!isHandedOffDone(row))
    return feedbackText(f, look);
  return f.is === "done" ? f.label : f.is === "local" ? localText(f.result, look) : feedbackText(f, look);
}
function pressUnderWaySince(f) {
  if (f?.is === "working" || f?.is === "sending")
    return f.at;
  return f?.is === "local" && f.result.state === "pending" ? f.result.at : null;
}
function feedbackOf(id, last, note, turns, now, reportedAt) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS))
    return { is: "local", result };
  if (!last || last.kind === "local")
    return null;
  const delivery = last.delivery;
  const pending = pendingDeliveryAt(last, now);
  if (pending === "queued" || pending === "unconfirmed")
    return { is: pending, label: deliveryLabel(pending, last.text, last.reply), at: last.at };
  if (delivery?.state === "failed")
    return { is: "notSent", reason: delivery.reason, retry: retryOf(id, last) };
  const isAwaiting = isAwaitingReply(last, turns);
  const isUnreported = last.action === "compare" && !(reportedAt !== undefined && reportedAt >= last.at);
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS;
  const working = WORKING_LABELS[last.action];
  if (last.kind === "talk" && working && (isAwaiting || isUnreported && !isPastLimit))
    return { is: "working", label: working, at: last.at };
  if (pending === "sending")
    return { is: "sending", label: deliveryLabel("sending", last.text, last.reply), at: last.at };
  if (isUnreported)
    return { is: "noComparison", at: last.at };
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last))
    return { is: "stillOpen", at: last.at };
  const isHandedStep = last.kind === "handoff" && last.action.startsWith("step-");
  return {
    is: "done",
    label: deliveryLabel("arrived", doneLabel(last), last.reply),
    at: last.at,
    ...isHandedStep ? { isHandedStep: true } : {},
    ...STILL_WAITING_AFTER.has(last.action) ? { isStillWaiting: true } : {}
  };
}
function feedbackIn(id, state, last, note, turns, now, reportedAt) {
  if (state.is === "settled")
    return null;
  const f = feedbackOf(id, last, note, turns, now, reportedAt);
  if (state.is !== "held")
    return f;
  const isFailedReply = f?.is === "notSent" && last?.action === "type" && last.at >= state.at;
  return f?.is === "note" || isFailedReply ? f : { is: "closed", label: state.label, at: state.at };
}
function pressFeedbackIn(id, state, last, turns, now, reportedAt) {
  return feedbackIn(id, state, last, undefined, turns, now, reportedAt);
}
var fixLabel = (f) => f.kind === "opportunity" ? "Do it" : "Fix";
var WORKING_LABELS = {
  explain: "Explaining…",
  compare: "Comparing…",
  discuss: "Discussing…",
  "thread-discuss": "Discussing…",
  "thread-draft": "Drafting a reply…",
  "pr-rank-again": "Ranking…"
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
  "pr-address-all": (text) => text.replace(/^Address\b/, "Addressed"),
  "check-fix": () => "Asked to fix",
  "pr-rank-again": () => "Ranked"
};
function doneLabel(last) {
  return DONE_LABELS[last.action]?.(last.text) ?? last.text;
}
var STILL_WAITING_AFTER = new Set(["check-fix"]);
function isFailure(f) {
  return f?.is === "notSent" || f?.is === "local" && f.result.state === "failed";
}
function hasAge(f) {
  return f.is === "done" || f.is === "working" || f.is === "stillOpen" || f.is === "noComparison" || f.is === "sending" || f.is === "queued" || f.is === "unconfirmed" || f.is === "closed";
}
function isPressOut(f) {
  return f?.is === "working" || f?.is === "sending" || f?.is === "queued" || f?.is === "unconfirmed" || f?.is === "local" && f.result.state === "pending";
}
function pressOutAction(last, f) {
  if (!isPressOut(f))
    return null;
  return (f?.is === "local" ? f.result.action : last?.action) ?? null;
}
function outAction(last, f) {
  const action = f?.is === "unconfirmed" ? null : pressOutAction(last, f);
  return action === "type" ? null : action;
}
function isAgain(last, action, isOut) {
  return isRepeatOf(last, action) && (!isOut || last?.isRepeat === true);
}
function isStatusUnderActions(f, isOpen) {
  const isDoneStillWaiting = f?.is === "done" && f.isStillWaiting === true;
  return isOpen && (isPressOut(f) || isDoneStillWaiting);
}
var runIt = (look) => isTerminalLike(look) ? "Run it in a terminal, or type ! and paste." : "Run it in Terminal.";
var VERBS = {
  open: { pending: "Opening", done: "Opened", failed: "open" },
  copy: { pending: "Copying", done: "Copied", failed: "copy" },
  "refresh-prs": { pending: "Refreshing", done: "Refreshed", failed: "refresh" },
  rerun: { pending: "Starting a re-run of", done: "Started a re-run of", failed: "start a re-run of" }
};
function localText(r, look) {
  const isPrs = r.parts.length > 1 && r.parts.every((p) => p.kind === "open" && p.error === null && /^PR #\d+$/.test(p.name));
  const parts = isPrs ? [{ ...r.parts[0], name: `${r.parts.length} PRs` }] : r.parts;
  if (r.state === "pending")
    return `${parts.map((p) => `${VERBS[p.kind].pending} ${p.name}`).join(DOT)}…`;
  const text = parts.map((p) => p.error === null ? `${VERBS[p.kind].done} ${p.name}` : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`).join(DOT);
  if (r.state === "failed")
    return text;
  const isCommand = parts.some((p) => p.kind === "copy" && p.isCommand);
  return `${text}${isCommand ? `. ${runIt(look)}` : ""}`;
}
function feedbackText(f, look) {
  switch (f.is) {
    case "note":
      return noteText();
    case "local":
      return f.result.state === "done" ? `✓ ${localText(f.result, look)}` : localText(f.result, look);
    case "sending":
      return f.label;
    case "queued":
      return f.label;
    case "unconfirmed":
      return f.label;
    case "notSent":
      return `Not sent: ${f.reason}`;
    case "done":
      return f.isHandedStep ? `✓ Handed off: ${f.label}` : `✓ ${f.label}`;
    case "working":
      return f.label;
    case "stillOpen":
      return "Still open";
    case "noComparison":
      return "No comparison came back";
    case "closed":
      return f.label;
  }
}

// ../hooks/gh.ts
var GH_TIMEOUT_MS = 20000;

// ../hooks/pr-fetch.ts
var MAX_PRS = 12;
var CLOSED_PR_REFRESH_MS = 60 * 60000;
var LIMIT_RETRY_MS = 5 * 60000;
function tabPrs(links) {
  const order = links.prOrder;
  const ranked = (order?.refs ?? []).filter((ref) => !links.prs.includes(ref) && !order?.dismissed.includes(ref));
  return [...links.prs, ...ranked];
}
function itemPrSteps(item, prState, linked) {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked;
  return prSteps(item, refs.map((ref) => ({ ref, url: prState.views[ref]?.url ?? null })));
}
function isLeftOut(prState, ref) {
  const view = prState.views[ref];
  return view !== undefined && !isKeptPr(view);
}
function splitLinked(prState, links) {
  const ranked = new Set(links.prOrder?.refs ?? []);
  const shown = tabPrs(links).filter((ref) => !isLeftOut(prState, ref));
  const unranked = shown.filter((ref) => !ranked.has(ref));
  const older = unranked.slice(0, Math.max(0, unranked.length - MAX_PRS));
  return { tracked: shown.filter((ref) => !older.includes(ref)), older };
}
function olderPrsText(prState, links) {
  const { older } = splitLinked(prState, links);
  if (older.length === 0)
    return null;
  const numbers = older.map((ref) => `#${parseRef(ref).number}`).reverse();
  return `${older.length} older ${older.length === 1 ? "PR" : "PRs"} not shown: ${numbers.join(", ")}`;
}
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`;

// ../hooks/pr-press.ts
function isPrPress(p) {
  return "ref" in p || p.action === "pr-rank-again" || p.action === "pr-refresh" || p.action === "pr-clear-finished";
}
function commentEffect(pr, t) {
  return { kind: "open", target: t.reply?.url || t.url || pr.url, name: "the comment" };
}
function prPageEffect(pr) {
  return { kind: "open", target: pr.url, name: `PR #${pr.number}` };
}
function logEffect(pr, check) {
  return { kind: "open", target: check.url ?? pr.url, name: check.url ? "the log" : `PR #${pr.number}` };
}
var RERUN_LABEL = "Re-run";
function rerunEffect(pr, c) {
  const run = c.bucket === "cancelled" ? runOf(c) : null;
  if (!run)
    return null;
  return failedSibling(pr, c) ? null : { kind: "rerun", ...run, name: c.workflow || c.name };
}
function sameRunChecks(pr, c) {
  const run = runOf(c);
  return run ? pr.checks.filter((o) => checkKey(o) !== checkKey(c) && isSameRun(run, runOf(o)) && rerunEffect(pr, o)) : [];
}
var PR_FIX_LABELS = {
  "pr-conflicts": "Resolve conflicts",
  "check-fix": "Fix"
};
var PR_READ_FIRST_LABELS = {
  ...PR_FIX_LABELS,
  "check-rerun": RERUN_LABEL
};
function isPrReadFirstPress(p) {
  return p.action === "pr-conflicts" || p.action === "check-fix" || p.action === "check-rerun";
}
function readFirstEffect(pr) {
  return { kind: "refresh-prs", name: `PR #${pr.number}` };
}
function prPressEffect(pr, p) {
  if (isPrReadFirstPress(p))
    return readFirstEffect(pr);
  switch (p.action) {
    case "thread-open": {
      const t = pr.threads.find((x) => x.id === p.thread);
      return t ? commentEffect(pr, t) : null;
    }
    case "pr-open":
      return prPageEffect(pr);
    case "log": {
      const check = pr.checks.find((c) => checkKey(c) === p.check);
      return check ? logEffect(pr, check) : null;
    }
    default:
      return null;
  }
}
function prRowId(p) {
  if (p.action === "pr-rank-again")
    return RANK_AGAIN_ID;
  if (p.action === "pr-refresh")
    return PR_REFRESH_ID;
  if (p.action === "pr-clear-finished")
    return CLEAR_FINISHED_ID;
  if ("check" in p)
    return checkRowId(p.ref, p.check);
  if ("thread" in p)
    return threadRowId(p.ref, p.thread);
  return prMarkId(p.ref);
}
function pressRowId(p) {
  return isPrPress(p) ? prRowId(p) : p.id;
}
function prRetryOf(last, ref, thread, check = null) {
  if (last?.delivery?.state !== "failed")
    return null;
  const a = last.action;
  if (check !== null)
    return a === "check-fix" ? { press: { action: a, ref, check }, kind: last.kind } : null;
  if (thread !== null && (a === "thread-address" || a === "thread-draft" || a === "thread-discuss"))
    return { press: { action: a, ref, thread }, kind: last.kind };
  if (thread === null && (a === "pr-conflicts" || a === "pr-address-all" || a === "pr-merge"))
    return { press: { action: a, ref }, kind: last.kind };
  return null;
}
function lastPressOf(presses, rowId) {
  const last = presses.lastActions[rowId];
  const feedback = pressFeedbackIn(rowId, { is: "open" }, last, presses.turns, presses.now);
  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) };
}
function again(row, action, label) {
  return isAgain(row.last, action, row.pressing === action) ? `${label} again` : label;
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}
function retryAction(retry) {
  return retry ? [{ press: retry.press, label: "Try again", kind: retry.kind, emphasis: "normal", icon: "retry", isRetry: true }] : [];
}

// ../hooks/pr-refresh.ts
var PR_REFRESH_LABEL = "Refresh PRs";
function fetchFailureNotice(f) {
  switch (f.kind) {
    case "limit":
      return f.resetsAt === null ? "GitHub's limit is used up. The PRs refresh once it resets." : `GitHub's limit is used up. The PRs refresh after it resets at ${clockTime(f.resetsAt)}.`;
    case "unreachable":
      return "Could not reach GitHub. The PRs show as last read.";
    case "timed-out":
      return `${GH_TIMED_OUT_TEXT}. The PRs show as last read.`;
    case "error":
      return `Could not read the PRs: ${f.text}. They show as last read.`;
  }
}
function fetchFailureWords(f) {
  switch (f.kind) {
    case "limit":
      return f.resetsAt === null ? "GitHub's limit is used up" : `GitHub's limit resets at ${clockTime(f.resetsAt)}`;
    case "unreachable":
      return "could not reach GitHub";
    case "timed-out":
      return GH_TIMED_OUT_TEXT;
    case "error":
      return f.text;
  }
}
function tabWideProblem(prs) {
  if (prs.isGhMissing)
    return "gh was not found";
  if (prs.isGhSignedOut)
    return "gh is not signed in";
  return prs.failure ? fetchFailureWords(prs.failure) : null;
}
function unreadPrs(prs, links) {
  const { tracked } = splitLinked(prs, links);
  const refs = prs.branchRef && !tracked.includes(prs.branchRef) ? [...tracked, prs.branchRef] : tracked;
  return refs.flatMap((ref) => {
    const view = prs.views[ref];
    if (view?.error)
      return [{ ref, why: view.error, hasBlock: true }];
    const why = view ? null : prs.unread?.[ref];
    return why ? [{ ref, why, hasBlock: false }] : [];
  });
}
function refreshProblem(prs, links) {
  const tabWide = tabWideProblem(prs);
  if (tabWide)
    return tabWide;
  const unread = unreadPrs(prs, links);
  const [only] = unread;
  if (!only)
    return null;
  if (unread.length === 1)
    return `#${parseRef(only.ref).number} could not be read${only.hasBlock ? "" : `: ${only.why}`}`;
  const numbers = unread.map((u) => `#${parseRef(u.ref).number}`);
  const last = numbers.pop();
  return `${numbers.join(", ")} and ${last} could not be read`;
}
function prRefreshView(prs, links, presses, shownSince) {
  const problem = refreshProblem(prs, links);
  const row = lastPressOf(presses, PR_REFRESH_ID);
  const feedback = pressFeedbackIn(PR_REFRESH_ID, { is: "open" }, row.last, presses.turns, presses.now);
  const isMadeGood = problem === null && feedback?.is === "local" && feedback.result.state === "failed";
  const isPressShown = feedback !== null && !isMadeGood && row.last !== undefined && (row.pressing !== null || isShownSince(row.last.at, shownSince));
  if (problem === null && !isPressShown)
    return null;
  return {
    text: problem !== null && tabWideProblem(prs) === null ? problem : null,
    actions: problem === null ? [] : prRefreshActions(row),
    showsPress: isPressShown
  };
}
function prRefreshActions(row) {
  return withOut(row, [
    { press: { action: "pr-refresh" }, label: PR_REFRESH_LABEL, kind: "local", emphasis: "normal", icon: "retry" }
  ]);
}

// ../hooks/pr-rows.ts
function prThreadId(pr, t) {
  return threadRowId(pr.ref, t.id);
}
function prCheckId(pr, check) {
  return checkRowId(pr.ref, checkKey(check));
}
function threadRowId(ref, thread) {
  return `${ref} thread ${thread}`;
}
function checkRowId(ref, check) {
  return `${ref} check ${check}`;
}
function prMarkId(ref) {
  return `pr:${ref}`;
}
function isBlockPressShown(pr, lastActions) {
  const result = lastActions[prMarkId(pr.ref)]?.result;
  if (result?.action !== "check-rerun")
    return true;
  const isSamePress = (r) => r !== undefined && (r.pressId !== undefined ? r.pressId === result.pressId : r.at === result.at);
  return !blockingChecks(pr).some((c) => isSamePress(lastActions[prCheckId(pr, c)]?.result));
}
var GH_MISSING_TEXT = "The inbox could not find gh. It needs gh to read your PRs.";
var GH_SIGNED_OUT_TEXT = "gh is not signed in to GitHub. Run gh auth login so the inbox can read your PRs.";
function ghNoticeOf(gh) {
  if (gh.isGhMissing)
    return { kind: "gh-missing", text: GH_MISSING_TEXT };
  if (gh.isGhSignedOut)
    return { kind: "gh-signed-out", text: GH_SIGNED_OUT_TEXT };
  if (gh.failure)
    return { kind: gh.failure.kind === "limit" ? "gh-limited" : "gh-failed", text: fetchFailureNotice(gh.failure) };
  return null;
}
function prsEmptyHint(place) {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`;
}
function prsEmptyText(prs, place) {
  return {
    title: prs.isFetching ? "Checking for PRs…" : "No PRs",
    hint: ghNoticeOf(prs)?.text ?? prsEmptyHint(place)
  };
}
function prRefreshFailedText(error) {
  return `Last refresh failed: ${error}`;
}
var RANK_AGAIN_ID = "pr:order";
var PR_REFRESH_ID = "pr:refresh";
var CLEAR_FINISHED_ID = "pr:finished";
var PR_GROUP_TITLES = { threads: "Review threads", checks: "Failing checks", cancelled: "Cancelled checks" };
function prBlockRows(pr, isSettled, rowOf) {
  const threads = isSettled ? [] : waitingThreads(pr).map(rowOf.thread);
  const checks = isSettled ? [] : failingChecks(pr).map(rowOf.check);
  const cancelled = isSettled ? [] : cancelledChecks(pr).map(rowOf.check);
  return { threads, checks, cancelled, rows: [...threads, ...checks, ...cancelled] };
}
function threadRowText(pr, t, lastActions) {
  const isSent = threadSentIn(lastActions)(pr, t);
  const isChanged = !isSent && t.isLinesChanged;
  return {
    mark: threadMark(isSent ? lastActions[prThreadId(pr, t)]?.delivery : null),
    fold: isSent || isChanged ? t.isLinesChanged ? { note: `Lines changed since this comment${DOT}still open on GitHub` } : {} : null,
    title: clipLabel(commentParts(t.body).head, THREAD_TITLE_CHARS),
    meta: [
      threadWhere(t, baseName(t.path)),
      isChanged ? "Lines changed" : "",
      t.reply ? `@${t.reply.author}: ${commentLine(t.reply.body)}` : `@${t.author}`
    ].filter(Boolean).join(DOT)
  };
}
function threadMark(delivery) {
  if (delivery === null)
    return { ...PR_MARKS.waiting, isDone: false, isRunning: false };
  if (delivery?.state === "queued")
    return { text: RUNNING_MARK, tone: null, isDone: false, isRunning: true };
  if (delivery?.state === "unconfirmed")
    return { text: "", tone: null, isDone: false, isRunning: false };
  return { ...PR_MARKS.sent, isDone: true, isRunning: false };
}
function checkRowText(pr, c) {
  const sibling = failedSibling(pr, c);
  return {
    mark: { ...c.bucket === "cancelled" ? PR_MARKS.cancelled : PR_MARKS.failing, isDone: false, isRunning: false },
    lead: c.workflow || null,
    title: c.name,
    meta: checkRunText(c),
    fold: sibling ? { note: `Stopped when ${checkKey(sibling)} failed. Fixing that one runs this again.` } : null
  };
}
var PR_QUOTE_CHARS = 1200;
function splitFollowUps(actions) {
  return { keys: actions.filter((a) => !a.isFollowUp), more: actions.filter((a) => a.isFollowUp) };
}
function checkRunText(c) {
  const ended = c.bucket === "cancelled" ? "Cancelled" : "Failed";
  return c.startedAt !== undefined && c.finishedAt !== undefined ? `${ended} after ${took(c.finishedAt - c.startedAt)}` : ended;
}
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}
var PR_TONES = {
  ready: "done",
  blocked: "needsYou",
  waiting: null,
  draft: null,
  merged: "findings",
  closed: "error"
};

// ../hooks/saved-check-keys.ts
function savedCheckKey(checks, name) {
  if (checks.some((c) => checkKey(c) === name))
    return name;
  const named = checks.filter((c) => c.name === name);
  return named.length === 1 ? checkKey(named[0]) : name;
}
var CHECK_ROW_ID = /^(\S+) check (.+)$/;
function savedRowId(id, views) {
  const m = CHECK_ROW_ID.exec(id);
  return m ? checkRowId(m[1], savedCheckKey(views[m[1]]?.checks ?? [], m[2])) : id;
}
function withCheckKeys(s, views) {
  const order = s.ledger.prOrder;
  const statuses = order?.statuses;
  const upgradedStatuses = statuses && Object.fromEntries(Object.entries(statuses).map(([ref, status]) => [
    ref,
    { ...status, failing: status.failing.map((name) => savedCheckKey(views[ref]?.checks ?? [], name)) }
  ]));
  return {
    ...s,
    ledger: order ? { ...s.ledger, prOrder: { ...order, statuses: upgradedStatuses } } : s.ledger,
    sent: s.sent.map((x) => x.row === null ? x : { ...x, row: savedRowId(x.row, views) }),
    lastActions: Object.fromEntries(Object.entries(s.lastActions).map(([id, last]) => {
      const upgraded = savedRowId(id, views);
      return [upgraded in s.lastActions ? id : upgraded, last];
    }))
  };
}

// ../hooks/session-files.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_FAILURE = { lastFailure: null, recoveredAt: null };
var NO_CALL_FAILURES = { ledger: NO_FAILURE, status: NO_FAILURE };
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
      failedAttempts: 0,
      isConversationUnreadable: false,
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
    callFailures: NO_CALL_FAILURES,
    lastOverviewCallAt: null,
    overviewTurn: 0,
    hostTasks: [],
    dialogQuestions: [],
    toolFields: null
  };
}
var SESSION_ID = /^[\w-]{1,100}$/;
var SESSION_FILE = /^[\w-]{1,100}\.json$/;
function sessionFile(sessionId) {
  if (!SESSION_ID.test(sessionId))
    throw new Error(`Not a session id: ${sessionId}`);
  return `${sessionId}.json`;
}
var isSessionFile = (name) => SESSION_FILE.test(name);
function savedToolFields(saved) {
  const isNames = (v) => Array.isArray(v) && v.every((f) => typeof f === "string");
  const fields = saved;
  return fields && isNames(fields.record) && isNames(fields.close) && isNames(fields.order_prs) ? fields : null;
}
function withoutStatedStep(presence) {
  const { statedStep: _statedStep, ...rest } = presence ?? {};
  return rest;
}
function upgradeSession(saved) {
  const views = saved.prViews?.views ?? {};
  return withCheckKeys(sessionFields(saved, views), views);
}
function sessionFields(saved, views) {
  const base = emptySession();
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
    ...saved.lastHerdrPress && { lastHerdrPress: saved.lastHerdrPress },
    heldRows: saved.heldRows ?? [],
    shownSince: saved.shownSince ?? null,
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      views: Object.fromEntries(Object.entries(views).map(([ref, pr]) => [
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
      ])),
      isFetching: false
    },
    stop: saved.stop ?? null,
    overviewFailure: saved.overviewFailure ?? null,
    callFailures: { ...NO_CALL_FAILURES, ...saved.callFailures },
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    overviewTurn: saved.overviewTurn ?? 0,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map((q) => ({ ...q, descriptions: q.descriptions ?? {} })),
    toolFields: savedToolFields(saved.toolFields)
  };
}

// ../hooks/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries([STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null]));
var HERDR_FORMAT = 1;
var SESSION_FIELDS = Object.keys(emptySession());
function publishedSessionsFolder(appHome) {
  return `${appHome}/inbox/sessions`;
}
function publishedSessionPath(appHome, sessionId) {
  return `${publishedSessionsFolder(appHome)}/${sessionFile(sessionId)}`;
}
function pressFolder(appHome, sessionId) {
  sessionFile(sessionId);
  return `${appHome}/inbox/presses/${sessionId}`;
}

// ../hooks/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../hooks/pr-views.ts
var PR_DISMISSED_LABEL = "Dismissed";
var PR_MERGED_LABEL = "Merged";
var PR_CLOSED_LABEL = "Closed";
function isTracked(prState, links, ref) {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref;
}
function dismissal(lastActions, ref) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" ? mark : null;
}
function dismissedAt(lastActions, ref) {
  return dismissal(lastActions, ref)?.at ?? null;
}
function isDismissed(lastActions, ref) {
  return dismissedAt(lastActions, ref) !== null;
}
function openPrViews(drawn) {
  return drawn.filter((d) => d.state.is === "open").map((d) => d.pr);
}
function settledPrState(mark, now, settleWindowMs) {
  const closed = mark.text === PR_MERGED_LABEL ? { how: "update", outcome: PR_MERGED_LABEL } : mark.text === PR_CLOSED_LABEL ? { how: "expired", outcome: PR_CLOSED_LABEL } : { how: "dismissed", outcome: PR_DISMISSED_LABEL };
  const state = closedRowState(closed, mark.at, now, settleWindowMs, null);
  return { ...state, canUndo: isUndoLeft(mark.at, now, settleWindowMs), offersUndo: true };
}
function drawnPrs(prState, links, lastActions, placing) {
  const { now, settleWindowMs } = placing;
  const ranked = links.prOrder?.refs ?? [];
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr) => {
    if (isTracked(prState, links, pr.ref))
      return [{ pr, state: { is: "open" } }];
    const mark = dismissal(lastActions, pr.ref);
    if (mark === null)
      return [];
    const state = settledPrState(mark, now, settleWindowMs);
    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : [];
  });
  return drawn.map((d) => ({ ...d, isRanked: rankOf(d.pr, ranked) !== null }));
}

// ../hooks/pr-order.ts
var RANK_AGAIN_LABEL = "Rank again";
var OTHER_PRS_TEXT = "Other PRs";
function otherPrsStart(drawn) {
  const at = drawn.findIndex((d) => !d.isRanked);
  return at > 0 && drawn[at - 1]?.isRanked ? drawn[at] ?? null : null;
}
function prOrderText(order, drawn, now) {
  const isRanking = drawn.some((d) => d.isRanked);
  if (!order || !isRanking)
    return null;
  return `${order.label ?? "Order"}${DOT}set by ${order.by} ${ago(now - order.at)}`;
}
function rankedStatusOf(pr) {
  return {
    status: readiness(pr).status,
    threads: waitingThreads(pr).map((t) => t.id),
    failing: blockingChecks(pr).map(checkKey)
  };
}
function hasChanged(was, is) {
  return is.status !== was.status || is.threads.some((id) => !was.threads.includes(id)) || is.failing.some((name) => !was.failing.includes(name));
}
function changedRankedPrs(order, prs) {
  const statuses = order.statuses ?? {};
  return inPrOrder(prs, order.refs).filter((pr) => {
    const was = statuses[pr.ref];
    return rankOf(pr, order.refs) !== null && was !== undefined && hasChanged(was, rankedStatusOf(pr));
  });
}
function prOrderView(order, drawn, presses, shownSince) {
  const title = prOrderText(order, drawn, presses.now);
  if (!order || title === null)
    return null;
  const count = changedRankedPrs(order, openPrViews(drawn)).length;
  const row = lastPressOf(presses, RANK_AGAIN_ID);
  const last = row.last;
  const isPressShownHere = last !== undefined && (row.pressing !== null || isShownSince(last.at, shownSince));
  const isForThisOrder = last !== undefined && last.at >= order.at;
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

// ../hooks/pr-tab.ts
function threadActions(pr, t, presses) {
  const row = lastPressOf(presses, threadRowId(pr.ref, t.id));
  const on = { ref: pr.ref, thread: t.id };
  return withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, t.id)),
    {
      press: { action: "thread-address", ...on },
      label: again(row, "thread-address", "Address"),
      kind: "handoff",
      emphasis: "primary",
      hotkey: "a"
    },
    {
      press: { action: "thread-draft", ...on },
      label: again(row, "thread-draft", "Draft reply"),
      kind: "talk",
      emphasis: "normal",
      hotkey: "r"
    },
    {
      press: { action: "thread-open", ...on },
      label: "Open comment",
      kind: "local",
      emphasis: "normal",
      icon: "open",
      hotkey: "o"
    },
    {
      press: { action: "thread-discuss", ...on },
      label: again(row, "thread-discuss", "Discuss"),
      kind: "talk",
      emphasis: "quiet",
      hotkey: "d",
      isFollowUp: true
    }
  ]);
}
function checkActions(pr, c, presses) {
  const row = lastPressOf(presses, prCheckId(pr, c));
  const on = { ref: pr.ref, check: checkKey(c) };
  const isCancelled = c.bucket === "cancelled";
  const isRunRerunOut = sameRunChecks(pr, c).some((o) => lastPressOf(presses, prCheckId(pr, o)).out === "check-rerun");
  const mainMove = isCancelled ? rerunEffect(pr, c) ? [
    {
      press: { action: "check-rerun", ...on },
      label: RERUN_LABEL,
      kind: "local",
      emphasis: "primary",
      hotkey: "a"
    }
  ] : [] : [
    {
      press: { action: "check-fix", ...on },
      label: again(row, "check-fix", PR_FIX_LABELS["check-fix"]),
      kind: "handoff",
      emphasis: "primary",
      hotkey: "a"
    }
  ];
  const actions = withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, null, on.check)),
    ...mainMove,
    {
      press: { action: "log", ...on },
      label: "Open log",
      kind: "local",
      emphasis: "normal",
      icon: "open",
      hotkey: "o"
    }
  ]);
  return isRunRerunOut ? actions.map((a) => a.press.action === "check-rerun" ? { ...a, isOut: true } : a) : actions;
}
function prBlockActions(pr, isThreadSent, branchRef, presses) {
  const row = lastPressOf(presses, prMarkId(pr.ref));
  const { status } = readiness(pr, isThreadSent);
  const waitingOn = threadsOnYou(pr, isThreadSent).length;
  const moves = [
    ...status === "ready" ? [
      {
        press: { action: "pr-merge", ref: pr.ref },
        label: again(row, "pr-merge", "Merge"),
        kind: "handoff"
      }
    ] : [],
    ...pr.state === "OPEN" && pr.mergeable === "CONFLICTING" ? [
      {
        press: { action: "pr-conflicts", ref: pr.ref },
        label: again(row, "pr-conflicts", PR_FIX_LABELS["pr-conflicts"]),
        kind: "handoff"
      }
    ] : [],
    ...waitingOn > 1 ? [
      {
        press: { action: "pr-address-all", ref: pr.ref },
        label: again(row, "pr-address-all", `Address all ${waitingOn} threads`),
        kind: "handoff"
      }
    ] : []
  ];
  return withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, null)),
    ...moves.map((m, n) => ({ ...m, emphasis: n === 0 ? "primary" : "normal" })),
    { press: { action: "pr-open", ref: pr.ref }, label: "Open PR", kind: "local", emphasis: "normal", icon: "open" },
    ...pr.ref === branchRef ? [] : [
      {
        press: { action: "pr-dismiss", ref: pr.ref },
        label: "Dismiss",
        kind: "mark",
        emphasis: "quiet"
      }
    ]
  ]);
}
function finishedTabPrs(prState, links) {
  return splitLinked(prState, links).tracked.filter((ref) => {
    const view = prState.views[ref];
    return view !== undefined && view.state !== "OPEN" && ref !== prState.branchRef;
  });
}
function prClearActions(prState, links) {
  if (finishedTabPrs(prState, links).length === 0)
    return [];
  return [
    {
      press: { action: "pr-clear-finished" },
      label: "Clear merged and closed",
      kind: "mark",
      emphasis: "normal",
      hotkey: "m",
      isOut: false
    }
  ];
}

// ../hooks/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var FOLLOW_UPS = new Set([
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
function latestUndo(undos) {
  return undos.reduce((latest, u) => latest === null || u.at >= latest.at ? u : latest, null);
}
function tabUndos(tab, lists, prs) {
  return tab === "prs" ? prUndos(prs) : listUndos(tab === "needsYou" ? [...lists.questions, ...lists.tasks] : lists.findings);
}
function listUndos(entries) {
  return entries.flatMap((x) => {
    const undo = "settled" in x ? x.settled.actions.find((a) => a.press.action === "undo") : undefined;
    return undo && "settled" in x ? [{ press: undo.press, at: x.state.at }] : [];
  });
}
function prUndos(prs) {
  return prs.flatMap((d) => d.state.is === "settled" && d.state.canUndo ? [{ press: { action: "pr-undo", ref: d.pr.ref }, at: d.state.at }] : []);
}
function actionsOf(row, last, state, feedback) {
  const { id, item, steps } = row;
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const action = (press, label, kind, flags = {}) => {
    const pressAction = actionId(press);
    return {
      press,
      label: press.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press.action === "done" || press.action === "address" ? "primary" : press.action === "discuss" || press.action === "explain" || press.action === "compare" || press.action === "dismiss" || press.action === "discard" ? "quiet" : "normal",
      ...press.action === "done" ? { icon: "done" } : press.action === "step" && stepIconKind(steps[press.step]) ? { icon: stepIconKind(steps[press.step]) } : {},
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {},
      isOut: out === pressAction
    };
  };
  if (state.is === "settled")
    return state.canUndo ? [action({ action: "undo", id }, ROW_COPY.undo, "view")] : [];
  if (state.is === "held")
    return [
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "discard", id }, ROW_COPY.discard, "view")
    ];
  const stepActions = steps.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
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
    ...options.map((option, n) => action({ action: "answer", id, option }, clipLabel(option, OPTION_LABEL_CHARS), "mark", {
      isPrimary: option === item.rec,
      isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
    })),
    ...stepActions,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    action({ action: "explain", id }, "Explain", "talk"),
    ...showsCompare(item) ? [action({ action: "compare", id }, "Compare", "talk")] : [],
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}
function drawnLists(v, isSettledDrawn, toRow) {
  const entries = (rows) => rows.flatMap((r) => {
    if (r.state.is === "settled")
      return isSettledDrawn(r.id) ? [{ settled: r, state: r.state }] : [];
    const row = toRow(r);
    return row === null ? [] : [{ row }];
  });
  const questions = entries(v.needsYou.questions);
  const tasks = entries(v.needsYou.tasks);
  const findingGroups = Object.keys(FINDING_GROUPS).map((kind) => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    entries: entries(v.findings.rows.filter((r) => r.finding?.kind === kind))
  }));
  const findings = findingGroups.flatMap((g) => g.entries);
  return {
    questions,
    tasks,
    findings,
    findingGroups,
    byTab: { needsYou: [...rowsIn(questions), ...rowsIn(tasks)], findings: rowsIn(findings) }
  };
}
function firstWaiting(rows) {
  return rows.find((r) => r.isWaiting)?.id ?? null;
}
function steppedIndex(at, step, count) {
  if (count === 0)
    return -1;
  const from = at < 0 ? step > 0 ? -1 : 0 : at;
  return ((from + step) % count + count) % count;
}
function rowAfterClose(rows, closedId) {
  const at = rows.findIndex((r) => r.id === closedId);
  if (at < 0)
    return null;
  return (rows.slice(at + 1).find((r) => r.isWaiting) ?? rows.slice(0, at).reverse().find((r) => r.isWaiting))?.id ?? null;
}
function rowsIn(entries) {
  return entries.flatMap((x) => ("row" in x) ? [x.row] : []);
}
function rowKeyPlan(r, isAllShown) {
  const shown = r.actions.filter((a) => isAllShown || !a.isFolded);
  const folded = r.actions.length - shown.length;
  const lastOption = shown.map((a) => a.press.action).lastIndexOf("answer");
  const keys = [];
  const more = [];
  const retry = r.feedback?.is === "notSent" ? r.feedback.retry : null;
  if (retry) {
    const kind = r.actions.find((a) => actionId(a.press) === actionId(retry))?.kind ?? "talk";
    keys.push({ slot: "retry", press: retry, kind, label: ROW_COPY.retry, emphasis: "normal", icon: "retry" });
  }
  let letters = 0;
  for (const [n, a] of shown.entries()) {
    const { press } = a;
    if (press.action === "answer" || press.action === "step") {
      const hotkey = letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++] } : {};
      keys.push({ slot: "choice", action: { ...a, press }, ...hotkey });
      if (n === lastOption && folded > 0)
        keys.push({
          slot: "allOptions",
          count: r.actions.filter((x) => x.press.action === "answer").length,
          label: ROW_COPY.allOptions(r.actions.filter((x) => x.press.action === "answer").length),
          emphasis: "quiet"
        });
    } else if (a.hotkey)
      (a.isFollowUp ? more : keys).push({
        slot: "action",
        action: a,
        hotkey: a.hotkey
      });
  }
  return { keys, more };
}

// ../hooks/view.ts
var HOLDS_UP_TEXT = "Holds up";
function needsYouOrder(ledger) {
  const newestReplyFirst = (kind) => ledger.items.filter((i) => i.kind === kind).sort((a, b) => b.turn - a.turn);
  return { questions: newestReplyFirst("question"), tasks: newestReplyFirst("task") };
}
function heldSubjectsOf(o, askId) {
  const milestones = o?.goal && !o.goal.isAwaitingMilestones ? o.milestones : [];
  const linkable = [...o?.subjects ?? [], ...milestones];
  return (o?.askSubjects[askId] ?? []).flatMap((id) => linkable.filter((s) => s.id === id && isOpen(s)));
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
  lastTypedMessageAt,
  listInput,
  undoShown
}) {
  const isFindingId = (id) => ledger.findings.some((f) => f.id === id) || ledger.closedFindings.some((f) => f.id === id);
  const isItemId = (id) => ledger.items.some((i) => i.id === id) || ledger.closed.some((c) => c.id === id);
  const pressOutSinceWhere = (isOnTab) => earliestOf(Object.entries(lastActions).map(([id, last]) => isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, turns, now)) : null));
  const placingOn = (pressOutSince) => ({
    shownSince,
    lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    pressOutSince
  });
  const placingFor = {
    needsYou: placingOn(pressOutSinceWhere(isItemId)),
    findings: placingOn(pressOutSinceWhere(isFindingId))
  };
  const isInPlace = (id, at, canUndo, last) => isSettledInPlace({ at, canUndo, delivery: pendingDeliveryAt(last, now) }, isFindingId(id) ? placingFor.findings : placingFor.needsYou, id);
  const pressedSend = (c) => {
    const last = lastActions[c.id];
    return (c.how === "answered" || c.how === "done") && last?.kind === "mark" && last.at === closedAt(c) ? last : undefined;
  };
  const isOpen = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const replyAfter = (c) => {
    const last = lastActions[c.id];
    return last?.action === "type" && last.at >= closedAt(c) && last.delivery?.state !== "failed" && isInPlace(c.id, last.at, false, last) ? last : null;
  };
  const isPressedAnswer = (c) => c.how === "answered" && lastActions[c.id]?.kind === "mark" && lastActions[c.id]?.at === closedAt(c);
  const isOwnClose = (c) => c.how === "done" || c.how === "dismissed" || isPressedAnswer(c);
  const isAnswerHeld = (c) => isPressedAnswer(c) && isHeldSend(lastActions[c.id]) && isUndoLeft(closedAt(c), now, settleWindowMs);
  const isHeld = (c) => {
    const since = replies[c.id];
    return since !== undefined && since <= closedAt(c) && !isOwnClose(c);
  };
  const isDiscarded = (c) => (discarded[c.id] ?? -Infinity) >= closedAt(c);
  const isPlaced = (c) => {
    const at = closedAt(c);
    return replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isInPlace(c.id, at, isAnswerHeld(c) || canUndoClose(c, at, now, settleWindowMs), pressedSend(c)));
  };
  const placedItems = new Map(ledger.closed.filter((d) => d.item && !isOpen(d.id) && isPlaced(d)).map((d) => [d.id, d]));
  const isFixSettled = (id) => {
    const last = lastActions[id];
    return isFixSent(last) && !isInPlace(id, last.at, isUndoLeft(last.at, now, settleWindowMs), last);
  };
  const placedFindings = new Map(ledger.closedFindings.filter((f) => !isOpen(f.id) && !isFixSettled(f.id) && isPlaced(f)).map((f) => [f.id, f]));
  const placed = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => {
    const closed = placedItems.get(id) ?? placedFindings.get(id);
    if (closed) {
      const at = closedAt(closed);
      const reply = replyAfter(closed);
      if (reply)
        return {
          is: "settled",
          label: doneLabel(reply),
          at: reply.at,
          canUndo: false,
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed),
          ...reply.reply !== undefined ? { reply: reply.reply } : {}
        };
      if (isHeld(closed))
        return { is: "held", label: heldLabel(closed), at };
      return closedRowState(closed, at, now, settleWindowMs, "doneNotification" in closed && closed.doneNotification?.error !== undefined ? { error: closed.doneNotification.error, canUndo: isUndoable(closed) } : pendingDeliveryAt(pressedSend(closed), now), isPressedAnswer(closed));
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
    const held = state.is === "open" ? heldSubjectsOf(ledger.overview, row.id) : [];
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held.length > 0 ? `${HOLDS_UP_TEXT} ${held.map((s) => s.name).join(", ")}` : null,
      recLine: state.is === "open" ? recLineOf(row.item) : null,
      contextLine: state.is === "open" ? row.item?.context ?? null : null
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
  const findingRows = [...placed.findings].filter((f) => !isFixSettled(f.id)).reverse().sort(byGroup).map((finding) => rowOf({
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
  }));
  const held = new Set([...questionRows, ...taskRows, ...findingRows].filter((r) => r.state.is === "held").map((r) => r.id));
  const closed = [...ledger.closed].filter((d) => !held.has(d.id)).reverse().map((d) => {
    const delivery = d.doneNotification?.error !== undefined ? { error: d.doneNotification.error, canUndo: isUndoable(d) } : (d.how === "answered" || d.how === "done") && lastActions[d.id]?.kind === "mark" && lastActions[d.id]?.at === d.at ? pendingDeliveryAt(lastActions[d.id], now) : null;
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
      closed: { questions: closed.filter((d) => d.kind === "question"), tasks: closed.filter((d) => d.kind === "task") },
      pressOutSince: placingFor.needsYou.pressOutSince
    },
    findings: {
      count: findingRows.filter(isWaitingRow).length,
      pressOutSince: placingFor.findings.pressOutSince,
      rows: findingRows,
      closed: [
        ...ledger.closedFindings.filter((f) => !held.has(f.id)).map((f) => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null, mark: closedMark(closedState(f), null) })),
        ...fixesSent
      ].sort((a, b) => b.closedAt - a.closedAt)
    },
    status
  };
}
function heldLabel(c) {
  if (c.how === "answered")
    return `Answered: ${c.outcome}`;
  return c.how === "claude" ? capitalized(c.outcome) : `Closed: ${c.outcome}`;
}
var UPDATING_TEXT = "Updating…";
var RETRYING_TEXT = "Retrying the last update…";
var REFRESHING_PRS_TEXT = "Refreshing PRs…";
function footerStatus(tab, status, prs, statusPageError) {
  if (tab === "prs")
    return { text: prs.isFetching && prs.hasPrs ? REFRESHING_PRS_TEXT : null, error: null };
  const error = (tab === "overview" ? statusPageError : null) ?? status.error;
  return { text: status.isRetrying ? RETRYING_TEXT : status.isUpdating ? UPDATING_TEXT : null, error };
}
var NEXT_TRY = " It tries again after the next reply.";
var FAILED_UPDATE_TEXT = {
  waiting: `The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing.${NEXT_TRY}`,
  "failed-again": `The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing.${NEXT_TRY}`,
  unreadable: `The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing.${NEXT_TRY}`
};
function perTurnStatus(isUpdating, recovery) {
  const error = recovery === "none" || recovery === "retrying" ? null : FAILED_UPDATE_TEXT[recovery];
  return { isUpdating, isRetrying: recovery === "retrying", error };
}

// ../hooks/session-view.ts
var PRESS_TIMEOUT_MS = 60000;
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at <= PRESS_TIMEOUT_MS)
    return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
function updateRecovery(s) {
  const { presence } = s;
  if (presence.ledgerState !== "failed")
    return "none";
  if (presence.isUpdating)
    return "retrying";
  if (s.pending.length === 0 && presence.isConversationUnreadable)
    return "unreadable";
  return presence.failedAttempts > 1 ? "failed-again" : "waiting";
}
function sessionView(s, now, settleWindowMs, holds = NO_HOLDS, notes = {}) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map((item) => [item.id, itemPrSteps(item, s.prViews, tabPrs(l))])),
    settleWindowMs,
    status: perTurnStatus(s.presence.isUpdating, updateRecovery(s)),
    now,
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt
  });
  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds, settleWindowMs),
    statusPage: statusPage(s, now)
  };
}
function prTabOf(s, lastActions, now, { shownSince, listInput, undoShown }, settleWindowMs) {
  const pressOutSince = earliestOf(Object.entries(lastActions).map(([id, last]) => isPrRowId(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, s.presence, now)) : null));
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    pressOutSince
  });
  const isSent = threadSentIn(lastActions);
  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => d.state.is === "open" && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger),
    order: prOrderView(s.ledger.prOrder, drawn, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    isGhSignedOut: s.prViews.isGhSignedOut === true,
    failure: s.prViews.failure ?? null,
    refresh: prRefreshView({ ...s.prViews, isGhMissing: s.prViews.isGhMissing === true }, s.ledger, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    clear: prClearActions(s.prViews, s.ledger),
    pressOutSince
  };
}

// src/blocks.ts
var button = (id, label, emphasis, does = { is: "nothing" }, hotkey = null) => ({ id, label, emphasis, isOut: false, hotkey, does });

// src/draw-prs.ts
var LOOK = "herdr";
var PLACE = "session";
var PR_TONE = {
  needsYou: "needsYou",
  done: "done",
  findings: "findings",
  error: "error"
};
function prButton(pr, a, id) {
  const effect = pr ? prPressEffect(pr, a.press) : null;
  const b = button(id, a.label, a.emphasis, { is: "press", press: a.press, effects: effect ? [effect] : [] }, a.hotkey);
  return { ...b, isOut: a.isOut };
}
function prFeedback(screen, id) {
  const { view, now } = screen;
  const f = feedbackOf(id, view.lastActions[id], undefined, view.turns, now);
  if (!f)
    return null;
  const text = hasAge(f) ? `${markedFeedbackText(f, false, LOOK)}${DOT}${shortAgo(now - f.at)}` : feedbackText(f, LOOK);
  return { text, tone: isFailure(f) ? "error" : "muted", source: f };
}
var markOf = (m) => ({
  text: m.text,
  tone: m.tone,
  isRunning: m.isRunning
});
function threadRow(screen, pr, t, presses) {
  const id = prThreadId(pr, t);
  const text = threadRowText(pr, t, screen.view.lastActions);
  const { rest } = commentParts(t.body);
  const { keys, more } = splitFollowUps(threadActions(pr, t, presses));
  const reply = t.reply ? `@${t.reply.author}: ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}` : null;
  return {
    kind: "row",
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.title,
    age: t.at === null ? null : shortAgo(screen.now - t.at),
    feedback: prFeedback(screen, id) ?? (text.fold?.note ? { text: text.fold.note, tone: "muted", source: null } : null),
    settled: null,
    isDim: text.mark.isDone,
    isSelectable: text.fold === null,
    body: [
      ...rest ? [{ text: clipLabel(rest, PR_QUOTE_CHARS), tone: null }] : [],
      { text: `${threadWhere(t)}${DOT}@${t.author}`, tone: "muted" },
      ...reply ? [{ text: reply, tone: null }] : []
    ],
    buttons: [...keys, ...more].map((a, n) => prButton(pr, a, `${id} ${n}`)),
    field: null
  };
}
function checkRow(screen, pr, c, presses) {
  const id = prCheckId(pr, c);
  const text = checkRowText(pr, c);
  return {
    kind: "row",
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.lead ? `${text.lead} / ${text.title}` : text.title,
    age: c.finishedAt === undefined ? null : shortAgo(screen.now - c.finishedAt),
    feedback: prFeedback(screen, id) ?? (text.fold ? { text: text.fold.note, tone: "muted", source: null } : null),
    settled: null,
    isDim: false,
    isSelectable: text.fold === null,
    body: [{ text: text.meta, tone: "muted" }],
    buttons: checkActions(pr, c, presses).map((a, n) => prButton(pr, a, `${pr.ref} ${checkKey(c)} ${n}`)),
    field: null
  };
}
function settledPr(d) {
  const { pr, state } = d;
  const id = prMarkId(pr.ref);
  const undo = state.canUndo ? [
    {
      ...button(`${id} undo`, ROW_COPY.undo, "quiet", {
        is: "press",
        press: { action: "pr-undo", ref: pr.ref },
        effects: []
      }),
      runsOutAt: state.at + SETTLED_MS
    }
  ] : [];
  const mark = settledMark(state);
  return {
    kind: "row",
    id,
    depth: 0,
    mark: { text: mark.text, tone: mark.tone ?? "muted", isRunning: mark.isRunning },
    title: pr.title,
    age: `#${pr.number}`,
    feedback: null,
    settled: { label: settledLabel(state.label, state.delivery, state.reply), tone: "muted" },
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: undo,
    field: null
  };
}
function prBlocks(screen, d, presses, selected) {
  if (d.state.is === "settled")
    return [settledPr({ ...d, state: d.state })];
  const { pr } = d;
  const { lastActions } = screen.view;
  const isSent = threadSentIn(lastActions);
  const { status, head, unlisted } = readiness(pr, isSent, screen.agent);
  const tone = PR_TONES[status];
  const isLastShown = !isDismissed(lastActions, pr.ref) && isBlockPressShown(pr, lastActions);
  const groups = prBlockRows(pr, false, {
    thread: (t) => threadRow(screen, pr, t, presses),
    check: (c) => checkRow(screen, pr, c, presses)
  });
  const rowsOf = (title, rows, key) => rows.length === 0 ? [] : [
    {
      kind: "heading",
      id: `${pr.ref} ${key}`,
      text: title,
      count: rows.length,
      mark: null,
      buttons: [],
      isLabel: false
    },
    ...rows.map((r) => {
      const isSelected = r.isSelectable && r.id === selected;
      return { ...r, isSelected, body: isSelected ? r.body : [], buttons: isSelected ? r.buttons : [] };
    })
  ];
  return [
    {
      kind: "pr",
      id: prMarkId(pr.ref),
      number: `#${pr.number}`,
      title: pr.title,
      status: { text: head, tone: tone ? PR_TONE[tone] : "muted" },
      unlisted,
      error: pr.error ? prRefreshFailedText(pr.error) : null,
      buttons: prBlockActions(pr, isSent, screen.view.prs.branchRef, presses).map((a, n) => prButton(pr, a, `${pr.ref} ${n}`)),
      feedback: isLastShown ? prFeedback(screen, prMarkId(pr.ref)) : null
    },
    ...rowsOf(PR_GROUP_TITLES.threads, groups.threads, "threads"),
    ...rowsOf(PR_GROUP_TITLES.checks, groups.checks, "checks"),
    ...rowsOf(PR_GROUP_TITLES.cancelled, groups.cancelled, "cancelled")
  ];
}
var note = (id, text, tone) => ({
  kind: "note",
  id,
  text,
  count: null,
  tone,
  isHead: true,
  isStrong: false,
  depth: 0
});
function refreshParts(screen) {
  const refresh = screen.view.prs.refresh;
  if (!refresh)
    return null;
  const buttons = refresh.actions.map((a, n) => prButton(null, a, `refresh ${n}`));
  const feedback = refresh.showsPress ? prFeedback(screen, PR_REFRESH_ID) : null;
  return { text: refresh.text, buttons, feedback };
}
var refreshLine = (screen) => {
  const refresh = refreshParts(screen);
  return refresh ? [{ kind: "line", id: PR_REFRESH_ID, under: null, ...refresh }] : [];
};
function noticeBlocks(screen, notice) {
  if (!notice)
    return refreshLine(screen);
  const banner = bannerOf(notice.kind, notice.text);
  const refresh = refreshParts(screen);
  if (!refresh || refresh.text !== null)
    return [{ kind: "banner", id: "gh notice", banner, buttons: [], feedback: null }, ...refreshLine(screen)];
  return [{ kind: "banner", id: PR_REFRESH_ID, banner, buttons: refresh.buttons, feedback: refresh.feedback }];
}
function orderLines(screen) {
  const order = screen.view.prs.order;
  if (!order)
    return [];
  const changed = order.changed;
  const lines = [
    { kind: "line", id: "pr order", text: order.title, under: order.why, buttons: [], feedback: null }
  ];
  if (!changed)
    return lines;
  const buttons = changed.actions.map((a, n) => prButton(null, a, `order ${n}`));
  const feedback = changed.showsPress ? prFeedback(screen, RANK_AGAIN_ID) : null;
  return [...lines, { kind: "line", id: RANK_AGAIN_ID, text: changed.text, under: null, buttons, feedback }];
}
function clearLine(screen) {
  const buttons = screen.view.prs.clear.map((a, n) => prButton(null, a, `clear ${n}`));
  return buttons.length === 0 ? [] : [{ kind: "line", id: CLEAR_FINISHED_ID, text: null, under: null, buttons, feedback: null }];
}
var ruleBetween = (ref) => ({ kind: "rule", id: `rule ${ref}`, text: null });
function firstSelectable(blocks) {
  return blocks.find((b) => b.kind === "row" && b.isSelectable)?.id ?? null;
}
function prTabBlocks(screen, selected) {
  const { view } = screen;
  const prs = view.prs;
  const gh = { isGhMissing: screen.isGhMissing, isGhSignedOut: prs.isGhSignedOut, failure: prs.failure };
  if (prs.drawn.length === 0) {
    const empty = prsEmptyText({ isFetching: false, ...gh }, PLACE);
    return [
      { kind: "empty", id: "empty prs", title: empty.title, hint: empty.hint, buttons: [] },
      ...refreshLine(screen)
    ];
  }
  const presses = { lastActions: view.lastActions, turns: view.turns, now: screen.now };
  const notice = ghNoticeOf(gh);
  const othersStart = otherPrsStart(prs.drawn);
  const caption = { kind: "caption", id: "other prs", text: OTHER_PRS_TEXT };
  const above = (d, n) => [
    ...n > 0 ? [ruleBetween(d.pr.ref)] : [],
    ...d === othersStart ? [caption] : []
  ];
  const draw = (open) => [
    ...noticeBlocks(screen, notice),
    ...clearLine(screen),
    ...orderLines(screen),
    ...prs.drawn.flatMap((d, n) => [...above(d, n), ...prBlocks(screen, d, presses, open)]),
    ...prs.olderText ? [ruleBetween("older prs"), note("older prs", prs.olderText, "muted")] : []
  ];
  const blocks = draw(selected);
  const isShown = blocks.some((b) => b.kind === "row" && b.isSelected);
  return isShown ? blocks : draw(firstSelectable(blocks));
}

// src/draw-status.ts
var MERGED_CELLS = 150;
var toneOf = (t) => t;
var markOf2 = (mark, tone, isRunning) => ({
  text: mark,
  tone: toneOf(tone),
  isRunning
});
function doesOf(k) {
  const p = k.press;
  if (p.action === "show-ask")
    return { is: "view", change: { showAsk: p.askId } };
  if (p.action === "toggle-fold")
    return { is: "view", change: { toggleFold: p.foldId } };
  if (p.action === "type-goal")
    return { is: "type", rowId: GOAL_KEYS_ID, text: p.text, hint: GOAL_FIELD.placeholder };
  return { is: "press", press: { action: p.action, id: GOAL_KEYS_ID }, effects: [] };
}
function keyButtons(id, keys) {
  return keys.map((k, n) => button(`${id} ${n}`, k.label, k.emphasis, doesOf(k)));
}
function rowBlocks(row, isUnfolded) {
  if (row.kind === "subject") {
    const under = [
      row.text,
      row.merged ? mergedLine(row.merged, (t) => cellWidth(t) <= MERGED_CELLS) : null,
      row.was ? `${WAS_PREFIX}${row.was}` : null
    ].filter((l) => l !== null);
    return [
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf2(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        isMuted: false,
        stall: row.stall,
        under,
        buttons: keyButtons(row.id, statusKeyPlan(row))
      }
    ];
  }
  if (row.kind === "child")
    return [
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf2(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        isMuted: true,
        stall: row.stall,
        under: [],
        buttons: []
      }
    ];
  if (row.kind === "more")
    return [{ ...note2(row.id, row.text, "muted"), depth: row.depth }];
  if (row.kind === "part")
    return [
      { kind: "gap", id: `gap ${row.id}` },
      { kind: "rule", id: row.id, text: row.text }
    ];
  if (row.kind === "counts")
    return [{ ...note2(row.id, row.counts.map((c) => `${c.mark} ${c.text}`).join(STALL_GAP), "muted"), depth: row.depth }];
  if (row.kind === "done-fold")
    return [
      {
        kind: "fold",
        id: row.id,
        depth: row.depth,
        text: row.text,
        isOpen: isUnfolded(row.id),
        change: { toggleFold: row.id }
      }
    ];
  return [
    {
      kind: "status",
      id: row.id,
      depth: row.depth,
      mark: markOf2(row.mark, row.tone, false),
      name: row.text,
      isBold: false,
      isMuted: true,
      stall: null,
      under: [],
      buttons: []
    }
  ];
}
function milestoneBlock(m) {
  return {
    kind: "status",
    id: m.id,
    depth: 0,
    mark: markOf2(m.mark, m.tone, false),
    name: m.name,
    isBold: false,
    isMuted: false,
    stall: m.stall,
    under: [m.text, m.was ? `${WAS_PREFIX}${m.was}` : null].filter((l) => l !== null),
    buttons: keyButtons(m.id, milestoneKeyPlan(m))
  };
}
var note2 = (id, text, tone) => ({
  kind: "note",
  id,
  text,
  count: null,
  tone,
  isHead: false,
  isStrong: false,
  depth: 0
});
var headNote = (id, text, tone) => ({ ...note2(id, text, tone), isHead: true });
var headTitle = (id, text, count) => ({
  ...note2(id, text, null),
  count,
  isHead: true,
  isStrong: true
});
function goalBlocks(page, { isUnfolded, goalField }) {
  const g = page.goal;
  const heading = {
    kind: "heading",
    id: "goal heading",
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: null,
    buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page)),
    isLabel: true
  };
  const field = goalField ? [{ kind: "field", id: "goal field", field: goalField }] : [];
  if (g === null)
    return [heading, ...goalField ? field : [headNote("goal text", NO_GOAL_TEXT, "muted")]];
  const lines = goalField ? field : [
    headTitle("goal text", g.text, g.count === null ? null : `${STALL_GAP}${g.count}`),
    ...g.was ? [headNote("goal was", `${WAS_PREFIX}${g.was}`, "muted")] : [],
    ...g.now ? [headNote("goal now", g.now, "muted")] : [],
    ...g.awaiting ? [headNote("goal awaiting", g.awaiting, "muted")] : []
  ];
  const milestones = g.milestones.flatMap((m) => [
    { kind: "gap", id: `gap ${m.id}` },
    milestoneBlock(m),
    ...unfoldedRows(m.rows, isUnfolded).flatMap((r) => rowBlocks(r, isUnfolded))
  ]);
  return [heading, ...lines, ...milestones];
}
function statusBlocks(page, ui) {
  const { isUnfolded } = ui;
  if (page.isEmpty && ui.goalField === null)
    return [
      {
        kind: "empty",
        id: "empty overview",
        title: page.empty.title,
        hint: page.empty.hint,
        buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page))
      }
    ];
  const description = page.head?.description;
  const head = page.goal === null && page.head ? [
    headTitle("head title", page.head.title, null),
    ...description ? [headNote("head text", description, "muted")] : []
  ] : [];
  const top = [...goalBlocks(page, ui), ...head.length > 0 ? [{ kind: "gap", id: "gap head" }, ...head] : []];
  const rows = unfoldedRows(page.rows, isUnfolded).flatMap((r) => rowBlocks(r, isUnfolded));
  const isGapNeeded = rows.length > 0 && page.rows[0]?.kind !== "part";
  return isGapNeeded ? [...top, { kind: "gap", id: "gap rows" }, ...rows] : [...top, ...rows];
}

// src/draw.ts
var LOOK2 = "herdr";
var freshUi = (tab) => ({
  tab,
  selected: null,
  unfolded: [],
  closedAll: [],
  optionsShown: [],
  statusUnfolded: [],
  typing: null
});
var HOLDS_UP_MARK = { text: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false };
var toneOfFeedback = (f) => isFailure(f) ? "error" : f.is === "done" || f.is === "local" && f.result.state === "done" ? "done" : "muted";
var markOf3 = (m) => m ? { text: m.text, tone: m.tone ?? "muted", isRunning: m.isRunning } : null;
function rowDoes(row, press, kind, agent) {
  if (press.action === "type")
    return { is: "type", rowId: row.id, text: "", hint: replyHint(row, agent) };
  if (press.action === "discard")
    return { is: "leave", rowId: row.id, isDiscard: true };
  const step = press.action === "step" ? row.steps[press.step] : undefined;
  const effects = kind === "local" && row.item && step ? stepEffects(row.item, step) : [];
  return { is: "press", press, effects };
}
function rowButtons(row, isAllShown, agent) {
  const { keys, more } = rowKeyPlan(row, isAllShown);
  return [...keys, ...more].map((k, n) => {
    const id = `${row.id} ${n}`;
    if (k.slot === "allOptions")
      return button(id, k.label, k.emphasis, { is: "view", change: { showOptions: row.id } });
    if (k.slot === "retry")
      return button(id, k.label, k.emphasis, rowDoes(row, k.press, k.kind, agent));
    const { action } = k;
    const does = rowDoes(row, action.press, action.kind, agent);
    return { ...button(id, actionLabel(action), action.emphasis, does, k.hotkey ?? null), isOut: action.isOut };
  });
}
var undoPlaceEndsAt = (state) => state.at + SETTLED_MS + QUEUED_AFTER_MS;
function undoButtons(row, agent, now) {
  if (row.state.is !== "settled")
    return [];
  const id = `${row.id} undo`;
  const runsOutAt = row.state.at + SETTLED_MS;
  const undo = row.actions.find((a) => a.press.action === "undo");
  if (undo)
    return [
      {
        ...button(id, actionLabel(undo), undo.emphasis, rowDoes(row, undo.press, undo.kind, agent)),
        isOut: undo.isOut,
        runsOutAt
      }
    ];
  const isWaitingForAgent = row.state.delivery === "queued" && now >= undoPlaceEndsAt(row.state);
  return row.state.offersUndo && !isWaitingForAgent ? [{ ...button(id, ROW_COPY.undo, "quiet"), isHidden: true, runsOutAt }] : [];
}
function fieldOf(rowId, isDiscard, send = ROW_COPY.send) {
  const leave = isDiscard ? ROW_COPY.discard : ROW_COPY.cancel;
  return {
    rowId,
    buttons: [
      button(`${rowId} send`, send, "primary", { is: "send", rowId }),
      button(`${rowId} leave`, leave, "quiet", { is: "leave", rowId, isDiscard })
    ]
  };
}
function rowBody(row, isAllShown, isNextBuild) {
  const lines = [
    { text: row.contextLine, tone: "muted" },
    { text: row.detail, tone: null },
    { text: row.fileName ? `${ROW_COPY.relevantFile}${row.fileName}` : null, tone: "muted" },
    ...shownOptionDescriptions(row, isAllShown).map((o) => ({ text: `${o.label}: ${o.description}`, tone: null })),
    { text: row.recLine, tone: "muted" },
    { text: isNextBuild ? row.holdsUpLine : null, tone: "muted", mark: HOLDS_UP_MARK }
  ];
  return lines.flatMap((l) => l.text ? [{ ...l, text: l.text }] : []);
}
function rowBlock(row, ui, selected, screen) {
  const { state, feedback: f } = row;
  const isSettled = state.is === "settled";
  const isAllShown = ui.optionsShown.includes(row.id);
  const text = rowFeedbackText(row, LOOK2);
  const isSelected = !isSettled && row.id === selected;
  const isTyping = ui.typing === row.id;
  return {
    kind: "row",
    id: row.id,
    depth: 0,
    mark: markOf3(rowResultMark(row)),
    title: rowTitle(row, LOOK2),
    age: row.at === null ? null : shortAgo(screen.now - row.at),
    feedback: text && f ? { text, tone: toneOfFeedback(f), source: f } : null,
    settled: isSettled ? { label: settledLabel(state.label, state.delivery, state.reply), tone: settledTone(state) } : null,
    isDim: isSettled,
    isSelectable: !isSettled,
    isSelected,
    body: isSelected ? rowBody(row, isAllShown, screen.isNextBuild) : [],
    buttons: isSettled ? [...rowButtons(row, isAllShown, screen.agent), ...undoButtons(row, screen.agent, screen.now)] : isSelected && !isTyping ? rowButtons(row, isAllShown, screen.agent) : [],
    field: isSelected && isTyping ? fieldOf(row.id, fieldExit(row) === "discard") : null
  };
}
function closedBlock(d, now) {
  const action = closedLineAction(d);
  const closedDoes = action ? { is: "press", press: action.press, effects: [] } : { is: "nothing" };
  return {
    kind: "row",
    id: `closed ${d.id}`,
    depth: 1,
    mark: markOf3(d.mark),
    title: d.title,
    age: shortAgo(now - d.at),
    feedback: { text: settledLabel(d.outcomeLabel, d.delivery), tone: "muted", source: null },
    settled: null,
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: action ? [button(`closed ${d.id} 0`, action.label, "quiet", closedDoes)] : [],
    field: null
  };
}
function groupBlocks(g, ui, selected, screen) {
  const settled = new Set(g.rows.filter((r) => r.state.is === "settled").map((r) => r.id));
  const total = closedTotal(g.closed, settled);
  const count = waitingCount(g.rows);
  const out = [
    {
      kind: "heading",
      id: `group ${g.kind}`,
      text: g.title,
      count: count > 0 ? count : null,
      mark: g.mark,
      buttons: [],
      isLabel: false
    },
    ...g.rows.map((r) => rowBlock(r, ui, selected, screen))
  ];
  if (g.rows.length === 0)
    out.push({
      kind: "note",
      id: `empty ${g.kind}`,
      text: groupEmptyText(g.title),
      count: null,
      tone: "muted",
      isHead: false,
      isStrong: false,
      depth: 0
    });
  if (total === 0)
    return out;
  const isOpen = ui.unfolded.includes(g.kind);
  out.push({
    kind: "fold",
    id: `fold ${g.kind}`,
    depth: 0,
    text: foldLabel(total),
    isOpen,
    change: { closedFold: g.kind }
  });
  if (!isOpen)
    return out;
  const shown = closedShown(g.closed, settled, ui.closedAll.includes(g.kind));
  out.push(...shown.map((d) => closedBlock(d, screen.now)));
  const earlier = earlierLabel(total, shown.length);
  if (earlier)
    out.push({ kind: "more", id: `earlier ${g.kind}`, depth: 1, text: earlier, change: { earlier: g.kind } });
  return out;
}
function groupsOf(view, tab, shownSince) {
  if (tab === "needsYou")
    return NEEDS_YOU_GROUPS.map((g) => ({
      kind: g.kind,
      title: g.title,
      mark: null,
      rows: view.needsYou[g.list].filter((r) => isDrawnInPlace(r, shownSince)),
      closed: view.needsYou.closed[g.list].map((d) => ({ ...d, title: d.ask }))
    }));
  return Object.keys(FINDING_GROUPS).map((kind) => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone, isRunning: false },
    rows: view.findings.rows.filter((r) => r.finding?.kind === kind && isDrawnInPlace(r, shownSince)),
    closed: view.findings.closed.filter((f) => f.kind === kind).map((f) => ({ ...f, at: f.closedAt }))
  }));
}
var waitsOf = (groups) => groups.flatMap((g) => g.rows).map((r) => ({ id: r.id, isWaiting: isWaitingRow(r) }));
var rowWaits = (screen, tab) => tab === "needsYou" || tab === "findings" ? waitsOf(groupsOf(screen.view, tab, screen.shownSince)) : [];
function selectedOf(groups, selected) {
  const isSettled = (id) => groups.some((g) => g.rows.some((r) => r.id === id && r.state.is === "settled"));
  const waits = waitsOf(groups);
  if (selected === null || !waits.some((r) => r.id === selected))
    return firstWaiting(waits);
  if (!isSettled(selected))
    return selected;
  return rowAfterClose(waits, selected) ?? firstWaiting(waits);
}
function rowTabBlocks(screen, ui, tab) {
  const groups = groupsOf(screen.view, tab, screen.shownSince);
  const isEmpty = groups.every((g) => g.rows.length === 0 && g.closed.length === 0);
  if (isEmpty) {
    const empty = emptyText(tab, screen.agent, isMaybeStale(screen.view));
    return [{ kind: "empty", id: `empty ${tab}`, title: empty.title, hint: empty.hint, buttons: [] }];
  }
  const selected = selectedOf(groups, ui.selected);
  return groups.flatMap((g, n) => [
    ...n > 0 ? [{ kind: "rule", id: `rule ${g.kind}`, text: null }] : [],
    ...groupBlocks(g, ui, selected, screen)
  ]);
}
function tabCells(screen, tab) {
  const { view } = screen;
  const counts = { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count };
  return shownTabs(screen.isNextBuild).map((t) => ({
    id: t.id,
    label: t.label,
    badge: tabBadge(t.id, counts),
    isSelected: t.id === tab
  }));
}
function chrome(screen, tab) {
  const status = footerStatus(tab, screen.view.status, { isFetching: false, hasPrs: screen.view.prs.drawn.length > 0 }, screen.view.statusPage.error);
  return { banners: tabBarBanners([], status.error, null), status: status.text };
}
function tabBlocks(screen, ui) {
  if (ui.tab === "overview") {
    const goalField = ui.typing === GOAL_KEYS_ID ? fieldOf(GOAL_KEYS_ID, false, GOAL_FIELD.submit) : null;
    return statusBlocks(screen.view.statusPage, { isUnfolded: (id) => ui.statusUnfolded.includes(id), goalField });
  }
  if (ui.tab === "prs")
    return prTabBlocks(screen, ui.selected);
  return rowTabBlocks(screen, ui, ui.tab);
}

// src/files.ts
function isSessionChange(changed, appHome, sessionId) {
  const folder = publishedSessionsFolder(appHome);
  const file = publishedSessionPath(appHome, sessionId);
  return changed.some((p) => p === file || p === folder || p === `${folder}/`);
}
var isRecord = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var SOURCE_FIELDS = ["host", "agent", "sessionId", "terminal"];
function lastPressOf2(x) {
  if (!isRecord(x) || typeof x.id !== "string")
    return null;
  return x.outcome === "applied" || x.outcome === "stale" ? { id: x.id, outcome: x.outcome } : null;
}
function readSession(text) {
  if (text === null)
    return { is: "missing" };
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { is: "torn" };
  }
  if (!isRecord(file))
    return { is: "refused", reason: "not an object" };
  const { format } = file;
  if (typeof format === "number" && format > HERDR_FORMAT)
    return { is: "newer", format };
  if (format !== HERDR_FORMAT)
    return { is: "refused", reason: `unknown format ${String(format)}` };
  const missing = SOURCE_FIELDS.find((field) => typeof file[field] !== "string" || file[field] === "");
  if (missing)
    return { is: "refused", reason: `no ${missing}` };
  if (typeof file.writtenAt !== "number")
    return { is: "refused", reason: "no writtenAt" };
  if (!isRecord(file.session))
    return { is: "refused", reason: "no session" };
  const envelope = file;
  return {
    is: "read",
    envelope,
    session: upgradeSession(file.session),
    isTrimmed: file.trimmed === true,
    lastPress: lastPressOf2(file.lastPress),
    projectFolder: typeof file.projectFolder === "string" && file.projectFolder.startsWith("/") ? file.projectFolder : null
  };
}

// src/follow.ts
var SESSION_LABEL = "inbox.session";
function shownOf(where, address) {
  const t = where.terminals.find((x) => x.address === address);
  const sessionId = t?.labels?.[SESSION_LABEL];
  const isSafeSessionId = sessionId !== undefined && isSessionFile(`${sessionId}.json`);
  if (!isSafeSessionId)
    return { is: "no-inbox", terminal: address, program: t?.program?.name ?? null };
  return t?.program?.shell ? { is: "ended", terminal: address } : { is: "session", terminal: address, sessionId };
}
function follow(where, tab, last) {
  const inTab = where.panes.flatMap((p) => p.tab === tab && p.terminal ? [p.terminal] : []);
  const focused = where.focused?.tab === tab ? where.focused.terminal : null;
  const isLabeled = (address) => Boolean(where.terminals.find((x) => x.address === address)?.labels?.[SESSION_LABEL]);
  const address = [focused, last].find((a) => a !== null && inTab.includes(a)) ?? inTab.find(isLabeled) ?? inTab[0] ?? null;
  return address === null ? { is: "no-terminal" } : shownOf(where, address);
}

// src/draw-help.ts
function helpBlocks(isNextBuild, tab, hasStatusButtons) {
  const keys = helpKeys("herdr", isNextBuild, tab, hasStatusButtons);
  const heading = (id, text) => ({
    kind: "heading",
    id,
    text,
    count: null,
    mark: null,
    buttons: [],
    isLabel: false
  });
  return [
    heading("help keys", HELP_COPY.keys),
    ...keys.map((k) => ({
      kind: "status",
      id: `key ${k.keys}`,
      depth: 0,
      mark: null,
      name: k.keys,
      isBold: true,
      isMuted: false,
      stall: null,
      under: [k.does],
      buttons: []
    })),
    heading("help marks", HELP_COPY.marks),
    ...markLegend(isNextBuild).map((m) => ({
      kind: "status",
      id: `mark ${m.mark}`,
      depth: 0,
      mark: { text: m.mark, tone: m.tone, isRunning: m.isRunning },
      name: m.words,
      isBold: false,
      isMuted: false,
      stall: null,
      under: [],
      buttons: []
    }))
  ];
}

// src/keys.ts
var isSelectable = (b) => b.kind === "row" && b.isSelectable;
function stepRow(blocks, by) {
  const rows = blocks.filter(isSelectable);
  const next = steppedIndex(rows.findIndex((r) => r.isSelected), by, rows.length);
  return rows[next]?.id ?? null;
}
function tabUndo(view, tab, shownSince) {
  if (tab === "overview")
    return null;
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows];
  const drawn = new Set(rows.filter((r) => isDrawnInPlace(r, shownSince)).map((r) => r.id));
  const lists = drawnLists(view, (id) => drawn.has(id), (r) => r);
  return latestUndo(tabUndos(tab, lists, view.prs.drawn))?.press ?? null;
}
var isSamePress = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function undoButton(blocks, undo) {
  const drawn = blocks.flatMap((b) => b.kind === "row" ? b.buttons : []).find((b) => b.does.is === "press" && isSamePress(b.does.press, undo));
  return drawn && !drawn.isOut ? drawn : null;
}
function stepTab(tabs, by) {
  const at = tabs.findIndex((t) => t.isSelected);
  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null;
}
function keyMove(key, tabs, blocks, typing, undo = null) {
  if (typing !== null)
    return key === "escape" ? { is: "close" } : null;
  if (key === "escape")
    return { is: "leave" };
  if (key === "left" || key === "right") {
    const tab = stepTab(tabs, key === "right" ? 1 : -1);
    return tab ? { is: "tab", tab } : null;
  }
  if (key === "j" || key === "k") {
    const id = stepRow(blocks, key === "j" ? 1 : -1);
    return id ? { is: "select", id } : null;
  }
  if (key === UNDO_KEY) {
    const button = undo ? undoButton(blocks, undo) : null;
    return button ? { is: "press", button } : null;
  }
  const selected = blocks.find((b) => b.kind === "row" && b.isSelected);
  const lines = blocks.flatMap((b) => b.kind === "line" || b.kind === "banner" ? b.buttons : []);
  const pressed = [...selected?.buttons ?? [], ...lines].find((b) => b.hotkey === key && !b.isOut);
  return pressed ? { is: "press", button: pressed } : null;
}
var withSelected = (ui, id) => ({
  ...ui,
  selected: id,
  typing: ui.typing === id ? id : null
});
function withClosedSelection(ui, last, now) {
  const id = ui.selected;
  const wasWaiting = last.some((r) => r.id === id && r.isWaiting);
  const isWaiting = now.some((r) => r.id === id && r.isWaiting);
  if (id === null || !wasWaiting || isWaiting)
    return ui;
  const next = rowAfterClose(now, id);
  return next === null ? { ...ui, selected: null, typing: null } : withSelected(ui, next);
}
var isFieldDrawn = (ui, isHelpShown) => ui.typing !== null && !isHelpShown;
var withTab = (ui, tab) => ({ ...ui, tab, selected: null, typing: null });
var afterSend = (ui, rowId, isSent) => isSent && ui.typing === rowId ? { ...ui, typing: null } : ui;
function withoutConfirmed(drafts, confirmed, typing, pending) {
  const current = confirmed.filter((c) => !pending.some((p) => p.rowId === c.rowId && p.pressId > c.pressId));
  const done = current.filter((c) => c.rowId !== typing);
  const isSentDraft = (id, d) => done.some((c) => c.rowId === id && c.text === d.text.trim());
  return {
    drafts: Object.fromEntries(Object.entries(drafts).filter(([id, d]) => !isSentDraft(id, d))),
    waiting: current.filter((c) => c.rowId === typing)
  };
}

// src/held-line.ts
var NO_LINES_ABOVE = new Map;
var hasActions = (r) => r.buttons.length > 0 || r.field !== null;
var isStatusUnder = (r) => r.feedback !== null && isStatusUnderActions(r.feedback.source, hasActions(r));
var isUnderWay = (f) => f?.is === "queued" || pressUnderWaySince(f) !== null;
function holdLinesAbove(blocks, held) {
  const next = new Map;
  const shown = blocks.map((b) => {
    if (b.kind !== "row")
      return b;
    const line = held.get(b.id);
    const isPressUnderWay = isUnderWay(b.feedback?.source ?? null);
    if (!hasActions(b)) {
      if (line && isPressUnderWay)
        next.set(b.id, line);
      return b;
    }
    if (!isStatusUnder(b)) {
      const f = b.feedback;
      if (f)
        next.set(b.id, { text: f.text, tone: f.tone, isHidden: isFailure(f.source) });
      return b;
    }
    if (!line || !isPressUnderWay)
      return b;
    next.set(b.id, line);
    return { ...b, heldLine: line };
  });
  return { blocks: shown, held: next };
}

// ../hooks/row-motion.ts
var ENTER_MS = 300;
var MOVE_MS = 200;
var EXIT_MS = 200;
var ROW_STATE_MS = {
  entering: ENTER_MS,
  opening: MOVE_MS,
  closing: MOVE_MS,
  settling: MOVE_MS,
  leaving: EXIT_MS,
  closed: 0,
  open: 0,
  settled: 0,
  undoing: 0
};
function isMoving(state) {
  return ROW_STATE_MS[state] > 0;
}
function stepRow2(track, target, now, isNew = false, isReduced = false) {
  const form = target === "undoing" ? "settled" : target;
  if (!track) {
    if (isNew && !isReduced && (form === "closed" || form === "open"))
      return { state: "entering", since: now, hasPanel: form === "open" };
    return rest(undefined, form, target, now);
  }
  const next = formOf(track) === form ? track : moveToward(track, form, now);
  if (isMoving(next.state) && !isReduced && now - next.since < ROW_STATE_MS[next.state])
    return next;
  return rest(next, form, target, now);
}
function formOf({ state, hasPanel }) {
  switch (state) {
    case "entering":
      return hasPanel ? "open" : "closed";
    case "opening":
    case "open":
      return "open";
    case "closing":
    case "closed":
      return "closed";
    case "settling":
    case "settled":
    case "undoing":
      return "settled";
    case "leaving":
      return "gone";
  }
}
function moveToward(track, form, now) {
  switch (form) {
    case "open":
      return { state: "opening", since: now, hasPanel: true };
    case "closed":
      return track.state === "leaving" ? { state: "entering", since: now, hasPanel: false } : { state: "closing", since: now, hasPanel: track.hasPanel };
    case "settled":
      return { state: "settling", since: now, hasPanel: track.hasPanel };
    case "gone":
      return { state: "leaving", since: now, hasPanel: track.hasPanel };
  }
}
function rest(track, form, target, now) {
  if (form === "gone")
    return null;
  const state = target === "undoing" ? "undoing" : form;
  return track?.state === state ? track : { state, since: now, hasPanel: state === "open" };
}

// src/motion.ts
var NO_TRACKS = { rows: new Map, order: [] };
var targetOf = (r) => r.settled ? "settled" : r.isSelected ? "open" : "closed";
function moveRows(blocks, last, now, isFirst) {
  const was = isFirst ? NO_TRACKS : last;
  const wasDrawn = new Set(was.order);
  const rows = new Map;
  const motion = new Map;
  const add = (row, track) => {
    rows.set(row.id, { track, row });
    motion.set(row.id, { state: track.state, isStart: track.since === now && isMoving(track.state) });
  };
  for (const b of blocks) {
    if (b.kind !== "row")
      continue;
    const track = stepRow2(was.rows.get(b.id)?.track, targetOf(b), now, !isFirst && !wasDrawn.has(b.id));
    if (track)
      add(b, track);
  }
  const shown = [...blocks];
  const isDrawn = new Set(blocks.map((b) => b.id));
  was.order.forEach((id, i) => {
    const old = was.rows.get(id);
    if (!old || isDrawn.has(id) || rows.has(id))
      return;
    const track = stepRow2(old.track, "gone", now);
    if (!track)
      return;
    add(old.row, track);
    shown.splice(placeAfter(shown, was.order.slice(0, i)), 0, old.row);
  });
  const ends = [...rows.values()].flatMap((t) => isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : []);
  return {
    blocks: shown,
    tracks: { rows, order: shown.map((b) => b.id) },
    motion,
    nextAt: ends.length ? Math.min(...ends) : null
  };
}
function placeAfter(shown, above) {
  for (let i = above.length - 1;i >= 0; i--) {
    const at = shown.findIndex((b) => b.id === above[i]);
    if (at >= 0)
      return at + 1;
  }
  return 0;
}

// src/paint-blocks.ts
import { div as div3 } from "gpui-kit";
import { Input, h_flex as h_flex2, v_flex as v_flex2 } from "gpui-base";

// ../hooks/layout.ts
var ROW_PAD_PT = 8;
var STATUS_ROW_PAD_PT = 19 / 4;
var SECTION_GAP_PT = 19 / 2;
var BANNER_PAD_Y_PT = 8;

// src/paint-theme.ts
var TONE_COLORS = {
  needsYou: "ansi3",
  issue: "ansi3",
  notice: "ansi4",
  warning: "ansi3",
  findings: "ansi5",
  prs: "ansi6",
  done: "done",
  error: "ansi1",
  muted: "muted"
};
var colorOf = (t, tone) => t[tone === null ? "foreground" : TONE_COLORS[tone]];
var tint = (c, share) => `${c.slice(0, 7)}${Math.round(share * 255).toString(16).padStart(2, "0")}`;
var TEXT = 13;
var LINE = "20px";
var SMALL_TEXT = 12;
var HEAD_TEXT = 15;
var HEAD_LINE = "24px";
var SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
var LINE_GAP = SPACE.xs;
var CONTROL_GAP = SPACE.s;
var HEAD_GAP = SPACE.m;
var INSET = SPACE.m;
var EDGE = SPACE.l;
var ITEM_GAP = SPACE.xl;
var GROUP_GAP = SPACE.xxl;
var END_SPACE = GROUP_GAP;
var MARK_W = SPACE.xl;
var TEXT_X = EDGE + MARK_W;
var NEST = MARK_W;
var NARROW_PANE = 280;
var BUTTON_H = 28;
var BOX_RADIUS = 10;
var TAB_RADIUS = 6;
var SEP = " · ";

// src/paint-chrome.ts
import { Background, PathBuilder, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
var helpButton = (isHelpShown) => ({
  id: "help",
  label: isHelpShown ? HELP_COPY.close : HELP_COPY.open,
  emphasis: "quiet",
  isOut: false,
  hotkey: null,
  does: { is: "view", change: { toggleHelp: true } }
});
function tabsEl(tabs, status, isHelpShown, p) {
  const { t } = p;
  const help = helpButton(isHelpShown);
  return h_flex().flex_none().flex_wrap().px(EDGE).pt(EDGE).pb(CONTROL_GAP).gap_x(LINE_GAP).gap_y(CONTROL_GAP).items_center().children(tabs.map((tab) => h_flex().id(`tab ${tab.id}`).h(BUTTON_H).px(INSET).items_center().rounded(TAB_RADIUS).accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label).when(tab.isSelected, (e) => e.bg(t.raised).text_color(t.foreground).font_semibold()).when(!tab.isSelected, (e) => e.text_color(t.muted).hover((s) => s.text_color(t.foreground))).on_click((_e, cx) => p.pick(tab.id, cx)).child(tab.label).when(tab.badge !== null, (e) => e.child(div().ml(LINE_GAP).font_normal().text_color(colorOf(t, tab.id === "overview" ? null : tab.id)).child(tab.badge ?? ""))))).child(div().flex_1()).when(status !== null, (e) => e.child(div().min_w(0).whitespace_normal().px(LINE_GAP).text_size(SMALL_TEXT).text_color(t.muted).child(status ?? ""))).child(h_flex().id("help").text_color(t.muted).hover((s) => s.text_color(t.foreground)).accessibility_label(help.label).on_click((_e, cx) => p.press(help, cx)).child(help.label));
}
var BANNER_TONES2 = { error: "error", warning: "warning", notice: "notice", ask: "notice" };
function bannerEl(b, t, buttons = [], under = null) {
  const tone = colorOf(t, BANNER_TONES2[b.tone]);
  const text = v_flex().flex_1().min_w(0).whitespace_normal().child(div().font_semibold().text_color(tone).child(b.lead)).when(b.body !== null, (e) => e.child(div().child(b.body ?? "")));
  const row = h_flex().gap(INSET).items_center().child(text).when(buttons.length > 0, (e) => e.child(h_flex().flex_none().gap(CONTROL_GAP).children(buttons)));
  return v_flex().mx(EDGE).px(INSET).py(BANNER_PAD_Y_PT).rounded(BOX_RADIUS).border_1().border_color(tint(tone, 0.3)).bg(tint(tone, 0.09)).child(row).children(under ? [under] : []);
}
var sessionNoteEl = (text, t) => div().px(EDGE).pt(EDGE).whitespace_normal().text_color(t.muted).child(text);
function messageEl(m, t) {
  return v_flex().flex_1().justify_center().items_center().p(GROUP_GAP).gap(LINE_GAP).child(div().font_semibold().text_center().text_color(m.isError ? t.ansi1 : t.foreground).child(m.title)).when(m.hint !== null, (e) => e.child(div().whitespace_normal().text_center().text_color(t.muted).child(m.hint ?? "")));
}
var FILL = PathBuilder.fill().add_polygon([
  [0, 0],
  ["100%", 0],
  ["100%", "100%"],
  [0, "100%"]
], true).build();
function scrollFadeEl(t, edge) {
  const isTop = edge === "top";
  const fade = Background.linear_gradient(isTop ? 180 : 0, tint(t.background, 1), tint(t.background, 0));
  return window.paint_path(FILL, fade).absolute().left(0).right(0).when(isTop, (e) => e.top(0).h(EDGE)).when(!isTop, (e) => e.bottom(0).h(GROUP_GAP));
}

// src/paint-timer.ts
import { div as div2 } from "gpui-kit";
var TIMED_W = 64;
function timeLeftShare(runsOutAt, now) {
  return Math.min(1, Math.max(0, (runsOutAt - now) / SETTLED_MS));
}
function timeLeftOf(b, drawn, now) {
  if (b.runsOutAt === undefined || b.isHidden)
    return null;
  const was = drawn.get(b.id);
  if (b.isOut)
    return { is: "paused", share: was?.is === "paused" ? was.share : timeLeftShare(b.runsOutAt, now) };
  return b.runsOutAt > now ? { is: "emptying", isStarted: was?.is === "emptying" } : null;
}
function timeLeftDraws(blocks, drawn, now) {
  const buttons = blocks.flatMap((b) => b.kind === "row" ? b.buttons : []);
  return new Map(buttons.flatMap((b) => {
    const left = timeLeftOf(b, drawn, now);
    return left ? [[b.id, left]] : [];
  }));
}
function timeLeftEl(left, runsOutAt, now, t) {
  const cut = div2().absolute().top(0).left(0).h(BUTTON_H).overflow_hidden().child(div2().w(TIMED_W).h(BUTTON_H).rounded(BUTTON_H / 2).bg(t.hover));
  if (left.is === "paused")
    return cut.w(left.share * TIMED_W);
  return cut.w(left.isStarted ? 0 : timeLeftShare(runsOutAt, now) * TIMED_W).transition("width", { duration: Math.max(0, runsOutAt - now), easing: "linear" });
}

// src/paint-blocks.ts
function buttonEl(b, p, isInert = false) {
  const { t } = p;
  const isPill = b.emphasis !== "quiet";
  const runsOutAt = b.runsOutAt;
  const left = p.timeLeft.get(b.id);
  const base = h_flex2().id(`button ${b.id}`).flex_none().h(BUTTON_H).items_center().justify_center().accessibility_label(b.label).when(runsOutAt !== undefined, (e) => e.relative().w(TIMED_W).rounded(BUTTON_H / 2)).when(left !== undefined, (e) => left ? e.child(timeLeftEl(left, runsOutAt ?? 0, p.now, t)) : e).child(b.label);
  const shaped = isPill && runsOutAt === undefined ? base.px(INSET).rounded(BUTTON_H / 2).border_1() : base;
  if (b.isHidden)
    return shaped.invisible().disabled(true);
  if (b.isOut)
    return shaped.border_color(CLEAR).text_color(t.muted).opacity(0.5).disabled(true);
  const styled = b.emphasis === "primary" ? shaped.border_color(t.solid).bg(t.solid).text_color(t.solid_foreground) : b.emphasis === "normal" ? shaped.border_color(t.input).text_color(t.foreground) : shaped.text_color(t.muted);
  if (isInert)
    return styled;
  const live = b.emphasis === "primary" ? styled.hover((s) => s.opacity(0.85)).active((s) => s.opacity(0.7)) : b.emphasis === "normal" ? styled.hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)) : styled.hover((s) => s.text_color(t.foreground)).active((s) => s.text_color(t.foreground).opacity(0.7));
  return live.on_click((_e, cx) => {
    cx.stop_propagation();
    p.press(b, cx);
  });
}
var CLEAR = "#00000000";
var buttonsEl = (buttons, p, indent, isInert = false) => h_flex2().flex_wrap().items_center().gap(CONTROL_GAP).pt(CONTROL_GAP).pl(indent).children(buttons.map((b) => buttonEl(b, p, isInert)));
var markEl = (m, t) => div3().w(MARK_W).flex_none().text_color(m === null || m.tone === null ? t.muted : colorOf(t, m.tone)).when(m?.isRunning === true, (e) => e.loop("opacity", { from: 1, to: 0.3, period: RUNNING_PULSE_MS })).child(m?.text ?? "");
var lineEl = (text, color, indent = MARK_W) => div3().pl(indent).pt(LINE_GAP).whitespace_normal().text_color(color).child(text);
var bodyLineEl = (l, t) => l.mark ? h_flex2().pt(LINE_GAP).items_start().child(markEl(l.mark, t)).child(div3().flex_1().min_w(0).whitespace_normal().text_color(colorOf(t, l.tone)).child(l.text)) : lineEl(l.text, colorOf(t, l.tone));
function fieldEl(f, p, indent, isInert = false) {
  const { t } = p;
  const state = p.input(f.rowId);
  const input = state ? [
    div3().min_h(BUTTON_H).px(INSET).py(SPACE.xs).rounded(BOX_RADIUS).border_1().border_color(t.input).child(Input.new(state).w_full())
  ] : [];
  return v_flex2().pl(indent).children(input).child(buttonsEl(f.buttons, p, 0, isInert));
}
function opacityOf(r, p) {
  const m = p.motion.get(r.id);
  if (m?.state === "leaving")
    return m.isStart ? 1 : 0;
  if (m?.state === "entering")
    return m.isStart ? 0 : 1;
  return null;
}
function rowEl(r, p) {
  const { t } = p;
  const line = h_flex2().items_start().child(markEl(r.mark, t)).child(div3().flex_1().min_w(0).text_color(r.isDim ? t.muted : t.foreground).when(!r.isSelected, (e) => e.truncate()).when(r.isSelected, (e) => e.font_semibold()).child(r.title)).when(r.age !== null, (e) => e.child(div3().flex_none().ml(INSET).text_color(t.muted).child(r.age ?? "")));
  const feedbackUnder = isStatusUnder(r) ? r.feedback : null;
  const lines = [
    ...r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : [],
    ...r.feedback && !feedbackUnder ? [r.feedback] : [],
    ...r.heldLine ? [r.heldLine] : [],
    ...r.body
  ];
  const opacity = opacityOf(r, p);
  const isLeaving = p.motion.get(r.id)?.state === "leaving";
  return v_flex2().id(`row ${r.id}`).pl(EDGE + r.depth * NEST).pr(EDGE).py(ROW_PAD_PT).when(opacity !== null, (e) => e.opacity(opacity ?? 1).transition("opacity", { duration: isLeaving ? EXIT_MS : ENTER_MS, easing: "ease-out" })).when(r.isSelected, (e) => e.bg(t.selected)).when(r.isSelectable && !r.isSelected && !isLeaving, (e) => e.hover((s) => s.bg(t.hover)).on_click((_e, cx) => p.select(r.id, cx))).child(line).children(lines.map((l) => ("isHidden" in l) && l.isHidden ? bodyLineEl(l, t).opacity(0) : bodyLineEl(l, t))).when(r.buttons.length > 0, (e) => e.child(buttonsEl(r.buttons, p, MARK_W, isLeaving))).when(r.field !== null, (e) => e.child(r.field ? fieldEl(r.field, p, MARK_W, isLeaving).pt(CONTROL_GAP) : div3())).when(feedbackUnder !== null, (e) => e.child(feedbackUnder ? bodyLineEl(feedbackUnder, t) : div3()));
}
var statusPartEl = (text) => div3().min_w(0).max_w_full().whitespace_normal().child(text);
function statusEl(s, p) {
  const { t } = p;
  const name = statusPartEl(s.stall ? `${s.name}${STALL_GAP}` : s.name).when(s.isBold, (e) => e.font_semibold()).when(s.isMuted, (e) => e.text_color(t.muted));
  const stall = s.stall ? [statusPartEl(s.stall.text).text_color(colorOf(t, s.stall.tone))] : [];
  return v_flex2().pl(EDGE + s.depth * NEST).pr(EDGE).child(h_flex2().items_start().child(markEl(s.mark, t)).child(h_flex2().flex_1().min_w(0).flex_wrap().child(name).children(stall))).children(s.under.map((l) => lineEl(l, t.muted))).when(s.buttons.length > 0, (e) => e.child(buttonsEl(s.buttons, p, MARK_W)));
}
function prEl(b, p) {
  const { t } = p;
  const title = h_flex2().items_start().child(div3().flex_1().min_w(0).font_semibold().whitespace_normal().child(b.title)).when(!p.isNarrow, (e) => e.child(div3().flex_none().ml(INSET).text_color(t.muted).child(b.number)));
  const hasReasons = b.unlisted.length > 0;
  const word = h_flex2().items_start().min_w(0).max_w_full().child(div3().min_w(0).whitespace_normal().text_color(colorOf(t, b.status.tone)).child(b.status.text)).when(hasReasons, (e) => e.child(div3().flex_none().text_color(t.muted).child(SEP)));
  const reasons = b.unlisted.map((u, i) => statusPartEl(i < b.unlisted.length - 1 ? `${u}${SEP}` : u).text_color(t.muted));
  const status = h_flex2().flex_wrap().items_start().pt(LINE_GAP).when(p.isNarrow, (e) => e.child(div3().flex_none().text_color(t.muted).child(`${b.number}${SEP}`))).child(word).children(reasons);
  return v_flex2().pl(EDGE).pr(EDGE).child(title).child(status).when(b.error !== null, (e) => e.child(lineEl(b.error ?? "", t.ansi1, 0))).when(b.buttons.length > 0, (e) => e.child(buttonsEl(b.buttons, p, 0))).when(b.feedback !== null, (e) => e.child(lineEl(b.feedback?.text ?? "", colorOf(t, b.feedback?.tone ?? null), 0)));
}
function textLineEl(b, p) {
  const { t } = p;
  return v_flex2().pl(EDGE).pr(EDGE).child(h_flex2().gap(CONTROL_GAP).items_center().child(div3().flex_1().min_w(0).whitespace_normal().child(b.text ?? "")).when(b.buttons.length > 0, (e) => e.child(h_flex2().flex_none().gap(CONTROL_GAP).children(b.buttons.map((x) => buttonEl(x, p)))))).when(b.under !== null, (e) => e.child(lineEl(b.under ?? "", t.muted, 0))).when(b.feedback !== null, (e) => e.child(lineEl(b.feedback?.text ?? "", colorOf(t, b.feedback?.tone ?? null), 0)));
}
var ruleLine = (t) => div3().flex_1().border_t(1).border_color(t.border);
function headingEl(b, p) {
  const { t } = p;
  const buttons = h_flex2().flex_none().gap(CONTROL_GAP).items_center().children(b.buttons.map((x) => buttonEl(x, p)));
  if (b.isLabel)
    return h_flex2().flex_wrap().pl(TEXT_X).pr(EDGE).gap(CONTROL_GAP).items_center().child(statusPartEl(b.text).text_color(t.muted)).child(ruleLine(t).min_w(GROUP_GAP)).child(buttons);
  return h_flex2().pl(EDGE).pr(EDGE).items_center().child(markEl(b.mark, t)).child(div3().min_w(0).whitespace_normal().font_semibold().child(b.text)).when(b.count !== null, (e) => e.child(div3().text_color(t.muted).child(`${SEP}${b.count}`))).child(div3().flex_1()).child(buttons);
}
function emptyEl(b, p) {
  const { t } = p;
  return v_flex2().items_center().p(GROUP_GAP).gap(LINE_GAP).child(div3().font_semibold().text_center().whitespace_normal().child(b.title)).when(b.hint !== null, (e) => e.child(div3().text_center().whitespace_normal().text_color(t.muted).child(b.hint ?? ""))).when(b.buttons.length > 0, (e) => e.child(h_flex2().flex_wrap().justify_center().gap(CONTROL_GAP).pt(CONTROL_GAP).children(b.buttons.map((x) => buttonEl(x, p)))));
}
function foldEl(b, p) {
  const { t } = p;
  const fold = {
    id: b.id,
    label: b.text,
    emphasis: "quiet",
    isOut: false,
    hotkey: null,
    does: { is: "view", change: b.change }
  };
  return h_flex2().id(`fold ${b.id}`).pl(TEXT_X + b.depth * NEST).pr(EDGE).py(ROW_PAD_PT).items_start().text_color(t.muted).hover((s) => s.text_color(t.foreground)).accessibility_label(b.text).on_click((_e, cx) => p.press(fold, cx)).when(b.kind === "fold", (e) => e.child(div3().mr(CONTROL_GAP).child(b.kind === "fold" && b.isOpen ? "▾" : "▸"))).child(div3().min_w(0).whitespace_normal().child(b.text));
}
function ruleEl(b, t) {
  if (b.text === null)
    return h_flex2().pl(EDGE).pr(EDGE).child(ruleLine(t));
  return h_flex2().pl(TEXT_X).pr(EDGE).gap(CONTROL_GAP).items_center().child(div3().flex_none().text_color(t.muted).child(b.text)).child(ruleLine(t));
}
function noteEl(b, t) {
  const text = div3().min_w(0).when(b.isStrong, (e) => e.font_semibold()).text_color(b.isStrong ? t.foreground : colorOf(t, b.tone)).child(b.text);
  const count = b.count === null ? [] : [div3().whitespace_nowrap().text_color(t.muted).child(b.count)];
  return h_flex2().flex_wrap().items_baseline().pl(TEXT_X + b.depth * NEST).pr(EDGE).whitespace_normal().when(b.isStrong, (e) => e.text_size(HEAD_TEXT).line_height(HEAD_LINE)).child(text).children(count);
}
function blockEl(b, p) {
  const { t } = p;
  if (b.kind === "row")
    return rowEl(b, p);
  if (b.kind === "status")
    return statusEl(b, p);
  if (b.kind === "pr")
    return prEl(b, p);
  if (b.kind === "line")
    return textLineEl(b, p);
  if (b.kind === "heading")
    return headingEl(b, p);
  if (b.kind === "empty")
    return emptyEl(b, p);
  if (b.kind === "fold" || b.kind === "more")
    return foldEl(b, p);
  if (b.kind === "rule")
    return ruleEl(b, t);
  if (b.kind === "field")
    return div3().pl(TEXT_X).pr(EDGE).child(fieldEl(b.field, p, 0));
  if (b.kind === "note")
    return noteEl(b, t);
  if (b.kind === "caption")
    return div3().pl(EDGE).pr(EDGE).text_color(t.muted).child(b.text);
  if (b.kind === "banner")
    return bannerEl(b.banner, t, b.buttons.map((x) => buttonEl(x, p)), b.feedback ? lineEl(b.feedback.text, colorOf(t, b.feedback.tone), 0) : null);
  return div3();
}

// src/paint-space.ts
import { div as div4 } from "gpui-kit";
var padOf = (b) => b.kind === "row" || b.kind === "fold" || b.kind === "more" ? ROW_PAD_PT : 0;
var depthOf = (b) => ("depth" in b) ? b.depth : 0;
var isOneLine = (b) => b.kind === "status" ? b.under.length === 0 && b.buttons.length === 0 : b.kind === "note" || b.kind === "fold";
function itemGap(prev, b) {
  if (isOneLine(prev) && isOneLine(b))
    return CONTROL_GAP;
  if (depthOf(b) === 0)
    return ITEM_GAP;
  return INSET;
}
function gapBetween(prev, b) {
  const isLabelled = prev.kind === "heading" || prev.kind === "caption" || prev.kind === "rule" && prev.text !== null;
  if (isLabelled)
    return HEAD_GAP;
  if (prev.kind === "rule" || b.kind === "rule")
    return GROUP_GAP / 2;
  if (prev.kind === "note" && prev.isHead && b.kind === "note" && b.isHead)
    return LINE_GAP;
  if (prev.kind === "line" && b.kind === "line")
    return CONTROL_GAP;
  if (prev.kind === "line" || prev.kind === "banner")
    return GROUP_GAP;
  if (b.kind === "heading")
    return prev.kind === "row" || prev.kind === "pr" ? ITEM_GAP : GROUP_GAP;
  if ([prev, b].some((x) => x.kind === "row" || x.kind === "more"))
    return EDGE;
  return itemGap(prev, b);
}
function spacedEls(blocks, el) {
  const out = [];
  let prev = null;
  let isSection = false;
  for (const b of blocks) {
    if (b.kind === "gap") {
      isSection = prev !== null;
      continue;
    }
    const gap = prev === null ? 0 : isSection ? GROUP_GAP : gapBetween(prev, b);
    const above = Math.max(0, gap - (prev === null ? 0 : padOf(prev)) - padOf(b));
    out.push(div4().flex_none().pt(above).child(el(b)));
    prev = b;
    isSection = false;
  }
  return out;
}

// src/press-file.ts
var PRESS_LABEL = "inbox.press";
var pressPath = (appHome, sessionId, pressId) => `${pressFolder(appHome, sessionId)}/${pressId}.json`;
var newPressId = (now, random) => `${now.toString(36)}-${Math.floor(random * 36 ** 6).toString(36)}`;
function pressFileText(id, pressedAt, press, holds, result = null) {
  const { replies, discarded, shownSince, listInput } = holds;
  return JSON.stringify({
    format: HERDR_FORMAT,
    id,
    pressedAt,
    press,
    holds: { replies, discarded, shownSince, listInput },
    ...result ? { result } : {}
  });
}

// src/out.ts
var SENDING = "Sending…";
var REREAD_AFTER_MS = 5000;
var GIVE_UP_MS = 15000;
var outAction2 = (p) => ("id" in p) ? actionId(p) : p.action;
function rowSignature(view, rowId) {
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows];
  const state = rows.find((r) => r.id === rowId)?.state.is ?? null;
  const goal = rowId === GOAL_KEYS_ID ? view.statusPage.goal?.text ?? null : null;
  return JSON.stringify([view.lastActions[rowId] ?? null, state, goal]);
}
var resultLine = (result) => ({
  text: feedbackText({ is: "local", result }, "herdr"),
  tone: result.state === "failed" ? "error" : "muted",
  source: { is: "local", result }
});
function unconfirmedLine(out, now) {
  if (out.result)
    return resultLine(out.result);
  const label = deliveryLabel("unconfirmed", out.label, out.reply);
  return { text: label, tone: "muted", source: { is: "unconfirmed", label, at: now } };
}
function notSentLine(reason) {
  const source = { is: "notSent", reason, retry: null };
  return { text: feedbackText(source, "herdr"), tone: "error", source };
}
var notAppliedLine = (out, agent) => out.result ? resultLine(out.result) : notAppliedText(`${agent}'s inbox did not answer.`);
var notAppliedText = (why) => ({
  text: `Not applied: ${why}`,
  tone: "error",
  source: { is: "notSent", reason: why, retry: null }
});
function settleOuts(outs, view, lastPress, now) {
  const settled = { outs: [], notes: {}, lines: {}, toClaim: [] };
  for (const out of outs) {
    if (lastPress?.id === out.pressId) {
      if (lastPress.outcome === "stale")
        settled.notes[out.rowId] = { note: "stale", at: now };
      continue;
    }
    if (rowSignature(view, out.rowId) !== out.before)
      continue;
    const isPassed = lastPress !== null && lastPress.id > out.pressId;
    if (out.isWritten && out.isTaken && isPassed)
      settled.lines[out.rowId] = unconfirmedLine(out, now);
    else if (!out.isWritten || out.waitingSince === null || now - out.waitingSince < GIVE_UP_MS)
      settled.outs.push(out);
    else if (out.isTaken)
      settled.lines[out.rowId] = unconfirmedLine(out, now);
    else
      settled.toClaim.push(out);
  }
  return settled;
}
var lastActionKey = (view, rowId) => JSON.stringify(view.lastActions[rowId] ?? null);
function isSentConfirmed(sent, view, lastPress) {
  const isNamed = lastPress?.id === sent.pressId;
  const isPassed = lastPress !== null && lastPress.id > sent.pressId;
  if (!isNamed && !isPassed)
    return null;
  const delivery = view.lastActions[sent.rowId]?.delivery;
  const isChanged = lastActionKey(view, sent.rowId) !== sent.lastBefore;
  return isChanged && isPressConfirmed({
    error: delivery?.state === "failed" ? delivery.reason : null,
    note: isNamed && lastPress?.outcome === "stale" ? "stale" : null,
    isUnconfirmed: delivery?.state === "unconfirmed"
  });
}
function nextOutCheckAt(outs, now) {
  const times = outs.flatMap((out) => out.waitingSince === null ? [] : [out.waitingSince + REREAD_AFTER_MS, out.waitingSince + GIVE_UP_MS]);
  const later = times.filter((at) => at > now);
  return later.length ? Math.min(...later) : null;
}
var withOutButtons = (buttons, outRows) => buttons.map((b) => b.does.is === "press" && outRows.has(pressRowId(b.does.press)) ? { ...b, isOut: true } : b);
function drawOuts(blocks, outs, lines, now) {
  const byRow = new Map(outs.map((o) => [o.rowId, o]));
  const outRows = new Set(byRow.keys());
  const lineOf = (id) => {
    const out = byRow.get(id);
    if (!out)
      return lines[id] ?? null;
    const source = out.pending ?? { is: "sending", label: SENDING, at: now };
    if (out.result)
      return { ...resultLine(out.result), source };
    return { text: out.pending ? feedbackText(out.pending, "herdr") : SENDING, tone: "muted", source };
  };
  return blocks.map((b) => {
    if (b.kind === "row" || b.kind === "pr" || b.kind === "line" || b.kind === "banner") {
      const line = lineOf(b.id);
      return { ...b, buttons: withOutButtons(b.buttons, outRows), ...line ? { feedback: line } : {} };
    }
    if (b.kind === "status" || b.kind === "heading" || b.kind === "empty")
      return { ...b, buttons: withOutButtons(b.buttons, outRows) };
    return b;
  });
}

// src/run-here.ts
var isOpenedHere = (target, projectFolder) => /^https?:\/\//.test(target) || target.startsWith("/") || target.startsWith("~/") || projectFolder !== null;
function isRunHere(effects, projectFolder) {
  return effects.length > 0 && effects.every((e) => e.kind === "copy" || e.kind === "open" && isOpenedHere(e.target, projectFolder));
}
function pendingOf(effects, at) {
  return effects.length > 0 ? { is: "local", result: pendingResult([...effects], at) } : null;
}
async function runHere(effects, pending, io) {
  const parts = pending.parts.map((p) => ({ ...p }));
  for (const [i, e] of effects.entries()) {
    if (e.kind === "copy") {
      io.copy(e.text);
      continue;
    }
    const error = await openTarget(io.run, io.probe, e.target, io.projectFolder ?? "/", io.home);
    if (error === null)
      continue;
    parts[i] = { ...parts[i], error };
    return { ...pending, state: "failed", parts: parts.slice(0, i + 1) };
  }
  return { ...pending, state: "done", parts };
}
var firstError = (r) => r.parts.find((p) => p.error !== null)?.error ?? null;

// src/press-queue.ts
var claimedPath = (path) => `${path}.withdrawn`;

class PressQueue {
  io;
  outs = [];
  notes = {};
  lines = {};
  sentTexts = [];
  constructor(io) {
    this.io = io;
  }
  send(target, press, effects, label, reply) {
    const rowId = pressRowId(press);
    const refuse = (reason) => {
      this.lines[rowId] = notSentLine(reason);
      return { is: "refused", reason };
    };
    if (target === null)
      return refuse("this terminal has no inbox to send to.");
    if (this.outs.some((o) => o.rowId === rowId))
      return refuse("the last press on this row has not finished.");
    const now = this.io.now();
    const pressId = newPressId(now, this.io.random());
    const pending = pendingOf(effects, now);
    const out = {
      pressId,
      rowId,
      path: pressPath(target.appHome, target.sessionId, pressId),
      action: outAction2(press),
      label,
      ...reply !== undefined ? { reply } : {},
      pending,
      result: null,
      before: rowSignature(target.view, rowId),
      isWritten: false,
      waitingSince: null,
      isTaken: false
    };
    this.outs = [...this.outs, out];
    if ("id" in press && press.action === "type")
      this.sentTexts = [
        ...this.sentTexts,
        { pressId, rowId, text: press.text, lastBefore: lastActionKey(target.view, rowId) }
      ];
    delete this.lines[rowId];
    delete this.notes[rowId];
    return { is: "sent", finish: (runHere, ran) => this.finish(out, now, target, press, effects, runHere, ran) };
  }
  async finish(out, pressedAt, target, press, effects, runHere, ran) {
    const pending = out.pending?.is === "local" ? out.pending.result : null;
    if (pending && isRunHere(effects, target.projectFolder)) {
      out.result = await runHere(effects, pending);
      ran();
    }
    const local = out.result ? { error: firstError(out.result) } : null;
    const text = pressFileText(out.pressId, pressedAt, press, target.holds, local);
    const failed = await this.io.write(out.path, text);
    if (failed !== null) {
      this.outs = this.outs.filter((o) => o !== out);
      this.forget(out);
      this.lines[out.rowId] = notAppliedText(failed);
      return;
    }
    out.isWritten = true;
    out.waitingSince = this.io.now();
    await this.io.wake(target.terminal, out.pressId);
  }
  forget(out) {
    this.sentTexts = this.sentTexts.filter((s) => s.pressId !== out.pressId);
  }
  isAwaiting() {
    return this.outs.length > 0 || this.sentTexts.length > 0;
  }
  answerSentTexts(view, lastPress) {
    const isUntaken = (s) => this.outs.some((o) => o.pressId === s.pressId && !o.isTaken);
    const answers = this.sentTexts.map((sent) => ({
      sent,
      isConfirmed: isUntaken(sent) ? null : isSentConfirmed(sent, view, lastPress)
    }));
    this.sentTexts = answers.flatMap((a) => a.isConfirmed === null ? [a.sent] : []);
    return answers.flatMap((a) => a.isConfirmed ? [a.sent] : []);
  }
  async settle(view, lastPress, agent) {
    for (const out of this.outs)
      if (out.isWritten)
        out.isTaken = await this.io.isGone(out.path);
    const confirmed = this.answerSentTexts(view, lastPress);
    const now = this.io.now();
    const settled = settleOuts(this.outs, view, lastPress, now);
    this.outs = settled.outs;
    this.notes = { ...this.notes, ...settled.notes };
    this.lines = { ...this.lines, ...settled.lines };
    for (const out of settled.toClaim) {
      if (await this.io.claim(out.path)) {
        this.forget(out);
        this.lines[out.rowId] = notAppliedLine(out, agent);
        continue;
      }
      out.isTaken = true;
      out.waitingSince = this.io.now();
      this.outs = [...this.outs, out];
    }
    return confirmed;
  }
  nextCheckAt() {
    return nextOutCheckAt(this.outs, this.io.now());
  }
}

// src/screen.ts
var TRIMMED_NOTE = "This session is too large to show in full, so its older closed items are left out.";
var message = (title, hint, isError = false) => ({
  is: "message",
  message: { title, hint, isError }
});
function messageOf(followed, read) {
  if (followed.is === "no-terminal")
    return message("No terminal in this tab", "Open an agent with the inbox in this tab to see it here.");
  if (followed.is === "no-inbox")
    return message("No inbox in this terminal", followed.program ? `${followed.program} runs here without the inbox.` : "Start an agent with the inbox here to see its questions and findings.");
  if (followed.is === "ended")
    return message("The session ended", "This terminal is back at its shell.");
  if (read === null)
    return message(READING_TEXT, null);
  if (read.is === "missing")
    return message("Waiting for the inbox", "The agent publishes its inbox here after its next reply.");
  if (read.is === "torn")
    return message(READING_TEXT, null);
  if (read.is === "newer")
    return message("This panel is out of date", `The agent writes its inbox in format ${read.format}. Update the inbox to read it.`, true);
  if (read.is === "refused")
    return message("Can't read this inbox", `Its file has ${read.reason}.`, true);
  return null;
}
function screenOf(followed, read, ui, o) {
  const shown = messageOf(followed, read);
  if (shown !== null || read?.is !== "read")
    return shown ?? message(READING_TEXT, null);
  const { holds } = o;
  const view = sessionView(read.session, o.now, SETTLED_MS, holds, o.queue.notes);
  const screen = {
    view,
    agent: read.envelope.agent,
    now: o.now,
    shownSince: holds.shownSince ?? o.now,
    isNextBuild: o.isNextBuild,
    isGhMissing: read.session.prViews.isGhMissing === true
  };
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows];
  const settled = rows.flatMap((r) => r.state.is === "settled" ? [r.state] : []);
  const placing = {
    lastTypedMessageAt: read.session.presence.lastTypedMessageAt,
    listInput: holds.listInput,
    now: o.now,
    settleWindowMs: SETTLED_MS
  };
  return {
    is: "inbox",
    view,
    tabs: tabCells(screen, ui.tab),
    ...chrome(screen, ui.tab),
    trimmedNote: read.isTrimmed ? TRIMMED_NOTE : null,
    blocks: drawOuts(tabBlocks(screen, ui), o.queue.outs, o.queue.lines, o.now),
    waits: rowWaits(screen, ui.tab),
    foldAt: nextFoldAt(settled, placing),
    undoPlaceEndsAt: nextUndoPlaceEnd(settled, o.now)
  };
}
function nextUndoPlaceEnd(settled, now) {
  const ends = settled.filter((s) => s.offersUndo && s.delivery === "queued").map(undoPlaceEndsAt).filter((at) => at > now);
  return ends.length > 0 ? Math.min(...ends) : null;
}

// src/main.ts
var REREAD_MS = 1e4;
var AGE_TICK_MS = 60000;
var TORN_RETRY_MS = 30;
var TORN_RETRIES = 5;
var NEXT_FRAME_MS = 16;
var toggled = (list, x) => list.includes(x) ? list.filter((y) => y !== x) : [...list, x];
var herdrRun = (args, opts) => exec(args[0] ?? "", args.slice(1), { cwd: opts.cwd, timeout: opts.timeoutMs }).catch((e) => ({
  code: 127,
  stdout: "",
  stderr: String(e)
}));
var isTrue = (args) => herdrRun(["test", ...args], { cwd: "/", timeoutMs: 5000 }).then((r) => r.code === 0);
var probe = {
  async stat(path) {
    if (!await isTrue(["-e", path]))
      return null;
    const isFile = await isTrue(["-f", path]);
    return { isFile: () => isFile };
  },
  isExecutable: (path) => isTrue(["-x", path])
};
var queueIo = {
  now: () => Date.now(),
  random: () => Math.random(),
  write: (path, text) => writeTextFile(path, text, null).then(() => null, (e) => String(e)),
  isGone: async (path) => await readTextFile(path).catch(() => null) === null,
  async claim(path) {
    const moved = await herdrRun(["mv", path, claimedPath(path)], { cwd: "/", timeoutMs: 5000 });
    if (moved.code !== 0)
      return false;
    await herdrRun(["rm", "-f", claimedPath(path)], { cwd: "/", timeoutMs: 5000 });
    return true;
  },
  async wake(terminal, pressId) {
    await hc(["label", terminal, `${PRESS_LABEL}=${pressId}`]).catch(() => null);
  }
};

class Inbox extends View {
  tab = null;
  last = null;
  followed = { is: "no-terminal" };
  sessionId = null;
  read = null;
  view = null;
  ui = freshUi("needsYou");
  shownSince = Date.now();
  isNextBuild = false;
  isHelpShown = false;
  isNarrow = false;
  drafts = {};
  confirmed = [];
  input = null;
  discarded = {};
  listInput = null;
  queue = new PressQueue(queueIo);
  tracks = NO_TRACKS;
  tracksOf = "";
  lastWaits = { tab: "needsYou", rows: [] };
  timeLeft = new Map;
  linesAbove = NO_LINES_ABOVE;
  focus = null;
  outTimer = null;
  drawTimer = null;
  init(_props, cx) {
    this.focus = cx.focus_handle();
    cx.spawn(async (cx) => {
      this.isNextBuild = await readTextFile(`${appHome()}/mods/inbox/${NEXT_BUILD_MARK}`).catch(() => null) !== null;
      cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;; ) {
        const changed = await watchFolder(publishedSessionsFolder(appHome())).catch(() => null);
        if (changed === null)
          await cx.sleep(REREAD_MS);
        else if (this.sessionId && isSessionChange(changed, appHome(), this.sessionId))
          this.load(this.sessionId, cx);
      }
    });
    cx.timer.every(REREAD_MS, (cx) => this.sessionId && this.load(this.sessionId, cx));
    cx.timer.every(AGE_TICK_MS, (cx) => cx.notify());
  }
  holds(now) {
    this.discarded = keptDiscards(this.discarded, this.shownSince);
    return {
      replies: heldReplies(this.ui.typing, this.drafts),
      discarded: this.discarded,
      shownSince: this.shownSince,
      listInput: this.listInput && withListInput(this.listInput, now)
    };
  }
  load(sessionId, cx) {
    cx.spawn(async (cx) => {
      for (let n = 0;; n++) {
        const text = await readTextFile(publishedSessionPath(appHome(), sessionId)).catch((e) => e);
        const read = typeof text === "string" || text === null ? readSession(text) : { is: "refused", reason: String(text) };
        if (read.is === "torn" && n < TORN_RETRIES) {
          await cx.sleep(TORN_RETRY_MS);
          continue;
        }
        if (this.sessionId !== sessionId)
          return;
        this.read = read;
        await this.settle(cx);
        cx.notify();
        return;
      }
    });
  }
  async settle(cx) {
    if (this.read?.is !== "read" || !this.queue.isAwaiting())
      return;
    const now = Date.now();
    const view = sessionView(this.read.session, now, SETTLED_MS, this.holds(now), this.queue.notes);
    const queue = this.queue;
    const confirmed = await queue.settle(view, this.read.lastPress, this.read.envelope.agent);
    if (queue === this.queue)
      this.dropConfirmed([...this.confirmed, ...confirmed]);
    this.checkOutsAt(this.queue.nextCheckAt(), cx);
  }
  checkOutsAt(at, cx) {
    this.outTimer?.cancel();
    const sessionId = this.sessionId;
    this.outTimer = at === null || sessionId === null ? null : cx.timer.after(Math.max(0, at - Date.now()), (cx) => this.load(sessionId, cx));
  }
  track(cx) {
    const own = panes().find((p) => p.pane === props()?.pane);
    this.tab ??= own?.tab ?? focused()?.tab ?? null;
    if (this.tab === null)
      return;
    this.followed = follow({ focused: focused(), panes: panes(), terminals: terminals() }, this.tab, this.last);
    if (this.followed.is !== "no-terminal")
      this.last = this.followed.terminal;
    const sessionId = this.followed.is === "session" ? this.followed.sessionId : null;
    if (sessionId === this.sessionId)
      return;
    this.sessionId = sessionId;
    this.read = null;
    this.view = null;
    this.ui = freshUi(this.ui.tab);
    this.shownSince = Date.now();
    this.drafts = {};
    this.confirmed = [];
    this.input?.state.release();
    this.input = null;
    this.discarded = {};
    this.queue = new PressQueue(queueIo);
    if (sessionId)
      this.load(sessionId, cx);
  }
  change(c) {
    const ui = this.ui;
    if ("showOptions" in c)
      ui.optionsShown = toggled(ui.optionsShown, c.showOptions);
    else if ("closedFold" in c)
      ui.unfolded = toggled(ui.unfolded, c.closedFold);
    else if ("earlier" in c)
      ui.closedAll = [...ui.closedAll, c.earlier];
    else if ("toggleFold" in c)
      ui.statusUnfolded = toggled(ui.statusUnfolded, c.toggleFold);
    else if ("showAsk" in c)
      this.ui = withSelected({ ...ui, tab: "needsYou" }, c.showAsk);
    else
      this.isHelpShown = !this.isHelpShown;
    this.closeStaleField();
  }
  closeStaleField() {
    if (this.input === null || this.ui.typing === this.input.rowId)
      return;
    this.input.state.release();
    this.input = null;
    this.focus?.focus();
    this.dropConfirmed(this.confirmed);
  }
  dropConfirmed(confirmed) {
    const next = withoutConfirmed(this.drafts, confirmed, this.ui.typing, this.queue.sentTexts);
    this.drafts = next.drafts;
    this.confirmed = next.waiting;
  }
  type(does) {
    const draft = this.drafts[does.rowId] ??= { text: does.text, since: Date.now() };
    const state = InputState.new({ placeholder: does.hint, value: draft.text });
    state.on("change", () => draft.text = state.value());
    state.on("submit", (_e, cx) => this.submit(does.rowId, cx));
    this.input?.state.release();
    this.input = { rowId: does.rowId, state };
    this.ui.typing = does.rowId;
    state.focus();
  }
  leave(rowId, isDiscard, cx) {
    if (isDiscard) {
      this.discarded = { ...this.discarded, [rowId]: Date.now() };
      delete this.drafts[rowId];
    }
    this.input?.state.release();
    this.input = null;
    this.ui.typing = null;
    this.focus?.focus();
    this.dropConfirmed(this.confirmed);
    if (isDiscard && this.sessionId)
      this.load(this.sessionId, cx);
  }
  submit(rowId, cx) {
    const text = this.input?.state.value().trim() ?? "";
    if (text === "")
      return;
    const isGoal = rowId === GOAL_KEYS_ID;
    const label = isGoal ? GOAL_FIELD.submit : ROW_COPY.send;
    const isSent = this.send({ action: "type", id: rowId, text }, [], label, cx, isGoal ? undefined : text);
    this.ui = afterSend(this.ui, rowId, isSent);
    this.closeStaleField();
  }
  send(press, effects, label, cx, reply) {
    const read = this.read?.is === "read" ? this.read : null;
    const target = this.sessionId && read && this.view ? {
      appHome: appHome(),
      sessionId: this.sessionId,
      terminal: read.envelope.terminal,
      view: this.view,
      holds: this.holds(Date.now()),
      projectFolder: read.projectFolder
    } : null;
    const sent = this.queue.send(target, press, effects, label, reply);
    cx.notify();
    if (sent.is === "refused")
      return false;
    const queue = this.queue;
    const projectFolder = target?.projectFolder ?? null;
    cx.spawn(async (cx) => {
      await sent.finish((effects, pending) => runHere(effects, pending, {
        run: herdrRun,
        probe,
        home: home(),
        projectFolder,
        copy: (t) => cx.write_to_clipboard(t)
      }), () => cx.notify());
      cx.notify();
      if (queue === this.queue)
        this.checkOutsAt(queue.nextCheckAt(), cx);
    });
    return true;
  }
  press(b, cx) {
    const now = Date.now();
    this.listInput = withListInput(this.listInput, now);
    const d = b.does;
    if (d.is === "view")
      this.change(d.change);
    else if (d.is === "press") {
      if ("id" in d.press && d.press.action === "undo")
        this.ui = withSelected(this.ui, d.press.id);
      this.send(d.press, d.effects, b.label, cx);
    } else if (d.is === "type")
      this.type(d);
    else if (d.is === "send")
      this.submit(d.rowId, cx);
    else if (d.is === "leave")
      this.leave(d.rowId, d.isDiscard, cx);
    cx.notify();
  }
  onKey(key, tabs, blocks, cx) {
    const undo = this.view ? tabUndo(this.view, this.ui.tab, this.shownSince) : null;
    const move = keyMove(key, tabs, blocks, this.ui.typing, undo);
    if (move === null)
      return;
    if (move.is === "close")
      this.leave(this.ui.typing ?? "", false, cx);
    else if (move.is === "tab")
      this.ui = withTab(this.ui, move.tab);
    else if (move.is === "select")
      this.ui = withSelected(this.ui, move.id);
    else if (move.is === "press")
      return this.press(move.button, cx);
    else if (this.followed.is !== "no-terminal")
      run("pane.focus", { terminal: this.followed.terminal });
    this.listInput = withListInput(this.listInput, Date.now());
    cx.stop_propagation();
    cx.notify();
  }
  render(cx) {
    this.track(cx);
    const t = theme();
    const now = Date.now();
    const screenFor = (ui) => screenOf(this.followed, this.read, ui, {
      now,
      isNextBuild: this.isNextBuild,
      holds: this.holds(now),
      queue: this.queue
    });
    let screen = screenFor(this.ui);
    if (screen.is === "inbox" && this.lastWaits.tab === this.ui.tab) {
      const ui = withClosedSelection(this.ui, this.lastWaits.rows, screen.waits);
      if (ui !== this.ui)
        screen = screenFor(this.ui = ui);
    }
    this.lastWaits = { tab: this.ui.tab, rows: screen.is === "inbox" ? screen.waits : [] };
    this.view = screen.is === "inbox" ? screen.view : null;
    this.drawTimer?.cancel();
    this.drawTimer = null;
    const paint = {
      t,
      press: (b, cx) => this.press(b, cx),
      select: (id, cx) => {
        this.ui = withSelected(this.ui, id);
        this.closeStaleField();
        this.listInput = withListInput(this.listInput, Date.now());
        cx.notify();
      },
      pick: (tab, cx) => {
        this.ui = withTab(this.ui, tab);
        this.closeStaleField();
        cx.notify();
      },
      motion: new Map,
      now,
      timeLeft: new Map,
      input: (rowId) => this.input?.rowId === rowId ? this.input.state : null,
      isNarrow: this.isNarrow
    };
    const root = v_flex3().id("inbox").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(TEXT).line_height(LINE).on_size_change((size, cx) => {
      const isNarrow = size.width < NARROW_PANE;
      if (isNarrow === this.isNarrow)
        return;
      this.isNarrow = isNarrow;
      cx.notify();
    });
    if (screen.is === "message") {
      this.timeLeft = new Map;
      this.tracksOf = "";
      return root.child(messageEl(screen.message, t));
    }
    const hasStatusButtons = screen.blocks.some((b) => b.kind === "status" && b.buttons.length > 0);
    const shown = this.isHelpShown ? helpBlocks(this.isNextBuild, this.ui.tab, hasStatusButtons) : screen.blocks;
    const tracksOf = `${this.sessionId} ${this.ui.tab} ${this.isHelpShown}`;
    const held = holdLinesAbove(shown, tracksOf !== this.tracksOf ? NO_LINES_ABOVE : this.linesAbove);
    this.linesAbove = held.held;
    const moved = moveRows(held.blocks, this.tracks, now, tracksOf !== this.tracksOf);
    this.tracks = moved.tracks;
    this.tracksOf = tracksOf;
    paint.motion = moved.motion;
    const isStarting = [...moved.motion.values()].some((m) => m.isStart);
    this.timeLeft = timeLeftDraws(moved.blocks, this.timeLeft, now);
    paint.timeLeft = this.timeLeft;
    const isTimerStarting = [...this.timeLeft.values()].some((l) => l.is === "emptying" && !l.isStarted);
    const nextFrame = isStarting || isTimerStarting ? now + NEXT_FRAME_MS : null;
    const wakeAt = [nextFrame, moved.nextAt, screen.foldAt, screen.undoPlaceEndsAt].filter((at) => at !== null);
    if (wakeAt.length > 0)
      this.drawTimer = cx.timer.after(Math.max(0, Math.min(...wakeAt) - now), (cx) => cx.notify());
    const focus = this.focus;
    return root.when(focus !== null, (e) => focus ? e.track_focus(focus) : e).on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx)).child(tabsEl(screen.tabs, screen.status, this.isHelpShown, paint)).children(screen.banners.map((b) => bannerEl(b, t).mt(EDGE))).when(screen.trimmedNote !== null, (e) => e.child(sessionNoteEl(screen.trimmedNote ?? "", t))).child(div5().flex_1().min_h(0).relative().child(v_flex3().id("inbox-list").absolute().inset_0().overflow_y_scroll().pt(EDGE).pb(END_SPACE).on_click((_e, _cx) => {
      const field = isFieldDrawn(this.ui, this.isHelpShown) ? this.input : null;
      if (field)
        field.state.focus();
      else
        this.focus?.focus();
    }).children(spacedEls(moved.blocks, (b) => blockEl(b, paint)))).child(scrollFadeEl(t, "top")).child(scrollFadeEl(t, "bottom")).child(Scrollbar.vertical("inbox-list").absolute().inset_0()));
  }
}
export {
  Inbox as default
};
