// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/update-main.ts
import { existsSync } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname5, join as join6 } from "node:path";
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

// src/host.ts
import { appendFile, mkdir as mkdir2, rename as rename2, rm, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2, join as join3 } from "node:path";

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

// ../hooks/status-limits.ts
var NAME_WORDS = 3;
var DESCRIPTION_WORDS = 8;
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var ASK_READ_WORDS = 30;
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
  goal: null,
  removedGoals: [],
  goalRemoved: null,
  milestones: [],
  nextMilestoneId: 1,
  serves: {},
  goalRefused: null
};
var STATUSES = ["working", "queued", "waits-on-other", "done", "dropped"];
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
var VERSION = /^v?\d+(\.\d+)+$/;
function namesOtherVersion(name, other) {
  const versions = (text2) => [...words(text2)].filter((w) => VERSION.test(w)).map((w) => w.replace(/^v/, ""));
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

// ../hooks/inline.ts
var INLINE = /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)|~~(?=\S)(.+?)(?<=\S)~~|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gi;
function httpsHref(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return null;
    const href = parsed.origin + [parsed.pathname, parsed.search, parsed.hash].join("").replace(/@/g, "%40");
    return href.length <= 2048 ? href : null;
  } catch {
    return null;
  }
}
function parseInline(text2, outer = {}) {
  const spans = [];
  let at = 0;
  for (const m of text2.matchAll(INLINE)) {
    if (m.index > at) spans.push({ ...outer, text: text2.slice(at, m.index) });
    const [, code, bold, strike, star, under, label, url] = m;
    if (code !== void 0) spans.push({ ...outer, text: code, code: true });
    else if (bold !== void 0) spans.push(...parseInline(bold, { ...outer, bold: true }));
    else if (strike !== void 0) spans.push(...parseInline(strike, { ...outer, strike: true }));
    else if (star !== void 0 || under !== void 0)
      spans.push({ ...outer, text: star ?? under ?? "", italic: true });
    else {
      const href = httpsHref(url ?? "");
      spans.push(
        href ? { ...outer, text: label ?? "", link: href } : { ...outer, text: `${label ?? ""} (${url ?? ""})` }
      );
    }
    at = m.index + m[0].length;
  }
  if (at < text2.length) spans.push({ ...outer, text: text2.slice(at) });
  return spans;
}
function linkLabel(text2) {
  return parseInline(text2).map((span) => span.text).join("");
}

