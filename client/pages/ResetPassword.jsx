import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";

const RULES = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  {
    id: "upper",
    label: "At least one uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "At least one lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  { id: "digit", label: "At least one number", test: (p) => /\d/.test(p) },
  {
    id: "special",
    label: "At least one special character",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

function passwordStrength(p) {
  const passed = RULES.filter((r) => r.test(p)).length;
  if (passed <= 2) return { label: "Weak", color: "bg-[#9a3412]", width: "25%" };
  if (passed === 3)
    return { label: "Fair", color: "bg-yellow-500", width: "50%" };
  if (passed === 4)
    return { label: "Good", color: "bg-emerald-500", width: "75%" };
  return { label: "Strong", color: "bg-[#15803d]", width: "100%" };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const mode = searchParams.get("mode");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!oobCode) {
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
          setError(
            "This password reset link has expired. Please request a new one.",
          );
        } else if (err.code === "auth/invalid-action-code") {
          setError(
            "This password reset link is invalid or has already been used.",
          );
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

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden font-body">
        <div className="flex items-center gap-3 text-[#7c7366] relative z-10 text-xs font-semibold">
          <RefreshCw className="w-5 h-5 animate-spin text-[#1e3a8a]" />
          <span>Verifying security reset code…</span>
        </div>
      </div>
    );
  }

  // ── Invalid / expired link ──
  if (status === "invalid" || status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden font-body">
        {/* Background Image at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 select-none overflow-hidden">
          <img
            src="/background.jpg"
            alt=""
            className="w-full h-full object-cover object-bottom opacity-20 translate-y-20 bottom-blend-mask"
          />
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <img
              src="/bantay-dagat.png"
              alt="BantayDagat Logo"
              className="w-20 h-20 mx-auto mb-3 object-contain drop-shadow-sm"
            />
            <h1 className="text-2xl font-header font-bold text-[#1a1714] tracking-tight mb-1">
              BantayDagat
            </h1>
            <p className="text-xs text-[#7c7366] font-medium mb-2">
              IoT-Based Water Quality Monitoring
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#9a3412]/10 text-[#9a3412] border border-[#9a3412]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#9a3412]" />
              Password Reset Request
            </span>
          </div>

          <div className="bg-[#fffaf2] rounded-xl shadow-sm border border-[#ddd4c4] p-6 sm:p-8 text-center">
            <div className="w-12 h-12 bg-[#9a3412]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-[#9a3412]" />
            </div>
            <h2 className="text-base font-header font-bold text-[#1a1714] mb-2">
              Invalid Reset Link
            </h2>
            <p className="text-xs text-[#7c7366] mb-6 leading-relaxed">
              {error || "This password reset link is invalid or has expired."}
            </p>
            <div className="pt-4 border-t border-[#ddd4c4]">
              <Link
                to="/login"
                className="block text-center text-xs font-semibold text-[#7c7366] hover:text-[#1e3a8a] transition-colors"
              >
                ← Return to Staff Login
              </Link>
            </div>
          </div>

          <div className="text-center mt-6">
            <p className="text-[11px] text-[#a8a29e]">
              Sanctuary Marine Conservation System &mdash; Authorised Access Only
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden font-body">
        {/* Background Image at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 select-none overflow-hidden">
          <img
            src="/background.jpg"
            alt=""
            className="w-full h-full object-cover object-bottom opacity-20 translate-y-20 bottom-blend-mask"
          />
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <img
              src="/bantay-dagat.png"
              alt="BantayDagat Logo"
              className="w-20 h-20 mx-auto mb-3 object-contain drop-shadow-sm"
            />
            <h1 className="text-2xl font-header font-bold text-[#1a1714] tracking-tight mb-1">
              BantayDagat
            </h1>
            <p className="text-xs text-[#7c7366] font-medium mb-2">
              IoT-Based Water Quality Monitoring
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#15803d]/10 text-[#15803d] border border-[#15803d]/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15803d]" />
              Password Reset Complete
            </span>
          </div>

          <div className="bg-[#fffaf2] rounded-xl shadow-sm border border-[#ddd4c4] p-6 sm:p-8 text-center">
            <div className="w-12 h-12 bg-[#15803d]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-[#15803d]" />
            </div>
            <h2 className="text-base font-header font-bold text-[#1a1714] mb-2">
              Password Reset Successful
            </h2>
            <p className="text-xs text-[#7c7366] mb-6 leading-relaxed">
              Your password has been updated. You can now log in with your new
              security credentials.
            </p>
            <div className="pt-4 border-t border-[#ddd4c4]">
              <Link
                to="/login"
                className="inline-block bg-[#1e3a8a] text-white font-semibold text-xs py-2.5 px-8 rounded-lg hover:bg-[#1e3a8a]/90 transition-colors shadow-sm"
              >
                Sign In as Ranger
              </Link>
            </div>
          </div>

          <div className="text-center mt-6">
            <p className="text-[11px] text-[#a8a29e]">
              Sanctuary Marine Conservation System &mdash; Authorised Access Only
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden font-body">
      {/* Background Image at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 select-none overflow-hidden">
        <img
          src="/background.jpg"
          alt=""
          className="w-full h-full object-cover object-bottom opacity-20 translate-y-20 bottom-blend-mask"
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <img
            src="/bantay-dagat.png"
            alt="BantayDagat Logo"
            className="w-20 h-20 mx-auto mb-3 object-contain drop-shadow-sm"
          />
          <h1 className="text-2xl font-header font-bold text-[#1a1714] tracking-tight mb-1">
            BantayDagat
          </h1>
          <p className="text-xs text-[#7c7366] font-medium mb-2">
            IoT-Based Water Quality Monitoring
          </p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#15803d]/10 text-[#15803d] border border-[#15803d]/30">
            <Lock className="w-3.5 h-3.5 text-[#15803d]" />
            Security Password Reset
          </span>
        </div>

        <div className="bg-[#fffaf2] rounded-xl shadow-sm border border-[#ddd4c4] p-6 sm:p-8">
          <h2 className="text-base font-header font-bold text-[#1a1714] mb-1 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1e3a8a]" />
            Set New Password
          </h2>
          <p className="text-xs text-[#7c7366] mb-6 font-medium">
            Resetting credentials for{" "}
            <span className="text-[#1a1714] font-semibold">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2 pr-10 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] text-[#1a1714] placeholder-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent transition-colors font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c7366] hover:text-[#1a1714]"
                  tabIndex={-1}
                >
                  {showPw ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {password && strength && (
                <div className="mt-2">
                  <div className="h-1.5 bg-[#ddd4c4] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-[11px] text-[#7c7366] mt-1">
                    Strength:{" "}
                    <span className="font-semibold text-[#1a1714]">{strength.label}</span>
                  </p>
                </div>
              )}

              {/* Password rules checklist */}
              {password && (
                <ul className="mt-2 space-y-0.5">
                  {RULES.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-[#15803d]" : "text-[#7c7366]"}`}
                      >
                        {ok ? (
                          <CheckCircle2 className="w-3 h-3 text-[#15803d]" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-[#7c7366]" />
                        )}
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`w-full px-3.5 py-2 rounded-lg border bg-[#f5f5f4] text-[#1a1714] placeholder-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent transition-colors font-medium ${
                  confirm && !passwordsMatch
                    ? "border-[#9a3412]"
                    : "border-[#ddd4c4]"
                }`}
              />
              {confirm && !passwordsMatch && (
                <p className="text-[11px] text-[#9a3412] mt-1 font-medium">
                  Passwords do not match.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-lg p-3">
                <p className="text-xs text-[#9a3412] font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="w-full bg-[#1e3a8a] text-white font-semibold text-xs py-2.5 rounded-lg hover:bg-[#1e3a8a]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Resetting…
                </span>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#ddd4c4]">
            <Link
              to="/login"
              className="block text-center text-xs font-semibold text-[#7c7366] hover:text-[#1e3a8a] transition-colors"
            >
              ← Back to Staff Login
            </Link>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-[11px] text-[#a8a29e]">
            Sanctuary Marine Conservation System &mdash; Authorised Access Only
          </p>
        </div>
      </div>
    </div>
  );
}


