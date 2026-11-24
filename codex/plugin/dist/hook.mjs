// Built by codex/build.mjs from codex/src and core/. Do not edit.

// src/hook-main.ts
import { dirname as dirname7, join as join10 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/detached-update.ts
import { spawn } from "node:child_process";
var STATUS_REFRESH = "status-refresh";
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

// src/cli.ts
function namedCli(env) {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null;
}
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

// ../core/domain/status-limits.ts
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var GOAL_LEFT_MS = 30 * 6e4;
var REMOVED_KEPT = 10;
var IDLE_AFTER_MS = 24 * 60 * 6e4;
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
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));
function sameAsk(a, b) {
  const norm = (s) => words2(s).join(" ");
  return norm(a) !== "" && norm(a) === norm(b);
}

// ../core/domain/ledger-close.ts
var MAX_CLOSED = 12;
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closeItem(ledger, id, closing, now) {
  const records = ledger.items.filter((i) => i.id === id).map((i) => closedRecord(i, closing, now));
  return reopenAskedFindings(
    { ...ledger, items: ledger.items.filter((i) => i.id !== id), closed: [...ledger.closed, ...records] },
    records
  );
}
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
var NL = "\n";
function turnReply(texts, final = "") {
  const written = texts.filter((text2) => text2.trim() !== "");
  const isFinalWritten = final.trim() === "" || written.at(-1)?.trim() === final.trim();
  return (isFinalWritten ? written : [...written, final]).join(`${NL}${NL}`);
}
function clip(text2, max) {
  return text2.length <= max ? text2 : text2.slice(0, max) + " \u2026[cut]";
}
function clipLabel(text2, max) {
  return text2.length > max ? `${text2.slice(0, max - 1)}\u2026` : text2;
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
function prRefs(text2) {
  return [...new Set([...text2.matchAll(PR_URL)].map((m) => `${m[1]}#${m[2]}`))];
}
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
function isStatusQuiet(o) {
  return o.changedAt !== null && o.quietCalls >= STALE_AFTER_CALLS;
}
function statusSyncText(sync, now) {
  if (sync.is !== "stale") return null;
  return sync.why === "failed" || sync.since === null ? STATUS_FAILED : `Not updated in ${duration(now - sync.since)}`;
}

// ../core/domain/status-suggest.ts
var hasRunningGoal = (o) => o.goal !== null && o.goal.metAt === null;

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
  done: { mark: "\u2713", tone: "done" },
  dropped: { mark: "\u2717", tone: null }
};
var HELD_MARK = { mark: "\u25C6", tone: "needsYou" };
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
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on you" },
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
    const waitsOn = askWords(c.items, c.oldestAskOf(x));
    const ownStall = subjectStall(x, c.isHeld(x), isWorkRunning, c.now);
    rows.push({
      kind: "subject",
      id: x.id,
      depth,
      ...c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status],
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
    ...isHeld ? HELD_MARK : SUBJECT_MARKS[m.status],
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

// ../core/view/press-reducer.ts
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
var withRecord = (log, id, record2) => ({
  ...log,
  commands: { ...log.commands, [id]: record2 }
});
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
async function markArrived(store, deliveryId) {
  if (!store || !deliveryId) return;
  await store.update(
    (log) => Object.entries(log.commands).reduce(
      (next, [id, c]) => c.deliveryId === deliveryId && !c.delivered ? withRecord(next, id, { ...c, delivered: true, pendingDelivery: false }) : next,
      log
    )
  ).catch(() => void 0);
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
function repliedAtTurnEnd(lastActions, turns, endedAt) {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, last]) => {
      const isAnswered = last.kind === "handoff" && isPrRowId(id) && last.repliedAt === void 0 && last.turnsStarted !== void 0 && last.turnsStarted < turns.turnsStarted && isAwaitingReply(last, turns);
      return [id, isAnswered ? { ...last, repliedAt: Math.max(last.at, endedAt) } : last];
    })
  );
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
var ASK_MARK = { text: HELD_MARK.mark, isRunning: false, tone: HELD_MARK.tone };
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
  if (f?.is === "working" || f?.is === "sending") return f.at;
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
    const under = last.kind === "talk" ? feedbackOf(id, { ...last, result: void 0 }, void 0, turns, now) : null;
    const isTalkOut = under?.is === "working" || under?.is === "sending" || under?.is === "queued";
    const talkOutSince = isTalkOut ? under.at : void 0;
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
var GIT_TIMEOUT_MS = 5e3;
var REMOTE_ORDER = ["upstream", "github", "origin"];
async function gitPlaceIn(run2, folder) {
  const opts = { cwd: folder, timeoutMs: GIT_TIMEOUT_MS };
  const [branch, remotes] = await Promise.all([
    run2(["git", "branch", "--show-current"], opts),
    run2(["git", "remote", "-v"], opts)
  ]);
  return {
    branch: branch.code === 0 ? branch.stdout.trim() || null : null,
    repo: remotes.code === 0 ? githubRepoIn(remotes.stdout) : void 0
  };
}
function githubRepoIn(listed) {
  const onGithub = listed.split("\n").flatMap((line) => {
    const [name = "", url = ""] = line.split(/\s+/);
    const repo = githubRepoOf(url);
    return repo ? [{ name, repo }] : [];
  });
  const rank = (name) => REMOTE_ORDER.includes(name) ? REMOTE_ORDER.indexOf(name) : REMOTE_ORDER.length;
  return onGithub.toSorted((a, b) => rank(a.name) - rank(b.name))[0]?.repo ?? null;
}
var GITHUB_REMOTE = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;
function githubRepoOf(url) {
  return GITHUB_REMOTE.exec(url)?.[1] ?? null;
}

// ../core/domain/pr-fetch.ts
var MAX_PRS = 12;
var MAX_ORDERED_PRS = 30;
var PR_SHARED_MS = 12e4;
var PRS_REFRESH_MS = 12e4;
var PR_POLL_MS = 15e3;
var CLOSED_PR_REFRESH_MS = 60 * 6e4;
var LIMIT_RETRY_MS = 5 * 6e4;
function linkedPrs(prs, refs) {
  return [...prs.filter((r) => !refs.includes(r)), ...refs];
}
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
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}

