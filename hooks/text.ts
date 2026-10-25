const NL = '\n'

const FENCE = /```[^\n]*\n([\s\S]*?)```/g

export function codeBlocks(reply: string): string[] {
  return [...reply.matchAll(FENCE)].map(m => (m[1] ?? '').replace(/\n$/, ''))
}

export function numberBlocks(reply: string): string {
  let n = 0

  return reply.replace(FENCE, block => `[block ${(n += 1)}]${NL}${block}`)
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + ' …[cut]'
}

export function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function clipMiddle(text: string, max: number, head: number): string {
  if (text.length <= max) return text

  return `${text.slice(0, head)}${NL}…[cut]${NL}${text.slice(text.length - (max - head))}`
}

export function ago(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h ago`

  return `${Math.round(h / 24)}d ago`
}
