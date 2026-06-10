import { Bot, Download, Eye, EyeOff, FileUp, Monitor, Moon, Plus, Settings2, Sun, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  buildMappingKeys,
  mergeMappingEntries,
  parseMappingText,
  serializeMappingText,
  type AppSettings,
  type MappingEntry,
  type RepoInfo,
  type UpdateSummary,
} from "../model";
import { Field, PathInput, Toggle } from "./Primitives";
import { UpdateSection } from "./UpdateSection";

type Props = {
  open: boolean;
  settings: AppSettings;
  repos: RepoInfo[];
  currentVersion: string;
  updateSummary: UpdateSummary | null;
  updateMessage: string;
  updateProgress: string;
  updateBusy: "checking" | "installing" | null;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  chooseDirectory: (field: "rootDir" | "outputDir") => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onClose: () => void;
};

type MappingOption = {
  value: string;
  label: string;
};

export function SettingsDialog({
  open,
  settings,
  repos,
  currentVersion,
  updateSummary,
  updateMessage,
  updateProgress,
  updateBusy,
  updateSetting,
  chooseDirectory,
  onCheckForUpdates,
  onInstallUpdate,
  onClose,
}: Props) {
  const [importNote, setImportNote] = useState("");
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  useEffect(() => {
    if (!open) {
      setImportNote("");
      setShowAiApiKey(false);
    }
  }, [open]);
  if (!open) return null;

  const mappingRows = parseMappingText(settings.projectNamesText);
  const visibleMappingRows = mappingRows.length > 0 ? mappingRows : [{ key: "", displayName: "" }];
  const mappingOptions = buildMappingOptions(repos, mappingRows);

  function updateAiProvider(provider: AppSettings["aiProvider"]) {
    updateSetting("aiProvider", provider);
    if (provider === "anthropic-native") {
      updateSetting("aiBaseUrl", "https://api.anthropic.com/v1");
      return;
    }
    updateSetting("aiBaseUrl", "https://api.openai.com/v1");
  }

  function updateMappingRow(index: number, patch: Partial<MappingEntry>) {
    const rows = visibleMappingRows.map((row) => ({ ...row }));
    rows[index] = { ...rows[index], ...patch };
    updateSetting("projectNamesText", serializeMappingText(rows));
  }

  function addMappingRow() {
    updateSetting("projectNamesText", serializeMappingText([...visibleMappingRows, { key: "", displayName: "" }]));
  }

  function removeMappingRow(index: number) {
    const rows = visibleMappingRows.filter((_, rowIndex) => rowIndex !== index);
    updateSetting("projectNamesText", serializeMappingText(rows));
  }

  async function importMappingFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      });
      if (typeof selected !== "string") return;
      const entries = await invoke<MappingEntry[]>("read_mapping_xlsx", { path: selected });
      if (entries.length === 0) {
        setImportNote("未读取到映射，请确认已在「显示名称」列填写内容");
        return;
      }
      updateSetting("projectNamesText", mergeMappingEntries(settings.projectNamesText, entries));
      setImportNote(`已导入 ${entries.length} 条映射`);
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadTemplate() {
    try {
      const path = await saveDialog({
        defaultPath: "gitpulse-映射模板.xlsx",
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      });
      if (typeof path !== "string") return;
      await invoke("write_mapping_template_xlsx", { path, keys: buildMappingKeys(repos) });
      setImportNote(`模板已保存：${path}`);
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="应用设置" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div>
            <p className="kicker">Preferences</p>
            <h2>设置</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置">
            <X size={18} />
          </button>
        </header>

        <div className="settings-sections">
          <section className="settings-section">
            <SectionTitle icon={<Monitor size={16} />} title="外观" />
            <div className="theme-mode-control" aria-label="颜色模式">
              <ThemeModeButton
                active={settings.themeMode === "system"}
                icon={<Monitor size={15} />}
                label="跟随系统"
                onClick={() => updateSetting("themeMode", "system")}
              />
              <ThemeModeButton
                active={settings.themeMode === "light"}
                icon={<Sun size={15} />}
                label="亮色"
                onClick={() => updateSetting("themeMode", "light")}
              />
              <ThemeModeButton
                active={settings.themeMode === "dark"}
                icon={<Moon size={15} />}
                label="暗色"
                onClick={() => updateSetting("themeMode", "dark")}
              />
            </div>
          </section>

          <UpdateSection
            currentVersion={currentVersion}
            updateSummary={updateSummary}
            updateMessage={updateMessage}
            updateProgress={updateProgress}
            updateBusy={updateBusy}
            onCheckForUpdates={onCheckForUpdates}
            onInstallUpdate={onInstallUpdate}
          />

          <section className="settings-section">
            <SectionTitle icon={<Settings2 size={16} />} title="输出与提取" />
            <Toggle label="输出到文件" checked={settings.outputEnabled} onChange={(value) => updateSetting("outputEnabled", value)} />
            {settings.outputEnabled && <PathInput label="输出目录" value={settings.outputDir} onBrowse={() => chooseDirectory("outputDir")} />}
            <div className="settings-toggle-grid">
              <Toggle label="拉取最新代码" checked={settings.pullLatestCode} onChange={(value) => updateSetting("pullLatestCode", value)} />
              <Toggle label="提取所有分支" checked={settings.extractAllBranches} onChange={(value) => updateSetting("extractAllBranches", value)} />
              <Toggle label="输出详细日志" checked={settings.detailedOutput} onChange={(value) => updateSetting("detailedOutput", value)} />
              <Toggle label="显示项目与分支" checked={settings.showProjectAndBranch} onChange={(value) => updateSetting("showProjectAndBranch", value)} />
            </div>
          </section>

          <section className="settings-section">
            <SectionTitle icon={<Bot size={16} />} title="AI 润色" />
            <Toggle label="启用 AI 润色" checked={settings.aiEnabled} onChange={(value) => updateSetting("aiEnabled", value)} />
            <Field label="协议">
              <select value={settings.aiProvider} onChange={(event) => updateAiProvider(event.target.value as AppSettings["aiProvider"])}>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="anthropic-native">Anthropic Native</option>
              </select>
            </Field>
            <Field label="Base URL">
              <input value={settings.aiBaseUrl} onChange={(event) => updateSetting("aiBaseUrl", event.target.value)} />
            </Field>
            <Field label="API Key">
              <div className="secret-input">
                <input
                  type={showAiApiKey ? "text" : "password"}
                  value={settings.aiApiKey}
                  onChange={(event) => updateSetting("aiApiKey", event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="secret-toggle"
                  onClick={() => setShowAiApiKey((current) => !current)}
                  aria-label={showAiApiKey ? "隐藏 API Key" : "显示 API Key"}
                  aria-pressed={showAiApiKey}
                >
                  {showAiApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="模型">
              <input value={settings.aiModel} onChange={(event) => updateSetting("aiModel", event.target.value)} />
            </Field>
            <textarea
              className="refinement-input"
              value={settings.refinementInstruction}
              onChange={(event) => updateSetting("refinementInstruction", event.target.value)}
              placeholder="语气正式一些，突出项目交付、问题闭环和协作价值。"
            />
          </section>

          <section className="settings-section mapping-section">
            <SectionTitle icon={<Settings2 size={16} />} title="项目映射" />
            <div className="mapping-editor">
              {visibleMappingRows.map((row, index) => (
                <div className="mapping-row" key={`${index}-${row.key}`}>
                  <Field label="项目与分支">
                    <select value={row.key} onChange={(event) => updateMappingRow(index, { key: event.target.value })}>
                      <option value="">{repos.length > 0 ? "选择项目与分支" : "请先扫描仓库"}</option>
                      {mappingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="映射名称">
                    <input
                      value={row.displayName}
                      onChange={(event) => updateMappingRow(index, { displayName: event.target.value })}
                      placeholder="例如：后端服务-"
                    />
                  </Field>
                  <button type="button" className="icon-button mapping-remove" onClick={() => removeMappingRow(index)} aria-label="删除映射">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="mapping-actions">
                <button type="button" className="mapping-add" onClick={addMappingRow}>
                  <Plus size={16} />
                  添加映射
                </button>
                <button type="button" className="mapping-import" onClick={downloadTemplate}>
                  <Download size={16} />
                  下载模板
                </button>
                <button type="button" className="mapping-import" onClick={importMappingFile}>
                  <FileUp size={16} />
                  导入文件
                </button>
              </div>
              <p className="mapping-hint">
                下载 Excel 模板后，在「显示名称」列填写名称再导入；「项目(分支)」列已自动列出，请勿改动。
              </p>
              {importNote && <p className="mapping-note">{importNote}</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function ThemeModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function buildMappingOptions(repos: RepoInfo[], rows: MappingEntry[]): MappingOption[] {
  const options = new Map<string, string>();
  for (const repo of repos) {
    const wildcardKey = `${repo.name}(*)`;
    options.set(wildcardKey, `${repo.name} · 全部分支 (*)`);
    if (repo.branch) {
      const branchKey = `${repo.name}(${repo.branch})`;
      options.set(branchKey, `${repo.name} · ${repo.branch}`);
    }
  }
  for (const row of rows) {
    if (row.key && !options.has(row.key)) options.set(row.key, `${row.key} · 已保存`);
  }
  return [...options.entries()].map(([value, label]) => ({ value, label }));
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}
