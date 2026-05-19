import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid, TrendingUp, AlertCircle, Globe, LogOut, ChevronDown, ShieldCheck,
  Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";

export default function Layout({ children }) {
  const location = useLocation();
  const { currentUser, userRole, userProfile, logout } = useAuth();

  const baseNav = [
    { path: "/dashboard",   label: "Dashboard",         icon: LayoutGrid  },
    { path: "/trends",      label: "Historical Trends",  icon: TrendingUp  },
    { path: "/alerts",      label: "Alert Logs",         icon: AlertCircle },
    { path: "/environment", label: "Environmental Data", icon: Globe        },
  ];

  const navItems = userRole === "admin"
    ? [...baseNav, { path: "/admin", label: "Admin Panel", icon: ShieldCheck }]
    : baseNav;

  const isActive = (path) => location.pathname === path;

  const displayName = userProfile?.displayName || currentUser?.email || "User";
  const displayEmail = currentUser?.email || "";
  const initial = displayName.charAt(0).toUpperCase();

  // User dropdown state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Logout modal state
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Sidebar content (shared between desktop and mobile)
  const sidebarContent = (
    <>
      <div className="p-6 border-b border-secondary">
        <h1 className="text-lg font-header font-bold text-foreground">BantayDagat</h1>
        <p className="text-xs text-muted-foreground mt-1">Water Quality Monitor</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.path);
          const isAdmin = item.path === "/admin";
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                active
                  ? isAdmin ? "bg-safe text-white" : "bg-primary text-white"
                  : isAdmin ? "text-safe hover:bg-safe/10" : "text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Role badge */}
      <div className="px-5 pb-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
          userRole === "admin" ? "bg-safe/10 text-safe" : "bg-primary/10 text-primary"
        }`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          {userRole === "admin" ? "Administrator" : "Ranger"}
        </div>
      </div>

      <div className="p-4 border-t border-secondary">
        <button
          onClick={() => setShowLogoutModal(true)}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium text-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden lg:flex w-64 border-r border-secondary bg-background flex-col shrink-0">
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
          {/* Slide-out panel */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-background border-r border-secondary flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Close button */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-secondary bg-white h-14 sm:h-16 flex items-center justify-between px-4 sm:px-8 shrink-0">
          {/* Mobile hamburger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-sm sm:text-xl font-header font-bold text-foreground truncate">
              <span className="hidden sm:inline">BantayDagat: IoT-Based Water Quality Monitoring System</span>
              <span className="sm:hidden">BantayDagat</span>
            </h1>
          </div>

          {/* User dropdown */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-header font-bold text-sm">
                {initial}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-foreground leading-none">{displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{displayEmail}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-52 rounded-lg border border-secondary bg-white shadow-lg py-1 z-50">
                <div className="px-3 py-2 text-xs text-muted-foreground border-b border-secondary">
                  Role: <span className="font-bold ml-1 capitalize">{userRole}</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); setShowLogoutModal(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutModal(false)} />
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-danger" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Confirm Logout</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to log out of your account? You will need to sign in again to access the dashboard.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutModal(false);
                  logout();
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 transition-colors"
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
