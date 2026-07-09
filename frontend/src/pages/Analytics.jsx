import { useEffect, useMemo, useState } from "react";
import { http } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler, ArcElement,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import { useTheme } from "@/context/ThemeContext";
import { fmtUnits } from "@/lib/format";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler, ArcElement,
);

const Analytics = () => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http.get("/analytics").then((r) => { setData(r.data); setLoading(false); });
  }, []);

  const commonOptions = useMemo(() => {
    const gridColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.2)";
    const tickColor = isDark ? "#94a3b8" : "#64748b";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: tickColor,
            font: { family: "Plus Jakarta Sans", weight: "600" },
            usePointStyle: true,
            boxWidth: 8,
            padding: 14,
          },
        },
        tooltip: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          titleColor: isDark ? "#f1f5f9" : "#0f172a",
          bodyColor: isDark ? "#cbd5e1" : "#334155",
          borderColor: isDark ? "#1e293b" : "#e2e8f0",
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, font: { family: "Plus Jakarta Sans" } } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { family: "Plus Jakarta Sans" } } },
      },
    };
  }, [isDark]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96" />)}
      </div>
    );
  }

  const dailyLabels = data.daily.map((d) => d.date.slice(5));
  const monthlyLabels = data.monthly.map((m) => m.month);

  const totalExport = data.daily.reduce((s, d) => s + d.export, 0);
  const totalImport = data.daily.reduce((s, d) => s + d.import, 0);

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Daily Export vs Import" subtitle="Last known daily deltas" testId="chart-daily-bar">
          <Bar
            data={{
              labels: dailyLabels,
              datasets: [
                { label: "Export", data: data.daily.map((d) => d.export), backgroundColor: "#10b981", borderRadius: 4 },
                { label: "Import", data: data.daily.map((d) => d.import), backgroundColor: "#ef4444", borderRadius: 4 },
              ],
            }}
            options={commonOptions}
          />
        </ChartCard>

        <ChartCard title="Running Credit (Area)" subtitle="Growth of your accumulated credit" testId="chart-credit-area">
          <Line
            data={{
              labels: dailyLabels,
              datasets: [{
                label: "Credit Units",
                data: data.daily.map((d) => d.credit),
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,0.15)",
                fill: true,
                tension: 0.4,
                pointRadius: 2,
              }],
            }}
            options={commonOptions}
          />
        </ChartCard>

        <ChartCard title="Monthly Totals" subtitle="Export & import by month" testId="chart-monthly-bar">
          <Bar
            data={{
              labels: monthlyLabels,
              datasets: [
                { label: "Export", data: data.monthly.map((m) => m.export), backgroundColor: "#10b981", borderRadius: 4 },
                { label: "Import", data: data.monthly.map((m) => m.import), backgroundColor: "#ef4444", borderRadius: 4 },
              ],
            }}
            options={commonOptions}
          />
        </ChartCard>

        <ChartCard title="Export vs Import Share" subtitle="All-time distribution" testId="chart-pie">
          <div className="max-w-[280px] mx-auto h-full flex items-center">
            <Pie
              data={{
                labels: ["Export", "Import"],
                datasets: [{
                  data: [totalExport, totalImport],
                  backgroundColor: ["#10b981", "#ef4444"],
                  borderWidth: 0,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { color: isDark ? "#cbd5e1" : "#334155", font: { family: "Plus Jakarta Sans" } } },
                },
              }}
            />
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Total Export" value={fmtUnits(totalExport)} tone="emerald" />
        <MiniStat label="Total Import" value={fmtUnits(totalImport)} tone="rose" />
        <MiniStat label="Net Credit" value={fmtUnits(totalExport - totalImport)} tone="blue" />
        <MiniStat label="Entries" value={String(data.daily.length)} tone="slate" />
      </div>
    </div>
  );
};

const ChartCard = ({ title, subtitle, children, testId }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800" data-testid={testId}>
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
    <div className="h-[320px]">{children}</div>
  </div>
);

const MiniStat = ({ label, value, tone }) => {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-500",
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-slate-900 dark:text-white",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 card-shadow border border-slate-100 dark:border-slate-800">
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">{label}</div>
      <div className={`text-2xl font-bold mono ${tones[tone]}`}>{value}</div>
    </div>
  );
};

export default Analytics;
