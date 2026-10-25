import test from 'node:test'
import assert from 'node:assert/strict'

import { size, toParameters } from './format.js'

test('core JSON Schemas become dsh-tools parameter maps', () => {
  const parameters = toParameters(JSON.stringify({
    type: 'object',
    properties: {
      path: { type: 'string', description: 'folder' },
      limit: { type: 'integer' },
      names: { type: 'array', items: { type: 'string' } },
    },
    required: ['path'],
  }))
  assert.deepEqual(parameters.path, { type: 'string', description: 'folder', required: true })
  assert.deepEqual(parameters.limit, { type: 'integer' })
  assert.deepEqual(parameters.names, { type: 'array', items: { type: 'string' } })
  assert.deepEqual(toParameters('{}'), {})
})

test('sizes use 1024-based units', () => {
  assert.equal(size(512), '512 B')
  assert.equal(size(1536), '1.5 KB')
  assert.equal(size(11.08 * 2 ** 30), '11.1 GB')
})
