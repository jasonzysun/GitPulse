import { Download, Loader2, RefreshCw } from "lucide-react";
import type { UpdateSummary } from "../model";

type Props = {
  currentVersion: string;
  updateSummary: UpdateSummary | null;
  updateMessage: string;
  updateProgress: string;
  updateBusy: "checking" | "installing" | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
};

export function UpdateSection(props: Props) {
  const checking = props.updateBusy === "checking";
  const installing = props.updateBusy === "installing";

  return (
    <section className="settings-section">
      <div className="section-title">
        <RefreshCw size={16} />
        <h2>应用更新</h2>
      </div>

      <div className="update-status-card">
        <div className="update-version-row">
          <span className="update-pill">当前版本 v{props.currentVersion}</span>
          {props.updateSummary && <span className="update-pill accent">可更新至 v{props.updateSummary.version}</span>}
        </div>

        <p className="update-status-text">{props.updateMessage}</p>
        {props.updateProgress && <p className="update-meta">{props.updateProgress}</p>}
        {props.updateSummary?.date && <p className="update-meta">发布时间 {formatDate(props.updateSummary.date)}</p>}
        {props.updateSummary?.notes && <pre className="update-notes">{props.updateSummary.notes}</pre>}

        <div className="update-actions">
          <button type="button" className="mapping-import" onClick={props.onCheckForUpdates} disabled={checking || installing}>
            {checking ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            检查更新
          </button>
          {props.updateSummary && (
            <button
              type="button"
              className="mapping-add"
              onClick={props.onInstallUpdate}
              disabled={checking || installing}
            >
              {installing ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
              下载并安装
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}
