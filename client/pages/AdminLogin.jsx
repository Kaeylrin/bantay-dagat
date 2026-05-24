import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, Lock, Clock } from "lucide-react";
import {
  db,
  auth,
  ref,
  get,
  set,
  signInWithEmailAndPassword,
  signOut,
  DB_PATHS,
} from "@/lib/firebase";
import { sanitiseEmailKey } from "@/lib/authContext";
import { LOGIN_FLAG_KEY } from "@/App";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const LS_KEY_ADMIN = "bd_admin_lockout_email";

function getAttemptKey(email) {
  return `${DB_PATHS.LOGIN_ATTEMPTS}/${sanitiseEmailKey(email)}`;
}

function useCountdown(lockedUntil) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!lockedUntil) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const diff = lockedUntil - Date.now();
      setRemaining(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);
  return remaining;
}

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [failCount, setFailCount] = useState(0);
  const [hasAttempted, setHasAttempted] = useState(false);
  const remaining = useCountdown(lockedUntil);

  useEffect(() => {
    if (!email.includes("@")) return;
    let active = true;
    get(ref(db, getAttemptKey(email.trim())))
      .then((snap) => {
        if (!active) return;
        const data = snap.val();
        if (data) {
          const lastAttemptAge = data.lastAttempt ? Date.now() - data.lastAttempt : Infinity;
          const lockoutExpired = data.lockedUntil ? Date.now() > data.lockedUntil : true;

          if (lockoutExpired && lastAttemptAge > LOCKOUT_MS) {
            setFailCount(0);
            setLockedUntil(null);
          } else {
            setFailCount(data.failCount ?? 0);
            if (data.lockedUntil && data.lockedUntil > Date.now()) {
              setLockedUntil(data.lockedUntil);
            } else {
              setLockedUntil(null);
            }
          }
        } else {
          setFailCount(0);
          setLockedUntil(null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [email]);

  const isLocked = lockedUntil && remaining > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Capture the email at submit time so it stays consistent throughout
    // the entire async flow, even if the user changes the input mid-flight.
    const submittedEmail = email.trim();

    if (!submittedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    if (isLocked) {
      setError(`Account is locked. Try again in ${formatMs(remaining)}.`);
      return;
    }

    let actualFailCount = 0;
    setIsLoading(true);
    sessionStorage.setItem(LOGIN_FLAG_KEY, "1");
    try {
      // Always fetch the latest attempt data for the SUBMITTED email
      const snap = await get(ref(db, getAttemptKey(submittedEmail)));
      const data = snap.val();
      if (data && data.lockedUntil && data.lockedUntil > Date.now()) {
        const diff = data.lockedUntil - Date.now();
        setLockedUntil(data.lockedUntil);
        setError(`Account is locked. Try again in ${formatMs(diff)}.`);
        setIsLoading(false);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        return;
      }
      
      const lastAttemptAge = data?.lastAttempt ? Date.now() - data.lastAttempt : Infinity;
      const lockoutExpired = data?.lockedUntil ? Date.now() > data.lockedUntil : true;

      if (lockoutExpired && lastAttemptAge > LOCKOUT_MS) {
        actualFailCount = 0;
      } else {
        actualFailCount = data?.failCount || 0;
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        submittedEmail,
        password,
      );

      const userSnap = await get(
        ref(db, `${DB_PATHS.USERS}/${credential.user.uid}`),
      );
      let profile = userSnap.val();

      if (!profile) {
        const adminProfile = {
          email: credential.user.email,
          displayName: "Administrator",
          role: "admin",
          isActive: true,
          createdAt: Date.now(),
        };
        try {
          await set(
            ref(db, `${DB_PATHS.USERS}/${credential.user.uid}`),
            adminProfile,
          );
          profile = adminProfile;
        } catch (writeErr) {
          await signOut(auth);
          sessionStorage.removeItem(LOGIN_FLAG_KEY);
          setError(
            "Admin profile doesn't exist and couldn't be created. " +
              "Please add this account's profile to Firebase RTDB at /users/" +
              credential.user.uid +
              " with role: 'admin'.",
          );
          setIsLoading(false);
          return;
        }
      }

      if (profile.role !== "admin") {
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        const msg =
          profile.role === "ranger"
            ? "This login is for administrators only. Please use the Ranger / Staff Login page."
            : "Access denied. This login is for administrators only.";
        setError(msg);
        setIsLoading(false);
        return;
      }

      if (profile.isActive === false) {
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        setError("Your account has been disabled.");
        setIsLoading(false);
        return;
      }

      await set(ref(db, getAttemptKey(submittedEmail)), {
        failCount: 0,
        lockedUntil: null,
      });
      try {
        localStorage.removeItem(LS_KEY_ADMIN);
      } catch {}

      sessionStorage.removeItem(LOGIN_FLAG_KEY);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // Guard: only update state if the email field still matches what we submitted.
      // This prevents stale async responses from corrupting a different email's state.
      const emailStillMatches = email.trim() === submittedEmail;

      if (emailStillMatches) setHasAttempted(true);
      const newFail = actualFailCount + 1;
      const shouldLock = newFail >= MAX_ATTEMPTS;
      const newLockedUntil = shouldLock ? Date.now() + LOCKOUT_MS : null;

      try {
        localStorage.setItem(LS_KEY_ADMIN, submittedEmail);
      } catch {}

      // Always write to the correct (submitted) email's DB record
      await set(ref(db, getAttemptKey(submittedEmail)), {
        failCount: newFail,
        lockedUntil: newLockedUntil,
        lastAttempt: Date.now(),
      }).catch(() => {});

      // Only update local UI state if the email hasn't changed
      if (emailStillMatches) {
        setFailCount(newFail);
        if (shouldLock) {
          setLockedUntil(newLockedUntil);
          setError("Too many failed attempts. Account locked for 30 minutes.");
        } else {
          const left = MAX_ATTEMPTS - newFail;
          let msg = "Invalid email or password.";
          if (left <= 2)
            msg += ` ${left} attempt${left === 1 ? "" : "s"} remaining before lockout.`;
          setError(msg);
        }
      }
    } finally {
      sessionStorage.removeItem(LOGIN_FLAG_KEY);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Image at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-0 select-none overflow-hidden">
        <img
          src="/background.jpg"
          alt=""
          className="w-full h-full object-cover object-bottom opacity-15 translate-y-20 bottom-blend-mask"
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <img
            src="/bantay-dagat.png"
            alt="BantayDagat Logo"
            className="w-24 h-24 mx-auto mb-4 drop-shadow-lg object-contain"
          />
          <h1 className="text-3xl font-header font-bold text-white mb-1">
            BantayDagat
          </h1>
          <p className="text-slate-400 text-sm">Administrator Access Portal</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-8">
          <h2 className="text-xl font-header font-bold text-white mb-6 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            Admin Login
          </h2>

          {/* Lockout banner */}
          {isLocked && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-400">Account Locked</p>
                <p className="text-xs text-red-400/80">
                  Too many failed attempts. Try again in{" "}
                  <span className="font-mono font-bold">
                    {formatMs(remaining)}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            autoComplete="off"
          >
            <div>
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Admin Gmail
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                  setHasAttempted(false);
                  setFailCount(0);
                  setLockedUntil(null);
                }}
                autoComplete="username"
                placeholder="admin@gmail.com"
                disabled={isLoading}
                className="w-full px-4 py-2 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isLoading || isLocked}
                  className="w-full px-4 py-2 pr-10 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Attempt indicator — only shown after a failed attempt on this visit */}
            {hasAttempted && failCount > 0 && !isLocked && (
              <div className="flex gap-1 items-center">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < failCount ? "bg-red-500" : "bg-slate-600"
                    }`}
                  />
                ))}
                <span className="text-xs text-slate-400 ml-1">
                  {MAX_ATTEMPTS - failCount} left
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium py-2.5 rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-emerald-500/20"
            >
              {isLoading ? "Authenticating…" : "Access Admin Panel"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700/50">
            <Link
              to="/login"
              className="block text-center text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              ← Ranger / Staff Login
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          BantayDagat Administrative Console &mdash; Restricted Access
        </p>
      </div>
    </div>
  );
}
