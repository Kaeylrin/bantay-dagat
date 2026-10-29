import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  auth,
  db,
  ref,
  get,
  onValue,
  off,
  onAuthStateChanged,
  signOut,
  DB_PATHS,
} from "@/lib/firebase";

const AuthContext = createContext(null);

export function sanitiseEmailKey(email) {
  return email.toLowerCase().replace(/\./g, ",").replace(/@/g, "-at-");
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const forceLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {}
    setCurrentUser(null);
    setUserRole(null);
    setUserProfile(null);
  }, []);

  useEffect(() => {
    let profileUnsub = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (user) {
        try {
          const snap = await get(ref(db, `${DB_PATHS.USERS}/${user.uid}`));
          const profile = snap.val();

          if (!profile) {
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

          const profileRef = ref(db, `${DB_PATHS.USERS}/${user.uid}`);
          profileUnsub = onValue(
            profileRef,
            (liveSnap) => {
              const live = liveSnap.val();
              if (!live || live.isActive === false) {
                forceLogout();
                return;
              }

              setUserRole(live.role);
              setUserProfile(live);
            },
            () => {},
          );
        } catch {
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
    <AuthContext.Provider
      value={{ currentUser, userRole, userProfile, loading, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
