import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle,
  RefreshCw, Lock, KeyRound,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";

const RULES = [
  { id: "len",     label: "At least 8 characters",          test: (p) => p.length >= 8 },
  { id: "upper",   label: "At least one uppercase letter",  test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "At least one lowercase letter",  test: (p) => /[a-z]/.test(p) },
  { id: "digit",   label: "At least one number",            test: (p) => /\d/.test(p) },
  { id: "special", label: "At least one special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function passwordStrength(p) {
  const passed = RULES.filter((r) => r.test(p)).length;
  if (passed <= 2) return { label: "Weak",   color: "bg-red-500",      width: "25%"  };
  if (passed === 3) return { label: "Fair",   color: "bg-yellow-500",   width: "50%"  };
  if (passed === 4) return { label: "Good",   color: "bg-emerald-400",  width: "75%"  };
  return                   { label: "Strong", color: "bg-emerald-500",  width: "100%" };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const mode    = searchParams.get("mode");

  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [email,        setEmail]        = useState("");
  const [status,       setStatus]       = useState("loading"); // loading | ready | success | error | invalid
  const [error,        setError]        = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verify the reset code on mount
  useEffect(() => {
    if (!oobCode || mode !== "resetPassword") {
      setStatus("invalid");
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((userEmail) => {
        setEmail(userEmail);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("Invalid reset code:", err);
        setStatus("error");
        if (err.code === "auth/expired-action-code") {
          setError("This password reset link has expired. Please request a new one.");
        } else if (err.code === "auth/invalid-action-code") {
          setError("This password reset link is invalid or has already been used.");
        } else {
          setError(err.message || "Invalid reset link.");
        }
      });
  }, [oobCode, mode]);

  const allRulesPassed = RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirm;
  const canSubmit = allRulesPassed && passwordsMatch && password.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch (err) {
      if (err.code === "auth/expired-action-code") {
        setError("This reset link has expired. Please request a new one.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please follow all requirements.");
      } else {
        setError(err.message || "Failed to reset password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const strength = password ? passwordStrength(password) : null;

  // ── Loading state ──
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-sm">Verifying reset link…</span>
        </div>
      </div>
    );
  }

  // ── Invalid / expired link ──
  if (status === "invalid" || status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Invalid Reset Link</h1>
            <p className="text-slate-400 text-sm">
              {error || "This password reset link is invalid or has expired."}
            </p>
          </div>
          <div className="text-center space-y-3">
            <Link
              to="/login"
              className="block text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (status === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Password Reset Successful</h1>
            <p className="text-slate-400 text-sm">
              Your password has been updated. You can now log in with your new password.
            </p>
          </div>
          <div className="text-center space-y-3">
            <Link
              to="/login"
              className="inline-block bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium py-2.5 px-8 rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/20"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Reset form ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">BantayDagat</h1>
          <p className="text-slate-400 text-sm">Password Reset</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-8">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            Set New Password
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Resetting password for <span className="text-emerald-400 font-medium">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-4 py-2 pr-10 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {password && strength && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Strength: <span className="font-semibold">{strength.label}</span>
                  </p>
                </div>
              )}

              {/* Password rules checklist */}
              {password && (
                <ul className="mt-2 space-y-0.5">
                  {RULES.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li key={r.id} className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-slate-500"}`}>
                        {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`w-full px-4 py-2 rounded-lg border bg-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors ${
                  confirm && !passwordsMatch ? "border-red-500" : "border-slate-600"
                }`}
              />
              {confirm && !passwordsMatch && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium py-2.5 rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-emerald-500/20"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Resetting…
                </span>
              ) : "Reset Password"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700/50">
            <Link
              to="/login"
              className="block text-center text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
