import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, TrendingDown, Activity, Sun, Wallet,
  Plus, FileBarChart2, Download, Save, Receipt, CheckCircle2, Clock,
  Sparkles, Home,
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

      {/* Solar KPI row - only if user is tracking solar */}
      {kpis.solar?.has_solar && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          data-testid="solar-kpi-grid"
        >
          <KpiCard
            testId="kpi-todays-solar"
            label="Today's Solar"
            value={fmtUnits(kpis.solar.todays_solar)}
            icon={Sun}
            tone="credit"
            subtitle="Inverter generation"
            loading={loading}
          />
          <KpiCard
            testId="kpi-todays-self"
            label="Self Consumption"
            value={fmtUnits(kpis.solar.todays_self_consumption)}
            icon={Sparkles}
            tone="net"
            subtitle="Solar used at home today"
            loading={loading}
          />
          <KpiCard
            testId="kpi-todays-house"
            label="Today's House Use"
            value={fmtUnits(kpis.solar.todays_house_consumption)}
            icon={Home}
            tone="purple"
            subtitle="Self + grid import"
            loading={loading}
          />
          <KpiCard
            testId="kpi-total-solar"
            label="Total Solar"
            value={fmtUnits(kpis.solar.total_solar)}
            icon={Sun}
            tone="credit"
            subtitle={`Across ${kpis.solar.tracked_days} days`}
            loading={loading}
          />
        </div>
      )}

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
                View All Readings â
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
              <SummaryRow label="Monthly Savings" value={`â¹ ${fmtUnits(kpis.estimated_monthly_savings)}`} tone="purple" />
            </div>
          </div>

          {/* Billing status */}
          {kpis.billing?.current && (
            <BillingStatusCard billing={kpis.billing} onOpen={() => nav("/billing")} />
          )}

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

const BillingStatusCard = ({ billing, onOpen }) => {
  const c = billing.current;
  const last = billing.last_closed;
  const overdue = c.days_elapsed > c.cycle_target_days;
  const progressPct = Math.min(100, Math.round((c.days_elapsed / c.cycle_target_days) * 100));

  const statusText = overdue ? "Overdue" : "Open";
  const statusClasses = overdue
    ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300"
    : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
      data-testid="billing-status-card"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
            <Receipt size={18} className="text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Current Bill
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusClasses}`}
          data-testid="dashboard-billing-status-pill"
        >
          {overdue ? <Clock size={12} /> : <CheckCircle2 size={12} />}
          {statusText}
        </span>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Since {fmtDate(c.start_date)} · Day {c.days_elapsed} of ~{c.cycle_target_days}
      </div>

      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-4">
        <div
          className={`h-full ${overdue ? "bg-rose-500" : "bg-gradient-to-r from-emerald-500 to-blue-500"}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <MiniStat label="Export" value={fmtUnits(c.total_export)} tone="emerald" />
        <MiniStat label="Import" value={fmtUnits(c.total_import)} tone="rose" />
        <MiniStat label="Net" value={fmtUnits(c.net_credit)} tone="blue" />
      </div>

      {last && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3 mb-3">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Previous Bill · Closed
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-200">{fmtDate(last.end_date)}</span>
            <span className={`font-bold mono ${last.closing_credit >= 0 ? "text-blue-600" : "text-rose-500"}`}>
              {fmtUnits(last.closing_credit)} Units
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 transition-colors"
        data-testid="dashboard-billing-open-btn"
      >
        <Receipt size={14} /> Manage Billing
      </button>
    </div>
  );
};

const MiniStat = ({ label, value, tone }) => {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-500",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 px-2 py-2 text-center">
      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold mono ${tones[tone]}`}>{value}</div>
    </div>
  );
};

export default Dashboard;

