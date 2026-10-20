import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, name } from './plugin.js'

test('registers only the read-only disk scan tool using the DSH tool API', async () => {
  const registered = []
  apply({ tools: { register: tool => registered.push(tool) } }, {
    parePath: '',
    reportDirectory: 'C:\\reports',
    timeoutMs: 120000,
  })

  assert.equal(name, '@drag0nm/pare-dsh')
  assert.deepEqual(registered.map(tool => tool.name), ['disk_scan'])
  assert.equal(registered[0].parameters.properties.root.type, 'string')
  assert.deepEqual(registered[0].parameters.required, ['root'])
  await assert.rejects(registered[0].execute({ root: 'C:\\data' }, { signal: new AbortController().signal }), /Configure parePath/)
})
