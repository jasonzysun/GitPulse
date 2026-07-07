# Hook Guidelines

> How hooks are used in GitPulse.

---

## Overview

Hooks are used sparingly. Most app state lives in `App.tsx`; custom hooks are reserved for runtime integration that would otherwise clutter the app shell.

---

## Custom Hook Patterns

- Use `use*` names and return named values/functions in an object when a hook exposes multiple capabilities.
- Keep side effects inside `useEffect` with cleanup functions for event listeners.
- Keep Tauri runtime details inside hooks only when the hook owns a coherent runtime concern, as `useAppRuntime` owns theme, version, and updater state.

---

## Data Fetching

- There is no React Query/SWR layer. Frontend data comes from localStorage, browser APIs, and explicit Tauri `invoke` calls.
- Long-running local operations should report progress through Tauri events and React state, as repository scanning and commit extraction do.
- Catch command/listener setup failures locally when the app can degrade gracefully.

---

## Naming Conventions

- Hook files use camelCase `use*` names, for example `useAppRuntime.ts`.
- Returned actions use imperative names such as `checkForUpdates` and `installUpdate`.
- State returned by hooks should match the product language used by the UI, for example `updateSummary`, `updateMessage`, and `updateBusy`.

---

## Common Mistakes

- Extracting a hook just to move ordinary component state out of sight.
- Forgetting to remove Tauri/browser listeners on cleanup.
- Letting hook state duplicate source-of-truth settings already owned by `App.tsx`.
