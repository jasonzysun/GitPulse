# Contributing

Thanks for improving Git Report Studio.

## Setup

```bash
npm install
npm run tauri dev
```

## Verification

Run these before opening a PR:

```bash
npm run build
cd src-tauri
cargo check
cargo test
```

For release-level verification:

```bash
npm run tauri build
```

## Guidelines

- Keep local Git and filesystem access in Rust commands.
- Keep the React frontend focused on state, layout, preview, and interactions.
- Do not persist real API keys. AI integrations should read keys from environment variables.
- Preserve the project mapping format: `project(branch) -> DisplayName-` and `project(*) -> DisplayName-`.
- Keep generated files and local reports out of version control.
