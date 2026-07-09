import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, TrendingDown, Activity, Sun, Wallet,
  Plus, FileBarChart2, Download, Save,
} from "lucide-react";
import { http } from "@/lib/api";
import { fmtUnits, fmtSigned, fmtDate } from "@/lib/format";
import KpiCard from "@/components/KpiCard";
import ReadingForm from "@/components/ReadingForm";
import CreditTrendChart from "@/components/CreditTrendChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const Dashboard = () => {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/dashboard");
      setData(r.data);
    } catch (e) {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const deleteReading = async (id) => {
    if (!window.confirm("Delete this reading? This cannot be undone.")) return;
    try {
      await http.delete(`/readings/${id}`);
      toast.success("Reading deleted");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const kpis = data || {};

  return (
    <div className="space-y-6">
      {/* KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="kpi-grid">
        <KpiCard
          testId="kpi-current-credit"
          label="Current Credit"
          value={fmtUnits(kpis.current_credit)}
          icon={Zap}
          tone="credit"
          subtitle="Export - Import"
          valueColor={
            (kpis.current_credit || 0) >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-500"
          }
          loading={loading}
        />
        <KpiCard
          testId="kpi-total-export"
          label="Total Export"
          value={fmtUnits(kpis.total_export)}
          icon={TrendingUp}
          tone="export"
          subtitle="All time"
          loading={loading}
        />
        <KpiCard
          testId="kpi-total-import"
          label="Total Import"
          value={fmtUnits(kpis.total_import)}
          icon={TrendingDown}
          tone="import"
          subtitle="All time"
          loading={loading}
        />
        <KpiCard
          testId="kpi-todays-export"
          label="Today's Export"
          value={fmtUnits(kpis.todays_export)}
          icon={Sun}
          tone="export"
          subtitle={kpis.latest ? fmtDate(kpis.latest.date) : "-"}
          loading={loading}
        />
        <KpiCard
          testId="kpi-todays-import"
          label="Today's Import"
          value={fmtUnits(kpis.todays_import)}
          icon={TrendingDown}
          tone="import"
          subtitle={kpis.latest ? fmtDate(kpis.latest.date) : "-"}
          loading={loading}
        />
        <KpiCard
          testId="kpi-net-today"
          label="Net Today"
          value={fmtSigned(kpis.net_today)}
          icon={Activity}
          tone="net"
          subtitle={kpis.latest ? fmtDate(kpis.latest.date) : "-"}
          valueColor={
            (kpis.net_today || 0) >= 0
              ? "text-blue-600 dark:text-blue-400"
              : "text-rose-500"
          }
          loading={loading}
        />
      </div>

      {/* MAIN SPLIT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <ReadingForm onSaved={() => setRefreshKey((k) => k + 1)} />

          {/* Recent readings */}
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
            data-testid="recent-readings-card"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Recent Readings
              </h3>
              <Button
                variant="ghost"
                className="text-blue-600 hover:text-blue-700"
                onClick={() => nav("/history")}
                data-testid="view-all-readings-btn"
              >
                View All Readings →
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (kpis.recent || []).length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400">
                No readings yet. Add your first reading above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-3 pr-3">Date</th>
                      <th className="py-3 pr-3">Prev Exp</th>
                      <th className="py-3 pr-3">Curr Exp</th>
                      <th className="py-3 pr-3">Exp Used</th>
                      <th className="py-3 pr-3">Prev Imp</th>
                      <th className="py-3 pr-3">Curr Imp</th>
                      <th className="py-3 pr-3">Imp Used</th>
                      <th className="py-3 pr-3">Net</th>
                      <th className="py-3 pr-3">Credit</th>
                      <th className="py-3 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpis.recent || []).map((r) => (
                      <tr
                        key={r.id}
                        className="border-b last:border-0 border-slate-50 dark:border-slate-800/50"
                        data-testid={`recent-row-${r.id}`}
                      >
                        <td className="py-3 pr-3 font-medium">{fmtDate(r.date)}</td>
                        <td className="py-3 pr-3 mono text-slate-600 dark:text-slate-300">{fmtUnits(r.previous_export)}</td>
                        <td className="py-3 pr-3 mono text-slate-600 dark:text-slate-300">{fmtUnits(r.current_export)}</td>
                        <td className="py-3 pr-3 mono text-emerald-600 dark:text-emerald-400 font-semibold">{fmtUnits(r.export_unit)}</td>
                        <td className="py-3 pr-3 mono text-slate-600 dark:text-slate-300">{fmtUnits(r.previous_import)}</td>
                        <td className="py-3 pr-3 mono text-slate-600 dark:text-slate-300">{fmtUnits(r.current_import)}</td>
                        <td className="py-3 pr-3 mono text-rose-500 font-semibold">{fmtUnits(r.import_unit)}</td>
                        <td className={`py-3 pr-3 mono font-semibold ${r.net_today >= 0 ? "text-blue-600" : "text-rose-500"}`}>{fmtSigned(r.net_today)}</td>
                        <td className="py-3 pr-3 mono font-semibold text-amber-600">{fmtUnits(r.credit_unit)}</td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => nav("/history")}
                              className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 flex items-center justify-center"
                              data-testid={`edit-btn-${r.id}`}
                              aria-label="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteReading(r.id)}
                              className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-500 flex items-center justify-center"
                              data-testid={`delete-btn-${r.id}`}
                              aria-label="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
            data-testid="credit-trend-card"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Credit Trend
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last 30 days
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <Activity size={18} className="text-blue-500" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <CreditTrendChart trend={kpis.trend || []} />
            )}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Avg Daily Export</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mono">
                  {fmtUnits(kpis.avg_daily_export)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Avg Daily Import</div>
                <div className="text-lg font-bold text-rose-500 mono">
                  {fmtUnits(kpis.avg_daily_import)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Avg Daily Net</div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mono">
                  {fmtSigned(kpis.avg_daily_net)}
                </div>
              </div>
            </div>
          </div>

          {/* Today's summary */}
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
            data-testid="today-summary-card"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Today&apos;s Summary
            </h3>
            <div className="space-y-3">
              <SummaryRow label="Today's Export" value={`${fmtUnits(kpis.todays_export)} Units`} tone="export" />
              <SummaryRow label="Today's Import" value={`${fmtUnits(kpis.todays_import)} Units`} tone="import" />
              <SummaryRow label="Net Today" value={`${fmtSigned(kpis.net_today)} Units`} tone="net" />
              <SummaryRow label="Credit After Entry" value={`${fmtUnits(kpis.current_credit)} Units`} tone="credit" />
              <SummaryRow label="Monthly Savings" value={`₹ ${fmtUnits(kpis.estimated_monthly_savings)}`} tone="purple" />
            </div>
          </div>

          {/* Quick actions */}
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
            data-testid="quick-actions-card"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <QuickBtn icon={Plus} label="Add New Reading" onClick={() => nav("/new")} testId="qa-new-reading" tone="blue" />
              <QuickBtn icon={FileBarChart2} label="Monthly Report" onClick={() => nav("/reports")} testId="qa-monthly-report" tone="violet" />
              <QuickBtn icon={Download} label="Export Data" onClick={() => nav("/backup")} testId="qa-export" tone="emerald" />
              <QuickBtn icon={Save} label="Backup Now" onClick={() => nav("/backup")} testId="qa-backup" tone="amber" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SummaryRow = ({ label, value, tone }) => {
  const colors = {
    export: "text-emerald-600 dark:text-emerald-400",
    import: "text-rose-500",
    net: "text-blue-600 dark:text-blue-400",
    credit: "text-amber-600 dark:text-amber-400",
    purple: "text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 border-slate-100 dark:border-slate-800">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`text-sm font-bold ${colors[tone] || ""} mono`}>{value}</span>
    </div>
  );
};

const QuickBtn = ({ icon: Icon, label, onClick, tone, testId }) => {
  const tones = {
    blue: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600",
    violet: "bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 text-violet-600",
    emerald: "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600",
    amber: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-600",
  };
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98] ${tones[tone]}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
};

export default Dashboard;
