// Pure helpers: tool schema conversion, result text and approval prompts.

/** Convert a core tool's JSON Schema into the dsh-tools parameter map. */
export function toParameters(jsonSchema) {
  const schema = typeof jsonSchema === 'string' ? JSON.parse(jsonSchema) : jsonSchema
  const required = new Set(schema?.required ?? [])
  const parameters = {}
  for (const [name, property] of Object.entries(schema?.properties ?? {})) {
    parameters[name] = { ...toValue(property), ...(required.has(name) ? { required: true } : {}) }
  }
  return parameters
}

function toValue(property) {
  const value = { type: property.type ?? 'string' }
  if (property.description) value.description = property.description
  if (property.enum) value.enum = property.enum
  if (value.type === 'array') value.items = property.items ? toValue(property.items) : { type: 'string' }
  if (value.type === 'object') {
    value.properties = toParameters(property)
    value.additionalProperties = property.additionalProperties !== false
  }
  return value
}

export function size(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes) || 0
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`
}

export function scanText(s) {
  return [
    `Scanned ${s.root} ${s.complete ? '(complete)' : `(incomplete: ${s.coverageGaps} unreadable locations)`} in ${s.seconds.toFixed(1)} s.`,
    `${s.files} files, ${s.directories} folders, ${size(s.allocationBytes)} on disk (${size(s.uniqueBytes)} without duplicate hard links).`,
    s.volumeUsedBytes ? `The drive has ${size(s.volumeUsedBytes)} in use.` : '',
    'Next: call pare_scan_overview, then narrow down with the other pare_ tools.',
  ].filter(Boolean).join('\n')
}

const MAX_LISTED = 40

export function previewText(p) {
  const lines = [`Cleanup prepared: id ${p.id}. Nothing has changed yet.`]
  const ok = p.items.filter((i) => i.executable)
  const refused = p.items.filter((i) => !i.executable)
  if (ok.length) {
    lines.push(`Will move to the Pare quarantine (reversible) — ${ok.length} items, ${size(p.bytes)}:`)
    for (const i of ok.slice(0, MAX_LISTED)) lines.push(`  ✓ ${i.path} (${size(i.bytes)})`)
    if (ok.length > MAX_LISTED) lines.push(`  … and ${ok.length - MAX_LISTED} more`)
  }
  if (refused.length) {
    lines.push(`Refused by Pare's checks — ${refused.length} items:`)
    for (const i of refused.slice(0, MAX_LISTED)) lines.push(`  ✗ ${i.path}: ${i.reason}`)
  }
  for (const a of p.actions) {
    if (a.error) lines.push(`Template ${a.template} refused: ${a.error}`)
    else {
      lines.push(`Will run template ${a.template} (cannot be undone by Pare)${a.needsAdmin ? ', needs administrator rights' : ''}:`)
      for (const s of a.steps) lines.push(`  > ${s}`)
      for (const w of a.warnings) lines.push(`  ! ${w}`)
    }
  }
  lines.push(p.runnable
    ? 'Show this list to the user. If they want it, call pare_execute with this id; they will be asked to approve it.'
    : 'Nothing in this cleanup can run.')
  return lines.join('\n')
}

export function executeText(r) {
  const lines = []
  if (r.manifest) lines.push(`Moved ${r.quarantined} items (${size(r.quarantinedBytes)}) to quarantine batch ${r.manifest}. They still use space until purged; pare_undo restores them.`)
  for (const s of r.skipped) lines.push(`  skipped ${s.path}: ${s.reason}`)
  for (const a of r.actions) lines.push(`Template ${a.template}: ${a.status}${a.error ? ` — ${a.error}` : ''}${a.output ? `\n${a.output}` : ''}`)
  if (r.error) lines.push(`Error: ${r.error}`)
  if (r.freeBefore) lines.push(`Free space: ${size(r.freeBefore)} → ${size(r.freeAfter)}.`)
  return lines.join('\n') || 'Nothing was executed.'
}

export function batchesText(batches) {
  if (!batches.length) return 'The quarantine is empty.'
  return batches.map((b) => `${b.manifest} — created ${b.createdAt}, ${b.quarantined} quarantined (${size(b.quarantinedBytes)}), ${b.restored} restored, ${b.purged} purged`).join('\n')
}

/**
 * Text of the approval prompt for an execution. It lists exactly what the stored
 * preview will do, so the user approves the content and not only an id.
 */
export function executeReason(p) {
  const ok = p.items.filter((i) => i.executable)
  const en = [`Pare will run cleanup ${p.id}.`]
  const zh = [`Pare 将执行清理 ${p.id}。`]
  if (ok.length) {
    en.push(`Move ${ok.length} items (${size(p.bytes)}) to the quarantine (reversible):`)
    zh.push(`把 ${ok.length} 项（${size(p.bytes)}）移入隔离区（可撤回）：`)
    for (const i of ok.slice(0, MAX_LISTED)) {
      en.push(`  ${i.path}`)
      zh.push(`  ${i.path}`)
    }
    if (ok.length > MAX_LISTED) {
      en.push(`  … and ${ok.length - MAX_LISTED} more`)
      zh.push(`  …另有 ${ok.length - MAX_LISTED} 项`)
    }
  }
  for (const a of p.actions.filter((x) => !x.error)) {
    en.push(`Run (cannot be undone): ${a.steps.join(' && ')}`)
    zh.push(`运行（无法撤回）：${a.steps.join(' && ')}`)
  }
  return { en: en.join('\n'), 'zh-CN': zh.join('\n') }
}

export function undoReason(manifest) {
  return { en: `Pare will restore quarantine batch ${manifest} to the original locations.`, 'zh-CN': `Pare 将把隔离批次 ${manifest} 恢复到原位置。` }
}

export function purgeReason(manifest) {
  return { en: `Pare will PERMANENTLY delete quarantine batch ${manifest}. This cannot be undone.`, 'zh-CN': `Pare 将永久删除隔离批次 ${manifest}，无法恢复。` }
}

export function sensitiveReason(path, why) {
  return { en: `The AI wants to read a sensitive file: ${path}${why ? ` (${why})` : ''}. Its content will be sent to the model provider.`, 'zh-CN': `AI 想读取敏感文件：${path}${why ? `（${why}）` : ''}。内容会发送给模型服务商。` }
}
