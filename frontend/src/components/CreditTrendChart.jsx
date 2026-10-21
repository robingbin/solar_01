import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { useTheme } from "@/context/ThemeContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const CreditTrendChart = ({ trend = [] }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const data = useMemo(() => {
    const labels = trend.map((t) => {
      const [, m, d] = t.date.split("-");
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      return `${d} ${months[parseInt(m, 10) - 1]}`;
    });
    return {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Export Units",
          data: trend.map((t) => t.export_unit),
          backgroundColor: "#10b981",
          borderRadius: 4,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "Import Units",
          data: trend.map((t) => t.import_unit),
          backgroundColor: "#ef4444",
          borderRadius: 4,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Credit Units",
          data: trend.map((t) => t.credit_unit),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: "#2563eb",
          tension: 0.35,
          fill: true,
          yAxisID: "y1",
        },
      ],
    };
  }, [trend]);

  const options = useMemo(() => {
    const gridColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.2)";
    const tickColor = isDark ? "#94a3b8" : "#64748b";
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            color: tickColor,
            font: { family: "Plus Jakarta Sans", size: 12, weight: "600" },
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          titleColor: isDark ? "#f1f5f9" : "#0f172a",
          bodyColor: isDark ? "#cbd5e1" : "#334155",
          borderColor: isDark ? "#1e293b" : "#e2e8f0",
          borderWidth: 1,
          padding: 12,
          titleFont: { family: "Plus Jakarta Sans", weight: "700" },
          bodyFont: { family: "Plus Jakarta Sans" },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "Plus Jakarta Sans", size: 11 },
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
        y: {
          position: "left",
          beginAtZero: true,
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: tickColor,
            font: { family: "Plus Jakarta Sans", size: 11 },
          },
          title: {
            display: true,
            text: "Units",
            color: tickColor,
            font: { family: "Plus Jakarta Sans", size: 11, weight: "600" },
          },
        },
        y1: {
          position: "right",
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "Plus Jakarta Sans", size: 11 },
          },
        },
      },
    };
  }, [isDark]);

  return (
    <div className="w-full h-[240px] sm:h-[320px]" data-testid="credit-trend-chart">
      <Chart type="bar" data={data} options={options} />
    </div>
  );
};

export default CreditTrendChart;
