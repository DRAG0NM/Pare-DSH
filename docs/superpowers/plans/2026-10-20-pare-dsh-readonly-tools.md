# Pare-DSH Read-Only Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DSH tools for read-only scanning and plan preview through a pinned Pare Core CLI.

**Architecture:** A TypeScript adapter validates tool input, launches Pare Core as a child process with argument arrays, validates versioned JSON, and returns bounded summaries. A DSH-specific entry point is added only after the official SDK contract is verified; write tools remain unregistered.

**Tech Stack:** Node.js, TypeScript, Vitest, DSH official SDK after version verification.

**Spec:** `docs/design.md`, sections 2 through 7.

## Global Constraints

- Initial tools are `disk_scan` and `disk_plan`; neither mutates files selected for cleanup.
- No shell command strings, arbitrary paths, globs or model-provided executable arguments.
- Core version and schema compatibility are checked before invocation.
- Tool output is bounded and does not return the full path inventory by default.
- `disk_apply` and `disk_undo` do not exist until the DSH approval contract has independent tests.
- The DSH SDK and package format must be verified from official documentation before adding the host adapter.

## Review Focus

- Malformed or oversized tool input: reject before process launch.
- Modified/mismatched core binary: verify its digest and refuse execution.
- Timeout, cancellation and child exit with partial output: return explicit incomplete/error state.
- Invalid or unsupported JSON schema: never present it as a successful scan.
- User paths and scan details: return only bounded summaries unless a user explicitly requests a local report reference.

---

### Task 1: Verify and record the DSH host contract

**Files:**
- Create: `docs/host-contract.md`
- Modify: `README.md`

**Interfaces:**
- Record the exact DSH SDK/package name and version, tool registration API, input schema format, cancellation behavior, approval signals, sidecar distribution rules and official source URLs.
- If a capability is absent or undocumented, record it as unavailable; do not implement a substitute approval mechanism.

- [ ] **Step 1: Collect official host documentation**

Read the DSH vendor documentation and sample plugin. Do not infer contract details from third-party examples alone.

- [ ] **Step 2: Write contract checks**

For each capability, record a source link and a small runnable or documented host fixture that proves the behavior. Mark write approval unavailable until the host exposes a verifiable binding to plan content.

- [ ] **Step 3: Review README claims**

Ensure README labels SDK and approval integration according to the evidence recorded in `docs/host-contract.md`.

- [ ] **Step 4: Commit**

Commit as `docs: record verified dsh host contract`.

### Task 2: Bootstrap the TypeScript package and protocol types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/protocol.ts`
- Test: `src/protocol.test.ts`

**Interfaces:**
- `ScanRequest` contains a bounded `volume` and optional supported scan flags.
- `PlanRequest` contains only a Pare `scanId` and a rule-set version.
- `ScanResponse` and `PlanResponse` identify their exact schema version and include completeness/status fields.
- Runtime validation functions are `parseScanResponse(value: unknown)` and `parsePlanResponse(value: unknown)`.
- `package.json` scripts are `test: vitest` and `typecheck: tsc --noEmit`.

- [ ] **Step 1: Write failing protocol tests**

Test valid `pare.scan/1` and `pare.plan/1`, unsupported schemas, missing fields, wrong numeric types, oversized strings and malformed JSON input values.

- [ ] **Step 2: Run tests**

Run: `npm test -- --run src/protocol.test.ts`
Expected: FAIL because parsers are not implemented.

- [ ] **Step 3: Implement protocol parsers**

Use small explicit validators for fields the adapter consumes. Preserve unknown fields only when the schema version is supported; reject unsupported versions.

- [ ] **Step 4: Run tests and type check**

