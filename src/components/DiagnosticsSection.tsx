import { Activity, AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { DiagnosticResult } from "../model";

type Props = {
  result: DiagnosticResult | null;
  busy: boolean;
  message: string;
  ranAt: string;
  onRefresh: () => void | Promise<void>;
};

export function DiagnosticsSection({ result, busy, message, ranAt, onRefresh }: Props) {
  return (
    <section className="settings-section diagnostics-section">
      <div className="diagnostics-header">
        <div>
          <div className="section-title">
            <Activity size={16} />
            <h2>运行诊断</h2>
          </div>
          {ranAt && <p className="diagnostics-ran-at">上次检查 {ranAt}</p>}
        </div>
        <button
          type="button"
          className="model-fetch-button"
          onClick={() => void onRefresh()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          {busy ? "检查中" : "重新检查"}
        </button>
      </div>

      {result && (
        <div className="diagnostics-summary" aria-label="诊断结果汇总">
          <span className={result.errorCount > 0 ? "error" : ""}>
            {result.errorCount} 异常
          </span>
          <span className={result.warningCount > 0 ? "warning" : ""}>
            {result.warningCount} 提醒
          </span>
          <span>{result.okCount} 正常</span>
        </div>
      )}

      {message && (
        <p className="model-fetch-note error">
          <AlertCircle size={14} />
          {message}
        </p>
      )}

      {result ? (
        <div className="diagnostics-list">
          {result.items.map((item) => (
            <article className={`diagnostics-item ${item.severity}`} key={item.id}>
              <span className="diagnostics-status-icon" aria-hidden="true">
                {item.severity === "ok" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
              </span>
              <div className="diagnostics-copy">
                <strong>{item.label}</strong>
                <p>{item.message}</p>
                {item.action && <small>{item.action}</small>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state diagnostics-empty">
          {busy ? "正在检查本地环境与当前设置..." : "点击重新检查，查看 GitPulse 当前配置是否可用。"}
        </p>
      )}
    </section>
  );
}
