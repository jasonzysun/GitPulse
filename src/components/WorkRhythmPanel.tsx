import { Clock, Loader2 } from "lucide-react";
import "./WorkRhythmPanel.css";

export type WorkRhythmResult = {
  hourlyDistribution: number[];
  weekdayDistribution: number[];
  thisWeekCommits: number;
  lastWeekCommits: number;
  overtimeRatio: number;
  busiestHour: number;
  weekendRatio: number;
};

type Props = {
  data: WorkRhythmResult | null;
  loading: boolean;
};

const HOUR_LABELS = [
  "0", "", "", "3", "", "", "6", "", "", "9", "", "",
  "12", "", "", "15", "", "", "18", "", "", "21", "", "",
];

function formatHourRange(hour: number): string {
  const next = (hour + 1) % 24;
  return `${hour}:00-${next}:00`;
}

function formatBusiestHour(hour: number): string {
  if (hour >= 0 && hour < 6) return `凌晨 ${hour}-${hour + 1} 点`;
  if (hour >= 6 && hour < 12) return `上午 ${hour}-${hour + 1} 点`;
  if (hour >= 12 && hour < 18) return `下午 ${hour}-${hour + 1} 点`;
  return `晚上 ${hour}-${hour + 1} 点`;
}

function weekChangeIndicator(thisWeek: number, lastWeek: number) {
  if (lastWeek === 0 && thisWeek === 0) return { label: "--", className: "neutral" };
  if (lastWeek === 0) return { label: "+100%", className: "up" };
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (pct > 0) return { label: `+${pct}%`, className: "up" };
  if (pct < 0) return { label: `${pct}%`, className: "down" };
  return { label: "0%", className: "neutral" };
}

export function WorkRhythmPanel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="work-rhythm-panel">
        <div className="rhythm-loading">
          <Loader2 className="spin" size={20} />
          <span>正在分析工作节奏...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxHourly = Math.max(...data.hourlyDistribution, 1);
  const change = weekChangeIndicator(data.thisWeekCommits, data.lastWeekCommits);
  const changeArrow = change.className === "up" ? "↑" : change.className === "down" ? "↓" : "";

  return (
    <div className="work-rhythm-panel">
      <div className="rhythm-hourly-chart">
        <h4><Clock size={14} /> 24 小时提交分布</h4>
        <div className="rhythm-bars">
          {data.hourlyDistribution.map((count, hour) => (
            <div
              key={hour}
              className="rhythm-bar"
              data-busiest={hour === data.busiestHour ? "true" : undefined}
              style={{ height: `${Math.max((count / maxHourly) * 100, count > 0 ? 4 : 0)}%` }}
              title={`${formatHourRange(hour)}: ${count} 次提交`}
            />
          ))}
        </div>
        <div className="rhythm-hours">
          {HOUR_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>

      <div className="rhythm-cards">
        <div className="rhythm-card">
          <span className="rhythm-card-label">本周 vs 上周</span>
          <span className="rhythm-card-value">
            {data.thisWeekCommits}
            <span className={`rhythm-change ${change.className}`}>
              {changeArrow} {change.label}
            </span>
          </span>
        </div>

        <div className="rhythm-card">
          <span className="rhythm-card-label">最活跃时段</span>
          <span className="rhythm-card-value" style={{ fontSize: 15 }}>
            {formatBusiestHour(data.busiestHour)}
          </span>
        </div>

        <div className="rhythm-card">
          <span className="rhythm-card-label">加班比例</span>
          <span className="rhythm-card-value">
            {(data.overtimeRatio * 100).toFixed(0)}%
          </span>
          <div className="rhythm-progress-bar">
            <div
              className="rhythm-progress-fill"
              style={{ width: `${Math.min(data.overtimeRatio * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="rhythm-card">
          <span className="rhythm-card-label">周末占比</span>
          <span className="rhythm-card-value">
            {(data.weekendRatio * 100).toFixed(0)}%
          </span>
          <div className="rhythm-progress-bar">
            <div
              className="rhythm-progress-fill"
              style={{ width: `${Math.min(data.weekendRatio * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
