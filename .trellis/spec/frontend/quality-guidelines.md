# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend changes should preserve a reliable local desktop workflow: scan repositories, choose scope, generate a report, optionally polish it, then copy/export it.

---

## Forbidden Patterns

- No Python runtime dependency on `main`.
- No direct filesystem or Git shell work from React; use Tauri commands.
- No raw API keys in localStorage or plain settings.
- No marketing-page layout patterns inside the desktop workbench.
- No hidden primary report controls or hover-only critical controls.

---

## Required Patterns

- Keep local-first privacy and traceability visible in copy and behavior.
- Long-running scan/extract operations should show progress and allow graceful status updates.
- AI failures must fall back to the current local report draft or local template.
- Report history and repository cache writes should be bounded and recover from malformed localStorage.
- Commit evidence detail must preserve repository, branch, date, hash, and original message context.

---

## Testing Requirements

- Run `npm run build` for TypeScript/build verification after frontend changes.
- Run targeted Playwright tests when changing onboarding, workbench generation controls, report history, settings, or export UX.
- For release-impacting changes, follow `CONTRIBUTING.md`: `npm run build`, `npm run test:e2e`, `cd src-tauri && cargo check && cargo test`.

---

## Tauri WebView2 Dark Mode — Native Controls

On Windows, Tauri uses WebView2 (Chromium). Native form controls (`<input type="date">`, `<select>`, etc.) render their own icons and chrome, which default to light-on-white and become invisible on dark backgrounds. Every native control in a dark theme must be explicitly handled:

1. **`<input type="date/month/week">`**: Set `color-scheme: dark` in the dark theme CSS. The base CSS sets `color-scheme: light` to normalize light mode; the dark override reverses it. Without this, the calendar picker icon is invisible.

2. **`<select>`**: Must use `appearance: none` and a custom SVG arrow. WebView2's built-in select arrow renders as an infinite-duplication bug in dark mode without this workaround.

3. **General rule**: When adding any new native form control (date, select, color, range, etc.) to a `.field` or dialog, verify it in both light and dark themes on Windows before marking the task complete.

---

## Code Review Checklist

- Does this keep Git/filesystem work behind Rust?
- Does every new command payload match `src-tauri/src/models.rs`?
- Are empty and failure states useful without AI?
- Are status messages, validation errors, and labels clear in Chinese?
- Does the UI remain usable in both light and dark themes?
- Are secrets stored only through secure storage or safe environment-variable references?
