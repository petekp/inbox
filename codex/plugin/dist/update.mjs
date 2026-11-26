// Built by codex/build.mjs from codex/src and core/. Do not edit.

// src/update-main.ts
import { existsSync as existsSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname8, join as join12 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/cli.ts
import { existsSync } from "node:fs";
function namedCli(env) {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null;
}
var BUNDLED_CLI = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
var MAX_ANCESTORS = 8;
async function ancestorCodex(exec, startPid) {
  let pid = startPid;
  for (let level = 0; level < MAX_ANCESTORS && pid > 1; level++) {
    const r = await exec(["ps", "-o", "ppid=,comm=", "-p", String(pid)], { cwd: "/", timeoutMs: 5e3 }).catch(
      () => null
    );
    const match = r && r.code === 0 ? /^\s*(\d+)\s+(.+?)\s*$/.exec(r.stdout) : null;
    const [, parent, command] = match ?? [];
    if (!parent || !command) return null;
    if (/^\/(.*\/)?codex$/.test(command)) return { pid, cli: command };
    pid = Number(parent);
  }
  return null;
}
async function ancestorCli(exec, startPid) {
  return (await ancestorCodex(exec, startPid))?.cli ?? null;
}
async function findCli(env, exec, parentPid, hasBundled = () => existsSync(BUNDLED_CLI)) {
  const named = namedCli(env);
  if (named) return named;
  const running = await ancestorCli(exec, parentPid);
  if (running) return running;
  return hasBundled() ? BUNDLED_CLI : "codex";
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

// ../core/domain/status-limits.ts
var NAME_WORDS = 3;
var TEXT_WORDS = 4;
var DESCRIPTION_WORDS = 8;
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var ASK_READ_WORDS = 30;
var FINISHED_READ = 10;
var MILESTONES_MAX = 5;
var MILESTONES_MIN = 2;
var MILESTONE_SUBJECTS = 6;
var GOAL_LEFT_MS = 30 * 6e4;
var REMOVED_KEPT = 10;
var IDLE_AFTER_MS = 24 * 60 * 6e4;
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
  missedInLastLook: {},
  look: null,
  lastCallReadAt: null,
  goal: null,
  removedGoals: [],
  goalRemoved: null,
  milestones: [],
  nextMilestoneId: 1,
  serves: {},
  goalRefused: null,
  suggestedGoal: null,
  changedAt: null,
  quietCalls: 0
};
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
function clipWords(text2, limit) {
  const words3 = text2.trim().split(/\s+/).filter(Boolean);
  return words3.length <= limit ? words3.join(" ") : `${words3.slice(0, limit).join(" ")}\u2026`;
}
function words(text2) {
  const matches = text2.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? [];
  return new Set(matches.map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w !== "" && !STOP_WORDS.has(w)));
}
var NUMBER_KINDS = /* @__PURE__ */ new Set(["pr", "prs", "pull", "request", "issue", "issues", "ticket", "gh"]);
function isNumberOnly(name) {
  const all = [...words(name)];
  const isTagged = (w) => /^(#|pr|gh-?)\d+$/.test(w);
  const isBare = (w) => /^\d+$/.test(w);
  const hasKind = all.some((w) => NUMBER_KINDS.has(w));
  const isNumber = (w) => isTagged(w) || hasKind && isBare(w);
  return all.some(isNumber) && all.every((w) => isNumber(w) || NUMBER_KINDS.has(w));
}
var VERSION2 = /^v?\d+(\.\d+)+$/;
function namesOtherVersion(name, other) {
  const versions = (text2) => [...words(text2)].filter((w) => VERSION2.test(w)).map((w) => w.replace(/^v/, "").replace(/(\.0)+$/, ""));
  const mine = versions(name);
  const theirs = new Set(versions(other));
  return mine.length > 0 && theirs.size > 0 && !mine.some((v) => theirs.has(v));
}
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
var SUFFIXES = ["ing", "ed", "es", "s"];
function stem(word) {
  if (/\d/.test(word)) return word;
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 3) ?? "";
  const cut = word.slice(0, word.length - suffix.length);
  const base = cut.length > 3 && cut.endsWith("e") ? cut.slice(0, -1) : cut;
  return base.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}
function stems(text2) {
  return new Set([...words(text2)].map(stem));
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}
function findSubject(subjects, ref) {
  const key = nameKey(clipWords(ref, NAME_KEPT));
  return subjects.find((s) => s.id === ref) ?? subjects.find((s) => isOpen(s) && nameKey(s.name) === key) ?? null;
}
function isUnderWay(s) {
  return s.status === "working" || s.status === "waits-on-other";
}

// ../core/domain/ask-match.ts
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
var QUESTION_WORD = /^\s*(?:what|why|how|which|where|who)\b/i;
function isQuestionBack(answer, options) {
  const text2 = answer.trim();
  return text2.endsWith("?") && (QUESTION_WORD.test(text2) || recommendedOption(options, text2) === null);
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
  return sharesKeyWords(keyWords(a), keyWords(b)) ?? sameAsk(a, b);
}
function sharesKeyWords(x, y) {
  const fewer = Math.min(x.size, y.size);
  const shared = [...x].filter((w) => y.has(w)).length;
  const numbers = (words3) => [...words3].filter((w) => new RegExp("\\p{N}", "u").test(w)).sort().join(" ");
  if (numbers(x) !== "" && numbers(y) !== "" && numbers(x) !== numbers(y)) return false;
  return fewer >= 2 ? shared / fewer >= 0.7 : null;
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
var STATES = /* @__PURE__ */ new Set(["new", "current", "existing", "old", "previous"]);
var QUESTIONS = /* @__PURE__ */ new Set(["how", "when", "where", "why", "who", "whether"]);
var PAST = /* @__PURE__ */ new Set(["was", "were", "did", "had"]);
var FUTURE = /* @__PURE__ */ new Set(["will", "shall"]);
var CONTRASTS = [
  [STATES, STATES],
  [QUESTIONS, QUESTIONS],
  [PAST, FUTURE]
];
function contrasts(x, y) {
  const onlyX = [...x].filter((w) => !y.has(w));
  const onlyY = [...y].filter((w) => !x.has(w));
  const holds = (own, group) => own.some((w) => group.has(w));
  return CONTRASTS.some(
    ([one, other]) => holds(onlyX, one) && holds(onlyY, other) || holds(onlyX, other) && holds(onlyY, one)
  );
}
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));
function meaningOf(word) {
  const s = stem(word);
  return MEANING.get(s) ?? s;
}
function repeatsSubject(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const stemsOf = (words3) => new Set([...words3].map(meaningOf));
  const [xStems, yStems] = [stemsOf(x), stemsOf(y)];
  const within = (inner, outer) => [...inner].every((w) => GENERIC.has(w) || outer.has(meaningOf(w)));
  const isRestated = sharesKeyWords(xStems, yStems) === true;
  return sameAsk(a, b) || isRestated && !contrasts(x, y) && (within(x, yStems) || within(y, xStems));
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
function repeatsClosed(closed, a, since, closedFindings = []) {
  const recent = closed.filter((c) => c.at >= since && !isAskedForChoices(c));
  const settled = closed.filter((c) => c.at < since && c.how !== "expired");
  return matchOpen(recent, a) >= 0 || a.label !== null && recent.some((c) => c.label === a.label) || settled.some((c) => repeatsSettled(c, a)) || dismissedFindingOf(closedFindings, a.ask) !== void 0;
}
function dismissedFindingOf(closedFindings, ask) {
  return closedFindings.findLast((f) => f.how === "dismissed" && raisesOnly(f.title, ask));
}
function raisesOnly(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const xStems = new Set([...x].map(meaningOf));
  const isRestated = sharesKeyWords(xStems, new Set([...y].map(meaningOf))) === true;
  return sameAsk(a, b) || isRestated && !contrasts(x, y) && [...y].every((w) => GENERIC.has(w) || xStems.has(meaningOf(w)));
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

// ../core/domain/ledger-close.ts
var MAX_CLOSED = 12;
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now, askedAs) {
  return { ...finding, ...askedAs ? { askedAs } : {}, ...closing, closedAt: now };
}
function closeItem(ledger, id, closing, now) {
  const records = ledger.items.filter((i) => i.id === id).map((i) => closedRecord(i, closing, now));
  return reopenAskedFindings(
    { ...ledger, items: ledger.items.filter((i) => i.id !== id), closed: [...ledger.closed, ...records] },
    records
  );
}
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
        return f.id === record2.id ? { ...rest, reopenedAt: c.at } : f;
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
  const pruned2 = (records) => records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id) || r.how === "dismissed");
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

// ../core/domain/open-targets.ts
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}

// ../core/domain/option-previews.ts
var OPEN_PREVIEWS_LABEL = "Open previews";

// ../core/domain/pr-checks.ts
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
  const run2 = c.bucket === "cancelled" ? runOf(c) : null;
  return run2 ? pr.checks.find((f) => f.bucket === "fail" && isSameRun(run2, runOf(f))) ?? null : null;
}
function blockingChecks(pr) {
  return [...failingChecks(pr), ...cancelledChecks(pr).filter((c) => !failedSibling(pr, c))];
}

// ../core/domain/text.ts
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
var TERMINAL_CONTROL = new RegExp(
  [
    String.raw`(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[^\x07\x1b\x90\x98\x9c-\x9f]*(?:\x07|\x1b\\|\x9c)`,
    String.raw`(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]`,
    String.raw`\x1b[\x20-\x2f]*[\x30-\x7e]`,
    String.raw`[\x00-\x08\x0b-\x1f\x7f-\x9f]`
  ].join("|"),
  "g"
);
var HAS_CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;
function drawableText(text2) {
  return HAS_CONTROL.test(text2) ? text2.replace(TERMINAL_CONTROL, "") : text2;
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function withDrawableText(value, isKept) {
  if (typeof value === "string") return drawableText(value);
  if (Array.isArray(value)) {
    const drawn2 = value.map((v) => withDrawableText(v, isKept));
    return drawn2.some((v, i) => v !== value[i]) ? drawn2 : value;
  }
  if (!isPlainObject(value)) return value;
  let drawn = null;
  for (const [key, v] of Object.entries(value)) {
    if (isKept(key)) continue;
    const d = withDrawableText(v, isKept);
    if (d !== v) (drawn ??= { ...value })[key] = d;
  }
  return drawn ?? value;
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
var segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
var LEADING_JAMO = String.raw`[\u1100-\u115F\uA960-\uA97C]`;
var VOWEL_JAMO = String.raw`[\u1160-\u11A7\uD7B0-\uD7C6]`;
var TRAILING_JAMO = String.raw`[\u11A8-\u11FF\uD7CB-\uD7FB]`;
var SYLLABLE = String.raw`[\uAC00-\uD7A3]`;
var OPEN_SYLLABLE = `[${Array.from({ length: 19 * 21 }, (_, i) => String.fromCharCode(44032 + i * 28)).join("")}]`;
var HANGUL = `(?:${LEADING_JAMO}*(?:${VOWEL_JAMO}+|${OPEN_SYLLABLE}${VOWEL_JAMO}*|${SYLLABLE})${TRAILING_JAMO}*|${LEADING_JAMO}+|${TRAILING_JAMO}+)`;
var FLAG = String.raw`[\u{1F1E6}-\u{1F1FF}]{2}`;
var EXTEND = String.raw`\p{M}\p{Emoji_Modifier}\u{E0020}-\u{E007F}‌ﾞﾟำຳ`;
var GRAPHEME = new RegExp(
  String.raw`[${EXTEND}\u200D]+|(?:${FLAG}|${HANGUL}|[^${EXTEND}\u200D])(?:[${EXTEND}]|\u200D[^${EXTEND}\u200D]?)*`,
  "gu"
);
var EMOJI = new RegExp("\\p{Emoji_Presentation}|\\uFE0F", "u");
function duration(ms) {
  const min = Math.max(1, Math.round(ms / 6e4));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function ago(ms) {
  return Math.round(ms / 6e4) < 1 ? "just now" : `${duration(ms)} ago`;
}
function clockTime(ms) {
  return new Date(ms).toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
}

// ../core/domain/prs.ts
var PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
var PR_MENTION = /(?<![\w./-])(?:([\w.-]+\/[\w.-]+))?#([1-9]\d*)\b/g;
var PR_WORD_BEFORE = /\b(?:prs?|pull requests?|merg(?:e|es|ed|ing)|review(?:s|ed|ing)?|approv(?:e|es|ed|ing)|land(?:s|ed|ing)?)\s*$/i;
var LIST_JOIN = /^\s*(?:,\s*)?(?:and|or|then|&)?\s*$/i;
function namedPrs(text2, known, repo) {
  const links = [...text2.matchAll(PR_URL)].map((m) => ({
    at: m.index,
    end: m.index + m[0].length,
    ref: `${m[1]}#${m[2]}`,
    isBare: false,
    number: m[2] ?? ""
  }));
  const linked = new Set(links.map((l) => l.number));
  const tracked = (n) => {
    const [first, ...others] = known.filter((ref) => parseRef(ref).number === n);
    return first && others.length === 0 ? first : null;
  };
  const mentions = [...text2.matchAll(PR_MENTION)].map((m) => ({
    at: m.index,
    end: m.index + m[0].length,
    ref: m[1] ? `${m[1]}#${m[2]}` : null,
    isBare: !m[1],
    number: m[2] ?? ""
  }));
  let lastEnd = -1;
  const named = [];
  for (const m of [...links, ...mentions].toSorted((a, b) => a.at - b.at)) {
    const isListed = lastEnd >= 0 && LIST_JOIN.test(text2.slice(lastEnd, m.at));
    const isPrWord = PR_WORD_BEFORE.test(text2.slice(0, m.at)) || isListed;
    const ref = !m.isBare ? m.ref : linked.has(m.number) ? null : tracked(m.number) ?? (isPrWord && repo && !hasTwinIn(known, m.number) ? `${repo}#${m.number}` : null);
    if (ref) named.push(ref);
    if (ref || linked.has(m.number)) lastEnd = m.end;
  }
  return [...new Map(named.map((ref) => [ref.toLowerCase(), ref])).values()];
}
function hasTwinIn(known, n) {
  return known.filter((ref) => parseRef(ref).number === n).length > 1;
}
function parseRef(ref) {
  const [repo = "", number = ""] = ref.split("#");
  const [owner = "", name = ""] = repo.split("/");
  return { repo, owner, name, number };
}
function checkKey(c) {
  return drawableText(c.workflow ? `${c.workflow} / ${c.name}` : c.name);
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
  for (const c of pr.checks) counts[c.bucket] += 1;
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
  if (pr.state === "MERGED") return result("merged", "Merged");
  if (pr.state !== "OPEN") return result("closed", "Closed");
  const { pass: passing, fail: failing, pending } = checkCounts(pr);
  const cancelled = blockingChecks(pr).length - failing;
  const waiting = waitingThreads(pr);
  const open2 = threadsOnYou(pr, isSent).length;
  const sent = waiting.filter((t) => isSent(pr, t)).length;
  const changed = waiting.filter((t) => t.isLinesChanged && !isSent(pr, t)).length;
  const isPresent = (b) => b !== null;
  const row = (r) => r === null ? r : (listed.push(r), r);
  const checksAndConflicts = [
    pr.mergeable === "CONFLICTING" ? `conflicts with ${pr.base}` : null,
    row(failing > 0 ? plural(failing, "failing check", "failing checks") : null),
    row(cancelled > 0 ? plural(cancelled, "cancelled check", "cancelled checks") : null)
  ];
  const threadsOnPerson = row(open2 > 0 ? threadsWaiting(open2) : null);
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
  if (onYou.length > 0) return result("blocked", "Blocked", onYou);
  if (isChangesRequested) return result("waiting", "Waiting on the reviewer", ["changes requested", ...onOthers]);
  if (onOthers.length > 0) return result("waiting", "Waiting", onOthers);
  const isApproved = pr.reviewDecision === "APPROVED";
  return result(
    "ready",
    "Ready to merge",
    [...isApproved ? ["approved"] : [], passing > 0 ? "checks pass" : "no checks ran", "no threads waiting on you"],
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

// ../core/domain/help-steps.ts
var COMMAND_LABEL_CHARS = 64;
var commandLabel = (command) => clipLabel(command, COMMAND_LABEL_CHARS);
function helpLabel(help) {
  return help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? commandLabel(help.command)}` : help.kind === "terminal" ? `Copy ${help.name ?? commandLabel(help.command)}` : `Open ${help.name ?? new URL(help.url).host}`;
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open2 = helps.find((h) => h.kind === "open");
  if (!copy || !open2 || copy.kind !== "copy" || open2.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map(
    (h) => h === open2 ? { label: `Copy ${copy.name ?? "snippet"} and open ${baseName(open2.path)}`, step: [copy, open2] } : { label: helpLabel(h), step: [h] }
  );
}
function prLinkName(ref, isTracked2, repo) {
  const { repo: refRepo, name, number } = parseRef(ref);
  const isSessionRepo = refRepo.toLowerCase() === repo?.toLowerCase();
  return isTracked2 ? `PR #${number}` : isSessionRepo ? `#${number}` : `${name}#${number}`;
}
var GITHUB_PR_OR_ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)/;
function linkRef(url) {
  const m = url.match(GITHUB_PR_OR_ISSUE_URL);
  return m ? `${m[1]}#${m[2]}` : null;
}
var GITHUB_PR_OR_ISSUE_PAGE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/\d+\/?(?:\?[^#]*)?$/;
var isSameRef = (a, b) => a.toLowerCase() === b.toLowerCase();
var LEADING_OPEN = /^open(?:\s+|$)/i;
function withLinkName(help, { tracked, repo }) {
  if (help.kind !== "link") return help;
  const ref = linkRef(help.url);
  if (ref && (GITHUB_PR_OR_ISSUE_PAGE.test(help.url) || !help.name)) {
    const isTracked2 = tracked.some((pr) => isSameRef(pr.ref, ref));
    return { ...help, name: prLinkName(ref, isTracked2, repo) };
  }
  const name = help.name?.replace(LEADING_OPEN, "") || null;
  return name === help.name ? help : { ...help, name };
}
function prSteps(item, { tracked, repo }) {
  const urls = new Map(tracked.map((pr) => [pr.ref, pr.url]));
  const isLinked = (ref, url) => item.helps.some((h) => {
    const linked = h.kind === "link" ? linkRef(h.url) : null;
    return h.kind === "link" && (h.url === url || linked !== null && isSameRef(linked, ref));
  });
  const named = namedPrs([item.ask, item.context ?? ""].join("\n"), [...urls.keys()], repo).flatMap((ref) => {
    const { repo: refRepo, number } = parseRef(ref);
    const url = urls.get(ref) ?? `https://github.com/${refRepo}/pull/${number}`;
    return isLinked(ref, url) ? [] : [{ ref, url }];
  });
  const links = named.map(({ ref, url }) => ({
    kind: "link",
    url,
    name: prLinkName(ref, urls.has(ref), repo)
  }));
  const [only] = links;
  if (!only) return [];
  const isAllTracked = named.every(({ ref }) => urls.has(ref));
  const label = links.length === 1 ? helpLabel(only) : isAllTracked ? `Open ${links.length} PRs` : clipLabel(`Open ${links.map((l) => l.name).join(", ")}`, COMMAND_LABEL_CHARS);
  return [{ label, step: links }];
}
function stepsOf(item, prs) {
  return [...steps(item.helps.map((h) => withLinkName(h, prs))), ...prSteps(item, prs)];
}
function stepIconKind(step) {
  if (!step) return void 0;
  if (step.step.some((h) => h.kind === "run")) return "run";
  const first = step.step[0]?.kind;
  return first === "copy" || first === "terminal" ? "copy" : first === "open" || first === "link" ? "open" : void 0;
}

// ../core/domain/press-labels.ts
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text2) {
  return text2.charAt(0).toUpperCase() + text2.slice(1);
}
var ISSUE_LABEL = "File issue";
var SHOW_EXPLANATION_LABEL = "Show explanation";

// ../core/domain/status-freshness.ts
var STALE_AFTER_CALLS = 5;
var STATUS_FAILED = "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It will read the whole conversation to fix this after the next reply. If that fails, it waits longer before each new try.";
function pageWords(o) {
  if (o === null) return "";
  const subjects = o.subjects.map((s) => [s.id, s.status, s.name, s.text]);
  const milestones = o.milestones.map((m) => [m.id, m.status, m.text]);
  return JSON.stringify([o.head, subjects, o.goal?.text, o.goal?.metAt, milestones, o.suggestedGoal]);
}
function isActiveReply(read) {
  return read.kind === "reply" && read.exchange.activity.length > 0;
}
function withChangeNoted(before, after, isActive, now) {
  if (after === null) return null;
  if (pageWords(before) !== pageWords(after)) return { ...after, changedAt: now, quietCalls: 0 };
  return isActive ? { ...after, quietCalls: after.quietCalls + 1 } : after;
}
function isStatusQuiet(o) {
  return o.changedAt !== null && o.quietCalls >= STALE_AFTER_CALLS;
}
function statusSyncText(sync, now) {
  if (sync.is !== "stale") return null;
  return sync.why === "failed" || sync.since === null ? STATUS_FAILED : `Not updated in ${duration(now - sync.since)}`;
}

// ../core/domain/status-goal-gate.ts
function heldSubjects(o) {
  const open2 = new Set(o.milestones.filter(isOpen).map((m) => m.id));
  return o.subjects.filter((s) => open2.has(o.serves[s.id] ?? ""));
}
function lastProgressAt(o, g) {
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const ids = new Set(kept.map((m) => m.id));
  const done = o.subjects.flatMap(
    (s) => s.status === "done" && s.closedAt !== null && ids.has(o.serves[s.id] ?? "") ? [s.closedAt] : []
  );
  return Math.max(g.setAt, ...kept.map((m) => m.changedAt), ...done);
}
function isGoalMet(o) {
  const g = o.goal;
  if (g === null || g.isAwaitingMilestones) return false;
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  return g.metAt != null || kept.length > 0 && kept.every((m) => m.status === "done");
}
function goalLeftFor(o, now) {
  const g = o.goal;
  if (g === null || isGoalMet(o) || g.source !== "inferred" || heldSubjects(o).some(isOpen)) return null;
  const left = now - lastProgressAt(o, g);
  return left >= GOAL_LEFT_MS ? left : null;
}
function hasWorkForGoal(o) {
  const held = new Set(heldSubjects(o).map((s) => s.id));
  return o.subjects.some((s) => isOpen(s) && !held.has(s.id));
}
function goalRevision(o, start, named, placed) {
  const g = o.goal;
  const isFound = g !== null && g.setAt === start.goal?.setAt;
  if (!isFound || g.source !== "inferred" || g.isAwaitingMilestones || isGoalMet(o)) return null;
  const keys = (status) => new Set(named.filter(status).map((m) => nameKey(m.name)));
  const kept = keys(isOpen);
  const carried = new Set(
    o.milestones.filter(isOpen).map((m) => nameKey(m.name)).filter((key) => kept.has(key))
  );
  const finished = keys((m) => m.status === "done");
  const byId = new Map(o.milestones.map((m) => [m.id, m]));
  const isCut = (m) => isOpen(m) && byId.get(m.id)?.status !== "done" && !kept.has(nameKey(m.name)) && !finished.has(nameKey(m.name));
  const isCarried = (s) => carried.has(nameKey(byId.get(o.serves[s.id] ?? "")?.name ?? ""));
  const held = heldSubjects(o).filter(isOpen);
  if (!start.milestones.some(isCut) || !held.some(isCarried)) return null;
  const isPlaced = (s) => {
    const to = placed.get(s.id);
    return to === null || to !== void 0 && carried.has(nameKey(to));
  };
  return held.filter((s) => !isCarried(s) && !isPlaced(s));
}
function refusalOf(o, kind, now) {
  const g = o.goal;
  if (g === null || isGoalMet(o)) return kind === "goal" ? null : "met";
  if (g.source === "typed") return "typed";
  if (heldSubjects(o).some(isOpen)) return "work-open";
  return goalLeftFor(o, now) === null ? "moved" : null;
}
function goalRefusal(o, start, kind, now) {
  const why = refusalOf(o, kind, now);
  const isSameGoal = o.goal?.setAt === start.goal?.setAt;
  if (why === null || start === o || !isSameGoal) return why;
  return refusalOf(start, kind, now) === null ? null : why;
}

// ../core/domain/status-milestone-work.ts
function forgetSeenWas(m, lastLookAt) {
  if (lastLookAt !== null && m.changedAt <= lastLookAt) m.was = null;
}
function withWorkDoneMilestones(o, now) {
  let isChanged = false;
  const milestones = o.milestones.map((m) => {
    if (!isOpen(m)) return m;
    const linked = o.subjects.filter((s) => o.serves[s.id] === m.id);
    const isWorkDone = linked.length > 0 && linked.every((s) => !isOpen(s)) && linked.some((s) => s.status === "done") && linked.some((s) => (s.closedAt ?? -Infinity) >= m.changedAt);
    if (!isWorkDone) return m;
    isChanged = true;
    return { ...m, status: "done", text: "", closedAt: now, changedAt: now, was: null };
  });
  return isChanged ? { ...o, milestones } : o;
}
function withHeldMilestonesOpen(o, now, askIds, earlier) {
  const isHeld = (m) => {
    const ids = /* @__PURE__ */ new Set([m.id, ...o.subjects.filter((s) => o.serves[s.id] === m.id).map((s) => s.id)]);
    return Object.entries(o.askSubjects).some(([ask, to]) => askIds.has(ask) && to.some((id) => ids.has(id)));
  };
  const reopened = (m) => {
    const open2 = earlier.flatMap((e) => e.milestones.filter((x) => x.id === m.id && isOpen(x)))[0];
    if (open2) return { ...open2 };
    const work = o.subjects.filter((s) => isOpen(s) && o.serves[s.id] === m.id);
    const status = work.length === 0 || work.some((s) => s.status === "working") ? "working" : work.some((s) => s.status === "waits-on-other") ? "waits-on-other" : "queued";
    return { ...m, status, text: "", was: null, changedAt: now, closedAt: null };
  };
  if (!o.milestones.some((m) => m.status === "done" && isHeld(m))) return o;
  return { ...o, milestones: o.milestones.map((m) => m.status === "done" && isHeld(m) ? reopened(m) : m) };
}
function withWorkStartedMilestones(o, now) {
  const startedAs = (m) => {
    if (m.status !== "queued") return null;
    const linked = o.subjects.filter((s) => o.serves[s.id] === m.id);
    if (linked.some((s) => s.status === "working")) return "working";
    return linked.some((s) => s.status === "waits-on-other") ? "waits-on-other" : null;
  };
  if (!o.milestones.some((m) => startedAs(m) !== null)) return o;
  return {
    ...o,
    milestones: o.milestones.map((m) => {
      const status = startedAs(m);
      if (status === null) return m;
      const started = { ...m };
      forgetSeenWas(started, o.lastLookAt);
      return { ...started, status, changedAt: now };
    })
  };
}

// ../core/domain/status-goal-ops.ts
var RESTATED_SHARE = 0.8;
function restatesGoal(text2, goal) {
  const own = [...stems(text2)];
  const theirs = stems(goal);
  const shared = own.filter((w) => theirs.has(w)).length;
  const hasNewNumber = own.some((w) => /\d/.test(w) && !theirs.has(w));
  return own.length > 0 && !hasNewNumber && shared >= RESTATED_SHARE * own.length;
}
function hasGoalMilestones(o, written) {
  if (o.goal === null || o.goal.isAwaitingMilestones) return false;
  const keys = (names) => names.map(nameKey).sort().join(NL);
  const kept = o.milestones.filter((m) => m.status !== "dropped").map((m) => m.name);
  return kept.length > 0 && keys(kept) === keys(written.map((m) => m.name));
}
function hasSameWords(a, b) {
  const x = words(a);
  const y = words(b);
  return x.size === y.size && [...x].every((w) => y.has(w));
}
function findMilestone(o, ref) {
  const key = nameKey(clipWords(ref, NAME_KEPT));
  return o.milestones.find((m) => m.id === ref) ?? o.milestones.find((m) => m.status !== "dropped" && nameKey(m.name) === key) ?? null;
}
function linkableMilestone(o, ref) {
  const m = findMilestone(o, ref);
  return m && m.status !== "dropped" ? m : null;
}
function moveMilestone(o, m, op, now) {
  if (op.kind === "set") {
    const isReworded = m.status === op.status && hasSameWords(m.text, op.text);
    if (isReworded) return;
    m.status = op.status;
    m.text = clipWords(op.text, TEXT_KEPT);
    m.closedAt = null;
  } else if (op.kind === "done") {
    if (m.status === "done") return;
    m.status = "done";
    if (op.text) m.text = clipWords(op.text, TEXT_KEPT);
    m.closedAt = now;
  } else if (op.kind === "drop") {
    const target = op.into ? linkableMilestone(o, op.into) : null;
    m.status = "dropped";
    m.text = clipWords(op.why, TEXT_KEPT);
    m.closedAt = now;
    const into = target && target.id !== m.id ? target.id : null;
    for (const [id, to] of Object.entries(o.serves)) {
      if (to !== m.id) continue;
      if (into) o.serves[id] = into;
      else delete o.serves[id];
    }
    for (const [ask, ids] of Object.entries(o.askSubjects)) {
      if (!ids.includes(m.id)) continue;
      const kept = (into ? linksWith(ids, into) : ids).filter((id) => id !== m.id);
      if (kept.length > 0) o.askSubjects[ask] = kept;
      else delete o.askSubjects[ask];
    }
  } else {
    forgetSeenWas(m, o.lastLookAt);
    m.was = op.text;
    m.changedAt = now;
    return;
  }
  forgetSeenWas(m, o.lastLookAt);
  m.changedAt = now;
}
function addMilestone(o, op, now) {
  const known = findMilestone(o, op.name);
  if (known) {
    const text2 = op.text || known.text;
    if (op.status === "done" || op.status === "dropped")
      moveMilestone(
        o,
        known,
        op.status === "done" ? { kind: "done", ref: known.id, text: text2 } : { kind: "drop", ref: known.id, why: text2, into: null },
        now
      );
    else moveMilestone(o, known, { kind: "set", ref: known.id, status: op.status, text: text2 }, now);
    return o;
  }
  const isFull = !o.goal.isAwaitingMilestones && o.milestones.filter((m2) => m2.status !== "dropped").length >= MILESTONES_MAX;
  if (isFull) return o;
  const m = {
    id: `m${o.nextMilestoneId}`,
    name: clipWords(op.name, NAME_KEPT),
    status: op.status,
    text: clipWords(op.text, TEXT_KEPT),
    was: null,
    changedAt: now,
    closedAt: op.status === "done" || op.status === "dropped" ? now : null
  };
  return { ...o, nextMilestoneId: o.nextMilestoneId + 1, milestones: [...o.milestones, m] };
}
function withNextMilestone(o, ref, now) {
  const m = o.goal ? findMilestone(o, ref) : null;
  const first = o.milestones.findIndex((x) => x.status === "queued");
  if (!m || m.status !== "queued" || o.milestones[first] === m) return o;
  const rest = o.milestones.filter((x) => x !== m);
  const moved = { ...m };
  forgetSeenWas(moved, o.lastLookAt);
  moved.madeNextAt = now;
  return { ...o, milestones: [...rest.slice(0, first), moved, ...rest.slice(first)] };
}
function withRestatedGoalAsMilestones(o, ops, readSetAt) {
  const g = o?.goal;
  const isReadJustSet = g != null && g.isAwaitingMilestones && readSetAt === g.setAt;
  if (!isReadJustSet) return ops;
  return ops.flatMap(
    (op) => op.kind === "goal" && restatesGoal(clipWords(op.text, DESCRIPTION_KEPT), g.text) ? op.milestones.map((m) => ({ kind: "milestone", status: m.status, name: m.name, text: m.text })) : [op]
  );
}
function inferredGoal(o, text2, named, now) {
  const earlier = (name) => o.milestones.find((m) => isOpen(m) && nameKey(m.name) === nameKey(name));
  const carried = /* @__PURE__ */ new Map();
  const milestones = named.map((m, n) => {
    const id = `m${o.nextMilestoneId + n}`;
    const was = earlier(m.name);
    const isSame = was !== void 0 && was.status === m.status;
    if (was && isOpen(m)) carried.set(was.id, id);
    return {
      id,
      name: m.name,
      status: m.status,
      text: m.text || (isSame ? was.text : ""),
      was: null,
      changedAt: now,
      closedAt: isOpen(m) ? null : now
    };
  });
  const goal = {
    text: text2,
    setAt: now,
    metAt: null,
    was: o.goal?.text ?? null,
    isAwaitingMilestones: false,
    source: "inferred"
  };
  const serves = o.subjects.flatMap((s) => {
    const to = isOpen(s) ? carried.get(o.serves[s.id] ?? "") : void 0;
    return to ? [[s.id, to]] : [];
  });
  const askSubjects = Object.entries(o.askSubjects).map(([ask, ids]) => [ask, ids.map((id) => carried.get(id) ?? id)]);
  return withoutLinksTo(
    {
      ...o,
      goal,
      goalRemoved: null,
      goalRefused: null,
      milestones,
      nextMilestoneId: o.nextMilestoneId + milestones.length,
      serves: Object.fromEntries(serves),
      askSubjects: Object.fromEntries(askSubjects)
    },
    milestones
  );
}
function goalLineRefusal(o, op, revisedFrom) {
  const text2 = clipWords(op.text, DESCRIPTION_KEPT);
  const milestones = op.milestones.slice(0, MILESTONES_MAX).flatMap((m) => m.status === "dropped" ? [] : [{ name: clipWords(m.name, NAME_KEPT) }]);
  const g = o.goal;
  const isCurrent = g !== null && (restatesGoal(text2, g.text) || hasGoalMilestones(revisedFrom ?? o, milestones));
  const isPrevious = g?.was != null && restatesGoal(text2, g.was);
  const isRemoved = o.removedGoals.some((key) => restatesGoal(text2, key));
  if (op.milestones.length < MILESTONES_MIN) return "few-milestones";
  if (isCurrent || isPrevious || isRemoved) return "restates";
  return revisedFrom !== null || hasWorkForGoal(o) ? null : "no-work";
}
function applyGoalOp(o, op, now, findSubject2, askIds, start = o, servesLines = []) {
  if (op.kind === "goal" || op.kind === "retire") {
    const settled = o.goal?.isAwaitingMilestones ? o : withHeldMilestonesOpen(withWorkDoneMilestones(o, now), now, askIds, [o, start]);
    const milestones = op.kind === "goal" ? op.milestones.slice(0, MILESTONES_MAX).map((m) => ({ name: clipWords(m.name, NAME_KEPT), status: m.status, text: clipWords(m.text, TEXT_KEPT) })) : [];
    const placed = new Map(
      servesLines.flatMap((l) => {
        const s = findSubject2(l.subject);
        return s ? [[s.id, l.milestone]] : [];
      })
    );
    const unplaced = op.kind === "goal" ? goalRevision(settled, start, milestones, placed) : null;
    const why = op.kind === "goal" && goalLineRefusal(settled, op, unplaced === null ? null : start) || (unplaced === null ? goalRefusal(settled, start, op.kind, now) : unplaced.length > 0 ? "work-open" : null);
    const ids = why === "work-open" && unplaced ? unplaced.map((s) => s.id) : [];
    if (why !== null) return { ...o, goalRefused: { line: op.kind, why, ...ids.length > 0 ? { unplaced: ids } : {} } };
    if (op.kind === "retire") return withoutGoal(o);
    return inferredGoal(o, clipWords(op.text, DESCRIPTION_KEPT), milestones, now);
  }
  if (o.goal === null) return o;
  if (op.kind === "milestone") return addMilestone(o, op, now);
  const subject = findSubject2(op.subject);
  const milestone = op.milestone === null ? null : linkableMilestone(o, op.milestone);
  if (!subject || op.milestone !== null && !milestone) return o;
  const isOtherVersion = milestone !== null && namesOtherVersion(subject.name, milestone.name);
  return { ...o, serves: { ...o.serves, [subject.id]: milestone === null || isOtherVersion ? "none" : milestone.id } };
}
function settleGoal(saved, now, readSetAt, named, askIds, before) {
  const g = saved.goal;
  if (g === null) return saved;
  const isAnswerForNewGoal = g.isAwaitingMilestones && readSetAt === g.setAt;
  const worked = g.isAwaitingMilestones ? saved : withWorkStartedMilestones(withWorkDoneMilestones(saved, now), now);
  const isCarrying = g.isAwaitingMilestones && !isAnswerForNewGoal;
  const o = isCarrying ? worked : withHeldMilestonesOpen(worked, now, askIds, [saved, before]);
  const isSeen = o.lastLookAt !== null && g.setAt <= o.lastLookAt;
  const milestones = isAnswerForNewGoal ? o.milestones.filter((m) => named.has(m.id) && m.status !== "dropped").sort((x, y) => named.get(x.id) - named.get(y.id)).slice(0, MILESTONES_MAX) : o.milestones;
  const isAwaiting = g.isAwaitingMilestones && (!isAnswerForNewGoal || milestones.length === 0);
  const kept = milestones.filter((m) => m.status !== "dropped");
  const isMet = !isAwaiting && kept.length > 0 && kept.every((m) => m.status === "done");
  const was = isSeen ? null : g.was;
  const metAt = isMet ? g.metAt ?? now : null;
  const isSame = milestones.length === o.milestones.length && was === g.was && isAwaiting === g.isAwaitingMilestones && metAt === g.metAt;
  if (isSame) return o;
  const settled = { ...o, milestones, goal: { ...g, was, isAwaitingMilestones: isAwaiting, metAt } };
  return isAnswerForNewGoal ? withoutLinksTo(settled, milestones) : settled;
}
var linksWith = (ids, id) => ids.includes(id) ? [...ids] : [...ids, id];
function withoutLinksTo(o, milestones) {
  const ids = new Set(milestones.map((m) => m.id));
  const isKept = (to) => to === "none" || !/^m\d+$/.test(to) || ids.has(to);
  const askLinks = Object.entries(o.askSubjects).map(([ask, to]) => [ask, to.filter(isKept)]);
  return {
    ...o,
    serves: Object.fromEntries(Object.entries(o.serves).filter(([, to]) => isKept(to))),
    askSubjects: Object.fromEntries(askLinks.filter(([, to]) => to.length > 0))
  };
}
function withoutGoal(o) {
  return withoutLinksTo({ ...o, goal: null, goalRefused: null, milestones: [], serves: {} }, []);
}

// ../core/domain/status-suggest.ts
var hasRunningGoal = (o) => o.goal !== null && o.goal.metAt === null;
var isNextGoalAsked = (o) => o === null || !hasRunningGoal(o) && o.suggestedGoal === null;
function nextGoalWork(o, askIds) {
  const goal = o.goal ? `${o.goal.text} ${o.goal.metAt === null ? "running" : "met"}` : "none";
  const open2 = o.subjects.filter(isOpen).map((s) => `${s.id} ${s.status}`);
  return [goal, open2.sort().join(", "), [...askIds].sort().join(", ")].join(" | ");
}
var isNextGoalDeclined = (o, askIds) => o.noGoalFor === nextGoalWork(o, askIds);
function withNoGoalNoted(o, answer, askIds) {
  const line = answer.kind === "ops" ? answer.ops.findLast((op) => op.kind === "suggest") : void 0;
  const isDeclined = line?.kind === "suggest" && line.text === null && isNextGoalAsked(o);
  return isDeclined ? { ...o, noGoalFor: nextGoalWork(o, askIds) } : o;
}
var answersNextGoal = (answer) => answer.kind === "ops" && answer.ops.some((op) => op.kind === "goal" || op.kind === "suggest");
function restatesKnownGoal(o, text2) {
  const known = [o.goal?.text, o.goal?.was, ...o.removedGoals].filter((t) => typeof t === "string");
  return known.some((goal) => restatesGoal(text2, goal));
}
function withSuggestion(o, ops) {
  const line = ops.flatMap((op) => op.kind === "suggest" ? [op] : []).at(-1);
  const text2 = line ? line.text && clipWords(line.text, DESCRIPTION_KEPT) : o.suggestedGoal;
  const isKept = text2 !== null && text2 !== "" && !hasRunningGoal(o) && !restatesKnownGoal(o, text2);
  const suggestedGoal = isKept ? text2 : null;
  return suggestedGoal === o.suggestedGoal ? o : { ...o, suggestedGoal };
}

// ../core/view/banners.ts
var NEXT_BUILD_MARK = ".next-build";
var MAYBE_STALE_TEXT = "May be out of date";

// ../core/view/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\u{1F9ED}" },
  { id: "needsYou", label: "Asks", symbol: "\u{1F64B}" },
  { id: "findings", label: "Finds", symbol: "\u{1F50D}" },
  { id: "prs", label: "PRs", symbol: "\u{1F500}" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var SHOWN_TABS = numbered(TAB_NAMES);
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

// ../core/view/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "\u25B2", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "\u2726", tone: "opportunity" }
};
var NEEDS_YOU_MARKS = {
  question: { mark: "?", tone: "needsYou" },
  task: { mark: "\u2611", tone: "tasks" }
};
var SUBJECT_MARKS = {
  working: { mark: "\u25CF", tone: "working" },
  queued: { mark: "\u25CB", tone: null },
  "waits-on-other": { mark: "\u25CC", tone: null },
  done: { mark: "\u2713", tone: null },
  dropped: { mark: "\u2717", tone: null }
};
var HELD_MARK = { mark: "\u25C6", tone: "needsYou" };
var TASK_MARK = { mark: "\u25A1", tone: "tasks" };
var heldMarkOf = (kinds) => kinds.some((k) => k === "question") ? HELD_MARK : TASK_MARK;
var RUNNING_FRAMES = ["\u25CF", "\u25C9", "\u25CE", "\u25C9"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var IDLE_MARK = { mark: "\u25D0", tone: "working" };
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "\u2715",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" },
  cancelled: { text: "\u2298", tone: null }
};
var stoppedWords = (what) => `Stopped before it finished: ${what}`;
var MARK_LEGEND = [
  {
    mark: RUNNING_MARK,
    tone: "working",
    isRunning: true,
    words: "Working. It moves while the work runs or your message is on its way."
  },
  { mark: IDLE_MARK.mark, tone: IDLE_MARK.tone, isRunning: false, words: "Working, with nothing running right now" },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: "Queued: not started yet" },
  {
    mark: SUBJECT_MARKS["waits-on-other"].mark,
    tone: null,
    isRunning: false,
    words: "Waits on something other than you, such as a build or a review"
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on your answer or approval" },
  { mark: TASK_MARK.mark, tone: TASK_MARK.tone, isRunning: false, words: "Waits on a step only you can do" },
  {
    mark: NEEDS_YOU_MARKS.question.mark,
    tone: NEEDS_YOU_MARKS.question.tone,
    isRunning: false,
    words: "A question the agent asked you"
  },
  {
    mark: NEEDS_YOU_MARKS.task.mark,
    tone: NEEDS_YOU_MARKS.task.tone,
    isRunning: false,
    words: "A step only you can do"
  },
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

// ../core/view/status-page-parts.ts
var LISTED_NAMES = 2;
var namedFoldMore = (n) => `+${n} more`;
function namedList(names) {
  const hidden = names.length - LISTED_NAMES;
  return [...names.slice(0, LISTED_NAMES), ...hidden > 0 ? [namedFoldMore(hidden)] : []].join(", ");
}
var NAMED_FOLD_TEXT = { done: "Done: ", dropped: "Dropped: " };
var namedFolds = (prefix, named, depth) => ["done", "dropped"].flatMap((status) => {
  const closed = named.filter((x) => x.status === status);
  return closed.length === 0 ? [] : [
    {
      kind: "fold",
      id: `${prefix}also-${status}`,
      depth,
      ...SUBJECT_MARKS[status],
      text: `${NAMED_FOLD_TEXT[status]}${namedList(closed.map((x) => x.name))}`,
      subjectIds: closed.map((x) => x.id)
    }
  ];
});
var CHILD_ROWS = 3;
var CHILD_MARK = SUBJECT_MARKS.working;
var COUNT_WORDS = {
  working: "working",
  "waits-on-other": "waiting"
};
var COUNTED_STATUSES = ["working", "waits-on-other"];
var isCounted = (x) => COUNTED_STATUSES.some((status) => status === x.status);
function countsByMark(folded) {
  return COUNTED_STATUSES.flatMap((status) => {
    const n = folded.filter((x) => x.status === status).length;
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }];
  });
}
var STALL_GAP = " \xB7 ";
var DAY_MS = 24 * 60 * 6e4;
function subjectStall(x, isHeld, isWorkRunning, now) {
  if (isHeld) return null;
  const idleMs = now - x.changedAt;
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS;
  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: "muted" } : null;
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
var comparableName = (name) => name.toLowerCase().replace(/[\s\-_]+/g, "").replace(/[.!?:;,…]+$/, "");
var textBeyondName = (name, text2) => text2 && comparableName(text2) !== comparableName(name) ? text2 : null;
function isNamedLikeSubject(x, under) {
  return under.length === 1 && comparableName(under[0].name) === comparableName(x.name);
}
function carriedByChild(c, isHeld) {
  if (c.delegateState === "blocked") return { ...HELD_MARK, isRunning: false };
  if (c.delegateState === "finished" && !isHeld) return { ...SUBJECT_MARKS.done, isRunning: false };
  if (isChildWorking(c) && !isHeld) return { ...SUBJECT_MARKS.working, isRunning: true };
  return null;
}
function finishedLine(c, now) {
  if (c.summary) return c.summary;
  if (c.endedAt === null) return null;
  const finished = ago(now - c.endedAt);
  return `Ran ${duration(c.endedAt - c.startedAt)}, finished ${finished}`;
}
function childRow(c, branch, depth, text2 = null) {
  const marks = c.delegateState === "finished" ? SUBJECT_MARKS.done : c.delegateState === "blocked" ? HELD_MARK : CHILD_MARK;
  return {
    kind: "child",
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    text: text2,
    branch
  };
}
function unplacedChildren(children, c) {
  const unshown = c.running.filter((x) => x.subjectId === null || !c.shownIds.has(x.subjectId)).map((child) => {
    const subject = c.subjects.find((y) => y.id === child.subjectId);
    return { child, milestoneId: subject === void 0 ? null : c.milestoneOf(subject) };
  });
  const isFoldedFinished = (l) => l.child.delegateState === "finished" && l.milestoneId === null;
  const settled = [
    ...children.filter((x) => c.isSettled(x) && !c.subjects.some((y) => y.id === x.subjectId)),
    ...unshown.filter(isFoldedFinished).map((l) => l.child)
  ].sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0));
  return { loose: unshown.filter((l) => !isFoldedFinished(l)), settled };
}
function askWords(items, ask) {
  const words3 = items.find((i) => i.id === ask?.id)?.ask.replace(/\s+/g, " ").trim();
  return words3 || null;
}
var askTone = (ask) => ask?.kind === "task" ? "tasks" : "needsYou";
function partRows(shown, c, depth, afterOpen = [], afterClosed = []) {
  const rows = [];
  const firstClosed = shown.findIndex((x) => !isOpen(x));
  for (const [i, x] of shown.entries()) {
    if (i === firstClosed) rows.push(...afterOpen);
    const under = c.running.filter((ch) => ch.subjectId === x.id);
    const shownUnder = under.slice(0, CHILD_ROWS);
    const isMore = under.length > CHILD_ROWS;
    const isRunning2 = x.status === "working" && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking));
    const isIdle = x.status === "working" && !isRunning2;
    const isWorkRunning = isRunning2 || under.some((ch) => ch.endedAt === null);
    const lone = isOpen(x) && isNamedLikeSubject(x, under) ? under[0] : null;
    const carried = lone ? carriedByChild(lone, c.isHeld(x)) : null;
    const ask = c.oldestAskOf(x);
    const words3 = askWords(c.items, ask);
    const waitsOn = words3 === null ? null : { text: words3, tone: askTone(ask) };
    const ownStall = subjectStall(x, c.isHeld(x), isWorkRunning, c.now);
    rows.push({
      kind: "subject",
      id: x.id,
      depth,
      ...c.isHeld(x) ? heldMarkOf(c.holdKindsOf(x)) : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status],
      isRunning: isRunning2,
      ...carried,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? textBeyondName(x.name, x.text) : null,
      stall: waitsOn === null && !carried ? ownStall : null,
      waitsOn,
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren: under.length > 0 && lone === null,
      foldCount: lone === null ? under.length : 0,
      ask: c.oldestAskOf(x)
    });
    if (lone === null)
      rows.push(
        ...shownUnder.map((ch, n) => childRow(ch, n === shownUnder.length - 1 && !isMore ? "last" : "mid", depth + 1))
      );
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
  if (firstClosed === -1) rows.push(...afterOpen);
  rows.push(...afterClosed);
  return rows;
}

