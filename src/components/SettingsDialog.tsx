import { Bot, Settings2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings } from "../model";
import { Field, PathInput, Toggle } from "./Primitives";

type Props = {
  open: boolean;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  chooseDirectory: (field: "rootDir" | "outputDir") => void;
  onClose: () => void;
};

export function SettingsDialog({ open, settings, updateSetting, chooseDirectory, onClose }: Props) {
  if (!open) return null;

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
            <SectionTitle icon={<Settings2 size={16} />} title="输出与提取" />
            <PathInput label="输出目录" value={settings.outputDir} onBrowse={() => chooseDirectory("outputDir")} />
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
            <Field label="接口">
              <input value={settings.aiBaseUrl} onChange={(event) => updateSetting("aiBaseUrl", event.target.value)} />
            </Field>
            <div className="date-pair">
              <Field label="模型">
                <input value={settings.aiModel} onChange={(event) => updateSetting("aiModel", event.target.value)} />
              </Field>
              <Field label="Key 环境变量">
                <input value={settings.aiKeyEnv} onChange={(event) => updateSetting("aiKeyEnv", event.target.value)} />
              </Field>
            </div>
            <textarea
              className="refinement-input"
              value={settings.refinementInstruction}
              onChange={(event) => updateSetting("refinementInstruction", event.target.value)}
              placeholder="语气正式一些，突出项目交付、问题闭环和协作价值。"
            />
          </section>

          <section className="settings-section mapping-section">
            <SectionTitle icon={<Settings2 size={16} />} title="项目映射" />
            <textarea
              className="mapping-input"
              value={settings.projectNamesText}
              onChange={(event) => updateSetting("projectNamesText", event.target.value)}
              spellCheck={false}
              placeholder="api-service(*) -> 后端服务-"
            />
          </section>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}
