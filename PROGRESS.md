# GitPulse Progress

## Current Phase

P0 reliability and trust hardening.

GitPulse is already usable as a local-first desktop report generator. The next step is to make the core workflow safer, more predictable, and easier to evolve before adding larger report types.

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

## Verification

- `npm run build`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo check`

## Still Open In P0

- Add a production-tested Tauri CSP instead of `csp: null`.
- Decide whether ChatGPT Codex OAuth tokens should move from plain config JSON to OS-backed secure storage.
- Add user-facing diagnostics for missing Git, invalid output directories, and missing environment variables.

## Next Backlog

### P1 Report Usefulness

- Add weekly report generation.
- Add arbitrary month selection for monthly reports.
- Add report template profiles for daily, weekly, performance review, and concise status update formats.
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
