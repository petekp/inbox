import { createHash } from 'node:crypto'

export function renderVersion(view: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(view, (field, value) => (field === 'collapse' ? undefined : value)))
    .digest('hex')
}
