import { desktopRequest } from './desktop'
import { isAbsolute } from 'node:path'
import { coreRequest, agentExec } from './core'
import { publishedTerminal } from './remote'
import { pressFile } from '../../../core/remote/herdr-press-file'
import { isSessionFile } from '../../../core/view/session-files'
import type { HostBinding } from './binding'

const PUBLISH_SCRIPT = `import json,os,secrets,sys
root=os.path.realpath(sys.argv[1])
session=sys.argv[2]
name=sys.argv[3]
data=sys.stdin.buffer.read(65537)
if len(data)>65536: raise ValueError("Inbox publication is too large")
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
parent=os.open(os.sep,flags)
temporary=None
try:
 for part in root.split(os.sep):
  if not part: continue
  next_parent=os.open(part,flags,dir_fd=parent)
  os.close(parent)
  parent=next_parent
 for part in ["inbox","presses",session]:
  try: os.mkdir(part,mode=0o700,dir_fd=parent)
  except FileExistsError: pass
  next_parent=os.open(part,flags,dir_fd=parent)
  os.close(parent)
  parent=next_parent
 temporary=".inbox-"+secrets.token_hex(16)+".tmp"
 fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
 with os.fdopen(fd,"wb") as stream:
  stream.write(data)
  stream.flush()
  os.fsync(stream.fileno())
 os.rename(temporary,name,src_dir_fd=parent,dst_dir_fd=parent)
 temporary=None
 print(json.dumps({"bytes":len(data)}))
finally:
 if temporary is not None:
  try: os.unlink(temporary,dir_fd=parent)
  except FileNotFoundError: pass
 os.close(parent)
`

export async function publishInboxFile(binding: HostBinding, id: string, text: string): Promise<void> {
  const parsed = pressFile(text)
  const validSession =
    (binding.source === 'codex' || isAbsolute(binding.appHome)) && isSessionFile(`${binding.session}.json`)
  if (!validSession || !parsed.ok || !/^[\w-]{1,180}$/.test(id) || Buffer.byteLength(text) > 65536)
    throw new Error('Invalid Inbox publication.')
  const file = parsed.file
  if (file.format === 2 ? file.session !== binding.session : !('press' in file))
    throw new Error('Invalid Inbox session.')
  if (binding.source !== 'codex' && binding.machine && (!binding.machineId || file.format !== 2))
    throw new Error('This remote connection is not writable.')
  const expected =
    file.format === 2 && file.kind === 'viewer' ? `${file.id}-${file.generation}-${file.sequence}` : file.id
  if (id !== expected) throw new Error('Invalid Inbox file.')
  if (binding.source === 'codex') {
    if (file.format !== 2) throw new Error('Desktop clients require the durable protocol.')
    await desktopRequest(binding, { version: 1, operation: 'apply', session: binding.session, file })
    return
  }
  const answer = await agentExec(
    binding,
    ['python3', '-c', PUBLISH_SCRIPT, binding.appHome, binding.session, `${id}.json`],
    text,
  )
  if (!answer || typeof answer !== 'object' || (answer as { bytes?: unknown }).bytes !== Buffer.byteLength(text))
    throw new Error('Publication could not be confirmed. The request is kept.')
}

export async function notifyInbox(binding: HostBinding, id: string): Promise<void> {
  if (binding.source === 'codex') return
  const terminal = binding.machine ? `${binding.machineId}/${publishedTerminal(binding)}` : binding.terminal
  await coreRequest('terminal.label', { terminal, labels: { 'inbox.press': id } }, binding)
}
