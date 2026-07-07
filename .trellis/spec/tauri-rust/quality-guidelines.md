# Rust Quality Guidelines

> Rust quality and safety standards for GitPulse.

## Required Patterns

- Use structured Rust APIs and typed models at module boundaries.
- Keep command errors and validation messages user-readable in Chinese.
- Avoid panics in production paths; return `Result<_, String>` through Tauri commands.
- Use OS-backed secure storage for raw API keys or login state.
- On Windows, preserve the no-console Git command behavior in production builds.
- Keep report generation useful without network access or AI availability.

## Testing Requirements

- Run `cd src-tauri && cargo check` after Rust changes.
- Run `cd src-tauri && cargo test` for behavior changes in Git scanning, commit filtering, report rendering, AI fallback, diagnostics, export, or secure storage.
- Add focused unit tests for parsing, filtering, normalization, and fallback behavior.

## Review Checklist

- Does the change keep local Git and filesystem work in Rust?
- Are blocking operations kept off the async command thread?
- Are warnings distinguishable from hard errors?
- Does the frontend command payload still match `models.rs`?
- Are secrets excluded from plain persisted config?
