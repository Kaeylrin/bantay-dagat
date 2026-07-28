import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  UserPlus,
  Users,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  KeyRound,
  Pencil,
  X,
  Check,
  Mail,
} from "lucide-react";
import {
  db,
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  off,
  createRangerInFirebase,
  sendPasswordResetEmail,
  auth,
  DB_PATHS,
} from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";

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
  if (passed === 3) return { label: "Fair", color: "bg-caution", width: "50%" };
  if (passed === 4) return { label: "Good", color: "bg-safe/70", width: "75%" };
  return { label: "Strong", color: "bg-safe", width: "100%" };
}

function RangerItem({ ranger }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(ranger.displayName || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleToggleActive = async () => {
    setBusy(true);
    try {
      await set(
        ref(db, `${DB_PATHS.USERS}/${ranger.uid}/isActive`),
        !ranger.isActive,
      );
      showFeedback(
        "success",
        ranger.isActive ? "Account disabled." : "Account enabled.",
      );
    } catch (e) {
      showFeedback("error", e.message);
    }
    setBusy(false);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await update(ref(db, `${DB_PATHS.USERS}/${ranger.uid}`), {
        displayName: editName.trim(),
      });
      showFeedback("success", "Name updated.");
      setEditing(false);
    } catch (e) {
      showFeedback("error", e.message);
    }
    setBusy(false);
  };

  const handleResetPassword = async () => {
    setBusy(true);
    try {
      const origin = window.location.origin.includes("localhost")
        ? window.location.origin
        : "https://bantaydagat.site";
      const actionCodeSettings = {
        url: `${origin}/reset-password`,
        handleCodeInApp: true,
      };
      await sendPasswordResetEmail(auth, ranger.email, actionCodeSettings);
      showFeedback(
        "success",
        `Password reset email sent to ${ranger.email}. Check their inbox.`,
      );
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        showFeedback("error", "This user no longer exists in Firebase Auth.");
      } else {
        showFeedback("error", e.message);
      }
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/delete-user?uid=${ranger.uid}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch (err) {
          throw new Error(
            `Server returned invalid response (Status: ${response.status}).`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Failed to delete user (Status: ${response.status}).`,
        );
      }

      await remove(ref(db, `${DB_PATHS.USERS}/${ranger.uid}`)).catch(
        () => {},
      );
    } catch (e) {
      showFeedback("error", e.message);
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return (
    <li className="p-3 rounded-lg border border-secondary hover:bg-secondary/20 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
            {(ranger.displayName || ranger.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  autoFocus
                  className="px-2 py-0.5 rounded border border-primary bg-background text-foreground text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSaveName}
                  disabled={busy}
                  className="p-0.5 text-safe hover:text-safe/80"
                  title="Save"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditName(ranger.displayName || "");
                  }}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-foreground truncate">
                {ranger.displayName || "—"}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {ranger.email}
            </p>
            <p className="text-xs text-muted-foreground">
              Added{" "}
              {ranger.createdAt
                ? new Date(ranger.createdAt).toLocaleDateString("en-PH")
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${ranger.isActive ? "bg-safe/20 text-safe" : "bg-danger/20 text-danger"}`}
          >
            {ranger.isActive ? "Active" : "Disabled"}
          </span>
          {!confirmDel && (
            <>
              <button
                onClick={() => {
                  setEditing(true);
                  setEditName(ranger.displayName || "");
                }}
                disabled={busy}
                title="Edit name"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetPassword}
                disabled={busy}
                title="Send password reset email"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleToggleActive}
                disabled={busy}
                title={ranger.isActive ? "Disable account" : "Enable account"}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                {ranger.isActive ? (
                  <ShieldOff className="w-3.5 h-3.5" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setConfirmDel(true)}
                disabled={busy}
                title="Delete account"
                className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDel && (
        <div className="mt-2 flex items-center gap-2 bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-xs text-danger flex-1">
            Delete this ranger permanently?
          </p>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="px-2 py-1 text-xs font-bold bg-danger text-white rounded hover:bg-danger/80 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, Delete"}
          </button>
          <button
            onClick={() => setConfirmDel(false)}
            disabled={busy}
            className="px-2 py-1 text-xs font-medium bg-secondary text-foreground rounded hover:bg-secondary/80"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline feedback */}
      {feedback && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
            feedback.type === "success"
              ? "text-safe bg-safe/10"
              : "text-danger bg-danger/10"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {feedback.text}
        </div>
      )}
    </li>
  );
}