Run: `npm test -- --run src/protocol.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

Commit as `feat: define pare cli protocol types`.

### Task 3: Implement the safe Pare CLI runner

**Files:**
- Create: `src/core/runner.ts`
- Test: `src/core/runner.test.ts`

**Interfaces:**
- `runCore(args: readonly string[], options: RunOptions): Promise<CoreResult>`.
- `RunOptions` contains `binaryPath`, `expectedVersion`, `expectedSha256`, `timeoutMs`, `signal`, and `maxOutputBytes`.
- `CoreResult` contains `exitCode`, bounded `stdout`, bounded `stderr`, `timedOut`, and `cancelled`.
- Process launch uses `spawn(binaryPath, args, { shell: false })`.

- [ ] **Step 1: Write failing runner tests**

Use a fake child process to test argument preservation for spaces and Unicode, no-shell invocation, output limit, non-zero exit, timeout and cancellation.

- [ ] **Step 2: Run tests**

Run: `npm test -- --run src/core/runner.test.ts`
Expected: FAIL because `runCore` is not implemented.

- [ ] **Step 3: Implement runner**

Verify the executable SHA-256 and reported core version before tool commands. On timeout or cancellation, terminate the child and resolve with an explicit non-success state.

- [ ] **Step 4: Run tests and type check**

Run: `npm test -- --run src/core/runner.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

Commit as `feat: run pinned pare core safely`.

### Task 4: Add read-only tool handlers

**Files:**
- Create: `src/tools/disk-scan.ts`
- Create: `src/tools/disk-plan.ts`
- Test: `src/tools/disk-scan.test.ts`
- Test: `src/tools/disk-plan.test.ts`

**Interfaces:**
- `handleDiskScan(input: unknown, deps: ToolDependencies): Promise<ToolReply>`.
- `handleDiskPlan(input: unknown, deps: ToolDependencies): Promise<ToolReply>`.
- Both handlers return bounded summaries, completeness state, and a local report reference; neither accepts arbitrary filesystem paths beyond the validated volume selector.

- [ ] **Step 1: Write failing handler tests**

Test argument validation, command construction, schema parsing, partial scan results, unsupported schema, non-zero process exit and maximum response size.

- [ ] **Step 2: Run tests**

Run: `npm test -- --run src/tools/disk-scan.test.ts src/tools/disk-plan.test.ts`
Expected: FAIL because handlers are not implemented.

- [ ] **Step 3: Implement handlers**

Use injected runner and report-store interfaces. Do not concatenate command strings. Do not return the full node list to the host.

- [ ] **Step 4: Run tests and type check**

Run: `npm test -- --run src/tools/disk-scan.test.ts src/tools/disk-plan.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

Commit as `feat: add read-only scan and plan handlers`.

### Task 5: Add the DSH adapter after contract verification

**Files:**
- Create: `src/host/register-tools.ts`
- Create: `src/index.ts`
- Test: `src/host/register-tools.test.ts`
- Modify: `docs/host-contract.md`

**Interfaces:**
- `registerPareTools(registry: VerifiedDshToolRegistry, deps: ToolDependencies): void` registers only `disk_scan` and `disk_plan`.
- `VerifiedDshToolRegistry` maps the exact official SDK method and schemas documented in `host-contract.md`.
- No write-capable tool is registered.

- [ ] **Step 1: Create a host fixture test**

Use the SDK-provided test host or a minimal fixture that invokes the official registration path. Assert exact tool names and input schemas.

- [ ] **Step 2: Run host registration test**

Run: `npm test -- --run src/host/register-tools.test.ts`
Expected: FAIL until host registration is implemented.

- [ ] **Step 3: Implement the SDK adapter**

Use only APIs and package versions recorded in `docs/host-contract.md`. If cancellation or output limits cannot be enforced, leave the affected tool unregistered and document the limitation.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

Commit as `feat: register pare read-only dsh tools`.

### Task 6: Package and document the read-only plugin

**Files:**
- Create: `scripts/verify-core.ps1`
- Modify: `README.md`
- Modify: `docs/development-plan.md`

**Interfaces:**
- Packaged core version and SHA-256 are explicit release metadata; the plugin never resolves a floating `latest` tag.
- Package output excludes scan reports, logs, credentials and local binaries that are not release assets.

- [ ] **Step 1: Write packaging verification checks**

Test that the package contains only plugin files and its declared core asset, and rejects a digest mismatch.

- [ ] **Step 2: Run package checks**

Run: `npm test`
Expected: PASS.

Run: `npm pack --dry-run`
Expected: package file list contains no reports, logs, `.env`, or credentials.

- [ ] **Step 3: Update documentation**

Document the exact supported DSH version, Pare Core compatibility range, installation steps, offline behavior and limitations proven by tests.

- [ ] **Step 4: Commit**

Commit as `docs: document pinned pare dsh package`.
