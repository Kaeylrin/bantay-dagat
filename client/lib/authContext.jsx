import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth, db, ref, get, onValue, off, onAuthStateChanged, signOut, DB_PATHS } from "@/lib/firebase";

const AuthContext = createContext(null);

export function sanitiseEmailKey(email) {
  return email.toLowerCase().replace(/\./g, ",").replace(/@/g, "-at-");
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole,    setUserRole]    = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading,     setLoading]     = useState(true);

  // Force-logout helper that clears all state
  const forceLogout = useCallback(async () => {
    try { await signOut(auth); } catch {}
    setCurrentUser(null);
    setUserRole(null);
    setUserProfile(null);
  }, []);

  useEffect(() => {
    let profileUnsub = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Clean up any previous profile listener
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (user) {
        try {
          const snap = await get(ref(db, `${DB_PATHS.USERS}/${user.uid}`));
          const profile = snap.val();

          if (!profile) {
            // No profile yet — keep user logged in with no role.
            // The admin login page will auto-create the profile.
            // Rangers should always have profiles created by admin.
            setUserRole(null);
            setUserProfile(null);
            setCurrentUser(user);
            setLoading(false);
            return;
          }

          if (profile.isActive === false) {
            await forceLogout();
            setLoading(false);
            return;
          }

          setUserRole(profile.role);
          setUserProfile(profile);
          setCurrentUser(user);

          // Real-time listener on own profile — if admin disables this
          // account or deletes it, sign out immediately
          const profileRef = ref(db, `${DB_PATHS.USERS}/${user.uid}`);
          profileUnsub = onValue(profileRef, (liveSnap) => {
            const live = liveSnap.val();
            if (!live || live.isActive === false) {
              forceLogout();
              return;
            }
            // Update role/profile if admin changed something
            setUserRole(live.role);
            setUserProfile(live);
          }, () => {});
        } catch {
          // Profile fetch failed (network/rules) — keep user logged in
          // but with no role. Route guards will handle access.
          setUserRole(null);
          setUserProfile(null);
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (profileUnsub) profileUnsub();
    };
  }, [forceLogout]);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userRole, userProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
