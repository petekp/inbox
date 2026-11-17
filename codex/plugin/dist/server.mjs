// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/server-main.ts
import { readdir, stat as stat2 } from "node:fs/promises";
import { dirname as dirname2, join as join3 } from "node:path";
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

// ../hooks/status-limits.ts
var GOAL_LEFT_MS = 30 * 6e4;
var IDLE_AFTER_MS = 24 * 60 * 6e4;
var CHILD_KEPT_MS = 24 * 60 * 6e4;
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
var SUFFIXES = ["ing", "ed", "es", "s"];
function stem(word) {
  if (/\d/.test(word)) return word;
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 3) ?? "";
  const cut = word.slice(0, word.length - suffix.length);
  const base = cut.length > 3 && cut.endsWith("e") ? cut.slice(0, -1) : cut;
  return base.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}

// ../hooks/ask-match.ts
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));

// ../hooks/text.ts
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

// ../hooks/ledger-close.ts
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");

// ../hooks/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\u{1F9ED}" },
  { id: "needsYou", label: "Asks", symbol: "\u{1F64B}" },
  { id: "findings", label: "Finds", symbol: "\u{1F50D}" },
  { id: "prs", label: "PRs", symbol: "\u{1F500}" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var SHOWN_TABS = numbered(TAB_NAMES);
function isListedTab(tab) {
  return tab === "needsYou" || tab === "findings";
}
function isRowTab(tab) {
  return tab !== "overview";
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));
var LISTED_TABS = TAB_NAMES.filter((t) => isListedTab(t.id));

// ../hooks/help.ts
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

// ../hooks/status-page-parts.ts
var CHILD_MARK = SUBJECT_MARKS.working;
var DAY_MS = 24 * 60 * 6e4;

// ../hooks/timing.ts
var SETTLED_MS = 5120;
var COMPARE_LIMIT_MS = 30 * 6e4;
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;

// src/host.ts
import { appendFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";

// ../hooks/ledger-update.ts
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

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

// ../hooks/inbox-text.ts
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/rows.ts
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions", mark: NEEDS_YOU_MARKS.question },
  { kind: "task", title: "Tasks", list: "tasks", mark: NEEDS_YOU_MARKS.task }
];
var ASK_MARK = { text: HELD_MARK.mark, isRunning: false, tone: HELD_MARK.tone };

// ../hooks/gh.ts
var GH_TIMEOUT_MS = 2e4;
var UNSTARTABLE_CODE = -1;
var TIMED_OUT_CODE = -2;

// ../hooks/pr-fetch.ts
var MAX_ORDERED_PRS = 30;
var CLOSED_PR_REFRESH_MS = 60 * 6e4;
var LIMIT_RETRY_MS = 5 * 6e4;
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1e3} seconds`;

// ../hooks/pr-press.ts
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
    remoteCommands: {},
    remoteCommandFloor: 0,
    remoteViewers: {},
    heldRows: [],
    collapsed: {},
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
      description: "For a question or task: what you need from the user, in at most 12 plain words, readable without your reply."
    },
    context: {
      type: "string",
      description: "For a question: why it came up, in at most 20 plain words, so the user can answer without reading back through the conversation."
    },
    options: {
      type: "array",
      items: { type: "string" },
      description: "For a question: the answers the user can pick, at most 5 words each. Give at least one."
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

// ../hooks/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../hooks/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];

// ../hooks/earlier-answers.ts
var STOP_WORDS = new Set(
  `a an the and or of to in on for with at by from into onto is are was were be been being it its this that these
