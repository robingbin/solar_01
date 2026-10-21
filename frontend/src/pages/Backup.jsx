import { useRef, useState } from "react";
import { http } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, Upload, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Backup = () => {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const r = await http.get("/backup");
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `solar-credit-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup failed");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file) => {
    setBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const r = await http.post("/restore", json);
      toast.success(`Restored ${r.data.restored} readings`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Restore failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const seed = async () => {
    setBusy(true);
    try {
      const r = await http.post("/seed?days=30");
      toast.success(`Seeded ${r.data.count} sample readings`);
    } catch {
      toast.error("Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    setBusy(true);
    try {
      await http.delete("/wipe");
      toast.success("All readings wiped");
    } catch {
      toast.error("Wipe failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="backup-page">
      <ActionCard
        icon={Download}
        tone="blue"
        title="Download Backup"
        desc="Export all readings and settings as a JSON file. Store it anywhere safe."
        button="Download JSON"
        onClick={download}
        busy={busy}
        testId="backup-download-btn"
      />

      <ActionCard
        icon={Upload}
        tone="violet"
        title="Restore Backup"
        desc="Replace current data with the contents of a previously downloaded JSON backup."
        button="Choose Backup File"
        onClick={() => fileRef.current?.click()}
        busy={busy}
        testId="backup-restore-btn"
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          data-testid="backup-restore-file-input"
        />
      </ActionCard>

      <ActionCard
        icon={Sparkles}
        tone="amber"
        title="Seed Sample Data"
        desc="Generate 30 days of realistic sample readings. Great for demos or getting familiar with the app."
        button="Seed 30 Days"
        onClick={seed}
        busy={busy}
        testId="backup-seed-btn"
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 card-shadow border border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
            <Trash2 size={22} className="text-rose-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Wipe All Data</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Permanently deletes every reading. Settings are preserved.
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full gap-2"
              disabled={busy}
              data-testid="backup-wipe-btn"
            >
              <Trash2 size={16} /> Wipe All Readings
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete every reading in the database. Make sure you have a backup first — this cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="wipe-cancel-btn">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={wipe}
                className="bg-rose-600 hover:bg-rose-700"
                data-testid="wipe-confirm-btn"
              >
                Yes, wipe everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

const ActionCard = ({ icon: Icon, tone, title, desc, button, onClick, busy, testId, children }) => {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-500",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-500",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-500",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 card-shadow border border-slate-100 dark:border-slate-800">
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          <Icon size={22} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{desc}</p>
        </div>
      </div>
      <Button
        className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 text-white"
        onClick={onClick}
        disabled={busy}
        data-testid={testId}
      >
        {button}
      </Button>
      {children}
    </div>
  );
};

export default Backup;