// ../core/view/status-folds.ts
function waitingUnderParents(ledger) {
  const o = ledger.overview;
  if (!o) return /* @__PURE__ */ new Map();
  const blockedOf = (subjectId) => o.children.filter((c) => c.subjectId === subjectId && c.endedAt === null && c.delegateState === "blocked").map((c) => c.id);
  const asksOf = (subjectId) => ledger.items.filter((i) => o.askSubjects[i.id]?.includes(subjectId)).map((i) => i.id);
  const subjects = o.subjects.filter((x) => x.into === null);
  const delegating = subjects.filter((x) => o.children.some((c) => c.subjectId === x.id));
  const milestones = o.goal ? o.milestones.filter((m) => subjects.some((x) => o.serves[x.id] === m.id)) : [];
  return new Map([
    ...delegating.map((x) => [x.id, blockedOf(x.id)]),
    ...milestones.map((m) => {
      const serving = subjects.filter((x) => o.serves[x.id] === m.id);
      return [m.id, [...new Set(serving.flatMap((x) => [...asksOf(x.id), ...blockedOf(x.id)]))]];
    })
  ]);
}
var COUNTS_GAP = STALL_GAP.replace(" ", "\xA0");
var listRows = (milestones, rows) => [
  ...milestones.flatMap((m) => [...m.subject ? [m.subject] : [], ...m.foldId === null ? m.rows : []]),
  ...rows
];
function statusListRows(page) {
  return listRows(page.goal?.milestones ?? [], page.rows);
}

// ../core/view/status-path.ts
function milestonePath(shown) {
  const done = shown.filter((m) => m.status === "done").sort((x, y) => (x.closedAt ?? x.changedAt) - (y.closedAt ?? y.changedAt));
  const underWay = shown.filter((m) => m.status === "working" || m.status === "waits-on-other");
  const [next, ...later] = shown.filter((m) => m.status === "queued");
  const dropped = shown.filter((m) => m.status === "dropped");
  const onPath = [...done, ...underWay, ...next ? [next] : []];
  const lineBelow = (n) => n >= onPath.length - 1 ? null : onPath[n + 1] === next ? "to-next" : "continues";
  const pathSteps = onPath.map((m, n) => ({
    milestone: m,
    place: m === next ? "next" : m.status === "done" ? "done" : "now",
    line: lineBelow(n),
    startsLater: false
  }));
  const afterPath = [...later, ...dropped].map((m, n) => ({
    milestone: m,
    place: m.status === "dropped" ? "dropped" : "later",
    line: null,
    startsLater: n === 0 && later.length > 0
  }));
  return [...pathSteps, ...afterPath];
}
function namesOnlyMilestoneUnderWay(nowText, milestones) {
  const said = stems(nowText);
  return said.size > 0 && milestones.filter((m) => m.status === "working").some((m) => {
    const row = stems(`${m.name} ${m.text}`);
    return [...said].every((w) => row.has(w));
  });
}

// ../core/view/status-goal-page.ts
var GOAL_HEADING = "Goal";
var MILESTONES_FOLD_PREFIX = "goal-milestones";
var MET_LABEL = "Goal met";
function metMilestonesFold(g, milestones, isWorkClosed) {
  const isFolded = g.metAt !== null && milestones.length > 0 && milestones.every((m) => m.place === "done" && isWorkClosed(m));
  return isFolded ? { id: `${MILESTONES_FOLD_PREFIX}-${g.setAt}-${g.metAt}`, text: namedList(milestones.map((m) => m.name)) } : null;
}
function oldestAsk(items, links, id) {
  const oldest = items.filter((i) => links[i.id]?.includes(id)).sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return oldest ? { id: oldest.id, kind: oldest.kind } : null;
}
function workCountText(m, o) {
  const work = o.subjects.filter((s) => s.status !== "dropped" && o.serves[s.id] === m.id);
  const done = work.filter((s) => s.status === "done").length;
  const isUnsaid = isOpen(m) && m.text.trim() === "" && done < work.length;
  return isUnsaid ? `${done} of ${work.length} done` : null;
}
function milestoneRow(step, o, items) {
  const m = step.milestone;
  const isOpen2 = isOpen(m);
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => to === m.id ? [id] : []));
  const holds = items.filter((i) => {
    const to = o.askSubjects[i.id] ?? [];
    return to.some((id) => id === m.id || servingIds.has(id));
  });
  const isHeld = isOpen2 && holds.length > 0;
  const lastChangeAt = Math.max(m.changedAt, m.madeNextAt ?? -Infinity);
  const isChanged = o.lastLookAt !== null && lastChangeAt > o.lastLookAt && lastChangeAt > (o.goal?.setAt ?? 0);
  const direct = oldestAsk(items, o.askSubjects, m.id);
  const viaSubject = holds.sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return {
    id: m.id,
    ...isHeld ? heldMarkOf(holds.map((i) => i.kind)) : SUBJECT_MARKS[m.status],
    name: m.name,
    place: step.place,
    line: step.line,
    startsLater: step.startsLater,
    isBold: isOpen2,
    isMuted: step.place === "later" || step.place === "dropped" || step.place === "done",
    foldId: null,
    foldCount: 0,
    text: textBeyondName(m.name, m.text) ?? workCountText(m, o),
    was: isChanged ? m.was : null,
    ask: !isHeld ? null : direct ?? (viaSubject ? { id: viaSubject.id, kind: viaSubject.kind } : null),
    rows: [],
    subject: null
  };
}
function goalPage(o, items) {
  const g = o?.goal ?? null;
  const suggestedGoal = o === null || hasRunningGoal(o) ? null : o.suggestedGoal;
  if (o === null || g === null) return { goal: null, canRestoreGoal: o?.goalRemoved != null, suggestedGoal };
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt);
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const shown = o.milestones.filter(
    (m) => m.status !== "dropped" || o.lastLookAt !== null && m.changedAt > o.lastLookAt
  );
  const isMet = g.metAt !== null;
  const head = o.head;
  const nowText = head ? head.description || head.title : null;
  const isNowSaid = nowText !== null && namesOnlyMilestoneUnderWay(nowText, g.isAwaitingMilestones ? [] : kept);
  const milestones = g.isAwaitingMilestones ? [] : milestonePath(shown).map((step) => milestoneRow(step, o, items));
  return {
    goal: {
      label: isMet ? MET_LABEL : GOAL_HEADING,
      mark: isMet ? { mark: SUBJECT_MARKS.done.mark, tone: "success" } : null,
      text: g.text,
      isMet,
      was: isWasShown ? g.was : null,
      // A met goal's head draws in its own section, since the work no longer serves the goal.
      now: nowText !== null && !isNowSaid && !isMet ? `Now: ${nowText}` : null,
      milestonesFold: null,
      milestones
    },
    canRestoreGoal: false,
    suggestedGoal
  };
}

// ../core/view/status-keys.ts
var GOAL_KEYS_ID = "goal";

// ../core/view/pressed.ts
function offersUndo(c) {
  return c.how === "done" || c.how === "dismissed";
}
function isUndoable(c) {
  return offersUndo(c) && !c.isSentToAgent;
}
function retryOf(id, last) {
  if (!/^[if]\d+$/.test(id)) return null;
  const step = /^step-(\d+)$/.exec(last.action);
  if (step) return { action: "step", id, step: Number(step[1]), label: last.text };
  switch (last.action) {
    case "previews":
      return { action: "previews", id };
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

// ../core/runtime/remote-command-state.ts
var EMPTY_LOG = { version: 1, writtenAt: 0, floor: 0, commands: {} };
function withLegacy(log, s) {
  const legacy = s.remoteCommands ?? {};
  const isSessionFloorKept = s.remoteCommands !== void 0 || log.writtenAt === 0;
  const floor = isSessionFloorKept ? Math.max(log.floor, s.remoteCommandFloor ?? 0) : log.floor;
  const further = Object.entries(legacy).filter(([id, c]) => {
    const kept = log.commands[id];
    return !kept || kept.state === "accepted" && c.state !== "accepted";
  });
  if (further.length === 0 && floor === log.floor) return log;
  return { ...log, floor, commands: { ...log.commands, ...Object.fromEntries(further) } };
}
function withoutLegacy(s) {
  if (!s.remoteCommands) return s;
  const { remoteCommands: _moved, ...rest } = s;
  return rest;
}
function remoteCommandState(log, s) {
  let commands = log.commands;
  for (const [row, last] of Object.entries(s.lastActions)) {
    const id = last.commandId;
    const command = id && commands[id];
    if (!id || !command || command.row !== row || command.state === "expired" || command.state === "refused") continue;
    const delivery = last.delivery;
    const deliveryId = delivery && "id" in delivery ? delivery.id ?? command.deliveryId : command.deliveryId;
    const delivered = command.delivered || delivery?.state === "arrived";
    const pendingDelivery = !delivered && (delivery?.state === "held" || delivery?.state === "queued" || delivery?.state === "unconfirmed" || last.action === "done" && !delivery);
    const error = delivery?.state === "failed" ? delivery.reason.slice(0, 256) : command.error;
    const state = delivery?.state === "failed" ? "failed" : command.state;
    if (deliveryId === command.deliveryId && delivered === command.delivered && pendingDelivery === command.pendingDelivery && error === command.error && state === command.state)
      continue;
    commands = { ...commands, [id]: { ...command, deliveryId, delivered, pendingDelivery, error, state } };
  }
  for (const closed of s.ledger.closed) {
    const id = closed.commandId;
    const command = id && commands[id];
    if (!id || !command || command.state === "cancelled" || command.state === "expired" || command.state === "refused")
      continue;
    const deliveryId = closed.doneNotification?.id ?? command.deliveryId;
    const pendingDelivery = !command.delivered && !closed.doneNotification?.error;
    if (deliveryId !== command.deliveryId || pendingDelivery !== command.pendingDelivery)
      commands = { ...commands, [id]: { ...command, deliveryId, pendingDelivery } };
  }
  return commands === log.commands ? log : { ...log, commands };
}
async function commandsOf(store, s) {
  return remoteCommandState(withLegacy(store ? await store.read() : EMPTY_LOG, s), s);
}
function hasCommandRows(s) {
  return Object.values(s.lastActions).some((last) => last.commandId !== void 0) || s.ledger.closed.some((c) => c.commandId !== void 0);
}
function pendingCommandRows(s) {
  const rows = Object.entries(s.lastActions).flatMap(([row, last]) => {
    const delivery = last.delivery;
    const isWaiting = delivery?.state === "held" || (delivery?.state === "queued" || delivery?.state === "unconfirmed") && delivery.id === void 0 || last.action === "done" && !delivery;
    return last.commandId && isWaiting ? [row] : [];
  });
  const closed = s.ledger.closed.flatMap((c) => c.commandId && !c.doneNotification ? [c.id] : []);
  return [...rows, ...closed];
}
function remoteReceipts(log) {
  return Object.fromEntries(
    Object.entries(log.commands).map(([id, c]) => [
      id,
      {
        state: c.state,
        error: c.state === "expired" ? "This request is outside saved history. Delivery cannot be confirmed." : c.state === "refused" ? c.error ?? "The host did not accept this action. Your reply is kept." : c.error ? c.state === "stale" ? "This item changed before the action." : "The host could not confirm this action." : null,
        row: c.row,
        deliveryId: c.deliveryId,
        delivered: c.delivered,
        pendingDelivery: c.pendingDelivery ?? false
      }
    ])
  );
}

// ../core/domain/presses.ts
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}

// ../core/domain/last-actions.ts
function isAwaitingReply(last, turns) {
  const pressed2 = last?.delivery?.state !== "failed" ? last?.turnsStarted : void 0;
  return pressed2 !== void 0 && pressed2 <= turns.turnsStarted && turns.turnsApplied <= pressed2;
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

// ../core/view/timing.ts
var SETTLED_MS = 5120;
var QUEUED_AFTER_MS = 1e3;
var COMPARE_LIMIT_MS = 30 * 6e4;
var PR_READ_WAIT_MS = 6e4;
function queuedSentAt(last) {
  return last.delivery?.state === "queued" ? last.delivery.sentAt ?? last.at : last.at;
}
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - queuedSentAt(last) >= QUEUED_AFTER_MS;
}
function pendingDeliveryAt(last, now) {
  if (last?.delivery?.state === "held") return "held";
  if (last?.delivery?.state === "unconfirmed") return "unconfirmed";
  if (last?.delivery?.state !== "queued") return null;
  return isQueuedAt(last, now) ? "queued" : "sending";
}
var FOLD_QUIET_MS = 1e3;
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
  const isUndoShown = id !== void 0 && (undoShown ?? []).includes(id);
  const isWaiting = now < dueAt || isUndoShown || isSendOnItsWay(state.delivery) || isPressOutSince(pressOutSince, dueAt) || isListInUseSince(listInput, dueAt, now);
  return isShownSince(state.at, shownSince) && isWaiting;
}
function isUndoLeft(at, now, settleWindowMs) {
  return now - at < settleWindowMs;
}
function canUndoClose(closed, at, now, settleWindowMs) {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs);
}
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;

