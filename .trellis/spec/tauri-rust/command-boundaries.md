# Command Boundaries

> How Rust modules and Tauri commands are divided.

## Module Ownership

- `src-tauri/src/lib.rs`: command registration and thin async wrappers; use `spawn_blocking` for blocking local work.
- `src-tauri/src/models.rs`: serde request/response models shared with the frontend; use camelCase serde names.
- `src-tauri/src/git_ops.rs`: Git command execution, repository discovery, author filtering, branch attribution, and scan progress.
- `src-tauri/src/commit_pipeline.rs`: local report orchestration, commit collection, progress aggregation, AI fallback, and save decisions.
- `src-tauri/src/report.rs`: report text rendering and document/file output.
- `src-tauri/src/ai.rs` and `codex_oauth.rs`: optional polishing/model integration.
- `src-tauri/src/secure_store.rs`: OS-backed credential storage for secrets and login state.

## Boundary Rules

- React invokes named Tauri commands; it does not run Git or filesystem logic directly.
- `lib.rs` should not accumulate business logic. Add or extend a domain module, then expose a small command wrapper.
- Long-running Git/report tasks should use progress callbacks bridged to Tauri events.
- A single invalid repository root should not break a whole scan when skipping is reasonable.
- AI polishing failure should become a warning and preserve the local report draft/template.

## Payload Rules

- Rust structs exposed to the frontend use `#[serde(rename_all = "camelCase")]`.
- When adding a field, update Rust model defaults/serde behavior and frontend builders in `src/model.ts`.
- Keep option names tied to product language: report period, author scope, project name mapping, evidence detail, export format.
