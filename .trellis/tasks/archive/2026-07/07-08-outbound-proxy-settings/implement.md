# 添加应用出站代理配置 - Implementation Plan

## Checklist

1. Rust models and secure storage
   - Add proxy config/result models in `src-tauri/src/models.rs`.
   - Add proxy password helpers in `src-tauri/src/secure_store.rs`.
   - Enable `reqwest` socks feature.

2. Rust network client
   - Add `src-tauri/src/network.rs`.
   - Implement client builder, proxy URL validation, local candidate scan, and connection test.
   - Register `scan_proxy_candidates`, `test_proxy_connection`, `get/set/clear_secure_proxy_password` commands.

3. Wire network call sites
   - Use network client in `ai.rs`.
   - Pass proxy config into `codex_oauth` calls.
   - Use proxy config in diagnostics network checks.

4. Frontend settings and payloads
   - Add proxy fields/defaults/normalization to `src/model.ts`.
   - Include proxy config in AI and diagnostic option builders.
   - Add `ProxyCandidate` and `ProxyTestResult` types.

5. Settings UI
   - Add proxy controls to AI tab in `SettingsDialog.tsx`.
   - Add scan/test statuses and candidate selection UI.
   - Persist proxy password through secure-store commands.
   - Add minimal CSS in existing styles.

6. Verification
   - Run `npm run build`.
   - Run `cd src-tauri && cargo check`.
   - Run `cd src-tauri && cargo test`.
   - Inspect `git diff` for accidental plain proxy password persistence.

## Risky Files

- `src/model.ts` and `src-tauri/src/models.rs`: cross-layer payload shape must stay in sync.
- `src-tauri/src/secure_store.rs`: avoid regressing existing API Key/Codex OAuth credentials.
- `src-tauri/src/codex_oauth.rs`: keep default no-proxy behavior unchanged.

## Rollback Points

- If SOCKS support creates dependency issues, keep HTTP/HTTPS proxy support and document SOCKS as follow-up.
- If secure proxy password wiring becomes too large, ship URL-only proxy MVP and keep auth proxy out of scope.
