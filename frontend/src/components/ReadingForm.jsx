import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, RefreshCw, Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { http } from "@/lib/api";
import { fmtUnits, todayISO } from "@/lib/format";

const parseISO = (s) => {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
};
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const ReadingForm = ({ onSaved, editing }) => {
  const [date, setDate] = useState(editing?.date || todayISO());
  const [currentExport, setCurrentExport] = useState(
    editing ? String(editing.current_export) : "",
  );
  const [currentImport, setCurrentImport] = useState(
    editing ? String(editing.current_import) : "",
  );
  const [notes, setNotes] = useState(editing?.notes || "");
  const [prev, setPrev] = useState(null);
  const [needsInit, setNeedsInit] = useState(false);
  const [initExport, setInitExport] = useState("");
  const [initImport, setInitImport] = useState("");
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (editing) {
      setPrev({
        previous_export: editing.previous_export,
        previous_import: editing.previous_import,
      });
      setNeedsInit(false);
      return;
    }
    http.get("/readings/latest").then((r) => {
      const latest = r.data.reading;
      if (latest) {
        setPrev({
          previous_export: latest.current_export,
          previous_import: latest.current_import,
        });
        setNeedsInit(false);
      } else {
        setPrev(null);
        setNeedsInit(true);
      }
    });
  }, [editing]);

  const eNum = parseFloat(currentExport);
  const iNum = parseFloat(currentImport);
  const prevE = prev?.previous_export ?? parseFloat(initExport) ?? 0;
  const prevI = prev?.previous_import ?? parseFloat(initImport) ?? 0;

  const todaysExport =
    !Number.isNaN(eNum) && !Number.isNaN(prevE) ? eNum - prevE : null;
  const todaysImport =
    !Number.isNaN(iNum) && !Number.isNaN(prevI) ? iNum - prevI : null;

  const invalid =
    Number.isNaN(eNum) ||
    Number.isNaN(iNum) ||
    (todaysExport !== null && todaysExport < 0) ||
    (todaysImport !== null && todaysImport < 0) ||
    (needsInit && (!initExport || !initImport));

  const handleReset = () => {
    setCurrentExport(editing ? String(editing.current_export) : "");
    setCurrentImport(editing ? String(editing.current_import) : "");
    setNotes(editing?.notes || "");
    if (!editing) setDate(todayISO());
  };

  const handleSave = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      const payload = {
        date,
        current_export: eNum,
        current_import: iNum,
        notes,
      };
      if (needsInit) {
        payload.initial_export = parseFloat(initExport);
        payload.initial_import = parseFloat(initImport);
      }
      if (editing) {
        await http.put(`/readings/${editing.id}`, payload);
        toast.success("Reading updated");
      } else {
        await http.post("/readings", payload);
        toast.success("Reading saved");
        handleReset();
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save reading");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800"
      data-testid="reading-form"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
            <CalendarIcon size={18} className="text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {editing ? "Edit Reading" : "Add New Reading"}
          </h2>
        </div>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-10 gap-2 font-medium"
              data-testid="reading-date-btn"
            >
              <CalendarIcon size={16} />
              {date}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={parseISO(date)}
              onSelect={(d) => {
                if (d) {
                  setDate(toISO(d));
                  setCalendarOpen(false);
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {needsInit && (
        <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4">
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">
            First-time setup
          </div>
          <div className="text-xs text-amber-700/80 dark:text-amber-200/80 mb-3">
            No previous reading found. Enter your initial meter values so we can start
            tracking daily deltas.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Initial Export Reading
              </label>
              <Input
                type="number"
                step="0.01"
                value={initExport}
                onChange={(e) => setInitExport(e.target.value)}
                placeholder="0.00"
                className="mt-1 h-11"
                data-testid="reading-initial-export-input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Initial Import Reading
              </label>
              <Input
                type="number"
                step="0.01"
                value={initImport}
                onChange={(e) => setInitImport(e.target.value)}
                placeholder="0.00"
                className="mt-1 h-11"
                data-testid="reading-initial-import-input"
              />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-500/5 border border-emerald-200/60 dark:border-emerald-500/20 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Last Export Unit
            </label>
            <Input
              type="text"
              value={prev ? fmtUnits(prev.previous_export) : initExport}
              readOnly
              className="mt-1 h-11 bg-white dark:bg-slate-800 font-semibold mono"
              data-testid="reading-prev-export"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Today Export Unit
            </label>
            <Input
              type="number"
              step="0.01"
              value={currentExport}
              onChange={(e) => setCurrentExport(e.target.value)}
              placeholder="0.00"
              className="mt-1 h-11"
              data-testid="reading-current-export-input"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            Today&apos;s Export
          </span>
          <span
            className={`font-bold ${
              todaysExport !== null && todaysExport < 0
                ? "text-rose-500"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
            data-testid="reading-todays-export-value"
          >
            {todaysExport !== null ? `${fmtUnits(todaysExport)} Units` : "-"}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-rose-50/60 dark:bg-rose-500/5 border border-rose-200/60 dark:border-rose-500/20 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Last Import Unit
            </label>
            <Input
              type="text"
              value={prev ? fmtUnits(prev.previous_import) : initImport}
              readOnly
              className="mt-1 h-11 bg-white dark:bg-slate-800 font-semibold mono"
              data-testid="reading-prev-import"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Today Import Unit
            </label>
            <Input
              type="number"
              step="0.01"
              value={currentImport}
              onChange={(e) => setCurrentImport(e.target.value)}
              placeholder="0.00"
              className="mt-1 h-11"
              data-testid="reading-current-import-input"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="font-semibold text-rose-700 dark:text-rose-300">
            Today&apos;s Import
          </span>
          <span
            className={`font-bold ${
              todaysImport !== null && todaysImport < 0
                ? "text-rose-500"
                : "text-rose-700 dark:text-rose-300"
            }`}
            data-testid="reading-todays-import-value"
          >
            {todaysImport !== null ? `${fmtUnits(todaysImport)} Units` : "-"}
          </span>
        </div>
      </div>

      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Notes (optional)
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter notes here..."
          rows={2}
          className="mt-1"
          data-testid="reading-notes-input"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleReset}
          data-testid="reading-reset-btn"
        >
          <RefreshCw size={16} /> Reset
        </Button>
        <Button
          variant="secondary"
          className="gap-2 bg-blue-500 hover:bg-blue-600 text-white"
          onClick={() => toast.info("Calculations update automatically as you type")}
          data-testid="reading-calculate-btn"
        >
          <Calculator size={16} /> Calculate
        </Button>
        <Button
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={invalid || saving}
          onClick={handleSave}
          data-testid="reading-save-btn"
        >
          <Save size={16} /> {editing ? "Update Reading" : "Save Reading"}
        </Button>
      </div>
    </div>
  );
};

export default ReadingForm;
