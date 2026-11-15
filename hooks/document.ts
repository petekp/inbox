export const DOCUMENT_LIMIT = 64 * 1024

const ANSI =
  /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u009C]*(?:\u0007|\u001B\\|\u009C)|\u001B[PX^_][\s\S]*?(?:\u001B\\|\u009C)|\u001B[@-_]|\u009B[0-?]*[ -/]*[@-~]|\u009D[^\u0007\u009C]*(?:\u0007|\u001B\\|\u009C)|[\u0090\u0098\u009E\u009F][\s\S]*?\u009C)/g
const CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

export function documentBytes(base64: string, limit: number): Uint8Array {
  if (base64.length > Math.ceil((limit + 1) / 3) * 4) return new Uint8Array(limit + 1)
  return Uint8Array.from(atob(base64), byte => byte.charCodeAt(0))
}

export type DocumentFile = {
  stat(path: string): Promise<{ path: string; isFile: boolean; size: number }>
  read(path: string, limit: number): Promise<Uint8Array>
}

export type DocumentResult = { text: string } | { error: string }

export async function readDocument(path: string, file: DocumentFile): Promise<DocumentResult> {
  try {
    const target = await file.stat(path)
    if (!target.isFile || !/\.md$/i.test(target.path))
      return { error: 'The document must resolve to a regular .md file.' }
    if (target.size > DOCUMENT_LIMIT) return { error: 'The document is larger than the 64 KiB limit.' }
    const bytes = await file.read(target.path, DOCUMENT_LIMIT)
    if (bytes.byteLength > DOCUMENT_LIMIT) return { error: 'The document is larger than the 64 KiB limit.' }
    const text = new TextDecoder().decode(bytes).replace(ANSI, '').replace(/\r\n/g, '\n').replace(CONTROLS, '')
    return { text }
  } catch (error) {
    return {
      error:
        (error as { code?: string }).code === 'ENOENT'
          ? 'The document file is missing.'
          : 'The document could not be read.',
    }
  }
}

export function documentExcerpt(text: string): string {
  const excerpt = text.trim().replace(/\s+/gu, ' ')
  const chars = [...excerpt]
  return chars.length > 180 ? `${chars.slice(0, 180).join('')}…` : excerpt
}

export async function withDocumentPreview(input: Record<string, unknown>, file: DocumentFile) {
  const path = typeof input.document === 'string' ? input.document.trim() : ''
  if (!path) return input
  if (path.length > 4096) return { ...input, document: undefined, document_error: 'The document path is too long.' }
  if (!/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(path))
    return { ...input, document: undefined, document_error: 'The document path must be absolute.' }

  const result = await readDocument(path, file)
  return 'text' in result
    ? { ...input, document: path, document_preview: documentExcerpt(result.text) }
    : { ...input, document: undefined, document_error: result.error }
}
