import os from 'node:os'
import path from 'node:path'

import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { runPareScan } from './scan.js'

export const name = '@drag0nm/pare-dsh'
export const inject = ['tools']

export const Config = Schema.object({
  parePath: Schema.string().default(process.env.PARE_CORE_PATH ?? ''),
  reportDirectory: Schema.string().default(path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Pare', 'Reports')),
  timeoutMs: Schema.number().default(120000),
})

export function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'disk_scan',
    description: 'Run a read-only Pare scan on a user-selected Windows directory. Returns counts, coverage status, and a local report path. This tool never modifies scanned files.',
    parameters: {
      root: { type: 'string', required: true, description: 'Absolute Windows directory path to scan' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schema: { type: 'string', required: true },
          volume: { type: 'string', required: true },
          complete: { type: 'boolean', required: true },
          entryCount: { type: 'integer', required: true },
          fileCount: { type: 'integer', required: true },
          directoryCount: { type: 'integer', required: true },
          reparseCount: { type: 'integer', required: true },
          logicalBytes: { type: 'string', required: true },
          errorCount: { type: 'integer', required: true },
          errorsByCode: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string', required: true },
                count: { type: 'integer', required: true },
              },
            },
          },
          reportPath: { type: 'string', required: true },
        },
      },
      render: (_args, result) => [{
        type: 'text',
        text: [
          `Pare scan ${result.complete ? 'complete' : 'incomplete'}: ${result.entryCount} entries (${result.fileCount} files, ${result.directoryCount} directories, ${result.reparseCount} reparse points).`,
          `Logical bytes: ${result.logicalBytes}. Coverage errors: ${result.errorCount}.`,
          `Full report: ${result.reportPath}`,
        ].join('\n'),
      }],
    },
    timeoutMs: config.timeoutMs + 10000,
    async execute(args, exec) {
      if (!config.parePath) {
        throw new Error('Configure parePath in the Pare-DSH plugin settings or set PARE_CORE_PATH')
      }
      const result = await runPareScan({
        root: args.root,
        corePath: config.parePath,
        reportDirectory: config.reportDirectory,
        timeoutMs: config.timeoutMs,
        signal: exec.signal,
      })
      return { ...result.summary, reportPath: result.reportPath }
    },
  }))
}
