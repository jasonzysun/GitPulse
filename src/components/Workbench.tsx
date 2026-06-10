import {
  Clipboard,
  FileDown,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
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
  onScan: () => void;
  onExtract: () => void;
  onGenerateMonthly: () => void;
  onCopy: () => void;
  onSaveSummary: () => void;
  canSaveSummary: boolean;
  onPreviewChange: (preview: "monthly" | "summary") => void;
  onOpenSettings: () => void;
};

export function Workbench(props: Props) {
  return (
    <section className="workbench">
      <header className="hero-band">
        <div className="hero-copy">
          <p className="kicker">Performance Report Pipeline</p>
          <h2>月报生成工作台</h2>
          <p className="hero-subcopy">本地 Git 数据源 · 上月绩效口径</p>
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
        <CommandButton icon={<FileDown size={17} />} label="生成上月月报" onClick={props.onGenerateMonthly} disabled={props.isBusy} tone="primary" />
        <CommandButton icon={<Search size={17} />} label="扫描仓库" onClick={props.onScan} disabled={props.isBusy} tone="quiet" />
        <CommandButton icon={<GitBranch size={17} />} label="提取日志" onClick={props.onExtract} disabled={props.isBusy} tone="quiet" />
        <CommandButton icon={<Clipboard size={17} />} label="复制结果" onClick={props.onCopy} disabled={!props.previewText} tone="plain" />
        <CommandButton icon={<RefreshCw size={17} />} label="保存摘要" onClick={props.onSaveSummary} disabled={!props.summaryText || !props.canSaveSummary || props.isBusy} tone="plain" />
      </div>

      <div className="studio-grid">
        <section className="report-canvas">
          <div className="canvas-topline">
            <PanelTitle icon={<Sparkles size={17} />} title="报告预览" meta="Markdown" />
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
          <pre className="preview">{props.previewText || "暂无报告内容。"}</pre>
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
