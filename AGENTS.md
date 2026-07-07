# AGENTS.md

This repository is now a Tauri desktop application built with React and Rust.

## Project Overview

GitPulse is a local-first Git report generator. It scans local Git workspaces, extracts commits by author and date range, and generates Markdown work reports, including monthly performance reports grouped by project.

The legacy Python/Tkinter version is preserved on:

```bash
codex/legacy-python-desktop
```

## Key Commands

```bash
npm install
npm run dev
npm run build
npm run tauri dev
npm run tauri build
```

Rust verification:

```bash
cd src-tauri
cargo check
cargo test
```

## Architecture

- `src/`: React frontend
- `src/App.tsx`: main workbench UI
- `src/styles/`: application styling
- `src-tauri/src/lib.rs`: Tauri command registration and orchestration
- `src-tauri/src/git_ops.rs`: local Git scanning and commit extraction
- `src-tauri/src/report.rs`: summary and monthly report generation
- `src-tauri/src/ai.rs`: optional OpenAI-compatible and Anthropic Native report polishing
- `src-tauri/src/models.rs`: shared Rust command models

## Trellis + Grill Me Workflow

- Trellis is initialized in `.trellis/`; use it for unclear, cross-layer, UX-sensitive, security-sensitive, release, or multi-step work.
- Lightweight local edits may stay on the normal short path, but still follow the project rules in this file and `.trellis/spec/` when relevant.
- For planning pressure tests, use `grill-with-docs`: challenge fuzzy terms against `CONTEXT.md`, ask one question at a time, recommend an answer, and update `CONTEXT.md` as product language is settled.
- Codex is configured for Trellis inline mode; the main Codex session should read the active task artifacts and edit directly instead of assuming Trellis sub-agents are required.
- See `docs/trellis-grill-workflow.md` for the practical Claude Code / Codex workflow.

## Notes

- Do not reintroduce Python runtime dependencies on `main`.
- Keep local filesystem and Git operations in Rust commands.
- Keep API keys out of plain persisted config; use OS-backed secure storage or environment variables.
- Prefer product-grade local desktop UX over a browser-only web app.
