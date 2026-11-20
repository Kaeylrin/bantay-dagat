import AccessShell from "@/components/AccessShell";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  auth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "@/lib/firebase";

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
  if (passed <= 2) return { label: "Weak", color: "bg-danger", width: "25%" };
  if (passed === 3)
    return { label: "Fair", color: "bg-yellow-500", width: "50%" };
  if (passed === 4)
    return { label: "Good", color: "bg-emerald-500", width: "75%" };
  return { label: "Strong", color: "bg-safe", width: "100%" };
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

  return (
    <AccessShell recovery>
      {status === "loading" && <p role="status">Checking your reset link…</p>}
      {["error", "invalid"].includes(status) && (
        <>
          <h1 className="text-2xl font-bold">Invalid reset link</h1>
          <p className="my-4 text-muted-foreground">
            {error || "This link is missing or has expired."} Ask your
            administrator for a new link.
          </p>
        </>
      )}
      {status === "success" && (
        <>
          <h1 className="text-2xl font-bold">Password updated</h1>
          <p className="my-4 text-muted-foreground">
            Use your new password the next time you sign in.
          </p>
        </>
      )}
      {status === "ready" && (
        <>
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">For {email}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2 pr-10 rounded-lg border border-border bg-muted text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
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
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Strength:{" "}
                    <span className="font-semibold text-foreground">
                      {strength.label}
                    </span>
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
                        className={`flex items-center gap-1.5 text-xs ${ok ? "text-safe" : "text-muted-foreground"}`}
                      >
                        {ok ? (
                          <CheckCircle2 className="w-3 h-3 text-safe" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-muted-foreground" />
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
              <label
                htmlFor="confirm-password"
                className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`w-full px-3.5 py-2 rounded-lg border bg-muted text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors font-medium ${
                  confirm && !passwordsMatch ? "border-danger" : "border-border"
                }`}
              />
              {confirm && !passwordsMatch && (
                <p className="text-xs text-danger mt-1 font-medium">
                  Passwords do not match.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <p className="text-xs text-danger font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="w-full bg-primary text-primary-foreground font-semibold text-xs py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
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
        </>
      )}
      <Link
        to="/login"
        className="mt-5 block border-t pt-4 text-sm font-semibold text-primary"
      >
        Back to sign in
      </Link>
    </AccessShell>
  );
}