// ../core/view/rows.ts
var OPTIONS_FOLD_AT = 5;
var DOT = "\u2007\xB7\u2002";
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions", mark: NEEDS_YOU_MARKS.question },
  { kind: "task", title: "Tasks", list: "tasks", mark: NEEDS_YOU_MARKS.task }
];
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
var ROW_COPY = {
  retry: "Try again",
  goToSession: "Go to session",
  send: "Send",
  cancel: "Cancel",
  discard: "Discard",
  clickField: "Click the field to type",
  relevantFile: "Relevant file: ",
  allOptions: (count) => `All ${count} options`,
  undo: "Undo",
  reopen: "Reopen"
};
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  return actions.flatMap((a) => {
    if (a.press.action !== "answer") return [];
    const description = descriptions && Object.hasOwn(descriptions, a.press.option) ? descriptions[a.press.option] : null;
    const reason = item?.rec === a.press.option && item.recReason ? item.recReason : null;
    if (description === null && reason === null) return [];
    return [
      {
        option: a.press.option,
        description,
        reason,
        isFolded: a.isFolded
      }
    ];
  });
}
function isWaitingRow(row) {
  return row.state.is === "open";
}
var RUNNING_RESULT = { text: RUNNING_MARK, isRunning: true };
var QUESTION_MARK = { text: HELD_MARK.mark, isRunning: false, tone: HELD_MARK.tone };
var TASK_ROW_MARK = { text: TASK_MARK.mark, isRunning: false, tone: TASK_MARK.tone };
function allRows(v) {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows];
}
function replyLine(words3) {
  return words3.replace(/\s+/g, " ").trim();
}
function deliveryLabel(step, label, reply) {
  if (reply !== void 0) {
    const words3 = replyLine(reply);
    switch (step) {
      case "sending":
        return `Sending reply: ${words3}`;
      case "queued":
        return `Queued reply: ${words3}`;
      case "unconfirmed":
        return `Reply not confirmed: ${words3}`;
      case "arrived":
        return `Replied: ${words3}`;
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
var QUEUED_RESULT = { text: SUBJECT_MARKS.queued.mark, isRunning: false };
function closedMark(state, delivery) {
  if (delivery === "sending") return RUNNING_RESULT;
  if (delivery === "queued") return QUEUED_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(c.outcome);
}

// ../core/view/feedback.ts
function pressUnderWaySince(f) {
  if (f?.is === "sending") return f.sentAt;
  if (f?.is === "working") return f.at;
  if (f?.is !== "local") return null;
  return f.talkOutSince ?? (f.result.state === "pending" ? f.result.at : null);
}
function prTabHoldSince(f) {
  return f?.is === "working" && f.isHandoff === true ? null : pressUnderWaySince(f);
}
function feedbackOf(id, last, note, turns, now, reportedAt) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS)) {
    const under = last.kind === "talk" ? feedbackOf(id, { ...last, result: void 0 }, void 0, turns, now, reportedAt) : null;
    const isTalkOut = under?.is === "working" || under?.is === "sending" || under?.is === "queued";
    const talkOutSince = isTalkOut ? under.is === "sending" ? under.sentAt : under.at : void 0;
    return { is: "local", result, ...talkOutSince === void 0 ? {} : { talkOutSince } };
  }
  if (!last || last.kind === "local") return null;
  const delivery = last.delivery;
  const pending = pendingDeliveryAt(last, now);
  if (pending === "queued" || pending === "unconfirmed")
    return { is: pending, label: deliveryLabel(pending, last.text, last.reply), at: last.at };
  if (delivery?.state === "failed") return { is: "notSent", reason: delivery.reason, retry: retryOf(id, last) };
  const isAwaiting = isAwaitingReply(last, turns);
  const isUnreported = last.action === "compare" && !(reportedAt !== void 0 && reportedAt >= last.at);
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS;
  const working = WORKING_LABELS[last.action];
  const isHandoffWorking = last.kind === "handoff" && isPrRowId(id) && last.repliedAt === void 0;
  const isWorking = last.kind === "talk" || isHandoffWorking;
  if (isWorking && working && (isAwaiting || isUnreported && !isPastLimit))
    return {
      is: "working",
      label: working,
      at: last.at,
      ...last.kind === "handoff" ? { isHandoff: true } : {}
    };
  if (pending === "sending")
    return {
      is: "sending",
      label: deliveryLabel("sending", last.text, last.reply),
      at: last.at,
      sentAt: queuedSentAt(last)
    };
  if (isUnreported) return { is: "noComparison", at: last.at };
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: "stillOpen", at: last.at };
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
  "pr-rank-again": "Ranking\u2026",
  "pr-conflicts": "Resolving conflicts\u2026",
  "pr-address-all": "Addressing\u2026",
  "pr-merge": "Merging\u2026",
  "thread-address": "Addressing\u2026",
  "check-fix": "Fixing\u2026"
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
function doneLabel(last) {
  return DONE_LABELS[last.action]?.(last.text) ?? last.text;
}
var STILL_WAITING_AFTER = /* @__PURE__ */ new Set(["check-fix"]);
function isPressOut(f) {
  return f?.is === "working" || f?.is === "sending" || f?.is === "queued" || f?.is === "unconfirmed" || f?.is === "local" && f.result.state === "pending";
}
function pressOutAction(last, f) {
  if (f?.is === "local" && f.result.state !== "pending" && f.talkOutSince !== void 0) return last?.action ?? null;
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

// ../core/domain/gh.ts
var GH_TIMEOUT_MS = 2e4;
var UNSTARTABLE_CODE = -1;
var TIMED_OUT_CODE = -2;

// ../core/domain/pr-fetch.ts
var MAX_PRS = 12;
var MAX_ORDERED_PRS = 30;
var PR_SHARED_MS = 12e4;
var PRS_REFRESH_MS = 12e4;
var PR_POLL_MS = 15e3;
var CLOSED_PR_REFRESH_MS = 60 * 6e4;
var LIMIT_RETRY_MS = 5 * 6e4;
function tabPrs(links) {
  const order = links.prOrder;
  const ranked = (order?.refs ?? []).filter((ref) => !links.prs.includes(ref) && !order?.dismissed.includes(ref));
  return [...links.prs, ...ranked];
}
function sessionPrs(s) {
  const { branchRef, views } = s.prViews;
  const linked = tabPrs(s.ledger);
  const refs = branchRef ? [...linked, branchRef] : linked;
  return {
    tracked: refs.map((ref) => ({ ref, url: views[ref]?.url ?? null })),
    repo: branchRef ? parseRef(branchRef).repo : s.place?.repo ?? null
  };
}
function isLeftOut(prState, ref) {
  const view = prState.views[ref];
  return view !== void 0 && !isKeptPr(view);
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
  if (older.length === 0) return null;
  const numbers = older.map((ref) => `#${parseRef(ref).number}`).reverse();
  return `${older.length} older ${older.length === 1 ? "PR" : "PRs"} not shown: ${numbers.join(", ")}`;
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
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1e3} seconds`;

// ../core/view/pr-rows.ts
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
var RANK_AGAIN_ID = "pr:order";
var PR_REFRESH_ID = "pr:refresh";
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}

// ../core/view/pr-press.ts
var RERUN_LABEL = "Re-run";
var PR_FIX_LABELS = {
  "pr-conflicts": "Resolve conflicts",
  "check-fix": "Fix"
};
var PR_READ_FIRST_LABELS = {
  ...PR_FIX_LABELS,
  "check-rerun": RERUN_LABEL,
  "pr-address-all": "Address all",
  "pr-merge": "Merge",
  "thread-address": "Address"
};
function isViewBeforeReply(last, fetchedAt) {
  return last?.repliedAt !== void 0 && fetchedAt !== void 0 && fetchedAt <= last.repliedAt;
}
function isAwaitingFreshRead(last, fetchedAt, now) {
  return isViewBeforeReply(last, fetchedAt) && now - last.repliedAt < PR_READ_WAIT_MS;
}
function lastPressOf(presses, rowId, fetchedAt) {
  const last = presses.lastActions[rowId];
  const feedback = pressFeedbackIn(rowId, { is: "open" }, last, presses.turns, presses.now);
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const isChecking = last?.kind === "handoff" && pressing === null && isAwaitingFreshRead(last, fetchedAt, presses.now);
  return isChecking ? { last, pressing: last.action, out: last.action } : { last, pressing, out };
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}

// ../core/view/collapse.ts
var latest = (...times) => Math.max(-Infinity, ...times.filter((t) => typeof t === "number"));
function newsByRow({ ledger, prViews, lastActions }) {
  const pressed2 = (id) => lastActions[id]?.at;
  const prs = Object.values(prViews.views);
  const timed = (at, untimedUrl = null) => ({ at, untimedUrl, waiting: [] });
  return new Map([
    ...ledger.items.map((i) => [i.id, timed(latest(i.reportedAt, pressed2(i.id)))]),
    ...ledger.findings.map((f) => [f.id, timed(latest(f.reopenedAt, pressed2(f.id)))]),
    ...prs.flatMap(
      (pr) => waitingThreads(pr).map((t) => {
        const id = prThreadId(pr, t);
        const untimedUrl = t.reply && t.reply.at === null ? t.reply.url : null;
        return [id, timed(latest(t.reply?.at, pressed2(id)), untimedUrl)];
      })
    ),
    ...prs.flatMap(
      (pr) => blockingChecks(pr).map((c) => {
        const id = prCheckId(pr, c);
        const untimedUrl = c.finishedAt === void 0 ? c.url ?? "" : null;
        return [id, timed(latest(c.finishedAt, pressed2(id)), untimedUrl)];
      })
    ),
    ...[...waitingUnderParents(ledger)].map(
      ([id, waiting]) => [id, { at: -Infinity, untimedUrl: null, waiting }]
    )
  ]);
}
var isUnchanged = (news, c) => news !== void 0 && news.at <= c.at && news.untimedUrl === (c.untimedUrl ?? null) && news.waiting.every((id) => c.waiting?.includes(id));
function collapsedRows(s) {
  const news = newsByRow(s);
  return Object.entries(s.collapsed ?? {}).flatMap(([id, c]) => isUnchanged(news.get(id), c) ? [id] : []);
}
function settledCollapses(s) {
  if (s.collapsed === void 0) return s;
  const news = newsByRow(s);
  let isChanged = false;
  const kept = Object.entries(s.collapsed).flatMap(([id, c]) => {
    const n = news.get(id);
    if (!isUnchanged(n, c)) {
      isChanged = true;
      return [];
    }
    const waiting = c.waiting?.filter((w) => n?.waiting.includes(w)) ?? [];
    if (waiting.length === (c.waiting?.length ?? 0)) return [[id, c]];
    isChanged = true;
    const settled = { at: c.at, ...c.untimedUrl !== void 0 && { untimedUrl: c.untimedUrl } };
    return [[id, waiting.length > 0 ? { ...settled, waiting } : settled]];
  });
  return isChanged ? { ...s, collapsed: Object.fromEntries(kept) } : s;
}

// ../core/runtime/remote-viewers.ts
function remoteHeldRows(leases, s, now) {
  return Object.values(leases).flatMap((viewer) => {
    if (viewer.released || viewer.expiresAt <= now) return [];
    const closed = viewer.tab === "needsYou" ? s.ledger.closed : viewer.tab === "findings" ? s.ledger.closedFindings : [];
    const viewed = closed.filter((row) => isShownSince(closedAt(row), viewer.shownSince)).map((row) => row.id);
    return [...Object.keys(viewer.replies), ...viewed];
  });
}
function remoteViewerReceipts(leases) {
  return Object.fromEntries(
    Object.entries(leases).map(([id, viewer]) => [
      id,
      {
        replies: viewer.replies,
        listInput: viewer.listInput ?? null,
        shownSince: viewer.shownSince,
        tab: viewer.tab,
        generation: viewer.generation,
        sequence: viewer.sequence,
        expiresAt: viewer.expiresAt,
        released: viewer.released
      }
    ])
  );
}

// ../core/domain/ledger-prompt.ts
var NL3 = "\n";
var MODEL_KIND = { question: "decide", task: "do" };
function systemText(host) {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : "";
  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec | design
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items and findings the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again in other words.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: what the agent said this turn, in order
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
  options: the answers the person can pick, separated by " / ", at most 5 words each, in words the person would say, without links, URL parameters, file paths or names from code; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  design: "design" for a "decide" item whose options are designs or approaches the agent could try and show side by side, such as two layouts or two ways to build a feature. Otherwise "-", as for a fact, an approval or a preference.
  Skip: rhetorical questions; offers to go on with the next step of the task the person already asked for ("Want me to start on the next file?"); FYIs; generic "let me know", though the agent holding an act that changes or publishes something (commit, push, mark a PR ready, edit a shared page) until the person agrees, or leaving to them such an act it could take once they agree, is a "decide" item ("Say when you want those committed", "If you agree, I'll update the runbook", "Mark PR #3040 ready for review?"); a wait on the go, answer or review of another agent the reply names, such as its coordinator, even when it then says "your go" (an "hc send" in <activity>, or <person> starting "<hc from=\u2026>", shows who it reports to), though a question, held act or step the same reply leaves to the person is still a "decide" or "do" item; invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; news of a PR's failing checks, conflicts or review threads, and offers to fix them, since ${host.prsIn} shows each with its own press; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
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
function ledgerBlocks(ledger) {
  const open2 = ledger.items.map(
    (i) => `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? "-"} | ${i.ask} | ${i.options.join(" / ") || "-"} | ${i.rec ?? "-"} | ${i.isDesignChoice ? "design" : "-"}`
  ).join(NL3);
  const findings = ledger.findings.map((f) => `${f.id} | ${f.kind}: ${f.title}`).join(NL3);
  const closed = ledger.closed.filter((d) => d.how !== "expired" && !isAskedForChoices(d)).slice(-MAX_CLOSED).map((d) => `${d.ask} \u2192 ${outcomeText(d)}`);
  const dismissedFindings = ledger.closedFindings.filter((f) => f.how === "dismissed").slice(-MAX_CLOSED).map((f) => `${f.kind}: ${f.title} \u2192 ${outcomeText(f)}`);
  const decided = [...closed, ...dismissedFindings].join(NL3);
  return [
    `<open>${NL3}${open2}${NL3}</open>`,
    `<findings>${NL3}${findings}${NL3}</findings>`,
    `<decided>${NL3}${decided}${NL3}</decided>`
  ];
}
function buildPrompt(ledger, ex) {
  const person = personText(ex.person, ex.trigger);
  return [
    ...ledgerBlocks(ledger),
    `<person>${NL3}${clipMiddle(person, 4e3, 1500)}${NL3}</person>`,
    `<activity>${NL3}${clipMiddle(ex.activity.join(NL3), 2500, 500)}${NL3}</activity>`,
    `<reply>${NL3}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL3}</reply>`,
    `<screen>${NL3}${ex.screen}${NL3}</screen>`
  ].join(NL3);
}
function personText(person, trigger) {
  return person ?? `(The person sent nothing. The turn was started by: ${trigger ?? "unknown"}.)`;
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}

// ../core/domain/catch-up-text.ts
var CATCH_UP = "The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>.";
function transcriptCatchUpPrompt(ledger, screen, transcript) {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<conversation>${NL3}${numberBlocks(transcript)}${NL3}</conversation>`,
    `<screen>${NL3}${screen}${NL3}</screen>`
  ].join(NL3);
}
var MAX_ACTIVITY = 40;
function addActivity(activity, line) {
  if (!line || activity[activity.length - 1] === line) return activity;
  const others = activity.filter((seen) => seen !== line);
  return [...others, line].slice(-MAX_ACTIVITY);
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
    const options = (Array.isArray(fields2.options) ? fields2.options : []).flatMap((o, i) => {
      const option = typeof o === "string" ? { label: o } : o ?? {};
      const plain = typeof option.label === "string" ? option.label.trim() : "";
      const isMarked = i === fields2.recommended && !RECOMMENDED_SUFFIX.test(plain);
      const label = isMarked ? `${plain} (Recommended)` : plain;
      const description = typeof option.description === "string" ? option.description.trim() : "";
      return plain === "" ? [] : [{ label, description }];
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

// ../core/domain/dialogs.ts
var OPTION_LABEL = /^\s*\(?(?:[a-z]|\d{1,2})\s*(?:[.):]|[—–-])\s+/i;
function optionKey(option) {
  return option.replace(RECOMMENDED_SUFFIX, "").replace(OPTION_LABEL, "").trim().toLowerCase();
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
    ...descriptions ? { optionDescriptions: { ...descriptions, ...item.optionDescriptions } } : {}
  };
}
function linkDialogs(s, now = Date.now()) {
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
    if (q.answer !== void 0 && !restates(copy.ask, q.question)) return q;
    linked.add(copy.id);
    items = items.map((i) => i.id === copy.id ? asCopyOf(i, q) : i);
    return { ...q, itemId: copy.id };
  });
  const kept = questions.filter((q) => q.turn === s.ledger.turn || s.pending.some((p) => p.ex.turn === q.turn));
  const ledger = questions.reduce(
    (l, q) => q.answer !== void 0 && q.itemId !== null && l.items.some((i) => i.id === q.itemId) ? closeItem(l, q.itemId, { how: "answered", outcome: q.answer }, now) : l,
    { ...s.ledger, items }
  );
  return { ...s, ledger, dialogQuestions: kept };
}

// ../core/view/pr-refresh.ts
var PR_REFRESH_LABEL = "Refresh PRs";
function tabWideProblem(prs) {
  if (prs.isGhMissing) return "gh was not found";
  if (prs.isGhSignedOut) return "gh is not signed in";
  return prs.failure ? fetchFailureWords(prs.failure) : null;
}
function unreadPrs(prs, links) {
  const { tracked } = splitLinked(prs, links);
  const refs = prs.branchRef && !tracked.includes(prs.branchRef) ? [...tracked, prs.branchRef] : tracked;
  return refs.flatMap((ref) => {
    const view = prs.views[ref];
    if (view?.error) return [{ ref, why: view.error, hasBlock: true }];
    const why = view ? null : prs.unread?.[ref];
    return why ? [{ ref, why, hasBlock: false }] : [];
  });
}
function refreshProblem(prs, links) {
  const tabWide = tabWideProblem(prs);
  if (tabWide) return tabWide;
  const unread = unreadPrs(prs, links);
  const [only] = unread;
  if (!only) return null;
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
  const isPressShown = feedback !== null && !isMadeGood && row.last !== void 0 && (row.pressing !== null || isShownSince(row.last.at, shownSince));
  if (problem === null && !isPressShown) return null;
  return {
    text: problem !== null && tabWideProblem(prs) === null ? problem : null,
    actions: problem === null && row.pressing === null ? [] : prRefreshActions(row),
    showsPress: isPressShown
  };
}
function prRefreshActions(row) {
  return withOut(row, [
    { press: { action: "pr-refresh" }, label: PR_REFRESH_LABEL, kind: "local", emphasis: "normal", icon: "retry" }
  ]);
}

// ../core/view/pr-views.ts
var PR_DISMISSED_LABEL = "Dismissed";
var PR_MERGED_LABEL = "Merged";
var PR_CLOSED_LABEL = "Closed";
function isTracked(prState, links, ref) {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref;
}
function keepsView(prState, links, ref) {
  return isTracked(prState, links, ref) || tabPrs(links).includes(ref) && isLeftOut(prState, ref);
}
function dismissal(lastActions, ref) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" ? mark : null;
}
function dismissedAt(lastActions, ref) {
  return dismissal(lastActions, ref)?.at ?? null;
}
var DISMISSED_VIEW_KEPT_MS = 6e4;
function isViewKept(prState, links, lastActions, ref, shownSince, now) {
  const at = dismissedAt(lastActions, ref);
  const isDismissedLately = at !== null && (now - at < DISMISSED_VIEW_KEPT_MS || isShownSince(at, shownSince));
  return keepsView(prState, links, ref) || isDismissedLately;
}
function openPrViews(drawn) {
  return drawn.filter((d) => d.state.is === "open").map((d) => d.pr);
}
function settledPrState(mark, now, settleWindowMs, isUndoOut) {
  const closed = mark.text === PR_MERGED_LABEL ? { how: "update", outcome: PR_MERGED_LABEL } : mark.text === PR_CLOSED_LABEL ? { how: "expired", outcome: PR_CLOSED_LABEL } : { how: "dismissed", outcome: PR_DISMISSED_LABEL };
  const state = closedRowState(closed, mark.at, now, settleWindowMs, null);
  return { ...state, canUndo: isUndoOut || isUndoLeft(mark.at, now, settleWindowMs), offersUndo: true };
}
function drawnPrs(prState, links, lastActions, placing) {
  const { now, settleWindowMs } = placing;
  const ranked = links.prOrder?.refs ?? [];
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr) => {
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: "open" } }];
    const mark = dismissal(lastActions, pr.ref);
    if (mark === null) return [];
    const state = settledPrState(mark, now, settleWindowMs, (placing.undoOut ?? []).includes(prMarkId(pr.ref)));
    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : [];
  });
  return drawn.map((d) => ({ ...d, isRanked: rankOf(d.pr, ranked) !== null }));
}

// ../core/view/pr-order.ts
var RANK_AGAIN_LABEL = "Rank again";
function prOrderText(order, drawn, now) {
  const isRanking = drawn.some((d) => d.isRanked);
  if (!order || !isRanking) return null;
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

// ../core/view/pr-tab.ts
function finishedTabPrs(prState, links) {
  return splitLinked(prState, links).tracked.filter((ref) => {
    const view = prState.views[ref];
    return view !== void 0 && view.state !== "OPEN" && ref !== prState.branchRef;
  });
}
function prClearActions(prState, links) {
  if (finishedTabPrs(prState, links).length === 0) return [];
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

// ../core/domain/ask-subject.ts
var NAMED_THING = /#\d+|\b\d{2,}\b|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\/|[\w~.-]*\/[\w.-]+|\b[\w-]+\.[a-z]{1,5}\b|`[^`]+`|"[^"]+"|“[^”]+”/;
var EMPTY_WORDS = new Set(
  `a about above after again ahead all already also an and any anything are as at back be been before being below both
but by can could did do does doing done each either else every everything first for from get go going had has have
here how i if in into is it its just last later lets let me more my need next no not now of ok okay on once one ones
only or other others our out over own rest same should so some something soon still such sure than that the their
them then there these they this those to today too until up us want was way we were what when where whether which who why
will with would yes yet you your
approve proceed continue start stop wait hold skip leave keep drop cancel finish resume restart retry redo
run merge push pull commit deploy ship publish open close post send file fix build make try test check
review mark ready use take add remove delete update change apply land rebase install copy move create write draft
edit set show see look pick choose decide answer reply tell say ask like prefer handle follow work
pr prs branch thing step plan design option variant version note rule issue item task question proposal idea
code problem stuff part green current new old latest previous mentioned proposed suggested remaining pending`.split(
    /\s+/
  )
);
function stem2(word) {
  return word.replace(/(?:ies|es|s|ed|ing)$/, "");
}
function isEmptyWord(word) {
  if (word.length === 1 || word === "ll" || word === "re" || word === "ve") return true;
  return EMPTY_WORDS.has(word) || EMPTY_WORDS.has(stem2(word)) || EMPTY_WORDS.has(`${stem2(word)}e`);
}
function namesSubject(ask) {
  if (NAMED_THING.test(ask)) return true;
  return (ask.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some((w) => !isEmptyWord(w));
}

// ../core/domain/reply-parse.ts
var NL4 = "\n";
var MAX_HELPS = 3;
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
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
  const lines = text2.split(NL4);
  const newLines = [];
  for (const raw of lines.slice(lastAnswerStart(lines))) {
    const parsed3 = keyOf(raw);
    if (!parsed3) continue;
    seen += 1;
    const key = parsed3.key;
    const value = dash(parsed3.value) ?? "";
    if (key === "NONE") continue;
    if (key === "CLOSED" || key === "FIXED") {
      const [id, outcome] = value.split("|").map((s) => s.trim());
      if (id && /^f\d/.test(id) === (key === "FIXED")) closed.push({ id, outcome: outcome ?? "" });
    } else if (key === "ASKED") {
      const [id, target] = value.split("|").map((s) => s.trim());
      if (id && /^f\d+$/.test(id) && target) asks.push({ id, target });
    } else if (key === "NEW") {
      const fields2 = value.split("|");
      const isLabelWords = /\s/.test((fields2[1] ?? "").trim());
      const isLabelSkipped = isLabelWords && (!dash(fields2[2]) || readsAsChoices(fields2[2] ?? ""));
      const [kind, label, ask, ...rest] = (isLabelSkipped ? [fields2[0], "-", ...fields2.slice(1)] : fields2).map(dash);
      const last = rest.at(-1);
      const isDesignField = rest.length > 2 && (last === null || /^design$/i.test(last ?? ""));
      if (isDesignField) rest.pop();
      const rec = rest.length > 1 ? rest.pop() : null;
      const isAskTheChoices = readKind(kind) === "question" && readsAsChoices(ask ?? "");
      if (!ask || isAskTheChoices) {
        newLines.push(void 0);
        continue;
      }
      const options = readKind(kind) === "question" ? rest.flatMap((o) => o?.split(/\s+\/\s+/) ?? []).filter(Boolean) : [];
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
      const parsed4 = readHelp((kind ?? "").trim(), help, name, blocks, source);
      if (parsed4 && target) helps.push({ target: target.trim(), help: parsed4 });
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
function readsAsChoices(field) {
  const text2 = field.trim();
  const choices = text2.split(/\s+\/\s+/);
  return choices.length > 1 && !text2.endsWith("?") && choices.every((c) => c !== "" && words2(c).length <= 5);
}
function isTakenUp(work, reply) {
  const key = [...keyWords(work)];
  const said = new Set(words2(reply ?? ""));
  return key.length > 0 && key.filter((w) => said.has(w)).length * 2 >= key.length;
}
function todoAsk(work) {
  return `Ready to start on ${work.replace(/[.?!\s]+$/, "")}?`;
}

// ../core/domain/ledger-update.ts
var MAX_OPEN = 20;
var STALE_AFTER = 12;
var UNFOUNDED_MOOT = /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i;
var PUT_OFF2 = /^\s*(?:(?:the )?(?:user|person) )?(?:dismissed|declined|deferred (?:to|until|till|for)|postponed|put (?:it )?off|set aside|not now|later\b|can wait|won'?t fix|skipped)|\b(?:user|person) (?:said|says|asked|wants|chose|decided|declined|dismissed|deferred|put it off)\b/i;
var EXPIRED = "expired, unanswered";
function restatedRec(options, old, stated) {
  return recommendedOption(options, stated) ?? recommendedOption(options, old);
}
function withRec(item, rec, reason) {
  const { recReason, ...rest } = item;
  const kept = reason ?? (rec === item.rec ? recReason : void 0);
  return { ...rest, rec, ...rec && kept ? { recReason: kept } : {} };
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
function withoutNewAsks(u) {
  return { ...u, added: [], todos: [] };
}
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");
function isPersonsAnswer(outcome) {
  return outcome.trim() !== "" && !NOT_AN_ANSWER.test(outcome);
}
function applyUpdate(ledger, u, now, turn, promptAt = now) {
  const stillAsked = new Set(u.updated.filter((c) => c.options || c.rec).map((c) => c.id));
  const isPutOffFinding = (c) => ledger.findings.some((f) => f.id === c.id) && PUT_OFF2.test(c.outcome);
  const closing = new Map(
    u.closed.filter((c) => !stillAsked.has(c.id) && !UNFOUNDED_MOOT.test(c.outcome) && !isPutOffFinding(c)).map((c) => [c.id, c.outcome])
  );
  const closed = [...ledger.closed];
  const items = [];
  for (const item of ledger.items) {
    const outcome = closing.get(item.id);
    const helps = u.helped.filter((h) => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps);
    const isQuestionBackOutcome = outcome !== void 0 && item.kind === "question" && isQuestionBack(outcome, item.options);
    const isClosing = outcome !== void 0 && !isQuestionBackOutcome && (item.from !== "record" || isPersonsAnswer(outcome));
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
    if (repeatsClosed(ledger.closed, a, promptAt, ledger.closedFindings)) {
      addedIds.push(null);
      continue;
    }
    const at = matchOpen(items, a, created);
    const restated = items[at];
    if (restated) {
      items[at] = {
        ...withRec(restated, restatedRec(restated.options, restated.rec, a.rec)),
        helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps),
        ...a.isDesignChoice ? { isDesignChoice: true } : {}
      };
      addedIds.push(restated.id);
      continue;
    }
    if (recordedThisTurn.has(a.kind) || !namesSubject(a.ask)) {
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
    if (isKnown || !namesSubject(work)) continue;
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
  return withRec({ ...item, options }, restatedRec(options, item.rec, change.rec));
}

// ../core/domain/question-checks.ts
var REPORT_VERB = String.raw`\b(?:report|tell (?:me|us)|let (?:me|us) know)\b`;
var CONDITIONAL_VERB = String.raw`\b(?:confirm|answer|say|reply|tell \w+)\b`;
var SAME_CLAUSE = String.raw`(?:(?!\b(?:when|once|after)\b)(?:[^.;?!]|\.(?=\S)))*`;
var NAMED_RESULTS_ASK = new RegExp(
  String.raw`\bwhether\b|${REPORT_VERB}${SAME_CLAUSE}\bor\b|${CONDITIONAL_VERB}${SAME_CLAUSE}\bif\b${SAME_CLAUSE}\bor\b`,
  "i"
);

// ../core/domain/earlier-answers.ts
var K1 = 1.2;
var B = 0.75;
var RELATIVE_FLOOR = 0.22;
var EARLIER_TEXT_CHARS = 200;
var STOP_WORDS2 = new Set(
  `a an the and or of to in on for with at by from into onto is are was were be been being it its this that these
those i you we he she they me my your our their them as if then than so do does did done can could should would will
shall may might must not no yes now still also just again already instead yet any all some each per via up out over
about after before when while which what who whom why how where whether there here let lets get got have has had
pr prs`.split(/\s+/)
);
function searchTerms(text2) {
  return (text2.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => !STOP_WORDS2.has(w) && (w.length > 1 || /\d/.test(w))
  );
}
function answerIndex(docs) {
  const postings = /* @__PURE__ */ new Map();
  const lengths = docs.map((d, n) => {
    const terms = searchTerms(`${d.ask} ${d.answer}`);
    const counts = /* @__PURE__ */ new Map();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, count] of counts) {
      const list = postings.get(t);
      if (list) list.push([n, count]);
      else postings.set(t, [[n, count]]);
    }
    return terms.length;
  });
  const total = lengths.reduce((sum, l) => sum + l, 0);
  return { docs, lengths, postings, averageLength: docs.length > 0 ? total / docs.length : 0 };
}
function rankedEarlier(index, question, skip, top) {
  const n = index.docs.length;
  const scores = /* @__PURE__ */ new Map();
  const sharesWord = /* @__PURE__ */ new Set();
  let reachable = 0;
  for (const term of new Set(searchTerms([question.ask, ...question.options].join(" ")))) {
    const posted = index.postings.get(term);
    if (!posted) continue;
    const weight = Math.log(1 + (n - posted.length + 0.5) / (posted.length + 0.5));
    reachable += weight * (K1 + 1);
    const isWord = /[a-z]/.test(term);
    for (const [doc, count] of posted) {
      if (isWord) sharesWord.add(doc);
      const norm = 1 - B + B * index.lengths[doc] / index.averageLength;
      scores.set(doc, (scores.get(doc) ?? 0) + weight * count * (K1 + 1) / (count + K1 * norm));
    }
  }
  if (reachable === 0) return [];
  return [...scores].flatMap(([i, score]) => {
    const doc = index.docs[i];
    return doc && doc.key !== skip && sharesWord.has(i) ? [{ doc, score: score / reachable }] : [];
  }).toSorted((a, b) => b.score - a.score).slice(0, top).filter((match) => match.score >= RELATIVE_FLOOR);
}
function bestEarlier(index, question, skip) {
  return rankedEarlier(index, question, skip, 1)[0] ?? null;
}
function earlierOf(match, isShown) {
  const { doc } = match;
  return {
    ask: clipLabel(doc.ask, EARLIER_TEXT_CHARS),
    answer: clipLabel(doc.answer, EARLIER_TEXT_CHARS),
    at: doc.at,
    repo: doc.repo,
    score: Math.round(match.score * 1e3) / 1e3,
    isShown
  };
}
var DAY_MS2 = 24 * 60 * 6e4;
function agoText(ms) {
  const minutes = Math.max(1, Math.round(ms / 6e4));
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(ms / DAY_MS2);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
function earlierLineOf(earlier, now) {
  if (!earlier?.isShown) return null;
  const where = earlier.repo ? `, in ${earlier.repo},` : "";
  return {
    lead: "You answered ",
    answer: earlier.answer,
    rest: ` ${agoText(now - earlier.at)}${where} to \u201C${earlier.ask}\u201D`
  };
}

// ../core/domain/tool-schemas.ts
var RECORD_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["question", "task", "finding"],
      description: "question: a decision only the user can make. task: a step only the user can do. finding: something outside the current task that deserves their attention."
    },
    ask: {
      type: "string",
      description: "For a question or task: what you need from the user, in at most 12 plain words, readable without your reply."
    },
    context: {
      type: "string",
      description: "For a question: why it came up, in at most 20 plain words, so the user can answer without reading back through the conversation."
    },
    options: {
      type: "array",
      items: { type: "string" },
      description: "For a question: the answers the user can pick, at most 5 words each, in words the user would say, without links, URL parameters, file paths or names from code. Give at least one. For a task that checks something whose outcome you need, such as whether a fix works on their screen: the outcomes the user can report, in the same form. Leave it out for a task you only need done, such as a sign-in."
    },
    option_notes: {
      type: "array",
      items: { type: "string" },
      description: "For a question: one note for each option, in the order of options, saying what picking it does, in at most 12 words each."
    },
    previews: {
      type: "array",
      items: { type: "string" },
      description: 'For a question: one image, page or file for each option, in the order of options, that shows what picking it looks like, each as an absolute file path or an https link. Give "" for an option with none. The user opens them side by side.'
    },
    rec: {
      type: "string",
      description: "For a question: the option you recommend, copied from options. Leave it out when you recommend none."
    },
    why: {
      type: "string",
      description: 'For a question with rec: why you recommend it, as a short clause of at most 12 words, such as "it keeps the old API".'
    },
    steps: {
      type: "array",
      items: { type: "string" },
      description: "For a task: up to 3 things the user can do in one press, each written bare as a command, a file path or an https link. For a question: up to 3 files or https links that help the user decide, such as a page comparing the options, each file as an absolute path."
    },
    design_choice: {
      type: "boolean",
      description: "For a question: true when its options are designs or approaches you could try and show side by side, such as two layouts or two ways to build a feature. The user can then ask you to compare them. Leave it out for a fact, an approval or a preference."
    },
    finding_kind: {
      type: "string",
      enum: ["issue", "opportunity"],
      description: "For a finding. issue: something wrong or risky. opportunity: something that could be better."
    },
    title: { type: "string", description: "For a finding: what it is, in at most 12 plain words." },
    detail: {
      type: "string",
      description: "For a finding: why it matters and what you would do, in one or two sentences."
    },
    path: { type: "string", description: "For a finding: the file it is about, if one." }
  },
  required: ["kind"]
};
var CLOSE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "The id of the open item or finding, such as i35 or f32." },
    answer: {
      type: "string",
      description: `The user's answer, at most 8 words, when their own message answered it. Use their words, but when they picked by position or pointing, as "the second one", give the option they picked.`
    },
    reason: {
      type: "string",
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".'
    }
  },
  required: ["id"]
};
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
var TOOL_FIELDS = {
  record: Object.keys(RECORD_SCHEMA.properties),
  close: Object.keys(CLOSE_SCHEMA.properties),
  order_prs: Object.keys(ORDER_SCHEMA.properties)
};

// ../core/domain/inbox-text.ts
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
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../core/view/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../core/view/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var FOLLOW_UPS = /* @__PURE__ */ new Set([
  "type",
  "show-explanation",
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
  "show-explanation": "s",
  explain: "e",
  compare: "p",
  previews: "o",
  discuss: "d",
  dismiss: "x",
  discard: "x"
};
function actionsOf(row, last, state, feedback, isUndoOut = false, canScrollConversation = false) {
  const { id, item, steps: steps2 } = row;
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const isFirstExplanationOut = last?.explanation?.isFirstReply === true && pressing === "explain";
  const isExplanationShown = canScrollConversation && last?.explanation?.replyId !== void 0 && !isFirstExplanationOut;
  const action = (press, label, kind, flags = {}) => {
    const pressAction = actionId(press);
    return {
      press,
      label: press.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press.action === "address" ? "primary" : press.action === "type" || press.action === "discuss" || press.action === "explain" || press.action === "show-explanation" || press.action === "compare" || press.action === "dismiss" || press.action === "discard" ? "quiet" : "normal",
      ...press.action === "done" ? { icon: "done" } : press.action === "step" && stepIconKind(steps2[press.step]) ? { icon: stepIconKind(steps2[press.step]) } : {},
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {},
      isOut: out === pressAction || press.action === "undo" && isUndoOut
    };
  };
  if (state.is === "settled")
    return state.canUndo || state.offersUndo && isUndoOut ? [action({ action: "undo", id }, ROW_COPY.undo, "view")] : [];
  if (state.is === "held")
    return [
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "discard", id }, ROW_COPY.discard, "view")
    ];
  const stepActions = steps2.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
  const explainActions = [
    ...isExplanationShown ? [action({ action: "show-explanation", id }, SHOW_EXPLANATION_LABEL, "local")] : [],
    action({ action: "explain", id }, "Explain", "talk")
  ];
  if (!item)
    return [
      action({ action: "address", id }, row.finding ? fixLabel(row.finding) : "Fix", "handoff"),
      action({ action: "issue", id }, ISSUE_LABEL, "handoff"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      ...explainActions,
      action({ action: "discuss", id }, "Discuss", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  if (item.kind === "task")
    return [
      ...stepActions,
      ...item.options.length > 0 ? item.options.map(
        (option, n) => action({ action: "answer", id, option }, option, "mark", {
          isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
        })
      ) : [action({ action: "done", id }, "Done", "mark")],
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      ...explainActions,
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map(
      (option, n) => action({ action: "answer", id, option }, option, "mark", {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })
    ),
    ...item.previewPage ? [action({ action: "previews", id }, OPEN_PREVIEWS_LABEL, "local")] : [],
    ...stepActions,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    ...explainActions,
    ...showsCompare(item) ? [action({ action: "compare", id }, "Compare", "talk")] : [],
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}

// ../core/view/view.ts
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
  sessionPrs: sessionPrs2,
  settleWindowMs,
  status,
  now,
  replies,
  discarded,
  shownSince,
  lastTypedMessageAt,
  listInput,
  undoShown,
  undoOut = [],
  collapsed = [],
  canScrollConversation = false
}) {
  const isFindingId = (id) => ledger.findings.some((f) => f.id === id) || ledger.closedFindings.some((f) => f.id === id);
  const isItemId = (id) => ledger.items.some((i) => i.id === id) || ledger.closed.some((c) => c.id === id);
  const reportedAtOf = (id) => (ledger.items.find((i) => i.id === id) ?? ledger.closed.find((c) => c.id === id)?.item)?.reportedAt;
  const pressOutSinceWhere = (isOnTab) => earliestOf(
    Object.entries(lastActions).map(
      ([id, last]) => isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, void 0, turns, now, reportedAtOf(id))) : null
    )
  );
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
  const isInPlace = (id, at, canUndo, last) => isSettledInPlace(
    { at, canUndo, delivery: pendingDeliveryAt(last, now) },
    isFindingId(id) ? placingFor.findings : placingFor.needsYou,
    id
  );
  const pressedSend = (c) => {
    const last = lastActions[c.id];
    return (c.how === "answered" || c.how === "done") && last?.kind === "mark" && last.at === closedAt(c) ? last : void 0;
  };
  const isOpen2 = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const replyAfter = (c) => {
    const last = lastActions[c.id];
    return last?.action === "type" && last.at >= closedAt(c) && last.delivery?.state !== "failed" && isInPlace(c.id, last.at, false, last) ? last : null;
  };
  const isPressedAnswer = (c) => c.how === "answered" && lastActions[c.id]?.kind === "mark" && lastActions[c.id]?.at === closedAt(c);
  const isOwnClose = (c) => c.how === "done" || c.how === "dismissed" || isPressedAnswer(c);
  const isAnswerHeld = (c) => isPressedAnswer(c) && isHeldSend(lastActions[c.id]) && isUndoLeft(closedAt(c), now, settleWindowMs);
  const isHeld = (c) => {
    const since = replies[c.id];
    return since !== void 0 && since <= closedAt(c) && !isOwnClose(c);
  };
  const isDiscarded = (c) => (discarded[c.id] ?? -Infinity) >= closedAt(c);
  const isPlaced = (c) => {
    const at = closedAt(c);
    return replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isInPlace(c.id, at, isAnswerHeld(c) || canUndoClose(c, at, now, settleWindowMs), pressedSend(c)));
  };
  const placedItems = new Map(
    ledger.closed.filter((d) => d.item && !isOpen2(d.id) && isPlaced(d)).map((d) => [d.id, d])
  );
  const isFixSettled = (id) => {
    const last = lastActions[id];
    return isFixSent(last) && !isInPlace(id, last.at, isUndoLeft(last.at, now, settleWindowMs), last);
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
      const reply = replyAfter(closed2);
      if (reply)
        return {
          is: "settled",
          label: doneLabel(reply),
          at: reply.at,
          canUndo: false,
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed2),
          ...reply.reply !== void 0 ? { reply: reply.reply } : {}
        };
      if (isHeld(closed2)) return { is: "held", label: heldLabel(closed2), at };
      return closedRowState(
        closed2,
        at,
        now,
        settleWindowMs,
        "doneNotification" in closed2 && closed2.doneNotification?.error !== void 0 ? { error: closed2.doneNotification.error, canUndo: isUndoable(closed2) } : pendingDeliveryAt(pressedSend(closed2), now),
        isPressedAnswer(closed2)
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
    const actions = actionsOf(
      row,
      last,
      state,
      pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt),
      undoOut.includes(row.id),
      canScrollConversation
    );
    const held2 = state.is === "open" ? heldSubjectsOf(ledger.overview, row.id) : [];
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held2.length > 0 ? `${HOLDS_UP_TEXT} ${held2.map((s) => s.name).join(", ")}` : null,
      contextLine: state.is === "open" ? row.item?.context ?? null : null,
      earlierLine: state.is === "open" ? earlierLineOf(row.item?.earlier, now) : null
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
      steps: stepsOf(item, sessionPrs2)
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
    status,
    collapsed
  };
}
function heldLabel(c) {
  if (c.how === "answered") return `Answered: ${c.outcome}`;
  return c.how === "claude" ? capitalized(c.outcome) : `Closed: ${c.outcome}`;
}
var NEXT_TRY = " It tries again after the next reply.";
var FAILED_UPDATE_TEXT = {
  failed: `The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing.${NEXT_TRY}`,
  "failed-again": `The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing.${NEXT_TRY}`,
  unreadable: `The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing.${NEXT_TRY}`
};
function perTurnStatus(sync) {
  const why = sync.is === "stale" || sync.is === "unavailable" ? sync.why : null;
  const isQuiet = why === null || why === "read-failed" || why === "retrying";
  const error = isQuiet ? null : FAILED_UPDATE_TEXT[why];
  return { error };
}