// ../hooks/ask-match.ts
var CLOSED_CONTEXT_LIMIT = 12;
var MAX_UNRECORDED_DECISIONS = 12;
var MAX_UNRECORDED_ASK = 200;
var MAX_UNRECORDED_QUOTE = 160;
function cleanUnrecordedText(text2, max) {
  return text2.replace(/[\p{Cc}\u2028\u2029]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function words2(text2) {
  return text2.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec) return null;
  const named = new Set(words2(linkLabel(rec)));
  let best = null;
  for (const option of options) {
    const w = words2(linkLabel(option));
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
function repeatsClosed(closed, a, since, isPersonsAnswer2, closedFindings = []) {
  const context = closed.slice(-CLOSED_CONTEXT_LIMIT);
  const recent = context.filter((c) => c.at >= since && !isAskedForChoices(c));
  const settled = context.filter((c) => c.at < since && !canAskAgain(c, isPersonsAnswer2));
  return matchOpen(recent, a) >= 0 || a.label !== null && recent.some((c) => c.label === a.label) || settled.some((c) => repeatsSettled(c, a)) || dismissedFindingOf(closedFindings, a.ask) !== void 0;
}
function canAskAgain(c, isPersonsAnswer2) {
  return c.how === "expired" || c.how === "claude" || c.how === "update" && !isPersonsAnswer2(c.outcome);
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

// ../hooks/ledger-close.ts
var MAX_CLOSED = 12;
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now, askedAs) {
  return { ...finding, ...askedAs ? { askedAs } : {}, ...closing, closedAt: now };
}
function closeItem(ledger, id, closing, now) {
  if (ledger.items.some((i) => i.id === id && i.sourceManaged)) return ledger;
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
var OSC8 = /\x1b\]8;[^;\x07\x1b]*;[^\x07\x1b]*(?:\x07|\x1b\\)/g;
var ANSI_TOKEN = new RegExp(`\\x1b\\[[0-9;]*m|${OSC8.source}`, "g");
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

// ../hooks/reply-parse.ts
var NL3 = "\n";
var MAX_HELPS = 3;
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
var NEEDS_PERSON = /(?:^|[\s;&|])(?:login|logout|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen)(?=[\s:]|$)|\binit --interactive\b/i;
var PERSON_ONLY_REASON = /credential|password|passphrase|secret|\btoken|\b2fa\b|\bmfa\b|\bdevice\b|phone|android|tablet|account|sign(?:ed)?[- ]?in|log(?:ged)?[- ]?in|only you|you hold|your (?:mac|machine|laptop|computer|keychain)|\bsudo\b/i;
function recordedAsksOnly(u, ledger, isPersonsAnswer2, promptAt = 0) {
  const stillAsked = new Set(u.updated.filter((c) => c.options || c.rec).map((c) => c.id));
  const recorded = new Set(ledger.items.filter((i) => i.from === "record").map((i) => i.id));
  const candidates = [
    ...ledger.unrecordedDecisions ?? [],
    ...u.added.flatMap(({ kind, ask, quote }) => {
      if (!quote) return [];
      const cleanAsk = cleanUnrecordedText(ask, MAX_UNRECORDED_ASK);
      const cleanQuote = cleanUnrecordedText(quote, MAX_UNRECORDED_QUOTE);
      return cleanAsk && cleanQuote ? [{ kind, ask: cleanAsk, quote: cleanQuote }] : [];
    })
  ];
  const unrecordedDecisions = [];
  for (const candidate of candidates) {
    const item = candidateItem(candidate);
    if (!candidate.ask || !candidate.quote || matchOpen(ledger.items, item) >= 0 || repeatsClosed(ledger.closed ?? [], item, promptAt, isPersonsAnswer2, ledger.closedFindings ?? []) || unrecordedDecisions.some((previous) => previous.kind === candidate.kind && sameAsk(previous.ask, candidate.ask)))
      continue;
    unrecordedDecisions.push(candidate);
  }
  return {
    ...u,
    closed: u.closed.filter(
      (c) => (!/^i\d+$/.test(c.id) || !recorded.has(c.id) && isPersonsAnswer2(c.outcome)) && !stillAsked.has(c.id)
    ),
    added: [],
    updated: [],
    unrecordedDecisions: unrecordedDecisions.slice(-MAX_UNRECORDED_DECISIONS)
  };
}
function candidateItem(candidate) {
  return { ...candidate, label: null, options: [], rec: null, helps: [] };
}
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
function parseReply(text2, source = null, quoteSource = source) {
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
      const quoteField = rest.length > 3 ? rest.pop() : null;
      const quote = quoteField && quoteField.length <= MAX_UNRECORDED_QUOTE && quoteSource?.includes(quoteField) ? cleanUnrecordedText(quoteField, MAX_UNRECORDED_QUOTE) || null : null;
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
        ...quote ? { quote } : {},
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

// ../hooks/ledger-update.ts
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
  const press2 = exchange.press;
  const talkedAboutId = press2 && SENT_PRESS_KINDS[press2.action] === "talk" ? press2.id : null;
  return applyUpdate(
    ledger,
    { ...update, closed: update.closed.filter((c) => c.id !== talkedAboutId) },
    now,
    exchange.turn,
    promptAt
  );
}
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");
function isPersonsAnswer(outcome) {
  return outcome.trim() !== "" && !NOT_AN_ANSWER.test(outcome);
}
function applyUpdate(ledger, u, now, turn, promptAt = now) {
  const feedIds = new Set(ledger.findings.filter((f) => f.feedOwned).map((f) => f.id));
  const sourceItemIds = new Set(ledger.items.filter((i) => i.sourceManaged).map((i) => i.id));
  const stillAsked = new Set(u.updated.filter((c) => c.options || c.rec).map((c) => c.id));
  const isPutOffFinding = (c) => ledger.findings.some((f) => f.id === c.id) && PUT_OFF2.test(c.outcome);
  const closing = new Map(
    u.closed.filter(
      (c) => !feedIds.has(c.id) && !sourceItemIds.has(c.id) && !stillAsked.has(c.id) && !UNFOUNDED_MOOT.test(c.outcome) && !isPutOffFinding(c)
    ).map((c) => [c.id, c.outcome])
  );
  const closed = [...ledger.closed];
  const items = [];
  for (const item of ledger.items) {
    if (item.sourceManaged) {
      items.push(item);
      continue;
    }
    const outcome = closing.get(item.id);
    const helps = u.helped.filter((h) => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps);
    const isQuestionBackOutcome = outcome !== void 0 && item.kind === "question" && isQuestionBack(outcome, item.options);
    const isClosing = outcome !== void 0 && !isQuestionBackOutcome && item.from !== "record";
    if (isClosing) closed.push(closedRecord(item, { outcome, how: "update" }, now));
    else items.push(withUpdate({ ...item, helps }, u.updated));
  }
  const recordedThisTurn = new Set(
    [...ledger.items, ...ledger.closed.flatMap((c) => c.item ?? [])].filter((i) => !i.sourceManaged && i.from === "record" && i.turn === turn).map((i) => i.kind)
  );
  let nextId = ledger.nextId;
  let added = 0;
  const addedIds = [];
  const created = /* @__PURE__ */ new Set();
  for (const a of u.added) {
    if (items.some((i) => i.sourceManaged && matchOpen([i], a) >= 0)) {
      addedIds.push(null);
      continue;
    }
    if (repeatsClosed(ledger.closed, a, promptAt, isPersonsAnswer, ledger.closedFindings)) {
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
    if (recordedThisTurn.has(a.kind)) {
      addedIds.push(null);
      continue;
    }
    const { quote: _quote, ...item } = a;
    items.push({ ...item, id: `i${nextId}`, turn, at: now, from: "update" });
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
    const isKnown = items.some((i) => restates(i.ask, work)) || ledger.findings.some((f) => !f.feedOwned && restates(f.title, work)) || repeatsClosed(ledger.closed, { ...todo, helps: [] }, promptAt, isPersonsAnswer);
    if (isKnown) continue;
    items.push({ ...todo, helps: [], id: `i${nextId}`, turn, at: now, from: "update" });
    nextId += 1;
    added += 1;
  }
  const askedBy = /* @__PURE__ */ new Map();
  for (const a of u.asked) {
    const id = typeof a.item === "number" ? addedIds[a.item] : a.item;
    const asker = items.find((i) => i.id === id);
    const finding = ledger.findings.find((f) => f.id === a.id);
    if (asker && finding && !finding.sourceManaged && asksAbout(asker, finding, true)) askedBy.set(a.id, asker.id);
  }
  for (const i of items.filter((i2) => created.has(i2.id)))
    for (const f of ledger.findings)
      if (!f.sourceManaged && !f.feedOwned && !askedBy.has(f.id) && asksAbout(i, f)) askedBy.set(f.id, i.id);
  const { findings, closedFindings } = ledger.findings.reduce((l, f) => {
    const asker = askedBy.get(f.id);
    const outcome = closing.get(f.id);
    if (outcome !== void 0) return closeFinding(l, f.id, { outcome, how: "update" }, now);
    return asker ? closeFinding(l, f.id, { outcome: `asked as ${asker}`, how: "update" }, now, asker) : l;
  }, ledger);
  return reopenAskedFindings(
    {
      ...ledger,
      items,
      unrecordedDecisions: u.unrecordedDecisions ?? ledger.unrecordedDecisions,
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
  if (old) return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time2(s?.changedAt);
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
  return Object.fromEntries(
    entries.slice(0, 200).filter(([id, at]) => (ids.has(id) || id.length <= 100) && (at === null || time2(at) !== null))
  );
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
    ...goal
  };
}

// ../hooks/ledger.ts
var EMPTY = {
  overview: null,
  items: [],
  unrecordedDecisions: [],
  closed: [],
  findings: [],
  closedFindings: [],
  untrackedWork: [],
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
    unrecordedDecisions: upgradeUnrecordedDecisions(rest.unrecordedDecisions),
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
function upgradeUnrecordedDecisions(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const { kind, ask, quote } = candidate;
    if (kind !== "question" && kind !== "task") return [];
    const cleanKind = kind;
    const clean = (text2, max) => typeof text2 === "string" ? cleanUnrecordedText(text2, max) : "";
    const cleanAsk = clean(ask, MAX_UNRECORDED_ASK);
    const cleanQuote = clean(quote, MAX_UNRECORDED_QUOTE);
    return cleanAsk && cleanQuote ? [{ kind: cleanKind, ask: cleanAsk, quote: cleanQuote }] : [];
  }).slice(-MAX_UNRECORDED_DECISIONS);
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

// ../hooks/session-version.ts
var SESSION_VERSION = 1;
function checkVersion(saved) {
  const version = saved.version ?? 1;
  if (version !== SESSION_VERSION) throw new Error(`Unsupported inbox state version: ${version}`);
}

// ../hooks/person-instructions.ts
var DEFAULT_PERSON_INSTRUCTIONS = "Write every free-text value in the same language as the person's messages in this conversation. Keep protocol keywords and labels in English.";
var MAX_PERSON_INSTRUCTIONS = 4e3;
function personInstructionsBlock(text2) {
  const content = text2 === null || text2.trim() === "" ? DEFAULT_PERSON_INSTRUCTIONS : Array.from(text2).slice(0, MAX_PERSON_INSTRUCTIONS).join("");
  return `Person's instructions:
${content}`;
}

// ../hooks/ledger-prompt.ts
var NL4 = "\n";
var MODEL_KIND = { question: "decide", task: "do" };
function systemText(host, instructions = null) {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : "";
  const system = `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec | design | origin
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items and findings the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again in other words.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: what the agent said this turn, in order
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text. When nothing in the exchange changes the ledger, answer with the one line NONE.

NONE: nothing in the exchange changes the ledger. Write it alone.
CLOSED: <id> | the outcome, at most 8 words, in one of three forms. Use CLOSED only for an item whose origin is update. Never write CLOSED for an agent-recorded item, even when the person answered it; the agent's close tool closes it when appropriate. When the person answered an update-origin item in <person>, write their answer. Otherwise write "done: <what the agent did>" when its work is done, or "no longer applies: <what in the reply or <activity> made it moot>". An option the agent picked on its own, or an option the work made moot, is not the person's answer: write it in the "done:" or "no longer applies:" form. One line for each update-origin item in <open> the reply or <activity> shows is done or no longer applies, or the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers). A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. An item that has nothing to do with this exchange stays open: being outside the current work, or not being mentioned, does not make it no longer apply.
FIXED: <id> | the change that fixed it, at most 8 words. One line for each finding in <findings> whose problem the reply, <activity> or <person> shows was fixed by a change to the work. Only a change fixes a finding. When the person puts a finding off, sets it aside or says it does not matter, write no FIXED line: it stays open until they dismiss it.
ASKED: <id> | <item>
  For a finding in <findings> that a NEW line or an item in <open> asks the person about. item: "new N" for the Nth NEW line in your answer, or an id from <open>. The item takes the finding's place, so the person sees it once.
NEW: <kind> | <label> | <ask> | <options> | <rec> | <design> | <quote>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide or do something about it now; then also write an ASKED line for it. Also one line per dialog in <activity> that the person dismissed or left unanswered, with an ASKED line when the dialog asks about a finding. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means. Name an item or finding by what it says, never by its id: the person does not see ids.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  design: "design" for a "decide" item whose options are designs or approaches the agent could try and show side by side, such as two layouts or two ways to build a feature. Otherwise "-", as for a fact, an approval or a preference.
  quote: a short, exact excerpt from <reply> supporting the ask, at most 160 characters; use "-" when none is available. Do not use a pipe or line break.
  Skip: rhetorical questions; offers to go on with the next step of the task the person already asked for ("Want me to start on the next file?"); FYIs; generic "let me know", though the agent holding an act that changes or publishes something (commit, push, mark a PR ready, edit a shared page) until the person agrees, or leaving to them such an act it could take once they agree, is a "decide" item ("Say when you want those committed", "If you agree, I'll update the runbook", "Mark PR #3040 ready for review?"); invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; news of a PR's failing checks, conflicts or review threads, and offers to fix them, since ${host.prsIn} shows each with its own press; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
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
  return `${system}

${personInstructionsBlock(instructions)}`;
}
function ledgerBlocks(ledger) {
  const open2 = ledger.items.filter((i) => !i.sourceManaged).map(
    (i) => `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? "-"} | ${i.ask} | ${i.options.join(" / ") || "-"} | ${i.rec ?? "-"} | ${i.isDesignChoice ? "design" : "-"} | ${i.from === "record" ? "record" : "update"}`
  ).join(NL4);
  const findings = ledger.findings.filter((f) => !f.feedOwned).map((f) => `${f.id} | ${f.kind}: ${f.title}`).join(NL4);
  const closed = ledger.closed.slice(-CLOSED_CONTEXT_LIMIT).filter((d) => d.how !== "expired" && !isAskedForChoices(d)).slice(-MAX_CLOSED).map((d) => `${d.ask} \u2192 ${outcomeText(d)}`);
  const dismissedFindings = ledger.closedFindings.filter((f) => f.how === "dismissed").slice(-MAX_CLOSED).map((f) => `${f.kind}: ${f.title} \u2192 ${outcomeText(f)}`);
  const decided = [...closed, ...dismissedFindings].join(NL4);
  return [
    `<open>${NL4}${open2}${NL4}</open>`,
    `<findings>${NL4}${findings}${NL4}</findings>`,
    `<decided>${NL4}${decided}${NL4}</decided>`
  ];
}
function buildPrompt(ledger, ex) {
  const person = personText(ex.person, ex.trigger);
  return [
    ...ledgerBlocks(ledger),
    `<person>${NL4}${clipMiddle(person, 4e3, 1500)}${NL4}</person>`,
    `<activity>${NL4}${clipMiddle(ex.activity.join(NL4), 2500, 500)}${NL4}</activity>`,
    `<reply>${NL4}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL4}</reply>`,
    `<screen>${NL4}${ex.screen}${NL4}</screen>`
  ].join(NL4);
}
function personText(person, trigger) {
  return person ?? `(The person sent nothing. The turn was started by: ${trigger ?? "unknown"}.)`;
}
function outcomeText(d) {
  switch (d.how) {
    case "answered":
      return `answered by the user: ${d.outcome}`;
    case "done":
      return `marked done by the user: ${d.outcome}`;
    case "dismissed":
      return "dismissed by the user";
    case "expired":
      return "expired before the user answered";
    case "claude":
      return `closed by the agent: ${d.outcome.replace(/^closed by [^:]+:\s*/i, "")}`;
    case "update":
      return `closed by the inbox: ${d.outcome}`;
  }
}

// ../hooks/inbox-text.ts
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
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => !i.sourceManaged && i.turn === ledger.batchTurn);
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

// ../hooks/last-actions.ts
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
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((raw) => {
    const t = recordOf(raw);
    const status = STATUSES2[String(t.status)];
    return typeof t.id === "string" && typeof t.text === "string" && t.text !== "" && status ? [{ id: t.id, text: t.text, status }] : [];
  });
}

// ../hooks/task-tree.ts
var TASK_NOTES_LIMIT = 40;
var TASK_NOTE_LENGTH = 2e3;
function notesOf(notes) {
  return notes.slice(0, TASK_NOTES_LIMIT).map((note) => note.slice(0, TASK_NOTE_LENGTH));
}
function taskRootGroups(tree) {
  const groups = /* @__PURE__ */ new Map();
  for (const task of tree.filter((task2) => task2.parentId === null)) {
    const key = task.streamId ? `stream:${task.streamId}` : `task:${task.id}`;
    const roots = groups.get(key);
    if (roots) roots.push(task);
    else groups.set(key, [task]);
  }
  return [...groups.values()].map((roots) => ({ id: roots[0].id, roots }));
}
function weightedTaskProgress(tree, rootIds) {
  const children = /* @__PURE__ */ new Map();
  for (const task of tree) children.set(task.parentId, [...children.get(task.parentId) ?? [], task]);
  const progress = (task) => {
    if (task.status === "done") return 1;
    if (task.status === "dropped") return 0;
    return weightedAverage((children.get(task.id) ?? []).map((child) => [progress(child), child.weight]));
  };
  const roots = rootIds === void 0 ? children.get(null) ?? [] : tree.filter((task) => Array.isArray(rootIds) ? rootIds.includes(task.id) : task.id === rootIds);
  return weightedAverage(roots.map((task) => [progress(task), task.weight]));
}
function weightedAverage(values) {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0);
  return total ? values.reduce((sum, [value, weight]) => sum + value * weight, 0) / total : 0;
}
function weightedTaskProgressSegments(tree, stalledTasks = /* @__PURE__ */ new Set(), rootId) {
  const children = /* @__PURE__ */ new Map();
  for (const task of tree) children.set(task.parentId, [...children.get(task.parentId) ?? [], task]);
  const segments = { total: 0, done: 0, working: 0, stalled: 0, waiting: 0, queued: 0 };
  const add = (task, weight, path) => {
    if (task.status === "dropped" || path.has(task.id)) return;
    if (task.status === "done") {
      segments.total += weight;
      segments.done += weight;
      return;
    }
    const descendants = children.get(task.id) ?? [];
    const active = descendants.filter((child) => child.status !== "dropped");
    if (active.length > 0) {
      const total = active.reduce((sum, child) => sum + child.weight, 0);
      const nextPath = new Set(path).add(task.id);
      for (const child of active) add(child, weight * child.weight / total, nextPath);
      return;
    }
    segments.total += weight;
    if (task.status === "working") segments[stalledTasks.has(task.id) ? "stalled" : "working"] += weight;
    else if (task.status === "waits-on-other") segments.waiting += weight;
    else segments.queued += weight;
  };
  for (const root of children.get(null) ?? [])
    if (rootId === void 0 || root.id === rootId) add(root, root.weight, /* @__PURE__ */ new Set());
  return segments;
}
function taskTreeFromStatus(status) {
  if (!status) return [];
  const goalId = status.goal && !status.goal.isAwaitingMilestones ? `goal-${status.goal.setAt}` : void 0;
  const milestones = status.milestones.map((milestone) => {
    const node = {
      id: milestone.id,
      parentId: null,
      status: milestone.status,
      weight: 1,
      title: milestone.name,
      detail: milestone.text,
      notes: notesOf(milestone.was ? [milestone.was] : []),
      createdAt: milestone.changedAt,
      updatedAt: milestone.closedAt ?? milestone.changedAt,
      history: [{ at: milestone.changedAt, source: "status", kind: "imported" }],
      ...goalId ? { goalId } : {}
    };
    if (milestone.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: milestone.closedAt,
          source: "status",
          kind: milestone.status === "done" ? "completed" : "updated",
          detail: milestone.status
        }
      ];
    }
    return node;
  });
  const milestoneIds = new Set(milestones.map((node) => node.id));
  const subjectIds = new Set(status.subjects.map((subject) => subject.id));
  const subjects = status.subjects.map((subject) => {
    const served = status.serves[subject.id];
    const milestoneId = typeof served === "string" && served !== "none" && milestoneIds.has(served) ? served : null;
    const mergedIntoId = subject.into && subjectIds.has(subject.into) ? subject.into : void 0;
    const parentId = milestoneId;
    const notes = notesOf([subject.was, subject.merged].filter((note) => note !== null));
    const node = {
      id: subject.id,
      parentId,
      status: subject.status,
      weight: 1,
      title: subject.name,
      detail: subject.text,
      notes,
      createdAt: subject.createdAt,
      updatedAt: subject.closedAt ?? subject.changedAt,
      history: [
        { at: subject.createdAt, source: "status", kind: "created" },
        { at: subject.changedAt, source: "status", kind: "imported" }
      ],
      ...goalId && milestoneId ? { goalId } : {},
      ...mergedIntoId ? { mergedIntoId } : {}
    };
    if (subject.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: subject.closedAt,
          source: "status",
          kind: subject.status === "done" ? "completed" : "updated",
          detail: subject.status
        }
      ];
    }
    return node;
  });
  return [...milestones, ...subjects];
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
  const run2 = c.bucket === "cancelled" ? runOf(c) : null;
  return run2 ? pr.checks.find((f) => f.bucket === "fail" && isSameRun(run2, runOf(f))) ?? null : null;
}
function blockingChecks(pr) {
  return [...failingChecks(pr), ...cancelledChecks(pr).filter((c) => !failedSibling(pr, c))];
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

// ../hooks/presses.ts
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}

// ../hooks/open-targets.ts
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}

// ../hooks/help-steps.ts
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
function stepIconKind(step) {
  if (!step) return void 0;
  if (step.step.some((h) => h.kind === "run")) return "run";
  const first = step.step[0]?.kind;
  return first === "copy" || first === "terminal" ? "copy" : first === "open" || first === "link" ? "open" : void 0;
}

// ../hooks/press-labels.ts
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text2) {
  return text2.charAt(0).toUpperCase() + text2.slice(1);
}
var ISSUE_LABEL = "File issue";

// ../hooks/status-goal-gate.ts
var goalTaskId = (goal) => `goal-${goal.setAt}`;
var tasksForGoal = (tree, goal) => tree.filter((task) => task.goalId === goalTaskId(goal));
function isGoalMet(goal, tree) {
  const tasks = goal === null ? [] : tasksForGoal(tree, goal);
  return tasks.length > 0 && tasks.every((task) => task.status === "done" || task.status === "dropped");
}
var lastProgressAt = (goal, tree) => Math.max(goal.setAt, ...tasksForGoal(tree, goal).map((task) => task.updatedAt));
function goalLeftFor(o, tree, now) {
  const goal = o.goal;
  if (goal === null || goal.source !== "inferred" || tasksForGoal(tree, goal).length) return null;
  const left = now - lastProgressAt(goal, tree);
  return left >= GOAL_LEFT_MS ? left : null;
}
function refusalOf(o, tree, kind, now) {
  const goal = o.goal;
  if (goal === null || isGoalMet(goal, tree)) return goal === null && kind === "retire" ? "met" : null;
  if (goal.source === "typed") return "typed";
  if (tasksForGoal(tree, goal).some((task) => task.status !== "done" && task.status !== "dropped")) return "work-open";
  return goalLeftFor(o, tree, now) === null ? "moved" : null;
}
var goalRefusal = (o, start, tree, kind, now) => {
  const why = refusalOf(o, tree, kind, now);
  if (why === null || start === o || o.goal?.setAt !== start.goal?.setAt) return why;
  return refusalOf(start, tree, kind, now) === null ? null : why;
};

// ../hooks/status-goal-ops.ts
var RESTATED_SHARE = 0.8;
function restatesGoal(text2, goal) {
  const own = [...stems(text2)], theirs = stems(goal);
  const shared = own.filter((word) => theirs.has(word)).length, hasNewNumber = own.some((word) => /\d/.test(word) && !theirs.has(word));
  return own.length > 0 && !hasNewNumber && shared >= RESTATED_SHARE * own.length;
}
function hasSameWords(a, b) {
  const [x, y] = [words(a), words(b)];
  return x.size === y.size && [...x].every((word) => y.has(word));
}
function setGoal(o, text2, now, source) {
  return {
    ...o,
    goal: { text: text2, setAt: now, metAt: null, was: o.goal?.text ?? null, isAwaitingMilestones: true, source },
    goalRemoved: null,
    goalRefused: null
  };
}
function goalLineRefusal(o, op) {
  const text2 = clipWords(op.text, DESCRIPTION_KEPT);
  return [o.goal?.text, o.goal?.was, ...o.removedGoals].some((old) => old != null && restatesGoal(text2, old)) ? "restates" : null;
}
function applyGoalOp(o, op, now, tree, start = o) {
  const why = op.kind === "goal" ? goalLineRefusal(o, op) : null;
  const refused = why ?? goalRefusal(o, start, tree, op.kind, now);
  if (refused !== null) return { ...o, goalRefused: { line: op.kind, why: refused } };
  if (op.kind === "retire") return { ...o, goal: null, goalRefused: null };
  return setGoal(o, clipWords(op.text, DESCRIPTION_KEPT), now, "inferred");
}
function settleGoal(saved, tree, now) {
  const goal = saved.goal;
  if (goal === null) return saved;
  const linked = tasksForGoal(tree, goal);
  const awaiting = linked.length === 0;
  const was = saved.lastLookAt !== null && goal.setAt <= saved.lastLookAt ? null : goal.was;
  const metAt = linked.length > 0 && linked.every((task) => task.status === "done" || task.status === "dropped") ? goal.metAt ?? now : null;
  if (awaiting === goal.isAwaitingMilestones && metAt === goal.metAt && was === goal.was) return saved;
  return { ...saved, goal: { ...goal, isAwaitingMilestones: awaiting, metAt, was } };
}

// ../hooks/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\u{1F9ED}" },
  { id: "needsYou", label: "Asks", symbol: "\u{1F64B}" },
  { id: "findings", label: "Finds", symbol: "\u{1F50D}" },
  { id: "prs", label: "PRs", symbol: "\u{1F500}" },
  { id: "timeline", label: "Timeline", symbol: "\u25F7" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var NEXT_BUILD_TABS = numbered(TAB_NAMES.filter((t) => t.id !== "timeline"));
var NEXT_BUILD_TIMELINE_TABS = numbered(TAB_NAMES);
var RELEASE_TABS = numbered(TAB_NAMES.filter((t) => t.id !== "overview" && t.id !== "timeline"));
function isListedTab(tab) {
  return tab === "needsYou" || tab === "findings";
}
function isRowTab(tab) {
  return tab !== "overview" && tab !== "timeline";
}
function isShownTab(raw) {
  return TAB_NAMES.some((t) => t.id === raw);
}
function screenTabOf(tab) {
  return { label: TAB_NAMES.find((t) => t.id === tab)?.label ?? tab, isPage: !isRowTab(tab) };
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));
var LISTED_TABS = TAB_NAMES.filter((t) => isListedTab(t.id));

// ../hooks/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "\u25B2", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "\u2726", tone: "done" },
  progress: { title: "Progress", mark: "\u21BB", tone: "findings" }
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
var IDLE_MARK = { mark: "\u25D0", tone: null };
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
  },
  {
    mark: FINDING_GROUPS.progress.mark,
    tone: FINDING_GROUPS.progress.tone,
    isRunning: false,
    words: "Progress reported by the feed"
  }
];
var STATUS_ONLY_MARKS = /* @__PURE__ */ new Set([IDLE_MARK.mark, SUBJECT_MARKS.queued.mark, SUBJECT_MARKS["waits-on-other"].mark]);

// ../hooks/pressed.ts
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

// ../hooks/status-children.ts
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function asksText(o, asks) {
  return asks.map((a) => `${a.id} | ${clipWords(a.ask, ASK_READ_WORDS)} | ${o?.askSubjects[a.id]?.join(", ") || "-"}`).join(NL);
}
function runningText(o, now) {
  return (o?.children ?? []).filter((c) => isChildRunning(c, now)).map((c) => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? "-"}`).join(NL);
}

// ../hooks/status-goal-page.ts
var GOAL_HEADING = "Goal";
function oldestAsk(items, links, id) {
  const oldest = items.filter((item) => links[item.id]?.includes(id)).sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity))[0];
  return oldest ? { id: oldest.id, kind: oldest.kind } : null;
}
function goalPage(o, _items, tree) {
  const goal = o?.goal ?? null;
  if (o === null || goal === null) return { goal: null, canRestoreGoal: o?.goalRemoved != null };
  const linked = tasksForGoal(tree, goal);
  const isMet = isGoalMet(goal, tree);
  const awaiting = linked.length === 0;
  const done = linked.filter((task) => task.status === "done").length;
  const was = goal.was !== null && (o.lastLookAt === null || goal.setAt > o.lastLookAt) ? goal.was : null;
  return {
    goal: {
      label: isMet ? "Goal met" : GOAL_HEADING,
      text: goal.text,
      count: isMet || awaiting ? null : `${done} of ${linked.filter((task) => task.status !== "dropped").length} tasks done`,
      isMet,
      was,
      now: o.head ? `Now: ${o.head.description || o.head.title}` : null,
      awaiting: awaiting ? "No tasks linked yet" : null,
      milestones: []
    },
    canRestoreGoal: false
  };
}

