import type { Result } from './app.contract.d.ts'

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
export const strings = (value: Record<string, unknown>, names: string[]) =>
  names.every(name => typeof value[name] === 'string')
const list = (value: unknown, valid: (item: unknown) => boolean) => Array.isArray(value) && value.every(valid)

function isSpan(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'text', 'href']) &&
    ['bold', 'italic', 'code', 'strike'].every(key => typeof value[key] === 'boolean')
  )
}
function isButton(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['key', 'label', 'reason', 'command', 'icon', 'hotkey', 'pendingText']) &&
    ['primary', 'disabled', 'input'].every(key => typeof value[key] === 'boolean')
  )
}
function isOption(value: unknown): boolean {
  return (
    record(value) &&
    isButton(value.button) &&
    strings(value, ['id', 'label']) &&
    list(value.body, isSpan) &&
    list(value.reason, isSpan)
  )
}
function isRow(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, [
      'id',
      'version',
      'collapse',
      'kind',
      'title',
      'detail',
      'context',
      'recommendation',
      'feedback',
      'state',
      'mark',
      'replyHint',
      'fileLabel',
      'fileName',
      'age',
      'markTone',
      'markColor',
    ]) &&
    typeof value.latestUndo === 'boolean' &&
    typeof value.waiting === 'boolean' &&
    typeof value.running === 'boolean' &&
    list(value.actions, isButton) &&
    list(value.shownActions, isButton) &&
    list(value.allActions, isButton) &&
    ['titleParts', 'detailParts', 'contextParts', 'holdsUpParts', 'earlierParts'].every(key =>
      list(value[key], isSpan),
    ) &&
    list(value.options, isOption) &&
    list(value.allOptions, isOption)
  )
}
function isClosed(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'version', 'outcome', 'mark', 'tone', 'color', 'age']) &&
    list(value.title, isSpan) &&
    list(value.actions, isButton)
  )
}
function isGroup(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'title', 'mark', 'tone', 'color', 'empty', 'closedLabel', 'earlierLabel']) &&
    typeof value.count === 'number' &&
    list(value.rows, isRow) &&
    list(value.closed, isClosed) &&
    list(value.closedAll, isClosed)
  )
}
function isStatusAction(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['key', 'collapse', 'action', 'target', 'label', 'text']) &&
    typeof value.disabled === 'boolean'
  )
}
export function isSnapshot(value: unknown): value is Result<'loadInbox'> {
  if (
    !record(value) ||
    !list(
      value.banners,
      banner =>
        record(banner) &&
        strings(banner, ['id', 'title', 'body', 'tone', 'key', 'label']) &&
        typeof banner.disabled === 'boolean',
    ) ||
    !strings(value, [
      'rowVersion',
      'foldVersion',
      'prVersion',
      'connectionState',
      'key',
      'session',
      'name',
      'failure',
      'statusError',
      'prNotice',
      'prEmptyTitle',
      'prEmptyHint',
      'asksBadge',
      'findsBadge',
      'prsBadge',
      'statusVersion',
      'sendLabel',
      'discardLabel',
      'statusGoalHint',
      'statusGoalKey',
      'statusSubmitLabel',
      'statusLabel',
      'statusWas',
      'statusNow',
      'statusOffer',
      'statusTitle',
      'statusDetail',
      'asksEmptyTitle',
      'asksEmptyHint',
      'findsEmptyTitle',
      'findsEmptyHint',
    ])
  )
    return false
  if (!['connected', 'running', 'fresh', 'readOnly'].every(key => typeof value[key] === 'boolean')) return false
  if (
    !['updatedAt', 'serverNow', 'questionCount', 'taskCount'].every(
      key => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  )
    return false
  const collapseEntry = (entry: unknown) => record(entry) && strings(entry, ['id', 'value'])
  return (
    list(
      value.foldPlans,
      plan =>
        record(plan) &&
        typeof plan.tab === 'string' &&
        ['closed', 'statusFolds', 'parents', 'rows'].every(key => list(plan[key], id => typeof id === 'string')) &&
        list(plan.records, collapseEntry),
    ) &&
    list(value.collapsed, id => typeof id === 'string') &&
    list(value.collapses, collapseEntry) &&
    record(value.collapseInput) &&
    list(value.collapseInput.ids, id => typeof id === 'string') &&
    list(value.collapseInput.entries, collapseEntry) &&
    list(
      value.prLines,
      row =>
        record(row) &&
        strings(row, [
          'id',
          'kind',
          'title',
          'detail',
          'openDetail',
          'mark',
          'color',
          'href',
          'feedback',
          'version',
          'next',
          'previous',
        ]) &&
        ['running', 'folded', 'failed', 'latestUndo', 'waiting'].every(k => typeof row[k] === 'boolean') &&
        list(row.quote, isSpan) &&
        list(row.reply, isSpan) &&
        list(
          row.controls,
          c =>
            record(c) &&
            strings(c, [
              'label',
              'href',
              'key',
              'row',
              'command',
              'version',
              'scope',
              'hotkey',
              'icon',
              'pendingText',
            ]) &&
            typeof c.disabled === 'boolean' &&
            typeof c.primary === 'boolean',
        ),
    ) &&
    list(value.statusActions, isStatusAction) &&
    list(value.asks, isRow) &&
    list(value.findings, isRow) &&
    list(value.askGroups, isGroup) &&
    list(value.findingGroups, isGroup) &&
    list(
      value.statusRows,
      row =>
        record(row) &&
        strings(row, ['id', 'title', 'detail', 'mark', 'kind', 'color', 'waitsOn', 'was', 'merged']) &&
        typeof row.depth === 'number' &&
        typeof row.bold === 'boolean' &&
        typeof row.running === 'boolean' &&
        list(row.seen, id => typeof id === 'string') &&
        list(row.actions, isStatusAction),
    )
  )
}
export function isReceipt(value: unknown): value is Result<'press'> {
  return record(value) && strings(value, ['id', 'state', 'error']) && typeof value.ok === 'boolean'
}
