export const fmtUnits = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0.00";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const fmtSigned = (n) => {
  if (n === null || n === undefined) return "0.00";
  const v = Number(n);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const fmtDate = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

export const fmtDateTime = (iso) => {
  if (!iso) return "-";
  const dt = new Date(iso);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = MONTHS[dt.getMonth()];
  const y = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${d} ${m} ${y} ${hh}:${mm}`;
};

export const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
