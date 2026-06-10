import {
  AlertCircle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  FileDown,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  Sparkles,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { DateRange, PreviewMode, RepoInfo } from "../model";
import { CustomRangeDialog } from "./CustomRangeDialog";
import { MarkdownPreview } from "./MarkdownPreview";

type Props = {
  repos: RepoInfo[];
  previewText: string;
  activePreview: PreviewMode;
  copyNotice: { id: number; message: string; tone: "success" | "error" } | null;
  status: string;
  warnings: string[];
  isBusy: boolean;
  lastOutputFile: string;
  summaryText: string;
  repoCount: number;
  commitCount: number;
  author: string;
  startDate: string;
  endDate: string;
  customRange: DateRange;
  aiEnabled: boolean;
  aiConfigured: boolean;
  onExtract: () => void;
  onGenerateCustom: (range: DateRange) => void;
  onGenerateMonthly: () => void;
  onCopy: () => void;
  onSaveSummary: () => void;
  canSaveSummary: boolean;
  onToggleAi: (enabled: boolean) => void;
  onPreviewChange: (preview: PreviewMode) => void;
  onOpenSettings: () => void;
};

export function Workbench(props: Props) {
  const previewMeta = props.aiEnabled ? (props.aiConfigured ? "AI 润色" : "AI 待配置") : props.activePreview === "monthly" ? "Markdown 渲染" : "纯文本";
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  useEffect(() => {
    if (!isPreviewExpanded) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPreviewExpanded(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreviewExpanded]);

  function handlePreviewChange(preview: PreviewMode) {
    if (preview === "custom") {
      setCustomDialogOpen(true);
      return;
    }
    props.onPreviewChange(preview);
  }

  function generateCustom(range: DateRange) {
    setCustomDialogOpen(false);
    props.onGenerateCustom(range);
  }

  const aiStateLabel = props.aiEnabled ? (props.aiConfigured ? "已开启" : "待配置") : "已关闭";
  const previewEmptyText = props.activePreview === "monthly" ? "暂无月报内容。" : props.activePreview === "custom" ? "请选择时间段生成自定义报告。" : "暂无日报内容。";

  return (
    <section className="workbench">
      {isPreviewExpanded && (
        <div
          className="canvas-fullscreen-backdrop"
          aria-hidden="true"
          onClick={() => setIsPreviewExpanded(false)}
        />
      )}
      <header className="hero-band">
        <div className="hero-copy">
          <div className="brand-logo hero-brand" role="img" aria-label="GitPulse" />
          <h2>工作报告工作台</h2>
          <p className="hero-subcopy">本地 Git 数据源 · 日报取选定日期 · 月报取上月</p>
        </div>
        <div className="hero-aside">
          <div className="hero-actions">
            <div className="run-status">
              {props.isBusy && <Loader2 className="spin" size={16} />}
              <span>{props.status}</span>
            </div>
            <button className="settings-trigger" type="button" onClick={props.onOpenSettings} aria-label="打开设置">
              <Settings2 size={16} />
              设置
            </button>
          </div>
          <div className="context-chips" aria-label="当前工作区上下文">
            <button type="button" className="context-chip" onClick={props.onOpenSettings} title="在设置中修改日期范围">
              <CalendarDays size={13} />
              {props.startDate === props.endDate ? props.startDate : `${props.startDate} ~ ${props.endDate}`}
            </button>
            <button type="button" className="context-chip" onClick={props.onOpenSettings} title="在设置中修改 Git 作者">
              <UserRound size={13} />
              {props.author || "未设置作者"}
            </button>
          </div>
          <div className="quick-stats" aria-label="当前结果概览">
            <span><strong>{props.repoCount}</strong> 仓库</span>
            <span><strong>{props.commitCount}</strong> 提交</span>
            <span><strong>{props.lastOutputFile ? "已生成" : "待生成"}</strong> 输出</span>
          </div>
        </div>
      </header>

      <div className="action-dock">
        <CommandButton icon={<GitBranch size={17} />} label="生成日报" onClick={props.onExtract} disabled={props.isBusy} tone="primary" />
        <CommandButton icon={<FileDown size={17} />} label="生成上月月报" onClick={props.onGenerateMonthly} disabled={props.isBusy} tone="primary" />
        <CommandButton icon={<RefreshCw size={17} />} label="保存摘要" onClick={props.onSaveSummary} disabled={!props.summaryText || !props.canSaveSummary || props.isBusy} tone="plain" />
        <button
          className={`ai-inline-toggle ${props.aiEnabled ? "active" : ""} ${props.aiEnabled && !props.aiConfigured ? "warning" : ""}`}
          type="button"
          aria-pressed={props.aiEnabled}
          onClick={() => props.onToggleAi(!props.aiEnabled)}
          title={props.aiEnabled && !props.aiConfigured ? "请在设置中补齐 AI 配置" : "切换 AI 润色"}
        >
          <Bot size={17} />
          <span>AI 润色</span>
          <strong>{aiStateLabel}</strong>
        </button>
      </div>

      <div className="studio-grid">
        <section className={`report-canvas ${isPreviewExpanded ? "preview-expanded" : ""}`}>
          <div className="canvas-topline">
            <PanelTitle icon={<Sparkles size={17} />} title="报告预览" meta={previewMeta} />
            <div className="canvas-tools">
              <button className="preview-copy-button" type="button" onClick={props.onCopy} disabled={!props.previewText}>
                <Clipboard size={15} />
                复制
              </button>
              <div className="report-switch" aria-label="报告类型切换">
                <button className={props.activePreview === "summary" ? "active" : ""} onClick={() => handlePreviewChange("summary")}>
                  <span>Daily</span>
                  日报
                </button>
                <button className={props.activePreview === "monthly" ? "active" : ""} onClick={() => handlePreviewChange("monthly")}>
                  <span>Monthly</span>
                  月报
                </button>
                <button className={props.activePreview === "custom" ? "active" : ""} onClick={() => handlePreviewChange("custom")}>
                  <span>Custom</span>
                  自定义
                </button>
              </div>
            </div>
          </div>
          {props.copyNotice && (
            <div className={`copy-toast ${props.copyNotice.tone}`} role="status" aria-live="polite" key={props.copyNotice.id}>
              {props.copyNotice.tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {props.copyNotice.message}
            </div>
          )}
          {props.activePreview === "monthly" ? (
            <MarkdownPreview markdown={props.previewText} emptyText={previewEmptyText} />
          ) : (
            <pre className="preview preview-plain">{props.previewText || previewEmptyText}</pre>
          )}
          <button
            className="preview-expand-button"
            type="button"
            onClick={() => setIsPreviewExpanded((current) => !current)}
            aria-label={isPreviewExpanded ? "退出预览全屏" : "全屏查看预览"}
            title={isPreviewExpanded ? "退出全屏" : "全屏查看"}
          >
            {isPreviewExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </section>

        <section className="repo-drawer">
          <PanelTitle icon={<TerminalSquare size={17} />} title="仓库索引" meta={`${props.repos.length} repos`} />
          <div className="repo-list">
            {props.repos.length === 0 && <p className="empty-state">暂无仓库索引。</p>}
            {props.repos.map((repo) => (
              <article className="repo-row" key={repo.path}>
                <div>
                  <strong>{repo.name}</strong>
                  <p>{repo.path}</p>
                </div>
                <span title={repo.branch}>{repo.branch}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      {(props.warnings.length > 0 || props.lastOutputFile) && (
        <footer className="event-log">
          {props.lastOutputFile && <p>输出文件：{props.lastOutputFile}</p>}
          {props.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </footer>
      )}
      <CustomRangeDialog
        open={customDialogOpen}
        initialRange={props.customRange}
        isBusy={props.isBusy}
        onClose={() => setCustomDialogOpen(false)}
        onConfirm={generateCustom}
      />
    </section>
  );
}

function CommandButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: "primary" | "quiet" | "plain";
}) {
  return (
    <button className={`command-button ${tone}`} onClick={onClick} disabled={disabled}>
      {icon}
      {label}
    </button>
  );
}

function PanelTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="panel-title">
      <h3>{icon}{title}</h3>
      <span>{meta}</span>
    </div>
  );
}
