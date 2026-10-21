import { useEffect, useMemo, useState } from "react";
import { http } from "@/lib/api";
import { fmtUnits, fmtSigned, fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { toast } from "sonner";
import ReadingForm from "@/components/ReadingForm";

const MONTHS = [
  { v: 0, label: "All months" },
  ...Array.from({ length: 12 }, (_, i) => ({
    v: i + 1,
    label: new Date(2020, i, 1).toLocaleString("en", { month: "long" }),
  })),
];

const History = () => {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(0);
  const [year, setYear] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("desc");
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const limit = 10;

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [{ v: 0, label: "All years" }, ...Array.from({ length: 6 }, (_, i) => ({ v: y - i, label: String(y - i) }))];
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit, sort, order };
      if (search) params.search = search;
      if (month) params.month = month;
      if (year) params.year = year;
      const r = await http.get("/readings", { params });
      setData(r.data);
    } catch (e) {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, month, year, sort, order]);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this reading?")) return;
    try {
      await http.delete(`/readings/${id}`);
      toast.success("Reading deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  const toggleSort = (col) => {
    if (sort === col) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(col);
      setOrder("desc");
    }
  };

  return (
    <div className="space-y-4" data-testid="history-page">
      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 card-shadow border border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
            placeholder="Search by date or notes..."
            className="pl-9 h-11"
            data-testid="history-search-input"
          />
        </div>
        <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[calc(50%-0.375rem)] sm:w-40 h-11" data-testid="history-month-filter">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.v} value={String(m.v)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[calc(50%-0.375rem)] sm:w-32 h-11" data-testid="history-year-filter">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y.v} value={String(y.v)}>{y.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => { setPage(1); load(); }} data-testid="history-apply-filter-btn">Apply</Button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 card-shadow border border-slate-100 dark:border-slate-800 overflow-x-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400">
            No readings match your filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <Th onClick={() => toggleSort("date")} active={sort === "date"} order={order}>Date</Th>
                <th className="py-3 pr-3">Prev Exp</th>
                <th className="py-3 pr-3">Curr Exp</th>
                <th className="py-3 pr-3">Exp Unit</th>
                <th className="py-3 pr-3">Prev Imp</th>
                <th className="py-3 pr-3">Curr Imp</th>
                <th className="py-3 pr-3">Imp Unit</th>
                <th className="py-3 pr-3">Net</th>
                <th className="py-3 pr-3">Credit</th>
                <th className="py-3 pr-3">Notes</th>
                <th className="py-3 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b last:border-0 border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/40" data-testid={`history-row-${r.id}`}>
                  <td className="py-3 pr-3 font-medium">{fmtDate(r.date)}</td>
                  <td className="py-3 pr-3 mono">{fmtUnits(r.previous_export)}</td>
                  <td className="py-3 pr-3 mono">{fmtUnits(r.current_export)}</td>
                  <td className="py-3 pr-3 mono text-emerald-600 dark:text-emerald-400 font-semibold">{fmtUnits(r.export_unit)}</td>
                  <td className="py-3 pr-3 mono">{fmtUnits(r.previous_import)}</td>
                  <td className="py-3 pr-3 mono">{fmtUnits(r.current_import)}</td>
                  <td className="py-3 pr-3 mono text-rose-500 font-semibold">{fmtUnits(r.import_unit)}</td>
                  <td className={`py-3 pr-3 mono font-semibold ${r.net_today >= 0 ? "text-blue-600" : "text-rose-500"}`}>{fmtSigned(r.net_today)}</td>
                  <td className="py-3 pr-3 mono font-semibold text-amber-600">{fmtUnits(r.credit_unit)}</td>
                  <td className="py-3 pr-3 max-w-[160px] truncate" title={r.notes}>{r.notes || "-"}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <IconBtn onClick={() => setViewing(r)} tone="slate" testId={`view-btn-${r.id}`} label="View"><Eye size={14} /></IconBtn>
                      <IconBtn onClick={() => setEditing(r)} tone="blue" testId={`history-edit-btn-${r.id}`} label="Edit"><Pencil size={14} /></IconBtn>
                      <IconBtn onClick={() => onDelete(r.id)} tone="rose" testId={`history-delete-btn-${r.id}`} label="Delete"><Trash2 size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-slate-500 dark:text-slate-400">
            {data.total} total · Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="history-prev-page-btn">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="history-next-page-btn">
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reading Detail</DialogTitle>
            <DialogDescription>Full breakdown of the selected reading.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Date" value={fmtDate(viewing.date)} />
              <Detail label="Notes" value={viewing.notes || "-"} />
              <Detail label="Previous Export" value={fmtUnits(viewing.previous_export)} />
              <Detail label="Current Export" value={fmtUnits(viewing.current_export)} />
              <Detail label="Export Unit" value={fmtUnits(viewing.export_unit)} tone="emerald" />
              <Detail label="Previous Import" value={fmtUnits(viewing.previous_import)} />
              <Detail label="Current Import" value={fmtUnits(viewing.current_import)} />
              <Detail label="Import Unit" value={fmtUnits(viewing.import_unit)} tone="rose" />
              <Detail label="Net Today" value={fmtSigned(viewing.net_today)} />
              <Detail label="Credit After Entry" value={fmtUnits(viewing.credit_unit)} tone="amber" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Reading</DialogTitle>
            <DialogDescription>Update the meter values below. Running totals recompute automatically.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ReadingForm
              editing={editing}
              onSaved={() => { setEditing(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Th = ({ onClick, active, order, children }) => (
  <th onClick={onClick} className={`py-3 pr-3 cursor-pointer select-none ${active ? "text-blue-600" : ""}`}>
    {children} {active ? (order === "asc" ? "↑" : "↓") : ""}
  </th>
);

const IconBtn = ({ children, onClick, tone, testId, label }) => {
  const tones = {
    slate: "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200",
    blue: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600",
    rose: "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-500",
  };
  return (
    <button onClick={onClick} data-testid={testId} aria-label={label} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
};

const Detail = ({ label, value, tone }) => {
  const tones = { emerald: "text-emerald-600", rose: "text-rose-500", amber: "text-amber-600" };
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-bold mt-1 mono ${tones[tone] || "text-slate-900 dark:text-white"}`}>{value}</div>
    </div>
  );
};

export default History;