// ../hooks/status-page-parts.ts
var CHILD_ROWS = 3;
var CHILD_MARK = { mark: SUBJECT_MARKS.working.mark, tone: null };
function isFinishedUnseen(c, lastLookAt) {
  return c.delegateState === "finished" && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt);
}
var DAY_MS = 24 * 60 * 6e4;
function subjectStall(x, isHeld, isWorkRunning, now) {
  if (isHeld) return { text: "waiting", tone: "needsYou" };
  const idleMs = now - x.changedAt;
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS;
  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: "muted" } : null;
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
function childStall(c) {
  if (c.delegateState === "finished") return { text: "finished", tone: "done" };
  if (c.delegateState === "blocked") return { text: "waiting", tone: "needsYou" };
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
var looseChildRows = (children, depth) => children.map((c) => childRow(c, null, depth));
function partRows(shown, c, depth, afterOpen = [], afterClosed = []) {
  const rows = [];
  const firstClosed = shown.findIndex((x) => !isOpen(x));
  for (const [i, x] of shown.entries()) {
    if (i === firstClosed) rows.push(...afterOpen);
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

// ../hooks/status-page.ts
var STATUS_FAILED = "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply.";
function statusOf(roots) {
  if (roots.every((task) => task.status === "done" || task.status === "dropped"))
    return roots.some((task) => task.status === "done") ? "done" : "dropped";
  if (roots.some((task) => task.status === "working")) return "working";
  return roots.some((task) => task.status === "waits-on-other") ? "waits-on-other" : "queued";
}
function statusPage(s, now, stalledTasks = /* @__PURE__ */ new Set()) {
  const o = s.ledger.overview;
  const tree = s.taskTree ?? [];
  const byId = new Map(tree.map((task) => [task.id, task]));
  const groups = taskRootGroups(tree);
  const rootIds = new Map(groups.flatMap((group) => group.roots.map((root) => [root.id, group.id])));
  const rootIdOf = (id) => {
    let task = id === null ? void 0 : byId.get(id);
    while (task?.parentId !== null && task?.parentId !== void 0) task = byId.get(task.parentId);
    return task ? rootIds.get(task.id) ?? task.id : null;
  };
  const openAskIds = new Set(s.ledger.items.map((item) => item.id));
  const askLinks = Object.fromEntries(
    Object.entries(o?.askSubjects ?? {}).filter(([ask]) => openAskIds.has(ask)).map(([ask, ids]) => [ask, [...new Set(ids.map(rootIdOf).filter((id) => id !== null))]])
  );
  const heldIds = new Set(Object.values(askLinks).flat());
  const lastLookAt = o?.lastLookAt ?? null;
  const missed = o?.missedInLastLook ?? {};
  const runningChildren = (o?.children ?? []).filter((child) => isChildRunning(child, now) || isFinishedUnseen(child, lastLookAt)).map((child) => ({ ...child, subjectId: rootIdOf(child.subjectId) })).sort((a, b) => (b.lastActivityAt ?? b.startedAt) - (a.lastActivityAt ?? a.startedAt));
  const taskRows = groups.map(({ id, roots }) => {
    const detail = roots.map((task) => task.detail).filter(Boolean).join("; ");
    const progress = Math.round(weightedTaskProgress(tree, roots.map((task) => task.id)) * 100);
    const changedAt = Math.max(...roots.map((task) => task.updatedAt));
    const closed = roots.every((task) => task.status === "done" || task.status === "dropped");
    return {
      id,
      name: roots.map((task) => task.title).join(", "),
      status: statusOf(roots),
      text: `${progress}% complete${detail ? ` \xB7 ${detail}` : ""}`,
      createdAt: Math.min(...roots.map((task) => task.createdAt)),
      changedAt,
      closedAt: closed ? changedAt : null,
      was: null,
      merged: null,
      into: null
    };
  });
  const place = { working: 0, "waits-on-other": 1, queued: 2, done: 3, dropped: 3 };
  taskRows.sort((a, b) => Number(heldIds.has(b.id)) - Number(heldIds.has(a.id)) || place[a.status] - place[b.status] || b.changedAt - a.changedAt);
  const isNew = (task) => {
    const seenAt = task.id in missed ? missed[task.id] : lastLookAt;
    return seenAt === null || seenAt === void 0 || task.changedAt > seenAt;
  };
  const isHeld = (task) => isOpen(task) && heldIds.has(task.id);
  const oldestAskOf = (task) => isHeld(task) ? oldestAsk(s.ledger.items, askLinks, task.id) : null;
  const ctx = {
    isNew,
    isHeld,
    oldestAskOf,
    running: runningChildren,
    isTurnRunning: s.presence.isTurnRunning,
    now
  };
  const shown = taskRows.filter((task) => isOpen(task) || isNew(task));
  const done = taskRows.filter((task) => task.status === "done" && !isNew(task));
  const shownIds = new Set(shown.map((task) => task.id));
  const loose = runningChildren.filter((child) => child.subjectId === null || !shownIds.has(child.subjectId));
  const rows = [...looseChildRows(loose, 0), ...partRows(shown, ctx, 0)];
  if (done.length > 0)
    rows.push({
      kind: "done-fold",
      id: "done",
      depth: 0,
      text: `${done.length} done`,
      rows: partRows(done, { ...ctx, running: [] }, 1)
    });
  const goalParts = goalPage(o, s.ledger.items, tree);
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null;
  return {
    isEmpty: head === null && rows.length === 0 && goalParts.goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    rows,
    progressSegments: weightedTaskProgressSegments(tree, stalledTasks),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: "Status",
      hint: "What this session's work is for, where each top-level task stands, and what changed."
    }
  };
}

// ../hooks/timing.ts
var SETTLED_MS = 5120;
var QUEUED_AFTER_MS = 1e3;
var COMPARE_LIMIT_MS = 30 * 6e4;
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - last.at >= QUEUED_AFTER_MS;
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

// ../hooks/rows.ts
var OPTIONS_FOLD_AT = 5;
var OPTION_LABEL_CHARS = 32;
var DOT = "\u2007\xB7\u2002";
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
  send: "Send",
  cancel: "Cancel",
  discard: "Discard",
  clickField: "Click the field to type",
  relevantFile: "Relevant file: ",
  allOptions: (count) => `All ${count} options`,
  undo: "Undo",
  reopen: "Reopen"
};
function recLineOf(item) {
  return item?.rec && item.recReason ? `Why ${item.rec}: ${item.recReason}` : null;
}
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  if (!descriptions) return [];
  return actions.flatMap((a) => {
    if (a.press.action !== "answer" || !Object.hasOwn(descriptions, a.press.option)) return [];
    const description = descriptions[a.press.option];
    return [{ label: clipLabel(linkLabel(a.press.option), OPTION_LABEL_CHARS), description, isFolded: a.isFolded }];
  });
}
function isWaitingRow(row) {
  return row.state.is === "open";
}
var RUNNING_RESULT = { text: RUNNING_MARK, isRunning: true };
function isSendMoving(delivery) {
  return delivery === "sending" || delivery === "queued";
}
function shortAgo(ms) {
  const age = ago(ms);
  return age === "just now" ? "now" : age.replace(/ ago$/, "");
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
function closedMark(state, delivery) {
  if (isSendMoving(delivery)) return RUNNING_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(c.outcome);
}

// ../hooks/feedback.ts
function pressUnderWaySince(f) {
  if (f?.is === "working" || f?.is === "sending") return f.at;
  return f?.is === "local" && f.result.state === "pending" ? f.result.at : null;
}
function feedbackOf(id, last, note, turns, now, reportedAt) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS)) return { is: "local", result };
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
  if (last.kind === "talk" && working && (isAwaiting || isUnreported && !isPastLimit))
    return { is: "working", label: working, at: last.at };
  if (pending === "sending")
    return { is: "sending", label: deliveryLabel("sending", last.text, last.reply), at: last.at };
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
function doneLabel(last) {
  return DONE_LABELS[last.action]?.(last.text) ?? last.text;
}
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

