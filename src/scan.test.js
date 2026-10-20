import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { runPareScan } from './scan.js'

const completeReport = JSON.stringify({
  schema: 'pare.scan/1',
  volume: 'C::12345678',
  complete: true,
  nodes: [{ kind: 'file', logical_size: '9' }],
  errors: [],
})

test('runs the configured core with argument boundaries and keeps a local report', async () => {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'pare-dsh-test-'))
  const reportDirectory = path.join(parentDirectory, 'reports', 'scans')
  let invocation
  try {
    const result = await runPareScan({
      root: 'C:\\Users\\person\\Downloads',
      corePath: process.execPath,
      reportDirectory,
      timeoutMs: 1000,
    }, (command, args, options) => {
      invocation = { command, args, options }
      return childCompletingWith(args.at(-1), completeReport, 0)
    })

    assert.equal(invocation.command, process.execPath)
    assert.deepEqual(invocation.args.slice(0, 4), ['scan', '--root', 'C:\\Users\\person\\Downloads', '--json'])
    assert.equal(invocation.options.shell, false)
    assert.equal(result.summary.entryCount, 1)
    assert.equal((await readFile(result.reportPath, 'utf8')).includes('pare.scan/1'), true)
  } finally {
    await rm(parentDirectory, { recursive: true, force: true })
  }
})

test('preserves an incomplete report returned with exit code 3', async () => {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), 'pare-dsh-test-'))
  const partialReport = JSON.stringify({
    schema: 'pare.scan/1', volume: 'C:', complete: false,
    nodes: [], errors: [{ code: 'access_denied' }],
  })
  try {
    const result = await runPareScan({
      root: 'C:\\data', corePath: process.execPath, reportDirectory, timeoutMs: 1000,
    }, (_command, args) => childCompletingWith(args.at(-1), partialReport, 3))
    assert.equal(result.summary.complete, false)
    assert.deepEqual(result.summary.errorsByCode, [{ code: 'access_denied', count: 1 }])
  } finally {
    await rm(reportDirectory, { recursive: true, force: true })
  }
})

test('rejects unexpected exit codes without reading or exposing a report', async () => {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), 'pare-dsh-test-'))
  try {
    await assert.rejects(runPareScan({
      root: 'C:\\data', corePath: process.execPath, reportDirectory, timeoutMs: 1000,
    }, (_command, args) => childCompletingWith(args.at(-1), completeReport, 4)), /exit code 4/)
  } finally {
    await rm(reportDirectory, { recursive: true, force: true })
  }
})

test('requires an absolute scan root before starting the core', async () => {
  let spawned = false
  await assert.rejects(runPareScan({
    root: 'relative\\data', corePath: process.execPath, reportDirectory: os.tmpdir(), timeoutMs: 1000,
  }, () => { spawned = true }), /absolute path/)
  assert.equal(spawned, false)
})

test('kills the child process and removes its report when cancelled', async () => {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), 'pare-dsh-test-'))
  const controller = new AbortController()
  let killed = false
  try {
    const pending = runPareScan({
      root: 'C:\\data', corePath: process.execPath, reportDirectory, timeoutMs: 1000, signal: controller.signal,
    }, () => {
      const child = new EventEmitter()
      child.stderr = new PassThrough()
      child.kill = () => {
        killed = true
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
        return true
      }
      queueMicrotask(() => controller.abort())
      return child
    })
    await assert.rejects(pending, /was cancelled/)
    assert.equal(killed, true)
  } finally {
    await rm(reportDirectory, { recursive: true, force: true })
  }
})

function childCompletingWith(reportPath, contents, code) {
  const child = new EventEmitter()
  child.stderr = new PassThrough()
  child.kill = () => true
  queueMicrotask(async () => {
    await writeFile(reportPath, contents)
    child.emit('close', code, null)
  })
  return child
}
