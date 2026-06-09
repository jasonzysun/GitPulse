import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
};

export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function PathInput({
  label,
  value,
  onBrowse,
}: {
  label: string;
  value: string;
  onBrowse: () => void;
}) {
  return (
    <Field label={label}>
      <div className="path-input">
        <input value={value} readOnly placeholder="尚未选择" />
        <button type="button" onClick={onBrowse} aria-label={`选择${label}`}>
          <FolderOpen size={17} />
        </button>
      </div>
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  compact = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className={`toggle ${compact ? "compact" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span />
      {label}
    </label>
  );
}

export function MetricCard({
  label,
  value,
  accent = "sky",
}: {
  label: string;
  value: string | number;
  accent?: "sky" | "amber" | "blue";
}) {
  return (
    <article className={`metric-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
