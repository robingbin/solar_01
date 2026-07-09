import { Sun, Github, Cpu, ShieldCheck } from "lucide-react";

const About = () => {
  return (
    <div className="max-w-3xl space-y-6" data-testid="about-page">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 card-shadow border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Sun size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Solar Credit Tracker</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manually record TNEB solar meter readings, automate the math.
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Solar Credit Tracker is a lightweight full-stack app that turns your daily meter reading into a
          crystal-clear picture of your rooftop solar performance. It computes daily deltas, running totals,
          monthly credit and estimated savings — automatically — and gives you the ability to back up, restore,
          and export in a click.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Feature icon={Cpu} tone="blue" title="React + FastAPI" desc="React 19, TailwindCSS, shadcn/ui + FastAPI, MongoDB backend." />
        <Feature icon={ShieldCheck} tone="emerald" title="Local-first" desc="Runs great on Synology NAS. No cloud lock-in." />
        <Feature icon={Github} tone="violet" title="Extensible" desc="Schema designed for ESP32, MQTT, WhatsApp, Telegram integrations." />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 card-shadow border border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Version</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">v1.0.0 · Built for the sun ☀️</p>
      </div>
    </div>
  );
};

const Feature = ({ icon: Icon, tone, title, desc }) => {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-500",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-500",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 card-shadow border border-slate-100 dark:border-slate-800">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tones[tone]}`}>
        <Icon size={20} />
      </div>
      <div className="font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{desc}</div>
    </div>
  );
};

export default About;
