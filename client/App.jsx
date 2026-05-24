import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/authContext";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import HistoricalTrends from "./pages/HistoricalTrends";
import AlertLogs from "./pages/AlertLogs";
import EnvironmentData from "./pages/EnvironmentData";
import AdminPanel from "./pages/AdminPanel";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { RefreshCw } from "lucide-react";

export const LOGIN_FLAG_KEY = "bd_login_in_progress";

function ProtectedRoute({ element }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;

  return element;
}

function AdminRoute({ element }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userRole !== "admin") return <Navigate to="/dashboard" replace />;
  return element;
}

function PublicRoute({ element }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  const loginBusy = sessionStorage.getItem(LOGIN_FLAG_KEY);
  if (loginBusy) return element;
  if (currentUser) return <Navigate to="/dashboard" replace />;
  return element;
}

function AdminPublicRoute({ element }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  const loginBusy = sessionStorage.getItem(LOGIN_FLAG_KEY);
  if (loginBusy) return element;
  if (currentUser) return <Navigate to="/dashboard" replace />;
  return element;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute element={<Login />} />} />
          <Route
            path="/admin-login"
            element={<AdminPublicRoute element={<AdminLogin />} />}
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute element={<Dashboard />} />}
          />
          <Route
            path="/trends"
            element={<ProtectedRoute element={<HistoricalTrends />} />}
          />
          <Route
            path="/alerts"
            element={<ProtectedRoute element={<AlertLogs />} />}
          />
          <Route
            path="/environment"
            element={<ProtectedRoute element={<EnvironmentData />} />}
          />
          <Route
            path="/admin"
            element={<AdminRoute element={<AdminPanel />} />}
          />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