// ../core/view/sync-state.ts
var NO_SYNC_INPUTS = {
  isReadFailed: false,
  isFetchingPrs: false,
  turnReadFailedAt: null,
  isDemo: false
};
var FRESH = { is: "fresh" };
var PR_FRESH_MS = PR_SHARED_MS + PRS_REFRESH_MS + PR_POLL_MS + GH_TIMEOUT_MS;
function ledgerSync(s, inputs) {
  const p = s.presence;
  if (inputs.isReadFailed) return { is: "unavailable", why: "read-failed" };
  if (p.ledgerState === "current") return FRESH;
  const isUnreadable = !p.isUpdating && s.pending.length === 0 && p.isConversationUnreadable;
  if (isUnreadable) return { is: "unavailable", why: "unreadable" };
  if (p.ledgerState === "behind") return { is: "checking" };
  const why = p.isUpdating ? "retrying" : p.failedAttempts > 1 ? "failed-again" : "failed";
  return { is: "stale", since: null, why };
}
function statusSync(s) {
  if (s.overviewFailure) return { is: "stale", since: s.overviewFailure.at, why: "failed" };
  const o = s.ledger.overview;
  return o !== null && isStatusQuiet(o) ? { is: "stale", since: o.changedAt, why: "quiet" } : FRESH;
}
function turnSync(s, inputs) {
  const isUnknown = inputs.turnReadFailedAt !== null && s.presence.isTurnRunning;
  return isUnknown ? { is: "stale", since: inputs.turnReadFailedAt, why: "rollout-unread" } : FRESH;
}
function ghSync(prViews) {
  if (prViews.isGhMissing) return { is: "unavailable", why: "gh-missing" };
  if (prViews.isGhSignedOut) return { is: "unavailable", why: "gh-signed-out" };
  const { failure } = prViews;
  return failure ? { is: "stale", since: failure.at, why: { kind: "fetch-failed", failure } } : FRESH;
}
function prSync(view, failure, isFetching, now) {
  const readAt = view.fetchedAt ?? null;
  const isFailedSince = failure != null && (readAt === null || failure.at > readAt);
  const why = view.error ? "error" : isFailedSince ? "fetch-failed" : readAt === null || now - readAt >= PR_FRESH_MS ? "old" : null;
  if (why === null) return FRESH;
  return isFetching ? { is: "checking" } : { is: "stale", since: readAt, why };
}
function viewSync(s, now, inputs) {
  const isFetchingPrs = inputs.isFetchingPrs || s.prViews.isFetching === true;
  const prs = Object.fromEntries(
    Object.values(s.prViews.views).map((v) => [
      v.ref,
      inputs.isDemo ? FRESH : prSync(v, s.prViews.failure, isFetchingPrs, now)
    ])
  );
  return {
    ledger: ledgerSync(s, inputs),
    status: statusSync(s),
    turn: turnSync(s, inputs),
    gh: ghSync(s.prViews),
    prs
  };
}

// ../core/domain/preconditions.ts
var PRESS_LIFETIME_MS = 24 * 60 * 6e4;
var isRecord = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((v) => v === void 0 ? "null" : canonical(v)).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? "null";
  const fields2 = Object.keys(value).filter((key) => value[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  return `{${fields2.join(",")}}`;
}
function hash(text2) {
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0; i < text2.length; i++) {
    const c = text2.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function rowVersion(s, id) {
  const l = s.ledger;
  if (id === "goal") {
    const o = l.overview;
    return hash(canonical([o?.goal?.text ?? null, o?.goalRemoved?.goal.text ?? null, o?.suggestedGoal ?? null]));
  }
  const item = l.items.find((row) => row.id === id);
  return hash(
    canonical([
      item ? { ...item, dialog: void 0 } : null,
      l.findings.find((row) => row.id === id) ?? null,
      l.closed.findLast((row) => row.id === id) ?? null,
      l.closedFindings.findLast((row) => row.id === id) ?? null
    ])
  );
}

// ../core/view/press-preconditions.ts
function drawnVersions(s, rowIds, prs) {
  return {
    rows: Object.fromEntries(rowIds.map((id) => [id, rowVersion(s, id)])),
    prHeads: Object.fromEntries(prs.flatMap((pr) => pr.headSha === void 0 ? [] : [[pr.ref, pr.headSha]]))
  };
}

// ../core/domain/status-children.ts
var NOT_SEEN = "not seen yet";
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function isFinishedAfter(c, at) {
  return c.delegateState === "finished" && c.endedAt !== null && (at === null || c.endedAt > at);
}
function isChildSettled(c, now, lastLookAt) {
  return c.delegateState === "finished" && c.endedAt !== null && lastLookAt !== null && c.endedAt <= lastLookAt && now - c.endedAt < CHILD_KEPT_MS;
}
function isChildShown(c, now, lastLookAt) {
  return isChildRunning(c, now) || isFinishedAfter(c, lastLookAt);
}
function subjectsText(o, now) {
  const subjects = o?.subjects ?? [];
  const serves = (id) => o?.goal ? ` | ${servesText(o, id)}` : "";
  const open2 = subjects.filter(isOpen).map((s) => `${s.id} | ${s.status} | ${s.name} | ${s.text || "-"} | ${ago(now - s.changedAt)}${serves(s.id)}`);
  const finished = subjects.filter((s) => !isOpen(s)).slice(-FINISHED_READ).map((s) => `${s.id} | ${s.status} | ${s.name}${o !== null && isSubjectSeen(o, s) ? "" : ` | ${NOT_SEEN}`}`);
  return { open: open2.join(NL) || "(none yet)", finished: finished.join(NL) };
}
function idleSubjects(o, asks, now) {
  const held = new Set(asks.flatMap((a) => o?.askSubjects[a.id] ?? []));
  const isWorkedOn = (s) => (o?.children ?? []).some((c) => c.subjectId === s.id && isChildRunning(c, now));
  return (o?.subjects ?? []).filter(
    (s) => isUnderWay(s) && now - Math.max(s.changedAt, s.keptAt ?? 0) >= IDLE_AFTER_MS && !held.has(s.id) && !isWorkedOn(s)
  );
}
function idleText(o, asks, now) {
  return idleSubjects(o, asks, now).map((s) => `${s.id} | ${s.status} | ${s.name} | ${duration(now - s.changedAt)}`).join(NL);
}
function servesText(o, subjectId) {
  const to = o.serves[subjectId];
  return to === void 0 ? "?" : to === "none" ? "-" : to;
}
function asksText(o, asks) {
  return asks.map((a) => {
    const held = `${a.id} | ${clipWords(a.ask, ASK_READ_WORDS)} | ${o?.askSubjects[a.id]?.join(", ") || "-"}`;
    const why = a.context ? clipWords(a.context.replaceAll("|", "/"), ASK_READ_WORDS) : "";
    return why === "" ? held : `${held} | ${why}`;
  }).join(NL);
}
function runningText(o, now) {
  const isSubjectOpen = (id) => id === null || (o?.subjects.some((s) => s.id === id && isOpen(s)) ?? false);
  const isFinishNew = (c) => isFinishedAfter(c, o?.lastCallReadAt ?? null) && isSubjectOpen(c.subjectId);
  const state = (c) => !isChildRunning(c, now) ? "finished" : c.delegateState === "blocked" ? "blocked" : "running";
  return (o?.children ?? []).filter((c) => isChildRunning(c, now) || isFinishNew(c)).map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? "-"} | ${state(c)}`).join(NL);
}
function subjectSeenAt(o, id) {
  return id in o.missedInLastLook ? o.missedInLastLook[id] ?? null : o.lastLookAt;
}
function isSubjectSeen(o, s) {
  const seenAt = subjectSeenAt(o, s.id);
  return seenAt !== null && s.changedAt <= seenAt;
}

// ../core/view/status-repeats.ts
function holdsEveryWordOf(text2, name) {
  const said = stems(text2);
  const words3 = stems(name);
  return words3.size > 0 && [...words3].every((w) => said.has(w));
}
function isNamedAlike(a, b) {
  const [x, y] = [stems(a), stems(b)];
  const [short, long] = x.size <= y.size ? [x, y] : [y, x];
  return short.size > 0 && [...short].every((w) => long.has(w));
}
function withoutRepeatedNow(page, o) {
  const g = page.goal;
  const nowText = o?.head ? o.head.description || o.head.title : null;
  if (g === null || g.now === null || o === null || nowText === null) return page;
  const drawnIds = new Set(statusListRows(page).flatMap((r) => r.kind === "subject" ? [r.id] : []));
  const isRepeated = o.subjects.some(
    (x) => drawnIds.has(x.id) && x.status === "working" && holdsEveryWordOf(nowText, x.name)
  );
  return isRepeated ? { ...page, goal: { ...g, now: null } } : page;
}
function subjectInPlaceOf(o, m, items) {
  if (m.status === "dropped") return null;
  const work = o.subjects.filter((x) => x.into === null && o.serves[x.id] === m.id);
  const only = work.length === 1 && work[0]?.status !== "dropped" ? work[0] : void 0;
  const isAskedDirectly = items.some((i) => o.askSubjects[i.id]?.includes(m.id));
  const isDoneWithOpenWork = m.status === "done" && only !== void 0 && isOpen(only);
  return only !== void 0 && !isAskedDirectly && !isDoneWithOpenWork && isNamedAlike(m.name, only.name) ? only : null;
}
function isTitleRepeated(title, subjects, rows) {
  const drawnIds = new Set(rows.flatMap((r) => r.kind === "subject" ? [r.id] : []));
  const work = subjects.filter((x) => x.into === null);
  if (work.filter(isOpen).length > 1) return false;
  return work.some(
    (x) => isOpen(x) ? isNamedAlike(title, x.name) : drawnIds.has(x.id) && holdsEveryWordOf(title, x.name)
  );
}
function headPart(head, goal, subjects, rows) {
  if (head === null || goal !== null && !goal.isMet) return [];
  const title = goal === null && isTitleRepeated(head.title, subjects, rows) ? null : head.title;
  const hasContentUnder = rows.length > 0 || goal === null && head.description !== null;
  return hasContentUnder && (title ?? head.description) !== null ? [{ kind: "part", id: "head", depth: 0, text: title, description: head.description, isTitle: true }] : [];
}
function milestoneAsSubject(m, subjectRows) {
  const [row, ...under] = subjectRows;
  if (row?.kind !== "subject") return m;
  const work = under.map((r) => r.kind === "child" || r.kind === "more" ? { ...r, branch: null } : r);
  return {
    ...m,
    id: row.id,
    mark: row.mark,
    tone: row.tone,
    name: row.name,
    foldId: null,
    foldCount: work.length === 0 ? 0 : row.foldCount,
    text: row.text,
    was: row.was,
    ask: row.ask,
    rows: work,
    subject: row
  };
}

// ../core/view/status-page.ts
var OTHER_WORK = "Other work";
var WAS_LABEL = "Prev: ";
var WAS_MARK = "\u21A9";
var WAS_PREFIX = `${WAS_MARK} ${WAS_LABEL}`;
var NEW_CLOSED_ROWS = 2;
var STATUS_PLACES = ["held", "working", "waits-on-other", "queued", "closed"];
function statusPage(s, now, turn = { is: "fresh" }) {
  const o = s.ledger.overview;
  const sync = statusSync(s);
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => o === null || !isSubjectSeen(o, x);
  const heldIds = new Set(s.ledger.items.flatMap((i) => o?.askSubjects[i.id] ?? []));
  const isHeld = (x) => isOpen(x) && heldIds.has(x.id);
  const holdKindsOf = (x) => s.ledger.items.filter((i) => o?.askSubjects[i.id]?.includes(x.id)).map((i) => i.kind);
  const oldestAskOf = (x) => isHeld(x) ? oldestAsk(s.ledger.items, o?.askSubjects ?? {}, x.id) : null;
  const placeOf = (x) => isHeld(x) ? "held" : x.status === "done" || x.status === "dropped" ? "closed" : x.status;
  const pageOrder = (x, y) => STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt;
  const goalParts = goalPage(o, s.ledger.items);
  const milestoneIds = new Set((goalParts.goal?.milestones ?? []).map((m) => m.id));
  const servedBy = (x) => o?.goal ? o.serves[x.id] : void 0;
  const milestoneOf2 = (x) => {
    const to = servedBy(x);
    return to !== void 0 && milestoneIds.has(to) ? to : null;
  };
  const hasMilestones = milestoneIds.size > 0;
  const isUnneeded = (x) => servedBy(x) === "none";
  const isOther = (x) => isUnneeded(x) || hasMilestones && milestoneOf2(x) === null;
  const running = (o?.children ?? []).filter((c) => isChildShown(c, now, look)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const hasChildRow = (x) => running.some((c) => c.subjectId === x.id);
  const unseenClosedOf = (part) => part.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0));
  const needed = subjects.filter((x) => !isUnneeded(x));
  const main2 = needed.filter((x) => !isOther(x));
  const other = subjects.filter(isOther);
  const canFold = (x) => !isHeld(x) && !isNew(x) && !hasChildRow(x);
  const laterIds = new Set((goalParts.goal?.milestones ?? []).filter((m) => m.place === "later").map((m) => m.id));
  const isFoldedUnderLater = (x) => laterIds.has(milestoneOf2(x) ?? "") && canFold(x);
  const open2 = needed.filter((x) => isOpen(x) && !isFoldedUnderLater(x)).sort(pageOrder);
  const foldable = open2.filter(canFold);
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open2.length - foldable.length)));
  const split = (part, isLater = false) => {
    const unseenClosed = unseenClosedOf(part);
    const newClosed = unseenClosed.slice(0, NEW_CLOSED_ROWS);
    const isFoldedOpen = (x) => isOpen(x) && (folded.includes(x) || isLater && canFold(x));
    return {
      shown: [...part.filter((x) => isOpen(x) && !isFoldedOpen(x)), ...newClosed].sort(pageOrder),
      newClosed,
      named: unseenClosed.slice(NEW_CLOSED_ROWS),
      foldedOpen: part.filter(isFoldedOpen),
      foldedDone: part.filter((x) => x.status === "done" && !isNew(x))
    };
  };
  const top = split(main2.filter((x) => milestoneOf2(x) === null));
  const underMilestones = (goalParts.goal?.milestones ?? []).map(
    (m) => split(
      main2.filter((x) => milestoneOf2(x) === m.id),
      m.place === "later"
    )
  );
  const otherUnseenClosed = unseenClosedOf(other);
  const otherNewClosed = otherUnseenClosed.slice(0, NEW_CLOSED_ROWS);
  const isOtherFolded = (x) => !isOpen(x) ? x.status === "done" && !isNew(x) : isUnneeded(x) ? !isHeld(x) && !isNew(x) && !hasChildRow(x) : folded.includes(x);
  const otherFolded = other.filter(isOtherFolded);
  const otherShown = [...other.filter((x) => isOpen(x) && !otherFolded.includes(x)), ...otherNewClosed].sort(pageOrder);
  const shownIds = new Set([...top.shown, ...underMilestones.flatMap((p) => p.shown), ...otherShown].map((x) => x.id));
  const ctx = {
    isNew,
    isHeld,
    holdKindsOf,
    oldestAskOf,
    items: s.ledger.items,
    running,
    isTurnRunning: s.presence.isTurnRunning && turn.is === "fresh",
    now
  };
  const foldCtx = { ...ctx, running: [] };
  const openFold = (prefix, foldedOpen, depth) => foldedOpen.length === 0 ? [] : foldedOpen.length === 1 ? partRows(foldedOpen, ctx, depth) : [
    {
      kind: "fold",
      id: `${prefix}open`,
      depth,
      ...SUBJECT_MARKS.queued,
      text: `${foldedOpen.length} more`,
      subjectIds: []
    }
  ];
  const doneFold = (prefix, done, newClosed, depth, settled2) => done.length + settled2.length === 0 ? [] : done.length + settled2.length === 1 ? [...partRows(done, foldCtx, depth), ...settled2.map((c) => childRow(c, null, depth, finishedLine(c, now)))] : [
    {
      kind: "done-fold",
      id: `${prefix}done`,
      depth,
      text: `${done.length + settled2.length}${newClosed.some((x) => x.status === "done") ? " more" : ""} done`,
      rows: [
        ...partRows([...done].sort(pageOrder), foldCtx, depth + 1),
        ...settled2.map((c) => childRow(c, null, depth + 1, finishedLine(c, now)))
      ]
    }
  ];
  const foldedPart = (prefix, p, depth, settled2 = []) => [
    ...partRows(p.shown, ctx, depth, openFold(prefix, p.foldedOpen, depth), namedFolds(prefix, p.named, depth)),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth, settled2)
  ];
  const { loose, settled } = unplacedChildren(o?.children ?? [], {
    subjects,
    shownIds,
    milestoneOf: milestoneOf2,
    isSettled: (c) => isChildSettled(c, now, look),
    running
  });
  const looseRows = (milestoneId, depth) => loose.filter((l) => l.milestoneId === milestoneId).map((l) => childRow(l.child, null, depth));
  const otherCountedSubjects = otherFolded.filter((x) => isOpen(x) && isUnneeded(x) && isCounted(x));
  const otherCounts = countsByMark(otherCountedSubjects);
  const afterOtherOpen = [
    ...openFold(
      "other-",
      otherFolded.filter((x) => isOpen(x) && !isUnneeded(x)),
      0
    ),
    ...otherCounts.length === 0 ? [] : [
      {
        kind: "counts",
        id: "other-counts",
        depth: 0,
        counts: otherCounts,
        rows: partRows([...otherCountedSubjects].sort(pageOrder), foldCtx, 1)
      }
    ]
  ];
  const otherRows = [
    ...hasMilestones ? looseRows(null, 0) : [],
    ...partRows(otherShown, ctx, 0, afterOtherOpen, namedFolds("other-", otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0)),
    ...doneFold(
      "other-",
      otherFolded.filter((x) => x.status === "done"),
      otherNewClosed,
      0,
      hasMilestones ? settled : []
    )
  ];
  const head = o?.head ? { title: o.head.title, description: textBeyondName(o.head.title, o.head.description) } : null;
  const g = goalParts.goal;
  const listRows2 = [
    ...hasMilestones ? [] : looseRows(null, 0),
    ...foldedPart("", top, 0, hasMilestones ? [] : settled),
    ...otherRows.length > 0 ? [
      { kind: "part", id: "other", depth: 0, text: OTHER_WORK, description: null, isTitle: false },
      ...otherRows
    ] : []
  ];
  const headRows = headPart(head, g, subjects, listRows2);
  const rows = [
    ...headRows,
    ...headRows.length > 0 && listRows2[0]?.id === "other" ? listRows2.slice(1) : listRows2
  ];
  const isWorkClosed = (m, p) => p.foldedOpen.length === 0 && !p.shown.some(isOpen) && !running.some(
    (c) => isChildRunning(c, now) && (p.shown.some((x) => x.id === c.subjectId) || loose.some((l) => l.child === c && l.milestoneId === m.id))
  );
  const workCount = (p) => p.shown.length + p.named.length + p.foldedOpen.length + p.foldedDone.length;
  const isAllSeen = (m, p) => p.shown.length + p.named.length + p.foldedOpen.length === 0 && !loose.some((l) => l.milestoneId === m.id);
  const withRows = (m, p) => {
    const milestone = o?.milestones.find((x) => x.id === m.id);
    const hasLooseWork = loose.some((l) => l.milestoneId === m.id);
    const inPlace = o && milestone && !hasLooseWork ? subjectInPlaceOf(o, milestone, s.ledger.items) : null;
    if (inPlace) return milestoneAsSubject(m, partRows([inPlace], isNew(inPlace) || isOpen(inPlace) ? ctx : foldCtx, 0));
    const rows2 = [...looseRows(m.id, 1), ...foldedPart(`${m.id}-`, p, 1)];
    const changedAt = milestone?.changedAt ?? Infinity;
    const isShrunk = m.place === "done" && look !== null && changedAt <= look && isAllSeen(m, p);
    return isShrunk ? {
      ...m,
      text: null,
      isMuted: true,
      foldId: p.foldedDone.length > 0 ? `${m.id}-done` : null,
      rows: partRows([...p.foldedDone].sort(pageOrder), foldCtx, 1)
    } : {
      ...m,
      rows: rows2,
      foldCount: rows2.length === 0 ? 0 : workCount(p) + loose.filter((l) => l.milestoneId === m.id).length
    };
  };
  const goal = g && {
    ...g,
    milestonesFold: o?.goal ? metMilestonesFold(o.goal, g.milestones, (m) => isWorkClosed(m, underMilestones[g.milestones.indexOf(m)])) : null,
    milestones: g.milestones.map((m, n) => withRows(m, underMilestones[n]))
  };
  return withoutRepeatedNow(
    {
      isEmpty: rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
      head,
      ...goalParts,
      goal,
      rows,
      sync,
      syncText: statusSyncText(sync, now)
    },
    o
  );
}

// ../core/view/session-view.ts
var PRESS_TIMEOUT_MS = 6e4;
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at < PRESS_TIMEOUT_MS) return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
var STORED_KEYS = /* @__PURE__ */ new Set([
  "id",
  "collapsed",
  "press",
  "drawnVersions",
  "item",
  "finding",
  "option"
]);
function sessionView(s, now, settleWindowMs, holds = NO_HOLDS, notes = {}, canScrollConversation = false, inputs = NO_SYNC_INPUTS) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const sync = viewSync(s, now, inputs);
  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    sessionPrs: sessionPrs(s),
    settleWindowMs,
    status: perTurnStatus(sync.ledger),
    now,
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    collapsed: collapsedRows(s),
    canScrollConversation
  });
  const prs = prTabOf(s, lastActions, now, holds, settleWindowMs, sync.gh);
  const rowIds = [...allRows(inbox).map((r) => r.id), GOAL_KEYS_ID];
  const view = {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs,
    statusPage: statusPage(s, now, sync.turn),
    sync,
    drawnVersions: drawnVersions(
      s,
      rowIds,
      prs.drawn.map((d) => d.pr)
    )
  };
  return withDrawableText(view, (key) => STORED_KEYS.has(key));
}
function prTabOf(s, lastActions, now, { shownSince, listInput, undoShown, undoOut }, settleWindowMs, gh) {
  const pressOutSince = earliestOf(
    Object.entries(lastActions).map(
      ([id, last]) => isPrRowId(id) ? prTabHoldSince(feedbackOf(id, last, void 0, s.presence, now)) : null
    )
  );
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    undoOut,
    pressOutSince
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
    gh,
    refresh: prRefreshView(
      { ...s.prViews, isGhMissing: s.prViews.isGhMissing === true },
      s.ledger,
      { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now },
      shownSince
    ),
    clear: prClearActions(s.prViews, s.ledger),
    pressOutSince
  };
}

// ../core/runtime/session-presses.ts
function rowsInPlace(s, now = Date.now(), viewers = {}) {
  const since = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map((c) => ({ id: c.id, at: closedAt(c) }))
  ].flatMap((x) => isShownSince(x.at, s.shownSince) ? [x.id] : []);
  return /* @__PURE__ */ new Set([...s.heldRows, ...remoteHeldRows(viewers, s, now), ...pendingCommandRows(s), ...since]);
}
function pruned(s, now = Date.now(), viewers = {}) {
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(
      ([ref]) => isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince, now)
    )
  );
  const isViewDropped = Object.keys(views).length < Object.keys(s.prViews.views).length;
  return settledCollapses({
    ...s,
    ledger: pruneClosed(s.ledger, rowsInPlace(s, now, viewers)),
    prViews: isViewDropped ? { ...s.prViews, views } : s.prViews
  });
}

// ../core/runtime/host-prs.ts
var PRS_HIDDEN_REFRESH_MS = 10 * 6e4;

// ../core/remote/remote-commands.ts
var REMOTE_ACTIONS = [
  "type",
  "answer",
  "done",
  "address",
  "undo",
  "dismiss",
  "discuss",
  "explain",
  "compare",
  "issue",
  "discard",
  "remove-goal",
  "restore-goal",
  "take-goal"
];

// src/viewers.ts
import { readFile, rename as rename2, rm, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";

// ../core/domain/status-upgrade-goal.ts
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
  const unplaced = Array.isArray(r?.unplaced) ? r.unplaced.filter((id) => typeof id === "string") : [];
  return line && why ? { line, why, ...unplaced.length > 0 ? { unplaced } : {} } : null;
}
function time(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function goalOf(saved) {
  const g = saved;
  const text2 = nonEmpty(g?.text);
  const setAt = time(g?.setAt);
  if (typeof saved !== "object" || text2 === null || setAt === null) return null;
  const isAwaitingMilestones = g?.isAwaitingMilestones === true;
  const isTyped = g?.source === "typed" || g?.source !== "inferred" && isAwaitingMilestones;
  return {
    text: text2,
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
  if (!m || typeof m.id !== "string" || typeof m.name !== "string" || !status || changedAt === null) return null;
  const madeNextAt = time(m.madeNextAt);
  return {
    id: m.id,
    name: m.name,
    status,
    text: typeof m.text === "string" ? m.text : "",
    was: nonEmpty(m.was),
    changedAt,
    closedAt: time(m.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null),
    ...madeNextAt === null ? {} : { madeNextAt }
  };
}
function milestonesOf(saved) {
  return (Array.isArray(saved) ? saved : []).map(milestoneOf).filter((m) => m !== null);
}
var isStringRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function goalRemovedOf(saved) {
  const r = saved;
  const goal = goalOf(r?.goal);
  if (goal === null || !isStringRecord(r?.serves) || !isStringRecord(r?.askSubjects)) return null;
  const serves = Object.entries(r.serves).filter((e) => typeof e[1] === "string");
  const asks = Object.entries(r.askSubjects).filter(
    (e) => Array.isArray(e[1]) && e[1].every((x) => typeof x === "string")
  );
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
  const serves = Object.fromEntries(
    savedServes.filter(
      (e) => names.has(e[0]) && typeof e[1] === "string" && (e[1] === "none" || live.has(e[1]))
    ).map(([id, to]) => {
      const milestone = live.get(to);
      return [id, milestone && namesOtherVersion(names.get(id), milestone.name) ? "none" : to];
    })
  );
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
    goalRefused: goalRefusedOf(o.goalRefused),
    suggestedGoal: nonEmpty(o.suggestedGoal),
    ...typeof o.noGoalFor === "string" ? { noGoalFor: o.noGoalFor } : {}
  };
}

// ../core/domain/status-upgrade.ts
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
  if (old) return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time2(s?.changedAt);
  const keptAt = time2(s?.keptAt);
  if (!s || typeof s.id !== "string" || typeof s.name !== "string" || !status || changedAt === null) return null;
  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    ...wasAndMerged(s.was, s.merged),
    createdAt: time2(s.createdAt) ?? changedAt,
    changedAt,
    closedAt: time2(s.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null),
    ...keptAt === null ? {} : { keptAt },
    into: typeof s.into === "string" ? s.into : null
  };
}
function childOf(saved) {
  const c = saved;
  const kind = CHILD_KINDS.find((k) => k === c?.kind);
  const startedAt = time2(c?.startedAt);
  if (!c || typeof c.id !== "string" || typeof c.ref !== "string" || !kind || startedAt === null) return null;
  return {
    id: c.id,
    ref: c.ref,
    kind,
    name: text(c.name),
    subjectId: typeof c.subjectId === "string" ? c.subjectId : null,
    startedAt,
    endedAt: time2(c.endedAt),
    lastActivityAt: time2(c.lastActivityAt),
    delegateState: DELEGATE_STATES.find((state) => state === c.delegateState) ?? null,
    ...typeof c.summary === "string" && c.summary.trim() ? { summary: c.summary } : {}
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
function missedOf(saved, ids) {
  const entries = typeof saved === "object" && saved !== null ? Object.entries(saved) : [];
  return Object.fromEntries(entries.filter(([id, at]) => ids.has(id) && (at === null || time2(at) !== null)));
}
function newestEnd(children) {
  const ends = children.flatMap((c) => c.endedAt === null ? [] : [c.endedAt]);
  return ends.length === 0 ? null : Math.max(...ends);
}
function upgradeStatus(saved) {
  const o = saved;
  if (typeof o !== "object" || o === null) return null;
  if (typeof o.headline === "string") return fromLists(o);
  if (!Array.isArray(o.subjects)) return null;
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
    lastCallReadAt: "lastCallReadAt" in o ? time2(o.lastCallReadAt) : newestEnd(children),
    changedAt: time2(o.changedAt),
    quietCalls: time2(o.quietCalls) ?? 0,
    ...goal
  };
}

// ../core/domain/ledger.ts
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
function howFromOutcome(outcome) {
  if (outcome === "dismissed") return "dismissed";
  if (outcome === EXPIRED) return "expired";
  if (outcome === "done" || outcome === "you ran it") return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return "claude";
  return "update";
}
var CLOSED_BY_CLAUDE = "closed by Claude";

// ../core/domain/host-tasks.ts
var NL5 = "\n";
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
  return keptTasks(tasks).map((t) => `TASK: ${t.status} | ${t.text}`).join(NL5);
}

// ../core/view/saved-check-keys.ts
function savedCheckKey(checks, name) {
  if (checks.some((c) => checkKey(c) === name)) return name;
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
  const upgradedStatuses = statuses && Object.fromEntries(
    Object.entries(statuses).map(([ref, status]) => [
      ref,
      { ...status, failing: status.failing.map((name) => savedCheckKey(views[ref]?.checks ?? [], name)) }
    ])
  );
  return {
    ...s,
    ledger: order ? { ...s.ledger, prOrder: { ...order, statuses: upgradedStatuses } } : s.ledger,
    sent: s.sent.map((x) => x.row === null ? x : { ...x, row: savedRowId(x.row, views) }),
    lastActions: Object.fromEntries(
      Object.entries(s.lastActions).map(([id, last]) => {
        const upgraded2 = savedRowId(id, views);
        return [upgraded2 in s.lastActions ? id : upgraded2, last];
      })
    )
  };
}

// ../core/domain/stops.ts
function apiErrorOf(detail) {
  if (detail === "rate_limit") return { cause: "rate-limit", text: null };
  if (detail === "overloaded") return { cause: "overloaded", text: null };
  return { cause: "other", text: detail || null };
}
function withApiError(stop) {
  const apiError = stop.apiError === void 0 ? stop.kind === "api-error" ? apiErrorOf(stop.detail) : null : stop.apiError;
  return { ...stop, apiError };
}

// ../core/view/session-files.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_FAILURE = { lastFailure: null, recoveredAt: null };
var NO_CALL_FAILURES = { ledger: NO_FAILURE, status: NO_FAILURE };
var NO_ANSWERS = { ledger: null, status: null };
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
    remoteCommandFloor: 0,
    commandWrite: null,
    heldRows: [],
    collapsed: {},
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    callFailures: NO_CALL_FAILURES,
    lastAnswers: NO_ANSWERS,
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
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return `${sessionId}.json`;
}
var isSessionFile = (name) => SESSION_FILE.test(name);
function missingAsNull(err) {
  if (err.code === "ENOENT") return null;
  throw err;
}
function savedToolFields(saved) {
  const isNames = (v) => Array.isArray(v) && v.every((f) => typeof f === "string");
  const fields2 = saved;
  return fields2 && isNames(fields2.record) && isNames(fields2.close) && isNames(fields2.order_prs) ? fields2 : null;
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
    ...saved.remoteCommands && { remoteCommands: saved.remoteCommands },
    remoteCommandFloor: saved.remoteCommandFloor ?? 0,
    commandWrite: saved.commandWrite ?? null,
    ...saved.lastHerdrPress && { lastHerdrPress: saved.lastHerdrPress },
    heldRows: saved.heldRows ?? [],
    collapsed: saved.collapsed ?? {},
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
    stop: saved.stop ? withApiError(saved.stop) : null,
    overviewFailure: saved.overviewFailure ?? null,
    callFailures: { ...NO_CALL_FAILURES, ...saved.callFailures },
    lastAnswers: { ...NO_ANSWERS, ...saved.lastAnswers },
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    overviewTurn: saved.overviewTurn ?? 0,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map((q) => ({ ...q, descriptions: q.descriptions ?? {} })),
    toolFields: savedToolFields(saved.toolFields)
  };
}

// src/lock.ts
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readdir, readlink, realpath, rename, rmdir, symlink, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join as join2, resolve } from "node:path";
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
    const isLinux = process.platform === "linux";
    const boot = bootSession ?? (isLinux ? readFileSync("/proc/sys/kernel/random/boot_id", "utf8") : execFileSync("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], options)).trim();
    const started = isLinux ? linuxStartTime(pid) : execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], options).trim();
    if (!boot || !started) return null;
    bootSession = boot;
    const identity = createHash("sha256").update(boot).update("\0").update(started).digest("hex").slice(0, 32);
    if (pid === process.pid) ownIdentity = identity;
    return identity;
  } catch {
    return null;
  }
}
function linuxStartTime(pid) {
  const stat7 = readFileSync(`/proc/${pid}/stat`, "utf8");
  return stat7.slice(stat7.lastIndexOf(")") + 2).split(" ")[19] ?? "";
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

// src/viewers.ts
var NO_LEASES = { writtenAt: 0, leases: {} };
function leasesPath(dir, sessionId) {
  return join3(dir, "sessions", sessionFile(sessionId).replace(/\.json$/, ".viewers.json"));
}
async function readViewers(dir, sessionId) {
  const saved = await readFile(leasesPath(dir, sessionId), "utf8").then((text2) => JSON.parse(text2)).catch(() => null);
  const isSaved = typeof saved?.writtenAt === "number" && typeof saved.leases === "object" && saved.leases !== null;
  return isSaved ? saved : NO_LEASES;
}

// src/command-log.ts
import { mkdir as mkdir3, readFile as readFile2, rename as rename3, rm as rm2, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2, join as join5 } from "node:path";

// ../core/runtime/command-store.ts
function commandLogPath(folder, sessionId) {
  return `${folder}/${sessionFile(sessionId).replace(/\.json$/, ".commands.json")}`;
}
function isLog(value) {
  const log = value;
  return log?.version === 1 && typeof log.writtenAt === "number" && typeof log.floor === "number" && Number.isSafeInteger(log.floor) && log.floor >= 0 && typeof log.commands === "object" && log.commands !== null;
}
function parsedLog(text2, now) {
  if (text2 === null) return { log: EMPTY_LOG, isUnreadable: false };
  const value = (() => {
    try {
      return JSON.parse(text2);
    } catch {
      return null;
    }
  })();
  return isLog(value) ? { log: value, isUnreadable: false } : { log: { ...EMPTY_LOG, floor: now }, isUnreadable: true };
}
var tmpCount = 0;
function fileCommandStore(files2, path, process2, opts) {
  return {
    runner: process2.runner,
    isRunning: (runner) => process2.isRunning(runner),
    read: async () => parsedLog(await files2.read(path), await opts.now()).log,
    update: async (change) => {
      const result = await files2.lock(path, async () => {
        const now = await opts.now();
        const { log, isUnreadable } = parsedLog(await files2.read(path), now);
        if (isUnreadable) {
          const aside = `${path}.unreadable-${now}`;
          await files2.move(path, aside);
          opts.log(`inbox: moved an unreadable command log aside to ${aside}`);
        }
        const next = await change(log);
        if (next === log && !isUnreadable) return { log, isChanged: false };
        const saved = { ...next, writtenAt: Math.max(now, log.writtenAt + 1) };
        const text2 = JSON.stringify(saved);
        const tmp = `${path}.${now.toString(36)}-${++tmpCount}.tmp`;
        await files2.write(tmp, text2);
        await files2.move(tmp, path);
        if (await files2.read(path) !== text2) throw new Error("The command log could not be confirmed saved.");
        return { log: saved, isChanged: true };
      });
      if (result.isChanged) await Promise.resolve(opts.onChange?.()).catch(() => void 0);
      return result.log;
    }
  };
}
async function movedLegacyCommands(store, s, log) {
  if (!s.remoteCommands) return s;
  try {
    await store.update((current) => withLegacy(current, s));
  } catch (err) {
    log(`inbox: the command log could not take the session's commands: ${err instanceof Error ? err.message : err}`);
    return s;
  }
  return withoutLegacy(s);
}
var followed = /* @__PURE__ */ new Map();
async function followCommandRows(store, key, s, log) {
  if (!hasCommandRows(s)) return;
  const facts = JSON.stringify([
    Object.entries(s.lastActions).flatMap(
      ([row, a]) => a.commandId ? [[row, a.commandId, a.action, a.delivery]] : []
    ),
    s.ledger.closed.flatMap((c) => c.commandId ? [[c.id, c.commandId, c.doneNotification]] : [])
  ]);
  if (followed.get(key) === facts) return;
  try {
    await store.update((current) => remoteCommandState(current, s));
    followed.set(key, facts);
  } catch (err) {
    log(`inbox: the command log could not follow the session: ${err instanceof Error ? err.message : err}`);
  }
}

