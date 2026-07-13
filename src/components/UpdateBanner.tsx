import { Download, Loader2, Sparkles, X } from "lucide-react";

type Props = {
  version: string;
  updateBusy: "checking" | "installing" | null;
  updateProgress: string;
  updateMessage: string;
  onInstall: () => void;
  onViewDetails: () => void;
  onDismiss: () => void;
};

export function UpdateBanner(props: Props) {
  const installing = props.updateBusy === "installing";
  // 正常流程消息（发现/安装中/安装完成/最新）不视为错误，仅真正的失败提示才高亮为错误并允许重试
  const benignPrefixes = ["发现新版本", "正在安装", "更新包已准备", "当前已是最新", "当前版本"];
  const isBenignMessage = benignPrefixes.some((prefix) => props.updateMessage.startsWith(prefix));
  const installed = props.updateMessage.startsWith("更新包已准备");
  const errorDetail = !installing && props.updateMessage && !isBenignMessage ? props.updateMessage : "";
  const detail = installing
    ? props.updateProgress || props.updateMessage || "正在下载更新…"
    : installed
      ? props.updateMessage
      : errorDetail;

  return (
    <div className="update-banner-layer" aria-live="polite" aria-atomic="true">
      <div className={`update-banner${errorDetail ? " has-error" : ""}`} role="status">
        <span className="update-banner-icon">
          {installing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
        </span>

        <div className="update-banner-body">
          <span className="update-banner-title">发现新版本 v{props.version}</span>
          {detail && <span className="update-banner-detail">{detail}</span>}
        </div>

        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-primary"
            onClick={props.onInstall}
            disabled={installing || installed}
          >
            {installing || installed ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
            {installing ? "更新中" : installed ? "即将重启" : errorDetail ? "重试" : "立即更新"}
          </button>
          {!installing && !installed && (
            <button type="button" className="update-banner-link" onClick={props.onViewDetails}>
              查看详情
            </button>
          )}
        </div>

        {!installing && !installed && (
          <button type="button" className="update-banner-close" onClick={props.onDismiss} aria-label="关闭提示">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
