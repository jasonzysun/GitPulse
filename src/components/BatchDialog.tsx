import { FolderOpen, Layers, X } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  BatchReportProgress,
  BatchReportResult,
  RepoInfo,
  ReportExportFormat,
  SplitGranularity,
} from "../model";
import { buildBatchReportOptions, parseProjectNames } from "../model";
import { Field } from "./Primitives";

type Props = {
  open: boolean;
  settings: AppSettings;
  indexedRepos: RepoInfo[];
  onClose: () => void;
};

type Stage = "config" | "running" | "done";

const GRANULARITY_OPTIONS: { value: SplitGranularity; label: string }[] = [
  { value: "daily", label: "按天" },
  { value: "weekly", label: "按周" },
  { value: "monthly", label: "按月" },
];

const FORMAT_OPTIONS: { value: ReportExportFormat; label: string }[] = [
  { value: "markdown", label: "Markdown" },
  { value: "docx", label: "Word" },
  { value: "pdf", label: "PDF" },
];

export function BatchDialog({ open: isOpen, settings, indexedRepos, onClose }: Props) {
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [granularity, setGranularity] = useState<SplitGranularity>("daily");
  const [format, setFormat] = useState<ReportExportFormat>("markdown");
  const [outputDir, setOutputDir] = useState(settings.outputDir || "");
  const [stage, setStage] = useState<Stage>("config");
  const [progress, setProgress] = useState<BatchReportProgress | null>(null);
  const [result, setResult] = useState<BatchReportResult | null>(null);
  const [error, setError] = useState("");
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStage("config");
      setProgress(null);
      setResult(null);
      setError("");
      setOpenError("");
      setOutputDir(settings.outputDir || "");
    }
  }, [isOpen, settings.outputDir]);

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | undefined;
    listen<BatchReportProgress>("batch-report-progress", ({ payload }) => {
      setProgress(payload);
    })
      .then((cleanup) => { unlisten = cleanup; })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [isOpen]);

  if (!isOpen) return null;

  const rangeInvalid = !rangeStart || !rangeEnd || rangeStart > rangeEnd;
  const configInvalid = rangeInvalid || !outputDir;

  async function browseOutputDir() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setOutputDir(selected);
  }

  async function startBatch() {
    setStage("running");
    setProgress(null);
    setError("");
    setOpenError("");
    try {
      const projectNames = parseProjectNames(settings.projectNamesText);
      const options = buildBatchReportOptions(
        settings,
        projectNames,
        rangeStart,
        rangeEnd,
        granularity,
        format,
        outputDir,
        indexedRepos,
      );
      const batchResult = await invoke<BatchReportResult>("batch_generate_reports", { options });
      setResult(batchResult);
      setStage("done");
    } catch (err) {
      setError(String(err));
      setStage("done");
    }
  }

  async function openOutputDir() {
    const dir = result?.outputDir || outputDir;
    if (!dir) return;

    setOpenError("");
    try {
      await invoke("open_output_directory", { path: dir });
    } catch (err) {
      setOpenError(`无法打开输出目录：${String(err)}`);
    }
  }

  function handleClose() {
    if (stage === "running") return;
    onClose();
  }

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="dialog-backdrop compact-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        className="range-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ minWidth: 420 }}
      >
        <header className="range-dialog-header">
          <div>
            <p className="kicker">Batch Generate</p>
            <h2 id="batch-dialog-title">批量生成报告</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={handleClose}
            disabled={stage === "running"}
            aria-label="关闭批量生成"
          >
            <X size={17} />
          </button>
        </header>

        {stage === "config" && (
          <>
            <div className="range-fields">
              <Field label="开始日期">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </Field>
              <Field label="结束日期">
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </Field>
            </div>

            <div className="range-fields">
              <Field label="拆分粒度">
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as SplitGranularity)}
                >
                  {GRANULARITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="导出格式">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="输出目录">
              <div className="path-input">
                <input value={outputDir} readOnly placeholder="选择输出目录" />
                <button type="button" onClick={browseOutputDir} aria-label="选择输出目录">
                  <FolderOpen size={17} />
                </button>
              </div>
            </Field>

            {rangeInvalid && rangeStart && rangeEnd && (
              <p className="range-error">开始日期不能晚于结束日期。</p>
            )}

            <footer className="range-dialog-actions">
              <button type="button" className="mapping-import" onClick={handleClose}>
                取消
              </button>
              <button
                type="button"
                className="mapping-add"
                disabled={configInvalid}
                onClick={startBatch}
              >
                <Layers size={16} />
                开始生成
              </button>
            </footer>
          </>
        )}

        {stage === "running" && progress && (
          <div style={{ padding: "0 0 20px" }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 6,
                color: "var(--text-secondary)",
              }}>
                <span>{progress.currentLabel}</span>
                <span>{progress.completed}/{progress.total}</span>
              </div>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: "var(--border)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  borderRadius: 3,
                  background: "var(--accent)",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
              正在生成第 {progress.completed + 1} / {progress.total} 份报告...
            </p>
          </div>
        )}

        {stage === "done" && (
          <div style={{ padding: "0 0 20px" }}>
            {error ? (
              <p className="range-error">{error}</p>
            ) : result && (
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                <p>生成完成：共 {result.total} 份</p>
                <p style={{ color: "var(--accent)" }}>成功 {result.succeeded} 份</p>
                {result.failed > 0 && (
                  <>
                    <p style={{ color: "var(--error, #ef4444)" }}>失败 {result.failed} 份</p>
                    <details style={{ marginTop: 8, fontSize: 13 }}>
                      <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
                        查看失败详情
                      </summary>
                      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                        {result.failures.map((f, i) => (
                          <li key={i} style={{ color: "var(--text-secondary)" }}>
                            {f.label}：{f.error}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </div>
            )}
            {openError && <p className="range-error">{openError}</p>}

            <footer className="range-dialog-actions" style={{ marginTop: 16 }}>
              {result && result.succeeded > 0 && (
                <button type="button" className="mapping-import" onClick={openOutputDir}>
                  <FolderOpen size={16} />
                  打开输出目录
                </button>
              )}
              <button type="button" className="mapping-add" onClick={handleClose}>
                关闭
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
