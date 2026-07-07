# Directory Structure

> How frontend code is organized in GitPulse.

---

## Overview

GitPulse uses a compact single-app structure. `src/App.tsx` orchestrates the workbench and settings state, `src/model.ts` owns frontend types/defaults/validation/option builders, and `src/components/` contains focused UI surfaces.

---

## Directory Layout

src/
├── App.tsx
├── main.tsx
├── model.ts
├── reportFormat.ts
├── components/
├── hooks/
└── styles/
```

---

## Module Organization

- Put reusable UI surfaces in `src/components/` using PascalCase file names, as in `Workbench.tsx`, `SettingsDialog.tsx`, and `ReportQualityPanel.tsx`.
- Put browser/Tauri runtime hooks in `src/hooks/`; `useAppRuntime.ts` is the current example for app version, theme, and updater integration.
- Put app-wide frontend data shapes, persistence helpers, validators, and Tauri option builders in `src/model.ts`.
- Put report template presets and template-specific helpers in `src/reportFormat.ts`.
- Put global CSS in `src/styles/` by concern: tokens, layout, components, preview, dialogs, onboarding, and theme.
- Do not add Python runtime code to `main`; this product is a React + Rust Tauri app.

---

## Naming Conventions

- Components and hooks use PascalCase files for components and `use*` names for hooks.
- Types use explicit exported type aliases near the data they describe, for example `AppSettings`, `RepoInfo`, and `ReportHistoryEntry`.
- CSS classes use kebab-case and product-oriented names such as `report-canvas`, `assist-rail`, and `generation-scope-strip`.
- Tauri command names are snake_case on the Rust side and invoked by that exact string from React.

---

## Examples

- `src/App.tsx`: central state orchestration, Tauri command calls, and report workflow handlers.
- `src/components/Workbench.tsx`: dense desktop workbench layout with scoped helper components.
- `src/components/SettingsDialog.tsx`: settings surface wired through typed update callbacks.
- `src/model.ts`: settings migration, validation, mapping parsing, date helpers, and command option builders.
