import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  TrendingUp,
  AlertCircle,
  Globe,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Menu,
  X,
  Radio,
  WifiOff,
  AlertTriangle,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useBuoy } from "@/lib/useBuoy";
import { formatAge } from "@/lib/sensors";

// Overall hardware state → indicator styling (sidebar badge + header pill)
const HEALTH_TONE = {
  WORKING: {
    label: "LIVE",
    pillText: "Station online",
    dot: "bg-safe",
    badge: "bg-safe/10 text-safe",
    pill: "bg-safe/10 border-safe/30 text-safe",
  },
  FAULTY: {
    label: "FAULTY",
    pillText: "Sensor needs attention",
    dot: "bg-caution",
    badge: "bg-caution/10 text-caution",
    pill: "bg-caution/10 border-caution/30 text-caution",
  },
  OFFLINE: {
    label: "OFFLINE",
    pillText: "Station offline",
    dot: "bg-danger",
    badge: "bg-danger/10 text-danger",
    pill: "bg-danger/10 border-danger/30 text-danger",
  },
  CONNECTING: {
    label: "…",
    pillText: "Connecting…",
    dot: "bg-muted-foreground",
    badge: "bg-secondary text-muted-foreground",
    pill: "bg-secondary/60 border-border text-muted-foreground",
  },
};

