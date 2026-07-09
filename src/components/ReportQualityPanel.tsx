import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileText,
  GitBranch,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type QualityTone = "ok" | "warning" | "neutral";

type QualityItem = {
  id: string;
  label: string;
  detail: string;
  tone: QualityTone;
  icon: LucideIcon;
};

type Props = {
  commitCount: number;
  projectCount: number;
  enabledRepoCount: number;
  totalRepoCount: number;
  aiConfigured: boolean;
  showEvidenceDetails: boolean;
  redactionEnabled: boolean;
  canExport: boolean;
};

export function ReportQualityPanel({
  commitCount,
  projectCount,
  enabledRepoCount,
  totalRepoCount,
  aiConfigured,
  showEvidenceDetails,
  redactionEnabled,
  canExport,
}: Props) {
  const items = buildQualityItems({
    commitCount,
    projectCount,
    enabledRepoCount,
    totalRepoCount,
    aiConfigured,
    showEvidenceDetails,
    redactionEnabled,
    canExport,
  });
  const warningCount = items.filter((item) => item.tone === "warning").length;
  const meta = warningCount > 0 ? `${warningCount} 项建议` : "状态良好";

  return (
    <section className="report-quality-panel" aria-label="报告交付质量提示">
      <div className="report-quality-head">
        <strong>报告交付提示</strong>
        <span>{meta}</span>
      </div>
      <div className="report-quality-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article className={`report-quality-item ${item.tone}`} key={item.id}>
              <span className="report-quality-icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span className="report-quality-copy">
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildQualityItems({
  commitCount,
  projectCount,
  enabledRepoCount,
  totalRepoCount,
  aiConfigured,
  showEvidenceDetails,
  redactionEnabled,
  canExport,
}: Props): QualityItem[] {
  const coverageLabel = projectCount > 0 ? `${projectCount} 个项目` : "项目待确认";
  const repoScope = totalRepoCount > 0 ? `${enabledRepoCount}/${totalRepoCount} 个启用仓库` : "暂无仓库索引";
  return [
    {
      id: "commits",
      label: `${commitCount} 条提交`,
      detail: commitCount >= 3 ? "内容量充足，可继续润色。" : "提交偏少，补一句结果或验证更稳。",
      tone: commitCount >= 3 ? "ok" : "warning",
      icon: commitCount >= 3 ? CheckCircle2 : AlertCircle,
    },
    {
      id: "projects",
      label: coverageLabel,
      detail: projectCount > 1 ? `覆盖 ${repoScope}，导出前核对主线。` : `覆盖 ${repoScope}，确认是否遗漏协作项目。`,
      tone: projectCount > 0 ? "ok" : "warning",
      icon: GitBranch,
    },
    {
      id: "ai",
      label: aiConfigured ? "AI 可润色" : "AI 待配置",
      detail: aiConfigured ? "适合把技术提交改成汇报口径。" : "配置后可按需补强表达。",
      tone: aiConfigured ? "ok" : "neutral",
      icon: Sparkles,
    },
    {
      id: "evidence",
      label: showEvidenceDetails ? "证据已显示" : "证据未显示",
      detail: showEvidenceDetails ? "报告保留 commit 来源，便于追溯。" : "关键汇报建议开启提交证据。",
      tone: showEvidenceDetails ? "ok" : "warning",
      icon: FileText,
    },
    {
      id: "redaction",
      label: redactionEnabled ? "脱敏已启用" : "未脱敏",
      detail: redactionEnabled ? "仓库、分支、作者和 hash 会以别名展示。" : "对外分享前建议开启报告脱敏。",
      tone: redactionEnabled ? "ok" : "warning",
      icon: redactionEnabled ? ShieldCheck : AlertCircle,
    },
    {
      id: "export",
      label: canExport ? "可导出" : "导出待配置",
      detail: canExport ? "可保存 Markdown、Word 或 PDF。" : "设置输出目录后可归档提交。",
      tone: canExport ? "ok" : "warning",
      icon: FileDown,
    },
  ];
}
