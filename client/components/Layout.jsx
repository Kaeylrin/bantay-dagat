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
import { db, ref, onValue, DB_PATHS, mapArduinoReading } from "@/lib/firebase";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userRole, userProfile, logout } = useAuth();

  const SENSOR_SPECS = [
    { key: "temperature", label: "Water Temp" },
    { key: "air_temperature", label: "Air Temp" },
    { key: "humidity", label: "Humidity" },
    { key: "ph", label: "pH Level" },
    { key: "turbidity", label: "Turbidity" },
  ];

  const [sensorHealth, setSensorHealth] = useState({
    state: "connecting",
    workingCount: 0,
    faultyCount: 0,
    total: 5,
    message: "Connecting hardware...",
    probes: [],
  });

  const [lastSignalPacket, setLastSignalPacket] = useState(Date.now());

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
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === "d") navigate("/dashboard");
      if (k === "t") navigate("/trends");
      if (k === "a") navigate("/alerts");
      if (k === "e") navigate("/environment");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  useEffect(() => {
    const latestRef = ref(db, DB_PATHS.LATEST);
    const unsub = onValue(
      latestRef,
      (snap) => {
        setLastSignalPacket(Date.now());
        const raw = snap.val();
        if (!raw) {
          setSensorHealth({
            state: "DISCONNECTED",
            workingCount: 0,
            faultyCount: 0,
            total: 5,
            message: "Buoy Disconnected",
            probes: SENSOR_SPECS.map((s) => ({ ...s, status: "DISCONNECTED" })),
          });
          return;
        }
        const mapped = mapArduinoReading(raw);
        const lastTs = mapped.timestamp ? new Date(mapped.timestamp).getTime() : 0;
        const isStale = !mapped.timestamp || (Date.now() - lastTs > 60000);

        const probes = SENSOR_SPECS.map((s) => {
          const val = mapped[s.key];
          const isFaulty = val === null || val === undefined || val === -999;
          return {
            key: s.key,
            label: s.label,
            value: val,
            status: isStale ? "DISCONNECTED" : isFaulty ? "FAULTY" : "WORKING",
          };
        });

        const workingCount = probes.filter((p) => p.status === "WORKING").length;
        const faultyCount = probes.filter((p) => p.status === "FAULTY").length;

        let overallState = "WORKING";
        if (isStale) {
          overallState = "DISCONNECTED";
        } else if (faultyCount > 0) {
          overallState = "FAULTY";
        }

        setSensorHealth({
          state: overallState,
          workingCount,
          faultyCount,
          total: 5,
          probes,
          message:
            overallState === "DISCONNECTED"
              ? "Hardware Buoy Offline (>60s)"
              : overallState === "FAULTY"
                ? `${workingCount} of 5 Working (${faultyCount} Faulty)`
                : "All 5 Probes Active & Working",
        });
      },
      () => {
        setSensorHealth({
          state: "DISCONNECTED",
          workingCount: 0,
          faultyCount: 0,
          total: 5,
          message: "Database Offline",
          probes: SENSOR_SPECS.map((s) => ({ ...s, status: "DISCONNECTED" })),
        });
      },
    );
    return () => unsub();
  }, []);

  const baseNav = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { path: "/trends", label: "Historical Trends", icon: TrendingUp },
    { path: "/alerts", label: "Alert Logs", icon: AlertCircle },
    { path: "/environment", label: "Environmental Data", icon: Globe },
  ];

  const navItems =
    userRole === "admin"
      ? [
          ...baseNav,
          { path: "/admin", label: "Admin Panel", icon: ShieldCheck },
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
      <div className="p-4 flex items-center justify-between border-b border-[#ddd4c4] h-14 overflow-hidden">
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
            <span className="text-[10px] text-muted-foreground font-medium">
              IoT Marine Monitor
            </span>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1 rounded-md hover:bg-secondary text-muted-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 p-2.5 space-y-4 overflow-y-auto overflow-x-hidden">
        <div>
          <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[1.2px] text-muted-foreground overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
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
                  title={collapsed ? item.label : undefined}
                  className={`relative flex items-center h-10 px-3 rounded-lg transition-colors text-xs ${
                    active
                      ? "bg-[#f5f0eb] border border-[#ddd4c4] text-[#1e3a8a] font-bold shadow-2xs"
                      : "text-[#1a1714] hover:bg-[#f5f0eb]/70 font-medium"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#1e3a8a] rounded-r-md" />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#1e3a8a]" : "text-[#7c7366]"}`} />
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
            <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[1.2px] text-muted-foreground overflow-hidden transition-all duration-300 whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
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
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center h-10 px-3 rounded-lg transition-colors text-xs ${
                      active
                        ? "bg-[#f5f0eb] border border-[#ddd4c4] text-[#1e3a8a] font-bold shadow-2xs"
                        : "text-[#1a1714] hover:bg-[#f5f0eb]/70 font-medium"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#1e3a8a] rounded-r-md" />
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#1e3a8a]" : "text-[#7c7366]"}`} />
                    <span className={`ml-2.5 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap truncate ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Ranger Duty Checklist Box */}
        <div className="mt-4 overflow-hidden transition-all duration-300">
          {!collapsed ? (
            <div className="p-3 rounded-[10px] bg-[#f5f0eb] border border-border text-xs animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-[11px]">
                  Ranger Duty Check
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    sensorHealth.state === "WORKING"
                      ? "bg-[#15803d]/10 text-[#15803d]"
                      : sensorHealth.state === "FAULTY"
                        ? "bg-[#b45309]/10 text-[#b45309]"
                        : "bg-[#9a3412]/10 text-[#9a3412]"
                  }`}
                >
                  {sensorHealth.state === "WORKING"
                    ? "Live"
                    : sensorHealth.state === "FAULTY"
                      ? "FAULTY"
                      : "OFFLINE"}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                {sensorHealth.message}
              </p>

              {/* Individual Probe Breakdown List */}
              <div className="mt-2.5 pt-2 border-t border-[#ddd4c4] space-y-1.5">
                {sensorHealth.probes.map((probe) => (
                  <div
                    key={probe.key}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="text-[#1a1714] font-medium">{probe.label}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        probe.status === "WORKING"
                          ? "text-[#15803d]"
                          : probe.status === "FAULTY"
                            ? "text-[#b45309]"
                            : "text-[#9a3412]"
                      }`}
                    >
                      {probe.status === "WORKING"
                        ? "Working"
                        : probe.status === "FAULTY"
                          ? "Faulty"
                          : "Offline"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-2">
              <span
                title={`Hardware Status: ${sensorHealth.state}`}
                className={`w-3 h-3 rounded-full ${
                  sensorHealth.state === "WORKING"
                    ? "bg-[#15803d]"
                    : sensorHealth.state === "FAULTY"
                      ? "bg-[#b45309]"
                      : "bg-[#9a3412]"
                }`}
              />
            </div>
          )}
        </div>
      </nav>

      {/* User & Role footer */}
      <div className="px-3 py-2 border-t border-[#ddd4c4] overflow-hidden">
        <div
          title={collapsed ? (userRole === "admin" ? "Administrator" : "Ranger On Duty") : undefined}
          className={`flex items-center h-9 px-3 rounded-lg text-[11px] font-bold tracking-wide uppercase transition-colors ${
            userRole === "admin"
              ? "bg-[#1e3a8a] text-white shadow-2xs"
              : "bg-[#f5f0eb] border border-[#ddd4c4] text-[#1e3a8a]"
          }`}
        >
          <ShieldCheck
            className={`w-3.5 h-3.5 shrink-0 ${
              userRole === "admin" ? "text-[#fbbf24]" : "text-[#1e3a8a]"
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
          collapsed ? "w-16" : "w-60"
        } transition-[width] duration-300 ease-in-out border-r border-border bg-[#fffaf2] flex-col shrink-0 overflow-hidden`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Slide-out panel (single X button handled in sidebarContent) */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#fffaf2] border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border bg-[#fffaf2] h-14 flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Mobile hamburger & Desktop collapse button */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex items-center justify-center p-1.5 rounded-lg border border-[#ddd4c4] bg-[#f5f0eb] text-[#1a1714] hover:bg-[#e8e0ce] transition-colors shadow-2xs"
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-[#1e3a8a]" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-[#1e3a8a]" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-header font-bold text-foreground truncate">
                BantayDagat
              </h1>
            </div>

            {/* Dynamic Sea Signal Light */}
            {sensorHealth.state === "DISCONNECTED" ? (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#9a3412]/10 border border-[#9a3412]/30 text-[#9a3412] text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#9a3412] shrink-0" />
                <span>Signal Disconnected</span>
              </div>
            ) : sensorHealth.state === "FAULTY" ? (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#b45309]/10 border border-[#b45309]/30 text-[#b45309] text-[11px] font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b45309] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#b45309]"></span>
                </span>
                <span>Sensor Probe Fault</span>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#15803d]/10 border border-[#15803d]/30 text-[#15803d] text-[11px] font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#15803d] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#15803d]"></span>
                </span>
                <span>Live Sea Signal Active</span>
              </div>
            )}

            {/* Quick Hotkey Guide */}
            <div className="hidden xl:flex items-center gap-1.5 text-[10px] text-[#7c7366] font-medium bg-[#f5f0eb] px-2.5 py-1 rounded-md border border-[#ddd4c4]">
              <span>Keys:</span>
              <kbd className="px-1.5 py-0.5 bg-[#fffaf2] border border-[#ddd4c4] rounded shadow-2xs font-mono font-bold text-[#1a1714]">D</kbd> Dashboard
              <kbd className="px-1.5 py-0.5 bg-[#fffaf2] border border-[#ddd4c4] rounded shadow-2xs font-mono font-bold text-[#1a1714]">T</kbd> Trends
              <kbd className="px-1.5 py-0.5 bg-[#fffaf2] border border-[#ddd4c4] rounded shadow-2xs font-mono font-bold text-[#1a1714]">A</kbd> Alerts
              <kbd className="px-1.5 py-0.5 bg-[#fffaf2] border border-[#ddd4c4] rounded shadow-2xs font-mono font-bold text-[#1a1714]">E</kbd> Env
            </div>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">

            {/* User dropdown */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-[#fffaf2] hover:bg-secondary transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-[#1e3a8a] text-white flex items-center justify-center font-header font-bold text-xs">
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
                <div className="absolute right-0 mt-1 w-52 rounded-xl border border-border bg-[#fffaf2] shadow-xl py-1 z-50">
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

        <main className="flex-1 overflow-auto bg-background p-4 sm:p-6">{children}</main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLogoutModal(false)}
          />
          <div className="bg-[#fffaf2] rounded-xl border border-border shadow-2xl w-full max-w-sm mx-4 p-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
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
