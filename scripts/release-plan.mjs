import {
  assertSemver,
  assertVersionType,
  bumpVersion,
} from "./version-utils.mjs";

export function createReleasePlan(args) {
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => arg !== "--dry-run");
  const mode = positional[0] ?? "current";

  if (mode === "current" || mode === "--no-bump" || mode === "no-bump") {
    return { kind: "current", label: "使用当前版本", dryRun };
  }

  if (mode === "set" || mode === "--set") {
    const targetVersion = positional[1];
    if (!targetVersion) throw new Error("请提供目标版本号，例如 npm run release:win:set -- 1.2.3");
    assertSemver(targetVersion);
    return { kind: "set", label: `设置版本 ${targetVersion}`, targetVersion, dryRun };
  }

  assertVersionType(mode);
  return { kind: "bump", label: `自动升级 ${mode}`, versionType: mode, dryRun };
}

export function resolveReleaseVersion(version, plan) {
  if (plan.kind === "bump") return bumpVersion(version, plan.versionType);
  if (plan.kind === "set") return plan.targetVersion;
  return version;
}