// ../core/domain/catch-up-text.ts
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
    const fields = q ?? {};
    const text2 = [fields.question, fields.title].find((v) => typeof v === "string" && v.trim() !== "");
    if (!text2) return [];
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o, i) => {
      const option = typeof o === "string" ? { label: o } : o ?? {};
      const plain = typeof option.label === "string" ? option.label.trim() : "";
      const isMarked = i === fields.recommended && !RECOMMENDED_SUFFIX.test(plain);
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
function noteDialogs(s, dialogs) {
  const isNoted = (callId, index) => callId !== null && s.dialogQuestions.some((q) => q.callId === callId && q.index === index);
  const added = dialogs.flatMap(
    ({ callId, questions }) => questions.flatMap(
      (q, index) => isNoted(callId, index) ? [] : [{ ...q, callId, index, turn: s.ledger.turn, itemId: null }]
    )
  );
  if (added.length === 0) return s;
  return linkDialogs({ ...s, dialogQuestions: [...s.dialogQuestions, ...added] });
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
function isDismissed(lastActions, ref) {
  return dismissedAt(lastActions, ref) !== null;
}
function isViewKept(prState, links, lastActions, ref, shownSince) {
  const at = dismissedAt(lastActions, ref);
  return keepsView(prState, links, ref) || at !== null && isShownSince(at, shownSince);
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

// ../core/domain/reply-parse.ts
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}

// ../core/domain/ledger-update.ts
var EXPIRED = "expired, unanswered";
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

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
      description: "For a question: the answers the user can pick, at most 5 words each, in words the user would say, without links, URL parameters, file paths or names from code. Give at least one."
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

// ../core/view/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../core/domain/inbox-text.ts
var START_TITLE = 'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.';
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
  if (item.rec) parts.push(`recommended: ${item.rec}${item.recReason ? `, because ${item.recReason}` : ""}`);
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
        ].join(NL3);
      }
    }
  }
  return lines.length === 0 ? null : ["inbox: the user's message answers these open items from your earlier replies:", ...lines].join(NL3);
}
function itemLine(item) {
  return `- ${item.label ? `(${item.label}) ` : ""}${describe(item)} (close id: ${item.id})`;
}
function findingLine(finding) {
  return `- ${finding.kind}: ${finding.title} (close id: ${finding.id})`;
}
function statusSummaryLines(ledger) {
  const head = ledger.overview?.head ?? null;
  const focus = head ? [head.title, head.description].filter(Boolean).join(": ") : "";
  const open2 = (ledger.overview?.subjects ?? []).filter(isOpen);
  return [
    ...focus ? [`Working on: ${focus}`] : [],
    ...open2.length > 0 ? ["Where it stands:", ...open2.map((s) => `- ${s.name}: ${s.text || "-"} (${s.status})`)] : []
  ];
}
function carryText(ledger, title) {
  const findings = ledger.findings;
  const lines = statusSummaryLines(ledger);
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
  return out.join(NL3);
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
  return out.join(NL3);
}
function closedText(closed) {
  if (closed.length === 0) return null;
  const advice = (d) => d.how === "dismissed" ? ". Ask it again only if the user brings it up." : d.how === "expired" ? ". Ask it again if it still matters." : "";
  return [
    "Closed since you last read the inbox:",
    ...closed.map((d) => `- "${d.ask}" \u2192 ${outcomeText(d)}${advice(d)}`)
  ].join(NL3);
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
  notes.push(closed ? `${inbox}${NL3}${closed}` : inbox);
  return { notes, told: { inbox, closed: ledger.closed.map((d) => d.id) } };
}

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
  if (item.kind === "task")
    return [
      ...stepActions,
      action({ action: "done", id }, "Done", "mark"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      ...explainActions,
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map(
      (option, n) => action({ action: "answer", id, option }, option, "mark", {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })
    ),
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
  const placed2 = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed2);
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
  const findingRows = [...placed2.findings].filter((f) => !isFixSettled(f.id)).reverse().sort(byGroup).map(
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
  const fields = Object.keys(value).filter((key) => value[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  return `{${fields.join(",")}}`;
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
function withChild(last, c, now) {
  const o = last ?? EMPTY_SESSION_STATUS;
  const kept = o.children.filter((x) => x.ref === c.ref || x.endedAt === null || now - x.endedAt < CHILD_KEPT_MS);
  const known = kept.find((x) => x.ref === c.ref);
  if (known) return { ...o, children: kept.map((x) => x === known ? { ...x, ...c } : x) };
  return {
    ...o,
    nextChildId: o.nextChildId + 1,
    children: [...kept, { delegateState: null, ...c, id: `c${o.nextChildId}`, subjectId: null }].slice(-CHILDREN_KEPT)
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
function subjectTouched(o, id, at) {
  const touched = (s) => isSubjectSeen(o, s) ? { ...s, was: null, merged: null, changedAt: at } : { ...s, changedAt: at };
  return id === null ? o : { ...o, subjects: o.subjects.map((s) => s.id === id ? touched(s) : s) };
}
function childActive(o, ref, at) {
  return changedChild(o, ref, (c) => ({ lastActivityAt: Math.max(c.lastActivityAt ?? at, at) }));
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
  return only !== void 0 && !isAskedDirectly && isNamedAlike(m.name, only.name) ? only : null;
}
function isTitleRepeated(title, subjects, rows) {
  const drawnIds = new Set(rows.flatMap((r) => r.kind === "subject" ? [r.id] : []));
  const work = subjects.filter((x) => x.into === null);
  if (work.filter(isOpen).length > 1) return false;
  return work.some(
    (x) => isOpen(x) ? isNamedAlike(title, x.name) : drawnIds.has(x.id) && holdsEveryWordOf(title, x.name)
  );
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
  const isHeadApart = head !== null && (g === null || g.isMet);
  const listRows2 = [
    ...hasMilestones ? [] : looseRows(null, 0),
    ...foldedPart("", top, 0, hasMilestones ? [] : settled),
    ...otherRows.length > 0 ? [
      { kind: "part", id: "other", depth: 0, text: OTHER_WORK, description: null, isTitle: false },
      ...otherRows
    ] : []
  ];
  const title = head === null || g === null && isTitleRepeated(head.title, subjects, listRows2) ? null : head.title;
  const headPart = isHeadApart && head && (title ?? head.description) !== null ? [{ kind: "part", id: "head", depth: 0, text: title, description: head.description, isTitle: true }] : [];
  const rows = [
    ...headPart,
    ...headPart.length > 0 && listRows2[0]?.id === "other" ? listRows2.slice(1) : listRows2
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
      isEmpty: head === null && rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
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
  if (last.result?.state !== "pending" || now - last.result.at <= PRESS_TIMEOUT_MS) return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
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
  return {
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
      ([ref]) => isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince)
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
import { join as join2 } from "node:path";

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
function isBlankLedger(ledger) {
  const o = ledger.overview;
  const isStatusBlank = !o || o.head === null && o.subjects.length === 0 && o.goal === null;
  return ledger.updates === 0 && isStatusBlank && ledger.items.length === 0 && ledger.findings.length === 0;
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
  const parsed2 = typeof args === "string" ? safeJson(args) : args;
  const plan = recordOf(parsed2).plan;
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
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
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
  const stat6 = readFileSync(`/proc/${pid}/stat`, "utf8");
  return stat6.slice(stat6.lastIndexOf(")") + 2).split(" ")[19] ?? "";
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

// src/viewers.ts
var NO_LEASES = { writtenAt: 0, leases: {} };
function leasesPath(dir, sessionId) {
  return join2(dir, "sessions", sessionFile(sessionId).replace(/\.json$/, ".viewers.json"));
}
async function readViewers(dir, sessionId) {
  const saved = await readFile(leasesPath(dir, sessionId), "utf8").then((text2) => JSON.parse(text2)).catch(() => null);
  const isSaved = typeof saved?.writtenAt === "number" && typeof saved.leases === "object" && saved.leases !== null;
  return isSaved ? saved : NO_LEASES;
}

// src/command-log.ts
import { mkdir as mkdir3, readFile as readFile2, rename as rename3, rm as rm2, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2, join as join4 } from "node:path";

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
import { join as join3 } from "node:path";
var HERDR_LOG_BYTES = 64 * 1024;
function herdrLog(dir) {
  const path = join3(dir, "herdr.log");
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
  return commandLogPath(join4(dir, "sessions"), sessionId);
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
import { mkdir as mkdir4, rename as rename5, rm as rm3, writeFile as writeFile5 } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname as dirname3, join as join6 } from "node:path";
import { fileURLToPath } from "node:url";

// src/state.ts
import { readFile as readFile3, readdir as readdir2, rename as rename4, stat as stat2, unlink as unlink2, writeFile as writeFile4 } from "node:fs/promises";
import { homedir } from "node:os";
import { join as join5 } from "node:path";

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
var keyOf = (q) => `${q.id}@${q.askedAt ?? ""}`;
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
  const open2 = new Set(s.ledger.items.map((i) => keyOf({ id: i.id, askedAt: i.at })));
  const byKey = new Map((previous?.questions ?? []).map((q) => [keyOf(q), q]));
  for (const q of answered) byKey.set(keyOf(q), q);
  const questions = [...byKey.values()].filter((q) => !open2.has(keyOf(q)) && now - q.answeredAt <= HISTORY_KEEP_MS).sort((a, b) => a.answeredAt - b.answeredAt);
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
    home: homedir(),
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
  return join5(dir, "sessions", sessionFile(sessionId));
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

// ../core/domain/model-text.ts
function guidanceText(host) {
  return `# Inbox
${host.intro}

When a choice can be inferred from the work or is easy to undo, make it and say what you chose. When you ask the user to decide something, say which option you recommend and why, in one clause ("I'd go with B: it keeps the old API"). If you cannot recommend one, say what would decide it.

Before you hand the user a step, take it yourself when your tools reach it, such as running a command, reloading or checking a page, or reading a log. When the step changes something other people see, such as merging, releasing or messaging someone, ask for their OK as a question and take the step when they say yes. Record a task only for a step your tools cannot reach, and say in your reply why you cannot take it.

When you ask the user to do something, such as review a page, sign in or run a command, give them what they need in the same reply: the link, file path or command, what to do there, and how the result gets back to you. If the result would stay where you cannot read it, such as in their browser, give them a way to send it to you.

Ask in your reply as a direct question, and record the same ask in that turn with ${host.recordTool}, so it stays in the inbox after the conversation moves on. Record a decision, an approval or information you need as a question, with its options and the one you recommend. Record an act you hold until the user says so the same way. Record a step only the user can take as a task, with its steps. Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Record it with ${host.recordTool} as a finding, then go on with the task; fixing it waits until the user asks. Record one too when you work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them, and when part of your change cannot be checked from where you are. State those in your reply as well. Mention any other finding only when it bears on what the user asked.

These are not findings. Handle them in the task and your reply instead:
- A problem in your own change or inside the task: fix it.
- A check you could run yourself: run it, or say in your reply that you have not.
- Progress, status, or an approach you tried and dropped: say it.
- Something only the user can do or decide, such as an approval, a sign-in or a choice: ask it, and record it as a question or task.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as (close id: i35), and anything it does not list is closed. Check it before telling the user that something is open or waits on them. The user never sees the ids, so never write one to the user, not even in parentheses: name an item or finding by what it says, as "the deploy task" or "the migration finding".

Close with ${host.closeTool}:
- When the user's message answers an open item, close it first, before other work, with their answer, and say in your reply what you took their answer to be.
- When an item is done or no longer applies, close it with a short reason, without waiting to be asked. Close a finding only when a change fixed it, not when the user puts it off.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`;
}

// ../core/runtime/session-turns.ts
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
      failedAttempts: 0,
      isConversationUnreadable: false,
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
  const sameText = (a) => a.trim() === text2.trim();
  const matchingAt = s.sent.findIndex((x) => sameText(x.text));
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
    ...sent.deliveryId === null ? withUnconfirmed(eligible, sent.text) : withArrival(eligible, sent.text, sent.pressedAt ?? void 0, sent.deliveryId)
  } : s.lastActions;
  const lastActions = s.sent.slice(matchingAt + 1).reduce(
    (actions, later) => sameText(later.text) && later.row !== null ? withUnconfirmed(actions, later.text, later.pressedAt ?? void 0, later.deliveryId) : actions,
    arrived
  );
  return {
    state: {
      ...s,
      lastActions,
      sent: sent ? s.sent.filter((_x, i) => i !== sentAt) : s.sent
    },
    sentBy: sent ? { press: sent.press, deliveryId: sent.deliveryId } : null
  };
}
function turnStarted(s, at) {
  const startedAt = s.presence.isTurnRunning ? s.presence.turnStartedAt ?? at : at;
  return { ...s, presence: { ...s.presence, isTurnRunning: true, turnStartedAt: startedAt } };
}
function turnEnded(s, at, clock) {
  const lastReplyAt = at ?? s.presence.lastReplyAt;
  const endedAt = at ?? clock;
  return {
    ...s,
    lastActions: endedAt === void 0 ? s.lastActions : repliedAtTurnEnd(s.lastActions, s.presence, endedAt),
    presence: { ...s.presence, isTurnRunning: false, turnStartedAt: null, lastReplyAt }
  };
}
function messageTyped(s, at) {
  return { ...s, presence: { ...s.presence, lastTypedMessageAt: at } };
}
function placed(s, folder, git) {
  const place = {
    folder: s.place?.folder || folder,
    branch: git.branch === "HEAD" ? null : git.branch,
    repo: git.repo === void 0 ? s.place?.repo ?? null : git.repo
  };
  const isSame = s.place?.folder === place.folder && s.place.branch === place.branch && s.place.repo === place.repo;
  return isSame ? s : { ...s, place };
}
function startTurn(s) {
  return { ...s, presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 }, stop: null };
}
function recordPrompt(host, s, text2, isOpen2, sentBy, personSource = "prompt") {
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 };
  const r = promptNotes(host, ledger, { text: text2, isPress: sentBy !== null, isOpen: isOpen2 }, s.told);
  const promptPerson = s.turn.person === null ? text2 : `${s.turn.person}

${text2}`;
  const person = personSource === "command" ? s.turn.person : promptPerson;
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
  const refs = prRefs(reply).filter((ref) => !isDismissed(s.lastActions, ref));
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

// ../core/runtime/session-status.ts
var STATUS_REFRESH_MS = 10 * 6e4;
function claimedStatusRefresh(s, now) {
  const { isTurnRunning, turnStartedAt } = s.presence;
  const times = [s.lastOverviewCallAt, turnStartedAt].filter((t) => t !== null);
  const isDue = isTurnRunning && times.length > 0 && now - Math.max(...times) >= STATUS_REFRESH_MS;
  return isDue ? { ...s, lastOverviewCallAt: now } : s;
}
function needsUpdate(s) {
  return s.pending.length > 0 || s.presence.ledgerState !== "current";
}
function statusChanged(s, change) {
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
function notePrompt2(s, text2, now) {
  return notePrompt(CODEX2, s, text2, isTabOpen(s, now));
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}
function endTurn2(s, reply, now) {
  return endTurn(CODEX2, s, reply, isTabOpen(s, now), { tab: screenTabOf(s.shownTab) });
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
var ACTIVITY_SAVE_MS = 3e4;
var NAME_CHARS = 80;
function childStarted(o, { ref, kind, name }, at, delegateState = null) {
  return withChild(
    o,
    { ref, kind, name: childName(name), startedAt: at, endedAt: null, lastActivityAt: at, delegateState },
    at
  );
}
function childName(text2) {
  return clipLabel(text2.trim().split("\n")[0] ?? "", NAME_CHARS);
}
function nameInWords(name) {
  const words3 = name.replace(/([a-z]{2,})(?=[A-Z][a-z])/g, "$1 ").split(/[-_\s]+/).filter(Boolean);
  return words3.join(" ") || name;
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
var HERDR2 = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g;
function delegateSteps(command) {
  return [...command.matchAll(HERDR2)].map(([, verb, name, args]) => ({
    name,
    isPrompt: verb === "prompt",
    isWaitForEnd: verb === "wait" && !/--until working/.test(args ?? "")
  }));
}
var delegateRef = (name) => `herdr:${name}`;
function delegateRunning(o, step, at) {
  const ref = delegateRef(step.name);
  const known = o?.children.find((c) => c.ref === ref);
  const isRunning2 = known !== void 0 && known.endedAt === null;
  if (!isRunning2)
    return childStarted(
      o,
      { ref, kind: "delegate", name: known && known.name !== step.name ? known.name : nameInWords(step.name) },
      at,
      step.isPrompt ? "working" : null
    );
  const active = childActive(o, ref, at);
  return step.isPrompt ? delegateStateSet(active, ref, "working") : active;
}
function delegateStateSet(o, ref, delegateState) {
  if (!o?.children.some((c) => c.ref === ref && c.delegateState !== delegateState)) return o;
  return { ...o, children: o.children.map((c) => c.ref === ref ? { ...c, delegateState } : c) };
}
function delegatesStarted(o, command, at) {
  return delegateSteps(command).reduce((x, step) => delegateRunning(x, step, at), o);
}
function delegateWaitsEnded(o, command, at) {
  return delegateSteps(command).filter((step) => step.isWaitForEnd).reduce((x, step) => childEnded(x, delegateRef(step.name), at), o);
}
function delegateRefs(command) {
  return new Set(delegateSteps(command).map((step) => delegateRef(step.name)));
}
function delegateRowsTakenBack(o, refs, before, at) {
  const isStartedByCommand = (c) => refs.has(c.ref) && c.startedAt === at;
  if (!o?.children.some(isStartedByCommand)) return o;
  const children = o.children.flatMap((c) => {
    if (!isStartedByCommand(c)) return [c];
    const was = before.find((x) => x.ref === c.ref);
    return was ? [was] : [];
  });
  return { ...o, children };
}
var HERDR_PROMPT_SETTLE_MS = 15e3;
function hasRunningDelegate(o) {
  return o?.children.some((c) => c.kind === "delegate" && c.endedAt === null) ?? false;
}
function delegatesSettled(o, agents, at) {
  return delegatesListed(delegatesEnded(o, agents, at), agents, at);
}
function delegatesEnded(o, agents, at) {
  if (!o) return o;
  const byRef = new Map([...agents].map(([name, agent]) => [delegateRef(name), agent]));
  const settled = (running) => {
    if (running.kind !== "delegate" || running.endedAt !== null) return running;
    const agent = byRef.get(running.ref);
    const status = agent?.status;
    const focus = agent?.focus ? childName(agent.focus) : null;
    const note = agent?.note ? childName(agent.note) : null;
    const isRenamed = focus !== null && focus !== running.name;
    const isNoted = note !== null && note !== running.summary;
    const c = isRenamed || isNoted ? { ...running, name: focus ?? running.name, summary: note ?? running.summary } : running;
    const isShownWorking = status === "working" || status === "blocked";
    if (isShownWorking) return c.delegateState === status ? c : { ...c, delegateState: status };
    const isSettling = at - (c.lastActivityAt ?? c.startedAt) < HERDR_PROMPT_SETTLE_MS;
    if (status === "unknown" || isSettling) return c;
    const isReady = status === "idle" || status === "done";
    const hasFinished = isReady && c.delegateState !== null;
    return { ...c, endedAt: at, delegateState: hasFinished ? "finished" : c.delegateState };
  };
  const children = o.children.map(settled);
  if (children.every((c, n) => c === o.children[n])) return o;
  const finished = children.filter(
    (c, n) => c.delegateState === "finished" && o.children[n].delegateState !== "finished"
  );
  return finished.reduce((x, c) => subjectTouched(x, c.subjectId, at), { ...o, children });
}
function delegatesListed(o, agents, at) {
  return [...agents].reduce((x, [name, agent]) => {
    const isShownWorking = agent.status === "working" || agent.status === "blocked";
    const ref = delegateRef(name);
    const isRunning2 = x?.children.some((c) => c.ref === ref && c.endedAt === null) ?? false;
    if (!agent.isChild || !isShownWorking || isRunning2) return x;
    return childStarted(x, { ref, kind: "delegate", name: nameInWords(name) }, at, agent.status);
  }, o);
}
function childrenCutOff(o, at) {
  return childrenEnded(o, (c) => c.kind !== "delegate", at);
}

// ../core/remote/hc-terminals.ts
var HC_TIMEOUT_MS = 5e3;
var HC_STATUSES = ["idle", "working", "blocked", "done"];
var HC_BLOCKED = /* @__PURE__ */ new Set(["blocked", "error"]);
var FOCUS_LABEL = "inbox.focus";
async function delegatesInHc(target, run2, isRunning2) {
  for (const hc of target.hc) {
    const r = await run2([hc, "ls", "--json"], { cwd: "/", timeoutMs: HC_TIMEOUT_MS });
    if (r.code === UNSTARTABLE_CODE) continue;
    const listed = r.code === 0 ? childAgents(r.stdout, target.terminal) : null;
    if (listed === null) return null;
    const detailed = await Promise.all(
      [...listed].map(
        async ([key, { address, agent }]) => [key, isRunning2(key) ? { ...agent, ...await described(hc, address, run2) } : agent]
      )
    );
    return new Map(detailed);
  }
  return null;
}
async function described(hc, address, run2) {
  const r = await run2([hc, "get", address, "--json"], { cwd: "/", timeoutMs: HC_TIMEOUT_MS });
  if (r.code !== 0) return { focus: null, note: null };
  try {
    const t = JSON.parse(r.stdout);
    const focus = t?.labels?.[FOCUS_LABEL];
    const note = t?.status?.msg;
    return {
      focus: typeof focus === "string" && focus.trim() ? focus.trim() : null,
      note: typeof note === "string" && note.trim() ? note.trim() : null
    };
  } catch {
    return { focus: null, note: null };
  }
}
function childAgents(stdout, parent) {
  try {
    const terminals = JSON.parse(stdout)?.terminals;
    if (!Array.isArray(terminals)) return null;
    const agents = /* @__PURE__ */ new Map();
    for (const t of terminals) {
      const key = typeof t?.name === "string" && t.name ? t.name : t?.address;
      if (typeof key !== "string" || typeof t.address !== "string" || t.parent !== parent || typeof t.status !== "string")
        continue;
      const status = HC_BLOCKED.has(t.status) ? "blocked" : HC_STATUSES.find((s) => s === t.status) ?? "unknown";
      agents.set(key, { address: t.address, agent: { status, focus: null, isChild: true } });
    }
    return agents;
  } catch {
    return null;
  }
}

// ../core/remote/herdr-labels.ts
var SESSION_LABEL = "inbox.session";

// ../core/view/dialog-row.ts
function dialogTitle(dialog) {
  return dialog.kind === "permission" ? `Allow ${dialog.text}?` : dialog.text;
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
var HERDR_AGENT_LIST = ["herdr", "agent", "list"];
var HERDR_STATUSES = ["idle", "working", "blocked", "done", "unknown"];
async function delegatesInHerdr(o, run2, target = null) {
  if (target?.kind === "terminal")
    return delegatesInHc(
      target,
      run2,
      (name) => o?.children.some((c) => c.ref === delegateRef(name) && c.endedAt === null) ?? false
    );
  if (!hasRunningDelegate(o)) return null;
  const r = await run2(HERDR_AGENT_LIST, { cwd: "/", timeoutMs: HERDR_TIMEOUT_MS });
  return r.code === 0 ? herdrAgents(r.stdout) : null;
}
function herdrAgents(stdout) {
  try {
    const agents = JSON.parse(stdout)?.result?.agents;
    if (!Array.isArray(agents)) return null;
    const agentOf = (a) => {
      const focus = a?.tokens?.[FOCUS_TOKEN];
      return {
        status: HERDR_STATUSES.find((s) => s === a?.agent_status) ?? "unknown",
        focus: typeof focus === "string" && focus.trim() ? focus.trim() : null
      };
    };
    return new Map(agents.filter((a) => typeof a?.name === "string").map((a) => [a.name, agentOf(a)]));
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
  return head ? head.description || head.title : null;
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
    await mkdir4(dirname3(path), { recursive: true });
    await writeFile5(path, text2);
  },
  move: (from, to) => rename5(from, to),
  remove: (path) => rm3(path, { force: true }),
  removeFolder: (path) => rm3(path, { recursive: true, force: true })
};
function herdrOnWrite(env, run2, dir, now, log = herdrLog(dir)) {
  const target = herdrTarget(env);
  if (!target) return void 0;
  const report = herdrReporter(log);
  return async (written) => {
    const id = written.sessionId;
    await withLock(`${statePath(dir, id)}.herdr`, async () => {
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
          version: "0.6.0",
          isNextBuild: existsSync(join6(dirname3(dirname3(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK))
        },
        s,
        log
      );
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
import { mkdir as mkdir5, readdir as readdir3, readFile as readFile4, rename as rename6, rm as rm4, writeFile as writeFile6 } from "node:fs/promises";
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
    const fields = {
      format: 1,
      ...source,
      title: null,
      pid: owner,
      startedAt: kept && kept.pid === owner ? kept.startedAt : now,
      isTurnRunning: s.presence.isTurnRunning,
      counts: { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }
    };
    const isUnchanged2 = kept && JSON.stringify({ ...kept, writtenAt: 0 }) === JSON.stringify({ ...fields, writtenAt: 0 });
    if (isUnchanged2) return;
    const entry = { ...fields, writtenAt: now };
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
  list: (folder) => readdir3(folder).catch(() => []),
  read: (path) => readFile4(path, "utf8").catch(missingAsNull),
  write: async (path, text2) => {
    await mkdir5(dirname4(path), { recursive: true, mode: 448 });
    await writeFile6(path, text2, { mode: 384 });
  },
  move: (from, to) => rename6(from, to),
  remove: (path) => rm4(path, { force: true }),
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
      { host: "codex", sessionId: s.sessionId, agent: CODEX2.agent, projectFolder: s.root, version: "0.6.0", herdr },
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

// src/shared-daemon.ts
var PS_TIMEOUT_MS = 5e3;
var INIT_PID = 1;
var MAX_ANCESTORS2 = 6;
var isSharedDaemon = (command) => /(^|\/)codex\s.*\bapp-server\b/.test(command) && /--managed-daemon\b|--listen[ =]unix:\/\//.test(command);
async function isUnderSharedDaemon(pid, run2) {
  let current = pid;
  for (let level = 0; level < MAX_ANCESTORS2 && current > INIT_PID; level++) {
    const r = await run2(["ps", "-o", "ppid=,command=", "-p", String(current)], { cwd: "/", timeoutMs: PS_TIMEOUT_MS });
    const match = r.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(r.stdout.trim()) : null;
    if (!match) return false;
    const [, parent, command] = match;
    if (isSharedDaemon(command ?? "")) return true;
    current = Number(parent);
  }
  return false;
}
async function withoutSharedTerminal(env, run2, pid, log) {
  const where = env.HERDR_PANE_ID ?? env.HC_TERMINAL_ID;
  if (!where) return;
  if (!await isUnderSharedDaemon(pid, run2).catch(() => false)) return;
  log(
    `Herdr ${where} ignored: Codex runs this thread in a daemon shared by every Codex CLI, so ${where} is where the daemon started, not necessarily where this thread runs. The inbox reports to no terminal.`
  );
  delete env.HERDR_PANE_ID;
  delete env.HC_TERMINAL_ID;
}

// src/hook.ts
import { resolve as resolve3 } from "node:path";

// src/dialogs.ts
function noteTurnDialogs(s, dialogs) {
  return noteDialogs(
    s,
    dialogs.filter((d) => d.callId !== null && !d.isFollowedByMessage)
  );
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

// src/delegate-calls.ts
function delegateCallNoted(s, command, at) {
  const refs = delegateRefs(command);
  const before = (s.ledger.overview?.children ?? []).filter((c) => refs.has(c.ref));
  const noted = { ...s, delegateCalls: [...s.delegateCalls, { command, at, before }] };
  return statusChanged(noted, (o) => delegatesStarted(o, command, at));
}
function unranDelegatesTakenBack(s, refs) {
  if (refs.length === 0) return s;
  const unran = new Set(refs);
  return statusChanged(
    s,
    (o) => s.delegateCalls.reduceRight((x, call) => {
      const callRefs = new Set([...delegateRefs(call.command)].filter((ref) => unran.has(ref)));
      return delegateRowsTakenBack(x, callRefs, call.before, call.at);
    }, o)
  );
}

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
async function subagentTaskName(path) {
  const agentPath = (await readSessionMeta(path))?.payload?.agent_path;
  const taskName = isText(agentPath) ? agentPath.split("/").pop() ?? "" : "";
  const words3 = taskName.replace(/[_-]+/g, " ").trim();
  return words3 === "" ? null : words3;
}
var isText = (v) => typeof v === "string";
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

// ../core/domain/conversation.ts
var NL4 = "\n";
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
  return kept.reverse().join(NL4);
}

// src/rollout-commands.ts
import { resolve as resolve2 } from "node:path";
var DIALOG_TOOL = "request_user_input_async";
var SHELL_CALLS = /* @__PURE__ */ new Set(["shell", "shell_command", "exec_command", "container.exec"]);
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
    const parsed2 = JSON.parse(output);
    return isText(parsed2.output) ? parsed2.output : output;
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
var literalValue = (literal) => {
  if (literal === void 0) return null;
  try {
    return textOf2(JSON.parse(literal));
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
  const name = textOf2(p.name);
  if (p.type === "local_shell_call") return hasCommandRows2 ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf2(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = scriptCommand(input);
    return [...patch ? editLines(patch, cwd) : [], ...command && !hasCommandRows2 ? shellLines(command) : []];
  }
  if (p.type !== "function_call") return [];
  if (SHELL_CALLS.has(name)) return hasCommandRows2 ? [] : shellLines(callCommand(p));
  const args = jsonRecord(p.arguments);
  if (name === "apply_patch") return editLines(textOf2(args.input ?? args.patch ?? args.command), cwd);
  if (name === "spawn_agent") {
    const line2 = toolActivity("Agent", { description: textOf2(args.task_name) });
    return line2 ? [line2] : [];
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: "open" })];
  const line = toolActivity(textOf2(p.namespace).startsWith("mcp__") ? textOf2(p.namespace) + name : name, {});
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
  const parts = Array.isArray(output) ? output.map((part) => textOf2(record(part).text)) : [];
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
        const command = commandText(item.command);
        noteCommand(command, !isDeclined);
        scripts.forEach((script) => (isDeclined ? script.declined : script.recorded).add(command));
      } else if (item.type === "FileChange") note(editedLines(item.changes), !isDeclined);
      else if (item.type === "McpToolCall") note(toolLines(`mcp__${textOf2(item.server)}__${textOf2(item.tool)}`), true);
      continue;
    }
    if (row.type !== "response_item") continue;
    const callId = textOf2(p.call_id);
    let block = { commands: [], lines: [] };
    const isScript = p.type === "custom_tool_call" && p.name === "exec";
    if (p.type === "function_call" || p.type === "local_shell_call" || p.type === "custom_tool_call") {
      if (openCalls.size > 0) scripts.forEach((script) => script.isShared = true);
      if (isScript) {
        const commands = scriptCommands(textOf2(p.input));
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
var PLAN_TOOL = "update_plan";
var MARKERS = ['"task_started"', DIALOG_TOOL, '"user"', '"AgentMessage"', '"assistant"', ...UNRAN_MARKERS];
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
function turnOf(lines, turnId) {
  const none = { dialogs: [], commands: [], plan: null, texts: [], unran: [], unranDelegates: [] };
  try {
    const byTurn = /* @__PURE__ */ new Map();
    const newTurn = () => ({
      dialogs: [],
      executions: [],
      calls: /* @__PURE__ */ new Map(),
      called: [],
      plan: null,
      itemTexts: [],
      messageTexts: [],
      rows: []
    });
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
      turn2.rows.push(row);
      if (row.type === "event_msg" && p.type === "item_completed" && p.item?.type === "CommandExecution") {
        if (p.item.status === "declined") continue;
        const output = p.item.aggregated_output;
        turn2.executions.push({ command: commandText(p.item.command), output: isText(output) ? output : "" });
      } else if (row.type === "event_msg" && p.type === "item_completed" && p.item?.type === "AgentMessage") {
        turn2.itemTexts.push(contentText(p.item.content));
      } else if (row.type === "response_item" && p.type === "message" && p.role === "assistant") {
        turn2.messageTexts.push(contentText(p.content));
      } else if (row.type === "response_item" && p.type === "function_call" && p.name === PLAN_TOOL) {
        turn2.plan = codexPlanOf(p.arguments) ?? turn2.plan;
      } else if (row.type === "response_item" && p.type === "function_call" && p.name === DIALOG_TOOL) {
        let args;
        try {
          args = JSON.parse(isText(p.arguments) ? p.arguments : "");
        } catch {
          continue;
        }
        turn2.dialogs.push({
          callId: p.call_id ?? null,
          questions: dialogQuestions(args.questions),
          isFollowedByMessage: false
        });
      } else if (row.type === "response_item" && p.type === "message" && p.role === "user") {
        turn2.dialogs = turn2.dialogs.map((d) => ({ ...d, isFollowedByMessage: true }));
      } else if (row.type === "response_item" && (p.type === "function_call" || p.type === "local_shell_call")) {
        const command = callCommand(p);
        if (command !== "" && p.call_id) turn2.calls.set(p.call_id, { command, output: "" });
      } else if (row.type === "response_item" && p.type === "function_call_output" && p.call_id) {
        const call = turn2.calls.get(p.call_id);
        const output = outputText(p.output);
        if (call && !isUnranOutput(output)) turn2.called.push({ command: call.command, output });
      }
    }
    const wanted = newest === "" ? "" : turnId ?? newest;
    const turn = byTurn.get(wanted);
    if (!turn) return none;
    const unran = unranCalls(turn.rows);
    return {
      dialogs: turn.dialogs.filter((d) => d.questions.length > 0),
      commands: turn.executions.length > 0 ? turn.executions : turn.called,
      plan: turn.plan,
      texts: turn.itemTexts.length > 0 ? turn.itemTexts : turn.messageTexts,
      unran: unran.lines,
      unranDelegates: unran.delegates
    };
  } catch {
    return none;
  }
}
var isItem = (row, ...kinds) => row.type === "event_msg" && record(row.payload).type === "item_completed" && kinds.includes(textOf2(record(record(row.payload).item).type));
function turnsOf(rows, cwd) {
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
    else if (isItem(row, "CommandExecution")) act(shellLines(commandText(item.command)));
    else if (row.type === "response_item") {
      if (p.type === "message" && !hasMessageRows && p.role === "user") person(contentText(p.content));
      else if (p.type === "message" && !hasMessageRows && p.role === "assistant")
        turns.push({ role: "agent", text: contentText(p.content), activity: [] });
      else act(callLines(p, hasCommandRows2, cwd));
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
function rolloutOfLines(lines, cwd, currentTurnId) {
  const turns = rolloutTurns(lines, cwd);
  const earlier = turns.filter((t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person")));
  return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
}

// src/transcript.ts
import { readdir as readdir4, stat as stat4 } from "node:fs/promises";
import { basename as basename2, dirname as dirname5, join as join7 } from "node:path";
async function namesIn(dir, pattern) {
  const names = await readdir4(dir).catch(() => []);
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
  const sessions = join7(codexHome, "sessions");
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join7(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join7(sessions, year, month), /^\d{2}$/)) {
        const folder = join7(sessions, year, month, day);
        const [name] = await rolloutsIn(folder, isWanted);
        if (name !== void 0) return join7(folder, name);
      }
  const archive = join7(codexHome, "archived_sessions");
  const [archived] = await rolloutsIn(archive, isWanted);
  return archived === void 0 ? null : join7(archive, archived);
}
function codexHomeOf(path) {
  const folder = dirname5(path);
  if (basename2(folder) === "archived_sessions") return dirname5(folder);
  const sessions = dirname5(dirname5(dirname5(folder)));
  return basename2(sessions) === "sessions" ? dirname5(sessions) : null;
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
var ROLLOUT_BYTES = 8 * 1024 * 1024;
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

// src/hook.ts
var withoutActivity = (s, lines) => {
  const activity = s.turn.activity.filter((line) => !lines.includes(line));
  return activity.length === s.turn.activity.length ? s : { ...s, turn: { ...s.turn, activity } };
};
async function handleHook(input, deps) {
  const id = input.session_id;
  const { dir, env, now } = deps;
  if (!id) return null;
  const meta = await rolloutMeta(input.transcript_path);
  if (!env.INBOX_IN_EXEC && meta.isNonInteractive) return null;
  const { update: write, read } = codexStore(dir, id, now, deps.onWrite);
  const named = namedCli(env);
  const cliPath = named ?? ((await read()).cliPath === null ? await ancestorCli(deps.run, deps.parentPid) : null);
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
      const endsTurn = (s2) => input.source === "compact" ? s2 : statusChanged(turnEnded(s2, null, now()), (o) => childrenCutOff(o, now()));
      const folder = rolloutPath === null ? null : meta.folder;
      const [git, withHistory] = await Promise.all([
        folder === null ? null : gitPlaceIn(deps.run, folder),
        readHistoryAhead(read)
      ]);
      const withPlace = (s2) => folder === null || git === null ? s2 : placed(s2, folder, git);
      const unreported = ({ herdrReport: _, ...s2 }) => s2;
      const s = await write(
        async (s2) => noteHook(
          withHost(
            await withHistory(endsTurn(withPlace({ ...unreported(input.source === "clear" ? cleared(s2) : s2), root })))
          ),
          "start",
          now()
        )
      );
      if (isMarkedBehind) deps.startUpdate(id);
      const context = startContext(CODEX2, s, input.source);
      return context ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } } : null;
    }
    case "UserPromptSubmit": {
      let notes = [];
      let arrival;
      const withHistory = await readHistoryAhead(read);
      await write(async (s) => {
        const r = notePrompt2(withHost(await withHistory(s)), input.prompt ?? "", now());
        notes = r.notes;
        arrival = r.sentBy?.deliveryId;
        if (input.agent_id) return r.state;
        const started = noteHook(turnStarted({ ...r.state, delegateCalls: [] }, now()), "prompt", now(), input.turn_id);
        const isTyped = r.sentBy === null;
        return isTyped ? messageTyped(started, now()) : started;
      });
      await markArrived(
        codexCommandStore(dir, id, now, async () => deps.onWrite?.(await read())),
        arrival
      );
      if (isMarkedBehind) deps.startUpdate(id);
      return notes.length === 0 ? null : { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: notes.join("\n\n") } };
    }
    case "PreToolUse": {
      const tool = input.tool_name ?? "";
      const toolInput = input.tool_input ?? {};
      const command = typeof toolInput.command === "string" ? toolInput.command : "";
      if (tool === "apply_patch") {
        const files2 = patchFiles(command).map((f) => resolve3(input.cwd || "/", f));
        await write((s) => files2.reduce((x, f) => noteActivity(x, `edited ${f}`), withRollout(s)));
        return null;
      }
      const line = toolActivity(tool, toolInput);
      const agentId = input.agent_id;
      const isDelegateCommand = agentId === void 0 && delegateSteps(command).length > 0;
      const at = now();
      const withWork = (s) => agentId ? statusChanged(s, (o) => childWorked(o, agentId, at)) : isDelegateCommand ? delegateCallNoted(s, command, at) : s;
      const hasWork = line !== null || agentId !== void 0 || isDelegateCommand;
      const isMainActivity = line !== null && agentId === void 0;
      let isClaimed = false;
      const isStatusDue = isMainActivity && await read().then((s) => claimedStatusRefresh(s, now()) !== s);
      const turn = isStatusDue ? turnOf(await rolloutTail(input.transcript_path), input.turn_id) : null;
      if (hasWork)
        await write((s) => {
          const withoutUnran = withoutActivity(withRollout(s), turn?.unran ?? []);
          const kept = unranDelegatesTakenBack(withoutUnran, turn?.unranDelegates ?? []);
          const worked = withWork(line ? noteActivity(kept, line) : kept);
          const claimed = isMainActivity ? claimedStatusRefresh(worked, now()) : worked;
          isClaimed = claimed !== worked;
          return claimed;
        });
      if (isClaimed) deps.startStatusRefresh(id);
      return null;
    }
    case "SubagentStart": {
      const ref = input.agent_id;
      if (!ref) return null;
      const taskName = input.transcript_path ? await subagentTaskName(input.transcript_path) : null;
      const role = input.agent_type === "default" ? "" : input.agent_type;
      const name = taskName || role || "subagent";
      await write((s) => statusChanged(s, (o) => childStarted(o, { ref, kind: "subagent", name }, now())));
      return null;
    }
    case "SubagentStop": {
      const ref = input.agent_id;
      if (ref) await write((s) => statusChanged(s, (o) => childEnded(o, ref, now())));
      return null;
    }
    case "Stop": {
      const folder = input.cwd;
      const before = read();
      const [tail, git, inHerdr] = await Promise.all([
        rolloutTail(input.transcript_path),
        folder ? gitPlaceIn(deps.run, folder) : null,
        before.then(
          (s) => delegatesInHerdr(s.ledger.overview, deps.run, herdrTarget(env)),
          () => null
        )
      ]);
      const { dialogs, commands, plan, texts, unran, unranDelegates } = turnOf(tail, input.turn_id);
      const reply = turnReply(texts, input.last_assistant_message ?? "");
      const withHistory = await readHistoryAhead(() => before, tail);
      const lines = dialogs.map((d) => dialogActivity(d.questions, { kind: "open" }));
      const written = await write(async (s) => {
        const withLines = lines.reduce(
          (x, line) => noteActivity(x, line),
          withoutActivity(noteTurnDialogs(withHost(await withHistory(s)), dialogs), unran)
        );
        const withRan = { ...unranDelegatesTakenBack(withLines, unranDelegates), delegateCalls: [] };
        const withOutput = commands.reduce((x, c) => noteCommandOutput(x, c.command, c.output), withRan);
        const waited = statusChanged(
          withOutput,
          (o) => commands.reduce((x, c) => delegateWaitsEnded(x, c.command, now()), o)
        );
        const withDelegates = inHerdr ? statusChanged(waited, (o) => delegatesSettled(o, inHerdr, now())) : waited;
        const withPlace = folder && git ? placed(withDelegates, folder, git) : withDelegates;
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
import { join as join8 } from "node:path";
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join8(homedir2(), ".codex", "inbox-dev");
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
        const signal = err?.killed ? void 0 : err?.signal ?? void 0;
        const errorCode = typeof err?.code === "string" ? err.code : void 0;
        const error = errorCode && !stderr ? err.message : String(stderr);
        resolve4({
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
    resolve4({
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

// src/question-history.ts
import { mkdir as mkdir6, readdir as readdir5, readFile as readFile5, rename as rename7, stat as stat5, writeFile as writeFile7 } from "node:fs/promises";
import { dirname as dirname6, join as join9 } from "node:path";
var nodeFs = {
  list: async (folder) => {
    const names = await readdir5(folder).catch(() => []);
    const listed = await Promise.all(
      names.map(async (name) => {
        const info = await stat5(join9(folder, name)).catch(() => null);
        return info?.isFile() ? { name, mtimeMs: info.mtimeMs } : null;
      })
    );
    return listed.filter((x) => x !== null);
  },
  read: (path) => readFile5(path, "utf8"),
  write: async (path, text2) => {
    await mkdir6(dirname6(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile7(tmp, text2);
    await rename7(tmp, path);
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

// src/hook-main.ts
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const dist = dirname7(fileURLToPath2(import.meta.url));
  const dir = dataDir(process.env, dirname7(dist));
  await withoutSharedTerminal(process.env, run, process.ppid, herdrLog(dir));
  useQuestionHistory(questionHistoryPlace(process.env, dir));
  const startUpdate = detachedUpdate(dir, process.env, join10(dist, "update.mjs"));
  const input = JSON.parse(raw);
  const codexPid = input.hook_event_name === "SessionStart" ? (await ancestorCodex(run, process.ppid))?.pid ?? null : null;
  const out = await handleHook(input, {
    dir,
    env: process.env,
    now: Date.now,
    startUpdate: (id) => startUpdate(id),
    startStatusRefresh: (id) => startUpdate(id, STATUS_REFRESH),
    onWrite: eachOnWrite(
      herdrOnWrite(process.env, run, dir, Date.now),
      registryOnWrite(process.env, dir, Date.now, codexPid)
    ),
    run,
    parentPid: process.ppid
  });
  if (out) process.stdout.write(JSON.stringify(out));
}
main().catch(() => process.exit(0));
