# CLAUDE.md

This repository contains Git Report Studio, a local-first Tauri desktop app built with React and Rust.

## Commands

```bash
npm install
npm run dev
npm run build
npm run tauri dev
npm run tauri build
```

Rust checks:

```bash
cd src-tauri
cargo check
cargo test
```

## Architecture

- `src/`: React frontend
- `src-tauri/src/git_ops.rs`: local Git repository discovery and commit extraction
- `src-tauri/src/report.rs`: report rendering and file output
- `src-tauri/src/ai.rs`: optional OpenAI-compatible and Anthropic Native polishing
- `src-tauri/src/lib.rs`: Tauri commands

## Important

The Python/Tkinter implementation is no longer on `main`. It is preserved on `codex/legacy-python-desktop`.