// src/herdr-log.ts
import { appendFile, mkdir as mkdir2, stat, writeFile as writeFile2 } from "node:fs/promises";
import { join as join4 } from "node:path";
var HERDR_LOG_BYTES = 64 * 1024;
function herdrLog(dir) {
  const path = join4(dir, "herdr.log");
  return (text2) => void (async () => {
    const size = await stat(path).then(
      (s) => s.size,
      () => 0
    );
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${text2}
`;
    await mkdir2(dir, { recursive: true });
    await (size > HERDR_LOG_BYTES ? writeFile2(path, line) : appendFile(path, line));
  })().catch(() => void 0);
}

// src/pid.ts
function isPidRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== "ESRCH";
  }
}

// src/command-log.ts
var RUNNER = { id: String(process.pid), startedAt: Date.now() };
var isRunning = async (runner) => isPidRunning(Number(runner.id));
function commandsPath(dir, sessionId) {
  return commandLogPath(join5(dir, "sessions"), sessionId);
}
var files = {
  read: (path) => readFile2(path, "utf8").catch(missingAsNull),
  write: async (path, text2) => {
    await mkdir3(dirname2(path), { recursive: true });
    await writeFile3(path, text2);
  },
  move: (from, to) => rename3(from, to),
  lock: (path, fn) => withLock(`${path}.lock`, fn)
};
function codexCommandStore(dir, sessionId, now, onChange) {
  return fileCommandStore(
    files,
    commandsPath(dir, sessionId),
    { runner: RUNNER, isRunning },
    {
      now,
      log: herdrLog(dir),
      onChange
    }
  );
}

// src/host.ts
import { mkdir as mkdir5, rename as rename6, rm as rm4, writeFile as writeFile6 } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname3, join as join8 } from "node:path";
import { fileURLToPath } from "node:url";

// src/state.ts
import { readFile as readFile3, readdir as readdir2, rename as rename4, stat as stat2, unlink as unlink2, writeFile as writeFile4 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join6 } from "node:path";

// ../core/domain/session-version.ts
var SESSION_VERSION = 1;
function checkVersion(saved) {
  const version = saved.version ?? 1;
  if (version !== SESSION_VERSION) throw new Error(`Unsupported inbox state version: ${version}`);
}

// ../core/domain/question-history.ts
var HISTORY_VERSION = 1;
var DAY_MS3 = 24 * 60 * 6e4;
var HISTORY_KEEP_MS = 180 * DAY_MS3;
var BASELINE_MS = 7 * DAY_MS3;
var ROW_MEASUREMENT_MS = 21 * DAY_MS3;
var NOT_AN_ANSWER2 = new RegExp(`^(?:done:|fix sent for |(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES}))`, "i");
function historyFileName(host, session) {
  return `${host}-${session.replace(/[^\w.-]/g, "_")}.json`;
}
function isAnswer(c) {
  if (c.kind !== "question") return false;
  if (c.how === "answered") return true;
  return c.how === "update" && !NOT_AN_ANSWER2.test(c.outcome.trim());
}
var keyOf2 = (q) => `${q.id}@${q.askedAt ?? ""}`;
var sameAnswer = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
function questionHistory(previous, s, place, now) {
  const answered = s.ledger.closed.filter(isAnswer).map((c) => ({
    id: c.id,
    ask: c.ask,
    options: c.item?.options ?? [],
    askedAt: c.item?.at ?? null,
    answer: c.outcome,
    answeredAt: c.at,
    how: c.how,
    isAfterReply: c.how === "update" && s.lastActions[c.id]?.action === "type",
    earlier: c.item?.earlier ?? null,
    isAnsweredWithEarlier: c.item?.earlier ? sameAnswer(c.outcome, c.item.earlier.answer) : false
  }));
  const open2 = new Set(s.ledger.items.map((i) => keyOf2({ id: i.id, askedAt: i.at })));
  const byKey = new Map((previous?.questions ?? []).map((q) => [keyOf2(q), q]));
  for (const q of answered) byKey.set(keyOf2(q), q);
  const questions = [...byKey.values()].filter((q) => !open2.has(keyOf2(q)) && now - q.answeredAt <= HISTORY_KEEP_MS).sort((a, b) => a.answeredAt - b.answeredAt);
  return {
    version: HISTORY_VERSION,
    host: place.host,
    session: place.session,
    repo: place.repo ?? previous?.repo ?? null,
    created: previous?.created ?? now,
    savedAt: now,
    questions
  };
}
function isHistoryChanged(previous, next) {
  if (!previous) return next.questions.length > 0;
  const said = (f) => JSON.stringify([f.repo, f.questions]);
  return said(previous) !== said(next);
}
function upgradeHistoryFile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const f = raw;
  if (f.version !== HISTORY_VERSION || !Array.isArray(f.questions) || typeof f.session !== "string") return null;
  return f;
}
function historyDocs(files2, now) {
  return files2.flatMap(
    (f) => f.questions.filter((q) => now - q.answeredAt <= HISTORY_KEEP_MS).map((q) => ({
      key: answerKey(f.host, f.session, q.id),
      ask: q.ask,
      answer: q.answer,
      at: q.answeredAt,
      repo: f.repo
    }))
  );
}
function answerKey(host, session, id) {
  return `${host}:${session}:${id}`;
}
function historyStart(files2, now) {
  return files2.reduce((start, f) => Math.min(start, f.created), now);
}
function isEarlierShown(start, now) {
  return now - start >= BASELINE_MS;
}
function inboxStateFolder(env) {
  const state = env.XDG_STATE_HOME?.trim() || (env.HOME?.trim() ? `${env.HOME.trim()}/.local/state` : "");
  return state ? `${state.replace(/\/+$/, "")}/inbox` : null;
}
function historyFolder(env) {
  const inbox = inboxStateFolder(env);
  return inbox ? `${inbox}/questions` : null;
}

// ../core/runtime/history-store.ts
var caches = /* @__PURE__ */ new Map();
var repos = /* @__PURE__ */ new Map();
function cacheOf(folder) {
  const known = caches.get(folder);
  if (known) return known;
  const made = { files: /* @__PURE__ */ new Map(), index: null, isSeeded: false };
  caches.set(folder, made);
  return made;
}
var parsed = (text2) => {
  try {
    return upgradeHistoryFile(JSON.parse(text2));
  } catch {
    return null;
  }
};
async function readHistory(place) {
  const cache = cacheOf(place.folder);
  const listed = (await place.fs.list(place.folder)).filter((e) => e.name.endsWith(".json"));
  const names = new Set(listed.map((e) => e.name));
  for (const name of cache.files.keys()) if (!names.has(name)) cache.files.delete(name);
  await Promise.all(
    listed.map(async (e) => {
      if (cache.files.get(e.name)?.mtimeMs === e.mtimeMs) return;
      const text2 = await place.fs.read(`${place.folder}/${e.name}`).catch(() => null);
      cache.files.set(e.name, { mtimeMs: e.mtimeMs, file: text2 === null ? null : parsed(text2) });
    })
  );
  return [...cache.files.values()].flatMap((x) => x.file ? [x.file] : []);
}
var DAY_MS4 = 24 * 60 * 6e4;
function indexOf(place, files2, now) {
  const cache = cacheOf(place.folder);
  const fileTimes = [...cache.files.entries()].map(([name, x]) => `${name}@${x.mtimeMs}`);
  const said = [Math.floor(now / DAY_MS4), ...fileTimes].join("|");
  if (cache.index?.said === said) return cache.index.index;
  const index = answerIndex(historyDocs(files2, now));
  cache.index = { said, index };
  return index;
}
var parentOf = (path) => path.replace(/\/+[^/]*\/*$/, "") || "/";
var baseName2 = (path) => path.replace(/\/+$/, "").split("/").pop() ?? "";
function resolved(from, to) {
  if (to.startsWith("/")) return to;
  const parts = from.split("/");
  for (const part of to.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/") || "/";
}
function repoName(fs, folder) {
  const known = repos.get(folder);
  if (known) return known;
  const found = findRepo(fs, folder).catch(() => null);
  repos.set(folder, found);
  return found;
}
async function findRepo(fs, folder) {
  let dir = folder.replace(/\/+$/, "");
  for (let depth = 0; depth < 40 && dir; depth++) {
    const link = await fs.read(`${dir}/.git`).catch(() => null);
    const gitdir = link?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
    if (gitdir) {
      const linked = resolved(dir, gitdir);
      const common = await fs.read(`${linked}/commondir`).catch(() => null);
      const root = common ? resolved(linked, common.trim()) : linked;
      return baseName2(root) === ".git" ? baseName2(parentOf(root)) : baseName2(root).replace(/\.git$/, "");
    }
    if (await fs.read(`${dir}/.git/HEAD`).catch(() => null) !== null) return baseName2(dir);
    const up = parentOf(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
async function writeHistory(place, id, s, now) {
  const path = `${place.folder}/${historyFileName(place.host, id)}`;
  const previous = parsed(await place.fs.read(path).catch(() => ""));
  const isNothingToWrite = !previous && !s.ledger.closed.some((c) => c.item?.kind === "question");
  if (isNothingToWrite) return;
  const repo = s.place?.folder ? await repoName(place.fs, s.place.folder) : null;
  const next = questionHistory(previous, s, { host: place.host, session: id, repo }, now);
  if (isHistoryChanged(previous, next)) await place.fs.write(path, JSON.stringify(next));
}
async function seeded(place, now) {
  const cache = cacheOf(place.folder);
  if (cache.isSeeded) return;
  const listed = await place.fs.list(place.folder);
  if (!listed.some((e) => e.name.startsWith(`${place.host}-`)))
    for (const { id, session } of await place.keptSessions()) await writeHistory(place, id, session, now);
  cache.isSeeded = true;
}
function addedQuestions(before, after) {
  const known = new Set([...before.ledger.items, ...before.ledger.closed].map((x) => x.id));
  return after.ledger.items.filter((i) => i.kind === "question" && !i.earlier && !known.has(i.id));
}
function isHistoryStepNeeded(before, after) {
  return before.ledger.closed !== after.ledger.closed || addedQuestions(before, after).length > 0;
}
async function historyStep(place, id, before, after, now) {
  if (!place || !isHistoryStepNeeded(before, after)) return after;
  const added = addedQuestions(before, after);
  const isClosedChanged = before.ledger.closed !== after.ledger.closed;
  await seeded(place, now).catch(() => void 0);
  const tagged = added.length > 0 ? await withEarlier(place, id, after, added, now).catch(() => after) : after;
  if (isClosedChanged) await writeHistory(place, id, tagged, now).catch(() => void 0);
  return tagged;
}
async function withEarlier(place, id, s, added, now) {
  const files2 = await readHistory(place);
  const index = indexOf(place, files2, now);
  const isShown = isEarlierShown(historyStart(files2, now), now);
  const matches = new Map(
    added.flatMap((item) => {
      const match = bestEarlier(index, item, answerKey(place.host, id, item.id));
      return match ? [[item.id, earlierOf(match, isShown)]] : [];
    })
  );
  if (matches.size === 0) return s;
  const items = s.ledger.items.map((i) => matches.has(i.id) ? { ...i, earlier: matches.get(i.id) } : i);
  return { ...s, ledger: { ...s.ledger, items } };
}

// src/diagnostics.ts
var DIAGNOSTIC_CHARS = 2e3;
var ANSI_STYLE = /\x1b\[[0-9;]*m/g;
var TIME = String.raw`^(?:\[[^\]]*\]\s*)?(?:\d{4}-\d\d-\d\dT\S*\s+)?`;
var DIAGNOSTIC = new RegExp(
  `${TIME}(?:(?:ERROR|WARNING|error|warning):|(?:ERROR|WARN)\\s|Unknown feature flag: |[\\w ]*stream error:)`
);
function diagnosticLines(stderr) {
  return stderr.split("\n").map((line) => line.replace(ANSI_STYLE, "").trimEnd()).filter((line) => DIAGNOSTIC.test(line)).join("\n").slice(-DIAGNOSTIC_CHARS);
}

// src/state.ts
function withSavedFailure(saved) {
  const f = saved.lastModelFailure;
  if (!f) return NO_CALL_FAILURES;
  const call = f.call ?? "ledger";
  const isLedgerFailing = saved.presence?.ledgerState === "failed" || (saved.pending ?? []).some((p) => p.failed);
  const isFailing = call === "ledger" ? isLedgerFailing : Boolean(saved.overviewFailure);
  return { ...NO_CALL_FAILURES, [call]: { lastFailure: callFailureOf(f), recoveredAt: isFailing ? null : f.at } };
}
function callFailureOf(f) {
  return {
    at: f.at,
    call: f.call ?? null,
    reads: f.reads ?? null,
    isRetry: f.isRetry ?? null,
    cause: f.code === 0 ? "no-reply" : "process",
    model: null,
    error: null,
    answerChars: null,
    ms: f.elapsedMs ?? null,
    process: {
      cli: f.cli,
      code: f.code,
      stderr: diagnosticLines(f.stderr),
      signal: f.signal ?? null,
      errorCode: f.errorCode ?? null,
      timeoutMs: f.timeoutMs ?? null
    }
  };
}
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
    ...emptySession(),
    tabSeenAt: 0,
    lookRows: {},
    shownTab: "needsYou",
    heard: NOTHING_HEARD,
    coveredTurn: null,
    openCatchUpKey: null,
    delegateCalls: []
  };
}
function isPrFetchRunning(s) {
  if (s.prFetchPid === void 0) return false;
  try {
    process.kill(s.prFetchPid, 0);
    return true;
  } catch (err) {
    return err.code !== "ESRCH";
  }
}
function statePath(dir, sessionId) {
  return join6(dir, "sessions", sessionFile(sessionId));
}
function upgraded(saved, sessionId) {
  checkVersion(saved);
  const base = emptyState(sessionId);
  const {
    lastModelFailure: _modelFailure,
    checks: _checks,
    snapshots: _snapshots,
    recordedRuns: _runs,
    top: _top,
    subagents: _subagents,
    remoteViewers: _viewers,
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
    ...saved.callFailures ? {} : { callFailures: withSavedFailure(saved) },
    coveredTurn: saved.coveredTurn !== void 0 ? saved.coveredTurn : coveredBefore(heard, turn.person ?? null)
  };
}
function coveredBefore(heard, person) {
  return heard.promptTurns.at(person === null ? -1 : -2) ?? null;
}
async function readSaved(dir, sessionId) {
  const saved = await readFile3(statePath(dir, sessionId), "utf8").catch(missingAsNull);
  return saved === null ? { state: emptyState(sessionId), isSaved: false } : { state: upgraded(JSON.parse(saved), sessionId), isSaved: true };
}
async function readState(dir, sessionId) {
  return (await readSaved(dir, sessionId)).state;
}
var questionHistory2 = null;
function useQuestionHistory(place) {
  questionHistory2 = place;
}
async function updateState(dir, sessionId, change, now = Date.now) {
  const path = statePath(dir, sessionId);
  return withLock(`${path}.lock`, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId);
    const changed = await historyStep(questionHistory2, sessionId, current, await change(current), Date.now());
    if (isSaved && changed === current) return current;
    const commands = codexCommandStore(dir, sessionId, now);
    const log = herdrLog(dir);
    const next = await movedLegacyCommands(
      commands,
      pruned(changed, now(), (await readViewers(dir, sessionId)).leases),
      log
    );
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile4(tmp, JSON.stringify(next));
    await rename4(tmp, path);
    await followCommandRows(commands, commandsPath(dir, sessionId), next, log);
    return next;
  });
}

// ../core/runtime/session-turns.ts
function parsedReply(ex, reply) {
  return reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join("\n"));
}
function applied(s, parsed3, now, promptAt, isDelegate) {
  const next = s.pending[0];
  if (!next) return s;
  const { ex } = next;
  if (!parsed3 && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: "failed", failedAttempts: s.presence.failedAttempts + 1 }
    };
  const update = parsed3 && isDelegate ? withoutNewAsks(parsed3) : parsed3;
  const ledger = update ? applyExchangeUpdate(s.ledger, update, ex, now, promptAt) : s.ledger;
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed3;
  const isCurrent = !hasDroppedReply;
  const failedAttempts = parsed3 ? s.presence.failedAttempts : s.presence.failedAttempts + 1;
  return linkDialogs({
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: isCurrent ? "current" : "failed",
      hasDroppedReply,
      failedAttempts: isCurrent ? 0 : failedAttempts,
      isConversationUnreadable: isCurrent ? false : s.presence.isConversationUnreadable,
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted)
    }
  });
}

// ../core/domain/status-ops.ts
function namesAny(subjects, description) {
  const said = words(description);
  return subjects.some((s) => {
    const name = [...words(s.name)];
    return name.length > 0 && name.every((w) => said.has(w));
  });
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
  const asked = new Set(Object.values(o.askSubjects).flat());
  const isWorkedOn = (s) => o.children.some((c) => c.subjectId === s.id && isChildRunning(c, now));
  const isHeld = (s) => isOpen(s) && (asked.has(s.id) || isWorkedOn(s));
  const isNothingUnderWay = !o.subjects.some((s) => isUnderWay(s) || isHeld(s));
  return {
    isEarlierWorkFinished: isUnderWayWorkClosed && !isClosedWorkNew,
    isWorkUnderWay: o.subjects.some(
      (s) => s.status === "working" || s.status === "waits-on-other" && s.changedAt === now
    ),
    isNothingUnderWay,
    isOpenWorkClosed: closed.some((s) => was.has(s.id)),
    isUnderWayWorkClosed,
    isClosedWorkNew,
    namesClosed: (description) => namesAny(closed, description),
    namesFinished: (description) => namesAny(
      o.subjects.filter((s) => !isOpen(s)),
      description
    )
  };
}
function isDescriptionStale(head, isTitleKept, work) {
  if (head === null || head.description === "") return false;
  if (!work.isNothingUnderWay) return isTitleKept && work.namesClosed(head.description);
  const isHeadWorkClosed = isTitleKept ? work.isOpenWorkClosed : work.isUnderWayWorkClosed || work.isClosedWorkNew;
  return isHeadWorkClosed || work.namesFinished(head.description);
}
function headAfter(last, op, work) {
  const line = { title: clipWords(op.title, NAME_KEPT), description: clipWords(op.description, DESCRIPTION_KEPT) };
  if (last === null) return line;
  const isIdleSameTitle = work.isNothingUnderWay && hasSameWords(last.title, op.title);
  if (isIdleSameTitle && (last.description === "" || work.isOpenWorkClosed)) return last;
  if (last.description === "") return line;
  const isQueuedWorkNext = work.isEarlierWorkFinished && !work.isWorkUnderWay;
  if (isQueuedWorkNext) return last;
  if (!hasSameWords(last.title, op.title)) return line;
  const isSameDescription = line.description === "" || hasSameWords(last.description, line.description);
  return isSameDescription ? last : { title: last.title, description: line.description };
}
var OP_ORDER = {
  none: 0,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  goal: 1,
  retire: 1,
  milestone: 2,
  head: 3,
  was: 3,
  link: 4,
  serves: 4,
  next: 4,
  suggest: 4
};
function applyOps(last, ops, now, askIds, readSetAt = last?.goal?.setAt ?? null) {
  let o = {
    ...last ?? EMPTY_SESSION_STATUS,
    subjects: (last?.subjects ?? []).map((s) => ({ ...s })),
    children: (last?.children ?? []).map((c) => ({ ...c })),
    milestones: (last?.milestones ?? []).map((m) => ({ ...m })),
    serves: { ...last?.serves },
    askSubjects: Object.fromEntries(Object.entries(last?.askSubjects ?? {}).filter(([ask]) => askIds.has(ask))),
    goalRefused: null
  };
  const closedHere = /* @__PURE__ */ new Set();
  const find = (ref) => findSubject(o.subjects, ref);
  const closedUnseen = (name) => {
    const key = nameKey(clipWords(name, NAME_KEPT));
    return o.subjects.findLast(
      (s) => !isOpen(s) && !closedHere.has(s.id) && !isSubjectSeen(o, s) && nameKey(s.name) === key
    ) ?? null;
  };
  const forgetSeenWas2 = (s) => {
    if (isSubjectSeen(o, s)) {
      s.was = null;
      s.merged = null;
    }
  };
  const unfold = (s) => {
    const target = s.into === null ? void 0 : o.subjects.find((x) => x.id === s.into);
    if (target?.merged)
      target.merged = target.merged.split(", ").filter((name) => name !== s.name).join(", ") || null;
    s.into = null;
  };
  const set = (s, status, text2) => {
    const isUnchanged2 = s.status === status && hasSameWords(s.text, text2);
    const isIdle = now - s.changedAt >= IDLE_AFTER_MS;
    const isWorkResumed = status === "working" && isIdle;
    if (isUnchanged2 && !isWorkResumed) {
      if (isIdle && isUnderWay(s)) s.keptAt = now;
      return;
    }
    s.status = status;
    s.text = clipWords(text2, TEXT_KEPT);
    s.closedAt = null;
    unfold(s);
    forgetSeenWas2(s);
    s.changedAt = now;
  };
  const named = /* @__PURE__ */ new Map();
  let nextRef = null;
  const markNamed = (m, line) => {
    if (m) named.set(m.id, Math.min(line, named.get(m.id) ?? Infinity));
  };
  const servesLines = ops.flatMap((op) => op.kind === "serves" ? [op] : []);
  const ordered = withRestatedGoalAsMilestones(last, ops, readSetAt).map((op, n) => ({ op, n })).sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n);
  for (const { op, n } of ordered) {
    if (op.kind === "none" || op.kind === "suggest") continue;
    if (op.kind === "next") {
      markNamed(findMilestone(o, op.ref), n);
      nextRef = op.ref;
      continue;
    }
    if (op.kind === "goal" || op.kind === "retire" || op.kind === "milestone" || op.kind === "serves") {
      o = applyGoalOp(o, op, now, find, askIds, last ?? o, servesLines);
      if (op.kind === "milestone") markNamed(findMilestone(o, op.name), n);
      if (op.kind === "serves" && op.milestone !== null) markNamed(findMilestone(o, op.milestone), n);
    } else if (op.kind === "head") {
      if (!isNumberOnly(op.title)) o.head = headAfter(o.head, op, answerWork(last?.subjects ?? [], o, now));
    } else if (op.kind === "link") {
      const child = o.children.find((c) => c.id === op.ref);
      const subject = find(op.subject);
      const milestone = subject ? null : linkableMilestone(o, op.subject);
      const linked = subject ?? milestone;
      if (child && subject) child.subjectId = subject.id;
      else if (linked && askIds.has(op.ref)) o.askSubjects[op.ref] = linksWith(o.askSubjects[op.ref] ?? [], linked.id);
      markNamed(milestone, n);
    } else if (op.kind === "new") {
      if (isNumberOnly(op.name)) continue;
      const known = find(op.name);
      const repeated = known && isOpen(known) ? known : closedUnseen(op.name);
      if (repeated) {
        set(repeated, op.status, op.text);
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
      const milestone = s ? null : findMilestone(o, op.ref);
      if (milestone) moveMilestone(o, milestone, op, now);
      markNamed(milestone, n);
      if (!s) continue;
      if (op.kind === "set") set(s, op.status, op.text);
      else if (op.kind === "done") {
        if (s.status === "done") continue;
        s.status = "done";
        unfold(s);
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT);
        forgetSeenWas2(s);
        s.closedAt = now;
        s.changedAt = now;
        closedHere.add(s.id);
      } else if (op.kind === "drop") {
        const target = op.into ? find(op.into) : null;
        unfold(s);
        s.status = "dropped";
        s.text = clipWords(op.why, TEXT_KEPT);
        s.closedAt = now;
        s.into = target && target.id !== s.id ? target.id : null;
        s.changedAt = now;
        closedHere.add(s.id);
        if (target && s.into) {
          forgetSeenWas2(target);
          target.merged = target.merged ? `${target.merged}, ${s.name}` : s.name;
          target.changedAt = now;
          for (const [ask, ids] of Object.entries(o.askSubjects))
            if (ids.includes(s.id)) o.askSubjects[ask] = linksWith(ids, target.id).filter((id) => id !== s.id);
        }
      } else {
        forgetSeenWas2(s);
        s.was = op.text;
        s.changedAt = now;
      }
    }
  }
  const isTitleKept = !!o.head && !!last?.head && o.head.title === last.head.title;
  if (o.head && isDescriptionStale(o.head, isTitleKept, answerWork(last?.subjects ?? [], o, now)))
    o = { ...o, head: { ...o.head, description: "" } };
  const settled = settleGoal(o, now, readSetAt, named, askIds, last ?? o);
  return withSuggestion(nextRef === null ? settled : withNextMilestone(settled, nextRef, now), ops);
}
function applyStatus(last, answer, now, askIds, readSetAt = last?.goal?.setAt ?? null) {
  const isNoSuggestionOnly = answer.kind === "ops" && (last?.suggestedGoal ?? null) === null && answer.ops.every((op) => op.kind === "suggest" && op.text === null);
  const changes = answer.kind === "ops" && !isNoSuggestionOnly ? answer.ops : null;
  const read = last?.goalRefused ? { ...last, goalRefused: null } : last;
  const o = changes ? applyOps(last, changes, now, askIds, readSetAt) : read;
  if (o === null) return null;
  const settled = changes ? o : settleGoal(o, now, readSetAt, /* @__PURE__ */ new Map(), askIds, o);
  const isRemovedRead = settled.goalRemoved !== null && settled.goalRemoved.goal.setAt === readSetAt;
  const kept = settled.goalRemoved === null || isRemovedRead ? settled : { ...settled, goalRemoved: null };
  return withNoGoalNoted(kept, answer, askIds);
}

// ../core/runtime/session-status.ts
function isStatusCallCurrent(s, appliedAfter) {
  return s.presence.turnsApplied >= appliedAfter && s.overviewTurn <= appliedAfter;
}
function appliedStatus(s, answer, appliedAfter, now, readSetAt = s.ledger.overview?.goal?.setAt ?? null, isCatchUp = false, readAt = now) {
  if (!isStatusCallCurrent(s, appliedAfter)) return s;
  const applied2 = applyStatus(s.ledger.overview, answer, now, new Set(s.ledger.items.map((i) => i.id)), readSetAt);
  return {
    ...s,
    ledger: { ...s.ledger, overview: applied2 && { ...applied2, lastCallReadAt: readAt } },
    overviewFailure: isCatchUp ? null : s.overviewFailure,
    lastOverviewCallAt: now,
    overviewTurn: appliedAfter
  };
}
var REFUSED_ANSWER_CHARS = 500;
function failedStatus(s, text2, appliedAfter, now, isCatchUp = false) {
  if (!isStatusCallCurrent(s, appliedAfter)) return s;
  const before = s.overviewFailure;
  const tries = isCatchUp ? { catchUpsFailed: (before?.catchUpsFailed ?? 0) + 1, catchUpTurn: s.presence.turnsStarted } : before?.catchUpsFailed ? { catchUpsFailed: before.catchUpsFailed, catchUpTurn: before.catchUpTurn ?? 0 } : {};
  const failure = text2 === null ? { at: now, cause: "no-answer", answer: null, ...tries } : { at: now, cause: "refused", answer: text2.slice(0, REFUSED_ANSWER_CHARS), ...tries };
  return { ...s, overviewFailure: failure, lastOverviewCallAt: now, overviewTurn: appliedAfter };
}
var STATUS_REFRESH_MS = 10 * 6e4;
function needsCatchUp(s) {
  const { presence } = s;
  const hasUnappliedTurn = s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied;
  const failure = s.overviewFailure;
  const isStatusCatchUpDue = failure !== null && (!failure.catchUpsFailed || presence.turnsStarted - (failure.catchUpTurn ?? 0) >= 2 ** failure.catchUpsFailed);
  const hasMissedStatus = isStatusCatchUpDue && (s.pending.length > 0 || hasUnappliedTurn);
  return presence.ledgerState !== "current" || hasUnappliedTurn || hasMissedStatus;
}
var pendingKey = (p) => `${p.turnsStarted}:${p.ex.turn}`;
function appliedCatchUp(s, begun, parsed3, now, isDelegate) {
  const covered = new Set(begun.pending.map(pendingKey));
  const update = parsed3 && isDelegate ? withoutNewAsks(parsed3) : parsed3;
  return linkDialogs({
    ...s,
    ledger: update ? applyUpdate(s.ledger, update, now, s.ledger.turn, now) : s.ledger,
    pending: s.pending.filter((p) => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed3 ? "current" : "failed",
      hasDroppedReply: parsed3 ? false : s.presence.hasDroppedReply,
      failedAttempts: parsed3 ? 0 : s.presence.failedAttempts + 1,
      isConversationUnreadable: false,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted)
    }
  });
}

// src/settle.ts
var POLL_MS = 3e3;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// src/texts.ts
var CODEX2 = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Finds section of the Inbox tab",
  prsIn: "the PRs section of the Inbox tab",
  recordTool: "mcp__inbox__record",
  closeTool: "mcp__inbox__close",
  splitsPlanIntoSubjects: true,
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
function viewOf(s, now, holds = NO_HOLDS, inputs = NO_SYNC_INPUTS) {
  return { ...sessionView(s, now, SETTLE_WINDOW_MS, holds, {}, false, inputs), heard: heardState(s.heard), at: now };
}

// ../core/view/band.ts
function isMaybeStale(ledger) {
  return ledger.is === "stale" || ledger.is === "unavailable";
}
function bandCounts(view) {
  return ROW_TABS.map((t) => ({ id: t.id, label: t.label, count: view[t.id].count })).filter((c) => c.count > 0);
}

// ../core/domain/children.ts
var HERDR2 = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g;
function delegateSteps(command) {
  return [...command.matchAll(HERDR2)].map(([, verb, name, args]) => ({
    name,
    isPrompt: verb === "prompt",
    isWaitForEnd: verb === "wait" && !/--until working/.test(args ?? "")
  }));
}
var delegateRef = (name) => `herdr:${name}`;
function delegateRefs(command) {
  return new Set(delegateSteps(command).map((step) => delegateRef(step.name)));
}

// ../core/remote/hc-terminals.ts
var HC_TIMEOUT_MS = 5e3;
async function delegateSession(target, run2) {
  if (target?.kind !== "terminal") return null;
  for (const hc of target.hc) {
    const r = await run2([hc, "get", target.terminal, "--json"], { cwd: "/", timeoutMs: HC_TIMEOUT_MS });
    if (r.code === UNSTARTABLE_CODE) continue;
    if (r.code !== 0) return null;
    try {
      const t = JSON.parse(r.stdout);
      const parent = typeof t?.parent === "string" && t.parent.trim() ? t.parent.trim() : null;
      const domain = t?.labels?.["fleet.domain"];
      const hasDomain = typeof domain === "string" && domain.trim() !== "";
      const isCoordinator = t?.labels?.["fleet.role"] === "coordinator";
      return !isCoordinator && (parent !== null || hasDomain) ? { parent } : null;
    } catch {
      return null;
    }
  }
  return null;
}
function delegateReader(target, run2) {
  return () => delegateSession(target, run2).catch(() => null);
}

// ../core/remote/herdr-labels.ts
var SESSION_LABEL = "inbox.session";

// ../core/view/dialog-row.ts
function dialogTitle(dialog) {
  return drawableText(dialog.kind === "permission" ? `Allow ${dialog.text}?` : dialog.text);
}

// ../core/remote/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var HERDR_VALUE_CHARS = 80;
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null])
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
function statusLine(stop, dialogs, input) {
  if (stop) return stopLine(stop);
  const dialog = dialogs[0];
  if (dialog) return dialogTitle(dialog);
  const { firstAsk, asks, findings, focus, stale } = input;
  if (firstAsk !== null) return asks > 1 ? `${asks} \xB7 ${firstAsk}` : firstAsk;
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? "" : "s"}`;
  return [stale, focus, findingsText].filter(Boolean).join(" \xB7 ");
}
function focusOf(head) {
  return head ? drawableText(head.description || head.title) : null;
}
function herdrTokens(ledger, stop, view, dialogs) {
  const input = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    focus: focusOf(ledger.overview?.head ?? null),
    stale: bandCounts(view).length === 0 && isMaybeStale(view.sync.ledger) ? MAYBE_STALE_TEXT : null
  };
  const focus = input.focus ? clipLabel(input.focus, HERDR_VALUE_CHARS) : null;
  const counts = ROW_TABS.map((t) => {
    const count = view[t.id].count;
    return [COUNT_TOKENS[t.id], stop || count === 0 ? null : String(count)];
  });
  return {
    [STATUS_TOKEN]: statusLine(stop, dialogs, input) || null,
    [STOP_TOKEN]: stop ? stopLine(stop) : null,
    [FOCUS_TOKEN]: focus,
    ...Object.fromEntries(counts)
  };
}
function paneReport(pane, tokens, seq) {
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
function reportCommand(r, hc = "hc") {
  if (r.target.kind === "pane") return paneReport(r.target.pane, r.tokens, r.seq);
  const labels = { [SESSION_LABEL]: r.session ?? "", ...herdrLabels(r.tokens) };
  return [
    hc,
    "label",
    r.target.terminal,
    ...Object.entries(labels).map(([name, value]) => `${name}=${value.replace(new RegExp("\\p{Cc}", "gu"), " ")}`)
  ];
}
function herdrReportKey(r) {
  return reportCommand({ ...r, seq: void 0 }).join("\n");
}
var HERDR_RETRY_MS = [5e3, 3e4, 12e4];
function herdrReporter(log) {
  let sent = null;
  let isFinished = false;
  let retries = 0;
  let isRetryWaiting = false;
  let sending = Promise.resolve();
  let newest = null;
  let hcFound = null;
  let logged = null;
  const runReport = async (run2, r) => {
    const options = { cwd: "/", timeoutMs: HERDR_TIMEOUT_MS };
    if (r.target.kind === "pane") return run2(reportCommand(r), options);
    for (const hc of hcFound ? [hcFound] : r.target.hc) {
      const result = await run2(reportCommand(r, hc), options);
      if (result.code === UNSTARTABLE_CODE) continue;
      hcFound = hc;
      return result;
    }
    return null;
  };
  const retryLater = (after) => {
    const wait = HERDR_RETRY_MS[retries];
    if (!after || isRetryWaiting || wait === void 0) return;
    isRetryWaiting = true;
    retries++;
    after(wait, () => {
      isRetryWaiting = false;
      return newest ? reportToHerdr(newest.run, newest.report, newest.after, newest.isFinal) : Promise.resolve(false);
    });
  };
  const send = async (run2, report, after, isFinal) => {
    if (isFinished && !isFinal) return false;
    const r = await report();
    if (!r || isFinished && !isFinal) return false;
    const key = herdrReportKey(r);
    if (key === sent) return true;
    sent = null;
    const result = await runReport(run2, r).catch(() => null);
    const isTaken = result?.code === 0;
    const problem = isTaken ? null : reportProblem(r, result);
    if (problem && problem !== logged) log?.(problem);
    logged = problem;
    if (isTaken) {
      sent = key;
      retries = 0;
    } else retryLater(after);
    return isTaken;
  };
  const reportToHerdr = (run2, report, after, isFinal = false) => {
    newest = { run: run2, report, after, isFinal };
    if (isFinal) isFinished = true;
    const result = (isFinal ? send(run2, report, after, true) : sending.then(() => send(run2, report, after, false))).catch(() => false);
    sending = result;
    return result;
  };
  return reportToHerdr;
}
function reportProblem(r, result) {
  if (!result && r.target.kind === "terminal")
    return `Herdr labels not set: no hc started. Tried ${r.target.hc.join(", then ")}.`;
  if (!result) return "Herdr report did not run.";
  const why = result.stderr.trim();
  return `Herdr report failed with exit ${result.code}${why ? `: ${why}` : "."}`;
}
function herdrAppHome(env) {
  const home = env.HOME?.startsWith("/") ? env.HOME : null;
  const named = env.HERDR_APP_HOME;
  return named ? named.startsWith("/") ? named : null : home && `${home}/.config/herdr-app`;
}
function herdrTarget(env) {
  const pane = env.HERDR_PANE_ID;
  if (pane) return { kind: "pane", pane };
  const terminal = env.HC_TERMINAL_ID;
  if (!terminal) return null;
  const home = env.HOME?.startsWith("/") ? env.HOME : null;
  const appHome = herdrAppHome(env);
  const installed = (name) => home ? [name, `${home}/.local/bin/${name}`] : [name];
  return { kind: "terminal", terminal, appHome, hc: installed("hc"), herdrApp: installed("herdr-app") };
}
function herdrLabels(tokens) {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => [
      name === STATUS_TOKEN ? "inbox.status" : name.replace(/^inbox-/, "inbox."),
      value ?? ""
    ])
  );
}
var HERDR_FORMAT = 1;
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

