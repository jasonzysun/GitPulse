# GitPulse Progress

## Current Phase

P1 report usefulness.

GitPulse is already usable as a local-first desktop report generator. P0 reliability work remains tracked, while the active product work now focuses on making generated reports more directly useful for weekly, monthly, and review workflows.

## Completed Before This Phase

- Tauri 2 desktop app with React and Rust.
- Local workspace scanning and commit extraction.
- Daily, custom range, and previous-month report generation.
- Project mapping, including Excel template import/export.
- Optional AI polishing through OpenAI-compatible, Anthropic Native, and ChatGPT Codex OAuth providers.
- Multiple workspace roots, disabled repository filtering, theme settings, and Windows updater flow.

## Completed In This Phase

- [x] Stop persisting raw API keys in browser storage while still allowing environment-variable references.
- [x] Persist direct API keys through the OS credential store so users do not need to re-enter them.
- [x] Recover safely from corrupted local settings JSON.
- [x] Improve Git repository detection for worktree-style `.git` files.
- [x] Normalize collected commits with stable ordering and duplicate removal.
- [x] Add targeted Rust tests for the new behavior.
- [x] Add user-facing diagnostics for missing Git, invalid output directories, and missing environment variables.
- [x] Add a production Tauri CSP instead of disabling CSP.
- [x] Move ChatGPT Codex OAuth login state to the OS credential store with legacy JSON migration.

## Verification

- `npm run build`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo check`
- `npm run tauri:build:release` with updater signing environment

## Completed In P1

- [x] Add weekly report generation with project grouping, AI polishing, export, and progress tracking.
- [x] Add arbitrary month selection for monthly reports, including AI polishing and export through the period report flow.
- [x] Hide the report template profile selector and stop applying hidden profile instructions; style control now stays in AI polishing instructions.

## Next Backlog

### P1 Report Usefulness

- Preserve optional evidence details: repository, branch, date, hash, and original commit message.

### P2 Git Accuracy

- Improve branch attribution when extracting all branches.
- Add merge commit, revert commit, and bot author filters.
- Add repository scan progress and cancellation.
- Cache repository index between runs and invalidate it when roots change.

### P3 Product Experience

- Add report history and reopen/export previous reports.
- Add export formats beyond Markdown, such as PDF or Word.
- Add clearer diagnostics for broken repositories, missing Git, invalid output directories, and missing AI credentials.
- Add lightweight end-to-end smoke checks for the Tauri command flow.

## Notes

- Keep local Git and filesystem work in Rust commands.
- Do not reintroduce Python runtime dependencies on `main`.
- Do not persist raw API keys in plain app settings; use OS-backed secure storage or environment variables.
- Treat ChatGPT Codex OAuth as optional and brittle because it depends on a non-public backend path.
