import { useEffect, useMemo, useState } from "react";
import { http } from "@/lib/api";
import { fmtUnits } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import KpiCard from "@/components/KpiCard";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler, ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Home, Zap, TrendingUp, Sparkles } from "lucide-react";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler, ArcElement,
);

const Solar = () => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http
      .get("/solar")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  const chartOptions = useMemo(() => {
    const grid = isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.2)";
    const tick = isDark ? "#94a3b8" : "#64748b";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: tick,
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
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: tick, font: { family: "Plus Jakarta Sans", size: 11 } },
        },
        y: {
          stacked: true,
          grid: { color: grid },
          ticks: { color: tick, font: { family: "Plus Jakarta Sans", size: 11 } },
        },
      },
    };
  }, [isDark]);

  if (loading || !data) {
    return (
      <div className="space-y-4" data-testid="solar-page">
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data.has_solar) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16" data-testid="solar-empty-state">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 items-center justify-center mb-4">
          <Sun size={32} className="text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Start tracking your solar inverter
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
          Enter your inverter&apos;s total production reading on the Add Reading page. Once you log
          your first inverter value, this page will show how much of that generation goes to the
          grid versus how much stays home.
        </p>
      </div>
    );
  }

  const dailyLabels = data.daily.map((d) => d.date.slice(5));

  return (
    <div className="space-y-6" data-testid="solar-page">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          testId="solar-kpi-total"
          label="Total Solar Generation"
          value={fmtUnits(data.total_solar)}
          icon={Sun}
          tone="credit"
          subtitle={`Across ${data.tracked_days} days`}
        />
        <KpiCard
          testId="solar-kpi-grid-export"
          label="Sent to Grid"
          value={fmtUnits(data.total_grid_export)}
          icon={TrendingUp}
          tone="export"
          subtitle={`${data.grid_export_pct}% of generation`}
        />
        <KpiCard
          testId="solar-kpi-self"
          label="Self Consumption"
          value={fmtUnits(data.total_self_consumption)}
          icon={Sparkles}
          tone="net"
          subtitle={`${data.self_consumption_pct}% of generation`}
        />
        <KpiCard
          testId="solar-kpi-house"
          label="Total House Use"
          value={fmtUnits(data.total_house_consumption)}
          icon={Home}
          tone="purple"
          subtitle="Self + grid import"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
          data-testid="solar-daily-chart-card"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Daily Solar Breakdown
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stacked: how much of each day&apos;s generation was exported vs used at home
            </p>
          </div>
          <div className="h-[340px]">
            <Bar
              data={{
                labels: dailyLabels,
                datasets: [
                  {
                    label: "Exported to Grid",
                    data: data.daily.map((d) => d.grid_export),
                    backgroundColor: "#10b981",
                    borderRadius: 3,
                    stack: "solar",
                  },
                  {
                    label: "Self Consumed",
                    data: data.daily.map((d) => d.self_consumption),
                    backgroundColor: "#3b82f6",
                    borderRadius: 3,
                    stack: "solar",
                  },
                  {
                    label: "Grid Import",
                    data: data.daily.map((d) => d.grid_import),
                    backgroundColor: "#ef4444",
                    borderRadius: 3,
                    stack: "house",
                  },
                ],
              }}
              options={chartOptions}
            />
          </div>
        </div>

        <div
          className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
          data-testid="solar-share-chart-card"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Generation Split
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              How your total solar was used
            </p>
          </div>
          <div className="h-[280px] flex items-center justify-center">
            <Doughnut
              data={{
                labels: ["Sent to Grid", "Self Consumption"],
                datasets: [
                  {
                    data: [data.total_grid_export, data.total_self_consumption],
                    backgroundColor: ["#10b981", "#3b82f6"],
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: {
                      color: isDark ? "#cbd5e1" : "#334155",
                      font: { family: "Plus Jakarta Sans", weight: "600" },
                      usePointStyle: true,
                      padding: 12,
                    },
                  },
                },
              }}
            />
          </div>
          <div className="text-center mt-2">
            <div className="text-3xl font-bold text-slate-900 dark:text-white mono">
              {fmtUnits(data.avg_daily_solar)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Avg. daily generation
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800 overflow-x-auto"
        data-testid="solar-daily-table-card"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Daily Solar Log
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="py-3 pr-3">Date</th>
              <th className="py-3 pr-3">Solar Generated</th>
              <th className="py-3 pr-3">Sent to Grid</th>
              <th className="py-3 pr-3">Self Used</th>
              <th className="py-3 pr-3">Grid Import</th>
              <th className="py-3 pr-3">House Consumption</th>
            </tr>
          </thead>
          <tbody>
            {data.daily
              .slice()
              .reverse()
              .map((d) => (
                <tr key={d.date} className="border-b last:border-0 border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 pr-3 font-medium">{d.date}</td>
                  <td className="py-3 pr-3 mono text-amber-600 font-semibold">{fmtUnits(d.solar)}</td>
                  <td className="py-3 pr-3 mono text-emerald-600 font-semibold">{fmtUnits(d.grid_export)}</td>
                  <td className="py-3 pr-3 mono text-blue-600 font-semibold">{fmtUnits(d.self_consumption)}</td>
                  <td className="py-3 pr-3 mono text-rose-500 font-semibold">{fmtUnits(d.grid_import)}</td>
                  <td className="py-3 pr-3 mono font-semibold text-slate-900 dark:text-white">{fmtUnits(d.house_consumption)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Solar;
