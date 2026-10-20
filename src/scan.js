import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { parseScanSummary } from './report.js'

const maxReportBytes = 64 * 1024 * 1024

export async function runPareScan({ root, corePath, reportDirectory, timeoutMs, signal }, spawnProcess = spawn) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new Error('scan root must be a non-empty path')
  }
  if (!path.isAbsolute(root)) {
    throw new Error('scan root must be an absolute path')
  }
  if (!path.isAbsolute(corePath ?? '')) {
    throw new Error('Pare core path must be configured as an absolute path')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error('scan timeout must be at least 1000 milliseconds')
  }
  if (signal?.aborted) throw new Error('Pare scan was cancelled')

  try {
    await stat(corePath)
  } catch {
    throw new Error('configured Pare Core executable is unavailable')
  }
  const baseDirectory = reportDirectory || os.tmpdir()
  try {
    await mkdir(baseDirectory, { recursive: true })
  } catch {
    throw new Error('could not prepare the local report directory')
  }
  const resultDirectory = await mkdtemp(path.join(baseDirectory, 'pare-dsh-'))
  const reportPath = path.join(resultDirectory, 'scan.json')
  const args = ['scan', '--root', path.resolve(root), '--json', reportPath]

  try {
    const { code } = await runProcess(spawnProcess, corePath, args, timeoutMs, signal)
    if (code !== 0 && code !== 3) {
      throw new Error(`Pare scan failed with exit code ${code}`)
    }
    let reportInfo
    try {
      reportInfo = await stat(reportPath)
    } catch {
      throw new Error('Pare did not create a scan report')
    }
    if (reportInfo.size > maxReportBytes) {
      throw new Error(`Pare report exceeds the ${maxReportBytes} byte limit`)
    }
    let reportJSON
    try {
      reportJSON = await readFile(reportPath, 'utf8')
    } catch {
      throw new Error('could not read the local Pare report')
    }
    const summary = parseScanSummary(reportJSON)
    if ((code === 0) !== summary.complete) {
      throw new Error(`Pare exit code ${code} disagrees with the report completeness flag`)
    }
    return { summary, reportPath }
  } catch (error) {
    await rm(resultDirectory, { recursive: true, force: true })
    throw error
  }
}

function runProcess(spawnProcess, command, args, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let stoppedFor = ''
    let settled = false
    let killTimer
    const child = spawnProcess(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(result)
    }
    const stop = reason => {
      if (stoppedFor) return
      stoppedFor = reason
      child.kill()
      killTimer = setTimeout(() => finish(new Error(`Pare scan ${reason}; child process did not stop`)), 5000)
    }
    const abort = () => stop('was cancelled')
    const timeoutTimer = setTimeout(() => stop(`exceeded ${timeoutMs} milliseconds`), timeoutMs)

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    child.stderr?.on('data', () => {})
    child.once('error', () => finish(new Error('could not start Pare Core')))
    child.once('close', (code, signalName) => {
      if (stoppedFor) {
        finish(new Error(`Pare scan ${stoppedFor}`))
      } else if (signalName) {
        finish(new Error(`Pare scan process ended from signal ${signalName}`))
      } else {
        finish(null, { code })
      }
    })
  })
}
