import test from 'node:test'
import assert from 'node:assert/strict'

import { GATED, apply, name } from './plugin.js'

function host(core) {
  const registered = new Map()
  let gate
  const ctx = {
    tools: { register: (tool) => registered.set(tool.name, tool) },
    on: (event, fn) => {
      if (event === 'tools/pre-execute') gate = fn
    },
  }
  apply(ctx, { parePath: 'C:\\pare.exe', timeoutMs: 1000 }, {
    core,
    info: {
      tools: [{ name: 'list_dir', description: 'List a folder', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }],
      templates: [{ ID: 'wsl_set_sparse', Description: 'make a WSL disk sparse', Params: ['distro'] }],
    },
  })
  const exec = { signal: new AbortController().signal }
  const ask = (toolName, args) => gate({ name: toolName, arguments: args }, async () => ({ kind: 'allow' }))
  return { registered, exec, ask }
}

const preview = {
  id: 'abc', digest: 'sha256:1', runnable: true, bytes: 4096, expiresAt: new Date(Date.now() + 60000).toISOString(),
  items: [{ path: 'C:\\cache', kind: 'directory', bytes: 4096, executable: true }, { path: 'C:\\Windows\\System32', kind: 'directory', bytes: 0, executable: false, reason: '受保护的位置：Windows 系统目录' }],
  actions: [{ template: 'npm_cache_clean', steps: ['cmd.exe /d /c npm cache clean --force'], warnings: [], needsAdmin: false }],
}

test('registers scan, core investigation tools and the cleanup tools', () => {
  const { registered } = host({ request: async () => ({}) })
  assert.equal(name, '@drag0nm/pare-dsh')
  for (const tool of ['pare_scan', 'pare_list_dir', 'pare_prepare_cleanup', 'pare_execute', 'pare_list_quarantine', 'pare_undo', 'pare_purge', 'pare_read_sensitive']) {
    assert.ok(registered.has(tool), `${tool} registered`)
  }
  assert.ok(registered.get('pare_list_dir').parameters.properties.path)
  assert.match(registered.get('pare_prepare_cleanup').description, /wsl_set_sparse\(distro\)/)
})

test('write tools ask the user with the stored plan; unknown ids are denied', async () => {
  const calls = []
  const core = { request: async (method, params) => (calls.push([method, params]), method === 'prepare' ? preview : { quarantined: 1, quarantinedBytes: 4096, skipped: [], actions: [], manifest: 'C:\\q\\b\\manifest.json' }) }
  const { registered, exec, ask } = host(core)

  assert.equal((await ask('pare_list_dir', { path: 'C:\\' })).kind, 'allow')
  assert.equal((await ask('pare_execute', { id: 'abc' })).kind, 'deny')

  const shown = await registered.get('pare_prepare_cleanup').execute({ quarantine: ['C:\\cache', 'C:\\Windows\\System32'] }, exec)
  assert.match(shown, /✓ C:\\cache/)
  assert.match(shown, /✗ C:\\Windows\\System32/)

  const decision = await ask('pare_execute', { id: 'abc' })
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason, /C:\\cache/)
  assert.doesNotMatch(decision.reason, /System32/)
  assert.match(decision.displayReason['zh-CN'], /无法撤回/)

  await registered.get('pare_execute').execute({ id: 'abc' }, exec)
  assert.deepEqual(calls.at(-1), ['execute', { id: 'abc', digest: 'sha256:1' }])
  // A cleanup runs once; the id is gone afterwards.
  assert.equal((await ask('pare_execute', { id: 'abc' })).kind, 'deny')
  for (const tool of GATED) if (tool !== 'pare_execute') assert.equal((await ask(tool, { manifest: 'm', path: 'p' })).kind, 'ask')

  // A rescan discards prepared cleanups, so their ids are denied without asking.
  await registered.get('pare_prepare_cleanup').execute({ quarantine: ['C:\\cache'] }, exec)
  core.request = async () => ({ root: 'C:\\', complete: true, seconds: 1, files: 1, directories: 1, allocationBytes: 1, uniqueBytes: 1, coverageGaps: 0 })
  await registered.get('pare_scan').execute({ root: 'C:\\' }, exec)
  assert.equal((await ask('pare_execute', { id: 'abc' })).kind, 'deny')
})

test('a missing core path gives a clear error', async () => {
  const registered = new Map()
  apply({ tools: { register: (t) => registered.set(t.name, t) }, on() {} }, { parePath: '', timeoutMs: 1000 })
  await assert.rejects(registered.get('pare_scan').execute({ root: 'C:\\' }, { signal: new AbortController().signal }), /parePath/)
})
