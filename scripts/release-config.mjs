import fs from "node:fs";
import path from "node:path";

export function loadReleaseEnv(envPath) {
  const loaded = { ...process.env };
  if (!fs.existsSync(envPath)) return loaded;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    loaded[key] = value;
  }

  return loaded;
}

export function readReleaseConfig(rootDir, env) {
  return {
    webdavUrl: required(env, "OPENLIST_WEBDAV_URL"),
    webdavUsername: required(env, "OPENLIST_WEBDAV_USERNAME"),
    webdavPassword: required(env, "OPENLIST_WEBDAV_PASSWORD"),
    publicOrigin: required(env, "OPENLIST_PUBLIC_ORIGIN"),
    openlistPath: required(env, "OPENLIST_PATH"),
    privateKeyPath: resolveConfigPath(rootDir, required(env, "TAURI_SIGNING_PRIVATE_KEY_PATH")),
    privateKeyPassword: required(env, "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"),
    manifestPublicUrl: required(env, "GITPULSE_MANIFEST_PUBLIC_URL"),
    manifestSshHost: required(env, "GITPULSE_MANIFEST_SSH_HOST"),
    manifestRemotePath: required(env, "GITPULSE_MANIFEST_REMOTE_PATH"),
  };
}

function required(env, key) {
  const value = env[key];
  if (!value) throw new Error(`缺少发布配置：${key}`);
  return value;
}

function resolveConfigPath(rootDir, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}