export default function AdminPanel() {
  const { currentUser } = useAuth();

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  const [rangers, setRangers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  useEffect(() => {
    const usersRef = ref(db, DB_PATHS.USERS);
    onValue(
      usersRef,
      (snap) => {
        const data = snap.val();
        if (data) {
          const list = Object.entries(data)
            .map(([uid, u]) => ({ uid, ...u }))
            .filter((u) => u.role === "ranger")
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          setRangers(list);
        } else {
          setRangers([]);
        }
        setLoadingList(false);
        setListError(null);
      },
      (err) => {
        setLoadingList(false);
        setListError(err.message);
      },
    );
    return () => off(usersRef);
  }, []);

  const field = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    if (!form.displayName.trim()) return "Full name is required.";
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return "Valid email required.";
    if (!email.endsWith("@gmail.com"))
      return "Only Gmail accounts are allowed (e.g. name@gmail.com). This ensures password reset emails can be delivered.";
    if (RULES.some((r) => !r.test(form.password)))
      return "Password does not meet all requirements.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    return null;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setCreating(true);
    try {
      const uid = await createRangerInFirebase(
        form.email.trim(),
        form.password,
      );

      await set(ref(db, `${DB_PATHS.USERS}/${uid}`), {
        email: form.email.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        role: "ranger",
        isActive: true,
        createdAt: Date.now(),
        createdBy: currentUser.uid,
      });

      setFormSuccess(
        `Ranger "${form.displayName.trim()}" created successfully.`,
      );
      setForm({ displayName: "", email: "", password: "", confirm: "" });
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setFormError("That email address is already registered.");
      } else if (err.code === "auth/invalid-email") {
        setFormError("Invalid email address format.");
      } else {
        setFormError(err.message || "Failed to create account.");
      }
    } finally {
      setCreating(false);
    }
  };

  const strength = form.password ? passwordStrength(form.password) : null;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
        <h2 className="text-xl sm:text-2xl font-header font-bold text-foreground mb-6 sm:mb-8">
          Admin Panel — Ranger Accounts
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* ── Create Account ── */}
          <div className="bg-white rounded-xl border border-secondary shadow-sm p-6">
            <h3 className="text-lg font-header font-bold text-foreground mb-5 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Create Ranger Account
            </h3>

            <form
              onSubmit={handleCreate}
              className="space-y-4"
              autoComplete="off"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={field("displayName")}
                  placeholder="Juan dela Cruz"
                  autoComplete="off"
                  className="w-full px-3 py-2 rounded-lg border border-secondary bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Gmail Address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={field("email")}
                  placeholder="ranger.name@gmail.com"
                  autoComplete="new-email"
                  className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                    form.email &&
                    !form.email.trim().toLowerCase().endsWith("@gmail.com") &&
                    form.email.includes("@")
                      ? "border-danger"
                      : "border-secondary"
                  }`}
                />
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Gmail accounts only — required for password reset
                  functionality.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={field("password")}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-secondary bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {form.password && strength && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Strength:{" "}
                      <span className="font-semibold">{strength.label}</span>
                    </p>
                  </div>
                )}

                {form.password && (
                  <ul className="mt-2 space-y-0.5">
                    {RULES.map((r) => {
                      const ok = r.test(form.password);
                      return (
                        <li
                          key={r.id}
                          className={`flex items-center gap-1.5 text-xs ${ok ? "text-safe" : "text-muted-foreground"}`}
                        >
                          {ok ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {r.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={field("confirm")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                    form.confirm && form.confirm !== form.password
                      ? "border-danger"
                      : "border-secondary"
                  }`}
                />
                {form.confirm && form.confirm !== form.password && (
                  <p className="text-xs text-danger mt-1">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {formError && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-safe/10 border border-safe/30 rounded-lg p-3 text-sm text-safe flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full bg-primary text-white font-medium py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm mt-1"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Creating…
                  </span>
                ) : (
                  "Create Ranger Account"
                )}
              </button>
            </form>
          </div>

          {/* ── Rangers List ── */}
          <div className="bg-white rounded-xl border border-secondary shadow-sm p-6">
            <h3 className="text-lg font-header font-bold text-foreground mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Rangers ({rangers.length})
            </h3>

            {listError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger mb-4">
                Failed to load rangers: {listError}
                <p className="text-xs mt-1 opacity-80">
                  Make sure Firebase security rules are deployed.
                </p>
              </div>
            )}

            {loadingList ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : rangers.length === 0 && !listError ? (
              <p className="text-muted-foreground text-sm py-4">
                No ranger accounts yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {rangers.map((r) => (
                  <RangerItem key={r.uid} ranger={r} />
                ))}
              </ul>
            )}

            {/* Actions legend */}
            {rangers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-secondary">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit Name
                  </span>
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Reset Password
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldOff className="w-3 h-3" /> Toggle Active
                  </span>
                  <span className="flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Delete
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
