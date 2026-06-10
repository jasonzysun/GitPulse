import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const releaseEnv = loadReleaseEnv(path.join(rootDir, ".release.env.local"));
const config = readConfig(releaseEnv);
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const notes = releaseEnv.GITPULSE_RELEASE_NOTES || `GitPulse ${version} 发布`;
const manifestPath = path.join(rootDir, "src-tauri", "target", "release", "bundle", "gitpulse-latest.json");
const privateKey = fs.readFileSync(config.privateKeyPath, "utf8");

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
  version,
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
await verifyManifest(config.manifestPublicUrl, version);

console.log(`GitPulse ${version} 发布完成`);
console.log(`Updater: ${installerUrl}`);
console.log(`Installer: ${installerUrl}`);
console.log(`Manifest: ${config.manifestPublicUrl}`);

function loadReleaseEnv(envPath) {
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

function readConfig(env) {
  return {
    webdavUrl: required(env, "OPENLIST_WEBDAV_URL"),
    webdavUsername: required(env, "OPENLIST_WEBDAV_USERNAME"),
    webdavPassword: required(env, "OPENLIST_WEBDAV_PASSWORD"),
    publicOrigin: required(env, "OPENLIST_PUBLIC_ORIGIN"),
    openlistPath: required(env, "OPENLIST_PATH"),
    privateKeyPath: required(env, "TAURI_SIGNING_PRIVATE_KEY_PATH"),
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
    "curl.exe",
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

function shellEscape(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
