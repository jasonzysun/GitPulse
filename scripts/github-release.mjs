import fs from "node:fs";
import path from "node:path";
import {
  captureGit,
  ensureGitRepo,
  runGit,
  tryCaptureGit,
} from "./git-cli.mjs";

const VERSION_FILES = [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

const DEFAULT_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "GitPulse-Release-Script",
};

export function readGitHubReleaseConfig(rootDir, env) {
  const token = env.GITPULSE_GITHUB_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    throw new Error("缺少 GitHub Release 发布配置：GITPULSE_GITHUB_TOKEN（或 GITHUB_TOKEN / GH_TOKEN）");
  }

  return {
    apiBaseUrl: stripTrailingSlash(env.GITPULSE_GITHUB_API_BASE_URL || "https://api.github.com"),
    repo: env.GITPULSE_GITHUB_REPO || resolveGitHubRepo(rootDir),
    token,
    webBaseUrl: stripTrailingSlash(env.GITPULSE_GITHUB_WEB_BASE_URL || "https://github.com"),
  };
}

export function buildLatestReleaseAssetDownloadUrl(config, assetName) {
  return `${config.webBaseUrl}/${encodeRepoPath(config.repo)}/releases/latest/download/${encodeURIComponent(assetName)}`;
}

export function buildReleaseAssetDownloadUrl(config, tagName, assetName) {
  return `${config.webBaseUrl}/${encodeRepoPath(config.repo)}/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
}

export function validateGitHubReleaseWorktree(rootDir) {
  ensureGitRepo(rootDir);
  const branch = captureGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") {
    throw new Error("GitHub Release 发布必须在具名分支上执行，当前不支持 detached HEAD");
  }

  const dirtyFiles = captureGit(rootDir, ["status", "--short"]);
  if (dirtyFiles) {
    throw new Error("启用 GitHub Release 前请先提交或暂存现有改动，避免源码 tag 与安装包不一致");
  }

  captureGit(rootDir, ["remote", "get-url", "origin"]);
  return { branch };
}

export async function publishGitHubRelease({
  branch,
  githubConfig,
  installerArtifact,
  installerUrl,
  manifestPath,
  manifestUrl,
  notes,
  releasePlan,
  releaseVersion,
  rootDir,
  updaterSignaturePath,
}) {
  console.log("准备同步 GitHub Release...");
  syncRemoteTags(rootDir);

  if (releasePlan.kind !== "current") {
    commitReleaseVersion(rootDir, releaseVersion);
  }

  const tagName = `v${releaseVersion}`;
  ensureLocalTagAtHead(rootDir, tagName);
  pushReleaseRefs(rootDir, branch, tagName);

  const releasePayload = {
    body: buildReleaseBody(notes, installerUrl, manifestUrl),
    name: `GitPulse ${tagName}`,
    tagName,
    targetCommitish: branch,
  };

  const release = await upsertRelease(githubConfig, releasePayload);
  await syncReleaseAssets(githubConfig, release, [
    installerArtifact,
    updaterSignaturePath,
    manifestPath,
  ]);

  return release.html_url;
}

function resolveGitHubRepo(rootDir) {
  const remoteUrl = captureGit(rootDir, ["remote", "get-url", "origin"]);
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i);
  if (!match) {
    throw new Error("无法从 origin 推断 GitHub 仓库，请设置 GITPULSE_GITHUB_REPO=owner/repo");
  }

  return match[1];
}

function syncRemoteTags(rootDir) {
  runGit(rootDir, ["fetch", "origin", "--tags"]);
}

function commitReleaseVersion(rootDir, releaseVersion) {
  const filesToStage = VERSION_FILES
    .map((filePath) => path.join(rootDir, filePath))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => path.relative(rootDir, filePath));

  runGit(rootDir, ["add", "--", ...filesToStage]);
  const staged = captureGit(rootDir, ["diff", "--cached", "--name-only"]);
  if (!staged) return;

  runGit(rootDir, ["commit", "-m", `chore: 发布 v${releaseVersion}`]);
}

function ensureLocalTagAtHead(rootDir, tagName) {
  const headSha = captureGit(rootDir, ["rev-parse", "HEAD"]);
  const tagSha = tryCaptureGit(rootDir, ["rev-list", "-n", "1", tagName]);

  if (!tagSha) {
    runGit(rootDir, ["tag", tagName]);
    return;
  }

  if (tagSha !== headSha) {
    throw new Error(`标签 ${tagName} 已存在，但未指向当前提交，请先人工处理`);
  }
}

function pushReleaseRefs(rootDir, branch, tagName) {
  runGit(rootDir, ["push", "origin", branch]);
  runGit(rootDir, ["push", "origin", tagName]);
}

function buildReleaseBody(notes, installerUrl, manifestUrl) {
  return [
    notes,
    "",
    "## 发布资源",
    `- 安装包直链：${installerUrl}`,
    `- 更新清单：${manifestUrl}`,
  ].join("\n");
}

async function upsertRelease(config, releasePayload) {
  const existing = await getReleaseByTag(config, releasePayload.tagName);
  if (existing) {
    return githubJson(config, `/repos/${config.repo}/releases/${existing.id}`, {
      body: {
        body: releasePayload.body,
        draft: false,
        make_latest: "true",
        name: releasePayload.name,
        prerelease: false,
        target_commitish: releasePayload.targetCommitish,
      },
      method: "PATCH",
    });
  }

  return githubJson(config, `/repos/${config.repo}/releases`, {
    body: {
      body: releasePayload.body,
      draft: false,
      make_latest: "true",
      name: releasePayload.name,
      prerelease: false,
      tag_name: releasePayload.tagName,
      target_commitish: releasePayload.targetCommitish,
    },
    method: "POST",
  });
}

async function getReleaseByTag(config, tagName) {
  const response = await githubFetch(config, `/repos/${config.repo}/releases/tags/${encodeURIComponent(tagName)}`);
  if (response.status === 404) return null;
  return parseGitHubResponse(response);
}

async function syncReleaseAssets(config, release, filePaths) {
  const assetsByName = new Map((release.assets || []).map((asset) => [asset.name, asset]));

  for (const filePath of filePaths) {
    const assetName = path.basename(filePath);
    const existingAsset = assetsByName.get(assetName);
    if (existingAsset) {
      await githubJson(config, `/repos/${config.repo}/releases/assets/${existingAsset.id}`, {
        method: "DELETE",
      });
    }

    await uploadReleaseAsset(config, release.upload_url, filePath);
  }
}

async function uploadReleaseAsset(config, uploadUrl, filePath) {
  const fileName = path.basename(filePath);
  const baseUploadUrl = uploadUrl.replace(/\{.*$/, "");
  const targetUrl = new URL(baseUploadUrl);
  targetUrl.searchParams.set("name", fileName);

  const response = await fetch(targetUrl, {
    body: fs.readFileSync(filePath),
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${config.token}`,
      "Content-Type": detectContentType(filePath),
    },
    method: "POST",
  });

  await parseGitHubResponse(response);
}

async function githubJson(config, pathName, { body, method }) {
  const response = await githubFetch(config, pathName, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method,
  });
  return parseGitHubResponse(response);
}

async function githubFetch(config, pathName, options = {}) {
  return fetch(`${config.apiBaseUrl}${pathName}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${config.token}`,
      ...(options.headers || {}),
    },
  });
}

async function parseGitHubResponse(response) {
  if (response.status === 204) return null;

  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) : null;
  if (response.ok) return payload;

  const message = payload?.message || rawText || `HTTP ${response.status}`;
  throw new Error(`GitHub API 请求失败：${message}`);
}

function detectContentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".sig")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function encodeRepoPath(repo) {
  return repo.split("/").map(encodeURIComponent).join("/");
}
