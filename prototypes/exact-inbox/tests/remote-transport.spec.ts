import { expect, test } from 'bun:test'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('remote transport pins machine identity, bounds time and preserves uncertain publication bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-remote-transport-'))
  let worker: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined
  try {
    const statePath = join(root, 'core.json')
    await writeFile(
      statePath,
      JSON.stringify({
        alias: 'one',
        flip: false,
        drop: false,
        clockFailure: false,
        offsets: { one: 600000, two: -600000 },
        contents: { one: 'first', two: 'other' },
      }),
    )
    await writeFile(
      join(root, 'sitecustomize.py'),
      'import os,time\noriginal=time.time_ns\ntime.time_ns=lambda: original()+int(os.environ.get("INBOX_TEST_CLOCK_OFFSET","0"))*1000000\n',
    )
    const shim = join(root, 'hc')
    await writeFile(
      shim,
      `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const path=${JSON.stringify(statePath)};
const state=JSON.parse(readFileSync(path,'utf8'));
const args=process.argv.slice(2);
const input=await new Response(Bun.stdin.stream()).text();
appendFileSync(path+'.calls',JSON.stringify({args,inputLength:input.length})+'\\n');
const resolveMachine=selector=>selector==='alias'?state.alias:selector==='old-one'?'one':selector;
if(process.env.HC_TERMINAL_ID) process.exit(2);
if(args[0]==='connect') {
 const request=JSON.parse(input.trim());
 const terminal=selector=>{const selected=resolveMachine(selector.split('/')[0]);return {address:selector,state:'live',labels:{'inbox.session':'11111111-1111-4111-8111-111111111111',...(state.labels?.[selected]??{})},status:{app:'claude-code'},foreground:{argv:[state.programs?.[selected]??'claude']}}};
 let result;
 if(request.method==='machine.list') {
  result={machines:[{name:state.alias==='one'?'alias':'old-one',id:'one',state:'connected'},{name:state.alias==='two'?'alias':'other',id:'two',state:'connected'}]};
  if(state.flip){state.alias='two';state.flip=false;writeFileSync(path,JSON.stringify(state));}
 } else if(request.method==='terminal.list') {
  result={terminals:[terminal('alias/t1')]};
 } else if(request.method==='terminal.get') {
  result=terminal(request.params.terminal);
 } else if(request.method==='terminal.label') {
  const selected=resolveMachine(request.params.terminal.split('/')[0]);
  state.labels={...state.labels,[selected]:{...state.labels?.[selected],...request.params.labels}};
  writeFileSync(path,JSON.stringify(state));result=terminal(request.params.terminal);
 } else if(request.method==='file.read') {
  const selected=resolveMachine(request.params.on);
  result={text:state.contents[selected],first:1,last:1,lines:1};
 } else process.exit(2);
 console.log(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
} else if(args[0]==='exec') {
 const selected=resolveMachine(args[args.indexOf('--on')+1]);
 if(!(selected in state.offsets)) process.exit(2);
 if(!input && state.clockFailure){console.log('unreadable clock');process.exit(0);}
 const command=args.slice(args.indexOf('--')+1);
 const result=Bun.spawnSync(command,{stdin:Buffer.from(input),env:{...process.env,INBOX_TEST_CLOCK_OFFSET:String(state.offsets[selected])},stdout:'pipe',stderr:'pipe'});
 appendFileSync(path+'.calls',JSON.stringify({code:result.exitCode,stderr:result.stderr.toString(),stdout:result.stdout.toString()})+'\\n');
 if(input && state.drop && result.exitCode===0){state.drop=false;writeFileSync(path,JSON.stringify(state));process.exit(1);}
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exit(result.exitCode);
} else process.exit(2);
`,
    )
    await chmod(shim, 0o700)
    const runtime = resolve(import.meta.dir, '../bridge/remote-clock.ts')
    const bindingModule = resolve(import.meta.dir, '../bridge/binding.ts')
    const coreModule = resolve(import.meta.dir, '../bridge/core.ts')
    const publication = resolve(import.meta.dir, '../bridge/publication.ts')
    const remote = resolve(import.meta.dir, '../bridge/remote.ts')
    const program = join(root, 'check.ts')
    await writeFile(
      program,
      `
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir,stat,symlink,rm,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { agentClock } from ${JSON.stringify(runtime)};
import { publishInboxFile as writeRemoteInboxFile, notifyInbox } from ${JSON.stringify(publication)};
import { readPublished } from ${JSON.stringify(remote)};
import { boundTerminal } from ${JSON.stringify(bindingModule)};
import { listTerminals,coreRequest } from ${JSON.stringify(coreModule)};
const root=${JSON.stringify(root)}, statePath=${JSON.stringify(statePath)};
const binding={source:'herdr' as const,socket:'/fixture/core.sock',machine:'alias',machineId:'one',terminal:'alias/t1',session:'11111111-1111-4111-8111-111111111111',appHome:join(root,'published')};
async function change(fields){const state=JSON.parse(await readFile(statePath,'utf8'));await writeFile(statePath,JSON.stringify({...state,...fields}));}
async function clockFor(connection,offset,fresh){
 const before=Date.now()+offset;
 const clock=await agentClock(connection,fresh);
 const after=Date.now()+offset;
 assert.equal(clock.reliable,true);
 assert.ok(clock.now+clock.uncertainty>=before && clock.now-clock.uncertainty<=after);
 return clock;
}
await clockFor(binding,600000,true);
assert.equal(await readPublished(binding),'first');
await change({contents:{one:'new value',two:'other'}});
assert.equal(await readPublished(binding),'first');
assert.equal(await readPublished(binding,true),'new value');
await change({flip:true});
assert.equal(await readPublished(binding,true),'new value');
await clockFor(binding,600000,true);
await assert.rejects(readPublished(binding,true));
await change({offsets:{one:900000,two:-600000}});
const clock=await clockFor(binding,900000,false);
const id=clock.now.toString(36)+'-operation-abcdefghijklmnop';
const command=JSON.stringify({format:2,kind:'command',id,session:binding.session,issuedAt:clock.now,expected:'row-sha256-v1:'+'0'.repeat(64),press:{action:'type',id:'i1',text:'Fixture reply 🌙'}});
await mkdir(binding.appHome,{recursive:true});
await change({drop:true});
await assert.rejects(writeRemoteInboxFile(binding,id,command));
const folder=join(binding.appHome,'inbox','presses',binding.session);
const file=join(folder,id+'.json');
assert.equal(await readFile(file,'utf8'),command);
assert.equal((await stat(file)).mode & 0o777,0o600);
await writeRemoteInboxFile(binding,id,command);
assert.equal(await readFile(file,'utf8'),command);
assert.deepEqual(await readdir(folder),[id+'.json']);
await assert.rejects(writeRemoteInboxFile(binding,'../outside',command));
const outside=join(root,'outside');
await mkdir(outside);
await rm(folder,{recursive:true});
await symlink(outside,folder);
await assert.rejects(writeRemoteInboxFile(binding,id,command));
assert.deepEqual(await readdir(outside),[]);
await unlink(folder);
const presses=join(binding.appHome,'inbox','presses');
await rm(presses,{recursive:true});
await symlink(outside,presses);
await assert.rejects(writeRemoteInboxFile(binding,id,command));
assert.deepEqual(await readdir(outside),[]);
await change({alias:'two',programs:{one:'zsh',two:'claude'}});
await listTerminals(binding,true);
await change({alias:'one'});
await assert.rejects(boundTerminal(binding,false));
await change({programs:{one:'claude',two:'zsh'},flip:true});
assert.equal((await boundTerminal(binding,true)).foreground.argv[0],'claude');
await notifyInbox(binding,'only-original-host');
const original=await coreRequest('terminal.get',{terminal:'one/t1'},binding);
const replacement=await coreRequest('terminal.get',{terminal:'two/t1'},binding);
assert.equal(original.labels['inbox.press'],'only-original-host');
assert.equal(replacement.labels['inbox.press'],undefined);
await change({clockFailure:true});
assert.equal((await agentClock(binding,true)).reliable,false);
await change({clockFailure:false});
await clockFor({...binding,machineId:'two'},-600000,false);
console.log('remote transport checks passed');
`,
    )
    worker = Bun.spawn([process.execPath, program], {
      env: {
        PATH: root + ':' + (process.env.PATH ?? '/usr/bin:/bin'),
        INBOX_RUNTIME_ROOT: root,
        PYTHONPATH: root,
        HC_TERMINAL_ID: 'inherited-parent',
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
      worker.exited,
    ])
    if (code !== 0) console.error(await readFile(statePath + '.calls', 'utf8').catch(() => 'No CLI call completed'))
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    expect(stdout.trim()).toBe('remote transport checks passed')
  } finally {
    if (worker && worker.exitCode === null) {
      worker.kill()
      await worker.exited
    }
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