// ../hooks/gh.ts
var GH_TIMEOUT_MS = 2e4;
var UNSTARTABLE_CODE = -1;
var TIMED_OUT_CODE = -2;

// ../hooks/pr-fetch.ts
var MAX_PRS = 12;
var MAX_ORDERED_PRS = 30;
var CLOSED_PR_REFRESH_MS = 60 * 6e4;
var LIMIT_RETRY_MS = 5 * 6e4;
function tabPrs(links) {
  const order = links.prOrder;
  const ranked = (order?.refs ?? []).filter((ref) => !links.prs.includes(ref) && !order?.dismissed.includes(ref));
  return [...links.prs, ...ranked];
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
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1e3} seconds`;

// ../hooks/pr-press.ts
var RERUN_LABEL = "Re-run";
var PR_FIX_LABELS = {
  "pr-conflicts": "Resolve conflicts",
  "check-fix": "Fix"
};
var PR_READ_FIRST_LABELS = {
  ...PR_FIX_LABELS,
  "check-rerun": RERUN_LABEL
};
function lastPressOf(presses, rowId) {
  const last = presses.lastActions[rowId];
  const feedback = pressFeedbackIn(rowId, { is: "open" }, last, presses.turns, presses.now);
  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) };
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}

// ../hooks/pr-refresh.ts
var PR_REFRESH_LABEL = "Refresh PRs";
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

// ../hooks/saved-check-keys.ts
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

// ../hooks/task-reminder.ts
var TASK_REMINDER_THRESHOLD = 24;
var NO_TASK_REMINDER = { callsSinceTasks: 0, hasUsedTasks: false };
function taskReminderState(value) {
  if (!value || typeof value !== "object") return NO_TASK_REMINDER;
  const saved = value;
  return {
    callsSinceTasks: typeof saved.callsSinceTasks === "number" && Number.isSafeInteger(saved.callsSinceTasks) ? Math.max(0, Math.min(TASK_REMINDER_THRESHOLD, saved.callsSinceTasks)) : 0,
    hasUsedTasks: saved.hasUsedTasks === true
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
    taskTree: [],
    taskPrStates: {},
    taskFactWarnings: [],
    taskOwnerFacts: {},
    taskOwnerFactCheckedAt: null,
    taskOwnerFactCursor: null,
    taskPrFactCursor: null,
    taskReminder: NO_TASK_REMINDER,
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
function sessionFile(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return `${sessionId}.json`;
}
function missingAsNull(err) {
  if (err.code === "ENOENT") return null;
  throw err;
}
function savedToolFields(saved) {
  const isNames = (v) => Array.isArray(v) && v.every((f) => typeof f === "string");
  const fields2 = saved;
  if (!fields2 || !isNames(fields2.record) || !isNames(fields2.close) || !isNames(fields2.order_prs)) return null;
  if (fields2.tasks !== void 0 && !isNames(fields2.tasks)) return null;
  return { record: fields2.record, close: fields2.close, order_prs: fields2.order_prs, tasks: fields2.tasks ?? [] };
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
  const ledger = saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger;
  const taskOwnerFacts = Object.fromEntries(
    Object.entries(saved.taskOwnerFacts ?? {}).filter(
      (entry) => entry[0].length <= 256 && !!entry[1] && typeof entry[1] === "object" && ["working", "idle", "blocked", "done"].includes(entry[1].state) && Number.isFinite(entry[1].since) && entry[1].since >= 0
    ).slice(-200)
  );
  return {
    ledger,
    taskTree: Array.isArray(saved.taskTree) ? saved.taskTree : taskTreeFromStatus(ledger.overview),
    taskPrStates: Object.fromEntries(
      Object.entries(saved.taskPrStates ?? {}).filter(
        (entry) => entry[1] === "OPEN" || entry[1] === "CLOSED" || entry[1] === "MERGED"
      )
    ),
    taskFactWarnings: saved.taskFactWarnings ?? [],
    taskOwnerFacts,
    taskOwnerFactCheckedAt: Number.isFinite(saved.taskOwnerFactCheckedAt) && saved.taskOwnerFactCheckedAt >= 0 ? saved.taskOwnerFactCheckedAt : null,
    taskOwnerFactCursor: typeof saved.taskOwnerFactCursor === "string" && saved.taskOwnerFactCursor.length <= 256 ? saved.taskOwnerFactCursor : null,
    taskPrFactCursor: saved.taskPrFactCursor ?? null,
    taskReminder: taskReminderState(saved.taskReminder),
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
    callFailures: { ...NO_CALL_FAILURES, ...saved.callFailures },
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    overviewTurn: saved.overviewTurn ?? 0,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map((q) => ({ ...q, descriptions: q.descriptions ?? {} })),
    toolFields: savedToolFields(saved.toolFields)
  };
}

// ../hooks/catch-up-text.ts
var CATCH_UP = "The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>.";
function transcriptCatchUpPrompt(ledger, screen, transcript) {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<conversation>${NL4}${numberBlocks(transcript)}${NL4}</conversation>`,
    `<screen>${NL4}${screen}${NL4}</screen>`
  ].join(NL4);
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

// ../hooks/pr-views.ts
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
function isViewKept(prState, links, lastActions, ref, shownSince) {
  const at = dismissedAt(lastActions, ref);
  return keepsView(prState, links, ref) || at !== null && isShownSince(at, shownSince);
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
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: "open" } }];
    const mark = dismissal(lastActions, pr.ref);
    if (mark === null) return [];
    const state = settledPrState(mark, now, settleWindowMs);
    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : [];
  });
  let rank = 0;
  return drawn.map((d) => ({ ...d, rank: rankOf(d.pr, ranked) === null ? null : ++rank }));
}

