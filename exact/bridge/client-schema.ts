import type { Result } from '../app.contract'

type Inbox = Result<'loadInbox'>

export function clientSnapshot(view: Inbox, schema: string | null) {
  if (schema === '2') return view
  const row = ({
    id,
    kind,
    title,
    detail,
    context,
    recommendation,
    feedback,
    state,
    mark,
    actions,
  }: Inbox['asks'][number]) => ({
    id,
    kind,
    title,
    detail,
    context,
    recommendation,
    feedback,
    state,
    mark,
    actions: actions.map(({ key, label, primary, disabled, input, reason }) => ({
      key,
      label,
      primary,
      disabled,
      input,
      reason,
    })),
  })
  const {
    connectionState,
    key,
    readOnly,
    session,
    name,
    connected,
    updatedAt,
    serverNow,
    running,
    failure,
    fresh,
    statusError,
    statusTitle,
    statusDetail,
    questionCount,
    taskCount,
  } = view
  return {
    connectionState,
    key,
    readOnly,
    session,
    name,
    connected,
    updatedAt,
    serverNow,
    running,
    failure,
    fresh,
    statusError,
    asks: view.asks.map(row),
    findings: view.findings.map(row),
    statusTitle,
    statusDetail,
    statusRows: view.statusRows.map(({ id, title, detail, depth, mark }) => ({ id, title, detail, depth, mark })),
    questionCount,
    taskCount,
  }
}
