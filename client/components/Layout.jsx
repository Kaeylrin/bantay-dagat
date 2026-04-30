import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutGrid, TrendingUp, AlertCircle, Globe, LogOut, ChevronDown } from "lucide-react";

export default function Layout({
  children,
  isAuthenticated = true,
  userEmail = "staff@sanctuary.org",
}) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { path: "/dashboard",   label: "Dashboard",         icon: LayoutGrid },
    { path: "/trends",      label: "Historical Trends",  icon: TrendingUp },
    { path: "/alerts",      label: "Alert Logs",         icon: AlertCircle },
    { path: "/environment", label: "Environmental Data",  icon: Globe },
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userEmail");
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-secondary bg-background flex flex-col">
        {/* Logo/Title */}
        <div className="p-6 border-b border-secondary">
          <h1 className="text-lg font-header font-bold text-foreground">BantayDagat</h1>
          <p className="text-xs text-muted-foreground mt-1">Water Quality Monitor</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-secondary">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium text-sm"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="border-b border-secondary bg-white h-16 flex items-center justify-between px-8">
          <h1 className="text-xl font-header font-bold text-foreground">
            BantayDagat: IoT-Based Water Quality Monitoring System
          </h1>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-header font-bold text-sm">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground">{userEmail}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                {userEmail}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
