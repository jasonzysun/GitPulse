#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  captureGit,
  tryCaptureGit,
} from "./git-cli.mjs";
import {
  createReleasePlan,
  resolveReleaseVersion,
} from "./release-plan.mjs";
import {
  getRootDir,
  readCurrentVersion,
} from "./version-utils.mjs";

const rootDir = getRootDir(import.meta.url);

try {
  main();
} catch (error) {
  console.error(`生成 release notes 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const releasePlan = createReleasePlan(options.planArgs);
  const currentVersion = readCurrentVersion(rootDir);
  const releaseVersion = resolveReleaseVersion(currentVersion, releasePlan);
  const outputPath = resolveOutputPath(releaseVersion, options.outputPath);
  const baseTag = options.fromTag || findPreviousTag(rootDir, `v${releaseVersion}`);
  const commits = collectCommits(rootDir, baseTag).filter((commit) => !shouldIgnoreCommit(commit));
  const markdown = buildReleaseNotes({
    baseTag,
    commits,
    releaseVersion,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${markdown}\n`, "utf8");

  console.log(`已生成 release notes 草稿：${path.relative(rootDir, outputPath)}`);
  console.log(`目标版本：${releaseVersion}`);
  console.log(`对比范围：${baseTag ? `${baseTag}..HEAD` : "初始提交..HEAD"}`);
  console.log(`提交数量：${commits.length}`);
}

function parseArgs(args) {
  const planArgs = [];
  let fromTag = "";
  let outputPath = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--from-tag") {
      fromTag = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--output") {
      outputPath = args[index + 1] || "";
      index += 1;
      continue;
    }
    planArgs.push(arg);
  }

  if (args.includes("--from-tag") && !fromTag) {
    throw new Error("请为 --from-tag 提供标签名");
  }
  if (args.includes("--output") && !outputPath) {
    throw new Error("请为 --output 提供输出路径");
  }

  return { fromTag, outputPath, planArgs };
}

function resolveOutputPath(releaseVersion, outputPath) {
  if (outputPath) {
    return path.isAbsolute(outputPath) ? outputPath : path.join(rootDir, outputPath);
  }
  return path.join(rootDir, "release-notes", `v${releaseVersion}.md`);
}

function findPreviousTag(cwd, targetTag) {
  const rawTags = tryCaptureGit(cwd, ["tag", "--merged", "HEAD", "--sort=-creatordate"]);
  if (!rawTags) return "";

  return rawTags
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .find((tag) => tag !== targetTag) || "";
}

function collectCommits(cwd, baseTag) {
  const range = baseTag ? `${baseTag}..HEAD` : "HEAD";
  const rawLog = captureGit(cwd, [
    "log",
    range,
    "--date=short",
    "--pretty=format:__COMMIT__%n%H%n%h%n%ad%n%an%n%s",
    "--name-only",
  ]);

  if (!rawLog.trim()) return [];

  return rawLog
    .split("__COMMIT__")
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseCommitBlock);
}

function parseCommitBlock(block) {
  const [hash, shortHash, date, author, subject, ...fileLines] = block.split(/\r?\n/);
  const files = [...new Set(fileLines.map((line) => line.trim()).filter(Boolean))];
  const parsedSubject = parseSubject(subject);

  return {
    author,
    date,
    files,
    group: detectGroup(parsedSubject.type, files),
    hash,
    shortHash,
    subject: parsedSubject.summary,
    subjectRaw: subject,
  };
}

function parseSubject(subject) {
  const match = subject.match(/^([a-zA-Z]+)(?:\([^)]+\))?:\s*(.+)$/);
  if (!match) return { summary: subject.trim(), type: "other" };
  return {
    summary: match[2].trim(),
    type: match[1].toLowerCase(),
  };
}

function detectGroup(type, files) {
  if (["feat"].includes(type)) return "features";
  if (["fix"].includes(type)) return "fixes";
  if (["perf"].includes(type)) return "performance";
  if (["refactor"].includes(type)) return "refactors";
  if (["docs"].includes(type)) return "docs";
  if (["build", "chore", "ci", "style", "test"].includes(type)) return "engineering";
  if (files.some((file) => file.startsWith("scripts/") || file.startsWith(".github/"))) return "engineering";
  if (files.some((file) => file.startsWith("src/") || file.startsWith("src-tauri/"))) return "features";
  return "others";
}