those i you we he she they me my your our their them as if then than so do does did done can could should would will
shall may might must not no yes now still also just again already instead yet any all some each per via up out over
about after before when while which what who whom why how where whether there here let lets get got have has had
pr prs`.split(/\s+/)
);
var DAY_MS2 = 24 * 60 * 6e4;

// ../hooks/view.ts
var NEXT_TRY = " It tries again after the next reply.";
var FAILED_UPDATE_TEXT = {
  waiting: `The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing.${NEXT_TRY}`,
  "failed-again": `The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing.${NEXT_TRY}`,
  unreadable: `The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing.${NEXT_TRY}`
};

// ../hooks/question-history.ts
var DAY_MS3 = 24 * 60 * 6e4;
var HISTORY_KEEP_MS = 180 * DAY_MS3;
var BASELINE_MS = 7 * DAY_MS3;
var NOT_AN_ANSWER2 = new RegExp(`^(?:done:|fix sent for |(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES}))`, "i");

// ../hooks/history-store.ts
var DAY_MS4 = 24 * 60 * 6e4;

// src/diagnostics.ts
var TIME = String.raw`^(?:\[[^\]]*\]\s*)?(?:\d{4}-\d\d-\d\dT\S*\s+)?`;
var DIAGNOSTIC = new RegExp(
  `${TIME}(?:(?:ERROR|WARNING|error|warning):|(?:ERROR|WARN)\\s|Unknown feature flag: |[\\w ]*stream error:)`
);

// ../hooks/session-status.ts
var STATUS_REFRESH_MS = 10 * 6e4;

// src/settle.ts
var POLL_MS = 3e3;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// ../hooks/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null])
);
var SESSION_FIELDS = Object.keys(emptySession()).filter(
  (field) => field !== "remoteCommands" && field !== "remoteViewers" && field !== "remoteCommandFloor"
);

// ../hooks/host-prs.ts
var PRS_HIDDEN_REFRESH_MS = 10 * 6e4;

// ../hooks/remote-commands.ts
var LIFETIME_MS = 24 * 60 * 6e4;

// ../hooks/herdr-app.ts
var PRESS_FILE_LIMIT_BYTES = 64 * 1024;
var PUBLISH_LIMIT_BYTES = 1024 * 1024;

// src/host.ts
var HERDR_LOG_BYTES = 64 * 1024;
function herdrLog(dir2) {
  const path = join2(dir2, "herdr.log");
  return (text) => void (async () => {
    const size = await stat(path).then(
      (s) => s.size,
      () => 0
    );
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${text}
`;
    await mkdir(dir2, { recursive: true });
    await (size > HERDR_LOG_BYTES ? writeFile(path, line) : appendFile(path, line));
  })().catch(() => void 0);
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env, input }) => new Promise((resolve) => {
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
        resolve({
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
    resolve({
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

// src/shared-daemon.ts
var PS_TIMEOUT_MS = 5e3;
var INIT_PID = 1;
var MAX_ANCESTORS = 6;
var isSharedDaemon = (command) => /(^|\/)codex\s.*\bapp-server\b/.test(command) && /--managed-daemon\b|--listen[ =]unix:\/\//.test(command);
async function isUnderSharedDaemon(pid, run2) {
  let current2 = pid;
  for (let level = 0; level < MAX_ANCESTORS && current2 > INIT_PID; level++) {
    const r = await run2(["ps", "-o", "ppid=,command=", "-p", String(current2)], { cwd: "/", timeoutMs: PS_TIMEOUT_MS });
    const match = r.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(r.stdout.trim()) : null;
    if (!match) return false;
    const [, parent, command] = match;
    if (isSharedDaemon(command ?? "")) return true;
    current2 = Number(parent);
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

// src/server-main.ts
var here = dirname2(fileURLToPath(import.meta.url));
var pluginRoot = dirname2(here);
var dir = dataDir(process.env, pluginRoot);
var BUNDLE = join3("dist", "server-handler.mjs");
await withoutSharedTerminal(process.env, run, process.ppid, herdrLog(dir));
var exists = (path) => stat2(path).then(
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
  const own = join3(pluginRoot, BUNDLE);
  if (await exists(own)) return own;
  const versions = (await readdir(dirname2(pluginRoot)).catch(() => [])).filter((name) => /^\d/.test(name));
  for (const version of versions.sort(compareVersions).reverse()) {
    const bundle = join3(dirname2(pluginRoot), version, BUNDLE);
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
      detachedUpdate(dir, process.env, join3(here, "update.mjs"))
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
    throw new Error(`no ${BUNDLE} in ${dirname2(pluginRoot)}`);
  }
  const { mtimeMs } = await stat2(path).catch(() => ({ mtimeMs: -1 }));
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
