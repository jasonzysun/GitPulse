import {
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
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import type { RepoInfo } from "../model";

type Props = {
  repos: RepoInfo[];
  previewText: string;
  activePreview: "monthly" | "summary";
  status: string;
  warnings: string[];
  isBusy: boolean;
  lastOutputFile: string;
  summaryText: string;
  repoCount: number;
  commitCount: number;
  onExtract: () => void;
  onGenerateMonthly: () => void;
  onCopy: () => void;
  onSaveSummary: () => void;
  canSaveSummary: boolean;
  onPreviewChange: (preview: "monthly" | "summary") => void;
  onOpenSettings: () => void;
};

export function Workbench(props: Props) {
  const previewMeta = props.activePreview === "monthly" ? "Markdown 渲染" : "纯文本";
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

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
          <p className="kicker">Performance Report Pipeline</p>
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
        <CommandButton icon={<Clipboard size={17} />} label="复制结果" onClick={props.onCopy} disabled={!props.previewText} tone="plain" />
        <CommandButton icon={<RefreshCw size={17} />} label="保存摘要" onClick={props.onSaveSummary} disabled={!props.summaryText || !props.canSaveSummary || props.isBusy} tone="plain" />
      </div>

      <div className="studio-grid">
        <section className={`report-canvas ${isPreviewExpanded ? "preview-expanded" : ""}`}>
          <div className="canvas-topline">
            <PanelTitle icon={<Sparkles size={17} />} title="报告预览" meta={previewMeta} />
            <div className="report-switch" aria-label="报告类型切换">
              <button className={props.activePreview === "summary" ? "active" : ""} onClick={() => props.onPreviewChange("summary")}>
                <span>Daily</span>
                日志
              </button>
              <button className={props.activePreview === "monthly" ? "active" : ""} onClick={() => props.onPreviewChange("monthly")}>
                <span>Monthly</span>
                月报
              </button>
            </div>
          </div>
          {props.activePreview === "monthly" ? (
            <MarkdownPreview markdown={props.previewText} emptyText="暂无月报内容。" />
          ) : (
            <pre className="preview preview-plain">{props.previewText || "暂无报告内容。"}</pre>
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
