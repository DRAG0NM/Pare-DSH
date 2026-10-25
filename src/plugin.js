import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { PareCore, hello } from './core.js'
import { PINNED, ensureCore, verifyCore } from './corefile.js'
import { batchesText, executeReason, executeText, previewText, purgeReason, scanText, sensitiveReason, toParameters, undoReason } from './format.js'

export const name = '@drag0nm/pare-dsh'
export const inject = ['tools']

export const Config = Schema.object({
  // Empty: use the pinned core shipped with this plugin version (downloaded and
  // hash-checked on first start). Set it only to run a core you built yourself.
  parePath: Schema.string().default(process.env.PARE_CORE_PATH ?? ''),
  timeoutMs: Schema.number().default(600000),
})

/** Tools that change the machine or reveal secrets; each call needs the user's one-shot approval. */
export const GATED = new Set(['pare_execute', 'pare_undo', 'pare_purge', 'pare_read_sensitive'])

const text = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }

export function apply(ctx, config, deps = {}) {
  // Without an override the plugin runs exactly the pinned core: the file must match
  // the pinned SHA-256 before every start of the process, and report the pinned version.
  let corePath = config.parePath
  let pinned = null
  let setupError = ''
  if (!corePath && !deps.core) {
    try {
      corePath = (deps.ensureCore ?? ensureCore)()
      pinned = deps.pinned ?? PINNED
    } catch (error) {
      setupError = error.message
    }
  }
  const verify = pinned ? () => (deps.verifyCore ?? verifyCore)(corePath, pinned) : undefined
  const core = deps.core ?? new PareCore(corePath, undefined, verify)
  const previews = new Map()
  const call = (method, params, exec, timeoutMs = config.timeoutMs) => {
    if (setupError) throw new Error(`Pare core is not available: ${setupError}`)
    if (!corePath && !deps.core) throw new Error('Pare core is not available: set parePath or PARE_CORE_PATH to the absolute path of pare.exe')
    return core.request(method, params, { signal: exec.signal, timeoutMs })
  }
  ctx.on?.('dispose', () => core.close())

  // Every write call asks the user first. The prompt is built from what Pare stored,
  // never from the model's description, and an unknown id is denied outright.
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!GATED.has(exec.name)) return next()
    const args = exec.arguments ?? {}
    switch (exec.name) {
      case 'pare_execute': {
        const preview = previews.get(args.id)
        if (!preview) return { kind: 'deny', reason: 'Unknown cleanup id. Call pare_prepare_cleanup first and pass the id it returns.' }
        if (Date.parse(preview.expiresAt) < Date.now()) {
          previews.delete(args.id)
          return { kind: 'deny', reason: 'This cleanup expired. Prepare it again and show the user the new list.' }
        }
        const display = executeReason(preview)
        return { kind: 'ask', reason: display.en, displayReason: display }
      }
      case 'pare_undo': {
        const display = undoReason(args.manifest)
        return { kind: 'ask', reason: display.en, displayReason: display }
      }
      case 'pare_purge': {
        const display = purgeReason(args.manifest)
        return { kind: 'ask', reason: display.en, displayReason: display }
      }
      case 'pare_read_sensitive': {
        const display = sensitiveReason(args.path, args.reason)
        return { kind: 'ask', reason: display.en, displayReason: display }
      }
    }
    return next()
  })

  const register = (definition) => ctx.tools.register(defineTool({ output: text, ...definition }))

  register({
    name: 'pare_scan',
    description: 'Start here. Scan a drive or folder with Pare (read-only) and keep the index for the other pare_ tools. Pare looks for disk waste specific to this machine: leftover updater packages, virtual disks that never shrink, side-by-side old versions, caches, logs without limits. Investigate with the pare_ tools, report each problem with its evidence, then use pare_prepare_cleanup and pare_execute (the user approves each execution).',
    parameters: { root: { type: 'string', required: true, description: 'Absolute Windows path, for example C:\\' } },
    timeoutMs: config.timeoutMs + 10000,
    async execute(args, exec) {
      const summary = await call('scan', { root: args.root }, exec)
      // A new scan discards every cleanup the core prepared from the old one.
      previews.clear()
      return scanText(summary)
    },
  })

  // Read-only investigation tools and templates come from the core so they always
  // match its version.
  let info = { tools: [], templates: [] }
  try {
    info = deps.info ?? (corePath && !setupError ? hello(corePath) : info)
    if (pinned && info.version !== pinned.version) {
      throw new Error(`the core reports version ${info.version || 'unknown'}, but this plugin is pinned to ${pinned.version}`)
    }
  } catch (error) {
    if (pinned) setupError = error.message
    info = { tools: [], templates: [] }
    ctx.logger?.('pare-dsh')?.warn?.(error.message)
  }
  const tools = info.tools ?? []
  const templates = (info.templates ?? []).map((t) => `${t.ID}(${(t.Params ?? []).join(', ')}): ${t.Description}`).join('; ')
  for (const tool of tools) {
    register({
      name: `pare_${tool.name}`,
      description: `${tool.description} (Pare, read-only; needs pare_scan first.)`,
      parameters: toParameters(tool.parameters),
      timeoutMs: config.timeoutMs + 10000,
      async execute(args, exec) {
        return call('tool', { name: tool.name, args }, exec)
      },
    })
  }

  register({
    name: 'pare_read_sensitive',
    description: 'Read the text of a file that Pare marks as sensitive (keys, .env, browser login data, credential stores). Only when the investigation truly needs it; the user is asked each time and the content goes to the model provider.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path of the file' },
      reason: { type: 'string', required: true, description: 'Why the content is needed, shown to the user' },
    },
    async execute(args, exec) {
      return call('read_sensitive', { path: args.path }, exec, 60000)
    },
  })

  register({
    name: 'pare_prepare_cleanup',
    description: 'Prepare a cleanup for the user to review. Nothing changes yet. quarantine: files or folders to move into the Pare quarantine (reversible; Pare refuses protected locations, files in use and anything changed since the scan). actions: supported templates with parameters, for system-level fixes such as making a WSL disk sparse. Prefer quarantine whenever the waste can be named by path. Returns an id for pare_execute.' + (templates ? ` Templates: ${templates}` : ''),
    parameters: {
      quarantine: { type: 'array', items: { type: 'string' }, description: 'Absolute paths to move into quarantine' },
      actions: {
        type: 'array',
        description: 'Supported action templates',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            template: { type: 'string', required: true, description: 'Template id, for example wsl_set_sparse' },
            params: { type: 'object', additionalProperties: true, description: 'Template parameters as strings' },
          },
        },
      },
    },
    timeoutMs: 120000,
    async execute(args, exec) {
      const preview = await call('prepare', { quarantine: args.quarantine ?? [], actions: args.actions ?? [] }, exec, 110000)
      if (preview.runnable) {
        previews.set(preview.id, preview)
        if (previews.size > 20) previews.delete(previews.keys().next().value)
      }
      return previewText(preview)
    },
  })

  register({
    name: 'pare_execute',
    description: 'Execute a cleanup prepared by pare_prepare_cleanup. The user is shown exactly what will happen and must approve. Quarantines run first; Pare re-checks every item right before moving it.',
    parameters: { id: { type: 'string', required: true, description: 'The id returned by pare_prepare_cleanup' } },
    timeoutMs: config.timeoutMs + 10000,
    async execute(args, exec) {
      const preview = previews.get(args.id)
      if (!preview) throw new Error('Unknown cleanup id; prepare it again')
      previews.delete(args.id)
      return executeText(await call('execute', { id: preview.id, digest: preview.digest }, exec))
    },
  })

  register({
    name: 'pare_list_quarantine',
    description: 'List Pare quarantine batches on local drives with what each still holds.',
    parameters: {},
    async execute(_args, exec) {
      return batchesText(await call('batches', {}, exec, 60000))
    },
  })

  register({
    name: 'pare_undo',
    description: 'Restore a quarantine batch to its original locations (never overwrites a file that took the original path). The user must approve.',
    parameters: { manifest: { type: 'string', required: true, description: 'Batch manifest path from pare_list_quarantine or pare_execute' } },
    timeoutMs: config.timeoutMs + 10000,
    async execute(args, exec) {
      const result = await call('undo', { manifest: args.manifest }, exec)
      const restored = result.items.filter((i) => i.state === 'restored').length
      const conflicts = result.items.filter((i) => i.state === 'conflict').length
      return `Restored ${restored} items${conflicts ? `; ${conflicts} not restored because a file now exists at the original path` : ''}.`
    },
  })

  register({
    name: 'pare_purge',
    description: 'Permanently delete a quarantine batch to free its space. Cannot be undone. The user must approve.',
    parameters: { manifest: { type: 'string', required: true, description: 'Batch manifest path' } },
    timeoutMs: config.timeoutMs + 10000,
    async execute(args, exec) {
      const result = await call('purge', { manifest: args.manifest }, exec)
      return `Purged ${result.purged} items; free space grew by ${Math.max(0, result.freedBytes)} bytes.`
    },
  })
}
