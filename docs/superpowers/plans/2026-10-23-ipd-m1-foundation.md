# IPD Smart Tracker M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable, locally persistent multi-project IPD workspace with editable stages, tasks and gates, correct workday dates, and validated JSON backup and restore.

**Architecture:** Audit and reuse the uploaded React/Vite app where viable, then isolate domain models and pure calendar functions from React. Store one versioned workspace in IndexedDB behind a repository interface; UI edits pass through validated workspace actions and persist atomically.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, IndexedDB, Playwright for browser checks; reuse dependencies from the original ZIP where suitable.

**Spec:** `docs/superpowers/specs/2026-10-23-ipd-tracker-design.md`; requirement baseline `docs/requirements/IPD_Smart_Tracker_PRD_v1.0.md` sections 0–4, 7, 12–13, 15, 17, 18 M1.

## Global Constraints

- The project lives in `/workspace/ipd-smart-tracker`, separate from `codex-text`.
- Calendar dates are pure `YYYY-MM-DD`; planned workdays are Monday–Friday, start day counts as day 1; no holiday calendar.
- IDs are stable UUIDs; names are never relation keys.
- Actual dates are user facts; the app never writes them automatically.
- No Gemini key or network is required for M1 core use.
- Preserve original ZIP's useful layout and task sample; do not import its name-keyed scheduling as authoritative V1 logic.
- Keep `IMPLEMENTATION_STATUS.md` accurate and do not call M1 a completed V1.

## Review Focus

- Invalid date such as `2026-02-30` must fail validation rather than normalize silently (Task 1).
- Two projects may share a name while retaining distinct IDs and task ownership (Task 2).
- IndexedDB write failure must show unsaved state and preserve the current in-memory project for export (Task 3).
- Import with duplicate IDs or unsupported schema must leave current data untouched (Task 4).
- Weekend actual dates may be recorded with a notice while planned dates stay on workdays (Task 5).

---