// ../core/view/session-presentation.ts
var SESSION_FIELDS = Object.keys(emptySession()).filter(
  (field) => field !== "remoteCommandFloor" && field !== "commandWrite" && field !== "lastAnswers"
);
function presentedSession(session) {
  return Object.fromEntries(SESSION_FIELDS.map((field) => [field, session[field]]));
}

// ../core/remote/herdr-envelope.ts
function herdrEnvelope(source, session, isTrimmed = false) {
  const shared = presentedSession(session);
  const { lastHerdrPress } = session;
  const { projectFolder, isFetchingPrs, isReadFailed, isNextBuild, ...rest } = source;
  return {
    format: HERDR_FORMAT,
    ...rest,
    ...projectFolder?.startsWith("/") && { projectFolder },
    ...isTrimmed && { trimmed: true },
    ...isFetchingPrs && { isFetchingPrs: true },
    ...isReadFailed && { isReadFailed: true },
    ...isNextBuild && { isNextBuild: true },
    ...lastHerdrPress && { lastPress: lastHerdrPress },
    session: shared
  };
}

// ../core/remote/herdr-app.ts
var PRESS_FILE_LIMIT_BYTES = 64 * 1024;
var PUBLISH_LIMIT_BYTES = 1024 * 1024;
function utf8Bytes(text2) {
  let bytes = 0;
  for (const char of text2) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return bytes;
}
var isOverLimit = (text2) => text2.length * 3 > PUBLISH_LIMIT_BYTES && utf8Bytes(text2) > PUBLISH_LIMIT_BYTES;
function withoutFoldedClosed(s, now, viewers) {
  const inPlace = rowsInPlace(s, now, viewers);
  const { closed, closedFindings } = s.ledger;
  return {
    ...s,
    ledger: {
      ...s.ledger,
      closed: closed.filter((c) => inPlace.has(c.id)),
      closedFindings: closedFindings.filter((f) => inPlace.has(f.id))
    }
  };
}
function publishedText(source, session, log) {
  const text2 = JSON.stringify(herdrEnvelope(source, session));
  if (!isOverLimit(text2)) return text2;
  const trimmed = JSON.stringify(
    herdrEnvelope(source, withoutFoldedClosed(session, source.writtenAt, source.viewers), true)
  );
  if (isOverLimit(trimmed))
    log(`Herdr publish is over ${PUBLISH_LIMIT_BYTES} bytes after trimming, so the look cannot read it`);
  return trimmed;
}
async function publishSession(files2, appHome, source, session, log) {
  const path = publishedSessionPath(appHome, source.sessionId);
  const temporary = `${path}.${source.writtenAt}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await files2.write(temporary, publishedText(source, session, log));
    await files2.move(temporary, path);
  } catch (err) {
    await files2.remove(temporary).catch(() => void 0);
    throw err;
  }
}
function publishedSession(files2, appHome, source, session, log) {
  if (!appHome) return Promise.resolve(false);
  return publishSession(files2, appHome, source, session, log).then(
    () => true,
    (err) => {
      log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  );
}
async function unpublishSession(files2, appHome, sessionId) {
  await Promise.all([
    files2.remove(publishedSessionPath(appHome, sessionId)),
    files2.removeFolder(pressFolder(appHome, sessionId))
  ]);
}

// src/herdr-terminal.ts
import { mkdir as mkdir4, readdir as readdir3, readFile as readFile4, rename as rename5, rm as rm3, writeFile as writeFile5 } from "node:fs/promises";
import { join as join7 } from "node:path";

// ../core/remote/herdr-sweep.ts
var SWEEP_AFTER_MS = 24 * 60 * 60 * 1e3;
var LIST_REQUEST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "terminal.list", params: {} });

// src/herdr-terminal.ts
var claimPath = (dir, terminal) => join7(dir, "herdr-terminals", `${encodeURIComponent(terminal)}.json`);
var isPid = (value) => value === null || Number.isSafeInteger(value);
async function readClaim(dir, terminal) {
  const text2 = await readFile4(claimPath(dir, terminal), "utf8").catch(() => null);
  try {
    const c = JSON.parse(text2 ?? "null");
    const isClaim = typeof c?.sessionId === "string" && isPid(c.pid) && typeof c.isEnded === "boolean";
    return isClaim ? { sessionId: c.sessionId, pid: c.pid, isEnded: c.isEnded } : null;
  } catch {
    return null;
  }
}
var hasLeft = (claim, isRunning2) => claim.isEnded || claim.pid !== null && !isRunning2(claim.pid);
var mayReport = (claim, sessionId, isRunning2) => claim === null || (claim.sessionId === sessionId ? !claim.isEnded : hasLeft(claim, isRunning2));

// src/host.ts
function codexStore(dir, sessionId, now, onWrite) {
  return {
    now,
    read: () => readState(dir, sessionId),
    readDurable: () => readState(dir, sessionId),
    update: async (change) => {
      const s = await updateState(
        dir,
        sessionId,
        onWrite ? async (current) => ({ ...await change(current), writtenAt: Math.max(now(), (current.writtenAt ?? 0) + 1) }) : change,
        now
      );
      await onWrite?.(s);
      return s;
    },
    exclusive: (fn) => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn)
  };
}
var publishFiles = {
  write: async (path, text2) => {
    await mkdir5(dirname3(path), { recursive: true });
    await writeFile6(path, text2);
  },
  move: (from, to) => rename6(from, to),
  remove: (path) => rm4(path, { force: true }),
  removeFolder: (path) => rm4(path, { recursive: true, force: true })
};
function herdrOnWrite(env, run2, dir, now, log = herdrLog(dir)) {
  const target = herdrTarget(env);
  if (!target) return void 0;
  const report = herdrReporter(log);
  return async (written) => {
    const id = written.sessionId;
    await withLock(`${statePath(dir, id)}.herdr`, async () => {
      const isReported = async () => target.kind === "pane" || mayReport(await readClaim(dir, target.terminal), id, isPidRunning);
      if (!await isReported()) return;
      const [s, viewers] = await Promise.all([readState(dir, id), readViewers(dir, id)]);
      const commands = await commandsOf(codexCommandStore(dir, id, now), s);
      const at = now();
      const seq = s.writtenAt ?? at;
      const isPublished = target.kind === "terminal" && await publishedSession(
        publishFiles,
        target.appHome,
        {
          receipts: remoteReceipts(commands),
          viewers: remoteViewerReceipts(viewers.leases),
          remoteProtocol: 2,
          remoteActions: REMOTE_ACTIONS,
          remoteHistoryAfter: commands.floor,
          host: "codex",
          agent: CODEX2.agent,
          sessionId: id,
          terminal: target.terminal,
          writtenAt: Math.max(seq, viewers.writtenAt, commands.writtenAt),
          projectFolder: s.root,
          isFetchingPrs: isPrFetchRunning(s),
          turnReadFailedAt: s.turnReadFailedAt,
          version: "0.8.0",
          isNextBuild: existsSync2(join8(dirname3(dirname3(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK))
        },
        s,
        log
      );
      const appHome = target.kind === "terminal" ? target.appHome : null;
      if (isPublished && appHome && !await isReported()) {
        await unpublishSession(publishFiles, appHome, id);
        return;
      }
      const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, at), []);
      const r = { target, tokens, session: isPublished ? id : null, seq };
      const key = herdrReportKey(r);
      if (key === s.herdrReport?.key) return;
      if (!await report(run2, async () => r)) return;
      await updateState(dir, id, (saved) => ({ ...saved, herdrReport: { key, seq } }), now);
    }).catch(() => void 0);
  };
}

// src/registry.ts
import { mkdir as mkdir6, readdir as readdir4, readFile as readFile5, rename as rename7, rm as rm5, writeFile as writeFile7 } from "node:fs/promises";
import { dirname as dirname4 } from "node:path";

// ../core/runtime/session-registry.ts
function registryFolder(env) {
  const inbox = inboxStateFolder(env);
  return inbox ? `${inbox}/registry` : null;
}
function registryHerdr(target) {
  return target?.kind === "terminal" ? { terminal: target.terminal, appHome: target.appHome } : null;
}
var fileName = (host, sessionId) => `${host}-${sessionFile(sessionId)}`;
function entryOf(text2) {
  try {
    const value = text2 === null ? null : JSON.parse(text2);
    return value?.format === 1 && Number.isInteger(value.pid) && Number.isFinite(value.startedAt) ? value : null;
  } catch {
    return null;
  }
}
async function writeRegistryEntry(files2, folder, source, s, view, now, pid) {
  try {
    const path = `${folder}/${fileName(source.host, source.sessionId)}`;
    const kept = entryOf(await files2.read(path));
    const owner = pid ?? kept?.pid;
    if (owner === void 0) return;
    const fields2 = {
      format: 1,
      ...source,
      title: null,
      pid: owner,
      startedAt: kept && kept.pid === owner ? kept.startedAt : now,
      isTurnRunning: s.presence.isTurnRunning,
      counts: { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }
    };
    const isUnchanged2 = kept && JSON.stringify({ ...kept, writtenAt: 0 }) === JSON.stringify({ ...fields2, writtenAt: 0 });
    if (isUnchanged2) return;
    const entry = { ...fields2, writtenAt: now };
    await replaceFile(files2, path, JSON.stringify(entry), now);
    await pruneEnded(files2, folder, source.host, path);
  } catch (error) {
    files2.log(
      `inbox: the session registry entry could not be written: ${error instanceof Error ? error.message : error}`
    );
  }
}
async function replaceFile(files2, path, text2, now) {
  const temporary = `${path}.${now}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await files2.write(temporary, text2);
    await files2.move(temporary, path);
  } catch (error) {
    await files2.remove(temporary).catch(() => void 0);
    throw error;
  }
}
async function pruneEnded(files2, folder, host, own) {
  const paths = (await files2.list(folder)).filter((name) => name.startsWith(`${host}-`) && name.endsWith(".json")).map((name) => `${folder}/${name}`).filter((path) => path !== own);
  const entries = await Promise.all(paths.map(async (path) => ({ path, entry: entryOf(await files2.read(path)) })));
  const owned = entries.flatMap(({ path, entry }) => entry ? [{ path, pid: entry.pid }] : []);
  if (owned.length === 0) return;
  const live = await files2.livePids([...new Set(owned.map((e) => e.pid))]);
  if (!live) return;
  await Promise.all(owned.filter((e) => !live.has(e.pid)).map((e) => files2.remove(e.path)));
}

// src/registry.ts
var registryFiles = (log) => ({
  list: (folder) => readdir4(folder).catch(() => []),
  read: (path) => readFile5(path, "utf8").catch(missingAsNull),
  write: async (path, text2) => {
    await mkdir6(dirname4(path), { recursive: true, mode: 448 });
    await writeFile7(path, text2, { mode: 384 });
  },
  move: (from, to) => rename7(from, to),
  remove: (path) => rm5(path, { force: true }),
  livePids: async (pids) => new Set(pids.filter(isPidRunning)),
  log
});
function registryOnWrite(env, dir, now, pid, log = herdrLog(dir)) {
  const folder = registryFolder(env);
  if (!folder) return void 0;
  const files2 = registryFiles(log);
  const herdr = registryHerdr(herdrTarget(env));
  return async (written) => {
    const s = await readState(dir, written.sessionId);
    const at = now();
    await writeRegistryEntry(
      files2,
      folder,
      { host: "codex", sessionId: s.sessionId, agent: CODEX2.agent, projectFolder: s.root, version: "0.8.0", herdr },
      s,
      viewOf(s, at),
      at,
      pid
    );
  };
}
function eachOnWrite(...writes) {
  const given = writes.filter((w) => w !== void 0);
  if (given.length === 0) return void 0;
  return async (s) => {
    await Promise.all(given.map((w) => w(s)));
  };
}

