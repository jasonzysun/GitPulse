import { CalendarDays, GitBranch, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings } from "../model";
import { Field, PathInput } from "./Primitives";

type Props = {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  chooseDirectory: (field: "rootDir" | "outputDir") => void;
  onOpenSettings: () => void;
};

export function ControlPanel({ settings, updateSetting, chooseDirectory, onOpenSettings }: Props) {
  return (
    <aside className="control-rail">
      <section className="brand-block">
        <div className="brand-sigil">GR</div>
        <div>
          <p className="kicker">Local Workbench</p>
          <h1>Git Report Studio</h1>
        </div>
      </section>

      <section className="control-section primary-setup">
        <SectionTitle icon={<GitBranch size={16} />} title="工作区" />
        <PathInput label="仓库根目录" value={settings.rootDir} onBrowse={() => chooseDirectory("rootDir")} />
        <Field label="Git 作者">
          <input value={settings.author} onChange={(event) => updateSetting("author", event.target.value)} />
        </Field>
      </section>

      <section className="control-section">
        <SectionTitle icon={<CalendarDays size={16} />} title="日期范围" />
        <div className="date-pair">
          <Field label="开始日期">
            <input type="date" value={settings.startDate} onChange={(event) => updateSetting("startDate", event.target.value)} />
          </Field>
          <Field label="结束日期">
            <input type="date" value={settings.endDate} onChange={(event) => updateSetting("endDate", event.target.value)} />
          </Field>
        </div>
      </section>

      <section className="settings-card">
        <div>
          <strong>高级配置</strong>
          <p>{settings.outputDir ? "输出、AI、项目映射" : "输出目录未设置"}</p>
        </div>
        <button type="button" onClick={onOpenSettings}>
          <Settings2 size={17} />
          打开设置
        </button>
      </section>
    </aside>
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
