# 可脱敏可追溯周报 Implementation Plan

## Checklist

1. Update shared models
   - Add `ReportRedactionOptions` and `ReportRedactionRule` to `src-tauri/src/models.rs`.
   - Add `redaction` with default values to extract, monthly, and period report options.
   - Mirror types and settings in `src/model.ts`.

2. Parse and persist frontend settings
   - Add `redactionEnabled` and `redactionRulesText` defaults.
   - Normalize loaded settings defensively.
   - Implement `parseRedactionRules`.
   - Include `redaction` in `buildExtractOptions`, `buildMonthlyOptions`, and `buildPeriodReportOptions`.

3. Implement Rust redaction
   - Add report-time helpers in `src-tauri/src/report.rs`.
   - Apply stable aliases before `build_template_values`.
   - Suppress evidence links when redaction is enabled.
   - Add unit tests for weekly redacted evidence, custom replacements, and URL suppression.

4. Wire orchestration
   - Pass `options.redaction` through `src-tauri/src/commit_pipeline.rs` render calls.
   - Keep AI fallback and save behavior unchanged.

5. Update UI
   - Add a “脱敏报告” toggle and custom replacement textarea in advanced settings.
   - Show redaction state in the workbench scope strip.
   - Add/update quality panel item so users know when a report is share-ready.

6. Update tests
   - Add Rust report tests for redaction behavior.
   - Update TypeScript build coverage through `npm run build`.
   - Add or extend Playwright e2e to assert weekly generation sends `redaction.enabled`.

## Validation Commands

```powershell
$ErrorActionPreference = 'Stop'
npm run build
```

```powershell
$ErrorActionPreference = 'Stop'
Push-Location src-tauri
cargo check
cargo test
Pop-Location
```

Optional targeted e2e if UI test is added:

```powershell
$ErrorActionPreference = 'Stop'
npm run test:e2e -- tests/e2e/workbench.spec.ts
```

## Risky Files / Rollback Points

- `src-tauri/src/report.rs`: highest behavior risk because report rendering is shared by weekly, monthly, daily, and custom reports.
- `src-tauri/src/models.rs` and `src/model.ts`: cross-layer payload contract must stay camelCase-compatible.
- `src/components/Workbench.tsx`: avoid crowding the primary report actions.
- `src/components/SettingsDialog.tsx`: keep advanced settings readable and avoid hiding existing evidence controls.

## Pre-Start Review Gate

- Confirm MVP redaction policy: keep dates and commit-summary meaning, mask context identifiers and user-provided sensitive words.
- Confirm scope: implement for all report render paths through the shared option, while product messaging focuses on weekly reports.
