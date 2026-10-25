import { execFileSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** Protocol spoken by `pare serve`; a core reporting another schema is refused. */
export const SCHEMA = 'pare.serve/1'

const HELLO_TIMEOUT_MS = 15000

/**
 * Ask a core for its protocol, version and investigation tools with a one-shot
 * process, so the plugin can register its tools synchronously at startup.
 */
export function hello(corePath, run = execFileSync) {
  const output = run(corePath, ['serve'], {
    input: '{"id":0,"method":"hello"}\n',
    windowsHide: true,
    timeout: HELLO_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  })
  const line = String(output).split('\n').find((l) => l.trim())
  const reply = line ? JSON.parse(line) : null
  if (!reply || reply.error) throw new Error(`Pare core did not answer hello: ${reply?.error ?? 'no output'}`)
  if (reply.result?.schema !== SCHEMA) {
    throw new Error(`Pare core speaks ${reply.result?.schema ?? 'an unknown protocol'}; this plugin needs ${SCHEMA}`)
  }
  return reply.result
}

/**
 * One long-running `pare serve` process. Requests are queued by the core and
 * answered in order; the scan index lives in that process, so it is started once
 * and restarted only after it exits (a restart needs a new scan).
 */
export class PareCore {
  constructor(corePath, spawnFn = spawn) {
    this.corePath = corePath
    this.spawn = spawnFn
    this.child = null
    this.nextId = 1
    this.pending = new Map()
  }

  start() {
    if (this.child) return
    const child = this.spawn(this.corePath, ['serve'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => this.receive(line))
    child.stderr?.resume()
    const fail = (reason) => {
      if (this.child !== child) return
      this.child = null
      for (const { reject, cleanup } of this.pending.values()) {
        cleanup()
        reject(new Error(`Pare core stopped (${reason}); run pare_scan again`))
      }
      this.pending.clear()
    }
    child.on('exit', (code) => fail(`exit code ${code}`))
    child.on('error', (error) => fail(error.message))
  }

  receive(line) {
    if (!line.trim()) return
    let reply
    try {
      reply = JSON.parse(line)
    } catch {
      return
    }
    const waiter = this.pending.get(reply.id)
    if (!waiter) return
    this.pending.delete(reply.id)
    waiter.cleanup()
    if (reply.error) waiter.reject(new Error(reply.error))
    else waiter.resolve(reply.result)
  }

  /**
   * Send one request. Aborting or timing out stops the core process, because the
   * core cannot interrupt a running scan or move; the next call starts a new one.
   */
  request(method, params = {}, { signal, timeoutMs = 600000 } = {}) {
    this.start()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const stop = (reason) => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        cleanup()
        this.close()
        reject(new Error(reason))
      }
      const timer = setTimeout(() => stop(`Pare core timed out after ${Math.round(timeoutMs / 1000)} s`), timeoutMs)
      const onAbort = () => stop('cancelled')
      signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      if (signal?.aborted) return stop('cancelled')
      this.pending.set(id, { resolve, reject, cleanup })
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  close() {
    const child = this.child
    this.child = null
    for (const { reject, cleanup } of this.pending.values()) {
      cleanup()
      reject(new Error('Pare core stopped'))
    }
    this.pending.clear()
    if (child && child.exitCode === null) child.kill()
  }
}
