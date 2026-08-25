import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ShieldAlert, Lock, Clock, Radio } from "lucide-react";
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
const LS_KEY_RANGER = "bd_ranger_lockout_email";

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

export default function Login() {
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
      const profile = userSnap.val();

      if (profile && profile.role === "admin") {
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        setError(
          "Admin accounts cannot log in here. Please use the Administrator Login page.",
        );
        setIsLoading(false);
        return;
      }

      if (profile && profile.isActive === false) {
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        setError("Your account has been disabled. Contact an administrator.");
        setIsLoading(false);
        return;
      }

      await set(ref(db, getAttemptKey(submittedEmail)), {
        failCount: 0,
        lockedUntil: null,
      });
      try {
        localStorage.removeItem(LS_KEY_RANGER);
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
        localStorage.setItem(LS_KEY_RANGER, submittedEmail);
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
          setError(`Too many failed attempts. Account locked for 30 minutes.`);
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
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
            <Radio className="w-3.5 h-3.5 text-[#15803d]" />
            Field Operational Telemetry Access
          </span>
        </div>

        <div className="bg-[#fffaf2] rounded-xl shadow-sm border border-[#ddd4c4] p-6 sm:p-8">
          <h2 className="text-base font-header font-bold text-[#1a1714] mb-6 flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#1e3a8a]" />
            Ranger Staff Sign In
          </h2>

          {/* Lockout banner */}
          {isLocked && (
            <div className="mb-4 bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-[#9a3412] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#9a3412]">Account Locked</p>
                <p className="text-xs text-[#9a3412]/80">
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
            autoComplete="on"
          >
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1.5"
              >
                Gmail Address
              </label>
              <input
                id="email"
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
                placeholder="ranger@gmail.com"
                disabled={isLoading}
                className="w-full px-3.5 py-2 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] text-[#1a1714] placeholder-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent transition-colors disabled:opacity-60 font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isLoading || isLocked}
                  className="w-full px-3.5 py-2 pr-10 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] text-[#1a1714] placeholder-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent transition-colors disabled:opacity-60 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c7366] hover:text-[#1a1714]"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {/* Forgot password hint */}
              <p className="text-[10px] text-[#a8a29e] mt-1.5 text-right">
                Forgot your password?{" "}
                <span className="text-[#7c7366] font-semibold">
                  Contact your administrator.
                </span>
              </p>
            </div>

            {error && (
              <div className="bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-lg p-3">
                <p className="text-xs text-[#9a3412]">{error}</p>
              </div>
            )}

            {/* Attempt indicator */}
            {hasAttempted && failCount > 0 && !isLocked && (
              <div className="flex gap-1 items-center">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < failCount ? "bg-[#9a3412]" : "bg-[#ddd4c4]"
                    }`}
                  />
                ))}
                <span className="text-[10px] text-[#7c7366] ml-1">
                  {MAX_ATTEMPTS - failCount} left
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full bg-[#1e3a8a] text-white font-semibold text-xs py-2.5 rounded-lg hover:bg-[#1e3a8a]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
            >
              {isLoading ? "Authenticating Ranger…" : "Sign In as Ranger"}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 space-y-2">
          <Link
            to="/admin-login"
            className="block text-xs font-semibold text-[#7c7366] hover:text-[#1e3a8a] transition-colors"
          >
            Switch to Administrator Console Login →
          </Link>
          <p className="text-[11px] text-[#a8a29e]">
            Sanctuary Marine Conservation System &mdash; Authorised Access Only
          </p>
        </div>
      </div>
    </div>
  );
}
