#!/usr/bin/env node

import process from "node:process";
import {
  assertSemver,
  getRootDir,
  readCurrentVersion,
  syncVersion,
} from "./version-utils.mjs";

const rootDir = getRootDir(import.meta.url);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetVersion = args.find((arg) => !arg.startsWith("--"));

try {
  if (!targetVersion) {
    throw new Error("请提供目标版本号，例如 npm run version:set -- 1.2.3");
  }
  assertSemver(targetVersion);

  const currentVersion = readCurrentVersion(rootDir);
  console.log(`当前版本：${currentVersion}`);
  console.log(`${dryRun ? "计划设置" : "目标版本"}：${targetVersion}`);

  for (const update of syncVersion(rootDir, targetVersion, { dryRun })) {
    console.log(update);
  }

  console.log(dryRun ? "dry-run 完成，未写入文件" : `版本设置完成：${currentVersion} -> ${targetVersion}`);
} catch (error) {
  console.error(`版本设置失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
