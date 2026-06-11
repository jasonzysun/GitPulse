import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function getRootDir(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

export function readCurrentVersion(rootDir) {
  return readJson(path.join(rootDir, "package.json")).version;
}

export function assertVersionType(type) {
  if (!VERSION_TYPES.has(type)) {
    throw new Error("无效的版本类型，请使用 major、minor 或 patch");
  }
}

export function assertSemver(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error("版本号格式必须为 X.Y.Z，例如 1.2.3");
  }
}

export function bumpVersion(version, type) {
  assertSemver(version);
  assertVersionType(type);

  const [major, minor, patchVersion] = version.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patchVersion + 1}`;
}

export function syncVersion(rootDir, version, { dryRun = false } = {}) {
  assertSemver(version);
  const updates = [
    updatePackageJson(rootDir, version, dryRun),
    updatePackageLock(rootDir, version, dryRun),
    updateTauriConfig(rootDir, version, dryRun),
    updateCargoToml(rootDir, version, dryRun),
    updateCargoLock(rootDir, version, dryRun),
  ].filter(Boolean);

  return updates;
}

function updatePackageJson(rootDir, version, dryRun) {
  const filePath = path.join(rootDir, "package.json");
  const packageJson = readJson(filePath);
  packageJson.version = version;
  writeJson(filePath, packageJson, dryRun);
  return formatUpdate(filePath, version, dryRun);
}

function updatePackageLock(rootDir, version, dryRun) {
  const filePath = path.join(rootDir, "package-lock.json");
  if (!fs.existsSync(filePath)) return null;

  const packageLock = readJson(filePath);
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }
  writeJson(filePath, packageLock, dryRun);
  return formatUpdate(filePath, version, dryRun);
}

function updateTauriConfig(rootDir, version, dryRun) {
  const filePath = path.join(rootDir, "src-tauri", "tauri.conf.json");
  const config = readJson(filePath);
  config.version = version;
  writeJson(filePath, config, dryRun);
  return formatUpdate(filePath, version, dryRun);
}

function updateCargoToml(rootDir, version, dryRun) {
  const filePath = path.join(rootDir, "src-tauri", "Cargo.toml");
  const content = fs.readFileSync(filePath, "utf8");
  const nextContent = content.replace(
    /(\[package\][\s\S]*?\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );
  if (content === nextContent) {
    throw new Error("未在 Cargo.toml 中找到 [package] version 字段");
  }
  writeText(filePath, nextContent, dryRun);
  return formatUpdate(filePath, version, dryRun);
}

function updateCargoLock(rootDir, version, dryRun) {
  const filePath = path.join(rootDir, "src-tauri", "Cargo.lock");
  if (!fs.existsSync(filePath)) return null;

  const cargoToml = fs.readFileSync(path.join(rootDir, "src-tauri", "Cargo.toml"), "utf8");
  const packageName = cargoToml.match(/\[package\][\s\S]*?\nname = "([^"]+)"/)?.[1];
  if (!packageName) return null;

  const content = fs.readFileSync(filePath, "utf8");
  const packagePattern = new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname = "${escapeRegExp(packageName)}"\\r?\\nversion = ")[^"]+(")`,
  );
  if (!packagePattern.test(content)) return null;

  writeText(filePath, content.replace(packagePattern, `$1${version}$2`), dryRun);
  return formatUpdate(filePath, version, dryRun);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, dryRun) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`, dryRun);
}

function writeText(filePath, content, dryRun) {
  if (!dryRun) fs.writeFileSync(filePath, content, "utf8");
}

function formatUpdate(filePath, version, dryRun) {
  const label = dryRun ? "将更新" : "已更新";
  return `${label} ${path.normalize(filePath)} -> ${version}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
