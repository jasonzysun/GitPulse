#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  loadReleaseEnv,
  readReleaseConfig,
} from "./release-config.mjs";
import {
  createReleasePlan,
  resolveReleaseVersion,
} from "./release-plan.mjs";
import {
  getRootDir,
  readCurrentVersion,
  syncVersion,
} from "./version-utils.mjs";
import {
  publishGitHubRelease,
  readGitHubReleaseConfig,
  validateGitHubReleaseWorktree,
} from "./github-release.mjs";

const rootDir = getRootDir(import.meta.url);
try {
  await main();
} catch (error) {
  console.error(`发布失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const releasePlan = createReleasePlan(process.argv.slice(2));
  const currentVersion = readCurrentVersion(rootDir);
  const releaseVersion = resolveReleaseVersion(currentVersion, releasePlan);

  console.log("GitPulse 自动发布流程");
  console.log(`当前版本：${currentVersion}`);
  console.log(`发布模式：${releasePlan.label}`);
  console.log(`${releasePlan.dryRun ? "计划发布" : "发布版本"}：${releaseVersion}`);

  if (releasePlan.dryRun) {
    if (releasePlan.kind !== "current") {
      for (const update of syncVersion(rootDir, releaseVersion, { dryRun: true })) {
        console.log(update);
      }
    }
    console.log("dry-run 完成，未写入版本文件、未构建、未上传。");
    return;
  }

  const releaseEnv = loadReleaseEnv(path.join(rootDir, ".release.env.local"));
  const githubConfig = readGitHubReleaseConfig(rootDir, releaseEnv);
  const gitReleaseState = githubConfig ? validateGitHubReleaseWorktree(rootDir) : null;
  if (releasePlan.kind !== "current") {
    for (const update of syncVersion(rootDir, releaseVersion)) {
      console.log(update);
    }
  }
  const config = readReleaseConfig(rootDir, releaseEnv);
  const { notes, sourceLabel } = resolveReleaseNotes(releaseEnv, releaseVersion);
  const manifestPath = path.join(rootDir, "src-tauri", "target", "release", "bundle", "gitpulse-latest.json");
  const privateKey = fs.readFileSync(config.privateKeyPath, "utf8");
  console.log(`Release Notes 来源：${sourceLabel}`);

  runReleaseBuild({
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: config.privateKeyPassword,
  });

  const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "nsis");
  const installerArtifact = pickArtifact(
    bundleDir,
    (fileName) => fileName.endsWith(".exe") && !fileName.endsWith(".exe.sig"),
  );
  const updaterSignaturePath = `${installerArtifact}.sig`;

  uploadFile(config, installerArtifact);
  uploadFile(config, updaterSignaturePath);

  const installerEntry = await waitForFileEntry(config, path.basename(installerArtifact));
  const installerUrl = buildSignedOpenListUrl(config, path.basename(installerArtifact), installerEntry.sign);
  const signature = fs.readFileSync(updaterSignaturePath, "utf8").trim();

  const manifest = {
    version: releaseVersion,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: installerUrl,
      },
    },
    extras: {
      installer: installerUrl,
    },
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  publishManifest(config, manifestPath);
  await verifyManifest(config.manifestPublicUrl, releaseVersion);
  const githubReleaseUrl = githubConfig
    ? await publishGitHubRelease({
        branch: gitReleaseState.branch,
        githubConfig,
        installerArtifact,
        installerUrl,
        manifestPath,
        manifestUrl: config.manifestPublicUrl,
        notes,
        releasePlan,
        releaseVersion,
        rootDir,
        updaterSignaturePath,
      })
    : null;

  console.log(`GitPulse ${releaseVersion} 发布完成`);
  console.log(`Updater: ${installerUrl}`);
  console.log(`Installer: ${installerUrl}`);
  console.log(`Manifest: ${config.manifestPublicUrl}`);
  if (githubReleaseUrl) {
    console.log(`GitHub Release: ${githubReleaseUrl}`);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command} ${args.join(" ")}`);
  }
}

