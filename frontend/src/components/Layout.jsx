import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  PlusSquare,
  History,
  FileBarChart2,
  BarChart3,
  Receipt,
  Sun as SunIcon,
  Settings as SettingsIcon,
  DatabaseBackup,
  Info,
  Sun,
  Moon,
  Menu,
  User,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/context/ThemeContext";
import { http } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/new", label: "Add Reading", icon: PlusSquare, testid: "nav-new-reading" },
  { to: "/history", label: "History", icon: History, testid: "nav-history" },
  { to: "/reports", label: "Monthly Report", icon: FileBarChart2, testid: "nav-reports" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, testid: "nav-analytics" },
  { to: "/solar", label: "Solar", icon: SunIcon, testid: "nav-solar" },
  { to: "/billing", label: "Billing", icon: Receipt, testid: "nav-billing" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings" },
  { to: "/backup", label: "Backup / Restore", icon: DatabaseBackup, testid: "nav-backup" },
  { to: "/about", label: "About", icon: Info, testid: "nav-about" },
];

const PAGE_META = {
  "/": { title: "Dashboard", sub: "Overview of your solar import/export and credit units" },
  "/new": { title: "Add Reading", sub: "Record today's solar meter readings" },
  "/history": { title: "History", sub: "All past readings with search and filters" },
  "/reports": { title: "Monthly Report", sub: "Detailed monthly breakdown & exports" },
  "/analytics": { title: "Analytics", sub: "Visual insight into your solar performance" },
  "/solar": { title: "Solar", sub: "Inverter generation vs. grid export vs. self use" },
  "/billing": { title: "Billing", sub: "Bimonthly cycle status & closed bills" },
  "/settings": { title: "Settings", sub: "Owner, meter and preferences" },
  "/backup": { title: "Backup & Restore", sub: "Export, import, seed, wipe" },
  "/about": { title: "About", sub: "Solar Credit Tracker" },
};

const Layout = () => {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const [collapsed, setCollapsed] = useState(false); // desktop: icon-only sidebar
  const [mobileOpen, setMobileOpen] = useState(false); // mobile: slide-in drawer

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const handleMenuClick = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  };

  useEffect(() => {
    let alive = true;
    http
      .get("/settings")
      .then((r) => alive && setSettings(r.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const meta = PAGE_META[location.pathname] || { title: "Solar Credit Tracker", sub: "" };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        data-testid="sidebar-backdrop"
      />

      {/* Sidebar: off-canvas drawer on mobile, static on lg+ */}
      <aside
        className={`sidebar-grad fixed inset-y-0 left-0 z-50 w-64 ${
          collapsed ? "lg:w-20" : "lg:w-64"
        } lg:static lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } flex-shrink-0 text-white flex flex-col transition-all duration-300 pt-[env(safe-area-inset-top)]`}
        data-testid="app-sidebar"
      >
        <div className="flex items-center gap-3 h-20 px-5 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Sun size={22} className="text-white" strokeWidth={2.5} />
          </div>
          {(
            <div className={collapsed ? "lg:hidden" : ""}>
              <div className="font-bold text-[15px] leading-none tracking-tight">Solar Credit</div>
              <div className="text-[13px] text-slate-300/80 leading-tight">Tracker</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overscroll-contain">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                    isActive
                      ? "nav-active"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <Icon size={18} strokeWidth={2} />
                <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {settings && (
          <div className={`${collapsed ? "lg:hidden" : ""} m-3 rounded-2xl bg-white/5 border border-white/10 p-4 text-slate-200 text-[13px]`}>
            <div className="flex items-center gap-2 mb-3 text-amber-300">
              <Info size={14} />
              <span className="font-semibold">System Info</span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">
                  Solar Capacity
                </div>
                <div className="font-semibold text-white">{settings.solar_capacity || "-"}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">
                  Installation Date
                </div>
                <div className="font-semibold text-white">
                  {settings.installation_date || "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">
                  Consumer Number
                </div>
                <div className="font-semibold text-white">
                  {settings.consumer_number || "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">
                  Last Updated
                </div>
                <div className="font-semibold text-white">
                  {fmtDateTime(settings.updated_at)}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col h-[100dvh] overflow-hidden">
        {/* Header */}
        <header
          className="relative min-h-[64px] sm:h-20 flex items-center justify-between gap-2 px-3 sm:px-6 pt-[env(safe-area-inset-top)] header-grad grain border-b border-slate-200 dark:border-slate-800 z-30"
          data-testid="app-header"
        >
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={handleMenuClick}
              className="w-10 h-10 flex-shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 transition-colors"
              data-testid="sidebar-toggle-btn"
              aria-label="Toggle sidebar"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl md:text-3xl truncate font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                {meta.title}
              </h1>
              <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">{meta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={toggle}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 transition-colors"
              data-testid="theme-toggle-btn"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div
              className="hidden md:flex items-center gap-2 pl-3 pr-4 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70"
              data-testid="header-user"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                <User size={14} />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {settings?.owner_name || "User"}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] fade-in">
          <Outlet />
          <footer className="mt-10 pb-2 text-center text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Solar Credit Tracker · Built for Synology &amp; the sun
          </footer>
        </main>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
};

export default Layout;