// src/question-history.ts
import { mkdir as mkdir7, readdir as readdir5, readFile as readFile6, rename as rename8, stat as stat3, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname5, join as join9 } from "node:path";
var nodeFs = {
  list: async (folder) => {
    const names = await readdir5(folder).catch(() => []);
    const listed = await Promise.all(
      names.map(async (name) => {
        const info = await stat3(join9(folder, name)).catch(() => null);
        return info?.isFile() ? { name, mtimeMs: info.mtimeMs } : null;
      })
    );
    return listed.filter((x) => x !== null);
  },
  read: (path) => readFile6(path, "utf8"),
  write: async (path, text2) => {
    await mkdir7(dirname5(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile8(tmp, text2);
    await rename8(tmp, path);
  }
};
function questionHistoryPlace(env, dir) {
  const folder = historyFolder(env);
  if (!folder) return null;
  return {
    fs: nodeFs,
    folder,
    host: "codex",
    keptSessions: async () => {
      const names = (await readdir5(join9(dir, "sessions")).catch(() => [])).filter(isSessionFile);
      const read = await Promise.all(
        names.map(async (name) => {
          const id = name.slice(0, -".json".length);
          const session = await readState(dir, id).catch(() => null);
          return session ? { id, session } : null;
        })
      );
      return read.filter((x) => x !== null);
    }
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
        const signal = err?.killed ? void 0 : err?.signal ?? void 0;
        const errorCode = typeof err?.code === "string" ? err.code : void 0;
        const error = errorCode && !stderr ? err.message : String(stderr);
        resolve3({
          code: exitCodeOf(err),
          stdout: String(stdout),
          stderr: error,
          ...signal ? { signal } : {},
          ...errorCode ? { errorCode } : {}
        });
      }
    );
    child.stdin?.on("error", () => {
    });
    child.stdin?.end(input);
  } catch (err) {
    const errorCode = err.code;
    resolve3({
      code: UNSTARTABLE_CODE,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      ...typeof errorCode === "string" ? { errorCode } : {}
    });
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
  mkdir as mkdir8,
  readdir as readdir7,
  readFile as readFile7,
  readlink as readlink2,
  rename as rename9,
  rm as rm6,
  rmdir as rmdir2,
  stat as stat6,
  symlink as symlink2,
  writeFile as writeFile9
} from "node:fs/promises";
import { dirname as dirname7, join as join11 } from "node:path";

// ../core/domain/status.ts
var LINE = /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK|GOAL|RETIRE|MILESTONE|SERVES|NEXT|SUGGEST)\s*(?::\s*(.*))?$/i;
function fields(value) {
  return value.split("|").map((f) => f.trim());
}
function statusWord(s) {
  const word = s?.toLowerCase().replace(/[\s_]+/g, "-");
  return word !== void 0 && /^(waits?|waiting)-on-others?$/.test(word) ? "waits-on-other" : word;
}
function openStatus(s) {
  return OPEN_STATUSES.find((o) => o === statusWord(s)) ?? null;
}
function anyStatus(s) {
  return STATUSES.find((o) => o === statusWord(s)) ?? null;
}
function goalMilestones(value) {
  return (value ?? "").split(";").flatMap((part) => {
    const m = /^\s*(\S+)\s+(.+?)(?::\s*(.*?))?\s*$/.exec(part);
    const status = anyStatus(m?.[1]);
    return status && m?.[2] ? [{ status, name: m[2], text: m[3] ?? "" }] : [];
  });
}
function opOf(key, f) {
  if (key === "NOCHANGE" || key === "UNCHANGED") return { kind: "none" };
  if (key === "NEW") {
    const status = openStatus(f[0]);
    return status && f[1] ? { kind: "new", status, name: f[1], text: f[2] ?? "" } : null;
  }
  if (key === "SET") {
    const isDone = statusWord(f[1]) === "done";
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
  if (key === "GOAL") return f[0] ? { kind: "goal", text: f[0], milestones: goalMilestones(f[1]) } : null;
  if (key === "RETIRE") return { kind: "retire", why: f[0] ?? "" };
  if (key === "MILESTONE") {
    const status = anyStatus(f[0]);
    return status && f[1] ? { kind: "milestone", status, name: f[1], text: f[2] ?? "" } : null;
  }
  if (key === "SERVES") {
    const isNone = f[1] === "-" || f[1]?.toLowerCase() === "none";
    return f[0] && f[1] ? { kind: "serves", subject: f[0], milestone: isNone ? null : f[1] } : null;
  }
  if (key === "NEXT") return f[0] ? { kind: "next", ref: f[0] } : null;
  if (key === "SUGGEST") {
    const isNone = f[0] === "-" || f[0]?.toLowerCase() === "none";
    return f[0] ? { kind: "suggest", text: isNone ? null : f[0] } : null;
  }
  return null;
}
function standingRef(op) {
  return op.kind === "set" || op.kind === "done" || op.kind === "drop" ? op.ref.toLowerCase() : null;
}
function afterRetractions(ops) {
  const lastNone = ops.findLastIndex((o) => o.kind === "none");
  const kept = ops.slice(lastNone + 1);
  const lastStanding = new Map(kept.flatMap((o, n) => standingRef(o) === null ? [] : [[standingRef(o), n]]));
  return kept.filter((o, n) => standingRef(o) === null || lastStanding.get(standingRef(o)) === n);
}
function parseStatus(text2) {
  const all = (text2 ?? "").split(NL).flatMap((raw) => {
    const m = LINE.exec(raw.trim());
    const op = m ? opOf(m[1].toUpperCase().replace(" ", ""), fields(m[2] ?? "")) : null;
    return op === null ? [] : [op];
  });
  if (all.length === 0) return null;
  const ops = afterRetractions(all);
  return ops.length === 0 ? { kind: "unchanged" } : { kind: "ops", ops };
}
function withRetryLines(first, retry, keeps) {
  const added = retry?.kind === "ops" ? retry.ops.filter(keeps) : [];
  if (added.length === 0) return first;
  return { kind: "ops", ops: [...first.kind === "ops" ? first.ops : [], ...added] };
}
async function askStatus(ask, retryFor = () => null) {
  const first = await ask(null);
  if (first.text === null) return { answer: null, last: first };
  const answer = parseStatus(first.text);
  if (answer === null) {
    const again3 = await ask(null);
    return { answer: parseStatus(again3.text), last: again3 };
  }
  const retry = retryFor(answer, first.text);
  if (retry === null) return { answer, last: first };
  const again2 = await ask(retry.prompt);
  return { answer: withRetryLines(answer, parseStatus(again2.text), retry.keeps), last: again2 };
}

// ../core/domain/status-prompt-goal.ts
var NO_WORK_LINKED = "no work linked";
var NEXT_MARK = "next";
var tooBigMark = (count, room) => `too big, ${count} subjects, room for ${room}`;
function nextGoalAsk(o) {
  if (o?.goal?.metAt == null)
    return `No goal runs and none is suggested. What is the work for next? Write GOAL when the goal is clear. Else judge only the subjects open after this exchange, and SUGGEST an outcome they clearly lead to: one open fix leads to shipping it. Write SUGGEST: - when no subject is open, when the open subjects are unrelated pieces with no shared outcome, or when no outcome is clear.`;
  return `The goal is met, and no next goal is suggested. What is the work for next? Write GOAL when the next goal is clear. Else SUGGEST the next outcome with a finish line: shipping or releasing what the met goal built, when that is still to come, or the outcome the subjects open after this exchange, or the next step an item in <asks> offers, clearly lead to: one open fix leads to shipping it. Write SUGGEST: - when no such outcome is clear.`;
}
var GOAL_LINES = `GOAL: outcome | status name: where it stands; status name: where it stands
RETIRE: why the goal no longer fits the work
SUGGEST: outcome, or - for none
MILESTONE: status | name | where it stands
NEXT: milestone id or name
SERVES: subject id or name | milestone id or name, or - when the goal does not need it
GOAL sets the goal, with ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, in order, each written as its status, its name, then where it stands: GOAL: 2.5 in the store | done Bug fixed: crash gone; working Release built: build signed; queued Store review: after the build. It holds no date or time. RETIRE clears the goal and sets none. SET, DONE, DROP, WAS and LINK take a milestone's id as they take a subject's.`;
var GOAL_INPUT = `- <goal>: the outcome the session's work is for, when one is set. It says (typed) when the person typed it, (met) when every milestone is done, (just set) when the person just typed it or took the suggestion, so the milestones shown still belong to the goal before it, and (no work for 2h) once none of its work is open and nothing has moved it for that long. A second line says when code refused the last answer's GOAL or RETIRE line, and why. Fix the cause before writing that line again.
- <milestones>: the outcomes the goal needs, in the plan's order, one per line: id | status | name | where it stands, then its marks: ${NEXT_MARK} on the queued milestone the work takes up next, ${NO_WORK_LINKED} when no subject serves it, and ${tooBigMark(9, 2)} when it holds too much work for one outcome and the goal can take 2 more milestones.
- <removed>: goals the person removed, as their key words, one per line
- <suggested>: the goal offered to the person, while no goal is set or the goal is met
- <next-goal>: there when no goal runs and none is suggested, to ask for the next goal
- While a goal is set, each line in <subjects> ends with the milestone the subject serves, - when the goal does not need it, or ? when it is not linked yet.`;
var GOAL_PARTS = {
  "goal-when-clear": `Write GOAL when no goal is set, or <goal> says met, once the work shows the one outcome it is for. The person may name it, or the open subjects and the agent's plan lead to it, as when the agent says what outcome the person set or an ask's reason names the outcome its work serves. Check this on every exchange against <subjects> and <asks>, so an exchange that is only chat does not hide a goal the open work shows. Never write GOAL from a summary of finished work.`,
  "goal-finish-line": `A goal has a finish line someone could check, such as "2.5 in the store" or "the import ready to demo". A direction, such as "make search faster" or "keep the list tidy", gets no GOAL.`,
  "goal-wait": `When the next goal is not clear, write no GOAL and wait. Chat, one small fix, a few unrelated small asks, or wrapping up the met goal do not show one. A met goal stays until the next is set.`,
  "goal-suggest": `While no goal runs, or <goal> says met, and the next goal is not clear enough for GOAL, keep one suggested goal, which the person sets with one press. It is the outcome the open work most likely leads to, with a finish line, written as GOAL writes a goal, with no milestones. After a met goal, it is the next outcome the finished work leads to, such as shipping what the goal built. Check it on every exchange, as for GOAL. Write SUGGEST when <suggested> no longer fits and an outcome does, SUGGEST: - when it no longer fits and none does, and nothing while it fits. When <next-goal> is there, answer it as it asks, even after NO CHANGE. Never make a suggestion up from chat, and never let one hold back GOAL. Never suggest the goal in <goal> or a goal in <removed>.`,
  "goal-not-again": `Never write the goal in <goal> or a goal in <removed> again, in any words. A removed goal stays removed until the person types it.`,
  "goal-typed-kept": `A goal marked (typed) is the person's: never reword, replace or retire it before it is met. Never write the goal into the head, a subject or a milestone.`,
  "goal-outcome-happened": `When the exchange shows the goal's outcome happened, as when its release shipped or its feature merged, write DONE for each open milestone, so the goal is met, and GOAL when the next goal is clear. Never RETIRE a goal whose outcome happened.`,
  "goal-work-left": `When the work no longer moves a goal that is not typed, as when the person moved on and its subjects went stale, close those subjects with DONE or DROP, then write GOAL for what the work is for now, or RETIRE when nothing is clear. A goal marked (no work for \u2026) has been left, whatever its milestones say: write RETIRE in the same answer, or GOAL when the work shows the next goal. Never replace a goal while its work is open, unless the person changed its outcome, as by cutting part of it. Then write GOAL for the new outcome, name each milestone it keeps again in the same words, and write SERVES to - for the work of each one it leaves out. When a milestone is cut and the goal's words still hold, DROP that milestone instead. New work or an added outcome is a MILESTONE line, never a new goal.`,
  "milestones-are-outcomes": `A milestone is an outcome the goal needs, never a task or a step: "Fix merged", not "Merge the fix". The milestones cover every outcome the goal names, a release or version included: "Offline sync in 3.1" needs one for offline sync and one for 3.1 published. Never name a milestone after a subject. A milestone's name and where it stands follow a subject's rules. Code starts a milestone when its linked work starts and closes it when all that work is done. When the exchange shows a milestone's outcome happened, write DONE for it, even while a subject that serves it stays open for a follow-up fix, such as a test that broke after its work landed. Write SET, DONE, DROP or WAS for one by its id when where it stands changed, and SET to open it again when part of it still has work left, with NEW for that work. Write MILESTONE for an outcome the goal now needs that none covers. Never write a count: code counts what is done.`,
  "next-milestone": `NEXT names the queued milestone the work takes up after the one under way. Write it when the plan changes which comes next, naming a milestone this answer adds by its name. Leave it out while the milestone marked ${NEXT_MARK} is right.`,
  "milestone-split": `A milestone marked too big holds more work than the person can read as one outcome: split it by theme. Write MILESTONE for each outcome its open subjects are for, such as "Status page polish", no more than the room the mark gives. Then write SERVES to move each open subject to its new milestone, or to - when the goal does not need it. Its done subjects stay with it. When none of its subjects is left open, write DONE for it, or DROP with why when none is done. A split changes milestones only, so it applies to a typed goal too.`,
  "milestone-no-work": `For a milestone marked ${NO_WORK_LINKED}, write SERVES for an open subject whose work is part of it, DONE when the exchange shows it done, or DROP when the goal no longer needs it. Never link other work just to fill it.`,
  "milestones-for-new-goal": `When <goal> says just set, the milestones shown belong to the goal before it, and each one your answer does not name goes. Write MILESTONE, with its status, name and where it stands, for each one the new goal keeps and each outcome it needs, so it has ${MILESTONES_MIN} to ${MILESTONES_MAX}.`,
  "serves-every-subject": `While a goal is set, write SERVES for each subject marked ? in <subjects> and each NEW subject, even when nothing else changed: the milestone its work is part of, or - when the goal does not need it. With GOAL, write SERVES for every open subject. Change a link only when what the work is for changed, or a subject under - turns out to be part of a milestone. Write LINK with a milestone id for an ask that holds up the milestone itself.`,
  "serves-in-outcome": `A subject serves a milestone only when finishing it is part of that milestone's named outcome, as a crash fix is part of "Launch crash fixed". Work that only happens while a milestone is open is not, and a broad name such as "Fixes landed" is no home for whatever comes later: write - for it, even when nothing else serves the goal.`
};
function goalRules(without = []) {
  return Object.keys(GOAL_PARTS).filter((id) => !without.includes(id)).map((id) => `- ${GOAL_PARTS[id]}`).join(NL3);
}
function refusedLine(o, now) {
  const r = o.goalRefused;
  const g = o.goal;
  if (r === null || g === null) return null;
  const line = r.line.toUpperCase();
  const texts = {
    typed: () => "the person typed this goal, so it is theirs until it is met.",
    met: () => "the goal is met. It stays until GOAL sets the next one.",
    "work-open": () => {
      const open2 = heldSubjects(o).filter(isOpen);
      const unplaced = open2.filter((s) => r.unplaced?.includes(s.id));
      const revise = r.line === "goal" ? " When the person cut part of the goal's outcome, write GOAL for the new outcome instead: name again in the same words each milestone it keeps, and write SERVES to - for the work of each milestone it leaves out." : "";
      if (unplaced.length > 0)
        return `it leaves this open work with no open milestone: ${unplaced.map((s) => s.name).join(", ")}. If the person cut that work's milestone, write GOAL again with ${unplaced.map((s) => `SERVES: ${s.id} | -`).join(" and ")} in the same answer. If that work is done, write DONE for it, then GOAL again. Else keep the goal and write no GOAL.`;
      return open2.length === 0 ? null : `the goal's work is still open: ${open2.map((s) => s.name).join(", ")}. In the same answer, close that work with DONE or DROP, or write SERVES to - for work the goal does not need, then write ${line} again.${revise}`;
    },
    moved: () => goalLeftFor(o, now) !== null ? null : `the work has not left the goal: it moved ${duration(now - lastProgressAt(o, g))} ago. When its outcome happened, write DONE for each open milestone instead, so it is met. Else write ${line} once this line says no work for a time.`,
    "no-work": () => "no open subject is outside the goal, so there is no work for a new one. Write NEW for the new goal's work in the same answer.",
    restates: () => "it restates the goal, the goal before it, or a removed goal.",
    "few-milestones": () => `a goal needs ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones.`
  };
  const text2 = texts[r.why]();
  return text2 === null ? null : `${line} refused: ${text2}`;
}
function tooBigMilestones(o) {
  const g = o?.goal;
  if (!o || !g || g.isAwaitingMilestones) return /* @__PURE__ */ new Map();
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const serving = (id) => o.subjects.filter((s) => s.status !== "dropped" && o.serves[s.id] === id);
  if (kept.length >= MILESTONES_MAX) return /* @__PURE__ */ new Map();
  return new Map(
    kept.flatMap((m) => {
      const work = serving(m.id);
      const hasWorkToSplit = work.filter(isOpen).length >= 2;
      return isOpen(m) && work.length > MILESTONE_SUBJECTS && hasWorkToSplit ? [[m.id, work.length]] : [];
    })
  );
}
function goalBlocks(o, now) {
  const ask = isNextGoalAsked(o) ? [`<next-goal>${NL3}${nextGoalAsk(o)}${NL3}</next-goal>`] : [];
  if (o === null) return ask;
  const g = o.goal;
  const left = goalLeftFor(o, now);
  const refused = refusedLine(o, now);
  const marks = g ? [
    ...g.source === "typed" ? ["typed"] : [],
    ...g.isAwaitingMilestones ? ["just set"] : g.metAt != null ? ["met"] : [],
    ...left === null ? [] : [`no work for ${duration(left)}`]
  ] : [];
  const state = marks.length > 0 ? ` (${marks.join(", ")})` : "";
  const served = new Set(Object.values(o.serves));
  const next = g?.isAwaitingMilestones ? void 0 : o.milestones.find((m) => m.status === "queued");
  const tooBig = tooBigMilestones(o);
  const room = MILESTONES_MAX - o.milestones.filter((m) => m.status !== "dropped").length;
  const milestones = o.milestones.filter((m) => m.status !== "dropped").map((m) => {
    const isUnserved = m.status !== "done" && !served.has(m.id);
    const serving = tooBig.get(m.id);
    const marks2 = [
      ...m === next ? [NEXT_MARK] : [],
      ...isUnserved ? [NO_WORK_LINKED] : [],
      ...serving === void 0 ? [] : [tooBigMark(serving, room)]
    ];
    return [`${m.id} | ${m.status} | ${m.name} | ${m.text || "-"}`, ...marks2].join(" | ");
  });
  const block = (tag, body) => `<${tag}>${NL3}${body}${NL3}</${tag}>`;
  return [
    ...g ? [block("goal", `${g.text}${state}${refused === null ? "" : `${NL3}${refused}`}`)] : [],
    ...g && milestones.length > 0 ? [block("milestones", milestones.join(NL3))] : [],
    ...o.removedGoals.length > 0 ? [block("removed", o.removedGoals.join(NL3))] : [],
    ...o.suggestedGoal !== null && !hasRunningGoal(o) ? [block("suggested", o.suggestedGoal)] : [],
    ...ask
  ];
}

// ../core/domain/status-prompt.ts
var PARTS_RULE = ` When the agent's plan or the person names several parts of the work that the person would each name on their own, such as a login screen, a password reset and a sign-out button, each part is its own subject, queued until it starts, and the head names the whole. Never write one subject that repeats the head and holds those parts in its text. A part gets its subject even when a milestone covers it: a milestone is an outcome the goal needs, never a copy of a subject. The steps of one part, such as making it, testing it and writing its docs, are not parts: they stay in that part's subject.`;
var OWN_CHILDREN_RULE = ` Work this session's own subagents or background tasks do on it, such as a review, keeps it working.`;
function statusSystem(without = [], splitsParts = false) {
  const parts = splitsParts ? PARTS_RULE : "";
  const ownChildren = splitsParts ? OWN_CHILDREN_RULE : "";
  return `You keep the Overview of a coding session: one list of the subjects its work is about, for the person who works with the agent. They read it when they come back, to see what the work is for, where each part stands, and what changed.

You read the list as it is and one exchange, and answer with the changes the exchange makes. Code keeps the list, its order and every time. You never write the whole list.

Input:
- <head>: the top of the page, as title | description: what the session is focused on now. Never write it into a subject.
- <subjects>: the open subjects, one per line: id | status | name | where it stands | how long ago it last changed
- <finished>: subjects already done or dropped, one per line: id | done or dropped | name, then | ${NOT_SEEN} when it closed since the person last looked. Do not add them again.
- <running>: work apart from the turn, such as a subagent, a background task, a workflow or a delegate session, that runs, or that finished since you last read the list, one per line: id | kind | name | the subject it belongs to, or - when it has none yet | running, blocked at a question or an approval, or finished
- <asks>: the open questions and tasks the inbox shows the person, one per line: id | the ask | the subjects it holds up, or - when it has none yet | why the agent asked it, when it said
- <idle>: the subjects working or waiting on something that have not changed for a day or more and that no item in <asks> or <running> holds up, one per line: id | status | name | how long since it changed
- <tasks>: the agent's own task list, when it keeps one. It is evidence, not the list: write each subject at the level of the feature. A pending task for another part of the product, one the person would name on its own, is a queued subject.
${GOAL_INPUT}
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: what the agent said this turn, in order

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
${GOAL_LINES}

A subject is one piece of the work that the person would name: a feature, a fix, a release, or a stream of work handed to another session. Keep at most ${OPEN_SUBJECTS} open.${parts} A fix, an option, a review or a question inside a larger piece of work belongs to that subject: change its text instead, as in "critique fixes: 4 of 9 done". A problem, the fix for it and the fix's PR are one subject, whatever words the conversation uses for them, and so are a feature and the PR that builds it. A subject is never a command, a file, a commit, a test run or a tool call. A question to the person is never a subject of its own, and neither is a problem the agent noticed outside the work: the inbox shows those.

The name is a label of at most ${NAME_WORDS} words, the handle the person would use for the work, such as "Offline sync", "Sign-out bug" or "1.4.2 release". It names the work, never a PR or issue number, and never what to do about it or what was found: not a sentence, a question, a task or a finding. Write "Login provider", not "Choose which login provider ships first", and "Sign-out token bug", not "A cached token survives sign-out on the web app". The details go in where it stands. Where it stands is at most ${TEXT_WORDS} words: its state now, not what the agent did. Say what works or is fixed, not the step that got it there: never committed, pushed, rebuilt, restarted or tests passing. Never write a time, a date, or a word such as today, yesterday, ago or now. Code shows how long ago each subject changed.

The head says what the session is focused on now: the work the person would name if asked what this session is doing. It may cover several subjects. Its title is a label of at most ${NAME_WORDS} words, like a subject's name, such as "Offline sync" or "2.5 release". Its description is at most ${DESCRIPTION_WORDS} words on what the session is doing about that focus, such as "Adding offline sync to the notes app" or "Fixing the sync bug for the 2.5 release". It never adds work queued after the focus, as "then shipping 2.5" does. The description never repeats the title, and never says where one piece stands, such as "PR ready for review". The head follows the same rules on time words as where it stands.

Write every name, where it stands, the head, the goal and each milestone in plain spoken words, so someone who was not in the session gets it on one read: everyday words, and each thing named by what it is. Write "Phone sign-in | iPhone done, Android next", not "Mobile auth parity | iOS verified; Android pending". Never join two phrases with a semicolon: write a comma.

Status is one of: working, queued, waits-on-other.
- working: being worked on now, in this session or in a session it handed the work to, or stopped until the person answers an ask.${ownChildren} When the work stopped for another reason, it is queued, waits on something, or is done.
- queued: planned, not started.
- waits-on-other: it waits on something other than the person, such as a build, a review or another session.
Nothing waits on the person unless an item in <asks> holds it up. Never write that a subject waits on the person, their check or their answer: when the work needs them, the agent asks, and the inbox shows the ask.

Rules:
- Change a subject by its id. Write NEW only when no subject in <subjects> covers it: first check each one for the same work under another name, such as the bug a fix is for. When the same work in <finished> marked ${NOT_SEEN} turns out not done or breaks again, as a fixed bug that breaks again, SET its id to reopen it. A new target or a higher bar for finished work is a NEW subject. Every other finished subject stays finished: work on it that comes back, new work on the same outcome, a follow-up or a release is a NEW subject, never that one set working again.
- When work started and finished in this exchange, write NEW for it, then DONE with its name.
- When <reply> says work is finished, merged, pushed to the main branch, published or shipped, even in passing or at the end of a long reply, write DONE for each open subject and milestone that work finishes, by its id, and HEAD when the head's description names that work. When it says nothing waits on the person, no subject waits on them. NO CHANGE is wrong then.
- Write SET only when where a subject stands changed, or when its text says only what a running item is doing. Never reword a subject otherwise.
- Write DONE when a subject is finished, and DROP when it is abandoned or no longer true, with the reason. A subject is finished when all the work its name names is done. Work that goes through PRs is done once its last PR merges, not when its delegate finishes, its review comes back clean or its checks pass. A release is done when it is published. Work its name does not cover, such as a release or another change, is a NEW subject with a name that does not repeat the finished one's.
- Answer for each subject in <idle> with one line. Write DONE when its work is finished, as the exchange or where it stands says. Write DROP with why, such as "work moved on", when it was left behind. Write SET to keep it: working with where it stands now when this exchange works on it, or waits-on-other with what it waits on when it still waits on something outside the session, such as a vendor or a review.
- When the person files a piece for later, out of this session's plan, as into an issue or a backlog, write DONE with "filed for later". A piece the person sets aside to come back to in this session stays queued.
- When the plan for a subject reverses, or another subject takes its work, write WAS with the plan it replaces. Use DROP with INTO when the work moved into another subject.
- Write LINK for each item in <asks> that has no subject yet, or when another subject's work also waits on it, one line for each subject whose work waits on it. An ask that holds up no subject gets no LINK. Never write an open ask or its options into a subject: code marks the subject while the ask is open, and the inbox shows the ask.
- Write LINK for each item in <running> that has no subject yet, naming the subject whose work it does. Never write NEW for an item in <running>: code draws it under its subject, with its label. That label says what the item is doing, so the subject's text never says it again in other words. It says what the label does not, such as what works or what is left: "CSV works, PDF left", not "building the PDF export" under "Adding PDF export". When a subject's text in <subjects> says only what one of its running items is doing, write SET with what it leaves out. When its result comes back in the exchange, change its subject with SET or DONE if the result changed where the subject stands. When an item finished, as <running> or the exchange shows, and no other item in <running> still works for its subject, a subject that stays working says in where it stands what works and what is left, so the person sees why it still works: "PDF works, merge left", not "delegate laying out the PDF" or "delegate finished". When neither the exchange nor where it stands says what came of the finished item, say its work is not checked yet: "PDF done, not checked". Keep where it stands when it already says what came of the item or what is left. When what is left is another subject's work, the subject waits on it: write waits-on-other. Once all of its own work has merged, it is DONE, even when another subject's work follows. A release still waits until it is published.
- Check the head on every exchange against <subjects> and <finished>, not only against this exchange: work often moves on over many small exchanges with no one saying so. Write HEAD when <head> is empty, when it has no description while a subject is working or waits on something, when the person asks for work that is not part of what the head names, or when a subject is working that is not part of what the head names, as when the work the head names finished and the session started on other work. Write HEAD too when its description says the session is doing work that <finished> shows done, or work it is no longer doing: when the title still names the focus, keep it word for word and write a new description.
- The head names the whole focus, which often spans several subjects. One of them finishing, the next one starting, or the person asking for the next one does not change the focus, so never retitle the head to the piece being worked on. Keep the head's title while a working subject is part of what it names. When the work it names finished and no subject is working, keep the title: queued work is not the focus until it starts. Never reword a head whose title and description both still hold, and never add progress, the next step or queued work to it.

Goal:
${goalRules(without)}`;
}
var STATUS_SYSTEM = statusSystem();
var PARTS_STATUS_SYSTEM = statusSystem([], true);
function hostStatusSystem(names) {
  return names.splitsPlanIntoSubjects ? PARTS_STATUS_SYSTEM : STATUS_SYSTEM;
}
function headText(o) {
  if (!o?.head) return "(none yet)";
  return `${o.head.title} | ${o.head.description || "(no description yet)"}`;
}
function statusBlocks({ last, asks, tasks, now }) {
  const { open: open2, finished } = subjectsText(last, now);
  const running = runningText(last, now);
  const held = asksText(last, asks);
  const list = tasksText(tasks);
  const idle = idleText(last, asks, now);
  return [
    ...goalBlocks(last, now),
    `<head>${NL3}${headText(last)}${NL3}</head>`,
    `<subjects>${NL3}${open2}${NL3}</subjects>`,
    ...finished === "" ? [] : [`<finished>${NL3}${finished}${NL3}</finished>`],
    ...running === "" ? [] : [`<running>${NL3}${running}${NL3}</running>`],
    ...held === "" ? [] : [`<asks>${NL3}${held}${NL3}</asks>`],
    ...idle === "" ? [] : [`<idle>${NL3}${idle}${NL3}</idle>`],
    ...list === "" ? [] : [`<tasks>${NL3}${list}${NL3}</tasks>`]
  ];
}
function statusPrompt(input, ex) {
  const person = personText(ex.person, ex.trigger);
  return [
    ...statusBlocks(input),
    `<person>${NL3}${clipMiddle(person, 4e3, 1500)}${NL3}</person>`,
    `<activity>${NL3}${clipMiddle(ex.activity.join(NL3), 2500, 500)}${NL3}</activity>`,
    `<reply>${NL3}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL3}</reply>`
  ].join(NL3);
}
function statusMidTurnPrompt(input, turn) {
  return [
    'The turn is still running. Treat <person> and <activity> as the exchange so far: there is no reply yet. Answer with the changes the work so far makes. Where it stands says what works so far and what is left, never what the agent is doing: "CSV export works, PDF not started", not "export edits underway" or "writing the PDF export". When a piece has started and nothing in it works yet, say that: "PDF export started, not working yet", not "PDF edits begun, untested".',
    ...statusBlocks(input),
    `<person>${NL3}${clipMiddle(personText(turn.person, turn.trigger), 4e3, 1500)}${NL3}</person>`,
    `<activity>${NL3}${clipMiddle(turn.activity.join(NL3), 2500, 500)}${NL3}</activity>`
  ].join(NL3);
}
function statusCatchUpPrompt(input, transcript) {
  return [
    "Treat the conversation in <conversation> as the exchange. Its start may be cut. Answer with the changes that bring the list to where the conversation ends. A conversation often names one piece of work several ways. Match each piece to its subject in <subjects> or <finished> before you write NEW. A finished piece that the conversation only retells gets no line.",
    ...statusBlocks(input),
    `<conversation>${NL3}${numberBlocks(transcript)}${NL3}</conversation>`
  ].join(NL3);
}

// ../core/domain/status-retry.ts
function isLineFor(op, s, last, askIds, now) {
  const names = (ref) => findSubject(last?.subjects ?? [], ref)?.id === s.id;
  if (op.kind === "set" || op.kind === "done" || op.kind === "drop" || op.kind === "was") return names(op.ref);
  if (op.kind === "new") return names(op.name);
  const isLinkable = (ref) => askIds.has(ref) || (last?.children ?? []).some((c) => c.id === ref && isChildRunning(c, now));
  if (op.kind === "link") return isLinkable(op.ref) && names(op.subject);
  return false;
}
function statusRetry(input, prompt) {
  return (answer, text2) => {
    const ops = answer.kind === "ops" ? answer.ops : [];
    const askIds = new Set(input.asks.map((a) => a.id));
    const isAnswered = (s) => ops.some((op) => isLineFor(op, s, input.last, askIds, input.now));
    const unanswered = idleSubjects(input.last, input.asks, input.now).filter((s) => !isAnswered(s));
    const after = applyStatus(input.last, answer, input.now, askIds);
    const isNextGoalMissing = after !== null && isNextGoalAsked(after) && !answersNextGoal(answer) && !isNextGoalDeclined(after, askIds);
    if (unanswered.length === 0 && !isNextGoalMissing) return null;
    const idleAsk = `Your answer has no line for these subjects in <idle>: ${unanswered.map((s) => `${s.id} ${s.name}`).join(", ")}. Write one line for each: DONE when its work is finished, DROP with why when it was left behind, or SET to keep it, working when this exchange works on it, or waits-on-other with what it still waits on outside the session.`;
    const goalAsk = `After your answer no goal runs and none is suggested, and your answer has no GOAL or SUGGEST line. ${nextGoalAsk(after)}`;
    return {
      prompt: [
        prompt,
        `<your-answer>${NL3}${text2}${NL3}</your-answer>`,
        ...unanswered.length > 0 ? [idleAsk] : [],
        ...isNextGoalMissing ? [goalAsk] : [],
        "Your other lines stand. Answer with only the lines asked for here."
      ].join(NL3),
      keeps: (op) => isNextGoalMissing && (op.kind === "goal" || op.kind === "suggest") || unanswered.some((s) => isLineFor(op, s, input.last, askIds, input.now))
    };
  };
}

// ../core/runtime/call-record.ts
var ERROR_CHARS = 500;
var ANSWER_CHARS = 4e3;
async function askedCall(ask, prompt, system, kind) {
  let report = null;
  let thrown = null;
  const text2 = await ask(prompt, system, kind, (r) => report = r).catch((err) => {
    thrown = err instanceof Error ? err.message : String(err);
    return null;
  });
  return { text: text2, report, thrown };
}
async function heardCall(ask, prompt, system, kind, now) {
  const startedAt = await now();
  const asked = await askedCall(ask, prompt, system, kind);
  return { ...asked, ms: await now() - startedAt };
}
function failureOf(kind, heard, isParsed, at) {
  if (heard.text !== null && isParsed) return null;
  const { report, thrown, text: text2 } = heard;
  const reason = thrown ?? report?.error ?? null;
  const cause = text2 !== null ? "unparseable" : thrown !== null ? "error" : report?.cause ?? (reason ? "error" : "no-reply");
  return {
    at,
    call: kind.call,
    reads: kind.reads,
    isRetry: "isRetry" in kind ? kind.isRetry : null,
    cause,
    model: report?.model ?? null,
    error: text2 === null && reason ? reason.slice(0, ERROR_CHARS) : null,
    answerChars: text2 === null ? null : text2.length,
    ms: heard.ms,
    process: text2 === null ? report?.process ?? null : null
  };
}
function withAnswer(s, kind, heard, isParsed, at, turn) {
  if (heard.text === null) return s;
  const { text: text2 } = heard;
  const answer = {
    at,
    turn,
    reads: kind.reads,
    isParsed,
    text: text2.slice(0, ANSWER_CHARS),
    chars: text2.length
  };
  return { ...s, lastAnswers: { ...s.lastAnswers, [kind.call]: answer } };
}
function withCall(s, kind, heard, isParsed, at) {
  const record2 = s.callFailures[kind.call];
  const failure = failureOf(kind, heard, isParsed, at);
  const isRecovery = !failure && record2.lastFailure !== null && record2.recoveredAt === null;
  if (!failure && !isRecovery) return s;
  const next = failure ? { lastFailure: failure, recoveredAt: null } : { ...record2, recoveredAt: at };
  return { ...s, callFailures: { ...s.callFailures, [kind.call]: next } };
}

// ../core/runtime/status-records.ts
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
  const { files: files2, folder } = records;
  const own = `${folder}/${recordsFolderName(records.session)}`;
  await files2.write(`${own}/${recordFileName(record2.at, record2.exchange.kind)}`, `${JSON.stringify(record2)}
`);
  const names = (await files2.list(own)).filter((n) => RECORD_NAME.test(n)).sort();
  const past = names.slice(0, Math.max(0, names.length - RECORDS_PER_SESSION));
  if (past.length > 0) await files2.removeFiles(past.map((n) => `${own}/${n}`));
  if (record2.at - (sweptAt.get(folder) ?? -Infinity) < RECORDS_SWEEP_MS) return;
  sweptAt.set(folder, record2.at);
  for (const session of await files2.list(folder)) {
    const theirs = `${folder}/${session}`;
    if (theirs === own) continue;
    const kept = (await files2.list(theirs)).filter((n) => RECORD_NAME.test(n));
    const lastAt = Math.max(...kept.map((n) => Number(RECORD_NAME.exec(n)[1])));
    if (record2.at - lastAt < RECORDS_KEPT_MS) continue;
    if (kept.length > 0) await files2.removeFiles(kept.map((n) => `${theirs}/${n}`));
    await files2.removeFolder(theirs).catch(() => void 0);
  }
}
function attemptOf({ text: text2, report, thrown, ms }, prompt) {
  return {
    model: report?.model ?? null,
    answeredBy: report?.answeredBy ?? null,
    answer: text2,
    error: text2 === null ? thrown ?? report?.error ?? "no answer, and the host gave no reason" : null,
    ms,
    ...prompt === null ? {} : { prompt }
  };
}
async function readForStatus(host) {
  const at = await host.now();
  return { s: await host.read(), at };
}
async function askAndWriteStatus(host, { s, at: readAt }, call, tasks, appliedAfter) {
  if (!isStatusCallCurrent(s, appliedAfter)) return;
  const input = { last: s.ledger.overview, asks: s.ledger.items, tasks, now: readAt };
  const prompt = statusCallPrompt(input, call.exchange);
  const system = hostStatusSystem(host.names);
  const heards = [];
  const { answer, last } = await askStatus(
    async (retry) => {
      const kind = { call: "status", reads: call.exchange.kind, isRetry: heards.length > 0 };
      const heard = await heardCall(call.ask, retry ?? prompt, system, kind, () => host.now());
      heards.push({ kind, heard, retry });
      return heard;
    },
    statusRetry(input, prompt)
  );
  const attempts = heards.map((h) => attemptOf(h.heard, h.retry));
  let before = null;
  let isWritten = false;
  const answeredTurn = (x) => call.exchange.kind === "reply" ? call.exchange.exchange.turn : x.ledger.turn;
  const noted = (current, now) => {
    const isCurrent = isStatusCallCurrent(current, appliedAfter);
    return heards.reduce((x, h) => {
      const isParsed = h.heard.text !== null && parseStatus(h.heard.text) !== null;
      const recorded = withCall(x, h.kind, h.heard, isParsed, now);
      return isCurrent ? withAnswer(recorded, h.kind, h.heard, isParsed, now, answeredTurn(x)) : recorded;
    }, current);
  };
  const after = await host.update(async (current) => {
    const now = await host.now();
    const x = noted(current, now);
    before = x.ledger.overview;
    isWritten = isStatusCallCurrent(x, appliedAfter);
    const readSetAt = input.last?.goal?.setAt ?? null;
    if (answer === null) return failedStatus(x, last.text, appliedAfter, now, call.exchange.kind === "catch-up");
    const isCatchUp = call.exchange.kind === "catch-up" || call.isCatchUpImpossible === true;
    const applied2 = appliedStatus(x, answer, appliedAfter, now, readSetAt, isCatchUp, input.now);
    if (!isWritten) return applied2;
    const overview = withChangeNoted(before, applied2.ledger.overview, isActiveReply(call.exchange), now);
    return { ...applied2, ledger: { ...applied2.ledger, overview } };
  });
  if (!host.records) return;
  const record2 = {
    version: STATUS_RECORD_VERSION,
    host: host.records.host,
    session: host.records.session,
    at: input.now,
    system,
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
    const read = await readForStatus(host);
    const { s } = read;
    if (!s.presence.isTurnRunning) return;
    const { person, trigger, activity } = s.turn;
    const call = { exchange: { kind: "mid-turn", turn: { person, trigger, activity } }, ask: host.ask };
    await askAndWriteStatus(host, read, call, s.hostTasks, s.presence.turnsApplied);
  });
}

