// Built by herdr/build.ts with Bun 1.4.4 from herdr/src and core/. Do not edit.
// Built at 2026-11-27T19:25:51.316Z. 429488 characters follow.

// src/main.ts
import { View, div as div19 } from "gpui-kit";
import { InputState, Scrollbar, v_flex as v_flex8 } from "gpui-base";
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
  settings,
  spaces,
  terminals,
  theme,
  watchFolder,
  window as herdrWindow,
  writeTextFile
} from "herdr";
import * as herdr from "herdr";

// ../core/domain/option-previews.ts
var OPEN_PREVIEWS_LABEL = "Open previews";
function previewEffects(item) {
  return item.previewPage ? [{ kind: "open", target: item.previewPage, name: "previews" }] : [];
}

// ../core/domain/press-labels.ts
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
var ISSUE_LABEL = "File issue";
var SHOW_EXPLANATION_LABEL = "Show explanation";

// ../core/domain/text.ts
var TERMINAL_CONTROL = new RegExp([
  String.raw`(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[^\x07\x1b\x90\x98\x9c-\x9f]*(?:\x07|\x1b\\|\x9c)`,
  String.raw`(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]`,
  String.raw`\x1b[\x20-\x2f]*[\x30-\x7e]`,
  String.raw`[\x00-\x08\x0b-\x1f\x7f-\x9f]`
].join("|"), "g");
var HAS_CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;
function drawableText(text) {
  return HAS_CONTROL.test(text) ? text.replace(TERMINAL_CONTROL, "") : text;
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function withDrawableText(value, isKept) {
  if (typeof value === "string")
    return drawableText(value);
  if (Array.isArray(value)) {
    const drawn = value.map((v) => withDrawableText(v, isKept));
    return drawn.some((v, i) => v !== value[i]) ? drawn : value;
  }
  if (!isPlainObject(value))
    return value;
  let drawn = null;
  for (const [key, v] of Object.entries(value)) {
    if (isKept(key))
      continue;
    const d = withDrawableText(v, isKept);
    if (d !== v)
      (drawn ??= { ...value })[key] = d;
  }
  return drawn ?? value;
}
function clipLabel(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function cutForEllipsis(line, fits) {
  const parts = graphemesOf(line);
  while (parts.length > 0 && !fits(`${parts.join("")}…`))
    parts.pop();
  return parts.join("").replace(/[\s.,;:]+$/, "");
}
function wordCuts(line) {
  const words = line.split(" ");
  const cuts = words.map((_, n) => words.slice(0, words.length - n).join(" ").replace(/[\s.,;:]+$/, ""));
  return [...new Set(cuts.filter(Boolean).map((head) => `${head}…`))];
}
function cutAtWord(line, fits) {
  return wordCuts(line).find(fits)?.slice(0, -1) ?? null;
}
function cutLine(line, fits) {
  if (fits(line))
    return line;
  return `${cutAtWord(line, fits) ?? cutForEllipsis(line, fits)}…`;
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
var cellsOf = graphemeCells;
function cellWidth(text) {
  let cells = 0;
  for (const segment of graphemesOf(text))
    cells += cellsOf(segment);
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

// ../core/view/banners.ts
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
function bannerOf(kind, hostText) {
  const text = drawableText(hostText);
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
function versionLabel(version, isNextBuild) {
  return isNextBuild ? `v${version} · next` : `v${version}`;
}
var NOTHING_NEEDED_TEXT = "Nothing needed";
var MAYBE_STALE_TEXT = "May be out of date";

// ../core/view/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\uD83E\uDDED" },
  { id: "needsYou", label: "Asks", symbol: "\uD83D\uDE4B" },
  { id: "findings", label: "Finds", symbol: "\uD83D\uDD0D" },
  { id: "prs", label: "PRs", symbol: "\uD83D\uDD00" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var SHOWN_TABS = numbered(TAB_NAMES);
function shownTabs() {
  return SHOWN_TABS;
}
function tabBadge(id, counts) {
  return isRowTab(id) && counts[id] > 0 ? String(counts[id]) : null;
}
function isRowTab(tab) {
  return tab !== "overview";
}
function screenTabOf(tab) {
  return { label: TAB_NAMES.find((t) => t.id === tab)?.label ?? tab, isPage: !isRowTab(tab) };
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));

// ../core/domain/open-targets.ts
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

// ../core/domain/status-limits.ts
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
  const versions = (text) => [...words(text)].filter((w) => VERSION.test(w)).map((w) => w.replace(/^v/, "").replace(/(\.0)+$/, ""));
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
function stems(text) {
  return new Set([...words(text)].map(stem));
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}

// ../core/domain/ask-match.ts
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

// ../core/domain/press-messages.ts
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
  const run = c.bucket === "cancelled" ? runOf(c) : null;
  return run ? pr.checks.find((f) => f.bucket === "fail" && isSameRun(run, runOf(f))) ?? null : null;
}
function listedChecks(pr) {
  return [...failingChecks(pr), ...cancelledChecks(pr)];
}
function blockingChecks(pr) {
  return listedChecks(pr).filter((c) => !failedSibling(pr, c));
}

// ../core/domain/prs.ts
var PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
var PR_MENTION = /(?<![\w./-])(?:([\w.-]+\/[\w.-]+))?#([1-9]\d*)\b/g;
var PR_WORD_BEFORE = /\b(?:prs?|pull requests?|merg(?:e|es|ed|ing)|review(?:s|ed|ing)?|approv(?:e|es|ed|ing)|land(?:s|ed|ing)?)\s*$/i;
var LIST_JOIN = /^\s*(?:,\s*)?(?:and|or|then|&)?\s*$/i;
function namedPrs(text, known, repo) {
  const links = [...text.matchAll(PR_URL)].map((m) => ({
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
  const mentions = [...text.matchAll(PR_MENTION)].map((m) => ({
    at: m.index,
    end: m.index + m[0].length,
    ref: m[1] ? `${m[1]}#${m[2]}` : null,
    isBare: !m[1],
    number: m[2] ?? ""
  }));
  let lastEnd = -1;
  const named = [];
  for (const m of [...links, ...mentions].toSorted((a, b) => a.at - b.at)) {
    const isListed = lastEnd >= 0 && LIST_JOIN.test(text.slice(lastEnd, m.at));
    const isPrWord = PR_WORD_BEFORE.test(text.slice(0, m.at)) || isListed;
    const ref = !m.isBare ? m.ref : linked.has(m.number) ? null : tracked(m.number) ?? (isPrWord && repo && !hasTwinIn(known, m.number) ? `${repo}#${m.number}` : null);
    if (ref)
      named.push(ref);
    if (ref || linked.has(m.number))
      lastEnd = m.end;
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

// ../core/domain/help-steps.ts
var COMMAND_LABEL_CHARS = 64;
var commandLabel = (command) => clipLabel(command, COMMAND_LABEL_CHARS);
function helpLabel(help) {
  return help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? commandLabel(help.command)}` : help.kind === "terminal" ? `Copy ${help.name ?? commandLabel(help.command)}` : `Open ${help.name ?? new URL(help.url).host}`;
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open = helps.find((h) => h.kind === "open");
  if (!copy || !open || copy.kind !== "copy" || open.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map((h) => h === open ? { label: `Copy ${copy.name ?? "snippet"} and open ${baseName(open.path)}`, step: [copy, open] } : { label: helpLabel(h), step: [h] });
}
function prLinkName(ref, isTracked, repo) {
  const { repo: refRepo, name, number } = parseRef(ref);
  const isSessionRepo = refRepo.toLowerCase() === repo?.toLowerCase();
  return isTracked ? `PR #${number}` : isSessionRepo ? `#${number}` : `${name}#${number}`;
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
  if (help.kind !== "link")
    return help;
  const ref = linkRef(help.url);
  if (ref && (GITHUB_PR_OR_ISSUE_PAGE.test(help.url) || !help.name)) {
    const isTracked = tracked.some((pr) => isSameRef(pr.ref, ref));
    return { ...help, name: prLinkName(ref, isTracked, repo) };
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
  const named = namedPrs([item.ask, item.context ?? ""].join(`
`), [...urls.keys()], repo).flatMap((ref) => {
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
  if (!only)
    return [];
  const isAllTracked = named.every(({ ref }) => urls.has(ref));
  const label = links.length === 1 ? helpLabel(only) : isAllTracked ? `Open ${links.length} PRs` : clipLabel(`Open ${links.map((l) => l.name).join(", ")}`, COMMAND_LABEL_CHARS);
  return [{ label, step: links }];
}
function stepsOf(item, prs) {
  return [...steps(item.helps.map((h) => withLinkName(h, prs))), ...prSteps(item, prs)];
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
function localEffects(row, press) {
  if (!row.item)
    return [];
  if (press.action === "previews")
    return previewEffects(row.item);
  const step = press.action === "step" && press.step !== undefined ? row.steps[press.step] : undefined;
  return step ? stepEffects(row.item, step) : [];
}

// ../core/domain/ledger-close.ts
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

// ../core/domain/status-freshness.ts
var STALE_AFTER_CALLS = 5;
var STATUS_FAILED = "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It will read the whole conversation to fix this after the next reply. If that fails, it waits longer before each new try.";
function isStatusQuiet(o) {
  return o.changedAt !== null && o.quietCalls >= STALE_AFTER_CALLS;
}
function statusSyncText(sync, now) {
  if (sync.is !== "stale")
    return null;
  return sync.why === "failed" || sync.since === null ? STATUS_FAILED : `Not updated in ${duration(now - sync.since)}`;
}

// ../core/domain/status-suggest.ts
var hasRunningGoal = (o) => o.goal !== null && o.goal.metAt === null;

// ../core/view/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "▲", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "✦", tone: "opportunity" }
};
var QUESTION_MARK = { mark: "?", tone: "needsYou" };
var NEEDS_YOU_MARKS = {
  question: QUESTION_MARK,
  task: { mark: "☑", tone: "tasks" }
};
var SUBJECT_MARKS = {
  working: { mark: "●", tone: "working" },
  queued: { mark: "○", tone: null },
  "waits-on-other": { mark: "◌", tone: null },
  done: { mark: "✓", tone: null },
  dropped: { mark: "✗", tone: null }
};
var WAITS_ON_YOU_MARK = { mark: "◆", tone: "needsYou" };
var TASK_MARK = { mark: "□", tone: "tasks" };
var askMarkOf = (kind) => kind === "task" ? TASK_MARK : QUESTION_MARK;
var heldToneOf = (kinds) => kinds.some((k) => k === "question") ? QUESTION_MARK.tone : TASK_MARK.tone;
var RUNNING_FRAMES = ["●", "◉", "◎", "◉"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var IDLE_MARK = { mark: "◐", tone: "working" };
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "✕",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: WAITS_ON_YOU_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" },
  cancelled: { text: "⊘", tone: null }
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
  {
    mark: QUESTION_MARK.mark,
    tone: QUESTION_MARK.tone,
    isRunning: false,
    words: "A question for you. The work it holds up takes its color."
  },
  {
    mark: TASK_MARK.mark,
    tone: TASK_MARK.tone,
    isRunning: false,
    words: "A step only you can do. The work it holds up takes its color."
  },
  {
    mark: NEEDS_YOU_MARKS.task.mark,
    tone: NEEDS_YOU_MARKS.task.tone,
    isRunning: false,
    words: "The group of steps only you can do"
  },
  {
    mark: WAITS_ON_YOU_MARK.mark,
    tone: WAITS_ON_YOU_MARK.tone,
    isRunning: false,
    words: "Waits on your answer or approval: a delegate, a permission or a review thread"
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
var HELP_COPY = {
  name: "Help",
  icon: "?",
  keys: "Keys",
  indicators: "Indicators",
  version: "Inbox"
};
var helpVersionText = (version, isNextBuild) => `${HELP_COPY.version} ${versionLabel(version, isNextBuild)}`;
var UNDO_KEY = "u";
var COLLAPSE_KEY = "z";
var FOLD_ALL_KEY = "w";
var PR_TAB_HELP_KEYS = [
  { keys: "g", does: "On PRs, rank the PRs again, once a ranked PR changed" },
  { keys: "m", does: "On PRs, clear the merged and closed PRs" }
];
function helpKeys(look) {
  const tabKeys = shownTabs().map((t) => t.hotkey).join(" ");
  const switchTabs = { keys: tabKeys, does: "Switch tabs" };
  const undoKey = { keys: UNDO_KEY, does: "Undo the last close" };
  const collapseKey = { keys: COLLAPSE_KEY, does: "Collapse or expand the selected row" };
  const foldAllKey = { keys: FOLD_ALL_KEY, does: "Fold every fold on the tab, or open them all" };
  switch (look) {
    case "desktop":
      return [];
    case "terminal":
      return [
        switchTabs,
        { keys: "j k", does: "Select the next or previous row" },
        collapseKey,
        foldAllKey,
        undoKey,
        ...PR_TAB_HELP_KEYS,
        { keys: "ctrl+x tab", does: "Move focus to the line above the prompt, then the pane, then the prompt" }
      ];
    case "codex":
      return [
        switchTabs,
        { keys: "j k ↑ ↓", does: "Select the next or previous row" },
        collapseKey,
        foldAllKey,
        undoKey,
        ...PR_TAB_HELP_KEYS,
        { keys: "?", does: "Open or close help" },
        { keys: "esc", does: "Close help, or leave a reply field" }
      ];
    case "omp":
      return [
        { keys: `tab ${tabKeys}`, does: "Switch tabs" },
        { keys: "↑ ↓ j k", does: "Move between rows, or scroll a page" },
        { keys: "← →", does: "Pick a button" },
        { keys: "↵", does: "Press the picked button" },
        { keys: "t", does: "Reply to the selected row" },
        collapseKey,
        foldAllKey,
        undoKey,
        ...PR_TAB_HELP_KEYS,
        { keys: "?", does: "Open or close help" },
        { keys: "esc", does: "Close help, then the panel" }
      ];
    case "herdr":
      return [
        { keys: "← →", does: "Switch tabs" },
        { keys: "j k", does: "Select the next or previous row" },
        collapseKey,
        foldAllKey,
        undoKey,
        ...PR_TAB_HELP_KEYS,
        { keys: "esc", does: "Move focus back to the agent's terminal" }
      ];
  }
}

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
var MERGED_PREFIX = "merged in: ";
function mergedLine(merged, fits) {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, (names) => fits(`${MERGED_PREFIX}${names}`))}`;
}
var STALL_GAP = " · ";
var DAY_MS = 24 * 60 * 60000;
function subjectStall(x, isHeld, isWorkRunning, now) {
  if (isHeld)
    return null;
  const idleMs = now - x.changedAt;
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS;
  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: "muted" } : null;
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
var comparableName = (name) => name.toLowerCase().replace(/[\s\-_]+/g, "").replace(/[.!?:;,…]+$/, "");
var isSettled = (row) => row.mark === SUBJECT_MARKS.done.mark;
var textLevelOf = (row) => isSettled(row) ? "faint" : "muted";
var foldLevelOf = (row) => isSettled(row) ? "faint" : "muted";
var WAS_LEVEL = "faint";
var nameLevelOf = (row, otherwise) => isSettled(row) ? "faint" : otherwise;
var textBeyondName = (name, text) => text && comparableName(text) !== comparableName(name) ? text : null;
function isNamedLikeSubject(x, under) {
  return under.length === 1 && comparableName(under[0].name) === comparableName(x.name);
}
function carriedByChild(c, isHeld) {
  if (c.delegateState === "blocked")
    return { ...WAITS_ON_YOU_MARK, isRunning: false };
  if (c.delegateState === "finished" && !isHeld)
    return { ...SUBJECT_MARKS.done, isRunning: false };
  if (isChildWorking(c) && !isHeld)
    return { ...SUBJECT_MARKS.working, isRunning: true };
  return null;
}
function finishedLine(c, now) {
  if (c.summary)
    return c.summary;
  if (c.endedAt === null)
    return null;
  const finished = ago(now - c.endedAt);
  return `Ran ${duration(c.endedAt - c.startedAt)}, finished ${finished}`;
}
function childRow(c, branch, depth, text = null) {
  const marks = c.delegateState === "finished" ? SUBJECT_MARKS.done : c.delegateState === "blocked" ? WAITS_ON_YOU_MARK : CHILD_MARK;
  return {
    kind: "child",
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    text,
    branch
  };
}
function unplacedChildren(children, c) {
  const unshown = c.running.filter((x) => x.subjectId === null || !c.shownIds.has(x.subjectId)).map((child) => {
    const subject = c.subjects.find((y) => y.id === child.subjectId);
    return { child, milestoneId: subject === undefined ? null : c.milestoneOf(subject) };
  });
  const isFoldedFinished = (l) => l.child.delegateState === "finished" && l.milestoneId === null;
  const settled = [
    ...children.filter((x) => c.isSettled(x) && !c.subjects.some((y) => y.id === x.subjectId)),
    ...unshown.filter(isFoldedFinished).map((l) => l.child)
  ].sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0));
  return { loose: unshown.filter((l) => !isFoldedFinished(l)), settled };
}
function askWords(items, ask) {
  const item = items.find((i) => i.id === ask?.id);
  if (item === undefined)
    return null;
  return item.ask.replace(/\s+/g, " ").trim() || item.label?.trim() || (item.kind === "task" ? "Open task" : "Open question");
}
function askRows(parentId, ask, items, depth, branch) {
  const text = askWords(items, ask);
  if (ask === null || text === null)
    return [];
  return [{ kind: "ask", id: `${parentId}-ask`, depth, ...askMarkOf(ask.kind), text, ask, branch }];
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
    const lone = isOpen(x) && isNamedLikeSubject(x, under) ? under[0] : null;
    const carried = lone ? carriedByChild(lone, c.isHeld(x)) : null;
    const hasChildren = under.length > 0 && lone === null;
    const asks = askRows(x.id, c.askSettingMarkOf(x), c.items, depth + 1, hasChildren ? "mid" : "last");
    const ownMark = isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status];
    const ownStall = subjectStall(x, c.isHeld(x), isWorkRunning, c.now);
    rows.push({
      kind: "subject",
      id: x.id,
      depth,
      ...ownMark,
      ...c.isHeld(x) ? { tone: heldToneOf(c.holdKindsOf(x)) } : {},
      isRunning,
      ...carried,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? textBeyondName(x.name, x.text) : null,
      stall: asks.length === 0 && !carried ? ownStall : null,
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren,
      foldCount: lone === null ? under.length : 0,
      ask: asks[0]?.ask ?? null
    });
    rows.push(...asks);
    if (lone === null)
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

// ../core/view/status-folds.ts
function waitingUnderParents(ledger) {
  const o = ledger.overview;
  if (!o)
    return new Map;
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
var COUNTS_LABEL = "Also open: ";
var countsText = (counts) => `${COUNTS_LABEL}${counts.map((c) => `${c.mark} ${c.text}`).join(STALL_GAP)}`;
var COUNTS_GAP = STALL_GAP.replace(" ", " ");
var NONE_COLLAPSED = () => false;
function withoutCollapsed(rows, isCollapsed) {
  let hiddenBelow = null;
  return rows.flatMap((r) => {
    if (hiddenBelow !== null && r.depth > hiddenBelow)
      return r.kind === "ask" && r.depth === hiddenBelow + 1 ? [{ ...r, branch: "last" }] : [];
    hiddenBelow = r.kind === "subject" && isParentCollapsed(r, isCollapsed) ? r.depth : null;
    return [r];
  });
}
var askRowsOf = (rows) => rows.filter((r) => r.kind === "ask" && r.depth === 1);
var hasTreeDown = (r, isCollapsed) => r.ask !== null || r.hasChildren && !isParentCollapsed(r, isCollapsed);
function unfoldedRows(rows, isUnfolded, isCollapsed = NONE_COLLAPSED) {
  return withoutCollapsed(rows, isCollapsed).flatMap((r) => (r.kind === "done-fold" || r.kind === "counts") && isUnfolded(r.id) ? [r, ...r.rows] : [r]);
}
var isParentCollapsed = (p, isCollapsed) => p.foldCount > 0 && isCollapsed(p.id);
function milestoneRows(m, isUnfolded, isCollapsed = NONE_COLLAPSED) {
  if (m.foldId !== null && !isUnfolded(m.foldId))
    return [];
  return isParentCollapsed(m, isCollapsed) ? askRowsOf(m.rows) : unfoldedRows(m.rows, isUnfolded, isCollapsed);
}
var listRows = (milestones, rows) => [
  ...milestones.flatMap((m) => [...m.subject ? [m.subject] : [], ...m.foldId === null ? m.rows : []]),
  ...rows
];
function statusListRows(page) {
  return listRows(page.goal?.milestones ?? [], page.rows);
}

// ../core/view/status-path.ts
var LATER_TEXT = "Later";
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
function workJoints(rows, line) {
  const top = Math.min(...rows.map((r) => r.depth));
  const last = rows.findLastIndex((r) => r.depth === top);
  return rows.map((r, n) => {
    const arm = r.depth !== top ? null : line === null && n === last ? "elbow" : "tee";
    if (line !== null)
      return { arm, beside: line };
    return { arm, beside: n < last ? "connector" : null };
  });
}
function isSpacedAbove(milestones, n, isUnfolded, isCollapsed = () => false) {
  const drawsNameOnly = (m) => m.text === null && m.was === null && milestoneRows(m, isUnfolded, isCollapsed).length === 0;
  const above = milestones[n - 1];
  const m = milestones[n];
  return above === undefined || m === undefined || m.startsLater || !drawsNameOnly(above);
}

// ../core/view/status-goal-page.ts
var GOAL_HEADING = "Goal";
var NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed.";
var suggestedGoalOffer = (text) => `Next goal: “${text}”?`;
var MILESTONES_FOLD_PREFIX = "goal-milestones";
var MET_LABEL = "Goal met";
function shownMilestones(g, isUnfolded) {
  if (g === null)
    return [];
  return g.milestonesFold !== null && !isUnfolded(g.milestonesFold.id) ? [] : g.milestones;
}
function metMilestonesFold(g, milestones, isWorkClosed) {
  const isFolded = g.metAt !== null && milestones.length > 0 && milestones.every((m) => m.place === "done" && isWorkClosed(m));
  return isFolded ? { id: `${MILESTONES_FOLD_PREFIX}-${g.setAt}-${g.metAt}`, text: namedList(milestones.map((m) => m.name)) } : null;
}
function askSettingMark(holds) {
  const oldestFirst = [...holds].sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity));
  const setter = oldestFirst.find((i) => i.kind === "question") ?? oldestFirst[0];
  return setter ? { id: setter.id, kind: setter.kind } : null;
}
var asksLinkedTo = (items, links, id) => items.filter((i) => links[i.id]?.includes(id));
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
  const openServing = new Set(o.subjects.filter((s) => servingIds.has(s.id) && isOpen(s)).map((s) => s.id));
  const ownHolds = holds.filter((i) => {
    const to = o.askSubjects[i.id] ?? [];
    return to.includes(m.id) && !to.some((id) => openServing.has(id));
  });
  const lastChangeAt = Math.max(m.changedAt, m.madeNextAt ?? -Infinity);
  const isChanged = o.lastLookAt !== null && lastChangeAt > o.lastLookAt && lastChangeAt > (o.goal?.setAt ?? 0);
  return {
    id: m.id,
    ...SUBJECT_MARKS[m.status],
    ...isHeld ? { tone: heldToneOf(holds.map((i) => i.kind)) } : {},
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
    rows: isHeld ? askRows(m.id, askSettingMark(ownHolds), items, 1, null) : [],
    subject: null
  };
}
function goalPage(o, items) {
  const g = o?.goal ?? null;
  const suggestedGoal = o === null || hasRunningGoal(o) ? null : o.suggestedGoal;
  if (o === null || g === null)
    return { goal: null, canRestoreGoal: o?.goalRemoved != null, suggestedGoal };
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt);
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const shown = o.milestones.filter((m) => m.status !== "dropped" || o.lastLookAt !== null && m.changedAt > o.lastLookAt);
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
    return [toggleFold(row.id, row.text)];
  if (row.kind === "counts")
    return [toggleFold(row.id, countsText(row.counts))];
  return row.kind === "ask" ? [viewAsk(row.ask)] : [];
}
var toggleFold = (foldId, label) => ({
  press: { action: "toggle-fold", foldId },
  label,
  hotkey: "f",
  kind: "view",
  emphasis: "quiet"
});
function milestoneKeyPlan(m) {
  return m.foldId === null ? [] : [toggleFold(m.foldId, m.name)];
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
function suggestionKeyPlan(suggested) {
  return [
    { press: { action: "take-goal" }, label: "Set goal", hotkey: "s", kind: "mark", emphasis: "quiet" },
    { press: { action: "type-goal", text: suggested }, label: "Edit", hotkey: "e", kind: "view", emphasis: "quiet" }
  ];
}
function goalKeyGroups(page) {
  if (page.suggestedGoal === null)
    return { heading: goalKeyPlan(page), offer: [] };
  return { heading: page.canRestoreGoal ? [RESTORE_GOAL] : [], offer: suggestionKeyPlan(page.suggestedGoal) };
}
var GOAL_FIELD = { placeholder: "An outcome to work toward" };
var goalSubmitLabel = (page) => page.goal === null || page.goal.isMet ? "Set" : "Save";

// ../core/view/pressed.ts
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

// ../core/domain/presses.ts
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}

// ../core/view/timing.ts
var SETTLED_MS = 5120;
var PRESS_GUARD_MS = 400;
var QUEUED_AFTER_MS = 1000;
var COMPARE_LIMIT_MS = 30 * 60000;
var PR_READ_WAIT_MS = 60000;
function timedChangeAt(lastActions, now) {
  const ends = Object.entries(lastActions).flatMap(([id, l]) => {
    if (l.action === "compare")
      return [l.at + COMPARE_LIMIT_MS];
    return l.kind === "handoff" && isPrRowId(id) && l.repliedAt !== undefined ? [l.repliedAt + PR_READ_WAIT_MS] : [];
  }).filter((at) => at > now);
  return ends.length > 0 ? Math.min(...ends) : null;
}
function queuedSentAt(last) {
  return last.delivery?.state === "queued" ? last.delivery.sentAt ?? last.at : last.at;
}
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - queuedSentAt(last) >= QUEUED_AFTER_MS;
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
  const isWaiting = now < dueAt || isUndoShown || isSendOnItsWay(state.delivery) && (state.sentAt ?? state.at) <= dueAt || isPressOutSince(pressOutSince, dueAt) || isListInUseSince(listInput, dueAt, now);
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
function hasRunningMark(page) {
  return statusListRows(page).some((r) => (r.kind === "subject" || r.kind === "child") && r.isRunning);
}

// ../core/view/band.ts
function isMaybeStale(ledger) {
  return ledger.is === "stale" || ledger.is === "unavailable";
}
function nothingText(ledger, current = NOTHING_NEEDED_TEXT) {
  return { text: isMaybeStale(ledger) ? MAYBE_STALE_TEXT : current, isChecking: ledger.is === "checking" };
}
function dialogWaitText(agent, kind) {
  return kind === "question" ? `${agent} is waiting for your answer` : `${agent} is waiting for your permission`;
}

// ../core/domain/status-children.ts
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
var LOOK_MIN_MS = 5000;
function subjectSeenAt(o, id) {
  return id in o.missedInLastLook ? o.missedInLastLook[id] ?? null : o.lastLookAt;
}
function isSubjectSeen(o, s) {
  const seenAt = subjectSeenAt(o, s.id);
  return seenAt !== null && s.changedAt <= seenAt;
}

// ../core/domain/children.ts
var ENDED = new Set(["completed", "failed", "killed", "stopped"]);

// ../core/domain/gh.ts
var GH_TIMEOUT_MS = 20000;

// ../core/remote/hc-terminals.ts
var HC_BLOCKED = new Set(["blocked", "error"]);

// ../core/remote/herdr-labels.ts
var SESSION_LABEL = "inbox.session";
var PANEL_LABEL = "inbox.panel";
var PRESS_LABEL = "inbox.press";

// ../core/domain/ask-subject.ts
var EMPTY_WORDS = new Set(`a about above after again ahead all already also an and any anything are as at back be been before being below both
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
code problem stuff part green current new old latest previous mentioned proposed suggested remaining pending`.split(/\s+/));

// ../core/domain/reply-parse.ts
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}

// ../core/domain/ledger-update.ts
var EXPIRED = "expired, unanswered";
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

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
  if (old)
    return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time2(s?.changedAt);
  const keptAt = time2(s?.keptAt);
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
    ...keptAt === null ? {} : { keptAt },
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
function newestEnd(children) {
  const ends = children.flatMap((c) => c.endedAt === null ? [] : [c.endedAt]);
  return ends.length === 0 ? null : Math.max(...ends);
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

// ../core/domain/inbox-text.ts
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

// ../core/domain/last-actions.ts
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

// ../core/domain/host-tasks.ts
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

// ../core/domain/pr-fetch.ts
var MAX_PRS = 12;
var PR_SHARED_MS = 120000;
var PRS_REFRESH_MS = 120000;
var PR_POLL_MS = 15000;
var CLOSED_PR_REFRESH_MS = 60 * 60000;
var LIMIT_RETRY_MS = 5 * 60000;
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
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`;

// ../core/view/rows.ts
var OPTIONS_FOLD_AT = 5;
var DOT = " · ";
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions", mark: NEEDS_YOU_MARKS.question },
  { kind: "task", title: "Tasks", list: "tasks", mark: NEEDS_YOU_MARKS.task }
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
var STOPPED_REASON = "you stopped this session. It takes inbox messages again after you write to it.";
function sessionKeyOf(reason, canShowSession) {
  return canShowSession && reason === STOPPED_REASON ? { label: ROW_COPY.goToSession, emphasis: "normal" } : null;
}
function closedLinePlan(d, canShowSession = false) {
  const sessionKey = sessionKeyOf(refusalOf(d.delivery), canShowSession);
  if (canUndoRefused(d.delivery))
    return { action: { label: ROW_COPY.undo, press: { id: d.id, action: "undo" } }, sessionKey };
  const reopen = { label: ROW_COPY.reopen, press: { id: d.id, action: "undo" } };
  return { action: d.how === "dismissed" ? reopen : null, sessionKey };
}
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  return actions.flatMap((a) => {
    if (a.press.action !== "answer")
      return [];
    const description = descriptions && Object.hasOwn(descriptions, a.press.option) ? descriptions[a.press.option] : null;
    const reason = item?.rec === a.press.option && item.recReason ? item.recReason : null;
    if (description === null && reason === null)
      return [];
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
function optionBody(o) {
  if (o.description === null)
    return null;
  if (o.reason === null)
    return o.description;
  return `${o.description}${/[.!?]$/.test(o.description) ? "" : "."} ${recommendedLine(o.reason)}`;
}
function optionReasonLine(o) {
  return o.description === null && o.reason !== null ? recommendedLine(o.reason) : null;
}
var recommendedLine = (reason) => `Recommended: ${reason}`;
function optionNote(o) {
  return o ? optionBody(o) ?? optionReasonLine(o) : null;
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
  return rows.filter((r) => r !== undefined && isWaitingRow(r) && r.type !== "dialog").length;
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
function openMark(row) {
  if (row.type === "finding")
    return null;
  const m = row.type === "task" ? TASK_MARK : row.type === "dialog" ? WAITS_ON_YOU_MARK : QUESTION_MARK;
  return { text: m.mark, isRunning: false, tone: m.tone };
}
function rowMark(row) {
  return rowResultMark(row) ?? (row.state.is === "open" ? openMark(row) : null);
}
function allRows(v) {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows];
}
function settledRowIds(rows) {
  return rows.filter((r) => r.state.is === "settled").map((r) => r.id);
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
var QUEUED_RESULT = { text: SUBJECT_MARKS.queued.mark, isRunning: false };
function closedMark(state, delivery) {
  if (delivery === "sending")
    return RUNNING_RESULT;
  if (delivery === "queued")
    return QUEUED_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function canUndoRefused(delivery) {
  return delivery !== null && typeof delivery === "object" && delivery.canUndo;
}
function settledTone(state) {
  return state.delivery === null && state.closedAs === "handled" ? "done" : "muted";
}
function closedTitleTone(state) {
  if (isSendRefused(state.delivery))
    return "error";
  return state.closedAs === "handled" ? "done" : "muted";
}
var refusalOf = (delivery) => isSendRefused(delivery) ? delivery.error : null;
function isSendRefused(delivery) {
  return delivery !== null && typeof delivery === "object";
}
function settledLabel(label, delivery, reply) {
  if (delivery && typeof delivery === "object")
    return `${label} · Not sent: ${delivery.error}`;
  return deliveryLabel(sendStepOf(delivery), label, reply);
}
var MAX_OUTCOME_CHARS = 120;
function shortOutcome(outcome) {
  return cutLine(outcome, (t) => t.length <= MAX_OUTCOME_CHARS);
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(shortOutcome(c.outcome));
}

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
function isBlockPressShown(pr, lastActions) {
  const result = lastActions[prMarkId(pr.ref)]?.result;
  if (result?.action !== "check-rerun")
    return true;
  const isSamePress = (r) => r !== undefined && (r.pressId !== undefined ? r.pressId === result.pressId : r.at === result.at);
  return !blockingChecks(pr).some((c) => isSamePress(lastActions[prCheckId(pr, c)]?.result));
}
var GH_MISSING_TEXT = "The inbox could not find gh. It needs gh to read your PRs.";
var GH_SIGNED_OUT_TEXT = "gh is not signed in to GitHub. Run gh auth login so the inbox can read your PRs.";
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
function ghNoticeOf(gh) {
  if (gh.is === "unavailable")
    return gh.why === "gh-missing" ? { kind: "gh-missing", text: GH_MISSING_TEXT } : { kind: "gh-signed-out", text: GH_SIGNED_OUT_TEXT };
  if (gh.is !== "stale")
    return null;
  const { failure } = gh.why;
  return { kind: failure.kind === "limit" ? "gh-limited" : "gh-failed", text: fetchFailureNotice(failure) };
}
function prSyncOf(sync, ref) {
  return sync.prs[ref] ?? { is: "unavailable", why: "dropped" };
}
function shownReadiness(pr, sync, isSent, agent) {
  const shown = readiness(pr, isSent, agent);
  return shown.status === "ready" && sync.is !== "fresh" ? null : shown;
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
function isPrTabRunning(prs, lastActions) {
  return prs.some((pr) => waitingThreads(pr).some((t) => threadRowText(pr, t, lastActions).mark.isRunning));
}
function prRowWaits(prs, lastActions, collapsed = []) {
  const isSent = threadSentIn(lastActions);
  const isCollapsed = (id) => collapsed.includes(id);
  return prs.flatMap((pr) => [
    ...waitingThreads(pr).map((t) => {
      const id = prThreadId(pr, t);
      return { id, isWaiting: !isSent(pr, t), isCollapsed: isCollapsed(id) };
    }),
    ...listedChecks(pr).map((c) => {
      const id = prCheckId(pr, c);
      const last = lastActions[id];
      const isFixWaiting = !isFoldingPress(id, last) || last?.delivery?.state === "failed";
      return {
        id,
        isWaiting: failedSibling(pr, c) === null && isFixWaiting,
        isCollapsed: isCollapsed(id)
      };
    })
  ]);
}
var PR_TONES = {
  ready: "success",
  blocked: "needsYou",
  waiting: null,
  draft: null,
  merged: "findings",
  closed: "error"
};

// ../core/view/saved-check-keys.ts
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

// ../core/domain/stops.ts
function apiErrorOf(detail) {
  if (detail === "rate_limit")
    return { cause: "rate-limit", text: null };
  if (detail === "overloaded")
    return { cause: "overloaded", text: null };
  return { cause: "other", text: detail || null };
}
function withApiError(stop) {
  const apiError = stop.apiError === undefined ? stop.kind === "api-error" ? apiErrorOf(stop.detail) : null : stop.apiError;
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

// ../core/view/dialog-row.ts
function dialogRowId(dialog) {
  return `dialog:${dialog.kind}:${dialog.text ?? ""}`;
}
function dialogTitle(dialog) {
  return drawableText(dialog.kind === "permission" ? `Allow ${dialog.text}?` : dialog.text);
}
function answerPlace(agent, kind) {
  return kind === "question" ? `Answer the question in ${agent}'s dialog.` : `Allow or deny it in ${agent}'s dialog.`;
}
function dialogRow(dialog, agent) {
  return {
    id: dialogRowId(dialog),
    type: "dialog",
    number: null,
    title: dialog.text ? dialogTitle({ kind: dialog.kind, text: dialog.text }) : dialogWaitText(agent, dialog.kind),
    at: null,
    detail: null,
    fileName: null,
    replyKind: "answer",
    item: null,
    finding: null,
    steps: [],
    state: { is: "open" },
    feedback: null,
    actions: [],
    optionDescriptions: [],
    holdsUpLine: null,
    contextLine: answerPlace(agent, dialog.kind),
    earlierLine: null
  };
}
function withDialogRow(view, dialog, agent) {
  if (!dialog)
    return view;
  return { ...view, needsYou: { ...view.needsYou, questions: [dialogRow(dialog, agent), ...view.needsYou.questions] } };
}

// ../core/remote/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries([STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null]));
var HERDR_CHECK_MS = 30000;
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

// ../core/view/arrivals.ts
function recordRows(seen, listed) {
  const next = { ...seen };
  const added = {};
  for (const tab of Object.keys(listed)) {
    const ids = listed[tab];
    const before = seen[tab];
    added[tab] = ids && before ? ids.filter((id) => !before.has(id)) : [];
    if (ids)
      next[tab] = new Set(ids);
  }
  return { seen: next, added };
}
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);
function listedRowIds(v) {
  return {
    needsYou: [...v.needsYou.questions, ...v.needsYou.tasks].map((r) => r.id),
    findings: v.findings.rows.map((r) => r.id)
  };
}
function openRowIds(v) {
  const open = (rows) => rows.filter((r) => r.state.is !== "settled").map((r) => r.id);
  return { needsYou: open([...v.needsYou.questions, ...v.needsYou.tasks]), findings: open(v.findings.rows) };
}
function closedGroups(v, tab, isUnfolded) {
  return tab === "findings" ? Object.keys(FINDING_GROUPS).map((kind) => ({
    isUnfolded: isUnfolded(kind),
    rows: v.findings.closed.filter((f) => f.kind === kind)
  })) : NEEDS_YOU_GROUPS.map((g) => ({ isUnfolded: isUnfolded(g.kind), rows: v.needsYou.closed[g.list] }));
}
function isRowTabRunning(v, tab, isUnfolded) {
  const rows = tab === "needsYou" ? [...v.needsYou.questions, ...v.needsYou.tasks] : v.findings.rows;
  const settled = new Set(settledRowIds(rows));
  const closed = closedGroups(v, tab, isUnfolded).flatMap((g) => g.isUnfolded ? closedShown(g.rows, settled) : []);
  return rows.some((r) => rowResultMark(r)?.isRunning) || closed.some((d) => d.mark.isRunning);
}
function isTabEmpty({
  rows,
  settled,
  closed,
  hasBlocker
}) {
  return !hasBlocker && !rows.some((r) => r.state.is !== "settled" || settled.has(r.id)) && !closed.some((g) => g.isUnfolded && g.rows.some((r) => !settled.has(r.id)));
}
function followTo(tabs, shown, isShownEmpty, rows) {
  return isShownEmpty ? tabs.find((t) => t !== shown && rows[t].length > 0) ?? null : null;
}
function prRowIds(drawn) {
  return drawn.flatMap(({ pr, state }) => [
    prMarkId(pr.ref),
    ...state.is === "settled" ? [] : [...waitingThreads(pr).map((t) => prThreadId(pr, t)), ...listedChecks(pr).map((c) => prCheckId(pr, c))]
  ]);
}
function isPrsTabEmpty(drawnCount, isFetching) {
  return drawnCount === 0 && !isFetching;
}
var NEW_HOLD_MS = 1500;
var NEW_FADE_MS = 3000;
var NEW_STEPS = 6;
function addNewRows(rows, added) {
  const next = new Map(rows);
  for (const [tab, ids] of Object.entries(added))
    for (const id of ids ?? [])
      if (!next.has(id))
        next.set(id, { tab, shownAt: null });
  return next;
}
function showNewRows(rows, tab, now) {
  const next = new Map;
  for (const [id, row] of rows) {
    const shown = row.tab === tab && row.shownAt === null ? { ...row, shownAt: now } : row;
    if (newRowShare(shown, now) > 0)
      next.set(id, shown);
  }
  return next;
}
function newRowIn(rows, id, tab) {
  const row = rows.get(id);
  return row?.tab === tab ? row : undefined;
}
function newRowShare(row, now) {
  if (!row)
    return 0;
  if (row.shownAt === null)
    return 1;
  const p = (now - row.shownAt - NEW_HOLD_MS) / NEW_FADE_MS;
  if (p >= 1)
    return 0;
  if (p <= 0)
    return 1;
  return (1 + Math.cos(Math.PI * p)) / 2;
}
function steppedShare(row, now, steps = NEW_STEPS) {
  if (row?.shownAt == null)
    return newRowShare(row, now);
  const step = NEW_FADE_MS / steps;
  const faded = Math.max(0, now - row.shownAt - NEW_HOLD_MS);
  return newRowShare(row, row.shownAt + NEW_HOLD_MS + Math.floor(faded / step) * step);
}
var TITLE_TINT = 0.65;
function closedTitleClock(seen, id, closedAt, now) {
  const key = `${id}:${closedAt}`;
  const total = NEW_HOLD_MS + NEW_FADE_MS;
  let shownAt = seen.get(key);
  if (shownAt === undefined) {
    if (now - closedAt >= total)
      return;
    shownAt = now;
    seen.set(key, shownAt);
  }
  return now - shownAt < total ? { tab: "", shownAt } : undefined;
}
function steppedTitleTint(clock, now) {
  return steppedShare(clock, now) * TITLE_TINT;
}
function titleTintEndsAt(rows, v, seen, now) {
  const total = NEW_HOLD_MS + NEW_FADE_MS;
  const ends = [...rows.values()].flatMap((r) => r.shownAt === null ? [] : [r.shownAt + total]);
  for (const r of [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]) {
    if (r.state.is !== "settled" || closedTitleTone(r.state) === "muted")
      continue;
    const shownAt = seen.get(`${r.id}:${r.state.at}`) ?? (now - r.state.at < total ? now : undefined);
    if (shownAt !== undefined)
      ends.push(shownAt + total);
  }
  const next = Math.min(...ends.filter((at) => at > now), Infinity);
  return next === Infinity ? null : next;
}

// ../core/view/pr-views.ts
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
function settledPrState(mark, now, settleWindowMs, isUndoOut) {
  const closed = mark.text === PR_MERGED_LABEL ? { how: "update", outcome: PR_MERGED_LABEL } : mark.text === PR_CLOSED_LABEL ? { how: "expired", outcome: PR_CLOSED_LABEL } : { how: "dismissed", outcome: PR_DISMISSED_LABEL };
  const state = closedRowState(closed, mark.at, now, settleWindowMs, null);
  return { ...state, canUndo: isUndoOut || isUndoLeft(mark.at, now, settleWindowMs), offersUndo: true };
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
    const state = settledPrState(mark, now, settleWindowMs, (placing.undoOut ?? []).includes(prMarkId(pr.ref)));
    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : [];
  });
  return drawn.map((d) => ({ ...d, isRanked: rankOf(d.pr, ranked) !== null }));
}

// ../core/view/press-reducer.ts
var STALE_TEXT = "This changed before your press. Nothing was sent.";
function noteText() {
  return STALE_TEXT;
}
function isPressConfirmed(outcome) {
  return outcome.error === null && outcome.note === null && !outcome.isUnconfirmed;
}

// ../core/view/feedback.ts
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
  if (f?.is === "sending")
    return f.sentAt;
  if (f?.is === "working")
    return f.at;
  if (f?.is !== "local")
    return null;
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
    const under = last.kind === "talk" ? feedbackOf(id, { ...last, result: undefined }, undefined, turns, now, reportedAt) : null;
    const isTalkOut = under?.is === "working" || under?.is === "sending" || under?.is === "queued";
    const talkOutSince = isTalkOut ? under.is === "sending" ? under.sentAt : under.at : undefined;
    return { is: "local", result, ...talkOutSince === undefined ? {} : { talkOutSince } };
  }
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
  const isHandoffWorking = last.kind === "handoff" && isPrRowId(id) && last.repliedAt === undefined;
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
  "pr-rank-again": "Ranking…",
  "pr-conflicts": "Resolving conflicts…",
  "pr-address-all": "Addressing…",
  "pr-merge": "Merging…",
  "thread-address": "Addressing…",
  "check-fix": "Fixing…"
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
function feedbackTone(f) {
  if (isFailure(f))
    return "error";
  return f?.is === "done" || f?.is === "local" && f.result.state === "done" ? "done" : "muted";
}
function hasAge(f) {
  return f.is === "done" || f.is === "working" || f.is === "stillOpen" || f.is === "noComparison" || f.is === "sending" || f.is === "queued" || f.is === "unconfirmed" || f.is === "closed";
}
function rowAgeAt(last, arrivedAt) {
  return last && hasAge(last) ? last.at : arrivedAt;
}
function isPressOut(f) {
  return f?.is === "working" || f?.is === "sending" || f?.is === "queued" || f?.is === "unconfirmed" || f?.is === "local" && f.result.state === "pending";
}
function pressOutAction(last, f) {
  if (f?.is === "local" && f.result.state !== "pending" && f.talkOutSince !== undefined)
    return last?.action ?? null;
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
  return isOpen && (isPressOut(f) || f?.is === "local" || isDoneStillWaiting);
}
var holdsStatusWhileOut = (kind) => kind === "mark";
var runIt = (look) => isTerminalLike(look) ? "Run it in a terminal, or type ! and paste." : "Run it in Terminal.";
var VERBS = {
  open: { pending: "Opening", done: "Opened", failed: "open" },
  copy: { pending: "Copying", done: "Copied", failed: "copy" },
  "refresh-prs": { pending: "Refreshing", done: "Refreshed", failed: "refresh" },
  rerun: { pending: "Starting a re-run of", done: "Started a re-run of", failed: "start a re-run of" },
  scroll: { pending: "Showing", done: "Shown", failed: "show" }
};
var doneText = (p) => p.kind === "scroll" ? "Shown in the conversation" : `${VERBS[p.kind].done} ${p.name}`;
function localText(r, look) {
  const isPrs = r.parts.length > 1 && r.parts.every((p) => p.kind === "open" && p.error === null && /^PR #\d+$/.test(p.name));
  const parts = isPrs ? [{ ...r.parts[0], name: `${r.parts.length} PRs` }] : r.parts;
  if (r.state === "pending")
    return `${parts.map((p) => `${VERBS[p.kind].pending} ${p.name}`).join(DOT)}…`;
  const text = parts.map((p) => p.error === null ? doneText(p) : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`).join(DOT);
  if (r.state === "failed")
    return text;
  const isCommand = parts.some((p) => p.kind === "copy" && p.isCommand);
  return `${text}${isCommand ? `. ${runIt(look)}` : ""}`;
}
var STOPPED_WARNING = "Not sent until you write to Claude: you stopped this session.";
var warningOf = (isSendHeld, sends, shown) => {
  const isRefusalShown = shown?.includes(STOPPED_REASON) ?? false;
  return isSendHeld && sends && !isRefusalShown ? STOPPED_WARNING : null;
};
var stoppedWarningOf = (isSendHeld, buttons, shown) => warningOf(isSendHeld, buttons.some((b) => b.kind === "talk" || b.kind === "handoff" || b.kind === "mark"), shown);
var prStoppedWarningOf = (isSendHeld, buttons, shown) => warningOf(isSendHeld, buttons.some((b) => b.kind === "talk" || b.kind === "handoff"), shown);
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

// ../core/view/pr-press.ts
var PR_REFRESH = { kind: "refresh-prs", name: "PRs" };
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
  "check-rerun": RERUN_LABEL,
  "pr-address-all": "Address all",
  "pr-merge": "Merge",
  "thread-address": "Address"
};
function isPrReadFirstPress(p) {
  return p.action === "pr-conflicts" || p.action === "check-fix" || p.action === "check-rerun";
}
function readFirstEffect(pr) {
  return { kind: "refresh-prs", name: `PR #${pr.number}` };
}
function prPressEffect(pr, p) {
  if (p.action === "pr-refresh")
    return PR_REFRESH;
  if (!pr)
    return null;
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
function isViewBeforeReply(last, fetchedAt) {
  return last?.repliedAt !== undefined && fetchedAt !== undefined && fetchedAt <= last.repliedAt;
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
function again(row, action, label) {
  return isAgain(row.last, action, row.pressing === action) ? `${label} again` : label;
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}
function prPlan(row, actions, canShowSession) {
  const delivery = row.last?.delivery;
  return { actions, sessionKey: sessionKeyOf(delivery?.state === "failed" ? delivery.reason : null, canShowSession) };
}
function retryAction(retry) {
  return retry ? [{ press: retry.press, label: "Try again", kind: retry.kind, emphasis: "normal", icon: "retry", isRetry: true }] : [];
}

// ../core/view/pr-order.ts
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
function rankAgainPlan(actions, presses, canShowSession) {
  return prPlan(lastPressOf(presses, RANK_AGAIN_ID), actions, canShowSession);
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

// ../core/view/pr-refresh.ts
var PR_REFRESH_LABEL = "Refresh PRs";
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
    actions: problem === null && row.pressing === null ? [] : prRefreshActions(row),
    showsPress: isPressShown
  };
}
function prRefreshActions(row) {
  return withOut(row, [
    { press: { action: "pr-refresh" }, label: PR_REFRESH_LABEL, kind: "local", emphasis: "normal", icon: "retry" }
  ]);
}

// ../core/view/pr-tab.ts
function threadActions(pr, t, presses, canShowSession = false) {
  const row = lastPressOf(presses, threadRowId(pr.ref, t.id), pr.fetchedAt);
  const on = { ref: pr.ref, thread: t.id };
  const actions = withOut(row, [
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
  return prPlan(row, actions, canShowSession);
}
function checkActions(pr, c, presses, canShowSession = false) {
  const row = lastPressOf(presses, prCheckId(pr, c), pr.fetchedAt);
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
  const shown = isRunRerunOut ? actions.map((a) => a.press.action === "check-rerun" ? { ...a, isOut: true } : a) : actions;
  return prPlan(row, shown, canShowSession);
}
function prBlockActions(pr, isThreadSent, branchRef, presses, sync, canShowSession = false) {
  const row = lastPressOf(presses, prMarkId(pr.ref), pr.fetchedAt);
  const isReadyShown = shownReadiness(pr, sync, isThreadSent, "Claude")?.status === "ready";
  const waitingOn = threadsOnYou(pr, isThreadSent).length;
  const moves = [
    ...isReadyShown ? [
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
  const actions = withOut(row, [
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
  return prPlan(row, actions, canShowSession);
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

// ../core/view/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var FOLLOW_UPS = new Set([
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
function actionsOf(row, last, state, feedback, isUndoOut = false, canScrollConversation = false) {
  const { id, item, steps } = row;
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const isFirstExplanationOut = last?.explanation?.isFirstReply === true && pressing === "explain";
  const isExplanationShown = canScrollConversation && last?.explanation?.replyId !== undefined && !isFirstExplanationOut;
  const action = (press, label, kind, flags = {}) => {
    const pressAction = actionId(press);
    return {
      press,
      label: press.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press.action === "address" ? "primary" : press.action === "type" || press.action === "discuss" || press.action === "explain" || press.action === "show-explanation" || press.action === "compare" || press.action === "dismiss" || press.action === "discard" ? "quiet" : "normal",
      ...press.action === "done" ? { icon: "done" } : press.action === "step" && stepIconKind(steps[press.step]) ? { icon: stepIconKind(steps[press.step]) } : {},
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
  const stepActions = steps.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
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
      ...item.options.length > 0 ? item.options.map((option, n) => action({ action: "answer", id, option }, option, "mark", {
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })) : [action({ action: "done", id }, "Done", "mark")],
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      ...explainActions,
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map((option, n) => action({ action: "answer", id, option }, option, "mark", {
      isPrimary: option === item.rec,
      isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
    })),
    ...item.previewPage ? [action({ action: "previews", id }, OPEN_PREVIEWS_LABEL, "local")] : [],
    ...stepActions,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    ...explainActions,
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
var opensFor = (r) => r.isWaiting && !r.isCollapsed;
function listWaits(v) {
  const lists = drawnLists(v, () => true, (r) => r);
  const collapsed = new Set(v.collapsed);
  const waits = (entries) => entries.map((x) => ("row" in x) ? { id: x.row.id, isWaiting: isWaitingRow(x.row), isCollapsed: collapsed.has(x.row.id) } : { id: x.settled.id, isWaiting: false });
  return { needsYou: waits([...lists.questions, ...lists.tasks]), findings: waits(lists.findings) };
}
function firstWaiting(rows) {
  return rows.find(opensFor)?.id ?? null;
}
function openOnArrival(rows, picked, added) {
  if (added.length === 0)
    return null;
  if (picked === null)
    return keptOpen(rows, added);
  return drawsOpen(rows, picked) ? null : firstWaiting(rows.filter((r) => added.includes(r.id)));
}
function drawsOpen(rows, id) {
  return id !== null && !rows.find((r) => r.id === id)?.isCollapsed;
}
function steppedIndex(at, step, count) {
  if (count === 0)
    return -1;
  const from = at < 0 ? step > 0 ? -1 : 0 : at;
  return ((from + step) % count + count) % count;
}
function keptOpen(rows, added) {
  return firstWaiting(rows.filter((r) => !added.includes(r.id)));
}
function rowsIn(entries) {
  return entries.flatMap((x) => ("row" in x) ? [x.row] : []);
}
function rowKeyPlan(r, isAllShown, canShowSession = false) {
  const shown = r.actions.filter((a) => isAllShown || !a.isFolded);
  const folded = r.actions.length - shown.length;
  const lastOption = shown.map((a) => a.press.action).lastIndexOf("answer");
  const options = [];
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
      if (press.action === "answer" && r.type !== "task") {
        const note = optionNote(r.optionDescriptions.find((d) => d.option === press.option));
        options.push({ action: { ...a, press }, note, ...hotkey });
      } else
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
  const notSent = r.feedback?.is === "notSent" ? r.feedback.reason : null;
  const refusal = r.state.is === "settled" ? refusalOf(r.state.delivery) : notSent;
  const sessionKey = sessionKeyOf(refusal, canShowSession);
  return { options, keys, more, answerRow: answerRowOf(r, options), sessionKey };
}
function answerRowOf(r, options) {
  const described = options.map((o) => r.optionDescriptions.find((d) => d.option === o.action.press.option));
  const hasDescription = described.some((d) => d !== undefined && d.description !== null);
  if (options.length < 2 || hasDescription)
    return null;
  return { recLine: described.map((d) => d ? optionReasonLine(d) : null).find((l) => l !== null) ?? null };
}
function answersFitLine(widths, gap, room) {
  return widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1) <= room;
}

// ../core/domain/field-limits.ts
var RECORD_LIMITS = {
  ask: 200,
  context: 200,
  options: 60,
  option_notes: 120,
  why: 120,
  steps: 4000,
  title: 120,
  detail: 600,
  path: 300
};

// ../core/domain/earlier-answers.ts
var EARLIER_TEXT_CHARS = RECORD_LIMITS.ask;
var shortText = (text) => cutLine(text.trim(), (t) => t.length <= EARLIER_TEXT_CHARS);
var STOP_WORDS2 = new Set(`a an the and or of to in on for with at by from into onto is are was were be been being it its this that these
those i you we he she they me my your our their them as if then than so do does did done can could should would will
shall may might must not no yes now still also just again already instead yet any all some each per via up out over
about after before when while which what who whom why how where whether there here let lets get got have has had
pr prs`.split(/\s+/));
var DAY_MS2 = 24 * 60 * 60000;
function agoText(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60)
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(ms / DAY_MS2);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
function earlierLineOf(earlier, now) {
  if (!earlier?.isShown)
    return null;
  const where = earlier.repo ? `, in ${earlier.repo},` : "";
  return {
    lead: "You answered ",
    answer: shortText(earlier.answer),
    rest: ` ${agoText(now - earlier.at)}${where} to “${shortText(earlier.ask)}”`
  };
}
function earlierLineText(line) {
  return `${line.lead}${line.answer}${line.rest}`;
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
  sessionPrs,
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
  const pressOutSinceWhere = (isOnTab) => earliestOf(Object.entries(lastActions).map(([id, last]) => isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, turns, now, reportedAtOf(id))) : null));
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
  const isInPlace = (id, at, canUndo, last, sentAt) => isSettledInPlace({ at, canUndo, delivery: pendingDeliveryAt(last, now), ...sentAt !== undefined && { sentAt } }, isFindingId(id) ? placingFor.findings : placingFor.needsYou, id);
  const pressedSend = (c) => {
    const last = lastActions[c.id];
    return (c.how === "answered" || c.how === "done") && last?.kind === "mark" && last.at === closedAt(c) ? last : undefined;
  };
  const doneSentAt = (c) => {
    const delivery = c.how === "done" ? pressedSend(c)?.delivery : undefined;
    return delivery && "sentAt" in delivery ? delivery.sentAt : undefined;
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
    return replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isInPlace(c.id, at, isAnswerHeld(c) || canUndoClose(c, at, now, settleWindowMs), pressedSend(c), doneSentAt(c)));
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
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt), undoOut.includes(row.id), canScrollConversation);
    const held = state.is === "open" ? heldSubjectsOf(ledger.overview, row.id) : [];
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held.length > 0 ? `${HOLDS_UP_TEXT} ${held.map((s) => s.name).join(", ")}` : null,
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
      steps: stepsOf(item, sessionPrs)
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
    status,
    collapsed
  };
}
function heldLabel(c) {
  if (c.how === "answered")
    return `Answered: ${shortOutcome(c.outcome)}`;
  return c.how === "claude" ? capitalized(shortOutcome(c.outcome)) : `Closed: ${shortOutcome(c.outcome)}`;
}
function footerError(tab, status, page) {
  if (tab === "prs")
    return null;
  if (tab !== "overview")
    return status.error;
  const isPageFailed = page?.sync.is === "stale" && page.sync.why === "failed";
  return isPageFailed ? page.syncText : status.error ?? page?.syncText ?? null;
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
  if (inputs.isReadFailed)
    return { is: "unavailable", why: "read-failed" };
  if (p.ledgerState === "current")
    return FRESH;
  const isUnreadable = !p.isUpdating && s.pending.length === 0 && p.isConversationUnreadable;
  if (isUnreadable)
    return { is: "unavailable", why: "unreadable" };
  if (p.ledgerState === "behind")
    return { is: "checking" };
  const why = p.isUpdating ? "retrying" : p.failedAttempts > 1 ? "failed-again" : "failed";
  return { is: "stale", since: null, why };
}
function statusSync(s) {
  if (s.overviewFailure)
    return { is: "stale", since: s.overviewFailure.at, why: "failed" };
  const o = s.ledger.overview;
  return o !== null && isStatusQuiet(o) ? { is: "stale", since: o.changedAt, why: "quiet" } : FRESH;
}
function turnSync(s, inputs) {
  const isUnknown = inputs.turnReadFailedAt !== null && s.presence.isTurnRunning;
  return isUnknown ? { is: "stale", since: inputs.turnReadFailedAt, why: "rollout-unread" } : FRESH;
}
function ghSync(prViews) {
  if (prViews.isGhMissing)
    return { is: "unavailable", why: "gh-missing" };
  if (prViews.isGhSignedOut)
    return { is: "unavailable", why: "gh-signed-out" };
  const { failure } = prViews;
  return failure ? { is: "stale", since: failure.at, why: { kind: "fetch-failed", failure } } : FRESH;
}
function prSync(view, failure, isFetching, now) {
  const readAt = view.fetchedAt ?? null;
  const isFailedSince = failure != null && (readAt === null || failure.at > readAt);
  const why = view.error ? "error" : isFailedSince ? "fetch-failed" : readAt === null || now - readAt >= PR_FRESH_MS ? "old" : null;
  if (why === null)
    return FRESH;
  return isFetching ? { is: "checking" } : { is: "stale", since: readAt, why };
}
function viewSync(s, now, inputs) {
  const isFetchingPrs = inputs.isFetchingPrs || s.prViews.isFetching === true;
  const prs = Object.fromEntries(Object.values(s.prViews.views).map((v) => [
    v.ref,
    inputs.isDemo ? FRESH : prSync(v, s.prViews.failure, isFetchingPrs, now)
  ]));
  return {
    ledger: ledgerSync(s, inputs),
    status: statusSync(s),
    turn: turnSync(s, inputs),
    gh: ghSync(s.prViews),
    prs
  };
}

// ../core/domain/preconditions.ts
var PRESS_LIFETIME_MS = 24 * 60 * 60000;
var isRecord = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
function canonical(value) {
  if (Array.isArray(value))
    return `[${value.map((v) => v === undefined ? "null" : canonical(v)).join(",")}]`;
  if (!isRecord(value))
    return JSON.stringify(value) ?? "null";
  const fields = Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  return `{${fields.join(",")}}`;
}
function hash(text) {
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0;i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function rowFields(s, id) {
  const l = s.ledger;
  if (id === "goal") {
    const o = l.overview;
    return [o?.goal?.text ?? null, o?.goalRemoved?.goal.text ?? null, o?.suggestedGoal ?? null];
  }
  const item = l.items.find((row) => row.id === id);
  return [
    item ? { ...item, dialog: undefined } : null,
    l.findings.find((row) => row.id === id) ?? null,
    l.closed.findLast((row) => row.id === id) ?? null,
    l.closedFindings.findLast((row) => row.id === id) ?? null
  ];
}
function rowVersion(s, id) {
  return hash(canonical(rowFields(s, id)));
}

// ../core/view/press-preconditions.ts
function drawnVersions(s, rowIds, prs) {
  return {
    rows: Object.fromEntries(rowIds.map((id) => [id, rowVersion(s, id)])),
    prHeads: Object.fromEntries(prs.flatMap((pr) => pr.headSha === undefined ? [] : [[pr.ref, pr.headSha]]))
  };
}
function drawnPreconditions(view, p) {
  if (isPrPress(p)) {
    const sha = "ref" in p && p.action === "pr-merge" ? view.drawnVersions.prHeads[p.ref] : undefined;
    return "ref" in p && sha !== undefined ? [{ kind: "pr-head-sha", ref: p.ref, sha }] : [];
  }
  const version = view.drawnVersions.rows[p.id];
  return version === undefined ? [] : [{ kind: "row-version", row: p.id, version }];
}

// ../core/view/collapse.ts
var latest = (...times) => Math.max(-Infinity, ...times.filter((t) => typeof t === "number"));
function newsByRow({ ledger, prViews, lastActions }) {
  const pressed = (id) => lastActions[id]?.at;
  const prs = Object.values(prViews.views);
  const timed = (at, untimedUrl = null) => ({ at, untimedUrl, waiting: [] });
  return new Map([
    ...ledger.items.map((i) => [i.id, timed(latest(i.reportedAt, pressed(i.id)))]),
    ...ledger.findings.map((f) => [f.id, timed(latest(f.reopenedAt, pressed(f.id)))]),
    ...prs.flatMap((pr) => waitingThreads(pr).map((t) => {
      const id = prThreadId(pr, t);
      const untimedUrl = t.reply && t.reply.at === null ? t.reply.url : null;
      return [id, timed(latest(t.reply?.at, pressed(id)), untimedUrl)];
    })),
    ...prs.flatMap((pr) => listedChecks(pr).map((c) => {
      const id = prCheckId(pr, c);
      const untimedUrl = c.finishedAt === undefined ? c.url ?? "" : null;
      return [id, timed(latest(c.finishedAt, pressed(id)), untimedUrl)];
    })),
    ...[...waitingUnderParents(ledger)].map(([id, waiting]) => [id, { at: -Infinity, untimedUrl: null, waiting }])
  ]);
}
var isUnchanged = (news, c) => news !== undefined && news.at <= c.at && news.untimedUrl === (c.untimedUrl ?? null) && news.waiting.every((id) => c.waiting?.includes(id));
function collapsedRows(s) {
  const news = newsByRow(s);
  return Object.entries(s.collapsed ?? {}).flatMap(([id, c]) => isUnchanged(news.get(id), c) ? [id] : []);
}

// ../core/view/status-repeats.ts
function holdsEveryWordOf(text, name) {
  const said = stems(text);
  const words = stems(name);
  return words.size > 0 && [...words].every((w) => said.has(w));
}
function isNamedAlike(a, b) {
  const [x, y] = [stems(a), stems(b)];
  const [short, long] = x.size <= y.size ? [x, y] : [y, x];
  return short.size > 0 && [...short].every((w) => long.has(w));
}
function withoutRepeatedNow(page, o) {
  const g = page.goal;
  const nowText = o?.head ? o.head.description || o.head.title : null;
  if (g === null || g.now === null || o === null || nowText === null)
    return page;
  const drawnIds = new Set(statusListRows(page).flatMap((r) => r.kind === "subject" ? [r.id] : []));
  const isRepeated = o.subjects.some((x) => drawnIds.has(x.id) && x.status === "working" && holdsEveryWordOf(nowText, x.name));
  return isRepeated ? { ...page, goal: { ...g, now: null } } : page;
}
function subjectInPlaceOf(o, m, items) {
  if (m.status === "dropped")
    return null;
  const work = o.subjects.filter((x) => x.into === null && o.serves[x.id] === m.id);
  const only = work.length === 1 && work[0]?.status !== "dropped" ? work[0] : undefined;
  const isAskedDirectly = items.some((i) => o.askSubjects[i.id]?.includes(m.id));
  const isDoneWithOpenWork = m.status === "done" && only !== undefined && isOpen(only);
  return only !== undefined && !isAskedDirectly && !isDoneWithOpenWork && isNamedAlike(m.name, only.name) ? only : null;
}
function isTitleRepeated(title, subjects, rows) {
  const drawnIds = new Set(rows.flatMap((r) => r.kind === "subject" ? [r.id] : []));
  const work = subjects.filter((x) => x.into === null);
  if (work.filter(isOpen).length > 1)
    return false;
  return work.some((x) => isOpen(x) ? isNamedAlike(title, x.name) : drawnIds.has(x.id) && holdsEveryWordOf(title, x.name));
}
function headPart(head, goal, subjects, rows) {
  if (head === null || goal !== null && !goal.isMet)
    return [];
  const title = goal === null && isTitleRepeated(head.title, subjects, rows) ? null : head.title;
  const hasContentUnder = rows.length > 0 || goal === null && head.description !== null;
  return hasContentUnder && (title ?? head.description) !== null ? [{ kind: "part", id: "head", depth: 0, text: title, description: head.description, isTitle: true }] : [];
}
function milestoneAsSubject(m, subjectRows) {
  const [row, ...under] = subjectRows;
  if (row?.kind !== "subject")
    return m;
  const work = under.map((r) => r.kind === "child" || r.kind === "more" || r.kind === "ask" ? { ...r, branch: null } : r);
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
    rows: work,
    subject: row
  };
}

// ../core/view/status-page.ts
var OTHER_WORK = "Other work";
var WAS_LABEL = "Prev: ";
var WAS_MARK = "↩";
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
  const askSettingMarkOf = (x) => isHeld(x) ? askSettingMark(asksLinkedTo(s.ledger.items, o?.askSubjects ?? {}, x.id)) : null;
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
  const running = (o?.children ?? []).filter((c) => isChildShown(c, now, look)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const hasChildRow = (x) => running.some((c) => c.subjectId === x.id);
  const unseenClosedOf = (part) => part.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0));
  const needed = subjects.filter((x) => !isUnneeded(x));
  const main = needed.filter((x) => !isOther(x));
  const other = subjects.filter(isOther);
  const canFold = (x) => !isHeld(x) && !isNew(x) && !hasChildRow(x);
  const laterIds = new Set((goalParts.goal?.milestones ?? []).filter((m) => m.place === "later").map((m) => m.id));
  const isFoldedUnderLater = (x) => laterIds.has(milestoneOf(x) ?? "") && canFold(x);
  const open = needed.filter((x) => isOpen(x) && !isFoldedUnderLater(x)).sort(pageOrder);
  const foldable = open.filter(canFold);
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)));
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
  const top = split(main.filter((x) => milestoneOf(x) === null));
  const underMilestones = (goalParts.goal?.milestones ?? []).map((m) => split(main.filter((x) => milestoneOf(x) === m.id), m.place === "later"));
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
    askSettingMarkOf,
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
  const doneFold = (prefix, done, newClosed, depth, settled) => done.length + settled.length === 0 ? [] : done.length + settled.length === 1 ? [...partRows(done, foldCtx, depth), ...settled.map((c) => childRow(c, null, depth, finishedLine(c, now)))] : [
    {
      kind: "done-fold",
      id: `${prefix}done`,
      depth,
      text: `${done.length + settled.length}${newClosed.some((x) => x.status === "done") ? " more" : ""} done`,
      rows: [
        ...partRows([...done].sort(pageOrder), foldCtx, depth + 1),
        ...settled.map((c) => childRow(c, null, depth + 1, finishedLine(c, now)))
      ]
    }
  ];
  const foldedPart = (prefix, p, depth, settled = []) => [
    ...partRows(p.shown, ctx, depth, openFold(prefix, p.foldedOpen, depth), namedFolds(prefix, p.named, depth)),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth, settled)
  ];
  const { loose, settled } = unplacedChildren(o?.children ?? [], {
    subjects,
    shownIds,
    milestoneOf,
    isSettled: (c) => isChildSettled(c, now, look),
    running
  });
  const looseRows = (milestoneId, depth) => loose.filter((l) => l.milestoneId === milestoneId).map((l) => childRow(l.child, null, depth));
  const otherCountedSubjects = otherFolded.filter((x) => isOpen(x) && isUnneeded(x) && isCounted(x));
  const otherCounts = countsByMark(otherCountedSubjects);
  const afterOtherOpen = [
    ...openFold("other-", otherFolded.filter((x) => isOpen(x) && !isUnneeded(x)), 0),
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
    ...doneFold("other-", otherFolded.filter((x) => x.status === "done"), otherNewClosed, 0, hasMilestones ? settled : [])
  ];
  const head = o?.head ? { title: o.head.title, description: textBeyondName(o.head.title, o.head.description) } : null;
  const g = goalParts.goal;
  const listRows = [
    ...hasMilestones ? [] : looseRows(null, 0),
    ...foldedPart("", top, 0, hasMilestones ? [] : settled),
    ...otherRows.length > 0 ? [
      { kind: "part", id: "other", depth: 0, text: OTHER_WORK, description: null, isTitle: false },
      ...otherRows
    ] : []
  ];
  const headRows = headPart(head, g, subjects, listRows);
  const rows = [
    ...headRows,
    ...headRows.length > 0 && listRows[0]?.id === "other" ? listRows.slice(1) : listRows
  ];
  const isWorkClosed = (m, p) => p.foldedOpen.length === 0 && !p.shown.some(isOpen) && !running.some((c) => isChildRunning(c, now) && (p.shown.some((x) => x.id === c.subjectId) || loose.some((l) => l.child === c && l.milestoneId === m.id)));
  const workCount = (p) => p.shown.length + p.named.length + p.foldedOpen.length + p.foldedDone.length;
  const isAllSeen = (m, p) => p.shown.length + p.named.length + p.foldedOpen.length === 0 && !loose.some((l) => l.milestoneId === m.id);
  const withRows = (m, p) => {
    const milestone = o?.milestones.find((x) => x.id === m.id);
    const hasLooseWork = loose.some((l) => l.milestoneId === m.id);
    const inPlace = o && milestone && !hasLooseWork ? subjectInPlaceOf(o, milestone, s.ledger.items) : null;
    if (inPlace)
      return milestoneAsSubject(m, partRows([inPlace], isNew(inPlace) || isOpen(inPlace) ? ctx : foldCtx, 0));
    const rows = [...m.rows, ...looseRows(m.id, 1), ...foldedPart(`${m.id}-`, p, 1)];
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
      rows,
      foldCount: rows.length === 0 ? 0 : workCount(p) + loose.filter((l) => l.milestoneId === m.id).length
    };
  };
  const goal = g && {
    ...g,
    milestonesFold: o?.goal ? metMilestonesFold(o.goal, g.milestones, (m) => isWorkClosed(m, underMilestones[g.milestones.indexOf(m)])) : null,
    milestones: g.milestones.map((m, n) => withRows(m, underMilestones[n]))
  };
  return withoutRepeatedNow({
    isEmpty: rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    goal,
    rows,
    sync,
    syncText: statusSyncText(sync, now)
  }, o);
}
function seenSubjectIds(row) {
  return row.kind === "subject" ? [row.id] : row.kind === "fold" ? row.subjectIds : [];
}

// ../core/view/session-view.ts
var PRESS_TIMEOUT_MS = 60000;
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at < PRESS_TIMEOUT_MS)
    return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
var STORED_KEYS = new Set([
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
    drawnVersions: drawnVersions(s, rowIds, prs.drawn.map((d) => d.pr))
  };
  return withDrawableText(view, (key) => STORED_KEYS.has(key));
}
function showsRunningMark(v, shown, isHelpShown, isUnfolded) {
  if (isHelpShown)
    return MARK_LEGEND.some((m) => m.isRunning);
  if (!isRowTab(shown))
    return hasRunningMark(v.statusPage);
  if (shown === "prs")
    return isPrTabRunning(openPrViews(v.prs.drawn), v.lastActions);
  return isRowTabRunning(v, shown, isUnfolded) || v.sync.ledger.is === "checking";
}
function prTabOf(s, lastActions, now, { shownSince, listInput, undoShown, undoOut }, settleWindowMs, gh) {
  const pressOutSince = earliestOf(Object.entries(lastActions).map(([id, last]) => isPrRowId(id) ? prTabHoldSince(feedbackOf(id, last, undefined, s.presence, now)) : null));
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
    order: prOrderView(s.ledger.prOrder, drawn, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    gh,
    refresh: prRefreshView({ ...s.prViews, isGhMissing: s.prViews.isGhMissing === true }, s.ledger, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    clear: prClearActions(s.prViews, s.ledger),
    pressOutSince
  };
}
var lastActionKey = (view, id) => JSON.stringify(view?.lastActions[id] ?? null);

// ../core/view/fold-all.ts
var statusFoldsOf = (view) => {
  const page = view.statusPage;
  const milestones = page.goal?.milestones ?? [];
  const rows = [...milestones.flatMap((m) => m.rows), ...page.rows];
  const listed = rows.flatMap((r) => r.kind === "done-fold" || r.kind === "counts" ? [r, ...r.rows] : [r]);
  const foldIds = [
    ...page.goal?.milestonesFold ? [page.goal.milestonesFold.id] : [],
    ...milestones.flatMap((m) => m.foldId === null ? [] : [m.foldId]),
    ...listed.filter((r) => r.kind === "done-fold" || r.kind === "counts").map((r) => r.id)
  ];
  const parentIds = [
    ...milestones.filter((m) => m.foldCount > 0).map((m) => m.id),
    ...listed.filter((r) => r.kind === "subject" && r.foldCount > 0).map((r) => r.id)
  ];
  return { statusFolds: [...new Set(foldIds)], parents: [...new Set(parentIds)] };
};
function tabFolds(view, tab) {
  const none = { closed: [], statusFolds: [], parents: [], rows: [] };
  if (tab === "overview")
    return { ...none, ...statusFoldsOf(view) };
  if (tab === "prs")
    return { ...none, rows: prRowWaits(openPrViews(view.prs.drawn), view.lastActions).map((r) => r.id) };
  const live = new Set((tab === "needsYou" ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows).filter((r) => r.state.is !== "settled").map((r) => r.id));
  const closed = tab === "needsYou" ? NEEDS_YOU_GROUPS.filter((g) => view.needsYou.closed[g.list].length > 0).map((g) => g.kind) : Object.keys(FINDING_GROUPS).filter((kind) => view.findings.closed.some((f) => f.kind === kind));
  return {
    ...none,
    closed,
    rows: listWaits(view)[tab].flatMap((r) => live.has(r.id) ? [r.id] : [])
  };
}
function isAnyFoldOpen(folds, state) {
  const isOpen = (id) => !state.collapsed.includes(id);
  return folds.closed.some((k) => state.unfolded.includes(k)) || folds.statusFolds.some((id) => state.statusUnfolded.includes(id)) || folds.parents.some(isOpen) || folds.rows.some(isOpen);
}
function foldAll(folds, state, isOpening) {
  const set = (list, these) => isOpening ? [...list, ...these.filter((t) => !list.includes(t))] : list.filter((t) => !these.includes(t));
  const collapsible = [...folds.parents, ...folds.rows];
  return {
    unfolded: set(state.unfolded, folds.closed),
    statusUnfolded: set(state.statusUnfolded, folds.statusFolds),
    collapses: collapsible.flatMap((id) => state.collapsed.includes(id) === isOpening ? [{ id, isCollapsed: !isOpening }] : [])
  };
}
function foldAllOn(view, tab, open, isOpening) {
  const folds = tabFolds(view, tab);
  const state = { ...open, collapsed: view.collapsed };
  return foldAll(folds, state, isOpening ?? !isAnyFoldOpen(folds, state));
}

// ../core/view/ui-controller-types.ts
var DEMO_REPLY_MS = SETTLED_MS;
var COLLAPSE_WAIT_MS = 30000;
var MAX_KEPT_UI = 20;
var ROW_TAB_IDS = ["needsYou", "findings", "prs"];
var NO_UI_CURSOR = { id: null, index: -1, guard: null };
var NO_FACTS = { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null };
function freshUi(config, tab = "needsYou") {
  return {
    config,
    host: NO_FACTS,
    tab,
    isHelpShown: false,
    shownSince: null,
    isVisible: true,
    isOpening: false,
    opensOnAsks: false,
    isFirstOpen: false,
    rowsSeen: {},
    heldArrivals: {},
    newRows: {},
    closedSeen: {},
    selection: { needsYou: NO_UI_CURSOR, findings: NO_UI_CURSOR, prs: NO_UI_CURSOR },
    statusSelection: null,
    waitingSeen: {},
    heldClose: {},
    restoring: null,
    collapses: {},
    unfolded: [],
    closedAll: [],
    statusUnfolded: [],
    optionsShown: [],
    typing: null,
    drafts: {},
    discarded: {},
    pressesOut: {},
    nextPressId: 1,
    sentReplies: {},
    notes: {},
    errors: {},
    notice: null,
    listInput: null,
    undoSeen: {},
    demoReplies: []
  };
}
var withCommands = (ui, ...commands) => ({ ui, commands });
function chain(start, ...steps) {
  return steps.reduce((acc, step) => {
    const next = step(acc.ui);
    return { ui: next.ui, commands: [...acc.commands, ...next.commands] };
  }, start);
}

// ../core/view/ui-controller-selection.ts
var opensFor2 = (r) => r.isWaiting && !r.isCollapsed;
function collapsedOf(ui, view) {
  const collapsed = new Set(view.collapsed);
  for (const [id, c] of Object.entries(ui.collapses)) {
    if (c.isCollapsed)
      collapsed.add(id);
    else
      collapsed.delete(id);
  }
  return [...collapsed];
}
function tabWaits(ui, view, tab) {
  const collapsed = collapsedOf(ui, view);
  if (tab === "prs")
    return prRowWaits(openPrViews(view.prs.drawn), view.lastActions, collapsed);
  return listWaits({ ...view, collapsed })[tab];
}
function isListInUse(ui, now) {
  return ui.listInput !== null && now - ui.listInput.last < FOLD_QUIET_MS;
}
function selectedOf(ui, view, tab) {
  if (!isRowTab(tab))
    return ui.statusSelection;
  const cursor = ui.selection[tab];
  return cursor.id ?? tabWaits(ui, view, tab).find(opensFor2)?.id ?? null;
}
function isGuardedRow(ui, tab, id, now) {
  if (!isRowTab(tab))
    return false;
  const { id: cursorId, guard } = ui.selection[tab];
  return cursorId === id && guard !== null && now < guard.at + PRESS_GUARD_MS;
}
function isGuardedPress(ui, tab, id, by, now) {
  return isRowTab(tab) && isGuardedRow(ui, tab, id, now) && ui.selection[tab].guard?.by === by;
}
var withCursor = (ui, tab, cursor) => ({
  ...ui,
  selection: { ...ui.selection, [tab]: cursor }
});
function waitingFrom(waits, index) {
  const opening = waits.flatMap((r, i) => opensFor2(r) ? [{ id: r.id, index: i }] : []);
  return opening.find((r) => r.index >= index) ?? opening.filter((r) => r.index < index).pop() ?? { id: null, index: -1 };
}
function isClosedByPerson(ui, view, id, now) {
  const lastAt = view.lastActions[id]?.at;
  return Object.values(ui.pressesOut).some((p) => p.rowId === id) || lastAt !== undefined && lastAt >= now - SETTLED_MS;
}
function movedOff(ui, waits, tab, closedId, index, now) {
  const next = waitingFrom(waits, index);
  const isClosedByClick = Object.values(ui.pressesOut).some((p) => p.rowId === closedId && p.by === "click");
  const guard = isClosedByClick ? { by: "click", at: now } : null;
  const moved = withCursor(ui, tab, { id: next.id, index: next.index, guard });
  const isShown = ui.tab === tab && next.id !== null;
  return withCommands(moved, ...isShown ? [{ kind: "reveal", tab, id: next.id, closedId }] : []);
}
function readCursors(ui, view, added, now) {
  let step = settleHeldClose(ui, view, now);
  for (const tab of ROW_TAB_IDS) {
    const waits = tabWaits(step.ui, view, tab);
    const cursor = step.ui.selection[tab];
    const index = cursor.id === null ? -1 : waits.findIndex((r) => r.id === cursor.id);
    const wasOnRow = cursor.index >= 0;
    const isGone = cursor.id !== null && wasOnRow && index < 0;
    const wasWaiting = cursor.id !== null && (step.ui.waitingSeen[tab] ?? []).includes(cursor.id);
    const hasStopped = !isGone && wasWaiting && waits[index]?.isWaiting === false;
    const isFieldOpen = cursor.id !== null && step.ui.typing === cursor.id;
    let next = step.ui;
    let commands = step.commands;
    if ((isGone || hasStopped) && !isFieldOpen && cursor.id !== null) {
      const isHeld = hasStopped && !isClosedByPerson(next, view, cursor.id, now) && isListInUse(next, now);
      if (isHeld)
        next = { ...next, heldClose: { ...next.heldClose, [tab]: cursor.id } };
      else {
        const moved = movedOff(next, waits, tab, cursor.id, isGone ? cursor.index : index, now);
        next = moved.ui;
        commands = [...commands, ...moved.commands];
      }
    } else if (index >= 0 && index !== cursor.index)
      next = withCursor(next, tab, { ...cursor, index });
    const picked = next.selection[tab].id;
    const isOpenRowUnseen = picked === null && next.shownSince === null;
    const arrived = isOpenRowUnseen ? null : openOnArrival(waits, picked, added[tab] ?? []);
    if (arrived !== null)
      next = withCursor(next, tab, { id: arrived, index: waits.findIndex((r) => r.id === arrived), guard: null });
    next = { ...next, waitingSeen: { ...next.waitingSeen, [tab]: waits.filter((r) => r.isWaiting).map((r) => r.id) } };
    step = { ui: next, commands };
  }
  return step;
}
var without = (byKey, key) => {
  const { [key]: _gone, ...rest } = byKey;
  return rest;
};
function settleHeldClose(ui, view, now) {
  let step = withCommands(ui);
  for (const tab of ROW_TAB_IDS) {
    const id = step.ui.heldClose[tab];
    if (id === undefined)
      continue;
    const cleared = { ...step.ui, heldClose: without(step.ui.heldClose, tab) };
    const cursor = step.ui.selection[tab];
    const waits = tabWaits(step.ui, view, tab);
    const index = waits.findIndex((r) => r.id === id);
    const isStillWaiting = waits[index]?.isWaiting === true;
    if (cursor.id !== id || isStillWaiting)
      step = { ui: cleared, commands: step.commands };
    else if (index < 0 || !isListInUse(step.ui, now)) {
      const moved = movedOff(cleared, waits, tab, id, index >= 0 ? index : cursor.index, now);
      step = { ui: moved.ui, commands: [...step.commands, ...moved.commands] };
    }
  }
  return step;
}
function selectRow(ui, view, tab, id, by, now) {
  if (!isRowTab(tab))
    return { ...ui, statusSelection: id };
  const index = id === null ? -1 : tabWaits(ui, view, tab).findIndex((r) => r.id === id);
  const guard = by === "click" ? { by, at: now } : null;
  const typing = ui.typing !== null && ui.typing !== id ? null : ui.typing;
  const heldClose = without(ui.heldClose, tab);
  return { ...withCursor(ui, tab, { id, index, guard }), typing, heldClose };
}
function stepSelection(ui, view, by, ids, now) {
  const at = ids.indexOf(selectedOf(ui, view, ui.tab) ?? "");
  const next = steppedIndex(at, by, ids.length);
  const id = ids[next];
  return id === undefined ? ui : selectRow(ui, view, ui.tab, id, "key", now);
}
function collapseRow(ui, view, id, isCollapsed, now) {
  let next = { ...ui, collapses: { ...ui.collapses, [id]: { isCollapsed, at: now } } };
  if (isCollapsed && next.typing === id)
    next = { ...next, typing: null };
  const tab = ui.tab;
  if (isCollapsed && isRowTab(tab) && ui.selection[tab].id === null && selectedOf(ui, view, tab) === id)
    next = withCursor(next, tab, { id, index: tabWaits(ui, view, tab).findIndex((r) => r.id === id), guard: null });
  return withCommands(next, { kind: "save-collapse", id, isCollapsed });
}
function titlePress(ui, view, id, by, now) {
  const tab = ui.tab;
  if (!isRowTab(tab))
    return withCommands(ui);
  if (collapsedOf(ui, view).includes(id)) {
    const expanded = collapseRow(ui, view, id, false, now);
    return { ...expanded, ui: selectRow(expanded.ui, view, tab, id, by, now) };
  }
  if (selectedOf(ui, view, tab) !== id)
    return withCommands(selectRow(ui, view, tab, id, by, now));
  return isGuardedPress(ui, tab, id, by, now) ? withCommands(ui) : collapseRow(ui, view, id, true, now);
}
var withOnly = (list, x, isIn) => isIn ? list.includes(x) ? [...list] : [...list, x] : list.filter((y) => y !== x);
function setFold(ui, fold, isOpen) {
  return {
    ...ui,
    unfolded: withOnly(ui.unfolded, fold, isOpen),
    closedAll: isOpen ? ui.closedAll : withOnly(ui.closedAll, fold, false)
  };
}
function foldAll2(ui, view, isOpening, now) {
  const change = foldAllOn(view, ui.tab, { unfolded: ui.unfolded, statusUnfolded: ui.statusUnfolded }, isOpening);
  const start = {
    ...ui,
    unfolded: change.unfolded,
    statusUnfolded: change.statusUnfolded,
    closedAll: ui.closedAll.filter((k) => change.unfolded.includes(k))
  };
  return change.collapses.reduce((acc, c) => {
    const next = collapseRow(acc.ui, view, c.id, c.isCollapsed, now);
    return { ui: next.ui, commands: [...acc.commands, ...next.commands] };
  }, withCommands(start));
}
function selectRestored(ui, view, now) {
  const restoring = ui.restoring;
  if (restoring === null)
    return withCommands(ui);
  const tab = ROW_TAB_IDS.find((t) => tabWaits(ui, view, t).some((r) => r.id === restoring.id && r.isWaiting));
  if (tab === undefined)
    return withCommands(ui);
  const cleared = { ...ui, restoring: null };
  if (ui.typing !== null && ui.typing !== restoring.id)
    return withCommands(cleared);
  const index = tabWaits(ui, view, tab).findIndex((r) => r.id === restoring.id);
  const guard = restoring.by === "click" ? { by: "click", at: now } : null;
  const moved = withCursor(cleared, tab, { id: restoring.id, index, guard });
  return withCommands(moved, ...ui.tab === tab ? [{ kind: "reveal", tab, id: restoring.id, closedId: null }] : []);
}

// ../core/view/ui-controller-reply.ts
function holdsOf(ui, now) {
  const undoOut = Object.values(ui.pressesOut).flatMap((p) => p.action === "undo" || p.action === "pr-undo" ? [p.rowId] : []);
  const undoShown = ui.config.undoClock === "first-read" ? Object.entries(ui.undoSeen).flatMap(([id, at]) => at + SETTLED_MS > now ? [id] : []) : undefined;
  return {
    replies: heldReplies(ui.typing, ui.drafts),
    discarded: keptDiscards(ui.discarded, ui.shownSince),
    shownSince: ui.shownSince,
    listInput: ui.listInput,
    ...undoShown === undefined ? {} : { undoShown },
    undoOut
  };
}
var isListed = (view, id) => allRows(view).some((r) => r.id === id) || prRowIds(view.prs.drawn).includes(id);
function openField(ui, view, id, seed, now) {
  const draft = seed !== undefined ? { text: seed, since: now } : ui.drafts[id] ?? { text: "", since: now };
  let next = { ...ui, typing: id, drafts: { ...ui.drafts, [id]: draft } };
  const tab = ui.tab;
  if (isRowTab(tab) && ui.selection[tab].id === null && selectedOf(ui, view, tab) === id)
    next = withCursor(next, tab, { id, index: tabWaits(ui, view, tab).findIndex((r) => r.id === id), guard: null });
  return withCommands(next, { kind: "focus-field", id });
}
function editDraft(ui, id, text, now) {
  return { ...ui, drafts: { ...ui.drafts, [id]: { text, since: ui.drafts[id]?.since ?? now } } };
}
function closeField(ui, view, id, isDiscard, now) {
  const typing = ui.typing === id ? null : ui.typing;
  if (!isDiscard)
    return withCommands(releasedDrafts({ ...ui, typing }, view));
  const { [id]: _draft, ...drafts } = ui.drafts;
  const { [id]: _sent, ...sentReplies } = ui.sentReplies;
  const discarded = { ...keptDiscards(ui.discarded, ui.shownSince), [id]: now };
  return withCommands({ ...ui, typing, drafts, sentReplies, discarded });
}
var isUndoPress = (p) => p.action === "undo" || p.action === "pr-undo";
function press(ui, view, p, by, now) {
  const rowId = pressRowId(p);
  const action = actionId(p);
  const isReply = p.action === "type";
  const isOtherReply = isReply && ui.sentReplies[rowId]?.text !== p.text.trim();
  const isRepeat = !isOtherReply && Object.values(ui.pressesOut).some((o) => o.rowId === rowId && o.action === action);
  const isBlank = isReply && p.text.trim() === "";
  if (isRepeat || isBlank || isGuardedPress(ui, ui.tab, rowId, by, now))
    return withCommands(ui);
  const holds = holdsOf(ui, now);
  const pressId = ui.nextPressId;
  const atBefore = view.lastActions[rowId]?.at ?? null;
  const lastBefore = lastActionKey(view, rowId);
  const out = { pressId, rowId, tab: ui.tab, action, isReply, at: now, lastBefore, by };
  const { [rowId]: _error, ...errors } = ui.errors;
  const { [rowId]: _note, ...notes } = ui.notes;
  let next = {
    ...ui,
    nextPressId: pressId + 1,
    pressesOut: { ...ui.pressesOut, [pressId]: out },
    errors,
    notes,
    ...p.action === "undo" ? { restoring: { id: rowId, at: now, by } } : {}
  };
  if (isReply) {
    const text = p.text.trim();
    const sent = { pressId, text, atBefore, isConfirmed: false };
    next = {
      ...next,
      typing: next.typing === rowId ? null : next.typing,
      drafts: { ...next.drafts, [rowId]: { text: p.text, since: next.drafts[rowId]?.since ?? now } },
      sentReplies: { ...next.sentReplies, [rowId]: sent }
    };
  }
  const tab = ui.tab;
  const isPinning = !isUndoPress(p) && !isPrPress(p);
  if (isPinning && isRowTab(tab) && ui.selection[tab].id === null) {
    const index = tabWaits(ui, view, tab).findIndex((r) => r.id === rowId);
    if (index >= 0)
      next = withCursor(next, tab, { id: rowId, index, guard: null });
  }
  return withCommands(next, { kind: "press", pressId, press: p, holds, when: drawnPreconditions(view, p) });
}
function settledAt(view, id) {
  const row = allRows(view).find((r) => r.id === id)?.state;
  const pr = view.prs.drawn.find((d) => prMarkId(d.pr.ref) === id)?.state;
  const state = row ?? pr;
  return state?.is === "settled" ? state.at : null;
}
function isUndoShown(ui, view, id, now) {
  const at = ui.config.undoClock === "first-read" ? ui.undoSeen[id] ?? null : settledAt(view, id);
  return at !== null && now < at + SETTLED_MS;
}
function undoKey(ui, view, now) {
  if (!isRowTab(ui.tab))
    return withCommands(ui);
  const lists = drawnLists(view, () => true, (r) => r);
  const isStillShown = (id) => ui.config.undoClock === "session" || isUndoShown(ui, view, id, now);
  const undos = tabUndos(ui.tab, lists, view.prs.drawn).filter((u) => isStillShown(pressRowId(u.press)));
  const latest = latestUndo(undos);
  return latest === null ? withCommands(ui) : press(ui, view, latest.press, "key", now);
}
function hasNotMoved(ui, out) {
  const isQuiet = ui.listInput === null || ui.listInput.last <= out.at;
  const isLastPress = ui.nextPressId === out.pressId + 1;
  return ui.tab === out.tab && ui.typing === null && isQuiet && isLastPress;
}
var isNotSentShown = (view, id) => allRows(view).find((r) => r.id === id)?.feedback?.is === "notSent";
function pressSettled(ui, view, pressId, outcome, now) {
  const out = ui.pressesOut[pressId];
  if (out === undefined)
    return withCommands(ui);
  const { [pressId]: _out, ...pressesOut } = ui.pressesOut;
  let next = { ...ui, pressesOut };
  const row = out.rowId;
  const isUndo = out.action === "undo" || out.action === "pr-undo";
  const hasUndoTimeEnded = isUndo && !isUndoShown(ui, view, row, now);
  const isRowListed = isListed(view, row) && !hasUndoTimeEnded;
  if (outcome.note === "stale")
    next = isRowListed ? { ...next, notes: { ...next.notes, [row]: { note: "stale", at: now } } } : { ...next, notice: { text: noteText(), at: now, isError: false } };
  if (outcome.error !== null && !isNotSentShown(view, row))
    next = isRowListed ? { ...next, errors: { ...next.errors, [row]: { text: outcome.error, at: now } } } : { ...next, notice: { text: outcome.error, at: now, isError: true } };
  const isConfirmed = isPressConfirmed(outcome);
  const sent = next.sentReplies[row];
  if (sent?.pressId === pressId) {
    const isRefused = outcome.error !== null || outcome.note !== null;
    const { [row]: _sent, ...rest } = next.sentReplies;
    next = { ...next, sentReplies: isRefused ? rest : { ...rest, [row]: { ...sent, isConfirmed } } };
  }
  if (out.action === "undo" && next.restoring?.id === row)
    next = { ...next, restoring: isConfirmed ? { ...next.restoring, at: now } : null };
  const restored = selectRestored(next, view, now);
  next = restored.ui;
  if (outcome.isDemoSent)
    next = { ...next, demoReplies: [...next.demoReplies, { pressId, dueAt: now + DEMO_REPLY_MS }] };
  const isReplyBack = out.isReply && (outcome.error !== null || outcome.note === "stale");
  if (!(isReplyBack || outcome.isRowFailed) || !hasNotMoved(next, out))
    return withCommands(next, ...restored.commands);
  const index = isRowTab(out.tab) ? tabWaits(next, view, out.tab).findIndex((r) => r.id === row) : -1;
  const back = isRowTab(out.tab) ? withCursor(next, out.tab, { id: row, index, guard: null }) : next;
  return isReplyBack ? withCommands({ ...back, typing: row }, ...restored.commands, { kind: "focus-field", id: row }) : withCommands(back, ...restored.commands);
}
function isWaitingOnDelivery(view, out) {
  const state = view.lastActions[out.rowId]?.delivery?.state;
  return state === "held" || state === "queued";
}
function pressEndsAt(ui, view) {
  return Object.values(ui.pressesOut).flatMap((o) => isWaitingOnDelivery(view, o) ? [] : [o.at + PRESS_TIMEOUT_MS]);
}
function expirePresses(ui, view, now) {
  const isEnded = (o) => now >= o.at + PRESS_TIMEOUT_MS && !isWaitingOnDelivery(view, o);
  const ended = Object.values(ui.pressesOut).filter(isEnded);
  if (ended.length === 0)
    return ui;
  const pressesOut = Object.fromEntries(Object.entries(ui.pressesOut).filter(([, o]) => !isEnded(o)));
  return { ...ui, pressesOut };
}
function sentFate(ui, view, row) {
  const sent = ui.sentReplies[row];
  if (sent === undefined)
    return "keep";
  const last = view.lastActions[row];
  const isOut = Object.values(ui.pressesOut).some((o) => o.pressId === sent.pressId);
  if (last === undefined)
    return sent.atBefore === null && isOut ? "wait" : sent.isConfirmed ? "release" : "keep";
  if (last.at === sent.atBefore)
    return isOut ? "wait" : "keep";
  if (last.reply?.trim() !== sent.text)
    return isOut ? "wait" : "keep";
  const state = last.delivery?.state;
  if (state === "held" || state === "queued")
    return "wait";
  return state === "failed" || state === "unconfirmed" ? "keep" : "release";
}
function releasedDrafts(ui, view) {
  let next = ui;
  for (const row of Object.keys(ui.sentReplies)) {
    const fate = sentFate(next, view, row);
    if (fate === "wait" || fate === "release" && next.typing === row)
      continue;
    const isSentDraft = fate === "release" && next.drafts[row]?.text.trim() === next.sentReplies[row]?.text;
    const { [row]: _sent, ...sentReplies } = next.sentReplies;
    const { [row]: _draft, ...without } = next.drafts;
    next = { ...next, sentReplies, drafts: isSentDraft ? without : next.drafts };
  }
  return next;
}

// ../core/view/ui-controller-tabs.ts
var newRowsOf = (ui) => new Map(Object.entries(ui.newRows));
var asRecord = (rows) => Object.fromEntries(rows);
function isShownEmpty(ui, view, tab) {
  if (tab === "prs")
    return isPrsTabEmpty(view.prs.drawn.length, ui.host.isFetchingPrs);
  const rows = tab === "needsYou" ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows;
  return isTabEmpty({
    rows,
    settled: new Set(settledRowIds(rows)),
    closed: closedGroups(view, tab, (kind) => ui.unfolded.includes(kind)),
    hasBlocker: tab === "needsYou" && ui.host.hasAsksBlocker
  });
}
function moveTo(ui, tab, now) {
  const selection = isRowTab(tab) ? { ...ui.selection, [tab]: NO_UI_CURSOR } : ui.selection;
  return withCommands(shownTab({ ...ui, selection }, tab, now), { kind: "tab-shown", tab });
}
function shownTab(ui, tab, now) {
  const isChanged = tab !== ui.tab;
  const newRows = ui.isVisible && isRowTab(tab) ? asRecord(showNewRows(newRowsOf(ui), tab, now)) : ui.newRows;
  return {
    ...ui,
    tab,
    isHelpShown: false,
    shownSince: isChanged && ui.shownSince !== null ? now : ui.shownSince,
    typing: isChanged ? null : ui.typing,
    heldArrivals: {},
    heldClose: isChanged ? {} : ui.heldClose,
    newRows
  };
}
function opened(ui, now, isFirst = false) {
  return {
    ...ui,
    shownSince: now,
    isOpening: true,
    opensOnAsks: true,
    isFirstOpen: isFirst,
    rowsSeen: {},
    newRows: {},
    closedSeen: {},
    heldArrivals: {}
  };
}
function closed(ui) {
  return {
    ...ui,
    shownSince: null,
    typing: null,
    isHelpShown: false,
    isOpening: false,
    opensOnAsks: false,
    isFirstOpen: false,
    heldArrivals: {},
    heldClose: {}
  };
}
function helpShown(ui, isShown, now) {
  const isTabShown = !isShown && ui.isVisible && ui.shownSince !== null && isRowTab(ui.tab);
  const newRows = isTabShown ? asRecord(showNewRows(newRowsOf(ui), ui.tab, now)) : ui.newRows;
  return { ...ui, isHelpShown: isShown, newRows };
}
function visible(ui, isVisible) {
  return { ...ui, isVisible, opensOnAsks: ui.opensOnAsks || isVisible && !ui.isVisible };
}
var TINT_MS = NEW_HOLD_MS + NEW_FADE_MS;
function seenClosed(ui, view, now) {
  const seen = {};
  for (const r of allRows(view)) {
    if (r.state.is !== "settled")
      continue;
    const key = `${r.id}:${r.state.at}`;
    const at = ui.closedSeen[key] ?? (ui.isVisible && now - r.state.at < TINT_MS ? now : undefined);
    if (at !== undefined && now - at < TINT_MS)
      seen[key] = at;
  }
  return seen;
}
function recordTabs(ui, view, host, now) {
  const listed = { ...listedRowIds(view), prs: host.isFetchingPrs ? null : prRowIds(view.prs.drawn) };
  const seen = Object.fromEntries(Object.entries(ui.rowsSeen).map(([t, ids]) => [t, new Set(ids)]));
  const recorded = recordRows(seen, listed);
  const isTinting = ui.isVisible && ui.shownSince !== null;
  const added = addNewRows(newRowsOf(ui), isTinting ? recorded.added : {});
  const newRows = isTinting && isRowTab(ui.tab) && !ui.isHelpShown ? showNewRows(added, ui.tab, now) : added;
  const rowsSeen = Object.fromEntries(Object.entries(recorded.seen).map(([t, ids]) => [t, [...ids ?? []]]));
  return {
    ui: { ...ui, host, rowsSeen, newRows: asRecord(newRows), closedSeen: seenClosed(ui, view, now) },
    added: recorded.added
  };
}
var hasAsksWaiting = (view) => view.needsYou.count > 0;
function openingMove(ui, view, now) {
  const settled = { ...ui, isOpening: false, opensOnAsks: false, isFirstOpen: false };
  const isFree = !ui.isHelpShown && ui.typing === null;
  const isOnRowTab = isRowTab(ui.tab) && isFree;
  const isOnFirstStatus = ui.tab === "overview" && ui.isFirstOpen && isFree;
  if (!isOnRowTab && !isOnFirstStatus)
    return withCommands(settled);
  if (ui.opensOnAsks && ui.tab !== "needsYou" && hasAsksWaiting(view))
    return moveTo(settled, "needsYou", now);
  if (!isOnRowTab || !ui.isOpening || !isShownEmpty(ui, view, ui.tab))
    return withCommands(settled);
  const to = followTo(ARRIVAL_TABS, ui.tab, true, { ...openRowIds(view), prs: [] });
  return to === null ? withCommands(settled) : moveTo(settled, to, now);
}
var merged = (a, b) => Object.fromEntries(ROW_TAB_IDS.map((t) => [t, [...new Set([...a[t] ?? [], ...b[t] ?? []])]]));
function follow(ui, view, added, now) {
  const tab = ui.tab;
  const isFollowing = isRowTab(tab) && ui.shownSince !== null && !ui.isHelpShown;
  if (!isFollowing || !isShownEmpty(ui, view, tab))
    return withCommands({ ...ui, heldArrivals: {} });
  const all = merged(ui.heldArrivals, added);
  const arrivals = Object.fromEntries(ROW_TAB_IDS.map((t) => [t, all[t].filter((id) => tabWaits(ui, view, t).some((r) => r.id === id && r.isWaiting))]));
  if (isListInUse(ui, now))
    return withCommands({ ...ui, heldArrivals: arrivals });
  const to = followTo(ARRIVAL_TABS, tab, true, arrivals);
  const cleared = { ...ui, heldArrivals: {} };
  return to === null ? withCommands(cleared) : moveTo(cleared, to, now);
}
function readTabs(ui, view, added, now) {
  if (!ui.isOpening && !ui.opensOnAsks)
    return follow(ui, view, added, now);
  const opening = openingMove(ui, view, now);
  return opening.commands.length > 0 ? opening : follow(opening.ui, view, added, now);
}
var hasHeldArrivals = (ui) => Object.values(ui.heldArrivals).some((ids) => (ids ?? []).length > 0);

// ../core/view/ui-controller-clock.ts
var undoPlaceEndsAt = (state) => state.at + SETTLED_MS + QUEUED_AFTER_MS;
function settledStates(view) {
  const rows = allRows(view).flatMap((r) => r.state.is === "settled" ? [{ id: r.id, state: r.state }] : []);
  const prs = view.prs.drawn.flatMap((d) => d.state.is === "settled" ? [{ id: prMarkId(d.pr.ref), state: d.state }] : []);
  return [...rows, ...prs];
}
function seenSettled(ui, view, now) {
  if (ui.config.undoClock !== "first-read")
    return {};
  return Object.fromEntries(settledStates(view).map(({ id }) => [id, ui.undoSeen[id] ?? now]));
}
var nextBoundary = (now, step) => (Math.floor(now / step) + 1) * step;
function tintWakeAt(ui, view, now) {
  if (ui.config.titleTint === "self")
    return null;
  const seen = new Map(Object.entries(ui.closedSeen));
  const endsAt = titleTintEndsAt(newRowsOf(ui), view, seen, now);
  if (ui.config.titleTint === "end" || endsAt === null)
    return endsAt;
  const step = NEW_FADE_MS / NEW_STEPS;
  const starts = [...Object.values(ui.newRows).flatMap((r) => r.shownAt === null ? [] : [r.shownAt]), ...seen.values()];
  const steps = starts.flatMap((at) => Array.from({ length: NEW_STEPS + 1 }, (_, k) => at + NEW_HOLD_MS + k * step).filter((t) => t > now));
  return earliestOf([...steps, endsAt]);
}
function frameWakeAt(ui, view, now) {
  if (ui.config.runningMarks !== "frames" || ui.shownSince === null)
    return null;
  const isRunning = showsRunningMark(view, ui.tab, ui.isHelpShown, (kind) => ui.unfolded.includes(kind));
  return isRunning ? nextBoundary(now, RUNNING_FRAME_MS) : null;
}
function readWakeAt(ui, view, now) {
  const lasts = Object.values(view.lastActions);
  const settled = settledStates(view);
  const isFirstRead = ui.config.undoClock === "first-read";
  const cursor = isRowTab(ui.tab) ? ui.selection[ui.tab] : null;
  const isHolding = hasHeldArrivals(ui) || Object.keys(ui.heldClose).length > 0;
  const folding = settled.map(({ id, state }) => isFirstRead ? { ...state, at: ui.undoSeen[id] ?? now } : state);
  const times = [
    ...lasts.flatMap((l) => l.delivery?.state === "queued" ? [queuedSentAt(l) + QUEUED_AFTER_MS] : []),
    ...lasts.flatMap((l) => l.result === undefined ? [] : [l.result.at + (l.result.state === "pending" ? PRESS_TIMEOUT_MS : SETTLED_MS)]),
    ...pressEndsAt(ui, view),
    ...settled.flatMap(({ id, state }) => state.canUndo ? [isFirstRead ? (ui.undoSeen[id] ?? now) + SETTLED_MS : state.at + SETTLED_MS] : []),
    ...settled.flatMap(({ state }) => state.offersUndo && isSendOnItsWay(state.delivery) ? [undoPlaceEndsAt(state)] : []),
    nextFoldAt(folding, {
      lastTypedMessageAt: ui.host.lastTypedMessageAt,
      listInput: ui.listInput,
      now,
      settleWindowMs: SETTLED_MS
    }),
    timedChangeAt(view.lastActions, now),
    isHolding && ui.listInput !== null ? ui.listInput.last + FOLD_QUIET_MS : null,
    cursor?.guard ? cursor.guard.at + PRESS_GUARD_MS : null,
    ...Object.values(ui.notes).map((n) => n.at + SETTLED_MS),
    ...Object.values(ui.errors).map((e) => e.at + SETTLED_MS),
    ui.notice === null ? null : ui.notice.at + SETTLED_MS,
    ui.restoring === null ? null : ui.restoring.at + SETTLED_MS,
    ...Object.values(ui.collapses).map((c) => c.at + COLLAPSE_WAIT_MS),
    ...ui.demoReplies.map((d) => d.dueAt)
  ];
  return earliestOf(times.filter((t) => t !== null && t > now));
}
function nextWakeAt(ui, view, now) {
  const times = [
    readWakeAt(ui, view, now),
    frameWakeAt(ui, view, now),
    ui.shownSince === null ? null : tintWakeAt(ui, view, now)
  ];
  return earliestOf(times.filter((t) => t !== null && t > now));
}
var alive = (byId, ms, now) => Object.fromEntries(Object.entries(byId).filter(([, x]) => now < x.at + ms));
function expired(ui, view, now) {
  const collapses = Object.fromEntries(Object.entries(ui.collapses).filter(([id, c]) => now < c.at + COLLAPSE_WAIT_MS && view.collapsed.includes(id) !== c.isCollapsed));
  return {
    ...ui,
    notes: alive(ui.notes, SETTLED_MS, now),
    errors: alive(ui.errors, SETTLED_MS, now),
    notice: ui.notice !== null && now < ui.notice.at + SETTLED_MS ? ui.notice : null,
    restoring: ui.restoring !== null && now < ui.restoring.at + SETTLED_MS ? ui.restoring : null,
    collapses
  };
}
function dueDemoReplies(ui, now) {
  const due = ui.demoReplies.filter((d) => d.dueAt <= now);
  const commands = due.map((d) => ({ kind: "demo-reply", pressId: d.pressId }));
  return withCommands({ ...ui, demoReplies: ui.demoReplies.filter((d) => d.dueAt > now) }, ...commands);
}

// ../core/view/ui-controller.ts
var PERSON_EVENTS = new Set([
  "show-tab",
  "show-help",
  "show-ask",
  "select",
  "step",
  "title-press",
  "collapse",
  "fold",
  "status-fold",
  "earlier",
  "show-options",
  "fold-all",
  "open-field",
  "edit-draft",
  "close-field",
  "press",
  "undo-key",
  "list-input"
]);
var addOnce = (list, x) => list.includes(x) ? [...list] : [...list, x];
function resetUi(ui, now) {
  const fresh = freshUi(ui.config, ui.tab);
  return {
    ...fresh,
    host: ui.host,
    isVisible: ui.isVisible,
    shownSince: ui.shownSince === null ? null : now,
    isOpening: ui.shownSince !== null,
    nextPressId: ui.nextPressId,
    drafts: ui.drafts,
    discarded: ui.discarded,
    unfolded: ui.unfolded,
    closedAll: ui.closedAll,
    statusUnfolded: ui.statusUnfolded,
    optionsShown: ui.optionsShown
  };
}
function read(ui, view, host, now) {
  const recorded = recordTabs(ui, view, host, now);
  const settled = expired(releasedDrafts(expirePresses(recorded.ui, view, now), view), view, now);
  const start = { ...settled, undoSeen: seenSettled(settled, view, now) };
  return chain(withCommands(start), (next) => readCursors(next, view, recorded.added, now), (next) => readTabs(next, view, recorded.added, now), (next) => selectRestored(next, view, now));
}
function due(step, view, now) {
  return chain({ ...step, ui: expired(expirePresses(step.ui, view, now), view, now) }, (next) => settleHeldClose(next, view, now), (next) => hasHeldArrivals(next) ? follow(next, view, {}, now) : withCommands(next), (next) => dueDemoReplies(next, now));
}
var heldKeys = (ui, now) => {
  const holds = holdsOf(ui, now);
  return JSON.stringify([Object.keys(holds.replies).sort(), Object.keys(holds.discarded).sort()]);
};
function withHoldsRead(before, step, now) {
  const isChanged = heldKeys(before, now) !== heldKeys(step.ui, now);
  const hasRead = step.commands.some((c) => c.kind === "read");
  return isChanged && !hasRead ? { ...step, commands: [...step.commands, { kind: "read" }] } : step;
}
function showAsk(ui, view, id, by, now) {
  const shown = shownTab(ui, "needsYou", now);
  const index = tabWaits(shown, view, "needsYou").findIndex((r) => r.id === id);
  const selected = withCursor(shown, "needsYou", { id, index, guard: { by, at: now } });
  const commands = [
    { kind: "tab-shown", tab: "needsYou" },
    { kind: "reveal", tab: "needsYou", id, closedId: null }
  ];
  return withCommands(selected, ...commands);
}
function step(ui, view, by, ids, now) {
  const next = stepSelection(ui, view, by, ids, now);
  const id = selectedOf(next, view, next.tab);
  const tab = next.tab;
  return isRowTab(tab) && id !== null ? withCommands(next, { kind: "reveal", tab, id, closedId: null }) : withCommands(next);
}
function handle(ui, view, e, now) {
  switch (e.type) {
    case "opened":
      return withCommands(opened(ui, now, e.isFirst === true));
    case "closed":
      return withCommands(closed(ui));
    case "reset":
      return withCommands(resetUi(ui, now));
    case "read":
      return read(ui, view, e.host, now);
    case "visible":
      return withCommands(visible(ui, e.isVisible));
    case "show-tab":
      return withCommands(shownTab(ui, e.tab, now), { kind: "tab-shown", tab: e.tab });
    case "show-help":
      return withCommands(helpShown(ui, e.isShown, now));
    case "show-ask":
      return showAsk(ui, view, e.id, e.by, now);
    case "select":
      return withCommands(selectRow(ui, view, e.tab, e.id, e.by, now));
    case "step":
      return step(ui, view, e.by, e.ids, now);
    case "title-press":
      return titlePress(ui, view, e.id, e.by, now);
    case "collapse":
      return collapseRow(ui, view, e.id, e.isCollapsed, now);
    case "fold":
      return withCommands(setFold(ui, e.fold, e.isOpen));
    case "status-fold":
      return withCommands({
        ...ui,
        statusUnfolded: e.isOpen ? addOnce(ui.statusUnfolded, e.id) : ui.statusUnfolded.filter((id) => id !== e.id)
      });
    case "earlier":
      return withCommands({ ...ui, closedAll: addOnce(ui.closedAll, e.fold) });
    case "show-options":
      return withCommands({ ...ui, optionsShown: addOnce(ui.optionsShown, e.id) });
    case "fold-all":
      return foldAll2(ui, view, e.isOpening, now);
    case "open-field":
      return openField(ui, view, e.id, e.seed, now);
    case "edit-draft":
      return withCommands(editDraft(ui, e.id, e.text, now));
    case "close-field":
      return closeField(ui, view, e.id, e.isDiscard, now);
    case "press":
      return press(ui, view, e.press, e.by, now);
    case "undo-key":
      return undoKey(ui, view, now);
    case "press-settled":
      return pressSettled(ui, view, e.pressId, e.outcome, now);
    case "list-input":
      return withCommands(ui);
    case "tick":
      return withCommands(ui);
  }
}
function reduceUi(ui, view, event, now) {
  const noted = PERSON_EVENTS.has(event.type) ? { ...ui, listInput: withListInput(ui.listInput, now) } : ui;
  const result = withHoldsRead(ui, due(handle(noted, view, event, now), view, now), now);
  return { ...result, nextWakeAt: nextWakeAt(result.ui, view, now) };
}
var notesOf = (ui) => ui.notes;
var isUiWorthKeeping = (ui) => Object.values(ui.drafts).some((d) => d.text.trim() !== "") || Object.keys(ui.sentReplies).length > 0;
function keptUiStates(states, shownId) {
  const others = Object.entries(states).filter(([id, s]) => id !== shownId && isUiWorthKeeping(s.ui)).sort(([, a], [, b]) => b.shownAt - a.shownAt).slice(0, MAX_KEPT_UI);
  const shown = shownId !== null && states[shownId] ? [[shownId, states[shownId]]] : [];
  return Object.fromEntries([...shown, ...others]);
}

// ../core/view/unshown-press.ts
var SENDING = "Sending…";
var sendingFeedback = (at) => ({ is: "sending", label: SENDING, at, sentAt: at });

// src/out.ts
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
  tone: feedbackTone({ is: "local", result }),
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
var refusedLine = (why) => ({
  text: why,
  tone: "error",
  source: { is: "notSent", reason: why, retry: null }
});
var notAppliedText = (why) => ({
  text: `Not applied: ${why}`,
  tone: "error",
  source: { is: "notSent", reason: why, retry: null }
});
var UNCONFIRMED = { error: null, note: null, isUnconfirmed: true };
var STALE = { error: null, note: "stale", isUnconfirmed: false };
function appliedOutcome(view, rowId) {
  const delivery = view.lastActions[rowId]?.delivery;
  return {
    error: delivery?.state === "failed" ? delivery.reason : null,
    note: null,
    isUnconfirmed: delivery?.state === "unconfirmed"
  };
}
function settleOuts(outs, view, lastPress, now) {
  const settled = { outs: [], lines: {}, ended: [], toClaim: [] };
  const end = (out, outcome) => settled.ended.push({ uiPressId: out.uiPressId, outcome });
  for (const out of outs) {
    if (lastPress?.id === out.pressId && lastPress.outcome === "refused") {
      settled.lines[out.rowId] = refusedLine(lastPress.why);
      end(out, { error: lastPress.why, note: null, isUnconfirmed: false });
      continue;
    }
    if (lastPress?.id === out.pressId) {
      end(out, lastPress.outcome === "stale" ? STALE : appliedOutcome(view, out.rowId));
      continue;
    }
    if (rowSignature(view, out.rowId) !== out.before) {
      end(out, appliedOutcome(view, out.rowId));
      continue;
    }
    const isPassed = lastPress !== null && lastPress.id > out.pressId;
    const isGivenUp = out.waitingSince !== null && now - out.waitingSince >= GIVE_UP_MS;
    if (out.isWritten && out.isTaken && (isPassed || isGivenUp)) {
      settled.lines[out.rowId] = unconfirmedLine(out, now);
      end(out, UNCONFIRMED);
    } else if (!out.isWritten || !isGivenUp)
      settled.outs.push(out);
    else
      settled.toClaim.push(out);
  }
  return settled;
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
    const refused = lines[id];
    if (!out || holdsStatusWhileOut(out.kind) || refused)
      return refused ?? null;
    const source = out.pending ?? sendingFeedback(now);
    if (out.result)
      return { ...resultLine(out.result), source };
    return { text: feedbackText(source, "herdr"), tone: "muted", source };
  };
  return blocks.map((b) => {
    if (b.kind === "row" || b.kind === "pr" || b.kind === "line" || b.kind === "banner") {
      const line = lineOf(b.id);
      return { ...b, buttons: withOutButtons(b.buttons, outRows), ...line ? { feedback: line } : {} };
    }
    if (b.kind === "empty" && b.under) {
      const line = lineOf(b.under.id);
      const under = {
        ...b.under,
        buttons: withOutButtons(b.under.buttons, outRows),
        ...line ? { feedback: line } : {}
      };
      return { ...b, under };
    }
    if (b.kind === "status" || b.kind === "heading")
      return { ...b, buttons: withOutButtons(b.buttons, outRows) };
    return b;
  });
}

// src/fold-all.ts
function foldClickOpens(does, ui) {
  if (does.is === "collapse")
    return !does.isCollapsed;
  if (does.is !== "view")
    return null;
  if ("closedFold" in does.change)
    return !ui.unfolded.includes(does.change.closedFold);
  if ("toggleFold" in does.change)
    return !ui.statusUnfolded.includes(does.change.toggleFold);
  return null;
}

// src/controller.ts
var HERDR_LOOK = { runningMarks: "pulse", titleTint: "steps", undoClock: "session" };
function applyEvents(ui, view, events, now) {
  let applied = { ui, commands: [], nextWakeAt: null };
  for (const event of events) {
    const step = reduceUi(applied.ui, view, event, now);
    applied = { ui: step.ui, commands: [...applied.commands, ...step.commands], nextWakeAt: step.nextWakeAt };
  }
  return applied;
}
var hostFactsOf = (read) => ({
  isFetchingPrs: read.isFetchingPrs,
  hasAsksBlocker: false,
  lastTypedMessageAt: read.session.presence.lastTypedMessageAt
});
var lookUiOf = (ui, view) => ({
  tab: ui.tab,
  selected: view !== null && isRowTab(ui.tab) ? selectedOf(ui, view, ui.tab) : null,
  unfolded: ui.unfolded,
  closedAll: ui.closedAll,
  optionsShown: ui.optionsShown,
  statusUnfolded: ui.statusUnfolded,
  typing: ui.typing
});
function changeEvents(c, ui, by) {
  if ("showOptions" in c)
    return [{ type: "show-options", id: c.showOptions }];
  if ("closedFold" in c)
    return [{ type: "fold", fold: c.closedFold, isOpen: !ui.unfolded.includes(c.closedFold) }];
  if ("earlier" in c)
    return [{ type: "earlier", fold: c.earlier }];
  if ("toggleFold" in c)
    return [{ type: "status-fold", id: c.toggleFold, isOpen: !ui.statusUnfolded.includes(c.toggleFold) }];
  if ("showAsk" in c)
    return [{ type: "show-ask", id: c.showAsk, by }];
  return [{ type: "show-help", isShown: !ui.isHelpShown }];
}
function buttonEvents(d, ui, by, isAll = false) {
  const opening = isAll ? foldClickOpens(d, ui) : null;
  if (opening !== null)
    return [{ type: "fold-all", isOpening: opening }];
  if (d.is === "view")
    return changeEvents(d.change, ui, by);
  if (d.is === "collapse")
    return [{ type: "collapse", id: d.id, isCollapsed: d.isCollapsed }];
  if (d.is === "press")
    return [{ type: "press", press: d.press, by }];
  if (d.is === "type") {
    const isSeeded = ui.drafts[d.rowId] === undefined && d.text !== "";
    return [{ type: "open-field", id: d.rowId, ...isSeeded ? { seed: d.text } : {} }];
  }
  if (d.is === "send") {
    const text = ui.drafts[d.rowId]?.text ?? "";
    return [{ type: "press", press: { action: "type", id: d.rowId, text }, by }];
  }
  if (d.is === "leave")
    return [{ type: "close-field", id: d.rowId, isDiscard: d.isDiscard }];
  return [];
}
function titleClickEvents(ui, id, isCollapsed, isAll) {
  if (isAll)
    return [{ type: "fold-all", isOpening: !isCollapsed }];
  if (isRowTab(ui.tab))
    return [{ type: "title-press", id, by: "click" }];
  return [{ type: "collapse", id, isCollapsed }];
}
var isSamePress = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var buttonsIn = (blocks) => blocks.flatMap((b) => ("buttons" in b) ? b.buttons ?? [] : b.kind === "empty" ? b.under?.buttons ?? [] : []);
function buttonOf(blocks, press) {
  return buttonsIn(blocks).find((b) => b.does.is === "press" && isSamePress(b.does.press, press)) ?? null;
}
function pressSending(c, b, at, view) {
  const { sessionId, read } = at;
  const target = sessionId && read && view ? {
    appHome: at.appHome,
    sessionId,
    terminal: read.envelope.terminal,
    view,
    holds: c.holds,
    when: c.when,
    projectFolder: read.projectFolder
  } : null;
  const p = c.press;
  const d = b?.does.is === "press" ? b.does : null;
  const isGoal = p.action === "type" && p.id === GOAL_KEYS_ID;
  const label = p.action !== "type" ? b?.label ?? "" : isGoal && view ? goalSubmitLabel(view.statusPage) : ROW_COPY.send;
  const reply = p.action === "type" && !isGoal ? p.text.trim() : undefined;
  const options = { effects: d?.effects ?? [], label, kind: d?.kind ?? null, uiPressId: c.pressId };
  return { target, options: reply === undefined ? options : { ...options, reply } };
}
var isLookMove = (e) => PERSON_EVENTS.has(e.type) && e.type !== "list-input" && e.type !== "edit-draft";
var fieldHints = (blocks) => Object.fromEntries(buttonsIn(blocks).flatMap((b) => b.does.is === "type" ? [[b.does.rowId, b.does.hint]] : []));
function keptLeft(left, hasPressOut) {
  const out = Object.entries(left).filter(([id]) => hasPressOut(id));
  return { ...keptUiStates(left, null), ...Object.fromEntries(out) };
}
var NO_DRAW = { tab: "needsYou", rows: null, outs: [], lastPressId: null };
var drawOf = (tab, rows, outs, read) => ({
  tab,
  rows,
  outs: outs.map((o) => ({ pressId: o.pressId, rowId: o.rowId, before: o.before, hasRun: o.result !== null })),
  lastPressId: read?.is === "read" && read.lastPress?.id || null
});
var waitsIn = (rows, id) => rows.some((r) => r.id === id && r.isWaiting);
function isAnswerDraw(last, now, view) {
  const hasRun = (o) => !o.hasRun && now.outs.some((n) => n.pressId === o.pressId && n.hasRun);
  const isNamed = (o) => now.lastPressId === o.pressId && last.lastPressId !== o.pressId;
  const isChanged = (o) => view !== null && rowSignature(view, o.rowId) !== o.before;
  if (last.outs.some((o) => hasRun(o) || isNamed(o) || isChanged(o)))
    return true;
  const lastRows = last.tab === now.tab ? last.rows : null;
  const rows = now.rows;
  if (rows === null || lastRows === null)
    return false;
  return last.outs.some((o) => waitsIn(lastRows, o.rowId) && !waitsIn(rows, o.rowId));
}

// src/files.ts
function isSessionChange(changed, appHome, sessionId) {
  const folder = publishedSessionsFolder(appHome);
  const file = publishedSessionPath(appHome, sessionId);
  return changed.some((p) => p === file || p === folder || p === `${folder}/`);
}
var isRecord2 = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var SOURCE_FIELDS = ["host", "agent", "sessionId", "terminal"];
function lastPressOf2(x) {
  if (!isRecord2(x) || typeof x.id !== "string")
    return null;
  if (x.outcome === "refused")
    return typeof x.why === "string" ? { id: x.id, outcome: "refused", why: x.why } : null;
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
  if (!isRecord2(file))
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
  if (!isRecord2(file.session))
    return { is: "refused", reason: "no session" };
  const envelope = file;
  return {
    is: "read",
    envelope,
    session: upgradeSession(file.session),
    isTrimmed: file.trimmed === true,
    savesCollapses: "collapsed" in file.session,
    lastPress: lastPressOf2(file.lastPress),
    projectFolder: typeof file.projectFolder === "string" && file.projectFolder.startsWith("/") ? file.projectFolder : null,
    isFetchingPrs: file.isFetchingPrs === true,
    isReadFailed: file.isReadFailed === true,
    isSendHeld: file.isSendHeld === true,
    turnReadFailedAt: typeof file.turnReadFailedAt === "number" ? file.turnReadFailedAt : null,
    openDialog: file.openDialog === "question" || file.openDialog === "permission" ? { kind: file.openDialog, text: typeof file.openDialogText === "string" ? file.openDialogText : null } : null
  };
}
var TORN_RETRY_MS = 30;
var TORN_RETRIES = 5;
async function readSessionFile(read, path, sleep) {
  for (let n = 0;; n++) {
    const text = await read(path).catch((e) => e);
    const got = typeof text === "string" || text === null ? readSession(text) : { is: "refused", reason: String(text) };
    if (got.is !== "torn" || n >= TORN_RETRIES)
      return got;
    await sleep(TORN_RETRY_MS);
  }
}

// src/follow.ts
function shownOf(where, address) {
  const t = where.terminals.find((x) => x.address === address);
  const sessionId = t?.labels?.[SESSION_LABEL];
  const isSafeSessionId = sessionId !== undefined && isSessionFile(`${sessionId}.json`);
  if (!isSafeSessionId)
    return { is: "no-inbox", terminal: address, program: t?.program?.name ?? null };
  return t?.program?.shell ? { is: "ended", terminal: address } : { is: "session", terminal: address, sessionId };
}
function follow2(where, tab, last) {
  const inTab = where.panes.flatMap((p) => p.tab === tab && p.terminal ? [p.terminal] : []);
  const focused = where.focused?.tab === tab ? where.focused.terminal : null;
  const isLabeled = (address) => Boolean(where.terminals.find((x) => x.address === address)?.labels?.[SESSION_LABEL]);
  const address = [focused, last].find((a) => a !== null && inTab.includes(a)) ?? inTab.find(isLabeled) ?? inTab[0] ?? null;
  return address === null ? { is: "no-terminal" } : shownOf(where, address);
}

// src/draw-help.ts
function helpBlocks(version) {
  const keys = helpKeys("herdr");
  const heading = (id, text, aside) => ({
    kind: "heading",
    id,
    text,
    count: null,
    mark: null,
    buttons: [],
    isLabel: false,
    ...aside === undefined ? {} : { aside }
  });
  return [
    heading("help keys", HELP_COPY.keys, version ?? undefined),
    ...keys.map((k) => ({
      kind: "status",
      id: `key ${k.keys}`,
      depth: 0,
      mark: null,
      name: k.keys,
      isBold: true,
      nameLevel: "plain",
      stall: null,
      does: k.does,
      under: [],
      buttons: []
    })),
    heading("help indicators", HELP_COPY.indicators),
    ...MARK_LEGEND.map((m) => ({
      kind: "status",
      id: `mark ${m.mark}`,
      depth: 0,
      mark: { text: m.mark, tone: m.tone, isRunning: m.isRunning },
      name: "",
      isBold: false,
      nameLevel: "plain",
      stall: null,
      does: m.words,
      under: [],
      buttons: []
    }))
  ];
}

// src/keys.ts
var isSelectable = (b) => b.kind === "row" && b.isSelectable;
function stepTab(tabs, by) {
  const at = tabs.findIndex((t) => t.isSelected);
  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null;
}
var event = (e) => ({ is: "event", event: e });
function keyMove(key, tabs, blocks, typing, isHelpShown = false) {
  if (typing !== null)
    return key === "escape" ? event({ type: "close-field", id: typing, isDiscard: false }) : null;
  if (key === "escape")
    return { is: "leave" };
  if (key === "left" || key === "right") {
    const tab = stepTab(tabs, key === "right" ? 1 : -1);
    return tab ? event({ type: "show-tab", tab }) : null;
  }
  if (isHelpShown)
    return null;
  if (key === "j" || key === "k") {
    const ids = blocks.filter(isSelectable).map((r) => r.id);
    return ids.length > 0 ? event({ type: "step", by: key === "j" ? 1 : -1, ids }) : null;
  }
  if (key === FOLD_ALL_KEY)
    return event({ type: "fold-all", isOpening: null });
  if (key === UNDO_KEY)
    return event({ type: "undo-key" });
  const selected = blocks.find((b) => b.kind === "row" && b.isSelected);
  if (key === COLLAPSE_KEY && selected?.isSelectable)
    return event({ type: "collapse", id: selected.id, isCollapsed: !selected.isCollapsed });
  const lines = blocks.flatMap((b) => b.kind === "line" || b.kind === "banner" ? b.buttons : b.kind === "empty" ? b.under?.buttons ?? [] : []);
  const pressed = [...selected?.buttons ?? [], ...lines].find((b) => b.hotkey === key && !b.isOut);
  return pressed ? { is: "press", button: pressed } : null;
}
var isFieldDrawn = (typing, isHelpShown) => typing !== null && !isHelpShown;

// src/press-file.ts
var pressPath = (appHome, sessionId, pressId) => `${pressFolder(appHome, sessionId)}/${pressId}.json`;
var newPressId = (now, random) => `${now.toString(36)}-${Math.floor(random * 36 ** 6).toString(36)}`;
function pressFileText(id, pressedAt, press, holds, result = null, when = []) {
  const { replies, discarded, shownSince, listInput } = holds;
  return JSON.stringify({
    format: HERDR_FORMAT,
    id,
    pressedAt,
    press,
    holds: { replies, discarded, shownSince, listInput },
    ...result ? { result } : {},
    ...when.length > 0 ? { when } : {}
  });
}

// src/collapse.ts
async function writeCollapse(io, to, read, row, c) {
  if (!read.savesCollapses)
    return;
  const id = newPressId(c.at, io.random());
  const file = { format: HERDR_FORMAT, id, collapse: { row, ...c } };
  if (await io.write(pressPath(to.appHome, to.sessionId, id), JSON.stringify(file)) === null)
    await io.wake(read.envelope.terminal, id);
}

// ../core/view/springs.ts
var HEIGHT_SPRING = { response: 300, damping: 1, epsilon: 0.5 };
var LONGEST_MOVE_PX = 2000;
var FRAME_MS = 16;
var STEP_MS = 1;
var isAtRest = (s, target, spring) => Math.abs(s.x - target) < spring.epsilon && Math.abs(s.v) * FRAME_MS < spring.epsilon;
function springStep(s, target, ms, spring = HEIGHT_SPRING) {
  const w = 2 * Math.PI / spring.response;
  let { x, v } = s;
  for (let t = 0;t < ms; t += STEP_MS) {
    if (t % FRAME_MS === 0 && isAtRest({ x, v }, target, spring))
      return { x: target, v: 0 };
    const dt = Math.min(STEP_MS, ms - t);
    v += (-w * w * (x - target) - 2 * spring.damping * w * v) * dt;
    x += v * dt;
  }
  return { x, v };
}
function springFrames(from, target, spring = HEIGHT_SPRING) {
  const frames = [from.x];
  let s = from;
  while (!isAtRest(s, target, spring) && (frames.length - 1) * FRAME_MS < 1e4) {
    s = springStep(s, target, FRAME_MS, spring);
    frames.push(s.x);
  }
  frames[frames.length - 1] = target;
  return frames;
}
var msToRest = (from, target, spring) => (springFrames(from, target, spring).length - 1) * FRAME_MS;
function settleMs(spring) {
  const fromRest = msToRest({ x: 0, v: 0 }, LONGEST_MOVE_PX, spring);
  let longest = fromRest;
  let s = { x: 0, v: 0 };
  for (let ms = FRAME_MS;ms < fromRest; ms += FRAME_MS) {
    s = springStep(s, LONGEST_MOVE_PX, FRAME_MS, spring);
    longest = Math.max(longest, msToRest(s, 0, spring));
  }
  return longest;
}
var HEIGHT_SETTLE_MS = settleMs(HEIGHT_SPRING);

// ../core/view/held-line.ts
var isPressUnderWay = (f) => pressUnderWaySince(f) !== null;
function stepHeldLine(kept, place, now, leaveMs) {
  if (place.own !== null) {
    const line = place.own;
    return { kept: { line, isFailure: place.isOwnFailure, isHidden: false, leftAt: null }, drawn: null };
  }
  if (!kept)
    return { kept: undefined, drawn: null };
  const drawn = (k) => ({ kept: k, drawn: { line: k.line, isHidden: k.isHidden, leftAt: k.leftAt } });
  if (kept.leftAt !== null)
    return now < kept.leftAt + leaveMs ? drawn(kept) : { kept: undefined, drawn: null };
  if (place.isPressUnderWay)
    return drawn({ ...kept, isHidden: kept.isFailure });
  if (place.isUnder && !kept.isFailure)
    return drawn(kept);
  return drawn({ ...kept, leftAt: now });
}
var heldLineEndsAt = (kept, leaveMs) => kept?.leftAt == null ? null : kept.leftAt + leaveMs;

// src/blocks.ts
var button = (id, label, emphasis, does = { is: "nothing" }, hotkey = null) => ({ id, label, emphasis, isOut: false, hotkey, does });
var sessionButtons = (id, key) => key ? [button(`${id} session`, key.label, key.emphasis, { is: "focusTerminal" })] : [];
var isOpenRow = (r) => r.isSelected && !r.isCollapsed;
var agedText = (a, now) => `${a.lead}${DOT}${shortAgo(now - a.at)}`;
function emptyBlock(tab, empty, parts = null) {
  return {
    kind: "empty",
    id: `empty ${tab}`,
    empty: { title: empty.title, hint: empty.hint },
    titleMark: empty.titleMark,
    under: parts
  };
}

// ../core/view/row-motion.ts
var FADE_MS = 200;
var LEAVE_FADE_MS = 120;
var ENTER_FADE_MS = 150;
var SLIDE_PX = 8;
function enterDelayMs(height, from = { x: 0, v: 0 }, slackPx = SLIDE_PX / 2) {
  const at = springFrames(from, height).findLastIndex((x) => height - x > slackPx) + 1;
  return Math.min(at * FRAME_MS, HEIGHT_SETTLE_MS - ENTER_FADE_MS);
}
var CUT_OPACITY = 0.2;
var FAINT_OPACITY = CUT_OPACITY / 2;
function turnBackFades(height, from) {
  const dimMs = enterDelayMs(height, from);
  const full = { to: 1, ms: ENTER_FADE_MS };
  const faintMs = Math.min(dimMs, ENTER_FADE_MS * FAINT_OPACITY);
  const holdMs = dimMs - faintMs;
  const hold = holdMs > 0 ? [{ to: FAINT_OPACITY, ms: holdMs }] : [];
  return dimMs > 0 ? [{ to: FAINT_OPACITY, ms: faintMs }, ...hold, full] : [full];
}
function faintCloseFades(opacity) {
  const out = { to: 0, ms: LEAVE_FADE_MS };
  return opacity > FAINT_OPACITY ? [{ to: FAINT_OPACITY, ms: 0 }, out] : [out];
}
function titleSwapMs(height, from) {
  return (springFrames(from, height).length - 1) * FRAME_MS;
}
function titleFades(isOpening) {
  const ms = isOpening ? ENTER_FADE_MS : LEAVE_FADE_MS;
  return { taken: { delayMs: 0, ms }, left: { delayMs: ms / 2, ms: ms / 2 } };
}
var drawsPanel = (track) => track.hasOpenForm && track.state !== "settling";
var swapsForm = (track) => track.state === "settling" || track.leavesSettled === true;
var ROW_FADE_MS = {
  entering: ENTER_FADE_MS,
  opening: ENTER_FADE_MS,
  closing: LEAVE_FADE_MS,
  settling: FADE_MS,
  leaving: LEAVE_FADE_MS,
  closed: 0,
  open: 0,
  settled: 0,
  undoing: 0
};
var ROW_STATE_MS = Object.fromEntries(Object.entries(ROW_FADE_MS).map(([state, fadeMs]) => {
  const springStarts = state === "leaving" || state === "closing" ? LEAVE_FADE_MS : 0;
  return [state, fadeMs > 0 ? Math.max(fadeMs, springStarts + HEIGHT_SETTLE_MS) : 0];
}));
function isMoving(state) {
  return ROW_STATE_MS[state] > 0;
}
var moveMs = (track) => ROW_STATE_MS[track.state] + (isMoving(track.state) && swapsForm(track) ? LEAVE_FADE_MS : 0);
function stepRow(track, target, now, isNew = false, isReduced = false) {
  const form = target === "undoing" ? "settled" : target;
  if (!track) {
    if (isNew && !isReduced && form !== "gone")
      return entering(form, now);
    return rest(undefined, form, target, now);
  }
  const next = formOf(track) === form ? track : moveToward(track, form, now);
  if (isMoving(next.state) && !isReduced && now - next.since < moveMs(next))
    return next;
  return rest(next, form, target, now);
}
function entering(form, now) {
  const track = { state: "entering", since: now, hasOpenForm: form === "open" };
  return form === "settled" ? { ...track, entersSettled: true } : track;
}
function formOf({ state, hasOpenForm, entersSettled }) {
  switch (state) {
    case "entering":
      return entersSettled ? "settled" : hasOpenForm ? "open" : "closed";
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
var isSettledFormFading = (track, now) => track.leavesSettled === true && now - track.since < LEAVE_FADE_MS;
function moveToward(track, form, now) {
  const leaves = formOf(track) === "settled" ? { leavesSettled: true } : {};
  switch (form) {
    case "open":
      if (isSettledFormFading(track, now))
        return { ...track, state: "opening", hasOpenForm: true };
      return { state: "opening", since: now, hasOpenForm: true, ...leaves };
    case "closed":
      if (isSettledFormFading(track, now))
        return { ...track, state: "closing" };
      return track.state === "leaving" ? entering("closed", now) : { state: "closing", since: now, hasOpenForm: track.hasOpenForm, ...leaves };
    case "settled":
      return { state: "settling", since: now, hasOpenForm: track.hasOpenForm };
    case "gone":
      return { state: "leaving", since: now, hasOpenForm: track.hasOpenForm };
  }
}
function placeAfter(drawn, above) {
  for (let i = above.length - 1;i >= 0; i--) {
    const at = drawn.indexOf(above[i] ?? "");
    if (at >= 0)
      return at + 1;
  }
  return 0;
}
function rest(track, form, target, now) {
  if (form === "gone")
    return null;
  const state = target === "undoing" ? "undoing" : form;
  return track?.state === state ? track : { state, since: now, hasOpenForm: state === "open" };
}

// src/block-glide.ts
var NEXT_FRAME_MS = 16;
var HOLD_MS = NEXT_FRAME_MS + LEAVE_FADE_MS;
var restAt = (now, fadeMs) => now + Math.max(fadeMs, HEIGHT_SETTLE_MS) + NEXT_FRAME_MS;
function glideOf(track, isStart, last, now, holdsUntil, isPressed, isReplaced, height) {
  const { state } = track;
  const isLive = last !== null && now < last.endsAt;
  if (state === "leaving") {
    if (!isStart && last !== null) {
      const box = last.shutAt !== null && now >= last.shutAt ? "shut" : last.box;
      return { ...last, box, isShown: false };
    }
    const isTurned = isShownAtOnce(last, now, height);
    const fadeMs = isReplaced || isTurned ? 0 : LEAVE_FADE_MS;
    const shutAt = now + (isLive ? 0 : NEXT_FRAME_MS) + fadeMs;
    const from = isTurned ? { box: "shut", isShown: false } : isLive || isReplaced ? { box: shutAt <= now ? "shut" : last?.box ?? "open", isShown: false } : { box: "open", isShown: true };
    const glide = { ...from, fadeMs, waitsForSpace: false, shutForMs: null, opensAt: null, shutAt };
    return { ...glide, endsAt: restAt(shutAt, 0) };
  }
  if (state === "entering") {
    if (!isStart && last !== null)
      return openedAt(last, now);
    if (isLive) {
      const isShutting = last.shutAt !== null && now > last.shutAt;
      const waitsForSpace = isShutting || last.box !== "open";
      const opensAt = waitsForSpace && !isPressed && holdsUntil > now ? holdsUntil : null;
      const startsAt = opensAt ?? now;
      const shutForMs = isShutting && last.shutAt !== null ? startsAt - last.shutAt : null;
      const isOpen = opensAt === null;
      const box = isOpen ? "open" : "shut";
      const glide = { box, isShown: isOpen, fadeMs: ENTER_FADE_MS, waitsForSpace, shutForMs };
      return { ...glide, opensAt, shutAt: null, endsAt: restAt(startsAt, ENTER_FADE_MS) };
    }
    const opensAt = !isPressed && holdsUntil > now ? holdsUntil : now + NEXT_FRAME_MS;
    const glide = { box: "shut", isShown: isPressed, fadeMs: isPressed ? 0 : ENTER_FADE_MS };
    return {
      ...glide,
      waitsForSpace: !isPressed,
      shutForMs: null,
      opensAt,
      shutAt: null,
      endsAt: restAt(opensAt, glide.fadeMs)
    };
  }
  if (!isLive || last.box !== "open" && last.opensAt === null)
    return null;
  const glide = openedAt(last, now);
  return isStart ? { ...glide, endsAt: Math.max(glide.endsAt, restAt(now, glide.fadeMs)) } : glide;
}
var isShownAtOnce = (g, now, height) => g !== null && g.box === "open" && g.shutAt === null && g.fadeMs === 0 && g.opensAt !== null && (height === undefined || now < g.opensAt + enterDelayMs(height));
function openedAt(g, now) {
  const isOpen = g.opensAt === null || now >= g.opensAt;
  return { ...g, box: isOpen ? "open" : "shut", isShown: isOpen || g.fadeMs === 0 };
}
var shutTo = (height, ms) => ms === null ? { x: 0, v: 0 } : springStep({ x: height, v: 0 }, 0, ms, HEIGHT_SPRING);

// src/heights.ts
var MOVED_FROM = "~from ";
var MOVED_TO = "~to ";
var copyIdOf = (id, at) => `${id}${MOVED_FROM}${at}`;
var originalKey = (key) => key.replace(new RegExp(`${MOVED_FROM}\\d+$`), "");
function zoomOf(settings) {
  const zoom = settings.zoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
}
var NO_SIZES = { get: () => {
  return;
}, widthOf: () => {
  return;
} };

class Heights {
  sizes = new Map;
  resized = new Set;
  isChanged = false;
  formingSince = null;
  zoom = null;
  get(key) {
    return (this.sizes.get(key) ?? this.sizes.get(originalKey(key)))?.height;
  }
  widthOf(key) {
    return (this.sizes.get(key) ?? this.sizes.get(originalKey(key)))?.width;
  }
  measure(key, reported, zoom, isWidthDrawn = false) {
    const size = { width: reported.width / zoom, height: reported.height / zoom };
    const isZoomChanged = this.zoom !== null && this.zoom !== zoom;
    this.zoom = zoom;
    const was = this.sizes.get(key);
    this.sizes.set(key, { width: size.width, height: size.height });
    const isRewrapped = was !== undefined && was.width !== size.width && was.height !== size.height;
    if (isRewrapped)
      this.resized.add(key);
    if (was?.height !== size.height)
      this.isChanged = true;
    return was?.height !== size.height || isZoomChanged || isWidthDrawn && was?.width !== size.width;
  }
  takeResized() {
    const resized = this.resized;
    this.resized = new Set;
    return resized;
  }
  isForming(isFirst, now) {
    const isChanged = this.isChanged;
    this.isChanged = false;
    const since = this.formingSince;
    this.formingSince = isFirst ? now : since !== null && isChanged && now - since < PAGE_FORMS_MS ? since : null;
    return this.formingSince !== null;
  }
  clear() {
    this.sizes.clear();
    this.resized.clear();
  }
}
var PAGE_FORMS_MS = 100;
var titleId = (id) => `title ${id}`;
var restId = (id) => `rest ${id}`;
var prHeadId = (id) => `head ${id}`;
var aboveId = (id) => `above ${id}`;
var aboveLineId = (id) => `above line ${id}`;
var addedId = (id) => `added ${id}`;
var addedLinesId = (id) => `added lines ${id}`;
var panelId = (id) => `panel ${id}`;

// src/held-line.ts
var statusKindOf = (l) => l.source?.is === "local" ? `local ${l.source.result.state}` : l.source?.is;
var NO_LINES_ABOVE = {
  held: new Map,
  lineless: new Set,
  bare: new Set,
  comes: new Map,
  afterTitle: new Map,
  goes: new Map,
  bodies: new Map,
  added: new Map
};
var HELD_LEAVE_MS = HOLD_MS + HEIGHT_SETTLE_MS;
var LINE_COMES_MS = NEXT_FRAME_MS + HEIGHT_SETTLE_MS;
var heldKey = (r) => r.settled ? `settled ${r.id}` : r.id;
var hasActions = (r) => r.buttons.length > 0 || r.field !== null;
var isStatusUnder = (r) => r.feedback !== null && (r.isStatusHeldUnder === true || isStatusUnderActions(r.feedback.source, hasActions(r)));
var lineOf = (f, cameAt, isAgain, isSwapped = false) => ({
  text: f.text,
  tone: f.tone,
  kind: statusKindOf(f),
  ...f.aged ? { aged: f.aged } : {},
  ...cameAt === undefined ? {} : { cameAt },
  ...isAgain ? { isAgain: true } : {},
  ...isSwapped ? { isSwapped: true } : {}
});
var comingRow = (b, l) => ({
  ...b,
  lineCameAt: l.cameAt,
  ...l.isAgain ? { isLineAgain: true } : {},
  ...l.isSwapped ? { isLineSwapped: true } : {}
});
var isOtherLine = (l, f) => l.kind !== statusKindOf(f) && l.text !== f.text;
var lettingGo = (line, now) => ({
  line,
  isFailure: false,
  isHidden: false,
  leftAt: now
});
var isFadingOut = (k, now) => k?.leftAt != null && !k.isHidden && now < k.leftAt + HOLD_MS;
var isLetGo = (k, now) => k?.leftAt != null && now < k.leftAt + HELD_LEAVE_MS;
var heldLineOf = (d, now) => ({
  text: d.line.aged ? agedText(d.line.aged, now) : d.line.text,
  tone: d.line.tone,
  isHidden: d.isHidden,
  ...d.leftAt === null ? {} : { leftAt: d.leftAt }
});
var isComing = (l, now) => l?.cameAt !== undefined && now < l.cameAt + LINE_COMES_MS;
var bodyKey = (l) => `${l.part} ${l.optionId ?? l.text}`;
function addedAt(keys, added) {
  const isThere = added.keys.length > 0 && added.keys.every((k, i) => keys[added.at + i] === k);
  return isThere ? added.at : -1;
}
function stepAdded(was, last, keys, now, isAtOnce) {
  if (isAtOnce)
    return null;
  if (was && now < was.cameAt + LINE_COMES_MS && addedAt(keys, was) >= 0)
    return was;
  if (last === undefined || keys.length <= last.length)
    return null;
  let head = 0;
  while (head < last.length && keys[head] === last[head])
    head++;
  let tail = 0;
  while (tail < last.length - head && keys[keys.length - 1 - tail] === last[last.length - 1 - tail])
    tail++;
  return head + tail < last.length ? null : { keys: keys.slice(head, keys.length - tail), at: head, cameAt: now };
}
function addLines(blocks, last, now, isAtOnce) {
  const bodies = new Map;
  const added = new Map;
  const shown = blocks.map((b) => {
    if (b.kind !== "row" || !isOpenRow(b) || !hasActions(b))
      return b;
    const keys = b.body.map(bodyKey);
    bodies.set(b.id, keys);
    const a = stepAdded(last.added.get(b.id), last.bodies.get(b.id), keys, now, isAtOnce);
    if (a)
      added.set(b.id, a);
    return a ? { ...b, addedLines: a } : b;
  });
  const ends = [...added.values()].flatMap((a) => [a.cameAt + NEXT_FRAME_MS, a.cameAt + LINE_COMES_MS]);
  return { blocks: shown, bodies, added, ends: ends.filter((at) => at > now) };
}
function holdLinesAbove(blocks, last, now, isAtOnce = false, isInput = false) {
  const next = new Map;
  const lineless = new Set;
  const bare = new Set;
  const comes = new Map;
  const afterTitle = new Map;
  const goes = new Map;
  const isEased = !isAtOnce && !isInput;
  const waiting = (b, k) => ({
    ...b,
    heldLine: heldLineOf(k, now),
    isLineWaiting: true
  });
  const bareRow = (b, key) => {
    const own = b.feedback !== null && !isStatusUnder(b) ? b.feedback : null;
    const was = last.afterTitle.get(key);
    const isGone = isEased && was !== undefined && (own === null || isOtherLine(was, own));
    const going = isGone ? lettingGo(was, now) : last.goes.get(key);
    const letGo = isLetGo(going, now) ? going : undefined;
    if (letGo && (own === null || isFadingOut(letGo, now))) {
      goes.set(key, letGo);
      return own === null ? { ...b, heldLine: heldLineOf(letGo, now) } : waiting(b, letGo);
    }
    if (own === null)
      return bare.add(key), b;
    const prior = last.comes.get(key);
    const isNewKind = !isAtOnce && was !== undefined && isOtherLine(was, own);
    const come = letGo ? { at: now, isAgain: true, isSwapped: true } : isNewKind ? { at: now, isAgain: true, isSwapped: false } : prior !== undefined && now < prior.at + LINE_COMES_MS ? prior : !isAtOnce && last.bare.has(key) ? { at: now, isAgain: false, isSwapped: false } : undefined;
    afterTitle.set(key, lineOf(own, come?.at, come?.isAgain === true));
    if (come === undefined)
      return b;
    comes.set(key, come);
    return comingRow(b, { cameAt: come.at, isAgain: come.isAgain, isSwapped: come.isSwapped });
  };
  const shown = blocks.map((b) => {
    if (b.kind !== "row")
      return b;
    const key = heldKey(b);
    const f = b.feedback;
    const source = f?.source ?? null;
    const isUnderWay = isPressUnderWay(source);
    if (!hasActions(b)) {
      const held = last.held.get(key);
      if (held !== undefined && isUnderWay)
        next.set(key, held);
      return bareRow(b, key);
    }
    const isUnder = isStatusUnder(b);
    const ownStatus = f !== null && !isUnder ? f : null;
    const wasAfter = last.afterTitle.get(key);
    const goingAfter = last.goes.get(key);
    const held = last.held.get(key);
    const kept = held !== undefined ? held : !isAtOnce && wasAfter !== undefined && ownStatus === null ? lettingGo(wasAfter, now) : isLetGo(goingAfter, now) ? goingAfter : undefined;
    const isStarting = kept === undefined && f !== null && isUnder && (isUnderWay || source?.is === "queued");
    if (kept === null || isStarting) {
      next.set(key, null);
      lineless.add(key);
      return kept === null && f !== null && !isUnder ? { ...b, isStatusHeldUnder: true } : b;
    }
    const isOtherKind = ownStatus !== null && kept?.leftAt === null && isOtherLine(kept.line, ownStatus);
    const letGo = isEased && isOtherKind && !kept.isHidden ? lettingGo(kept.line, now) : kept;
    if (ownStatus !== null && isEased && isFadingOut(letGo, now)) {
      next.set(key, letGo);
      return waiting(b, letGo);
    }
    const isAfterLeave = ownStatus !== null && isEased && isLetGo(kept, now);
    const isNewLine = kept === undefined && !isAtOnce && last.lineless.has(key);
    const isDrawn = kept?.leftAt === null;
    const isNewKind = !isAtOnce && isDrawn && isOtherKind;
    const isComeAgain = isNewKind || isAfterLeave;
    const isKeptComing = isDrawn && !isNewLine && !isComeAgain;
    const cameAt = isNewLine || isComeAgain ? now : isDrawn ? kept.line.cameAt : undefined;
    const isAgain = isComeAgain || isKeptComing && kept.line.isAgain === true;
    const isSwapped = isAfterLeave || isKeptComing && kept.line.isSwapped === true;
    const own = ownStatus !== null ? lineOf(ownStatus, cameAt, isAgain, isSwapped) : null;
    const isOwnFailure = f !== null && isFailure(f.source);
    const step = stepHeldLine(kept, { own, isOwnFailure, isUnder: f !== null && isUnder, isPressUnderWay: isUnderWay }, now, HELD_LEAVE_MS);
    if (step.kept)
      next.set(key, step.kept);
    const d = step.drawn;
    if (!d && !own)
      lineless.add(key);
    if (!d)
      return own && isComing(own, now) ? comingRow(b, own) : b;
    return { ...b, heldLine: heldLineOf(d, now) };
  });
  const withAdded = addLines(shown, last, now, isAtOnce);
  const ends = [...next.values()].flatMap((k) => isComing(k?.line, now) ? [k.line.cameAt + NEXT_FRAME_MS, k.line.cameAt + LINE_COMES_MS].filter((at) => at > now) : leaveEnds(k, now));
  for (const { at } of comes.values())
    ends.push(...[at + NEXT_FRAME_MS, at + LINE_COMES_MS].filter((t) => t > now));
  for (const k of goes.values())
    ends.push(...leaveEnds(k, now));
  ends.push(...withAdded.ends);
  const held = { held: next, lineless, bare, comes, afterTitle, goes, bodies: withAdded.bodies, added: withAdded.added };
  return { blocks: withAdded.blocks, held, nextAt: ends.length === 0 ? null : Math.min(...ends) };
}
function leaveEnds(k, now) {
  const end = heldLineEndsAt(k, HELD_LEAVE_MS);
  return end === null || k?.leftAt == null ? [] : [k.leftAt + NEXT_FRAME_MS, k.leftAt + HOLD_MS, end].filter((at) => at > now);
}
var isHeldLineShutting = (r, now) => r.heldLine?.leftAt !== undefined && now >= r.heldLine.leftAt + HOLD_MS;
var heldLineDrop = (r, now, heights) => isHeldLineShutting(r, now) ? heights.get(aboveId(r.id)) ?? 0 : 0;
function lineRise(r, now, heights) {
  if (r.lineCameAt === undefined || now === r.lineCameAt)
    return 0;
  const rise = (heights.get(aboveLineId(r.id)) ?? 0) - (heights.get(aboveId(r.id)) ?? 0);
  return r.isLineAgain ? rise : Math.max(0, rise);
}
var addedRise = (r, now, heights) => r.addedLines === undefined || now === r.addedLines.cameAt ? 0 : Math.max(0, (heights.get(addedLinesId(r.id)) ?? 0) - (heights.get(addedId(r.id)) ?? 0));

// src/held-drawn.ts
function heldAsDrawn(held, last, moved) {
  const given = new Map(held.blocks.map((b) => [b.id, b]));
  const isClosingHeld = (m) => m !== undefined && m.closing !== null && !m.isPanelLeftOut;
  const isKept = (b) => given.get(b.id) !== b || isClosingHeld(moved.motion.get(b.id));
  const keys = moved.blocks.flatMap((b) => b.kind === "row" && given.has(b.id) && isKept(b) ? [b.id, `settled ${b.id}`] : []);
  if (keys.length === 0)
    return held.held;
  const now = held.held;
  const pick = (to, from) => {
    const out = new Map(to);
    for (const k of keys) {
      const v = from.get(k);
      if (v === undefined)
        out.delete(k);
      else
        out.set(k, v);
    }
    return out;
  };
  const pickSet = (to, from) => {
    const out = new Set(to);
    for (const k of keys)
      if (from.has(k))
        out.add(k);
      else
        out.delete(k);
    return out;
  };
  return {
    held: pick(now.held, last.held),
    lineless: pickSet(now.lineless, last.lineless),
    bare: pickSet(now.bare, last.bare),
    comes: pick(now.comes, last.comes),
    afterTitle: pick(now.afterTitle, last.afterTitle),
    goes: pick(now.goes, last.goes),
    bodies: pick(now.bodies, last.bodies),
    added: pick(now.added, last.added)
  };
}

// ../core/view/layout.ts
var SPACE_UNIT = 4;
var LINE_PT = 5 * SPACE_UNIT;
var INSIDE_GAP_PT = 0;
var LIST_GAP_PT = SPACE_UNIT;
var ITEM_GAP_PT = 3 * SPACE_UNIT;
var CHILD_GAP_PT = 2 * SPACE_UNIT;
var HEAD_GAP_PT = 2 * SPACE_UNIT;
var LIST_MARGIN_PT = SPACE_UNIT;
var CONTROL_GAP_PT = 2 * SPACE_UNIT;
var BUTTON_PAD_X_PT = 3 * SPACE_UNIT;
var BUTTON_BORDER_PT = 1;
var QUIET_BUTTON_GAP_PT = CONTROL_GAP_PT + 2 * (SPACE_UNIT + BUTTON_BORDER_PT);
var SECTION_GAP_PT = 6 * SPACE_UNIT;
var EDGE_PT = 4 * SPACE_UNIT;
var EMPTY_STATE_MAX_WIDTH_PT = 90 * SPACE_UNIT;
var MARK_PT = 6 * SPACE_UNIT;
var ROW_PAD_PT = ITEM_GAP_PT / 2;
var BANNER_PAD_Y_PT = CONTROL_GAP_PT;

// ../core/view/row-parts.ts
var SUPPORTING_PARTS = ["holdsUp", "context", "note", "reason"];
var isSupportingPart = (part) => SUPPORTING_PARTS.includes(part);
var GROUP_STEPS = { inside: INSIDE_GAP_PT, list: LIST_GAP_PT };
var BETWEEN_STEPS = { child: CHILD_GAP_PT, control: CONTROL_GAP_PT, item: ITEM_GAP_PT };
var STEP_PT = { ...GROUP_STEPS, ...BETWEEN_STEPS };
var TITLE_PARTS = ["title", "titleStatus"];
var gap = (step, rows = 0) => ({ step, rows });
var UNDER_TITLE = gap("inside");
var UNDER_TEXT = gap("control", 1);
var GAP_ABOVE = {
  titleStatus: () => UNDER_TITLE,
  holdsUp: () => UNDER_TITLE,
  context: (above) => TITLE_PARTS.includes(above) ? UNDER_TITLE : gap("child"),
  earlier: (above) => TITLE_PARTS.includes(above) ? UNDER_TITLE : gap("child"),
  detail: () => UNDER_TITLE,
  file: (above) => above === "detail" ? gap("list") : UNDER_TITLE,
  answer: (above) => TITLE_PARTS.includes(above) ? gap("control") : above === "answer" || above === "note" ? gap("item") : gap("child"),
  note: () => gap("list"),
  answers: (above) => TITLE_PARTS.includes(above) ? gap("control") : gap("child"),
  reason: () => gap("list"),
  status: () => UNDER_TEXT,
  buttons: (above) => above === "status" ? gap("list") : UNDER_TEXT,
  field: (above) => above === "status" ? gap("list") : UNDER_TEXT,
  result: () => gap("list"),
  copy: () => gap("control")
};
function partGap(above, below) {
  return GAP_ABOVE[below](above);
}
function partPt(above, below) {
  return STEP_PT[partGap(above, below).step];
}
var COLLAPSED_TITLE_LINES = 2;

// src/title-cut.ts
var CLIPPED_HEIGHT = COLLAPSED_TITLE_LINES * LINE_PT;
var CUT_ROOM = CLIPPED_HEIGHT + 0.5;
var LINE_ROOM = LINE_PT + 0.5;
var END_PUNCTUATION = /[^\p{L}\p{N}\s]+$/u;
var wholeId = (id) => `whole title ${id}`;
var cutId = (id, cut) => `title cut "${cut}" ${id}`;
var bareOf = (title) => title.replace(END_PUNCTUATION, "");
var bareId = (id, bare) => `bare title "${bare}" ${id}`;
function isBareMeasured(r, sizes) {
  const width = sizes.widthOf(wholeId(r.id));
  return width !== undefined && sizes.widthOf(bareId(r.id, bareOf(r.title))) === width;
}
function lastWordAt(title) {
  const lastSpace = title.lastIndexOf(" ");
  if (lastSpace > 0)
    return lastSpace + 1;
  const bare = bareOf(title);
  const chars = [...bare];
  const lastChar = chars[chars.length - 1] ?? "";
  return bare.length > lastChar.length ? bare.length - lastChar.length : -1;
}
function wrappedTitleOf(r, sizes) {
  const whole = sizes.get(wholeId(r.id));
  const bare = sizes.get(bareId(r.id, bareOf(r.title)));
  const at = lastWordAt(r.title);
  const isEndAlone = whole !== undefined && bare !== undefined && isBareMeasured(r, sizes) && whole > bare + 0.5 && at > 0;
  if (!isEndAlone)
    return r.title;
  const lineEnd = r.title[at - 1] === " " ? at - 1 : at;
  return `${r.title.slice(0, lineEnd)}
${r.title.slice(at)}`;
}
var isOneLineRow = (r) => r.settled !== null || r.depth === 1;
function isCutMeasured(r, sizes) {
  const width = sizes.widthOf(wholeId(r.id));
  return width !== undefined && wordCuts(r.title).every((cut) => sizes.widthOf(cutId(r.id, cut)) === width);
}
function cutTitleOf(r, sizes) {
  const whole = sizes.get(wholeId(r.id));
  if (whole !== undefined && whole <= CUT_ROOM)
    return { text: wrappedTitleOf(r, sizes), isOneLine: false, isClipped: false, height: whole };
  if (whole === undefined || !isCutMeasured(r, sizes))
    return {
      text: wrappedTitleOf(r, sizes),
      isOneLine: false,
      isClipped: true,
      height: whole === undefined ? undefined : CLIPPED_HEIGHT
    };
  const heightOf = (cut) => sizes.get(cutId(r.id, cut)) ?? Infinity;
  const head = cutAtWord(r.title, (cut) => heightOf(cut) <= CUT_ROOM);
  if (head === null)
    return { text: r.title, isOneLine: true, isClipped: false, height: LINE_PT };
  const height = heightOf(`${head}…`);
  const lineEnd = r.title.indexOf(" ", head.length);
  if (height <= LINE_PT + 0.5 && lineEnd > 0)
    return {
      text: r.title.slice(0, lineEnd),
      secondLine: r.title.slice(lineEnd + 1),
      isOneLine: false,
      isClipped: false,
      height: CLIPPED_HEIGHT
    };
  return { text: `${head}…`, isOneLine: false, isClipped: false, height };
}
function oneLineTitleOf(r, sizes) {
  const whole = sizes.get(wholeId(r.id));
  const isCutKnown = wordCuts(r.title).every((cut) => sizes.get(cutId(r.id, cut)) !== undefined);
  const isCut = whole !== undefined && whole > LINE_ROOM && isCutKnown;
  const head = isCut ? cutAtWord(r.title, (cut) => (sizes.get(cutId(r.id, cut)) ?? Infinity) <= LINE_ROOM) : null;
  return { text: head === null ? r.title : `${head}…`, isOneLine: true, isClipped: false, height: LINE_PT };
}
function shortTitleOf(r, fromShown, sizes) {
  const isOneLine = isOneLineRow(r) || fromShown !== null && isOneLineRow(fromShown);
  return isOneLine ? oneLineTitleOf(r, sizes) : cutTitleOf(r, sizes);
}
var fromShownOf = (s) => s !== null && s.inAt === null ? s.from : null;
function titleRestOf(b, swap, sizes) {
  if (b?.kind !== "row")
    return null;
  const short = shortTitleOf(b, fromShownOf(swap), sizes);
  return { isOpen: isOpenRow(b), isOneLine: short.isOneLine, height: short.height ?? LINE_PT };
}
function titleCopiesOf(r, sizes) {
  const whole = sizes.get(wholeId(r.id));
  const mayWrap = whole === undefined || whole > LINE_ROOM;
  const bare = bareOf(r.title);
  const isBareDrawn = mayWrap && bare !== r.title && !isBareMeasured(r, sizes);
  const bareCopy = isBareDrawn ? [{ key: bareId(r.id, bare), text: bare }] : [];
  const isCutDrawn = whole !== undefined && whole > LINE_ROOM && !isCutMeasured(r, sizes);
  const cuts = isCutDrawn ? wordCuts(r.title).map((cut) => ({ key: cutId(r.id, cut), text: cut })) : [];
  return [{ key: wholeId(r.id), text: r.title }, ...bareCopy, ...cuts];
}

// src/panel-steps.ts
var spaceNow = (s, now) => springStep(s.box, s.to, now - s.at);
var isGrowingFrom = (rest, space) => rest !== null && space.to > rest.to + HEIGHT_SPRING.epsilon;
function aimSpace(last, to, now) {
  if (last === null)
    return { box: { x: to, v: 0 }, at: now, to };
  return to === last.to ? last : { box: spaceNow(last, now), at: now, to };
}
function timed(now, from, fades) {
  let at = now;
  let opacity = from;
  return fades.map((step) => {
    const started = { ...step, at, from: opacity };
    at += Math.max(step.ms, NEXT_FRAME_MS);
    opacity = step.to;
    return started;
  });
}
function stepsFrom(now, space, height, opacity) {
  return timed(now, opacity, turnBackFades(height, space ? spaceNow(space, now) : { x: height, v: 0 }));
}
var faintCloseSteps = (now, steps) => {
  const opacity = opacityAt(steps, now);
  return timed(now, opacity, faintCloseFades(opacity));
};
function easeOut(x) {
  const at = (t, control) => 3 * (1 - t) * t * t * control + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0;i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, 0.58) < x)
      lo = mid;
    else
      hi = mid;
  }
  return at((lo + hi) / 2, 1);
}
function opacityAt(steps, now) {
  const step = steps.findLast((s) => s.at <= now) ?? steps[0];
  if (!step)
    return 0;
  const share = step.ms > 0 ? Math.min(1, Math.max(0, (now - step.at) / step.ms)) : 1;
  return step.from + (step.to - step.from) * easeOut(share);
}
function panelOf(state, isStart, last, closing) {
  const isLeftPanelShown = last?.swap?.inAt === null && isOpenRow(last.swap.from);
  const wasPanelFolding = last?.track.state === "opening" || last?.track.state === "closing" && last.opened !== null || isLeftPanelShown;
  const isFrom = isStart && !wasPanelFolding;
  if (state === "opening")
    return isFrom ? 0 : 1;
  if (state === "closing" && closing)
    return isFrom ? 1 : 0;
  return null;
}

// src/title-motion.ts
var AT_ONCE = { delayMs: 0, ms: 0 };
var isAbove = (height, low) => height !== undefined && height > low + 0.5;
var boxNow = (g, now) => springStep(g.box, g.boxTo, now - g.boxAt);
function aimed(g, to, now) {
  if (to === g.boxTo && (g.swapsAt !== null || !g.isTaller))
    return g;
  const box = boxNow(g, now);
  const restsAt = now + titleSwapMs(to, box);
  const swapsAt = !g.isTaller ? g.swapsAt : isAbove(to, g.low) ? restsAt : null;
  const fadesUntil = g.isTaller ? restsAt + ENTER_FADE_MS : restsAt;
  return { ...g, box, boxAt: now, boxTo: to, swapsAt, endsAt: Math.max(g.endsAt, fadesUntil + FRAME_MS) };
}
function growing({ live, tallForm, low, to, now }, from) {
  const box = live ? boxNow(live, now) : { x: from, v: 0 };
  const endsAt = now + 2 * FRAME_MS + HEIGHT_SETTLE_MS;
  return aimed({
    isTaller: true,
    tallForm,
    low,
    isFaded: true,
    since: now,
    swapsAt: null,
    box,
    boxAt: now,
    boxTo: live?.boxTo ?? from,
    endsAt
  }, to, now);
}
function shrinking({ live, tallForm, low, to, now }, height, heldMs) {
  const box = live ? boxNow(live, now) : { x: height, v: 0 };
  const endsAt = now + HEIGHT_SETTLE_MS + FRAME_MS;
  const isFaded = heldMs >= LEAVE_FADE_MS;
  const swapsAt = isFaded ? now + FRAME_MS : now;
  return aimed({
    isTaller: false,
    tallForm,
    low,
    isFaded,
    since: now,
    swapsAt,
    box,
    boxAt: now,
    boxTo: live?.boxTo ?? height,
    endsAt
  }, to, now);
}
function stepTitle(last, was, is, now, height, heldMs = 0) {
  if (is === null)
    return null;
  const live = last !== null && now < last.endsAt ? last : null;
  const rest = is.height;
  const to = (is.isOpen || heldMs > 0) && isAbove(height, rest) ? height : rest;
  const wasOpen = was?.isOpen ?? false;
  const whole = { live, tallForm: "whole", low: rest, to, now };
  const from = was?.height ?? rest;
  if (is.isOpen && !wasOpen)
    return growing({ ...whole, low: Math.min(from, live?.low ?? from) }, from);
  if (!is.isOpen && wasOpen)
    return isAbove(height, rest) ? shrinking(whole, height, heldMs) : null;
  const cut = { live, tallForm: "cut", low: LINE_PT, to, now };
  const isLineChange = !is.isOpen && was !== null && was.isOneLine !== is.isOneLine;
  if (isLineChange && !is.isOneLine)
    return isAbove(rest, LINE_PT) ? growing(cut, LINE_PT) : null;
  if (isLineChange)
    return isAbove(height, LINE_PT) ? shrinking(cut, height, heldMs) : null;
  if (!live)
    return null;
  if (live.isTaller && live.swapsAt === null && now !== live.since && !isAbove(height, live.low))
    return null;
  return aimed(live, to, now);
}
function titleMotion(g, now) {
  if (g === null)
    return null;
  const hasSwapped = g.swapsAt !== null && now >= g.swapsAt;
  const fades = g.isFaded ? titleFades(g.isTaller) : { taken: AT_ONCE, left: AT_ONCE };
  return {
    tallForm: g.tallForm,
    isShortOneLine: !isAbove(g.low, LINE_PT),
    isTallShown: g.isTaller === hasSwapped,
    tall: g.isTaller ? fades.taken : fades.left,
    short: g.isTaller ? fades.left : fades.taken
  };
}
var titleTimes = (g) => g === null ? [] : [g.swapsAt ?? 0, g.endsAt];

// src/under-line.ts
var LEAVE_ENDS_MS = NEXT_FRAME_MS + LEAVE_FADE_MS;
var restsAfter = (u) => u.waitMs === undefined ? ROW_STATE_MS.entering : u.waitMs + ENTER_FADE_MS;
var lineOf2 = (b) => b.kind === "row" && isStatusUnder(b) ? b.feedback : null;
var stepUnder = (last, b, now, isInput = false, height) => stepLine(last, lineOf2(b), b.kind === "row" && isOpenRow(b) && !b.settled, now, isInput, (x, y) => statusKindOf(x) === statusKindOf(y), height);
function stepLine(last, line, isSameForm, now, isInput, isSameLine = () => true, height) {
  const isReplaced = last !== null && line !== null && !isSameLine(last.line, line) && isSameForm && !isInput;
  if (last?.next !== undefined || isReplaced && (last.isLeaving || isShown(last, now, height)))
    return replaced(last, line, isSameForm, now, isInput, isSameLine);
  if (line && last?.isLeaving)
    return cameBack(line, now, isInput);
  if (!line)
    return leaving(last, isSameForm, now, isInput);
  if (!last)
    return { line, since: now, isLeaving: false, isInput };
  if (isSameLine(last.line, line))
    return { ...last, line };
  const waitMs = last.waitMs === undefined ? 0 : last.since + last.waitMs - now;
  const isEntering = now < last.since + restsAfter(last);
  return {
    line,
    since: now,
    isLeaving: false,
    isInput: isInput || isEntering && last.isInput,
    ...isEntering && waitMs > 0 ? { waitMs } : {}
  };
}
function isShown(u, now, height) {
  const fadedInAt = u.waitMs === undefined && height !== undefined ? u.since + NEXT_FRAME_MS + enterDelayMs(height) + ENTER_FADE_MS : u.since + restsAfter(u);
  return u.isBack === true || now >= Math.min(fadedInAt, u.since + restsAfter(u));
}
function replaced(last, line, isSameForm, now, isInput, isSameLine) {
  const { next: _, ...old } = last;
  if (!line)
    return leaving(old, isSameForm, now, isInput);
  if (isSameLine(old.line, line))
    return old.isLeaving ? cameBack(line, now, isInput) : { ...old, line };
  if (isInput || !isSameForm)
    return { line, since: now, isLeaving: false, isInput };
  if (!old.isLeaving)
    return { ...old, since: now, isLeaving: true, next: line };
  if (now < old.since + LEAVE_ENDS_MS)
    return { ...old, next: line };
  return { line, since: now, isLeaving: false, isInput: false, waitMs: NEXT_FRAME_MS };
}
var cameBack = (line, now, isInput) => isInput ? { line, since: now, isLeaving: false, isInput, waitMs: NEXT_FRAME_MS } : { line, since: now, isLeaving: false, isInput, isBack: true };
function leaving(last, isSameForm, now, isInput) {
  if (!last || !isSameForm || isInput)
    return null;
  if (!last.isLeaving)
    return { ...last, since: now, isLeaving: true };
  return now < last.since + LEAVE_ENDS_MS ? last : null;
}
function underMotion(u, now, height) {
  if (!u)
    return null;
  const isStart = now === u.since;
  const at = (opacity, fadeMs, delayMs, isNew = false) => ({
    line: u.line,
    opacity,
    fadeMs,
    delayMs,
    isNew
  });
  if (u.isLeaving)
    return at(isStart ? 1 : 0, LEAVE_FADE_MS, 0);
  if (now >= u.since + restsAfter(u))
    return at(null, 0, 0);
  if (u.isBack)
    return at(1, ENTER_FADE_MS, 0);
  if (isStart)
    return at(u.isInput ? FAINT_OPACITY : 0, 0, 0, u.waitMs === undefined);
  const delayMs = u.waitMs === undefined ? enterDelayMs(height ?? 0) : Math.max(0, u.since + u.waitMs - now);
  return at(1, ENTER_FADE_MS, delayMs);
}
function underPushMs(last, b, space) {
  if (!last || b.kind !== "row" || last.block.kind !== "row")
    return null;
  if (isGrowingFrom(last.restSpace, space))
    return enterDelayMs(space.to, space.box);
  return b.field !== null && last.block.field === null ? HEIGHT_SETTLE_MS - ENTER_FADE_MS : null;
}
function pushUnder(u, waitMs, now) {
  if (!u || u.isLeaving || waitMs === null)
    return u;
  const isHidden = now < u.since + restsAfter(u) && !u.isInput && !u.isBack;
  return { line: u.line, since: now, isLeaving: false, isInput: !isHidden, waitMs };
}
var underTimes = (u) => !u ? [] : u.isLeaving ? [u.since + NEXT_FRAME_MS, u.since + LEAVE_ENDS_MS] : [u.since + NEXT_FRAME_MS, u.since + restsAfter(u)];
var underId = (id) => `status ${id}`;

// src/moved-blocks.ts
function longestRun(at) {
  const tails = [];
  const before = [];
  at.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if ((at[tails[mid]] ?? 0) < value)
        lo = mid + 1;
      else
        hi = mid;
    }
    before[i] = lo > 0 ? tails[lo - 1] ?? -1 : -1;
    tails[lo] = i;
  });
  const run = new Set;
  for (let i = tails.at(-1) ?? -1;i >= 0; i = before[i] ?? -1)
    run.add(i);
  return run;
}
function movedOf(blocks, was) {
  const drawnAt = new Map(was.order.map((id, i) => [id, i]));
  const kept = blocks.filter((b) => was.rows.get(b.id) !== undefined && was.rows.get(b.id)?.track.state !== "leaving");
  const at = kept.map((b) => drawnAt.get(b.id) ?? 0);
  if (at.every((x, i) => i === 0 || (at[i - 1] ?? 0) < x))
    return new Set;
  const stays = longestRun(at);
  return new Set(kept.filter((_, i) => !stays.has(i)).map((b) => b.id));
}

// src/pr-status.ts
var lineOf3 = (b) => b.kind === "pr" && (b.status !== null || b.unlisted.length > 0) ? { status: b.status, unlisted: b.unlisted } : null;
function stepPrLine(last, line, b, now, isFirst, isInput, isSameLine) {
  if (isFirst)
    return line && { line, since: -Infinity, isLeaving: false, isInput: false };
  return stepLine(last, line, b.kind === "pr", now, isInput, isSameLine);
}
var isSameResult = (a, b) => a.tone === b.tone;
var stepPrStatus = (last, b, now, isFirst) => stepPrLine(last, lineOf3(b), b, now, isFirst, false);
function stepPrTail(last, b, now, isFirst, isInput) {
  const pr = b.kind === "pr" ? b : null;
  const buttons = pr && pr.buttons.length > 0 ? pr.buttons : null;
  return {
    error: stepPrLine(last?.error ?? null, pr?.error ?? null, b, now, isFirst, isInput),
    buttons: stepPrLine(last?.buttons ?? null, buttons, b, now, isFirst, false),
    result: stepPrLine(last?.result ?? null, pr?.feedback ?? null, b, now, isFirst, isInput, isSameResult)
  };
}
var prTailId = (part, id) => `status ${part} ${id}`;
var PR_TAIL_PARTS = ["error", "buttons", "result"];
var prTailMotion = (t, id, now, heightOf) => ({
  error: underMotion(t.error, now, heightOf(prTailId("error", id))),
  buttons: underMotion(t.buttons, now, heightOf(prTailId("buttons", id))),
  result: underMotion(t.result, now, heightOf(prTailId("result", id)))
});
var prTailTimes = (t) => t ? [...underTimes(t.error), ...underTimes(t.buttons), ...underTimes(t.result)] : [];
function lineHeight(key, s, m, p) {
  if (!m || p.isAtOnce(key))
    return;
  return s === null || s.isNew ? 0 : p.heights.get(key) ?? 0;
}
var prStatusHeight = (b, m, p) => p.isNarrow ? undefined : lineHeight(underId(b.id), m?.status ?? null, m, p);
var prTailHeight = (b, part, m, p) => lineHeight(prTailId(part, b.id), m?.prTail?.[part] ?? null, m, p);

// src/form-swap.ts
var isSettledRow = (b) => b?.kind === "row" && b.settled !== null;
var linesShownOf = (s, now) => s.inWait === null ? 0 : easeOut(Math.min(1, Math.max(0, (now - s.inWait.from - s.inWait.ms) / ENTER_FADE_MS)));
var endsAt = (s) => s.inWait === null ? Infinity : s.inWait.from + s.inWait.ms + ENTER_FADE_MS;
var MEASURE_WAIT_MS = 100;
function panelShownOf(track, steps, height, now) {
  if (track.state !== "opening")
    return 1;
  if (steps)
    return opacityAt(steps, now);
  const fadesAt = track.since + NEXT_FRAME_MS + enterDelayMs(height);
  return easeOut(Math.min(1, Math.max(0, (now - fadesAt) / ENTER_FADE_MS)));
}
function stepSwap(last, was, b, now, panelShown = 1) {
  if (b.kind !== "row" || was?.kind !== "row")
    return null;
  const live = last !== null && now < endsAt(last) ? last : null;
  const isSettled = isSettledRow(b);
  if (isSettled === (live ? live.isSettled : isSettledRow(was)))
    return live;
  if (live?.inAt === null) {
    const isBack = isSettledRow(live.from) === isSettled && isOpenRow(live.from) === isOpenRow(b);
    if (isBack)
      return { ...live, isSettled, showsAt: now, inAt: now - NEXT_FRAME_MS, inWait: { from: now, ms: 0 } };
    return {
      ...live,
      isSettled,
      isMarkSwapped: live.isMarkSwapped || live.from.mark?.text !== b.mark?.text,
      isAgeSwapped: live.isAgeSwapped || live.from.age !== b.age
    };
  }
  const isMarkSwapped = was.mark?.text !== b.mark?.text;
  const isAgeSwapped = was.age !== b.age;
  const fromShown = live === null ? 1 : linesShownOf(live, now);
  const showsAt = now + NEXT_FRAME_MS + (fromShown > 0 ? LEAVE_FADE_MS : 0);
  const swap = {
    from: was,
    isSettled,
    isMarkSwapped,
    isAgeSwapped,
    since: now,
    showsAt,
    inAt: null,
    fromShown,
    panelShown
  };
  return { ...swap, restIn: undefined, inWait: null };
}
function takeSwap(s, drawn, now, rest) {
  const isTaken = s !== null && s.inAt === null && now >= s.showsAt && isSettledRow(drawn) === s.isSettled;
  return isTaken ? { ...s, inAt: now, restIn: rest } : s;
}
function waitSwap(s, space, rest, now) {
  if (s?.inAt === null || s?.inAt === undefined || s.inWait !== null || now < s.inAt + NEXT_FRAME_MS)
    return s;
  const isMeasured = rest !== s.restIn || now >= s.inAt + NEXT_FRAME_MS + MEASURE_WAIT_MS;
  if (!isMeasured)
    return s;
  return { ...s, inWait: { from: now, ms: enterDelayMs(space.to, spaceNow(space, now)) } };
}
var swapHoldsUntil = (s, now) => s === null ? 0 : (s.inAt ?? Math.max(s.showsAt, now)) + NEXT_FRAME_MS;
var swapWaitsUntil = (s) => s?.inAt === null ? s.showsAt + NEXT_FRAME_MS : 0;
function swapMotion(s, now) {
  if (s === null)
    return null;
  const { from, isMarkSwapped, isAgeSwapped } = s;
  if (s.inAt === null) {
    const panel = s.panelShown < 1 ? s.panelShown : null;
    return {
      from,
      isMarkSwapped,
      isAgeSwapped,
      opacity: now === s.since ? s.fromShown : 0,
      fadeMs: LEAVE_FADE_MS,
      panel
    };
  }
  const opacity = s.inWait !== null && now >= s.inWait.from + s.inWait.ms ? 1 : 0;
  return { from: null, isMarkSwapped, isAgeSwapped, opacity, fadeMs: ENTER_FADE_MS, panel: null };
}
var swapTimes = (s) => s === null ? [] : [
  s.since + NEXT_FRAME_MS,
  s.showsAt,
  ...s.inAt === null ? [] : [s.inAt + NEXT_FRAME_MS, s.inAt + NEXT_FRAME_MS + MEASURE_WAIT_MS],
  ...s.inWait === null ? [] : [s.inWait.from + s.inWait.ms, endsAt(s)]
];

// src/held-form.ts
function heldForm(b, was, motion) {
  const last = was.rows.get(b.id)?.block;
  const m = motion.get(b.id);
  const isSwappedIn = (m?.blockSwap?.formKey ?? null) !== null;
  const isHeld = last !== undefined && b.kind !== "row" && b.kind !== "empty" && m !== undefined && !isMoving(m.state) && !isSwappedIn;
  return isHeld && JSON.stringify(last) !== JSON.stringify(b) ? last : b;
}
function heldTabs(tabs, last, motion) {
  if (![...motion.values()].some((m) => m.isStart))
    return tabs;
  return tabs.map((t) => {
    const was = last.find((l) => l.id === t.id);
    return was ? { ...t, badge: was.badge } : t;
  });
}

// src/warning-line.ts
var warningOf2 = (b) => b.kind === "row" || b.kind === "pr" || b.kind === "line" ? b.warning ?? null : null;
var keepsForm = (b) => b.kind === "row" ? isOpenRow(b) && !b.settled : b.kind === "pr" || b.kind === "line";
function stepWarning(last, was, b, now, isFirst, isInput) {
  const line = warningOf2(b);
  const isNewForm = was === undefined || b.kind === "row" && !(was.kind === "row" && isOpenRow(was));
  if (line !== null && (isFirst || isNewForm))
    return { line, since: -Infinity, isLeaving: false, isInput: false };
  return stepLine(last, line, keepsForm(b), now, isInput);
}
var warningId = (id) => `warning ${id}`;
var warningBoxId = (id) => `warning box ${id}`;
var isWarningAtRest = (b, m) => b.kind === "row" && (m?.closing ?? m?.swap?.from ?? b) !== b;
var warningHeight = (id, m, p, isAtRest) => isAtRest || m?.warning?.opacity === null ? undefined : lineHeight(warningId(id), m?.warning ?? null, m, p);
function warningRise(b, m, p) {
  const isDrawn = b.kind === "pr" || b.kind === "line" || b.kind === "row" && isOpenRow(b) && !b.settled;
  const to = isDrawn ? warningHeight(b.id, m, p, isWarningAtRest(b, m)) : undefined;
  return to === undefined ? 0 : to - (p.heights.get(warningBoxId(b.id)) ?? 0);
}

// src/field-wait.ts
var MAX_WAIT_MS = HEIGHT_SETTLE_MS - ENTER_FADE_MS;
function stepFieldWait(last, b, space, now) {
  if (b.kind !== "row" || !last)
    return null;
  const wait = last.fieldWait;
  if (b.field === null)
    return wait === null || wait.goneShown !== null ? wait : goneWait(wait, now);
  if (last.block.kind !== "row" || last.block.field === null)
    return { since: now, waitMs: null, goneShown: null };
  if (wait === null || wait.waitMs !== null)
    return wait;
  return isGrowingFrom(last.restSpace, space) ? { ...wait, waitMs: now - wait.since + enterDelayMs(space.to, space.box) } : wait;
}
function goneWait(w, now) {
  const opening = fieldOpening(w, now);
  return opening === null ? null : { ...w, goneShown: opening.isOpen && opening.delayMs === 0 };
}
function fieldOpening(w, now) {
  if (w === null)
    return null;
  if (w.goneShown !== null)
    return { isOpen: w.goneShown, delayMs: 0 };
  const fadesAt = w.since + (w.waitMs ?? MAX_WAIT_MS);
  if (now >= fadesAt + ENTER_FADE_MS)
    return null;
  const isOpen = now > w.since && (w.waitMs !== null || now >= fadesAt);
  return { isOpen, delayMs: Math.max(0, fadesAt - now) };
}
var fieldTimes = (w) => w === null || w.goneShown !== null ? [] : [w.since + NEXT_FRAME_MS, w.since + (w.waitMs ?? MAX_WAIT_MS) + ENTER_FADE_MS, w.since + MAX_WAIT_MS];

// src/tracks.ts
var NO_TRACKS = { rows: new Map, order: [], holdsUntil: 0, drawnAt: 0 };

// src/block-swap.ts
var PART_KEYS = {
  mark: (s) => s.mark ? `${s.mark.text} ${s.mark.tone}` : "",
  name: (s) => `${s.name} ${s.nameTone ?? ""}`,
  under: (s) => s.under.map((l) => l.text).join(`
`),
  buttons: (s) => s.buttons.map((b) => b.label).join(`
`)
};
var STATUS_PARTS = Object.keys(PART_KEYS);
var changedParts = (was, b) => STATUS_PARTS.filter((part) => PART_KEYS[part](was) !== PART_KEYS[part](b));
var endsAt2 = (s) => (s.inAt ?? Infinity) + NEXT_FRAME_MS + HEIGHT_SETTLE_MS + ENTER_FADE_MS;
var wordsOf = (b) => b.kind === "note" ? b.text : b.kind === "line" ? `${b.text ?? ""}
${b.under ?? ""}` : null;
function partsOf(was, b) {
  if (was.kind !== b.kind)
    return null;
  if (was.kind === "status" && b.kind === "status")
    return changedParts(was, b);
  return wordsOf(was) !== wordsOf(b) ? null : [];
}
var isFormOf = (s, b) => partsOf(s.from, b)?.length === 0;
var isOtherForm = (was, b) => partsOf(was, b)?.length !== 0;
var isWholeInPlace = (was, b) => was.kind === b.kind && partsOf(was, b) === null;
function startSwap(was, b, parts, now, isInput, height) {
  const isAdded = was.kind === "status" && parts !== null && parts.every((part) => PART_KEYS[part](was) === "");
  return {
    from: was,
    to: b,
    parts,
    since: now,
    outUntil: now + NEXT_FRAME_MS + LEAVE_FADE_MS,
    inAt: isAdded || isInput ? now : null,
    isBack: false,
    isInput,
    fromHeight: height
  };
}
function stepBlockSwap(last, was, b, now, isBoxAtRest, isInput, height) {
  const live = last !== null && now < endsAt2(last) ? last : null;
  if (live?.inAt === null) {
    if (isFormOf(live, b))
      return { ...live, to: b, inAt: now, isBack: true };
    if (isInput && isOtherForm(live.to, b)) {
      return isWholeInPlace(live.from, b) ? startSwap(live.from, b, null, now, true, live.fromHeight) : null;
    }
    const more = live.from.kind === "status" && b.kind === "status" ? changedParts(live.from, b) : null;
    const added = live.parts && more ? more.filter((part) => !live.parts?.includes(part)) : [];
    const parts = live.parts && more && [...live.parts, ...added];
    const outUntil = added.length > 0 ? Math.max(live.outUntil, now + LEAVE_FADE_MS) : live.outUntil;
    return { ...live, to: b, parts, outUntil, inAt: now >= outUntil ? now : null };
  }
  const parts = was === undefined ? [] : partsOf(was, b);
  if (was === undefined || !isBoxAtRest || parts?.length === 0)
    return live;
  if (isInput && !isWholeInPlace(was, b))
    return live;
  return startSwap(was, b, parts, now, isInput, height);
}
function withPartsOf(b, from, parts) {
  const held = (part) => parts.includes(part);
  return {
    ...b,
    mark: held("mark") ? from.mark : b.mark,
    name: held("name") ? from.name : b.name,
    nameTone: held("name") ? from.nameTone : b.nameTone,
    under: held("under") ? from.under : b.under,
    buttons: held("buttons") ? from.buttons : b.buttons
  };
}
function swapDrawn(s, b) {
  if (s === null || s.inAt !== null)
    return b;
  return s.parts !== null && s.from.kind === "status" && b.kind === "status" ? withPartsOf(b, s.from, s.parts) : s.from;
}
var formKeyOf = (s) => s.inAt !== null && s.parts === null && s.from.kind === s.to.kind ? `swapped ${s.to.id} ${s.since}` : null;
var blockSwapMotion = (s, now, height) => s && {
  from: s.from,
  formKey: formKeyOf(s),
  parts: s.parts,
  isOut: s.inAt === null,
  isFirst: s.since === now,
  isInput: s.isInput,
  fromHeight: s.fromHeight,
  inDelayMs: s.inAt === null || !s.isBack && now === s.inAt ? null : s.isBack ? 0 : enterDelayMs(height ?? 0, { x: s.fromHeight ?? height ?? 0, v: 0 })
};
var blockSwapTimes = (s) => s === null ? [] : s.inAt === null ? [s.since + NEXT_FRAME_MS, s.outUntil] : [s.inAt + NEXT_FRAME_MS, endsAt2(s)];
var swapPartFade = (m, inDelayMs) => m.isOut ? { opacity: m.isFirst ? 1 : 0, duration: LEAVE_FADE_MS, delay: 0 } : inDelayMs === null ? { opacity: m.isInput ? FAINT_OPACITY : 0, duration: 0, delay: 0 } : { opacity: 1, duration: ENTER_FADE_MS, delay: inDelayMs };

// src/heading-count.ts
var endsAt3 = (c) => c.leftAt + NEXT_FRAME_MS + LEAVE_FADE_MS;
function stepCountLeft(last, was, b, now) {
  if (b.kind !== "heading" || b.count !== null)
    return null;
  if (was?.kind === "heading" && was.count !== null)
    return { count: was.count, leftAt: now };
  return last !== null && now < endsAt3(last) ? last : null;
}
var countLeftTimes = (c) => c === null ? [] : [c.leftAt + NEXT_FRAME_MS, endsAt3(c)];

// src/motion.ts
var NO_IDS = new Set;
var targetOf = (b) => b.kind !== "row" ? "closed" : b.settled ? "settled" : isOpenRow(b) ? "open" : "closed";
var isReshaped = (was, b) => was.kind === "status" && b.kind === "status" && (was.depth !== b.depth || JSON.stringify([was.tree, was.path]) !== JSON.stringify([b.tree, b.path]));
var isFolding = (state) => state === "opening" || state === "closing";
function moveRows(blocks, last, now, isFirst, isInput = false, sizes = NO_SIZES, fetched = NO_IDS) {
  const heightOf = (key) => sizes.get(key);
  const isInputTo = (id) => isInput && !fetched.has(id);
  const was = isFirst ? NO_TRACKS : last;
  const wasDrawn = new Set(was.order);
  const moved = movedOf(blocks, was);
  const copies = new Map([...moved].map((id) => [id, copyIdOf(id, now)]));
  const isDrawn = new Set(blocks.map((b) => b.id));
  const isFieldBack = (id) => !wasDrawn.has(id) || was.rows.get(id)?.track.state === "leaving";
  const isFieldPressed = !isFirst && isInput && blocks.some((b) => b.kind === "field" && isFieldBack(b.id));
  const startsLeave = was.order.some((id) => {
    const old = was.rows.get(id);
    const holdsSpace = old !== undefined && old.track.state !== "leaving" && old.glide?.box !== "shut" && !isShownAtOnce(old.glide, now, heightOf(id));
    return holdsSpace && (copies.has(id) || !isDrawn.has(id));
  });
  const holdsUntil = startsLeave && !isFieldPressed ? now + HOLD_MS : was.holdsUntil;
  const isHolding = holdsUntil > now;
  const isPanelShown = (t, id) => {
    const height = heightOf(panelId(id)) ?? 0;
    if (height <= 0 || t.track.state !== "open" && t.track.state !== "opening")
      return false;
    const fadesAt = t.panelSteps ? t.track.since : t.track.since + NEXT_FRAME_MS + enterDelayMs(height);
    return t.track.state === "open" || now >= fadesAt && !isPanelFaint(t);
  };
  const isPanelFaint = (t) => t.track.state === "opening" && t.panelSteps !== null && now < (t.panelSteps.at(-1)?.at ?? now);
  const panelFadeWaitMs = (t) => t.track.state === "open" ? NEXT_FRAME_MS : 0;
  const panelHolds = new Map(blocks.flatMap((b) => {
    const old = was.rows.get(b.id);
    const isClosing = b.kind === "row" && !moved.has(b.id) && targetOf(b) === "closed";
    return old && isClosing && isPanelShown(old, b.id) ? [[b.id, now + panelFadeWaitMs(old) + LEAVE_FADE_MS]] : [];
  }));
  const swaps = new Map(blocks.map((b) => {
    const old = moved.has(b.id) ? undefined : was.rows.get(b.id);
    const shown = old ? panelShownOf(old.track, old.panelSteps, heightOf(panelId(b.id)) ?? 0, now) : 1;
    return [b.id, stepSwap(old?.swap ?? null, old?.block, b, now, shown)];
  }));
  const closeHoldsUntil = Math.max(0, ...[...swaps.values()].map(swapWaitsUntil), ...blocks.map((b) => {
    const old = was.rows.get(b.id);
    const isStillClosing = old !== undefined && targetOf(b) === "closed";
    return panelHolds.get(b.id) ?? (isStillClosing ? old.panelHeldUntil : 0);
  }));
  const opensAfterClose = closeHoldsUntil - NEXT_FRAME_MS;
  const opensRow = blocks.some((b) => {
    const old = was.rows.get(b.id);
    return old !== undefined && targetOf(b) === "open" && targetOf(old.block) !== "open";
  });
  const waiting = new Map;
  const blockSwaps = new Map;
  const rows = new Map;
  const motion = new Map;
  const add = (block, track, last, springId = null) => {
    const isOpen = block.kind === "row" && isOpenRow(block);
    const opened = isOpen ? block : drawsPanel(track) && isMoving(track.state) ? last?.opened ?? null : null;
    const isStart = track.since === now && isMoving(track.state);
    const isPressed = block.kind === "field" && isInput;
    const glide = glideOf(track, isStart, last?.glide ?? null, now, Math.max(holdsUntil, closeHoldsUntil), isPressed, isFieldPressed, heightOf(block.id));
    const isReleased = isInputTo(block.id) && opensRow && track.state === "closing";
    const isInputMove = isStart ? isInputTo(block.id) : (last?.isInputMove ?? false) || isReleased;
    const status = stepPrStatus(last?.status ?? null, block, now, isFirst);
    const prTail = block.kind === "pr" ? stepPrTail(last?.prTail ?? null, block, now, isFirst, isInputTo(block.id)) : null;
    const warning = stepWarning(last?.warning ?? null, last?.block, block, now, isFirst, isInputTo(block.id));
    const isTurnedBack = isStart && track.state === "opening" && last?.track.state === "closing" && last.opened !== null;
    const panelHeight = heightOf(panelId(block.id));
    const lastSteps = last?.panelSteps ?? null;
    const isFaintClose = isStart && track.state === "closing" && last !== undefined && isPanelFaint(last);
    const panelSteps = track.state !== "opening" && track.state !== "closing" ? null : isTurnedBack ? stepsFrom(now, last?.panelSpace ?? null, panelHeight ?? 0, lastSteps ? opacityAt(lastSteps, now) : 0) : isFaintClose && lastSteps ? faintCloseSteps(now, lastSteps) : isStart ? null : lastSteps;
    const panelStep = panelSteps?.findLast((step) => step.at <= now) ?? null;
    const panelHeldUntil = track.state !== "closing" ? 0 : isStart ? panelHolds.get(block.id) ?? now : last?.panelHeldUntil ?? 0;
    const closing = track.state === "closing" && block.kind === "row" ? opened : null;
    const wasClosing = last?.track.state === "closing" && last.opened !== null && track.state === "closed";
    const isHeldForLeave = isHolding && track.since >= holdsUntil - HOLD_MS && !isInputMove;
    const rest = heightOf(restId(block.id));
    const swap = takeSwap(swaps.has(block.id) ? swaps.get(block.id) ?? null : stepSwap(last?.swap ?? null, last?.block, block, now), block, now, rest);
    const closeHeldUntil = closing === null ? 0 : Math.max(isHeldForLeave ? holdsUntil : 0, panelHeldUntil);
    const heldUntil = Math.max(closeHeldUntil, swapHoldsUntil(swap, now));
    const isHeld = heldUntil > now;
    const isLeftOut = closing !== null && !isHeld && (!isStart || isFolding(last?.track.state));
    const holdsPanel = drawsPanel(track) && !isLeftOut;
    const isPanelLeftOut = isLeftOut || wasClosing && block.kind === "row";
    const leftOut = isPanelLeftOut ? panelHeight ?? 0 : 0;
    const restSpace = aimSpace(last?.restSpace ?? null, (rest ?? 0) - leftOut, now);
    const under = pushUnder(stepUnder(last?.under ?? null, block, now, isInputTo(block.id), heightOf(underId(block.id))), underPushMs(last, block, restSpace), now);
    const waited = waitSwap(swap, restSpace, rest, now);
    const fieldWait = stepFieldWait(last, block, restSpace, now);
    const panelSpace = aimSpace(last?.panelSpace ?? null, holdsPanel ? panelHeight ?? last?.panelSpace?.to ?? 0 : 0, now);
    const title = block.kind === "row" && last ? stepTitle(last.title, titleRestOf(last.block, last.swap, sizes), titleRestOf(block, swap, sizes), now, heightOf(titleId(block.id)), Math.max(0, heldUntil - now)) : null;
    const countLeft = stepCountLeft(last?.countLeft ?? null, last?.block, block, now);
    rows.set(block.id, {
      track,
      block,
      opened,
      glide,
      title,
      springId,
      isInputMove,
      under,
      status,
      prTail,
      warning,
      panelSpace,
      panelSteps,
      panelHeldUntil,
      swap: waited,
      restSpace,
      fieldWait,
      blockSwap: blockSwaps.get(block.id) ?? null,
      countLeft
    });
    motion.set(block.id, {
      state: track.state,
      isStart,
      box: glide?.box ?? null,
      isShown: glide?.isShown ?? true,
      fadeMs: glide?.fadeMs ?? 0,
      waitsForSpace: glide?.waitsForSpace ?? false,
      shutForMs: glide?.shutForMs ?? null,
      panel: panelStep?.to ?? panelOf(track.state, isStart, last, closing),
      isPanelWaiting: track.state === "opening",
      panelFadeMs: panelStep?.ms ?? null,
      closing,
      isPanelLeftOut,
      title: titleMotion(title, now),
      isHeightHeld: isHeld,
      springId,
      under: underMotion(under, now, heightOf(underId(block.id))),
      status: underMotion(status, now, heightOf(underId(block.id))),
      prTail: prTail && prTailMotion(prTail, block.id, now, heightOf),
      warning: underMotion(warning, now, heightOf(warningId(block.id))),
      former: last && last.block.kind !== block.kind ? last.block : null,
      blockSwap: blockSwapMotion(blockSwaps.get(block.id) ?? null, now, heightOf(block.id)),
      swap: swapMotion(waited, now),
      field: fieldOpening(fieldWait, now),
      countLeft
    });
  };
  for (const b of blocks) {
    const prior = was.rows.get(b.id);
    const isMovedOn = prior?.track.state === "entering" && prior.springId?.includes(MOVED_TO) === true;
    const isMoved = moved.has(b.id) && !isMovedOn;
    const old = isMoved ? undefined : prior;
    const isBoxAtRest = old !== undefined && (old.glide === null || now >= old.glide.endsAt);
    const blockSwap = isFirst ? null : stepBlockSwap(old?.blockSwap ?? null, old?.block, b, now, isBoxAtRest, isInputTo(b.id), heightOf(b.id));
    if (blockSwap)
      blockSwaps.set(b.id, blockSwap);
    const given = swapDrawn(blockSwap, b);
    const opens = old !== undefined && targetOf(b) === "open" && targetOf(old.block) !== "open";
    const waitsForLeave = opens && !isInputTo(b.id) && isHolding;
    const isTurningBack = old?.track.state === "closing" && old.swap?.inAt !== null;
    const waitsForClose = opens && old.block.kind === "row" && opensAfterClose > now && !isTurningBack;
    const waitsToReshape = old !== undefined && isHolding && isReshaped(old.block, b);
    const drawn = waitsForLeave || waitsToReshape ? old.block : waitsForClose ? { ...old.block, isSelected: true, isCollapsed: true } : given;
    if (waitsForLeave || waitsToReshape || waitsForClose || given !== b)
      waiting.set(b.id, drawn);
    const track = stepRow(old?.track, targetOf(drawn), now, isMoved || !isFirst && !wasDrawn.has(b.id));
    if (track)
      add(drawn, track, old, isMoved ? `${b.id}${MOVED_TO}${now}` : old?.springId ?? null);
  }
  const shown = blocks.map((b) => waiting.get(b.id) ?? b);
  was.order.forEach((id, i) => {
    const old = was.rows.get(id);
    const copyId = copies.get(id);
    if (!old || copyId === undefined && (isDrawn.has(id) || rows.has(id)))
      return;
    const isGliding = old.glide !== null && now < old.glide.endsAt;
    const track = stepRow(old.track, "gone", now) ?? (isGliding ? old.track : null);
    if (!track)
      return;
    const block = copyId === undefined ? old.block : { ...old.block, id: copyId };
    add(block, track, old, copyId === undefined ? old.springId : null);
    shown.splice(placeAfter(shown.map((b) => b.id), was.order.slice(0, i).map((above) => copies.get(above) ?? above)), 0, block);
  });
  const isStarting = [...motion.values()].some((m) => m.isStart);
  const drawn = isStarting ? shown.map((b) => heldForm(b, was, motion)) : shown;
  const ends = [...rows.values()].flatMap((t) => [
    ...isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : [],
    ...t.glide ? [t.glide.endsAt, t.glide.opensAt ?? 0, t.glide.shutAt ?? 0] : [],
    ...titleTimes(t.title),
    ...underTimes(t.under),
    ...underTimes(t.status),
    ...prTailTimes(t.prTail),
    ...underTimes(t.warning),
    ...swapTimes(t.swap),
    ...fieldTimes(t.fieldWait),
    ...blockSwapTimes(t.blockSwap),
    ...countLeftTimes(t.countLeft),
    holdsUntil,
    closeHoldsUntil,
    opensAfterClose,
    t.panelHeldUntil,
    ...(t.panelSteps ?? []).map((step) => step.at)
  ]).filter((at) => at > now);
  return {
    blocks: drawn,
    tracks: { rows, order: shown.map((b) => b.id), holdsUntil, drawnAt: now },
    motion,
    nextAt: ends.length ? Math.min(...ends) : null
  };
}

// src/time-left.ts
function timeLeftShare(runsOutAt, now) {
  return Math.min(1, Math.max(0, (runsOutAt - now) / SETTLED_MS));
}
var TIME_LEFT_STEP_MS = 250;
function timeLeftOf(b, drawn, now) {
  if (b.runsOutAt === undefined || b.isSpent)
    return null;
  const was = drawn.get(b.id);
  if (b.isOut)
    return { is: "paused", share: was?.is === "paused" ? was.share : timeLeftShare(b.runsOutAt, now) };
  return b.runsOutAt > now ? { is: "emptying" } : null;
}
var timedButtons = (blocks) => blocks.flatMap((b) => b.kind === "row" ? b.buttons : []).filter((b) => b.runsOutAt !== undefined);
function timeLeftDraws(blocks, drawn, now) {
  return new Map(timedButtons(blocks).flatMap((b) => {
    const left = timeLeftOf(b, drawn, now);
    return left ? [[b.id, left]] : [];
  }));
}
function timeLeftNextAt(blocks, now) {
  const timed = timedButtons(blocks);
  const leaves = timed.flatMap((b) => b.leftAt === undefined ? [] : [b.leftAt + NEXT_FRAME_MS, b.leftAt + HOLD_MS]);
  const running = timed.filter((b) => !b.isOut && !b.isSpent && (b.runsOutAt ?? 0) > now);
  const ends = [
    ...running.map((b) => Math.min(b.runsOutAt ?? 0, now + TIME_LEFT_STEP_MS)),
    ...leaves.filter((at) => at > now)
  ];
  return ends.length > 0 ? Math.min(...ends) : null;
}

// src/wake.ts
function nextDrawAt(now, moved, heldAt) {
  const isStarting = [...moved.motion.values()].some((m) => m.isStart);
  const wakeAt = [
    isStarting ? now + NEXT_FRAME_MS : null,
    moved.nextAt,
    timeLeftNextAt(moved.blocks, now),
    ...heldAt
  ].filter((at) => at !== null);
  return wakeAt.length === 0 ? null : Math.min(...wakeAt);
}

// src/held-fades.ts
class HeldFades {
  held = new Map;
  draw = 0;
  fade(name, opacity, ms, delayMs, now) {
    const next = nextHeld(this.held.get(name), { opacity, ms }, delayMs, now);
    this.held.set(name, { ...next, drawnIn: this.draw });
    return next.handed;
  }
  drew() {
    for (const [name, h] of this.held)
      if (h.drawnIn !== this.draw)
        this.held.delete(name);
    this.draw += 1;
    const starts = [...this.held.values()].flatMap((h) => h.waiting ? [h.waiting.at] : []);
    return starts.length === 0 ? null : Math.min(...starts);
  }
}
function nextHeld(was, to, delayMs, now) {
  if (!was)
    return { handed: to, waiting: null };
  if (to.opacity === was.handed.opacity)
    return { handed: was.handed, waiting: null };
  const waiting = was.waiting;
  if (waiting && to.opacity === waiting.opacity)
    return now >= waiting.at ? { handed: { opacity: waiting.opacity, ms: waiting.ms }, waiting: null } : was;
  if (delayMs <= 0)
    return { handed: to, waiting: null };
  return { handed: was.handed, waiting: { ...to, at: now + delayMs } };
}

// src/paint-blocks.ts
import { div as div18 } from "gpui-kit";
import { h_flex as h_flex11, v_flex as v_flex7 } from "gpui-base";

// ../core/view/tones.ts
var DARK_ORANGE = "#ffae42";
var DARK_TONES = {
  needsYou: DARK_ORANGE,
  issue: "#ff6b80",
  findings: "#cab0ff",
  tasks: "#b48cff",
  prs: "#8cc8c0",
  done: "#82c1ff",
  success: "#7ecd8f",
  opportunity: "#7ecd8f",
  working: "#ffffff",
  error: "#ffa3b0",
  errorMark: "#ff6b80",
  key: "#b1b9f9"
};
var LIGHT_ORANGE = "#844100";
var LIGHT_TONES = {
  needsYou: LIGHT_ORANGE,
  issue: "#a5293d",
  findings: "#7b00e8",
  tasks: "#6a14d9",
  prs: "#006363",
  done: "#0a54a0",
  success: "#25652f",
  opportunity: "#25652f",
  working: "#1a1a1a",
  error: "#a5293d",
  errorMark: "#a5293d",
  key: "#243bf5"
};
var THEME_BACKGROUND = { dark: "#1e1e1e", light: "#ffffff" };
var THEME_TEXT = { dark: "#ececec", light: "#1b1b1b" };
var MUTED_TEXT = { dark: "#bdbdbd", light: "#595959" };
function contrastRatio(a, b) {
  const luminance = (hex) => {
    const [r = 0, g = 0, bl = 0] = [0, 1, 2].map((i) => {
      const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
var FAINT_TEXT_CONTRAST = 3;
function faintOver(muted, under) {
  if (contrastRatio(muted, under) <= FAINT_TEXT_CONTRAST)
    return muted;
  let [weaker, stronger] = [0, 1];
  for (let step = 0;step < 16; step++) {
    const share = (weaker + stronger) / 2;
    if (contrastRatio(fadedOver(muted, under, share), under) >= FAINT_TEXT_CONTRAST)
      stronger = share;
    else
      weaker = share;
  }
  return fadedOver(muted, under, stronger);
}
function fadedOver(hex, under, share) {
  const channel = (c, i) => Number.parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(hex, i) * share + channel(under, i) * (1 - share)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
var SUPPORTING_TEXT_SHARE = 0.45;
var supportingOver = (muted, text) => fadedOver(text, muted, SUPPORTING_TEXT_SHARE);
var SUPPORTING_TEXT = {
  dark: supportingOver(MUTED_TEXT.dark, THEME_TEXT.dark),
  light: supportingOver(MUTED_TEXT.light, THEME_TEXT.light)
};
var FAINT_TEXT = {
  dark: faintOver(MUTED_TEXT.dark, THEME_BACKGROUND.dark),
  light: faintOver(MUTED_TEXT.light, THEME_BACKGROUND.light)
};

// src/paint-theme.ts
var TONE_COLORS = {
  issue: "ansi1",
  notice: "ansi4",
  warning: "ansi3",
  findings: "ansi5",
  prs: "ansi6",
  done: "done",
  success: "ansi2",
  opportunity: "ansi2",
  working: "foreground",
  error: "ansi1",
  muted: "muted"
};
var isLightTheme = (t) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(t.background.slice(at, at + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
};
var colorOf = (t, tone) => tone === "tasks" || tone === "needsYou" ? (isLightTheme(t) ? LIGHT_TONES : DARK_TONES)[tone] : t[tone === null ? "foreground" : TONE_COLORS[tone]];
function faintOf(t, under = t.background) {
  const page = flatten(under, t.background);
  return faintOver(flatten(t.muted, page), page);
}
function supportingOf(t, under = t.background) {
  const page = flatten(under, t.background);
  return supportingOver(flatten(t.muted, page), flatten(t.foreground, page));
}
var bodyTextColor = (t, l, under) => l.part && isSupportingPart(l.part) ? supportingOf(t, under) : colorOf(t, l.tone);
var tint = (c, share) => `${c.slice(0, 7)}${Math.round(share * 255).toString(16).padStart(2, "0")}`;
var TIME_LEFT_DARK_SHARE = 0.12;
var TIME_LEFT_LIGHT_SHARE = 0.2;
var timeLeftFillOf = (t) => tint(t.foreground, isLightTheme(t) ? TIME_LEFT_LIGHT_SHARE : TIME_LEFT_DARK_SHARE);
function flatten(c, under) {
  const alpha = c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
  return alpha === 1 ? c.slice(0, 7) : mixInto(c.slice(0, 7), under, alpha);
}
function mixInto(c, under, share) {
  const channel = (at) => Math.round(parseInt(c.slice(at, at + 2), 16) * share + parseInt(under.slice(at, at + 2), 16) * (1 - share));
  return `#${[1, 3, 5].map((at) => channel(at).toString(16).padStart(2, "0")).join("")}`;
}
var TEXT = 13;
var LINE_HEIGHT = LINE_PT;
var LINE = `${LINE_HEIGHT}px`;
var HEAD_TEXT = 15;
var HEAD_LINE = "24px";
var INSIDE_GAP = INSIDE_GAP_PT;
var LIST_GAP = LIST_GAP_PT;
var CHILD_GAP = CHILD_GAP_PT;
var ITEM_GAP = ITEM_GAP_PT;
var HEAD_GAP = HEAD_GAP_PT;
var LIST_MARGIN = LIST_MARGIN_PT;
var CONTROL_GAP = CONTROL_GAP_PT;
var SECTION_GAP = SECTION_GAP_PT;
var EDGE = EDGE_PT;
var SMALL_GAP = SPACE_UNIT;
var INSET = 3 * SPACE_UNIT;
var BUTTON_PAD_X = BUTTON_PAD_X_PT;
var BUTTON_LABEL_X = BUTTON_BORDER_PT + BUTTON_PAD_X;
var END_SPACE = 2 * EDGE;
var MARK_W = MARK_PT;
var TEXT_X = EDGE + MARK_W;
var NEST = MARK_W;
var NARROW_PANE = 280;
var BUTTON_H = 7 * SPACE_UNIT;
var BUTTON_PAD_Y = (BUTTON_H - LINE_HEIGHT) / 2 - BUTTON_BORDER_PT;
var BOX_RADIUS = 10;
var TAB_RADIUS = 6;
var HELP_INDENT = NEST;
var HELP_KEY_W = 32;
var HELP_COLUMN = HELP_KEY_W + CONTROL_GAP;
var HELP_ICON = 14;
var HELP_ICON_TEXT = 10;
var SEP = " · ";
var paneFit = (reported, zoom) => ({
  isNarrow: reported.paneWidth / zoom < NARROW_PANE,
  listRoom: reported.listHeight === null ? null : Math.max(0, reported.listHeight / zoom - EDGE - END_SPACE),
  rowTextRoom: Math.max(0, reported.paneWidth / zoom - TEXT_X - EDGE)
});
var onSize = (view, key, read) => (size, cx) => {
  const value = read(size);
  if (value === view[key])
    return;
  view[key] = value;
  cx.notify();
};

// src/paint-field.ts
import { div as div4 } from "gpui-kit";
import { Input, v_flex } from "gpui-base";

// src/paint-parts.ts
import { div as div3 } from "gpui-kit";
import { h_flex } from "gpui-base";

// src/paint-checkbox.ts
import { PathBuilder, div } from "gpui-kit";
var CHECKBOX_PX = 11;
var CHECK_PATH = PathBuilder.stroke(1.5).move_to("27%", "53%").line_to("43%", "69%").line_to("74%", "31%").build();
var checkboxEl = (color, isChecked = true) => div().relative().flex_none().w(CHECKBOX_PX).h(CHECKBOX_PX).border_1().border_color(color).rounded(3).when(isChecked, (e) => e.child(window.paint_path(CHECK_PATH, color).absolute().top(0).left(0).size(`${CHECKBOX_PX - 2}px`)));

// src/paint-timer.ts
import { div as div2 } from "gpui-kit";
var TIMED_W = 64;
var BORDER_PT = 1;
var FILL_W = TIMED_W - 2 * BORDER_PT;
var FILL_H = BUTTON_H - 2 * BORDER_PT;
function timeLeftEl(id, left, runsOutAt, now, t) {
  const cut = div2().id(`time left ${id}`).absolute().top(0).left(0).h(FILL_H).overflow_hidden().child(div2().w(FILL_W).h(FILL_H).rounded(FILL_H / 2).bg(timeLeftFillOf(t)));
  if (left.is === "paused")
    return cut.w(left.share * FILL_W);
  const step = Math.min(TIME_LEFT_STEP_MS, Math.max(0, runsOutAt - now));
  return cut.w(timeLeftShare(runsOutAt, now + step) * FILL_W).transition("width", { duration: step, easing: "linear" });
}

// src/paint-parts.ts
function buttonEl(b, p, isInert = false, canWrap = false) {
  const { t } = p;
  const isPill = b.emphasis !== "quiet";
  const runsOutAt = b.runsOutAt;
  const left = p.timeLeft.get(b.id);
  const isWrapping = canWrap && runsOutAt === undefined;
  const base = h_flex().id(b.isSpent ? `spent ${b.id}` : `button ${b.id}`).when(!isWrapping, (e) => e.flex_none().h(BUTTON_H)).when(isWrapping, (e) => e.flex_shrink_1().min_w(0).min_h(BUTTON_H).py(BUTTON_PAD_Y)).items_center().justify_center().accessibility_label(b.label).when(runsOutAt !== undefined, (e) => e.relative().w(TIMED_W).rounded(BUTTON_H / 2)).when(left !== undefined, (e) => left ? e.child(timeLeftEl(b.id, left, runsOutAt ?? 0, p.now, t)) : e).child(isWrapping ? div3().min_w(0).whitespace_normal().child(b.label) : b.label);
  const shaped = !isPill ? base : runsOutAt === undefined ? base.px(BUTTON_PAD_X).rounded(BUTTON_H / 2).border_1() : base.border_1();
  if (b.isSpent) {
    const spent = shaped.text_color(t.muted).opacity(SPENT_OPACITY).disabled(true);
    if (b.leftAt === undefined)
      return spent;
    const opacity = p.now < b.leftAt + NEXT_FRAME_MS ? SPENT_OPACITY : 0;
    return fadeEl(spent, `spent ${b.id}`, opacity, { duration: LEAVE_FADE_MS, delay: 0 }, p);
  }
  if (b.isOut)
    return shaped.border_color(CLEAR).text_color(t.muted).opacity(SPENT_OPACITY).disabled(true);
  const styled = b.emphasis === "primary" ? shaped.border_color(t.solid).bg(t.solid).text_color(t.solid_foreground) : b.emphasis === "normal" ? shaped.border_color(t.input).text_color(t.foreground) : shaped.text_color(t.muted);
  if (isInert)
    return styled;
  const live = b.emphasis === "primary" ? styled.hover((s) => s.opacity(0.85)).active((s) => s.opacity(0.7)) : b.emphasis === "normal" ? styled.hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)) : styled.hover((s) => s.text_color(t.foreground)).active((s) => s.text_color(t.foreground).opacity(0.7));
  return live.on_click((e, cx) => {
    cx.stop_propagation();
    p.press(b, cx, e.modifiers.alt);
  });
}
var CLEAR = "#00000000";
var SPENT_OPACITY = 0.5;
var buttonsEl = (buttons, p, indent, isInert = false, followsAnswers = false, above = CONTROL_GAP) => {
  const outdent = followsAnswers ? BUTTON_LABEL_X : 0;
  const followUps = buttons.filter((b) => b.isFollowUp);
  const others = buttons.filter((b) => !b.isFollowUp);
  return h_flex().flex_wrap().items_center().gap(CONTROL_GAP).pt(above).pl(indent - outdent).children(others.map((b) => buttonEl(b, p, isInert, true))).when(followUps.length > 0, (e) => e.child(h_flex().flex_wrap().items_center().ml(outdent).gap_x(CONTROL_GAP).gap_y(INSIDE_GAP).children(followUps.map((b) => buttonEl(b, p, isInert)))));
};
var markEl = (m, t, tint = null) => m?.text === NEEDS_YOU_MARKS.task.mark || m?.text === TASK_MARK.mark ? h_flex().w(MARK_W).h(LINE_HEIGHT).flex_none().items_center().child(checkboxEl(tint ?? (m.tone === null ? t.muted : colorOf(t, m.tone)), m.text === NEEDS_YOU_MARKS.task.mark)) : div3().w(MARK_W).flex_none().text_color(tint ?? (m === null || m.tone === null ? t.muted : colorOf(t, m.tone))).when(m?.isRunning === true, (e) => e.loop("opacity", { from: 1, to: 0.3, period: RUNNING_PULSE_MS })).child(m?.text ?? "");
var lineEl = (text, color, indent = MARK_W) => div3().pl(indent).pt(INSIDE_GAP).whitespace_normal().text_color(color).child(text);
function fadeEl(el, name, opacity, glide, p) {
  const handed = p.fades.fade(name, opacity, glide.duration, glide.delay, p.now);
  return el.opacity(handed.opacity).transition("opacity", { duration: handed.ms, easing: "ease-out" });
}

// src/paint-field.ts
function fieldEl(f, p, indent, isInert = false, opening = null) {
  const { t } = p;
  const state = p.input(f.rowId);
  const glide = { duration: ENTER_FADE_MS, delay: opening?.delayMs ?? 0 };
  const fieldKey = `text field ${f.rowId}`;
  const faded = (e) => opening === null ? e : fadeEl(e.id(fieldKey), fieldKey, opening.isOpen ? 1 : FAINT_OPACITY, glide, p);
  const input = state ? [
    faded(div4()).min_h(BUTTON_H).px(INSET).py(SMALL_GAP).rounded(BOX_RADIUS).border_1().border_color(t.input).child(Input.new(state).w_full())
  ] : [];
  const key = `buttons ${f.rowId}`;
  return v_flex().pl(indent).children(input).child(buttonsEl(f.buttons, p, 0, isInert).when(opening !== null, (e) => fadeEl(e.id(key), key, opening?.isOpen ? 1 : 0, glide, p)));
}

// src/paint-empty.ts
import { div as div7 } from "gpui-kit";
import { h_flex as h_flex2, v_flex as v_flex3 } from "gpui-base";

// src/paint-space.ts
import { div as div6 } from "gpui-kit";
import { v_flex as v_flex2 } from "gpui-base";

// src/paint-strokes.ts
import { div as div5 } from "gpui-kit";
var TREE_LINE_SHARE = 0.2;
var lineColor = (t, under = t.background) => mixInto(t.foreground, flatten(under, t.background), TREE_LINE_SHARE);
var PATH_X = EDGE + 4;
function lineEl2(id, c, top, height, t) {
  const el = div5().id(id).absolute().left(PATH_X + c.depth * NEST).top(top).w(1).border_l_1().border_color(lineColor(t));
  const sized = height === null ? el.bottom(0) : el.h(height);
  return c.isDashed ? sized.border_dashed() : sized;
}
var PATH = { depth: 0, isDashed: false };
var pathColumn = (line) => line === null ? [] : [{ depth: 0, isDashed: line === "to-next" }];
function runsIn(b) {
  const path = "path" in b ? b.path : undefined;
  const tree = "tree" in b ? b.tree ?? [] : [];
  const line = path === undefined ? null : path.is === "work" ? path.line : path.above;
  const columns = tree.filter((s) => s.is === "past" || s.is === "mid" || s.is === "last");
  return [...pathColumn(line), ...columns.map((s) => ({ depth: s.depth, isDashed: false }))];
}
function runsOn(b) {
  const path = "path" in b ? b.path : undefined;
  const tree = "tree" in b ? b.tree ?? [] : [];
  const line = path === undefined ? null : path.is === "work" ? path.line : path.below;
  const columns = tree.filter((s) => s.is === "down" || s.is === "past" || s.is === "mid");
  return [...pathColumn(line), ...columns.map((s) => ({ depth: s.depth, isDashed: false }))];
}
var depthOf = (b) => ("depth" in b) ? b.depth : 0;
function meetsAt(b, depth) {
  const tree = "tree" in b ? b.tree ?? [] : [];
  const isMilestone = "path" in b && b.path?.is === "milestone";
  return isMilestone && depth === 0 || tree.some((s) => s.depth === depth && s.is !== "past");
}
function passingOf(blocks, isShut) {
  const ins = blocks.map(runsIn);
  const ons = blocks.map(runsOn);
  const depths = [...new Set([...ins, ...ons].flat().map((c) => c.depth))];
  const out = [];
  const has = (cs, depth) => cs?.some((c) => c.depth === depth) === true;
  const isNearest = (j, depth) => {
    const b = blocks[j];
    if (!b || b.kind === "gap" || isShut(b))
      return false;
    return depthOf(b) <= depth || meetsAt(b, depth) || has(ins[j], depth) || has(ons[j], depth);
  };
  const indices = blocks.map((_, j) => j);
  for (const i of indices) {
    const above = (depth) => indices.slice(0, i).findLast((j) => isNearest(j, depth));
    const below = (depth) => indices.slice(i + 1).find((j) => isNearest(j, depth));
    out.push(depths.flatMap((depth) => {
      const from = above(depth);
      const into = below(depth);
      if (has(ons[i], depth) || from === undefined || into === undefined || !has(ins[into], depth))
        return [];
      const c = [...ons[from] ?? [], ...out[from] ?? []].find((o) => o.depth === depth);
      return c ? [c] : [];
    }));
  }
  return out;
}
var NO_FADE = (el) => el;
function strokeFadesOf(blocks, passing, moves, fades) {
  const depths = (cs, i) => new Set([...cs, ...passing[i] ?? []].map((c) => c.depth));
  const ins = blocks.map((b, i) => depths(runsIn(b), i));
  const ons = blocks.map((b, i) => depths(runsOn(b), i));
  const isPassed = (j, depth) => {
    const b = blocks[j];
    return b !== undefined && ins[j]?.has(depth) === true && ons[j]?.has(depth) === true && !meetsAt(b, depth);
  };
  const reach = (i, depth, by) => {
    let first = null;
    for (let j = i + by;j >= 0 && j < blocks.length; j += by) {
      const move = moves[j];
      if (move?.isGone)
        continue;
      if (!(by === 1 ? ins[j] : ons[j])?.has(depth))
        break;
      if (!move?.isMoving && !isPassed(j, depth))
        return { stays: true, first };
      if (!move?.isMoving)
        continue;
      first ??= j;
      if (!(by === 1 ? ons[j] : ins[j])?.has(depth))
        break;
    }
    return { stays: false, first };
  };
  return blocks.map((_, i) => {
    const own = fades[i] ?? NO_FADE;
    if (moves[i]?.isMoving) {
      const isThrough = (depth) => ins[i]?.has(depth) === true && ons[i]?.has(depth) === true && reach(i, depth, -1).stays && reach(i, depth, 1).stays;
      const side = (depth) => isThrough(depth) ? NO_FADE : own;
      return { own, above: side, below: side };
    }
    const endOf = (depth, by) => {
      const { stays, first } = reach(i, depth, by);
      return stays ? null : first;
    };
    const side = (by) => (depth) => {
      const end = isPassed(i, depth) ? endOf(depth, -1) ?? endOf(depth, 1) : endOf(depth, by);
      return end === null ? NO_FADE : fades[end] ?? NO_FADE;
    };
    return { own, above: side(-1), below: side(1) };
  });
}
function feedsOf(blocks, moves) {
  return blocks.map((b, i) => {
    if (moves[i]?.isMoving || moves[i]?.isGone)
      return [];
    const next = blocks.findIndex((_, j) => j > i && moves[j]?.isGone !== true);
    const below = blocks[next];
    if (!below || !moves[next]?.isMoving)
      return [];
    const depth = depthOf(b);
    const own = new Set(runsOn(b).map((c) => c.depth));
    return runsIn(below).filter((c) => c.depth === depth && !c.isDashed && !own.has(c.depth));
  });
}
var spaceColumnEl = (key, c, f, t) => f.above(c.depth)(lineEl2(`space column ${key} ${c.depth}`, c, 0, null, t));
function contentStrokeEls(key, b, top, t, f, passes, feeds) {
  const path = "path" in b ? b.path : undefined;
  const tree = "tree" in b ? b.tree ?? [] : [];
  const armAt = Math.round(top + LINE_HEIGHT / 2);
  const idOf = (name, part) => `stroke ${key} ${name} ${part}`;
  const upper = (c, name, height) => f.above(c.depth)(lineEl2(idOf(name, "top"), c, 0, height, t));
  const lower = (c, name, from) => f.below(c.depth)(lineEl2(idOf(name, "bottom"), c, from, null, t));
  const whole = (c, name) => {
    const isSplit = f.above(c.depth) !== f.below(c.depth);
    const abovePart = f.above(c.depth)(lineEl2(idOf(name, "top"), c, 0, isSplit ? armAt + 1 : null, t));
    const belowPart = f.below(c.depth)(lineEl2(idOf(name, "bottom"), c, armAt + 1, isSplit ? null : 0, t));
    return [abovePart, belowPart];
  };
  const below = (c, name) => lower(c, name, top + LINE_HEIGHT);
  const lacking = (part) => (part === "top" ? f.above(0) : f.below(0))(lineEl2(idOf("path", part), PATH, armAt + 1, 0, t));
  const pathEls = (side) => {
    if (side.is === "work") {
      const [line] = pathColumn(side.line);
      return line ? whole(line, "path") : [lacking("top"), lacking("bottom")];
    }
    const [above] = pathColumn(side.above);
    const [under] = pathColumn(side.below);
    return [above ? upper(above, "path", top) : lacking("top"), under ? below(under, "path") : lacking("bottom")];
  };
  const reaches = new Map;
  const reachOf = (c) => {
    const r = reaches.get(c.depth) ?? { isDashed: true, toEnd: false, toArm: false, lowerFrom: null };
    r.isDashed &&= c.isDashed;
    reaches.set(c.depth, r);
    return r;
  };
  const reachWhole = (c) => void (reachOf(c).toEnd = true);
  const reachBelow = (c) => {
    const r = reachOf(c);
    r.lowerFrom = Math.min(r.lowerFrom ?? Infinity, top + LINE_HEIGHT);
  };
  const arms = tree.flatMap(({ depth, is }) => {
    const c = { depth, isDashed: false };
    if (is === "down")
      reachBelow(c);
    else if (is === "last")
      reachOf(c).toArm = true;
    else if (is !== "arm")
      reachWhole(c);
    if (is === "down" || is === "past")
      return [];
    return [
      f.own(div5().id(`stroke ${key} arm ${depth}`).absolute().left(PATH_X + depth * NEST + 1).top(armAt).w(NEST - (PATH_X - EDGE) - 1 - SMALL_GAP).h(1).border_t_1().border_color(lineColor(t)))
    ];
  });
  passes.forEach(reachWhole);
  feeds.forEach(reachBelow);
  const columnEls = [...reaches].flatMap(([depth, r]) => {
    const c = { depth, isDashed: r.isDashed };
    const isSplit = f.above(depth) !== f.below(depth);
    const hasUpper = r.toEnd || r.toArm;
    const upperHeight = r.toEnd && !isSplit ? null : hasUpper ? armAt + 1 : 0;
    const lowerFrom = r.toEnd ? armAt + 1 : r.lowerFrom ?? armAt + 1;
    const lowerHeight = r.toEnd ? isSplit ? null : 0 : r.lowerFrom === null ? 0 : null;
    const id = (part) => `stroke ${key} column ${depth} ${part}`;
    return [
      f.above(depth)(lineEl2(id("top"), c, hasUpper ? 0 : armAt + 1, upperHeight, t)),
      f.below(depth)(lineEl2(id("bottom"), c, lowerFrom, lowerHeight, t))
    ];
  });
  return [...path ? pathEls(path) : [], ...columnEls, ...arms];
}

// src/paint-space.ts
var isClosedFold = (b) => b.kind === "fold" && ("closedFold" in b.change);
var isSettledPr = (b) => b.kind === "row" && b.settled !== null && b.id.startsWith("pr:");
function padOf(b) {
  if (isClosedFold(b))
    return LIST_MARGIN;
  if (isSettledPr(b))
    return 0;
  return b.kind === "row" || b.kind === "fold" || b.kind === "more" ? ROW_PAD_PT : 0;
}
var LIST_MARGIN_TO_TEXT = LIST_MARGIN + ROW_PAD_PT;
var isTitle = (b) => b.kind === "heading" && !b.isLabel || b.kind === "caption";
var isOneLineRow2 = (r) => !r.isSelected && r.body.length === 0 && r.settled === null && r.feedback === null && r.heldLine === undefined;
function isOneLine(b) {
  if (b.kind === "status")
    return b.under.length === 0 && b.buttons.length === 0;
  if (b.kind === "row")
    return isOneLineRow2(b);
  return b.kind === "note" || b.kind === "fold" || b.kind === "more";
}
var depthOf2 = (b) => ("depth" in b) ? b.depth : 0;
function itemGap(prev, b) {
  if (isOneLine(prev) && isOneLine(b))
    return LIST_GAP;
  return depthOf2(b) > 0 ? CHILD_GAP : ITEM_GAP;
}
var isMilestone = (b) => ("path" in b) && b.path?.is === "milestone";
function gapBetween(prev, b) {
  if ("gapAbove" in b && b.gapAbove !== undefined)
    return b.gapAbove;
  if (isMilestone(prev))
    return isMilestone(b) ? LIST_GAP : HEAD_GAP;
  if (isTitle(prev) || isClosedFold(b))
    return LIST_MARGIN_TO_TEXT;
  const isLabelled = prev.kind === "heading" || prev.kind === "rule" && prev.text !== null;
  if (isLabelled)
    return HEAD_GAP;
  if (prev.kind === "rule" || b.kind === "rule")
    return SECTION_GAP / 2;
  if (prev.kind === "note" && prev.isHead && b.kind === "note" && b.isHead)
    return INSIDE_GAP;
  if (prev.kind === "line" && b.kind === "line")
    return CONTROL_GAP;
  if (prev.kind === "line" || prev.kind === "banner" || b.kind === "heading")
    return SECTION_GAP;
  return itemGap(prev, b);
}
function aboveOf(prev, b, section) {
  if (prev === null)
    return 0;
  const gap = section ?? gapBetween(prev, b);
  return Math.max(0, gap - padOf(prev) - padOf(b));
}
function spacesOf(blocks, isShut, formOf = (b) => b) {
  const out = [];
  let prev = null;
  let section = null;
  for (const b of blocks) {
    if (b.kind === "gap") {
      if (isShut(b))
        continue;
      section = prev === null ? null : b.isMilestoneStep ? ITEM_GAP : SECTION_GAP;
      continue;
    }
    if (isShut(b)) {
      out.push({ block: b, above: 0 });
      continue;
    }
    const form = formOf(b);
    out.push({ block: b, above: aboveOf(prev, form, section) });
    prev = form;
    section = null;
  }
  return out;
}
var springHeight = (el) => el.spring("height", HEIGHT_SPRING);
var springBox = (id, height) => springHeight(v_flex2().id(id).flex_none().overflow_hidden().when(height !== undefined, (e) => e.h(height ?? 0)));
var sizeEl = (key, p, el) => div6().id(`size ${key}`).flex_none().on_size_change((size, cx) => p.measure(key, size, cx)).child(el);
function fitEl(key, p, el, isPaneSized = false) {
  const height = isPaneSized || p.isAtOnce(key) ? undefined : p.heights.get(key);
  return springBox(`fit ${key}`, height).child(sizeEl(key, p, el));
}
var titleHeightOf = (r, p) => {
  const m = p.motion.get(r.id);
  const rest = shortTitleOf(r, m?.swap?.from ?? null, p.heights).height;
  if (!isOpenRow(r) && m?.isHeightHeld !== true)
    return rest;
  const measured = p.heights.get(titleId(r.id));
  return measured === undefined || rest === undefined ? measured : Math.max(measured, rest);
};
function titleEl(r, p, el) {
  const key = titleId(r.id);
  const isTitleMoving = (p.motion.get(r.id)?.title ?? null) !== null;
  const isTakenAtOnce = p.isAtOnce(key) && (isOpenRow(r) || !isTitleMoving);
  const height = isTakenAtOnce ? undefined : titleHeightOf(r, p);
  return springBox(`fit ${key}`, height).child(sizeEl(key, p, el));
}
function fitHeight(b, m, p) {
  const id = b.id;
  const panel = m?.isPanelLeftOut ? p.heights.get(panelId(id)) ?? 0 : 0;
  const former = () => m?.former ? fitHeight(m.former, undefined, p) : undefined;
  if (b.kind === "pr") {
    const head = p.heights.get(prHeadId(id));
    const status = p.heights.get(underId(id));
    const tail = PR_TAIL_PARTS.map((part) => prTailHeight(b, part, m, p) ?? p.heights.get(prTailId(part, id)));
    const warning = p.heights.get(warningBoxId(id));
    if (head === undefined || status === undefined || warning === undefined || tail.some((h) => h === undefined))
      return former();
    const lines = tail.reduce((sum, h) => sum + (h ?? 0), warning + warningRise(b, m, p));
    return head + (prStatusHeight(b, m, p) ?? status) + lines;
  }
  if (b.kind !== "row") {
    const formKey = m?.blockSwap?.formKey ?? null;
    const measured = p.heights.get(formKey ?? id) ?? (formKey !== null ? m?.blockSwap?.fromHeight : undefined);
    return measured === undefined ? former() : measured - panel + warningRise(b, m, p);
  }
  const title = titleHeightOf(b, p);
  const rest = p.heights.get(restId(id));
  if (title === undefined || rest === undefined)
    return former();
  const rise = lineRise(b, p.now, p.heights) + addedRise(b, p.now, p.heights) + warningRise(b, m, p);
  return 2 * padOf(b) + title + rest - panel - heldLineDrop(b, p.now, p.heights) + rise;
}
function kindFadeEl(el, b, m, s, key, p) {
  const height = s.isOut ? undefined : s.formKey !== null ? p.heights.get(s.formKey) : fitHeight(b, { ...m, former: null }, p);
  const from = (s.formKey !== null ? s.fromHeight : fitHeight(s.from, undefined, p)) ?? height;
  const delay = height === undefined ? null : enterDelayMs(height, { x: from ?? height, v: 0 });
  const fade = swapPartFade(s, delay);
  return fadeEl(el, `kind ${key}`, fade.opacity, fade, p);
}
function contentEl(b, m, p, el, strokes) {
  const id = b.id;
  const isRow = b.kind === "row";
  const isAtOnce = isRow ? p.isAtOnce(titleId(id)) || p.isAtOnce(restId(id)) : p.isAtOnce(id);
  const measured = fitHeight(b, m, p);
  const formKey = m?.blockSwap?.formKey ?? null;
  const atRest = isAtOnce || b.kind === "empty" ? undefined : measured;
  const open = isAtOnce ? undefined : measured ?? 0;
  const height = m?.box === "shut" ? 0 : m?.box === "open" ? open : atRest;
  return springBox(`fit ${m?.springId ?? id}`, height).when(strokes.length > 0, (e) => e.relative()).child(isRow ? el : sizeEl(id, p, formKey !== null ? sizeEl(formKey, p, el) : el)).children(strokes);
}
function spaceEl(s, p, columns) {
  const id = `space ${p.motion.get(s.block.id)?.springId ?? s.block.id}`;
  const box = springHeight(div6().id(id).flex_none()).when(columns.length > 0, (e) => e.relative()).children(columns);
  return p.isAtOnce(id) ? box.pt(s.above) : box.h(s.above);
}
function spacedEls(blocks, p, el) {
  const isShut = (b) => p.motion.get(b.id)?.box === "shut";
  const heldForm = (b) => {
    const m = p.motion.get(b.id);
    if (!m?.former)
      return b;
    const isNewFormUnmeasured = fitHeight(b, { ...m, former: null }, p) === undefined;
    return isNewFormUnmeasured ? m.former : b;
  };
  const spaces = spacesOf(blocks, isShut, heldForm);
  const drawn = spaces.map((s) => s.block);
  const passing = passingOf(drawn, isShut);
  const looks = drawn.map((b) => {
    const m = p.motion.get(b.id);
    const height = fitHeight(b, m, p);
    const isShown = m?.box === "open" && m.isShown && height !== undefined;
    const delay = m?.waitsForSpace && height !== undefined ? enterDelayMs(height, shutTo(height, m.shutForMs)) : 0;
    const glide = { duration: m?.fadeMs ?? 0, delay, easing: "ease-out" };
    const fade = (e) => m?.box ? fadeEl(e, `box ${m.springId ?? b.id}`, isShown ? 1 : 0, glide, p) : e;
    const isMoving = m?.box != null;
    const move = { isMoving, isGone: isMoving && m?.state === "leaving" && m.box === "shut" };
    return { m, isShown, glide, fade, move };
  });
  const moves = looks.map((l) => l.move);
  const strokeFades = strokeFadesOf(drawn, passing, moves, looks.map((l) => l.fade));
  const feeds = feedsOf(drawn, moves);
  return spaces.map((s, i) => {
    const b = s.block;
    const passes = passing[i] ?? [];
    const comesIn = runsIn(b);
    const intoSpace = [...comesIn, ...passes.filter((c) => !comesIn.some((o) => o.depth === c.depth))];
    const look = looks[i];
    const f = strokeFades[i];
    if (!look || !f)
      throw new Error(`no look for block ${b.id}`);
    const { m, isShown, glide, fade } = look;
    const key = m?.springId ?? b.id;
    const drawn = v_flex2().id(`drawing ${key}`).child(el(b));
    const drawing = m?.blockSwap && m.blockSwap.parts === null && !m.box ? kindFadeEl(drawn, b, m, m.blockSwap, key, p) : drawn;
    const slide = (e) => m?.box ? e.relative().top(isShown ? 0 : -SLIDE_PX).transition("top", glide) : e;
    return v_flex2().id(`box ${key}`).flex_none().child(spaceEl(s, p, intoSpace.map((c) => spaceColumnEl(key, c, f, p.t)))).child(contentEl(b, m, p, slide(fade(drawing)), contentStrokeEls(key, b, Math.round(padOf(b)), p.t, f, passes, feeds[i] ?? [])));
  });
}

// src/paint-empty.ts
function emptyEl(b, p, isInert) {
  return v_flex3().items_center().justify_center().when(p.listRoom !== null, (e) => e.min_h(p.listRoom ?? 0)).p(END_SPACE).child(fitEl(contentKey(b), p, emptyContentEl(b, p, isInert)));
}
var contentKey = (b) => `${b.id} content`;
function controlsEl(b, p, isInert) {
  const key = `${b.id} field`;
  const field = b.under?.field ?? null;
  const buttons = b.under?.buttons ?? [];
  const height = p.heights.get(key) ?? 0;
  const opening = { isOpen: height > 0 || p.isAtOnce(contentKey(b)), delayMs: enterDelayMs(height) };
  const fieldBox = field ? div7().w_full().pt(CONTROL_GAP).child(fieldEl(field, p, 0, isInert, opening)) : div7();
  return v_flex3().w_full().items_center().child(sizeEl(key, p, fieldBox).w_full()).when(buttons.length > 0, (e) => e.child(h_flex2().flex_wrap().justify_center().gap(CONTROL_GAP).pt(CONTROL_GAP).children(buttons.map((x) => buttonEl(x, p, isInert)))));
}
function titleWithMarkEl(title, isRunning, p) {
  const mark = { text: isRunning ? RUNNING_MARK : "", tone: null, isRunning };
  return h_flex2().justify_center().gap(CONTROL_GAP).child(div7().text_center().whitespace_normal().text_color(p.t.foreground).font_semibold().child(title)).child(markEl(mark, p.t));
}
function emptyContentEl(b, p, isInert) {
  const { t } = p;
  const { empty, under } = b;
  const centred = (text, color = t.foreground) => div7().text_center().whitespace_normal().text_color(color).child(text);
  return v_flex3().items_center().max_w(EMPTY_STATE_MAX_WIDTH_PT).gap(INSIDE_GAP).child(b.titleMark ? titleWithMarkEl(empty.title, b.titleMark.isRunning, p) : centred(empty.title).font_semibold()).when(empty.hint !== null, (e) => e.child(centred(empty.hint ?? "", t.muted))).when(under?.text != null, (e) => e.child(centred(under?.text ?? "").pt(CONTROL_GAP))).when((under?.buttons.length ?? 0) > 0 || under?.field != null, (e) => e.child(controlsEl(b, p, isInert))).when(under?.feedback != null, (e) => e.child(centred(under?.feedback?.text ?? "", colorOf(t, under?.feedback?.tone ?? null)).pt(CONTROL_GAP)));
}

// src/paint-chevron.ts
import { PathBuilder as PathBuilder2, div as div8 } from "gpui-kit";
import { h_flex as h_flex3 } from "gpui-base";
var SIZE_PX = 12;
var STROKE_PX = 1;
var GRID = 24;
var CORNERS = {
  folded: [
    [9, 18],
    [15, 12],
    [9, 6]
  ],
  open: [
    [6, 9],
    [12, 15],
    [18, 9]
  ]
};
var pathOf = (isOpen) => {
  const [first, ...rest] = CORNERS[isOpen ? "open" : "folded"].map(([x, y]) => [`${x / GRID * 100}%`, `${y / GRID * 100}%`]);
  const path = PathBuilder2.stroke(STROKE_PX).move_to(first[0], first[1]);
  return rest.reduce((p, [x, y]) => p.line_to(x, y), path).build();
};
var FOLDED_PATH = pathOf(false);
var OPEN_PATH = pathOf(true);
function chevronEl(isOpen, t, isLive, color) {
  const path = isOpen ? OPEN_PATH : FOLDED_PATH;
  const shape = (color) => window.paint_path(path, color).absolute().top(0).left(0).size(`${SIZE_PX}px`);
  return div8().relative().flex_none().w(SIZE_PX).h(SIZE_PX).child(shape(color)).when(isLive, (e) => e.child(div8().absolute().top(0).left(0).w(SIZE_PX).h(SIZE_PX).opacity(0).hover((x) => x.opacity(1)).child(shape(t.foreground))));
}
function foldChevronEl(t, fold) {
  const color = fold.level === "faint" ? faintOf(t) : t.muted;
  return h_flex3().flex_none().items_center().h(LINE_HEIGHT).ml(SMALL_GAP).text_color(color).child(chevronEl(fold.isOpen, t, fold.isLive, color)).children(fold.count === undefined ? [] : [
    div8().id(fold.count.id).ml(SMALL_GAP).child(`${fold.count.value}`).when(fold.isLive, (c) => c.hover((x) => x.text_color(t.foreground)))
  ]);
}

// src/paint-status-line.ts
import { div as div9 } from "gpui-kit";
import { h_flex as h_flex4, v_flex as v_flex4 } from "gpui-base";
var statusPartEl = (text) => div9().min_w(0).max_w_full().whitespace_normal().child(text);
function keyEl(s, does, t) {
  return h_flex4().items_start().pl(EDGE + HELP_INDENT).pr(EDGE).pb(LIST_GAP).child(div9().flex_none().w(HELP_COLUMN).child(s.mark ? markEl(s.mark, t) : div9().font_semibold().child(s.name))).child(div9().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(does));
}
var SHOWN_PART = { opacity: 1, duration: LEAVE_FADE_MS, delay: 0 };
function statusEl(s, p, isInert) {
  const { t } = p;
  if (s.does !== undefined)
    return keyEl(s, s.does, t);
  const swap = p.motion.get(s.id)?.blockSwap ?? null;
  const areButtonsLeaving = swap?.isOut === true && swap.parts?.includes("buttons") === true;
  const partEl = (part, el) => {
    const name = `status ${part} ${s.id}`;
    const fade = swap?.parts?.includes(part) ? swapPartFade(swap, swap.inDelayMs) : SHOWN_PART;
    return fadeEl(el.id(name), name, fade.opacity, fade, p);
  };
  const name = statusPartEl(s.stall ? `${s.name}${STALL_GAP}` : s.name).when(s.isBold, (e) => e.font_semibold()).when(s.nameLevel !== "plain", (e) => e.text_color(s.nameLevel === "faint" ? faintOf(t) : t.muted)).when(s.nameTone !== undefined, (e) => e.text_color(colorOf(t, s.nameTone ?? "needsYou")));
  const stall = s.stall ? [statusPartEl(s.stall.text).text_color(colorOf(t, s.stall.tone))] : [];
  const toggle = s.fold?.toggle;
  const chevron = s.fold ? [
    foldChevronEl(t, {
      isOpen: !s.fold.isFolded,
      isLive: toggle !== undefined && !isInert,
      level: s.fold.level,
      ...s.fold.isFolded ? { count: { id: `fold count ${s.id}`, value: s.fold.count } } : {}
    })
  ] : [];
  return v_flex4().pl(EDGE + s.depth * NEST).pr(EDGE).child(h_flex4().id(`fold ${s.id}`).items_start().when(toggle !== undefined && !isInert, (e) => e.on_click((e, cx) => toggle ? p.press(toggle, cx, e.modifiers.alt) : undefined)).child(partEl("mark", markEl(s.mark, t))).child(h_flex4().relative().flex_1().min_w(0).flex_wrap().child(partEl("name", name)).children(stall).children(chevron))).child(partEl("under", v_flex4().children(s.under.map((l) => lineEl(l.text, l.level === "faint" ? faintOf(t) : t.muted))))).when(s.buttons.length > 0, (e) => e.child(partEl("buttons", buttonsEl(s.buttons, p, MARK_W, isInert || areButtonsLeaving))));
}

// src/paint-pr-status.ts
import { div as div10 } from "gpui-kit";
function lineBoxEl(key, height, s, atRest, lineEl, p) {
  const moving = height === undefined ? null : s;
  const line = height === undefined ? atRest : s?.line ?? null;
  const drawn = (line === null ? null : lineEl(line)) ?? div10();
  const faded = moving === null || moving.opacity === null ? drawn.id(key) : fadeEl(drawn.id(key), key, moving.opacity, { duration: moving.fadeMs, delay: moving.delayMs }, p);
  return springBox(`fit ${key}`, height).child(sizeEl(key, p, faded));
}
function prStatusEl(b, p, lineEl) {
  const m = p.motion.get(b.id);
  const isShown = (l) => p.isNarrow || l.status !== null || l.unlisted.length > 0;
  return lineBoxEl(underId(b.id), prStatusHeight(b, m, p), m?.status ?? null, b, (l) => isShown(l) ? lineEl(l) : null, p);
}
function prTailEls(b, p, els) {
  const m = p.motion.get(b.id);
  const box = (part) => {
    const key = prTailId(part, b.id);
    const height = prTailHeight(b, part, m, p);
    const t = m?.prTail ?? null;
    if (part === "error")
      return lineBoxEl(key, height, t?.error ?? null, b.error, els.error, p);
    if (part === "buttons") {
      const atRest = b.buttons.length > 0 ? b.buttons : null;
      return lineBoxEl(key, height, t?.buttons ?? null, atRest, (l) => els.buttons(l, atRest === null), p);
    }
    return lineBoxEl(key, height, t?.result ?? null, b.feedback, els.result, p);
  };
  return PR_TAIL_PARTS.map(box);
}

// src/paint-chrome.ts
import { Background, PathBuilder as PathBuilder3, div as div11 } from "gpui-kit";
import { h_flex as h_flex5, v_flex as v_flex5 } from "gpui-base";
var helpButton = {
  id: "help",
  label: HELP_COPY.name,
  emphasis: "quiet",
  isOut: false,
  hotkey: null,
  does: { is: "view", change: { toggleHelp: true } }
};
var helpIconEl = (t, isSelected) => h_flex5().w(HELP_ICON).h(HELP_ICON).flex_none().items_center().justify_center().rounded(HELP_ICON / 2).border_1().border_color(isSelected ? t.foreground : t.muted).when(!isSelected, (e) => e.hover((s) => s.border_color(t.foreground))).text_size(HELP_ICON_TEXT).font_semibold().child(HELP_COPY.icon);
function tabsEl(tabs, isHelpShown, p) {
  const { t } = p;
  return h_flex5().flex_none().flex_wrap().px(EDGE).pt(EDGE).pb(CONTROL_GAP).gap_x(SMALL_GAP).gap_y(CONTROL_GAP).items_center().children(tabs.map((tab) => {
    const isTabSelected = tab.isSelected && !isHelpShown;
    return h_flex5().id(`tab ${tab.id}`).h(BUTTON_H).px(INSET).items_center().rounded(TAB_RADIUS).accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label).when(isTabSelected, (e) => e.bg(t.raised).text_color(t.foreground).font_semibold()).when(!isTabSelected, (e) => e.text_color(t.muted).hover((s) => s.text_color(t.foreground))).on_click((_e, cx) => p.pick(tab.id, cx)).child(tab.label).when(tab.badge !== null, (e) => e.child(div11().ml(SMALL_GAP).font_normal().text_color(colorOf(t, tab.id === "overview" ? null : tab.id)).child(tab.badge ?? "")));
  })).child(div11().flex_1()).child(h_flex5().id("help").h(BUTTON_H).px(INSET).items_center().rounded(TAB_RADIUS).accessibility_label(helpButton.label).when(isHelpShown, (e) => e.bg(t.raised).text_color(t.foreground)).when(!isHelpShown, (e) => e.text_color(t.muted).hover((s) => s.text_color(t.foreground))).on_click((_e, cx) => p.press(helpButton, cx)).child(helpIconEl(t, isHelpShown)));
}
var BANNER_TONES2 = { error: "error", warning: "warning", notice: "notice", ask: "notice" };
function bannerEl(b, t, buttons = [], under = null) {
  const tone = colorOf(t, BANNER_TONES2[b.tone]);
  const text = v_flex5().flex_1().min_w(0).whitespace_normal().child(div11().font_semibold().text_color(tone).child(b.lead)).when(b.body !== null, (e) => e.child(div11().child(b.body ?? "")));
  const row = h_flex5().gap(INSET).items_center().child(text).when(buttons.length > 0, (e) => e.child(h_flex5().flex_none().gap(CONTROL_GAP).children(buttons)));
  return v_flex5().mx(EDGE).px(INSET).py(BANNER_PAD_Y_PT).rounded(BOX_RADIUS).border_1().border_color(tint(tone, 0.3)).bg(tint(tone, 0.09)).child(row).children(under ? [under] : []);
}
var sessionNoteEl = (text, t) => div11().px(EDGE).pt(EDGE).whitespace_normal().text_color(t.muted).child(text);
function messageEl(m, t) {
  return v_flex5().flex_1().justify_center().items_center().p(END_SPACE).gap(INSIDE_GAP).child(div11().font_semibold().text_center().text_color(m.isError ? t.ansi1 : t.foreground).child(m.title)).when(m.hint !== null, (e) => e.child(div11().whitespace_normal().text_center().text_color(t.muted).child(m.hint ?? "")));
}
var FILL = PathBuilder3.fill().add_polygon([
  [0, 0],
  ["100%", 0],
  ["100%", "100%"],
  [0, "100%"]
], true).build();
function scrollFadeEl(t, edge) {
  const isTop = edge === "top";
  const fade = Background.linear_gradient(isTop ? 180 : 0, tint(t.background, 1), tint(t.background, 0));
  return window.paint_path(FILL, fade).absolute().left(0).right(0).when(isTop, (e) => e.top(0).h(EDGE)).when(!isTop, (e) => e.bottom(0).h(END_SPACE));
}

// src/paint-title-tint.ts
function tintOf(r, p) {
  const { t } = p;
  const clock = r.settled ? closedTitleClock(p.closedSeen, r.id, r.settled.at, p.now) : newRowIn(p.newRows, r.id, p.tab);
  const tone = r.settled ? r.settled.tint ? colorOf(t, r.settled.tint) : null : t.ansi4;
  const share = steppedTitleTint(clock, p.now);
  return tone && share > 0 ? { tone, share } : null;
}
function titleColorOf(r, p) {
  const own = r.isDim ? p.t.muted : p.t.foreground;
  const tint = tintOf(r, p);
  return tint ? mixInto(tint.tone, own, tint.share) : own;
}
function markTintOf(r, p) {
  const tint = tintOf(r, p);
  if (!tint)
    return null;
  const own = r.mark === null || r.mark.tone === null ? p.t.muted : colorOf(p.t, r.mark.tone);
  return mixInto(tint.tone, own, tint.share);
}

// src/paint-title-text.ts
import { div as div12 } from "gpui-kit";
function titleTextEl(r, p, color) {
  const m = p.motion.get(r.id);
  const g = m?.title ?? null;
  const short = shortTitleOf(r, m?.swap?.from ?? null, p.heights);
  const text = div12().flex_1().min_w(0).relative().text_color(color).children(titleCopiesOf(r, p.heights).map((c) => copyEl(c.key, c.text, p)));
  const whole = div12().child(wrappedTitleOf(r, p.heights));
  if (g === null)
    return text.child(isOpenRow(r) ? whole : shortTitleEl(short));
  const form = (id, isShown, fade) => fadeEl(div12().id(id), id, isShown ? 1 : 0, { duration: fade.ms, delay: fade.delayMs }, p);
  const isCutTall = g.tallForm === "cut";
  const tall = isCutTall ? shortTitleEl(cutTitleOf(r, p.heights)) : whole;
  const shortForm = shortTitleEl(g.isShortOneLine ? oneLineTitleOf(r, p.heights) : short);
  return text.child(form(`tall ${r.id}`, g.isTallShown, g.tall).child(tall)).child(div12().absolute().top(0).left(0).w_full().child(form(`short ${r.id}`, !g.isTallShown, g.short).child(shortForm)));
}
var copyEl = (key, text, p) => div12().id(`copy ${key}`).absolute().top(0).left(0).w_full().opacity(0).on_size_change((size, cx) => p.measure(key, size, cx, true)).child(text);
function shortTitleEl(s) {
  if (s.isOneLine)
    return div12().truncate().child(s.text);
  if (s.secondLine !== undefined)
    return div12().child(div12().child(s.text)).child(div12().truncate().child(s.secondLine));
  return div12().when(s.isClipped, (e) => e.max_h(CLIPPED_HEIGHT).overflow_hidden()).child(s.text);
}

// src/paint-row-lines.ts
import { v_flex as v_flex6 } from "gpui-base";
var linesOf = (r) => [
  ...r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : [],
  ...r.feedback && !isStatusUnder(r) && !r.isLineWaiting ? [
    {
      ...r.feedback,
      cameAt: r.lineCameAt,
      isAgain: r.isLineAgain,
      isSwapped: r.isLineSwapped,
      isStatus: true
    }
  ] : [],
  ...r.heldLine ? [{ ...r.heldLine, isStatus: true }] : []
];
var withTrunk = (el, trunk) => trunk ? v_flex6().relative().child(el).child(trunk) : el;
function titleLineEls(r, shown, m, p, lineEl, trunkOf, withPanel) {
  const drawn = (l, n) => leavingEl(r, l, lineEl(l, n).id(`status above ${r.id} line ${n}`), n, p, trunkOf(n));
  const closing = m?.closing ?? null;
  const lines = linesOf(shown);
  if (closing === null)
    return lines.map(drawn);
  const kept = linesOf(closing);
  const isAdded = (l) => !kept.some((k) => k.text === l.text);
  const isDropped = (l) => !lines.some((s) => s.text === l.text);
  const fadeName = (n) => `status above ${r.id} ${n}`;
  if (!m?.isPanelLeftOut) {
    lines.forEach((l, n) => isAdded(l) && p.fades.fade(fadeName(n), 0, 0, 0, p.now));
    return kept.map((l, n) => isDropped(l) ? withPanel(drawn(l, n)) : drawn(l, n));
  }
  return lines.map((l, n) => {
    const isMovedByHold = l.cameAt !== undefined || l.leftAt !== undefined;
    if (!isAdded(l) || isMovedByHold)
      return drawn(l, n);
    const name = fadeName(n);
    return withTrunk(fadeEl(lineEl(l, n).id(name), name, 1, { duration: ENTER_FADE_MS, delay: NEXT_FRAME_MS }, p), trunkOf(n));
  });
}
function leavingEl(r, l, el, n, p, trunk) {
  const leftAt = l.leftAt;
  if (l.cameAt !== undefined)
    return comingEl(r, l, l.cameAt, el, n, p, trunk);
  const whole = withTrunk(el, trunk);
  if (leftAt === undefined)
    return l.isStatus ? sizeEl(aboveId(r.id), p, sizeEl(aboveLineId(r.id), p, whole)) : whole;
  const isFading = p.now < leftAt + HOLD_MS;
  const name = `status above ${r.id} line ${n}`;
  const faded = l.isHidden ? el : fadeEl(el, name, p.now === leftAt ? 1 : 0, { duration: LEAVE_FADE_MS, delay: 0 }, p);
  const shown = withTrunk(faded, trunk);
  const box = springBox(`fit ${aboveId(r.id)}`, isFading ? p.heights.get(aboveLineId(r.id)) : 0);
  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)));
}
function comingEl(r, l, cameAt, el, n, p, trunk) {
  const isStart = p.now === cameAt;
  const height = p.heights.get(aboveLineId(r.id));
  const from = l.isAgain ? p.heights.get(aboveId(r.id)) ?? 0 : 0;
  const name = `status above ${r.id} line ${n}`;
  const fade = { duration: ENTER_FADE_MS, delay: isStart ? 0 : enterDelayMs(height ?? 0, { x: from, v: 0 }) };
  const shown = withTrunk(fadeEl(el, name, isStart ? l.isSwapped ? 0 : FAINT_OPACITY : 1, fade, p), trunk);
  const box = springBox(`fit ${aboveId(r.id)}`, isStart ? from : height);
  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)));
}
function addedLinesEls(r, lines, els, p) {
  const added = r.addedLines;
  const from = added ? addedAt(lines.map(bodyKey), added) : -1;
  if (!added || from < 0)
    return els.flat();
  const end = from + added.keys.length;
  const height = p.heights.get(addedLinesId(r.id));
  const isStart = p.now === added.cameAt || height === undefined;
  const name = addedId(r.id);
  const fade = { duration: ENTER_FADE_MS, delay: isStart ? 0 : enterDelayMs(height ?? 0) };
  const shown = fadeEl(v_flex6().id(name).children(els.slice(from, end).flat()), name, isStart ? FAINT_OPACITY : 1, fade, p);
  const box = springBox(`fit ${name}`, isStart ? 0 : height);
  return [
    ...els.slice(0, from).flat(),
    sizeEl(name, p, box.child(sizeEl(addedLinesId(r.id), p, shown))),
    ...els.slice(end).flat()
  ];
}

// src/paint-notes.ts
import { div as div13 } from "gpui-kit";
import { h_flex as h_flex6 } from "gpui-base";
var ruleLine = (t) => div13().flex_1().border_t(1).border_color(t.border);
function ruleEl(b, t) {
  if (b.text === null)
    return h_flex6().pl(EDGE).pr(EDGE).child(ruleLine(t));
  return h_flex6().pl(EDGE).pr(EDGE).gap(CONTROL_GAP).items_center().child(div13().flex_none().text_color(b.isTitle ? t.foreground : t.muted).when(b.isTitle, (e) => e.font_semibold()).child(b.text)).child(ruleLine(t));
}
function noteEl(b, t, buttons = []) {
  const text = div13().min_w(0).when(b.isStrong, (e) => e.font_semibold()).text_color(b.isStrong ? t.foreground : b.level === "faint" ? faintOf(t) : colorOf(t, b.tone)).child(b.text);
  return h_flex6().flex_wrap().gap_x(CONTROL_GAP).items_baseline().pl((b.isAtEdge ? EDGE : TEXT_X) + b.depth * NEST).pr(EDGE).whitespace_normal().when(b.isStrong, (e) => e.text_size(HEAD_TEXT).line_height(HEAD_LINE)).child(text).when(buttons.length > 0, (e) => e.child(h_flex6().flex_none().items_center().gap(CONTROL_GAP).children(buttons)));
}

// src/paint-parted.ts
import { div as div14 } from "gpui-kit";
import { h_flex as h_flex7 } from "gpui-base";
var SEP_W = 9.5;
function partedEl(parts, dotColor) {
  const slot = (n) => h_flex7().flex_none().w(SEP_W).justify_center().text_color(dotColor).when(n > 0, (e) => e.child("·"));
  const items = parts.map((part, n) => h_flex7().items_start().min_w(0).max_w_full().child(slot(n)).child(div14().min_w(0).child(part)));
  return div14().overflow_hidden().min_w(0).child(h_flex7().flex_wrap().items_start().ml(-SEP_W).children(items));
}

// src/paint-text.ts
import { div as div15 } from "gpui-kit";
import { h_flex as h_flex8 } from "gpui-base";
var NO_BREAK_SPACE = " ";
var wordEls = (text, color) => text.split(" ").filter((word) => word).map((word) => statusPartEl(`${word}${NO_BREAK_SPACE}`).text_color(color));
var partedTextEl = (text, color, indent, t) => text.includes(DOT) ? div15().pl(indent).pt(INSIDE_GAP).child(partedEl(text.split(DOT).map((part) => statusPartEl(part).text_color(color)), t.muted)) : lineEl(text, color, indent);
function feedbackEl(f, t) {
  const cut = f.aged?.lead.length ?? f.text.length;
  if (f.tone === "muted" || cut >= f.text.length)
    return partedTextEl(f.text, colorOf(t, f.tone), 0, t).pt(CONTROL_GAP);
  return h_flex8().flex_wrap().pt(CONTROL_GAP).children([...wordEls(f.text.slice(0, cut), colorOf(t, f.tone)), ...wordEls(f.text.slice(cut), faintOf(t))]);
}

// src/paint-tree.ts
import { div as div16 } from "gpui-kit";
import { h_flex as h_flex9 } from "gpui-base";
var trunkEl = (top, height, t, isSelected) => {
  const el = div16().absolute().left(PATH_X - EDGE).top(top).w(1).border_l_1().border_color(lineColor(t, isSelected ? t.selected : t.background));
  return height === null ? el.bottom(0) : el.h(height);
};
var armEl = (from, to, top, color) => div16().absolute().left(from).top(top).w(to - from).h(1).border_t_1().border_color(color);
var ARM_END = NEST - SMALL_GAP;
var answerKey = (buttonId) => `answer ${buttonId}`;
function isSideBySide(r, p) {
  if (!r.sideBySide)
    return false;
  const widths = r.sideBySide.optionIds.flatMap((id) => p.heights.widthOf(answerKey(id)) ?? []);
  return answersFitLine(widths, CONTROL_GAP, p.rowTextRoom);
}
var answersEl = (answers, p, isInert, isLast, t, isSelected) => {
  const arm = armEl(PATH_X - EDGE, ARM_END, "50%", lineColor(t, isSelected ? t.selected : t.background));
  const isAlone = answers.length === 1;
  const buttons = answers.map((b) => buttonEl(b, p, isInert, isAlone).on_size_change((size, cx) => p.measure(answerKey(b.id), size, cx, true)));
  return h_flex9().relative().min_w(0).pl(MARK_W).child(isAlone ? buttons[0] : h_flex9().flex_wrap().gap(CONTROL_GAP).children(buttons)).children(isLast ? [arm, trunkEl(0, "50%", t, isSelected)] : [arm]);
};

// src/paint-body-line.ts
import { h_flex as h_flex10 } from "gpui-base";
var bodyLineEl = (l, above, t, isSelected, answers = [], p = null, isInert = false) => {
  const under = isSelected ? t.selected : t.background;
  const color = lineColor(t, under);
  const textColor = bodyTextColor(t, l, under);
  if (answers.length > 0 && p) {
    const trunk = l.tree === "tee" ? [trunkEl(0, null, t, isSelected)] : l.tree === "last" ? [trunkEl(0, above, t, isSelected)] : [];
    return h_flex10().relative().min_w(0).pt(above).child(answersEl(answers, p, isInert, l.tree === "last", t, isSelected)).children(trunk);
  }
  const armAt = above + LINE_HEIGHT / 2;
  const arm = armEl(PATH_X - EDGE + 1, ARM_END, armAt, color);
  const strokes = l.tree === "trunk" ? [trunkEl(0, null, t, isSelected)] : l.tree === "tee" ? [trunkEl(0, null, t, isSelected), arm] : l.tree === "last" ? [trunkEl(0, armAt + 1, t, isSelected), arm] : [];
  const line = l.lead ? h_flex10().flex_wrap().pl(MARK_W).pt(above).children([...wordEls(l.lead, t.foreground), ...wordEls(l.text, textColor)]) : partedTextEl(l.text, textColor, l.isOptionNote ? MARK_W + BUTTON_LABEL_X : MARK_W, t).pt(above);
  return line.relative().children(strokes);
};

// src/paint-warning.ts
import { div as div17 } from "gpui-kit";
function warningBoxEl(id, atRest, p, lineEl, isLeftForm = false) {
  const m = p.motion.get(id);
  const box = isLeftForm ? heldBoxEl(id, atRest, p, lineEl) : lineBoxEl(warningId(id), warningHeight(id, m, p, false), m?.warning ?? null, atRest, lineEl, p);
  return sizeEl(warningBoxId(id), p, box);
}
function heldBoxEl(id, line, p, lineEl) {
  const key = warningId(id);
  const height = p.heights.get(warningBoxId(id)) ?? 0;
  const isOpen = height >= (p.heights.get(key) ?? 0);
  const drawn = (line === null ? div17() : lineEl(line)).id(key);
  const faded = fadeEl(drawn, key, 0, { duration: isOpen ? LEAVE_FADE_MS : 0, delay: 0 }, p);
  return div17().id(`fit ${key}`).flex_none().overflow_hidden().h(height).child(sizeEl(key, p, faded));
}
var isWarningDrawn = (r, m, p) => r.settled === null && (r.warning !== undefined || Boolean(m?.warning) || (p.heights.get(warningBoxId(r.id)) ?? 0) > 0);
var rowWarningEl = (box, gap, trunk) => div17().relative().pt(gap).child(box).children(trunk ? [trunk] : []);

// src/paint-blocks.ts
function rowEl(r, p) {
  const { t } = p;
  const m = p.motion.get(r.id);
  const isInert = m?.state === "leaving" || m?.blockSwap?.isOut === true;
  const isOpen = isOpenRow(r);
  const isPressable = r.isSelectable && !isInert;
  const swap = m?.swap ?? null;
  const shown = swap?.from ?? r;
  const hasTree = (m?.closing ?? shown).body.some((l) => l.tree !== undefined);
  const mark = markEl(shown.mark, t, markTintOf(shown, p)).id(`mark ${r.id}`);
  const trunk = trunkEl(LINE_HEIGHT, null, t, r.isSelected).id(`trunk ${r.id}`);
  const line = h_flex11().id(`title ${r.id}`).items_start().when(isPressable && isOpen, (e) => e.on_click((e, cx) => p.collapse(r.id, true, cx, e.modifiers.alt))).when(hasTree, (e) => e.relative().child(swap?.from ? swapFadeEl(swap, trunk) : panelFadeEl(r, m, p, trunk))).child(swap?.isMarkSwapped ? swapFadeEl(swap, mark) : mark).child(titleTextEl(r, p, titleColorOf(r, p))).when(shown.age !== null, (e) => {
    const age = div18().id(`age ${r.id}`).flex_none().ml(INSET).text_color(faintOf(t, r.isSelected ? t.selected : t.background)).child(shown.age ?? "");
    return e.child(swap?.isAgeSwapped ? swapFadeEl(swap, age) : age);
  });
  const lines = titleLineEls(r, shown, m, p, (l, n) => {
    const el = bodyLineEl(l, partPt(n === 0 ? "title" : "titleStatus", "titleStatus"), t, r.isSelected);
    return l.isHidden ? el.opacity(0) : el;
  }, (n) => hasTree ? panelFadeEl(r, m, p, trunkEl(0, null, t, r.isSelected).id(`trunk ${r.id} ${n}`)) : null, (el) => panelFadeEl(r, m, p, el));
  const titleEnd = lines.length > 0 ? "titleStatus" : "title";
  return v_flex7().id(`row ${r.id}`).pl(EDGE + r.depth * NEST).pr(EDGE).py(padOf(r)).when(r.isSelected, (e) => e.bg(t.selected)).when(isPressable && !isOpen, (e) => e.hover((s) => s.bg(t.hover)).on_click((e, cx) => r.isCollapsed ? p.collapse(r.id, false, cx, e.modifiers.alt) : p.select(r.id, cx))).child(titleEl(r, p, line)).child(sizeEl(restId(r.id), p, v_flex7().id(`form ${r.id}`).when(swap !== null, (e) => swapFadeEl(swap, e)).children(lines).children(panelEl(r, shown, m, p, isInert, titleEnd))));
}
function bodyEls(from, isSelected, p, isInert, titleEnd, warn) {
  const buttonOf = (id) => from.buttons.filter((b) => b.id === id);
  const sideBySide = isSideBySide(from, p) ? from.sideBySide : null;
  const answers = sideBySide ? from.buttons.filter((b) => sideBySide.optionIds.includes(b.id)) : [];
  const first = from.body.find((l) => l.optionId);
  const shown = sideBySide ? from.body.flatMap((l) => {
    if (l === first)
      return [
        { ...l, part: "answers", tree: "last" },
        ...sideBySide.recLine ? [
          {
            part: "reason",
            text: sideBySide.recLine,
            tone: "muted",
            isOptionNote: true
          }
        ] : []
      ];
    return l.optionId || l.isOptionNote ? [] : [l];
  }) : from.body;
  let end = titleEnd;
  let isWarned = false;
  const els = shown.map((l) => {
    const isFirstAnswer = !isWarned && (l.optionId !== undefined || l.part === "answers");
    const warning = isFirstAnswer ? warn(partPt(end, l.part), partPt("status", l.part), l.tree !== undefined) : null;
    const above = warning ? 0 : partPt(end, l.part);
    isWarned ||= isFirstAnswer;
    end = l.part;
    const buttons = l.part === "answers" ? answers : buttonOf(l.optionId);
    return [...warning ? [warning] : [], bodyLineEl(l, above, p.t, isSelected, buttons, p, isInert)];
  });
  return { els: addedLinesEls(from, shown, els, p), end, isWarned };
}
var swapFadeEl = (swap, el) => swap ? el.opacity(swap.opacity).transition("opacity", { duration: swap.fadeMs, easing: "ease-out" }) : el;
function panelEl(r, shown, m, p, isLeaving, titleEnd) {
  const from = m?.closing ?? shown;
  const isInert = isLeaving || from !== r;
  const actions = from.buttons.filter((b) => !b.isOption);
  const hasAnswers = from.buttons.some((b) => b.isOption);
  const followsAnswers = hasAnswers && actions[0]?.emphasis !== "quiet";
  const warn = (gap, gapBelow, isOnTree) => {
    if (!isWarningDrawn(from, m, p))
      return null;
    const line = (text) => bodyLineEl({ part: "status", text, tone: "error" }, 0, p.t, r.isSelected).pb(gapBelow);
    const box = warningBoxEl(r.id, from.warning ?? null, p, line, from !== r);
    return rowWarningEl(box, gap, isOnTree ? trunkEl(0, null, p.t, r.isSelected) : null);
  };
  const body = bodyEls(from, r.isSelected, p, isInert, titleEnd, warn);
  const end = from.field ? "field" : actions.length > 0 ? "buttons" : body.end;
  const next = from.field ? "field" : "buttons";
  const warning = !body.isWarned && end !== body.end ? warn(partPt(body.end, next), partPt("status", next), false) : null;
  const gapOf = (part) => warning ? 0 : partPt(body.end, part);
  const parts = [
    ...body.els,
    ...warning ? [warning] : [],
    ...actions.length > 0 ? [buttonsEl(actions, p, MARK_W, isInert, followsAnswers, gapOf("buttons"))] : [],
    ...from.field ? [fieldEl(from.field, p, MARK_W, isInert, m?.field).pt(gapOf("field"))] : [],
    ...underEls(r, m?.closing ?? shown, m, p, partPt(end, "result"))
  ];
  if (parts.length === 0)
    return [];
  const key = panelId(r.id);
  return [
    panelFadeEl(r, m, p, v_flex7().id(key).on_size_change((size, cx) => p.measure(key, size, cx)).children(parts))
  ];
}
function panelFadeEl(r, m, p, el) {
  const opacity = m?.swap?.panel ?? m?.panel ?? null;
  if (opacity === null)
    return el;
  const height = p.heights.get(panelId(r.id)) ?? 0;
  const turnBackFadeMs = m?.panelFadeMs ?? null;
  const isWaiting = m?.isPanelWaiting === true && turnBackFadeMs === null;
  const isHidden = isWaiting && opacity === 0;
  const delay = isWaiting && !isHidden ? enterDelayMs(height) : 0;
  const duration = isHidden ? 0 : turnBackFadeMs ?? ROW_FADE_MS[m?.state ?? "open"];
  return fadeEl(el, panelId(r.id), opacity, { duration, delay }, p);
}
function underEls(r, from, m, p, above) {
  const line = isStatusUnder(from) ? from.feedback : null;
  const isLeftForm = from !== r;
  const leaving = line && { line, opacity: 0, fadeMs: LEAVE_FADE_MS, delayMs: 0 };
  const atRest = line && { line, opacity: null, fadeMs: 0, delayMs: 0 };
  const u = isLeftForm ? leaving : m ? m.under : atRest;
  if (!u?.line)
    return [];
  const key = underId(r.id);
  return [
    bodyLineEl(u.line, above, p.t, r.isSelected).id(key).on_size_change((size, cx) => p.measure(key, size, cx)).when(u.opacity !== null, (e) => fadeEl(e, key, u.opacity ?? 1, { duration: u.fadeMs, delay: u.delayMs }, p))
  ];
}
function prEl(b, p, isInert) {
  const { t } = p;
  const title = h_flex11().items_start().child(div18().flex_1().min_w(0).font_semibold().whitespace_normal().child(b.title)).when(!p.isNarrow, (e) => e.child(div18().flex_none().ml(INSET).text_color(t.muted).child(b.number)));
  const statusParts = (l) => [
    ...p.isNarrow ? [div18().flex_none().text_color(t.muted).child(b.number)] : [],
    ...l.status ? [statusPartEl(l.status.text).text_color(colorOf(t, l.status.tone))] : [],
    ...l.unlisted.map((u) => statusPartEl(u).text_color(t.muted))
  ];
  const tail = prTailEls(b, p, {
    error: (text) => lineEl(text, t.ansi1, 0),
    buttons: (buttons, isGoing) => buttonsEl(buttons, p, 0, isInert || isGoing, false, CONTROL_GAP),
    result: (f) => feedbackEl(f, t)
  });
  const warning = warningBoxEl(b.id, b.warning, p, (text) => lineEl(text, colorOf(t, "error"), 0).pt(CONTROL_GAP));
  return v_flex7().pl(EDGE).pr(EDGE).child(sizeEl(prHeadId(b.id), p, title)).child(prStatusEl(b, p, (l) => div18().pt(INSIDE_GAP).child(partedEl(statusParts(l), t.muted)))).children([...tail.slice(0, 1), warning, ...tail.slice(1)]);
}
function textLineEl(b, p, isInert) {
  const { t } = p;
  return v_flex7().pl(EDGE).pr(EDGE).child(warningBoxEl(b.id, b.warning ?? null, p, (text) => lineEl(text, colorOf(t, "error"), 0).pb(LIST_GAP))).child(h_flex11().gap(CONTROL_GAP).items_center().child(div18().flex_1().min_w(0).whitespace_normal().child(b.text ?? "")).when(b.buttons.length > 0, (e) => e.child(h_flex11().flex_none().gap(CONTROL_GAP).children(b.buttons.map((x) => buttonEl(x, p, isInert)))))).when(b.under !== null, (e) => e.child(lineEl(b.under ?? "", t.muted, 0))).when(b.feedback !== null, (e) => e.child(feedbackEl(b.feedback, t)));
}
function countEls(b, left, p) {
  const count = b.count ?? left?.count ?? null;
  if (count === null)
    return [];
  const name = `count ${b.id}`;
  const isGoing = b.count === null && left !== null;
  const opacity = isGoing && p.now !== left.leftAt ? 0 : 1;
  const el = div18().id(name).text_color(p.t.muted).child(`${SEP}${count}`);
  return [fadeEl(el, name, opacity, { duration: isGoing ? LEAVE_FADE_MS : 0, delay: 0 }, p)];
}
function headingEl(b, p, isInert) {
  const { t } = p;
  const buttons = h_flex11().flex_none().gap(CONTROL_GAP).items_center().children(b.buttons.map((x) => buttonEl(x, p, isInert)));
  if (b.isLabel)
    return h_flex11().flex_wrap().pl(EDGE).pr(EDGE).gap(CONTROL_GAP).items_center().child(h_flex11().min_w(0).items_center().when(b.mark !== null, (e) => e.child(markEl(b.mark, t))).child(statusPartEl(b.text).text_color(b.mark?.tone ? colorOf(t, b.mark.tone) : t.muted))).child(ruleLine(t).min_w(END_SPACE)).child(buttons);
  return h_flex11().pl(EDGE).pr(EDGE).items_center().when(b.mark !== null, (e) => e.child(markEl(b.mark, t))).child(div18().min_w(0).whitespace_normal().font_semibold().child(b.text)).children(countEls(b, p.motion.get(b.id)?.countLeft ?? null, p)).child(div18().flex_1()).when(b.aside !== undefined, (e) => e.child(div18().flex_none().ml(INSET).font_family(p.mono).text_color(t.muted).child(b.aside ?? ""))).child(buttons);
}
var countsEl = (counts, t) => {
  const items = counts.items.map((c) => h_flex11().flex_none().children([
    div18().flex_none().text_color(colorOf(t, c.mark.tone)).child(c.mark.text),
    statusPartEl(`${NO_BREAK_SPACE}${c.text}`).text_color(t.muted)
  ]));
  const [first, ...rest] = items;
  const head = h_flex11().flex_wrap().min_w(0).children([...wordEls(counts.label, t.muted), ...first ? [first] : []]);
  return partedEl([head, ...rest], t.muted);
};
function foldEl(b, p, isInert) {
  const { t } = p;
  const press = {
    id: b.id,
    label: b.text,
    emphasis: "quiet",
    isOut: false,
    hotkey: null,
    does: { is: "view", change: b.change }
  };
  const fold = b.kind === "fold" ? b : null;
  const mark = fold?.mark;
  return h_flex11().id(`fold ${b.id}`).pl(mark === undefined ? TEXT_X + b.depth * NEST : EDGE).pr(EDGE).py(padOf(b)).items_start().text_color(fold?.level === "faint" ? faintOf(t) : t.muted).accessibility_label(b.text).when(!isInert, (e) => e.on_click((e, cx) => p.press(press, cx, e.modifiers.alt))).when(mark !== undefined, (e) => e.child(markEl(mark ?? null, t))).child(fold?.counts ? countsEl(fold.counts, t) : div18().min_w(0).whitespace_normal().child(b.text)).when(fold !== null, (e) => e.child(foldChevronEl(t, { isOpen: fold?.isOpen ?? false, isLive: !isInert, level: fold?.level ?? "muted" })));
}
function blockEl(b, p) {
  const { t } = p;
  const m = p.motion.get(b.id);
  const isLeaving = m?.state === "leaving";
  const isInert = isLeaving || m?.blockSwap?.isOut === true && m.blockSwap.parts === null;
  if (b.kind === "row")
    return rowEl(b, p);
  if (b.kind === "status")
    return statusEl(b, p, isLeaving);
  if (b.kind === "pr")
    return prEl(b, p, isInert);
  if (b.kind === "line")
    return textLineEl(b, p, isInert);
  if (b.kind === "heading")
    return headingEl(b, p, isInert);
  if (b.kind === "empty")
    return emptyEl(b, p, isInert);
  if (b.kind === "fold" || b.kind === "more")
    return foldEl(b, p, isInert);
  if (b.kind === "rule")
    return ruleEl(b, t);
  if (b.kind === "field") {
    const isShownAsOpening = m?.state === "entering" && m.box !== null && m.fadeMs === 0;
    const keepsButtonsFade = isLeaving ? { isOpen: true, delayMs: 0 } : null;
    const height = p.heights.get(b.id);
    const delayMs = enterDelayMs(height ?? 0);
    const opening = isShownAsOpening ? { isOpen: m.box === "open" && height !== undefined, delayMs } : keepsButtonsFade;
    return div18().pl(b.isAtEdge ? EDGE : TEXT_X).pr(EDGE).child(fieldEl(b.field, p, 0, isLeaving, opening));
  }
  if (b.kind === "note")
    return noteEl(b, t, (b.buttons ?? []).map((x) => buttonEl(x, p, isLeaving)));
  if (b.kind === "caption")
    return div18().pl(EDGE).pr(EDGE).text_color(t.muted).child(b.text);
  if (b.kind === "banner")
    return bannerEl(b.banner, t, b.buttons.map((x) => buttonEl(x, p, isLeaving)), b.feedback ? feedbackEl(b.feedback, t) : null);
  return div18();
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
  lines = {};
  ended = [];
  constructor(io) {
    this.io = io;
  }
  send(target, press, o) {
    const { effects, label, kind, reply, uiPressId } = o;
    const rowId = pressRowId(press);
    const refuse = (reason) => {
      this.lines[rowId] = notSentLine(reason);
      this.ended.push({ uiPressId, outcome: { error: reason, note: null, isUnconfirmed: false } });
      return { is: "refused" };
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
      uiPressId,
      rowId,
      path: pressPath(target.appHome, target.sessionId, pressId),
      action: outAction2(press),
      kind,
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
    delete this.lines[rowId];
    return { is: "sent", finish: (runHere, ran) => this.finish(out, now, target, press, effects, runHere, ran) };
  }
  async finish(out, pressedAt, target, press, effects, runHere, ran) {
    const pending = out.pending?.is === "local" ? out.pending.result : null;
    if (pending && isRunHere(effects, target.projectFolder)) {
      out.result = await runHere(effects, pending);
      ran();
    }
    const local = out.result ? { error: firstError(out.result) } : null;
    const text = pressFileText(out.pressId, pressedAt, press, target.holds, local, target.when);
    const failed = await this.io.write(out.path, text);
    if (failed !== null) {
      this.outs = this.outs.filter((o) => o !== out);
      this.endRefused(out, notAppliedText(failed));
      return;
    }
    out.isWritten = true;
    out.waitingSince = this.io.now();
    await this.io.wake(target.terminal, out.pressId);
  }
  endRefused(out, line) {
    this.lines[out.rowId] = line;
    const error = line.source.is === "notSent" ? line.source.reason : line.text;
    this.ended.push({ uiPressId: out.uiPressId, outcome: { error, note: null, isUnconfirmed: false } });
  }
  isAwaiting() {
    return this.outs.length > 0;
  }
  holdsPresses() {
    return this.outs.length > 0 || this.ended.length > 0;
  }
  takeEnded() {
    return this.ended.splice(0);
  }
  async settle(view, lastPress, agent) {
    for (const out of this.outs)
      if (out.isWritten)
        out.isTaken = await this.io.isGone(out.path);
    const now = this.io.now();
    const settled = settleOuts(this.outs, view, lastPress, now);
    const stillOut = new Set([...settled.outs, ...settled.toClaim].map((o) => o.rowId));
    for (const out of this.outs)
      if (!stillOut.has(out.rowId))
        delete this.lines[out.rowId];
    this.outs = settled.outs;
    this.lines = { ...this.lines, ...settled.lines };
    this.ended.push(...settled.ended);
    for (const out of settled.toClaim) {
      if (await this.io.claim(out.path)) {
        this.endRefused(out, notAppliedLine(out, agent));
        continue;
      }
      out.isTaken = true;
      out.waitingSince = this.io.now();
      this.outs = [...this.outs, out];
    }
  }
  nextCheckAt() {
    return nextOutCheckAt(this.outs, this.io.now());
  }
}

// src/io.ts
function herdrIo({ exec, hc, readTextFile, writeTextFile, home }) {
  const herdrRun = (args, opts) => exec(args[0] ?? "", args.slice(1), { cwd: opts.cwd, timeout: opts.timeoutMs }).catch((e) => ({
    code: 127,
    stdout: "",
    stderr: String(e)
  }));
  const isTrue = (args) => herdrRun(["test", ...args], { cwd: "/", timeoutMs: 5000 }).then((r) => r.code === 0);
  const probe = {
    async stat(path) {
      if (!await isTrue(["-e", path]))
        return null;
      const isFile = await isTrue(["-f", path]);
      return { isFile: () => isFile };
    },
    isExecutable: (path) => isTrue(["-x", path])
  };
  const queueIo = {
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
  const hereIo = (projectFolder, cx) => ({
    run: herdrRun,
    probe,
    home: home(),
    projectFolder,
    copy: (text) => cx.write_to_clipboard(text)
  });
  return { queueIo, hereIo };
}

// ../core/view/empty-tab.ts
var EMPTY_TITLES = {
  needsYou: NOTHING_NEEDED_TEXT,
  findings: "No findings yet",
  prs: "No PRs",
  prsFetching: "Checking for PRs…"
};
var EMPTY_STATUS_TEXT = {
  title: screenTabOf("overview").label,
  hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."
};
function prsEmptyHint(place) {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`;
}
function emptyTab(view, look) {
  if (look.tab === "overview") {
    const page = view.statusPage;
    if (!page.isEmpty)
      return null;
    return {
      ...EMPTY_STATUS_TEXT,
      under: {
        is: "set-goal",
        keys: goalKeyGroups(page).heading,
        offerKeys: goalKeyGroups(page).offer,
        isFieldOpen: look.isGoalFieldOpen,
        suggestion: page.suggestedGoal
      },
      titleMark: null
    };
  }
  if (look.tab === "prs") {
    if (look.drawn > 0)
      return null;
    const { refresh } = view.prs;
    return {
      title: look.isFetchingPrs ? EMPTY_TITLES.prsFetching : EMPTY_TITLES.prs,
      hint: ghNoticeOf(view.prs.gh)?.text ?? prsEmptyHint(look.place),
      under: refresh ? { is: "pr-refresh", refresh } : null,
      titleMark: null
    };
  }
  if (look.drawn > 0 || look.hasBlocker)
    return null;
  if (look.tab === "needsYou" && look.hostText)
    return { ...look.hostText, under: null, titleMark: null };
  const hint = look.tab === "needsYou" ? `${look.agent}'s questions and the tasks only you can do show up here.` : `${look.agent} flags issues and opportunities it spots beyond your task.`;
  const { text, isChecking } = nothingText(view.sync.ledger, EMPTY_TITLES[look.tab]);
  return { title: text, hint, under: null, titleMark: { isRunning: isChecking } };
}

// src/draw-prs.ts
var LOOK = "herdr";
var PLACE = "session";
var PR_TONE = {
  needsYou: "needsYou",
  success: "success",
  findings: "findings",
  error: "error"
};
function prButton(pr, a, id) {
  const effect = prPressEffect(pr, a.press);
  const does = { is: "press", press: a.press, effects: effect ? [effect] : [], kind: a.kind };
  const b = button(id, a.label, a.emphasis, does, a.hotkey);
  return { ...b, isOut: a.isOut };
}
function prFeedback(screen, id) {
  const { view, now } = screen;
  const f = feedbackOf(id, view.lastActions[id], undefined, view.turns, now);
  if (!f)
    return null;
  const tone = feedbackTone(f);
  if (!hasAge(f))
    return { text: feedbackText(f, LOOK), tone, source: f };
  const aged = { lead: markedFeedbackText(f, false, LOOK), at: f.at };
  return { text: agedText(aged, now), tone, source: f, aged };
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
  const plan = threadActions(pr, t, presses, true);
  const { keys, more } = splitFollowUps(plan.actions);
  const reply = t.reply ? `@${t.reply.author}: ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}` : null;
  const feedback = prFeedback(screen, id);
  return {
    kind: "row",
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.title,
    age: t.at === null ? null : shortAgo(screen.now - t.at),
    feedback: feedback ?? (text.fold?.note ? { text: text.fold.note, tone: "muted", source: null } : null),
    settled: null,
    isDim: text.mark.isDone,
    isSelectable: text.fold === null,
    body: [
      ...rest ? [{ part: "detail", text: clipLabel(rest, PR_QUOTE_CHARS), tone: null }] : [],
      { part: "detail", text: `${threadWhere(t)}${DOT}@${t.author}`, tone: "muted" },
      ...reply ? [{ part: "detail", text: reply, tone: null }] : []
    ],
    buttons: [
      ...sessionButtons(id, plan.sessionKey),
      ...[...keys, ...more].map((a, n) => prButton(pr, a, `${id} ${n}`))
    ],
    field: null,
    warning: stoppedWarningOf(screen.isSendHeld, plan.actions, feedback?.text ?? null)
  };
}
function checkRow(screen, pr, c, presses) {
  const id = prCheckId(pr, c);
  const text = checkRowText(pr, c);
  const plan = checkActions(pr, c, presses, true);
  const feedback = prFeedback(screen, id);
  return {
    kind: "row",
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.lead ? `${text.lead} / ${text.title}` : text.title,
    age: c.finishedAt === undefined ? null : shortAgo(screen.now - c.finishedAt),
    feedback: feedback ?? (text.fold ? { text: text.fold.note, tone: "muted", source: null } : null),
    settled: null,
    isDim: false,
    isSelectable: text.fold === null,
    body: [{ part: "detail", text: text.meta, tone: "muted" }],
    buttons: [
      ...sessionButtons(id, plan.sessionKey),
      ...plan.actions.map((a, n) => prButton(pr, a, `${pr.ref} ${checkKey(c)} ${n}`))
    ],
    field: null,
    warning: stoppedWarningOf(screen.isSendHeld, plan.actions, feedback?.text ?? null)
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
        effects: [],
        kind: null
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
    settled: { label: settledLabel(state.label, state.delivery, state.reply), tone: "muted", tint: null, at: state.at },
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
  const sync = prSyncOf(screen.view.sync, pr.ref);
  const shown = shownReadiness(pr, sync, isSent, screen.agent);
  const tone = shown ? PR_TONES[shown.status] : null;
  const isLastShown = !isDismissed(lastActions, pr.ref) && isBlockPressShown(pr, lastActions);
  const plan = prBlockActions(pr, isSent, screen.view.prs.branchRef, presses, sync, true);
  const feedback = isLastShown ? prFeedback(screen, prMarkId(pr.ref)) : null;
  const warning = prStoppedWarningOf(screen.isSendHeld, plan.actions, feedback?.text ?? null);
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
      const isCollapsed = screen.view.collapsed.includes(r.id);
      const isOpen = isSelected && !isCollapsed;
      const { warning, ...row } = r;
      return {
        ...row,
        isSelected,
        ...isCollapsed && { isCollapsed },
        body: isOpen ? r.body : [],
        buttons: isOpen ? r.buttons : [],
        ...isOpen && warning && { warning }
      };
    })
  ];
  return [
    {
      kind: "pr",
      id: prMarkId(pr.ref),
      number: `#${pr.number}`,
      title: pr.title,
      status: shown && { text: shown.head, tone: tone ? PR_TONE[tone] : "muted" },
      unlisted: shown?.unlisted ?? [],
      error: pr.error ? prRefreshFailedText(pr.error) : null,
      warning,
      buttons: [
        ...sessionButtons(pr.ref, plan.sessionKey),
        ...plan.actions.map((a, n) => prButton(pr, a, `${pr.ref} ${n}`))
      ],
      feedback
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
  tone,
  isHead: true,
  isAtEdge: false,
  isStrong: false,
  depth: 0
});
function refreshParts(screen, refresh = screen.view.prs.refresh) {
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
function orderLines(screen, presses) {
  const order = screen.view.prs.order;
  if (!order)
    return [];
  const changed = order.changed;
  const lines = [
    { kind: "line", id: "pr order", text: order.title, under: order.why, buttons: [], feedback: null }
  ];
  if (!changed)
    return lines;
  const plan = rankAgainPlan(changed.actions, presses, true);
  const buttons = [
    ...sessionButtons(RANK_AGAIN_ID, plan.sessionKey),
    ...plan.actions.map((a, n) => prButton(null, a, `order ${n}`))
  ];
  const feedback = changed.showsPress ? prFeedback(screen, RANK_AGAIN_ID) : null;
  const warning = prStoppedWarningOf(screen.isSendHeld, plan.actions, feedback?.text ?? null);
  const line = { kind: "line", id: RANK_AGAIN_ID, text: changed.text, under: null, buttons, feedback };
  return [...lines, warning ? { ...line, warning } : line];
}
function clearLine(screen) {
  const buttons = screen.view.prs.clear.map((a, n) => prButton(null, a, `clear ${n}`));
  return buttons.length === 0 ? [] : [{ kind: "line", id: CLEAR_FINISHED_ID, text: null, under: null, buttons, feedback: null }];
}
var ruleBetween = (ref) => ({ kind: "rule", id: `rule ${ref}`, text: null });
function prTabBlocks(screen, selected) {
  const { view } = screen;
  const prs = view.prs;
  const empty = emptyTab(view, {
    tab: "prs",
    place: PLACE,
    drawn: prs.drawn.length,
    isFetchingPrs: screen.isFetchingPrs
  });
  if (empty) {
    const refresh = empty.under?.is === "pr-refresh" ? refreshParts(screen, empty.under.refresh) : null;
    return [emptyBlock("prs", empty, refresh && { id: PR_REFRESH_ID, ...refresh, field: null })];
  }
  const presses = { lastActions: view.lastActions, turns: view.turns, now: screen.now };
  const notice = ghNoticeOf(prs.gh);
  const othersStart = otherPrsStart(prs.drawn);
  const caption = { kind: "caption", id: "other prs", text: OTHER_PRS_TEXT };
  const above = (d, n) => [
    ...n > 0 ? [ruleBetween(d.pr.ref)] : [],
    ...d === othersStart ? [caption] : []
  ];
  return [
    ...noticeBlocks(screen, notice),
    ...clearLine(screen),
    ...orderLines(screen, presses),
    ...prs.drawn.flatMap((d, n) => [...above(d, n), ...prBlocks(screen, d, presses, selected)]),
    ...prs.olderText ? [ruleBetween("older prs"), note("older prs", prs.olderText, "muted")] : []
  ];
}

// ../core/view/status-gaps.ts
function isOneLineStatusRow(r) {
  if (r.kind === "ask")
    return false;
  if (r.kind !== "subject")
    return true;
  return !r.text && !r.merged && !r.was && statusKeyPlan(r).length === 0;
}
function statusGaps(rows) {
  return rows.map((r, n) => {
    const prev = rows[n - 1];
    if (prev === undefined || prev.kind === "part" || r.kind === "part")
      return null;
    const isPairOneLine = isOneLineStatusRow(prev) && isOneLineStatusRow(r);
    if (r.depth > 0)
      return isPairOneLine ? LIST_GAP_PT : CHILD_GAP_PT;
    const itemStart = rows.findLastIndex((p, k) => k < n && p.depth === 0);
    return isPairOneLine && itemStart === n - 1 ? LIST_GAP_PT : ITEM_GAP_PT;
  });
}
var LATER_PAD_PT = LIST_GAP_PT / 2;

// src/draw-status.ts
var MERGED_CELLS = 150;
var toneOf = (t) => t ?? "muted";
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
  if (p.action === "toggle-collapse")
    return { is: "nothing" };
  if (p.action === "type-goal")
    return { is: "type", rowId: GOAL_KEYS_ID, text: p.text, hint: GOAL_FIELD.placeholder };
  return { is: "press", press: { action: p.action, id: GOAL_KEYS_ID }, effects: [], kind: k.kind };
}
function keyButtons(id, keys, from = 0) {
  return keys.map((k, n) => button(`${id} ${from + n}`, k.label, k.emphasis, doesOf(k)));
}
function foldOf(p, isCollapsed) {
  if (p.foldCount === 0)
    return {};
  const isFolded = isParentCollapsed(p, isCollapsed);
  const toggle = button(`${p.id} fold`, isFolded ? "Unfold" : "Fold", "quiet", {
    is: "collapse",
    id: p.id,
    isCollapsed: !isFolded
  });
  return { fold: { isFolded, count: p.foldCount, level: foldLevelOf(p), toggle } };
}
function underLines(text, merged, was) {
  const muted = (t) => t === null ? [] : [{ text: t, level: "muted" }];
  return [
    ...text ? [text] : [],
    ...muted(merged ? mergedLine(merged, (t) => cellWidth(t) <= MERGED_CELLS) : null),
    ...was ? [{ text: `${WAS_PREFIX}${was}`, level: WAS_LEVEL }] : []
  ];
}
function rowBlocks(row, isUnfolded, isCollapsed) {
  if (row.kind === "subject") {
    const under = underLines(row.text ? { text: row.text, level: textLevelOf(row) } : null, row.merged, row.was);
    return [
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf2(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        nameLevel: nameLevelOf(row, "plain"),
        stall: row.stall,
        under,
        buttons: keyButtons(row.id, statusKeyPlan(row)),
        ...foldOf(row, isCollapsed),
        ...hasTreeDown(row, isCollapsed) ? { tree: [{ depth: row.depth, is: "down" }] } : {}
      }
    ];
  }
  if (row.kind === "ask")
    return [
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf2(row.mark, row.tone, false),
        name: row.text,
        isBold: false,
        nameLevel: "plain",
        nameTone: row.tone,
        stall: null,
        under: [],
        buttons: keyButtons(row.id, statusKeyPlan(row)),
        ...row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}
      }
    ];
  if (row.kind === "child")
    return [
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf2(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        nameLevel: nameLevelOf(row, "muted"),
        stall: null,
        under: underLines(row.text ? { text: row.text, level: textLevelOf(row) } : null, null, null),
        buttons: [],
        ...row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}
      }
    ];
  if (row.kind === "more")
    return [
      {
        ...note2(row.id, row.text, "muted"),
        depth: row.depth,
        ...row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}
      }
    ];
  if (row.kind === "part")
    return [
      { kind: "gap", id: `gap ${row.id}` },
      { kind: "rule", id: row.id, text: row.text, ...row.isTitle && row.text ? { isTitle: true } : {} },
      ...row.description ? [{ ...note2(`${row.id} description`, row.description, "muted"), isAtEdge: true }] : []
    ];
  if (row.kind === "done-fold" || row.kind === "counts")
    return [
      {
        kind: "fold",
        id: row.id,
        depth: row.depth,
        text: row.kind === "counts" ? countsText(row.counts) : row.text,
        ...row.kind === "counts" ? {
          counts: {
            label: COUNTS_LABEL,
            items: row.counts.map((c) => ({ mark: markOf2(c.mark, c.tone, false), text: c.text }))
          }
        } : {},
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
      nameLevel: nameLevelOf(row, "muted"),
      stall: null,
      under: [],
      buttons: []
    }
  ];
}
var withGap = (b, gap) => gap != null && (b.kind === "status" || b.kind === "note" || b.kind === "fold") ? { ...b, gapAbove: gap } : b;
function listBlocks(rows, isUnfolded, isCollapsed) {
  const gaps = statusGaps(rows);
  return rows.map((r, n) => rowBlocks(r, isUnfolded, isCollapsed).map((b, k) => k === 0 ? withGap(b, gaps[n]) : b));
}
function milestoneBlock(m, lineAbove, hasWork, isUnfolded, isCollapsed) {
  const x = m.subject;
  const mark = markOf2(m.mark, m.tone, x?.isRunning ?? false);
  const path = { is: "milestone", above: lineAbove, below: m.line };
  const tree = hasWork && m.line === null ? { tree: [{ depth: 0, is: "down" }] } : {};
  if (m.foldId !== null)
    return {
      kind: "fold",
      id: m.id,
      depth: 0,
      text: m.name,
      isOpen: isUnfolded(m.foldId),
      change: { toggleFold: m.foldId },
      level: textLevelOf(m),
      mark,
      path,
      ...tree
    };
  return {
    kind: "status",
    id: m.id,
    depth: 0,
    mark,
    name: m.name,
    isBold: m.isBold,
    nameLevel: nameLevelOf(m, m.isMuted ? "muted" : "plain"),
    stall: x?.stall ?? null,
    under: underLines(m.text ? { text: m.text, level: textLevelOf(m) } : null, x?.merged ?? null, m.was),
    buttons: keyButtons(m.id, milestoneKeyPlan(m)),
    ...foldOf(m, isCollapsed),
    path,
    ...tree
  };
}
function jointStroke({ arm, beside }) {
  if (arm === "elbow")
    return { depth: 0, is: "last" };
  if (beside === "connector")
    return { depth: 0, is: arm === "tee" ? "mid" : "past" };
  return arm === null ? null : { depth: 0, is: "arm" };
}
function besidePath(b, line, joint) {
  if (b.kind !== "status" && b.kind !== "fold" && b.kind !== "note")
    return b;
  const stroke = joint ? jointStroke(joint) : null;
  return {
    ...b,
    ...line === null ? {} : { path: { is: "work", line } },
    ...stroke ? { tree: [stroke, ...b.tree ?? []] } : {}
  };
}
var note2 = (id, text, tone) => ({
  kind: "note",
  id,
  text,
  tone,
  isHead: false,
  isAtEdge: false,
  isStrong: false,
  depth: 0
});
var headNote = (id, text, tone) => ({
  ...note2(id, text, tone),
  isHead: true,
  isAtEdge: true
});
var headTitle = (id, text) => ({
  ...note2(id, text, null),
  isHead: true,
  isAtEdge: true,
  isStrong: true
});
function goalBlocks(page, { isUnfolded, isCollapsed, goalField }) {
  const g = page.goal;
  const groups = goalKeyGroups(page);
  const isSuggested = goalField === null && page.suggestedGoal !== null;
  const heading = {
    kind: "heading",
    id: "goal heading",
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: g?.mark ? { text: g.mark.mark, tone: "success", isRunning: false } : null,
    buttons: keyButtons(GOAL_KEYS_ID, groups.heading),
    isLabel: true
  };
  const field = goalField ? [{ kind: "field", id: "goal field", field: goalField, isAtEdge: g?.mark == null }] : [];
  const suggestion = [
    {
      ...headTitle("goal text", suggestedGoalOffer(page.suggestedGoal ?? "")),
      buttons: keyButtons(GOAL_KEYS_ID, groups.offer, groups.heading.length)
    }
  ];
  if (g === null) {
    const empty = isSuggested ? suggestion : [headNote("goal text", NO_GOAL_TEXT, "muted")];
    return [heading, ...goalField ? field : empty];
  }
  const atText = (b) => g.mark && b.kind === "note" ? { ...b, isAtEdge: false } : b;
  const lines = goalField ? field : (isSuggested ? suggestion : [
    headTitle("goal text", g.text),
    ...g.was ? [{ ...headNote("goal was", `${WAS_PREFIX}${g.was}`, "muted"), level: WAS_LEVEL }] : [],
    ...g.now ? [headNote("goal now", g.now, "muted")] : []
  ]).map(atText);
  const fold = g.milestonesFold;
  const foldLine = fold ? [
    {
      kind: "fold",
      id: fold.id,
      depth: 0,
      text: fold.text,
      isOpen: isUnfolded(fold.id),
      change: { toggleFold: fold.id }
    }
  ] : [];
  const shown = shownMilestones(g, isUnfolded);
  const milestones = shown.flatMap((m, n) => {
    const rows = milestoneRows(m, isUnfolded, isCollapsed);
    const joints = workJoints(rows, m.line);
    return [
      ...isSpacedAbove(shown, n, isUnfolded, isCollapsed) ? [{ kind: "gap", id: `gap ${m.id}`, ...n > 0 ? { isMilestoneStep: true } : {} }] : [],
      ...m.startsLater ? [{ kind: "rule", id: "goal later", text: LATER_TEXT }] : [],
      milestoneBlock(m, shown[n - 1]?.line ?? null, rows.length > 0, isUnfolded, isCollapsed),
      ...listBlocks(rows, isUnfolded, isCollapsed).map((bs, k) => bs.map((b) => besidePath(b, m.line, joints[k]))).flat()
    ];
  });
  return [heading, ...lines, ...foldLine, ...milestones];
}
function statusBlocks(view, ui) {
  const page = view.statusPage;
  const { isUnfolded, isCollapsed } = ui;
  const empty = emptyTab(view, { tab: "overview", isGoalFieldOpen: ui.goalField !== null });
  if (empty) {
    const setGoal = empty.under?.is === "set-goal" ? empty.under : null;
    const parts = setGoal && {
      id: GOAL_KEYS_ID,
      text: setGoal.suggestion === null ? null : suggestedGoalOffer(setGoal.suggestion),
      buttons: setGoal.isFieldOpen ? [] : [
        ...keyButtons(GOAL_KEYS_ID, setGoal.keys),
        ...keyButtons(GOAL_KEYS_ID, setGoal.offerKeys, setGoal.keys.length)
      ],
      feedback: null,
      field: setGoal.isFieldOpen ? ui.goalField : null
    };
    return [emptyBlock("overview", empty, parts)];
  }
  const top = goalBlocks(page, ui);
  const rows = listBlocks(unfoldedRows(page.rows, isUnfolded, isCollapsed), isUnfolded, isCollapsed).flat();
  const isGapNeeded = rows.length > 0 && page.rows[0]?.kind !== "part";
  return isGapNeeded ? [...top, { kind: "gap", id: "gap rows" }, ...rows] : [...top, ...rows];
}

// src/draw.ts
var LOOK2 = "herdr";
var markOf3 = (m) => m ? { text: m.text, tone: m.tone ?? "muted", isRunning: m.isRunning } : null;
function rowDoes(row, press, kind, agent) {
  if (press.action === "type")
    return { is: "type", rowId: row.id, text: "", hint: replyHint(row, agent) };
  if (press.action === "discard")
    return { is: "leave", rowId: row.id, isDiscard: true };
  const effects = kind === "local" ? localEffects(row, press) : [];
  return { is: "press", press, effects, kind };
}
function rowButtons(row, isAllShown, agent) {
  const { options, keys, more, sessionKey } = rowKeyPlan(row, isAllShown, true);
  const answers = options.map((o, n) => ({
    ...button(`${row.id} ${n}`, actionLabel(o.action), o.action.emphasis, rowDoes(row, o.action.press, o.action.kind, agent), o.hotkey ?? null),
    isOut: o.action.isOut,
    isOption: true
  }));
  return [
    ...answers,
    ...sessionButtons(row.id, sessionKey),
    ...[...keys, ...more].map((k, n) => {
      const id = `${row.id} ${options.length + n}`;
      if (k.slot === "allOptions")
        return button(id, k.label, k.emphasis, { is: "view", change: { showOptions: row.id } });
      if (k.slot === "retry")
        return button(id, k.label, k.emphasis, rowDoes(row, k.press, k.kind, agent));
      const { action } = k;
      const does = rowDoes(row, action.press, action.kind, agent);
      return {
        ...button(id, actionLabel(action), action.emphasis, does, k.hotkey ?? null),
        isOut: action.isOut,
        ...action.isFollowUp ? { isFollowUp: true } : {}
      };
    })
  ];
}
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
  if (!row.state.offersUndo)
    return [];
  const leftAt = row.state.delivery === "queued" ? undoPlaceEndsAt(row.state) : null;
  if (leftAt !== null && now >= leftAt + HOLD_MS)
    return [];
  const leaving = leftAt !== null && now >= leftAt ? { leftAt } : {};
  return [{ ...button(id, ROW_COPY.undo, "quiet"), isSpent: true, ...leaving, runsOutAt }];
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
function plannedKinds(row, isAllShown) {
  const { options, keys, more } = rowKeyPlan(row, isAllShown, true);
  return [
    ...options.map((o) => ({ kind: o.action.kind })),
    ...[...keys, ...more].flatMap((k) => ("action" in k) ? [{ kind: k.action.kind }] : ("kind" in k) ? [{ kind: k.kind }] : [])
  ];
}
function rowBody(row, isAllShown) {
  const options = rowKeyPlan(row, isAllShown).options.map((o, n) => [
    { part: "answer", optionId: `${row.id} ${n}`, text: "", tone: "muted" },
    ...o.note ? [{ part: "note", text: o.note, tone: "muted", isOptionNote: true }] : []
  ]);
  const holdsUp = row.holdsUpLine ? [[{ part: "holdsUp", text: row.holdsUpLine, tone: "muted" }]] : [];
  const branches = [...holdsUp, ...options];
  const lastBranch = branches.length - 1;
  const isTrunkAfterHoldsUp = options.length > 0;
  const tree = (branch, line) => line > 0 ? branch === lastBranch ? undefined : "trunk" : branch === lastBranch ? "last" : "tee";
  const branchLines = (branch) => (branches[branch] ?? []).map((l, line) => {
    const placed = tree(branch, line);
    return placed ? { ...l, tree: placed } : l;
  });
  const contextTree = isTrunkAfterHoldsUp ? { tree: "trunk" } : {};
  const lines = [
    ...holdsUp.flatMap((_, branch) => branchLines(branch)),
    { part: "context", text: row.contextLine ?? "", tone: "muted", ...contextTree },
    { part: "earlier", text: row.earlierLine ? earlierLineText(row.earlierLine) : "", tone: "muted", ...contextTree },
    { part: "detail", text: row.detail ?? "", tone: null },
    { part: "file", text: row.fileName ? `${ROW_COPY.relevantFile}${row.fileName}` : "", tone: "muted" },
    ...options.flatMap((_, n) => branchLines(holdsUp.length + n))
  ];
  return lines.filter((l) => l.text || l.lead || l.optionId);
}
function sideBySideOf(row, isAllShown) {
  const { options, answerRow } = rowKeyPlan(row, isAllShown);
  return answerRow ? { sideBySide: { optionIds: options.map((_, n) => `${row.id} ${n}`), recLine: answerRow.recLine } } : {};
}
function rowAge(row, now) {
  if (row.state.is === "settled")
    return null;
  const at = rowAgeAt(row.feedback, row.at);
  return at === null ? null : shortAgo(now - at);
}
function rowBlock(row, ui, selected, screen) {
  const { state, feedback: f } = row;
  const isSettled = state.is === "settled";
  const isAllShown = ui.optionsShown.includes(row.id);
  const text = rowFeedbackText(row, LOOK2);
  const isSelected = !isSettled && row.id === selected;
  const isCollapsed = screen.view.collapsed.includes(row.id);
  const isOpen = isSelected && !isCollapsed;
  const isTyping = ui.typing === row.id;
  const warning = isOpen ? stoppedWarningOf(screen.isSendHeld, plannedKinds(row, isAllShown), text) : null;
  return {
    kind: "row",
    id: row.id,
    depth: 0,
    mark: markOf3(rowMark(row)),
    title: rowTitle(row, LOOK2),
    age: rowAge(row, screen.now),
    feedback: text && f ? { text, tone: feedbackTone(f), source: f } : null,
    settled: isSettled ? {
      label: settledLabel(state.label, state.delivery, state.reply),
      tone: settledTone(state),
      tint: closedTitleTone(state) === "muted" ? null : closedTitleTone(state),
      at: state.at
    } : null,
    isDim: isSettled,
    isSelectable: !isSettled,
    isSelected,
    ...isCollapsed && { isCollapsed },
    body: isOpen ? rowBody(row, isAllShown) : [],
    ...isOpen ? sideBySideOf(row, isAllShown) : {},
    buttons: isSettled ? [...rowButtons(row, isAllShown, screen.agent), ...undoButtons(row, screen.agent, screen.now)] : isOpen ? rowButtons(row, isAllShown, screen.agent).filter((b) => !isTyping || b.isOption) : [],
    field: isOpen && isTyping ? fieldOf(row.id, fieldExit(row) === "discard") : null,
    ...warning && { warning }
  };
}
function closedBlock(d, now) {
  const { action, sessionKey } = closedLinePlan(d, true);
  const closedDoes = action ? { is: "press", press: action.press, effects: [], kind: null } : { is: "nothing" };
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
    buttons: [
      ...sessionButtons(`closed ${d.id}`, sessionKey),
      ...action ? [button(`closed ${d.id} 0`, action.label, "quiet", closedDoes)] : []
    ],
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
      tone: "muted",
      isHead: false,
      isAtEdge: false,
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
      mark: { text: g.mark.mark, tone: g.mark.tone, isRunning: false },
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
var waitsOf = (groups, collapsed) => groups.flatMap((g) => g.rows).map((r) => ({ id: r.id, isWaiting: isWaitingRow(r), isCollapsed: collapsed.includes(r.id) }));
function rowWaits({ view, shownSince }, tab) {
  if (tab === "prs")
    return prRowWaits(openPrViews(view.prs.drawn), view.lastActions, view.collapsed);
  return tab === "overview" ? [] : waitsOf(groupsOf(view, tab, shownSince), view.collapsed);
}
function rowTabBlocks(screen, ui, tab) {
  const groups = groupsOf(screen.view, tab, screen.shownSince);
  const empty = emptyTab(screen.view, {
    tab,
    agent: screen.agent,
    drawn: groups.filter((g) => g.rows.length > 0 || g.closed.length > 0).length,
    hasBlocker: false
  });
  if (empty)
    return [emptyBlock(tab, empty)];
  return groups.flatMap((g, n) => [
    ...n > 0 ? [{ kind: "rule", id: `rule ${g.kind}`, text: null }] : [],
    ...groupBlocks(g, ui, ui.selected, screen)
  ]);
}
function tabCells(screen, tab) {
  const { view } = screen;
  const counts = { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count };
  return shownTabs().map((t) => ({
    id: t.id,
    label: t.label,
    badge: tabBadge(t.id, counts),
    isSelected: t.id === tab
  }));
}
function chrome(screen, tab) {
  const error = footerError(tab, screen.view.status, screen.view.statusPage);
  return { banners: tabBarBanners([], error, null) };
}
function tabBlocks(screen, ui) {
  if (ui.tab === "overview") {
    const goalField = ui.typing === GOAL_KEYS_ID ? fieldOf(GOAL_KEYS_ID, false, goalSubmitLabel(screen.view.statusPage)) : null;
    return statusBlocks(screen.view, {
      isUnfolded: (id) => ui.statusUnfolded.includes(id),
      isCollapsed: (id) => screen.view.collapsed.includes(id),
      goalField
    });
  }
  if (ui.tab === "prs")
    return prTabBlocks(screen, ui.selected);
  return rowTabBlocks(screen, ui, ui.tab);
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
var readView = (read, now, holds, notes) => withDialogRow(sessionView(read.session, now, SETTLED_MS, holds, notes, false, {
  ...NO_SYNC_INPUTS,
  isReadFailed: read.isReadFailed,
  isFetchingPrs: read.isFetchingPrs,
  turnReadFailedAt: read.turnReadFailedAt
}), read.openDialog, read.envelope.agent);
function screenOf(followed, read, ui, o) {
  const shown = messageOf(followed, read);
  const raw = o.view;
  if (shown !== null || read?.is !== "read" || raw === null)
    return shown ?? message(READING_TEXT, null);
  const view = o.collapsed ? { ...raw, collapsed: o.collapsed(raw) } : raw;
  const screen = {
    view,
    agent: read.envelope.agent,
    now: o.now,
    shownSince: o.shownSince ?? o.now,
    isGhMissing: read.session.prViews.isGhMissing === true,
    isFetchingPrs: read.isFetchingPrs,
    isSendHeld: read.isSendHeld
  };
  return {
    is: "inbox",
    view,
    tabs: tabCells(screen, ui.tab),
    ...chrome(screen, ui.tab),
    trimmedNote: read.isTrimmed ? TRIMMED_NOTE : null,
    helpVersion: read.envelope.version ? helpVersionText(read.envelope.version, read.envelope.isNextBuild === true) : null,
    blocks: drawOuts(tabBlocks(screen, ui), o.queue.outs, o.queue.lines, o.now),
    waits: rowWaits(screen, ui.tab)
  };
}

// src/fetched.ts
function screenAt(look, read, ui, view, now) {
  const collapsed = (v) => collapsedOf(ui, v);
  const presses = { now, view, shownSince: ui.shownSince, collapsed, queue: look.queue };
  const lookUi = lookUiOf(ui, view && { ...view, collapsed: collapsed(view) });
  return screenOf(look.followed, read, lookUi, presses);
}
var NONE_FETCHED = new Set;
function fetchedIds(look, from, to, ui, now) {
  if (from === null || to === null || from === to)
    return NONE_FETCHED;
  const blocksOf = (read) => {
    const s = screenAt(look, read, ui, readView(read, now, holdsOf(ui, now), notesOf(ui)), now);
    return s.is === "inbox" ? s.blocks : [];
  };
  const before = new Map(blocksOf(from).map((b) => [b.id, JSON.stringify(b)]));
  return new Set(blocksOf(to).flatMap((b) => before.get(b.id) === JSON.stringify(b) ? [] : [b.id]));
}

class FetchedReads {
  drawn = { read: null, at: 0, before: null };
  noted = { ids: NONE_FETCHED, inFrame: NONE_FETCHED };
  note(look, read, ui, now) {
    const { at, before } = this.drawn;
    const ids = fetchedIds(look, this.drawn.read, read, ui, now);
    this.noted = { ids, inFrame: at === now ? fetchedIds(look, before, read, ui, now) : ids };
  }
  drew(read, isAnswer, now) {
    const isSameFrame = this.drawn.at === now;
    const ids = isAnswer ? NONE_FETCHED : isSameFrame ? this.noted.inFrame : this.noted.ids;
    const before = isSameFrame ? this.drawn.before : this.drawn.read;
    this.drawn = { read, at: now, before };
    this.noted = { ids: NONE_FETCHED, inFrame: NONE_FETCHED };
    return ids;
  }
}

// src/view-cache.ts
class ViewCache {
  shown;
  kept = null;
  timer = null;
  constructor(shown) {
    this.shown = shown;
  }
  at(now) {
    const s = this.shown();
    if (s === null)
      return null;
    const k = this.kept;
    const isKept = k !== null && k.read === s.read && k.ui === s.ui && now < k.until;
    return isKept ? k.view : this.build(s.read, s.ui, now);
  }
  prepare(cx, isFresh = false) {
    this.timer?.cancel();
    this.timer = null;
    const s = this.shown();
    if (s === null)
      return;
    const now = Date.now();
    if (isFresh)
      this.build(s.read, s.ui, now);
    else
      this.at(now);
    const until = this.kept?.until ?? Infinity;
    if (until === Infinity)
      return;
    this.timer = cx.timer.after(Math.max(0, until - now), (cx) => {
      this.prepare(cx);
      cx.notify();
    });
  }
  build(read, ui, now) {
    const view = readView(read, now, holdsOf(ui, now), notesOf(ui));
    this.kept = { read, ui, view, until: readWakeAt(ui, view, now) ?? Infinity };
    return view;
  }
}

// src/status-look.ts
var LIST_INPUT_STEP_MS = 250;
var LOOK_TICK_MS = 1000;
var REREAD_MS = 1e4;
var AGE_TICK_MS = 60000;
var LOOK_GAP_MS = 3 * LOOK_TICK_MS;
function ownPaneId(propsPane, panes, tab, terminals, followed) {
  if (propsPane)
    return propsPane;
  const inboxPanes = panes.filter((p) => p.tab === tab && p.mod === "inbox").map((p) => p.pane);
  if (inboxPanes.length === 1)
    return inboxPanes[0];
  const labelled = terminals.find((t) => t.address === followed)?.labels?.[PANEL_LABEL];
  return labelled !== undefined && inboxPanes.includes(labelled) ? labelled : undefined;
}
function isPaneShown(paneId, panes, spaces, window2) {
  const own = panes.find((p) => p.pane === paneId);
  const tab = spaces.find((s) => s.active)?.tabs.find((t) => t.id === own?.tab);
  return own !== undefined && window2?.active === true && tab?.active === true && (!tab.zoomed || own.zoomed);
}
function statusPlaced(blocks, heightOf, page, room) {
  const subjects = new Map(statusListRows(page).map((r) => [r.id, seenSubjectIds(r)]));
  const rows = [];
  let y = 0;
  for (const { block, above } of spacesOf(blocks, () => false)) {
    const height = heightOf(block.id);
    if (height === undefined)
      return null;
    y += above;
    const ids = subjects.get(block.id) ?? [];
    if (ids.length > 0)
      rows.push({ top: y + padOf(block), subjects: ids });
    y += height;
  }
  return { rows, height: y, room };
}
function surelyShown({ rows, height, room }) {
  const scrollEnd = Math.max(0, height - room);
  return rows.filter((r) => r.top >= scrollEnd && r.top + LINE_HEIGHT <= room).flatMap((r) => r.subjects);
}
function statusDrawn(sessionId, read, view, blocks, heights, room) {
  if (sessionId === null || read === null)
    return null;
  const placed = room === null ? null : statusPlaced(blocks, (k) => heights.get(k), view.statusPage, room);
  return { sessionId, terminal: read.envelope.terminal, writtenAt: read.envelope.writtenAt, placed };
}

class StatusLook {
  drawn = null;
  restsFrom = 0;
  run = null;
  drew(drawn, now) {
    const isSamePlaces = JSON.stringify(drawn?.placed ?? null) === JSON.stringify(this.drawn?.placed ?? null);
    if (!isSamePlaces)
      this.restsFrom = now;
    this.drawn = drawn;
  }
  check(isPaneShown, now) {
    const d = isPaneShown ? this.drawn : null;
    const run = this.run;
    const goesOn = d !== null && run?.sessionId === d.sessionId && now - run.lastShownAt <= LOOK_GAP_MS;
    const ended = run && !goesOn ? lookOf(run) : null;
    if (!goesOn)
      this.run = d && {
        sessionId: d.sessionId,
        terminal: d.terminal,
        startedAt: now,
        lastShownAt: now,
        drawnWrittenAt: d.writtenAt,
        shown: {}
      };
    if (this.run && d) {
      this.run.lastShownAt = now;
      this.run.drawnWrittenAt = d.writtenAt;
      const isAtRest = d.placed !== null && now - this.restsFrom >= HEIGHT_SETTLE_MS;
      const shownAt = Math.min(now, d.writtenAt);
      for (const id of isAtRest && d.placed ? surelyShown(d.placed) : [])
        this.run.shown[id] = shownAt;
    }
    return ended;
  }
}
function lookOf({ sessionId, terminal, startedAt, lastShownAt, drawnWrittenAt, shown }) {
  if (lastShownAt - startedAt < LOOK_MIN_MS)
    return null;
  return { sessionId, terminal, look: { startedAt, endedAt: lastShownAt, shown, drawnWrittenAt } };
}
async function writeLook(io, appHome, ended) {
  const id = newPressId(ended.look.endedAt, io.random());
  const file = { format: HERDR_FORMAT, id, look: ended.look };
  if (await io.write(pressPath(appHome, ended.sessionId, id), JSON.stringify(file)) === null)
    await io.wake(ended.terminal, id);
}

// src/look-reports.ts
var SHOWN_REPORT_MS = { prs: 30000, overview: HERDR_CHECK_MS / 2 };
function shownTarget(isPaneShown, tab, sessionId, read) {
  if (!isPaneShown || tab !== "prs" && tab !== "overview" || sessionId === null || read?.is !== "read")
    return null;
  return { sessionId, terminal: read.envelope.terminal, tab };
}

class ShownReport {
  last = null;
  check(target, now) {
    if (target === null) {
      this.last = null;
      return null;
    }
    const last = this.last;
    const isSame = last?.sessionId === target.sessionId && last.tab === target.tab;
    if (isSame && now - last.at < SHOWN_REPORT_MS[target.tab])
      return null;
    this.last = { sessionId: target.sessionId, tab: target.tab, at: now };
    return target;
  }
}
async function writeShown(io, appHome, target, now) {
  const id = newPressId(now, io.random());
  const file = target.tab === "prs" ? { format: HERDR_FORMAT, id, prsShown: { at: now } } : { format: HERDR_FORMAT, id, statusShown: { at: now } };
  if (await io.write(pressPath(appHome, target.sessionId, id), JSON.stringify(file)) === null)
    await io.wake(target.terminal, id);
}

class LookReports {
  status = new StatusLook;
  shown = new ShownReport;
  async check(io, appHome, isPaneShown, page, now) {
    const ended = this.status.check(isPaneShown, now);
    if (ended)
      await writeLook(io, appHome, ended);
    const target = this.shown.check(shownTarget(isPaneShown, page.tab, page.sessionId, page.read), now);
    if (target)
      await writeShown(io, appHome, target, now);
  }
}

// src/background.ts
function startBackground(look, app, cx) {
  if (app.isChecking())
    return;
  cx.spawn(async (cx) => {
    for (;; ) {
      const changed = await app.watchFolder(publishedSessionsFolder(app.appHome())).catch(() => null);
      if (changed === null)
        await cx.sleep(REREAD_MS);
      else if (look.sessionId && isSessionChange(changed, app.appHome(), look.sessionId))
        look.load(look.sessionId, cx);
    }
  });
  cx.timer.every(REREAD_MS, (cx) => look.sessionId && look.load(look.sessionId, cx));
  cx.timer.every(AGE_TICK_MS, (cx) => {
    look.viewCache.prepare(cx, true);
    cx.notify();
  });
  cx.timer.every(LOOK_TICK_MS, (cx) => cx.spawn(() => look.checkLook()));
}

// src/main.ts
var { queueIo, hereIo } = herdrIo({ exec, hc, readTextFile, writeTextFile, home });
var isChecking = () => herdr.checking?.() ?? false;

class Inbox extends View {
  tab = null;
  last = null;
  pane = undefined;
  followed = { is: "no-terminal" };
  sessionId = null;
  read = null;
  ui = freshUi(HERDR_LOOK);
  shownAt = Date.now();
  isOpened = false;
  paneWidth = Infinity;
  listHeight = null;
  left = {};
  queues = {};
  input = null;
  queue = new PressQueue(queueIo);
  tracks = NO_TRACKS;
  drawnTabs = [];
  heights = new Heights;
  viewCache = new ViewCache(() => {
    const read = this.readSession;
    return read && { read, ui: this.ui };
  });
  tracksOf = "";
  blocks = [];
  lastDraw = NO_DRAW;
  timeLeft = new Map;
  linesAbove = NO_LINES_ABOVE;
  focus = null;
  movedAt = 0;
  fetched = new FetchedReads;
  outTimer = null;
  drawTimer = null;
  fades = new HeldFades;
  wake = null;
  look = new LookReports;
  init(_props, cx) {
    this.focus = cx.focus_handle();
    startBackground(this, { isChecking, appHome, watchFolder }, cx);
  }
  get readSession() {
    return this.read?.is === "read" ? this.read : null;
  }
  viewAt(now) {
    return this.viewCache.at(now);
  }
  apply(events, cx, from = null) {
    const now = Date.now();
    const view = this.viewAt(now);
    if (view === null)
      return;
    const isMove = events.some(isLookMove);
    if (isMove && this.movedAt <= this.tracks.drawnAt)
      this.fetched.note(this, this.readSession, this.ui, now);
    const applied = applyEvents(this.ui, view, events, now);
    this.ui = applied.ui;
    if (isMove)
      this.movedAt = now;
    this.syncInput(isMove);
    for (const c of applied.commands)
      this.run(c, from, cx);
    this.schedule(applied.nextWakeAt, view, cx);
    this.viewCache.prepare(cx);
    if (!this.endPresses(cx) && !events.every((e) => e.type === "list-input" || e.type === "edit-draft"))
      cx.notify();
  }
  endPresses(cx) {
    const ended = this.queue.takeEnded();
    if (ended.length > 0)
      this.apply(ended.map((e) => ({ type: "press-settled", pressId: e.uiPressId, outcome: e.outcome })), cx);
    return ended.length > 0;
  }
  run(c, from, cx) {
    const sessionId = this.sessionId;
    const read = this.readSession;
    if (c.kind === "press")
      this.send(c, from, cx);
    else if (c.kind === "save-collapse" && sessionId && read) {
      const to = { appHome: appHome(), sessionId };
      const collapse = { isCollapsed: c.isCollapsed, at: Date.now() };
      cx.spawn(() => writeCollapse(queueIo, to, read, c.id, collapse));
    } else if (c.kind === "read" && sessionId)
      this.load(sessionId, cx);
  }
  syncInput(isMove) {
    const typing = this.ui.typing;
    if (this.input !== null && this.input.rowId === typing)
      return;
    const hadField = this.input !== null;
    this.releaseField();
    if (typing === null)
      return void (hadField && this.focus?.focus());
    const state = InputState.new({ placeholder: this.hints[typing] ?? "", value: this.ui.drafts[typing]?.text ?? "" });
    state.on("change", (_e, cx) => this.apply([{ type: "edit-draft", id: typing, text: state.value() }], cx));
    state.on("submit", (_e, cx) => this.apply(buttonEvents({ is: "send", rowId: typing }, this.ui, "key"), cx));
    this.input = { rowId: typing, state };
    if (isMove || this.focus?.is_focused())
      state.focus();
  }
  releaseField() {
    this.input?.state.release();
    this.input = null;
  }
  hints = {};
  schedule(at, view, cx) {
    const readAt = at === null ? null : readWakeAt(this.ui, view, Date.now());
    const isRead = readAt !== null && at !== null && readAt <= at;
    if (this.wake !== null && this.wake.at === at && this.wake.isRead === isRead)
      return;
    this.wake?.timer.cancel();
    this.wake = null;
    if (at === null)
      return;
    const timer = cx.timer.after(Math.max(0, at - Date.now()), (cx) => {
      this.wake = null;
      if (isRead && this.sessionId)
        this.load(this.sessionId, cx);
      else
        this.apply([{ type: "tick" }], cx);
    });
    this.wake = { at, isRead, timer };
  }
  load(sessionId, cx) {
    cx.spawn(async (cx) => {
      const read = await readSessionFile(readTextFile, publishedSessionPath(appHome(), sessionId), (ms) => cx.sleep(ms));
      if (this.sessionId !== sessionId)
        return;
      this.read = read;
      if (this.movedAt > this.tracks.drawnAt)
        this.fetched.note(this, this.readSession, this.ui, Date.now());
      if (read.is !== "read")
        return void cx.notify();
      if (!this.isOpened)
        this.ui = opened(this.ui, this.shownAt);
      this.isOpened = true;
      this.apply([{ type: "read", host: hostFactsOf(read) }], cx);
      await this.settle(read, cx);
    });
  }
  async checkLook(isClosing = false) {
    const isShown = !isClosing && isPaneShown(this.pane, panes(), spaces(), herdrWindow());
    const page = { tab: this.ui.tab, sessionId: this.sessionId, read: this.read };
    await this.look.check(queueIo, appHome(), isShown, page, Date.now());
  }
  close() {
    return this.checkLook(true);
  }
  async settle(read, cx) {
    const queue = this.queue;
    const view = this.viewAt(Date.now());
    if (view === null || !queue.isAwaiting())
      return;
    await queue.settle(view, read.lastPress, read.envelope.agent);
    if (queue !== this.queue)
      return;
    if (!this.endPresses(cx))
      cx.notify();
    this.checkOutsAt(queue.nextCheckAt(), cx);
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
    const terminalRecords = terminals().map(({ address, labels, program }) => ({ address, labels, program }));
    this.followed = follow2({ focused: focused(), panes: panes(), terminals: terminalRecords }, this.tab, this.last);
    if (this.followed.is !== "no-terminal")
      this.last = this.followed.terminal;
    this.pane = ownPaneId(props()?.pane, panes(), this.tab, terminalRecords, this.last);
    const sessionId = this.followed.is === "session" ? this.followed.sessionId : null;
    if (sessionId === this.sessionId)
      return;
    const now = Date.now();
    if (this.sessionId) {
      this.left[this.sessionId] = { ui: closed(this.ui), shownAt: now };
      this.queues[this.sessionId] = this.queue;
    }
    const kept = sessionId && this.left[sessionId] || null;
    const queue = sessionId && this.queues[sessionId] || null;
    if (sessionId)
      delete this.left[sessionId];
    if (sessionId)
      delete this.queues[sessionId];
    this.queues = Object.fromEntries(Object.entries(this.queues).filter(([, q]) => q.holdsPresses()));
    this.left = keptLeft(this.left, (id) => this.queues[id] !== undefined);
    this.sessionId = sessionId;
    this.read = null;
    this.ui = kept?.ui ?? freshUi(HERDR_LOOK, this.ui.tab);
    this.shownAt = now;
    this.isOpened = false;
    this.queue = queue ?? new PressQueue(queueIo);
    this.wake?.timer.cancel();
    this.wake = null;
    this.releaseField();
    this.heights.clear();
    if (sessionId)
      this.load(sessionId, cx);
  }
  send(c, from, cx) {
    const at = { appHome: appHome(), sessionId: this.sessionId, read: this.readSession };
    const { target, options } = pressSending(c, from ?? buttonOf(this.blocks, c.press), at, this.viewAt(Date.now()));
    const sent = this.queue.send(target, c.press, options);
    if (sent.is === "refused")
      return;
    const queue = this.queue;
    const projectFolder = target?.projectFolder ?? null;
    cx.spawn(async (cx) => {
      await sent.finish((effects, pending) => runHere(effects, pending, hereIo(projectFolder, cx)), () => cx.notify());
      if (queue !== this.queue)
        return;
      if (!this.endPresses(cx))
        cx.notify();
      this.checkOutsAt(queue.nextCheckAt(), cx);
    });
  }
  onKey(key, tabs, blocks, cx) {
    const move = keyMove(key, tabs, blocks, this.ui.typing, this.ui.isHelpShown);
    if (move === null)
      return;
    cx.stop_propagation();
    if (move.is === "event")
      this.apply([move.event], cx);
    else if (move.is === "press")
      this.apply(buttonEvents(move.button.does, this.ui, "key"), cx, move.button);
    else
      this.focusTerminal();
  }
  focusTerminal() {
    if (this.followed.is !== "no-terminal")
      run("pane.focus", { terminal: this.followed.terminal });
  }
  render(cx) {
    this.track(cx);
    const t = theme();
    const now = Date.now();
    const ui = this.ui;
    const raw = this.viewAt(now);
    const screen = screenAt(this, this.read, ui, raw, now);
    this.drawTimer?.cancel();
    this.drawTimer = null;
    const tracksOf = `${this.sessionId} ${ui.tab} ${ui.isHelpShown}`;
    const isFirst = tracksOf !== this.tracksOf;
    const resized = this.heights.takeResized();
    const isForming = this.heights.isForming(isFirst, now);
    const paint = {
      t,
      mono: theme().typography?.mono ?? "Menlo",
      press: (b, cx, isAll) => b.does.is === "focusTerminal" ? this.focusTerminal() : this.apply(buttonEvents(b.does, this.ui, "click", isAll), cx, b),
      collapse: (id, isCollapsed, cx, isAll) => this.apply(titleClickEvents(this.ui, id, isCollapsed, isAll === true), cx),
      select: (id, cx) => this.apply(titleClickEvents(this.ui, id, false, false), cx),
      pick: (tab, cx) => this.apply([{ type: "show-tab", tab }], cx),
      motion: new Map,
      heights: this.heights,
      isAtOnce: (key) => isForming || resized.has(key),
      measure: (key, size, cx, isWidthDrawn) => this.heights.measure(key, size, zoomOf(settings()), isWidthDrawn) && cx.notify(),
      now,
      newRows: newRowsOf(ui),
      closedSeen: new Map(Object.entries(ui.closedSeen)),
      tab: ui.tab,
      timeLeft: new Map,
      input: (rowId) => this.input?.rowId === rowId ? this.input.state : null,
      ...paneFit(this, zoomOf(settings())),
      fades: this.fades
    };
    const root = v_flex8().id("inbox").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(TEXT).line_height(LINE).on_size_change(onSize(this, "paneWidth", (s) => s.width));
    if (screen.is === "message") {
      this.timeLeft = new Map;
      this.tracksOf = "";
      this.blocks = [];
      this.lastDraw = { ...NO_DRAW, tab: ui.tab };
      this.look.status.drew(null, now);
      this.fades.drew();
      return root.child(messageEl(screen.message, t));
    }
    const shown = ui.isHelpShown ? helpBlocks(screen.helpVersion) : screen.blocks;
    this.blocks = shown;
    this.hints = fieldHints(shown);
    const thisDraw = drawOf(ui.tab, screen.waits, this.queue.outs, this.read);
    const isAnswer = isAnswerDraw(this.lastDraw, thisDraw, raw);
    this.lastDraw = thisDraw;
    const isInput = isAnswer || this.movedAt > this.tracks.drawnAt;
    const lastAbove = isFirst ? NO_LINES_ABOVE : this.linesAbove;
    const held = holdLinesAbove(shown, lastAbove, now, isForming, isInput);
    const fetched = this.fetched.drew(this.readSession, isAnswer, now);
    const moved = moveRows(held.blocks, this.tracks, now, isFirst, isInput, this.heights, fetched);
    this.linesAbove = heldAsDrawn(held, lastAbove, moved);
    this.tracks = moved.tracks;
    this.tracksOf = tracksOf;
    paint.motion = moved.motion;
    this.drawnTabs = heldTabs(screen.tabs, this.drawnTabs, moved.motion);
    const read = this.readSession && ui.tab === "overview" && !ui.isHelpShown ? this.readSession : null;
    const room = moved.nextAt === null ? paint.listRoom : null;
    this.look.status.drew(statusDrawn(this.sessionId, read, screen.view, moved.blocks, this.heights, room), now);
    this.timeLeft = timeLeftDraws(moved.blocks, this.timeLeft, now);
    paint.timeLeft = this.timeLeft;
    const focus = this.focus;
    const listInput = (cx) => {
      const isNew = Date.now() - (this.ui.listInput?.last ?? 0) >= LIST_INPUT_STEP_MS;
      if (isNew)
        this.apply([{ type: "list-input" }], cx);
    };
    const drawn = root.when(focus !== null, (e) => focus ? e.track_focus(focus) : e).on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx)).child(fitEl("tabs", paint, tabsEl(this.drawnTabs, ui.isHelpShown, paint))).child(fitEl("chrome", paint, v_flex8().children(screen.banners.map((b) => bannerEl(b, t).mt(EDGE))).when(screen.trimmedNote !== null, (e) => e.child(sessionNoteEl(screen.trimmedNote ?? "", t))))).child(div19().flex_1().min_h(0).relative().child(v_flex8().id("inbox-list").absolute().inset_0().overflow_y_scroll().pt(EDGE).pb(END_SPACE).on_size_change(onSize(this, "listHeight", (s) => s.height)).on_scroll_wheel((_e, cx) => listInput(cx)).on_mouse_move((_e, cx) => listInput(cx)).on_click((_e, _cx) => {
      const field = isFieldDrawn(this.ui.typing, this.ui.isHelpShown) ? this.input : null;
      if (field)
        field.state.focus();
      else
        this.focus?.focus();
    }).children(spacedEls(moved.blocks, paint, (b) => blockEl(b, paint)))).child(scrollFadeEl(t, "top")).child(scrollFadeEl(t, "bottom")).child(Scrollbar.vertical("inbox-list").absolute().inset_0()));
    const wakeAt = nextDrawAt(now, moved, [this.fades.drew(), held.nextAt]);
    if (wakeAt !== null)
      this.drawTimer = cx.timer.after(Math.max(0, wakeAt - now), (cx) => cx.notify());
    return drawn;
  }
}
export {
  Inbox as default
};