function shouldIgnoreCommit(commit) {
  return [
    /^merge\b/i,
    /^chore(?:\([^)]+\))?:\s*发布 v/i,
    /^chore(?:\([^)]+\))?:\s*release v/i,
    /^chore(?:\([^)]+\))?:\s*bump version/i,
  ].some((pattern) => pattern.test(commit.subjectRaw));
}

function buildReleaseNotes({ baseTag, commits, releaseVersion }) {
  const groups = groupCommits(commits);
  const highlights = commits.slice(0, 3).map((commit) => commit.subject);
  const areas = collectAreas(commits);
  const compareRange = baseTag ? `${baseTag}..HEAD` : "初始提交..HEAD";

  return [
    `# GitPulse v${releaseVersion} Release Notes`,
    "",
    "> 此文件由脚本根据 Git 历史自动生成，建议在正式发布前再由 Codex 做一次润色。",
    `> 对比范围：\`${compareRange}\``,
    `> 生成时间：\`${new Date().toISOString()}\``,
    `> 提交数量：\`${commits.length}\``,
    "",
    "## 本次亮点",
    ...formatHighlightLines(highlights),
    "",
    ...buildGroupSections(groups),
    "",
    "## 影响范围",
    ...formatAreaLines(areas),
    "",
    "## 原始提交清单",
    ...formatCommitLines(commits),
  ].join("\n");
}

function groupCommits(commits) {
  return {
    docs: commits.filter((commit) => commit.group === "docs"),
    engineering: commits.filter((commit) => commit.group === "engineering"),
    features: commits.filter((commit) => commit.group === "features"),
    fixes: commits.filter((commit) => commit.group === "fixes"),
    others: commits.filter((commit) => commit.group === "others"),
    performance: commits.filter((commit) => commit.group === "performance"),
    refactors: commits.filter((commit) => commit.group === "refactors"),
  };
}

function buildGroupSections(groups) {
  const sections = [];
  appendSection(sections, "## 主要改进", "### 功能改进", groups.features);
  appendSection(sections, "", "### 问题修复", groups.fixes);
  appendSection(sections, "", "### 性能与重构", [...groups.performance, ...groups.refactors]);
  appendSection(sections, "", "### 工程与发布", groups.engineering);
  appendSection(sections, "", "### 文档更新", groups.docs);
  appendSection(sections, "", "### 其他变更", groups.others);

  if (sections.length > 0) return sections;
  return ["## 主要改进", "- 本次版本暂无新的 Git 提交记录。"];
}

function appendSection(lines, heading, subHeading, commits) {
  if (commits.length === 0) return;
  if (heading) lines.push(heading);
  lines.push(subHeading);
  lines.push(...formatCommitLines(commits));
  lines.push("");
}

function formatHighlightLines(highlights) {
  if (highlights.length > 0) return highlights.map((item) => `- ${item}`);
  return ["- 本次版本以工程维护和发布链路整理为主。"];
}

function collectAreas(commits) {
  const labels = new Set();
  for (const commit of commits) {
    for (const file of commit.files) {
      if (file.startsWith("src/")) labels.add("前端界面");
      else if (file.startsWith("src-tauri/")) labels.add("Rust 后端");
      else if (file.startsWith("scripts/")) labels.add("发版脚本");
      else if (file.startsWith(".codex/")) labels.add("项目 Agent Skill");
      else if (file === "README.md" || file.startsWith("docs/")) labels.add("文档说明");
      else if (/\b(package(-lock)?\.json|Cargo\.(toml|lock))$/.test(file)) labels.add("工程配置");
      else labels.add(`其他文件：${file.split("/")[0]}`);
    }
  }
  return [...labels];
}

function formatAreaLines(areas) {
  if (areas.length > 0) return areas.map((item) => `- ${item}`);
  return ["- 暂无可归类的影响范围。"];
}

function formatCommitLines(commits) {
  if (commits.length === 0) return ["- 暂无提交记录。"];
  return commits.map((commit) => `- ${commit.subject} (\`${commit.shortHash}\`, ${commit.date})`);
}
