import { AlertCircle, CheckCircle2, Info, Loader2, X, type LucideIcon } from "lucide-react";
import { useEffect } from "react";

export type AppMessageTone = "info" | "success" | "warning" | "error" | "loading";

export type AppMessage = {
  id: number;
  message: string;
  tone: AppMessageTone;
  duration?: number;
};

type Props = {
  message: AppMessage | null;
  onDismiss: () => void;
};

const MESSAGE_ICONS: Record<AppMessageTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
  loading: Loader2,
};

export function AppMessageHost({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message || message.duration === 0) return;
    const timer = window.setTimeout(onDismiss, message.duration ?? 2800);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  const Icon = MESSAGE_ICONS[message.tone];

  return (
    <div className="app-message-layer" aria-live="polite" aria-atomic="true">
      <div className={`app-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"} key={message.id}>
        <Icon className={message.tone === "loading" ? "spin" : ""} size={17} />
        <span>{message.message}</span>
        <button type="button" onClick={onDismiss} aria-label="关闭提示">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