const PROBE_TONE = {
  WORKING: { label: "Working", text: "text-safe", dot: "bg-safe" },
  FAULTY: { label: "Faulty", text: "text-caution", dot: "bg-caution" },
  OFFLINE: { label: "Offline", text: "text-danger", dot: "bg-danger" },
};

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userRole, userProfile, logout } = useAuth();

  const buoy = useBuoy();
  const lastPacketLabel = buoy.lastPacketAt ? formatAge(buoy.ageMs) : "never";
  const sensorHealth = {
    state: buoy.hardware,
    probes: buoy.probes,
    message:
      buoy.connection === "connecting"
        ? "Connecting to monitoring station…"
        : buoy.connection === "error"
          ? "Cannot load station data"
          : buoy.connection === "empty"
            ? "Waiting for the first reading"
            : buoy.connection === "offline"
              ? `${buoy.databaseConnected === false ? "Database disconnected" : "No fresh station reading"} · last update ${lastPacketLabel}`
              : buoy.faultyCount > 0
                ? `${buoy.workingCount} of ${buoy.probes.length} probes working · ${buoy.faultyCount} faulty`
                : `All ${buoy.probes.length} probes working · ${lastPacketLabel}`,
  };

  // ⌨️ Keyboard Shortcut Navigation (D=Dashboard, T=Trends, A=Alerts, E=Environment)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "select" ||
        tag === "textarea" ||
        e.target?.isContentEditable
      ) {
        return;
      }
      if (e.defaultPrevented || e.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const k = e.key.toLowerCase();
      const route = { d: "/dashboard", t: "/trends", a: "/alerts", e: "/environment" }[k];
      if (route) {
        e.preventDefault();
        navigate(route);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const baseNav = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/trends", label: "Reading history", icon: TrendingUp },
    { path: "/alerts", label: "Alert Logs", icon: AlertCircle },
    { path: "/environment", label: "Local weather", icon: Globe },
  ];

  const navItems =
    userRole === "admin"
      ? [
          ...baseNav,
          { path: "/admin", label: "Ranger accounts", icon: ShieldCheck },
        ]
      : baseNav;

  const isActive = (path) => location.pathname === path;

  const displayName = userProfile?.displayName || currentUser?.email || "User";
  const displayEmail = currentUser?.email || "";
  const initial = displayName.charAt(0).toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("bd_sidebar_collapsed") === "true";
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    const dismiss = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSidebarOpen(false);
        setShowLogoutModal(false);
      }
    };
    const outside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("bd_sidebar_collapsed", String(next));
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const sidebarContent = (
    <>
      <div className="p-4 flex items-center justify-between border-b border-border h-16 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/bantay-dagat.png"
            alt="BantayDagat Logo"
            className="w-7 h-7 object-contain shrink-0"
          />
          <div className={`overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
            <span className="font-header font-bold text-foreground text-sm tracking-tight block leading-none">
              BantayDagat
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              Ranger workspace
            </span>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
          className="lg:hidden p-1 rounded-md hover:bg-secondary text-muted-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto overflow-x-hidden">
        <div>
          <div className={`px-3 py-1 text-xs font-bold uppercase tracking-[1.2px] text-muted-foreground overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
            Monitoring
          </div>
          <div className="mt-1 space-y-1">
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex items-center h-11 px-3 rounded-xl transition-colors text-sm ${
                    active
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-foreground hover:bg-muted/70 font-medium"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-r-md" />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`ml-2.5 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap truncate ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {userRole === "admin" && (
          <div>
            <div className={`px-3 py-1 text-xs font-bold uppercase tracking-[1.2px] text-muted-foreground overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
              Administration
            </div>
            <div className="mt-1 space-y-1">
              {navItems.slice(4).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                  aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center h-11 px-3 rounded-xl transition-colors text-sm ${
                      active
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-foreground hover:bg-muted/70 font-medium"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-r-md" />
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`ml-2.5 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap truncate ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Station healthlist Box */}
        <div className="mt-4 overflow-hidden transition-all duration-300">
          {!collapsed ? (
            <div
              className="p-3 rounded-xl bg-muted border border-border text-xs animate-in fade-in duration-200"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-xs">
                  Station health
                </span>
                <span
                  className={`flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded ${HEALTH_TONE[sensorHealth.state].badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_TONE[sensorHealth.state].dot} ${sensorHealth.state === "WORKING" ? "animate-pulse" : ""}`} />
                  {HEALTH_TONE[sensorHealth.state].label}
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-1 font-medium leading-snug">
                {sensorHealth.message}
              </p>

              {/* Individual Probe Breakdown List — water probes drive GO/NO-GO */}
              <div className="mt-2.5 pt-2 border-t border-border space-y-1.5">
                {["water", "environment"].map((group) => (
                  <div key={group} className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                      {group === "water" ? "Water · decision" : "Environment · context"}
                    </p>
                    {sensorHealth.probes
                      .filter((p) => p.type === group)
                      .map((probe) => {
                        const tone = PROBE_TONE[probe.state] ?? PROBE_TONE.OFFLINE;
                        return (
                          <div
                            key={probe.key}
                            className="flex items-center justify-between text-xs"
                            title={probe.reason || undefined}
                          >
                            <span className="text-foreground font-medium">{probe.label}</span>
                            <span className={`flex items-center gap-1 text-xs font-bold ${tone.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                              {tone.label}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-2">
              <span
                title={`Hardware: ${HEALTH_TONE[sensorHealth.state].label} — ${sensorHealth.message}`}
                className={`w-3 h-3 rounded-full ${HEALTH_TONE[sensorHealth.state].dot}`}
              />
            </div>
          )}
        </div>
      </nav>

      {/* User & Role footer */}
      <div className="px-3 py-2 border-t border-border overflow-hidden">
        <div
          title={collapsed ? (userRole === "admin" ? "Administrator" : "Ranger On Duty") : undefined}
          className={`flex items-center h-9 px-3 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors ${
            userRole === "admin"
              ? "bg-primary text-white shadow-2xs"
              : "bg-muted border border-border text-primary"
          }`}
        >
          <ShieldCheck
            className={`w-3.5 h-3.5 shrink-0 ${
              userRole === "admin" ? "text-[#fbbf24]" : "text-primary"
            }`}
          />
          <span className={`ml-2 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
            {userRole === "admin" ? "Administrator" : "Ranger On Duty"}
          </span>
        </div>
      </div>

      <div className="p-3 border-t border-border overflow-hidden">
        <button
          onClick={() => setShowLogoutModal(true)}
          title={collapsed ? "Log Out" : undefined}
          className="flex items-center h-9 px-3 w-full rounded-lg text-foreground hover:bg-secondary transition-colors font-medium text-xs"
        >
          <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className={`ml-2.5 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
            Log Out
          </span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background font-body">
      {/* Desktop Sidebar — collapsible */}
      <aside
        className={`hidden lg:flex ${
          collapsed ? "w-16" : "w-64"
        } transition-[width] duration-300 ease-in-out border-r border-border bg-card flex-col shrink-0 overflow-hidden`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-800/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Slide-out panel (single X button handled in sidebarContent) */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border bg-card h-16 flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Mobile hamburger & Desktop collapse button */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex items-center justify-center p-1.5 rounded-lg border border-border bg-muted text-foreground hover:bg-secondary transition-colors shadow-2xs"
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-primary" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-primary" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-header font-bold text-foreground truncate">
                BantayDagat
              </h1>
            </div>

            {/* Dynamic Sea Signal Light */}
            <div
              role="status"
              title={sensorHealth.message}
              className={`flex items-center gap-2 px-2 sm:px-2.5 py-1 rounded-full border text-xs font-bold ${HEALTH_TONE[sensorHealth.state].pill}`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                {(sensorHealth.state === "WORKING" || sensorHealth.state === "FAULTY") && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${HEALTH_TONE[sensorHealth.state].dot}`} />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${HEALTH_TONE[sensorHealth.state].dot}`} />
              </span>
              <span className="inline whitespace-nowrap">
                {HEALTH_TONE[sensorHealth.state].pillText}
                {sensorHealth.state === "OFFLINE" && buoy.lastPacketAt && (
                  <span className="hidden md:inline font-medium opacity-80"> · {lastPacketLabel}</span>
                )}
              </span>
            </div>

            {/* Quick Hotkey Guide */}
            <details className="relative hidden xl:block text-xs">
              <summary className="cursor-pointer font-semibold text-muted-foreground">Keyboard shortcuts</summary>
              <div className="absolute top-full left-0 z-20 mt-2 flex items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
              <kbd className="px-1.5 py-0.5 bg-card border border-border rounded shadow-2xs font-mono font-bold text-foreground">D</kbd> Dashboard
              <kbd className="px-1.5 py-0.5 bg-card border border-border rounded shadow-2xs font-mono font-bold text-foreground">T</kbd> Trends
              <kbd className="px-1.5 py-0.5 bg-card border border-border rounded shadow-2xs font-mono font-bold text-foreground">A</kbd> Alerts
              <kbd className="px-1.5 py-0.5 bg-card border border-border rounded shadow-2xs font-mono font-bold text-foreground">E</kbd> Weather
              </div>
            </details>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">

            {/* User dropdown */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-header font-bold text-xs">
                  {initial}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-semibold text-foreground leading-none">
                    {displayName}
                  </p>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-xl border border-border bg-card shadow-xl py-1 z-50">
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                    Role:{" "}
                    <span className="font-bold ml-1 capitalize text-foreground">{userRole}</span>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowLogoutModal(true);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-background px-4 py-6 sm:px-8 lg:py-8"><div className="workspace-content mx-auto max-w-[1440px]">{children}</div></main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-800/40 backdrop-blur-sm"
            onClick={() => setShowLogoutModal(false)}
          />
          <div role="dialog" aria-modal="true" aria-label="Confirm Logout" className="bg-card rounded-xl border border-border shadow-2xl w-full max-w-sm mx-4 p-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4 text-danger" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Confirm Logout
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
              Are you sure you want to log out of your BantayDagat account? You will need to sign in again to access live telemetry.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
                <button
                  onClick={() => {
                    setShowLogoutModal(false);
                    logout();
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-danger text-white hover:bg-danger/90 transition-colors"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
