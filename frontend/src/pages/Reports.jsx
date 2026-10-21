import { useEffect, useState } from "react";
import { http } from "@/lib/api";
import { fmtUnits, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Sheet as SheetIcon, FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  v: i + 1,
  label: new Date(2020, i, 1).toLocaleString("en", { month: "long" }),
}));

const Reports = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/reports/monthly", { params: { month, year } });
      setReport(r.data);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month, year]);

  const monthLabel = MONTHS[month - 1].label;
  const title = `${monthLabel} ${year} Solar Report`;

  const exportCSV = () => {
    if (!report?.entries?.length) return;
    const header = [
      "Date", "Prev Export", "Curr Export", "Export Unit",
      "Prev Import", "Curr Import", "Import Unit",
      "Net Today", "Credit After Entry", "Notes",
    ];
    const rows = report.entries.map((r) => [
      r.date, r.previous_export, r.current_export, r.export_unit,
      r.previous_import, r.current_import, r.import_unit,
      r.net_today, r.credit_unit, (r.notes || "").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solar-report-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const exportExcel = () => {
    if (!report?.entries?.length) return;
    const rows = report.entries.map((r) => ({
      Date: r.date,
      "Prev Export": r.previous_export,
      "Curr Export": r.current_export,
      "Export Unit": r.export_unit,
      "Prev Import": r.previous_import,
      "Curr Import": r.current_import,
      "Import Unit": r.import_unit,
      "Net Today": r.net_today,
      "Credit After Entry": r.credit_unit,
      Notes: r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthLabel} ${year}`);
    XLSX.writeFile(wb, `solar-report-${year}-${String(month).padStart(2, "0")}.xlsx`);
    toast.success("Excel downloaded");
  };

  const exportPDF = () => {
    if (!report?.entries?.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Total Export: ${fmtUnits(report.total_export)}   Total Import: ${fmtUnits(report.total_import)}   Net Credit: ${fmtUnits(report.net_credit)}`,
      14, 24,
    );
    autoTable(doc, {
      startY: 30,
      head: [[
        "Date", "Prev Exp", "Curr Exp", "Exp Unit",
        "Prev Imp", "Curr Imp", "Imp Unit",
        "Net", "Credit", "Notes",
      ]],
      body: report.entries.map((r) => [
        r.date, r.previous_export, r.current_export, r.export_unit,
        r.previous_import, r.current_import, r.import_unit,
        r.net_today, r.credit_unit, r.notes || "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`solar-report-${year}-${String(month).padStart(2, "0")}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 card-shadow border border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-44 h-11" data-testid="report-month-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.v} value={String(m.v)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32 h-11" data-testid="report-year-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportPDF} className="gap-2" data-testid="report-export-pdf-btn">
          <FileText size={16} /> PDF
        </Button>
        <Button variant="outline" onClick={exportExcel} className="gap-2" data-testid="report-export-excel-btn">
          <SheetIcon size={16} /> Excel
        </Button>
        <Button variant="outline" onClick={exportCSV} className="gap-2" data-testid="report-export-csv-btn">
          <FileDown size={16} /> CSV
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="report-print-btn">
          <Printer size={16} /> Print
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Export" value={fmtUnits(report.total_export)} tone="emerald" testId="stat-total-export" />
            <StatCard label="Total Import" value={fmtUnits(report.total_import)} tone="rose" testId="stat-total-import" />
            <StatCard label="Net Credit" value={fmtUnits(report.net_credit)} tone={report.net_credit >= 0 ? "blue" : "rose"} testId="stat-net-credit" />
            <StatCard label="Entries" value={String(report.count)} tone="slate" testId="stat-entries" />
            <StatCard label="Avg Daily Export" value={fmtUnits(report.avg_daily_export)} tone="emerald" testId="stat-avg-export" />
            <StatCard label="Avg Daily Import" value={fmtUnits(report.avg_daily_import)} tone="rose" testId="stat-avg-import" />
            <StatCard
              label="Highest Export Day"
              value={
                report.highest_export_day
                  ? `${fmtUnits(report.highest_export_day.value)} · ${fmtDate(report.highest_export_day.date)}`
                  : "-"
              }
              tone="emerald"
              small
              testId="stat-hi-export"
            />
            <StatCard
              label="Highest Import Day"
              value={
                report.highest_import_day
                  ? `${fmtUnits(report.highest_import_day.value)} · ${fmtDate(report.highest_import_day.date)}`
                  : "-"
              }
              tone="rose"
              small
              testId="stat-hi-import"
            />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 card-shadow border border-slate-100 dark:border-slate-800 overflow-x-auto" data-testid="report-table-card">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
            {report.entries.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400">No entries for this month.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3 pr-3">Date</th>
                    <th className="py-3 pr-3">Export Unit</th>
                    <th className="py-3 pr-3">Import Unit</th>
                    <th className="py-3 pr-3">Net</th>
                    <th className="py-3 pr-3">Credit</th>
                    <th className="py-3 pr-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 border-slate-50 dark:border-slate-800/50">
                      <td className="py-3 pr-3 font-medium">{fmtDate(r.date)}</td>
                      <td className="py-3 pr-3 mono text-emerald-600">{fmtUnits(r.export_unit)}</td>
                      <td className="py-3 pr-3 mono text-rose-500">{fmtUnits(r.import_unit)}</td>
                      <td className={`py-3 pr-3 mono font-semibold ${r.net_today >= 0 ? "text-blue-600" : "text-rose-500"}`}>{fmtUnits(r.net_today)}</td>
                      <td className="py-3 pr-3 mono font-semibold text-amber-600">{fmtUnits(r.credit_unit)}</td>
                      <td className="py-3 pr-3">{r.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, tone, small, testId }) => {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-500",
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-slate-900 dark:text-white",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 card-shadow border border-slate-100 dark:border-slate-800" data-testid={testId}>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">{label}</div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-bold mono ${tones[tone] || ""}`}>{value}</div>
    </div>
  );
};

export default Reports;
