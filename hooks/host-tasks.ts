import type { HostTask, HostTaskStatus } from '../types'

const NL = '\n'
const TASKS_KEPT = 12

const STATUSES: Record<string, HostTaskStatus> = {
  pending: 'pending',
  in_progress: 'in-progress',
  'in-progress': 'in-progress',
  completed: 'done',
  done: 'done',
  abandoned: 'dropped',
  blocked: 'blocked',
}

const statusOf = (raw: unknown): HostTaskStatus => STATUSES[String(raw)] ?? 'pending'

const textOf = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '')

const recordOf = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

/** A whole list's rows as tasks numbered from 1 in the list's order. A row with no text under `textKey` is left out. */
function numberedTasks(rows: unknown[], textKey: string): HostTask[] {
  return rows
    .map(recordOf)
    .map((row, n) => ({ id: String(n + 1), text: textOf(row[textKey]), status: statusOf(row.status) }))
    .filter(t => t.text !== '')
}

/**
 * Claude Code's task list after one tool call. `TaskCreate` adds a task and `TaskUpdate` changes one by its id, so a
 * task's text is kept here. `TodoWrite` writes the whole list. The id of a new task is the number in the tool's
 * answer when it has one, else the next number after the highest one kept.
 */
export function claudeTasksAfter(
  tasks: HostTask[],
  tool: string,
  input: Record<string, unknown>,
  answer: string | null,
): HostTask[] {
  if (tool === 'TodoWrite') {
    return numberedTasks(Array.isArray(input.todos) ? input.todos : [], 'content')
  }
  if (tool === 'TaskCreate') {
    const text = textOf(input.subject) || textOf(input.description)
    if (text === '') return tasks
    const named = /#?(\d+)/.exec(answer ?? '')?.[1]
    const next = String(Math.max(0, ...tasks.map(t => Number(t.id) || 0)) + 1)

    return [...tasks, { id: named ?? next, text, status: 'pending' as const }]
  }
  if (tool === 'TaskUpdate') {
    const id = String(input.taskId ?? '')
    if (input.status === 'deleted') return tasks.filter(t => t.id !== id)
    const status = input.status === undefined ? null : statusOf(input.status)
    const text = textOf(input.subject)

    return tasks.map(t => (t.id === id ? { ...t, status: status ?? t.status, text: text || t.text } : t))
  }

  return tasks
}

/** Codex's list from the arguments of an `update_plan` call, which hold the whole plan. Null when they hold none. */
export function codexPlanOf(args: unknown): HostTask[] | null {
  const parsed = typeof args === 'string' ? safeJson(args) : args
  const plan = recordOf(parsed).plan
  if (!Array.isArray(plan)) return null

  return numberedTasks(plan, 'step')
}

/** omp's list from the details of a `todo` result, which hold every phase and its tasks. Null when they hold none. */
export function ompTodoOf(details: unknown): HostTask[] | null {
  const phases = recordOf(details).phases
  if (!Array.isArray(phases)) return null

  const tasks = phases.flatMap(phase =>
    Array.isArray(recordOf(phase).tasks) ? (recordOf(phase).tasks as unknown[]) : [],
  )

  return numberedTasks(tasks, 'content')
}

/**
 * omp's list from a branch of session entries: the newest of a `/todo` edit and a successful `todo` result, as omp
 * reads it (`getLatestTodoPhasesFromEntries`). Empty when the branch holds neither.
 */
export function ompTodoFromBranch(entries: readonly unknown[]): HostTask[] {
  for (let n = entries.length - 1; n >= 0; n--) {
    const entry = recordOf(entries[n])
    if (entry.type === 'custom' && entry.customType === 'user_todo_edit') {
      const tasks = ompTodoOf(entry.data)
      if (tasks !== null) return tasks
      continue
    }
    if (entry.type !== 'message') continue
    const message = recordOf(entry.message)
    if (message.role !== 'toolResult' || message.toolName !== 'todo' || message.isError) continue
    const tasks = ompTodoOf(message.details)
    if (tasks !== null) return tasks
  }

  return []
}

/** Whether two lists hold the same tasks in the same order. */
export function isSameTaskList(a: readonly HostTask[], b: readonly HostTask[]): boolean {
  return (
    a.length === b.length && a.every((t, n) => t.id === b[n]?.id && t.text === b[n]?.text && t.status === b[n]?.status)
  )
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A saved list with any entry of the wrong shape left out. */
export function upgradeHostTasks(saved: unknown): HostTask[] {
  if (!Array.isArray(saved)) return []

  return saved.flatMap(raw => {
    const t = recordOf(raw)
    const status = STATUSES[String(t.status)]

    return typeof t.id === 'string' && typeof t.text === 'string' && t.text !== '' && status
      ? [{ id: t.id, text: t.text, status }]
      : []
  })
}

/** At most the newest `TASKS_KEPT` tasks, cutting the oldest finished or dropped ones before any open one. */
function keptTasks(tasks: HostTask[]): HostTask[] {
  let toCut = tasks.length - TASKS_KEPT
  if (toCut <= 0) return tasks
  const kept = tasks.filter(t => {
    const isFinished = t.status === 'done' || t.status === 'dropped'
    if (!isFinished || toCut <= 0) return true
    toCut -= 1

    return false
  })

  return kept.slice(-TASKS_KEPT)
}

/** The agent's task list as the lines the Overview call reads. Empty when the agent keeps none. */
export function tasksText(tasks: HostTask[]): string {
  return keptTasks(tasks)
    .map(t => `TASK: ${t.status} | ${t.text}`)
    .join(NL)
}