// ../hooks/pr-order.ts
var RANK_AGAIN_LABEL = "Rank again";
function prOrderText(order, drawn, now) {
  const isRanking = drawn.some((d) => d.rank !== null);
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

// ../hooks/pr-tab.ts
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

// ../hooks/tool-schemas.ts
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
      description: "For a question or task: what you need from the user, in at most 12 words, readable without your reply. Links as [label](https://\u2026); a link counts as its label."
    },
    context: {
      type: "string",
      description: "For a question: why it came up, in at most 20 plain words, so the user can answer without reading back through the conversation."
    },
    options: {
      type: "array",
      items: { type: "string" },
      description: "For a question: the answers the user can pick, at most 5 words each. Give at least one. A link here shows only its label; put the page behind an option in detail or steps."
    },
    option_notes: {
      type: "array",
      items: { type: "string" },
      description: "For a question: one note for each option, in the order of options, saying what picking it does, in at most 12 words each."
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
      description: "For a task: up to 3 things the user can do in one press, each written as a command, a file path or a [label](https://\u2026) link. For a question: up to 3 files or links that help the user decide, such as a page comparing the options, each file as an absolute path."
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
    title: {
      type: "string",
      description: "For a finding: what it is, in at most 12 words. Links as [label](https://\u2026); a link counts as its label."
    },
    detail: {
      type: "string",
      description: "For a question or task: why you ask and what it holds up; for a question, what each option leads to. For a finding: why it matters and what you would do. Use short paragraphs. Links as [label](https://\u2026)."
    },
    path: { type: "string", description: "For a finding: the file it is about, if one." },
    document: {
      type: "string",
      description: "For a Markdown report the user should read in the inbox: its absolute local file path."
    }
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
var TASKS_SCHEMA = {
  type: "object",
  properties: {
    operation: {
      type: "string",
      enum: ["add", "update", "move", "complete", "note"],
      description: "Add a task, update its facts, move it, complete it, or add a note."
    },
    task_id: { type: "string", description: "A stable id for add, or the existing task id for other operations." },
    parent_id: {
      type: ["string", "null"],
      description: "For add or move: the parent task id. Use null to put the task at the root."
    },
    title: { type: "string", description: "For add or update: a short title, at most 100 characters." },
    detail: { type: "string", description: "For add or update: task detail, at most 2000 characters." },
    status: {
      type: "string",
      enum: ["working", "queued", "waits-on-other", "done", "dropped"],
      description: "For add or update: the task status."
    },
    weight: { type: "number", description: "For add or update: a sibling-relative weight from 0.1 to 100." },
    pr: {
      type: ["string", "null"],
      description: "For add or update: a GitHub pull request URL, https://github.com/owner/repo/pull/123. Use null to clear."
    },
    issue: {
      type: ["string", "null"],
      description: "For add or update: a GitHub issue URL, https://github.com/owner/repo/issues/123. Use null to clear."
    },
    owner_agent: {
      type: ["string", "null"],
      description: "For add or update: the Herdr owner agent name, matching [a-z][a-z0-9_-]{0,31}. Add with owner_machine; on update, it can change alone. Use null alone to clear the owner."
    },
    owner_machine: {
      type: ["string", "null"],
      description: "For add or update: the Herdr machine alias (use local for this machine), up to 100 characters. Add with owner_agent; on update, it can change alone. Use null alone to clear the owner."
    },
    note: { type: "string", description: "For note: a note to append, at most 2000 characters." }
  },
  required: ["operation"]
};
var TOOL_FIELDS = {
  record: Object.keys(RECORD_SCHEMA.properties),
  close: Object.keys(CLOSE_SCHEMA.properties),
  order_prs: Object.keys(ORDER_SCHEMA.properties),
  tasks: Object.keys(TASKS_SCHEMA.properties)
};

// ../hooks/record-links.ts
var anyCase = (word) => [...word].map((c) => `[${c.toUpperCase()}${c}]`).join("");
var REF = new RegExp(
  String.raw`(?<![\w/#&])(?:(?<!-)(?:PRs?|${anyCase("pull")}\s+${anyCase("request")}[sS]?|${anyCase("issue")}[sS]?|プルリク(?:エスト)?|イシュー)\s*#?|(?:[\w.-]+\/)?[\w.-]+#|#)([1-9]\d*)(?!\w)(?!\s*(?:件|本|個|つ|点|回|枚))`,
  "g"
);

// ../hooks/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../hooks/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
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
  "read-document": "v",
  compare: "p",
  discuss: "d",
  dismiss: "x",
  discard: "x"
};
function actionsOf(row, last, state, feedback) {
  const { id, item, steps: steps2 } = row;
  if (item?.sourceManaged || row.finding?.sourceManaged) return [];
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const action = (press2, label, kind, flags = {}) => {
    const pressAction = actionId(press2);
    return {
      press: press2,
      label: press2.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press2.action === "done" || press2.action === "address" ? "primary" : press2.action === "discuss" || press2.action === "explain" || press2.action === "compare" || press2.action === "dismiss" || press2.action === "discard" ? "quiet" : "normal",
      ...press2.action === "done" ? { icon: "done" } : press2.action === "step" && stepIconKind(steps2[press2.step]) ? { icon: stepIconKind(steps2[press2.step]) } : {},
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press2.action),
      ...ACTION_KEYS[press2.action] ? { hotkey: ACTION_KEYS[press2.action] } : {},
      isOut: out === pressAction
    };
  };
  const documentAction = row.document ? [action({ action: "read-document", id }, "Read report", "view")] : [];
  if (state.is === "settled")
    return [...state.canUndo ? [action({ action: "undo", id }, ROW_COPY.undo, "view")] : [], ...documentAction];
  if (state.is === "held")
    return [
      ...documentAction,
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "discard", id }, ROW_COPY.discard, "view")
    ];
  const stepActions = steps2.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
  if (!item)
    return [
      action({ action: "address", id }, row.finding ? fixLabel(row.finding) : "Fix", "handoff"),
      action({ action: "issue", id }, ISSUE_LABEL, "handoff"),
      ...documentAction,
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "discuss", id }, "Discuss", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  if (item.kind === "task")
    return [
      ...stepActions,
      ...documentAction,
      action({ action: "done", id }, "Done", "mark"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map(
      (option, n) => action({ action: "answer", id, option }, clipLabel(linkLabel(option), OPTION_LABEL_CHARS), "mark", {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })
    ),
    ...stepActions,
    ...documentAction,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    action({ action: "explain", id }, "Explain", "talk"),
    ...showsCompare(item) ? [action({ action: "compare", id }, "Compare", "talk")] : [],
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}

// ../hooks/view.ts
var HOLDS_UP_TEXT = "Holds up";
function needsYouOrder(ledger) {
  const newestReplyFirst = (kind) => ledger.items.filter((i) => i.kind === kind).sort((a, b) => b.turn - a.turn);
  return { questions: newestReplyFirst("question"), tasks: newestReplyFirst("task") };
}
function heldTasksOf(ledger, tree, askId) {
  return (ledger.overview?.askSubjects[askId] ?? []).flatMap((id) => {
    const task = tree.find((node) => node.id === id);
    return task && task.status !== "done" && task.status !== "dropped" ? [task.title] : [];
  });
}
function inboxView({
  ledger,
  taskTree = [],
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
  const pressOutSinceWhere = (isOnTab) => earliestOf(
    Object.entries(lastActions).map(
      ([id, last]) => isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, void 0, turns, now)) : null
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
    const document = row.item?.document ?? row.finding?.document ?? null;
    const actions = actionsOf(
      { ...row, document },
      last,
      state,
      pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt)
    );
    const held2 = state.is === "open" ? heldTasksOf(ledger, taskTree, row.id) : [];
    return {
      ...row,
      document,
      documentPreview: row.item?.documentPreview ?? row.finding?.documentPreview ?? null,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held2.length > 0 ? `${HOLDS_UP_TEXT} ${held2.join(", ")}` : null,
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
      detail: item.detail ?? null,
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
    untrackedWork: ledger.untrackedWork ?? [],
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
  if (c.how === "answered") return `Answered: ${c.outcome}`;
  return c.how === "claude" ? capitalized(c.outcome) : `Closed: ${c.outcome}`;
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

// ../hooks/task-facts.ts
var OWNER_IDLE_WARNING = "Owner idle 15m+";
var OWNER_FINISHED_WARNING = "Owner finished, task open";
var OWNER_IDLE_AFTER_MS = 15 * 6e4;
function taskOwnerKey(owner) {
  return JSON.stringify([owner.machine, owner.agent]);
}
function applyTaskOwnerFacts(tree, facts, at) {
  const stalledSince = {};
  const warnings = [];
  for (const task of tree) {
    const owner = task.links?.owner;
    const fact = owner ? facts[taskOwnerKey(owner)] : void 0;
    if (task.status !== "working" || !owner || !fact || fact.state === "working") continue;
    stalledSince[task.id] = fact.since;
    if (at - fact.since >= OWNER_IDLE_AFTER_MS) warnings.push({ taskId: task.id, owner, message: OWNER_IDLE_WARNING });
    if (fact.state === "done" || fact.state === "idle")
      warnings.push({ taskId: task.id, owner, message: OWNER_FINISHED_WARNING });
  }
  const segments = weightedTaskProgressSegments(tree, new Set(Object.keys(stalledSince)));
  return { stalledSince, warnings, segments };
}

// ../hooks/timeline-page.ts
var BAR_MARKS = {
  done: "\u25A0",
  working: "\u25CF",
  stalled: "!",
  waiting: "\u25CC",
  queued: "\xB7"
};
var BAR_STATES = Object.keys(BAR_MARKS);
function timelineTask(task, now) {
  const { createdAt: _createdAt, updatedAt, history, ...details } = task;
  return {
    ...details,
    updatedAgo: shortAgo(now - updatedAt),
    history: history.map(({ at, ...event }) => ({ ...event, time: shortAgo(now - at) }))
  };
}
function timelineBar(segments, id, label, width = 16) {
  if (segments.total <= 0) return { id, label, parts: [] };
  let cumulative = 0;
  let drawn = 0;
  const parts = BAR_STATES.flatMap((state) => {
    cumulative += segments[state];
    const end = Math.round(cumulative / segments.total * width);
    const count = Math.max(0, end - drawn);
    drawn = end;
    return count > 0 ? [{ state, mark: BAR_MARKS[state], count }] : [];
  });
  return { id, label, parts };
}
function timelineData(tree, segments, stalledSince, warnings, now) {
  const children = /* @__PURE__ */ new Map();
  for (const task of tree) children.set(task.parentId, [...children.get(task.parentId) ?? [], task]);
  const stalled = new Set(Object.keys(stalledSince));
  const rows = [];
  const visit = (siblings, depth) => {
    siblings.forEach((task, index) => {
      const childrenOfTask = children.get(task.id) ?? [];
      const stalledAt = stalledSince[task.id];
      const status = stalledAt === void 0 ? task.status : "stalled";
      const progress = Math.round(weightedTaskProgress(tree, task.id) * 100);
      rows.push({
        task: timelineTask(task, now),
        depth,
        branch: depth === 0 ? null : index === siblings.length - 1 ? "last" : "mid",
        hasChildren: childrenOfTask.length > 0,
        progress,
        measure: childrenOfTask.length ? `${progress}%` : `w${task.weight}`,
        status,
        statusLabel: stalledAt !== void 0 ? `stalled ${shortAgo(now - stalledAt)}` : status === "waits-on-other" ? "waiting on others" : status,
        stalledAge: stalledAt === void 0 ? null : shortAgo(now - stalledAt),
        warnings: warnings.filter((warning) => warning.taskId === task.id).map((warning) => warning.message)
      });
      visit(childrenOfTask, depth + 1);
    });
  };
  visit(children.get(null) ?? [], 0);
  const roots = children.get(null) ?? [];
  const streams = new Set(roots.flatMap((task) => task.streamId ? [task.streamId] : []));
  const summary = streams.size > 1 ? `${streams.size} streams` : segments.total > 0 ? `${Math.round(segments.done / segments.total * 100)}% complete \xB7 ${Number(segments.done.toFixed(1))}/${Number(segments.total.toFixed(1))} weight` : "no tasks yet";
  const bars = [timelineBar(segments, "tree", "Task plan")];
  if (streams.size > 1)
    for (const root of roots)
      bars.push(timelineBar(weightedTaskProgressSegments(tree, stalled, root.id), root.id, root.title));
  return {
    isEmpty: tree.length === 0,
    empty: { title: "Timeline", hint: "No tasks have been recorded for this session." },
    summary,
    rows,
    bars
  };
}

// ../hooks/session-view.ts
var PRESS_TIMEOUT_MS = 6e4;
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at <= PRESS_TIMEOUT_MS) return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
function updateRecovery(s) {
  const { presence } = s;
  if (presence.ledgerState !== "failed") return "none";
  if (presence.isUpdating) return "retrying";
  if (s.pending.length === 0 && presence.isConversationUnreadable) return "unreadable";
  return presence.failedAttempts > 1 ? "failed-again" : "waiting";
}
function sessionView(s, now, settleWindowMs, holds = NO_HOLDS, notes = {}, timelineTaskTree = s.taskTree) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const inbox = inboxView({
    ledger: l,
    taskTree: s.taskTree,
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
  const ownerFacts = {};
  for (const finding of l.findings) {
    if (!finding.owner || !finding.ownerFact) continue;
    const key = taskOwnerKey(finding.owner);
    if (!ownerFacts[key] || ownerFacts[key].since < finding.ownerFact.since) ownerFacts[key] = finding.ownerFact;
  }
  Object.assign(ownerFacts, s.taskOwnerFacts);
  const taskOwnerView = applyTaskOwnerFacts(s.taskTree, ownerFacts, now);
  const timelineOwnerView = timelineTaskTree === s.taskTree ? taskOwnerView : applyTaskOwnerFacts(timelineTaskTree, ownerFacts, now);
  const feedStalledSince = Object.fromEntries(
    l.findings.flatMap((finding) => {
      const fact = finding.owner ? ownerFacts[taskOwnerKey(finding.owner)] : void 0;
      return finding.kind === "progress" && fact && fact.state !== "working" ? [[finding.id, fact.since]] : [];
    })
  );
  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds, settleWindowMs),
    statusPage: statusPage(s, now, new Set(Object.keys(taskOwnerView.stalledSince))),
    timeline: timelineData(
      timelineTaskTree,
      timelineOwnerView.segments,
      timelineOwnerView.stalledSince,
      [...s.taskFactWarnings, ...timelineOwnerView.warnings],
      now
    ),
    taskProgressSegments: taskOwnerView.segments,
    taskStalledSince: taskOwnerView.stalledSince,
    feedStalledSince,
    taskFactWarnings: [...s.taskFactWarnings, ...taskOwnerView.warnings]
  };
}
function prTabOf(s, lastActions, now, { shownSince, listInput, undoShown }, settleWindowMs) {
  const pressOutSince = earliestOf(
    Object.entries(lastActions).map(
      ([id, last]) => isPrRowId(id) ? pressUnderWaySince(feedbackOf(id, last, void 0, s.presence, now)) : null
    )
  );
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
    accountPrs: (s.prViews.accountPrs ?? []).filter((pr) => !drawn.some((d) => d.pr.ref === pr.ref)),
    botPrSummaries: s.prViews.botPrSummaries ?? [],
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => d.state.is === "open" && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger),
    order: prOrderView(
      s.ledger.prOrder,
      drawn,
      { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now },
      shownSince
    ),
    isGhSignedOut: s.prViews.isGhSignedOut === true,
    failure: s.prViews.failure ?? null,
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

// ../hooks/session-presses.ts
function rowsInPlace(s) {
  const since = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map((c) => ({ id: c.id, at: closedAt(c) }))
  ].flatMap((x) => isShownSince(x.at, s.shownSince) ? [x.id] : []);
  return /* @__PURE__ */ new Set([...s.heldRows, ...since]);
}
function pruned(s) {
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(
      ([ref]) => isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince)
    )
  );
  const isViewDropped = Object.keys(views).length < Object.keys(s.prViews.views).length;
  return {
    ...s,
    prViews: isViewDropped ? { ...s.prViews, views } : s.prViews
  };
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
function statePath(dir, sessionId) {
  return join2(dir, "sessions", sessionFile(sessionId));
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

// ../hooks/session-turns.ts
function parsedReply(ex, reply) {
  return reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join("\n"), ex.reply);
}
function applied(s, parsed, now, promptAt) {
  const next = s.pending[0];
  if (!next) return s;
  const { ex } = next;
  if (!parsed && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: "failed", failedAttempts: s.presence.failedAttempts + 1 }
    };
  const ledger = parsed ? applyExchangeUpdate(s.ledger, parsed, ex, now, promptAt) : s.ledger;
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed;
  const isCurrent = !hasDroppedReply;
  const failedAttempts = parsed ? s.presence.failedAttempts : s.presence.failedAttempts + 1;
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

