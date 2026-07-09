import { Skeleton } from "@/components/ui/skeleton";

const TONE = {
  credit: {
    bg: "bg-amber-50 dark:bg-amber-500/10",
    iconColor: "text-amber-500 dark:text-amber-400",
  },
  export: {
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    iconColor: "text-emerald-500 dark:text-emerald-400",
  },
  import: {
    bg: "bg-rose-50 dark:bg-rose-500/10",
    iconColor: "text-rose-500 dark:text-rose-400",
  },
  net: {
    bg: "bg-blue-50 dark:bg-blue-500/10",
    iconColor: "text-blue-500 dark:text-blue-400",
  },
  neutral: {
    bg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-600 dark:text-slate-300",
  },
  purple: {
    bg: "bg-violet-50 dark:bg-violet-500/10",
    iconColor: "text-violet-500 dark:text-violet-400",
  },
};

const KpiCard = ({
  label,
  value,
  unit = "Units",
  icon: Icon,
  tone = "neutral",
  subtitle,
  valueColor,
  loading,
  testId,
}) => {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl p-5 card-shadow border border-slate-100 dark:border-slate-800 hover-lift"
      data-testid={testId}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </div>
        {Icon && (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${t.bg}`}
          >
            <Icon size={18} className={t.iconColor} strokeWidth={2.2} />
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-9 w-28" />
      ) : (
        <div className="flex items-baseline gap-2">
          <div
            className={`text-3xl md:text-[32px] font-bold tracking-tight leading-none ${
              valueColor || "text-slate-900 dark:text-white"
            }`}
          >
            {value}
          </div>
          {unit && (
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {unit}
            </div>
          )}
        </div>
      )}

      {subtitle && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default KpiCard;
