import { parseStatus } from '../hooks/status'
import { applyOps } from '../hooks/status-ops'
import { emptySession } from '../hooks/session-files'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { statusPage } from '../hooks/status-page'
import { taskTreeFromStatus } from '../hooks/task-tree'
import type { StatusRow } from '../hooks/status-page'
import type { Item, SessionStatus, Session, Subject, SubjectStatus } from '../types'

export const MIN = 60_000

const NO_ASKS: ReadonlySet<string> = new Set()

export const after = (last: SessionStatus | null, text: string, now: number, askIds = NO_ASKS) => {
  let o = last ?? EMPTY_SESSION_STATUS
  const find = (ref: string) => o.subjects.find(subject => subject.id === ref || subject.name === ref)
  for (const line of text.split('\n')) {
    const match = /^\s*(NEW|SET|DONE|DROP|WAS|LINK):\s*(.*)$/i.exec(line)
    if (!match) continue
    const [key, ...fields] = match[2]!.split('|').map(value => value.trim())
    const kind = match[1]!.toUpperCase()
    if (kind === 'NEW' && fields.length >= 2) {
      const status = key as SubjectStatus
      const subject: Subject = {
        id: `s${o.nextId}`,
        name: fields[0]!,
        status,
        text: fields.slice(1).join(' | '),
        was: null,
        merged: null,
        createdAt: now,
        changedAt: now,
        closedAt: status === 'done' || status === 'dropped' ? now : null,
        into: null,
      }
      o = { ...o, subjects: [...o.subjects, subject], nextId: o.nextId + 1 }
    } else if (kind === 'LINK' && key && fields[0]) {
      const task = find(fields[0])
      const child = o.children.find(item => item.id === key)
      if (child && task)
        o = { ...o, children: o.children.map(item => (item.id === key ? { ...item, subjectId: task.id } : item)) }
      else if (askIds.has(key) && task)
        o = { ...o, askSubjects: { ...o.askSubjects, [key]: [...new Set([...(o.askSubjects[key] ?? []), task.id])] } }
    } else if (kind === 'WAS' && key && fields[0]) {
      const subject = find(key)
      if (subject)
        o = {
          ...o,
          subjects: o.subjects.map(item =>
            item === subject ? { ...item, was: fields.join(' | '), changedAt: now } : item,
          ),
        }
    } else if ((kind === 'SET' || kind === 'DONE' || kind === 'DROP') && key) {
      const subject = find(key)
      if (!subject) continue
      const status = kind === 'DONE' ? 'done' : kind === 'DROP' ? 'dropped' : (fields[0] as SubjectStatus)
      const detail = kind === 'SET' ? fields.slice(1).join(' | ') : (fields[0] ?? subject.text)
      o = {
        ...o,
        subjects: o.subjects.map(item =>
          item === subject
            ? {
                ...item,
                status,
                text: detail,
                changedAt: now,
                closedAt: status === 'done' || status === 'dropped' ? now : null,
                into: kind === 'DROP' && fields[1]?.startsWith('INTO ') ? fields[1].slice(5) : item.into,
              }
            : item,
        ),
      }
    }
  }
  const answer = parseStatus(text)
  return answer?.kind === 'ops' ? applyOps(o, answer.ops, now, askIds, taskTreeFromStatus(o)) : o
}

export const askItem = (id: string): Item => ({
  id,
  kind: 'question',
  label: null,
  ask: `Ask ${id}?`,
  options: [],
  rec: null,
  helps: [],
  turn: 1,
  at: null,
  from: 'record',
})

const presence = (over: Partial<Session['presence']> = {}): Session['presence'] => ({
  ...emptySession().presence,
  ...over,
})

export const page = (
  sessionStatus: SessionStatus | null,
  now: number,
  over: Partial<Session['presence']> = {},
  items: Item[] = [],
) =>
  statusPage(
    {
      ledger: { overview: sessionStatus, items },
      taskTree: taskTreeFromStatus(sessionStatus),
      presence: presence(over),
    },
    now,
  )

const ARMS = { mid: '├ ', last: '└ ' } as const

export const shape = (rows: StatusRow[]) =>
  rows.map(r =>
    r.kind === 'subject'
      ? `${r.mark} ${r.name}${r.text ? `: ${r.text.replace(/^\d+% complete · /, '')}` : ''}${r.stall ? ` · ${r.stall.text}` : ''}${r.hasChildren ? ' ┐' : ''}`
      : r.kind === 'child'
        ? `${r.branch ? ARMS[r.branch] : ''}${r.mark} ${r.name}${r.stall ? ` · ${r.stall.text}` : ''}`
        : r.kind === 'more'
          ? `${ARMS[r.branch]}${r.text}`
          : r.kind === 'part'
            ? `== ${r.text}`
            : r.kind === 'counts'
              ? r.counts.map(c => `${c.mark} ${c.text}`).join(' · ')
              : r.kind === 'done-fold'
                ? `▸ ${r.text}`
                : `${r.mark} ${r.text}`,
  )
