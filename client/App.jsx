import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import HistoricalTrends from "./pages/HistoricalTrends";
import AlertLogs from "./pages/AlertLogs";
import EnvironmentData from "./pages/EnvironmentData";
import NotFound from "./pages/NotFound";

const ProtectedRoute = ({ element }) => {
  const isAuthenticated = localStorage.getItem("authToken");
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"    element={<ProtectedRoute element={<Dashboard />} />} />
        <Route path="/trends"       element={<ProtectedRoute element={<HistoricalTrends />} />} />
        <Route path="/alerts"       element={<ProtectedRoute element={<AlertLogs />} />} />
        <Route path="/environment"  element={<ProtectedRoute element={<EnvironmentData />} />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
