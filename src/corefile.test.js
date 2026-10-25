import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PINNED, ensureCore } from './corefile.js'

const content = Buffer.from('fake pare core')
const pinned = { version: '9.9.9', url: 'https://example.invalid/pare.exe', sha256: createHash('sha256').update(content).digest('hex') }
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pare-dsh-'))

test('package.json pins one core release by version, URL and SHA-256', () => {
  assert.match(PINNED.version, /^\d+\.\d+\.\d+$/)
  assert.ok(PINNED.url.startsWith(`https://github.com/DRAG0NM/Pare/releases/download/v${PINNED.version}/`))
  assert.match(PINNED.sha256, /^[0-9a-f]{64}$/)
})

test('downloads once, keeps the file only when the hash matches', () => {
  const dir = tempDir()
  let downloads = 0
  const fetch = (url, dest) => {
    downloads++
    assert.equal(url, pinned.url)
    fs.writeFileSync(dest, content)
  }
  const file = ensureCore({ pinned, dir, fetch })
  assert.equal(path.basename(file), 'pare-9.9.9.exe')
  assert.equal(ensureCore({ pinned, dir, fetch }), file)
  assert.equal(downloads, 1)
})

test('a download with the wrong hash is discarded', () => {
  const dir = tempDir()
  assert.throws(() => ensureCore({ pinned, dir, fetch: (_u, dest) => fs.writeFileSync(dest, 'tampered') }), /refusing to run it/)
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('a core file changed after download is refused, not replaced', () => {
  const dir = tempDir()
  const file = ensureCore({ pinned, dir, fetch: (_u, dest) => fs.writeFileSync(dest, content) })
  fs.writeFileSync(file, 'changed')
  assert.throws(() => ensureCore({ pinned, dir, fetch: () => assert.fail('must not download again') }), /was modified/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed')
})

test('the pinned core lives per user, outside the plugin folder', async () => {
  const { CORE_DIR } = await import('./corefile.js')
  assert.ok(CORE_DIR.endsWith(path.join('Pare', 'core')))
  assert.ok(!CORE_DIR.includes('Pare-DSH'))
})

test('a refused rename falls back to copy-and-delete', async () => {
  const { moveIntoPlace } = await import('./corefile.js')
  const dir = tempDir()
  const src = path.join(dir, 'a.download')
  const dest = path.join(dir, 'a.exe')
  fs.writeFileSync(src, content)
  const exdev = { ...fs, renameSync: () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }) } }
  moveIntoPlace(src, dest, exdev)
  assert.equal(fs.readFileSync(dest, 'utf8'), 'fake pare core')
  assert.equal(fs.existsSync(src), false)

  let tries = 0
  fs.writeFileSync(src, content)
  fs.rmSync(dest)
  const busy = { ...fs, renameSync: (a, b) => (++tries < 3 ? (() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }) })() : fs.renameSync(a, b)) }
  moveIntoPlace(src, dest, busy)
  assert.equal(tries, 3)
  assert.ok(fs.existsSync(dest))
})
