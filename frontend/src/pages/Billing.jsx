import { useEffect, useState } from "react";
import { http } from "@/lib/api";
import { fmtUnits, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Receipt, CheckCircle2, Clock, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { todayISO } from "@/lib/format";

const Billing = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeDate, setCloseDate] = useState(todayISO());
  const [closeNotes, setCloseNotes] = useState("");
  const [closing, setClosing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/billing");
      setData(r.data);
    } catch {
      toast.error("Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const closeBill = async () => {
    setClosing(true);
    try {
      await http.post("/billing/close", { end_date: closeDate, notes: closeNotes });
      toast.success("Bill closed. New cycle started.");
      setCloseOpen(false);
      setCloseNotes("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to close bill");
    } finally {
      setClosing(false);
    }
  };

  const deleteCycle = async (id) => {
    try {
      await http.delete(`/billing/cycles/${id}`);
      toast.success("Cycle deleted");
      load();
    } catch {
      toast.error("Failed to delete cycle");
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4" data-testid="billing-page">
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const c = data.current;
  const progressPct = Math.min(100, Math.round((c.days_elapsed / c.cycle_target_days) * 100));
  const overdue = c.days_elapsed > c.cycle_target_days;

  return (
    <div className="space-y-6" data-testid="billing-page">
      {/* Current cycle card */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
        data-testid="current-cycle-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Receipt size={22} className="text-blue-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Current Billing Cycle
                </h2>
                <StatusPill closed={false} overdue={overdue} />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Started {fmtDate(c.start_date)} · Bimonthly (~60 days)
              </p>
            </div>
          </div>

          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => setCloseOpen(true)}
              data-testid="open-close-bill-btn"
            >
              <CheckCircle2 size={16} /> Close Bill
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Close current bill</DialogTitle>
                <DialogDescription>
                  Snapshot the current cycle&apos;s totals. A new cycle will start the day after the end date.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    End date
                  </label>
                  <Input
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                    className="mt-1 h-11"
                    data-testid="close-bill-date-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Notes (optional)
                  </label>
                  <Textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    rows={2}
                    placeholder="Bill number, amount paid..."
                    className="mt-1"
                    data-testid="close-bill-notes-input"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCloseOpen(false)} data-testid="close-bill-cancel-btn">
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={closeBill}
                  disabled={closing}
                  data-testid="close-bill-confirm-btn"
                >
                  Close &amp; Start New Cycle
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Day {c.days_elapsed} of ~{c.cycle_target_days}</span>
            <span>{overdue ? `${c.days_elapsed - c.cycle_target_days} days overdue` : `${c.days_remaining} days remaining`}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overdue ? "bg-rose-500" : "bg-gradient-to-r from-emerald-500 to-blue-500"
              }`}
              style={{ width: `${progressPct}%` }}
              data-testid="cycle-progress-bar"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBlock label="Export in Cycle" value={fmtUnits(c.total_export)} tone="emerald" testId="cycle-stat-export" />
          <StatBlock label="Import in Cycle" value={fmtUnits(c.total_import)} tone="rose" testId="cycle-stat-import" />
          <StatBlock label="Net Credit" value={fmtUnits(c.net_credit)} tone="blue" testId="cycle-stat-net" />
          <StatBlock label="Entries" value={String(c.entries)} tone="slate" testId="cycle-stat-entries" />
        </div>
      </div>

      {/* Past cycles */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
        data-testid="past-cycles-card"
      >
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Past Bills
          </h3>
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
            ({data.past.length})
          </span>
        </div>

        {data.past.length === 0 ? (
          <div className="py-8 text-center text-slate-500 dark:text-slate-400">
            No past bills yet. Close a cycle to see it appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 pr-3">Cycle</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Export</th>
                  <th className="py-3 pr-3">Import</th>
                  <th className="py-3 pr-3">Credit</th>
                  <th className="py-3 pr-3">Notes</th>
                  <th className="py-3 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.past.map((cycle) => (
                  <tr key={cycle.id} className="border-b last:border-0 border-slate-50 dark:border-slate-800/50" data-testid={`past-cycle-row-${cycle.id}`}>
                    <td className="py-3 pr-3 font-medium">
                      {fmtDate(cycle.start_date)} → {fmtDate(cycle.end_date)}
                    </td>
                    <td className="py-3 pr-3"><StatusPill closed /></td>
                    <td className="py-3 pr-3 mono text-emerald-600 font-semibold">{fmtUnits(cycle.closing_export)}</td>
                    <td className="py-3 pr-3 mono text-rose-500 font-semibold">{fmtUnits(cycle.closing_import)}</td>
                    <td className={`py-3 pr-3 mono font-semibold ${cycle.closing_credit >= 0 ? "text-blue-600" : "text-rose-500"}`}>{fmtUnits(cycle.closing_credit)}</td>
                    <td className="py-3 pr-3 max-w-[200px] truncate" title={cycle.notes}>{cycle.notes || "-"}</td>
                    <td className="py-3 pr-3">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-500 flex items-center justify-center"
                            data-testid={`delete-cycle-btn-${cycle.id}`}
                            aria-label="Delete cycle"
                          >
                            <Trash2 size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this billing cycle?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The underlying readings will remain untouched. This just removes the bill record.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCycle(cycle.id)}
                              className="bg-rose-600 hover:bg-rose-700"
                              data-testid={`confirm-delete-cycle-btn-${cycle.id}`}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusPill = ({ closed, overdue }) => {
  if (closed) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
        data-testid="status-pill-closed"
      >
        <CheckCircle2 size={12} /> Closed
      </span>
    );
  }
  if (overdue) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300"
        data-testid="status-pill-overdue"
      >
        <Clock size={12} /> Overdue
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
      data-testid="status-pill-open"
    >
      <Clock size={12} /> Open
    </span>
  );
};

const StatBlock = ({ label, value, tone, testId }) => {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-500",
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-slate-900 dark:text-white",
  };
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4" data-testid={testId}>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold mono ${tones[tone]}`}>{value}</div>
    </div>
  );
};

export default Billing;
