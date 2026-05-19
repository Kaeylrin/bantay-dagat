import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ShieldAlert, Lock, Clock } from "lucide-react";
import {
  db, auth, ref, get, set,
  signInWithEmailAndPassword, signOut,
  DB_PATHS,
} from "@/lib/firebase";
import { sanitiseEmailKey } from "@/lib/authContext";
import { LOGIN_FLAG_KEY } from "@/App";

const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 30 * 60 * 1000; // 30 minutes
const LS_KEY_RANGER  = "bd_ranger_lockout_email";

function getAttemptKey(email) {
  return `${DB_PATHS.LOGIN_ATTEMPTS}/${sanitiseEmailKey(email)}`;
}

function useCountdown(lockedUntil) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!lockedUntil) { setRemaining(0); return; }
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
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [isLoading,    setIsLoading]    = useState(false);
  const [lockedUntil,  setLockedUntil]  = useState(null);
  const [failCount,    setFailCount]    = useState(0);
  const [hasAttempted, setHasAttempted]  = useState(false);
  const remaining = useCountdown(lockedUntil);

  // Check lockout state when email changes
  useEffect(() => {
    if (!email.includes("@")) return;
    let active = true;
    get(ref(db, getAttemptKey(email.trim()))).then((snap) => {
      if (!active) return;
      const data = snap.val();
      if (data) {
        setFailCount(data.failCount ?? 0);
        if (data.lockedUntil && data.lockedUntil > Date.now()) {
          setLockedUntil(data.lockedUntil);
        } else {
          setLockedUntil(null);
        }
      } else {
        setFailCount(0);
        setLockedUntil(null);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [email]);

  const isLocked = lockedUntil && remaining > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
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
      // Pre-check true lockout state to prevent race conditions on email change
      const snap = await get(ref(db, getAttemptKey(email.trim())));
      const data = snap.val();
      if (data && data.lockedUntil && data.lockedUntil > Date.now()) {
        const diff = data.lockedUntil - Date.now();
        setLockedUntil(data.lockedUntil);
        setError(`Account is locked. Try again in ${formatMs(diff)}.`);
        setIsLoading(false);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        return;
      }
      actualFailCount = data?.failCount || 0;

      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Check if account is disabled in the database
      const userSnap = await get(ref(db, `${DB_PATHS.USERS}/${credential.user.uid}`));
      const profile = userSnap.val();

      // Reject admin accounts — they must use the admin login page
      if (profile && profile.role === "admin") {
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        setError("Admin accounts cannot log in here. Please use the Administrator Login page.");
        setIsLoading(false);
        return;
      }

      if (profile && profile.isActive === false) {
        // Account is disabled — sign out immediately
        await signOut(auth);
        sessionStorage.removeItem(LOGIN_FLAG_KEY);
        setError("Your account has been disabled. Contact an administrator.");
        setIsLoading(false);
        return;
      }

      // Clear lockout on success
      await set(ref(db, getAttemptKey(email.trim())), {
        failCount: 0,
        lockedUntil: null,
      });
      try { localStorage.removeItem(LS_KEY_RANGER); } catch {}

      sessionStorage.removeItem(LOGIN_FLAG_KEY);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setHasAttempted(true);
      const newFail = actualFailCount + 1;
      const shouldLock = newFail >= MAX_ATTEMPTS;
      const newLockedUntil = shouldLock ? Date.now() + LOCKOUT_MS : null;

      // Persist email to localStorage so lockout survives page refresh
      try { localStorage.setItem(LS_KEY_RANGER, email.trim()); } catch {}

      // Persist to Firebase so lockout survives page refresh / other devices
      await set(ref(db, getAttemptKey(email.trim())), {
        failCount: newFail,
        lockedUntil: newLockedUntil,
        lastAttempt: Date.now(),
      }).catch(() => {});

      setFailCount(newFail);
      if (shouldLock) {
        setLockedUntil(newLockedUntil);
        setError(
          `Too many failed attempts. Account locked for 30 minutes.`
        );
      } else {
        const left = MAX_ATTEMPTS - newFail;
        let msg = "Invalid email or password.";
        if (left <= 2) msg += ` ${left} attempt${left === 1 ? "" : "s"} remaining before lockout.`;
        setError(msg);
      }
    } finally {
      sessionStorage.removeItem(LOGIN_FLAG_KEY);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <img src="/bantay-dagat.png" alt="BantayDagat Logo" className="w-24 h-24 mx-auto mb-4 drop-shadow-md object-contain" />
          <h1 className="text-3xl font-header font-bold text-foreground mb-1">BantayDagat</h1>
          <p className="text-muted-foreground text-sm">IoT-Based Water Quality Monitoring</p>
          <p className="text-xs text-muted-foreground mt-1">Ranger / Staff Login</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-secondary p-8">
          <h2 className="text-xl font-header font-bold text-foreground mb-6 flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Ranger Login
          </h2>

          {/* Lockout banner */}
          {isLocked && (
            <div className="mb-4 bg-danger/10 border border-danger/30 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-danger">Account Locked</p>
                <p className="text-xs text-danger/80">
                  Too many failed attempts. Try again in{" "}
                  <span className="font-mono font-bold">{formatMs(remaining)}</span>.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
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
                placeholder="ranger.name@gmail.com"
                disabled={isLoading || isLocked}
                className="w-full px-4 py-2 rounded-lg border border-secondary bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
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
                  className="w-full px-4 py-2 pr-10 rounded-lg border border-secondary bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* Attempt indicator — only shown after a failed attempt on this visit */}
            {hasAttempted && failCount > 0 && !isLocked && (
              <div className="flex gap-1 items-center">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < failCount ? "bg-danger" : "bg-secondary"
                    }`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {MAX_ATTEMPTS - failCount} left
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full bg-primary text-white font-medium py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? "Logging in…" : "Login"}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 space-y-2">
          <Link
            to="/admin-login"
            className="block text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Administrator Login →
          </Link>
          <p className="text-xs text-muted-foreground">
            Sanctuary Marine Conservation System &mdash; Authorised Access Only
          </p>
        </div>
      </div>
    </div>
  );
}
