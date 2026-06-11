#!/usr/bin/env node

import process from "node:process";
import {
  assertVersionType,
  bumpVersion,
  getRootDir,
  readCurrentVersion,
  syncVersion,
} from "./version-utils.mjs";

const rootDir = getRootDir(import.meta.url);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const versionType = args.find((arg) => !arg.startsWith("--")) ?? "patch";

try {
  assertVersionType(versionType);
  const currentVersion = readCurrentVersion(rootDir);
  const nextVersion = bumpVersion(currentVersion, versionType);

  console.log(`当前版本：${currentVersion}`);
  console.log(`升级类型：${versionType}`);
  console.log(`${dryRun ? "计划版本" : "新版本"}：${nextVersion}`);

  for (const update of syncVersion(rootDir, nextVersion, { dryRun })) {
    console.log(update);
  }

  console.log(dryRun ? "dry-run 完成，未写入文件" : `版本升级完成：${currentVersion} -> ${nextVersion}`);
} catch (error) {
  console.error(`版本升级失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
