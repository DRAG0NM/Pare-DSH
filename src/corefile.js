import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** The one Pare core release this plugin version runs: version, download URL, SHA-256. */
export const PINNED = pkg.pareCore

/**
 * Where the plugin keeps the pinned core: per user, outside the plugin's own folder,
 * so reinstalling or upgrading the plugin inside a DSH profile does not discard it.
 * Each version has its own file name, so plugin versions pinned to different cores coexist.
 */
export const CORE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Pare', 'core')

export function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/**
 * Download url to dest. curl.exe ships with Windows and honours HTTPS_PROXY; when it
 * fails, PowerShell is tried because it uses the Windows system proxy.
 */
export function download(url, dest, run = execFileSync) {
  const curl = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe')
  const options = { windowsHide: true, stdio: 'pipe', timeout: 310000 }
  try {
    run(curl, ['--fail', '--location', '--silent', '--show-error', '--max-time', '300', '--output', dest, url], options)
    return
  } catch (curlError) {
    const quote = (s) => `'${String(s).replaceAll("'", "''")}'`
    try {
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri ${quote(url)} -OutFile ${quote(dest)}`], options)
    } catch (psError) {
      throw new Error(`could not download the Pare core from ${url}: ${String(curlError.stderr || curlError.message).trim()} / ${String(psError.stderr || psError.message).trim()}`)
    }
  }
}

/**
 * Return the path of the pinned core, downloading it on first use. The file is only
 * accepted when its SHA-256 equals the pinned one, both right after download and on
 * every later call; a modified file is refused rather than replaced, so the user sees it.
 */
export function ensureCore({ pinned = PINNED, dir = CORE_DIR, fetch = download } = {}) {
  if (!pinned?.version || !pinned?.url || !/^[0-9a-f]{64}$/.test(pinned?.sha256 ?? '')) {
    throw new Error('package.json has no valid pareCore pin (version, url, sha256)')
  }
  const file = path.join(dir, `pare-${pinned.version}.exe`)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true })
    const partial = `${file}.download`
    fs.rmSync(partial, { force: true })
    fetch(pinned.url, partial)
    const got = fs.existsSync(partial) ? sha256File(partial) : 'nothing downloaded'
    if (got !== pinned.sha256) {
      fs.rmSync(partial, { force: true })
      throw new Error(`downloaded Pare core ${pinned.version} has SHA-256 ${got}, expected ${pinned.sha256}; refusing to run it`)
    }
    moveIntoPlace(partial, file)
  }
  verifyCore(file, pinned)
  return file
}

const MOVE_ATTEMPTS = 20
const MOVE_WAIT_MS = 250

/**
 * Rename src to dest. Windows refuses some renames: EXDEV inside an EFS-encrypted
 * AppData\Local (seen on the development machine), and EPERM/EBUSY while an antivirus
 * scanner still holds a fresh .exe. EXDEV falls back to copy-and-delete; a lock is
 * retried for a few seconds before also falling back to a copy.
 */
export function moveIntoPlace(src, dest, io = fs) {
  for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
    try {
      io.renameSync(src, dest)
      return
    } catch (error) {
      if (error.code === 'EXDEV') break
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, MOVE_WAIT_MS)
    }
  }
  io.copyFileSync(src, dest)
  io.rmSync(src, { force: true })
}

/** Refuse a core file whose content no longer matches the pin. */
export function verifyCore(file, pinned = PINNED) {
  const got = sha256File(file)
  if (got !== pinned.sha256) {
    throw new Error(`Pare core ${file} was modified (SHA-256 ${got}, expected ${pinned.sha256}). Delete it to download the pinned version again.`)
  }
}
