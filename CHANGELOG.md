# Changelog

## Unreleased

### Changed

- Rebuilt the main branch as a Tauri 2 desktop app with React and Rust.
- Moved local Git workspace scanning and commit extraction from Python to Rust.
- Reworked the UI into a product-style local workbench.
- Preserved the Python/Tkinter implementation on `codex/legacy-python-desktop`.

### Added

- Local repository scan command.
- Date-range commit extraction command.
- One-click previous-month performance report generation.
- Project-grouped monthly report sections:
  - Project progress
  - Actual completion
  - Monthly summary
- Optional OpenAI-compatible AI polishing through environment variables.
- Release bundle support through `npm run tauri build`.