// ../hooks/status-ops.ts
var linksWith = (ids, id) => ids.includes(id) ? [...ids] : [...ids, id];
function applyOps(last, ops, now, askIds, tree = []) {
  let o = {
    ...last ?? EMPTY_SESSION_STATUS,
    children: (last?.children ?? []).map((child) => ({ ...child })),
    askSubjects: Object.fromEntries(Object.entries(last?.askSubjects ?? {}).filter(([ask]) => askIds.has(ask))),
    goalRefused: null
  };
  const taskIds = new Set(tree.map((task) => task.id));
  const findTask = (id) => taskIds.has(id);
  const start = last ?? o;
  for (const op of ops) {
    if (op.kind === "none") continue;
    if (op.kind === "goal" || op.kind === "retire") {
      o = applyGoalOp(o, op, now, tree, start);
    } else if (op.kind === "head") {
      if (!isNumberOnly(op.title)) {
        const title = clipWords(op.title, NAME_KEPT);
        const description = clipWords(op.description, DESCRIPTION_KEPT);
        if (!o.head || !hasSameWords(o.head.title, title) || o.head.description !== description)
          o = { ...o, head: { title, description } };
      }
    } else {
      const task = findTask(op.taskId) ? op.taskId : null;
      if (task === null) continue;
      const child = o.children.find((item) => item.id === op.ref);
      if (child) child.subjectId = task;
      else if (askIds.has(op.ref)) o.askSubjects[op.ref] = linksWith(o.askSubjects[op.ref] ?? [], task);
    }
  }
  return settleGoal(o, tree, now);
}
function applyStatus(last, answer, now, askIds, readSetAt = last?.goal?.setAt ?? null, taskTree = []) {
  const read = last?.goalRefused ? { ...last, goalRefused: null } : last;
  const o = answer.kind === "ops" ? applyOps(last, answer.ops, now, askIds, taskTree) : read;
  if (o === null) return null;
  const settled = settleGoal(o, taskTree, now);
  const isRemovedRead = settled.goalRemoved !== null && settled.goalRemoved.goal.setAt === readSetAt;
  return settled.goalRemoved === null || isRemovedRead ? settled : { ...settled, goalRemoved: null };
}

// ../hooks/session-status.ts
function isStatusCallCurrent(s, appliedAfter) {
  return s.presence.turnsApplied >= appliedAfter && s.overviewTurn <= appliedAfter;
}
function appliedStatus(s, answer, appliedAfter, now, readSetAt = s.ledger.overview?.goal?.setAt ?? null, isCatchUp = false) {
  if (!isStatusCallCurrent(s, appliedAfter)) return s;
  const askIds = new Set(s.ledger.items.map((i) => i.id));
  const overview = applyStatus(s.ledger.overview, answer, now, askIds, readSetAt, s.taskTree);
  return {
    ...s,
    ledger: { ...s.ledger, overview },
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
      failedAttempts: parsed ? 0 : s.presence.failedAttempts + 1,
      isConversationUnreadable: false,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted)
    }
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
  taskTool: "tasks",
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
function viewOf(s, now, holds = NO_HOLDS) {
  return { ...sessionView(s, now, SETTLE_WINDOW_MS, holds), heard: heardState(s.heard), at: now };
}

// ../hooks/banners.ts
var NEXT_BUILD_MARK = ".next-build";
var MAYBE_STALE_TEXT = "May be out of date";

// ../hooks/band.ts
function isMaybeStale(view, isReadFailed = false) {
  return isReadFailed || view.status.error !== null || view.status.isRetrying;
}
function bandCounts(view) {
  return ROW_TABS.map((t) => ({ id: t.id, label: t.label, count: view[t.id].count })).filter((c) => c.count > 0);
}

// ../hooks/children.ts
var HERDR = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g;
function delegateSteps(command) {
  return [...command.matchAll(HERDR)].map(([, verb, name, args]) => ({
    name,
    isPrompt: verb === "prompt",
    isWaitForEnd: verb === "wait" && !/--until working/.test(args ?? "")
  }));
}
var delegateRef = (name) => `herdr:${name}`;
function delegateRefs(command) {
  return new Set(delegateSteps(command).map((step) => delegateRef(step.name)));
}

