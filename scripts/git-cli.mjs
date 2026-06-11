import { spawnSync } from "node:child_process";

export function ensureGitRepo(rootDir) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || result.stdout.trim() !== "true") {
    throw new Error("当前目录不是 Git 仓库，无法同步 GitHub Release");
  }
}

export function runGit(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`命令执行失败：git ${args.join(" ")}`);
  }
}

export function captureGit(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `命令执行失败：git ${args.join(" ")}`);
  }

  return result.stdout.trim();
}

export function tryCaptureGit(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}
