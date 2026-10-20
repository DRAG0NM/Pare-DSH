import test from 'node:test'
import assert from 'node:assert/strict'

import { parseScanSummary } from './report.js'

const report = {
  schema: 'pare.scan/1',
  volume: 'C::12345678',
  started_at: '2026-10-20T00:00:00Z',
  completed_at: '2026-10-20T00:00:01Z',
  complete: false,
  nodes: [
    { kind: 'file', logical_size: '9007199254740993' },
    { kind: 'directory', logical_size: '0' },
    { kind: 'reparse', logical_size: '0' },
  ],
  errors: [
    { path: 'C:\\private\\blocked', operation: 'enumerate', code: 'access_denied' },
    { path: 'C:\\private\\vanished', operation: 'enumerate', code: 'changed_entry' },
  ],
}

test('summarizes a scan without losing large byte counts or private paths', () => {
  const summary = parseScanSummary(JSON.stringify(report))

  assert.deepEqual(summary, {
    schema: 'pare.scan/1',
    volume: 'C::12345678',
    complete: false,
    entryCount: 3,
    fileCount: 1,
    directoryCount: 1,
    reparseCount: 1,
    logicalBytes: '9007199254740993',
    errorCount: 2,
    errorsByCode: [
      { code: 'access_denied', count: 1 },
      { code: 'changed_entry', count: 1 },
    ],
  })
  assert.equal(JSON.stringify(summary).includes('private'), false)
})

test('rejects an unsupported scan report schema', () => {
  assert.throws(() => parseScanSummary('{"schema":"pare.scan/2"}'), /unsupported scan schema/)
})

test('rejects malformed report nodes and byte counts', () => {
  assert.throws(() => parseScanSummary(JSON.stringify({ ...report, nodes: [{ kind: 'file', logical_size: 7 }] })), /logical_size/)
  assert.throws(() => parseScanSummary(JSON.stringify({ ...report, nodes: [{ kind: 'mystery', logical_size: '7' }] })), /kind/)
})

test('counts unusual error codes without treating object prototype keys specially', () => {
  const unusual = { ...report, errors: [{ code: '__proto__' }, { code: '__proto__' }] }
  assert.deepEqual(parseScanSummary(JSON.stringify(unusual)).errorsByCode, [{ code: '__proto__', count: 2 }])
})