// ../hooks/herdr.ts
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
function dialogText(dialog) {
  return dialog.kind === "permission" ? `Allow ${dialog.text}?` : dialog.text;
}
function statusLine(stop, dialogs, input) {
  if (stop) return stopLine(stop);
  const dialog = dialogs[0];
  if (dialog) return dialogText(dialog);
  const { firstAsk, asks, findings, focus, stale } = input;
  if (firstAsk !== null) return asks > 1 ? `${asks} \xB7 ${firstAsk}` : firstAsk;
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? "" : "s"}`;
  return [stale, focus, findingsText].filter(Boolean).join(" \xB7 ");
}
function focusOf(head) {
  return head ? head.description || head.title : null;
}
function herdrTokens(ledger, stop, view, dialogs, isReadFailed = false) {
  const input = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    focus: focusOf(ledger.overview?.head ?? null),
    stale: bandCounts(view).length === 0 && isMaybeStale(view, isReadFailed) ? MAYBE_STALE_TEXT : null
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
var SESSION_LABEL = "inbox.session";
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
      return newest ? reportToHerdr(newest.run, newest.report, newest.after) : Promise.resolve(false);
    });
  };
  const send = async (run2, report, after) => {
    const r = await report();
    if (!r) return false;
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
  const reportToHerdr = (run2, report, after) => {
    newest = { run: run2, report, after };
    const result = sending.then(() => send(run2, report, after)).catch(() => false);
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
var SESSION_FIELDS = Object.keys(emptySession());
function herdrEnvelope(source, session, isTrimmed = false) {
  const shared = Object.fromEntries(SESSION_FIELDS.map((field) => [field, session[field]]));
  const { lastHerdrPress } = session;
  const { projectFolder, ...rest } = source;
  return {
    format: HERDR_FORMAT,
    ...rest,
    ...projectFolder?.startsWith("/") && { projectFolder },
    ...isTrimmed && { trimmed: true },
    ...lastHerdrPress && { lastPress: lastHerdrPress },
    session: shared
  };
}
function publishedSessionsFolder(appHome) {
  return `${appHome}/inbox/sessions`;
}
function publishedSessionPath(appHome, sessionId) {
  return `${publishedSessionsFolder(appHome)}/${sessionFile(sessionId)}`;
}

// ../hooks/host-prs.ts
var PRS_HIDDEN_REFRESH_MS = 10 * 6e4;

// ../hooks/herdr-app.ts
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
function withoutFoldedClosed(s) {
  const inPlace = rowsInPlace(s);
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
  const trimmed = JSON.stringify(herdrEnvelope(source, withoutFoldedClosed(session), true));
  if (isOverLimit(trimmed))
    log(`Herdr publish is over ${PUBLISH_LIMIT_BYTES} bytes after trimming, so the look cannot read it`);
  return trimmed;
}
async function publishSession(files, appHome, source, session, log) {
  const path = publishedSessionPath(appHome, source.sessionId);
  const temporary = `${path}.${source.writtenAt}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await files.write(temporary, publishedText(source, session, log));
    await files.move(temporary, path);
  } catch (err) {
    await files.remove(temporary).catch(() => void 0);
    throw err;
  }
}
function publishedSession(files, appHome, source, session, log) {
  if (!appHome) return Promise.resolve(false);
  return publishSession(files, appHome, source, session, log).then(
    () => true,
    (err) => {
      log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  );
}

// src/host.ts
function codexStore(dir, sessionId, now, onWrite) {
  return {
    now,
    read: () => readState(dir, sessionId),
    update: async (change) => {
      const s = await updateState(
        dir,
        sessionId,
        onWrite ? async (current) => ({ ...await change(current), writtenAt: Math.max(now(), (current.writtenAt ?? 0) + 1) }) : change
      );
      await onWrite?.(s);
      return s;
    },
    exclusive: (fn) => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn)
  };
}
var publishFiles = {
  write: async (path, text2) => {
    await mkdir2(dirname2(path), { recursive: true });
    await writeFile2(path, text2);
  },
  move: (from, to) => rename2(from, to),
  remove: (path) => rm(path, { force: true }),
  removeFolder: (path) => rm(path, { recursive: true, force: true })
};
var HERDR_LOG_BYTES = 64 * 1024;
function herdrLog(dir) {
  const path = join3(dir, "herdr.log");
  return (text2) => void (async () => {
    const size = await stat2(path).then(
      (s) => s.size,
      () => 0
    );
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${text2}
`;
    await mkdir2(dir, { recursive: true });
    await (size > HERDR_LOG_BYTES ? writeFile2(path, line) : appendFile(path, line));
  })().catch(() => void 0);
}
function herdrOnWrite(env, run2, dir, now, log = herdrLog(dir)) {
  const target = herdrTarget(env);
  if (!target) return void 0;
  const report = herdrReporter(log);
  return async (written) => {
    const id = written.sessionId;
    await withLock(`${statePath(dir, id)}.herdr`, async () => {
      const s = await readState(dir, id);
      const at = now();
      const seq = s.writtenAt ?? at;
      const isPublished = target.kind === "terminal" && await publishedSession(
        publishFiles,
        target.appHome,
        {
          host: "codex",
          agent: CODEX.agent,
          sessionId: id,
          terminal: target.terminal,
          writtenAt: seq,
          projectFolder: s.root
        },
        s,
        log
      );
      const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, at), []);
      const r = { target, tokens, session: isPublished ? id : null, seq };
      const key = herdrReportKey(r);
      if (key === s.herdrReport?.key) return;
      if (!await report(run2, async () => r)) return;
      await updateState(dir, id, (saved) => ({ ...saved, herdrReport: { key, seq } }));
    }).catch(() => void 0);
  };
}

// ../hooks/status.ts
var LINE = /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK|GOAL|RETIRE|MILESTONE|SERVES)\s*(?::\s*(.*))?$/i;
var IGNORED = /* @__PURE__ */ new Set(["NEW", "SET", "DONE", "DROP", "WAS", "MILESTONE", "SERVES"]);
function fields(value) {
  return value.split("|").map((f) => f.trim());
}
function opOf(key, f) {
  if (key === "NOCHANGE" || key === "UNCHANGED") return { kind: "none" };
  if (key === "HEAD") return f[0] ? { kind: "head", title: f[0], description: f[1] ?? "" } : null;
  if (key === "LINK") return f[0] && f[1] ? { kind: "link", ref: f[0], taskId: f[1] } : null;
  if (key === "GOAL") return f[0] ? { kind: "goal", text: f[0] } : null;
  if (key === "RETIRE") return { kind: "retire", why: f[0] ?? "" };
  return null;
}
function parseStatus(text2) {
  let ignoredLegacy = false;
  const ops = (text2 ?? "").split(NL).flatMap((raw) => {
    const m = LINE.exec(raw.trim());
    if (!m) return [];
    const key = m[1].toUpperCase().replace(" ", "");
    if (IGNORED.has(key)) {
      ignoredLegacy = true;
      return [];
    }
    const op = opOf(key, fields(m[2] ?? ""));
    return op === null ? [] : [op];
  });
  if (ops.length === 0) return ignoredLegacy ? { kind: "unchanged" } : null;
  return ops.every((o) => o.kind === "none") ? { kind: "unchanged" } : { kind: "ops", ops };
}
async function askStatus(ask) {
  const first = await ask();
  const isUnreadable = first.text !== null && parseStatus(first.text) === null;
  return { first, last: isUnreadable ? await ask() : first };
}

// ../hooks/status-prompt-goal.ts
var GOAL_LINES = `GOAL: outcome
RETIRE: why the goal no longer fits the work
LINK: ask or running child id | task id
GOAL sets only the session outcome. Task status, details and links come from the task tree and are never changed here.`;
var GOAL_INPUT = `- <goal>: the outcome, its stable task-link id, and whether it is typed, met, awaiting linked tasks, or has had no linked work for a time. It may also say why code did not apply the last GOAL or RETIRE line; fix that cause before writing that line again.
- <removed>: goals the person removed, as their key words, one per line.`;
var GOAL_PARTS = {
  "goal-when-clear": `Write GOAL only when the task tree and exchange support one checkable outcome for the session. Never invent an outcome from a summary of finished work.`,
  "goal-finish-line": `A goal has a finish line someone could check as met or not, such as "2.5 in the store" or "the import ready to demo". A direction such as "make search faster" is not a goal.`,
  "goal-wait": `When the next outcome is not clear, write no GOAL and wait. Keep a met goal if it still fits; RETIRE it when it no longer fits and no next outcome is clear.`,
  "goal-not-again": `Never write the goal in <goal> or one in <removed> again, in the same words or other words. A goal the person removed stays removed until they type it.`,
  "goal-typed-kept": `A goal marked typed belongs to the person. Never reword, replace or retire it before its linked task tree is met.`,
  "goal-outcome-happened": `The task tree is the source of task status. Do not mark a goal met from prose; task updates are made through the tasks tool.`,
  "goal-work-left": `Do not replace an unmet goal while one of its linked tasks is open. Once work is met, write GOAL for a clear next outcome, or RETIRE when the goal no longer fits and none is clear.`,
  "task-links": `Write LINK only to connect an open ask or a live child to a task already listed in <task tree>. Use its exact task id. Never create, close, rename or relink a task here.`
};
function goalRules(without = []) {
  return Object.entries(GOAL_PARTS).filter(([id]) => !without.includes(id)).map(([, rule]) => `- ${rule}`).join(NL4);
}
function refusedLine(o, tree, now) {
  const refusal = o.goalRefused;
  const goal = o.goal;
  if (refusal === null || goal === null) return null;
  const line = refusal.line.toUpperCase();
  const linked = tasksForGoal(tree, goal);
  const text2 = {
    typed: () => "the person typed this goal, so it belongs to them until its task tree is met.",
    met: () => "the goal is met. It stays until GOAL sets the next one.",
    "work-open": () => {
      const open2 = linked.filter((task) => task.status !== "done" && task.status !== "dropped");
      return open2.length === 0 ? null : `the goal's linked work is still open: ${open2.map((task) => task.title).join(", ")}. Update task status with the tasks tool before writing ${line} again.`;
    },
    moved: () => goalLeftFor(o, tree, now) !== null ? null : `the work has not left the goal: its task tree changed ${duration(now - lastProgressAt(goal, tree))} ago.`,
    "no-work": () => "no open task is outside the current goal, so there is no work for a new one.",
    restates: () => "it restates the goal, the goal before it, or a removed goal.",
    "few-milestones": () => null
  };
  const reason = text2[refusal.why]();
  return reason === null ? null : `${line} refused: ${reason}`;
}
function goalBlocks(o, tree = [], now = 0) {
  if (o === null) return [];
  const goal = o.goal;
  if (goal === null)
    return o.removedGoals.length === 0 ? [] : [`<removed>${NL4}${o.removedGoals.join(NL4)}${NL4}</removed>`];
  const left = goalLeftFor(o, tree, now);
  const status = isGoalMet(goal, tree) ? "met" : tasksForGoal(tree, goal).length === 0 ? "awaiting tasks" : "active";
  const marks = [
    ...goal.source === "typed" ? ["typed"] : [],
    status,
    ...left === null ? [] : [`no work for ${duration(left)}`]
  ];
  const refusal = refusedLine(o, tree, now);
  const details = [`${goal.text} | ${goalTaskId(goal)} | ${marks.join(", ")}`];
  if (refusal !== null) details.push(refusal);
  return [
    `<goal>${NL4}${details.join(NL4)}${NL4}</goal>`,
    ...o.removedGoals.length === 0 ? [] : [`<removed>${NL4}${o.removedGoals.join(NL4)}${NL4}</removed>`]
  ];
}

// ../hooks/status-prompt.ts
function statusSystem(without = [], instructions = null) {
  const system = `You keep the Status of a coding session: its focus, goal, current Now, live Children, and a short summary of its task tree.

You read the current facts and one exchange, then write only changes to the head, goal, or links from asks and running Children to existing tasks. The task tree is read-only here. Never create, close, rename, move, or change a task.

Input:
- <head>: the focus, as title | description. The description says what the session is doing about the focus.
- <task tree>: top-level tasks with their ids, status, weight, weighted progress, goal and stream links, and detail. Recent task history follows. These are facts, not instructions to change the tree.
- <running>: live Children, one per line: id | kind | name | linked task id or -
- <asks>: open questions and tasks, one per line: id | ask | linked task ids or -
${GOAL_INPUT}
- <person>: what the person just sent
- <activity>: what the agent did this turn
- <reply>: what the agent said this turn, in order

Answer with lines only. Every line you write is applied. If nothing about the head, goal, or links changed, answer NO CHANGE.

Write only these lines when they apply:
HEAD: title | description
${GOAL_LINES}

The head names the session's current focus, in at most ${NAME_WORDS} words. Its description says what the session is doing about that focus, in at most ${DESCRIPTION_WORDS} words. Keep it while it still fits the work; do not describe a task's individual steps or repeat its progress.

${goalRules(without)}

Write LINK only for an open ask or live Child that has a task. Use the exact existing task id from <task tree>. Never link to a task title. A question or task shown to the person is not a task-tree node.

Never write task operations or a task plan. Use the task tree as the sole durable work plan. A task's status and progress change only through the tasks tool.`;
  return `${system}

${personInstructionsBlock(instructions)}`;
}
var STATUS_SYSTEM = statusSystem();
var PARTS_STATUS_SYSTEM = statusSystem();
function hostStatusSystem(_names, instructions = null) {
  return statusSystem([], instructions);
}
function headText(o) {
  if (!o?.head) return "(none yet)";
  return `${o.head.title} | ${o.head.description || "(no description yet)"}`;
}
function taskTreeText(tree, now) {
  const top = tree.filter((task) => task.parentId === null).map((task) => `${task.id} | ${task.status} | weight ${task.weight} | ${Math.round(weightedTaskProgress(tree, task.id) * 100)}% | ${task.goalId ?? "-"} | ${task.streamId ?? "-"} | ${task.title} | ${task.detail || "-"}`);
  const recent = tree.flatMap((task) => task.history.map((event) => ({ task, event }))).sort((a, b) => b.event.at - a.event.at).slice(0, 8).map(({ task, event }) => `${task.id} | ${event.kind} | ${Math.max(0, now - event.at)}ms ago${event.detail ? ` | ${event.detail}` : ""}`);
  return [...top, ...recent.length ? ["Recent changes:", ...recent] : []].join(NL4) || "(no tasks yet)";
}
function statusBlocks({ last, asks, taskTree, now }) {
  const running = runningText(last, now);
  const held = asksText(last, asks);
  return [
    ...goalBlocks(last, taskTree, now),
    `<head>${NL4}${headText(last)}${NL4}</head>`,
    `<task tree>${NL4}${clipMiddle(taskTreeText(taskTree ?? [], now), 8e3, 2e3)}${NL4}</task tree>`,
    ...running === "" ? [] : [`<running>${NL4}${running}${NL4}</running>`],
    ...held === "" ? [] : [`<asks>${NL4}${held}${NL4}</asks>`]
  ];
}
function statusPrompt(input, ex) {
  const person = personText(ex.person, ex.trigger);
  return [
    ...statusBlocks(input),
    `<person>${NL4}${clipMiddle(person, 4e3, 1500)}${NL4}</person>`,
    `<activity>${NL4}${clipMiddle(ex.activity.join(NL4), 2500, 500)}${NL4}</activity>`,
    `<reply>${NL4}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL4}</reply>`
  ].join(NL4);
}
function statusMidTurnPrompt(input, turn) {
  return [
    "The turn is still running. Treat <person> and <activity> as the exchange so far; there is no reply yet. Describe only the current focus in the head. Do not turn activity or task steps into a plan.",
    ...statusBlocks(input),
    `<person>${NL4}${clipMiddle(personText(turn.person, turn.trigger), 4e3, 1500)}${NL4}</person>`,
    `<activity>${NL4}${clipMiddle(turn.activity.join(NL4), 2500, 500)}${NL4}</activity>`
  ].join(NL4);
}
function statusCatchUpPrompt(input, transcript) {
  return [
    "Treat the conversation in <conversation> as the exchange. Its start may be cut. Update the head and links to match the conversation at its end; task-tree facts stay read-only.",
    ...statusBlocks(input),
    `<conversation>${NL4}${numberBlocks(transcript)}${NL4}</conversation>`
  ].join(NL4);
}

// ../hooks/call-record.ts
var ERROR_CHARS = 500;
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
function withCall(s, kind, heard, isParsed, at) {
  const record2 = s.callFailures[kind.call];
  const failure = failureOf(kind, heard, isParsed, at);
  const isRecovery = !failure && record2.lastFailure !== null && record2.recoveredAt === null;
  if (!failure && !isRecovery) return s;
  const next = failure ? { lastFailure: failure, recoveredAt: null } : { ...record2, recoveredAt: at };
  return { ...s, callFailures: { ...s.callFailures, [kind.call]: next } };
}

