import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { PareCore, SCHEMA, hello } from './core.js'

// A fake `pare serve` that answers each request line with handler(request).
function fakeSpawn(handler) {
  const spawned = []
  const spawn = (file, args) => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.exitCode = null
    child.kill = () => {
      child.exitCode = 1
      child.emit('exit', 1)
    }
    let buffer = ''
    child.stdin.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const req = JSON.parse(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        const reply = handler(req)
        if (reply) child.stdout.write(JSON.stringify({ id: req.id, ...reply }) + '\n')
      }
    })
    spawned.push({ file, args, child })
    return child
  }
  return { spawn, spawned }
}

test('requests are matched to replies and errors surface', async () => {
  const { spawn, spawned } = fakeSpawn((req) => (req.method === 'scan' ? { result: { files: 3 } } : { error: 'unknown method' }))
  const core = new PareCore('C:\\pare.exe', spawn)
  assert.deepEqual(await core.request('scan', { root: 'C:\\' }), { files: 3 })
  await assert.rejects(core.request('nope'), /unknown method/)
  assert.deepEqual(spawned[0].args, ['serve'])
  assert.equal(spawned.length, 1)
  core.close()
})

test('cancelling stops the core and the next call starts a new one', async () => {
  const { spawn, spawned } = fakeSpawn((req) => (req.method === 'slow' ? null : { result: 'ok' }))
  const core = new PareCore('C:\\pare.exe', spawn)
  const controller = new AbortController()
  const pending = core.request('slow', {}, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /cancelled/)
  assert.equal(spawned[0].child.exitCode, 1)
  assert.equal(await core.request('fast'), 'ok')
  assert.equal(spawned.length, 2)
  core.close()
})

test('hello refuses a core with another protocol', () => {
  const ok = () => JSON.stringify({ id: 0, result: { schema: SCHEMA, tools: [] } }) + '\n'
  assert.deepEqual(hello('C:\\pare.exe', ok).tools, [])
  const old = () => JSON.stringify({ id: 0, result: { schema: 'pare.serve/0' } }) + '\n'
  assert.throws(() => hello('C:\\pare.exe', old), /needs pare\.serve\/1/)
})