function runReleaseBuild(env) {
  if (process.platform === "win32") {
    runCommand("cmd.exe", ["/d", "/s", "/c", "npm run tauri:build:release"], { env });
    return;
  }

  runCommand("npm", ["run", "tauri:build:release"], { env });
}

function pickArtifact(directory, matcher) {
  const fileNames = fs
    .readdirSync(directory)
    .filter(matcher)
    .map((fileName) => path.join(directory, fileName))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  if (fileNames.length === 0) {
    throw new Error(`未在 ${directory} 找到预期产物`);
  }

  return fileNames[0];
}

function uploadFile(config, filePath) {
  const fileName = path.basename(filePath);
  const targetUrl = new URL(encodePathSegment(fileName), ensureTrailingSlash(config.webdavUrl)).toString();
  const result = spawnSync(
    process.platform === "win32" ? "curl.exe" : "curl",
    [
      "-sS",
      "-o",
      process.platform === "win32" ? "NUL" : "/dev/null",
      "-u",
      `${config.webdavUsername}:${config.webdavPassword}`,
      "-T",
      filePath,
      targetUrl,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`上传文件失败：${fileName}`);
  }
}

async function waitForFileEntry(config, fileName) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const entry = await findFileEntry(config, fileName);
    if (entry?.sign) return entry;
    await delay(1500);
  }

  throw new Error(`未在 OpenList 中找到文件签名：${fileName}`);
}

async function findFileEntry(config, fileName) {
  const response = await fetch(`${config.publicOrigin}/api/fs/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: config.openlistPath,
      password: "",
      page: 1,
      per_page: 200,
      refresh: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`读取 OpenList 目录失败：${response.status}`);
  }

  const payload = await response.json();
  if (payload.code !== 200) {
    throw new Error(`读取 OpenList 目录失败：${payload.message}`);
  }

  return payload.data.content.find((entry) => entry.name === fileName) ?? null;
}

function buildSignedOpenListUrl(config, fileName, sign) {
  const filePath = `${config.openlistPath.replace(/^\/+/, "")}/${fileName}`
    .split("/")
    .map(encodePathSegment)
    .join("/");
  return `${config.publicOrigin}/d/${filePath}?sign=${encodeURIComponent(sign)}`;
}

function publishManifest(config, filePath) {
  const remoteDir = path.posix.dirname(config.manifestRemotePath);
  runCommand("ssh", [config.manifestSshHost, `mkdir -p ${shellEscape(remoteDir)}`]);
  runCommand("scp", [filePath, `${config.manifestSshHost}:${config.manifestRemotePath}`]);
}

async function verifyManifest(manifestUrl, version) {
  const response = await fetch(manifestUrl, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) {
    throw new Error(`验证 latest.json 失败：${response.status}`);
  }

  const payload = await response.json();
  if (payload.version !== version) {
    throw new Error(`latest.json 版本不匹配：期望 ${version}，实际 ${payload.version}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}

function resolveReleaseNotes(env, releaseVersion) {
  const notesFile = env.GITPULSE_RELEASE_NOTES_FILE
    ? resolveReleaseNotesPath(env.GITPULSE_RELEASE_NOTES_FILE)
    : path.join(rootDir, "release-notes", `v${releaseVersion}.md`);
  if (fs.existsSync(notesFile)) {
    const content = fs.readFileSync(notesFile, "utf8").trim();
    if (content) {
      return { notes: content, sourceLabel: path.relative(rootDir, notesFile) };
    }
  }

  if (env.GITPULSE_RELEASE_NOTES?.trim()) {
    return { notes: env.GITPULSE_RELEASE_NOTES.trim(), sourceLabel: "GITPULSE_RELEASE_NOTES" };
  }

  return { notes: `GitPulse ${releaseVersion} 发布`, sourceLabel: "默认模板" };
}

function resolveReleaseNotesPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

function shellEscape(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