### Task 1: Bootstrap and calendar

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/domain/calendar.ts`, `src/domain/calendar.test.ts`
- Copy and adapt from ZIP: `src/index.css`, selected visual assets or components as needed

**Interfaces:**
- Produces: `type LocalDate = string`; `parseLocalDate(value: string): LocalDate`; `nextWorkday(date: LocalDate): LocalDate`; `inclusiveWorkdayEnd(start: LocalDate, duration: number): LocalDate`; `workdaysBetweenInclusive(start: LocalDate, end: LocalDate): number`.

- [ ] **Step 1: Write failing calendar tests**: Monday 2026-10-26 + 3 workdays finishes 2026-10-28; Friday 2026-10-30 followed by next workday is Monday 2026-11-02; malformed `2026-02-30` is rejected.
- [ ] **Step 2: Run `npm test -- src/domain/calendar.test.ts`** and confirm the new tests fail because implementation is missing.
- [ ] **Step 3: Implement the five calendar exports**, retaining pure date strings and avoiding UTC/local timestamp round trips.
- [ ] **Step 4: Run `npm test -- src/domain/calendar.test.ts`, `npm run lint`, and `npm run build`**; all pass.
- [ ] **Step 5: Commit** the bootstrapped project and calendar test cycle.

### Task 2: Workspace schema and validated actions

**Files:**
- Create: `src/domain/model.ts`, `src/domain/validation.ts`, `src/domain/workspace.ts`, `src/domain/workspace.test.ts`

**Interfaces:**
- Consumes: `LocalDate`, `parseLocalDate` from Task 1.
- Produces: `Workspace`, `Project`, `Stage`, `Task`, `Gate` types with UUID IDs and PRD fields; `createWorkspace(): Workspace`; `createProject(workspace: Workspace, input: NewProjectInput): Workspace`; `updateProject(workspace: Workspace, id: string, patch: ProjectPatch): Workspace`; `addTask(workspace: Workspace, input: NewTaskInput): Workspace`; `updateTask(workspace: Workspace, id: string, patch: TaskPatch): Workspace`; `validateWorkspace(value: unknown): ValidationIssue[]`. Each action is immutable and rejects invalid input with field-addressed issues.

- [ ] **Step 1: Write failing tests** for project creation, duplicate names with distinct IDs, stage rename/order, task positive standard/minimum durations, `minimum > standard` rejection, gate manual actual date, and weekend actual start acceptance with a warning.
- [ ] **Step 2: Run `npm test -- src/domain/workspace.test.ts`** and confirm the cases fail.
- [ ] **Step 3: Implement model, validation and actions**; initial project uses a copy of the ZIP's IPD stages and tasks mapped to UUIDs, while new projects allow adding and editing tasks and stages.
- [ ] **Step 4: Run workspace tests, type check and build**; all pass.
- [ ] **Step 5: Commit** schema and actions.

### Task 3: IndexedDB persistence and migration boundary

**Files:**
- Create: `src/storage/workspace-store.ts`, `src/storage/workspace-store.test.ts`, `src/storage/legacy-import.ts`

**Interfaces:**
- Consumes: `Workspace`, `validateWorkspace` from Task 2.
- Produces: `loadWorkspace(): Promise<Workspace | null>`; `saveWorkspace(workspace: Workspace): Promise<void>`; `importLegacyProject(value: unknown): ProjectImportResult`. Store one schema-versioned workspace in an IndexedDB transaction; legacy conversion is explicit and reports unmapped fields.

- [ ] **Step 1: Write failing tests** for save/reload, simulated transaction failure leaving previous persisted value intact, and legacy ZIP JSON conversion that does not invent actual dates or risk history.
- [ ] **Step 2: Run `npm test -- src/storage/workspace-store.test.ts`** and confirm failures.
- [ ] **Step 3: Implement repository with IndexedDB**, plus an isolated adapter for the original ZIP's single-project JSON.
- [ ] **Step 4: Run storage tests and build**; all pass.
- [ ] **Step 5: Commit** persistence code.

### Task 4: Versioned JSON backup and restore

**Files:**
- Create: `src/storage/import-export.ts`, `src/storage/import-export.test.ts`

**Interfaces:**
- Consumes: `Workspace`, `validateWorkspace`, `saveWorkspace`.
- Produces: `exportWorkspace(workspace: Workspace): string`; `exportProject(workspace: Workspace, projectId: string): string`; `parseImport(json: string, workspace: Workspace, mode: 'new_project' | 'replace_workspace'): ImportPreview`; `commitImport(preview: ImportPreview): Promise<Workspace>`. Preview performs validation without mutation; commit writes once.

- [ ] **Step 1: Write failing tests** for full workspace export/restore round trip, single-project import as new project, unsupported schema and duplicate ID refusal, and bad JSON preserving current workspace.
- [ ] **Step 2: Run `npm test -- src/storage/import-export.test.ts`** and confirm failures.
- [ ] **Step 3: Implement export, preview and atomic commit** with `schemaVersion`, `exportType`, `exportedAt`, and readable ID reference snapshots.
- [ ] **Step 4: Run import/export tests and build**; all pass.
- [ ] **Step 5: Commit** backup workflow.

### Task 5: Usable M1 interface and browser acceptance

**Files:**
- Create: `src/App.tsx`, `src/components/WorkspaceSwitcher.tsx`, `src/components/ProjectHeader.tsx`, `src/components/StageTaskTable.tsx`, `src/components/DataManager.tsx`, `src/components/SaveStatus.tsx`, `src/App.test.tsx`, `tests/m1.spec.ts`, `README.md`, `IMPLEMENTATION_STATUS.md`, `DESIGN.md`
- Adapt from ZIP: colors, spacing, cards, icon usage and section hierarchy.

**Interfaces:**
- Consumes: workspace actions, validation, store and import/export from Tasks 1–4.
- Produces: on-screen project create/switch/archive, stage/task/gate edit, current project overview, visible save state, workspace export/import and old-project conversion; no fake candidate schedule or AI output.

- [ ] **Step 1: Write failing UI tests** for editing a task, project switch with two same-name projects, persistence after remount, visible save failure, bad JSON import error and weekend actual date notice.
- [ ] **Step 2: Run `npm test -- src/App.test.tsx`** and confirm failures.
- [ ] **Step 3: Build the M1 UI** with original visual hierarchy and all M1 edit paths; update README, DESIGN and implementation status with exact M1 scope and V1 remaining work.
- [ ] **Step 4: Run tests, `npm run lint`, `npm run build`, then Playwright browser checks**: create two projects, edit a task, refresh and verify persistence, export and restore, and inspect desktop and narrow layout.
- [ ] **Step 5: Commit** the M1 interface and verified docs.

## Handoff to later plans

Write separate reviewed implementation plans for M2 (deliverables, versions, cross-project graph), M3 (forecast, candidates, plan revisions, risk history), M4 (resources and conditional remedies), and M5 (full UI and regression). Each plan uses its predecessor's tested interfaces and the same PRD; P0 is complete only after all five plans pass AT-01–38.