// ../core/runtime/session-host.ts
function orderedKeys() {
  const tails2 = /* @__PURE__ */ new Map();
  return {
    run: (key, fn) => {
      const result = (tails2.get(key) ?? Promise.resolve()).then(fn);
      const tail = result.catch(() => void 0);
      tails2.set(key, tail);
      void tail.then(() => {
        if (tails2.get(key) === tail) tails2.delete(key);
      });
      return result;
    }
  };
}
var CATCH_UP_CALL = { call: "ledger", reads: "catch-up" };
async function askOverConversation(host, names, s, screen, conversation) {
  if (!conversation) return { kind: "unreadable" };
  const prompt = transcriptCatchUpPrompt(s.ledger, screen, conversation);
  const heard = await heardCall(host.ask, prompt, systemText(names), CATCH_UP_CALL, () => host.now());
  return heard.text === null ? { kind: "failed", heard } : {
    kind: "reply",
    text: heard.text,
    source: conversation,
    statusCall: { exchange: { kind: "catch-up", conversation }, ask: host.ask },
    heard
  };
}
async function runUpdates(host) {
  let canCatchUp = host.catchUp !== void 0;
  const wantsCatchUp = (s) => canCatchUp && needsCatchUp(s);
  const hasWork = (s) => s.pending.length > 0 || wantsCatchUp(s);
  const writing = [];
  const writeStatus = (after, call, tasks) => host.inOrder(
    async () => askAndWriteStatus(
      host,
      await readForStatus(host),
      { ...call, isCatchUpImpossible: !canCatchUp },
      tasks,
      after.presence.turnsApplied
    )
  );
  const followUp = (run2) => {
    const settled = run2.catch(() => void 0);
    if (host.background) host.background(settled);
    else writing.push(settled);
  };
  const isDelegate = await host.delegate().catch(() => null) !== null;
  try {
    while (hasWork(await host.read())) {
      const held = await host.exclusive(async () => {
        try {
          for (; ; ) {
            const s = await host.update((x) => ({ ...x, presence: { ...x.presence, isUpdating: hasWork(x) } }));
            if (!hasWork(s)) break;
            if (wantsCatchUp(s)) {
              const reply = await host.catchUp(s).catch(() => ({ kind: "failed", heard: null }));
              if (reply.kind === "unreadable") {
                canCatchUp = false;
                await host.update((x) => ({ ...x, presence: { ...x.presence, isConversationUnreadable: true } }));
                continue;
              }
              const parsed4 = reply.kind === "reply" ? parseReply(reply.text, reply.source) : null;
              const at = await host.now();
              const noted = (x) => reply.heard ? withAnswer(
                withCall(x, CATCH_UP_CALL, reply.heard, parsed4 !== null, at),
                CATCH_UP_CALL,
                reply.heard,
                parsed4 !== null,
                at,
                x.ledger.turn
              ) : x;
              const after2 = await host.update((x) => appliedCatchUp(noted(x), s, parsed4, at, isDelegate));
              if (!parsed4) return "stop";
              if (reply.kind === "reply" && reply.statusCall)
                followUp(writeStatus(after2, reply.statusCall, s.hostTasks));
              continue;
            }
            const next = s.pending[0];
            const promptAt = await host.now();
            const kind = { call: "ledger", reads: "reply", isRetry: next.failed === true };
            const asked = await askedCall(host.ask, buildPrompt(s.ledger, next.ex), systemText(host.names), kind);
            const parsed3 = parsedReply(next.ex, asked.text);
            let isApplied = false;
            const after = await host.update(async (current) => {
              const at = await host.now();
              const heard = { ...asked, ms: at - promptAt };
              const x = withAnswer(
                withCall(current, kind, heard, parsed3 !== null, at),
                kind,
                heard,
                parsed3 !== null,
                at,
                next.ex.turn
              );
              isApplied = false;
              if (x.pending[0]?.turnsStarted !== next.turnsStarted || x.pending[0].ex.turn !== next.ex.turn) return x;
              isApplied = parsed3 !== null;
              return applied(x, parsed3, at, promptAt, isDelegate);
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
import { readdir as readdir6, stat as stat5 } from "node:fs/promises";
import { basename as basename2, dirname as dirname6, join as join10 } from "node:path";

// src/rollout-file.ts
import { createReadStream } from "node:fs";
import { open, stat as stat4 } from "node:fs/promises";
import * as zlib from "node:zlib";
var canReadZstd = typeof zlib.createZstdDecompress === "function";
var isCompressed = (path) => path.endsWith(".zst");
async function plainBytesBefore(path, bytes, end) {
  const file = await open(path, "r");
  try {
    const stop = Math.min(end, (await file.stat()).size);
    const start = Math.max(0, stop - bytes);
    const buf = Buffer.alloc(stop - start);
    const { bytesRead } = await file.read(buf, 0, buf.length, start);
    return { buf: buf.subarray(0, bytesRead), start };
  } finally {
    await file.close();
  }
}
async function compressedBytesBefore(path, bytes, end) {
  if (!canReadZstd) throw new Error("This Node cannot read zstd");
  const kept = [];
  let keptBytes = 0;
  let read = 0;
  const input = createReadStream(path);
  const content = input.pipe(zlib.createZstdDecompress());
  input.on("error", (err) => content.destroy(err));
  try {
    for await (const chunk of content) {
      const part = chunk.subarray(0, Math.max(0, end - read));
      read += part.length;
      kept.push(part);
      keptBytes += part.length;
      while (kept.length > 1 && keptBytes - kept[0].length >= bytes) keptBytes -= kept.shift().length;
      if (read >= end) break;
    }
  } finally {
    input.destroy();
    content.destroy();
  }
  const window = Buffer.concat(kept);
  const cut = Math.max(0, window.length - bytes);
  return { buf: window.subarray(cut), start: read - window.length + cut };
}
var tails = /* @__PURE__ */ new Map();
var KEPT_TAILS = 4;
var TAIL_KEPT_BYTES = 8 * 1024 * 1024;
async function bytesBefore(path, bytes, end = Infinity) {
  if (!isCompressed(path)) return plainBytesBefore(path, bytes, end);
  if (end !== Infinity || bytes > TAIL_KEPT_BYTES) return compressedBytesBefore(path, bytes, end);
  const info = await stat4(path);
  const version = `${info.size}:${info.mtimeMs}`;
  let known = tails.get(path);
  if (known?.version !== version) {
    known = { version, tail: await compressedBytesBefore(path, TAIL_KEPT_BYTES, Infinity) };
    tails.delete(path);
    tails.set(path, known);
    for (const old of tails.keys()) if (tails.size > KEPT_TAILS) tails.delete(old);
  }
  const { buf, start } = known.tail;
  const cut = Math.max(0, buf.length - bytes);
  return { buf: buf.subarray(cut), start: start + cut };
}
async function firstBytes(path, bytes) {
  if (!isCompressed(path)) {
    const file = await open(path, "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await file.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }
  return (await compressedBytesBefore(path, bytes, bytes)).buf;
}

// src/rollout-rows.ts
async function readSessionMeta(path) {
  try {
    const first = (await firstBytes(path, 64 * 1024)).toString("utf8").split("\n")[0] ?? "";
    const meta = JSON.parse(first);
    return meta.type === "session_meta" ? meta : null;
  } catch {
    return null;
  }
}
function isExecMeta(meta) {
  return meta?.payload?.originator === "codex_exec" || meta?.payload?.source === "exec";
}
var isText = (v) => typeof v === "string";
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

// ../core/domain/conversation.ts
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

// src/rollout-commands.ts
import { resolve as resolve2 } from "node:path";
var DIALOG_TOOL = "request_user_input_async";
var SHELL_CALLS = /* @__PURE__ */ new Set(["shell", "shell_command", "exec_command", "container.exec"]);
function commandText2(command) {
  if (isText(command)) return command;
  if (!Array.isArray(command)) return "";
  const argv = command.filter(isText);
  const [, flag, script] = argv;
  return argv.length === 3 && flag?.startsWith("-") && flag.endsWith("c") && script !== void 0 ? script : argv.join(" ");
}
function outputText(output) {
  if (!isText(output)) return "";
  try {
    const parsed3 = JSON.parse(output);
    return isText(parsed3.output) ? parsed3.output : output;
  } catch {
    return output;
  }
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
var literalValue = (literal) => {
  if (literal === void 0) return null;
  try {
    return textOf(JSON.parse(literal));
  } catch {
    return null;
  }
};
var PATCH_ARGUMENT = /tools\.apply_patch\(\s*("(?:[^"\\]|\\.)*")/;
var COMMAND_ARGUMENT = /\bcmd:\s*("(?:[^"\\]|\\.)*")(?=\s*[,})])/;
var scriptCommand = (input) => literalValue(COMMAND_ARGUMENT.exec(input)?.[1]) ?? "";
var COMMAND_CALL = /\bexec_command\b/g;
var COMMAND_ARGUMENTS = new RegExp(COMMAND_ARGUMENT.source, "g");
var STRING_LITERALS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
var REPEATS = /=>|\bfunction\b|\b(?:for|while|do)\b/;
function scriptCommands(input) {
  const commands = [...input.matchAll(COMMAND_ARGUMENTS)].map((literal) => literalValue(literal[1]) ?? "");
  const calls = (input.match(COMMAND_CALL) ?? []).length;
  const isEachCallLiteral = commands.length === calls && !commands.includes("");
  const canRepeat = REPEATS.test(input.replace(STRING_LITERALS, '""'));
  return isEachCallLiteral && !canRepeat && new Set(commands).size === commands.length ? commands : null;
}
var shellLines = (command) => {
  const line = command === "" ? null : toolActivity("Bash", { command });
  return line ? [line] : [];
};
var editLines = (patch, cwd) => patchFiles(patch).map((file) => `edited ${resolve2(cwd || "/", file)}`);
function callLines(p, hasCommandRows2, cwd) {
  const name = textOf(p.name);
  if (p.type === "local_shell_call") return hasCommandRows2 ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = scriptCommand(input);
    return [...patch ? editLines(patch, cwd) : [], ...command && !hasCommandRows2 ? shellLines(command) : []];
  }
  if (p.type !== "function_call") return [];
  if (SHELL_CALLS.has(name)) return hasCommandRows2 ? [] : shellLines(callCommand(p));
  const args = jsonRecord(p.arguments);
  if (name === "apply_patch") return editLines(textOf(args.input ?? args.patch ?? args.command), cwd);
  if (name === "spawn_agent") {
    const line2 = toolActivity("Agent", { description: textOf(args.task_name) });
    return line2 ? [line2] : [];
  }
  const line = toolActivity(textOf(p.namespace).startsWith("mcp__") ? textOf(p.namespace) + name : name, {});
  return line ? [line] : [];
}

// src/rollout-unran.ts
var UNRAN_MARKERS = [
  '"CommandExecution"',
  '"FileChange"',
  '"McpToolCall"',
  '"function_call',
  '"custom_tool_call"',
  '"local_shell_call',
  '"custom_tool_call_output"'
];
var UNRAN_OUTPUT = /^(?:(?:exec command|patch) rejected by user|(?:Command|Tool call) blocked by PreToolUse hook: )/;
var isUnranOutput = (output) => UNRAN_OUTPUT.test(output);
var BLOCKED_COMMAND = /^Command blocked by PreToolUse hook: [^\n]*?\. Command: ([^\n]+)/;
var BLOCKED_TOOL = /^Tool call blocked by PreToolUse hook: [^\n]*?\. Tool: (\S+)/;
var SCRIPT_FAILED = "Script failed\n";
var SCRIPT_ERROR = /^Script error:\s*/;
var SCRIPT_DECLINED = /^exec_command failed: [^\n]*Rejected\(\\?"(?:exec command )?rejected by user\\?"\)/;
function declinedScriptCommand(script, error) {
  const isKnowable = SCRIPT_DECLINED.test(error) && !script.isShared;
  const unrecorded = isKnowable ? (script.commands ?? []).filter((command) => !script.recorded.has(command)) : [];
  return unrecorded.length === 1 ? unrecorded[0] ?? "" : "";
}
function scriptError(output) {
  const parts = Array.isArray(output) ? output.map((part) => textOf(record(part).text)) : [];
  const isFailed = parts.length > 1 && parts[0]?.startsWith(SCRIPT_FAILED) === true;
  const last = isFailed ? parts.at(-1) ?? "" : "";
  const prefix = SCRIPT_ERROR.exec(last)?.[0];
  return prefix === void 0 ? "" : last.slice(prefix.length);
}
var scriptRan = (script) => (script?.commands ?? []).filter((command) => !script?.declined.has(command));
var toolLines = (tool) => {
  const line = toolActivity(tool, {});
  return line ? [line] : [];
};
var blocked = (output) => {
  const command = BLOCKED_COMMAND.exec(output)?.[1]?.trim();
  const tool = BLOCKED_TOOL.exec(output)?.[1];
  return command ? { commands: [command], lines: shellLines(command) } : { commands: [], lines: tool ? toolLines(tool) : [] };
};
var editedLines = (changes) => Object.keys(record(changes)).map((path) => `edited ${path}`);
function unranCalls(rows) {
  const ran = /* @__PURE__ */ new Set();
  const unran = /* @__PURE__ */ new Set();
  const ranDelegates = /* @__PURE__ */ new Set();
  const unranDelegates = /* @__PURE__ */ new Set();
  const note = (lines, didRun) => lines.forEach((line) => (didRun ? ran : unran).add(line));
  const noteCommand = (command, didRun) => {
    note(shellLines(command), didRun);
    delegateRefs(command).forEach((ref) => (didRun ? ranDelegates : unranDelegates).add(ref));
  };
  const callCommands = /* @__PURE__ */ new Map();
  const scripts = /* @__PURE__ */ new Map();
  const openCalls = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const p = record(row.payload);
    const item = record(p.item);
    const isDeclined = item.status === "declined";
    if (row.type === "event_msg" && p.type === "item_completed") {
      if (item.type === "CommandExecution") {
        const command = commandText2(item.command);
        noteCommand(command, !isDeclined);
        scripts.forEach((script) => (isDeclined ? script.declined : script.recorded).add(command));
      } else if (item.type === "FileChange") note(editedLines(item.changes), !isDeclined);
      else if (item.type === "McpToolCall") note(toolLines(`mcp__${textOf(item.server)}__${textOf(item.tool)}`), true);
      continue;
    }
    if (row.type !== "response_item") continue;
    const callId = textOf(p.call_id);
    let block = { commands: [], lines: [] };
    const isScript = p.type === "custom_tool_call" && p.name === "exec";
    if (p.type === "function_call" || p.type === "local_shell_call" || p.type === "custom_tool_call") {
      if (openCalls.size > 0) scripts.forEach((script) => script.isShared = true);
      if (isScript) {
        const commands = scriptCommands(textOf(p.input));
        scripts.set(callId, { commands, recorded: /* @__PURE__ */ new Set(), declined: /* @__PURE__ */ new Set(), isShared: openCalls.size > 0 });
      }
      const command = isScript ? "" : callCommand(p);
      if (command !== "" && callId !== "") callCommands.set(callId, command);
      openCalls.add(callId);
    } else if (p.type === "function_call_output") {
      openCalls.delete(callId);
      const output = outputText(p.output);
      const command = callCommands.get(callId);
      callCommands.delete(callId);
      if (command !== void 0) noteCommand(command, !isUnranOutput(output));
      block = blocked(output);
    } else if (p.type === "custom_tool_call_output") {
      openCalls.delete(callId);
      const error = scriptError(p.output);
      const script = scripts.get(callId);
      scripts.delete(callId);
      block = blocked(error);
      const isBlockNamed = block.commands.length > 0 || block.lines.length > 0;
      const declined = script && !isBlockNamed ? declinedScriptCommand(script, error) : "";
      const unranCommands = /* @__PURE__ */ new Set([declined, ...block.commands]);
      scriptRan(script).forEach((command) => noteCommand(command, !unranCommands.has(command)));
    }
    note(block.lines, false);
    block.commands.forEach((command) => noteCommand(command, false));
  }
  callCommands.forEach((command) => delegateRefs(command).forEach((ref) => ranDelegates.add(ref)));
  scripts.forEach(
    (script) => scriptRan(script).forEach((command) => delegateRefs(command).forEach((ref) => ranDelegates.add(ref)))
  );
  return {
    lines: [...unran].filter((line) => !ran.has(line)),
    delegates: [...unranDelegates].filter((ref) => !ranDelegates.has(ref))
  };
}

// src/dialogs.ts
var REPLY_FORM = /^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/;
function parsed2(text2) {
  try {
    return JSON.parse(typeof text2 === "string" ? text2 : "");
  } catch {
    return null;
  }
}
function dialogAnswersOf(text2) {
  const replies = parsed2(REPLY_FORM.exec(text2.trim())?.[1]);
  if (!Array.isArray(replies)) return [];
  return replies.flatMap((reply) => {
    const { questionItemId, answer } = reply ?? {};
    const id = parsed2(questionItemId);
    const isQuestionId = Array.isArray(id) && id[0] === DIALOG_TOOL && typeof id[1] === "string" && typeof id[2] === "number";
    return isQuestionId && typeof answer === "string" ? [{ callId: id[1], index: id[2], answer }] : [];
  });
}
function dialogLines(d) {
  const isAnswered = (index) => d.answers[index] !== void 0;
  const answered = d.questions.filter((_, index) => isAnswered(index));
  const open2 = d.questions.filter((_, index) => !isAnswered(index));
  const pairs = d.questions.flatMap((q, index) => isAnswered(index) ? [`"${q.question}"="${d.answers[index]}"`] : []);
  return [
    ...answered.length > 0 ? [dialogActivity(answered, { kind: "answered", answer: pairs.join(", ") })] : [],
    ...open2.length > 0 ? [dialogActivity(open2, { kind: "open" })] : []
  ];
}

// src/rollout-turns.ts
var MARKERS = ['"task_started"', DIALOG_TOOL, '"user"', '"AgentMessage"', '"assistant"', ...UNRAN_MARKERS];
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
var isItem = (row, ...kinds) => row.type === "event_msg" && record(row.payload).type === "item_completed" && kinds.includes(textOf(record(record(row.payload).item).type));
function dialogAnswersIn(rows) {
  const answers = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const p = record(row.payload);
    const isUserMessage = row.type === "response_item" && p.type === "message" && p.role === "user";
    const text2 = isItem(row, "UserMessage") ? contentText(record(p.item).content) : isUserMessage ? contentText(p.content) : "";
    for (const reply of dialogAnswersOf(text2))
      answers.set(reply.callId, { ...answers.get(reply.callId), [reply.index]: reply.answer });
  }
  return answers;
}
function turnsOf(rows, cwd, answers) {
  const hasMessageRows = rows.some((row) => isItem(row, "UserMessage", "AgentMessage"));
  const hasCommandRows2 = rows.some((row) => isItem(row, "CommandExecution"));
  const unran = new Set(unranCalls(rows).lines);
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
  const act = (all) => {
    const lines = all.filter((line) => !unran.has(line));
    if (lines.length === 0) return;
    const turn = agentTurn();
    turn.activity = lines.reduce((all2, line) => addActivity(all2, line), turn.activity);
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
      else if (p.type === "function_call" && p.name === DIALOG_TOOL) {
        const questions = dialogQuestions(jsonRecord(p.arguments).questions);
        const callId = textOf(p.call_id);
        act(dialogLines({ questions, answers: (callId === "" ? void 0 : answers.get(callId)) ?? {} }));
      } else act(callLines(p, hasCommandRows2, cwd));
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
  const answers = dialogAnswersIn(groups.flatMap((g) => g.rows));
  return groups.map((g) => ({ id: g.id, isComplete: g.isComplete, turns: turnsOf(g.rows, cwd, answers) }));
}
function rolloutOfLines(lines, cwd, currentTurnId) {
  const turns = rolloutTurns(lines, cwd);
  const earlier = turns.filter((t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person")));
  return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
}

// src/transcript.ts
async function namesIn(dir, pattern) {
  const names = await readdir6(dir).catch(() => []);
  return names.filter((n) => pattern.test(n)).sort().reverse();
}
var ROLLOUT_NAME = canReadZstd ? /^rollout-.+\.jsonl(\.zst)?$/ : /^rollout-.+\.jsonl$/;
var plainName = (name) => name.replace(/\.zst$/, "");
async function rolloutsIn(folder, isWanted) {
  const names = (await namesIn(folder, ROLLOUT_NAME)).filter((n) => isWanted(plainName(n)));
  const byNewest = (a, b) => plainName(b).localeCompare(plainName(a)) || a.length - b.length;
  return names.sort(byNewest);
}
async function newestRollout(codexHome, isWanted) {
  const sessions = join10(codexHome, "sessions");
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join10(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join10(sessions, year, month), /^\d{2}$/)) {
        const folder = join10(sessions, year, month, day);
        const [name] = await rolloutsIn(folder, isWanted);
        if (name !== void 0) return join10(folder, name);
      }
  const archive = join10(codexHome, "archived_sessions");
  const [archived] = await rolloutsIn(archive, isWanted);
  return archived === void 0 ? null : join10(archive, archived);
}
function codexHomeOf(path) {
  const folder = dirname6(path);
  if (basename2(folder) === "archived_sessions") return dirname6(folder);
  const sessions = dirname6(dirname6(dirname6(folder)));
  return basename2(sessions) === "sessions" ? dirname6(sessions) : null;
}
async function rolloutFor(codexHome, threadId) {
  if (threadId === "") return null;
  const path = await newestRollout(
    codexHome,
    (name) => name.endsWith(`-${threadId}.jsonl`) || name.includes(`-${threadId}_`)
  );
  if (path === null) return null;
  const meta = await readSessionMeta(path);
  const isOwnChat = meta !== null && !meta.payload?.parent_thread_id && !isExecMeta(meta);
  return isOwnChat ? { path, cwd: typeof meta.payload?.cwd === "string" ? meta.payload.cwd : "" } : null;
}
async function withCurrentRollout(s) {
  const saved = s.transcriptPath;
  if (saved === null || await stat5(saved).catch(() => null) !== null) return s;
  const codexHome = codexHomeOf(saved);
  const found = codexHome === null ? null : await rolloutFor(codexHome, s.sessionId);
  return found === null || found.path === saved ? s : { ...s, transcriptPath: found.path };
}
async function historyBase(path) {
  const base = (await readSessionMeta(path))?.payload?.history_base;
  const id = base?.thread_id;
  const end = base?.end_byte_offset;
  const codexHome = codexHomeOf(path);
  if (typeof id !== "string" || id === "" || typeof end !== "number" || end <= 0 || codexHome === null) return null;
  const basePath = await newestRollout(
    codexHome,
    (name) => name.endsWith(`-${id}.jsonl`) || name.endsWith(`_${id}.jsonl`)
  );
  return basePath === null ? null : { path: basePath, end };
}
var TAIL_BYTES = 4 * 1024 * 1024;
async function linesBefore(path, bytes, end = Infinity) {
  const { buf, start } = await bytesBefore(path, bytes, end);
  const lines = buf.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return { lines, start, read: buf.length };
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
var TURN_WINDOW_BYTES = [TURN_ROW_BYTES, 512 * 1024, TAIL_BYTES];
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
  const auth = join11(personHome, "auth.json");
  const hasSignInFile = await access(auth).then(
    () => true,
    () => false
  );
  if (!hasSignInFile) return null;
  const home = join11(dir, "model-home");
  const link = join11(home, "auth.json");
  try {
    await mkdir8(home, { recursive: true });
    const isLinked = await readlink2(link).catch(() => null) === auth;
    if (isLinked) return home;
    await keepNewerSignIn(link, auth);
    const made = `${link}.${randomUUID2()}`;
    await symlink2(auth, made);
    await rename9(made, link);
    return home;
  } catch {
    return null;
  }
}
async function keepNewerSignIn(link, auth) {
  const saved = await lstat2(link).catch(() => null);
  if (!saved?.isFile()) return;
  const theirs = await stat6(auth);
  if (saved.mtimeMs > theirs.mtimeMs) await copyFile(link, auth);
}
function codexAsk(exec, cli, dir, personHome) {
  return async (prompt, instructions, _kind, report) => {
    const work = join11(dir, "exec");
    const system = join11(dir, `inbox-system-${createHash2("sha256").update(instructions).digest("hex").slice(0, 12)}.md`);
    const out = join11(work, `reply-${randomUUID2()}.txt`);
    await mkdir8(work, { recursive: true });
    const home = await modelHome(dir, personHome);
    if (await readFile7(system, "utf8").catch(() => "") !== instructions) await writeFile9(system, instructions);
    let off = [...OFF];
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm6(out, { force: true });
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
      const text2 = r.code === 0 ? await readFile7(out, "utf8").catch(() => null) : null;
      await rm6(out, { force: true });
      if (text2 !== null) {
        report?.({ model: MODEL });
        return text2;
      }
      const process2 = {
        cli,
        code: r.code,
        stderr: diagnosticLines(r.stderr),
        signal: r.signal ?? null,
        errorCode: r.errorCode ?? null,
        timeoutMs: r.code === TIMED_OUT_CODE ? TIMEOUT_MS : null
      };
      const error = `codex exec ${endOf(process2)}${process2.stderr ? `: ${process2.stderr}` : ""}`;
      report?.({ model: MODEL, error, cause: r.code === 0 ? "no-reply" : "process", process: process2 });
      return null;
    }
    report?.({ model: MODEL, error: "codex exec refused every feature flag the inbox turns off", cause: "process" });
    return null;
  };
}
function endOf(f) {
  if (f.timeoutMs !== null) return `timed out after ${f.timeoutMs / 1e3} s`;
  if (f.signal) return `was ended by ${f.signal}`;
  if (f.errorCode === "ENOENT") return `failed with ENOENT: no codex program at ${f.cli}`;
  if (f.errorCode) return `failed with ${f.errorCode}`;
  if (f.code === UNSTARTABLE_CODE) return "could not start";
  if (f.code === 0) return "exited 0 and wrote no reply";
  return `exited ${f.code}`;
}
var inOrderFor = (dir, sessionId) => (fn) => resultsOrder.run(
  statePath(dir, sessionId),
  () => withLock(`${statePath(dir, sessionId)}.results`, fn, RESULTS_WAIT_MS)
);
var recordFiles = {
  write: async (path, text2) => {
    await mkdir8(dirname7(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile9(tmp, text2);
    await rename9(tmp, path);
  },
  list: (folder) => readdir7(folder).catch(() => []),
  removeFiles: async (paths) => void await Promise.all(paths.map((p) => rm6(p, { force: true }))),
  removeFolder: (path) => rmdir2(path)
};
var statusRecords = (dir, sessionId) => ({
  host: "codex",
  folder: join11(dir, "overview-calls"),
  session: sessionId,
  files: recordFiles
});
var refreshStatus2 = (dir, sessionId, ask, now, onWrite, records) => refreshStatus({
  ...codexStore(dir, sessionId, now, onWrite),
  ask,
  names: CODEX2,
  inOrder: inOrderFor(dir, sessionId),
  records
});
var runUpdates2 = (dir, sessionId, ask, now, onWrite, records, delegate = async () => null) => {
  const store = codexStore(dir, sessionId, now, onWrite);
  return runUpdates({
    ...store,
    ask,
    names: CODEX2,
    inOrder: inOrderFor(dir, sessionId),
    records,
    delegate,
    catchUp: async (s) => {
      const isMoved = await withCurrentRollout(s) !== s;
      const path = isMoved ? (await store.update(withCurrentRollout)).transcriptPath : s.transcriptPath;
      return askOverConversation(
        { ask, now: store.now },
        CODEX2,
        s,
        screenText(CODEX2, isTabOpen(s, now()), screenTabOf(s.shownTab)),
        (await readRollout(path, s.root))?.conversation ?? null
      );
    }
  });
};

// src/detached-update.ts
var STATUS_REFRESH = "status-refresh";

// src/update-main.ts
async function main() {
  const sessionId = process.argv[2] ?? "";
  const isStatusRefresh = process.argv[3] === STATUS_REFRESH;
  const pluginRoot = dirname8(dirname8(fileURLToPath2(import.meta.url)));
  const dir = dataDir(process.env, pluginRoot);
  useQuestionHistory(questionHistoryPlace(process.env, dir));
  const { cliPath } = await readState(dir, sessionId);
  const cli = cliPath ?? await findCli(process.env, run, process.ppid);
  const personHome = process.env.CODEX_HOME || join12(homedir3(), ".codex");
  const ask = codexAsk(run, cli, dir, personHome);
  const onWrite = eachOnWrite(
    herdrOnWrite(process.env, run, dir, Date.now),
    registryOnWrite(process.env, dir, Date.now, null)
  );
  const records = existsSync3(join12(pluginRoot, NEXT_BUILD_MARK)) ? statusRecords(dir, sessionId) : void 0;
  if (isStatusRefresh) await refreshStatus2(dir, sessionId, ask, Date.now, onWrite, records);
  else await runUpdates2(dir, sessionId, ask, Date.now, onWrite, records, delegateReader(herdrTarget(process.env), run));
}
main().catch(() => process.exit(0));