// ../hooks/status-records.ts
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
function attemptOf({ text: text2, report, thrown, ms }) {
  return {
    model: report?.model ?? null,
    answeredBy: report?.answeredBy ?? null,
    answer: text2,
    error: text2 === null ? thrown ?? report?.error ?? "no answer, and the host gave no reason" : null,
    ms
  };
}
async function askAndWriteStatus(host, s, call, appliedAfter) {
  if (!isStatusCallCurrent(s, appliedAfter)) return;
  const input = { last: s.ledger.overview, asks: s.ledger.items, taskTree: s.taskTree, now: await host.now() };
  const prompt = statusCallPrompt(input, call.exchange);
  let system = null;
  const heards = [];
  const { last } = await askStatus(async () => {
    const kind = { call: "status", reads: call.exchange.kind, isRetry: heards.length > 0 };
    const currentSystem = hostStatusSystem(host.names, await host.readPersonInstructions());
    system ??= currentSystem;
    const heard = await heardCall(call.ask, prompt, currentSystem, kind, () => host.now());
    heards.push({ kind, heard });
    return heard;
  });
  const attempts = heards.map((h) => attemptOf(h.heard));
  const answer = last.text === null ? null : parseStatus(last.text);
  const now = await host.now();
  let before = null;
  let isWritten = false;
  const noted = (current) => heards.reduce(
    (x, h) => withCall(x, h.kind, h.heard, h.heard.text !== null && parseStatus(h.heard.text) !== null, now),
    current
  );
  const after = await host.update((current) => {
    const x = noted(current);
    before = x.ledger.overview;
    isWritten = isStatusCallCurrent(x, appliedAfter);
    const readSetAt = input.last?.goal?.setAt ?? null;
    return answer === null ? failedStatus(x, last.text, appliedAfter, now, call.exchange.kind === "catch-up") : appliedStatus(x, answer, appliedAfter, now, readSetAt, call.exchange.kind === "catch-up");
  });
  if (!host.records) return;
  const record2 = {
    version: STATUS_RECORD_VERSION,
    host: host.records.host,
    session: host.records.session,
    at: input.now,
    system: system ?? hostStatusSystem(host.names, null),
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
    await askAndWriteStatus(host, s, call, s.presence.turnsApplied);
  });
}

// ../hooks/session-host.ts
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
var RECORDED_ITEMS_ONLY = "INBOX_RECORDED_ITEMS_ONLY";
function isRecordedItemsOnly(value) {
  return value === "1" || value === "true";
}
async function askOverConversation(host, names, s, screen, conversation) {
  if (!conversation) return { kind: "unreadable" };
  const prompt = transcriptCatchUpPrompt(s.ledger, screen, conversation);
  const instructions = await host.readPersonInstructions();
  const heard = await heardCall(host.ask, prompt, systemText(names, instructions), CATCH_UP_CALL, () => host.now());
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
  const kept = (u, ledger, promptAt = 0) => u && host.recordedItemsOnly ? recordedAsksOnly(u, ledger, isPersonsAnswer, promptAt) : u;
  const wantsCatchUp = (s) => canCatchUp && needsCatchUp(s);
  const hasWork = (s) => s.pending.length > 0 || wantsCatchUp(s);
  const writing = [];
  const writeStatus = (after, call) => host.inOrder(async () => askAndWriteStatus(host, await host.read(), call, after.presence.turnsApplied));
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
              const reply = await host.catchUp(s).catch(() => ({ kind: "failed", heard: null }));
              if (reply.kind === "unreadable") {
                canCatchUp = false;
                await host.update((x) => ({ ...x, presence: { ...x.presence, isConversationUnreadable: true } }));
                continue;
              }
              const at = await host.now();
              const parsed2 = kept(reply.kind === "reply" ? parseReply(reply.text, reply.source) : null, s.ledger, at);
              const noted = (x) => reply.heard ? withCall(x, CATCH_UP_CALL, reply.heard, parsed2 !== null, at) : x;
              const after2 = await host.update((x) => appliedCatchUp(noted(x), s, parsed2, at));
              if (!parsed2) return "stop";
              if (reply.kind === "reply" && reply.statusCall) followUp(writeStatus(after2, reply.statusCall));
              continue;
            }
            const next = s.pending[0];
            const promptAt = await host.now();
            const kind = { call: "ledger", reads: "reply", isRetry: next.failed === true };
            const instructions = await host.readPersonInstructions();
            const asked = await askedCall(
              host.ask,
              buildPrompt(s.ledger, next.ex),
              systemText(host.names, instructions),
              kind
            );
            const parsed = kept(parsedReply(next.ex, asked.text), s.ledger, promptAt);
            let isApplied = false;
            const after = await host.update(async (current) => {
              const at = await host.now();
              const x = withCall(current, kind, { ...asked, ms: at - promptAt }, parsed !== null, at);
              isApplied = false;
              if (x.pending[0]?.turnsStarted !== next.turnsStarted || x.pending[0].ex.turn !== next.ex.turn) return x;
              isApplied = parsed !== null;
              return applied(x, parsed, at, promptAt);
            });
            if (isApplied)
              followUp(writeStatus(after, { exchange: { kind: "reply", exchange: next.ex }, ask: host.ask }));
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
  mkdir as mkdir3,
  readdir as readdir3,
  readFile as readFile2,
  readlink as readlink2,
  rename as rename3,
  rm as rm2,
  rmdir as rmdir2,
  stat as stat5,
  symlink as symlink2,
  writeFile as writeFile3
} from "node:fs/promises";
import { dirname as dirname4, join as join5 } from "node:path";
import { homedir as homedir3 } from "node:os";

// src/transcript.ts
import { readdir as readdir2, stat as stat4 } from "node:fs/promises";
import { basename as basename2, dirname as dirname3, join as join4 } from "node:path";

// src/rollout-file.ts
import { createReadStream } from "node:fs";
import { open, stat as stat3 } from "node:fs/promises";
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
  const info = await stat3(path);
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

// ../hooks/conversation.ts
var NL5 = "\n";
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
  return kept.reverse().join(NL5);
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
    const parsed = JSON.parse(output);
    return isText(parsed.output) ? parsed.output : output;
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
function callLines(p, hasCommandRows, cwd) {
  const name = textOf(p.name);
  if (p.type === "local_shell_call") return hasCommandRows ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = scriptCommand(input);
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

// src/rollout-turns.ts
var MARKERS = ['"task_started"', DIALOG_TOOL, '"AgentMessage"', '"assistant"', ...UNRAN_MARKERS];
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
function turnsOf(rows, cwd) {
  const hasMessageRows = rows.some((row) => isItem(row, "UserMessage", "AgentMessage"));
  const hasCommandRows = rows.some((row) => isItem(row, "CommandExecution"));
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
function rolloutOfLines(lines, cwd, currentTurnId) {
  const turns = rolloutTurns(lines, cwd);
  const earlier = turns.filter((t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person")));
  return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
}

// src/transcript.ts
async function namesIn(dir, pattern) {
  const names = await readdir2(dir).catch(() => []);
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
  const sessions = join4(codexHome, "sessions");
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join4(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join4(sessions, year, month), /^\d{2}$/)) {
        const folder = join4(sessions, year, month, day);
        const [name] = await rolloutsIn(folder, isWanted);
        if (name !== void 0) return join4(folder, name);
      }
  const archive = join4(codexHome, "archived_sessions");
  const [archived] = await rolloutsIn(archive, isWanted);
  return archived === void 0 ? null : join4(archive, archived);
}
function codexHomeOf(path) {
  const folder = dirname3(path);
  if (basename2(folder) === "archived_sessions") return dirname3(folder);
  const sessions = dirname3(dirname3(dirname3(folder)));
  return basename2(sessions) === "sessions" ? dirname3(sessions) : null;
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
  if (saved === null || await stat4(saved).catch(() => null) !== null) return s;
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
var MODEL = "gpt-6-luna";
var TIMEOUT_MS = 12e4;
var RESULTS_WAIT_MS = 4 * TIMEOUT_MS;
var resultsOrder = orderedKeys();
function readInboxInstructions(env) {
  const configHome = env.XDG_CONFIG_HOME || join5(env.HOME || homedir3(), ".config");
  return readFile2(join5(configHome, "inbox", "instructions.md"), "utf8").catch(() => null);
}
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
  const auth = join5(personHome, "auth.json");
  const hasSignInFile = await access(auth).then(
    () => true,
    () => false
  );
  if (!hasSignInFile) return null;
  const home = join5(dir, "model-home");
  const link = join5(home, "auth.json");
  try {
    await mkdir3(home, { recursive: true });
    const isLinked = await readlink2(link).catch(() => null) === auth;
    if (isLinked) return home;
    await keepNewerSignIn(link, auth);
    const made = `${link}.${randomUUID2()}`;
    await symlink2(auth, made);
    await rename3(made, link);
    return home;
  } catch {
    return null;
  }
}
async function keepNewerSignIn(link, auth) {
  const saved = await lstat2(link).catch(() => null);
  if (!saved?.isFile()) return;
  const theirs = await stat5(auth);
  if (saved.mtimeMs > theirs.mtimeMs) await copyFile(link, auth);
}
function codexAsk(exec, cli, dir, personHome) {
  return async (prompt, instructions, _kind, report) => {
    const work = join5(dir, "exec");
    const system = join5(dir, `inbox-system-${createHash2("sha256").update(instructions).digest("hex").slice(0, 12)}.md`);
    const out = join5(work, `reply-${randomUUID2()}.txt`);
    await mkdir3(work, { recursive: true });
    const home = await modelHome(dir, personHome);
    if (await readFile2(system, "utf8").catch(() => "") !== instructions) await writeFile3(system, instructions);
    let off = [...OFF];
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm2(out, { force: true });
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
      await rm2(out, { force: true });
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
    await mkdir3(dirname4(path), { recursive: true });
    await writeFile3(path, text2);
  },
  list: (folder) => readdir3(folder).catch(() => []),
  removeFiles: async (paths) => void await Promise.all(paths.map((p) => rm2(p, { force: true }))),
  removeFolder: (path) => rmdir2(path)
};
var statusRecords = (dir, sessionId) => ({
  host: "codex",
  folder: join5(dir, "overview-calls"),
  session: sessionId,
  files: recordFiles
});
var refreshStatus2 = (dir, sessionId, ask, now, onWrite, records, readPersonInstructions = () => readInboxInstructions(process.env)) => refreshStatus({
  ...codexStore(dir, sessionId, now, onWrite),
  ask,
  readPersonInstructions,
  names: CODEX,
  inOrder: inOrderFor(dir, sessionId),
  records
});
var runUpdates2 = (dir, sessionId, ask, now, optionsOrOnWrite = {}, positionalRecords) => {
  const options = typeof optionsOrOnWrite === "function" ? { onWrite: optionsOrOnWrite, records: positionalRecords } : optionsOrOnWrite;
  const {
    onWrite,
    records,
    recordedItemsOnly = false,
    readPersonInstructions = () => readInboxInstructions(process.env)
  } = options;
  const store = codexStore(dir, sessionId, now, onWrite);
  return runUpdates({
    ...store,
    ask,
    readPersonInstructions,
    names: CODEX,
    inOrder: inOrderFor(dir, sessionId),
    records,
    recordedItemsOnly,
    catchUp: async (s) => {
      const isMoved = await withCurrentRollout(s) !== s;
      const path = isMoved ? (await store.update(withCurrentRollout)).transcriptPath : s.transcriptPath;
      return askOverConversation(
        { ask, now: store.now, readPersonInstructions },
        CODEX,
        s,
        screenText(CODEX, isTabOpen(s, now()), screenTabOf(s.shownTab)),
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
  const pluginRoot = dirname5(dirname5(fileURLToPath(import.meta.url)));
  const dir = dataDir(process.env, pluginRoot);
  const { cliPath } = await readState(dir, sessionId);
  const cli = cliPath ?? await findCli(process.env, run, process.ppid);
  const personHome = process.env.CODEX_HOME || join6(homedir4(), ".codex");
  const ask = codexAsk(run, cli, dir, personHome);
  const onWrite = herdrOnWrite(process.env, run, dir, Date.now);
  const records = existsSync(join6(pluginRoot, NEXT_BUILD_MARK)) ? statusRecords(dir, sessionId) : void 0;
  if (isStatusRefresh) await refreshStatus2(dir, sessionId, ask, Date.now, onWrite, records);
  else
    await runUpdates2(dir, sessionId, ask, Date.now, {
      onWrite,
      records,
      recordedItemsOnly: isRecordedItemsOnly(process.env[RECORDED_ITEMS_ONLY])
    });
}
main().catch(() => process.exit(0));
