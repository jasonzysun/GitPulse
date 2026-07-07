# State Management

> How frontend state is managed in GitPulse.

---

## Overview

The app uses React local state, `useMemo`, `useRef`, localStorage helpers, and Tauri commands. There is no global state library.

---

## State Categories

- Persisted settings live in localStorage through `loadSettingsState` and `settingsForPersistence`; plain settings must not store raw API keys.
- Repository index and report history are localStorage-backed convenience state, not source-controlled or remote state.
- Report text, selected report mode, warnings, progress, and dialog state live in `App.tsx`.
- Derived values such as project name maps, date ranges, preview text, and AI readiness should use `useMemo` or small helper functions.
- Secrets and ChatGPT login state belong in OS-backed secure storage via Rust commands, not localStorage.

---

## When to Use Global State

Do not add a global state library unless multiple independent app roots need the same mutable state. For this single workbench app, lift state to `App.tsx` and pass typed props down.

---

## Server State

GitPulse is local-first. Treat local Git repositories, local files, system credentials, and optional AI providers as external integrations reached through Rust commands. The frontend should not cache remote AI responses as authoritative data.

---

## Common Mistakes

- Persisting raw API keys or tokens in localStorage.
- Deriving report command options in components instead of using `src/model.ts` builders.
- Treating empty author input as an invalid author; empty author scope means all authors.
- Forgetting to clear active history selection when changing report mode or period.
