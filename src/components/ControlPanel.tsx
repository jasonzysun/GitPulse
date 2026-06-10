import { CalendarDays, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings } from "../model";
import { Field, PathInput } from "./Primitives";

type Props = {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  chooseDirectory: (field: "rootDir" | "outputDir") => void;
};

export function ControlPanel({ settings, updateSetting, chooseDirectory }: Props) {
  return (
    <aside className="control-rail">
      <section className="brand-block">
        <div className="brand-logo" role="img" aria-label="GitPulse" />
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
        <div className="date-stack">
          <Field label="开始日期">
            <input type="date" value={settings.startDate} onChange={(event) => updateSetting("startDate", event.target.value)} />
          </Field>
          <Field label="结束日期">
            <input type="date" value={settings.endDate} onChange={(event) => updateSetting("endDate", event.target.value)} />
          </Field>
        </div>
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
