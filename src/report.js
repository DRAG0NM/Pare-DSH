const byteCountPattern = /^(0|[1-9][0-9]*)$/
const errorCodePattern = /^[a-z0-9_]{1,64}$/

export function parseScanSummary(json) {
  let report
  try {
    report = JSON.parse(json)
  } catch (error) {
    throw new Error(`Pare returned invalid JSON: ${error.message}`)
  }

  if (report?.schema !== 'pare.scan/1') {
    throw new Error(`unsupported scan schema: ${String(report?.schema ?? 'missing')}`)
  }
  if (typeof report.volume !== 'string' || typeof report.complete !== 'boolean') {
    throw new Error('Pare scan report is missing volume or complete status')
  }
  if (!Array.isArray(report.nodes) || !Array.isArray(report.errors)) {
    throw new Error('Pare scan report is missing nodes or errors')
  }

  let fileCount = 0
  let directoryCount = 0
  let reparseCount = 0
  let logicalBytes = 0n
  for (const node of report.nodes) {
    if (!['file', 'directory', 'reparse'].includes(node?.kind)) {
      throw new Error('Pare scan report contains an invalid node kind')
    }
    if (typeof node.logical_size !== 'string' || !byteCountPattern.test(node.logical_size)) {
      throw new Error('Pare scan report contains an invalid logical_size')
    }
    logicalBytes += BigInt(node.logical_size)
    if (node.kind === 'file') fileCount++
    if (node.kind === 'directory') directoryCount++
    if (node.kind === 'reparse') reparseCount++
  }

  const errorsByCode = new Map()
  for (const error of report.errors) {
    if (typeof error?.code !== 'string' || !errorCodePattern.test(error.code)) {
      throw new Error('Pare scan report contains an invalid error code')
    }
    errorsByCode.set(error.code, (errorsByCode.get(error.code) ?? 0) + 1)
  }

  const errorCodeCounts = [...errorsByCode]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0)

  return {
    schema: report.schema,
    volume: report.volume,
    complete: report.complete,
    entryCount: report.nodes.length,
    fileCount,
    directoryCount,
    reparseCount,
    logicalBytes: logicalBytes.toString(),
    errorCount: report.errors.length,
    errorsByCode: errorCodeCounts,
  }
}
