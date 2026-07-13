# 可脱敏可追溯周报 Design

## Architecture And Boundaries

This feature crosses React settings/UI, frontend command option builders, Rust serde models, report orchestration, and report rendering.

Data flow:

```text
AppSettings
  -> buildPeriodReportOptions / buildExtractOptions / buildMonthlyOptions
  -> Tauri command payload
  -> models.rs serde structs
  -> commit_pipeline.rs orchestration
  -> report.rs render helpers
  -> PeriodReportResult.report_text
  -> React preview / copy / export / AI polishing
```

Ownership:

- `src/model.ts` owns persisted settings, parsing `redactionRulesText`, and command option construction.
- `src/components/SettingsDialog.tsx` owns the toggle and rule editor.
- `src/components/Workbench.tsx` and `ReportQualityPanel.tsx` own visible state cues.
- `src-tauri/src/models.rs` owns serde payload contracts.
- `src-tauri/src/report.rs` owns report-time redaction and evidence rendering.
- `src-tauri/src/commit_pipeline.rs` passes options through without duplicating redaction rules.

## Payload Contract

Add Rust and TypeScript mirrored shapes:

```text
ReportRedactionOptions {
  enabled: boolean,
  rules: ReportRedactionRule[]
}

ReportRedactionRule {
  find: string,
  replacement: string
}
```

Add `redaction` to `ExtractOptions`, `MonthlyReportOptions`, and `PeriodReportOptions` with a Rust serde default. Passing it through all report kinds keeps the command boundary consistent, even though the first product focus is weekly reports.

Frontend settings:

- `redactionEnabled: boolean`
- `redactionRulesText: string`

Parsing rules:

- Each non-empty, non-comment line uses `->` as separator.
- `find` is trimmed; empty `find` is ignored.
- Empty replacement becomes `***`.
- Duplicate `find` values keep the first occurrence.

## Rendering Design

Redaction happens inside `report.rs` before template values are built:

1. If redaction is disabled, use existing commit records, project mappings, and evidence link rules unchanged.
2. If redaction is enabled:
   - Clone the input commit records.
   - Build stable per-report alias maps:
     - repository/project name -> `仓库1`, `仓库2`, ...
     - branch name -> `分支1`, `分支2`, ...
     - author/email identity -> `作者1`, `作者2`, ...
     - commit hash -> `commit-1`, `commit-2`, ...
   - Apply aliases to `CommitRecord.project_name`, `branch_name`, `author`, `author_email`, and `hash`.
   - Apply custom rules to `message` and other string fields after aliasing.
   - Ignore `evidence_link_rules` so generated URLs do not appear in redacted reports.
   - Use an empty project-name mapping so mapped internal display names cannot leak.

Dates remain unchanged.

## Evidence Detail Behavior

Existing evidence text shape is preserved:

```text
来源：`仓库1` / `分支1` / `2026-07-09` / `commit-1`
原始：`完成某项功能`
```

This keeps the report internally traceable without revealing raw repository, branch, author email, commit hash, or internal links.

## Compatibility

- Rust serde defaults make old frontend payloads valid.
- Frontend persisted settings default to redaction disabled and empty rules.
- Existing templates keep working because redaction changes field values, not template variable names.
- Existing AI polishing flow keeps working because it consumes the preview text.

## Trade-Offs

- Per-report aliases are stable only within one generated report. This is enough for shareable weekly reports and avoids persisting sensitive mapping state.
- Custom rules are simple literal replacements, not regex. This reduces risk of user mistakes and keeps settings explainable.
- The MVP does not automatically rewrite every possible sensitive phrase in commit messages. Users can add targeted replacement rules for names, customers, and ticket prefixes.

## Rollback Shape

If the feature causes issues, disabling `redactionEnabled` restores previous rendering. The code change is isolated behind defaulted options and can be removed without changing Git extraction.
