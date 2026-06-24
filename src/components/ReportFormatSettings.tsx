import { Braces, FileText, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AppSettings } from "../model";
import {
  defaultReportFormatTemplate,
  profileReportFormatTemplate,
  REPORT_FORMAT_KINDS,
  REPORT_FORMAT_VARIABLES,
  type ReportFormatKind,
  type ReportTemplateProfile,
} from "../reportFormat";
import { Field } from "./Primitives";

type Props = {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

type ReportFormatTemplateKey =
  | "dailyReportFormatTemplate"
  | "weeklyReportFormatTemplate"
  | "monthlyReportFormatTemplate"
  | "customReportFormatTemplate";

const REPORT_TEMPLATE_PROFILES: { id: ReportTemplateProfile; label: string; description: string }[] = [
  { id: "standard", label: "标准结构", description: "沿用当前类型的内置结构" },
  { id: "concise", label: "简洁清单", description: "保留概览与事项列表" },
  { id: "grouped", label: "分组汇总", description: "按概览、项目、后续组织" },
  { id: "evidence", label: "证据优先", description: "突出来源引用与可追溯记录" },
];

const BASE_REPORT_FORMAT_SAMPLE_VALUES: Record<string, string> = {
  "{author}": "Zhang Wei",
  "{projectSections}": [
    "### GitPulse 桌面端",
    "",
    "- 提交事项：3",
    "- 完成报告导出入口整理",
    "- 优化项目映射导入反馈",
    "",
    "### 内部工具链",
    "",
    "- 提交事项：2",
    "- 修复多仓库扫描的异常提示",
  ].join("\n"),
  "{commitItems}": ["- 完成报告格式设置面板", "- 修复周报生成时的空状态文案", "- 优化 PDF 导出字体回退"].join("\n"),
  "{summary}": "- 本周期共推进 5 项可追踪事项，主要集中在报告生成、导出体验与本地配置稳定性。",
  "{nextSteps}": "- 继续接入模板渲染逻辑，并补充导出格式回归测试。",
  "{evidence}": [
    "> 来源：`git_pulse` / `main` / `2026-06-12` / `abc123d`",
    "> 原始：`feat: 添加报告格式设置面板`",
  ].join("\n"),
  "{notes}": "> 说明：本报告基于 Git 提交记录生成，业务指标和验收结论建议结合实际交付补充。",
};

export function ReportFormatSettings({ settings, updateSetting }: Props) {
  const [formatEditTarget, setFormatEditTarget] = useState<ReportFormatKind>("weekly");
  const activeReportFormatTemplate = reportFormatTemplateValue(settings, formatEditTarget);
  const activeReportFormatPreview = renderReportFormatPreview(activeReportFormatTemplate, formatEditTarget);

  function updateReportFormatTemplate(kind: ReportFormatKind, value: string) {
    updateSetting(reportFormatTemplateKey(kind), value);
    if (settings.reportTemplateProfile !== "custom") updateSetting("reportTemplateProfile", "custom");
  }

  function applyReportTemplateProfile(profile: ReportTemplateProfile) {
    updateSetting("reportTemplateProfile", profile);
    updateSetting(reportFormatTemplateKey(formatEditTarget), profileReportFormatTemplate(profile, formatEditTarget));
  }

  function resetCurrentReportFormatTemplate() {
    updateReportFormatTemplate(formatEditTarget, defaultReportFormatTemplate(formatEditTarget));
  }

  function appendReportFormatVariable(token: string) {
    const separator = activeReportFormatTemplate.endsWith("\n") || !activeReportFormatTemplate ? "" : "\n";
    updateReportFormatTemplate(formatEditTarget, `${activeReportFormatTemplate}${separator}${token}`);
  }

  return (
    <section className="settings-section report-format-section">
      <SectionTitle icon={<FileText size={16} />} title="报告格式" />

      <div className="mapping-scope-control report-format-kind-control" role="radiogroup" aria-label="选择报告类型">
        {REPORT_FORMAT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={formatEditTarget === kind}
            className={formatEditTarget === kind ? "active" : ""}
            onClick={() => setFormatEditTarget(kind)}
          >
            {reportFormatKindLabel(kind)}
          </button>
        ))}
      </div>

      <div className="report-format-layout">
        <div className="report-format-editor">
          <Field label="结构方案">
            <div className="report-format-presets">
              {REPORT_TEMPLATE_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={isReportTemplateProfileActive(activeReportFormatTemplate, profile.id, formatEditTarget) ? "active" : ""}
                  onClick={() => applyReportTemplateProfile(profile.id)}
                >
                  <span>{profile.label}</span>
                  <small>{profile.description}</small>
                </button>
              ))}
            </div>
          </Field>

          <Field label={`${reportFormatKindLabel(formatEditTarget)}模板`}>
            <textarea
              className="refinement-input report-template-input"
              value={activeReportFormatTemplate}
              onChange={(event) => updateReportFormatTemplate(formatEditTarget, event.target.value)}
              spellCheck={false}
            />
          </Field>

          <div className="report-format-actions">
            <button type="button" className="mapping-import" onClick={resetCurrentReportFormatTemplate}>
              <RefreshCw size={15} />
              恢复当前默认
            </button>
          </div>
        </div>

        <aside className="report-format-aside" aria-label="报告格式预览">
          <div className="report-format-preview">
            <div className="report-format-panel-title">
              <FileText size={15} />
              <strong>样例预览</strong>
            </div>
            <pre>{activeReportFormatPreview}</pre>
          </div>

          <div className="report-format-variables">
            <div className="report-format-panel-title">
              <Braces size={15} />
              <strong>模板变量</strong>
            </div>
            <div className="report-variable-grid">
              {REPORT_FORMAT_VARIABLES.map((variable) => (
                <button key={variable.token} type="button" onClick={() => appendReportFormatVariable(variable.token)}>
                  <code>{variable.token}</code>
                  <span>{variable.label}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function reportFormatTemplateKey(kind: ReportFormatKind): ReportFormatTemplateKey {
  if (kind === "weekly") return "weeklyReportFormatTemplate";
  if (kind === "monthly") return "monthlyReportFormatTemplate";
  if (kind === "custom") return "customReportFormatTemplate";
  return "dailyReportFormatTemplate";
}

function reportFormatKindLabel(kind: ReportFormatKind) {
  if (kind === "weekly") return "周报";
  if (kind === "monthly") return "月报";
  if (kind === "custom") return "自定义";
  return "日报";
}

function reportFormatTemplateValue(settings: AppSettings, kind: ReportFormatKind) {
  return settings[reportFormatTemplateKey(kind)];
}

function renderReportFormatPreview(template: string, kind: ReportFormatKind) {
  const source = template.trim() ? template : defaultReportFormatTemplate(kind);
  const sampleValues = reportFormatSampleValues(kind);
  return REPORT_FORMAT_VARIABLES.reduce(
    (text, variable) => text.split(variable.token).join(sampleValues[variable.token] ?? variable.token),
    source,
  );
}

function isReportTemplateProfileActive(template: string, profile: ReportTemplateProfile, kind: ReportFormatKind) {
  return template === profileReportFormatTemplate(profile, kind);
}

function reportFormatSampleValues(kind: ReportFormatKind): Record<string, string> {
  const periodValues: Record<ReportFormatKind, Record<string, string>> = {
    daily: {
      "{periodLabel}": "2026-06-14",
      "{startDate}": "2026-06-14",
      "{endDate}": "2026-06-14",
    },
    weekly: {
      "{periodLabel}": "2026年第24周",
      "{startDate}": "2026-06-08",
      "{endDate}": "2026-06-14",
    },
    monthly: {
      "{periodLabel}": "2026年6月",
      "{startDate}": "2026-06-01",
      "{endDate}": "2026-06-30",
    },
    custom: {
      "{periodLabel}": "2026-06-01 至 2026-06-14",
      "{startDate}": "2026-06-01",
      "{endDate}": "2026-06-14",
    },
  };
  return { ...BASE_REPORT_FORMAT_SAMPLE_VALUES, ...periodValues[kind] };
}
