# IPD Smart Tracker V1 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the PRD V1 P0 workflows and verify AT-01–38 with reproducible results.

**Architecture:** Keep the React/Vite shell and pure domain calculators. Put impact analysis, audit, risk reconciliation, import/export, and resource candidates in focused domain modules; expose the business actions in the five existing tabs. Preserve actual facts, baseline, and all accepted revisions.

**Tech Stack:** React 19, TypeScript, Vite, IndexedDB, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-23-ipd-tracker-design.md`; `docs/requirements/IPD_Smart_Tracker_PRD_v1.0.md`.

## Global Constraints

- Offline P0 works without Gemini or cloud sync.
- Actual, standard, candidate, and accepted dates remain separate.
- Cross-project identifiers are immutable; unresolved source references remain repairable.
- One workday is Monday–Friday; start day is day one.

## Tasks

- [ ] Complete the domain invariants and regression suite: outcome versioning, dependent impact, audit and risk lifecycle, all 38 acceptance scenarios.
- [ ] Complete resource planning: fixed and task-relative bookings, alternative ordering with GA impact, validated atomic adoption, conditional remedy inputs.
- [ ] Complete P0 UI workflows: project and stage lifecycle, task/detail edits and completion, outcome decisions, impact handling, dependencies, resource comparisons, data recovery.
- [ ] Verify full backup roundtrip, offline mode, refresh persistence, narrow viewport, performance, build and browser behavior.
- [ ] Update docs and artifacts, regenerate downloadable single-file HTML, and report any remaining limitations precisely.
