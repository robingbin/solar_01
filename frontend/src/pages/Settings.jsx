import { useEffect, useState } from "react";
import { http } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Save } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "owner_name", label: "Owner Name" },
  { key: "consumer_number", label: "Consumer Number" },
  { key: "service_number", label: "EB Service Number" },
  { key: "solar_capacity", label: "Solar Capacity" },
  { key: "meter_number", label: "Meter Number" },
  { key: "installation_date", label: "Installation Date", type: "date" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone Number" },
  { key: "email", label: "Email", type: "email" },
  { key: "currency", label: "Currency" },
  { key: "measurement_unit", label: "Measurement Unit" },
  { key: "tariff_rate", label: "Tariff Rate (per unit)", type: "number" },
];

const Settings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    http.get("/settings").then((r) => { setSettings(r.data); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await http.put("/settings", settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6" data-testid="settings-page">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Owner & System</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{f.label}</label>
              <Input
                type={f.type || "text"}
                value={settings[f.key] ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    [f.key]: f.type === "number" ? parseFloat(e.target.value || "0") : e.target.value,
                  }))
                }
                className="mt-1 h-11"
                data-testid={`settings-${f.key}-input`}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={save}
            disabled={saving}
            data-testid="settings-save-btn"
          >
            <Save size={16} /> Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
