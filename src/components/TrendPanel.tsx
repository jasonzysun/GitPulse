import { BarChart3, Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";
import "./TrendPanel.css";

export type TrendPeriod = {
  label: string;
  commits: number;
  additions: number;
  deletions: number;
  activeProjects: number;
};

export type TrendProjectShare = {
  project: string;
  commits: number;
  additions: number;
};

export type TrendResult = {
  periods: TrendPeriod[];
  projectShares: TrendProjectShare[];
  thisWeekCommits: number;
  lastWeekCommits: number;
  thisMonthCommits: number;
  lastMonthCommits: number;
};

type Props = {
  data: TrendResult | null;
  loading: boolean;
  granularity: "weekly" | "monthly";
  onGranularityChange: (g: "weekly" | "monthly") => void;
};

const PROJECT_COLORS = [
  "var(--heatmap-4)",
  "var(--heatmap-3)",
  "var(--heatmap-2)",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

function changeIndicator(current: number, previous: number) {
  if (previous === 0 && current === 0) return { label: "--", className: "neutral" };
  if (previous === 0) return { label: "+100%", className: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { label: `+${pct}%`, className: "up" };
  if (pct < 0) return { label: `${pct}%`, className: "down" };
  return { label: "0%", className: "neutral" };
}

export function TrendPanel({ data, loading, granularity, onGranularityChange }: Props) {
  if (loading) {
    return (
      <div className="trend-panel">
        <div className="trend-loading">
          <Loader2 className="spin" size={20} />
          <span>正在加载趋势数据...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const weekChange = changeIndicator(data.thisWeekCommits, data.lastWeekCommits);
  const monthChange = changeIndicator(data.thisMonthCommits, data.lastMonthCommits);
  const weekArrow = weekChange.className === "up" ? "↑" : weekChange.className === "down" ? "↓" : "";
  const monthArrow = monthChange.className === "up" ? "↑" : monthChange.className === "down" ? "↓" : "";

  return (
    <div className="trend-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4><TrendingUp size={14} /> 趋势对比</h4>
        <div className="trend-granularity">
          <button
            type="button"
            className={granularity === "weekly" ? "active" : ""}
            onClick={() => onGranularityChange("weekly")}
          >
            按周
          </button>
          <button
            type="button"
            className={granularity === "monthly" ? "active" : ""}
            onClick={() => onGranularityChange("monthly")}
          >
            按月
          </button>
        </div>
      </div>

      <TrendChart periods={data.periods} />

      <div className="trend-cards">
        <div className="trend-card">
          <span className="trend-card-label">本周 vs 上周</span>
          <span className="trend-card-value">
            {data.thisWeekCommits}
            <span className={`trend-change ${weekChange.className}`}>
              {weekArrow} {weekChange.label}
            </span>
          </span>
        </div>
        <div className="trend-card">
          <span className="trend-card-label">本月 vs 上月</span>
          <span className="trend-card-value">
            {data.thisMonthCommits}
            <span className={`trend-change ${monthChange.className}`}>
              {monthArrow} {monthChange.label}
            </span>
          </span>
        </div>
      </div>

      {data.projectShares.length > 0 && (
        <ProjectShareBar shares={data.projectShares} />
      )}
    </div>
  );
}

function TrendChart({ periods }: { periods: TrendPeriod[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (periods.length === 0) return null;

  const values = periods.map((p) => p.commits);
  const maxVal = Math.max(...values, 1);
  const padding = { top: 10, right: 12, bottom: 4, left: 12 };
  const chartWidth = 320;
  const chartHeight = 80;
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const points = values.map((v, i) => {
    const x = padding.left + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW);
    const y = padding.top + innerH - (v / maxVal) * innerH;
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${points[0].x},${padding.top + innerH} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${padding.top + innerH} Z`;

  const labelStep = periods.length <= 6 ? 1 : periods.length <= 12 ? 2 : 3;
  const xLabels = periods.map((p, i) => (i % labelStep === 0 || i === periods.length - 1 ? p.label : ""));

  return (
    <div className="trend-chart-section">
      <h4><BarChart3 size={14} /> 提交趋势</h4>
      <div className="trend-chart-wrap">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              className="trend-grid-line"
              x1={padding.left}
              y1={padding.top + innerH * (1 - ratio)}
              x2={padding.left + innerW}
              y2={padding.top + innerH * (1 - ratio)}
            />
          ))}
          <polygon className="trend-area" points={areaPath.replace(/[MLZ]/g, (m) => m === "Z" ? "" : "").trim()} />
          <path className="trend-area" d={areaPath} />
          <polyline className="trend-line" points={polyline} />
          {points.map((p, i) => (
            <circle
              key={i}
              className="trend-dot"
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : 3}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>
        {hoveredIndex !== null && (
          <div
            className="trend-tooltip"
            style={{
              left: `${(points[hoveredIndex].x / chartWidth) * 100}%`,
              top: `${(points[hoveredIndex].y / chartHeight) * 100}%`,
            }}
          >
            <strong>{periods[hoveredIndex].label}</strong>
            {periods[hoveredIndex].commits} 次提交 | +{periods[hoveredIndex].additions} -{periods[hoveredIndex].deletions}
          </div>
        )}
      </div>
      <div className="trend-x-labels">
        {xLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function ProjectShareBar({ shares }: { shares: TrendProjectShare[] }) {
  const totalCommits = shares.reduce((sum, s) => sum + s.commits, 0);
  if (totalCommits === 0) return null;

  const topShares = shares.slice(0, PROJECT_COLORS.length);

  return (
    <div className="trend-project-section">
      <h4><BarChart3 size={14} /> 项目投入分布</h4>
      <div className="trend-share-stack">
        {topShares.map((share, i) => (
          <span
            key={share.project}
            style={{
              width: `${(share.commits / totalCommits) * 100}%`,
              background: PROJECT_COLORS[i % PROJECT_COLORS.length],
            }}
            title={`${share.project}: ${share.commits} 次提交 (${Math.round((share.commits / totalCommits) * 100)}%)`}
          />
        ))}
      </div>
      <div className="trend-project-legend">
        {topShares.map((share, i) => (
          <span key={share.project} className="trend-project-legend-item">
            <span className="legend-dot" style={{ background: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
            {share.project}
            <span className="legend-pct">{Math.round((share.commits / totalCommits) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
